// Construction de la scene Three.js (spec §6.4, three/).
//
// Le plan est en metres, Y vers le nord ; la 3D est en metres, Y vers le HAUT et Z vers le sud.
// Toute la conversion tient dans les quelques lignes qui posent les sommets : `{x, y}` du plan
// devient `{x, hauteur, -y}`. C'est la seule chose a garder en tete en lisant ce qui suit.
//
// La fonction reconstruit tout a chaque appel - cocher une case rebatit la scene entiere. C'est
// assume : la scene est petite, et une reconstruction complete evite toute une classe de bugs
// d'etat residuel. Un seul detail y resiste, et il est traite en tete : si on reconstruit la MEME
// terrasse, la camera reste ou l'utilisateur l'avait laissee.

import { vue3d } from './etat3d.js';
import { centroid, dist } from '../geometry/basic.js';
import { estPlots } from '../engine/constantes.js';
import { computeTerrasseLayers } from '../engine/layers.js';
import { ensureConstruction } from '../engine/construction.js';
import { dimsSection, sectionLambourde, safeOffset } from '../engine/structure.js';
import { empriseLame } from '../engine/lames.js';
import { hauteurParasolDe } from '../engine/parasol.js';
import { lineLineIntersect } from '../geometry/segments.js';
import { PLOT_ASSISE_MIN_CM2 } from '../engine/constantes.js';
import { showErrBanner } from '../shell/dialogs.js';
import { elOpt } from '../shell/dom.js';
import { estMesh } from './gardes.js';
import type * as THREE_NS from 'three';
import type { ObjetPlan, PtBrut, Construction } from '../model/types.js';
import type { ObjetMesurable } from '../engine/hauteurs.js';
import type { TuileOrtho } from '../render/ortho.js';
import type { PlanVuDeLa3d } from './etat3d.js';

/**
 * Une couleur telle que Three.js l'accepte a la r128 : un nom ou un hexadecimal CSS venant du plan
 * (`o.fill`), ou un entier 0xRRGGBB ecrit ici pour les pieces de structure.
 */
type CouleurTrois = string | number;

/** Un anneau mitre produit par `engine/layers.ts` : deux polygones paralleles. */
interface AnneauMitre { ext: PtBrut[]; int: PtBrut[] }

/**
 * Les deux textures d'un objet : le dessus qu'on voit a plat, et les faces verticales.
 *
 * `unknown` pour chacune : la forme complete de l'enregistrement Poly Haven (id, nom, vignette,
 * url) appartient au selecteur de texture, dont le typage attend le palier `ui/` — la 3D n'en lit
 * que l'URL, par `urlTexture` ci-dessous. Meme raisonnement que `clotureTexture` sur `ObjetPlan`.
 */
interface TexturesObjet { horizontale?: unknown; vertical?: unknown }

/**
 * L'URL d'une texture, si elle en a une.
 *
 * Reprend exactement le test qui etait ecrit a chaque usage (`texRef && texRef.url`), en un seul
 * endroit et sans elargir ce que la 3D pretend connaitre du catalogue.
 */
function urlTexture(ref: unknown): string | undefined {
  const r = ref as { url?: string } | null | undefined;
  return r && r.url ? r.url : undefined;
}

/** Ce que la construction de la scene 3D demande au reste du programme. */
export interface ContexteScene3d {
  /** La parcelle qui porte la cloture, s'il y en a une. */
  trouverParcelleCloture: () => ObjetPlan | null | undefined;
  /** Remet les controles de cloture en accord avec la parcelle affichee. */
  syncClotureControls: (parcelle: ObjetPlan) => void;
  /** Hauteur de ce sur quoi la structure repose, en millimetres. */
  hauteurAppuiMm: (c: Construction) => number;
  /** Altitude d'un objet du plan, en metres. */
  elevationOf: (o: ObjetMesurable) => number;
  /** Un objet masque ne se modelise pas. */
  objetMasque: (o: ObjetPlan) => boolean;
  /** Position du mat d'un parasol, en coordonnees du plan. */
  positionMat: (par: ObjetPlan) => PtBrut;
  /** Le fond orthophoto sert aussi de sol a la 3D. */
  orthoActif: () => boolean;
  orthoTuiles: () => TuileOrtho[];
  chargerTexturePolyhaven: (url: string) => THREE_NS.Texture;
  /** Demonte la scene precedente avant d'en construire une nouvelle. */
  disposeThreeScene: () => void;
  /** Repose le soleil une fois la scene batie. */
  appliquerLumiereVue3d: () => void;
  applyMode3D: () => void;
  renderVue3DSelect: () => void;
  syncControlesSoleilVue3d: () => void;
}

export function buildThreeScene(obj: ObjetPlan | null, etat: PlanVuDeLa3d, ctx: ContexteScene3d){
  // Si on reconstruit la MEME terrasse (une case a cocher qui change, pas un changement d'objet
  // selectionne), on garde la camera ou l'utilisateur l'avait laissee plutot que de repartir sur
  // le cadrage par defaut : cocher "filaire" ou "tous les objets" ne doit pas faire perdre la vue.
  // Change de terrasse en revanche : `cen` (centroide) change, donc une position brute copiee
  // telle quelle pointerait vers un endroit different du monde reel - la un reset est correct.
  // `obj` peut etre null : la Vue 3D s'ouvre aussi sur un plan SANS terrasse (une parcelle avec
  // ses batiments, par exemple). Tout ce qui suit doit donc tenir sans terrasse - seule la
  // modelisation de la structure (plots, solives, lames) est sautee.
  const cleVue = obj ? obj.key : '__plan_sans_terrasse__';
  const camaraAConserver = (vue3d.scene && vue3d.dernierObjKey === cleVue)
    ? { pos: vue3d.scene.camera.position.clone(), cible: vue3d.scene.controls.target.clone() }
    : null;
  ctx.disposeThreeScene(); // removes the previous canvas (if any); leaves the zoom-buttons overlay in place
  const host = elOpt<HTMLInputElement>('terrasse3dCanvasHost');
  const w = host.clientWidth || 600, h = host.clientHeight || 420;

  // Sans terrasse : une construction par defaut jetable (aucun objet du plan n'est touche) sert
  // uniquement a garder les constantes de section/hauteur ci-dessous definies.
  const c = obj ? ensureConstruction(obj) : ensureConstruction({});
  const layers = obj ? computeTerrasseLayers(obj, etat.objects) : null;
  // Le centre de la scene se prend sur la terrasse ; a defaut sur la parcelle, sinon sur
  // l'ensemble des objets - la camera doit regarder quelque chose dans tous les cas.
  const objetCentre = obj || ctx.trouverParcelleCloture() || etat.objects.find((o: ObjetPlan)=>o.pts && o.pts.length);
  const cen = objetCentre
    ? (objetCentre.type === 'circle' ? {x:objetCentre.center.x, y:objetCentre.center.y} : centroid(objetCentre.pts))
    : {x:0, y:0};
  // La case suit la valeur du projet, pas l'inverse : un projet rouvert retrouve son reglage.
  const cbF = elOpt<HTMLInputElement>('terrasse3dFilaire');
  if(cbF) cbF.checked = !!c.lames3dFilaire;
  // "Afficher tous les objets" est une preference d'affichage, pas une donnee du chantier : elle
  // ne fait pas partie de `construction` (qui decrit la terrasse a construire) et n'est pas
  // sauvegardee avec le projet, comme le mode de glisser (orbiter/deplacer/zoom) plus haut.
  const cbAll = elOpt<HTMLInputElement>('terrasse3dAllObjects');
  if(cbAll) cbAll.checked = vue3d.tousLesObjets;
  const cbOpaque = elOpt<HTMLInputElement>('terrasse3dObjectsOpaque');
  if(cbOpaque) cbOpaque.checked = vue3d.objetsOpaques;
  const cbTextures = elOpt<HTMLInputElement>('terrasse3dTextures');
  if(cbTextures) cbTextures.checked = vue3d.textures;
  const cbShadows = elOpt<HTMLInputElement>('terrasse3dShadows');
  if(cbShadows) cbShadows.checked = vue3d.ombres;
  // La cloture est une donnee du projet (rattachee a la parcelle), pas une preference d'affichage
  // volatile comme les cases ci-dessus : elle survit a une fermeture/reouverture du fichier.
  const parcelleObjCtrl = ctx.trouverParcelleCloture();
  if(parcelleObjCtrl) ctx.syncClotureControls(parcelleObjCtrl);
  // Ce sur quoi la structure repose au-dessus du sol : la hauteur du plot, ou le seul depassement
  // de tete pour une vis, dont le fut est enterre et dessine sous le plan de sol.
  const hauteurVisM = ctx.hauteurAppuiMm(c)/1000;
  const enterreM = estPlots(c) ? 0 : (c.hauteurVis||40)/100;
  const soliveDims = (c.soliveSection||'45x70').split('x').map(n=>parseInt(n,10)||0);
  const soliveH = (soliveDims[1]||70)/1000, soliveW = (soliveDims[0]||45)/1000;
  const lambDims = dimsSection(sectionLambourde(c));
  const lambH = c.avecLambourde ? lambDims.h/1000 : 0;
  const lambW = lambDims.b/1000;
  const lameH = (c.epaisseurLame||25)/1000;
  const lameW = (c.largeurLame||140)/1000;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xdfe7ea);

  // En mode "tous les objets", la camera et le sol doivent couvrir tout le plan, pas seulement
  // cette terrasse - sinon la maison ou la parcelle se retrouvent hors champ ou sous un sol trop
  // petit pour les recevoir.
  const ptsPourEtendue = obj ? obj.pts.slice() : [];
  // Sans terrasse, "tous les objets" n'est pas une option : ils sont la seule chose a montrer.
  if(vue3d.tousLesObjets || !obj){
    etat.objects.forEach((o: ObjetPlan)=>{
      if(o===obj) return;
      if(o.type==='circle') ptsPourEtendue.push(...cerclePointsExtent(o));
      else if(o.pts) ptsPourEtendue.push(...o.pts);
    });
  }
  function cerclePointsExtent(o: ObjetPlan){
    return [{x:o.center.x-o.r,y:o.center.y},{x:o.center.x+o.r,y:o.center.y},
            {x:o.center.x,y:o.center.y-o.r},{x:o.center.x,y:o.center.y+o.r}];
  }
  const maxRadius = ptsPourEtendue.reduce((m: number, p: PtBrut)=>Math.max(m, dist(p,cen)), 0);
  const extent = Math.max(3, maxRadius*2);
  const camera = new THREE.PerspectiveCamera(45, w/h, 0.05, 500);
  camera.position.set(extent*0.9, extent*0.9, extent*0.9);

  const renderer = new THREE.WebGLRenderer({antialias:true, preserveDrawingBuffer:true});
  // See the matching check in the GLB viewer's renderer creation: on iOS Safari, once the
  // browser's live-WebGL-context cap is hit, this constructor can still succeed but return an
  // already-lost context - left unchecked, the next shader compile crashes with "Argument 1
  // ('shader') ... must be an instance of WebGLShader" instead of a clear message.
  const glCtx3d = renderer.getContext && renderer.getContext();
  if(!glCtx3d || (glCtx3d.isContextLost && glCtx3d.isContextLost())){
    showErrBanner('Vue 3D : le navigateur a refuse de creer un contexte 3D (trop d\'onglets/vues 3D ouverts ?). Ferme quelques onglets ou recharge la page, puis reessaie.');
    return;
  }
  renderer.setSize(w,h);
  renderer.shadowMap.enabled = vue3d.ombres;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  host.appendChild(renderer.domElement);

  const controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.target.set(0,0,0);
  controls.update();
  if(camaraAConserver){
    camera.position.copy(camaraAConserver.pos);
    controls.target.copy(camaraAConserver.cible);
    controls.update();
  }
  vue3d.dernierObjKey = cleVue;

  // Une seule lumiere directionnelle laisse tout ce qui lui tourne le dos (l'interieur d'un
  // retrait, le cote oppose d'un batiment) eclaire uniquement par l'ambiante plate - aucun
  // degrade pour distinguer les faces entre elles, un angle rentrant se lit alors comme une
  // seule tache uniforme. HemisphereLight (ciel/sol, degrade selon que la face regarde vers le
  // haut ou le bas) remplace l'ambiante plate, et une seconde directionnelle plus faible, venant
  // a peu pres de l'oppose de la premiere, apporte un degrade meme aux faces que le soleil
  // principal n'atteint pas.
  const hemiLight = new THREE.HemisphereLight(0xffffff, 0x4a3c2a, 0.5);
  scene.add(hemiLight);
  // Position/intensite/couleur posees juste apres construction par ctx.appliquerLumiereVue3d(),
  // d'apres la date, l'heure et le lieu de la parcelle : ces valeurs-ci ne servent qu'a exister.
  const dirLight = new THREE.DirectionalLight(0xffffff, 0.75);
  dirLight.position.set(extent, extent*1.5, extent*0.6);
  if(vue3d.ombres){
    // Cadre la camera de la shadow map sur l'etendue reelle de LA scene affichee (pas une valeur
    // fixe) : `extent` change a chaque terrasse/reglage "tous les objets", un cadrage fige serait
    // soit trop juste (ombres coupees) soit inutilement large (ombres floues, moins de precision
    // par texel). Seule la lumiere principale projette : la lumiere d'appoint ne fait que remplir
    // les faces a l'ombre, une deuxieme direction d'ombres portees ajouterait de la confusion pour
    // peu de gain.
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.set(2048, 2048);
    // Cadrage plus large que l'etendue de la scene depuis que le soleil suit l'heure reelle : une
    // ombre de fin de journee s'allonge bien au-dela de l'objet qui la projette, et un cadrage
    // colle a la scene la coupait net. Le prix est une ombre legerement moins fine a midi.
    const d = extent * 1.8;
    dirLight.shadow.camera.left = -d; dirLight.shadow.camera.right = d;
    dirLight.shadow.camera.top = d; dirLight.shadow.camera.bottom = -d;
    dirLight.shadow.camera.near = 0.5;
    dirLight.shadow.camera.far = extent * 9;
    dirLight.shadow.bias = -0.0005;
  }
  scene.add(dirLight);
  const dirFill = new THREE.DirectionalLight(0xffffff, 0.3);
  dirFill.position.set(-extent*0.8, extent*1.1, -extent*0.5);
  scene.add(dirFill);

  const groundGeo = new THREE.PlaneGeometry(extent*4, extent*4);
  const groundMat = new THREE.MeshStandardMaterial({color:0x9fb98c});
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.rotation.x = -Math.PI/2;
  ground.receiveShadow = vue3d.ombres;
  scene.add(ground);

  // Three.js est en Y-haut : X=Est reste X, hauteur devient Y, donc le plan (Est,Nord) doit se
  // loger sur (X,Z). Mais Est x Nord = Haut (repere ENU standard), alors que X x Y = Z en
  // Three.js - caser Nord tel quel sur Z revient a permuter Y et Z d'un repere direct, ce qui
  // l'inverse (determinant -1) : toute la scene se retrouvait vue en miroir, gauche/droite
  // echangee. Nord doit porter sur -Z (donc Z = Sud) pour rester un repere direct.
  function toLocal(p: PtBrut){ return { x:p.x-cen.x, z:cen.y-p.y }; }

  // Visible outline of the terrasse's real footprint at ground level, so the boards'
  // orientation above can be checked against the actual polygon angle at a glance.
  if(obj){
    const outlinePts = obj.pts.map((p: PtBrut)=>{ const l=toLocal(p); return new THREE.Vector3(l.x, 0.01, l.z); });
    outlinePts.push(outlinePts[0].clone());
    const outline = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(outlinePts),
      new THREE.LineBasicMaterial({color:0x2a2a2a})
    );
    scene.add(outline);
  }

  // Le calque orthophoto du plan sert aussi de sol a la 3D : une dalle par tuile, posee juste
  // au-dessus du sol vert. Materiau eclaire (pas "basic") pour que la photo suive le soleil -
  // une image en pleine lumiere sur une scene de nuit trahirait l'heure choisie.
  if(ctx.orthoActif() && ctx.orthoTuiles().length){
    const chargeurOrtho = new THREE.TextureLoader();
    ctx.orthoTuiles().forEach((t: TuileOrtho)=>{
      const tex = chargeurOrtho.load(t.dataUri);
      // `SRGBColorSpace` / `texture.colorSpace` n'existent qu'a partir de la r152 ; le CDN sert la
      // r128, donc la condition est fausse aujourd'hui et cette ligne ne fait rien. C'est un
      // garde-fou tourne vers l'avenir, ecrit ainsi expres : il s'allumera tout seul le jour d'une
      // montee de version. Le typage l'a rendu visible (il decrit la r128, ou ces deux noms
      // n'existent pas) ; le retirer ou le remplacer par l'ancien couple `sRGBEncoding`/`encoding`
      // changerait le rendu des tuiles orthophoto - une decision de produit, pas de typage.
      const troisFutur = THREE as typeof THREE & { SRGBColorSpace?: unknown };
      if(troisFutur.SRGBColorSpace) (tex as typeof tex & { colorSpace?: unknown }).colorSpace = troisFutur.SRGBColorSpace;
      const dalle = new THREE.Mesh(
        new THREE.PlaneGeometry(t.largeur, t.hauteur),
        new THREE.MeshStandardMaterial({ map:tex, roughness:1, metalness:0 })
      );
      dalle.rotation.x = -Math.PI/2;   // le haut de l'image (nord) part alors sur -Z, comme le plan
      const l = toLocal({ x:t.xMin + t.largeur/2, y:t.yMin + t.hauteur/2 });
      dalle.position.set(l.x, 0.004, l.z);
      dalle.receiveShadow = vue3d.ombres;
      scene.add(dalle);
    });
  }

  // Une image de texture represente environ METRES_PAR_CARREAU m de facade reelle - la meme
  // regle partout (murs, sol, lames), pour qu'un carreau ait la meme taille visuelle quel que
  // soit l'objet sur lequel il tombe.
  const METRES_PAR_CARREAU = 2;
  // Extrudes a plan-space footprint upward. ExtrudeGeometry builds in XY and pushes along +Z,
  // so the shape is laid out as (x, -z) and rotated a quarter turn about X to stand it up.
  // `opacity` : passe undefined pour les pieces de la terrasse elle-meme (toujours pleines),
  // sa vraie valeur pour les objets du plan affiches en contexte (voir plus bas).
  // `textures` : {vertical, horizontale}, chacun soit un enregistrement Poly Haven {url,...}
  // soit null. Verifie empiriquement une fois pour toutes : ExtrudeGeometry non biseautee
  // construit TOUJOURS le groupe 0 = les deux capuchons (dessus + dessous, devient horizontal
  // apres la rotation) puis le groupe 1 = les faces laterales (deviennent verticales) - d'ou le
  // tableau de materiaux dans cet ordre precis.
  function addPrism(footprint: PtBrut[] | null | undefined, yBase: number, height: number, color: CouleurTrois, filaire?: boolean, opacity?: number, textures?: TexturesObjet | null){
    if(!footprint || footprint.length < 3 || height <= 0) return;
    const pts2d = footprint.map((p: PtBrut)=>{ const l=toLocal(p); return {x:l.x, y:-l.z}; });
    const shape = new THREE.Shape();
    shape.moveTo(pts2d[0].x, pts2d[0].y);
    for(let i=1;i<pts2d.length;i++) shape.lineTo(pts2d[i].x, pts2d[i].y);
    shape.closePath();
    // Distance cumulee le long du perimetre (en metres reels), pour deroule des faces laterales
    // ci-dessous. Le generateur par defaut de Three (WorldUVGenerator) choisit entre la
    // coordonnee locale brute x ou y selon l'orientation de chaque face - correct pour un
    // batiment aux murs a angle droit, mais replie la texture sur elle-meme des qu'un contour
    // est courbe ou oblique (deux points opposes d'un meme cercle peuvent partager presque la
    // meme coordonnee brute). Un vrai deroule du perimetre evite ce repli, quelle que soit la
    // forme.
    const distAcc = [0];
    for(let i=1;i<pts2d.length;i++) distAcc.push(distAcc[i-1] + dist(pts2d[i-1], pts2d[i]));
    const distDe = (x: number, y: number) => {
      let meilleur = 0, meilleurEcart = Infinity;
      for(let i=0;i<pts2d.length;i++){
        const e = Math.abs(pts2d[i].x-x) + Math.abs(pts2d[i].y-y);
        if(e < meilleurEcart){ meilleurEcart = e; meilleur = distAcc[i]; }
      }
      return meilleur;
    };
    const uvGenerator = {
      generateTopUV: (geometry: THREE_NS.ExtrudeGeometry, vertices: number[], indexA: number, indexB: number, indexC: number) => [indexA,indexB,indexC].map(
        idx => new THREE.Vector2(vertices[idx*3], vertices[idx*3+1])),
      generateSideWallUV: (geometry: THREE_NS.ExtrudeGeometry, vertices: number[], indexA: number, indexB: number, indexC: number, indexD: number) => [indexA,indexB,indexC,indexD].map(
        idx => new THREE.Vector2(distDe(vertices[idx*3], vertices[idx*3+1]), 1 - vertices[idx*3+2]))
    };
    const geo = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false, UVGenerator: uvGenerator });
    geo.rotateX(-Math.PI/2);
    let objet;
    if(filaire){
      // EdgesGeometry ne garde que les aretes de silhouette. Un materiau wireframe montrerait
      // aussi la triangulation interne, ce qui donnerait une bouillie de diagonales sur une
      // soixantaine de lames.
      objet = new THREE.LineSegments(new THREE.EdgesGeometry(geo),
                                     new THREE.LineBasicMaterial({color}));
    } else {
      const faire = (texRef: unknown) => {
        const mat = new THREE.MeshStandardMaterial({color});
        if(opacity !== undefined && opacity < 1){ mat.transparent = true; mat.opacity = Math.max(0.15, opacity); }
        const urlTex = urlTexture(texRef);
        if(urlTex){
          mat.map = ctx.chargerTexturePolyhaven(urlTex);
          // Les UV valent deja des metres reels (deroule du perimetre ci-dessus pour les faces
          // laterales, coordonnees brutes du plan pour les capuchons) : un repeat de
          // 1/METRES_PAR_CARREAU suffit a caler une image sur METRES_PAR_CARREAU m, quelle que
          // soit la taille de l'objet - pas besoin (et surtout pas correct) de reproportionner
          // en plus selon sa taille, ce qui doublait l'echelle et donnait un quadrillage bien
          // trop dense sur les grands objets (parcelle, terrasse).
          mat.map.repeat.set(1/METRES_PAR_CARREAU, 1/METRES_PAR_CARREAU);
        }
        return mat;
      };
      if(textures && (textures.horizontale || textures.vertical)){
        objet = new THREE.Mesh(geo, [faire(textures.horizontale), faire(textures.vertical)]);
      } else {
        objet = new THREE.Mesh(geo, faire(null));
      }
    }
    objet.position.y = yBase;
    scene.add(objet);
  }
  // Silhouette au sol : sert pour la parcelle (jamais un bloc plein).
  function addGroundOutline(pts: PtBrut[] | null | undefined, color: CouleurTrois, closed?: boolean){
    if(!pts || pts.length < 2) return;
    const vpts = pts.map((p: PtBrut)=>{ const l=toLocal(p); return new THREE.Vector3(l.x, 0.008, l.z); });
    if(closed) vpts.push(vpts[0].clone());
    scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(vpts),
                              new THREE.LineBasicMaterial({color})));
  }
  // Meme algorithme que pathD (Catmull-Rom -> Bezier cubique, cf. rendu 2D du plan) mais evalue
  // directement en coordonnees plan plutot qu'en coordonnees ecran : les coefficients ne sont que
  // des combinaisons affines des points de controle, le resultat est donc la MEME courbe, juste
  // echantillonnee en une polyligne dense au lieu d'un trace SVG. Sans ca, un chemin en mode
  // courbe se rendrait en 3D comme la ligne brisee de ses points de controle, jamais comme la
  // courbe lissee qu'on voit dans le plan.
  function courbePolyligne(pts: PtBrut[], curve?: boolean, segsParTroncon?: number): PtBrut[] {
    if(pts.length < 3 || !curve) return pts.slice();
    segsParTroncon = segsParTroncon || 12;
    const out = [pts[0]];
    for(let i=0;i<pts.length-1;i++){
      const p0=pts[Math.max(0,i-1)], p1=pts[i], p2=pts[i+1], p3=pts[Math.min(pts.length-1,i+2)];
      const c1 = {x:p1.x+(p2.x-p0.x)/6, y:p1.y+(p2.y-p0.y)/6};
      const c2 = {x:p2.x-(p3.x-p1.x)/6, y:p2.y-(p3.y-p1.y)/6};
      for(let k=1;k<=segsParTroncon;k++){
        const t=k/segsParTroncon, mt=1-t;
        out.push({
          x: mt*mt*mt*p1.x + 3*mt*mt*t*c1.x + 3*mt*t*t*c2.x + t*t*t*p2.x,
          y: mt*mt*mt*p1.y + 3*mt*mt*t*c1.y + 3*mt*t*t*c2.y + t*t*t*p2.y
        });
      }
    }
    return out;
  }
  // Un chemin est une largeur reelle, pas un trait : chaque bord est decale perpendiculairement
  // au trace d'une demi-largeur. Aux sommets interieurs les deux bords adjacents sont mitres par
  // intersection (meme principe que polygonOffset pour un polygone ferme), mais sans le bouclage
  // puisqu'un chemin est ouvert - les deux extremites n'ont qu'un seul segment voisin, donc un
  // simple decalage perpendiculaire suffit, pas d'intersection a calculer.
  function ribbonChemin(pts: PtBrut[], largeur: number){
    const n = pts.length;
    if(n < 2 || !(largeur > 0)) return null;
    const demi = largeur/2;
    const segs: { ux: number; uy: number; nx: number; ny: number }[] = [];
    for(let i=0;i<n-1;i++){
      const a=pts[i], b=pts[i+1];
      const ex=b.x-a.x, ey=b.y-a.y; const L=Math.hypot(ex,ey)||1;
      segs.push({ ux:ex/L, uy:ey/L, nx:-ey/L, ny:ex/L });
    }
    function bord(i: number, sens: number){
      if(i===0) return { x:pts[0].x+segs[0].nx*demi*sens, y:pts[0].y+segs[0].ny*demi*sens };
      if(i===n-1) return { x:pts[n-1].x+segs[n-2].nx*demi*sens, y:pts[n-1].y+segs[n-2].ny*demi*sens };
      const s1=segs[i-1], s2=segs[i];
      const o1={x:pts[i].x+s1.nx*demi*sens, y:pts[i].y+s1.ny*demi*sens};
      const o2={x:pts[i].x+s2.nx*demi*sens, y:pts[i].y+s2.ny*demi*sens};
      const inter = lineLineIntersect(o1, {x:s1.ux,y:s1.uy}, o2, {x:s2.ux,y:s2.uy});
      // Un virage tres serre pousse le mitre tres loin (meme piege que les zones d'equipement a
      // angle aigu, cf. offsetZone) : au-dela d'une distance raisonnable on retombe sur un simple
      // biseau (moyenne des deux bords), qui reste toujours proche du trace.
      if(!inter || dist(inter, pts[i]) > demi*4) return { x:(o1.x+o2.x)/2, y:(o1.y+o2.y)/2 };
      return inter;
    }
    const gauche=[], droite=[];
    for(let i=0;i<n;i++){ gauche.push(bord(i,1)); droite.push(bord(i,-1)); }
    return gauche.concat(droite.reverse());
  }
  // Ruban plat au sol (chemin non sureleve, le cas courant) : une forme remplie, sans extrusion,
  // posee legerement au-dessus du sol pour eviter le scintillement (z-fighting) avec lui.
  function addRibbonFlat(poly: PtBrut[] | null | undefined, color: CouleurTrois, yLevel: number, opacity?: number, texRef?: unknown){
    if(!poly || poly.length < 3) return;
    const shape = new THREE.Shape();
    const p0 = toLocal(poly[0]);
    shape.moveTo(p0.x, -p0.z);
    for(let i=1;i<poly.length;i++){ const p=toLocal(poly[i]); shape.lineTo(p.x, -p.z); }
    shape.closePath();
    const geo = new THREE.ShapeGeometry(shape);
    geo.rotateX(-Math.PI/2);
    const mat = new THREE.MeshStandardMaterial({color, side:THREE.DoubleSide});
    if(opacity !== undefined && opacity < 1){ mat.transparent = true; mat.opacity = Math.max(0.15, opacity); }
    const urlTex = urlTexture(texRef);
    if(urlTex){
      mat.map = ctx.chargerTexturePolyhaven(urlTex);
      // ShapeGeometry pousse deja les coordonnees locales brutes (des metres reels) comme UV -
      // meme correction qu'addPrism plus haut : 1/METRES_PAR_CARREAU cale une image sur
      // METRES_PAR_CARREAU m sans reproportionner en plus selon la taille de la forme.
      mat.map.repeat.set(1/METRES_PAR_CARREAU, 1/METRES_PAR_CARREAU);
    }
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.y = yLevel;
    scene.add(mesh);
  }
  // Approxime un cercle du plan par un polygone regulier, au RAYON REEL (contrairement a
  // empriseEquipement qui grossit volontairement au rayon circonscrit pour une zone de charge) :
  // ici c'est un rendu visuel, pas une emprise structurelle.
  function cerclePoly(center: PtBrut, r: number, n?: number): PtBrut[] {
    n = n || 28;
    const pts = [];
    for(let i=0;i<n;i++){ const a = 2*Math.PI*i/n; pts.push({ x:center.x+r*Math.cos(a), y:center.y+r*Math.sin(a) }); }
    return pts;
  }
  // One board, cut to the outline it sits in rather than squared off at 90 degrees.
  function addBeam(a: PtBrut, b: PtBrut, yBase: number, sectionH: number, sectionW: number, color: CouleurTrois, poly: PtBrut[] | null | undefined, filaire?: boolean, textures?: TexturesObjet | null){
    if(dist(a,b) < 0.02) return;
    addPrism(empriseLame(a, b, sectionW, poly), yBase, sectionH, color, filaire, undefined, textures);
  }
  // A perimeter ring, mitred: each edge becomes the quad between the two bounding rings, so the
  // corners meet on the mitre line instead of two square ends overlapping.
  function addBande(bande: AnneauMitre | null | undefined, yBase: number, height: number, color: CouleurTrois, textures?: TexturesObjet | null){
    if(!bande || !bande.ext || !bande.int) return;
    const n = Math.min(bande.ext.length, bande.int.length);
    for(let i=0;i<n;i++){
      const j = (i+1)%n;
      addPrism([bande.ext[i], bande.ext[j], bande.int[j], bande.int[i]], yBase, height, color, false, undefined, textures);
    }
  }
  // Une vis se dessine SOUS le plan de sol, puisque c'est la qu'elle est : on voit la fondation
  // et on comprend d'un coup d'oeil pourquoi elle ne sureleve pas la terrasse. Seule sa tete
  // reglable, quand on la fait depasser, monte au-dessus du sol et porte la structure.
  function addPost(p: PtBrut, profondeur: number, hTete: number, radius: number, color: CouleurTrois){
    const P = toLocal(p);
    if(profondeur > 0){
      const geo = new THREE.CylinderGeometry(radius, radius*0.5, profondeur, 10);
      const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({color}));
      mesh.position.set(P.x, -profondeur/2, P.z);
      scene.add(mesh);
    }
    if(hTete > 0){
      const fut = new THREE.Mesh(new THREE.CylinderGeometry(radius*0.8, radius*0.8, hTete, 10),
                                 new THREE.MeshStandardMaterial({color:0xb8c2ce}));
      fut.position.set(P.x, hTete/2, P.z);
      scene.add(fut);
      // La platine qui recoit la solive, plaquee sous le dessous de la structure.
      const ep = Math.min(0.012, hTete*0.35);
      const pl = new THREE.Mesh(new THREE.BoxGeometry(radius*3.4, ep, radius*3.4),
                                new THREE.MeshStandardMaterial({color:0x8a96a8}));
      pl.position.set(P.x, hTete - ep/2, P.z);
      scene.add(pl);
    }
  }
  // Un plot n'a pas la silhouette d'une vis : base large evasee posee sur l'assise, fut etroit,
  // tete plate sous la lambourde. La base porte la surface d'assise reglee dans Construction.
  function addPlot(p: PtBrut, yTop: number, color: CouleurTrois){
    const P = toLocal(p);
    if(yTop<=0) return;
    const rBase = Math.sqrt((c.plotSurfaceAssise||PLOT_ASSISE_MIN_CM2)/Math.PI)/100;
    const hBase = Math.min(0.03, yTop*0.3);
    const hTete = Math.min(0.02, yTop*0.2);
    const mat = new THREE.MeshStandardMaterial({color});
    const base = new THREE.Mesh(new THREE.CylinderGeometry(rBase*0.72, rBase, hBase, 14), mat);
    base.position.set(P.x, hBase/2, P.z); scene.add(base);
    const futH = Math.max(0.005, yTop - hBase - hTete);
    const fut = new THREE.Mesh(new THREE.CylinderGeometry(rBase*0.3, rBase*0.34, futH, 12), mat);
    fut.position.set(P.x, hBase + futH/2, P.z); scene.add(fut);
    const tete = new THREE.Mesh(new THREE.CylinderGeometry(rBase*0.55, rBase*0.55, hTete, 14), mat);
    tete.position.set(P.x, yTop - hTete/2, P.z); scene.add(tete);
  }

  // Toute la structure de la terrasse (appuis, solives, lambourdes, lames) : sautee quand la Vue
  // 3D est ouverte sans terrasse - il reste alors le terrain, les batiments et le reste du plan.
  // Construction de la structure de la terrasse, isolee dans une fonction pour etre executee
  // APRES le premier rendu : c'est le morceau le plus long (~360 ms mesurees sur une terrasse de
  // 35 m2 - une piece de bois = un mesh, il y en a plusieurs centaines), et tant qu'il tourne la
  // page est figee. Le terrain, les batiments et la camera sont prets avant : on peut deja
  // naviguer pendant que le platelage se pose.
  function construireStructureTerrasse(){
  if(!obj || !layers) return;
  // En pose simple sur plots il n'y a pas de solive : les lambourdes reposent sur les plots, et
  // le cadre est une lambourde de rive. L'empilement perd donc une couche au milieu.
  const plotSimple = estPlots(c) && !c.plotAvecSolives;
  if(estPlots(c)) layers.vis.forEach(p=>addPlot(p, hauteurVisM, 0x6E7A84));
  else            layers.vis.forEach(p=>addPost(p, enterreM, hauteurVisM, 0.03, 0x8a96a8));
  // Every piece is cut to the outline it stops on, so an oblique edge reads as one diagonal
  // line instead of a flight of steps.
  const cadreH = plotSimple ? lambH : soliveH;
  layers.solives.forEach(seg=>addBeam(seg.a, seg.b, hauteurVisM, soliveH, soliveW, 0x6b4a2a, obj.pts));
  // The frame sits at the same level as the beams it belongs to, following the outline.
  addBande(layers.bandes.cadre, hauteurVisM, cadreH, 0x4a2f18);
  let lameBase = hauteurVisM + (plotSimple ? 0 : soliveH);
  if(layers.lambourdes.length){
    layers.lambourdes.forEach(seg=>addBeam(seg.a, seg.b, lameBase, lambH, lambW, 0xb45a2a, obj.pts));
    lameBase += lambH;
  }
  // En filaire les lames ne sont plus qu'un contour : on voit d'un coup l'implantation des
  // appuis et le sens des solives, ce que le platelage plein masque entierement.
  const lamesFilaire = !!c.lames3dFilaire;
  // Les deux champs Texture de la terrasse elle-meme (Mode Plan > Objet) s'appliquent ici : le
  // dessus (horizontale) sur le platelage - la surface qu'on voit vraiment -, le vertical sur la
  // lame de rive ci-dessous - le seul element de la structure qui presente une vraie face
  // verticale visible. Rien d'autre (solives, lambourdes, vis...) n'en tient compte : ce ne sont
  // pas des surfaces qu'on regarde.
  const texturesTerrasse = vue3d.textures ? {horizontale:obj.textureHorizontale, vertical:obj.textureVerticale} : null;
  layers.lames.forEach(seg=>addBeam(seg.a, seg.b, lameBase, lameH, lameW,
    lamesFilaire ? 0x7a5c2e : 0xc9a15a, layers.lamesFieldPoly, lamesFilaire, texturesTerrasse));
  if(c.avecLameRive){
    // Hangs from the underside of the lames downward (covers the structure), so its top
    // edge sits at lameBase (bottom of the lames) rather than overlapping the lames themselves.
    const riveH = (c.hauteurLameRive||200)/1000;
    addBande(layers.bandes.lameRive, lameBase-riveH, riveH, 0x5c3a1e, texturesTerrasse);
  }
  if(c.avecLamePlat){
    addBande(layers.bandes.lamePlat, lameBase, lameH, 0xd8b06a);
  }
  } // fin de construireStructureTerrasse()

  // Le reste du plan, en contexte : chaque objet devient un bloc simple a sa propre hauteur -
  // aucune modelisation fine (pas de toit, pas d'ouvertures), juste de quoi juger l'implantation
  // les uns par rapport aux autres. Une AUTRE terrasse que celle affichee en detail ici recoit
  // quand meme sa vraie hauteur modelisee (elevationOf le fait automatiquement), mais pas sa
  // structure complete - ce serait reconstruire une deuxieme scene entiere pour un simple arriere-
  // plan. La parcelle n'a pas de volume : un trait au sol suffit a la situer.
  if(vue3d.tousLesObjets || !obj){
    // "Objets opaques" ignore l'opacite du plan 2D (souvent < 1 pour voir a travers en mode
    // Plan) et force un rendu plein - plus proche d'un rendu final, quand la transparence du
    // plan de travail n'apporte plus rien face a une vraie vue 3D.
    const opaciteDe = (o: ObjetPlan) => vue3d.objetsOpaques ? undefined : o.fillOpacity;
    // "Texture" decoche revient a la couleur unie sans avoir a retirer la texture de chaque
    // objet - un simple objet vide desactive le rendu texture le temps de la case decochee.
    const texturesDe = (o: ObjetPlan) => vue3d.textures ? {horizontale:o.textureHorizontale, vertical:o.textureVerticale} : null;
    etat.objects.forEach(o=>{
      if(o===obj) return;
      if(ctx.objetMasque(o)) return; // masque dans le plan = masque partout, y compris ici (voisinage compris)
      if(o.key==='parcelle' || o.fonction==='terrain'){
        addRibbonFlat(o.pts, o.fill||'#FBF3D9', 0.003, opaciteDe(o), vue3d.textures ? o.textureHorizontale : null);
        return;
      }
      // Un point de vue est un repere de navigation, pas un objet physique du jardin : rien a
      // construire pour lui en 3D (sa position pilote deja la camera via "Aller a cette vue").
      if(o.fonction==='camera') return;
      // Idem pour une limite cadastrale interne : c'est une information de plan, pas un ouvrage.
      // La modeliser poserait un ruban en travers du terrain, qui n'existe pas sur place.
      if(o.fonction==='limite') return;
      if(o.type==='path'){
        // La largeur reelle du chemin (le meme champ que le trait epaissi du plan 2D), pas juste
        // son axe : un filet de 20 cm de trait ne dit rien de l'emprise qu'il occupe au sol. Et
        // le trace qu'elle suit respecte le reglage "Point / Courbe" du chemin, comme en 2D.
        if(o.pts && o.pts.length>=2){
          const trace = courbePolyligne(o.pts, !!o.curve);
          const poly = ribbonChemin(trace, o.width||1);
          const h = ctx.elevationOf(o);
          const couleur = o.fill||o.stroke||'#888888';
          if(poly && h > 0) addPrism(poly, 0, h, couleur, false, opaciteDe(o), texturesDe(o));
          else if(poly) addRibbonFlat(poly, couleur, 0.006, opaciteDe(o), vue3d.textures ? o.textureHorizontale : null);
          else addGroundOutline(trace, o.stroke||couleur, false);
        }
        return;
      }
      // Un parasol n'est pas un volume plein : un mat fin porte une toile a sa hauteur. L'extruder
      // comme les autres objets en ferait un cylindre opaque de 3 m de diametre au milieu de la
      // terrasse - exactement ce qu'on cherche a ne PAS voir quand on juge son implantation.
      if(o.fonction === 'parasol'){
        const hMat = hauteurParasolDe(o);
        const pl = toLocal(o.center);
        // Le mat se dresse a SA position (le centre pour un parasol droit, le bord de toile pour un
        // deporte) ; la toile, elle, reste centree sur o.center.
        const plMat = toLocal(ctx.positionMat(o));
        const matMat = new THREE.MeshStandardMaterial({color:0x6b5a44});
        const mat = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, hMat, 10), matMat);
        mat.position.set(plMat.x, hMat/2, plMat.z);
        scene.add(mat);
        if(o.matDeporte){
          // Le bras horizontal qui rattrape le deport, sinon la toile flotte sans lien visible.
          const dx = pl.x-plMat.x, dz = pl.z-plMat.z;
          const L = Math.hypot(dx, dz);
          if(L > 0.01){
            const bras = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, L, 8), matMat);
            bras.position.set((pl.x+plMat.x)/2, hMat, (pl.z+plMat.z)/2);
            bras.rotation.z = Math.PI/2;
            bras.rotation.y = -Math.atan2(dz, dx);
            scene.add(bras);
          }
        }
        const matToile = new THREE.MeshStandardMaterial({color: o.fill || '#7a9e6b', side: THREE.DoubleSide});
        const opac = opaciteDe(o);
        if(opac !== undefined && opac < 1){ matToile.transparent = true; matToile.opacity = Math.max(0.15, opac); }
        const texToile = vue3d.textures ? (o.textureHorizontale || o.textureVerticale) : null;
        const urlToile = urlTexture(texToile);
        if(urlToile) matToile.map = ctx.chargerTexturePolyhaven(urlToile);
        // Cone tres plat pose sur le mat : la silhouette d'un parasol ouvert, et surtout la meme
        // emprise circulaire au sol que le rayon utilise pour calculer l'ombre en 2D.
        const toile = new THREE.Mesh(new THREE.ConeGeometry(o.r, Math.max(0.15, o.r*0.28), 24), matToile);
        toile.position.set(pl.x, hMat + Math.max(0.15, o.r*0.28)/2, pl.z);
        scene.add(toile);
        return;
      }
      const h = ctx.elevationOf(o);
      if(h <= 0) return;
      const footprint = o.type==='circle' ? cerclePoly(o.center, o.r) : o.pts;
      addPrism(footprint, 0, h, o.fill, false, opaciteDe(o), texturesDe(o));
      if(o.fonction === 'arbre'){
        // Feuillage = une sphere posee sur le sommet du tronc (le prisme juste au-dessus, de
        // hauteur h) : son centre remonte d'un rayon au-dessus de h pour qu'elle touche le tronc
        // sans le traverser ni flotter au-dessus. Diametre/couleur/texture sont propres au
        // feuillage (champs "arbre" du panneau Objet), independants de la silhouette du tronc.
        const centreArbre = o.type==='circle' ? o.center : centroid(o.pts);
        const rayon = Math.max(0.05, (o.diametreArbre !== undefined && o.diametreArbre !== null ? o.diametreArbre : 3) / 2);
        const matSphere = new THREE.MeshStandardMaterial({color: o.couleurArbre || '#4a7c3a'});
        const opacite = opaciteDe(o);
        if(opacite !== undefined && opacite < 1){ matSphere.transparent = true; matSphere.opacity = Math.max(0.15, opacite); }
        const urlArbre = vue3d.textures ? urlTexture(o.textureArbre) : undefined;
        if(urlArbre){
          matSphere.map = ctx.chargerTexturePolyhaven(urlArbre);
        }
        const sphere = new THREE.Mesh(new THREE.SphereGeometry(rayon, 20, 16), matSphere);
        const pLocal = toLocal(centreArbre);
        // Posee pile au sommet (centre a h+rayon), la sphere ne fait que toucher le tronc en un
        // seul point tangent - un simple contact ponctuel, pas un raccord : ca se voit comme une
        // fine ligne/aret entre les deux. On l'enfonce d'un tiers de son rayon pour qu'elle
        // enveloppe le sommet du tronc (bien plus fin qu'elle) au lieu de juste le toucher.
        sphere.position.set(pLocal.x, h + rayon*0.67, pLocal.z);
        scene.add(sphere);
      }
    });
  }

  // Cloture perimetrale : case a cocher independante de "tous les objets" (elle borne la
  // parcelle, pas un objet du jardin) - une fine bande mitree tout le tour, comme la lame de
  // rive de la terrasse plus haut, mais suivant le contour de la parcelle plutot que celui de
  // la terrasse et avec sa propre hauteur/couleur/texture reglables depuis le bandeau au-dessus
  // du rendu 3D.
  const parcelleCloture = ctx.trouverParcelleCloture();
  if(parcelleCloture && parcelleCloture.clotureActive && parcelleCloture.pts && parcelleCloture.pts.length>=3){
    const EPAISSEUR_CLOTURE = 0.05;
    const hauteurCloture = Math.max(0.1, parcelleCloture.clotureHauteur || 1.8);
    const couleurCloture = parcelleCloture.clotureCouleur || '#6b4a2a';
    const texturesCloture = vue3d.textures && parcelleCloture.clotureTexture ? {vertical: parcelleCloture.clotureTexture} : null;
    addBande({
      ext: parcelleCloture.pts,
      int: safeOffset(parcelleCloture.pts, EPAISSEUR_CLOTURE)
    }, 0, hauteurCloture, couleurCloture, texturesCloture);
  }

  // Plutot que de faire passer castShadow/receiveShadow a travers chaque fonction qui cree un
  // mesh (addPrism, addRibbonFlat, addBande, addPost, addPlot...), un seul parcours de la scene
  // une fois qu'elle est complete : plus simple et ca ne peut pas en oublier un. Le sol recoit
  // les ombres mais n'en projette pas (une ombre du sol sur lui-meme n'a pas de sens et cree des
  // artefacts d'auto-ombrage aux angles rasants).
  function appliquerOmbres(){
    if(!vue3d.ombres) return;
    scene.traverse(o=>{
      if(estMesh(o)){ o.castShadow = true; o.receiveShadow = true; }
    });
    ground.castShadow = false;
  }
  appliquerOmbres();

  function animate(){
    vue3d.scene.raf = requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
  }
  vue3d.scene = { renderer, scene, camera, controls, raf:null, dirLight, dirFill, hemiLight, extent, cen };
  const sceneCourante = vue3d.scene;
  animate();
  ctx.applyMode3D();
  ctx.renderVue3DSelect();
  ctx.syncControlesSoleilVue3d();
  ctx.appliquerLumiereVue3d();   // pose les lumieres ET rend une premiere image

  // La structure de la terrasse se construit apres cette premiere image. setTimeout et non
  // requestAnimationFrame : rAF ne se declenche pas quand l'onglet est en arriere-plan, et la
  // terrasse ne serait alors jamais posee.
  setTimeout(()=>{
    // La scene a pu etre remplacee entre-temps (changement d'onglet, case a cocher, retour au
    // plan) : construire dans une scene morte laisserait des meshes orphelins et un canevas noir.
    if(vue3d.scene !== sceneCourante) return;
    construireStructureTerrasse();
    appliquerOmbres();          // les pieces qui viennent d'arriver doivent projeter leur ombre
    renderer.render(scene, camera);
  }, 0);
}


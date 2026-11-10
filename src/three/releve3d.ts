// Le releve d'un batiment en 3D : facades photographiees, ouvertures, toit (spec-releve-facade §9).
//
// Le batiment reste le prisme que pose `scene.ts` ; ce module l'habille. Chaque facade relevee
// recoit sa photo redressee sur un plan colle au mur (1 cm devant, pour ne pas disputer la face du
// prisme), chaque ouverture un encadrement en relief, et le toit ses pans et ses pignons au-dessus
// de l'egout. Rien n'est ajoute a un batiment sans releve : la scene d'un plan qui n'en a pas garde
// exactement ses mailles (fumee, point 24 : structure du GLB).

import { toitDuVolume } from '../model/volumesToit.js';
import { toitDessine } from '../model/formeToit.js';
import type { VolumeToit } from '../model/types.js';
import { au } from '../util/tableaux.js';
import { sommetDe } from '../geometry/anneau.js';
import type * as THREE_NS from 'three';
import type { CorpsToit, ObjetPolygone, PtBrut, OuvertureFacade, Toit } from '../model/types.js';
import { partiesBassesDu } from '../model/partiesBasses.js';
import { hauteurDuMur } from '../facade/ouvertures.js';
import { facadesDuContour, type Facade } from '../geometry/cotesVusDeDehors.js';
import { contourDuMur, egoutEn, ouverturesDansLeMur, volumesEtHautesDuBatiment, type PartiesDuMur } from '../facade/profil.js';
import { hautDuMurSousCorps, silhouetteDuMur } from '../facade/regles/toits/silhouetteDesCorps.js';
import { poserEnCouche, COUCHES_SOL } from './primitives.js';
import { facettesToit, uvDuPan, COULEUR_TOIT_DEFAUT } from '../facade/toits/toit.js';
import { trianguler } from '../geometry/triangulation.js';
import { materiauCouverture, couleurToitPlat, type ContexteCouverture } from '../model/couleurToit.js';
import { safeOffset } from '../geometry/polygon.js';
import { dessinCouverture, textureCouverture, matiereCouverture } from './couverture.js';
import { aUneForme, encadrementForme, poserDetailsOuvertures } from './detailsOuvertures.js';
import { garderLeJpeg } from './chargeurs.js';
import { sansOmbres } from '../facade/vision/sansOmbres.js';
import { poserCarreaux, vitreLue } from './carreaux3d.js';
import { poserModenature } from './modenature3d.js';
import { portionsOuvertesDuMur } from './toitCorps3d.js';
import { facesAvantDuBowWindow, morceauxSousEtage, profondeurDOuverture, retraitsSurLaFacade, type RetraitRdc, type RetraitSurFacade } from '../facade/modeToit/saillies.js';
import type { ReleveFacade } from '../model/types.js';

/** Ce que la scene prete a ce module : ou ajouter, et comment passer du plan au repere Three. */
export interface ContexteReleve3d {
  /** La scene, ou un groupe pose sur le sol en relief (three/relief3d.ts). */
  scene: THREE_NS.Object3D;
  toLocal: (p: PtBrut) => { x: number; z: number };
  /** Couleur des murs, pour les pignons. */
  couleurMur: string | number;
  /** `false` quand la case « Texture » de la vue 3D est decochee : on garde les formes. */
  textures: boolean;
  /** Vrai : les ombres de la photo s'estompent sur la facade (case « Facades sans ombres », facade/vision/sansOmbres.ts). */
  sansOmbres?: boolean;
  /** Le materiau de toiture des fichiers fonciers et la pente : ils choisissent la texture de la couverture. */
  couverture?: ContexteCouverture | undefined;
  /** Les carreaux en relief a l'ecran (hors qualite Econome, de pres) ; sinon a plat, comme au .glb (three/carreaux3d.ts). */
  relief?: boolean | undefined;
}

const COULEUR_MENUISERIE = 0xf1eee6;
const COULEUR_VITRE = 0x33414d;
const COULEUR_PORTE = 0x6b4a33;

const DECOLLEMENT = 0.01;
const SECTION_CADRE = 0.06;
const SAILLIE_CADRE = 0.05;

/** Un maillage a partir de sommets 3D et de triangles, normales calculees. */
function maillage(sommets: number[], indices: number[], mat: THREE_NS.Material, uv?: number[]): THREE_NS.Mesh {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(sommets, 3));
  if (uv) geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return new THREE.Mesh(geo, mat);
}

/** Le plan d'un mur, en coordonnees Three : origine au pied gauche, axe `u` vers la droite. */
function repereMur(ctx: ContexteReleve3d, f: Facade) {
  const g = ctx.toLocal(f.gauche),
    d = ctx.toLocal(f.droite);
  const ux = (d.x - g.x) / f.largeur,
    uz = (d.z - g.z) / f.largeur;
  // La normale du plan (nx, ny) devient (nx, -ny) en Three : Y du plan porte sur -Z.
  const nx = f.normale.x,
    nz = -f.normale.y;
  /** Un point du mur : `x` le long du mur depuis la gauche, `y` en hauteur, `s` en saillie. */
  const pt = (x: number, y: number, s: number): [number, number, number] => [g.x + ux * x + nx * s, y, g.z + uz * x + nz * s];
  return { pt, ux, uz };
}

/** Les textures deja corrigees, par photo : la scene se rebatit a chaque case cochee, le calcul (~100 ms) ne se refait pas. */
const corrigees = new Map<string, HTMLCanvasElement>();
const CORRIGEES_MAX = 24;
/** La cle, sous `userData`, de l'image d'origine d'une texture corrigee : l'export .glb la remet (retirerOmbresEcran). */
const IMAGE_BRUTE = 'imageBrute';

/** La photo de la facade en canevas, ses ombres estompees ; null quand le navigateur n'a pas de contexte 2D. */
function corriger(img: HTMLImageElement, r: ReleveFacade): HTMLCanvasElement | null {
  const c = document.createElement('canvas');
  c.width = img.naturalWidth || img.width; c.height = img.naturalHeight || img.height;
  const c2d = c.getContext('2d');
  if (!c2d || !c.width || !c.height || !(r.largeur > 0)) return null;
  c2d.drawImage(img, 0, 0);
  const d = c2d.getImageData(0, 0, c.width, c.height);
  const net = sansOmbres({ largeur: c.width, hauteur: c.height, donnees: d.data }, c.width / r.largeur, r.ouvertures.map(({ x, y, l, h }) => ({ x, y, l, h })), r.hauteur);
  d.data.set(net.donnees);
  c2d.putImageData(d, 0, 0);
  return c;
}

/**
 * La texture d'une facade relevee, ombres de la photo estompees des que l'image est la. La photo enregistree ne change pas ; son
 * image d'origine reste sur la texture pour l'export, qui n'emporte jamais une preference d'affichage.
 */
function textureSansOmbres(photo: string, r: ReleveFacade): THREE_NS.Texture {
  const deja = corrigees.get(photo);
  const poser = (tex: THREE_NS.Texture, c: HTMLCanvasElement) => {
    tex.userData = { ...tex.userData, [IMAGE_BRUTE]: tex.image };
    tex.image = c as unknown as HTMLImageElement;
    tex.needsUpdate = true;
  };
  const tex: THREE_NS.Texture = new THREE.TextureLoader().load(photo, () => {
    try {
      const c = deja ?? corriger(tex.image as HTMLImageElement, r);
      if (!c) return;
      if (!deja) { corrigees.set(photo, c); if (corrigees.size > CORRIGEES_MAX) corrigees.delete(corrigees.keys().next().value as string); }
      poser(tex, c);
    } catch { /* une image illisible reste telle quelle */ }
  });
  return tex;
}

/** Remet, le temps d'un export .glb, l'image d'origine des facades dont les ombres ont ete estompees ; rend de quoi revenir. */
export function retirerOmbresEcran(scene: THREE_NS.Object3D): () => void {
  const remises: { tex: THREE_NS.Texture; image: unknown }[] = [];
  scene.traverse((o) => {
    const mat = (o as THREE_NS.Mesh).material as THREE_NS.MeshStandardMaterial | undefined;
    const tex = mat && !Array.isArray(mat) ? mat.map : null;
    const brute = tex?.userData?.[IMAGE_BRUTE];
    if (!tex || !brute || remises.some((x) => x.tex === tex)) return;
    remises.push({ tex, image: tex.image });
    tex.image = brute;
    tex.needsUpdate = true;
  });
  return () => remises.forEach(({ tex, image }) => { tex.image = image; tex.needsUpdate = true; });
}

/** Une facade photographiee : son mur, sa texture, et la hauteur que la texture couvre. */
interface Habillage {
  f: Facade;
  mat: THREE_NS.MeshStandardMaterial;
  hauteurTexture: number;
}

/**
 * La photo redressee, plaquee sur le mur jusqu'a l'egout ; le reste de la texture ira au pignon. Un mur
 * en L recoit une photo en L : au-dessus de la partie basse, il n'y a pas de mur. Sous des corps de toit
 * (LiDAR), la photo epouse la silhouette du mur : son egout, son pignon jusqu'au faitage, ses marches ; a
 * l'echelle (un metre de photo pour un metre de mur), et elle s'arrete ou la photo s'arrete.
 */
function plaquerTexture(ctx: ContexteReleve3d, hab: Habillage, hauteur: number, partie: PartiesDuMur, corps: readonly CorpsToit[] | null = null, ouvertes: readonly [number, number][] = [], sousEtage: readonly RetraitSurFacade[] = []) {
  const { pt } = repereMur(ctx, hab.f);
  const L = hab.f.largeur;
  const entier = corps?.length ? silhouetteDuMur(hab.f, corps, hab.hauteurTexture, hauteur) : contourDuMur(L, hauteur, partie);
  // Un rez-de-chaussee en retrait sous l'etage (schema 16, decision du proprietaire du 9 novembre 2026) : la photo se coupe au dessous de
  // l'etage, le bas recule avec le mur du rez-de-chaussee, le haut reste au nu ; derriere un bow-window, rien. Memes coordonnees de texture
  // que la photo entiere : chaque point du mur montre le meme pixel, seul le plan ou il se pose change.
  if (sousEtage.length) {
    const fermees = ouvertes.length ? portionsFermees(L, ouvertes) : [[0, L] as [number, number]];
    for (const { contour, profondeurM } of morceauxSousEtage(entier, fermees, sousEtage)) {
      const sommets = contour.flatMap((q) => pt(q.x, q.y, DECOLLEMENT - profondeurM));
      const uv = contour.flatMap((q) => [q.x / L, Math.min(1, q.y / hab.hauteurTexture)]);
      const m = maillage(sommets, trianguler(contour).flat(), hab.mat, uv);
      m.name = 'releve-facade';
      ctx.scene.add(m);
    }
    return;
  }
  // Sous un appentis ouvert, il n'y a pas de mur : la photo se pose sur les seules portions fermees (la coordonnee de texture reste
  // celle du mur entier, la photo ne glisse pas).
  for (const contour of ouvertes.length ? portionsFermees(L, ouvertes).map(([a, b]) => entreAbscisses(entier, a, b)).filter((c) => c.length >= 3) : [entier]) {
    const sommets = contour.flatMap((q) => pt(q.x, q.y, DECOLLEMENT));
    const uv = contour.flatMap((q) => [q.x / L, Math.min(1, q.y / hab.hauteurTexture)]);
    const m = maillage(sommets, trianguler(contour).flat(), hab.mat, uv);
    m.name = 'releve-facade';
    ctx.scene.add(m);
  }
}

/** Le nom de la photo posee sur la face avant d'un bow-window glisse sous l'etage. */
export const NOM_PHOTO_BOW_WINDOW = 'releve-facade-bow-window';

/**
 * La photo du releve sur la face avant des bow-windows glisses sous l'etage (decision du proprietaire, 9 novembre 2026) : la part de la
 * photo qui est devant eux, aux memes coordonnees de texture le long de la facade (chaque point de la face montre le pixel du mur qu'il
 * cache, vu de face), du sol a leur haut. Elle remplace leurs vitres dessinees sur cette face ; les retours, que la photo de face ne voit
 * pas, gardent leur dessin, et sous l'etage il n'y a pas de toit propre. Rend les bow-windows habilles.
 */
function plaquerSurLesBowWindows(ctx: ContexteReleve3d, hab: Habillage, sousEtage: readonly RetraitSurFacade[]): CorpsToit[] {
  const f = hab.f, L = f.largeur;
  const ux = (f.droite.x - f.gauche.x) / L, uy = (f.droite.y - f.gauche.y) / L;
  const u = (q: PtBrut) => Math.min(1, Math.max(0, ((q.x - f.gauche.x) * ux + (q.y - f.gauche.y) * uy) / L));
  const habilles: CorpsToit[] = [];
  for (const c of sousEtage.flatMap((r) => r.bows ?? [])) {
    const top = Math.min(...c.egouts);
    // Le milieu du cote contre le mur : la normale d'une face s'en eloigne (comme les vitres, saillies.ts::vitresBowWindow).
    const mx = ((c.pts[0] as PtBrut).x + (c.pts[1] as PtBrut).x) / 2, my = ((c.pts[0] as PtBrut).y + (c.pts[1] as PtBrut).y) / 2;
    const sommets: number[] = [], uv: number[] = [], indices: number[] = [];
    for (const face of facesAvantDuBowWindow(c)) {
      for (let k = 0; k + 1 < face.length; k++) {
        const A = face[k] as PtBrut, B = face[k + 1] as PtBrut, l = Math.hypot(B.x - A.x, B.y - A.y);
        if (l < 1e-6) continue;
        let nx = (B.y - A.y) / l, ny = -(B.x - A.x) / l;
        if ((A.x - mx) * nx + (A.y - my) * ny + (B.x - mx) * nx + (B.y - my) * ny < 0) { nx = -nx; ny = -ny; }
        // 1 cm devant la face, comme la photo devant le mur.
        const loin = (q: PtBrut) => ctx.toLocal({ x: q.x + nx * DECOLLEMENT, y: q.y + ny * DECOLLEMENT });
        const a = loin(A), b = loin(B), i0 = sommets.length / 3;
        sommets.push(a.x, 0, a.z, b.x, 0, b.z, b.x, top, b.z, a.x, top, a.z);
        const v = Math.min(1, top / hab.hauteurTexture);
        uv.push(u(A), 0, u(B), 0, u(B), v, u(A), v);
        indices.push(i0, i0 + 1, i0 + 2, i0, i0 + 2, i0 + 3);
      }
    }
    if (!indices.length) continue;
    const m = maillage(sommets, indices, hab.mat, uv);
    m.name = NOM_PHOTO_BOW_WINDOW;
    ctx.scene.add(m);
    habilles.push(c);
  }
  return habilles;
}

/** Le complement des portions ouvertes dans [0, L] : les portions du mur ou il y a un mur. */
function portionsFermees(L: number, ouvertes: readonly [number, number][]): [number, number][] {
  const l: [number, number][] = [];
  let x = 0;
  for (const [a, b] of ouvertes) { if (a > x + 0.01) l.push([x, a]); x = Math.max(x, b); }
  if (L > x + 0.01) l.push([x, L]);
  return l;
}

/**
 * Le contour d'un mur (x le long du mur, y en hauteur ; bas droit, haut fonction de x) coupe entre les abscisses a et b
 * (Sutherland-Hodgman sur deux demi-plans verticaux : le contour reste simple).
 */
function entreAbscisses(contour: readonly { x: number; y: number }[], a: number, b: number): { x: number; y: number }[] {
  const couper = (l: readonly { x: number; y: number }[], dedans: (x: number) => boolean, xc: number) => {
    const sortie: { x: number; y: number }[] = [];
    l.forEach((p, i) => {
      const q = l[(i + 1) % l.length] as { x: number; y: number };
      if (dedans(p.x)) sortie.push(p);
      if (dedans(p.x) !== dedans(q.x)) { const t = (xc - p.x) / (q.x - p.x); sortie.push({ x: xc, y: p.y + t * (q.y - p.y) }); }
    });
    return sortie;
  };
  return couper(couper(contour, (x) => x >= a, a), (x) => x <= b, b);
}

/**
 * La photo d'un mur dont le segment (a, b) fait partie, et l'abscisse d'un point sur ce mur. Le toit
 * se pose sur la partie haute, dont les sommets ne sont pas numerotes comme le contour : on retrouve le
 * mur par alignement, pas par indice.
 */
function habillageDuSegment(habillages: readonly Habillage[], a: PtBrut, b: PtBrut): { hab: Habillage; x: (q: PtBrut) => number } | null {
  for (const hab of habillages) {
    const f = hab.f;
    const ux = (f.droite.x - f.gauche.x) / f.largeur,
      uy = (f.droite.y - f.gauche.y) / f.largeur;
    const x = (q: PtBrut) => (q.x - f.gauche.x) * ux + (q.y - f.gauche.y) * uy;
    const ecart = (q: PtBrut) => Math.abs((q.x - f.gauche.x) * uy - (q.y - f.gauche.y) * ux);
    const dedans = (q: PtBrut) => x(q) > -0.02 && x(q) < f.largeur + 0.02;
    if (ecart(a) < 0.02 && ecart(b) < 0.02 && dedans(a) && dedans(b)) return { hab, x };
  }
  return null;
}

/**
 * La couleur et le grain de la menuiserie d'une ouverture (lot L1) : ceux que la Facade a lus (`details.menuiserie`), sinon le cadre
 * clair d'avant, aux memes valeurs. Un metal (alu, acier) brille un peu, un bois est mat.
 */
export function menuiserieDe(o: Pick<OuvertureFacade, 'details'>): { color: number | string; roughness: number; metalness?: number } {
  const m = o.details?.menuiserie;
  if (!m) return { color: COULEUR_MENUISERIE, roughness: 0.6 };
  const metal = m.materiau === 'alu' || m.materiau === 'acier';
  return { color: m.couleur ?? COULEUR_MENUISERIE, roughness: metal ? 0.35 : m.materiau === 'bois' ? 0.75 : 0.5, ...(metal ? { metalness: 0.4 } : {}) };
}

/** L'encadrement d'une ouverture, et sa vitre ou son vantail quand il n'y a pas de photo. */
function poserOuverture(ctx: ContexteReleve3d, f: Facade, o: OuvertureFacade, avecPhoto: boolean) {
  const menuiserie = menuiserieDe(o);
  // Une baie cintree ou ronde (lot G17) : l'encadrement suit son contour, en une bande.
  if (aUneForme(o.details)) {
    encadrementForme(ctx, f, o, SECTION_CADRE, SAILLIE_CADRE, { cadre: menuiserie.color, vitre: avecPhoto ? null : COULEUR_VITRE }, DECOLLEMENT * 2);
    return;
  }
  const { ux, uz, pt } = repereMur(ctx, f);
  const angle = Math.atan2(-uz, ux);
  const mat = new THREE.MeshStandardMaterial(menuiserie);
  const piece = (x: number, y: number, l: number, h: number) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(l, h, SAILLIE_CADRE), mat);
    const [cx, cy, cz] = pt(x + l / 2, y + h / 2, SAILLIE_CADRE / 2);
    m.position.set(cx, cy, cz);
    m.rotation.y = angle;
    ctx.scene.add(m);
  };
  const s = SECTION_CADRE;
  piece(o.x - s, o.y + o.h, o.l + 2 * s, s); // linteau
  piece(o.x - s, o.y, s, o.h); // montant gauche
  piece(o.x + o.l, o.y, s, o.h); // montant droit
  if (o.type === 'fenetre') piece(o.x - s, o.y - s, o.l + 2 * s, s); // appui
  const carreaux = o.details?.carreaux;
  if (!avecPhoto) {
    const plein = o.type === 'porte' || o.type === 'garage';
    const sommets = [...pt(o.x, o.y, DECOLLEMENT * 2), ...pt(o.x + o.l, o.y, DECOLLEMENT * 2), ...pt(o.x + o.l, o.y + o.h, DECOLLEMENT * 2), ...pt(o.x, o.y + o.h, DECOLLEMENT * 2)];
    // La vitre suit le vitrage lu (lot F8) ; sans carreaux, celle d'avant, aux memes valeurs.
    const vitre = vitreLue(carreaux?.vitrage, { color: COULEUR_VITRE, roughness: 0.15, metalness: 0.3 });
    const m = maillage(
      sommets,
      [0, 1, 2, 0, 2, 3],
      new THREE.MeshStandardMaterial(plein ? { color: COULEUR_PORTE, roughness: 0.8, metalness: 0 } : vitre),
    );
    poserEnCouche(m.material as THREE_NS.Material, COUCHES_SOL.surMur);
    ctx.scene.add(m);
  }
  // Les carreaux que la facade validee porte (lot F8) : meneaux, imposte, petits bois, sur la photo comme sur la vitre.
  if (carreaux) poserCarreaux(ctx.scene, pt, o, carreaux, menuiserie.color, !!ctx.relief);
}

/** Le retrait de la couverture d'un toit-terrasse : la bande du dessus des murs se lit comme un acrotere. */
export const RETRAIT_TOIT_PLAT_M = 0.2;
/** Au-dessus du dessus du prisme, pour ne pas lui disputer le test de profondeur. */
const SURELEVATION_TOIT_PLAT_M = 0.02;

/**
 * Un toit-terrasse : sa couverture, de la couleur lue sur l'orthophoto (gris a defaut), posee sur le
 * dessus du prisme en retrait des murs. Sans elle, le dessus prenait la couleur des murs.
 */
function poserToitPlat(ctx: ContexteReleve3d, contour: PtBrut[], toit: Toit, h: number) {
  if (contour.length < 3) return;
  const dedans = safeOffset(contour, RETRAIT_TOIT_PLAT_M);
  const sommets: number[] = [];
  dedans.forEach((q) => {
    const l = ctx.toLocal(q);
    sommets.push(l.x, h + SURELEVATION_TOIT_PLAT_M, l.z);
  });
  // Un toit-terrasse en gravillons (three/couverture.ts), les coordonnees de texture en metres du plan.
  const tex = ctx.textures ? textureCouverture('terrasse') : null;
  const mat = new THREE.MeshStandardMaterial({ color: couleurToitPlat(toit), roughness: 0.95, side: THREE.DoubleSide, ...(tex ? { map: tex } : {}) });
  // Deux centimetres au-dessus du prisme ne suffisent pas vu de loin : avec un voisinage etendu, le
  // plan lointain recule a des kilometres, la precision de profondeur s'effondre et la couverture
  // scintillait contre le dessus du prisme. Le decalage de profondeur la fait gagner a coup sur.
  poserEnCouche(mat, COUCHES_SOL.surMur);
  const m = maillage(sommets, trianguler(dedans).flat(), mat, tex ? dedans.flatMap((q) => [q.x, q.y]) : undefined);
  m.name = 'releve-toit-plat';
  ctx.scene.add(m);
}

/** Les pans du toit et les pignons, au-dessus de l'egout `h`, sur l'emprise `contour`. */
function poserToit(ctx: ContexteReleve3d, contour: PtBrut[], toitLu: Toit, h: number, habillages: readonly Habillage[]) {
  // Une forme du catalogue se dessine en sa forme simple la plus proche (model/formeToit.ts).
  const toit = toitDessine(toitLu);
  if (toit.forme === 'plat' || toit.hauteur <= 0) { poserToitPlat(ctx, contour, toit, h); return; }
  const { pans, pignons } = facettesToit(contour, toit);
  // Tuiles ou ardoises selon la couverture, teintees de sa couleur (MD/spec-toit-ign.md §6.2).
  const materiau = dessinCouverture(materiauCouverture(toit, ctx.couverture), toit?.pose);
  const tex = ctx.textures ? textureCouverture(materiau) : null;
  const matToit = new THREE.MeshStandardMaterial({
    color: toit.couleur || COULEUR_TOIT_DEFAUT,
    ...matiereCouverture(materiau),
    side: THREE.DoubleSide,
    ...(tex ? { map: tex } : {}),
  });
  pans.forEach((pan) => {
    const sommets: number[] = [];
    pan.contour.forEach((q) => {
      const l = ctx.toLocal(q);
      sommets.push(l.x, h + q.z, l.z);
    });
    const m = maillage(sommets, pan.triangles.flat(), matToit, tex ? uvDuPan(pan.contour) : undefined);
    m.name = 'releve-toit';
    ctx.scene.add(m);
  });
  const matMur = new THREE.MeshStandardMaterial({ color: ctx.couleurMur, side: THREE.DoubleSide });
  pignons.forEach((g) => {
    const a = au(contour, g.cote),
      b = sommetDe(contour, g.cote + 1);
    const L = Math.hypot(b.x - a.x, b.y - a.y);
    // Le pignon est le polygone (d, z) : le bas le long de l'egout, le haut suivant le profil.
    const poly = [{ x: 0, y: 0 }, { x: L, y: 0 }, ...[...g.profil].reverse().filter((q) => q.z > 1e-6).map((q) => ({ x: q.d, y: q.z }))];
    if (poly.length < 3) return;
    const sommets: number[] = [];
    poly.forEach((q) => {
      const t = L > 0 ? q.x / L : 0;
      const l = ctx.toLocal({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
      sommets.push(l.x, h + q.y, l.z);
    });
    // Le pignon d'un mur photographie porte la suite de la photo : il est dans le plan du mur, la
    // bande au-dessus de l'egout l'a redresse a la meme echelle. L'abscisse se lit sur le mur.
    const trouve = habillageDuSegment(habillages, a, b);
    let uv: number[] | undefined;
    if (trouve) {
      const { hab, x } = trouve;
      uv = poly.flatMap((q) => {
        const t = L > 0 ? q.x / L : 0;
        return [x({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }) / hab.f.largeur, Math.min(1, (h + q.y) / hab.hauteurTexture)];
      });
    }
    const m = maillage(sommets, trianguler(poly).flat(), trouve ? trouve.hab.mat : matMur, uv);
    m.name = 'releve-pignon';
    ctx.scene.add(m);
  });
}

/**
 * Une ouverture de la facade objet (lot F5) est un objet de la scene : son encadrement et sa vitre vont dans un groupe nomme par son
 * identifiant (`ouverture:o3`), qui dit si la personne l'a verifiee. Sans identifiant (un releve d'avant la validation), ils vont
 * dans la scene comme avant : la scene d'un plan sans Facade validee garde exactement ses mailles.
 */
function ouvertureObjet(ctx: ContexteReleve3d, ov: OuvertureFacade): ContexteReleve3d {
  if (!ov.id) return ctx;
  const g = new THREE.Group();
  g.name = 'ouverture:' + ov.id;
  g.userData = { ouverture: ov.id, verifiee: !!ov.verifieeLe };
  ctx.scene.add(g);
  return { ...ctx, scene: g };
}

/** La hauteur d'un haut de mur (points de gauche a droite, x le long du mur, y en hauteur) en `x` ; hors de ses bouts, son bout. */
function hauteurDuHautEn(haut: readonly { x: number; y: number }[], x: number): number {
  const a0 = au(haut, 0), b0 = au(haut, haut.length - 1);
  if (x <= a0.x) return a0.y;
  for (let i = 0; i + 1 < haut.length; i++) {
    const a = au(haut, i), b = au(haut, i + 1);
    if (x <= b.x) return a.y + ((b.y - a.y) * (x - a.x)) / Math.max(1e-9, b.x - a.x);
  }
  return b0.y;
}

/** La facade `f` reculee de `profondeurM` derriere son plan (le mur d'un rez-de-chaussee en retrait) ; 0 : elle-meme. */
function facadeReculee(f: Facade, profondeurM: number): Facade {
  if (!profondeurM) return f;
  const d = { x: -f.normale.x * profondeurM, y: -f.normale.y * profondeurM };
  return { ...f, gauche: { x: f.gauche.x + d.x, y: f.gauche.y + d.y }, droite: { x: f.droite.x + d.x, y: f.droite.y + d.y } };
}

/**
 * Habille un batiment de son releve. Ne fait rien s'il n'en a pas. `retraitsRdc` : les rez-de-chaussee en retrait sous l'etage (schema 16,
 * `retraitsDuRdc`), dont la photo, les ouvertures et la modenature du bas suivent le mur recule ; absents ou vides, le releve se pose comme
 * avant. Rend les bow-windows dont la face avant a recu la photo (leurs vitres de cette face ne se dessinent pas).
 */
export function ajouterReleve3d(ctx: ContexteReleve3d, o: ObjetPolygone, h: number, volumesToit: readonly VolumeToit[] | null = null, sansToit = false, corps: readonly CorpsToit[] | null = null, retraitsRdc: ReadonlyMap<CorpsToit, readonly RetraitRdc[]> | null = null): Set<CorpsToit> {
  const bowsHabilles = new Set<CorpsToit>();
  if (!o.batiment?.facades?.length && !o.batiment?.toit && !volumesToit) return bowsHabilles;
  const { volumes, hautes } = volumesEtHautesDuBatiment(o.pts, h, o.batiment?.facades);
  const facades = facadesDuContour(o.pts, h);
  const habillages: Habillage[] = [];
  (o.batiment?.facades || []).forEach((r) => {
    const f = facades.find((x) => x.cote === r.cote);
    if (!f) return;
    // Les parties basses (un mur en L, ou une a chaque bout) ne decident de la 3D que sans corps du toit : avec eux, les marches sont
    // deja les leurs (le prisme et la silhouette de chaque corps), et la chaine les a lues sur leur gabarit
    // (facade/profil.ts::partiesBassesDuGabarit) ; les reprendre ici poserait le mur a la hauteur du batiment et oublierait les baies de
    // pignon de la partie haute.
    const parties = partiesBassesDu(r);
    const partie = corps?.length ? [] : parties;
    // Avec les corps, les parties basses disent encore ce qui n'est pas du mur : une baie au-dessus de leur egout est dans le vide.
    const dansLeL = (l: OuvertureFacade[]) => (corps?.length && parties.length ? ouverturesDansLeMur(l, Infinity, parties) : l);
    const hMur = partie.length ? h : hauteurDuMur(f, volumes);
    // Les portions du mur sous un appentis ouvert : ni photo, ni baie (un garage passe en carport).
    const ouvertes = corps?.length ? portionsOuvertesDuMur(f, corps) : [];
    const horsOuvert = (ov: OuvertureFacade) => !ouvertes.some(([a, b]) => ov.x + ov.l / 2 > a && ov.x + ov.l / 2 < b);
    // Un rez-de-chaussee en retrait sur ce mur (schema 16) : ou la photo et les ouvertures du bas reculent. Vide sans lui.
    const sousEtage = corps?.length && retraitsRdc?.size ? retraitsSurLaFacade(f, retraitsRdc, corps) : [];
    // Le mur a pu changer depuis le releve (sommet deplace) : la photo s'etire sur sa nouvelle
    // largeur, les ouvertures gardent leur cote depuis la gauche et celles qui sortent sont omises.
    const photo = ctx.textures ? r.texture : null;
    const avecPhoto = !!photo;
    if (photo) {
      const tex = ctx.sansOmbres ? textureSansOmbres(photo, r) : new THREE.TextureLoader().load(photo);
      garderLeJpeg(tex, photo);
      tex.anisotropy = 4;
      const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9, side: THREE.DoubleSide });
      // 1 cm devant le mur ne suffit pas vu de loin : la photo gagne le test de profondeur (COUCHES_SOL).
      poserEnCouche(mat, COUCHES_SOL.surMur);
      const hab = { f, mat, hauteurTexture: r.hauteurTexture || r.hauteur };
      habillages.push(hab);
      plaquerTexture(ctx, hab, hMur, partie, corps, ouvertes, sousEtage);
      // Devant le mur recule, la face avant des bow-windows recoit la part de la photo qui est devant eux.
      if (sousEtage.length) for (const c of plaquerSurLesBowWindows(ctx, hab, sousEtage)) bowsHabilles.add(c);
    }
    // Le haut de la facade sous les corps du toit (le pignon jusqu'au faitage) : la detection y cherche aussi (facade/analyse.ts), une
    // baie de pignon (lucarne, oculus) s'y pose. Sans corps, ou sur un mur en L, le haut est l'egout.
    const hautFacade = corps?.length && !partie.length ? hautDuMurSousCorps(f, corps, hMur) : null;
    const hautEn = (x: number) => Math.max(egoutEn(x, hMur, partie), hautFacade ? hauteurDuHautEn(hautFacade, x) : 0);
    const sousEgout = (ov: OuvertureFacade) => ov.y + ov.h <= egoutEn(ov.x + ov.l / 2, hMur, partie) + 0.01;
    // Une baie hors du mur, d'un cote comme de l'autre (sous le pignon d'un corps voisin qui prolonge la facade, que la detection lit
    // depuis le 2 novembre 2026, ou un mur raccourci depuis le releve) ne se pose pas sur lui : elle n'en est pas.
    // Sous un etage qui avance, une baie du bas suit le mur recule, aucune derriere un bow-window ni a cheval sur le dessous de l'etage
    // (profondeurDOuverture, comme la disposition automatique) ; sans retrait, toutes au nu.
    const profondeur = (ov: OuvertureFacade) => (sousEtage.length ? profondeurDOuverture(ov, sousEtage) : 0);
    const posees = dansLeL(r.ouvertures.filter((ov) => horsOuvert(ov) && profondeur(ov) !== null && ov.x >= -0.01 && ov.x + ov.l <= f.largeur + 0.01 && (sousEgout(ov) || ov.y + ov.h <= Math.min(hautEn(ov.x), hautEn(ov.x + ov.l)) + 0.01)));
    const facadeDe = (ov: OuvertureFacade) => facadeReculee(f, profondeur(ov) ?? 0);
    // Le haut du mur au-dessus d'une baie du bas d'un rez-de-chaussee en retrait : le dessous de l'etage.
    const dessousEtage = (ov: OuvertureFacade) => (profondeur(ov) ? sousEtage.find((k) => ov.x < k.a && ov.x + ov.l > k.de)?.hauteurM : undefined);
    posees.forEach((ov) => poserOuverture(ouvertureObjet(ctx, ov), facadeDe(ov), ov, avecPhoto));
    // Volets, coffres, balcons et garde-corps que le releve a reconnus (three/detailsOuvertures.ts) ; une baie de pignon borne son coffre
    // au haut de la facade au-dessus d'elle.
    poserDetailsOuvertures(ctx, posees.map((o) => ({ f: facadeDe(o), o, hMur: dessousEtage(o) ?? (sousEgout(o) ? egoutEn(o.x + o.l / 2, hMur, partie) : hautEn(o.x + o.l / 2)), cadre: SECTION_CADRE })));
    // La modenature lue et le store (lot L1) : rien sans elles. Sous un etage qui avance, celle du bas suit le mur recule.
    poserModenature(ctx, f, r, hMur, posees, sousEtage);
  });
  // Un toit par corps de batiment (model/volumesToit.ts), chacun a son egout ; sinon le toit coiffe
  // la partie haute, et la partie basse garde le toit plat de son prisme. `sansToit` : la surface
  // mesuree au LiDAR le remplace (three/toitMesure3d.ts), les murs et leurs ouvertures restent.
  if (sansToit) return bowsHabilles;
  if (volumesToit) volumesToit.forEach((v) => poserToit(ctx, v.pts, toitDuVolume(v, o.batiment?.toit), v.egout ?? h, habillages));
  // Une partie basse au milieu du mur coupe la partie haute en deux : chacune a son toit.
  else if (o.batiment?.toit) { const toit = o.batiment.toit; volumes.slice(0, hautes).forEach((v) => poserToit(ctx, v.pts, toit, h, habillages)); }
  return bowsHabilles;
}


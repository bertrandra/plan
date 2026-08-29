// Chargement de Three.js, demontage des scenes, et visionneuse GLB (spec §3.2, three/).
//
// Trois choses de meme nature, qui n'ont rien a faire dans le reste du programme : comment la
// bibliotheque arrive, comment on rend proprement ce qu'elle a alloue, et comment on affiche un
// fichier .glb deja produit.
//
// Le demontage merite d'etre lu : un `renderer.dispose()` ne libere PAS les geometries, les
// materiaux ni les textures deja televersees sur la carte graphique. Sans le parcours explicite qui
// suit, rouvrir la Vue 3D dix fois laisse dix scenes en memoire video.

import { vue3d, glb, chargement, type SceneTrois } from './etat3d.js';
import { showErrBanner } from '../ui/dialogs.js';
import { reglerSoleil } from './lumiere.js';
import { anneeEtSemaineDepuisDate } from '../util/semaine.js';
import { ensureGLTFLoaderLoaded } from './chargeurs.js';

function damierGlbViewer(){
  const c = document.createElement('canvas'); c.width = 64; c.height = 64;
  const ctx = c.getContext('2d');
  const taille = 8;
  for(let y=0;y<64;y+=taille){
    for(let x=0;x<64;x+=taille){
      ctx.fillStyle = ((x/taille + y/taille) % 2 === 0) ? '#c9c9c9' : '#a3a3a3';
      ctx.fillRect(x,y,taille,taille);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(24,24);
  return tex;
}

export function attendreTexturesPretes(scene, delaiMaxMs){
  const textures = new Set<SceneTrois>();
  scene.traverse(o=>{
    if(o.isMesh){
      (Array.isArray(o.material) ? o.material : [o.material]).forEach(m=>{
        if(m && m.map) textures.add(m.map);
      });
    }
  });
  if(textures.size===0) return Promise.resolve();
  const debut = Date.now();
  return new Promise<void>(resolve=>{
    (function verifier(){
      const pretes = [...textures].every(t=>t.image !== undefined);
      if(pretes || Date.now()-debut > delaiMaxMs) resolve();
      else setTimeout(verifier, 100);
    })();
  });
}

export function ensureThreeLoaded(cb){
  if(chargement.three && THREE && THREE.OrbitControls){ cb(); return; }
  const s1 = document.createElement('script');
  s1.src = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
  s1.onload = () => {
    const s2 = document.createElement('script');
    s2.src = 'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.js';
    s2.onload = () => { chargement.three = true; cb(); };
    s2.onerror = () => showErrBanner('Impossible de charger les controles 3D (connexion internet requise pour cette fonctionnalite).');
    document.head.appendChild(s2);
  };
  s1.onerror = () => showErrBanner('Impossible de charger la bibliotheque 3D (connexion internet requise pour cette fonctionnalite).');
  document.head.appendChild(s1);
}

export function ensureGLTFExporterLoaded(cb){
  if(chargement.exporteurGltf && THREE && THREE.GLTFExporter){ cb(); return; }
  const s = document.createElement('script');
  s.src = 'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/exporters/GLTFExporter.js';
  s.onload = () => { chargement.exporteurGltf = true; cb(); };
  s.onerror = () => showErrBanner('Impossible de charger l\'exporteur GLB (connexion internet requise pour cette fonctionnalite).');
  document.head.appendChild(s);
}

export function disposeThreeSceneResources(scene){
  if(!scene) return;
  scene.traverse(obj=>{
    if(obj.geometry) obj.geometry.dispose();
    const materials = Array.isArray(obj.material) ? obj.material : (obj.material ? [obj.material] : []);
    materials.forEach(mat=>{
      Object.keys(mat).forEach(key=>{
        const v = mat[key];
        if(v && v.isTexture) v.dispose();
      });
      mat.dispose();
    });
  });
  // scene.background can itself be a texture (the GLB viewer's "damier" checkerboard uses a
  // CanvasTexture) rather than a plain THREE.Color - traverse() never visits it since it isn't
  // part of the object graph, so it needs disposing separately or it leaks like any other texture.
  if(scene.background && scene.background.isTexture) scene.background.dispose();
}

export function disposeThreeScene(){
  if(vue3d.scene){
    cancelAnimationFrame(vue3d.scene.raf);
    // OrbitControls (r128) attaches its drag-continuation listeners to `document`/`window`, not
    // just to the canvas being removed below - without an explicit dispose(), those listeners
    // (and everything they close over: this camera, this scene, this renderer) are never
    // released, so every 3D-view rebuild leaves the previous one pinned in memory. Over a
    // session with several rebuilds this accumulates real RAM, which is what was actually
    // driving iOS into killing the page ("Impossible de charger la page") - a step further than
    // the WebGL-context cap alone.
    if(vue3d.scene.controls && vue3d.scene.controls.dispose) vue3d.scene.controls.dispose();
    disposeThreeSceneResources(vue3d.scene.scene);
    vue3d.scene.renderer.dispose();
    // iOS Safari caps the number of *live* WebGL contexts a page may hold at once (historically
    // as few as 8-16) and does not free one just because renderer.dispose() released its GPU
    // memory - the context object itself lingers until GC catches up. Once the cap is hit,
    // subsequent WebGLRenderer creations silently get a context where gl.createShader() returns
    // null, and Three.js passes that null straight into shaderSource() - which is exactly the
    // "Argument 1 ('shader') ... must be an instance of WebGLShader" crash reported on iPhone.
    // forceContextLoss() explicitly releases the context immediately instead of waiting on GC.
    if(vue3d.scene.renderer.forceContextLoss) vue3d.scene.renderer.forceContextLoss();
    if(vue3d.scene.renderer.domElement.parentNode) vue3d.scene.renderer.domElement.parentNode.removeChild(vue3d.scene.renderer.domElement);
    vue3d.scene = null;
  }
}

export function disposeGlbViewerScene(){
  if(glb.scene){
    cancelAnimationFrame(glb.scene.raf);
    // see the comment in disposeThreeScene(): without this, OrbitControls keeps its
    // document/window-level listeners alive, pinning the whole previous scene in memory.
    if(glb.scene.controls && glb.scene.controls.dispose) glb.scene.controls.dispose();
    disposeThreeSceneResources(glb.scene.scene);
    glb.scene.renderer.dispose();
    // see the comment in disposeThreeScene(): releases the WebGL context immediately rather
    // than leaving it to GC, so iOS Safari's low live-context cap doesn't get exhausted.
    if(glb.scene.renderer.forceContextLoss) glb.scene.renderer.forceContextLoss();
    if(glb.scene.renderer.domElement.parentNode) glb.scene.renderer.domElement.parentNode.removeChild(glb.scene.renderer.domElement);
    glb.scene = null;
  }
}

export function fondGlbViewer(){
  if(glb.fond==='damier') return damierGlbViewer();
  if(glb.fond==='sombre') return new THREE.Color(0x20242b);
  return new THREE.Color(0xdfe7ea);
}

/** Recale le curseur « semaine » de la visionneuse sur sa date, et retient sa position. */
export function syncSemaineGlb(): void {
  const { semaine } = anneeEtSemaineDepuisDate(glb.dateStr);
  glb.semaineAffichee = semaine;
  const s = document.getElementById('glbViewerSemaine') as HTMLInputElement;
  s.value = String(semaine);
}

/** Remet les commandes de la visionneuse en accord avec son etat, a l'ouverture du panneau. */
export function syncControlesGlb(formatHeureMin: (m: number) => string): void {
  const dateInp = document.getElementById('glbViewerDate') as HTMLInputElement | null;
  // Seulement si elle est vide : une date deja choisie ne doit pas etre effacee par une
  // reouverture du panneau.
  if (dateInp && !dateInp.value) dateInp.value = glb.dateStr;
  syncSemaineGlb();
  (document.getElementById('glbViewerHeure') as HTMLInputElement).value = String(glb.minutes);
  document.getElementById('glbViewerHeureTexte').textContent = formatHeureMin(glb.minutes);
  const pourcent = Math.round(glb.intensiteSoleil * 100);
  (document.getElementById('glbViewerIntensite') as HTMLInputElement).value = String(pourcent);
  document.getElementById('glbViewerIntensiteTexte').textContent = pourcent + ' %';
}

/**
 * (Re)construit la scene de la visionneuse a partir du dernier .glb exporte.
 *
 * Le sablier couvre a la fois le chargement de Three et du lecteur glTF — reseau, la premiere fois
 * seulement — et l'analyse du modele : le contenu reste cache tant que la scene n'est pas prete,
 * plutot que de montrer un canevas vide pendant ce temps.
 *
 * La taille de l'hote est mesuree **avant** de cacher le contenu : un ancetre en `display:none`
 * ecrase `clientWidth`/`clientHeight` a 0 pour tous ses descendants, et la scene retomberait sur sa
 * taille par defaut, meme en plein ecran.
 */
export function rafraichirVisionneuseGlb(camaraAConserver, ctx): void {
  const empty = document.getElementById('glbViewerEmpty');
  const content = document.getElementById('glbViewerContent');
  const loading = document.getElementById('glbViewerLoading');
  if (!glb.dernierExporte) {
    empty.style.display = 'block'; content.style.display = 'none'; loading.style.display = 'none';
    return;
  }
  const host = document.getElementById('glbViewerCanvasHost');
  const tailleHost = { w: host.clientWidth || 0, h: host.clientHeight || 0 };
  empty.style.display = 'none'; content.style.display = 'none'; loading.style.display = 'block';
  ensureThreeLoaded(() => {
    ensureGLTFLoaderLoaded(() => {
      buildGlbViewerScene(camaraAConserver, tailleHost, ctx);
    });
  });
}

// Les regles du soleil sont dans lumiere.ts, partagees avec la Vue 3D : les deux vues se reglent
// separement, mais elles eclairent avec le meme soleil.
export function appliquerLumiereGlb(ctx){
  if(!glb.scene) return;
  reglerSoleil(glb.scene, glb, ctx.lieuActuel());
  glb.scene.renderer.render(glb.scene.scene, glb.scene.camera);
}

export function buildGlbViewerScene(camaraAConserver, tailleHost, ctx){
  disposeGlbViewerScene();
  if(!glb.dernierExporte) return;
  const host = document.getElementById('glbViewerCanvasHost');
  // Tant qu'un rechargement est en cours, #glbViewerContent (l'ancetre du host) est cache pour
  // laisser la place au sablier - un ancetre display:none ecrase clientWidth/clientHeight a 0 pour
  // TOUS ses descendants, host compris, ce qui retombe silencieusement sur les tailles par defaut
  // 600x420 meme en plein ecran (le bug : le rendu retrecit d'un coup). `tailleHost`, mesure par
  // l'appelant AVANT de cacher le contenu, contourne ce piege.
  const w = (tailleHost && tailleHost.w) || host.clientWidth || 600;
  const h = (tailleHost && tailleHost.h) || host.clientHeight || 420;
  const loader = new THREE.GLTFLoader();
  loader.parse(glb.dernierExporte.buffer, '', (gltf)=>{
    const scene = new THREE.Scene();
    scene.background = fondGlbViewer();
    // GLTFExporter embarque les lumieres directionnelles de la scene source dans le .glb (via
    // l'extension glTF KHR_lights_punctual ; seule l'hemispherique, non representable, y echappe).
    // Rechargees telles quelles, elles s'ajoutent a celles de la visionneuse SANS etre pilotees par
    // le curseur date/heure : a minuit, ce soleil fige continuait d'eclairer la scene. On les
    // retire donc a l'import - ici l'eclairage doit venir uniquement des lumieres reglables.
    const lumieresDuFichier = [];
    gltf.scene.traverse(o=>{ if(o.isLight) lumieresDuFichier.push(o); });
    lumieresDuFichier.forEach(l=>{ if(l.parent) l.parent.remove(l); });
    scene.add(gltf.scene);

    const bb = new THREE.Box3().setFromObject(gltf.scene);
    const centre = new THREE.Vector3(); bb.getCenter(centre);
    const taille = new THREE.Vector3(); bb.getSize(taille);
    const rayon = Math.max(0.5, taille.length()/2);

    const camera = new THREE.PerspectiveCamera(45, w/h, Math.max(0.01, rayon/200), rayon*100);
    if(camaraAConserver){
      camera.position.copy(camaraAConserver.pos);
    } else {
      camera.position.set(centre.x + rayon*1.4, centre.y + rayon*1.1, centre.z + rayon*1.4);
    }

    const renderer = new THREE.WebGLRenderer({antialias:true, preserveDrawingBuffer:true});
    // On iOS Safari, once the browser's live-WebGL-context cap is reached, this constructor can
    // succeed but hand back a context that's already lost (getContext() null, or isContextLost()
    // true) - if that goes unchecked, the very next shader compile crashes with "Argument 1
    // ('shader') ... must be an instance of WebGLShader" instead of a clear message. Bail out
    // here with a real error rather than letting THREE crash a few calls further down.
    const glCtx = renderer.getContext && renderer.getContext();
    if(!glCtx || (glCtx.isContextLost && glCtx.isContextLost())){
      showErrBanner('Visionneuse GLB : le navigateur a refuse de creer un contexte 3D (trop d\'onglets/vues 3D ouverts ?). Ferme quelques onglets ou recharge la page, puis reessaie.');
      return;
    }
    renderer.setSize(w,h);
    renderer.shadowMap.enabled = glb.ombres;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    host.appendChild(renderer.domElement);

    const controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.target.copy(camaraAConserver ? camaraAConserver.cible : centre);
    controls.update();

    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x4a3c2a, 0.5);
    scene.add(hemiLight);
    // Position/intensite/couleur initiales sans importance : appliquerLumiereGlb() ci-dessous les
    // pose selon le curseur "coucher de soleil / plein soleil" juste apres construction.
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.75);
    if(glb.ombres){
      dirLight.castShadow = true;
      dirLight.shadow.mapSize.set(2048, 2048);
      const d = rayon * 1.3;
      dirLight.shadow.camera.left = -d; dirLight.shadow.camera.right = d;
      dirLight.shadow.camera.top = d; dirLight.shadow.camera.bottom = -d;
      dirLight.shadow.camera.near = 0.05; dirLight.shadow.camera.far = rayon*8;
      dirLight.shadow.bias = -0.0005;
      dirLight.target.position.copy(centre);
      scene.add(dirLight.target);
    }
    scene.add(dirLight);
    const dirFill = new THREE.DirectionalLight(0xffffff, 0.3);
    dirFill.position.set(centre.x - rayon*1.6, centre.y + rayon*2.2, centre.z - rayon*1.0);
    scene.add(dirFill);

    scene.traverse(o=>{
      if(o.isMesh){
        (Array.isArray(o.material) ? o.material : [o.material]).forEach(m=>{ if(m) m.wireframe = glb.filaire; });
        if(glb.ombres){ o.castShadow = true; o.receiveShadow = true; }
      }
    });

    function animate(){
      glb.scene.raf = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    }
    glb.scene = { renderer, scene, camera, controls, raf:null, dirLight, dirFill, hemiLight, centre, rayon };
    appliquerLumiereGlb(ctx);
    animate();

    const hint = document.getElementById('glbViewerHint');
    if(hint) hint.textContent = 'Terrasse : ' + (glb.dernierExporte.nomTerrasse||'') + ' — modele genere le ' + glb.dernierExporte.date.toLocaleString();
    ctx.renderVue3DSelect();
    document.getElementById('glbViewerLoading').style.display = 'none';
    document.getElementById('glbViewerContent').style.display = 'block';
  }, (err)=>{
    document.getElementById('glbViewerLoading').style.display = 'none';
    showErrBanner('Visionneuse GLB : ' + (err && err.message ? err.message : 'fichier illisible'));
  });
}

// Le moteur de la 3D, charge a la demande (AD-10) : la scene, la visionneuse, la navigation, l'export .glb et la capture. Ce module
// ne fait que les rassembler derriere un seul `import()` (three/demande3d.ts) ; rien ne l'importe statiquement hors de three/.

export { buildThreeScene, remplacerObjets3d, comparerObjets3d, surlignerDans3d, epurerVue3d, epurerLeTemps, visibilite3d, objetSousLePointeur, racinesDe3d } from './scene.js';
export { cadrerDeuxVues } from './comparaison3d.js';
export { creerNavigation3d, cameraDepuisPointDeVue } from './navigation.js';
export { genererGlb } from './exportGlb.js';
export { syncSemaineDepuisDate, syncControles, appliquer as appliquerSoleilVue3d } from './soleilVue3d.js';
export {
  ensureThreeLoaded, disposeThreeScene, disposeGlbViewerScene, appliquerLumiereGlb, syncSemaineGlb, syncControlesGlb,
  rafraichirVisionneuseGlb, remplacerFondGlb
} from './glbViewer.js';
export { capturerVue3d } from './capture.js';

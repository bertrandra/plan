// @ts-nocheck
// Phase 1 de la migration (MD/spec-migration-typescript.md section 4) : blocs <script> 1 et 2 de
// plan.html, repris VERBATIM. Rien n a ete retype, reordonne ni corrige ici - c est le point de
// depart contre lequel chaque phase suivante se compare. Trois seules differences avec le fichier
// mono-page, toutes structurelles :
//   - le try/catch qui enveloppait le bloc 2 est remonte dans main.ts (une exception a l import
//     d un module ne se rattrape qu au point d import) ;
//   - l appel final loadInitialProject().then(boot) est remonte dans main.ts ;
//   - les deux symboles d entree sont exportes en fin de fichier.
//
// Phase 2 en cours : les fonctions pures sortent d'ici une par une vers de vrais modules types.
// Ce qui suit est importe, plus defini dans ce fichier.
import { dist, shoelace, signedArea, centroid, pointInPolygon } from './geometry/basic.js';
import { escapeHtml, escapeXml } from './util/escape.js';
import { nombreFr, formatHeureMin, slugFichier, horodatageFichier } from './util/format.js';
import { telechargerTexte } from './util/download.js';
import {
  projectOntoSegment, distancePointSegment, nearestSegmentIndex,
  lineSegIntersect, lineLineIntersect
} from './geometry/segments.js';
import { estRectangle, rectangleDepuisCoin, rectangleDepuisCote, RECT_MIN_M } from './geometry/rect.js';
import {
  clipLineToPolygon, polygonOffset, ringSegments, clipPolygonByConvex, exteriorBisector, offsetZone
} from './geometry/polygon.js';
import { memePoint, decouperAnneau, chainerSegments, fusionnerAnneaux, simplifierContour } from './geometry/rings.js';
import { distancePointContour, distanceContours, longueurFrontiere } from './geometry/proximite.js';
import { parseSvgPathPoints, pathD, polyStr } from './geometry/path.js';
import { TERRE_A, TERRE_E2, projecteurLocal, tuileX, tuileY, lonDeTuile, latDeTuile } from './geo/projection.js';
import { decalageFuseauFrance, positionSoleil } from './geo/soleil.js';
import { DEMO_OBJECTS, DEMO_MEASURES } from './model/demo.js';
import { LONGUEURS_BOIS_DEFAUT, LONGUEURS_LAMES_DEFAUT, PRIX_STORE, achatPlots, achatVis, chargePlot, computeAssise, computeBOM, coutDebit, largeurProduit, longueursBois, longueursDispo, longueursLambourde, parseLongueurs, prixBarre, prixBarreDefaut, prixM2De, prixPersonnalise, prixPlotUnite, prixVisUnite, setPrixBarre, setPrixM2 } from './engine/bom.js';
import { CADENCES, CHANTIER_PHASES, cadenceDe, computeChantier } from './engine/chantier.js';
import { CONCASSE_PRICE, DALLE_STAB_PRICE, ESSENCE_PRICES, GEOTEXTILE_PRICE, LAME_RIVE_EPAISSEUR_M, LAME_RIVE_PRICE, PLOT_ASSISE_MIN_CM2, PLOT_ENTRAXE_MAX_M, PLOT_HAUTEUR_DTU_CM, PLOT_HAUTEUR_MAX_CM, PLOT_MODELES, SOLIVE_PRICE, SOLIVE_SECTIONS, SUPPORT_TYPES, VISSERIE_PRICE, VIS_DEPASSEMENT_MAX_CM, VIS_DEPASSEMENT_USUEL_CM, VIS_PRICE, estPlots, plotModele } from './engine/constantes.js';
import { defaultConstruction, ensureConstruction } from './engine/construction.js';
import { computeDebitLames, computeDebitsBois, optimiserDebitLames } from './engine/debit.js';
import { computeImplantation, repereImplantation } from './engine/implantation.js';
import { empriseLame, etendueLame, generateParallelLines, longueurLameReelle } from './engine/lames.js';
import { ouvrirSelecteurTexture } from './ui/texturePicker.js';
import { showErrBanner, showToast, showProjectLoadError, showConfirm, showPrompt } from './ui/dialogs.js';
import { dessinerFlecheNord, dessinerEchelle } from './render/decor.js';
import { dessinerGrille } from './render/grille.js';
import { geometrieMesure, coordonneesCote, coordonneesPoint, ancrageHorsContour, dessinerCotes } from './render/measures.js';
import { editerAngle, editerLongueur, contourDeContrainte } from './interaction/editing.js';
import { insererSommet, supprimerSommet, minimumSommets } from './model/sommets.js';
import { alignerSurCote } from './geometry/alignement.js';
import {
  etiquetteComposee, longueurEnMetres, angleEnDegres,
  SEP_ECRAN, DEGRE_ECRAN, SEP_EXPORT, DEGRE_EXPORT
} from './model/etiquettes.js';
import {
  hauteurBatiment, hauteurVegetation, arbresEstimes, libelleParcelle,
  ESPACEMENT_ARBRES_M, MAX_ARBRES_ESTIMES
} from './geo/bdtopo.js';
import { objetsDepuisCadastre } from './geo/cadastreObjets.js';
import { ouvrirImportCadastre } from './ui/cadastreDialog.js';
import { renderAttrTable as renderAttrTablePanneau } from './ui/attrPanel.js';
import { vue3d, glb, chargement } from './three/etat3d.js';
import { SOLEIL_ELEV_PLANCHER, SOLEIL_DIST_FACTOR } from './three/lumiere.js';
import {
  attendreTexturesPretes, ensureThreeLoaded, ensureGLTFExporterLoaded,
  disposeThreeSceneResources, disposeThreeScene, disposeGlbViewerScene,
  fondGlbViewer, appliquerLumiereGlb, buildGlbViewerScene
} from './three/glbViewer.js';
import { serializeObjects, serializeMeasures } from './io/serialisation.js';
import { importSVGString as importerSVG } from './io/importSvg.js';
import { setupProjectBar, renderPanneauPlu, actualiserDepuisIgn, ouvrirDialogueActualisation, construireVoisinage } from './ui/projectBar.js';
import {
  renderTerrasseConfigurator, renderParametresCalcul, renderTerrasseCoupe, renderDebitBois,
  renderImplantation, renderChantier, renderMethode, renderOptimResult, basculerOptimisation
} from './ui/terrassePanels.js';
import { buildThreeScene as construireScene3D } from './three/scene.js';
import { cibleAlignement, definirCibleAlignement } from './interaction/outilAlignement.js';
import {
  geocoderBAN, interrogerCadastre, construireCandidats, classerCandidats, trierVoisines,
  anneauVersPts, anneauExterieur, empriseGeoJSON, empriseAutourAnneau, bboxDegDesAnneaux,
  interrogerWfs, construireElementsIgn, rattacherElementsAuxParcelles, interrogerPlu,
  lienGeoportailUrbanisme, lienTerritoireUrbanisme, fetchJSONReseau, polygonesSeTouchent,
  CADASTRE_URL, RAYONS_RECHERCHE_M, ECART_AUTO_M,
  COUCHE_BATIMENT, COUCHE_VEGETATION, COUCHE_HAIE
} from './geo/apiIgn.js';
import { FUSION_TOL_M, ADJACENCE_TOL_M, SIMPLIF_M, MAX_VOISINES } from './geo/constantesCadastre.js';
import { zoomMolette, debutPincement, pincer, deplacer, milieuDe, cadrerSur, empriseDe } from './interaction/navigation.js';
import { appliquerGlisser } from './interaction/drag.js';
import { creerDomObjet, reconstruirePoignees, positionnerObjet } from './render/objects.js';
import { dessinerCalqueParasols } from './render/parasolOverlay.js';
import { svgNS, creerSvg, attrs } from './render/svg.js';
import { themeSombre, SVG_INK, SVG_GRID_MAJOR, SVG_GRID_MINOR, SVG_LABEL_HALO, SVG_MEASURE_LINE, SVG_MEASURE_LINE_SOFT, SVG_MEASURE_TEXT } from './render/theme.js';
import { creerEtat } from './core/state.js';
import { PileAnnulation } from './core/history.js';
import { creerScene, versEcran, versMonde } from './render/scene.js';
import { vue, detruireVue, viderVues, nombreDeVues } from './render/vues.js';
import { computeTerrasseLayers } from './engine/layers.js';
import { PARASOL_ELEV_MIN_DEG, PARASOL_HEURES, PARASOL_MOIS, calculerCartesOmbre, chercherMeilleurePositionParasol, echantillonsSoleilParasol, geometrieOmbre, grillePolygone, hauteurParasolDe, matAngleDe, ombreInstantanee, pointDansOmbre, pointsPerimetre, terrasseDuParasol } from './engine/parasol.js';
import { CHARGE_NORMALE_DEFAUT, CHARGE_REF, CHARGE_SPA_DEFAUT, ENTRAXE_LAME_K, LAMBOURDE_SECTIONS, LAME_RAIDEUR, PORTEE_VIS_K, SECTION_REF_AIRE, SOLIVE_SECTION_DIMS, VIS_ROLE_RANK, buildVisGrid, buildVisGridCount, coefRaideurLame, computeStructure, dedupeVis, dimsSection, distPointToLine, empriseEquipement, evaluerStructure, findSpaZones, generateSpanningLines, lamesAngleOf, libelleAppui, maxEntraxeLameCm, maxPorteeVisM, optimiserParametres, porteeAppuiM, porteeVisM, porteeVisSpaM, prixUnitaire, safeOffset, sectionLambourde, segmentZoneRanges, subdivideSegment, tarifSection, zoneToucheTerrasse } from './engine/structure.js';
import {
  LIBELLE_FONCTION, FONCTIONS_HORS_EQUIPEMENT, LIEU_DEFAUT, ELEVATION_DEFAUT, elevationParDefaut
} from './model/defaults.js';
import { APP_VERSION, SCHEMA_VERSION, API_VERSION, BUILD_AT, BUILD_SHA, versionLongue, signatureExport } from './model/version.js';
import { niceStep } from './util/format.js';
import { dxfNum } from './export/dxf.js';
import { construireDXF } from './export/dxfPlan.js';
import { construireSVG } from './export/svgPlan.js';
import { construirePDF } from './export/pdfPlan.js';
import { construireDossierPDF, equipementsSurTerrasse } from './export/dossierPdf.js';
import {
  A4_L, A4_H, PT_PAR_METRE, MARGE_PDF, ECHELLES_DOSSIER,
  pdfEscape, horodatagePdfInfo, assemblerPDF, pdfTexte, pdfPolygone, pdfCercle,
  pdfFlecheNord, pdfEchelleGraphique, echelleQuiTient, hexToRgb01
} from './export/pdf/writer.js';
window.addEventListener('error', function(e){ showErrBanner((e.message||'inconnue') + '  (ligne ' + e.lineno + ', col ' + e.colno + ')'); });
window.addEventListener('unhandledrejection', function(e){ showErrBanner('Promise rejetee: ' + (e.reason && e.reason.message ? e.reason.message : e.reason)); });



// ================= Persistance : projets via api.php (fichiers JSON cote serveur) =================
// Si api.php est absent ou injoignable (fichier ouvert en local, hebergement sans
// backend deploye...), l'appli reste 100% fonctionnelle avec le jeu de donnees de
// demonstration ci-dessous, exactement comme avant l'ajout de la persistance.

const API_URL = 'api.php';
const LS_LAST_PROJECT = 'planInteractif.lastProjectId';
// Toute requete porte la version du client : le serveur peut ainsi reperer un onglet laisse
// ouvert plusieurs versions durant, et refuser une ecriture trop ancienne (RELEASE.md 5.3).
const ENTETES_VERSION = {'X-App-Version': APP_VERSION, 'X-Schema-Version': String(SCHEMA_VERSION)};

function getProjectIdFromUrl(){
  return new URLSearchParams(location.search).get('projet');
}
function withProjectParam(id){
  const url = new URL(location.href);
  url.searchParams.set('projet', id);
  return url.toString();
}
async function apiList(){
  let r;
  try { r = await fetch(API_URL + '?action=list', {cache:'no-store', headers: ENTETES_VERSION}); }
  catch(e){ throw Object.assign(new Error('API injoignable (reseau) : ' + (e.message||e)), {reason:'network'}); }
  if(!r.ok){ throw Object.assign(new Error('api list HTTP ' + r.status), {reason: r.status===404?'notfound':'server'}); }
  try { return await r.json(); }
  catch(e){ throw Object.assign(new Error('Reponse invalide (JSON illisible) pour la liste des projets'), {reason:'badjson'}); }
}
async function apiLoad(id){
  let r;
  try { r = await fetch(API_URL + '?action=load&id=' + encodeURIComponent(id), {cache:'no-store', headers: ENTETES_VERSION}); }
  catch(e){ throw Object.assign(new Error('API injoignable (reseau) : ' + (e.message||e)), {reason:'network'}); }
  if(!r.ok){ throw Object.assign(new Error('api load HTTP ' + r.status), {reason: r.status===404?'notfound':'server'}); }
  try { return await r.json(); }
  catch(e){ throw Object.assign(new Error('Projet illisible : reponse JSON invalide'), {reason:'badjson'}); }
}
async function apiSave(payload){
  const r = await fetch(API_URL + '?action=save', {
    method:'POST', headers: Object.assign({'Content-Type':'application/json'}, ENTETES_VERSION), body: JSON.stringify(payload)
  });
  if(!r.ok) throw new Error('api save HTTP ' + r.status);
  return r.json();
}
async function apiDelete(id){
  const r = await fetch(API_URL + '?action=delete', {
    method:'POST', headers: Object.assign({'Content-Type':'application/json'}, ENTETES_VERSION), body: JSON.stringify({id})
  });
  if(!r.ok) throw new Error('api delete HTTP ' + r.status);
  return r.json();
}

// Determine what to boot with: a project loaded from the server, or (only when this browser
// has no known project at all, i.e. a genuine first visit) the local demo dataset, so the app
// never gets stuck on a blank/broken screen the very first time it's opened. Once a real
// project id is known (URL param or localStorage), a load failure is surfaced to the user
// instead of being silently replaced by DEMO_OBJECTS - see M5 in the QA report: swapping in
// demo data on any error made a real project look lost/replaced when the API merely hiccuped.
async function loadInitialProject(){
  const knownProjectId = getProjectIdFromUrl() || localStorage.getItem(LS_LAST_PROJECT);
  let list;
  try {
    list = await apiList();
  } catch(e){
    if(!knownProjectId){
      // Nothing to lose: no project has ever been opened on this browser, so this is
      // indistinguishable from "API not configured yet" - bootstrap locally with the demo.
      return { apiAvailable:false, list:[], objects:JSON.parse(JSON.stringify(DEMO_OBJECTS)), measures:JSON.parse(JSON.stringify(DEMO_MEASURES)), meta:null };
    }
    throw e; // a real project might exist server-side: don't hide the failure behind DEMO data
  }
  let wantedId = getProjectIdFromUrl() || localStorage.getItem(LS_LAST_PROJECT);
  if(wantedId && !list.some(p=>p.id===wantedId)) wantedId = null;
  if(!wantedId && list.length) wantedId = list[0].id;
  if(!wantedId){
    const created = await apiSave({ name:'Parcelle AE 101', objects:DEMO_OBJECTS, measures:DEMO_MEASURES });
    wantedId = created.id;
    list = await apiList();
  }
  const full = await apiLoad(wantedId); // a failure here also propagates rather than falling back to DEMO
  localStorage.setItem(LS_LAST_PROJECT, wantedId);
  return { apiAvailable:true, list, objects:full.objects, measures:full.measures||[], meta:full.meta };
}



function boot(seed){

// ================= Etat de l'application (spec §6.1) =================
// Un seul objet, cree ici, en tete de boot() : tout ce qui etait une variable libre de cette
// fermeture le rejoint au fil de la migration. `normalizeObjects` est passe en parametre parce
// qu'il vit encore dans ce fichier - core/ ne doit pas dependre de legacy (§3.3).
const etat = creerEtat(seed, normalizeObjects);

// Ce dont la barre de projet, l'actualisation cadastrale et le panneau PLU ont besoin. Fabrique a
// chaque appel : refreshProjectStatus est remplace apres coup par setupProjectBar, et une copie
// figee pointerait sur la version vide du debut.
function ctxProjet(){
  return {
    etat, apiDelete, apiSave, lieuActuel, markDirty, pushHistory, rebuildSelector,
    refreshProjectStatus: (...a)=>refreshProjectStatus(...a),
    render, restoreState, serializeMeasures, serializeObjects, syncBasculeVoisinage,
    syncLieuTitre, trouverParcelleCloture, withProjectParam,
    initialState: ()=>initialState,
    initialMeasures: ()=>initialMeasures,
    cleDernierProjet: LS_LAST_PROJECT,
    ouvrirDialogueActualisation: (b)=>ouvrirDialogueActualisation(b, ctxProjet()),
    actualiserDepuisIgn: (o,b)=>actualiserDepuisIgn(o, b, ctxProjet()),
    construireVoisinage,
    definirRafraichisseurStatut: (f)=>{ refreshProjectStatus = f; },
    contexteImport: ()=>({ apiSave, appliquerProjetImporte, withProjectParam, apiDisponible: seed.apiAvailable, cleDernierProjet: LS_LAST_PROJECT })
  };
}
// Etat d'affichage des parasols et du mode Terrasse. Ces variables sont restees ici quand le
// moteur est parti en phase 3 : elles decrivent ce que l'utilisateur regarde, pas un calcul.
// Les fonctions d'ombre les recoivent desormais en parametre (contexteSoleilParasol ci-dessous).
// parasol.ombreAffichee : dans `etat.parasol` (spec 6.1).
// parasol.carteAffichee : dans `etat.parasol` (spec 6.1).
// parasol.dateStr : dans `etat.parasol` (spec 6.1).
// parasol.minutes : dans `etat.parasol` (spec 6.1).

// Contexte solaire des parasols : ce que les fonctions d'ombre lisaient jusqu'ici directement dans
// la fermeture de boot(). Elles le recoivent maintenant en parametre (phase 3), et c'est ici qu'on
// le compose a partir des curseurs et du lieu de la parcelle.
function contexteSoleilParasol(){
  const lieu = lieuActuel();
  return { dateStr: etat.parasol.dateStr, minutes: etat.parasol.minutes, lieu: { latitude: lieu.latitude, longitude: lieu.longitude } };
}
// appMode : dans `etat` (spec 6.1).
// terrasseSelectedKey : dans `etat` (spec 6.1).


// ================= Undo history =================
const undoStack = new PileAnnulation();

function snapshotState(){
  // Full clone of every object AND of the measures list (reuses the same serializers as
  // project saving), not just a fixed set of fields on objects that still exist: undo needs
  // to be able to bring back a deleted object/measure or remove one that was added, not just
  // revert edited values in place. Measures live in a separate array from `objects`, so a
  // snapshot of objects alone would silently lose any measure add/remove/toggle on undo.
  return { objects: serializeObjects(etat.objects), measures: serializeMeasures(etat.measures) };
}
// dirty : dans `etat` (spec 6.1).
let refreshProjectStatus = function(){};
// Central "something changed" entry point. Anything that mutates persisted project data
// (object fields, construction params, measures, ...) should call this - directly, or via
// pushHistory()/mutate() below - so the "unsaved changes" indicator can never silently miss
// a change the way per-callsite `dirty = true` assignments used to.
function markDirty(){
  etat.dirty = true;
  refreshProjectStatus();
}
function pushHistory(){
  undoStack.empiler(snapshotState());

  updateUndoBtn();
  markDirty();
}
// Wraps a mutation with an automatic history snapshot + re-render, so callsites can't
// forget either step. Prefer this for new code; existing callsites keep calling
// pushHistory() + render() explicitly.
function mutate(fn){
  pushHistory();
  fn();
  render();
}
function restoreState(snapshot){
  // Full teardown + rebuild rather than patching fields on matching objects in place: the
  // previous approach looked up each object by key and only ever touched a fixed set of
  // fields, so it silently did nothing (or threw, for a deleted object) whenever the action
  // being undone/reset had added, deleted, reordered, or replaced whole objects.
  etat.objects.forEach(detruireVue);
  const restored = normalizeObjects(snapshot.objects);
  etat.objects.length = 0;
  restored.forEach(o=>{
    etat.objects.push(o);
    createObjectDOM(o);
    rebuildHandles(o);
  });
  reapplyStackingOrder();
  if(snapshot.measures){
    etat.measures = snapshot.measures.map(m=>({...m}));
  }
  if(!etat.objects.some(o=>o.key===etat.selectedKey)) etat.selectedKey = etat.objects.length ? etat.objects[0].key : null;
  rebuildSelector();
  renderMeasureResults();
  render();
  updateUndoBtn();
}
function undo(){
  if(undoStack.vide) return;
  const snapshot = undoStack.depiler();
  restoreState(snapshot);
}
function updateUndoBtn(){
  const b = document.getElementById('undoBtn');
  if(b) b.disabled = undoStack.vide;
}
window.addEventListener('keydown', e=>{
  if((e.ctrlKey||e.metaKey) && (e.key==='z' || e.key==='Z')){
    e.preventDefault();
    undo();
  }
});

// ================= Top-level panel tabs (Edition / Affichage / Mesure / Export) =================
// panelTab, selectedKey, highlight et attrTab vivent desormais dans `etat` (spec §6.1).
function rebuildPanelTabs(){
  const div = document.getElementById('panelTabs');
  div.innerHTML = '';
  [['edition','Édition'],['affichage','Affichage'],['mesure','Mesure'],['plu','PLU'],['export','Export']].forEach(([key,label])=>{
    const b = document.createElement('button');
    b.className = 'panelTabBtn' + (etat.panelTab===key ? ' active' : '');
    b.textContent = label;
    b.addEventListener('click', ()=>{
      etat.panelTab = key;
      document.getElementById('panelEdition').style.display = key==='edition' ? '' : 'none';
      document.getElementById('panelAffichage').style.display = key==='affichage' ? '' : 'none';
      document.getElementById('panelMesure').style.display = key==='mesure' ? '' : 'none';
      document.getElementById('panelPlu').style.display = key==='plu' ? '' : 'none';
      document.getElementById('panelExport').style.display = key==='export' ? '' : 'none';
      if(key==='mesure'){ rebuildMeasurePanel(); renderMeasureResults(); }
      if(key==='plu'){ renderPanneauPlu(ctxProjet()); }
      // La liste des terrasses du dossier se reconstruit a l'ouverture de l'onglet : une terrasse
      // ajoutee ou renommee entre-temps doit y figurer.
      if(key==='export'){ renderDossierTerrasses(); }
      rebuildPanelTabs();
    });
    div.appendChild(b);
  });
}
rebuildPanelTabs();

// Un quadrilatere deja d'equerre, meme tourne, est deja un rectangle : le redresser sur les axes
// n'aurait aucun sens et le ferait souvent sortir de la parcelle.
function dejaRectangle(pts, tolDeg){
  if(!pts || pts.length!==4) return false;
  const tol = tolDeg || 1;
  return pts.every((_,i)=>{
    const a=pts[(i-1+4)%4], b=pts[i], c=pts[(i+1)%4];
    const u={x:a.x-b.x,y:a.y-b.y}, v={x:c.x-b.x,y:c.y-b.y};
    const d = Math.hypot(u.x,u.y)*Math.hypot(v.x,v.y);
    if(d < 1e-9) return false;
    const ang = Math.acos(Math.max(-1,Math.min(1,(u.x*v.x+u.y*v.y)/d)))*180/Math.PI;
    return Math.abs(ang-90) <= tol;
  });
}

// ================= Color scheme (adapts SVG-drawn ink to system dark/light) =================









// ================= Object model =================
// Normalizes a plain-data objects array (from api.php, from DEMO_OBJECTS, or from an undo
// snapshot) the same way regardless of origin: clone points, and make sure every pts-based
// object has usable name/frozen arrays even if the source was missing some of them.
function normalizeObjects(raw){
  return raw.map(o=>{
    const c = {...o};
    if(c.type==='circle'){
      c.center = {x:c.center.x, y:c.center.y};
    } else {
      c.pts = c.pts.map(p=>({x:p.x,y:p.y}));
      c.vertexNames = c.vertexNames ? [...c.vertexNames] : c.pts.map((_,i)=>'Point '+(i+1));
      c.segmentNames = c.segmentNames ? [...c.segmentNames] : c.pts.map((_,i)=>'Cote '+(i+1));
      c.frozenVertices = (c.frozenVertices && c.frozenVertices.length===c.pts.length) ? [...c.frozenVertices] : c.pts.map(()=>false);
    }
    if(c.construction) c.construction = JSON.parse(JSON.stringify(c.construction));
    // Les metadonnees cadastre/BD TOPO/PLU sont des sous-objets : sans clone, un snapshot d'undo
    // et l'objet vivant partageraient la meme reference (et la geometrie source WGS84 avec).
    if(c.cadastre) c.cadastre = JSON.parse(JSON.stringify(c.cadastre));
    if(c.bdtopo) c.bdtopo = JSON.parse(JSON.stringify(c.bdtopo));
    if(c.plu) c.plu = JSON.parse(JSON.stringify(c.plu));
    if(c.ortho) c.ortho = JSON.parse(JSON.stringify(c.ortho));
    if(c.affichage) c.affichage = JSON.parse(JSON.stringify(c.affichage));
    return c;
  });
}
// objects : dans `etat`, construit par creerEtat qui appelle normalizeObjects (spec 6.1).
const initialState = JSON.parse(JSON.stringify(etat.objects));


// ================= Screen transform =================
// L'echelle et l'origine de la scene, regroupees dans un objet nomme (spec §6.1) : la
// transformation monde <-> ecran est desormais une donnee que l'on passe, et non deux variables
// libres que quarante endroits lisent et ecrivent sans le dire.
// La scene vit dans `etat.scene` : une seule transformation, partagee par le rendu et les
// interactions. Elle avait ete dupliquee ici par erreur lors du passage a l etat explicite.
// W et H : dans `etat.scene` (spec 6.1) - la taille utile de la scene.
function computeSize(){
  const margin = 40;
  etat.scene.W = Math.max(320, Math.min(window.innerWidth - margin, 1600));
  etat.scene.H = Math.max(420, Math.min(Math.round(window.innerHeight*0.62), 780));
}
computeSize();

function toScreen(p){ return versEcran(etat.scene, p); }
function toWorld(p){ return versMonde(etat.scene, p); }

// ================= Build SVG =================
const stage = document.getElementById('stage');
stage.style.width = etat.scene.W+'px'; stage.style.height = etat.scene.H+'px';
// svgNS : dans render/svg.ts
const svg = document.createElementNS(svgNS,'svg');
svg.setAttribute('width', etat.scene.W); svg.setAttribute('height', etat.scene.H);
stage.appendChild(svg);

// Pointe de fleche pour les points de vue (point + vecteur) : marker-end + orient="auto" suit
// nativement la tangente du trait, pas besoin de recalculer un angle a chaque deplacement.
const defs = document.createElementNS(svgNS,'defs');
defs.innerHTML = '<marker id="flecheVue" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto" markerUnits="userSpaceOnUse">' +
  '<path d="M0,0 L7,3 L0,6 Z" fill="#6b1f16"/></marker>';
svg.appendChild(defs);

// Fond orthophoto : sous la grille et sous tout le reste - c'est un calque de reference, il ne
// doit jamais masquer le trace du plan.
const orthoGroup = document.createElementNS(svgNS,'g');
orthoGroup.setAttribute('pointer-events','none');
svg.appendChild(orthoGroup);

const gridGroup = document.createElementNS(svgNS,'g');
svg.appendChild(gridGroup);
// La grille vit dans render/grille.ts ; cette enveloppe garde les appels existants inchanges.
function drawGrid(){ dessinerGrille(gridGroup, etat); }

// Ombre du parasol + carte de chaleur : juste au-dessus de la grille et SOUS tous les objets -
// une ombre qui masquerait la terrasse ou le mobilier qu'elle recouvre serait illisible.
const parasolGroup = document.createElementNS(svgNS,'g');
parasolGroup.setAttribute('pointer-events','none');
svg.appendChild(parasolGroup);
// Le pied du parasol, lui, doit rester lisible PAR-DESSUS la toile (translucide) - surtout en
// modele deporte, ou savoir ou tombe reellement le mat est tout l'interet. Ce groupe est donc
// remis en fin de svg a chaque rendu pour passer au premier plan.
const parasolMatGroup = document.createElementNS(svgNS,'g');
parasolMatGroup.setAttribute('pointer-events','none');
svg.appendChild(parasolMatGroup);

// "Fit to selection" button: zoom & center on the currently selected object
document.getElementById('fitBtn').addEventListener('click', ()=>{
  const obj = etat.objects.find(o=>o.key===(etat.appMode==='terrasse' ? etat.terrasseSelectedKey : etat.selectedKey));
  fitToObject(obj || null);
});



// Paint low-priority objects first so higher "Priorite d'affichage" ends up on top; ties
// keep the objects' array order (stable sort), which double-clicking an object still
// La fabrication des elements SVG d'un objet vit dans render/objects.ts ; ces enveloppes lui
// fournissent la racine, la scene, et ce que lui seul ne peut pas savoir : quel objet est
// selectionne, et comment passer des pixels aux metres.
function createObjectDOM(obj){ creerDomObjet(svg, obj, etat.scene); }
function rebuildHandles(obj){
  reconstruirePoignees(obj, {
    racine: svg,
    surDoubleClicCote(o, index, ev){
      if(o.key !== etat.selectedKey) return;
      const rect = stage.getBoundingClientRect();
      insertPointOnSegment(o, index, toWorld({x:ev.clientX-rect.left, y:ev.clientY-rect.top}));
      ev.preventDefault();
    }
  });
}

// adjusts (see sendObjectBackward below) to fine-tune stacking within the same priority.
function byPriority(a,b){ return (a.priority||0) - (b.priority||0); }
etat.objects.slice().sort(byPriority).forEach(createObjectDOM);

etat.objects.forEach(rebuildHandles);

// ================= Selector buttons =================
// Etat d'affichage lu des le premier rebuildSelector(), appele quelques lignes plus bas pendant
// le boot : ces declarations restent ICI et non dans les sections qui les pilotent, plus bas.
// Les ranger "pres de leur code" a deja provoque un plantage au chargement (zone morte
// temporelle) que le jeu de demonstration ne revelait pas.
// voisinageVisible : dans `etat` (spec 6.1).
// grilleVisible : dans `etat` (spec 6.1).

const selectorDiv = document.getElementById('selector');
// Un bouton par objet reste la selection la plus directe, mais un plan importe du cadastre en
// compte facilement 60 (les arbres estimes a eux seuls) : la rangee occupait alors la moitie de
// l'ecran. Les objets sont donc groupes par fonction, une seule famille depliee a la fois, et la
// liste elle-meme est bornee en hauteur.
// Filtre d'ouverture : le terrain. C'est la parcelle qu'on regarde en arrivant, et sur un plan
// cadastre les 60 autres boutons n'ont aucune raison d'occuper l'ecran avant qu'on les demande.
let selectorFiltre = 'terrain';
function rebuildSelector(){
  selectorDiv.innerHTML='';
  // Voisinage masque = voisinage absent du selecteur, categories comprises : proposer de
  // selectionner un objet qu'on ne voit pas n'a pas de sens, et les compteurs annonceraient un
  // plan qui n'est pas celui affiche. Un objet masque INDIVIDUELLEMENT (case du tableau
  // d'affichage) reste, lui, listee : c'est de la que l'on peut le demasquer.
  const objetsListables = etat.objects.filter(o=>!(o.voisinage && !etat.voisinageVisible));
  const familles = [];
  objetsListables.forEach(obj=>{
    const f = obj.fonction || 'autre';
    let fam = familles.find(x=>x.cle===f);
    if(!fam){ fam = {cle:f, objets:[]}; familles.push(fam); }
    fam.objets.push(obj);
  });
  // Le filtre courant peut avoir disparu (dernier objet de sa famille supprime, ou voisinage
  // masque) : on retombe sur "tout" plutot que d'afficher une rangee vide sans explication.
  if(selectorFiltre !== 'tout' && !familles.some(f=>f.cle===selectorFiltre)) selectorFiltre = 'tout';
  const objetSelectionne = objetsListables.find(o=>o.key===etat.selectedKey);

  // --- Niveau 1 : la categorie ---
  if(familles.length > 1){
    const rangeeFiltres = document.createElement('div');
    rangeeFiltres.className = 'selectorFamilles';
    const legende = document.createElement('span');
    legende.className = 'selectorLegende';
    legende.textContent = 'Catégorie';
    rangeeFiltres.appendChild(legende);
    const ajouterFiltre = (cle, libelle, n)=>{
      const b = document.createElement('button');
      b.className = 'objbtn fambtn' + (selectorFiltre===cle ? ' active' : '');
      b.appendChild(document.createTextNode(libelle));
      const compteur = document.createElement('span');
      compteur.className = 'fambtnN';
      compteur.textContent = n;
      b.appendChild(compteur);
      b.title = 'N\'afficher que : ' + libelle + ' (' + n + ')';
      b.addEventListener('click', ()=>{ selectorFiltre = cle; rebuildSelector(); });
      rangeeFiltres.appendChild(b);
    };
    ajouterFiltre('tout', 'Tout', objetsListables.length);
    familles.forEach(f=>ajouterFiltre(f.cle, LIBELLE_FONCTION[f.cle] || f.cle, f.objets.length));
    selectorDiv.appendChild(rangeeFiltres);
  }

  // --- Niveau 2 : selection courante a gauche, puis les objets de la categorie ---
  const rangee = document.createElement('div');
  rangee.className = 'selectorRangee';

  const chip = document.createElement('div');
  chip.className = 'selectorSelection' + (objetSelectionne ? '' : ' vide');
  const chipLeg = document.createElement('span');
  chipLeg.className = 'selectorSelectionFam';
  chipLeg.textContent = objetSelectionne
    ? (LIBELLE_FONCTION[objetSelectionne.fonction] || objetSelectionne.fonction || 'Objet')
    : 'Sélection';
  const chipNom = document.createElement('span');
  chipNom.className = 'selectorSelectionNom';
  chipNom.textContent = objetSelectionne ? objetSelectionne.name : 'aucune';
  chip.appendChild(chipLeg); chip.appendChild(chipNom);
  if(objetSelectionne){
    // La selection peut appartenir a une categorie qui n'est pas affichee : cliquer la pastille
    // bascule le filtre sur SA categorie, plutot que de laisser chercher ou elle est rangee.
    chip.title = 'Objet en cours d\'edition — clic : afficher sa catégorie';
    chip.addEventListener('click', ()=>{
      selectorFiltre = objetSelectionne.fonction || 'autre';
      rebuildSelector();
    });
  } else {
    chip.title = 'Aucun objet selectionne';
  }
  rangee.appendChild(chip);

  const liste = document.createElement('div');
  liste.className = 'selectorListe';
  // Strictement la categorie choisie : un objet hors filtre n'apparait pas dans la liste. Sa
  // selection reste lisible dans la pastille de gauche, qui ne bouge jamais.
  const visibles = selectorFiltre==='tout'
    ? objetsListables.slice()
    : objetsListables.filter(o=>(o.fonction||'autre')===selectorFiltre);
  visibles.forEach(obj=>{
    const b=document.createElement('button');
    b.className='objbtn'+(obj.key===etat.selectedKey?' active':'');
    b.textContent=obj.name;
    b.title = obj.name + (obj.fonction ? ' — ' + (LIBELLE_FONCTION[obj.fonction] || obj.fonction) : '');
    b.addEventListener('click', ()=>{ etat.selectedKey=obj.key; etat.highlight={type:null,index:null}; rebuildSelector(); render(); });
    liste.appendChild(b);
  });
  rangee.appendChild(liste);
  selectorDiv.appendChild(rangee);
}
rebuildSelector();


function bringToFront(obj){
  svg.appendChild(vue(obj).el);
  svg.appendChild(vue(obj).nameEl);
  amenerPoigneesDevant(obj);
}
// Les poignees seules, sans la forme. Selectionner un objet doit rendre ses poignees
// attrapables, pas le faire passer devant tout le monde : sinon la priorite d'affichage - qui
// est une fonction explicite du produit - est contredite des qu'on selectionne quelque chose,
// et le recul obtenu par double-tap est annule au clic suivant.
function amenerPoigneesDevant(obj){
  if(obj.type==='polygon' || obj.type==='path'){
    vue(obj).edgeEls.forEach(el=>svg.appendChild(el));
    vue(obj).segLabelEls.forEach(el=>svg.appendChild(el));
    vue(obj).pointEls.forEach(el=>svg.appendChild(el));
    vue(obj).ptLabelEls.forEach(el=>svg.appendChild(el));
  } else if(vue(obj).radiusHandle){
    svg.appendChild(vue(obj).radiusHandle);
  }
}

// Re-append every object's DOM elements in `objects` array order (later in the array =
// painted later = visually in front). Used after reordering the array itself.
function reapplyStackingOrder(){
  etat.objects.slice().sort(byPriority).forEach(bringToFront);
}

// Double-click on an object sends it one step back in the stacking order, so whatever
// was hidden underneath becomes visible/clickable. The parcel itself always stays at the
// very back and can't be pushed further.
// Since paint order is now sorted by "Priorite d'affichage" (see reapplyStackingOrder),
// priority is the authoritative coarse layering; double-click only fine-tunes stacking
// among objects that share the SAME priority as the one clicked (its raw array neighbour
// can belong to a different tier, where swapping array position would have no visible
// effect at all once re-sorted, which would make the double-click look broken).
function sendObjectBackward(obj){
  if(!obj || obj.key==='parcelle') return;
  const idx = etat.objects.indexOf(obj);
  let swapIdx = -1;
  for(let i=idx-1; i>=0; i--){
    if(etat.objects[i].key==='parcelle') continue;
    if((etat.objects[i].priority||0) === (obj.priority||0)){ swapIdx = i; break; }
  }
  if(swapIdx===-1) return; // already the backmost object within its own priority tier
  [etat.objects[swapIdx], etat.objects[idx]] = [etat.objects[idx], etat.objects[swapIdx]];
  // La selection est conservee : render() ne remonte plus que les poignees, donc le recul reste
  // visible et le geste est repetable sans devoir re-selectionner entre chaque.
  reapplyStackingOrder();
  rebuildSelector();
  render();
}


// Le dessin du calque parasol vit dans render/parasolOverlay.ts. La contrainte de position, elle,
// modifie les objets : elle reste ici et s'execute avant le dessin, comme avant.
function renderParasolOverlay(){
  if(etat.appMode !== 'plan'){ parasolGroup.innerHTML = ''; return; }
  contraindreParasols();
  dessinerCalqueParasols({
    groupeOmbres: parasolGroup, groupeMats: parasolMatGroup, racine: svg,
    etat, ctxSoleil: contexteSoleilParasol(), positionMat
  });
}


function positionMat(par){
  if(!par.matDeporte) return { x: par.center.x, y: par.center.y };
  const a = matAngleDe(par) * Math.PI/180;
  return { x: par.center.x + par.r*Math.cos(a), y: par.center.y + par.r*Math.sin(a) };
}
// Decalage centre-de-toile -> mat, utile pour repositionner la toile a partir d'un pied impose.
function decalageMat(par){
  if(!par.matDeporte) return { x:0, y:0 };
  const a = matAngleDe(par) * Math.PI/180;
  return { x: par.r*Math.cos(a), y: par.r*Math.sin(a) };
}
// Point du bord du polygone le plus proche de pt (projection sur chaque segment, on garde le
// meilleur) - sert a coller le pied du parasol sur le pourtour de la terrasse.
function projeterSurPerimetre(pt, poly){
  let best = null, bestD2 = Infinity;
  for(let i=0, j=poly.length-1; i<poly.length; j=i++){
    const ax=poly[j].x, ay=poly[j].y, bx=poly[i].x, by=poly[i].y;
    const ex=bx-ax, ey=by-ay;
    const L2 = ex*ex+ey*ey;
    let t = L2 ? ((pt.x-ax)*ex + (pt.y-ay)*ey)/L2 : 0;
    t = Math.max(0, Math.min(1, t));
    const px=ax+t*ex, py=ay+t*ey;
    const d2 = (pt.x-px)*(pt.x-px) + (pt.y-py)*(pt.y-py);
    if(d2 < bestD2){ bestD2 = d2; best = {x:px, y:py}; }
  }
  return best;
}
// Applique la contrainte "pied en bordure" : on projette le PIED (pas le centre de la toile) sur le
// pourtour, puis on redonne a la toile la position correspondante. Appele a chaque rendu, donc la
// contrainte tient aussi pendant un glisser - l'objet suit le curseur en restant colle au bord.
function contraindreParasols(){
  etat.objects.forEach(par=>{
    if(par.fonction!=='parasol' || !par.matSurPerimetre) return;
    const terr = terrasseDuParasol(par, etat.objects, etat.terrasseSelectedKey);
    if(!terr || !terr.pts || terr.pts.length<3) return;
    const mat = positionMat(par);
    const cible = projeterSurPerimetre(mat, terr.pts);
    if(!cible) return;
    par.center.x += cible.x - mat.x;
    par.center.y += cible.y - mat.y;
  });
}

function render(){
  placerOrthophoto();
  drawGrid();
  renderParasolOverlay();
  // In Mode Terrasse the plan is a backdrop for the layer overlay, not something being edited:
  // the selection handles and vertex labels would sit on top of the vis and solives and make
  // the canevas unreadable. The choice made in Mode Plan is kept, just not drawn here.
  const activeSel = (etat.appMode==='terrasse') ? null : etat.selectedKey;
  if(activeSel && activeSel !== 'parcelle'){
    const sel = etat.objects.find(o=>o.key===activeSel);
    if(sel) amenerPoigneesDevant(sel);
  }

  // Le positionnement d'un objet vit dans render/objects.ts. Ce qui reste ici est ce que lui
  // seul ne peut pas savoir : la selection courante, le masquage, l'etat du fond orthophoto et
  // le pointage en cours pour l'outil de mesure.
  etat.objects.forEach(obj=>{
    positionnerObjet(obj, {
      scene: etat.scene,
      selectionnee: obj.key === activeSel,
      masque: objetMasque(obj),
      ortho: { actif: orthoActif, parcelleOpacite: orthoParcelleOpacite },
      estTerrain,
      pointageSommets: !!(pickState && pickState.mode === 'target'),
      pointageCotes: !!(pickState && pickState.mode === 'ref'),
      reconstruirePoignees: rebuildHandles
    });
  });

  // ---- surfaces: computed on demand in the "Objet" tab (see renderAttrTable) ----

  renderAttrTable();
  renderDispTable();
  drawScaleBar();
  drawNorthArrow();
  drawMeasures();
  if(etat.panelTab==='mesure') renderMeasureResults();

  // show the "fit to selection" button only when an object is selected
  const fitBtn = document.getElementById('fitBtn');
  if(fitBtn) fitBtn.style.display = etat.selectedKey ? 'block' : 'none';

  // Mode Terrasse's construction overlay is drawn in screen space (toScreen), same as
  // everything else here: without this, panning/zooming the plan moves the real shapes
  // but leaves the vis/solives/lambourdes/lames overlay stuck at its old screen position.
  if(etat.appMode==='terrasse'){
    const terrasseObj = etat.objects.find(o=>o.key===etat.terrasseSelectedKey);
    if(terrasseObj) renderTerrasseLayerView(terrasseObj);
  }
}

// ================= Attribute table for selected object =================
// L'edition par cote et par angle vit dans interaction/editing.ts ; ces enveloppes fournissent le
// contour de contrainte, que le module ne va plus chercher lui-meme.
function applyAngleEdit(obj, i, newAngleDeg){
  return editerAngle(obj, i, newAngleDeg, contourDeContrainte(etat.objects, obj));
}
function applyLengthEdit(obj, i, newLen){
  return editerLongueur(obj, i, newLen, contourDeContrainte(etat.objects, obj));
}


function interiorAngleDeg(obj, i){
  const n = obj.pts.length;
  const prev = obj.pts[(i-1+n)%n], cur = obj.pts[i], next = obj.pts[(i+1)%n];
  const u = {x:prev.x-cur.x, y:prev.y-cur.y};
  const v = {x:next.x-cur.x, y:next.y-cur.y};
  let a = (Math.atan2(v.y,v.x) - Math.atan2(u.y,u.x)) * 180/Math.PI;
  a = ((a % 360) + 360) % 360;
  const ccw = signedArea(obj.pts) > 0;
  return ccw ? (360 - a) : a;
}




// Le type geometrique brut (Chemin) ne dit rien d'utile pour un point de vue - il est
// techniquement un chemin a 2 points, mais personne ne le pense comme "un chemin". Fonction prime
// sur type des qu'elle donne un nom plus parlant ; sinon on retombe sur le type geometrique.
function libelleTypeObjet(obj){
  if(obj.fonction==='camera') return 'Point de vue';
  if(obj.fonction==='parasol') return 'Parasol';
  return obj.type==='polygon' ? 'Polygone' : (obj.type==='path' ? 'Chemin' : 'Cercle');
}

// Le panneau d'attributs vit dans ui/attrPanel.ts ; cette enveloppe lui fournit l'etat et tout
// ce qu'il doit pouvoir declencher.
function renderAttrTable(){
  renderAttrTablePanneau(etat, {
    alignObjectByRotation, allerAuPointDeVue, applyAngleEdit, applyLengthEdit, buildThreeScene,
    contexteSoleilParasol, dejaRectangle, deleteVertex, elevationOf, interiorAngleDeg,
    libelleTypeObjet, markDirty, measureSegCoords, pushHistory, reapplyStackingOrder,
    rebuildHandles, rebuildSelector, refLabel, render, renderAttrTable, startPick,
    pickState: ()=>pickState,
    vue3dOuverte: ()=>vue3d.scene
  });
}


// ================= Display toggle table per object =================
function renderDispTable(){
  const tbl = document.getElementById('dispTable');
  const cols = [
    {field:'showName', label:'Nom'},
    {field:'showSegNames', label:'Nom segment'},
    {field:'showVertNames', label:'Nom coin'},
    {field:'showDims', label:'Dimension'},
    {field:'showAngles', label:'Angle'}
  ];
  // Chaque case appelle render(), qui rappelle cette fonction : tout reconstruire detachait du
  // DOM la case qu'on venait de cocher, et le focus clavier repartait au debut de la page. Tant
  // que la liste d'objets ne bouge pas, on se contente donc de remettre les cases a jour.
  const signature = JSON.stringify(etat.objects.map(o=>[o.key, o.name]));
  if(tbl.dataset.signature === signature && tbl.rows.length === etat.objects.length + 1){
    etat.objects.forEach((obj,i)=>{
      const cells = tbl.rows[i+1].cells;
      const cbHide = cells[1].firstChild;
      if(cbHide) cbHide.checked = !!obj.hidden;
      cols.forEach((col,c)=>{
        const cb = cells[c+2].firstChild;
        if(cb) cb.checked = !!obj[col.field];
      });
    });
    return;
  }
  tbl.dataset.signature = signature;
  tbl.innerHTML = '';
  const head = document.createElement('tr');
  const th0 = document.createElement('th'); th0.textContent='Objet'; head.appendChild(th0);
  // A part des autres : coche = masque (les colonnes showX sont l'inverse, coche = affiche), donc
  // une colonne a elle seule pour que le sens ne se melange jamais avec le reste de la ligne.
  const thHide = document.createElement('th');
  thHide.textContent = 'Masqué';
  thHide.style.cursor = 'pointer';
  thHide.title = "Cliquer pour masquer/afficher tous les objets";
  thHide.addEventListener('click', ()=>{
    const allHidden = etat.objects.every(o=>o.hidden);
    etat.objects.forEach(o=>{ o.hidden = !allHidden; });
    markDirty();
    render();
  });
  head.appendChild(thHide);
  cols.forEach(col=>{
    const th = document.createElement('th');
    th.textContent = col.label;
    th.style.cursor = 'pointer';
    th.title = "Cliquer pour appliquer a tous les objets";
    th.addEventListener('click', ()=>{
      const allChecked = etat.objects.every(o=>o[col.field]);
      const newVal = !allChecked;
      etat.objects.forEach(o=>{ o[col.field] = newVal; });
      markDirty();
      render();
    });
    head.appendChild(th);
  });
  tbl.appendChild(head);

  etat.objects.forEach(obj=>{
    // On retient la cle, pas l'objet : les lignes survivent maintenant a un render(), et un
    // restoreState() remplace les objets par des copies. Capturer `obj` ferait ecrire les cases
    // dans des objets detaches du plan.
    const cle = obj.key;
    const cible = ()=>etat.objects.find(o=>o.key === cle);
    const tr=document.createElement('tr');
    const td0=document.createElement('td'); td0.textContent=obj.name;
    tr.appendChild(td0);
    const tdHide = document.createElement('td');
    const cbHide = document.createElement('input'); cbHide.type='checkbox'; cbHide.checked=!!obj.hidden;
    cbHide.title = 'Masquer cet objet sur le plan et en Vue 3D (reste modifiable via la barre laterale)';
    cbHide.addEventListener('change', ()=>{ const o=cible(); if(!o) return; o.hidden = cbHide.checked; markDirty(); render(); });
    tdHide.appendChild(cbHide);
    tr.appendChild(tdHide);
    cols.forEach(col=>{
      const td=document.createElement('td');
      const cb=document.createElement('input'); cb.type='checkbox'; cb.checked=obj[col.field];
      cb.addEventListener('change', ()=>{ const o=cible(); if(!o) return; o[col.field]=cb.checked; markDirty(); render(); });
      td.appendChild(cb);
      tr.appendChild(td);
    });
    tbl.appendChild(tr);
  });
}

// ---- North arrow (fixed screen position, toggleable) ----
// showNorth : dans `etat` (spec 6.1).
const northGroup = document.createElementNS(svgNS,'g');
svg.appendChild(northGroup);

// ---- Scale bar ----
const scaleGroup = document.createElementNS(svgNS,'g');
svg.appendChild(scaleGroup);
// Les deux dessins de repere vivent dans render/decor.ts ; ces enveloppes gardent les appels
// existants inchanges tant que render() n'est pas sorti a son tour.
function drawNorthArrow(){ dessinerFlecheNord(northGroup, etat); }
function drawScaleBar(){ dessinerEchelle(scaleGroup, etat); }

// ================= Interaction =================
let activeDrag = null;
let lastEdgeClick = {key:null, index:null, time:0};
let lastPointClick = {key:null, index:null, time:0};
let lastObjClick = {key:null, time:0, x:0, y:0};
function worldFromEvent(e){
  const rect = stage.getBoundingClientRect();
  return toWorld({x:e.clientX-rect.left, y:e.clientY-rect.top});
}
function objByKey(key){ return etat.objects.find(o=>o.key===key); }

svg.addEventListener('pointerdown', e=>{
  const ds = e.target.dataset;
  // Mode Terrasse is read-only over the plan geometry (construction config lives in its
  // own panel): block shape/point/edge/radius interaction, but let a blank-background
  // pointerdown fall through so pan still works.
  if(etat.appMode==='terrasse' && ds && ds.role){ e.preventDefault(); return; }

  // ---- Measurement tool / Alignment tool: intercept clicks while picking a reference segment / target point(s) ----
  if(pickState){
    if(pickState.mode==='ref' && ds && ds.role==='edge'){
      const picked = {objKey:ds.key, segIndex:parseInt(ds.index,10)};
      if(pickState.purpose==='align'){
        definirCibleAlignement(picked);
        pickState = null;
        renderAttrTable(); render();
      } else {
        draftRef = picked;
        pickState = null;
        rebuildMeasurePanel(); render();
      }
      e.preventDefault();
      return;
    }
    if(pickState.mode==='target'){
      let t = null;
      if(ds && ds.role==='point'){
        t = {objKey:ds.key, ptIndex:parseInt(ds.index,10)};
      } else if(ds && ds.role==='obj'){
        const tobj = etat.objects.find(o=>o.key===ds.key);
        if(tobj && tobj.type==='circle') t = {objKey:ds.key, ptIndex:0};
      }
      if(t){
        if(pickState.multi){
          const i = draftTargets.findIndex(x=>x.objKey===t.objKey && x.ptIndex===t.ptIndex);
          if(i>=0) draftTargets.splice(i,1); else draftTargets.push(t);
          rebuildMeasurePanel(); render();
        } else {
          draftTargets = [t];
          pickState = null;
          rebuildMeasurePanel(); render();
        }
        e.preventDefault();
        return;
      }
    }
    // clicked something irrelevant while picking (e.g. background): swallow the click,
    // don't fall through to normal editing/pan behaviour
    e.preventDefault();
    return;
  }

  if(!ds || !ds.role){
    // click/drag on empty background (grid, or blank stage area): pan the view
    const rect = stage.getBoundingClientRect();
    activeDrag = {type:'pan', startScreen:{x:e.clientX-rect.left, y:e.clientY-rect.top}, startOrigin:{...etat.scene.origine}};
    e.preventDefault();
    return;
  }
  const w = worldFromEvent(e);

  // Sur tactile, le doigt couvre plusieurs dizaines de pixels et les zones de capture des aretes
  // font 16 px de large : le second tap d'un double-tap atterrit tres souvent sur une arete ou
  // une poignee de la meme forme, jamais sur son interieur. Le double-tap objet ne se
  // declenchait donc pas du tout au doigt. On l'accepte ici quel que soit l'element touche, a
  // condition que le tap precedent ait vise le corps du MEME objet et au meme endroit - c'est ce
  // test de proximite qui evite de confondre avec un double-tap d'arete (insertion de point).
  if(e.pointerType === 'touch' && ds.key && ds.key === lastObjClick.key &&
     (Date.now() - lastObjClick.time) < 600 &&
     Math.hypot(e.clientX - lastObjClick.x, e.clientY - lastObjClick.y) < 35){
    lastObjClick = {key:null, time:0, x:0, y:0};
    lastEdgeClick = {key:null, index:null, time:0};
    lastPointClick = {key:null, index:null, time:0};
    sendObjectBackward(objByKey(ds.key));
    e.preventDefault();
    return;
  }

  if(ds.role === 'obj'){
    const key = ds.key;
    const nowObj = Date.now();
    // A tap-based double-tap is physically slower than a mouse double-click (lift + re-touch
    // the finger vs. a spring-loaded button), so it very often misses a window tuned for mice.
    const dblWindow = e.pointerType==='touch' ? 600 : 400;
    // Au doigt, deux taps eloignes sur la meme forme ne sont pas un double-tap : c'est un
    // deplacement d'intention. La souris, elle, ne saute pas entre deux clics.
    const memeEndroit = e.pointerType!=='touch' ||
      Math.hypot(e.clientX-lastObjClick.x, e.clientY-lastObjClick.y) < 35;
    if(lastObjClick.key===key && (nowObj-lastObjClick.time)<dblWindow && memeEndroit){
      // rapid second click on the same object: send it backward instead of
      // selecting/dragging (native dblclick can't be used here since preventDefault()
      // further down in this same handler, for the drag-start case, suppresses it)
      lastObjClick = {key:null, time:0, x:0, y:0};
      const objDbl = objByKey(key);
      sendObjectBackward(objDbl);
      e.preventDefault();
      return;
    }
    lastObjClick = {key, time:nowObj, x:e.clientX, y:e.clientY};
    if(key !== etat.selectedKey){
      etat.selectedKey = key; etat.highlight = {type:null, index:null}; rebuildSelector(); render();
      e.preventDefault();
      return;
    }
    const obj = objByKey(key);
    if(obj.locked) return; // locked: selectable/viewable but not movable
    etat.highlight = {type:null, index:null};
    const rect0 = stage.getBoundingClientRect();
    pushHistory();
    if(obj.type==='circle'){
      activeDrag = {type:'circleMove', obj, startWorld:w, startCenter:{...obj.center}, startScreen:{x:e.clientX-rect0.left,y:e.clientY-rect0.top}, moved:false};
    } else {
      activeDrag = {type:'shapeMove', obj, startWorld:w, startPts: obj.pts.map(p=>({...p})), startScreen:{x:e.clientX-rect0.left,y:e.clientY-rect0.top}, moved:false};
    }
  } else if(ds.role === 'point'){
    if(ds.key !== etat.selectedKey) return;
    const obj = objByKey(ds.key); const idx=parseInt(ds.index,10);
    if(obj.locked) return;
    const nowTp = Date.now();
    if(lastPointClick.key===ds.key && lastPointClick.index===idx && (nowTp-lastPointClick.time)<400){
      lastPointClick = {key:null, index:null, time:0};
      pushHistory();
      obj.frozenVertices[idx] = !obj.frozenVertices[idx];
      render();
      e.preventDefault();
      return;
    }
    lastPointClick = {key:ds.key, index:idx, time:nowTp};
    // Un coin gele ne bouge pas, SAUF en mode rectangle ou il redimensionne la forme entiere.
    if(obj.frozenVertices[idx] && !estRectangle(obj)) return;
    etat.highlight = {type:'vertex', index:idx};
    etat.attrTab = 'angles';
    pushHistory();
    activeDrag = {type:'point', obj, idx, startWorld:w, startPt:{...obj.pts[idx]}};
  } else if(ds.role === 'edge'){
    if(ds.key !== etat.selectedKey) return;
    const obj = objByKey(ds.key); const i=parseInt(ds.index,10); const n=obj.pts.length; const j=(i+1)%n;
    if(obj.locked) return;
    const nowT = Date.now();
    if(lastEdgeClick.key===ds.key && lastEdgeClick.index===i && (nowT-lastEdgeClick.time)<400){
      lastEdgeClick = {key:null, index:null, time:0};
      insertPointOnSegment(obj, i, w);
      e.preventDefault();
      return;
    }
    lastEdgeClick = {key:ds.key, index:i, time:nowT};
    // Idem pour un cote : gele = fixe, sauf en mode rectangle ou il se translate.
    if((obj.frozenVertices[i] || obj.frozenVertices[j]) && !estRectangle(obj)) return;
    etat.highlight = {type:'segment', index:i};
    etat.attrTab = 'segments';
    pushHistory();
    activeDrag = {type:'edge', obj, i, j, startWorld:w, startA:{...obj.pts[i]}, startB:{...obj.pts[j]}};
  } else if(ds.role === 'radius'){
    if(ds.key !== etat.selectedKey) return;
    const obj = objByKey(ds.key);
    if(obj.locked) return;
    etat.highlight = {type:null, index:null};
    pushHistory();
    activeDrag = {type:'radius', obj, startWorld:w, startR:obj.r};
  }
  if(activeDrag) e.preventDefault();
  render();
});

window.addEventListener('pointermove', e=>{
  if(!activeDrag) return;

  // Le deplacement de la vue n'est pas un glisser d'objet : il ecrit dans la scene, pas dans le
  // plan, et passe donc par interaction/navigation.ts.
  if(activeDrag.type === 'pan'){
    const rect = stage.getBoundingClientRect();
    const cur = {x:e.clientX-rect.left, y:e.clientY-rect.top};
    etat.scene = deplacer(etat.scene, activeDrag.startOrigin, activeDrag.startScreen, cur);
    render();
    return;
  }

  // Tout le calcul du glisser vit dans interaction/drag.ts ; ici, la position du pointeur en
  // metres et le contour dans lequel l'objet doit rester.
  appliquerGlisser(activeDrag, worldFromEvent(e), contourDeContrainte(etat.objects, activeDrag.obj));
  render();
});
window.addEventListener('pointerup', ()=>{
  if(activeDrag && (activeDrag.type==='shapeMove' || activeDrag.type==='circleMove') && !activeDrag.moved){
    // plain click (no drag) on the already-selected object's fill: toggle deselect
    etat.selectedKey = null;
    rebuildSelector();
    render();
  }
  activeDrag=null;
});
window.addEventListener('pointercancel', ()=>{ activeDrag=null; });

// ================= Add point (via double-click on an edge; see insertPointOnSegment below) =================


function insertPointOnSegment(obj, segIndex, clickWorld){
  if(obj.locked) return;
  // Point de vue : exactement 2 points (position, direction) - un 3e casserait la lecture
  // point+vecteur (quel bout regarderait quoi ?), donc jamais d'ajout ici.
  if(obj.fonction==='camera') return;
  const n = obj.pts.length;
  const a = obj.pts[segIndex], b = obj.pts[(segIndex+1)%n];
  const newPt = projectOntoSegment(clickWorld, a, b);
  const bound = contourDeContrainte(etat.objects, obj);
  if(bound && !pointInPolygon(newPt, bound)) return;
  pushHistory();
  insererSommet(obj, segIndex, clickWorld);
  rebuildHandles(obj);
  render();
}

function deleteVertex(obj, idx){
  if(obj.locked) return;
  if(obj.pts.length <= minimumSommets(obj.type)) return; // keep at least a valid shape
  pushHistory();
  supprimerSommet(obj, idx);
  rebuildHandles(obj);
  render();
}

// ================= Zoom & pan =================
// Belt-and-suspenders for mobile: touch-action:none via CSS is not always honored
// reliably by every mobile browser/version, so also block the native touch gesture
// directly at the event level. This is the standard pattern used by drawing/CAD apps.
// Skip this for real controls living inside #stage (e.g. #fitBtn): preventDefault()
// on a touch event suppresses the synthetic click that would normally follow on iOS,
// which otherwise makes those buttons silently do nothing on iPhone/iPad.
stage.addEventListener('touchstart', e=>{ if(e.target.closest('button')) return; e.preventDefault(); }, {passive:false});
stage.addEventListener('touchmove', e=>{ if(e.target.closest('button')) return; e.preventDefault(); }, {passive:false});
stage.addEventListener('touchend', e=>{ if(e.target.closest('button')) return; e.preventDefault(); }, {passive:false});

// Le calcul du zoom vit dans interaction/navigation.ts ; ici, seul le cablage.
svg.addEventListener('wheel', e=>{
  e.preventDefault();
  const rect = stage.getBoundingClientRect();
  etat.scene = zoomMolette(etat.scene, {x:e.clientX-rect.left, y:e.clientY-rect.top}, e.deltaY);
  render();
}, {passive:false});

const activePointers = new Map();
let pinchState=null, panState=null;
function stageRel(e){ const r=stage.getBoundingClientRect(); return {x:e.clientX-r.left, y:e.clientY-r.top}; }
// midOf vit dans interaction/navigation.ts sous le nom milieuDe.
stage.addEventListener('pointerdown', e=>{
  activePointers.set(e.pointerId, stageRel(e));
  if(activePointers.size===2){
    activeDrag=null;
    const arr=[...activePointers.values()];
    pinchState = debutPincement(etat.scene, arr[0], arr[1]);
    panState=null;
  } else if(activePointers.size===3){
    activeDrag=null; pinchState=null;
    const arr=[...activePointers.values()];
    panState = { avg0: milieuDe(arr), origin0: { ...etat.scene.origine } };
  } else if(activePointers.size>3){ pinchState=null; panState=null; }
});
window.addEventListener('pointermove', e=>{
  if(!activePointers.has(e.pointerId)) return;
  activePointers.set(e.pointerId, stageRel(e));
  if(activePointers.size===2 && pinchState){
    const arr=[...activePointers.values()];

    etat.scene = pincer(etat.scene, pinchState, arr[0], arr[1]);

    render();
  } else if(activePointers.size===3 && panState){
    const arr=[...activePointers.values()];
    const avg=milieuDe(arr);
    etat.scene = deplacer(etat.scene, panState.origin0, panState.avg0, avg);
    render();
  }
});
function clearMulti(e){
  activePointers.delete(e.pointerId);
  if(activePointers.size<2) pinchState=null;
  if(activePointers.size<3) panState=null;
}
window.addEventListener('pointerup', clearMulti);
window.addEventListener('pointercancel', clearMulti);

// ================= Responsive resize =================
let resizeTimer = null;
window.addEventListener('resize', ()=>{
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(()=>{
    const oldW = etat.scene.W, oldH = etat.scene.H;
    const centerWorldBefore = toWorld({x:oldW/2, y:oldH/2});
    computeSize();
    stage.style.width = etat.scene.W+'px'; stage.style.height = etat.scene.H+'px';
    svg.setAttribute('width', etat.scene.W); svg.setAttribute('height', etat.scene.H);
    etat.scene.origine = {
      x: etat.scene.W/2 - centerWorldBefore.x*etat.scene.scale,
      y: etat.scene.H/2 + centerWorldBefore.y*etat.scene.scale
    };
    render();
  }, 150);
});

// ================= Reset / Export =================
document.getElementById('undoBtn').addEventListener('click', undo);
// `addEventListener(..., addNewObject)` passerait l'evenement en premier argument, donc un objet
// toujours truthy : le polygone libre serait cree en mode rectangle. D'ou les fleches explicites.
document.getElementById('addObjBtn').addEventListener('click', ()=>addNewObject(false));
document.getElementById('addRectBtn').addEventListener('click', ()=>addNewObject(true));
document.getElementById('addPathBtn').addEventListener('click', addNewPath);
document.getElementById('addCircleBtn').addEventListener('click', addNewCircle);
document.getElementById('addParasolBtn').addEventListener('click', addNewParasol);
document.getElementById('addViewpointBtn').addEventListener('click', addNewViewpoint);
document.getElementById('dupObjBtn').addEventListener('click', duplicateSelectedObject);
document.getElementById('delObjBtn').addEventListener('click', deleteSelectedObject);
// Le double-tap est un geste fragile au doigt sur une petite forme : le bouton fait la meme
// chose de facon fiable, et rend la fonction decouvrable.
document.getElementById('backObjBtn').addEventListener('click', ()=>{
  const obj = objByKey(etat.selectedKey);
  if(!obj){ showToast('Selectionne d\'abord un objet.'); return; }
  if(obj.key==='parcelle'){ showToast('La parcelle reste toujours au fond.'); return; }
  pushHistory();
  const avant = etat.objects.indexOf(obj);
  sendObjectBackward(obj);
  if(etat.objects.indexOf(obj) === avant) showToast('Deja au fond de sa priorite d\'affichage.');
});
document.getElementById('resetPosBtn').addEventListener('click', ()=>{
  const obj = objByKey(etat.selectedKey);
  if(!obj){ showToast('Selectionne d\'abord un objet.'); return; }
  const init = initialState.find(o=>o.key===etat.selectedKey);
  if(!init){ showToast('Aucune position initiale enregistree pour cet objet (il a ete cree apres le chargement).'); return; }
  pushHistory();
  if(obj.type==='circle'){
    obj.center = {...init.center};
  } else {
    const initC = centroid(init.pts);
    const curC = centroid(obj.pts);
    const d = {x:initC.x-curC.x, y:initC.y-curC.y};
    obj.pts.forEach(p=>{ p.x+=d.x; p.y+=d.y; });
  }
  render();
});

document.getElementById('resetBtn').addEventListener('click', ()=>{
  // Full restore from the reference snapshot taken at load time (same mechanism as undo),
  // instead of copying a hand-picked subset of fields onto objects that still exist: that
  // approach silently left elevation/altitude/textures/construction/cloture/parasol/GPS
  // untouched, never removed objects added after load, and never brought back objects
  // deleted after load. Measures are reset too, for the same "reset means reset" reason.
  // Ce bouton efface d'un clic tout le travail fait depuis le chargement, mesures comprises :
  // il demande confirmation comme le vidage des mesures, qui n'en est qu'une partie.
  showConfirm('Reinitialiser tout le plan ? Les objets et les mesures reviennent a leur etat du chargement (annulable par Ctrl+Z).', ()=>{
    pushHistory();
    restoreState({ objects: initialState, measures: initialMeasures });
  });
});

document.getElementById('chkNorth').addEventListener('change', e=>{ etat.showNorth = e.target.checked; render(); });
document.getElementById('chkVoisinage').addEventListener('change', function(){
  etat.voisinageVisible = this.checked;
  // Editer un objet qu'on vient de masquer n'aurait pas de sens : la selection revient sur la
  // parcelle (a defaut, le premier objet reste visible).
  if(!etat.voisinageVisible){
    const sel = etat.objects.find(o=>o.key === etat.selectedKey);
    if(sel && sel.voisinage){
      const repli = etat.objects.find(o=>o.key === 'parcelle') || etat.objects.find(o=>!o.voisinage);
      etat.selectedKey = repli ? repli.key : null;
      etat.highlight = {type:null, index:null};
    }
  }
  enregistrerAffichage();
  rebuildSelector();
  render();
  // La 3D batit sa scene a partir des objets visibles : il faut la reconstruire, pas seulement
  // la redessiner.
  if(vue3d.scene) buildThreeScene(etat.objects.find(o=>o.key===etat.terrasseSelectedKey) || null);
});
document.getElementById('gridBtn').addEventListener('click', ()=>{
  etat.grilleVisible = !etat.grilleVisible;
  syncBasculeGrille();
  enregistrerAffichage();
  render();
});
document.getElementById('chkOrtho').addEventListener('change', e=>{ basculerOrthophoto(e.target.checked); });
document.getElementById('orthoOpacite').addEventListener('input', function(){
  orthoOpacite = parseInt(this.value,10)/100;
  document.getElementById('orthoOpaciteTexte').textContent = this.value + ' %';
  if(orthoActif) placerOrthophoto();
  enregistrerConfigOrtho();
});
document.getElementById('orthoParcelleOpacite').addEventListener('input', function(){
  orthoParcelleOpacite = parseInt(this.value,10)/100;
  document.getElementById('orthoParcelleOpaciteTexte').textContent = this.value + ' %';
  // Seul l'affichage change : render() reapplique l'opacite effective sur les terrains.
  if(orthoActif) render();
  enregistrerConfigOrtho();
});
document.getElementById('orthoParcelleDefaut').addEventListener('click', function(){
  orthoParcelleOpacite = ORTHO_PARCELLE_OPACITE_CONSEILLEE;
  syncControlesOrtho();
  if(orthoActif) render();
  enregistrerConfigOrtho();
});

// ================= Add / delete whole object =================
// newObjCounter : dans `etat` (spec 6.1).
// `enRectangle` cree la forme avec le mode rectangle deja arme : les quatre angles sont tenus a
// 90 degres des le depart, et tirer un coin redimensionne au lieu de deformer. C'est le cas de
// loin le plus courant (terrasse, dalle, abri) et il evitait jusqu'ici d'aller cocher la case.
function addNewObject(enRectangle){
  pushHistory();
  const pc = etat.objects.find(o=>o.key==='parcelle');
  const c = pc ? centroid(pc.pts) : {x:0, y:0};
  const key = 'obj' + Date.now() + '_' + (etat.newObjCounter++);
  const demiL = enRectangle ? 1.5 : 1.0;   // 3 x 2 m, pour qu'on voie que c'est un rectangle
  const demiH = 1.0;
  const newObj = {
    key, type:'polygon', name: enRectangle ? 'Nouveau rectangle' : 'Nouvel objet',
    fill:'#8fb3d9', fillOpacity:0.75, stroke:'#2a4d6e',
    pts:[
      {x:c.x-demiL,y:c.y-demiH},{x:c.x+demiL,y:c.y-demiH},
      {x:c.x+demiL,y:c.y+demiH},{x:c.x-demiL,y:c.y+demiH}
    ],
    vertexNames:['Coin 1','Coin 2','Coin 3','Coin 4'],
    segmentNames:['Cote 1','Cote 2','Cote 3','Cote 4'],
    frozenVertices: enRectangle ? [true,true,true,true] : [false,false,false,false],
    showName:true, showSegNames:false, showVertNames:false, showDims:true, showAngles:false,
    constrained:true, fonction:'autre', matiere:'', priority:2, locked:false
  };
  etat.objects.push(newObj);
  createObjectDOM(newObj);
  rebuildHandles(newObj);
  reapplyStackingOrder();
  etat.selectedKey = key;
  // Sur un rectangle on ouvre l'onglet Objet : c'est la que se trouve la case du mode, donc
  // celle qu'il faudra decocher pour reprendre la main sur les angles.
  etat.attrTab = enRectangle ? 'objet' : 'segments';
  rebuildSelector();
  render();
}

function addNewPath(){
  pushHistory();
  const pc = etat.objects.find(o=>o.key==='parcelle');
  const c = pc ? centroid(pc.pts) : {x:0, y:0};
  const key = 'path' + Date.now() + '_' + (etat.newObjCounter++);
  const newObj = {
    key, type:'path', name:'Nouveau chemin', fill:'#c9a15a', fillOpacity:1, stroke:'#c9a15a',
    pts:[ {x:c.x-2,y:c.y}, {x:c.x+2,y:c.y} ],
    vertexNames:['Point 1','Point 2'],
    segmentNames:['Cote 1'],
    frozenVertices:[false,false],
    width:1.2, curve:false,
    showName:true, showSegNames:false, showVertNames:false, showDims:true, showAngles:false,
    constrained:true, fonction:'chemin', matiere:'', priority:2, locked:false
  };
  etat.objects.push(newObj);
  createObjectDOM(newObj);
  rebuildHandles(newObj);
  reapplyStackingOrder();
  etat.selectedKey = key;
  etat.attrTab = 'segments';
  rebuildSelector();
  render();
}

function addNewCircle(){
  pushHistory();
  const pc = etat.objects.find(o=>o.key==='parcelle');
  const c = pc ? centroid(pc.pts) : {x:0, y:0};
  const key = 'circle' + Date.now() + '_' + (etat.newObjCounter++);
  const newObj = {
    key, type:'circle', name:'Nouveau cercle', fill:'#5bc8f5', fillOpacity:0.88, stroke:'#0a3d5c',
    center:{x:c.x, y:c.y}, r:1.0,
    showName:true, showSegNames:false, showVertNames:false, showDims:true, showAngles:false,
    constrained:true, fonction:'equipement', matiere:'', priority:2, locked:false
  };
  etat.objects.push(newObj);
  createObjectDOM(newObj);
  rebuildHandles(newObj);
  reapplyStackingOrder();
  etat.selectedKey = key;
  etat.attrTab = 'objet';
  rebuildSelector();
  render();
}

// Un parasol est un cercle (le diametre de la toile = le rayon du cercle, deja glissable/editable
// comme tout cercle), marque fonction:'parasol' pour que le panneau y ajoute la hauteur de mat et
// les outils d'ombre, et pour que la Vue 3D le modelise en mat + toile plutot qu'en bloc plein.
function addNewParasol(){
  pushHistory();
  // Pose par defaut au centre de la terrasse (c'est un parasol DE terrasse) plutot qu'au centre de
  // la parcelle - sinon il nait loin de l'endroit ou on veut l'utiliser.
  const terr = etat.objects.find(o=>o.key===etat.terrasseSelectedKey && o.fonction==='terrasse')
            || etat.objects.find(o=>o.fonction==='terrasse')
            || etat.objects.find(o=>o.key==='parcelle');
  const c = terr ? centroid(terr.pts) : {x:0, y:0};
  const key = 'circle' + Date.now() + '_' + (etat.newObjCounter++);
  const n = etat.objects.filter(o=>o.fonction==='parasol').length + 1;
  const newObj = {
    key, type:'circle', name:'Parasol '+n, fill:'#7a9e6b', fillOpacity:0.55, stroke:'#3f5c33',
    center:{x:c.x, y:c.y}, r:1.5, // 3 m de diametre, taille courante d'un parasol de terrasse
    showName:true, showSegNames:false, showVertNames:false, showDims:true, showAngles:false,
    constrained:true, fonction:'parasol', matiere:'', priority:4, locked:false,
    hauteurParasol:2.2,
    terrasseLieeKey: (terr && terr.fonction==='terrasse') ? terr.key : null
  };
  etat.objects.push(newObj);
  createObjectDOM(newObj);
  rebuildHandles(newObj);
  reapplyStackingOrder();
  etat.selectedKey = key;
  etat.attrTab = 'objet';
  rebuildSelector();
  render();
}

// Un point de vue est un cercle comme un autre (position glissable, selection, export...), juste
// marque fonction:'camera' pour que le panneau d'attributs y ajoute altitude/direction et que la
// Vue 3D sache lesquels lister. Reutiliser le cercle evite de reconstruire toute la mecanique de
// placement/selection/export pour un simple marqueur.
function addNewViewpoint(){
  pushHistory();
  const pc = etat.objects.find(o=>o.key==='parcelle');
  const c = pc ? centroid(pc.pts) : {x:0, y:0};
  const key = 'path' + Date.now() + '_' + (etat.newObjCounter++);
  const n = etat.objects.filter(o=>o.fonction==='camera').length + 1;
  const newObj = {
    key, type:'path', name:'Point de vue '+n, fill:'#c0392b', fillOpacity:0.9, stroke:'#6b1f16',
    pts:[ {x:c.x, y:c.y}, {x:c.x+2, y:c.y} ],
    vertexNames:['Position','Direction'], segmentNames:['Vise'],
    frozenVertices:[false,false], width:0.08, curve:false,
    showName:true, showSegNames:false, showVertNames:false, showDims:false, showAngles:false,
    constrained:false, fonction:'camera', matiere:'', priority:3, locked:false,
    altitude:1.6
  };
  etat.objects.push(newObj);
  createObjectDOM(newObj);
  rebuildHandles(newObj);
  reapplyStackingOrder();
  etat.selectedKey = key;
  etat.attrTab = 'objet';
  rebuildSelector();
  render();
}

function duplicateSelectedObject(){
  const src = etat.objects.find(o=>o.key===etat.selectedKey);
  if(!src){ showToast('Selectionne d\'abord un objet a dupliquer.'); return; }
  pushHistory();
  // Passe par le meme couple serialize/normalize que la sauvegarde et l'annulation. La raison
  // d'origine - l'objet portait ses elements SVG, que JSON.stringify ne sait pas traiter - a
  // disparu en phase 4 : les poignees vivent desormais a cote (render/vues.ts). Ce qui reste,
  // et qui suffit a garder ce detour : la copie doit etre normalisee comme un objet importe,
  // avec ses invariants de tableaux (vertexNames, segmentNames, frozenVertices).
  const plain = serializeObjects([src])[0];
  plain.key = 'dup' + Date.now() + '_' + (etat.newObjCounter++);
  plain.name = src.name + ' (copie)';
  const clone = normalizeObjects([plain])[0];
  if(clone.type==='circle') clone.center.x -= 5;
  else clone.pts.forEach(p=>{ p.x -= 5; });
  etat.objects.push(clone);
  createObjectDOM(clone);
  rebuildHandles(clone);
  reapplyStackingOrder();
  etat.selectedKey = clone.key;
  etat.attrTab = 'objet';
  rebuildSelector();
  render();
}

function deleteSelectedObject(){
  if(!etat.selectedKey){ showToast('Sélectionne d\'abord un objet à supprimer.'); return; }
  if(etat.selectedKey === 'parcelle'){ showToast('La parcelle ne peut pas être supprimée.'); return; }
  const idx = etat.objects.findIndex(o=>o.key===etat.selectedKey);
  if(idx===-1) return;
  const obj = etat.objects[idx];
  if(obj.locked){ showToast('Cet objet est verrouille. Decoche "Verrouiller objet" avant de le supprimer.'); return; }
  showConfirm('Supprimer definitivement "' + obj.name + '" ?', ()=>{
    pushHistory();
    // Le demontage appartient a render/vues.ts : il retire les memes elements qu'ici, et oublie
    // en plus l'entree de la carte - que ce code laissait derriere lui a chaque suppression.
    detruireVue(obj);
    etat.objects.splice(idx,1);
    etat.selectedKey = null;
    rebuildSelector();
    render();
  });
}


document.getElementById('exportSvgBtn').addEventListener('click', ()=>{
  let svgStr;
  try {
    svgStr = buildExportSVG();
  } catch(err){
    showErrBanner('Erreur export SVG: ' + err.message);
    return;
  }

  // Fallback 1: always show the raw SVG markup in the export box, so the user
  // can copy/save it manually even if the automatic download below fails
  // silently (behavior varies by browser/preview sandbox).
  const box = document.getElementById('exportBox');
  box.style.display='block'; box.value = svgStr; box.focus(); box.select();

  // Fallback 2: try the automatic download; delay revoking the object URL
  // since revoking immediately can interrupt the download in some browsers.
  try {
    const blob = new Blob([svgStr], {type:'image/svg+xml'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'plan_interactif_export.svg'; a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    setTimeout(()=>{ document.body.removeChild(a); URL.revokeObjectURL(url); }, 1000);

    // Fallback 3: also offer a direct link to open the SVG in a new tab,
    // in case the download itself is blocked by the surrounding page/sandbox.
    let link = document.getElementById('svgOpenLink');
    if(!link){
      link = document.createElement('a');
      link.id = 'svgOpenLink';
      link.target = '_blank'; link.rel = 'noopener';
      link.className = 'hint';
      link.style.display = 'block'; link.style.marginTop = '4px';
      box.insertAdjacentElement('afterend', link);
    }
    link.href = url;
    link.textContent = "Le telechargement automatique n'a pas demarre ? Cliquer ici pour ouvrir le SVG dans un nouvel onglet (puis Enregistrer sous).";
  } catch(err){
    showErrBanner('Le contenu SVG est affiche ci-dessus (copiable), mais le telechargement automatique a echoue: ' + err.message);
  }
});

document.getElementById('exportPngBtn').addEventListener('click', ()=>{
  let svgStr;
  try {
    svgStr = buildExportSVG();
  } catch(err){
    showErrBanner('Erreur export PNG: ' + err.message);
    return;
  }
  const pngScale = 3; // oversample beyond the SVG's native pixel size for a sharper PNG
  const svgUrl = URL.createObjectURL(new Blob([svgStr], {type:'image/svg+xml'}));
  const img = new Image();
  img.onload = ()=>{
    URL.revokeObjectURL(svgUrl);
    try {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth * pngScale;
      canvas.height = img.naturalHeight * pngScale;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(blob=>{
        if(!blob){ showErrBanner('Erreur export PNG: conversion en image impossible.'); return; }
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = 'plan_interactif_export.png'; a.rel = 'noopener';
        document.body.appendChild(a);
        a.click();
        setTimeout(()=>{ document.body.removeChild(a); URL.revokeObjectURL(url); }, 1000);
      }, 'image/png');
    } catch(err){
      showErrBanner('Erreur export PNG: ' + err.message);
    }
  };
  img.onerror = ()=>{
    URL.revokeObjectURL(svgUrl);
    showErrBanner('Erreur export PNG: impossible de charger le plan genere pour le convertir en image.');
  };
  img.src = svgUrl;
});

function buildExportSVG(){
  return construireSVG(etat.objects, etat.measures, {appVersion:APP_VERSION, schemaVersion:SCHEMA_VERSION});
}

document.getElementById('exportBtn').addEventListener('click', ()=>{
  let out = "Plan interactif " + APP_VERSION + " - export (repere local, metres) - " + new Date().toLocaleDateString("fr-FR") + "\n";
  out += "Origine (0,0) = Apex, le sommet Coin Nord de la parcelle (le point le plus au nord).\n";
  out += "Axe X+ = Est ; Axe Y+ = Nord (correspond au \"haut\" de l'affichage a l'ecran).\n";
  out += "Pour reimporter/recaler ce plan ailleurs, aligner Apex sur Coin Nord et orienter Y+ vers le nord.\n\n";
  const parcelleForText = objByKey('parcelle');
  const sParcelle = parcelleForText ? shoelace(parcelleForText.pts) : 0;
  let total = 0;
  etat.objects.forEach(obj=>{
    let s;
    if(obj.type==='polygon') s = shoelace(obj.pts);
    else if(obj.type==='circle') s = Math.PI*obj.r*obj.r;
    else { let L=0; for(let i=0;i<obj.pts.length-1;i++) L+=dist(obj.pts[i],obj.pts[i+1]); s = L*(obj.width||1); }
    if(obj.key!=='parcelle') total += s;
    out += obj.name + ' (' + obj.key + '): ' + s.toFixed(2) + ' m2' + (obj.type==='path' ? ' (longueur x largeur)' : '') + '\n';
  });
  out += 'Emprise totale (hors parcelle): ' + total.toFixed(1) + ' m2' + (sParcelle>0 ? (' (' + (total/sParcelle*100).toFixed(1) + ' %)') : '') + '\n\n';

  etat.objects.forEach(obj=>{
    out += '--- ' + obj.name + ' (' + obj.key + ') ---\n';
    if(obj.type==='circle'){
      out += '  Centre: X=' + obj.center.x.toFixed(3) + ' Y=' + obj.center.y.toFixed(3) + '  Rayon=' + obj.r.toFixed(2) + ' m\n\n';
    } else if(obj.type==='path'){
      out += '  Largeur: ' + (obj.width||1).toFixed(2) + ' m' + (obj.curve ? ' (courbe)' : ' (droit)') + '\n';
      obj.pts.forEach((p,i)=>{
        out += '  ' + obj.vertexNames[i] + ': X=' + p.x.toFixed(3) + ' Y=' + p.y.toFixed(3) + '\n';
      });
      let totalLen = 0;
      for(let i=0;i<obj.pts.length-1;i++){
        const a=obj.pts[i], b=obj.pts[i+1];
        const L = dist(a,b); totalLen += L;
        out += '  ' + (obj.segmentNames[i]||('Cote '+(i+1))) + ' (' + obj.vertexNames[i] + ' -> ' + obj.vertexNames[i+1] + '): ' + L.toFixed(2) + ' m\n';
      }
      out += '  Longueur totale: ' + totalLen.toFixed(2) + ' m\n\n';
    } else {
      const n=obj.pts.length;
      obj.pts.forEach((p,i)=>{
        out += '  ' + obj.vertexNames[i] + ': X=' + p.x.toFixed(3) + ' Y=' + p.y.toFixed(3) + '  Angle=' + interiorAngleDeg(obj,i).toFixed(1) + ' deg\n';
      });
      for(let i=0;i<n;i++){
        const a=obj.pts[i], b=obj.pts[(i+1)%n];
        out += '  ' + obj.segmentNames[i] + ' (' + obj.vertexNames[i] + ' -> ' + obj.vertexNames[(i+1)%n] + '): ' + dist(a,b).toFixed(2) + ' m\n';
      }
      out += '\n';
    }
  });

  if(etat.measures.length){
    out += '=== Mesures ===\n';
    etat.measures.forEach(m=>{
      const g = computeMeasureGeom(m);
      out += '  ' + refLabel({objKey:m.refObjKey, segIndex:m.refSegIndex}) + ' -> ' + targetLabel({objKey:m.targetObjKey, ptIndex:m.targetPtIndex})
           + '  origine=' + m.startEnd
           + (g ? ('  perpendiculaire=' + g.perp.toFixed(2) + ' m  le_long=' + g.along.toFixed(2) + ' m') : '  (non calculable)')
           + '  affichage_sur_plan=' + (m.displayMode==='along' ? 'le_long' : 'perpendiculaire')
           + '  affiche=' + (m.show ? 'oui' : 'non') + '\n';
    });
    out += '\n';
  }

  const box = document.getElementById('exportBox');
  box.style.display='block'; box.value=out; box.focus(); box.select();
});

// center the initial view on the parcel, using the actual responsive canvas size
(function centerInitialView(){
  const parcelle = etat.objects.find(o=>o.key==='parcelle');
  const xs = parcelle.pts.map(p=>p.x), ys = parcelle.pts.map(p=>p.y);
  const midX = (Math.min(...xs)+Math.max(...xs))/2;
  const midY = (Math.min(...ys)+Math.max(...ys))/2;
  const spanX = Math.max(...xs)-Math.min(...xs), spanY = Math.max(...ys)-Math.min(...ys);
  etat.scene.scale = Math.max(6, Math.min(220, Math.min((etat.scene.W-60)/spanX, (etat.scene.H-60)/spanY)));
  etat.scene.origine = { x: etat.scene.W/2 - midX*etat.scene.scale, y: etat.scene.H/2 + midY*etat.scene.scale };
})();

// Zoom & center the view on a given object (or the whole parcel if none)
// Le cadrage vit dans interaction/navigation.ts ; ici, le choix de CE QU'ON cadre : l'objet
// demande, sinon la parcelle, sinon tout le plan.
function fitToObject(obj){
  const formes = obj ? [obj]
    : (etat.objects.find(o=>o.key==='parcelle') ? [etat.objects.find(o=>o.key==='parcelle')] : etat.objects);
  const emprise = empriseDe(formes);
  if(!emprise) return;
  etat.scene = cadrerSur(etat.scene, emprise);
  render();
}


function buildExportDXF(){
  return construireDXF(etat.objects, etat.measures, signatureExport());
}

document.getElementById('exportDxfBtn').addEventListener('click', ()=>{
  let dxfStr;
  try {
    dxfStr = buildExportDXF();
  } catch(err){
    showErrBanner('Erreur export DXF: ' + err.message);
    return;
  }
  const box = document.getElementById('exportBox');
  box.style.display='block'; box.value = dxfStr; box.focus(); box.select();
  try {
    const blob = new Blob([dxfStr], {type:'application/dxf'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'plan_interactif_export.dxf'; a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    setTimeout(()=>{ document.body.removeChild(a); URL.revokeObjectURL(url); }, 1000);
  } catch(err){
    showErrBanner('Le contenu DXF est affiche ci-dessus (copiable), mais le telechargement automatique a echoue: ' + err.message);
  }
});


function buildExportPDF(scaleDenom){
  return construirePDF(etat.objects, etat.measures, scaleDenom, {
    appVersion: APP_VERSION, buildAt: BUILD_AT, montrerNord: etat.showNorth
  });
}

// ================= Dossier PDF : plan de masse + une section par terrasse =================
// L'export PDF existant sort UNE vue du plan a l'echelle demandee. Ce dossier-ci est un autre
// document : format A4 fixe, une page de situation puis une page par terrasse retenue, avec ses
// cotes et le tableau des dimensions - de quoi discuter le projet ou le donner a un artisan.
// L'ecrivain PDF est le meme (fait main, pas de bibliotheque disponible), mais l'assemblage des
// objets est generique ici : buildExportPDF() numerote ses deux pages en dur.

// Emprise d'un objet, en metres : ce que le tableau des dimensions doit annoncer.

const dossierSelection = new Set();
function renderDossierTerrasses(){
  const hote = document.getElementById('dossierTerrasses');
  if(!hote) return;
  hote.innerHTML = '';
  const terrasses = etat.objects.filter(o=>o.fonction === 'terrasse' && o.type === 'polygon');
  if(!terrasses.length){
    const p = document.createElement('span');
    p.className = 'hint';
    p.style.margin = '0';
    p.textContent = 'Aucune terrasse dans ce plan : regle « Fonction » sur « terrasse » pour l\'objet concerne.';
    hote.appendChild(p);
    return;
  }
  const cles = new Set(terrasses.map(t=>t.key));
  [...dossierSelection].forEach(k=>{ if(!cles.has(k)) dossierSelection.delete(k); });
  if(!dossierSelection.size) terrasses.forEach(t=>dossierSelection.add(t.key));
  terrasses.forEach(t=>{
    const lab = document.createElement('label');
    lab.style.cssText = 'display:flex; align-items:center; gap:6px; cursor:pointer;';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = dossierSelection.has(t.key);
    cb.addEventListener('change', ()=>{
      if(cb.checked) dossierSelection.add(t.key); else dossierSelection.delete(t.key);
    });
    const equip = equipementsSurTerrasse(etat.objects, t);
    lab.appendChild(cb);
    lab.appendChild(document.createTextNode(
      t.name + ' — ' + shoelace(t.pts).toFixed(2).replace('.',',') + ' m²' +
      (equip.length ? ' — ' + equip.length + ' équipement(s) : ' + equip.map(e=>e.name).join(', ') : ' — aucun équipement')
    ));
    hote.appendChild(lab);
  });
}
document.getElementById('dossierPdfBtn').addEventListener('click', function(){
  const cles = [...dossierSelection];
  if(!cles.length){ showToast('Coche au moins une terrasse pour le dossier.'); return; }
  let res;
  try {
    res = construireDossierPDF(etat.objects, cles, document.getElementById('chkDossierEquipements').checked, {
      nomProjet: (seed && seed.meta && seed.meta.name), appVersion: APP_VERSION
    });
  } catch(err){
    showErrBanner('Erreur dossier PDF : ' + err.message);
    return;
  }
  const nom = slugFichier((seed && seed.meta && seed.meta.name) || 'plan') + '-dossier-terrasses.pdf';
  telechargerTexte(nom, res.pdf, 'application/pdf');
  const nbEquip = [...res.equipements.values()].reduce((s,l)=>s+l.length, 0);
  showToast('Dossier PDF : ' + res.pages + ' page(s) — plan de masse + ' + res.terrasses.length +
    ' terrasse(s), ' + nbEquip + ' equipement(s) cote(s).');
});


document.getElementById('exportPdfBtn').addEventListener('click', ()=>{
  const scaleDenom = parseInt(document.getElementById('pdfScaleInput').value,10) || 200;
  let pdfStr;
  try {
    pdfStr = buildExportPDF(scaleDenom);
  } catch(err){
    showErrBanner('Erreur export PDF: ' + err.message);
    return;
  }
  try {
    const blob = new Blob([pdfStr], {type:'application/pdf'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'plan_interactif_export.pdf'; a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    setTimeout(()=>{ document.body.removeChild(a); URL.revokeObjectURL(url); }, 1000);

    let link = document.getElementById('pdfOpenLink');
    if(!link){
      link = document.createElement('a');
      link.id = 'pdfOpenLink'; link.target = '_blank'; link.rel = 'noopener';
      link.className = 'hint'; link.style.display = 'block'; link.style.marginTop = '4px';
      document.getElementById('exportBox').insertAdjacentElement('afterend', link);
    }
    link.href = url;
    link.textContent = "Le telechargement automatique n'a pas demarre ? Cliquer ici pour ouvrir le PDF dans un nouvel onglet.";
  } catch(err){
    showErrBanner('Echec du telechargement PDF: ' + err.message);
  }
});
// Exporte la scene 3D (celle du Mode Terrasse > Vue 3D) en .glb, quel que soit le mode d'ou on
// clique - si la Vue 3D n'a jamais ete ouverte pour cette terrasse, elle est construite juste
// pour l'export puis aussitot refermee (elle ne doit pas se mettre a tourner en arriere-plan sans
// que l'utilisateur l'ait demande).
// Chaque texture Poly Haven est chargee sans cache (chargerTexturePolyhaven cree un nouveau
// TextureLoader a chaque usage, cf. bug du clone-avant-chargement corrige plus tot) : juste apres
// avoir (re)construit une scene, ses images sont donc encore en telechargement. TextureLoader ne
// pose `texture.image` que dans le callback onLoad (verifie sur le source r128) - avant ca
// `texture.image` reste `undefined`. GLTFExporter.parse lit `texture.image.width` pour encoder
// chaque image et plante immediatement si elle n'est pas encore arrivee ("Cannot read properties
// of undefined (reading 'width')") : c'est le cas a chaque fois qu'un objet de la scene a une
// texture, puisque l'export construit/reconstruit la scene juste avant d'exporter.
// Garde une copie du dernier .glb reellement exporte (pas juste reconstruit "en live" comme la
// Vue 3D) : c'est ce que relit la Visionneuse GLB, pour verifier le fichier qui sort vraiment de
// l'appli plutot qu'une reconstruction qui pourrait diverger de lui.
// Genere le .glb EN MEMOIRE (glb.dernierExporte) et n'ecrit un fichier que si `telecharger` est
// vrai. La Visionneuse n'a besoin que des donnees : lui faire deposer un fichier dans le dossier
// de telechargements a chaque ouverture ou rafraichissement n'aurait aucun interet.
function genererGlb(btn, telecharger){
  const terr = etat.objects.find(o=>o.key===etat.terrasseSelectedKey && o.fonction==='terrasse')
            || etat.objects.find(o=>o.fonction==='terrasse');
  if(!terr){ showToast('Cree d\'abord une terrasse pour pouvoir generer une scene 3D.'); return; }
  const libelleAvant = btn ? btn.textContent : '';
  if(btn){ btn.disabled = true; btn.textContent = telecharger ? 'Export en cours…' : 'Génération…'; }
  const restaurer = ()=>{ if(btn){ btn.disabled = false; btn.textContent = libelleAvant; } };
  ensureThreeLoaded(()=>{
    ensureGLTFExporterLoaded(()=>{
      try{
        const dejaActive = vue3d.scene && vue3d.dernierObjKey===terr.key;
        if(!dejaActive) buildThreeScene(terr);
        attendreTexturesPretes(vue3d.scene.scene, 15000).then(()=>{
          try{
            const exporter = new THREE.GLTFExporter();
            // Cette version (r128) de GLTFExporter n'a pas de callback d'erreur separe
            // (parse(input, onDone, options) seulement) : un filet de securite remet le bouton
            // en etat si onDone n'est jamais appele (echec silencieux plutot qu'exception), sans
            // quoi il resterait bloque sur "Export en cours…" indefiniment.
            let fini = false;
            const filet = setTimeout(()=>{
              if(fini) return; fini = true;
              showErrBanner('Export GLB : pas de reponse - reessaie.');
              if(!dejaActive) disposeThreeScene();
              restaurer();
            }, 20000);
            exporter.parse(vue3d.scene.scene, (result)=>{
              if(fini) return; fini = true; clearTimeout(filet);
              glb.dernierExporte = { buffer: result, nomTerrasse: terr.name, date: new Date() };
              if(telecharger){
              const blob = new Blob([result], {type:'model/gltf-binary'});
              const url = URL.createObjectURL(blob);
              const nom = (terr.name||'terrasse').normalize('NFD').replace(/[̀-ͯ]/g,'')
                .replace(/[^\w\-]+/g,'_').replace(/^_+|_+$/g,'') || 'terrasse';
              const a = document.createElement('a');
              a.href = url; a.download = 'terrasse_' + nom + '.glb'; a.rel = 'noopener';
              document.body.appendChild(a);
              a.click();
              setTimeout(()=>{ document.body.removeChild(a); URL.revokeObjectURL(url); }, 1000);
              }
              if(!dejaActive) disposeThreeScene(); // construite seulement pour l'export : pas de raison de la laisser active
              restaurer();
              rafraichirVisionneuseGlbSiOuverte();
            }, { binary: true });
          } catch(err){
            showErrBanner('Export GLB : ' + err.message);
            if(!dejaActive) disposeThreeScene();
            restaurer();
          }
        });
      } catch(err){
        showErrBanner('Export GLB : ' + err.message);
        restaurer();
      }
    });
  });
}
document.getElementById('exportGlbBtn').addEventListener('click', function(){
  genererGlb(this, true); // onglet Export : c'est bien un fichier que l'utilisateur veut
});

// ================= Measurement tool (click-to-pick, persistent measures) =================
// Each measure: {id, refObjKey, refSegIndex, startEnd, targetObjKey, targetPtIndex, show}
// Geometry (perp/along/foot) is recomputed live every render so it always reflects the
// current position of the objects involved.
// measures : dans `etat`, initialise par creerEtat (spec 6.1).
// Reference snapshot of the measures as loaded, used by "Reinitialiser tout" alongside
// `initialState` (objects) so a full reset restores the whole project, not just geometry.
const initialMeasures = serializeMeasures(etat.measures);
let pickState = null; // {mode:'ref'|'target', multi:boolean, purpose:'measure'|'align'}
let draftRef = null; // {objKey, segIndex}
let draftStartEnd = 'A';
let draftTargets = []; // [{objKey, ptIndex}]



// La geometrie des cotes vit dans render/measures.ts ; ces enveloppes gardent les appels
// existants inchanges et fournissent la liste des objets, que le module ne lit plus tout seul.
function computeMeasureGeom(m){ return geometrieMesure(etat.objects, m); }
function measureSegCoords(ref){ return coordonneesCote(etat.objects, ref); }
function measurePointCoord(t){ return coordonneesPoint(etat.objects, t); }

const measureGroup = document.createElementNS(svgNS,'g');
svg.appendChild(measureGroup);

function refLabel(ref){
  if(!ref) return '(aucun)';
  const obj = etat.objects.find(o=>o.key===ref.objKey);
  if(!obj) return '(objet supprime)';
  return obj.name + ': ' + (obj.segmentNames[ref.segIndex]||('Cote '+(ref.segIndex+1)));
}
function targetLabel(t){
  const obj = etat.objects.find(o=>o.key===t.objKey);
  if(!obj) return '(objet supprime)';
  if(obj.type==='circle') return obj.name + ' (centre)';
  return obj.name + ': ' + (obj.vertexNames[t.ptIndex]||('P'+(t.ptIndex+1)));
}

// Distance from `center` to where the ray (center -> center+dir) exits the polygon `poly`.
// Returns 0 if no intersection is found (e.g. center already outside).

function startPick(mode, multi, purpose){
  pickState = {mode, multi, purpose: purpose||'measure'};
  rebuildMeasurePanel();
  render();
}
function cancelPick(){
  pickState = null;
  rebuildMeasurePanel();
  render();
}



function alignObjectByRotation(obj){
  if(!cibleAlignement()) return;
  if(obj.locked){ showToast('Objet verrouille.'); return; }
  // Une parcelle issue du cadastre porte l'orientation reelle du terrain : la faire tourner
  // decale le nord du plan, donc l'ombre du parasol et la Vue 3D, sans que rien ne le signale.
  if(obj.cadastre) showToast('Attention : cette parcelle vient du cadastre. La faire tourner desaligne le plan du nord reel (ombres, Vue 3D).');
  const target = measureSegCoords(cibleAlignement());
  if(!target) return;
  const idx = nearestSegmentIndex(obj, target);
  if(idx<0) return;
  // Distance laissee vide = on ne fait que tourner, sans deplacer la forme.
  const distInput = document.getElementById('alignDistanceInput');
  const distRaw = distInput ? distInput.value.trim() : '';
  const distance = distRaw === '' ? null : parseFloat(distRaw);
  const newPts = alignerSurCote(obj.pts, idx, target, distance);

  const bound = contourDeContrainte(etat.objects, obj);
  if(bound && !newPts.every(p=>pointInPolygon(p,bound))){
    showToast('Le resultat sortirait de la parcelle - alignement annule.');
    return;
  }
  pushHistory();
  obj.pts = newPts;
  rebuildHandles(obj);
  render();
}

function rebuildMeasurePanel(){
  const ctrl = document.getElementById('measureControls');
  ctrl.innerHTML = '';

  const explain = document.createElement('div');
  explain.className = 'hint';
  explain.style.marginBottom = '8px';
  explain.textContent = "Choisis un segment de référence et l'extrémité d'origine, puis sélectionne un ou plusieurs coins sur le plan : pour chacun, la mesure est la distance entre son point projeté (perpendiculaire au segment) et l'origine choisie.";
  ctrl.appendChild(explain);

  const refBtn = document.createElement('button');
  refBtn.className = 'secondary small';
  refBtn.textContent = (pickState && pickState.mode==='ref') ? 'Clique sur un côté du plan…' : 'Choisir le segment de référence';
  if(pickState && pickState.mode==='ref') refBtn.disabled = true;
  refBtn.addEventListener('click', ()=>startPick('ref', false));
  ctrl.appendChild(refBtn);

  const refInfo = document.createElement('div');
  refInfo.style.cssText = 'font-size:0.8rem; margin:6px 0;';
  refInfo.textContent = 'Référence : ' + refLabel(draftRef);
  ctrl.appendChild(refInfo);

  const startSelect = document.createElement('select');
  ['A','B'].forEach(v=>{ const o=document.createElement('option'); o.value=v; o.textContent='Extrémité '+v; startSelect.appendChild(o); });
  startSelect.value = draftStartEnd;
  startSelect.addEventListener('change', ()=>{ draftStartEnd = startSelect.value; });
  const startLabel = document.createElement('label');
  startLabel.style.cssText='display:block; font-size:0.8rem; margin:8px 0;';
  startLabel.textContent = "Origine (extrémité du segment) : ";
  startLabel.appendChild(startSelect);
  ctrl.appendChild(startLabel);

  const tgtBtn = document.createElement('button');
  tgtBtn.className = 'secondary small';
  const picking = pickState && pickState.mode==='target';
  tgtBtn.textContent = picking ? 'Clique des coins sur le plan… (reclique pour finir)' : 'Sélectionner des coins';
  tgtBtn.disabled = !draftRef;
  tgtBtn.title = !draftRef ? 'Choisis d\'abord le segment de reference' : '';
  tgtBtn.addEventListener('click', ()=>{
    if(picking){ cancelPick(); return; } // acts as "terminer" while picking
    draftTargets = [];
    startPick('target', true);
  });
  ctrl.appendChild(tgtBtn);

  const tgtInfo = document.createElement('div');
  tgtInfo.style.cssText = 'font-size:0.8rem; margin:6px 0;';
  tgtInfo.textContent = 'Points sélectionnés : ' + (draftTargets.length ? draftTargets.map(targetLabel).join(', ') : '(aucun)');
  ctrl.appendChild(tgtInfo);

  const addBtn = document.createElement('button');
  addBtn.textContent = 'Ajouter les mesures';
  addBtn.disabled = !draftRef || draftTargets.length===0;
  addBtn.addEventListener('click', ()=>{
    draftTargets.forEach(t=>{
      etat.measures.push({
        id:'m'+Date.now()+'_'+Math.random().toString(36).slice(2,7),
        refObjKey:draftRef.objKey, refSegIndex:draftRef.segIndex,
        startEnd: draftStartEnd,
        targetObjKey:t.objKey, targetPtIndex:t.ptIndex,
        show:true, displayMode:'along'
      });
    });
    draftTargets = [];
    pickState = null;
    rebuildMeasurePanel();
    renderMeasureResults();
    render();
  });
  ctrl.appendChild(document.createElement('br'));
  ctrl.appendChild(addBtn);
}

function renderMeasureResults(){
  const tbl = document.getElementById('measureResultsTable');
  tbl.innerHTML = '';
  const head = document.createElement('tr');
  head.innerHTML = '<th>Référence</th><th>Point</th><th>Origine</th><th>Perpendiculaire</th><th>Le long (depuis origine)</th><th>Affichage</th><th>Afficher</th><th></th>';
  tbl.appendChild(head);
  etat.measures.forEach(m=>{
    if(!m.displayMode) m.displayMode = 'along';
    const g = computeMeasureGeom(m);
    const tr = document.createElement('tr');
    const td0=document.createElement('td'); td0.textContent = refLabel({objKey:m.refObjKey, segIndex:m.refSegIndex});
    const td1=document.createElement('td'); td1.textContent = targetLabel({objKey:m.targetObjKey, ptIndex:m.targetPtIndex});
    const td1b=document.createElement('td');
    const swapBtn=document.createElement('button'); swapBtn.className='secondary small';
    swapBtn.textContent = 'Extrémité ' + m.startEnd + ' ⇄';
    swapBtn.title = 'Changer l\'extremite d\'origine de cette mesure (A <-> B)';
    swapBtn.addEventListener('click', ()=>{ m.startEnd = m.startEnd==='A' ? 'B' : 'A'; renderMeasureResults(); render(); });
    td1b.appendChild(swapBtn);
    const td2=document.createElement('td');
    td2.textContent = g ? g.perp.toFixed(2)+' m' : '—';
    td2.style.fontWeight = m.displayMode==='perp' ? '700' : '400';
    const td3=document.createElement('td');
    td3.textContent = g ? g.along.toFixed(2)+' m' : '—';
    td3.style.fontWeight = m.displayMode==='along' ? '700' : '400';
    const td3b=document.createElement('td');
    const modeBtn=document.createElement('button'); modeBtn.className='secondary small';
    modeBtn.textContent = (m.displayMode==='along' ? 'Le long' : 'Perpendiculaire') + ' ⇄';
    modeBtn.title = 'Choisir quelle valeur est affichee sur le plan pour cette mesure';
    modeBtn.addEventListener('click', ()=>{ m.displayMode = m.displayMode==='along' ? 'perp' : 'along'; renderMeasureResults(); render(); });
    td3b.appendChild(modeBtn);
    const td4=document.createElement('td');
    const cb=document.createElement('input'); cb.type='checkbox'; cb.checked=m.show;
    cb.addEventListener('change', ()=>{ m.show=cb.checked; render(); });
    td4.appendChild(cb);
    const td5=document.createElement('td');
    const delBtn=document.createElement('button'); delBtn.className='secondary small'; delBtn.textContent='Supprimer';
    delBtn.addEventListener('click', ()=>{ etat.measures = etat.measures.filter(x=>x.id!==m.id); renderMeasureResults(); render(); });
    td5.appendChild(delBtn);
    tr.appendChild(td0); tr.appendChild(td1); tr.appendChild(td1b); tr.appendChild(td2); tr.appendChild(td3); tr.appendChild(td3b); tr.appendChild(td4); tr.appendChild(td5);
    tbl.appendChild(tr);
  });
}

// Le dessin des cotes vit dans render/measures.ts ; cette enveloppe fournit ce que le module ne
// lit plus lui-meme : les objets, les mesures et la cote en cours de saisie.
function drawMeasures(){
  dessinerCotes(measureGroup, {
    scene: etat.scene,
    objets: etat.objects,
    mesures: etat.measures,
    brouillonRef: draftRef,
    brouillonCibles: draftTargets
  });
}

document.getElementById('recalcMeasureBtn').addEventListener('click', ()=>{
  renderMeasureResults();
  render();
});

document.getElementById('clearMeasureBtn').addEventListener('click', ()=>{
  const doClear = ()=>{
    etat.measures = []; draftTargets = []; draftRef = null; pickState = null;
    renderMeasureResults(); rebuildMeasurePanel(); render();
  };
  if(etat.measures.length) showConfirm('Supprimer toutes les mesures enregistrees ?', doClear);
  else doClear();
});

// ================= SVG import =================
document.getElementById('importSvgBtn').addEventListener('click', ()=>{
  document.getElementById('importSvgFile').click();
});
document.getElementById('importSvgFile').addEventListener('change', e=>{
  const file = e.target.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = ev=>{
    try {
      importerSVG(ev.target.result, etat, {
          pushHistory, createObjectDOM, rebuildHandles, reapplyStackingOrder, rebuildSelector,
          render, renderMeasureResults, markDirty, fitToObject, filtrerSansParcelle, trouverParcelleCloture
        });
    } catch(err){
      showErrBanner('Erreur import SVG: ' + err.message);
    }
    e.target.value = '';
  };
  reader.onerror = ()=>{
    // Without this, a failed read (permissions, unreadable file, ...) never fires onload, so
    // the input keeps the old file selected and re-choosing the SAME file afterwards would not
    // fire another 'change' event.
    showErrBanner('Erreur de lecture du fichier SVG.');
    e.target.value = '';
  };
  reader.readAsText(file);
});


// ================= Persistance : serialisation + barre de projet =================
// Prend uniquement les champs de donnees (jamais el/nameEl/pointEls/edgeEls/... qui
// pointent vers des noeuds SVG vivants : un JSON.stringify direct de `objects` planterait
// sur une structure circulaire une fois la page construite).

// ================= Import / Export du projet en JSON (fichier local) =================
// Le fichier produit est exactement la reponse de api.php?action=load ({meta, objects,
// measures}) : ce qui sort d'ici se recharge tel quel ici, et se repost e a action=save une
// fois remis a plat ({name, objects, measures}). L'import accepte les deux formes.


// Retirer la parcelle sans nettoyer ce qui la reference produirait un fichier casse a la
// relecture : mesures orphelines (une mesure perpendiculaire prend presque toujours un cote de
// parcelle comme reference) et terrasseLieeKey pointant dans le vide. D'ou la cascade.
function filtrerSansParcelle(objsSer, msSer){
  const retirees = new Set(objsSer.filter(o=>o.key==='parcelle' || o.fonction==='terrain').map(o=>o.key));
  const objets = objsSer.filter(o=>!retirees.has(o.key)).map(o=>
    (o.terrasseLieeKey && retirees.has(o.terrasseLieeKey)) ? {...o, terrasseLieeKey:null} : o
  );
  const mesures = msSer.filter(m=>!retirees.has(m.refObjKey) && !retirees.has(m.targetObjKey));
  // Le lieu (course du soleil) vit sur la parcelle : on le remonte dans meta pour ne pas le
  // perdre avec la geometrie. La cloture, elle, decrit la limite de propriete : elle part
  // avec la parcelle, et c'est voulu.
  const src = objsSer.find(o=>retirees.has(o.key) && o.latitude !== undefined && o.latitude !== null);
  return {
    objets, mesures,
    lieu: src ? {latitude:src.latitude, longitude:src.longitude, nomLieu:src.nomLieu || null} : null,
    nbObjRetires: retirees.size,
    nbMesRetirees: msSer.length - mesures.length
  };
}

function exportProjetJSON(){
  const sansParcelle = document.getElementById('chkExportSansParcelle').checked;
  let objs = serializeObjects(etat.objects);
  let ms = serializeMeasures(etat.measures);
  const metaSrc = (seed && seed.meta) || {};
  const meta = {
    id: metaSrc.id || null,
    name: metaSrc.name || 'Plan interactif',
    createdAt: metaSrc.createdAt || null,
    updatedAt: metaSrc.updatedAt || null,
    exportedAt: new Date().toISOString(),
    exportedBy: 'plan.html',
    // Estampille de version : elle explique, deux ans plus tard, un fichier qui se comporte
    // autrement que prevu (RELEASE.md 5.2).
    appVersion: APP_VERSION,
    schemaVersion: SCHEMA_VERSION,
    writtenAt: new Date().toISOString()
  };
  let bilan = '';
  if(sansParcelle){
    const f = filtrerSansParcelle(objs, ms);
    if(!f.objets.length){
      showToast('Export annule : il ne reste aucun objet une fois la parcelle retiree.');
      return;
    }
    objs = f.objets; ms = f.mesures;
    meta.sansParcelle = true;
    if(f.lieu) meta.lieu = f.lieu;
    bilan = ' Sans parcelle : ' + f.nbObjRetires + ' objet(s) et ' + f.nbMesRetirees + ' mesure(s) retire(s).';
  }
  const texte = JSON.stringify({meta, objects:objs, measures:ms}, null, 2);
  const nom = slugFichier(meta.name) + '-' + horodatageFichier() + (sansParcelle ? '-sans-parcelle' : '') + '.json';
  telechargerTexte(nom, texte, 'application/json');
  showToast('Export JSON : ' + objs.length + ' objet(s), ' + ms.length + ' mesure(s).' + bilan);
}

const IMPORT_JSON_TAILLE_MAX = 5 * 1024 * 1024;

function validerProjetJSON(data){
  if(!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Structure inattendue : un objet JSON est attendu.');
  if(!Array.isArray(data.objects) || !data.objects.length) throw new Error('Aucun objet dans le fichier (cle "objects" absente ou vide).');
  const meta = (data.meta && typeof data.meta === 'object') ? data.meta : (data.name ? {name:data.name} : {});
  // Un fichier ecrit par une version plus recente peut contenir des champs que ce client ignore :
  // le charger puis l'enregistrer les effacerait sans bruit. On refuse plutot que de tenter une
  // lecture partielle (RELEASE.md 3.2). Un fichier sans `meta.schemaVersion` date d'avant le
  // versionnement du schema : c'est la version 1.
  const schemaFichier = Number.isFinite(meta.schemaVersion) ? meta.schemaVersion : 1;
  if(schemaFichier > SCHEMA_VERSION){
    throw Object.assign(new Error('Ce projet a ete enregistre par une version plus recente de l\'application (schema '
      + schemaFichier + '). Rechargez la page pour obtenir la derniere version.'), {motif:'schema'});
  }
  const fini = v => typeof v === 'number' && Number.isFinite(v);
  const objets = [];
  let ignores = 0;
  data.objects.forEach(o=>{
    if(!o || typeof o !== 'object' || typeof o.key !== 'string' || !o.key){ ignores++; return; }
    if(o.type === 'circle'){
      if(!o.center || !fini(o.center.x) || !fini(o.center.y) || !fini(o.r) || o.r <= 0){ ignores++; return; }
    } else if(o.type === 'polygon' || o.type === 'path'){
      if(!Array.isArray(o.pts) || o.pts.length < 2 || o.pts.some(p=>!p || !fini(p.x) || !fini(p.y))){ ignores++; return; }
    } else { ignores++; return; }
    objets.push(o);
  });
  if(!objets.length) throw new Error('Aucun objet exploitable : formes absentes ou coordonnees invalides.');
  // Une coordonnee absurde signe un fichier dans une autre unite (millimetres, pixels...) :
  // mieux vaut refuser que de charger un plan de 12 km de large impossible a retrouver a l'ecran.
  const horsLimite = objets.some(o => o.type === 'circle'
    ? (Math.abs(o.center.x) > 100000 || Math.abs(o.center.y) > 100000)
    : o.pts.some(p => Math.abs(p.x) > 100000 || Math.abs(p.y) > 100000));
  if(horsLimite) throw new Error('Coordonnees aberrantes (au-dela de 100 000 m) : le fichier n\'est probablement pas en metres.');
  return { meta, objets, mesures: Array.isArray(data.measures) ? data.measures : [], ignores };
}

function appliquerProjetImporte(valide, remplacer){
  pushHistory();
  const objsBase = remplacer ? [] : serializeObjects(etat.objects);
  const msBase = remplacer ? [] : serializeMeasures(etat.measures);
  const clesPrises = new Set(objsBase.map(o=>o.key));
  const renommages = {};
  const ajoutes = [];

  valide.objets.forEach(src=>{
    const copie = JSON.parse(JSON.stringify(src));
    let cle = copie.key;
    if(clesPrises.has(cle)){
      let n = 2;
      while(clesPrises.has(cle + '-' + n)) n++;
      cle = cle + '-' + n;
      // Jamais deux objets de cle 'parcelle' : le second devient un terrain ordinaire, sinon
      // la contrainte a la parcelle et la cloture designeraient un objet au hasard.
      if(copie.key === 'parcelle') copie.fonction = 'terrain';
      renommages[copie.key] = cle;
      copie.key = cle;
    }
    clesPrises.add(cle);
    ajoutes.push(copie);
  });
  ajoutes.forEach(o=>{
    if(o.terrasseLieeKey && renommages[o.terrasseLieeKey]) o.terrasseLieeKey = renommages[o.terrasseLieeKey];
  });

  const idsPris = new Set(msBase.map(m=>m.id));
  const mesuresFinales = msBase.slice();
  let mesuresOk = 0, mesuresIgnorees = 0;
  valide.mesures.forEach(m=>{
    if(!m || typeof m !== 'object'){ mesuresIgnorees++; return; }
    const ref = renommages[m.refObjKey] || m.refObjKey;
    const tgt = renommages[m.targetObjKey] || m.targetObjKey;
    // Une mesure ne se restaure que si ses DEUX objets de reference existent apres l'import.
    if(!clesPrises.has(ref) || !clesPrises.has(tgt)){ mesuresIgnorees++; return; }
    let id = m.id;
    if(!id || idsPris.has(id)) id = 'm' + Date.now() + '_' + Math.random().toString(36).slice(2,7);
    idsPris.add(id);
    mesuresFinales.push({
      id, refObjKey:ref, refSegIndex:m.refSegIndex, startEnd:m.startEnd,
      targetObjKey:tgt, targetPtIndex:m.targetPtIndex, show:!!m.show,
      displayMode: m.displayMode === 'along' ? 'along' : 'perp'
    });
    mesuresOk++;
  });

  // restoreState fait deja la demolition/reconstruction complete du DOM SVG (meme chemin que
  // l'undo et que "Reinitialiser tout") : le refaire a la main ici laisserait forcement
  // trainer un type de noeud le jour ou l'objet en gagne un nouveau.
  restoreState({ objects: objsBase.concat(ajoutes), measures: mesuresFinales });

  const lieu = valide.meta && valide.meta.lieu;
  if(lieu && Number.isFinite(lieu.latitude) && Number.isFinite(lieu.longitude)){
    const pc = trouverParcelleCloture();
    if(pc && (pc.latitude === undefined || pc.latitude === null)){
      pc.latitude = lieu.latitude;
      pc.longitude = lieu.longitude;
      if(lieu.nomLieu) pc.nomLieu = lieu.nomLieu;
    }
  }
  const parcelle = etat.objects.find(o=>o.key === 'parcelle');
  if(parcelle) etat.selectedKey = parcelle.key;
  rebuildSelector();
  render();
  // Le cadrage par defaut suit le terrain importe : une propriete de 2 400 m2 et une terrasse de
  // 20 m2 n'ont pas la meme echelle, garder le cadrage precedent afficherait un plan hors champ.
  if(parcelle) fitToObject(parcelle);
  // Le fond orthophoto fait partie des reglages du projet : un plan importe avec le fond actif
  // le retrouve actif, cale sur SA parcelle (les tuiles precedentes ne valent plus rien).
  orthoTuiles = [];
  restaurerOrthoDuProjet();
  restaurerAffichageDuProjet();
  markDirty();

  let msg = ajoutes.length + ' objet(s) importe(s)';
  if(valide.ignores) msg += ', ' + valide.ignores + ' ignore(s)';
  msg += '. ' + mesuresOk + ' mesure(s) restauree(s)';
  if(mesuresIgnorees) msg += ', ' + mesuresIgnorees + ' ignoree(s) (objet de reference absent)';
  msg += '.';
  if(!parcelle) msg += ' ATTENTION: aucun objet "parcelle" dans le resultat - certaines fonctions (mesures, alignement, contrainte a la parcelle) seront limitees tant qu\'une parcelle n\'existe pas.';
  msg += ' Rien n\'a ete enregistre sur le serveur : utilise "Enregistrer" pour conserver ce plan.';
  showToast(msg);
}

document.getElementById('exportJsonBtn').addEventListener('click', ()=>{
  try { exportProjetJSON(); }
  catch(e){ showErrBanner('Echec de l\'export JSON : ' + (e.message || e)); }
});
document.getElementById('importJsonBtn').addEventListener('click', ()=>{
  document.getElementById('importJsonFile').click();
});
document.getElementById('importJsonFile').addEventListener('change', e=>{
  const file = e.target.files[0];
  if(!file){ return; }
  if(file.size > IMPORT_JSON_TAILLE_MAX){
    showToast('Fichier trop volumineux (' + Math.round(file.size/1048576) + ' Mo, maximum 5 Mo).');
    e.target.value = '';
    return;
  }
  const remplacer = document.getElementById('chkJsonRemplace').checked;
  const reader = new FileReader();
  reader.onload = ev=>{
    let valide;
    try {
      valide = validerProjetJSON(JSON.parse(ev.target.result));
    } catch(err){
      // Le plan courant reste intact : rien n'a ete touche avant la validation.
      // Un fichier trop recent n'est pas illisible : il est refuse volontairement. Le dire
      // autrement enverrait l'utilisateur chercher une corruption qui n'existe pas.
      showToast((err.motif === 'schema' ? 'Import refuse : ' : 'Import annule - fichier illisible : ') + (err.message || err));
      e.target.value = '';
      return;
    }
    try {
      appliquerProjetImporte(valide, remplacer);
    } catch(err){
      showErrBanner('Echec de l\'import JSON : ' + (err.message || err));
    }
    e.target.value = '';
  };
  reader.onerror = ()=>{
    // Sans ce handler, un echec de lecture ne declenche jamais onload : l'input garde le
    // fichier choisi et rechoisir LE MEME fichier ensuite n'emettrait plus d'evenement change.
    showToast('Erreur de lecture du fichier JSON.');
    e.target.value = '';
  };
  reader.readAsText(file);
});


// ---- Fusion de parcelles contigues (une propriete = souvent plusieurs parcelles) ----
// Union par parcours d'aretes plutot que par un vrai moteur booleen : les parcelles cadastrales
// mitoyennes partagent leur limite au centimetre pres (mesure : 0,000 m), donc les aretes
// communes s'annulent deux a deux et il ne reste que le contour exterieur. Les aretes annulees
// sont rendues telles quelles : ce sont les limites internes, celles qu'on garde en pointille.




// ================= Fond orthophoto (WMTS IGN, calque de reference) =================
// Le plan est en metres dans un repere local ; les tuiles WMTS, elles, sont decoupees en
// longitude/latitude. Le raccord se fait par un point de calage connu : l'origine (0,0) du plan,
// dont la position reelle est enregistree par l'import cadastre (cadastre.origineLat/Lon). Sans
// import cadastre, on retombe sur le lieu de la parcelle, cale sur son centroide - moins precis,
// mais coherent avec ce que l'appli sait du terrain.
const WMTS_URL = 'https://data.geopf.fr/wmts';
const ORTHO_COUCHE = 'ORTHOIMAGERY.ORTHOPHOTOS';
const ORTHO_ZOOM_MAX = 20;
const ORTHO_MAX_TUILES = 36;
// Valeur proposee par defaut pour la transparence du terrain sous le fond : assez de teinte pour
// que la parcelle reste identifiable, assez peu pour lire la photo dessous. Reglable, mais c'est
// le compromis qui marche sur une orthophoto a 20 cm/pixel - en dessous de 10 % la parcelle
// disparait, au-dela de 30 % la photo devient laiteuse.
const ORTHO_PARCELLE_OPACITE_CONSEILLEE = 0.15;
let orthoActif = false;
let orthoOpacite = 0.85;
let orthoParcelleOpacite = ORTHO_PARCELLE_OPACITE_CONSEILLEE;
// Terrain au sens large : la parcelle principale et les parcelles voisines importees.
function estTerrain(o){ return o.key === 'parcelle' || o.fonction === 'terrain'; }

// ---- Masquage du voisinage importe (parcelles adjacentes, leur bati, leur vegetation) ----
// Bascule d'affichage : rien n'est supprime, et le champ `hidden` propre a chaque objet n'est pas
// touche - sinon decocher puis recocher effacerait les objets que l'utilisateur avait masques
// lui-meme. Le reglage se range sur la parcelle, comme le fond orthophoto, donc il se sauvegarde.
// Les deux bascules ci-dessous sont declarees en tete de la section "Selector buttons" :
// rebuildSelector() les lit pendant le boot, bien avant cette ligne.
function estVoisinage(o){ return !!o.voisinage; }
function syncBasculeGrille(){
  const b = document.getElementById('gridBtn');
  if(!b) return;
  b.classList.toggle('off', !etat.grilleVisible);
  b.title = (etat.grilleVisible ? 'Masquer' : 'Afficher') + ' la grille du plan';
  b.setAttribute('aria-pressed', etat.grilleVisible ? 'true' : 'false');
}
function objetMasque(o){ return !!o.hidden || (o.voisinage && !etat.voisinageVisible); }
function syncBasculeVoisinage(){
  const lab = document.getElementById('voisinageToggle');
  const cb = document.getElementById('chkVoisinage');
  if(!lab || !cb) return;
  const n = etat.objects.filter(estVoisinage).length;
  // Case affichee seulement s'il y a du voisinage a masquer : une bascule sans effet visible
  // ferait douter de ce qu'elle commande.
  lab.style.display = n ? 'inline-flex' : 'none';
  lab.title = 'Masque les ' + n + ' objet(s) importe(s) avec les parcelles adjacentes (bati, vegetation, arbres estimes), sur le plan comme en 3D. Rien n\'est supprime.';
  cb.checked = etat.voisinageVisible;
}
// Un seul enregistrement pour les bascules d'affichage rangees sur la parcelle. Rien n'est ecrit
// tant que tout est aux valeurs par defaut : un projet qui n'y a jamais touche ne gagne pas le
// champ, et le rechargement ne le fait pas passer en "modifications non enregistrees".
function enregistrerAffichage(){
  const p = trouverParcelleCloture();
  if(!p) return;
  const auxDefauts = etat.voisinageVisible && etat.grilleVisible;
  if((!p.affichage || typeof p.affichage !== 'object')){
    if(auxDefauts) return;
    p.affichage = {};
  }
  if(p.affichage.voisinage === etat.voisinageVisible && p.affichage.grille === etat.grilleVisible) return;
  p.affichage.voisinage = etat.voisinageVisible;
  p.affichage.grille = etat.grilleVisible;
  markDirty();
}
function restaurerAffichageDuProjet(){
  const p = trouverParcelleCloture();
  const a = p && p.affichage;
  etat.voisinageVisible = !(a && a.voisinage === false);
  etat.grilleVisible = !(a && a.grille === false);
  syncBasculeVoisinage();
  syncBasculeGrille();
  // Restituer l'etat ne suffit pas : le plan a deja ete dessine avec les valeurs precedentes
  // (l'import rend avant de restaurer les reglages). Sans ce rendu, un projet enregistre grille
  // masquee se rouvrait avec le bouton eteint... et la grille bien visible.
  rebuildSelector();   // le voisinage masque ne doit pas figurer dans les categories
  syncLieuTitre();     // la parcelle a pu changer de position (import, actualisation)
  render();
  if(vue3d.scene) buildThreeScene(etat.objects.find(o=>o.key===etat.terrasseSelectedKey) || null);
}

// Les reglages du fond (actif, opacite de la photo, remplissage du terrain) sont ranges SUR la
// parcelle, comme la cloture, le lieu et le zonage PLU : ils se sauvegardent avec le projet sans
// nouvelle cle a faire transiter par api.php, et suivent l'export JSON. Seules les tuiles, elles,
// ne sont pas enregistrees - elles se retelechargent.
function configOrtho(creer){
  const p = trouverParcelleCloture();
  if(!p) return null;
  if(!p.ortho || typeof p.ortho !== 'object'){
    if(!creer) return null;
    p.ortho = {};
  }
  if(p.ortho.opacite === undefined || p.ortho.opacite === null) p.ortho.opacite = 0.85;
  if(p.ortho.parcelleOpacite === undefined || p.ortho.parcelleOpacite === null) p.ortho.parcelleOpacite = ORTHO_PARCELLE_OPACITE_CONSEILLEE;
  if(p.ortho.actif === undefined) p.ortho.actif = false;
  return p.ortho;
}
function enregistrerConfigOrtho(){
  // Un projet qui n'a jamais touche au fond ne gagne pas le champ pour rien, et surtout : la
  // restauration au chargement repasse par ici avec exactement les valeurs enregistrees. Sans
  // cette comparaison, tout projet avec un fond actif s'ouvrirait en "modifications non
  // enregistrees" alors que rien n'a change.
  const existante = configOrtho(false);
  const auxDefauts = !orthoActif && orthoOpacite === 0.85 && orthoParcelleOpacite === ORTHO_PARCELLE_OPACITE_CONSEILLEE;
  if(!existante && auxDefauts) return;
  const c = configOrtho(true);
  if(!c) return;   // pas de parcelle : rien ou ranger le reglage, il reste valable pour la session
  if(c.actif === orthoActif && c.opacite === orthoOpacite && c.parcelleOpacite === orthoParcelleOpacite) return;
  c.actif = orthoActif;
  c.opacite = orthoOpacite;
  c.parcelleOpacite = orthoParcelleOpacite;
  markDirty();
}
function syncControlesOrtho(){
  const o = document.getElementById('orthoOpacite');
  if(o) o.value = Math.round(orthoOpacite*100);
  const ot = document.getElementById('orthoOpaciteTexte');
  if(ot) ot.textContent = Math.round(orthoOpacite*100) + ' %';
  const p = document.getElementById('orthoParcelleOpacite');
  if(p) p.value = Math.round(orthoParcelleOpacite*100);
  const pt = document.getElementById('orthoParcelleOpaciteTexte');
  if(pt) pt.textContent = Math.round(orthoParcelleOpacite*100) + ' %';
  const cb = document.getElementById('chkOrtho');
  if(cb) cb.checked = orthoActif;
}
// Au chargement d'un projet : on restitue les reglages, et on rallume le fond s'il etait actif.
function restaurerOrthoDuProjet(){
  const c = configOrtho(false);
  if(!c){
    // Projet sans reglage enregistre : on eteint proprement plutot que de garder le fond du
    // projet precedent, qui serait cale sur une autre parcelle.
    if(orthoActif) basculerOrthophoto(false);
    return;
  }
  orthoOpacite = c.opacite;
  orthoParcelleOpacite = c.parcelleOpacite;
  syncControlesOrtho();
  if(c.actif) basculerOrthophoto(true);
  else if(orthoActif) basculerOrthophoto(false);
}
let orthoTuiles = [];        // tuiles pretes a afficher, en coordonnees monde (metres)
let orthoChargement = false;
const orthoCache = new Map(); // cle "z/x/y" -> data URI (une tuile n'est telechargee qu'une fois)

function referenceGeoPlan(){
  const p = trouverParcelleCloture();
  if(!p || !p.pts || !p.pts.length) return null;
  if(p.cadastre && p.cadastre.origineLat !== undefined && p.cadastre.origineLat !== null){
    return { lat:p.cadastre.origineLat, lon:p.cadastre.origineLon, x:0, y:0, exact:true };
  }
  // lieuActuel() plutot que p.latitude en direct : sur un plan qui n'a jamais servi au soleil ni
  // a la 3D, les champs de lieu ne sont pas encore poses sur la parcelle (ils le sont au premier
  // acces). Les lire crus renverrait "pas de position" sur un plan qui en a pourtant une.
  const lieu = lieuActuel();
  if(lieu && Number.isFinite(lieu.latitude)){
    const c = centroid(p.pts);
    return { lat:lieu.latitude, lon:lieu.longitude, x:c.x, y:c.y, exact:false };
  }
  return null;
}
function urlTuileOrtho(z, x, y){
  return WMTS_URL + '?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=' + ORTHO_COUCHE +
    '&STYLE=normal&TILEMATRIXSET=PM&FORMAT=image/jpeg&TILEMATRIX=' + z + '&TILEROW=' + y + '&TILECOL=' + x;
}
// Les tuiles sont recuperees en fetch puis converties en data URI, jamais posees en href
// distant : une image d'un autre domaine "salit" le canevas (canvas tainted) et ferait echouer
// l'export PNG - et l'export SVG ne serait plus autonome.
async function chargerTuileOrtho(z, x, y){
  const cle = z + '/' + x + '/' + y;
  if(orthoCache.has(cle)) return orthoCache.get(cle);
  const r = await fetch(urlTuileOrtho(z, x, y), {cache:'force-cache'});
  if(!r.ok) throw new Error('tuile ' + cle + ' : HTTP ' + r.status);
  const blob = await r.blob();
  const dataUri = await new Promise((resolve, reject)=>{
    const fr = new FileReader();
    fr.onload = ()=>resolve(fr.result);
    fr.onerror = ()=>reject(new Error('lecture de la tuile impossible'));
    fr.readAsDataURL(blob);
  });
  orthoCache.set(cle, dataUri);
  return dataUri;
}
async function chargerOrthophoto(){
  const ref = referenceGeoPlan();
  if(!ref) throw new Error('aucune parcelle geolocalisee : importe une parcelle depuis une adresse, ou renseigne le lieu.');
  const proj = projecteurLocal(ref.lat, ref.lon);
  // Emprise a couvrir : celle du plan entier, avec une marge - le fond doit tenir sous les objets
  // qui debordent de la parcelle (batiments mitoyens, chemins).
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  etat.objects.forEach(o=>{
    const pts = o.type === 'circle'
      ? [{x:o.center.x-o.r, y:o.center.y-o.r}, {x:o.center.x+o.r, y:o.center.y+o.r}]
      : (o.pts || []);
    pts.forEach(p=>{
      minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
    });
  });
  if(!Number.isFinite(minX)) throw new Error('plan vide');
  const marge = Math.max(5, (maxX-minX + maxY-minY)*0.05);
  minX -= marge; maxX += marge; minY -= marge; maxY += marge;
  const versLonLat = (x, y)=>proj.versDegres(x - ref.x, y - ref.y);
  const coinSO = versLonLat(minX, minY), coinNE = versLonLat(maxX, maxY);

  // On part du plus haut niveau de detail qui tienne en ORTHO_MAX_TUILES, puis on redescend tant
  // que rien ne revient : la couverture de l'orthophoto ne va pas au meme zoom partout (verifie :
  // sur cette commune le niveau 20 repond 404 alors que le 19 sert bien l'image). Un niveau qui
  // n'existe pas se traduit par un 404 sur toutes ses tuiles, jamais par une erreur explicite.
  for(let z = ORTHO_ZOOM_MAX; z >= 15; z--){
    const x0 = tuileX(coinSO.lon, z), x1 = tuileX(coinNE.lon, z);
    const y0 = tuileY(coinNE.lat, z), y1 = tuileY(coinSO.lat, z);   // y croit vers le sud
    if((x1-x0+1)*(y1-y0+1) > ORTHO_MAX_TUILES) continue;
    // Une seule tuile d'essai avant de lancer les autres : un niveau absent repond 404 sur
    // chacune de ses tuiles, et seize 404 dans la console pour rien noieraient les vraies erreurs.
    try {
      await chargerTuileOrtho(z, Math.floor((x0+x1)/2), Math.floor((y0+y1)/2));
    } catch(e){
      continue;
    }
    const tuiles = [];
    const promesses = [];
    for(let x = x0; x <= x1; x++){
      for(let y = y0; y <= y1; y++){
        const lonO = lonDeTuile(x, z), lonE = lonDeTuile(x+1, z);
        const latN = latDeTuile(y, z), latS = latDeTuile(y+1, z);
        const so = proj.versMetres(lonO, latS), ne = proj.versMetres(lonE, latN);
        const t = {
          z, x, y, dataUri:null,
          // repere du plan : on annule le decalage du point de calage
          xMin: so.x + ref.x, yMin: so.y + ref.y,
          largeur: ne.x - so.x, hauteur: ne.y - so.y
        };
        tuiles.push(t);
        promesses.push(chargerTuileOrtho(z, x, y).then(u=>{ t.dataUri = u; }).catch(()=>{ t.dataUri = null; }));
      }
    }
    await Promise.all(promesses);
    const reussies = tuiles.filter(t=>t.dataUri);
    if(reussies.length){
      orthoTuiles = reussies;
      return { z, nb: reussies.length, total: tuiles.length, exact: ref.exact };
    }
  }
  throw new Error('aucune tuile disponible sur ce secteur (service WMTS injoignable, ou hors couverture)');
}
function placerOrthophoto(){
  if(!orthoActif || !orthoTuiles.length){
    if(orthoGroup.childNodes.length) orthoGroup.innerHTML = '';
    return;
  }
  if(orthoGroup.childNodes.length !== orthoTuiles.length){
    orthoGroup.innerHTML = '';
    orthoTuiles.forEach(t=>{
      const img = document.createElementNS(svgNS, 'image');
      img.setAttributeNS('http://www.w3.org/1999/xlink', 'href', t.dataUri);
      img.setAttribute('href', t.dataUri);
      img.setAttribute('preserveAspectRatio', 'none');
      t.el = img;
      orthoGroup.appendChild(img);
    });
  }
  orthoGroup.setAttribute('opacity', orthoOpacite);
  orthoTuiles.forEach(t=>{
    if(!t.el) return;
    const coin = toScreen({ x:t.xMin, y:t.yMin + t.hauteur });   // coin haut-gauche a l'ecran
    t.el.setAttribute('x', coin.x);
    t.el.setAttribute('y', coin.y);
    t.el.setAttribute('width', Math.max(1, t.largeur*etat.scene.scale));
    t.el.setAttribute('height', Math.max(1, t.hauteur*etat.scene.scale));
  });
}
async function basculerOrthophoto(actif){
  orthoActif = actif;
  const cbHaut = document.getElementById('chkOrtho');
  if(cbHaut) cbHaut.checked = actif;
  if(!actif){ render(); enregistrerConfigOrtho(); return; }
  if(orthoTuiles.length){ render(); enregistrerConfigOrtho(); return; }
  orthoChargement = true;
  const cb = document.getElementById('chkOrtho');
  if(cb) cb.disabled = true;
  try {
    const r = await chargerOrthophoto();
    render();
    enregistrerConfigOrtho();
    showToast('Orthophoto IGN : ' + r.nb + ' tuile(s) au niveau ' + r.z +
      (r.exact ? '.' : ' — calage approximatif (plan sans import cadastre : le fond est posé sur le lieu déclaré de la parcelle).'));
  } catch(e){
    orthoActif = false;
    if(cb) cb.checked = false;
    showToast('Orthophoto indisponible : ' + (e.message || e));
  } finally {
    orthoChargement = false;
    if(cb) cb.disabled = false;
  }
}

// ================= Actualisation des donnees IGN d'un plan existant =================
// Regle : on REMPLACE ce qui vient de l'API (parcelle cadastrale, objets porteurs d'un champ
// bdtopo, zonage PLU), on ne touche a rien d'autre, et on n'importe rien de nouveau. Un batiment
// jamais importe ne doit pas apparaitre d'un coup en doublon de celui dessine a la main ; pour
// ajouter des couches, c'est l'import depuis une adresse qui sert.
//
// Le repere du plan ne bouge pas : la reprojection se cale sur l'origine enregistree a l'import
// (cadastre.origineLat/Lon = le point (0,0) du plan). Sans cela, tout le contenu place par
// l'utilisateur se decalerait par rapport a sa parcelle a chaque actualisation.
// Construit les objets du voisinage a ajouter a un plan existant : parcelles mitoyennes absentes,
// puis leur bati et leur vegetation. Tout est projete dans le repere du plan (origine enregistree
// a l'import), donc rien de ce qui existe deja ne bouge. Les doublons sont ecartes par identifiant
// (idu cadastral, id BD TOPO) : rejouer l'operation deux fois n'ajoute rien la seconde fois.

// Choix de la portee avant d'agir : actualiser le seul contour cadastral n'a pas le meme effet
// que rejouer toutes les couches, et ajouter le voisinage EST un import - il ne doit jamais
// partir d'un simple clic sur un bouton nomme "actualiser".


// ================= Onglet PLU (Geoportail de l'urbanisme) =================
// Le zonage est stocke SUR la parcelle (champ `plu`), comme la cloture et le lieu : il se
// sauvegarde avec le projet sans nouvelle cle a faire transiter par api.php, et il suit la
// parcelle si le plan est exporte en JSON.
document.getElementById('pluInterrogerBtn').addEventListener('click', async function(){
  const parcelle = trouverParcelleCloture();
  if(!parcelle) return;
  const lieu = lieuActuel();
  this.disabled = true;
  const libelleInitial = this.textContent;
  this.textContent = 'Interrogation…';
  try {
    const plu = await interrogerPlu(lieu.longitude, lieu.latitude);
    pushHistory();
    parcelle.plu = plu;
    markDirty();
    renderPanneauPlu(ctxProjet());
    const n = plu.zones.length;
    showToast(n ? ('PLU : zone ' + plu.zones[0].libelle + (n > 1 ? ' (+' + (n-1) + ' autre(s))' : '') + '.')
                : 'PLU : aucun zonage renvoye pour ce point.');
  } catch(e){
    showToast('Interrogation du PLU impossible : ' + (e.message || e));
  } finally {
    this.disabled = false;
    this.textContent = libelleInitial;
  }
});









// One cut-list table, used for both the deck boards and the structural timber - the only thing
// that differs is which set of per-length prices it reads and writes.
function debitTable(host, c, d, lengths, cle){
  const tbl = document.createElement('table');
  tbl.className = 'attrTable';
  const head = document.createElement('tr');
  head.innerHTML = '<th>Longueur</th><th>Qte</th><th>Metre</th><th>Prix / barre</th>' +
                   '<th>Prix / m²</th><th>Total</th><th>Usage</th>';
  tbl.appendChild(head);
  lengths.forEach(L=>{
    const n = d.achats[L], r = d.roles[L] || {entiere:0, ajustee:0, recoupee:0, troncon:0, rebutMl:0, potMl:0};
    const parts = [];
    if(r.entiere) parts.push(r.entiere + ' posee entiere (tombe juste)');
    if(r.ajustee) parts.push(r.ajustee + ' arasee, chute ' +
      Math.round(100*r.rebutMl/r.ajustee) + ' cm au rebut');
    if(r.recoupee) parts.push(r.recoupee + ' recoupee, ' +
      Math.round(100*r.potMl/r.recoupee) + ' cm au pot');
    if(r.troncon) parts.push(r.troncon + ' en troncon courant, about sur appui');
    const tr = document.createElement('tr');
    const cell = t => { const td=document.createElement('td'); td.textContent=t; return td; };
    tr.appendChild(cell(L.toFixed(2).replace(/\.?0+$/,'') + ' m'));
    tr.appendChild(cell(String(n)));
    tr.appendChild(cell((n*L).toFixed(2) + ' ml'));

    // The two quotes of the same board, each recomputed from the other. Whichever the merchant
    // gives you is the one you type; the other follows.
    const champ = (valeur, titre, appliquer) => {
      const td = document.createElement('td');
      const inp = document.createElement('input');
      inp.type='number'; inp.step='0.01'; inp.min='0'; inp.style.width='85px';
      inp.value = valeur.toFixed(2);
      inp.title = titre;
      if(!prixPersonnalise(c, cle, L)) inp.style.opacity = '0.7';
      inp.addEventListener('change', ()=>{
        const v = parseFloat(inp.value);
        appliquer(isNaN(v) ? null : v);
        refreshTerrasseView();
      });
      td.appendChild(inp);
      return td;
    };
    tr.appendChild(champ(prixBarre(c,cle,L), 'Prix d\'une barre de ' + L + ' m',
      v => setPrixBarre(c, cle, L, v)));
    tr.appendChild(champ(prixM2De(c,cle,L), 'Prix au m² pour cette longueur — recalcule le prix de la barre',
      v => setPrixM2(c, cle, L, v)));

    const tdTot = cell((n*prixBarre(c,cle,L)).toFixed(2) + ' €');
    tdTot.style.cssText = 'font-variant-numeric:tabular-nums;';
    tr.appendChild(tdTot);

    const td = cell(parts.join(' · ') || '—');
    td.style.cssText = 'font-size:0.82rem; color:var(--ink-soft);';
    tr.appendChild(td);
    tbl.appendChild(tr);
  });
  const tot = document.createElement('tr');
  tot.style.fontWeight = '600';
  tot.innerHTML = '<td>Total</td><td>' + lengths.reduce((s,L)=>s+d.achats[L],0) +
    ' barres</td><td>' + d.achatMl.toFixed(2) + ' ml</td><td></td><td></td><td>' +
    coutDebit(c, d, cle).toFixed(2) + ' €</td><td></td>';
  tbl.appendChild(tot);
  host.appendChild(tbl);
}
// The stock lengths for one product, edited where the cut-list that uses them is shown.
function champLongueurs(c, champ, libelle){
  const wrap = document.createElement('div');
  wrap.className = 'controls';
  const lab = document.createElement('label');
  lab.textContent = libelle + ' : ';
  lab.style.cssText = 'font-size:0.85rem; margin-right:6px;';
  const inp = document.createElement('input');
  inp.type='text'; inp.value = c[champ] || ''; inp.style.minWidth = '190px';
  inp.title = 'Longueurs disponibles chez ton fournisseur, en metres, separees par des virgules';
  inp.addEventListener('change', ()=>{ c[champ] = inp.value; refreshTerrasseView(); });
  wrap.appendChild(lab); wrap.appendChild(inp);
  return wrap;
}
function bilanDebit(c, d){
  const perte = d.achatMl>0 ? 100*d.chuteMl/d.achatMl : 0;
  const el = document.createElement('div');
  el.className = 'hint';
  el.innerHTML = '<b>Bilan.</b> Lineaire reellement pose : ' + d.reelMl.toFixed(2) +
    ' ml. Achete : ' + d.achatMl.toFixed(2) + ' ml, soit ' + perte.toFixed(1) + ' % de chute — ' +
    'dont ' + d.restantMl.toFixed(2) + ' ml en chutes reutilisables restantes (≥ ' +
    (c.chuteMinReutilisable||50) + ' cm, a garder) et ' + d.perdueMl.toFixed(2) + ' ml de rebut.' +
    (d.pool.length ? ' Chutes en fin de chantier : ' +
      d.pool.slice(0,10).map(x=>x.toFixed(2)+' m').join(', ') +
      (d.pool.length>10 ? ' …' : '') + '.' : '');
  return el;
}

// The structural timber cut-list, plus the screw price - the two other things that get bought.
function prixPersonnaliseplot(c, m){
  const p = c.prixPlots ? c.prixPlots[m.cle] : undefined;
  return p !== undefined && p !== null && isFinite(p) && p >= 0;
}

// The cut-list, with what each purchased length is actually for. A bare count of boards is not
// much use on site; knowing that the 3 m are the through-runs and the 1,5 m are the tail ends is.
function renderDebitLames(obj, layers){
  const host = document.getElementById('terrasseDebitBox');
  if(!host) return;
  const c = ensureConstruction(obj);
  host.innerHTML = '';
  const d = computeDebitLames(obj, layers);
  const lengths = Object.keys(d.achats).map(parseFloat).sort((a,b)=>b-a);
  if(!lengths.length){ host.innerHTML = '<div class="hint">Aucune lame a debiter.</div>'; return; }

  const entraxeAppui = (c.avecLambourde ? (c.lambourdeEntraxe||40) : (c.soliveEntraxe||40));
  const intro = document.createElement('div');
  intro.className = 'hint';
  intro.textContent = 'Metre au lineaire reel des lames tracees (bordure a plat comprise), ' +
    'debitees dans les longueurs du fournisseur. Les chutes d\'au moins ' +
    (c.chuteMinReutilisable||50) + ' cm sont remises au pot et reservent sur une autre travee' +
    (c.jointsSurAppui !== false
      ? ' ; chaque about tombe sur un appui, donc un troncon de milieu de travee est coupe a un multiple de ' + entraxeAppui + ' cm.'
      : ' ; les abouts ne sont pas contraints de tomber sur un appui.');
  host.appendChild(intro);

  host.appendChild(champLongueurs(c, 'longueursLames', 'Longueurs achetables (m)'));
  debitTable(host, c, d, lengths, 'lames');
  const cout = coutDebit(c, d, 'lames');
  const perso = lengths.filter(L=>prixPersonnalise(c,'lames',L)).length;
  host.appendChild(Object.assign(document.createElement('div'), { className:'hint',
    textContent: 'Prix par barre : ' +
      (perso ? perso + ' sur ' + lengths.length + ' saisis, les autres estimes' : 'tous estimes') +
      ' a partir du tarif au m² de l\'essence (' + (ESSENCE_PRICES[c.essenceBois]||ESSENCE_PRICES.autre).label +
      ') pour une lame de ' + (c.largeurLame||140) + ' mm — soit ' +
      (cout / (d.achatMl||1)).toFixed(2) + ' €/ml en moyenne, ou ' +
      (cout / (d.reelMl||1)).toFixed(2) + ' €/ml rapporte au lineaire reellement pose. ' +
      'Saisis le tarif du fournisseur pour chaque longueur : le total alimente la ligne ' +
      '« Lames » du BOM au-dessus, qui n\'est donc pas saisissable a la main.' }));
  host.appendChild(bilanDebit(c, d));
  host.appendChild(Object.assign(document.createElement('div'), {
    className:'hint',
    textContent:'Methode : chaque travee est resolue exactement (le jeu de barres le moins cher ' +
      'qui la couvre), puis les chutes sont mutualisees entre travees. La mutualisation venant ' +
      'apres, il reste 1 a 2 % a gagner sur la table — d\'ou un effet a connaitre : une gamme ' +
      'plus courte fait parfois mieux qu\'une gamme large, parce que des barres toutes pareilles ' +
      'produisent des chutes toutes pareilles, donc reutilisables. Essaie de retirer des ' +
      'longueurs de la liste et compare le pourcentage de chute.'
  }));
}



// Hauteur finie : du sol fini au dessus des lames. C'est le chiffre qui decide d'une marche,
// d'un seuil de porte ou d'un garde-corps, et il n'apparaissait nulle part - seulement de
// maniere implicite dans le plan de coupe. Une seule definition, partagee.
// Ce que l'appui apporte AU-DESSUS du sol fini. Une vis de fondation est vissee dans le sol :
// sa longueur est enterree et ne sureleve rien. Seule sa tete reglable, si on la fait depasser,
// souleve la structure. Un plot est pose sur le sol : toute sa hauteur de reglage compte. C'est
// la difference qui separe une terrasse sur vis, de plain-pied, d'une terrasse sur plots.
function hauteurAppuiMm(c){
  return estPlots(c) ? (c.hauteurPlot||10)*10 : (c.depassementVis||0)*10;
}
function hauteurFinieMm(obj){
  const c = ensureConstruction(obj);
  const plotSimple = estPlots(c) && !c.plotAvecSolives;
  const soliveMm = plotSimple ? 0 : (dimsSection(c.soliveSection).h);
  const lambMm = (c.avecLambourde || estPlots(c)) ? dimsSection(sectionLambourde(c)).h : 0;
  return hauteurAppuiMm(c) + soliveMm + lambMm + (c.epaisseurLame||25);
}

// Elevation par defaut selon la fonction de l'objet, pour qu'un champ jamais touche affiche
// quand meme quelque chose de plausible au premier essai (une maison n'est pas un massif). Un
// simple ordre de grandeur, pas une donnee reglementaire - modifiable objet par objet.
// La hauteur d'un objet, en metres au-dessus du sol. Une terrasse ne prend PAS le champ manuel :
// elle a deja sa propre modelisation (appui + structure + lame, cf. hauteurFinieMm ci-dessus), la
// seule source qui ne puisse pas se desynchroniser du reste du chiffrage. Tout le reste (maison,
// arbre, mobilier...) n'a pas cette modelisation : l'utilisateur la saisit a la main.
function elevationOf(o){
  if(o.fonction === 'terrasse' && o.type==='polygon' && o.pts && o.pts.length>=3){
    return hauteurFinieMm(o)/1000;
  }
  return (o.elevation !== undefined && o.elevation !== null) ? o.elevation : elevationParDefaut(o.fonction);
}

function rebuildTerrasseSelector(){
  const div = document.getElementById('terrasseSelector');
  div.innerHTML = '';
  const terrasses = etat.objects.filter(o=>o.fonction==='terrasse');
  const empty = document.getElementById('terrasseEmpty');
  const content = document.getElementById('terrasseContent');
  if(terrasses.length===0){
    etat.terrasseSelectedKey = null;
    // La Vue 3D, elle, ne depend pas d'une terrasse : un plan de parcelle avec ses batiments se
    // regarde en 3D tel quel. Les autres sous-onglets (construction, BOM, coupe...) n'auraient
    // rien a decrire et restent derriere le message d'accueil.
    if(terrasseSubTab === '3d'){
      empty.style.display='none'; content.style.display='block';
      const note = document.createElement('span');
      note.style.cssText = 'font-family:"Helvetica Neue",Arial,sans-serif; font-size:0.85rem; color:var(--ink-soft);';
      note.textContent = 'Plan sans terrasse — vue 3D du terrain et des objets.';
      div.appendChild(note);
      return true;
    }
    empty.style.display='block'; content.style.display='none';
    return false;
  }
  empty.style.display='none'; content.style.display='block';
  if(!etat.terrasseSelectedKey || !terrasses.some(o=>o.key===etat.terrasseSelectedKey)) etat.terrasseSelectedKey = terrasses[0].key;
  terrasses.forEach(o=>{
    const b = document.createElement('button');
    b.className = 'objbtn' + (o.key===etat.terrasseSelectedKey ? ' active' : '');
    b.textContent = o.name;
    b.addEventListener('click', ()=>{ etat.terrasseSelectedKey=o.key; refreshTerrasseView(); });
    div.appendChild(b);
  });
  const selectedObj = terrasses.find(o=>o.key===etat.terrasseSelectedKey);
  if(selectedObj){
    const surf = document.createElement('span');
    surf.style.cssText = 'font-family:"Helvetica Neue",Arial,sans-serif; font-size:0.85rem; color:var(--ink-soft); margin-left:8px;';
    const hMm = hauteurFinieMm(selectedObj);
    surf.textContent = 'Surface : ' + shoelace(selectedObj.pts).toFixed(2) + ' m²' +
      '  (hauteur finie ' + (hMm/10).toFixed(1).replace(/\.0$/,'') + ' cm)';
    surf.title = 'Hauteur du sol fini au dessus des lames : ' +
      (estPlots(ensureConstruction(selectedObj)) ? 'plot' : 'depassement de tete de vis') +
      ' + structure + lame';
    div.appendChild(surf);
  }
  return true;
}


// Everything the engine used to hold as a literal, laid out where it can be read and changed.
// A constant nobody can see is a constant nobody can check - and these drive every quantity in
// the BOM, so they belong in front of the user rather than buried in the source.

// Independent per-layer visibility (not exclusive tabs): each layer has its own show/hide,
// so any combination can be viewed together instead of one at a time.
let terrasseLayerVisible = { vis:true, cadre:true, solives:true, lambourdes:true, lames:true, lameRive:true, lamePlat:true };
const TERRASSE_LAYER_DEFS = [
  ['vis','Vis', '#235e6e'],
  ['cadre','Cadre (solive de rive)', '#4a2f18'],
  ['solives','Solives', '#6b4a2a'],
  ['lambourdes','Lambourdes', '#b45a2a'],
  ['lames','Lames', '#c9a15a'],
  ['lameRive','Lame de rive (verticale)', '#5c3a1e'],
  ['lamePlat','Planche plate (horizontale)', '#d8b06a']
];
function renderTerrasseLayerTabs(obj){
  const div = document.getElementById('terrasseLayerTabs');
  div.innerHTML = '';
  const cMode = ensureConstruction(obj);
  TERRASSE_LAYER_DEFS.forEach(([key,label,color])=>{
    if(key==='vis') label = estPlots(cMode) ? 'Plots' : 'Vis';
    if(key==='solives' && estPlots(cMode) && !cMode.plotAvecSolives) return; // pas de solives
    const wrap = document.createElement('label');
    wrap.style.cssText = 'display:inline-flex; align-items:center; gap:5px; margin-right:16px; font-size:0.85rem; cursor:pointer;';
    const swatch = document.createElement('span');
    swatch.style.cssText = 'display:inline-block; width:10px; height:10px; border-radius:2px; background:'+color+';';
    const cb = document.createElement('input'); cb.type='checkbox'; cb.checked = terrasseLayerVisible[key];
    cb.addEventListener('change', ()=>{ terrasseLayerVisible[key]=cb.checked; renderTerrasseLayerView(obj); });
    wrap.appendChild(cb); wrap.appendChild(swatch); wrap.appendChild(document.createTextNode(label));
    div.appendChild(wrap);
  });
  const cc = ensureConstruction(obj);
  document.getElementById('terrasseLayerHint').textContent =
    (estPlots(cc)
      ? "Vis : implantation des plots (resserree sous tout objet de fonction equipement). Solives : structure primaire, absente en pose simple sur plots. "
      : "Vis : grille de fondation (resserree sous tout objet de fonction equipement). Solives : structure primaire. ")
    + "Lambourdes : structure secondaire, seulement si activee dans Construction. Lames : sens de pose des lames. "
    + "Lame de rive (verticale) : planche sur chant suspendue sous les lames, cache la structure. "
    + "Planche plate (horizontale) : cadre pose a plat au niveau des lames. Les deux font le tour "
    + "et ne sont dessinees que si activees dans Construction.";
}

const terrasseLayerGroup = document.createElementNS(svgNS,'g');
svg.appendChild(terrasseLayerGroup);

function renderTerrasseLayerView(obj){
  terrasseLayerGroup.innerHTML = '';
  if(etat.appMode!=='terrasse' || !obj) return;
  const layers = computeTerrasseLayers(obj, etat.objects);
  // Thinner/dashed strokes once more than one layer is shown together, so they stay
  // readable stacked on top of each other instead of turning into a solid mess.
  const multi = Object.values(terrasseLayerVisible).filter(Boolean).length > 1;

  function drawLines(segs, color, width, dash){
    segs.forEach(seg=>{
      const a=toScreen(seg.a), b=toScreen(seg.b);
      const l=document.createElementNS(svgNS,'line');
      l.setAttribute('x1',a.x); l.setAttribute('y1',a.y); l.setAttribute('x2',b.x); l.setAttribute('y2',b.y);
      l.setAttribute('stroke',color); l.setAttribute('stroke-width',width);
      if(dash) l.setAttribute('stroke-dasharray',dash);
      l.setAttribute('stroke-linecap','round');
      terrasseLayerGroup.appendChild(l);
    });
  }
  // Screws are colour-coded by the job they do, so the perimeter ring and the spa
  // densification read apart from the field at a glance.
  const VIS_ROLE_COLOR = { rive:'#0f3d49', spa:'#a8452a', courant:'#235e6e' };
  function drawPoints(pts, color){
    pts.forEach(p=>{
      const s=toScreen(p);
      const ci=document.createElementNS(svgNS,'circle');
      const isRive = p.role==='rive';
      ci.setAttribute('cx',s.x); ci.setAttribute('cy',s.y); ci.setAttribute('r', isRive?6:5);
      ci.setAttribute('fill', VIS_ROLE_COLOR[p.role] || color);
      ci.setAttribute('stroke','#fff'); ci.setAttribute('stroke-width','1.2');
      terrasseLayerGroup.appendChild(ci);
    });
  }

  if(terrasseLayerVisible.lames) drawLines(layers.lames, '#c9a15a', multi?0.7:1.5, multi?'2 2':null);
  if(terrasseLayerVisible.lambourdes) drawLines(layers.lambourdes, '#b45a2a', multi?1.5:3);
  if(terrasseLayerVisible.solives) drawLines(layers.solives, '#6b4a2a', multi?2:4);
  if(terrasseLayerVisible.cadre) drawLines(layers.cadre, '#4a2f18', multi?3:5);
  if(terrasseLayerVisible.lameRive) drawLines(layers.lameRive, '#5c3a1e', multi?2:4);
  if(terrasseLayerVisible.lamePlat) drawLines(layers.lamePlat, '#d8b06a', multi?2:4);
  if(terrasseLayerVisible.vis) drawPoints(layers.vis, '#235e6e');
}

function renderBOMTable(obj){
  const c = ensureConstruction(obj);
  const layers = computeTerrasseLayers(obj, etat.objects);
  const lines = computeBOM(obj, layers);
  c.bom = lines;
  renderDebitLames(obj, layers);
  renderDebitBois(obj, layers, { bilanDebit, champLongueurs, debitTable, hauteurAppuiMm, hauteurFinieMm, prixPersonnaliseplot, pushHistory, refreshTerrasseView, objets: ()=>etat.objects });

  const tbl = document.getElementById('terrasseBomTable');
  tbl.innerHTML = '';
  const head = document.createElement('tr');
  head.innerHTML = '<th>Poste</th><th>Qte</th><th>Prix bas</th><th>Prix haut</th><th>Prix reel (total ligne)</th>';
  tbl.appendChild(head);

  let totalBas=0, totalHaut=0;
  const updateTotals = () => {
    let reelSum=0, anyReel=false;
    lines.forEach(l=>{ if(l.prixReel!==null && l.prixReel!==undefined){ reelSum+=l.prixReel; anyReel=true; } });
    document.getElementById('terrasseBomTotals').textContent =
      'Estime : ' + totalBas.toFixed(0) + ' € – ' + totalHaut.toFixed(0) + ' €' +
      (anyReel ? '   |   Reel saisi : ' + reelSum.toFixed(2) + ' €' : '');
  };

  lines.forEach(l=>{
    const tr = document.createElement('tr');
    const td0=document.createElement('td'); td0.textContent=l.label;
    const td1=document.createElement('td'); td1.textContent = l.qte.toFixed(l.unite==='u'?0:2)+' '+l.unite;
    const td2=document.createElement('td'); td2.textContent = l.prixBas ? (l.prixBas.toFixed(2)+' €/'+l.unite) : '—';
    const td3=document.createElement('td'); td3.textContent = l.prixHaut ? (l.prixHaut.toFixed(2)+' €/'+l.unite) : '—';
    const td4=document.createElement('td');
    if(l.calcule){
      // Priced from the cut-list, length by length: editing it here as well would give two
      // sources of truth that can disagree.
      td4.textContent = l.prixReel.toFixed(2) + ' €';
      td4.style.cssText = 'font-variant-numeric:tabular-nums;';
      const note = document.createElement('div');
      note.style.cssText = 'font-size:0.78rem; color:var(--ink-soft);';
      note.textContent = (typeof l.calcule === 'string') ? l.calcule : 'calcule';
      td4.appendChild(note);
    } else {
      const reelInp = document.createElement('input'); reelInp.type='number'; reelInp.step='0.01'; reelInp.min='0';
      reelInp.placeholder = 'non saisi';
      if(l.prixReel!==null && l.prixReel!==undefined) reelInp.value = l.prixReel;
      reelInp.addEventListener('change', ()=>{
        const v = parseFloat(reelInp.value);
        l.prixReel = isNaN(v) ? null : v;
        const idx = c.bom.findIndex(x=>x.poste===l.poste);
        if(idx>=0) c.bom[idx].prixReel = l.prixReel;
        updateTotals();
      });
      td4.appendChild(reelInp);
    }
    tr.appendChild(td0); tr.appendChild(td1); tr.appendChild(td2); tr.appendChild(td3); tr.appendChild(td4);
    tbl.appendChild(tr);

    totalBas += (l.prixBas||0)*l.qte;
    totalHaut += (l.prixHaut||0)*l.qte;
  });
  updateTotals();
}

// ================= Coupe verticale (empilement des couches, a l'echelle) =================

// ================= Vue 3D (Three.js, charge a la demande depuis un CDN) =================
// Seule dependance externe de tout le fichier, et uniquement chargee si on ouvre la vue 3D :
// le reste de l'appli reste 100% autonome sans connexion internet.

// --- Soleil de la Vue 3D (memes regles que la visionneuse GLB, etat separe : les deux vues
// peuvent etre reglees a des moments differents sans se marcher dessus) ---
let vue3dDateStr = new Date().toISOString().slice(0,10);
let vue3dMinutes = 720;            // minutes depuis minuit ; 720 = midi
let vue3dIntensiteSoleil = 1;      // multiplicateur du soleil ; 1 = eclairage physique de l'heure
let vue3dLumiereAppoint = true;    // lumieres autres que le soleil (appoint directe + ambiante)
let vue3dSemaineAffichee = 0;
function syncSemaineVue3dDepuisDate(){
  const { semaine } = anneeEtSemaineDepuisDate(vue3dDateStr);
  vue3dSemaineAffichee = semaine;
  const s = document.getElementById('vue3dSemaine');
  if(s) s.value = semaine;
}
// Remet les commandes en accord avec l'etat au moment ou la scene est (re)construite : la Vue 3D
// se reconstruit a chaque case cochee, les curseurs, eux, doivent garder ce qui a ete regle.
function syncControlesSoleilVue3d(){
  const d = document.getElementById('vue3dDate');
  if(d) d.value = vue3dDateStr;
  syncSemaineVue3dDepuisDate();
  const h = document.getElementById('vue3dHeure');
  if(h) h.value = vue3dMinutes;
  const ht = document.getElementById('vue3dHeureTexte');
  if(ht) ht.textContent = formatHeureMin(vue3dMinutes);
  const i = document.getElementById('vue3dIntensite');
  if(i) i.value = Math.round(vue3dIntensiteSoleil*100);
  const it = document.getElementById('vue3dIntensiteTexte');
  if(it) it.textContent = Math.round(vue3dIntensiteSoleil*100) + ' %';
  const cb = document.getElementById('vue3dLumiereAppoint');
  if(cb) cb.checked = vue3dLumiereAppoint;
  const lieu = lieuActuel();
  const el = document.getElementById('vue3dLieu');
  if(el) el.textContent = '📍 ' + lieu.nom + ' — ' + lieu.latitude.toFixed(4).replace('.',',') + '° N, ' + lieu.longitude.toFixed(4).replace('.',',') + '° E';
}
// Hauteur, azimut, intensite et couleur du soleil sont deduits ensemble de la date/heure/lieu :
// ce n'est pas un gradateur. Sous l'horizon, le soleil direct s'eteint vraiment (0) au lieu de
// rester rasant, et seules l'ambiante et l'appoint gardent la scene lisible - decochables.
// La scene de la Vue 3D est centree sur l'origine (contrairement a celle de la visionneuse GLB,
// centree sur la boite englobante du modele), d'ou le centre implicite (0,0,0) ici.
function appliquerLumiereVue3d(){
  if(!vue3d.scene || !vue3d.scene.dirLight) return;
  const { dirLight, dirFill, hemiLight, extent } = vue3d.scene;
  const [annee, mois, jour] = vue3dDateStr.split('-').map(Number);
  const lieu = lieuActuel();
  const { elevRad, azRad } = positionSoleil(annee, mois, jour, vue3dMinutes/60, lieu.latitude, lieu.longitude);
  const facteurJour = Math.max(0, Math.min(1, (elevRad*180/Math.PI)/10));
  const elevAffichee = Math.max(SOLEIL_ELEV_PLANCHER, elevRad);
  const dist = SOLEIL_DIST_FACTOR * extent;
  const horiz = Math.cos(elevAffichee) * dist;
  // Meme repere que le reste de la scene : X = Est, Y = hauteur, Nord = -Z.
  dirLight.position.set(Math.sin(azRad)*horiz, Math.sin(elevAffichee)*dist, -Math.cos(azRad)*horiz);
  dirLight.intensity = facteurJour*0.75*vue3dIntensiteSoleil;
  dirLight.color.copy(new THREE.Color(0xff8a4c)).lerp(new THREE.Color(0xffffff), facteurJour);
  dirFill.intensity = 0.03 + facteurJour*0.27;
  hemiLight.intensity = 0.12 + facteurJour*0.38;
  dirFill.visible = vue3dLumiereAppoint;
  hemiLight.visible = vue3dLumiereAppoint;
  // Lecture chiffree a cote du curseur : sans elle, impossible de savoir si une scene sombre
  // vient d'un soleil couche, d'un batiment qui fait de l'ombre, ou d'un reglage d'intensite.
  const info = document.getElementById('vue3dSoleilInfo');
  if(info){
    const elevDeg = elevRad*180/Math.PI;
    let azDeg = (azRad*180/Math.PI) % 360;
    if(azDeg < 0) azDeg += 360;
    const rose = ['N','NE','E','SE','S','SO','O','NO'][Math.round(azDeg/45) % 8];
    info.textContent = elevDeg <= 0
      ? '🌙 soleil couché'
      : '↑ ' + Math.round(elevDeg) + '° — vient du ' + rose + ' (' + Math.round(azDeg) + '°)';
  }
  // Rendu immediat, sans attendre la boucle d'animation : celle-ci tourne sur
  // requestAnimationFrame, que le navigateur met en pause des que l'onglet passe en arriere-plan
  // (le reglage se ferait alors sans effet visible au retour tant qu'aucune image n'est produite).
  vue3d.scene.renderer.render(vue3d.scene.scene, vue3d.scene.camera);
}
// Une instance THREE.Texture par usage plutot qu'un cache partage : cloner une texture avant la
// fin de son chargement la prive definitivement de l'image (verifie - le clone garde un
// `.image` vide meme apres coup, TextureLoader ne relie pas les deux de facon vivante), et
// chaque objet a de toute facon son propre `repeat` a regler selon sa taille. Le second
// telechargement de la meme URL passe par le cache HTTP du navigateur, donc reste bon marche.
function chargerTexturePolyhaven(url){
  const tex = new THREE.TextureLoader().load(url, img=>{
    // Hard safety net regardless of which labeled resolution the URL pointed to (see the
    // comment on the 1k/2k selection above): if the decoded image is still bigger than this on
    // either side, downscale it onto a canvas before it stays resident as GPU texture memory.
    // Uncompressed RGBA at 4k (4096x4096) is ~64 Mo of GPU memory for ONE map on ONE object -
    // on an iPhone that's a large chunk of the whole tab's memory budget, and exceeding it is
    // what silently kills the page (no catchable JS error, since the OS ends the process).
    const MAX_DIM = 1024;
    const img0 = tex.image;
    if(img0 && (img0.width > MAX_DIM || img0.height > MAX_DIM)){
      const scale = MAX_DIM / Math.max(img0.width, img0.height);
      const c = document.createElement('canvas');
      c.width = Math.round(img0.width*scale); c.height = Math.round(img0.height*scale);
      c.getContext('2d').drawImage(img0, 0, 0, c.width, c.height);
      tex.image = c;
      tex.needsUpdate = true;
    }
  });
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}
// Chargee separement de THREE/OrbitControls, et seulement au premier export GLB - la plupart des
// sessions ouvrent la Vue 3D sans jamais exporter, inutile d'alourdir ce chemin la pour tout le monde.
let gltfLoaderLoaded = false;
function ensureGLTFLoaderLoaded(cb){
  if(gltfLoaderLoaded && window.THREE && window.THREE.GLTFLoader){ cb(); return; }
  const s = document.createElement('script');
  s.src = 'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/loaders/GLTFLoader.js';
  s.onload = () => { gltfLoaderLoaded = true; cb(); };
  s.onerror = () => showErrBanner('Impossible de charger le lecteur GLB (connexion internet requise pour cette fonctionnalite).');
  document.head.appendChild(s);
}
// Frees GPU resources (geometries, materials, textures) held by every mesh in a scene, so
// repeatedly rebuilding the 3D view (buildThreeScene / GLB viewer) doesn't leak VRAM: disposing
// only the renderer leaves every geometry/material/texture that was ever uploaded still resident
// on the GPU, since disposal isn't automatic when objects merely lose their scene references.

// ================= Visionneuse GLB (relit le dernier .glb reellement exporte) =================
// Scene Three.js totalement separee de `vue3d.scene` (la Vue 3D "live", construite depuis les
// donnees du plan) : les deux peuvent exister independamment, fermer l'une ne doit pas perturber
// l'autre. Celle-ci part d'un ArrayBuffer deja fige (glb.dernierExporte) plutot que des objets du
// plan, donc pas d'`extent` connu a l'avance - le cadrage de camera se deduit de la boite
// englobante du modele charge, et l'eclairage (absent du GLB, qui n'exporte que la geometrie/les
// materiaux) est ajoute ici comme dans buildThreeScene.
// Hauteur du soleil a midi (t=0.5) et distance a la scene, retrouvees depuis l'ancienne position
// fixe (centre + rayon*(2,3,1.2)) pour rester dans la meme gamme deja tuneee visuellement.
// Lieu fixe (Le Vesinet, Yvelines) utilise pour la position du soleil - rattache a la parcelle
// comme la cloture (memes champs lazy-assignes au premier acces) pour se sauvegarder avec le
// projet sans faire transiter une nouvelle cle par api.php.
function lieuActuel(){
  const p = trouverParcelleCloture();
  if(!p) return LIEU_DEFAUT;
  if(p.latitude === undefined || p.latitude === null) p.latitude = LIEU_DEFAUT.latitude;
  if(p.longitude === undefined || p.longitude === null) p.longitude = LIEU_DEFAUT.longitude;
  if(!p.nomLieu) p.nomLieu = LIEU_DEFAUT.nom;
  return { nom: p.nomLieu, latitude: p.latitude, longitude: p.longitude };
}
// Libelle du lieu, partage par l'entete du plan, la Vue 3D et la Visionneuse GLB : une seule
// formulation, donc pas de risque d'en voir deux differentes sur la meme page.
function libelleLieu(){
  const lieu = lieuActuel();
  return '📍 ' + lieu.nom + ' — ' + lieu.latitude.toFixed(4).replace('.',',') + '° N, ' +
         lieu.longitude.toFixed(4).replace('.',',') + '° E';
}
function syncLieuGlbViewer(){
  const el = document.getElementById('glbViewerLieu');
  if(el) el.textContent = libelleLieu();
}
// Entete du plan : le lieu se met a jour quand la parcelle change (import cadastre, import JSON,
// actualisation IGN), pas seulement au demarrage.
function syncLieuTitre(){
  const el = document.getElementById('titreLieu');
  if(!el) return;
  const p = trouverParcelleCloture();
  el.textContent = p ? libelleLieu() : '';
  el.title = p ? 'Position de la parcelle : elle cale la course du soleil, le fond orthophoto et l\'interrogation du PLU.' : '';
}
// Semaine de l'annee (0-52, 7 jours pile depuis le 1er janvier - pas la semaine ISO, on veut juste
// un pas regulier de 7 jours pour naviguer vite d'une semaine a l'autre, pas la numerotation
// officielle) : sert au curseur "semaine" a cote de la date, synchronise dans les deux sens avec
// elle (deplacer l'un met a jour l'autre).
function anneeEtSemaineDepuisDate(dateStr){
  const [annee, mois, jour] = dateStr.split('-').map(Number);
  const jours = Math.floor((Date.UTC(annee,mois-1,jour) - Date.UTC(annee,0,1)) / 86400000);
  return { annee, semaine: Math.min(52, Math.floor(jours/7)) };
}
// Le curseur affiche une position (semaine de l'annee, juste pour se reperer visuellement), mais
// chaque deplacement decale la date COURANTE de 7 jours par semaine de difference plutot que de
// recalculer une position absolue depuis le 1er janvier - sinon une date qui ne tombe pas pile sur
// un multiple de 7 jours (le cas general) sauterait d'un nombre de jours irregulier au premier
// cran. glbViewerSemaineAffichee memorise la derniere valeur du curseur pour calculer ce delta.
let glbViewerSemaineAffichee = 0;
function syncSemaineDepuisDate(){
  const { semaine } = anneeEtSemaineDepuisDate(glb.dateStr);
  glbViewerSemaineAffichee = semaine;
  document.getElementById('glbViewerSemaine').value = semaine;
}
// Deduit la position du soleil (date + heure choisies, lieu fixe) puis en tire hauteur, intensite
// et couleur ensemble - pas un simple gradateur : sous l'horizon (nuit), l'intensite tombe a 0 sur
// les 10 derniers degres avant/apres, independamment du plancher de position (qui, lui, evite juste
// un rayon exactement rasant, pour des raisons de rendu).
function rafraichirVisionneuseGlb(camaraAConserver){
  const empty = document.getElementById('glbViewerEmpty');
  const content = document.getElementById('glbViewerContent');
  const loading = document.getElementById('glbViewerLoading');
  if(!glb.dernierExporte){
    empty.style.display = 'block'; content.style.display = 'none'; loading.style.display = 'none';
    return;
  }
  // Mesuree AVANT de cacher #glbViewerContent (voir le commentaire dans buildGlbViewerScene) :
  // sinon le host, descendant d'un ancetre display:none le temps du sablier, mesurerait 0 et
  // retomberait sur la taille par defaut meme en plein ecran.
  const host = document.getElementById('glbViewerCanvasHost');
  const tailleHost = { w: host.clientWidth || 0, h: host.clientHeight || 0 };
  // Le sablier couvre a la fois le chargement de Three/GLTFLoader (reseau, la premiere fois
  // seulement) et l'analyse du modele lui-meme (GLTFLoader.parse) : le contenu reste cache tant
  // que la scene n'est pas prete, plutot que de montrer un canevas vide pendant ce temps.
  empty.style.display = 'none'; content.style.display = 'none'; loading.style.display = 'block';
  ensureThreeLoaded(()=>{
    ensureGLTFLoaderLoaded(()=>{
      buildGlbViewerScene(camaraAConserver, tailleHost, { lieuActuel, render, renderVue3DSelect });
    });
  });
}
// Un nouvel export pendant que l'onglet est deja ouvert doit se refleter sans que l'utilisateur
// ait besoin de le rouvrir - mais ne construit rien si l'onglet n'est pas affiche (pas de scene
// qui tourne en arriere-plan sans que personne ne la regarde).
function rafraichirVisionneuseGlbSiOuverte(){
  if(glb.ouvert) rafraichirVisionneuseGlb();
}
// Panneau independant (pas un troisieme appMode, cf. la note dans setAppMode) : la Visionneuse
// GLB n'a rien a voir avec les donnees du plan ou de la terrasse, contrairement a "Vue 3D" qui
// est un raccourci visuel vers Mode Terrasse.
function ouvrirVisionneuseGlb(){
  glb.ouvert = true;
  document.getElementById('modePlanBtn').classList.remove('active');
  document.getElementById('modeTerrasseBtn').classList.remove('active');
  document.getElementById('mode3dBtn').classList.remove('active');
  document.getElementById('glbViewerBtn').classList.add('active');
  document.getElementById('selector').style.display = 'none';
  document.getElementById('planActions').style.display = 'none';
  document.getElementById('panelTabs').style.display = 'none';
  document.getElementById('panel').style.display = 'none';
  document.getElementById('terrasseTopBar').style.display = 'none';
  document.getElementById('terrassePanel').style.display = 'none';
  stage.style.display = 'none';
  document.getElementById('glbViewerPanel').style.display = 'block';
  disposeThreeScene(); // une seule scene 3D active a la fois
  syncLieuGlbViewer();
  const dateInp = document.getElementById('glbViewerDate');
  if(dateInp && !dateInp.value) dateInp.value = glb.dateStr;
  syncSemaineDepuisDate();
  document.getElementById('glbViewerHeure').value = glb.minutes;
  document.getElementById('glbViewerHeureTexte').textContent = formatHeureMin(glb.minutes);
  document.getElementById('glbViewerIntensite').value = Math.round(glb.intensiteSoleil*100);
  document.getElementById('glbViewerIntensiteTexte').textContent = Math.round(glb.intensiteSoleil*100) + ' %';
  rafraichirVisionneuseGlb();
}
function fermerVisionneuseGlb(){
  if(!glb.ouvert) return;
  glb.ouvert = false;
  if(glbViewerPleinePage) setGlbViewerPleinePage(false); // sinon la reouverture repart directement en plein page
  document.getElementById('glbViewerBtn').classList.remove('active');
  document.getElementById('glbViewerPanel').style.display = 'none';
  stage.style.display = '';
  disposeGlbViewerScene();
}

// La scene 3D est construite dans three/scene.ts ; cette enveloppe lui passe l'etat et ce qu'elle
// doit pouvoir declencher.
function buildThreeScene(obj){
  construireScene3D(obj, etat, {
    appliquerLumiereVue3d, applyMode3D, chargerTexturePolyhaven, disposeThreeScene, elevationOf,
    hauteurAppuiMm, objetMasque, positionMat, render, renderVue3DSelect, syncClotureControls,
    syncControlesSoleilVue3d, trouverParcelleCloture, buildThreeScene,
    orthoActif: ()=>orthoActif,
    orthoTuiles: ()=>orthoTuiles
  });
}
// Liste deroulante des points de vue enregistres (objets Fonction=camera, globaux au plan, pas
// propres a une terrasse) - re-remplie a chaque construction de la scene pour refleter tout ajout,
// renommage ou suppression fait depuis Mode Plan entre-temps.
function renderVue3DSelect(){
  const vues = etat.objects.filter(o=>o.fonction==='camera');
  ['terrasse3dViewSelect','glbViewerViewSelect'].forEach(id=>{
    const sel = document.getElementById(id);
    if(!sel) return;
    sel.innerHTML = '<option value="">Aller a un point de vue enregistre…</option>';
    vues.forEach(v=>{
      const o = document.createElement('option'); o.value = v.key; o.textContent = v.name;
      sel.appendChild(o);
    });
    sel.disabled = vues.length===0;
  });
}
document.getElementById('terrasse3dViewSelect').addEventListener('change', function(){
  const vp = etat.objects.find(o=>o.key===this.value);
  this.value = '';
  if(vp) allerAuPointDeVue(vp);
});
document.getElementById('glbViewerViewSelect').addEventListener('change', function(){
  const vp = etat.objects.find(o=>o.key===this.value);
  this.value = '';
  if(vp) allerAuPointDeVueGlb(vp);
});

// La cloture est rattachee a la parcelle (objet key==='parcelle', ou a defaut le premier objet
// fonction==='terrain') plutot qu'a un etat global : elle se sauvegarde avec le projet comme les
// champs Texture d'un objet, et non comme une simple preference d'affichage de la Vue 3D.
// Deux passes plutot qu'un seul find() a deux criteres : depuis l'import cadastre, les parcelles
// VOISINES sont elles aussi fonction==='terrain'. Un find() unique retournerait la premiere du
// tableau, donc potentiellement une voisine - et la cloture comme la position du soleil se
// retrouveraient rattachees au terrain d'a cote.
function trouverParcelleCloture(){
  return etat.objects.find(o=>o.key==='parcelle') || etat.objects.find(o=>o.fonction==='terrain');
}
function syncClotureControls(parcelleObj){
  const cb = document.getElementById('terrasse3dCloture');
  if(!cb) return;
  const hInp = document.getElementById('terrasse3dClotureHauteur');
  const cInp = document.getElementById('terrasse3dClotureCouleur');
  const vignette = document.getElementById('terrasse3dClotureTexVignette');
  const nomSpan = document.getElementById('terrasse3dClotureTexNom');
  const texBtn = document.getElementById('terrasse3dClotureTexBtn');
  const clearBtn = document.getElementById('terrasse3dClotureTexClear');
  cb.checked = !!parcelleObj.clotureActive;
  hInp.value = (parcelleObj.clotureHauteur !== undefined && parcelleObj.clotureHauteur !== null) ? parcelleObj.clotureHauteur : 1.8;
  cInp.value = parcelleObj.clotureCouleur || '#6b4a2a';
  const tex = parcelleObj.clotureTexture;
  vignette.src = tex ? tex.vignette : '';
  vignette.style.visibility = tex ? 'visible' : 'hidden';
  nomSpan.textContent = tex ? tex.nom : 'Aucune (couleur unie)';
  clearBtn.style.display = tex ? '' : 'none';
  [hInp, cInp, texBtn].forEach(el=>{ el.disabled = !cb.checked; });
}
function rafraichirApresCloture(){
  const obj = etat.objects.find(o=>o.key===etat.terrasseSelectedKey);
  // obj peut etre null (Vue 3D sans terrasse) : la scene se reconstruit quand meme.
  if(vue3d.scene) buildThreeScene(obj || null);
}
document.getElementById('terrasse3dCloture').addEventListener('change', function(){
  const p = trouverParcelleCloture();
  if(!p) return;
  p.clotureActive = this.checked;
  markDirty();
  syncClotureControls(p);
  rafraichirApresCloture();
});
document.getElementById('terrasse3dClotureHauteur').addEventListener('change', function(){
  const p = trouverParcelleCloture();
  if(!p) return;
  p.clotureHauteur = Math.max(0.1, parseFloat(this.value)) || 1.8;
  this.value = p.clotureHauteur;
  markDirty();
  rafraichirApresCloture();
});
document.getElementById('terrasse3dClotureCouleur').addEventListener('input', function(){
  const p = trouverParcelleCloture();
  if(!p) return;
  p.clotureCouleur = this.value;
  markDirty();
  rafraichirApresCloture();
});
document.getElementById('terrasse3dClotureTexBtn').addEventListener('click', ()=>{
  const p = trouverParcelleCloture();
  if(!p) return;
  ouvrirSelecteurTexture('Clôture', (choix)=>{
    p.clotureTexture = choix;
    markDirty();
    syncClotureControls(p);
    rafraichirApresCloture();
  });
});
document.getElementById('terrasse3dClotureTexClear').addEventListener('click', ()=>{
  const p = trouverParcelleCloture();
  if(!p) return;
  p.clotureTexture = null;
  markDirty();
  syncClotureControls(p);
  rafraichirApresCloture();
});
// Explicit zoom buttons: move the camera along its current line of sight to the orbit
// target, rather than relying only on OrbitControls' own wheel handling.
function zoom3D(factor){
  if(!vue3d.scene) return;
  const { camera, controls, renderer, scene } = vue3d.scene;
  const offset = new THREE.Vector3().subVectors(camera.position, controls.target);
  offset.multiplyScalar(factor);
  if(offset.length() < 0.3) return; // don't let it zoom through the target
  camera.position.copy(controls.target).add(offset);
  controls.update();
  renderer.render(scene, camera); // render immediately, don't wait for the next animation frame
}
document.getElementById('terrasse3dZoomIn').addEventListener('click', ()=>zoom3D(0.8));
document.getElementById('terrasse3dZoomOut').addEventListener('click', ()=>zoom3D(1.25));

// Ce que fait le glisser a un seul doigt/bouton gauche : tourner (par defaut), deplacer, ou
// zoomer. OrbitControls sait remapper le glisser en rotation ou translation (mouseButtons.LEFT /
// touches.ONE), mais n'a pas d'equivalent "zoom au glisser a un doigt" - le pincement a deux
// doigts existe deja pour ca, mais un seul doigt ne le peut pas nativement. Le mode Zoom est donc
// gere a la main : glisser vertical converti en appels a zoom3D, avec rotation et translation
// coupees pendant ce temps pour que les deux gestions ne se disputent pas le meme pointeur.
let mode3D = 'orbit';
let zoomDragActive = false, zoomDragLastY = 0;
function onZoomDragDown(e){
  zoomDragActive = true; zoomDragLastY = e.clientY;
  if(e.target.setPointerCapture) e.target.setPointerCapture(e.pointerId);
}
function onZoomDragMove(e){
  if(!zoomDragActive) return;
  const dy = e.clientY - zoomDragLastY; zoomDragLastY = e.clientY;
  if(Math.abs(dy) < 0.5) return;
  zoom3D(Math.exp(dy*0.006)); // glisser vers le haut (dy<0) rapproche, vers le bas eloigne
}
function onZoomDragUp(){ zoomDragActive = false; }
function applyMode3D(){
  if(!vue3d.scene) return;
  const { controls, renderer } = vue3d.scene;
  const dom = renderer.domElement;
  dom.removeEventListener('pointerdown', onZoomDragDown);
  dom.removeEventListener('pointermove', onZoomDragMove);
  window.removeEventListener('pointerup', onZoomDragUp);
  zoomDragActive = false;
  if(mode3D === 'zoom'){
    controls.enableRotate = false; controls.enablePan = false;
    dom.addEventListener('pointerdown', onZoomDragDown);
    dom.addEventListener('pointermove', onZoomDragMove);
    window.addEventListener('pointerup', onZoomDragUp);
  } else {
    controls.enableRotate = true; controls.enablePan = true;
    controls.mouseButtons.LEFT = mode3D==='pan' ? THREE.MOUSE.PAN : THREE.MOUSE.ROTATE;
    controls.touches.ONE = mode3D==='pan' ? THREE.TOUCH.PAN : THREE.TOUCH.ROTATE;
  }
  [['terrasse3dModeOrbit','orbit'],['terrasse3dModePan','pan'],['terrasse3dModeZoom','zoom']].forEach(([id,m])=>{
    const b = document.getElementById(id);
    if(!b) return;
    const actif = mode3D===m;
    b.style.background = actif ? 'var(--accent, #2a6b7a)' : '';
    b.style.color = actif ? '#fff' : '';
  });
  const hint = document.getElementById('terrasse3dHint');
  if(hint) hint.textContent = mode3D==='pan'
    ? 'Mode deplacer : glisser (un doigt) translate la vue. Molette ou boutons +/− = zoom. Reprends ⟳ pour tourner.'
    : mode3D==='zoom'
    ? 'Mode zoom : glisser vers le haut rapproche, vers le bas eloigne. Reprends ⟳ pour tourner.'
    : 'Glisser = tourner, molette ou boutons +/− = zoom, clic droit + glisser = deplacer. Les boutons ⟳ / ✋ / 🔍 changent ce que fait le glisser a un seul doigt — pratique sur tablette.';
}
function setMode3D(m){ mode3D = m; applyMode3D(); }
document.getElementById('terrasse3dModeOrbit').addEventListener('click', ()=>setMode3D('orbit'));
document.getElementById('terrasse3dModePan').addEventListener('click', ()=>setMode3D('pan'));
document.getElementById('terrasse3dModeZoom').addEventListener('click', ()=>setMode3D('zoom'));
// Le canvas WebGL est construit avec preserveDrawingBuffer:true (cf. buildThreeScene) : son
// contenu reste lisible par toBlob() meme apres l'echange de tampon du navigateur, donc pas
// besoin de repasser par un rendu hors-ecran comme pour l'export PNG du plan 2D.
document.getElementById('terrasse3dSavePng').addEventListener('click', ()=>{
  if(!vue3d.scene){ showErrBanner('Vue 3D pas encore chargee.'); return; }
  vue3d.scene.renderer.render(vue3d.scene.scene, vue3d.scene.camera); // capture le tout dernier etat
  vue3d.scene.renderer.domElement.toBlob(blob=>{
    if(!blob){ showErrBanner('Erreur export PNG : conversion en image impossible.'); return; }
    const url = URL.createObjectURL(blob);
    const obj = etat.objects.find(o=>o.key===etat.terrasseSelectedKey);
    const nom = (obj && obj.name ? obj.name : 'terrasse').normalize('NFD').replace(/[̀-ͯ]/g,'')
      .replace(/[^\w\-]+/g,'_').replace(/^_+|_+$/g,'') || 'terrasse';
    const a = document.createElement('a');
    a.href = url; a.download = 'vue3d_' + nom + '.png'; a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    setTimeout(()=>{ document.body.removeChild(a); URL.revokeObjectURL(url); }, 1000);
  }, 'image/png');
});
// Vue a hauteur d'yeux : 1,60 m au-dessus du platelage fini (pas du sol - c'est bien le niveau
// ou on se tient une fois monte sur la terrasse). Seule la hauteur (Y) bouge ; la position
// horizontale de la camera (X, Z) et le point vise restent exactement ou l'utilisateur les avait
// laisses - ce bouton leve ou baisse le point de vue, il ne le deplace pas.
const HAUTEUR_YEUX_M = 1.6;
document.getElementById('terrasse3dEyeLevel').addEventListener('click', ()=>{
  const obj = etat.objects.find(o=>o.key===etat.terrasseSelectedKey);
  if(!obj || !vue3d.scene) return;
  const { camera, controls, renderer, scene } = vue3d.scene;
  camera.position.y = hauteurFinieMm(obj)/1000 + HAUTEUR_YEUX_M;
  controls.update();
  renderer.render(scene, camera);
});
// Le filaire change la geometrie, pas seulement un materiau : la scene se reconstruit.
document.getElementById('terrasse3dFilaire').addEventListener('change', function(){
  const obj = etat.objects.find(o=>o.key===etat.terrasseSelectedKey);
  if(!obj) return;
  ensureConstruction(obj).lames3dFilaire = this.checked;
  if(vue3d.scene) buildThreeScene(obj);
});
document.getElementById('terrasse3dAllObjects').addEventListener('change', function(){
  vue3d.tousLesObjets = this.checked;
  const obj = etat.objects.find(o=>o.key===etat.terrasseSelectedKey);
  // obj peut etre null (Vue 3D sans terrasse) : la scene se reconstruit quand meme.
  if(vue3d.scene) buildThreeScene(obj || null);
});
document.getElementById('terrasse3dObjectsOpaque').addEventListener('change', function(){
  vue3d.objetsOpaques = this.checked;
  const obj = etat.objects.find(o=>o.key===etat.terrasseSelectedKey);
  // obj peut etre null (Vue 3D sans terrasse) : la scene se reconstruit quand meme.
  if(vue3d.scene) buildThreeScene(obj || null);
});
// Coche par defaut (les textures Poly Haven, une fois choisies, s'affichent) : decocher revient a
// la couleur unie du plan sans avoir a retirer la texture de chaque objet un par un - pratique
// pour comparer les deux rendus, ou pour un apercu rapide qui n'attend pas le chargement d'images.
document.getElementById('terrasse3dTextures').addEventListener('change', function(){
  vue3d.textures = this.checked;
  const obj = etat.objects.find(o=>o.key===etat.terrasseSelectedKey);
  // obj peut etre null (Vue 3D sans terrasse) : la scene se reconstruit quand meme.
  if(vue3d.scene) buildThreeScene(obj || null);
});
// Decochee par defaut : une vraie ombre portee (shadow map) coute plus cher a calculer que
// l'eclairage a trois lumieres sans ombres deja en place - un utilisateur qui veut juste
// verifier une implantation n'a pas besoin de payer ce cout a chaque rendu.
document.getElementById('terrasse3dShadows').addEventListener('change', function(){
  vue3d.ombres = this.checked;
  const obj = etat.objects.find(o=>o.key===etat.terrasseSelectedKey);
  // obj peut etre null (Vue 3D sans terrasse) : la scene se reconstruit quand meme.
  if(vue3d.scene) buildThreeScene(obj || null);
});

// "Enregistrer la vue" cree un objet Point de vue (Mode Plan) a la position et la direction
// actuelles de la camera - l'inverse de toLocal (centroide de la terrasse ouverte) donne ses
// coordonnees plan, et l'angle horizontal camera->cible donne sa direction.
document.getElementById('terrasse3dSaveViewBtn').addEventListener('click', ()=>{
  if(!vue3d.scene) return;
  // Centre retenu par buildThreeScene (la terrasse, ou a defaut la parcelle) : le relire ici
  // plutot que de recalculer un centroide de terrasse permet d'enregistrer un point de vue
  // meme depuis un plan sans terrasse.
  const cen = vue3d.scene.cen || {x:0, y:0};
  const { camera, controls } = vue3d.scene;
  const planX = camera.position.x + cen.x, planY = cen.y - camera.position.z;
  const dx = controls.target.x - camera.position.x, dz = controls.target.z - camera.position.z;
  const dl = Math.hypot(dx,dz) || 1;
  // Le second point (direction) se pose a 2 m du premier, dans le sens ou la camera regardait -
  // meme longueur par defaut que "+ Point de vue", pour que les deux chemins de creation donnent
  // des objets a l'echelle comparable sur le plan.
  const planDx = dx/dl, planDz = -dz/dl;
  pushHistory();
  const n = etat.objects.filter(o=>o.fonction==='camera').length + 1;
  const key = 'path' + Date.now() + '_' + (etat.newObjCounter++);
  const newObj = {
    key, type:'path', name:'Point de vue '+n, fill:'#c0392b', fillOpacity:0.9, stroke:'#6b1f16',
    pts:[ {x:planX, y:planY}, {x:planX+planDx*2, y:planY+planDz*2} ],
    vertexNames:['Position','Direction'], segmentNames:['Vise'],
    frozenVertices:[false,false], width:0.08, curve:false,
    showName:true, showSegNames:false, showVertNames:false, showDims:false, showAngles:false,
    constrained:false, fonction:'camera', matiere:'', priority:3, locked:false,
    altitude: camera.position.y
  };
  etat.objects.push(newObj);
  createObjectDOM(newObj);
  rebuildHandles(newObj);
  reapplyStackingOrder();
  rebuildSelector();
  showToast('Point de vue cree : "' + newObj.name + '" (visible en Mode Plan).');
});

// Depuis le panneau d'attributs d'un point de vue (Mode Plan) : bascule en Mode Terrasse sur la
// terrasse actuellement selectionnee, ouvre sa Vue 3D et y place la camera. La conversion plan ->
// repere local se fait ICI, au moment du clic, avec le centroide de CETTE terrasse - un point de
// vue n'appartient a aucune terrasse en particulier, donc rien n'est precalcule/fige a l'avance.
function allerAuPointDeVue(vp){
  const terr = (etat.objects.find(o=>o.key===etat.terrasseSelectedKey && o.fonction==='terrasse'))
            || etat.objects.find(o=>o.fonction==='terrasse');
  if(!terr){ showToast('Cree d\'abord une terrasse pour pouvoir y aller en Vue 3D.'); return; }
  etat.terrasseSelectedKey = terr.key;
  terrasseSubTab = '3d';
  setAppMode('terrasse');
  document.getElementById('modeTerrasseBtn').classList.remove('active');
  document.getElementById('mode3dBtn').classList.add('active');
  let tentatives = 0;
  (function essayer(){
    tentatives++;
    if(vue3d.scene && vue3d.dernierObjKey===terr.key){
      const cen = centroid(terr.pts);
      // Position = pts[0], direction = vecteur pts[0]->pts[1] (point + vecteur, pas un angle
      // stocke a part) - normalise puis reporte a 1,5 m, une distance de conversation courante.
      const ddx = vp.pts[1].x-vp.pts[0].x, ddy = vp.pts[1].y-vp.pts[0].y;
      const dl = Math.hypot(ddx,ddy) || 1;
      const rad = Math.atan2(ddy/dl, ddx/dl);
      const eyeY = vp.altitude || 1.6;
      const lx = vp.pts[0].x-cen.x, lz = cen.y-vp.pts[0].y;
      vue3d.scene.camera.position.set(lx, eyeY, lz);
      vue3d.scene.controls.target.set(lx+Math.cos(rad)*1.5, eyeY, lz-Math.sin(rad)*1.5);
      vue3d.scene.controls.update();
      vue3d.scene.renderer.render(vue3d.scene.scene, vue3d.scene.camera);
      return;
    }
    if(tentatives < 100) setTimeout(essayer, 100);
    else showErrBanner('Vue 3D : chargement trop long, reessaie.');
  })();
}
// Meme calcul que allerAuPointDeVue ci-dessus (position = pts[0], direction = vecteur
// pts[0]->pts[1]), mais sans changement d'onglet ni attente : la Visionneuse GLB a deja sa propre
// scene active quand ce bouton est visible. `terr` sert uniquement de reference pour le centroide
// (meme reperage que le bouton Export/l'oeil a 1,6 m) - le GLB affiche etant son export, les deux
// repères coincident.
function allerAuPointDeVueGlb(vp){
  if(!glb.scene) return;
  const terr = etat.objects.find(o=>o.key===etat.terrasseSelectedKey && o.fonction==='terrasse')
            || etat.objects.find(o=>o.fonction==='terrasse');
  if(!terr) return;
  const cen = centroid(terr.pts);
  const ddx = vp.pts[1].x-vp.pts[0].x, ddy = vp.pts[1].y-vp.pts[0].y;
  const dl = Math.hypot(ddx,ddy) || 1;
  const rad = Math.atan2(ddy/dl, ddx/dl);
  const eyeY = vp.altitude || 1.6;
  const lx = vp.pts[0].x-cen.x, lz = cen.y-vp.pts[0].y;
  const { camera, controls, renderer, scene } = glb.scene;
  camera.position.set(lx, eyeY, lz);
  controls.target.set(lx+Math.cos(rad)*1.5, eyeY, lz-Math.sin(rad)*1.5);
  controls.update();
  renderer.render(scene, camera);
}

// Plein page : le canvas garde sa taille CSS (100% du host), donc c'est le HOST qui doit
// grandir - une classe seule n'y suffit pas, la hauteur est fixee en inline (cf. HTML) et gagne
// sur une regle de classe. Le renderer et la camera, eux, ne suivent jamais une resize CSS tout
// seuls : il faut le leur dire explicitement, sans quoi l'image reste a l'ancienne taille,
// etiree ou avec des bandes vides.
function resizeThreeScene(){
  if(!vue3d.scene) return;
  const host = document.getElementById('terrasse3dCanvasHost');
  const w = host.clientWidth || 600, h = host.clientHeight || 420;
  vue3d.scene.camera.aspect = w/h;
  vue3d.scene.camera.updateProjectionMatrix();
  vue3d.scene.renderer.setSize(w, h);
  vue3d.scene.renderer.render(vue3d.scene.scene, vue3d.scene.camera);
}
function resizeGlbViewerScene(){
  if(!glb.scene) return;
  const host = document.getElementById('glbViewerCanvasHost');
  const w = host.clientWidth || 600, h = host.clientHeight || 420;
  glb.scene.camera.aspect = w/h;
  glb.scene.camera.updateProjectionMatrix();
  glb.scene.renderer.setSize(w, h);
  glb.scene.renderer.render(glb.scene.scene, glb.scene.camera);
}
let vue3dPleinePage = false;
function setVue3dPleinePage(actif){
  vue3dPleinePage = actif;
  const tab = document.getElementById('terrasseTab3d');
  const host = document.getElementById('terrasse3dCanvasHost');
  const btn = document.getElementById('terrasse3dFullPageBtn');
  tab.classList.toggle('pleinePage', actif);
  host.style.height = actif ? 'calc(100vh - 210px)' : '420px';
  btn.textContent = actif ? '🗗 Format normal' : '⛶ Plein écran';
  btn.title = actif ? 'Revenir a l\'affichage normal' : 'Agrandir la vue 3D en pleine page';
  // Pas besoin d'attendre une frame : lire une propriete de mise en page (clientHeight, dans
  // resizeThreeScene) force le navigateur a recalculer la mise en page immediatement, jusqu'a ce
  // point du script - la valeur lue est donc deja la nouvelle, sans avoir a differer l'appel.
  resizeThreeScene();
}
document.getElementById('terrasse3dFullPageBtn').addEventListener('click', ()=>{
  setVue3dPleinePage(!vue3dPleinePage);
});
let glbViewerPleinePage = false;
function setGlbViewerPleinePage(actif){
  glbViewerPleinePage = actif;
  const panel = document.getElementById('glbViewerPanel');
  const host = document.getElementById('glbViewerCanvasHost');
  const btn = document.getElementById('glbViewerFullPageBtn');
  panel.classList.toggle('pleinePage', actif);
  host.style.height = actif ? 'calc(100vh - 210px)' : '420px';
  btn.textContent = actif ? '🗗 Format normal' : '⛶ Plein écran';
  btn.title = actif ? 'Revenir a l\'affichage normal' : 'Agrandir la visionneuse en pleine page';
  resizeGlbViewerScene();
}
document.getElementById('glbViewerFullPageBtn').addEventListener('click', ()=>{
  setGlbViewerPleinePage(!glbViewerPleinePage);
});
window.addEventListener('keydown', e=>{
  if(e.key === 'Escape' && vue3dPleinePage) setVue3dPleinePage(false);
  if(e.key === 'Escape' && glbViewerPleinePage) setGlbViewerPleinePage(false);
});
// La fenetre peut changer de taille pendant que la vue est ouverte (plein page ou non) : le
// canvas suit, au lieu de rester fige a la taille qu'il avait au dernier rendu de la scene.
window.addEventListener('resize', ()=>{ if(vue3d.scene) resizeThreeScene(); if(glb.scene) resizeGlbViewerScene(); });

let terrasseSubTab = 'construction';
// The plan (#stage) physically lives in the page once; it's moved between its Mode Plan
// position, the Canevas sub-tab (where the construction overlay is meaningful to see), and
// a hidden "parking" div for every other sub-tab, rather than duplicated or left floating
// above tabs that don't need it.
let stageHomeParent = null, stageHomeNext = null;
function captureStageHome(){
  if(!stageHomeParent){
    stageHomeParent = stage.parentNode;
    stageHomeNext = stage.nextSibling;
  }
}
function updateStagePlacement(){
  captureStageHome();
  if(etat.appMode==='terrasse' && terrasseSubTab==='canevas'){
    document.getElementById('stageHost').appendChild(stage);
  } else if(etat.appMode==='terrasse'){
    document.getElementById('stageParking').appendChild(stage);
  } else {
    stageHomeParent.insertBefore(stage, stageHomeNext);
  }
}

function rebuildTerrasseSubTabs(){
  const div = document.getElementById('terrasseSubTabs');
  div.innerHTML = '';
  const defs = [
    ['construction','Construction','terrasseTabConstruction'],
    ['bom','BOM','terrasseTabBom'],
    ['canevas','Canevas','terrasseTabCanevas'],
    ['3d','Vue 3D','terrasseTab3d'],
    ['coupe','Plan de coupe','terrasseTabCoupe'],
    ['implantation','Implantation','terrasseTabImplantation'],
    ['chantier','Chantier','terrasseTabChantier'],
    ['methode','Méthode','terrasseTabMethode']
  ];
  // Sur la Vue 3D, la barre de sous-onglets disparait entierement plutot que de montrer les
  // 7 autres sans qu'aucun ne soit actif - "Vue 3D" doit etre une vue a part, pas Mode Terrasse
  // avec un onglet qui manque. "Vue 3D" a son propre bouton tout en haut de la page (barre
  // modeBar), accessible depuis Plan comme depuis Terrasse. Le sous-onglet '3d' reste dans
  // `defs` (la logique d'affichage/chargement juste en dessous en a besoin) mais n'a plus de
  // bouton dans cette rangee, ni ici ni ailleurs.
  div.style.display = (terrasseSubTab==='3d') ? 'none' : '';
  defs.filter(([key])=>key!=='3d').forEach(([key,label,panelId])=>{
    const b = document.createElement('button');
    b.className = 'panelTabBtn' + (terrasseSubTab===key ? ' active' : '');
    b.textContent = label;
    b.addEventListener('click', ()=>{
      terrasseSubTab=key;
      // Choisir un sous-onglet normal alors que "Vue 3D" (bouton du haut) etait mis en avant
      // doit lui rendre sa place a "Terrasse" - un seul bouton du haut actif a la fois.
      document.getElementById('mode3dBtn').classList.remove('active');
      document.getElementById('modeTerrasseBtn').classList.add('active');
      rebuildTerrasseSubTabs();
    });
    div.appendChild(b);
  });
  defs.forEach(([key,label,panelId])=>{
    document.getElementById(panelId).style.display = (terrasseSubTab===key) ? '' : 'none';
  });
  updateStagePlacement();

  // The 3D view has no show/hide button: it's simply active whenever its tab is, and
  // rebuilt fresh (buildThreeScene disposes any previous scene itself) whenever this
  // function re-runs while that tab stays selected, e.g. after a Construction change.
  if(terrasseSubTab==='3d'){
    // obj peut etre absent (plan sans terrasse) : buildThreeScene(null) construit alors le
    // terrain, les batiments et le reste du plan, sans la structure de terrasse.
    const obj = etat.objects.find(o=>o.key===etat.terrasseSelectedKey) || null;
    document.getElementById('terrasse3dLoading').style.display = chargement.three ? 'none' : '';
    ensureThreeLoaded(()=>{
      document.getElementById('terrasse3dLoading').style.display = 'none';
      document.getElementById('terrasse3dWrap').style.display = 'block';
      buildThreeScene(obj);
    });
  } else if(vue3d.scene){
    disposeThreeScene();
    document.getElementById('terrasse3dWrap').style.display = 'none';
  }
}

let terrasseLastFittedKey = null;
function refreshTerrasseView(){
  if(!rebuildTerrasseSelector()) return;
  const obj = etat.objects.find(o=>o.key===etat.terrasseSelectedKey);
  if(!obj){
    // Cas "Vue 3D sans terrasse" : rien a configurer, mais la scene 3D doit quand meme se
    // construire (rebuildTerrasseSubTabs s'en charge, avec obj = null).
    rebuildTerrasseSubTabs();
    return;
  }
  ensureConstruction(obj);
  const fitBtn = document.getElementById('fitBtn');
  if(fitBtn) fitBtn.style.display = 'block';
  if(terrasseLastFittedKey !== obj.key){
    fitToObject(obj);
    terrasseLastFittedKey = obj.key;
  }
  rebuildTerrasseSubTabs();
  renderTerrasseConfigurator(obj, { bilanDebit, champLongueurs, debitTable, hauteurAppuiMm, hauteurFinieMm, prixPersonnaliseplot, pushHistory, refreshTerrasseView, objets: ()=>etat.objects });
  renderTerrasseLayerTabs(obj);
  renderTerrasseLayerView(obj);
  renderTerrasseCoupe(obj, { bilanDebit, champLongueurs, debitTable, hauteurAppuiMm, hauteurFinieMm, prixPersonnaliseplot, pushHistory, refreshTerrasseView, objets: ()=>etat.objects });
  renderBOMTable(obj);
  renderOptimResult(obj, { bilanDebit, champLongueurs, debitTable, hauteurAppuiMm, hauteurFinieMm, prixPersonnaliseplot, pushHistory, refreshTerrasseView, objets: ()=>etat.objects });
  renderImplantation(obj, { bilanDebit, champLongueurs, debitTable, hauteurAppuiMm, hauteurFinieMm, prixPersonnaliseplot, pushHistory, refreshTerrasseView, objets: ()=>etat.objects });
  renderChantier(obj, { bilanDebit, champLongueurs, debitTable, hauteurAppuiMm, hauteurFinieMm, prixPersonnaliseplot, pushHistory, refreshTerrasseView, objets: ()=>etat.objects });
  renderMethode(obj, { bilanDebit, champLongueurs, debitTable, hauteurAppuiMm, hauteurFinieMm, prixPersonnaliseplot, pushHistory, refreshTerrasseView, objets: ()=>etat.objects });
}

function setAppMode(mode){
  // La Visionneuse GLB est un panneau independant (pas un troisieme appMode, cf. sa propre note
  // plus bas) : tout retour explicite vers Plan ou Terrasse doit la refermer, sinon son canevas
  // resterait actif en arriere-plan sous le panneau qu'on vient de rouvrir.
  fermerVisionneuseGlb();
  etat.appMode = mode;
  document.getElementById('modePlanBtn').className = 'objbtn' + (mode==='plan' ? ' active' : '');
  document.getElementById('modeTerrasseBtn').className = 'objbtn' + (mode==='terrasse' ? ' active' : '');
  // "Vue 3D" est un raccourci vers Mode Terrasse/sous-onglet 3D, pas un troisieme appMode a part
  // entiere (evite de retoucher les quelques endroits qui testent encore appMode==='terrasse') -
  // mais visuellement il doit rester le seul bouton actif pendant qu'on le regarde ; tout appel
  // normal de setAppMode (Plan ou Terrasse choisi directement) l'eteint, goVue3D le rallume juste apres.
  document.getElementById('mode3dBtn').classList.remove('active');
  const showPlan = mode==='plan';
  document.getElementById('selector').style.display = showPlan ? '' : 'none';
  document.getElementById('planActions').style.display = showPlan ? '' : 'none';
  document.getElementById('panelTabs').style.display = showPlan ? '' : 'none';
  document.getElementById('panel').style.display = showPlan ? '' : 'none';
  document.getElementById('terrasseTopBar').style.display = showPlan ? 'none' : 'block';
  document.getElementById('terrassePanel').style.display = showPlan ? 'none' : 'block';
  if(mode==='terrasse'){
    refreshTerrasseView();
  } else {
    terrasseLayerGroup.innerHTML = '';
    terrasseLastFittedKey = null; // re-entering Mode Terrasse later fits fresh again
    disposeThreeScene();
    document.getElementById('terrasse3dWrap').style.display = 'none';
    updateStagePlacement();
    // The plan hides the selection while it serves as a backdrop in Mode Terrasse, so coming
    // back has to redraw it - otherwise the object stays visually deselected even though it is
    // still the selected one and the panel is editing it.
    render();
  }
}
// Le plan d'implantation. Dessine en millimetres reels - le viewBox est en mm - donc imprime a
// 100 % il sort a l'echelle demandee, regle a la double-decimetre. C'est la seule facon de
// livrer une echelle qui veuille dire quelque chose.

// Le planning : une ligne par activite reellement necessaire a CETTE terrasse, avec sa quantite
// tiree du projet et sa cadence reglable. Un forfait au m² ne se discute pas ; une ligne avec sa
// quantite et sa cadence, si.

// The method sheet is generated from the very constants the engine runs on, so it cannot drift
// away from what the plan actually does: change PORTEE_VIS_K and this page changes with it.

// The optimiser panel stays open once asked for, and re-ranks itself after every change, so
// the user can watch a config they are editing move up or down the list.
document.getElementById('terrasseOptimBtn').addEventListener('click', ()=>{
  const obj = etat.objects.find(o=>o.key===etat.terrasseSelectedKey);
  if(!obj) return;
  document.getElementById('terrasseOptimBtn').textContent =
    basculerOptimisation() ? 'Masquer l\'optimisation' : 'Optimisation des parametres';
  renderOptimResult(obj, { bilanDebit, champLongueurs, debitTable, hauteurAppuiMm, hauteurFinieMm, prixPersonnaliseplot, pushHistory, refreshTerrasseView, objets: ()=>etat.objects });
});
document.getElementById('modePlanBtn').addEventListener('click', ()=>setAppMode('plan'));
document.getElementById('modeTerrasseBtn').addEventListener('click', ()=>{
  // Revenir sur "Terrasse" alors qu'on regardait la Vue 3D (via son propre bouton) ne doit pas
  // laisser aucun sous-onglet marque actif - Construction est le point d'entree naturel.
  if(terrasseSubTab==='3d') terrasseSubTab = 'construction';
  setAppMode('terrasse');
});
// Raccourci direct vers la Vue 3D depuis le haut de page, utilisable aussi bien depuis Plan que
// depuis Terrasse - en coulisse ca reste Mode Terrasse sur son sous-onglet '3d' (pas un troisieme
// appMode), pour ne rien casser parmi ce qui distingue deja seulement Plan et Terrasse ailleurs.
function goVue3D(){
  terrasseSubTab = '3d';
  setAppMode('terrasse');
  document.getElementById('modeTerrasseBtn').classList.remove('active');
  document.getElementById('mode3dBtn').classList.add('active');
}
document.getElementById('mode3dBtn').addEventListener('click', goVue3D);
document.getElementById('glbViewerBtn').addEventListener('click', ouvrirVisionneuseGlb);
// Les deux boutons de la Visionneuse passent par genererGlb(..., false) : meme chemin de
// construction et d'attente des textures que l'onglet Export, mais sans ecriture de fichier.
document.getElementById('glbViewerExporterBtn').addEventListener('click', function(){
  genererGlb(this, false);
});
document.getElementById('glbViewerRegenBtn').addEventListener('click', function(){
  genererGlb(this, false);
});
document.getElementById('glbViewerZoomIn').addEventListener('click', ()=>{
  if(!glb.scene) return;
  const { camera, controls, renderer, scene } = glb.scene;
  const offset = new THREE.Vector3().subVectors(camera.position, controls.target).multiplyScalar(0.8);
  camera.position.copy(controls.target).add(offset);
  controls.update(); renderer.render(scene, camera);
});
document.getElementById('glbViewerZoomOut').addEventListener('click', ()=>{
  if(!glb.scene) return;
  const { camera, controls, renderer, scene } = glb.scene;
  const offset = new THREE.Vector3().subVectors(camera.position, controls.target).multiplyScalar(1.25);
  camera.position.copy(controls.target).add(offset);
  controls.update(); renderer.render(scene, camera);
});
// Meme reperage de terrasse que le bouton Export ("celle selectionnee, sinon la premiere qui
// existe") et meme calcul que le bouton equivalent de la Vue 3D (hauteurFinieMm + HAUTEUR_YEUX_M)
// - le GLB exporte utilise exactement le meme repere y=0 au sol que la Vue 3D qui l'a produit,
// donc la meme formule tombe juste ici aussi. Seule l'altitude bouge, ni la position au sol ni
// la cible du regard.
document.getElementById('glbViewerEyeLevel').addEventListener('click', ()=>{
  if(!glb.scene) return;
  const terr = etat.objects.find(o=>o.key===etat.terrasseSelectedKey && o.fonction==='terrasse')
            || etat.objects.find(o=>o.fonction==='terrasse');
  if(!terr) return;
  const { camera, controls, renderer, scene } = glb.scene;
  camera.position.y = hauteurFinieMm(terr)/1000 + HAUTEUR_YEUX_M;
  controls.update();
  renderer.render(scene, camera);
});
document.getElementById('glbViewerFilaire').addEventListener('change', function(){
  glb.filaire = this.checked;
  if(glb.ouvert) rafraichirVisionneuseGlb(glb.scene && { pos: glb.scene.camera.position.clone(), cible: glb.scene.controls.target.clone() });
});
document.getElementById('glbViewerShadows').addEventListener('change', function(){
  glb.ombres = this.checked;
  if(glb.ouvert) rafraichirVisionneuseGlb(glb.scene && { pos: glb.scene.camera.position.clone(), cible: glb.scene.controls.target.clone() });
});
// Simple bascule de visibilite sur la lumiere existante : pas besoin de reconstruire toute la
// scene (contrairement a filaire/ombre, qui changent la geometrie ou l'etat du renderer).
document.getElementById('glbViewerLumiereAppoint').addEventListener('change', function(){
  glb.lumiereAppoint = this.checked;
  appliquerLumiereGlb({ lieuActuel, render, renderVue3DSelect });
});
document.getElementById('glbViewerFond').addEventListener('change', function(){
  glb.fond = this.value;
  if(glb.scene){
    // dispose the outgoing background if it's a texture (the checkerboard case) before swapping
    // it out, otherwise it leaks - see the comment on disposeThreeSceneResources().
    if(glb.scene.scene.background && glb.scene.scene.background.isTexture) glb.scene.scene.background.dispose();
    glb.scene.scene.background = fondGlbViewer();
  }
});
// "input" (pas "change") pour un rendu qui suit le glisser en direct, pas seulement au relachement.
document.getElementById('glbViewerDate').addEventListener('change', function(){
  if(!this.value) return;
  glb.dateStr = this.value;
  syncSemaineDepuisDate();
  appliquerLumiereGlb({ lieuActuel, render, renderVue3DSelect });
});
document.getElementById('glbViewerSemaine').addEventListener('input', function(){
  const nouvelleValeur = parseInt(this.value,10);
  const deltaSemaines = nouvelleValeur - glbViewerSemaineAffichee;
  glbViewerSemaineAffichee = nouvelleValeur;
  if(deltaSemaines === 0) return;
  const [annee, mois, jour] = glb.dateStr.split('-').map(Number);
  glb.dateStr = new Date(Date.UTC(annee, mois-1, jour) + deltaSemaines*7*86400000).toISOString().slice(0,10);
  document.getElementById('glbViewerDate').value = glb.dateStr;
  appliquerLumiereGlb({ lieuActuel, render, renderVue3DSelect });
});
document.getElementById('glbViewerHeure').addEventListener('input', function(){
  glb.minutes = parseInt(this.value,10);
  document.getElementById('glbViewerHeureTexte').textContent = formatHeureMin(glb.minutes);
  appliquerLumiereGlb({ lieuActuel, render, renderVue3DSelect });
});
document.getElementById('glbViewerIntensite').addEventListener('input', function(){
  const pct = parseInt(this.value,10);
  glb.intensiteSoleil = pct/100;
  document.getElementById('glbViewerIntensiteTexte').textContent = pct + ' %';
  appliquerLumiereGlb({ lieuActuel, render, renderVue3DSelect });
});

// --- Soleil de la Vue 3D : memes commandes, meme mecanique que ci-dessus. Aucune ne reconstruit
// la scene (contrairement a filaire/ombres/objets) : seules les lumieres deja en place bougent,
// donc le reglage suit le glisser en direct sans a-coup.
document.getElementById('vue3dDate').addEventListener('change', function(){
  if(!this.value) return;
  vue3dDateStr = this.value;
  syncSemaineVue3dDepuisDate();
  appliquerLumiereVue3d();
});
document.getElementById('vue3dSemaine').addEventListener('input', function(){
  const nouvelleValeur = parseInt(this.value,10);
  const deltaSemaines = nouvelleValeur - vue3dSemaineAffichee;
  vue3dSemaineAffichee = nouvelleValeur;
  if(deltaSemaines === 0) return;
  // Decalage RELATIF de 7 jours par cran, pas une position absolue depuis le 1er janvier : une
  // date qui ne tombe pas pile sur un multiple de 7 jours sauterait sinon d'un nombre de jours
  // irregulier au premier cran.
  const [annee, mois, jour] = vue3dDateStr.split('-').map(Number);
  vue3dDateStr = new Date(Date.UTC(annee, mois-1, jour) + deltaSemaines*7*86400000).toISOString().slice(0,10);
  document.getElementById('vue3dDate').value = vue3dDateStr;
  appliquerLumiereVue3d();
});
document.getElementById('vue3dHeure').addEventListener('input', function(){
  vue3dMinutes = parseInt(this.value,10);
  document.getElementById('vue3dHeureTexte').textContent = formatHeureMin(vue3dMinutes);
  appliquerLumiereVue3d();
});
document.getElementById('vue3dIntensite').addEventListener('input', function(){
  const pct = parseInt(this.value,10);
  vue3dIntensiteSoleil = pct/100;
  document.getElementById('vue3dIntensiteTexte').textContent = pct + ' %';
  appliquerLumiereVue3d();
});
document.getElementById('vue3dLumiereAppoint').addEventListener('change', function(){
  vue3dLumiereAppoint = this.checked;
  appliquerLumiereVue3d();
});

setupProjectBar(seed, ctxProjet());
render();
// Cadrage d'ouverture sur le terrain quand il vient du cadastre : sa taille reelle n'a aucune
// raison de tomber sur l'echelle par defaut du plan de demonstration. Un plan dessine a la main
// garde, lui, le cadrage historique - ses coordonnees ont ete posees avec.
(function cadrerSurTerrainImporte(){
  const p = etat.objects.find(o=>o.key==='parcelle');
  if(p && p.cadastre && p.pts && p.pts.length >= 3) fitToObject(p);
})();
// Reglages du fond orthophoto enregistres avec le projet : on les restitue, et on rallume le
// fond s'il etait actif a l'enregistrement (les tuiles, elles, se retelechargent).
restaurerOrthoDuProjet();
// Masquage du voisinage : meme mecanique, meme rangement sur la parcelle.
restaurerAffichageDuProjet();

}

// main.ts n'a plus besoin que de ces deux points d'entree : l'ecran de reprise vient desormais
// directement de ui/dialogs.
export { boot, loadInitialProject };

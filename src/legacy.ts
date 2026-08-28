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
import { vue3d } from './three/etat3d.js';
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
      if(key==='plu'){ renderPanneauPlu(); }
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
function attendreTexturesPretes(scene, delaiMaxMs){
  const textures = new Set();
  etat.scene.traverse(o=>{
    if(o.isMesh){
      (Array.isArray(o.material) ? o.material : [o.material]).forEach(m=>{
        if(m && m.map) textures.add(m.map);
      });
    }
  });
  if(textures.size===0) return Promise.resolve();
  const debut = Date.now();
  return new Promise(resolve=>{
    (function verifier(){
      const pretes = [...textures].every(t=>t.image !== undefined);
      if(pretes || Date.now()-debut > delaiMaxMs) resolve();
      else setTimeout(verifier, 100);
    })();
  });
}
// Garde une copie du dernier .glb reellement exporte (pas juste reconstruit "en live" comme la
// Vue 3D) : c'est ce que relit la Visionneuse GLB, pour verifier le fichier qui sort vraiment de
// l'appli plutot qu'une reconstruction qui pourrait diverger de lui.
let dernierGlbExporte = null; // { buffer: ArrayBuffer, nomTerrasse, date }
// Genere le .glb EN MEMOIRE (dernierGlbExporte) et n'ecrit un fichier que si `telecharger` est
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
              dernierGlbExporte = { buffer: result, nomTerrasse: terr.name, date: new Date() };
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
      importSVGString(ev.target.result);
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

function importSVGString(svgText){
  const doc = new DOMParser().parseFromString(svgText, 'image/svg+xml');
  const perr = doc.querySelector('parsererror');
  if(perr) throw new Error('SVG invalide ou mal forme');
  const root = doc.documentElement;
  const isOwn = root.getAttribute('data-plan-interactif') === '1';
  const minx = parseFloat(root.getAttribute('data-minx'));
  const pad = parseFloat(root.getAttribute('data-pad'));
  const maxy = parseFloat(root.getAttribute('data-maxy'));
  const replaceMode = document.getElementById('chkReplaceOnImport').checked;

  function svgToWorld(x,y){
    if(isOwn && Number.isFinite(minx) && Number.isFinite(pad) && Number.isFinite(maxy)){
      return {x: x + (minx-pad), y: (maxy+pad) - y};
    }
    // fallback for external SVGs: treat user units as meters, flip Y (SVG y-down -> world y-up)
    return {x: x, y: -y};
  }

  pushHistory();

  if(replaceMode){
    // remove every current object and its DOM elements, and any stored measures (they
    // reference object keys that are about to disappear)
    etat.objects.slice().forEach(detruireVue);
    etat.objects.length = 0;
    etat.measures.length = 0;
    etat.selectedKey = null;
  }

  let imported = 0;
  etat.newObjCounter += 1;

  doc.querySelectorAll('polygon').forEach(el=>{
    const dataPts = el.getAttribute('data-points');
    let pts;
    if(isOwn && dataPts){
      pts = dataPts.trim().split(' ').map(s=>{ const [x,y]=s.split(',').map(Number); return {x,y}; });
    } else {
      const raw = (el.getAttribute('points')||'').trim().split(/\s+/).filter(Boolean);
      pts = raw.map(s=>{ const [x,y]=s.split(',').map(Number); return svgToWorld(x,y); });
    }
    if(pts.length<3) return;
    const origKey = el.getAttribute('data-objkey');
    const key = (replaceMode && isOwn && origKey) ? origKey : ('imp'+Date.now()+'_'+(etat.newObjCounter++));
    const name = isOwn ? (el.getAttribute('data-name')||'Objet importe') : ('Objet importe '+imported);
    const vNames = isOwn && el.getAttribute('data-vertex-names') ? el.getAttribute('data-vertex-names').split(NAME_SEP) : pts.map((_,i)=>'Coin '+(i+1));
    const sNames = isOwn && el.getAttribute('data-segment-names') ? el.getAttribute('data-segment-names').split(NAME_SEP) : pts.map((_,i)=>'Cote '+(i+1));
    const newObj = {
      key, type:'polygon', name,
      fill: el.getAttribute('fill')||'#8fb3d9', fillOpacity: parseFloat(el.getAttribute('fill-opacity'))||0.75,
      stroke: el.getAttribute('stroke')||'#2a4d6e',
      pts, vertexNames:vNames, segmentNames:sNames, frozenVertices: pts.map(()=>false),
      showName:true, showSegNames:false, showVertNames:false, showDims:true, showAngles:false,
      constrained:false,
      fonction: isOwn ? (el.getAttribute('data-fonction')||'autre') : 'autre',
      matiere: isOwn ? (el.getAttribute('data-matiere')||'') : '',
      priority: isOwn ? (parseInt(el.getAttribute('data-priority'),10)||2) : 2,
      locked: isOwn ? (el.getAttribute('data-locked')==='true') : false
    };
    etat.objects.push(newObj); createObjectDOM(newObj); rebuildHandles(newObj); imported++;
  });

  doc.querySelectorAll('path').forEach(el=>{
    const dataPts = el.getAttribute('data-points');
    let pts;
    if(isOwn && dataPts){
      pts = dataPts.trim().split(' ').map(s=>{ const [x,y]=s.split(',').map(Number); return {x,y}; });
    } else {
      // best-effort: extract endpoint coordinates for every path command, not just M/L/C - see
      // parseSvgPathPoints() below.
      const d = el.getAttribute('d')||'';
      pts = parseSvgPathPoints(d).map(p=>svgToWorld(p.x,p.y));
    }
    if(pts.length<2) return;
    const origKey = el.getAttribute('data-objkey');
    const key = (replaceMode && isOwn && origKey) ? origKey : ('imp'+Date.now()+'_'+(etat.newObjCounter++));
    const name = isOwn ? (el.getAttribute('data-name')||'Chemin importe') : ('Chemin importe '+imported);
    const vNames = isOwn && el.getAttribute('data-vertex-names') ? el.getAttribute('data-vertex-names').split(NAME_SEP) : pts.map((_,i)=>'Point '+(i+1));
    const sNames = isOwn && el.getAttribute('data-segment-names') ? el.getAttribute('data-segment-names').split(NAME_SEP) : pts.map((_,i)=>'Cote '+(i+1));
    const width = isOwn ? (parseFloat(el.getAttribute('data-width'))||1) : (parseFloat(el.getAttribute('stroke-width'))||1);
    const curve = isOwn ? (el.getAttribute('data-curve')==='true') : false;
    const newObj = {
      key, type:'path', name,
      fill: el.getAttribute('stroke')||'#c9a15a', fillOpacity:1, stroke: el.getAttribute('stroke')||'#c9a15a',
      pts, vertexNames:vNames, segmentNames:sNames, frozenVertices: pts.map(()=>false),
      width, curve,
      showName:true, showSegNames:false, showVertNames:false, showDims:true, showAngles:false,
      constrained:false,
      fonction: isOwn ? (el.getAttribute('data-fonction')||'chemin') : 'chemin',
      matiere: isOwn ? (el.getAttribute('data-matiere')||'') : '',
      priority: isOwn ? (parseInt(el.getAttribute('data-priority'),10)||2) : 2,
      locked: isOwn ? (el.getAttribute('data-locked')==='true') : false
    };
    etat.objects.push(newObj); createObjectDOM(newObj); rebuildHandles(newObj); imported++;
  });

  doc.querySelectorAll('circle').forEach(el=>{
    let center, r;
    if(isOwn && el.getAttribute('data-center')){
      const [cx,cy] = el.getAttribute('data-center').split(',').map(Number);
      center = {x:cx,y:cy}; r = parseFloat(el.getAttribute('data-radius'));
    } else {
      const cx = parseFloat(el.getAttribute('cx')), cy = parseFloat(el.getAttribute('cy'));
      center = svgToWorld(cx,cy); r = parseFloat(el.getAttribute('r'));
    }
    if(!Number.isFinite(r) || r<=0) return;
    const origKey = el.getAttribute('data-objkey');
    const key = (replaceMode && isOwn && origKey) ? origKey : ('imp'+Date.now()+'_'+(etat.newObjCounter++));
    const name = isOwn ? (el.getAttribute('data-name')||'Cercle importe') : ('Cercle importe '+imported);
    const newObj = {
      key, type:'circle', name,
      fill: el.getAttribute('fill')||'#5bc8f5', fillOpacity: parseFloat(el.getAttribute('fill-opacity'))||0.9,
      stroke: el.getAttribute('stroke')||'#0a3d5c',
      center, r,
      showName:true, showSegNames:false, showVertNames:false, showDims:true, showAngles:false,
      constrained:false,
      fonction: isOwn ? (el.getAttribute('data-fonction')||'equipement') : 'equipement',
      matiere: isOwn ? (el.getAttribute('data-matiere')||'') : '',
      priority: isOwn ? (parseInt(el.getAttribute('data-priority'),10)||3) : 3,
      locked: isOwn ? (el.getAttribute('data-locked')==='true') : false
    };
    etat.objects.push(newObj); createObjectDOM(newObj); rebuildHandles(newObj); imported++;
  });

  let importedMeasures = 0;
  if(replaceMode && isOwn){
    const mdEl = doc.getElementById("measures-data");
    const mdRaw = mdEl ? mdEl.getAttribute('data-measures') : null;
    if(mdRaw){
      try {
        const parsed = JSON.parse(mdRaw);
        parsed.forEach(m=>{
          // only restore a measure if both referenced objects actually exist post-import
          const refObj = etat.objects.find(o=>o.key===m.refObjKey);
          const tgtObj = etat.objects.find(o=>o.key===m.targetObjKey);
          if(refObj && tgtObj){
            etat.measures.push({
              id:'m'+Date.now()+'_'+Math.random().toString(36).slice(2,7),
              refObjKey:m.refObjKey, refSegIndex:m.refSegIndex, startEnd:m.startEnd,
              targetObjKey:m.targetObjKey, targetPtIndex:m.targetPtIndex, show:!!m.show,
              displayMode: m.displayMode==='along' ? 'along' : 'perp'
            });
            importedMeasures++;
          }
        });
      } catch(err){ /* ignore malformed etat.measures data, geometry import already succeeded */ }
    }
  }

  reapplyStackingOrder();
  rebuildSelector();
  renderMeasureResults();
  render();
  let msg = imported + ' objet(s) importe(s).';
  if(!isOwn) msg += ' (SVG externe : noms/attributs par defaut, verifie les proportions.)';
  if(importedMeasures) msg += ' ' + importedMeasures + ' mesure(s) restauree(s).';
  else if(!replaceMode && measures0FromFile(doc)) msg += ' (Les mesures du fichier ne sont restaurees qu\'en mode "remplacement".)';
  if(!etat.objects.find(o=>o.key==='parcelle')) msg += ' ATTENTION: aucun objet "parcelle" dans le resultat - certaines fonctions (mesures, alignement, contrainte a la parcelle) seront limitees tant qu\'une parcelle n\'existe pas.';
  showToast(msg);
}
function measures0FromFile(doc){
  const el = doc.getElementById("measures-data");
  return !!(el && el.getAttribute('data-measures'));
}

// ================= Persistance : serialisation + barre de projet =================
// Prend uniquement les champs de donnees (jamais el/nameEl/pointEls/edgeEls/... qui
// pointent vers des noeuds SVG vivants : un JSON.stringify direct de `objects` planterait
// sur une structure circulaire une fois la page construite).
function serializeObjects(objs){
  return objs.map(o=>{
    const out = {
      key:o.key, type:o.type, name:o.name,
      fill:o.fill, fillOpacity:o.fillOpacity, stroke:o.stroke,
      showName:!!o.showName, showSegNames:!!o.showSegNames, showVertNames:!!o.showVertNames,
      showDims:!!o.showDims, showAngles:!!o.showAngles, constrained:!!o.constrained,
      fonction:o.fonction, matiere:o.matiere, priority:o.priority, locked:!!o.locked,
      elevation:o.elevation,
      textureVerticale: o.textureVerticale || null,
      textureHorizontale: o.textureHorizontale || null,
      altitude:o.altitude, hidden:!!o.hidden,
      clotureActive: !!o.clotureActive, clotureHauteur: o.clotureHauteur,
      clotureCouleur: o.clotureCouleur, clotureTexture: o.clotureTexture || null,
      diametreArbre: o.diametreArbre, couleurArbre: o.couleurArbre,
      textureArbre: o.textureArbre || null,
      latitude: o.latitude, longitude: o.longitude, nomLieu: o.nomLieu,
      hauteurParasol: o.hauteurParasol, terrasseLieeKey: o.terrasseLieeKey || null,
      matSurPerimetre: !!o.matSurPerimetre, matDeporte: !!o.matDeporte, matAngleDeg: o.matAngleDeg,
      // Tracabilite cadastrale (import depuis une adresse), attributs BD TOPO (batiment, haie,
      // vegetation) et zonage PLU. Cette fonction est une LISTE BLANCHE : un champ absent d'ici
      // disparait silencieusement au premier enregistrement.
      cadastre: o.cadastre || null,
      bdtopo: o.bdtopo || null,
      plu: o.plu || null,
      ortho: o.ortho || null,
      // Reglages d'affichage ranges sur la parcelle (masquage du voisinage), comme `ortho`.
      affichage: o.affichage || null,
      // Objet arrive par un import de voisinage : sert a le masquer d'un coup sans le supprimer.
      voisinage: !!o.voisinage
    };
    if(o.type==='circle'){
      out.center = {x:o.center.x, y:o.center.y}; out.r = o.r;
    } else {
      out.pts = o.pts.map(p=>({x:p.x,y:p.y}));
      out.vertexNames = [...o.vertexNames];
      out.segmentNames = [...o.segmentNames];
      out.frozenVertices = o.frozenVertices ? [...o.frozenVertices] : o.pts.map(()=>false);
      if(o.type==='path'){ out.width = o.width; out.curve = !!o.curve; }
    }
    if(o.construction) out.construction = JSON.parse(JSON.stringify(o.construction));
    return out;
  });
}
function serializeMeasures(ms){
  return ms.map(m=>({
    id:m.id, refObjKey:m.refObjKey, refSegIndex:m.refSegIndex, startEnd:m.startEnd,
    targetObjKey:m.targetObjKey, targetPtIndex:m.targetPtIndex, show:!!m.show,
    displayMode: m.displayMode==='along' ? 'along' : 'perp'
  }));
}

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
async function construireVoisinage(parcelle, cad, proj, simplifier, choix, dejaSerialises){
  const resultat = { objets:[], parcelles:0, batiments:0, vegetation:0, arbres:0 };
  const anneauSource = cad.geometrieSource && cad.geometrieSource.coordinates && cad.geometrieSource.coordinates[0];
  if(!anneauSource) throw new Error('geometrie source de la parcelle absente');

  const bboxParcelle = bboxDegDesAnneaux([anneauSource], proj, 20);
  const emprise = { type:'Polygon', coordinates:[[
    [bboxParcelle.lonMin, bboxParcelle.latMin], [bboxParcelle.lonMax, bboxParcelle.latMin],
    [bboxParcelle.lonMax, bboxParcelle.latMax], [bboxParcelle.lonMin, bboxParcelle.latMax],
    [bboxParcelle.lonMin, bboxParcelle.latMin]
  ]]};
  const feats = await interrogerCadastre(emprise, cad.codeInsee);
  const centreParc = centroid(parcelle.pts);
  const candidats = construireCandidats(feats, proj, centreParc, simplifier);
  const principale = { idu: cad.idu, pts: parcelle.pts };
  const tri = trierVoisines(principale, candidats);

  const iduPresents = new Set(dejaSerialises.filter(o=>o.cadastre && o.cadastre.idu).map(o=>o.cadastre.idu));
  iduPresents.add(cad.idu);
  const clesPrises = new Set(dejaSerialises.map(o=>o.key));
  const cleUnique = base => {
    let cle = (base || 'objet').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'') || 'objet';
    if(clesPrises.has(cle)){ let n = 2; while(clesPrises.has(cle + '-' + n)) n++; cle = cle + '-' + n; }
    clesPrises.add(cle);
    return cle;
  };
  const recupereLe = new Date().toISOString();
  const nouvellesParcelles = [];
  tri.adjacentes.forEach(c=>{
    if(iduPresents.has(c.idu)) return;
    iduPresents.add(c.idu);
    nouvellesParcelles.push(c);
    const pts = c.pts;
    resultat.objets.push({
      key: cleUnique('parcelle-' + libelleParcelle(c)), type:'polygon', name: libelleParcelle(c),
      fill:'#EFE8D5', fillOpacity:0.45, stroke:'#8A7B63',
      pts,
      vertexNames: pts.map((_,i)=>'Point ' + (i+1)),
      segmentNames: pts.map((_,i)=>'Cote ' + (i+1)),
      frozenVertices: pts.map(()=>false),
      showName:true, showSegNames:false, showVertNames:false, showDims:false, showAngles:false,
      constrained:false, fonction:'terrain', matiere:'', priority:0, locked:true, voisinage:true,
      cadastre: {
        idu:c.idu, codeInsee:c.codeInsee, commune:c.commune, section:c.section, numero:c.numero,
        contenanceM2:c.contenance, source:'IGN/API Carto/PCI', recupereLe,
        origineLat:cad.origineLat, origineLon:cad.origineLon,
        simplifieM: simplifier ? SIMPLIF_M : 0,
        geometrieSource:{ type:'Polygon', coordinates:[c.anneauDeg] }
      }
    });
    resultat.parcelles++;
  });
  if(!nouvellesParcelles.length) return resultat;

  // BD TOPO sur les seules parcelles qui viennent d'entrer dans le plan.
  const bbox = bboxDegDesAnneaux(nouvellesParcelles.map(c=>c.anneauDeg), proj, 5);
  const idsPresents = new Set(dejaSerialises.filter(o=>o.bdtopo && o.bdtopo.id).map(o=>o.bdtopo.id));
  const surNouvelles = e => nouvellesParcelles.some(c=>polygonesSeTouchent(e.pts, c.pts));

  if(choix.batiments){
    const feats2 = await interrogerWfs(COUCHE_BATIMENT, bbox, 80).catch(()=>[]);
    construireElementsIgn(feats2, proj, simplifier, 'batiment').forEach(b=>{
      if(idsPresents.has(b.id) || !surNouvelles(b)) return;
      idsPresents.add(b.id);
      const p = b.props || {};
      const haut = hauteurBatiment(p);
      const pts = b.pts;
      resultat.objets.push({
        key: cleUnique('bati-' + (b.id || '')), type:'polygon',
        name: (p.usage_1 || p.nature || 'Batiment') + (p.nombre_d_etages ? ' (' + p.nombre_d_etages + ' niv.)' : ''),
        fill:'#CFC3B4', fillOpacity:0.6, stroke:'#8A7B63',
        pts,
        vertexNames: pts.map((_,i)=>'Point ' + (i+1)),
        segmentNames: pts.map((_,i)=>'Cote ' + (i+1)),
        frozenVertices: pts.map(()=>false),
        showName:true, showSegNames:false, showVertNames:false, showDims:false, showAngles:false,
        constrained:false, fonction:'batiment', matiere:'', priority:2, locked:true, voisinage:true,
        elevation: haut,
        bdtopo: { couche:COUCHE_BATIMENT, id:b.id, cleabs:p.cleabs || null, nature:p.nature || null,
          usage1:p.usage_1 || null, usage2:p.usage_2 || null, hauteurM:nombreFr(p.hauteur), hauteurRetenueM:haut,
          nombreEtages:nombreFr(p.nombre_d_etages), nombreLogements:nombreFr(p.nombre_de_logements),
          altitudeSolM:nombreFr(p.altitude_minimale_sol), altitudeToitM:nombreFr(p.altitude_minimale_toit),
          etat:p.etat_de_l_objet || null, identifiantRnb:p.identifiants_rnb || null,
          surParcellePrincipale:false, recupereLe }
      });
      resultat.batiments++;
    });
  }
  if(choix.vegetation){
    for(const couche of [COUCHE_HAIE, COUCHE_VEGETATION]){
      const feats3 = await interrogerWfs(couche, bbox, 40).catch(()=>[]);
      const elems = construireElementsIgn(feats3, proj, simplifier, couche === COUCHE_HAIE ? 'haie' : 'vegetation');
      elems.forEach(v=>{
        if(idsPresents.has(v.id) || !surNouvelles(v)) return;
        idsPresents.add(v.id);
        const p = v.props || {};
        const estHaie = couche === COUCHE_HAIE;
        const haut = estHaie ? (nombreFr(p.hauteur) || 2) : hauteurVegetation(p.nature);
        const pts = v.pts;
        resultat.objets.push({
          key: cleUnique((estHaie ? 'haie-' : 'vegetation-') + (v.id || '')), type:'polygon',
          name: estHaie ? 'Haie' : (p.nature || 'Vegetation'),
          fill: estHaie ? '#7FA86B' : '#A9BE8E', fillOpacity: estHaie ? 0.8 : 0.55,
          stroke: estHaie ? '#3F5C33' : '#4A6B32',
          pts,
          vertexNames: pts.map((_,i)=>'Point ' + (i+1)),
          segmentNames: pts.map((_,i)=>'Cote ' + (i+1)),
          frozenVertices: pts.map(()=>false),
          showName:true, showSegNames:false, showVertNames:false, showDims:false, showAngles:false,
          constrained:false, fonction:'massif', matiere:'', priority:2, locked:false, voisinage:true,
          elevation: haut,
          bdtopo: { couche, id:v.id, cleabs:p.cleabs || null, nature:p.nature || (estHaie ? 'Haie' : null),
            hauteurM:nombreFr(p.hauteur), hauteurRetenueM:haut, recupereLe }
        });
        resultat.vegetation++;
        if(choix.arbres && !estHaie){
          arbresEstimes(v.pts, ESPACEMENT_ARBRES_M, MAX_ARBRES_ESTIMES).forEach((a, i)=>{
            resultat.objets.push({
              key: cleUnique('arbre-' + (v.id || 'veg') + '-' + (i+1)), type:'circle', name:'Arbre (estime)',
              fill:'#6E8B4E', fillOpacity:0.7, stroke:'#3F5C33',
              center:{x:a.x, y:a.y}, r:2.5,
              showName:false, showSegNames:false, showVertNames:false, showDims:false, showAngles:false,
              constrained:false, fonction:'arbre', matiere:'', priority:3, locked:false, voisinage:true,
              elevation: haut, diametreArbre:5,
              bdtopo: { couche:'estimation', origine:v.id, estime:true, hauteurRetenueM:haut, recupereLe }
            });
            resultat.arbres++;
          });
        }
      });
    }
  }
  return resultat;
}

// Choix de la portee avant d'agir : actualiser le seul contour cadastral n'a pas le meme effet
// que rejouer toutes les couches, et ajouter le voisinage EST un import - il ne doit jamais
// partir d'un simple clic sur un bouton nomme "actualiser".
function ouvrirDialogueActualisation(bouton){
  const parcelle = trouverParcelleCloture();
  const cad = parcelle && parcelle.cadastre;
  if(!cad || !cad.section || !cad.numero || !cad.codeInsee){
    showToast('Ce plan n\'a pas d\'origine cadastrale : cree-le avec « + Depuis une adresse » pour pouvoir l\'actualiser.');
    return;
  }
  if(cad.origineLat === undefined || cad.origineLat === null){
    showToast('Ce plan n\'a pas de point de calage enregistre : actualiser deplacerait tout le contenu.');
    return;
  }
  const nbIgn = etat.objects.filter(o=>o.bdtopo && o.bdtopo.couche && o.bdtopo.couche !== 'estimation').length;
  const nbVoisines = etat.objects.filter(o=>o.cadastre && o.cadastre.idu && o.cadastre.idu !== cad.idu).length;

  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed; inset:0; background:rgba(30,22,14,0.45); z-index:9998; display:flex; align-items:center; justify-content:center; padding:14px;';
  const box = document.createElement('div');
  box.style.cssText = 'background:var(--panel-bg,#fff); color:var(--ink,#222); padding:18px 20px; border-radius:8px; width:min(520px,96vw); font-family:"Helvetica Neue",Arial,sans-serif; font-size:0.88rem; box-shadow:0 4px 24px rgba(0,0,0,0.3);';
  const titre = document.createElement('div');
  titre.style.cssText = 'font-weight:600; font-size:1.02rem; margin-bottom:4px;';
  titre.textContent = 'Actualiser depuis l\'IGN';
  const sous = document.createElement('div');
  sous.style.cssText = 'font-size:0.8rem; opacity:0.8; margin-bottom:12px; line-height:1.4;';
  sous.textContent = 'Parcelle ' + (cad.section || '') + ' ' + String(cad.numero || '').replace(/^0+/,'') +
    ' — ' + (cad.commune || '') + '. Les objets dessines a la main ne sont jamais touches.';
  box.appendChild(titre); box.appendChild(sous);

  const radio = (valeur, libelle, aide, coche) => {
    const lab = document.createElement('label');
    lab.style.cssText = 'display:flex; gap:8px; align-items:flex-start; padding:6px 0; cursor:pointer;';
    const r = document.createElement('input');
    r.type = 'radio'; r.name = 'porteeActualisation'; r.value = valeur; r.checked = coche;
    r.style.marginTop = '3px';
    const txt = document.createElement('span');
    txt.innerHTML = '<b>' + escapeHtml(libelle) + '</b><br><span style="font-size:0.78rem; opacity:0.78;">' + escapeHtml(aide) + '</span>';
    lab.appendChild(r); lab.appendChild(txt);
    box.appendChild(lab);
    return r;
  };
  const rParcelle = radio('parcelle', 'La parcelle seule',
    'Contour cadastral de la parcelle et zonage PLU. Rien d\'autre n\'est interroge.', true);
  const rTout = radio('tout', 'Tout ce qui vient de l\'IGN',
    'La parcelle, le PLU, et les ' + nbIgn + ' objet(s) importes de la BD TOPO (batiments, vegetation) deja presents dans ce plan.', false);

  const sep = document.createElement('div');
  sep.style.cssText = 'border-top:1px solid var(--border,#ddd); margin:10px 0 8px;';
  box.appendChild(sep);

  const labVois = document.createElement('label');
  labVois.style.cssText = 'display:flex; gap:8px; align-items:flex-start; cursor:pointer;';
  const cbVois = document.createElement('input');
  cbVois.type = 'checkbox'; cbVois.style.marginTop = '3px';
  const txtVois = document.createElement('span');
  txtVois.innerHTML = '<b>Ajouter les parcelles adjacentes</b><br><span style="font-size:0.78rem; opacity:0.78;">' +
    'Import de voisinage : les parcelles mitoyennes absentes du plan' +
    (nbVoisines ? ' (' + nbVoisines + ' deja presente(s), elles ne seront pas dupliquees)' : '') + '.</span>';
  labVois.appendChild(cbVois); labVois.appendChild(txtVois);
  box.appendChild(labVois);

  const sousOptions = document.createElement('div');
  sousOptions.style.cssText = 'margin:6px 0 0 26px; display:flex; flex-direction:column; gap:3px; font-size:0.82rem;';
  const sousCase = (libelle, coche, titreAide) => {
    const l = document.createElement('label');
    l.style.cssText = 'display:flex; gap:6px; align-items:center; cursor:pointer;';
    if(titreAide) l.title = titreAide;
    const c = document.createElement('input');
    c.type = 'checkbox'; c.checked = coche; c.disabled = true;
    l.appendChild(c); l.appendChild(document.createTextNode(libelle));
    sousOptions.appendChild(l);
    return c;
  };
  const cbBati = sousCase('Bâti principal et annexes (BD TOPO, avec hauteur)', true,
    'Emprise et hauteur reelles ; les batiments des voisins arrivent verrouilles.');
  const cbVeg = sousCase('Haies et zones de végétation', true, 'Couches haie et zone_de_vegetation de la BD TOPO.');
  const cbArbres = sousCase('Arbres estimés dans ces zones', false,
    'ESTIMATION : la BD TOPO ne cartographie pas les arbres isoles. Une grille d\'un arbre pour 64 m2 est repartie dans les zones de vegetation.');
  box.appendChild(sousOptions);
  const noteMasquer = document.createElement('div');
  noteMasquer.style.cssText = 'margin:8px 0 0 26px; font-size:0.78rem; opacity:0.78; line-height:1.35;';
  noteMasquer.textContent = 'Tout ce qui arrive par cet import est marque « voisinage » : la case en haut a droite le masque d\'un coup, sans le supprimer.';
  box.appendChild(noteMasquer);

  const majSousOptions = ()=>{
    [cbBati, cbVeg, cbArbres].forEach(c=>{ c.disabled = !cbVois.checked; });
    sousOptions.style.opacity = cbVois.checked ? '1' : '0.5';
    noteMasquer.style.opacity = cbVois.checked ? '0.78' : '0.4';
  };
  cbVois.addEventListener('change', majSousOptions);
  majSousOptions();

  const pied = document.createElement('div');
  pied.style.cssText = 'display:flex; gap:8px; justify-content:flex-end; margin-top:16px;';
  const annuler = document.createElement('button');
  annuler.type = 'button'; annuler.className = 'secondary'; annuler.textContent = 'Annuler';
  annuler.addEventListener('click', ()=>overlay.remove());
  const valider = document.createElement('button');
  valider.type = 'button'; valider.textContent = 'Actualiser';
  valider.addEventListener('click', ()=>{
    const options = {
      portee: rTout.checked ? 'tout' : 'parcelle',
      voisinage: cbVois.checked
        ? { actif:true, batiments:cbBati.checked, vegetation:cbVeg.checked, arbres:cbArbres.checked }
        : { actif:false }
    };
    overlay.remove();
    actualiserDepuisIgn(options, bouton);
  });
  pied.appendChild(annuler); pied.appendChild(valider);
  box.appendChild(pied);
  overlay.appendChild(box);
  overlay.addEventListener('click', e=>{ if(e.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);
}

async function actualiserDepuisIgn(options, bouton){
  options = options || { portee:'tout', voisinage:{actif:false} };
  const parcelle = trouverParcelleCloture();
  const cad = parcelle && parcelle.cadastre;
  if(!cad || !cad.section || !cad.numero || !cad.codeInsee){
    showToast('Ce plan n\'a pas d\'origine cadastrale : cree-le avec « + Depuis une adresse » pour pouvoir l\'actualiser.');
    return;
  }
  if(cad.origineLat === undefined || cad.origineLat === null){
    showToast('Ce plan n\'a pas de point de calage enregistre : actualiser deplacerait tout le contenu.');
    return;
  }
  const libelleInitial = bouton ? bouton.textContent : '';
  if(bouton){ bouton.disabled = true; bouton.textContent = 'Actualisation…'; }
  const bilan = [];
  try {
    const proj = projecteurLocal(cad.origineLat, cad.origineLon);
    const simplifier = !!cad.simplifieM;

    // ---- 1. La parcelle, par identifiant cadastral exact (on sait qui on cherche : pas d'emprise)
    const urlParcelle = CADASTRE_URL + '?code_insee=' + encodeURIComponent(cad.codeInsee) +
      '&section=' + encodeURIComponent(cad.section) + '&numero=' + encodeURIComponent(cad.numero) + '&_limit=5';
    const repParcelle = await fetchJSONReseau(urlParcelle);
    const featParcelle = ((repParcelle && repParcelle.features) || [])[0];
    let ptsParcelle = null;
    if(featParcelle){
      const anneau = anneauExterieur(featParcelle.geometry);
      if(anneau) ptsParcelle = anneauVersPts(anneau, proj, simplifier);
    }
    // Une parcelle fusionnee a un contour construit, pas un contour cadastral : le remplacer par
    // celui d'une seule de ses composantes amputerait le terrain.
    if(cad.fusionDe && cad.fusionDe.length > 1){
      bilan.push('propriete fusionnee : contour conserve');
      ptsParcelle = null;
    }

    // ---- 2. Les objets issus de la BD TOPO, couche par couche (portee "tout" seulement)
    const objsIgn = options.portee === 'tout'
      ? etat.objects.filter(o=>o.bdtopo && o.bdtopo.couche && o.bdtopo.couche !== 'estimation')
      : [];
    const couches = [...new Set(objsIgn.map(o=>o.bdtopo.couche))];
    const fraiches = {};
    if(couches.length){
      const anneaux = [];
      etat.objects.forEach(o=>{ if(o.cadastre && o.cadastre.geometrieSource) anneaux.push(o.cadastre.geometrieSource.coordinates[0]); });
      if(anneaux.length){
        const bbox = bboxDegDesAnneaux(anneaux, proj, 15);
        for(const couche of couches){
          try {
            const feats = await interrogerWfs(couche, bbox, 80);
            feats.forEach(f=>{
              const p = f.properties || {};
              const id = f.id || p.cleabs;
              if(id) fraiches[id] = f;
            });
          } catch(e){ bilan.push('couche ' + couche + ' indisponible'); }
        }
      }
    }

    // ---- 3. Application
    pushHistory();
    let nMaj = 0, nAbsents = 0, ecartMax = 0;
    const serialises = serializeObjects(etat.objects).map(o=>{
      if(o.key === parcelle.key && ptsParcelle){
        // ecart max entre l'ancien et le nouveau contour : c'est la mesure du changement
        o.pts.forEach(p=>{ ecartMax = Math.max(ecartMax, distancePointContour(p, ptsParcelle)); });
        const copie = Object.assign({}, o, {
          pts: ptsParcelle,
          vertexNames: ptsParcelle.map((_,i)=>(o.vertexNames && o.vertexNames[i]) || ('Point ' + (i+1))),
          segmentNames: ptsParcelle.map((_,i)=>(o.segmentNames && o.segmentNames[i]) || ('Cote ' + (i+1))),
          frozenVertices: ptsParcelle.map(()=>false)
        });
        const pp = featParcelle.properties || {};
        copie.cadastre = Object.assign({}, o.cadastre, {
          contenanceM2: pp.contenance, commune: pp.nom_com || o.cadastre.commune,
          recupereLe: new Date().toISOString(),
          geometrieSource: { type:'Polygon', coordinates:[anneauExterieur(featParcelle.geometry)] }
        });
        return copie;
      }
      if(o.bdtopo && o.bdtopo.couche && o.bdtopo.couche !== 'estimation'){
        const f = fraiches[o.bdtopo.id];
        if(!f){ nAbsents++; return o; }
        const anneau = anneauExterieur(f.geometry);
        if(!anneau){ nAbsents++; return o; }
        const pts = anneauVersPts(anneau, proj, simplifier);
        if(pts.length < 3){ nAbsents++; return o; }
        const p = f.properties || {};
        nMaj++;
        // Nom, couleurs, verrouillage et textures sont des choix de l'utilisateur : l'actualisation
        // ne touche qu'a la geometrie et aux attributs IGN.
        const haut = o.bdtopo.couche === COUCHE_BATIMENT
          ? hauteurBatiment(p)
          : (nombreFr(p.hauteur) || o.bdtopo.hauteurRetenueM || hauteurVegetation(p.nature));
        return Object.assign({}, o, {
          pts,
          vertexNames: pts.map((_,i)=>'Point ' + (i+1)),
          segmentNames: pts.map((_,i)=>'Cote ' + (i+1)),
          frozenVertices: pts.map(()=>false),
          elevation: haut,
          bdtopo: Object.assign({}, o.bdtopo, {
            nature: p.nature || o.bdtopo.nature, usage1: p.usage_1 || o.bdtopo.usage1,
            hauteurM: nombreFr(p.hauteur), hauteurRetenueM: haut,
            nombreEtages: nombreFr(p.nombre_d_etages), nombreLogements: nombreFr(p.nombre_de_logements),
            altitudeSolM: nombreFr(p.altitude_minimale_sol), altitudeToitM: nombreFr(p.altitude_minimale_toit),
            etat: p.etat_de_l_objet || o.bdtopo.etat,
            identifiantRnb: p.identifiants_rnb || o.bdtopo.identifiantRnb,
            recupereLe: new Date().toISOString()
          })
        });
      }
      return o;
    });
    // ---- 3 bis. Import du voisinage, si demande : c'est le seul cas ou l'actualisation AJOUTE
    // des objets. Tout ce qui arrive ici est marque voisinage:true, pour pouvoir etre masque
    // d'un coup sans etre supprime.
    let ajouts = [];
    if(options.voisinage && options.voisinage.actif){
      try {
        ajouts = await construireVoisinage(parcelle, cad, proj, simplifier, options.voisinage, serialises);
        if(ajouts.parcelles) bilan.push(ajouts.parcelles + ' parcelle(s) adjacente(s) ajoutee(s)');
        if(ajouts.batiments) bilan.push(ajouts.batiments + ' batiment(s) ajoute(s)');
        if(ajouts.vegetation) bilan.push(ajouts.vegetation + ' zone(s) de vegetation ajoutee(s)');
        if(ajouts.arbres) bilan.push(ajouts.arbres + ' arbre(s) estime(s)');
        if(!ajouts.objets.length) bilan.push('voisinage : rien de nouveau a ajouter');
        serialises.push(...ajouts.objets);
      } catch(e){
        bilan.push('voisinage non ajoute : ' + (e.message || e));
      }
    }
    restoreState({ objects: serialises, measures: serializeMeasures(etat.measures) });

    // ---- 4. Le zonage PLU, au centre de la parcelle
    const cible = trouverParcelleCloture();
    if(cible){
      const centre = centroid(cible.pts);
      const deg = proj.versDegres(centre.x, centre.y);
      try {
        cible.plu = await interrogerPlu(deg.lon, deg.lat);
        if(cible.plu.zones.length) bilan.push('PLU : zone ' + cible.plu.zones[0].libelle);
        else bilan.push('PLU : aucun zonage');
      } catch(e){ bilan.push('PLU indisponible'); }
      renderPanneauPlu();
    }
    markDirty();
    // La case « Voisinage » n'apparait que s'il y a du voisinage : elle vient peut-etre d'en
    // gagner (ou d'en perdre, si l'utilisateur annule).
    syncBasculeVoisinage();
    rebuildSelector();
    syncLieuTitre();
    render();

    if(ptsParcelle) bilan.unshift('parcelle actualisee (ecart max ' + Math.round(ecartMax*100) + ' cm)');
    if(nMaj) bilan.unshift(nMaj + ' objet(s) IGN remplace(s)');
    if(nAbsents) bilan.push(nAbsents + ' objet(s) absent(s) de la base actuelle, conserve(s) tels quels');
    showToast('Actualisation IGN — ' + (bilan.length ? bilan.join(' ; ') + '.' : 'aucun changement.'));
  } catch(e){
    showToast('Actualisation impossible : ' + (e.message || e));
  } finally {
    if(bouton){ bouton.disabled = false; bouton.textContent = libelleInitial; }
  }
}

// ================= Onglet PLU (Geoportail de l'urbanisme) =================
// Le zonage est stocke SUR la parcelle (champ `plu`), comme la cloture et le lieu : il se
// sauvegarde avec le projet sans nouvelle cle a faire transiter par api.php, et il suit la
// parcelle si le plan est exporte en JSON.
function renderPanneauPlu(){
  const hote = document.getElementById('pluContenu');
  const lien = document.getElementById('pluGeoportailLien');
  const btn = document.getElementById('pluInterrogerBtn');
  if(!hote) return;
  hote.innerHTML = '';
  const parcelle = trouverParcelleCloture();
  if(!parcelle){
    btn.disabled = true;
    lien.style.display = 'none';
    const p = document.createElement('div');
    p.className = 'hint';
    p.textContent = 'Aucune parcelle dans ce plan : le PLU s\'interroge au centre de la parcelle. Importe une parcelle depuis une adresse, ou regle "Fonction" sur "terrain" pour l\'objet concerne.';
    hote.appendChild(p);
    return;
  }
  btn.disabled = false;
  const lieu = lieuActuel();
  lien.href = lienGeoportailUrbanisme(lieu.longitude, lieu.latitude);
  lien.style.display = '';

  const coord = document.createElement('div');
  coord.className = 'hint';
  coord.textContent = 'Point interroge : ' + lieu.latitude.toFixed(6).replace('.',',') + '° N, ' +
    lieu.longitude.toFixed(6).replace('.',',') + '° E (centre de « ' + parcelle.name + ' »).';
  hote.appendChild(coord);

  const plu = parcelle.plu;
  if(!plu){
    const p = document.createElement('div');
    p.className = 'hint';
    p.textContent = 'Aucun zonage enregistre pour cette parcelle. Clique sur « Interroger le Geoportail de l\'urbanisme ».';
    hote.appendChild(p);
    return;
  }
  const tbl = document.createElement('table');
  tbl.className = 'attrTable';
  const ligne = (cle, valeurHtml) => {
    const tr = document.createElement('tr');
    const td1 = document.createElement('td');
    td1.textContent = cle;
    td1.style.cssText = 'white-space:nowrap; color:var(--ink-soft);';
    const td2 = document.createElement('td');
    td2.innerHTML = valeurHtml;
    tr.appendChild(td1); tr.appendChild(td2);
    tbl.appendChild(tr);
  };
  if(plu.commune) ligne('Commune', escapeHtml(plu.commune.nom) + ' (INSEE ' + escapeHtml(plu.commune.insee) + ')' + (plu.commune.rnu ? ' — au RNU' : ''));
  if(!plu.zones.length){
    ligne('Zonage', plu.commune && plu.commune.rnu
      ? 'Commune au RNU : pas de document d\'urbanisme local, ce sont les regles nationales qui s\'appliquent.'
      : 'Aucune zone renvoyee pour ce point (document non verse au Geoportail, ou parcelle hors zonage).');
  }
  plu.zones.forEach((z, i)=>{
    const prefixe = plu.zones.length > 1 ? 'Zone ' + (i+1) : 'Zone';
    ligne(prefixe, '<b>' + escapeHtml(z.libelle) + '</b>' + (z.typezone ? ' — type ' + escapeHtml(z.typezone) : ''));
    if(z.libelong) ligne('Libellé', escapeHtml(z.libelong));
    if(z.datappro) ligne('Approbation', escapeHtml(z.datappro));
    if(z.urlfic) ligne('Règlement', '<a href="' + escapeHtml(z.urlfic) + '" target="_blank" rel="noopener">' + escapeHtml(z.nomfic || 'document PDF') + ' ↗</a>');
    if(z.partition) ligne('Document', escapeHtml(z.partition));
  });
  (plu.prescriptions || []).forEach((p, i)=>{
    ligne('Prescription ' + (i+1), escapeHtml((p.libelle || '') + (p.typepsc ? ' (' + p.typepsc + ')' : '')) +
      (p.urlfic ? ' <a href="' + escapeHtml(p.urlfic) + '" target="_blank" rel="noopener">↗</a>' : ''));
  });
  (plu.informations || []).forEach((info, i)=>{
    ligne('Information ' + (i+1), escapeHtml(info.libelle || '') +
      (info.urlfic ? ' <a href="' + escapeHtml(info.urlfic) + '" target="_blank" rel="noopener">' + escapeHtml(info.nomfic || 'notice') + ' ↗</a>' : ''));
  });
  // Servitudes d'utilite publique : le SPR (AC4) est mis en avant separement - c'est celle qui
  // change le plus concretement ce qu'on a le droit de construire et l'aspect impose.
  (plu.spr || []).forEach(s=>{
    ligne('SPR', '<b>' + escapeHtml(s.nom) + '</b>' +
      (s.assiette ? ' — ' + escapeHtml(s.assiette) : '') +
      (s.source ? '<br><span style="opacity:0.75;">Précision de la limite : ' + escapeHtml(s.source) + '</span>' : '') +
      (s.fichier ? '<br><span style="opacity:0.75;">Acte : ' + escapeHtml(s.fichier) + '</span>' : '') +
      '<br><span style="opacity:0.75;">Site patrimonial remarquable : tous les travaux visibles depuis l\'espace public sont soumis à l\'avis de l\'Architecte des Bâtiments de France.</span>');
  });
  // Comparaison par contenu et non par identite d'objet : apres un aller-retour JSON (projet
  // enregistre puis rouvert), `spr` et `servitudes` sont deux copies distinctes, et un includes()
  // sur les references reafficherait le SPR une seconde fois en bas de liste.
  const cleSup = s => (s.type || '') + '|' + (s.nom || '') + '|' + (s.fichier || '');
  const clesSpr = new Set((plu.spr || []).map(cleSup));
  const autresSup = (plu.servitudes || []).filter(s=>!clesSpr.has(cleSup(s)));
  autresSup.forEach((s, i)=>{
    ligne('Servitude ' + (i+1) + (s.type ? ' (' + s.type + ')' : ''),
      '<b>' + escapeHtml(s.nom) + '</b>' +
      (s.generateur ? ' — ' + escapeHtml(s.generateur) : '') +
      (s.nature ? ' ' + escapeHtml(s.nature) : '') +
      (s.assiette ? '<br><span style="opacity:0.75;">Assiette : ' + escapeHtml(s.assiette) + ' (' + escapeHtml(s.forme) + ')</span>' : '') +
      (s.fichier ? '<br><span style="opacity:0.75;">Acte : ' + escapeHtml(s.fichier) + '</span>' : ''));
  });
  if(!(plu.servitudes || []).length) ligne('Servitudes', 'Aucune servitude d\'utilité publique renvoyée pour ce point.');
  if(plu.document) ligne('Document d\'urbanisme', escapeHtml(plu.document.nom) + (plu.document.type ? ' (' + escapeHtml(plu.document.type) + ')' : ''));
  // Les actes des servitudes et les annexes n'ont pas d'URL directe dans l'API : la page
  // territoire de la commune est le seul endroit qui les rassemble tous.
  if(plu.commune && plu.commune.insee){
    ligne('Tous les documents', '<a href="' + escapeHtml(lienTerritoireUrbanisme(plu.commune.insee)) + '" target="_blank" rel="noopener">Page territoire ' +
      escapeHtml(plu.commune.insee) + ' — règlement, annexes, actes des servitudes ↗</a>');
  }
  if(plu.interrogeLe) ligne('Interrogé le', escapeHtml(new Date(plu.interrogeLe).toLocaleString('fr-FR')));
  hote.appendChild(tbl);
}
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
    renderPanneauPlu();
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

function setupProjectBar(seed){
  const bar = document.getElementById('projectBar');
  bar.innerHTML = '';

  // Pastille de version, calee a droite de la barre : c'est la premiere chose a demander dans un
  // rapport de bug, et elle doit apparaitre dans les deux modes (RELEASE.md 5.2).
  function pastilleVersion(){
    const s = document.createElement('span');
    s.id = 'appVersion';
    s.textContent = 'v' + APP_VERSION;
    s.title = versionLongue() + ' — schema de projet ' + SCHEMA_VERSION + ', API ' + API_VERSION;
    return s;
  }

  // Bouton disponible dans les deux modes : sans serveur, l'import cadastre charge quand meme
  // le plan en memoire (et le dit) - c'est plus utile qu'un bouton absent sans explication.
  function boutonCadastre(){
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'secondary small'; b.textContent = '+ Depuis une adresse';
    b.title = 'Cree un projet a partir du plan cadastral : adresse, parcelle, parcelles voisines';
    b.addEventListener('click', ()=>{
      if(etat.dirty && seed.apiAvailable){
        showConfirm('Des modifications ne sont pas enregistrees. Ouvrir l\'import cadastre quand meme ?',
          ()=>ouvrirImportCadastre({apiSave, appliquerProjetImporte, withProjectParam, apiDisponible: seed.apiAvailable, cleDernierProjet: LS_LAST_PROJECT}));
        return;
      }
      ouvrirImportCadastre({apiSave, appliquerProjetImporte, withProjectParam, apiDisponible: seed.apiAvailable, cleDernierProjet: LS_LAST_PROJECT});
    });
    return b;
  }
  // Actualisation : disponible des qu'un plan a une origine cadastrale, y compris en mode local.
  function boutonActualiser(){
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'secondary small'; b.textContent = '↻ Actualiser IGN';
    b.title = 'Rejoue les appels IGN et remplace ce qui en vient : contour cadastral, batiments et vegetation importes, zonage PLU. Les objets dessines a la main ne sont pas touches.';
    b.addEventListener('click', ()=>ouvrirDialogueActualisation(b));
    return b;
  }

  if(!seed.apiAvailable){
    bar.classList.add('localMode');
    bar.appendChild(boutonCadastre());
    bar.appendChild(boutonActualiser());
    const status = document.createElement('span');
    status.id = 'projectStatus';
    status.textContent = 'Mode local — jeu de donnees de demonstration (api.php introuvable : aucune sauvegarde serveur).';
    bar.appendChild(status);
    bar.appendChild(pastilleVersion());
    return;
  }
  bar.classList.remove('localMode');

  let currentMeta = seed.meta;
  let list = seed.list;
  let lastSavedLabel = currentMeta && currentMeta.updatedAt
    ? 'Enregistre a ' + new Date(currentMeta.updatedAt).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'})
    : '';

  const sel = document.createElement('select');
  sel.id = 'projectSelect';
  sel.title = 'Choisir un projet';
  list.forEach(p=>{
    const opt = document.createElement('option');
    opt.value = p.id; opt.textContent = p.name;
    if(currentMeta && p.id===currentMeta.id) opt.selected = true;
    sel.appendChild(opt);
  });
  sel.addEventListener('change', ()=>{
    const target = sel.value;
    if(etat.dirty){
      sel.value = currentMeta.id; // revert until confirmed, so a cancel leaves the dropdown consistent
      showConfirm('Des modifications ne sont pas enregistrees. Changer de projet quand meme (elles seront perdues) ?', ()=>{
        localStorage.setItem(LS_LAST_PROJECT, target);
        location.href = withProjectParam(target);
      });
      return;
    }
    localStorage.setItem(LS_LAST_PROJECT, target);
    location.href = withProjectParam(target);
  });

  const newBtn = document.createElement('button');
  newBtn.type = 'button'; newBtn.className = 'secondary small'; newBtn.textContent = '+ Nouveau projet';
  newBtn.addEventListener('click', ()=>{
    showPrompt('Nom du nouveau projet (copie du plan actuel) :', currentMeta ? (currentMeta.name + ' (copie)') : 'Nouveau projet', async (name)=>{
      try{
        const created = await apiSave({ name, appVersion: APP_VERSION, schemaVersion: SCHEMA_VERSION, objects: serializeObjects(etat.objects), measures: serializeMeasures(etat.measures) });
        localStorage.setItem(LS_LAST_PROJECT, created.id);
        location.href = withProjectParam(created.id);
      } catch(e){
        showErrBanner('Impossible de creer le projet : ' + (e.message||e));
      }
    });
  });

  const saveBtn = document.createElement('button');
  saveBtn.type = 'button'; saveBtn.id = 'saveProjectBtn'; saveBtn.className = 'small'; saveBtn.textContent = 'Enregistrer';
  saveBtn.addEventListener('click', async ()=>{
    if(!currentMeta) return;
    saveBtn.disabled = true; saveBtn.textContent = 'Enregistrement…';
    try{
      const res = await apiSave({ id: currentMeta.id, name: currentMeta.name, appVersion: APP_VERSION, schemaVersion: SCHEMA_VERSION, objects: serializeObjects(etat.objects), measures: serializeMeasures(etat.measures) });
      etat.dirty = false;
      lastSavedLabel = 'Enregistre a ' + new Date(res.updatedAt || Date.now()).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'});
      initialState.length = 0;
      initialState.push(...serializeObjects(etat.objects));
      initialMeasures.length = 0;
      initialMeasures.push(...serializeMeasures(etat.measures));
      showToast('Projet enregistre.');
    } catch(e){
      showErrBanner('Echec de l\'enregistrement : ' + (e.message||e));
    } finally {
      saveBtn.disabled = false; saveBtn.textContent = 'Enregistrer';
      refreshProjectStatus();
    }
  });

  const delBtn = document.createElement('button');
  delBtn.type = 'button'; delBtn.className = 'secondary small'; delBtn.textContent = 'Supprimer';
  delBtn.title = 'Supprimer ce projet du serveur';
  delBtn.disabled = list.length <= 1;
  delBtn.addEventListener('click', ()=>{
    showConfirm('Supprimer definitivement le projet "' + currentMeta.name + '" ? Cette action est irreversible.', async ()=>{
      try{
        await apiDelete(currentMeta.id);
        localStorage.removeItem(LS_LAST_PROJECT);
        const url = new URL(location.href); url.searchParams.delete('projet');
        location.href = url.toString();
      } catch(e){
        showErrBanner('Echec de la suppression : ' + (e.message||e));
      }
    });
  });

  const status = document.createElement('span');
  status.id = 'projectStatus';
  function updateStatus(){
    status.textContent = etat.dirty ? 'Modifications non enregistrees' : (lastSavedLabel || 'A jour');
  }
  refreshProjectStatus = updateStatus;
  updateStatus();

  bar.appendChild(sel); bar.appendChild(newBtn); bar.appendChild(boutonCadastre()); bar.appendChild(boutonActualiser());
  bar.appendChild(saveBtn); bar.appendChild(delBtn); bar.appendChild(status);
  bar.appendChild(pastilleVersion());
}








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
function renderDebitBois(obj, layers){
  const host = document.getElementById('terrasseDebitBoisBox');
  if(!host) return;
  const c = ensureConstruction(obj);
  host.innerHTML = '';
  const groupes = computeDebitsBois(obj, layers);
  const regleAbout = c.jointsBoisSurAppui !== false
    ? ' Une abouture de poutre doit reposer sur une vis, donc un troncon courant est coupe a un multiple de la portee (' +
      Math.round(porteeVisM(c)*100) + ' cm).'
    : ' Les aboutures ne sont pas contraintes de tomber sur une vis.';

  groupes.forEach((g, i)=>{
    const d = g.debit;
    const lengths = Object.keys(d.achats).map(parseFloat).sort((a,b)=>b-a);
    if(groupes.length > 1){
      host.appendChild(Object.assign(document.createElement('div'),
        { className:'sectionTitle', textContent:g.titre, style: i ? 'margin-top:16px;' : '' }));
    }
    const detail = Object.keys(g.parts).map(k=>k + ' ' + g.parts[k].toFixed(2) + ' ml').join(', ');
    host.appendChild(Object.assign(document.createElement('div'), { className:'hint',
      textContent: (groupes.length > 1 ? '' : 'Debites ensemble : meme section, meme commande. ') +
        'Metre par role — ' + detail + '.' + (i ? '' : regleAbout) }));
    host.appendChild(champLongueurs(c, g.champLongueurs, 'Longueurs achetables (m)'));

    if(!lengths.length){
      host.appendChild(Object.assign(document.createElement('div'),
        { className:'hint', textContent:'Aucune piece a debiter pour ce poste.' }));
      return;
    }
    debitTable(host, c, d, lengths, g.cle);
    const cout = coutDebit(c, d, g.cle);
    const perso = lengths.filter(L=>prixPersonnalise(c, g.cle, L)).length;
    host.appendChild(Object.assign(document.createElement('div'), { className:'hint',
      textContent: 'Prix par barre : ' +
        (perso ? perso + ' sur ' + lengths.length + ' saisis, les autres estimes' : 'tous estimes') +
        ' au tarif indicatif du bois porteur (' + SOLIVE_PRICE.bas + ' a ' + SOLIVE_PRICE.haut +
        ' €/ml) — soit ' + (cout/(d.achatMl||1)).toFixed(2) + ' €/ml en moyenne, ou ' +
        (cout/(d.reelMl||1)).toFixed(2) + ' €/ml rapporte au lineaire reellement pose.' }));
    host.appendChild(bilanDebit(c, d));
  });

  // ---- appuis : deux postes distincts, jamais melanges ----
  // La vis et le plot ne se stockent ni ne se vendent pareil : la vis a un prix unique et un
  // conditionnement en boite, le plot a un prix par modele de gamme. Chaque mode n'affiche donc
  // que ses propres champs, et n'ecrit que dans son propre stockage.
  const nAppuis = layers.vis.length;
  const tblV = document.createElement('table');
  tblV.className = 'attrTable';
  tblV.appendChild(Object.assign(document.createElement('tr'),
    { innerHTML:'<th>Poste</th><th>Qte</th><th>Valeur</th><th>Total</th>' }));
  const rowV = (label, qte, el, total) => {
    const tr=document.createElement('tr');
    const t0=document.createElement('td'); t0.textContent=label;
    const t1=document.createElement('td'); t1.textContent=qte;
    const t2=document.createElement('td'); if(typeof el==='string') t2.textContent=el; else t2.appendChild(el);
    const t3=document.createElement('td'); t3.textContent=total||''; t3.style.cssText='font-variant-numeric:tabular-nums;';
    tr.appendChild(t0); tr.appendChild(t1); tr.appendChild(t2); tr.appendChild(t3);
    tblV.appendChild(tr);
  };
  const champPrix = (valeur, titre, appliquer) => {
    const i = document.createElement('input');
    i.type='number'; i.step='0.5'; i.min='0'; i.style.width='90px';
    i.value = valeur.toFixed(2); i.title = titre;
    i.addEventListener('change', ()=>{
      const v = parseFloat(i.value);
      appliquer((isNaN(v)||v<0) ? undefined : v);
      refreshTerrasseView();
    });
    return i;
  };

  if(estPlots(c)){
    const m = plotModele(c);
    const ap = achatPlots(c, nAppuis);
    host.appendChild(Object.assign(document.createElement('div'),
      { className:'sectionTitle', textContent:'Plots', style:'margin-top:16px;' }));
    rowV('Modele retenu', m.label, m.min + ' a ' + m.max + ' cm', '');
    rowV('Prix unitaire', nAppuis + ' plots poses',
      champPrix(prixPlotUnite(c), 'Prix d\'un plot ' + m.label + ' chez ton fournisseur',
        v => { if(v===undefined) delete c.prixPlots[m.cle]; else c.prixPlots[m.cle] = v; }), '');
    rowV('A acheter', ap.unites + ' plots',
      prixPersonnaliseplot(c, m) ? 'prix saisi' : 'prix estime',
      ap.cout.toFixed(2) + ' €');
    host.appendChild(tblV);
    host.appendChild(Object.assign(document.createElement('div'), { className:'hint',
      textContent: 'Le prix d\'un plot depend surtout de sa hauteur de reglage : compter ' +
        PLOT_MODELES[0].prix.toFixed(2) + ' a ' + PLOT_MODELES[PLOT_MODELES.length-1].prix.toFixed(2) +
        ' € piece selon la gamme. Le prix est memorise par modele : changer de hauteur change de ' +
        'modele, et donc de prix. L\'assise est chiffree separement au BOM ci-dessus.' }));
  } else {
    const a = achatVis(c, nAppuis);
    host.appendChild(Object.assign(document.createElement('div'),
      { className:'sectionTitle', textContent:'Vis de fondation', style:'margin-top:16px;' }));
    rowV('Prix unitaire', nAppuis + ' vis posees',
      champPrix(prixVisUnite(c), 'Prix d\'une vis de fondation, hors pose',
        v => { c.prixVisUnite = v; }), '');
    const boiteInp = document.createElement('input');
    boiteInp.type='number'; boiteInp.step='1'; boiteInp.min='1'; boiteInp.style.width='90px';
    boiteInp.value = Math.max(1, Math.round(c.visParBoite||1));
    boiteInp.title = 'Conditionnement. 1 = vendues a l\'unite.';
    boiteInp.addEventListener('change', ()=>{
      const v = parseInt(boiteInp.value,10);
      c.visParBoite = (isNaN(v)||v<1) ? 1 : v;
      refreshTerrasseView();
    });
    rowV('Conditionnement', a.parBoite>1 ? a.boites + ' boite(s)' : 'a l\'unite', boiteInp, '');
    rowV('A acheter', a.unites + ' vis', a.parBoite>1
        ? a.boites + ' × ' + a.parBoite + (a.unites>nAppuis ? ' (soit ' + (a.unites-nAppuis) + ' d\'avance)' : '')
        : 'a l\'unite',
      a.cout.toFixed(2) + ' €');
    host.appendChild(tblV);
    host.appendChild(Object.assign(document.createElement('div'), { className:'hint',
      textContent: 'Le prix d\'une vis de fondation depend surtout de sa longueur, donc du sol : ' +
        'compter ' + VIS_PRICE.bas + ' a ' + VIS_PRICE.haut + ' € piece hors pose pour du courant. ' +
        'La pose a la visseuse hydraulique, si tu la sous-traites, se facture a part et n\'est pas ' +
        'comptee ici.' }));
  }
}
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

function renderTerrasseConfigurator(obj){
  const c = ensureConstruction(obj);
  const tbl = document.getElementById('terrasseConfigTable');
  tbl.innerHTML = '';
  const head = document.createElement('tr');
  head.innerHTML = '<th>Champ</th><th>Nom</th><th>Valeur</th>';
  tbl.appendChild(head);
  // 22 reglages a plat, c'est un mur : on ne trouve pas ce qu'on cherche. Les sections donnent
  // au tableau la structure de l'ouvrage lui-meme, du sol vers la finition.
  const addSection = (titre) => {
    const tr=document.createElement('tr');
    tr.className = 'sectionRow';
    const td=document.createElement('td'); td.colSpan=3; td.textContent=titre;
    td.style.cssText = 'font-family:"Helvetica Neue",Arial,sans-serif; font-weight:600; ' +
      'font-size:0.78rem; letter-spacing:.06em; text-transform:uppercase; ' +
      'color:var(--ink-soft); padding-top:14px;';
    tr.appendChild(td); tbl.appendChild(tr);
  };
  const addRow = (label, el, note) => {
    const tr=document.createElement('tr');
    const td0=document.createElement('td'); td0.textContent=label;
    const td1=document.createElement('td');
    if(note){
      td1.textContent = note;
      td1.style.cssText = 'font-size:0.8rem; color:var(--ink-soft);';
    }
    const td2=document.createElement('td'); td2.appendChild(el);
    tr.appendChild(td0); tr.appendChild(td1); tr.appendChild(td2);
    tbl.appendChild(tr);
  };

  const plots = estPlots(c);
  addSection('Fondation et appuis');
  const typeSelect = document.createElement('select');
  [['vis-fondation','Sur vis de fondation'],['plots','Sur plots reglables']].forEach(([v,l])=>{
    const o=document.createElement('option'); o.value=v; o.textContent=l;
    if((c.typePose||'vis-fondation')===v) o.selected=true; typeSelect.appendChild(o);
  });
  typeSelect.addEventListener('change', ()=>{ pushHistory(); c.typePose=typeSelect.value; refreshTerrasseView(); });
  addRow('Type de pose', typeSelect, plots ? 'appui pose : il faut une assise' : 'appui fonde : hors gel par la profondeur');

  if(!plots){
    const hauteurVisInp = document.createElement('input'); hauteurVisInp.type='number'; hauteurVisInp.step='5'; hauteurVisInp.min='10'; hauteurVisInp.value=c.hauteurVis;
    hauteurVisInp.title = 'Longueur du fut visse dans le sol, pour aller chercher le hors-gel. Enterree, elle ne sureleve pas la terrasse : c\'est le depassement de tete ci-dessous qui le fait.';
    hauteurVisInp.addEventListener('change', ()=>{ pushHistory(); c.hauteurVis=parseFloat(hauteurVisInp.value)||40; refreshTerrasseView(); });
    addRow('Longueur vis dans le sol (cm)', hauteurVisInp,
      'enterree : ne compte pas dans la hauteur finie');

    // La seule partie de la vis qui souleve quoi que ce soit. C'est par elle qu'on rattrape un
    // devers ou qu'on vient affleurer un seuil de porte.
    const depInp = document.createElement('input'); depInp.type='number'; depInp.step='1'; depInp.min='0'; depInp.value=c.depassementVis||0;
    depInp.title = 'Hauteur de tete reglable au-dessus du sol. C\'est la seule partie de la vis qui compte dans la hauteur finie.';
    depInp.addEventListener('change', ()=>{
      pushHistory();
      c.depassementVis = Math.max(0, parseFloat(depInp.value)||0); refreshTerrasseView();
    });
    const dep = c.depassementVis||0;
    addRow('Depassement de tete (cm)', depInp,
      (dep > VIS_DEPASSEMENT_MAX_CM ? '⚠ ' + dep + ' cm : c\'est un poteau, pas une tete de vis'
       : dep > VIS_DEPASSEMENT_USUEL_CM ? '⚠ au-dela de ' + VIS_DEPASSEMENT_USUEL_CM + ' cm : hors course usuelle'
       : dep > 0 ? 'hors sol : compte dans la hauteur finie'
       : 'tete arasee au niveau du sol'));
  } else {
    const hPlotInp = document.createElement('input'); hPlotInp.type='number'; hPlotInp.step='1'; hPlotInp.min='1'; hPlotInp.value=c.hauteurPlot;
    hPlotInp.title = 'Hauteur de reglage du plot, dessus d\'assise a dessous de lambourde';
    hPlotInp.addEventListener('change', ()=>{ pushHistory(); c.hauteurPlot=parseFloat(hPlotInp.value)||10; refreshTerrasseView(); });
    const m = plotModele(c), h = c.hauteurPlot||10;
    const horsGamme = h < m.min-1e-9 || h > m.max+1e-9;
    addRow('Hauteur plot (cm)', hPlotInp,
      (h > PLOT_HAUTEUR_MAX_CM ? '⚠ au-dela d\'1 m : hors domaine NF DTU 51.4'
       : h > PLOT_HAUTEUR_DTU_CM ? '⚠ au-dela de 30 cm : plot reglable hors domaine DTU'
       : horsGamme ? '⚠ hors de la plage du modele choisi'
       : 'dans la plage du modele retenu'));

    const modSelect = document.createElement('select');
    const optAuto=document.createElement('option'); optAuto.value='auto'; optAuto.textContent='Automatique (selon hauteur)';
    if((c.plotModele||'auto')==='auto') optAuto.selected=true; modSelect.appendChild(optAuto);
    PLOT_MODELES.forEach(mm=>{ const o=document.createElement('option'); o.value=mm.cle;
      o.textContent=mm.label+' ('+mm.min+' a '+mm.max+' cm)';
      if(c.plotModele===mm.cle) o.selected=true; modSelect.appendChild(o); });
    modSelect.addEventListener('change', ()=>{ pushHistory(); c.plotModele=modSelect.value; refreshTerrasseView(); });
    addRow('Modele de plot', modSelect, 'retenu : ' + m.label + ' — ' + prixPlotUnite(c).toFixed(2) + ' € piece');

    const doubleCb = document.createElement('input'); doubleCb.type='checkbox'; doubleCb.checked=!!c.plotAvecSolives;
    doubleCb.title = 'Structure double : plots sous solives, lambourdes au-dessus. Sinon les lambourdes reposent directement sur les plots.';
    doubleCb.addEventListener('change', ()=>{ pushHistory(); c.plotAvecSolives=doubleCb.checked; refreshTerrasseView(); });
    addRow('Structure double (plots sous solives)', doubleCb,
      c.plotAvecSolives ? 'solives sur plots, lambourdes dessus' : 'lambourdes directement sur plots');

    const supSelect = document.createElement('select');
    Object.keys(SUPPORT_TYPES).forEach(k=>{ const o=document.createElement('option'); o.value=k;
      o.textContent=SUPPORT_TYPES[k].label; if((c.supportType||'concasse')===k) o.selected=true; supSelect.appendChild(o); });
    supSelect.addEventListener('change', ()=>{ pushHistory(); c.supportType=supSelect.value; refreshTerrasseView(); });
    addRow('Assise sous les plots', supSelect, 'chiffree au BOM');

    const decInp = document.createElement('input'); decInp.type='number'; decInp.step='5'; decInp.min='0'; decInp.value=c.supportDecaissement;
    decInp.disabled = !(SUPPORT_TYPES[c.supportType]||SUPPORT_TYPES.concasse).concasse;
    decInp.title = 'Epaisseur de concasse compacte sous les plots';
    decInp.addEventListener('change', ()=>{ pushHistory(); c.supportDecaissement=parseFloat(decInp.value)||15; refreshTerrasseView(); });
    addRow('Decaissement / concasse (cm)', decInp, 'usage : 15 cm minimum sur sol meuble');

    const assiseInp = document.createElement('input'); assiseInp.type='number'; assiseInp.step='10'; assiseInp.min='50'; assiseInp.value=c.plotSurfaceAssise;
    assiseInp.title = 'Surface d\'assise du plot au contact du support';
    assiseInp.addEventListener('change', ()=>{ pushHistory(); c.plotSurfaceAssise=parseFloat(assiseInp.value)||PLOT_ASSISE_MIN_CM2; refreshTerrasseView(); });
    addRow('Surface d\'assise du plot (cm²)', assiseInp,
      (c.plotSurfaceAssise < PLOT_ASSISE_MIN_CM2 ? '⚠ sous les ' : 'mini NF DTU 51.4 : ') + PLOT_ASSISE_MIN_CM2 + ' cm²');
  }

  const autoSpan = maxPorteeVisM(c);
  // Density readout: the trade lands around 1.0 to 1.5 screws per m2, so a config coming out
  // far above that is telling the user their solives are closer together than they need to be.
  // The spa densification is deliberate and local, so it is counted separately - otherwise a
  // heavy spa would make the layout look over-screwed and point the blame at the entraxe.
  const visPts = (obj.pts && obj.pts.length>=3) ? buildVisGrid(obj, null, etat.objects) : [];
  const visCount = visPts.length;
  const visSpa = visPts.filter(p=>p.role==='spa').length;
  // Nommer ce qui a ete detecte. Toute forme passee en fonction "equipement" resserre desormais
  // la grille : si elle n'est pas nommee ici, personne ne peut voir laquelle, ni s'apercevoir
  // qu'un objet a ete classe equipement par megarde.
  const zonesEquip = (obj.pts && obj.pts.length>=3)
    ? findSpaZones(c.visMargeZoneSpa, etat.objects).filter(z=>zoneToucheTerrasse(z, obj.pts)) : [];
  const nomsEquip = zonesEquip.map(z=>z.nom).join(', ');
  const surfM2 = shoelace(obj.pts) || 1;
  const densite = visCount / surfM2;
  const densiteHorsSpa = (visCount - visSpa) / surfM2;
  const chargeInp = document.createElement('input'); chargeInp.type='number'; chargeInp.step='25'; chargeInp.min='100';
  chargeInp.value = c.chargeNormale;
  chargeInp.title = 'Charge d\'exploitation visee hors zone renforcee. 250 kg/m² = usage courant d\'une terrasse privative.';
  chargeInp.addEventListener('change', ()=>{ pushHistory(); c.chargeNormale=parseFloat(chargeInp.value)||250; refreshTerrasseView(); });
  addRow('Charge cible — zone courante (kg/m²)', chargeInp, 'usage : 250 kg/m²');

  const chargeSpaInp = document.createElement('input'); chargeSpaInp.type='number'; chargeSpaInp.step='25'; chargeSpaInp.min='100';
  chargeSpaInp.value = c.chargeSpa;
  chargeSpaInp.title = 'Charge visee sous les equipements. Un spa rempli et occupe pese 1,5 a 2 t sur 3 a 4 m² ; un bac plante ou une cuve sont du meme ordre.';
  chargeSpaInp.addEventListener('change', ()=>{ pushHistory(); c.chargeSpa=parseFloat(chargeSpaInp.value)||500; refreshTerrasseView(); });
  addRow('Charge cible — zone equipement (kg/m²)', chargeSpaInp,
         nomsEquip
           ? 'appuis a ' + Math.round(porteeVisSpaM(c)*100) + ' cm sous : ' + nomsEquip
           : 'aucun equipement sur cette terrasse');

  // La densite attendue n'est pas du tout la meme d'un mode a l'autre : 1,0 a 1,5 vis/m², mais
  // 3 a 5 plots/m². Un seuil unique s'allumerait en permanence et a tort sur plots.
  const spanAppui = porteeAppuiM(c);
  const seuilDense = plots ? 6 : 2;
  const alerteDensite = densiteHorsSpa > seuilDense
    ? ' · dense : elargir l\'entraxe ou monter en section'
    : (plots && densiteHorsSpa < 2.2 ? ' · faible pour des plots : verifier l\'entraxe' : '');

  const visAutoCb = document.createElement('input'); visAutoCb.type='checkbox';
  visAutoCb.checked = plots ? (c.plotEntraxeAuto!==false) : (c.visModeAuto!==false);
  visAutoCb.title = plots
    ? 'Deduit l\'entraxe des plots de la section portee, de son entraxe et de la charge, plafonne a 70 cm (NF DTU 51.4)'
    : 'Deduit la portee admissible de la section des solives, de leur entraxe et de la charge cible';
  visAutoCb.addEventListener('change', ()=>{
    pushHistory();
    if(plots) c.plotEntraxeAuto = visAutoCb.checked; else c.visModeAuto = visAutoCb.checked;
    refreshTerrasseView();
  });
  addRow(plots ? 'Entraxe plots automatique' : 'Portee vis automatique', visAutoCb,
    'calcule : ' + Math.round(spanAppui*100) + ' cm' +
    (plots && spanAppui >= PLOT_ENTRAXE_MAX_M-1e-9 ? ' (plafond DTU atteint)' : ''));

  const auto = plots ? (c.plotEntraxeAuto!==false) : (c.visModeAuto!==false);
  const visEntraxeInp = document.createElement('input'); visEntraxeInp.type='number'; visEntraxeInp.step='5';
  visEntraxeInp.min = plots ? '20' : '30'; visEntraxeInp.max = plots ? '70' : '';
  visEntraxeInp.disabled = auto;
  visEntraxeInp.value = auto ? Math.round(spanAppui*100) : (plots ? c.plotEntraxe : c.visEntraxe);
  visEntraxeInp.title = plots
    ? 'Distance entre deux plots le long d\'une meme piece. Plafonnee a 70 cm.'
    : 'Distance maximale entre deux vis le long d\'une meme solive';
  visEntraxeInp.addEventListener('change', ()=>{
    pushHistory();
    const v = parseFloat(visEntraxeInp.value);
    if(plots) c.plotEntraxe = v || 65; else c.visEntraxe = v || 100;
    refreshTerrasseView();
  });
  addRow(plots ? 'Entraxe max entre plots (cm)' : 'Portee max entre vis (cm)', visEntraxeInp,
         visCount + ' ' + (plots?'plots':'vis') + (visSpa ? ' (dont ' + visSpa + ' en zone equipement)' : '') +
         ' — ' + densite.toFixed(1) + '/m²' + alerteDensite);

  if(plots){
    const ch = chargePlot(c, visCount, surfM2);
    const el = document.createElement('span');
    el.style.cssText = 'font-variant-numeric:tabular-nums;';
    el.textContent = ch.charge.toFixed(0) + ' kg';
    addRow('Charge par plot', el,
      ch.tributaire.toFixed(2) + ' m² repris · ' + ch.pression.toFixed(2) + ' kg/cm² sur ' +
      ch.assise + ' cm²' +
      ((SUPPORT_TYPES[c.supportType]||{}).dalles ? '' :
        (c.supportType==='dalle' ? ' — sur dalle, sans objet' : ' — sur concasse, verifier le poinconnement')));
  }


  const visZoneSpaInp = document.createElement('input'); visZoneSpaInp.type='number'; visZoneSpaInp.step='5'; visZoneSpaInp.min='20';
  visZoneSpaInp.disabled = c.visModeAuto!==false;
  visZoneSpaInp.value = c.visModeAuto!==false ? Math.round(porteeVisSpaM(c)*100) : c.visEntraxeZoneSpa;
  visZoneSpaInp.title = 'En mode automatique, deduit de la charge cible sous les equipements';
  visZoneSpaInp.addEventListener('change', ()=>{ pushHistory(); c.visEntraxeZoneSpa=parseFloat(visZoneSpaInp.value)||60; refreshTerrasseView(); });
  addRow('Entraxe ' + (plots?'plots':'vis') + ' — zone equipement (cm)', visZoneSpaInp);

  const margeSpaInp = document.createElement('input'); margeSpaInp.type='number'; margeSpaInp.step='5'; margeSpaInp.min='0'; margeSpaInp.value=c.visMargeZoneSpa;
  margeSpaInp.title = 'Debord de la zone renforcee autour de l\'emprise de l\'equipement : la charge ne s\'arrete pas au bord de la cuve.';
  margeSpaInp.addEventListener('change', ()=>{ pushHistory(); c.visMargeZoneSpa=parseFloat(margeSpaInp.value)||30; refreshTerrasseView(); });
  addRow('Marge autour de l\'equipement (cm)', margeSpaInp,
    (plots && visSpa) ? '⚠ voir avertissement sous le tableau' : '');

  addSection('Structure porteuse');
  // En pose simple sur plots il n'y a pas de solive : ces trois reglages n'ont plus d'objet.
  const sansSolives = plots && !c.plotAvecSolives;
  const soliveEntraxeInp = document.createElement('input'); soliveEntraxeInp.type='number'; soliveEntraxeInp.step='5'; soliveEntraxeInp.min='20'; soliveEntraxeInp.value=c.soliveEntraxe;
  soliveEntraxeInp.disabled = sansSolives;
  soliveEntraxeInp.addEventListener('change', ()=>{ pushHistory(); c.soliveEntraxe=parseFloat(soliveEntraxeInp.value)||40; refreshTerrasseView(); });
  addRow('Entraxe solives (cm)', soliveEntraxeInp, sansSolives ? 'sans objet : pas de solives' : '');

  const soliveSectionSelect = document.createElement('select');
  SOLIVE_SECTIONS.forEach(s=>{ const o=document.createElement('option'); o.value=s; o.textContent=s+' mm'; if(c.soliveSection===s) o.selected=true; soliveSectionSelect.appendChild(o); });
  soliveSectionSelect.disabled = sansSolives;
  // The section now drives how far apart the supports can sit, so it needs a full refresh and
  // not just a price update.
  soliveSectionSelect.addEventListener('change', ()=>{ pushHistory(); c.soliveSection=soliveSectionSelect.value; refreshTerrasseView(); });
  addRow('Section solives', soliveSectionSelect,
    sansSolives ? 'sans objet : pas de solives' : 'porte ' + Math.round(autoSpan*100) + ' cm entre appuis');

  const lambourdeCb = document.createElement('input'); lambourdeCb.type='checkbox';
  lambourdeCb.checked = sansSolives ? true : !!c.avecLambourde;
  lambourdeCb.disabled = sansSolives;
  lambourdeCb.addEventListener('change', ()=>{ pushHistory(); c.avecLambourde=lambourdeCb.checked; refreshTerrasseView(); });
  addRow('Avec lambourdes', lambourdeCb, sansSolives ? 'impose : ce sont elles qui portent les lames' : '');

  const lambActif = sansSolives || c.avecLambourde;
  const lambSectionSelect = document.createElement('select');
  LAMBOURDE_SECTIONS.forEach(s=>{ const o=document.createElement('option'); o.value=s; o.textContent=s+' mm';
    if(sectionLambourde(c)===s) o.selected=true; lambSectionSelect.appendChild(o); });
  lambSectionSelect.disabled = !lambActif;
  lambSectionSelect.addEventListener('change', ()=>{ pushHistory(); c.lambourdeSection=lambSectionSelect.value; refreshTerrasseView(); });
  addRow('Section lambourdes', lambSectionSelect,
    !lambActif ? 'sans objet sans lambourdes'
      : sansSolives ? 'porte ' + Math.round(spanAppui*100) + ' cm entre plots'
      : (sectionLambourde(c)===c.soliveSection
          ? 'identique aux solives : un seul debit'
          : 'differente des solives : debit et prix separes'));

  const lambourdeEntraxeInp = document.createElement('input'); lambourdeEntraxeInp.type='number'; lambourdeEntraxeInp.step='5'; lambourdeEntraxeInp.min='20';
  lambourdeEntraxeInp.value = sansSolives ? maxEntraxeLameCm(c) : c.lambourdeEntraxe;
  lambourdeEntraxeInp.disabled = !lambActif || sansSolives;
  lambourdeEntraxeInp.addEventListener('change', ()=>{ pushHistory(); c.lambourdeEntraxe=parseFloat(lambourdeEntraxeInp.value)||40; refreshTerrasseView(); });
  addRow('Entraxe lambourdes (cm)', lambourdeEntraxeInp,
    sansSolives ? 'impose par l\'epaisseur de lame' : '');

  addSection('Lames et sens de pose');
  const segRefSelect = document.createElement('select');
  obj.segmentNames.forEach((sn,i)=>{ const o=document.createElement('option'); o.value=i; o.textContent=sn||('Cote '+(i+1)); if((c.segmentReference||0)===i) o.selected=true; segRefSelect.appendChild(o); });
  segRefSelect.addEventListener('change', ()=>{ pushHistory(); c.segmentReference=parseInt(segRefSelect.value,10)||0; refreshTerrasseView(); });
  addRow('Cote de reference', segRefSelect);

  const sensPoseInp = document.createElement('input'); sensPoseInp.type='number'; sensPoseInp.step='1'; sensPoseInp.value=c.sensPose;
  sensPoseInp.title = '0 = parallele au cote de reference';
  sensPoseInp.addEventListener('change', ()=>{ pushHistory(); c.sensPose=parseFloat(sensPoseInp.value)||0; refreshTerrasseView(); });
  addRow('Sens de pose (°, / cote de reference)', sensPoseInp);

  const essenceSelect = document.createElement('select');
  Object.keys(ESSENCE_PRICES).forEach(k=>{ const o=document.createElement('option'); o.value=k; o.textContent=ESSENCE_PRICES[k].label; if(c.essenceBois===k) o.selected=true; essenceSelect.appendChild(o); });
  // Essence and thickness both feed the admissible spacing of the supports under the lames, so
  // they drive the whole view now, not just the prices. Changing the essence resets the
  // stiffness coefficient to that essence's own value - an override belongs to the lame type it
  // was entered for, not to the project.
  essenceSelect.addEventListener('change', ()=>{
    pushHistory();
    c.essenceBois = essenceSelect.value;
    c.coefRaideurLame = LAME_RAIDEUR[c.essenceBois] !== undefined ? LAME_RAIDEUR[c.essenceBois] : 1;
    refreshTerrasseView();
  });
  addRow('Essence de bois', essenceSelect);

  const coefInp = document.createElement('input'); coefInp.type='number'; coefInp.step='0.05'; coefInp.min='0.3'; coefInp.max='2';
  coefInp.value = coefRaideurLame(c);
  coefInp.title = 'Raideur de la lame par rapport au resineux (1,00). Multiplie l\'ecartement admissible des appuis.';
  coefInp.addEventListener('change', ()=>{ pushHistory(); c.coefRaideurLame=parseFloat(coefInp.value)||1; refreshTerrasseView(); });
  const coefDefaut = LAME_RAIDEUR[c.essenceBois] !== undefined ? LAME_RAIDEUR[c.essenceBois] : 1;
  addRow('Coefficient raideur lame', coefInp,
         'defaut ' + coefDefaut.toFixed(2) + ' · appuis a ' + maxEntraxeLameCm(c) + ' cm' +
         (Math.abs(coefRaideurLame(c)-coefDefaut) > 1e-9 ? ' (modifie)' : ''));

  const largeurInp = document.createElement('input'); largeurInp.type='number'; largeurInp.step='5'; largeurInp.min='60'; largeurInp.value=c.largeurLame;
  largeurInp.addEventListener('change', ()=>{ pushHistory(); c.largeurLame=parseFloat(largeurInp.value)||140; refreshTerrasseView(); });
  addRow('Largeur lame (mm)', largeurInp);

  const epaisseurInp = document.createElement('input'); epaisseurInp.type='number'; epaisseurInp.step='1'; epaisseurInp.min='15'; epaisseurInp.value=c.epaisseurLame;
  epaisseurInp.addEventListener('change', ()=>{ pushHistory(); c.epaisseurLame=parseFloat(epaisseurInp.value)||25; refreshTerrasseView(); });
  addRow('Epaisseur lame (mm)', epaisseurInp);

  // Les deux finitions font le tour de la terrasse, et c'est bien la le probleme : il faut que
  // le libelle dise tout de suite laquelle est verticale et laquelle est a plat.
  addSection('Finitions du tour');
  const lameRiveCb = document.createElement('input'); lameRiveCb.type='checkbox'; lameRiveCb.checked=!!c.avecLameRive;
  lameRiveCb.title = 'Habillage de finition qui fait le tour de la terrasse, accroche sous le niveau des lames pour cacher la structure';
  lameRiveCb.addEventListener('change', ()=>{ pushHistory(); c.avecLameRive=lameRiveCb.checked; refreshTerrasseView(); });
  addRow('Lame de rive — habillage VERTICAL', lameRiveCb,
    'planche sur chant qui fait le tour, suspendue sous les lames, cache la structure');

  const hauteurRiveInp = document.createElement('input'); hauteurRiveInp.type='number'; hauteurRiveInp.step='10'; hauteurRiveInp.min='50'; hauteurRiveInp.value=c.hauteurLameRive;
  hauteurRiveInp.disabled = !c.avecLameRive;
  hauteurRiveInp.title = 'Hauteur de l\'habillage, mesuree depuis le dessus des lames vers le bas';
  hauteurRiveInp.addEventListener('change', ()=>{ pushHistory(); c.hauteurLameRive=parseFloat(hauteurRiveInp.value)||200; refreshTerrasseView(); });
  addRow('Hauteur lame de rive (mm)', hauteurRiveInp);

  const lamePlatCb = document.createElement('input'); lamePlatCb.type='checkbox'; lamePlatCb.checked=!!c.avecLamePlat;
  lamePlatCb.title = 'Planche plate qui fait le tour de la terrasse, posee a plat au meme niveau que les lames, comme un cadre de finition';
  lamePlatCb.addEventListener('change', ()=>{ pushHistory(); c.avecLamePlat=lamePlatCb.checked; refreshTerrasseView(); });
  addRow('Planche plate — bordure HORIZONTALE', lamePlatCb,
    'cadre pose a plat au niveau des lames, sur tout le tour' +
    (c.avecLamePlat ? ' — le champ de lames se retrecit d\'autant' : ''));

  // Un equipement lourd sur plots : on laisse passer, mais on dit clairement pourquoi c'est
  // douteux. Un plot n'est pas ancre et reporte sur une assise qui peut tasser
  // differentiellement ; le metier met la charge sur sa propre dalle et construit autour.
  const avert = document.getElementById('terrasseAvertBox');
  if(avert){
    avert.innerHTML = '';
    if(plots && visSpa){
      const d = document.createElement('div');
      d.className = 'hint';
      d.style.cssText = 'border-left:3px solid #A8442F; padding-left:12px;';
      d.innerHTML = '<b>⚠ Equipement lourd sur plots' +
        (nomsEquip ? ' — ' + nomsEquip : '') + '.</b> Les ' + visSpa + ' appuis de la zone sont ' +
        'resserres comme en mode vis, mais un plot n\'est pas ancre et reporte sa charge sur une ' +
        'assise qui peut tasser de facon differentielle. Un spa rempli et occupe, c\'est 1,5 a 2 t ' +
        'sur 3 a 4 m², et une cuve ou un bac maconne sont du meme ordre. <b>La solution du metier ' +
        'est une dalle beton dediee</b>, fondee pour elle-meme, le platelage etant construit ' +
        'autour. Le chiffrage ci-dessous decrit un ouvrage que je ne recommande pas en l\'etat.';
      avert.appendChild(d);
    }
    if(plots && (c.hauteurPlot||10) > PLOT_HAUTEUR_DTU_CM){
      const d = document.createElement('div');
      d.className = 'hint';
      d.style.cssText = 'border-left:3px solid #A8442F; padding-left:12px;';
      d.textContent = 'Hauteur de plot ' + (c.hauteurPlot||10) + ' cm : au-dela de ' +
        PLOT_HAUTEUR_DTU_CM + ' cm le plot reglable sort du domaine du NF DTU 51.4' +
        ((c.hauteurPlot||10) > PLOT_HAUTEUR_MAX_CM
          ? ', et au-dela d\'1 m c\'est le platelage entier qui en sort.' : '.');
      avert.appendChild(d);
    }
    // Une tete qui depasse trop transforme la vis en poteau : la charge n'arrive plus dans l'axe
    // du sol mais au bout d'un bras de levier, et c'est le sol autour du fut qui encaisse.
    if(!plots && (c.depassementVis||0) > VIS_DEPASSEMENT_USUEL_CM){
      const dep = c.depassementVis||0;
      const d = document.createElement('div');
      d.className = 'hint';
      d.style.cssText = 'border-left:3px solid #A8442F; padding-left:12px;';
      d.textContent = 'Depassement de tete ' + dep + ' cm : au-dela de ' + VIS_DEPASSEMENT_USUEL_CM +
        ' cm on sort de la course des tetes reglables du commerce' +
        (dep > VIS_DEPASSEMENT_MAX_CM
          ? ', et a ' + dep + ' cm ce n\'est plus une tete mais un poteau : il faut alors un ' +
            'contreventement et une verification du moment en pied, que ce calcul ne couvre pas.'
          : ', et la longueur enterree doit rester nettement superieure a la partie hors sol.');
      avert.appendChild(d);
    }
  }

  renderParametresCalcul(obj);
}

// Everything the engine used to hold as a literal, laid out where it can be read and changed.
// A constant nobody can see is a constant nobody can check - and these drive every quantity in
// the BOM, so they belong in front of the user rather than buried in the source.
function renderParametresCalcul(obj){
  const c = ensureConstruction(obj);
  const host = document.getElementById('terrasseParamsBox');
  if(!host) return;
  host.innerHTML = '';

  const tbl = document.createElement('table');
  tbl.className = 'attrTable';
  const head = document.createElement('tr');
  head.innerHTML = '<th>Parametre</th><th>Role</th><th>Valeur</th>';
  tbl.appendChild(head);
  const row = (label, note, el) => {
    const tr=document.createElement('tr');
    const td0=document.createElement('td'); td0.textContent=label;
    const td1=document.createElement('td'); td1.textContent=note;
    td1.style.cssText='font-size:0.8rem; color:var(--ink-soft);';
    const td2=document.createElement('td');
    if(typeof el === 'string'){ td2.textContent = el; td2.style.cssText='font-variant-numeric:tabular-nums;'; }
    else td2.appendChild(el);
    tr.appendChild(td0); tr.appendChild(td1); tr.appendChild(td2);
    tbl.appendChild(tr);
  };
  const num = (val, step, min, apply) => {
    const i=document.createElement('input'); i.type='number'; i.step=step; i.min=min; i.value=val;
    i.addEventListener('change', ()=>{ pushHistory(); apply(parseFloat(i.value)); refreshTerrasseView(); });
    return i;
  };

  row('K portee', 'portee = K · h · (b/entraxe)^⅓ · (250/charge)^⅓ — cale sur NF DTU 51.4',
      num(c.kPortee, '0.1', '5', v=>c.kPortee = v || PORTEE_VIS_K));
  row('K entraxe lame', 'ecartement des appuis = K × epaisseur de lame',
      num(c.kEntraxeLame, '0.5', '5', v=>c.kEntraxeLame = v || ENTRAXE_LAME_K));
  row('Charge de reference', 'charge sur laquelle K portee est cale, sert de base au rapport de charges',
      CHARGE_REF + ' kg/m²');
  row('Jeu entre lames', 'ajoute a la largeur de lame pour l\'espacement du platelage',
      num(c.jeuLames, '1', '0', v=>c.jeuLames = (v===undefined||isNaN(v)) ? 6 : v));
  row('Longueurs achetables', 'se reglent au-dessus de chaque tableau de debit, onglet BOM',
      'lames ' + longueursDispo(c).join(' / ') + '  ·  bois ' + longueursBois(c).join(' / ') +
      (sectionLambourde(c)!==c.soliveSection ? '  ·  lambourdes ' + longueursLambourde(c).join(' / ') : ''));

  const jointBoisCb = document.createElement('input'); jointBoisCb.type='checkbox';
  jointBoisCb.checked = c.jointsBoisSurAppui !== false;
  jointBoisCb.title = 'Impose qu\'une abouture de poutre repose sur un appui, vis ou plot';
  jointBoisCb.addEventListener('change', ()=>{ pushHistory(); c.jointsBoisSurAppui = jointBoisCb.checked; refreshTerrasseView(); });
  row('Aboutures bois sur appui', 'une abouture de poutre doit reposer sur un appui', jointBoisCb);
  row('Chute minimale reutilisable', 'en dessous, une chute part au rebut au lieu de resservir (cm)',
      num(c.chuteMinReutilisable, '5', '0', v=>c.chuteMinReutilisable = (v===undefined||isNaN(v)) ? 50 : v));
  const jointCb = document.createElement('input'); jointCb.type='checkbox'; jointCb.checked = c.jointsSurAppui !== false;
  jointCb.title = 'Impose que chaque about entre deux lames tombe sur une lambourde ou une solive';
  jointCb.addEventListener('change', ()=>{ pushHistory(); c.jointsSurAppui = jointCb.checked; refreshTerrasseView(); });
  row('Joints sur appui', 'un about de lame doit reposer sur une piece, pas dans le vide', jointCb);
  row('Epaisseur lame de rive', 'epaisseur de l\'habillage peripherique (mm)',
      num(c.epaisseurLameRive, '1', '5', v=>c.epaisseurLameRive = v || 22));
  row('Coefficients raideur par essence', 'valeur par defaut du coefficient ci-dessus',
      Object.keys(LAME_RAIDEUR).map(k=>k.replace('-classe4','')+' ' + LAME_RAIDEUR[k].toFixed(2)).join(' · '));
  row('Sections de solive', 'largeur × hauteur en mm, posee sur chant',
      SOLIVE_SECTIONS.map(s=>s+' ('+SOLIVE_SECTION_DIMS[s].b+'×'+SOLIVE_SECTION_DIMS[s].h+')').join(' · '));
  row('Bornes de portee', 'la portee calculee est bridee a cet intervalle', '50 a 250 cm');
  row('Bornes entraxe lame', 'l\'ecartement des appuis est bride a cet intervalle', '30 a 55 cm');
  const surPlots = estPlots(c);
  row('Fusion des appuis', 'deux appuis plus proches que ca n\'en font qu\'un (10 cm en rive)',
      Math.round(Math.min(0.35, porteeVisSpaM(c)*0.45)*100) + ' cm');
  row('Axe du cadre', 'rentre d\'une demi-section pour affleurer le bord',
      (dimsSection(surPlots && !c.plotAvecSolives ? sectionLambourde(c) : c.soliveSection).b/2) + ' mm');
  // Chaque mode ne montre que ses propres tarifs : afficher la fourchette des vis a quelqu'un
  // qui pose sur plots n'a aucun sens, et l'inverse non plus.
  if(surPlots){
    row('Plafond d\'entraxe des plots', 'NF DTU 51.4, appuis sous lambourdes',
        Math.round(PLOT_ENTRAXE_MAX_M*100) + ' cm');
    row('Domaine d\'emploi', 'plot reglable / hauteur du platelage au-dessus du support',
        PLOT_HAUTEUR_DTU_CM + ' cm / ' + PLOT_HAUTEUR_MAX_CM + ' cm');
    row('Prix indicatifs', 'utilises tant qu\'aucun prix reel n\'est saisi',
        'plots ' + PLOT_MODELES[0].prix.toFixed(2) + '-' + PLOT_MODELES[PLOT_MODELES.length-1].prix.toFixed(2) +
        ' €/u · bois ' + SOLIVE_PRICE.bas + '-' + SOLIVE_PRICE.haut + ' €/ml · geotextile ' +
        GEOTEXTILE_PRICE.bas + '-' + GEOTEXTILE_PRICE.haut + ' €/m² · concasse ' +
        CONCASSE_PRICE.bas + '-' + CONCASSE_PRICE.haut + ' €/m³ · dalle stab ' +
        DALLE_STAB_PRICE.bas + '-' + DALLE_STAB_PRICE.haut + ' €/u');
  } else {
    row('Course de tete reglable', 'depassement hors sol usuel / limite au-dela de laquelle la vis devient un poteau',
        VIS_DEPASSEMENT_USUEL_CM + ' cm / ' + VIS_DEPASSEMENT_MAX_CM + ' cm');
    row('Prix indicatifs', 'utilises tant qu\'aucun prix reel n\'est saisi',
        'vis ' + VIS_PRICE.bas + '-' + VIS_PRICE.haut + ' €/u · bois ' + SOLIVE_PRICE.bas + '-' +
        SOLIVE_PRICE.haut + ' €/ml · visserie ' + VISSERIE_PRICE.bas + '-' + VISSERIE_PRICE.haut +
        ' €/m² · rive ' + LAME_RIVE_PRICE.bas + '-' + LAME_RIVE_PRICE.haut + ' €/ml');
  }
  host.appendChild(tbl);
}

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
  renderDebitBois(obj, layers);

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
function renderTerrasseCoupe(obj){
  const c = ensureConstruction(obj);
  const wrap = document.getElementById('terrasseCoupeWrap');
  wrap.innerHTML = '';

  const plotSimple = estPlots(c) && !c.plotAvecSolives;
  const soliveDims = (c.soliveSection||'45x70').split('x').map(n=>parseInt(n,10)||0);
  const soliveH = plotSimple ? 0 : (soliveDims[1]||70);
  // Hauteur de l'appui AU-DESSUS du sol : pour une vis, son seul depassement de tete.
  const hauteurVisMm = hauteurAppuiMm(c);
  // Ce qui descend SOUS le sol : la vis dans le sol, ou l'assise sous les plots.
  const enterreMm = estPlots(c) ? 0 : (c.hauteurVis||40)*10;
  const lambourdeH = (c.avecLambourde || estPlots(c)) ? dimsSection(sectionLambourde(c)).h : 0;
  const lameH = c.epaisseurLame||25;
  // L'assise n'existe que sur plots, et se dessine sous le niveau du sol fini.
  const assiseH = estPlots(c) && (SUPPORT_TYPES[c.supportType]||{}).concasse
    ? (c.supportDecaissement||15)*10 : 0;
  const totalH = hauteurFinieMm(obj);   // meme definition que celle affichee au selecteur

  // Il faut de la place SOUS la ligne de sol : la vis y descend, l'assise aussi.
  const scalePx = 2; // px per mm
  const sousSolMm = Math.max(enterreMm, assiseH);
  const svgW = 260, svgH = Math.max(160, (totalH + sousSolMm)*scalePx + 50);
  const groundY = svgH - 26 - sousSolMm*scalePx;

  const nsv = document.createElementNS(svgNS,'svg');
  nsv.setAttribute('width', svgW); nsv.setAttribute('height', svgH);
  nsv.setAttribute('viewBox', '0 0 '+svgW+' '+svgH);

  function band(y0mm, hmm, color, label){
    const y = groundY - (y0mm+hmm)*scalePx;
    const h = Math.max(hmm*scalePx, 2);
    const r = document.createElementNS(svgNS,'rect');
    r.setAttribute('x', 40); r.setAttribute('y', y); r.setAttribute('width', 60); r.setAttribute('height', h);
    r.setAttribute('fill', color); r.setAttribute('stroke','#3B2E1F'); r.setAttribute('stroke-width','1');
    nsv.appendChild(r);
    const t = document.createElementNS(svgNS,'text');
    t.setAttribute('x', 108); t.setAttribute('y', y+h/2+4); t.setAttribute('font-size','11'); t.setAttribute('fill','#3B2E1F');
    t.setAttribute('font-family',"'Helvetica Neue',Arial,sans-serif");
    t.textContent = label;
    nsv.appendChild(t);
  }

  const ground = document.createElementNS(svgNS,'line');
  ground.setAttribute('x1',10); ground.setAttribute('x2', svgW-10); ground.setAttribute('y1', groundY); ground.setAttribute('y2', groundY);
  ground.setAttribute('stroke', '#4A6B32'); ground.setAttribute('stroke-width','3');
  nsv.appendChild(ground);
  const groundLabel = document.createElementNS(svgNS,'text');
  groundLabel.setAttribute('x',10); groundLabel.setAttribute('y', groundY+15); groundLabel.setAttribute('font-size','10'); groundLabel.setAttribute('fill','#4A6B32');
  groundLabel.setAttribute('font-family',"'Helvetica Neue',Arial,sans-serif");
  groundLabel.textContent = 'Sol';
  nsv.appendChild(groundLabel);

  // L'assise : la couche que le mode vis n'a pas, parce que la vis fait sa propre fondation.
  if(assiseH > 0){
    const a = document.createElementNS(svgNS,'rect');
    a.setAttribute('x', 40); a.setAttribute('y', groundY);
    a.setAttribute('width', 60); a.setAttribute('height', Math.max(assiseH*scalePx, 3));
    a.setAttribute('fill','#9aa6b0'); a.setAttribute('stroke','#3B2E1F'); a.setAttribute('stroke-width','1');
    nsv.appendChild(a);
    const al = document.createElementNS(svgNS,'text');
    al.setAttribute('x', 108); al.setAttribute('y', groundY + Math.max(assiseH*scalePx,3)/2 + 4);
    al.setAttribute('font-size','11'); al.setAttribute('fill','#3B2E1F');
    al.setAttribute('font-family',"'Helvetica Neue',Arial,sans-serif");
    al.textContent = 'Concasse compacte — '+(c.supportDecaissement||15)+' cm';
    nsv.appendChild(al);
  }

  // Le plot se dresse au-dessus du sol ; la vis descend dessous et ne montre que sa tete reglable.
  // Deux sens opposes, donc des rectangles de part et d'autre de la ligne de sol.
  function appuiRect(x, yTopPx, hPx, w, fill){
    const r = document.createElementNS(svgNS,'rect');
    r.setAttribute('x', x); r.setAttribute('y', yTopPx);
    r.setAttribute('width', w); r.setAttribute('height', hPx);
    r.setAttribute('fill', fill); r.setAttribute('stroke','#3B2E1F');
    nsv.appendChild(r);
  }
  function appuiLabel(yPx, txt){
    const t = document.createElementNS(svgNS,'text');
    t.setAttribute('x', 108); t.setAttribute('y', yPx+4);
    t.setAttribute('font-size','11'); t.setAttribute('fill','#3B2E1F');
    t.setAttribute('font-family',"'Helvetica Neue',Arial,sans-serif");
    t.textContent = txt;
    nsv.appendChild(t);
  }
  if(estPlots(c)){
    const hPx = Math.max(hauteurVisMm*scalePx, 2);
    appuiRect(60, groundY - hPx, hPx, 20, '#6E7A84');
    appuiLabel(groundY - hPx/2, 'Plot — '+(c.hauteurPlot||10)+' cm ('+plotModele(c).label+')');
  } else {
    const basPx = Math.max(enterreMm*scalePx, 2);
    appuiRect(64, groundY, basPx, 12, '#8A96A8');
    appuiLabel(groundY + basPx/2, 'Vis de fondation — '+c.hauteurVis+' cm dans le sol');
    // La tete reglable est la seule partie hors sol, et donc la seule qui souleve la structure.
    // Dessinee plus large que le fut : c'est la platine qui recoit la solive.
    if(hauteurVisMm > 0){
      const tetePx = Math.max(hauteurVisMm*scalePx, 2);
      appuiRect(62, groundY - tetePx, tetePx, 16, '#B8C2CE');
      appuiLabel(groundY - tetePx/2, 'Tete reglable — '+(c.depassementVis||0)+' cm hors sol');
    }
  }

  let y0 = hauteurVisMm;
  if(soliveH > 0){
    band(y0, soliveH, '#6b4a2a', 'Solive ('+c.soliveSection+' mm)');
    y0 += soliveH;
  }
  if(lambourdeH > 0){
    band(y0, lambourdeH, '#b45a2a', 'Lambourde ('+sectionLambourde(c)+' mm)');
    y0 += lambourdeH;
  }
  band(y0, lameH, '#c9a15a', 'Lame — '+lameH+' mm');

  wrap.appendChild(nsv);
}

// ================= Vue 3D (Three.js, charge a la demande depuis un CDN) =================
// Seule dependance externe de tout le fichier, et uniquement chargee si on ouvre la vue 3D :
// le reste de l'appli reste 100% autonome sans connexion internet.
let threeLoaded = false;

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
function ensureThreeLoaded(cb){
  if(threeLoaded && window.THREE && window.THREE.OrbitControls){ cb(); return; }
  const s1 = document.createElement('script');
  s1.src = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
  s1.onload = () => {
    const s2 = document.createElement('script');
    s2.src = 'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.js';
    s2.onload = () => { threeLoaded = true; cb(); };
    s2.onerror = () => showErrBanner('Impossible de charger les controles 3D (connexion internet requise pour cette fonctionnalite).');
    document.head.appendChild(s2);
  };
  s1.onerror = () => showErrBanner('Impossible de charger la bibliotheque 3D (connexion internet requise pour cette fonctionnalite).');
  document.head.appendChild(s1);
}
// Chargee separement de THREE/OrbitControls, et seulement au premier export GLB - la plupart des
// sessions ouvrent la Vue 3D sans jamais exporter, inutile d'alourdir ce chemin la pour tout le monde.
let gltfExporterLoaded = false;
function ensureGLTFExporterLoaded(cb){
  if(gltfExporterLoaded && window.THREE && window.THREE.GLTFExporter){ cb(); return; }
  const s = document.createElement('script');
  s.src = 'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/exporters/GLTFExporter.js';
  s.onload = () => { gltfExporterLoaded = true; cb(); };
  s.onerror = () => showErrBanner('Impossible de charger l\'exporteur GLB (connexion internet requise pour cette fonctionnalite).');
  document.head.appendChild(s);
}
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
function disposeThreeSceneResources(scene){
  if(!scene) return;
  etat.scene.traverse(obj=>{
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
  if(etat.scene.background && etat.scene.background.isTexture) etat.scene.background.dispose();
}
function disposeThreeScene(){
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

// ================= Visionneuse GLB (relit le dernier .glb reellement exporte) =================
// Scene Three.js totalement separee de `vue3d.scene` (la Vue 3D "live", construite depuis les
// donnees du plan) : les deux peuvent exister independamment, fermer l'une ne doit pas perturber
// l'autre. Celle-ci part d'un ArrayBuffer deja fige (dernierGlbExporte) plutot que des objets du
// plan, donc pas d'`extent` connu a l'avance - le cadrage de camera se deduit de la boite
// englobante du modele charge, et l'eclairage (absent du GLB, qui n'exporte que la geometrie/les
// materiaux) est ajoute ici comme dans buildThreeScene.
let glbViewerScene = null;
let glbViewerOuvert = false;
let glbViewerFilaire = false;
let glbViewerShadows = false;
let glbViewerFond = 'clair';
function disposeGlbViewerScene(){
  if(glbViewerScene){
    cancelAnimationFrame(glbViewerScene.raf);
    // see the comment in disposeThreeScene(): without this, OrbitControls keeps its
    // document/window-level listeners alive, pinning the whole previous scene in memory.
    if(glbViewerScene.controls && glbViewerScene.controls.dispose) glbViewerScene.controls.dispose();
    disposeThreeSceneResources(glbViewerScene.scene);
    glbViewerScene.renderer.dispose();
    // see the comment in disposeThreeScene(): releases the WebGL context immediately rather
    // than leaving it to GC, so iOS Safari's low live-context cap doesn't get exhausted.
    if(glbViewerScene.renderer.forceContextLoss) glbViewerScene.renderer.forceContextLoss();
    if(glbViewerScene.renderer.domElement.parentNode) glbViewerScene.renderer.domElement.parentNode.removeChild(glbViewerScene.renderer.domElement);
    glbViewerScene = null;
  }
}
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
function fondGlbViewer(){
  if(glbViewerFond==='damier') return damierGlbViewer();
  if(glbViewerFond==='sombre') return new THREE.Color(0x20242b);
  return new THREE.Color(0xdfe7ea);
}
// Hauteur du soleil a midi (t=0.5) et distance a la scene, retrouvees depuis l'ancienne position
// fixe (centre + rayon*(2,3,1.2)) pour rester dans la meme gamme deja tuneee visuellement.
const SOLEIL_ELEV_PLANCHER = 3 * Math.PI/180; // le point d'origine du rayon ne descend jamais pile a l'horizon (rasant parfait = artefacts) ; l'intensite, elle, peut tomber a 0 independamment (nuit)
const SOLEIL_DIST_FACTOR = Math.hypot(2,3,1.2); // distance de la lumiere a la scene, dans la meme gamme que l'ancien reglage fixe
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
let glbViewerDateStr = new Date().toISOString().slice(0,10);
let glbViewerMinutes = 720; // minutes depuis minuit ; 720 = midi
let glbViewerLumiereAppoint = true; // deuxieme lumiere (cote a l'ombre du soleil) - decochable
let glbViewerIntensiteSoleil = 1; // multiplicateur du soleil ; 1 = eclairage physique de l'heure
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
  const { semaine } = anneeEtSemaineDepuisDate(glbViewerDateStr);
  glbViewerSemaineAffichee = semaine;
  document.getElementById('glbViewerSemaine').value = semaine;
}
// Deduit la position du soleil (date + heure choisies, lieu fixe) puis en tire hauteur, intensite
// et couleur ensemble - pas un simple gradateur : sous l'horizon (nuit), l'intensite tombe a 0 sur
// les 10 derniers degres avant/apres, independamment du plancher de position (qui, lui, evite juste
// un rayon exactement rasant, pour des raisons de rendu).
function appliquerLumiereGlb(){
  if(!glbViewerScene) return;
  const { dirLight, dirFill, hemiLight, centre, rayon } = glbViewerScene;
  const [annee, mois, jour] = glbViewerDateStr.split('-').map(Number);
  const lieu = lieuActuel();
  const { elevRad, azRad } = positionSoleil(annee, mois, jour, glbViewerMinutes/60, lieu.latitude, lieu.longitude);
  const elevDeg = elevRad * 180/Math.PI;
  const facteurJour = Math.max(0, Math.min(1, elevDeg/10));
  const elevAffichee = Math.max(SOLEIL_ELEV_PLANCHER, elevRad);
  const dist = SOLEIL_DIST_FACTOR * rayon;
  const horiz = Math.cos(elevAffichee) * dist;
  const dirEst = Math.sin(azRad), dirNord = Math.cos(azRad);
  dirLight.position.set(
    centre.x + horiz*dirEst,
    centre.y + Math.sin(elevAffichee)*dist,
    centre.z - horiz*dirNord // Nord = -Z dans le repere de la scene
  );
  // Contrairement a l'ancienne course d'arc factice (ou le soleil restait "leve" mais rasant aux
  // deux bouts), ici facteurJour retombe vraiment a 0 la nuit : le soleil direct doit s'eteindre
  // (0), pas juste faiblir - seules l'ambiante et un leger fond de ciel restent, pour que la scene
  // reste lisible sans jamais aller au noir complet (meme convention que le reste de l'appli).
  // Le multiplicateur d'intensite ne s'applique qu'au soleil (pas a l'appoint ni a l'ambiante) et
  // multiplie facteurJour, qui vaut 0 la nuit : monter l'intensite eclaircit donc le jour sans
  // jamais rallumer un soleil couche.
  dirLight.intensity = facteurJour*0.75*glbViewerIntensiteSoleil;
  dirLight.color.copy(new THREE.Color(0xff8a4c)).lerp(new THREE.Color(0xffffff), facteurJour);
  dirFill.intensity = 0.03 + facteurJour*0.27;
  hemiLight.intensity = 0.12 + facteurJour*0.38;
  // La case "Lumiere d'appoint" coupe les DEUX lumieres autres que le soleil (l'appoint directe
  // ET l'ambiante) : sinon, meme decochee, l'ambiante restait seule a eclairer la scene en pleine
  // nuit (soleil a 0), ce qui contredisait la case - decochee, seul le soleil doit rester, jusqu'a
  // un noir complet quand il est couche.
  dirFill.visible = glbViewerLumiereAppoint;
  hemiLight.visible = glbViewerLumiereAppoint;
  glbViewerScene.renderer.render(glbViewerScene.scene, glbViewerScene.camera);
}
function buildGlbViewerScene(camaraAConserver, tailleHost){
  disposeGlbViewerScene();
  if(!dernierGlbExporte) return;
  const host = document.getElementById('glbViewerCanvasHost');
  // Tant qu'un rechargement est en cours, #glbViewerContent (l'ancetre du host) est cache pour
  // laisser la place au sablier - un ancetre display:none ecrase clientWidth/clientHeight a 0 pour
  // TOUS ses descendants, host compris, ce qui retombe silencieusement sur les tailles par defaut
  // 600x420 meme en plein ecran (le bug : le rendu retrecit d'un coup). `tailleHost`, mesure par
  // l'appelant AVANT de cacher le contenu, contourne ce piege.
  const w = (tailleHost && tailleHost.w) || host.clientWidth || 600;
  const h = (tailleHost && tailleHost.h) || host.clientHeight || 420;
  const loader = new THREE.GLTFLoader();
  loader.parse(dernierGlbExporte.buffer, '', (gltf)=>{
    const scene = new THREE.Scene();
    etat.scene.background = fondGlbViewer();
    // GLTFExporter embarque les lumieres directionnelles de la scene source dans le .glb (via
    // l'extension glTF KHR_lights_punctual ; seule l'hemispherique, non representable, y echappe).
    // Rechargees telles quelles, elles s'ajoutent a celles de la visionneuse SANS etre pilotees par
    // le curseur date/heure : a minuit, ce soleil fige continuait d'eclairer la scene. On les
    // retire donc a l'import - ici l'eclairage doit venir uniquement des lumieres reglables.
    const lumieresDuFichier = [];
    gltf.scene.traverse(o=>{ if(o.isLight) lumieresDuFichier.push(o); });
    lumieresDuFichier.forEach(l=>{ if(l.parent) l.parent.remove(l); });
    etat.scene.add(gltf.scene);

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
    renderer.shadowMap.enabled = glbViewerShadows;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    host.appendChild(renderer.domElement);

    const controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.target.copy(camaraAConserver ? camaraAConserver.cible : centre);
    controls.update();

    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x4a3c2a, 0.5);
    etat.scene.add(hemiLight);
    // Position/intensite/couleur initiales sans importance : appliquerLumiereGlb() ci-dessous les
    // pose selon le curseur "coucher de soleil / plein soleil" juste apres construction.
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.75);
    if(glbViewerShadows){
      dirLight.castShadow = true;
      dirLight.shadow.mapSize.set(2048, 2048);
      const d = rayon * 1.3;
      dirLight.shadow.camera.left = -d; dirLight.shadow.camera.right = d;
      dirLight.shadow.camera.top = d; dirLight.shadow.camera.bottom = -d;
      dirLight.shadow.camera.near = 0.05; dirLight.shadow.camera.far = rayon*8;
      dirLight.shadow.bias = -0.0005;
      dirLight.target.position.copy(centre);
      etat.scene.add(dirLight.target);
    }
    etat.scene.add(dirLight);
    const dirFill = new THREE.DirectionalLight(0xffffff, 0.3);
    dirFill.position.set(centre.x - rayon*1.6, centre.y + rayon*2.2, centre.z - rayon*1.0);
    etat.scene.add(dirFill);

    etat.scene.traverse(o=>{
      if(o.isMesh){
        (Array.isArray(o.material) ? o.material : [o.material]).forEach(m=>{ if(m) m.wireframe = glbViewerFilaire; });
        if(glbViewerShadows){ o.castShadow = true; o.receiveShadow = true; }
      }
    });

    function animate(){
      glbViewerScene.raf = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    }
    glbViewerScene = { renderer, scene, camera, controls, raf:null, dirLight, dirFill, hemiLight, centre, rayon };
    appliquerLumiereGlb();
    animate();

    const hint = document.getElementById('glbViewerHint');
    if(hint) hint.textContent = 'Terrasse : ' + (dernierGlbExporte.nomTerrasse||'') + ' — modele genere le ' + dernierGlbExporte.date.toLocaleString();
    renderVue3DSelect();
    document.getElementById('glbViewerLoading').style.display = 'none';
    document.getElementById('glbViewerContent').style.display = 'block';
  }, (err)=>{
    document.getElementById('glbViewerLoading').style.display = 'none';
    showErrBanner('Visionneuse GLB : ' + (err && err.message ? err.message : 'fichier illisible'));
  });
}
function rafraichirVisionneuseGlb(camaraAConserver){
  const empty = document.getElementById('glbViewerEmpty');
  const content = document.getElementById('glbViewerContent');
  const loading = document.getElementById('glbViewerLoading');
  if(!dernierGlbExporte){
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
      buildGlbViewerScene(camaraAConserver, tailleHost);
    });
  });
}
// Un nouvel export pendant que l'onglet est deja ouvert doit se refleter sans que l'utilisateur
// ait besoin de le rouvrir - mais ne construit rien si l'onglet n'est pas affiche (pas de scene
// qui tourne en arriere-plan sans que personne ne la regarde).
function rafraichirVisionneuseGlbSiOuverte(){
  if(glbViewerOuvert) rafraichirVisionneuseGlb();
}
// Panneau independant (pas un troisieme appMode, cf. la note dans setAppMode) : la Visionneuse
// GLB n'a rien a voir avec les donnees du plan ou de la terrasse, contrairement a "Vue 3D" qui
// est un raccourci visuel vers Mode Terrasse.
function ouvrirVisionneuseGlb(){
  glbViewerOuvert = true;
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
  if(dateInp && !dateInp.value) dateInp.value = glbViewerDateStr;
  syncSemaineDepuisDate();
  document.getElementById('glbViewerHeure').value = glbViewerMinutes;
  document.getElementById('glbViewerHeureTexte').textContent = formatHeureMin(glbViewerMinutes);
  document.getElementById('glbViewerIntensite').value = Math.round(glbViewerIntensiteSoleil*100);
  document.getElementById('glbViewerIntensiteTexte').textContent = Math.round(glbViewerIntensiteSoleil*100) + ' %';
  rafraichirVisionneuseGlb();
}
function fermerVisionneuseGlb(){
  if(!glbViewerOuvert) return;
  glbViewerOuvert = false;
  if(glbViewerPleinePage) setGlbViewerPleinePage(false); // sinon la reouverture repart directement en plein page
  document.getElementById('glbViewerBtn').classList.remove('active');
  document.getElementById('glbViewerPanel').style.display = 'none';
  stage.style.display = '';
  disposeGlbViewerScene();
}

function buildThreeScene(obj){
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
  disposeThreeScene(); // removes the previous canvas (if any); leaves the zoom-buttons overlay in place
  const host = document.getElementById('terrasse3dCanvasHost');
  const w = host.clientWidth || 600, h = host.clientHeight || 420;

  // Sans terrasse : une construction par defaut jetable (aucun objet du plan n'est touche) sert
  // uniquement a garder les constantes de section/hauteur ci-dessous definies.
  const c = obj ? ensureConstruction(obj) : ensureConstruction({});
  const layers = obj ? computeTerrasseLayers(obj, etat.objects) : null;
  // Le centre de la scene se prend sur la terrasse ; a defaut sur la parcelle, sinon sur
  // l'ensemble des objets - la camera doit regarder quelque chose dans tous les cas.
  const objetCentre = obj || trouverParcelleCloture() || etat.objects.find(o=>o.pts && o.pts.length);
  const cen = objetCentre
    ? (objetCentre.type === 'circle' ? {x:objetCentre.center.x, y:objetCentre.center.y} : centroid(objetCentre.pts))
    : {x:0, y:0};
  // La case suit la valeur du projet, pas l'inverse : un projet rouvert retrouve son reglage.
  const cbF = document.getElementById('terrasse3dFilaire');
  if(cbF) cbF.checked = !!c.lames3dFilaire;
  // "Afficher tous les objets" est une preference d'affichage, pas une donnee du chantier : elle
  // ne fait pas partie de `construction` (qui decrit la terrasse a construire) et n'est pas
  // sauvegardee avec le projet, comme le mode de glisser (orbiter/deplacer/zoom) plus haut.
  const cbAll = document.getElementById('terrasse3dAllObjects');
  if(cbAll) cbAll.checked = vue3d.tousLesObjets;
  const cbOpaque = document.getElementById('terrasse3dObjectsOpaque');
  if(cbOpaque) cbOpaque.checked = vue3d.objetsOpaques;
  const cbTextures = document.getElementById('terrasse3dTextures');
  if(cbTextures) cbTextures.checked = vue3d.textures;
  const cbShadows = document.getElementById('terrasse3dShadows');
  if(cbShadows) cbShadows.checked = vue3d.ombres;
  // La cloture est une donnee du projet (rattachee a la parcelle), pas une preference d'affichage
  // volatile comme les cases ci-dessus : elle survit a une fermeture/reouverture du fichier.
  const parcelleObjCtrl = trouverParcelleCloture();
  if(parcelleObjCtrl) syncClotureControls(parcelleObjCtrl);
  // Ce sur quoi la structure repose au-dessus du sol : la hauteur du plot, ou le seul depassement
  // de tete pour une vis, dont le fut est enterre et dessine sous le plan de sol.
  const hauteurVisM = hauteurAppuiMm(c)/1000;
  const enterreM = estPlots(c) ? 0 : (c.hauteurVis||40)/100;
  const soliveDims = (c.soliveSection||'45x70').split('x').map(n=>parseInt(n,10)||0);
  const soliveH = (soliveDims[1]||70)/1000, soliveW = (soliveDims[0]||45)/1000;
  const lambDims = dimsSection(sectionLambourde(c));
  const lambH = c.avecLambourde ? lambDims.h/1000 : 0;
  const lambW = lambDims.b/1000;
  const lameH = (c.epaisseurLame||25)/1000;
  const lameW = (c.largeurLame||140)/1000;

  const scene = new THREE.Scene();
  etat.scene.background = new THREE.Color(0xdfe7ea);

  // En mode "tous les objets", la camera et le sol doivent couvrir tout le plan, pas seulement
  // cette terrasse - sinon la maison ou la parcelle se retrouvent hors champ ou sous un sol trop
  // petit pour les recevoir.
  const ptsPourEtendue = obj ? obj.pts.slice() : [];
  // Sans terrasse, "tous les objets" n'est pas une option : ils sont la seule chose a montrer.
  if(vue3d.tousLesObjets || !obj){
    etat.objects.forEach(o=>{
      if(o===obj) return;
      if(o.type==='circle') ptsPourEtendue.push(...cerclePointsExtent(o));
      else if(o.pts) ptsPourEtendue.push(...o.pts);
    });
  }
  function cerclePointsExtent(o){
    return [{x:o.center.x-o.r,y:o.center.y},{x:o.center.x+o.r,y:o.center.y},
            {x:o.center.x,y:o.center.y-o.r},{x:o.center.x,y:o.center.y+o.r}];
  }
  const maxRadius = ptsPourEtendue.reduce((m,p)=>Math.max(m, dist(p,cen)), 0);
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
  etat.scene.add(hemiLight);
  // Position/intensite/couleur posees juste apres construction par appliquerLumiereVue3d(),
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
  etat.scene.add(dirLight);
  const dirFill = new THREE.DirectionalLight(0xffffff, 0.3);
  dirFill.position.set(-extent*0.8, extent*1.1, -extent*0.5);
  etat.scene.add(dirFill);

  const groundGeo = new THREE.PlaneGeometry(extent*4, extent*4);
  const groundMat = new THREE.MeshStandardMaterial({color:0x9fb98c});
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.rotation.x = -Math.PI/2;
  ground.receiveShadow = vue3d.ombres;
  etat.scene.add(ground);

  // Three.js est en Y-haut : X=Est reste X, hauteur devient Y, donc le plan (Est,Nord) doit se
  // loger sur (X,Z). Mais Est x Nord = Haut (repere ENU standard), alors que X x Y = Z en
  // Three.js - caser Nord tel quel sur Z revient a permuter Y et Z d'un repere direct, ce qui
  // l'inverse (determinant -1) : toute la scene se retrouvait vue en miroir, gauche/droite
  // echangee. Nord doit porter sur -Z (donc Z = Sud) pour rester un repere direct.
  function toLocal(p){ return { x:p.x-cen.x, z:cen.y-p.y }; }

  // Visible outline of the terrasse's real footprint at ground level, so the boards'
  // orientation above can be checked against the actual polygon angle at a glance.
  if(obj){
    const outlinePts = obj.pts.map(p=>{ const l=toLocal(p); return new THREE.Vector3(l.x, 0.01, l.z); });
    outlinePts.push(outlinePts[0].clone());
    const outline = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(outlinePts),
      new THREE.LineBasicMaterial({color:0x2a2a2a})
    );
    etat.scene.add(outline);
  }

  // Le calque orthophoto du plan sert aussi de sol a la 3D : une dalle par tuile, posee juste
  // au-dessus du sol vert. Materiau eclaire (pas "basic") pour que la photo suive le soleil -
  // une image en pleine lumiere sur une scene de nuit trahirait l'heure choisie.
  if(orthoActif && orthoTuiles.length){
    const chargeurOrtho = new THREE.TextureLoader();
    orthoTuiles.forEach(t=>{
      const tex = chargeurOrtho.load(t.dataUri);
      if(THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
      const dalle = new THREE.Mesh(
        new THREE.PlaneGeometry(t.largeur, t.hauteur),
        new THREE.MeshStandardMaterial({ map:tex, roughness:1, metalness:0 })
      );
      dalle.rotation.x = -Math.PI/2;   // le haut de l'image (nord) part alors sur -Z, comme le plan
      const l = toLocal({ x:t.xMin + t.largeur/2, y:t.yMin + t.hauteur/2 });
      dalle.position.set(l.x, 0.004, l.z);
      dalle.receiveShadow = vue3d.ombres;
      etat.scene.add(dalle);
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
  function addPrism(footprint, yBase, height, color, filaire, opacity, textures){
    if(!footprint || footprint.length < 3 || height <= 0) return;
    const pts2d = footprint.map(p=>{ const l=toLocal(p); return {x:l.x, y:-l.z}; });
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
    const distDe = (x,y) => {
      let meilleur = 0, meilleurEcart = Infinity;
      for(let i=0;i<pts2d.length;i++){
        const e = Math.abs(pts2d[i].x-x) + Math.abs(pts2d[i].y-y);
        if(e < meilleurEcart){ meilleurEcart = e; meilleur = distAcc[i]; }
      }
      return meilleur;
    };
    const uvGenerator = {
      generateTopUV: (geometry, vertices, indexA, indexB, indexC) => [indexA,indexB,indexC].map(
        idx => new THREE.Vector2(vertices[idx*3], vertices[idx*3+1])),
      generateSideWallUV: (geometry, vertices, indexA, indexB, indexC, indexD) => [indexA,indexB,indexC,indexD].map(
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
      const faire = (texRef) => {
        const mat = new THREE.MeshStandardMaterial({color});
        if(opacity !== undefined && opacity < 1){ mat.transparent = true; mat.opacity = Math.max(0.15, opacity); }
        if(texRef && texRef.url){
          mat.map = chargerTexturePolyhaven(texRef.url);
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
    etat.scene.add(objet);
  }
  // Silhouette au sol : sert pour la parcelle (jamais un bloc plein).
  function addGroundOutline(pts, color, closed){
    if(!pts || pts.length < 2) return;
    const vpts = pts.map(p=>{ const l=toLocal(p); return new THREE.Vector3(l.x, 0.008, l.z); });
    if(closed) vpts.push(vpts[0].clone());
    etat.scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(vpts),
                              new THREE.LineBasicMaterial({color})));
  }
  // Meme algorithme que pathD (Catmull-Rom -> Bezier cubique, cf. rendu 2D du plan) mais evalue
  // directement en coordonnees plan plutot qu'en coordonnees ecran : les coefficients ne sont que
  // des combinaisons affines des points de controle, le resultat est donc la MEME courbe, juste
  // echantillonnee en une polyligne dense au lieu d'un trace SVG. Sans ca, un chemin en mode
  // courbe se rendrait en 3D comme la ligne brisee de ses points de controle, jamais comme la
  // courbe lissee qu'on voit dans le plan.
  function courbePolyligne(pts, curve, segsParTroncon){
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
  function ribbonChemin(pts, largeur){
    const n = pts.length;
    if(n < 2 || !(largeur > 0)) return null;
    const demi = largeur/2;
    const segs = [];
    for(let i=0;i<n-1;i++){
      const a=pts[i], b=pts[i+1];
      const ex=b.x-a.x, ey=b.y-a.y; const L=Math.hypot(ex,ey)||1;
      segs.push({ ux:ex/L, uy:ey/L, nx:-ey/L, ny:ex/L });
    }
    function bord(i, sens){
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
  function addRibbonFlat(poly, color, yLevel, opacity, texRef){
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
    if(texRef && texRef.url){
      mat.map = chargerTexturePolyhaven(texRef.url);
      // ShapeGeometry pousse deja les coordonnees locales brutes (des metres reels) comme UV -
      // meme correction qu'addPrism plus haut : 1/METRES_PAR_CARREAU cale une image sur
      // METRES_PAR_CARREAU m sans reproportionner en plus selon la taille de la forme.
      mat.map.repeat.set(1/METRES_PAR_CARREAU, 1/METRES_PAR_CARREAU);
    }
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.y = yLevel;
    etat.scene.add(mesh);
  }
  // Approxime un cercle du plan par un polygone regulier, au RAYON REEL (contrairement a
  // empriseEquipement qui grossit volontairement au rayon circonscrit pour une zone de charge) :
  // ici c'est un rendu visuel, pas une emprise structurelle.
  function cerclePoly(center, r, n){
    n = n || 28;
    const pts = [];
    for(let i=0;i<n;i++){ const a = 2*Math.PI*i/n; pts.push({ x:center.x+r*Math.cos(a), y:center.y+r*Math.sin(a) }); }
    return pts;
  }
  // One board, cut to the outline it sits in rather than squared off at 90 degrees.
  function addBeam(a, b, yBase, sectionH, sectionW, color, poly, filaire, textures){
    if(dist(a,b) < 0.02) return;
    addPrism(empriseLame(a, b, sectionW, poly), yBase, sectionH, color, filaire, undefined, textures);
  }
  // A perimeter ring, mitred: each edge becomes the quad between the two bounding rings, so the
  // corners meet on the mitre line instead of two square ends overlapping.
  function addBande(bande, yBase, height, color, textures){
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
  function addPost(p, profondeur, hTete, radius, color){
    const P = toLocal(p);
    if(profondeur > 0){
      const geo = new THREE.CylinderGeometry(radius, radius*0.5, profondeur, 10);
      const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({color}));
      mesh.position.set(P.x, -profondeur/2, P.z);
      etat.scene.add(mesh);
    }
    if(hTete > 0){
      const fut = new THREE.Mesh(new THREE.CylinderGeometry(radius*0.8, radius*0.8, hTete, 10),
                                 new THREE.MeshStandardMaterial({color:0xb8c2ce}));
      fut.position.set(P.x, hTete/2, P.z);
      etat.scene.add(fut);
      // La platine qui recoit la solive, plaquee sous le dessous de la structure.
      const ep = Math.min(0.012, hTete*0.35);
      const pl = new THREE.Mesh(new THREE.BoxGeometry(radius*3.4, ep, radius*3.4),
                                new THREE.MeshStandardMaterial({color:0x8a96a8}));
      pl.position.set(P.x, hTete - ep/2, P.z);
      etat.scene.add(pl);
    }
  }
  // Un plot n'a pas la silhouette d'une vis : base large evasee posee sur l'assise, fut etroit,
  // tete plate sous la lambourde. La base porte la surface d'assise reglee dans Construction.
  function addPlot(p, yTop, color){
    const P = toLocal(p);
    if(yTop<=0) return;
    const rBase = Math.sqrt((c.plotSurfaceAssise||PLOT_ASSISE_MIN_CM2)/Math.PI)/100;
    const hBase = Math.min(0.03, yTop*0.3);
    const hTete = Math.min(0.02, yTop*0.2);
    const mat = new THREE.MeshStandardMaterial({color});
    const base = new THREE.Mesh(new THREE.CylinderGeometry(rBase*0.72, rBase, hBase, 14), mat);
    base.position.set(P.x, hBase/2, P.z); etat.scene.add(base);
    const futH = Math.max(0.005, yTop - hBase - hTete);
    const fut = new THREE.Mesh(new THREE.CylinderGeometry(rBase*0.3, rBase*0.34, futH, 12), mat);
    fut.position.set(P.x, hBase + futH/2, P.z); etat.scene.add(fut);
    const tete = new THREE.Mesh(new THREE.CylinderGeometry(rBase*0.55, rBase*0.55, hTete, 14), mat);
    tete.position.set(P.x, yTop - hTete/2, P.z); etat.scene.add(tete);
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
    const opaciteDe = o => vue3d.objetsOpaques ? undefined : o.fillOpacity;
    // "Texture" decoche revient a la couleur unie sans avoir a retirer la texture de chaque
    // objet - un simple objet vide desactive le rendu texture le temps de la case decochee.
    const texturesDe = o => vue3d.textures ? {horizontale:o.textureHorizontale, vertical:o.textureVerticale} : null;
    etat.objects.forEach(o=>{
      if(o===obj) return;
      if(objetMasque(o)) return; // masque dans le plan = masque partout, y compris ici (voisinage compris)
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
          const h = elevationOf(o);
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
        const plMat = toLocal(positionMat(o));
        const matMat = new THREE.MeshStandardMaterial({color:0x6b5a44});
        const mat = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, hMat, 10), matMat);
        mat.position.set(plMat.x, hMat/2, plMat.z);
        etat.scene.add(mat);
        if(o.matDeporte){
          // Le bras horizontal qui rattrape le deport, sinon la toile flotte sans lien visible.
          const dx = pl.x-plMat.x, dz = pl.z-plMat.z;
          const L = Math.hypot(dx, dz);
          if(L > 0.01){
            const bras = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, L, 8), matMat);
            bras.position.set((pl.x+plMat.x)/2, hMat, (pl.z+plMat.z)/2);
            bras.rotation.z = Math.PI/2;
            bras.rotation.y = -Math.atan2(dz, dx);
            etat.scene.add(bras);
          }
        }
        const matToile = new THREE.MeshStandardMaterial({color: o.fill || '#7a9e6b', side: THREE.DoubleSide});
        const opac = opaciteDe(o);
        if(opac !== undefined && opac < 1){ matToile.transparent = true; matToile.opacity = Math.max(0.15, opac); }
        const texToile = vue3d.textures ? (o.textureHorizontale || o.textureVerticale) : null;
        if(texToile && texToile.url) matToile.map = chargerTexturePolyhaven(texToile.url);
        // Cone tres plat pose sur le mat : la silhouette d'un parasol ouvert, et surtout la meme
        // emprise circulaire au sol que le rayon utilise pour calculer l'ombre en 2D.
        const toile = new THREE.Mesh(new THREE.ConeGeometry(o.r, Math.max(0.15, o.r*0.28), 24), matToile);
        toile.position.set(pl.x, hMat + Math.max(0.15, o.r*0.28)/2, pl.z);
        etat.scene.add(toile);
        return;
      }
      const h = elevationOf(o);
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
        if(vue3d.textures && o.textureArbre && o.textureArbre.url){
          matSphere.map = chargerTexturePolyhaven(o.textureArbre.url);
        }
        const sphere = new THREE.Mesh(new THREE.SphereGeometry(rayon, 20, 16), matSphere);
        const pLocal = toLocal(centreArbre);
        // Posee pile au sommet (centre a h+rayon), la sphere ne fait que toucher le tronc en un
        // seul point tangent - un simple contact ponctuel, pas un raccord : ca se voit comme une
        // fine ligne/aret entre les deux. On l'enfonce d'un tiers de son rayon pour qu'elle
        // enveloppe le sommet du tronc (bien plus fin qu'elle) au lieu de juste le toucher.
        sphere.position.set(pLocal.x, h + rayon*0.67, pLocal.z);
        etat.scene.add(sphere);
      }
    });
  }

  // Cloture perimetrale : case a cocher independante de "tous les objets" (elle borne la
  // parcelle, pas un objet du jardin) - une fine bande mitree tout le tour, comme la lame de
  // rive de la terrasse plus haut, mais suivant le contour de la parcelle plutot que celui de
  // la terrasse et avec sa propre hauteur/couleur/texture reglables depuis le bandeau au-dessus
  // du rendu 3D.
  const parcelleCloture = trouverParcelleCloture();
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
    etat.scene.traverse(o=>{
      if(o.isMesh){ o.castShadow = true; o.receiveShadow = true; }
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
  applyMode3D();
  renderVue3DSelect();
  syncControlesSoleilVue3d();
  appliquerLumiereVue3d();   // pose les lumieres ET rend une premiere image

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
  if(!glbViewerScene) return;
  const terr = etat.objects.find(o=>o.key===etat.terrasseSelectedKey && o.fonction==='terrasse')
            || etat.objects.find(o=>o.fonction==='terrasse');
  if(!terr) return;
  const cen = centroid(terr.pts);
  const ddx = vp.pts[1].x-vp.pts[0].x, ddy = vp.pts[1].y-vp.pts[0].y;
  const dl = Math.hypot(ddx,ddy) || 1;
  const rad = Math.atan2(ddy/dl, ddx/dl);
  const eyeY = vp.altitude || 1.6;
  const lx = vp.pts[0].x-cen.x, lz = cen.y-vp.pts[0].y;
  const { camera, controls, renderer, scene } = glbViewerScene;
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
  if(!glbViewerScene) return;
  const host = document.getElementById('glbViewerCanvasHost');
  const w = host.clientWidth || 600, h = host.clientHeight || 420;
  glbViewerScene.camera.aspect = w/h;
  glbViewerScene.camera.updateProjectionMatrix();
  glbViewerScene.renderer.setSize(w, h);
  glbViewerScene.renderer.render(glbViewerScene.scene, glbViewerScene.camera);
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
window.addEventListener('resize', ()=>{ if(vue3d.scene) resizeThreeScene(); if(glbViewerScene) resizeGlbViewerScene(); });

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
    document.getElementById('terrasse3dLoading').style.display = threeLoaded ? 'none' : '';
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
  renderTerrasseConfigurator(obj);
  renderTerrasseLayerTabs(obj);
  renderTerrasseLayerView(obj);
  renderTerrasseCoupe(obj);
  renderBOMTable(obj);
  renderOptimResult(obj);
  renderImplantation(obj);
  renderChantier(obj);
  renderMethode(obj);
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
const ECHELLES = [200, 100, 50, 20];
function renderImplantation(obj){
  const host = document.getElementById('terrasseImplantWrap');
  if(!host) return;
  const c = ensureConstruction(obj);
  host.innerHTML = '';
  if(!obj.pts || obj.pts.length<3){ host.innerHTML = '<div class="hint">Terrasse invalide.</div>'; return; }
  const layers = computeTerrasseLayers(obj, etat.objects);
  const I = computeImplantation(obj, layers);
  const ech = ECHELLES.includes(c.echelleImplant) ? c.echelleImplant : 200;
  const mm = m => m*1000/ech;                       // metres reels -> mm sur le papier
  const marge = 18;                                  // mm, place pour les cotes
  const W = mm(I.bbox.x1-I.bbox.x0) + marge*2;
  const H = mm(I.bbox.y1-I.bbox.y0) + marge*2;
  const P = p => ({ x: marge + mm(p.x-I.bbox.x0), y: marge + mm(p.y-I.bbox.y0) });
  const nom = estPlots(c) ? 'plots' : 'vis';

  // ---- barre de reglage ----
  const barre = document.createElement('div');
  barre.className = 'controls';
  const lab = document.createElement('label');
  lab.textContent = 'Echelle : '; lab.style.marginRight='5px'; lab.style.fontSize='0.88rem';
  const sel = document.createElement('select');
  ECHELLES.forEach(e=>{ const o=document.createElement('option'); o.value=e; o.textContent='1/'+e;
    if(e===ech) o.selected=true; sel.appendChild(o); });
  sel.addEventListener('change', ()=>{ pushHistory(); c.echelleImplant = parseInt(sel.value,10)||200; refreshTerrasseView(); });
  barre.appendChild(lab); barre.appendChild(sel);
  const btn = document.createElement('button');
  btn.className='objbtn'; btn.textContent='Imprimer le plan'; btn.style.marginLeft='14px';
  barre.appendChild(btn);
  const taille = document.createElement('span');
  taille.style.cssText = 'margin-left:14px; font-size:0.84rem; color:var(--ink-soft);';
  taille.textContent = 'sur papier : ' + W.toFixed(0) + ' × ' + H.toFixed(0) + ' mm' +
    (W>287||H>200 ? (W>410||H>287 ? ' — depasse l\'A3' : ' — tient en A3 paysage') : ' — tient en A4 paysage');
  barre.appendChild(taille);
  host.appendChild(barre);

  // ---- le plan ----
  const s = document.createElementNS(svgNS,'svg');
  s.setAttribute('width', W+'mm'); s.setAttribute('height', H+'mm');
  s.setAttribute('viewBox', '0 0 '+W+' '+H);
  s.style.cssText = 'background:#fff; border:1px solid var(--rule,#ccc); max-width:100%;';
  const el = (t,at)=>{ const e=document.createElementNS(svgNS,t);
    Object.keys(at).forEach(k=>e.setAttribute(k,at[k])); return e; };
  const txt = (x,y,t,size,fill,anchor)=>{ const e=el('text',{x,y,'font-size':size||2.2,
    fill:fill||'#111','font-family':"'Helvetica Neue',Arial,sans-serif",
    'text-anchor':anchor||'start'}); e.textContent=t; return e; };

  // contour
  s.appendChild(el('polygon',{ points:I.sommets.map(v=>{const q=P(v);return q.x+','+q.y;}).join(' '),
    fill:'#fafafa', stroke:'#111', 'stroke-width':0.5 }));

  // lignes porteuses : c'est sur elles qu'on tend les cordeaux
  const porteuses = (layers.solives.length ? layers.solives : layers.lambourdes);
  porteuses.forEach(seg=>{
    const a=P(I.R.vers(seg.a)), b=P(I.R.vers(seg.b));
    s.appendChild(el('line',{x1:a.x,y1:a.y,x2:b.x,y2:b.y,stroke:'#9aa6b0','stroke-width':0.25,'stroke-dasharray':'2 1.5'}));
  });

  // diagonales de controle
  I.diagonales.forEach(d=>{
    const a=P(I.sommets[d.de]), b=P(I.sommets[d.a]);
    s.appendChild(el('line',{x1:a.x,y1:a.y,x2:b.x,y2:b.y,stroke:'#c0392b','stroke-width':0.25,'stroke-dasharray':'3 2'}));
    s.appendChild(txt((a.x+b.x)/2, (a.y+b.y)/2-0.8, d.d.toFixed(3)+' m', 2, '#c0392b','middle'));
  });

  // cotes du contour, cote par cote
  I.sommets.forEach((v,i)=>{
    const w = I.sommets[(i+1)%I.sommets.length];
    const a=P(v), b=P(w);
    const L = dist(obj.pts[i], obj.pts[(i+1)%obj.pts.length]);
    const ang = Math.atan2(b.y-a.y, b.x-a.x)*180/Math.PI;
    const mx=(a.x+b.x)/2, my=(a.y+b.y)/2;
    const t = txt(0,-1.2, L.toFixed(3)+' m', 2.4, '#111','middle');
    t.setAttribute('transform','translate('+mx+','+my+') rotate('+(ang>90||ang<-90?ang+180:ang)+')');
    s.appendChild(t);
  });

  // appuis numerotes
  const COUL = { rive:'#0f3d49', spa:'#a8452a', courant:'#235e6e' };
  I.appuis.forEach(a=>{
    const q = P(a);
    s.appendChild(el('circle',{cx:q.x,cy:q.y,r:ech<=50?1.6:1.0,
      fill:COUL[a.role]||'#235e6e',stroke:'#fff','stroke-width':0.2}));
    if(ech<=100) s.appendChild(txt(q.x, q.y-2.0, String(a.n), ech<=50?2.0:1.5, '#111','middle'));
  });

  // repere et axes de tracage
  const O = P({x:0,y:0});
  s.appendChild(el('circle',{cx:O.x,cy:O.y,r:1.8,fill:'none',stroke:'#c0392b','stroke-width':0.5}));
  s.appendChild(el('line',{x1:O.x,y1:O.y,x2:O.x+mm(I.R.longueurCote),y2:O.y,stroke:'#c0392b','stroke-width':0.4}));
  s.appendChild(txt(O.x-2.5, O.y+3.5, 'R', 3, '#c0392b'));
  s.appendChild(txt(O.x+mm(I.R.longueurCote)/2, O.y-2.5, 'cordeau X — cote '+(I.R.cote+1), 2.2, '#c0392b','middle'));

  // echelle graphique : le controle qui dit si l'impression a ete mise a l'echelle
  const yE = H-6, xE = marge;
  s.appendChild(el('line',{x1:xE,y1:yE,x2:xE+mm(1),y2:yE,stroke:'#111','stroke-width':0.6}));
  s.appendChild(el('line',{x1:xE,y1:yE-1,x2:xE,y2:yE+1,stroke:'#111','stroke-width':0.4}));
  s.appendChild(el('line',{x1:xE+mm(1),y1:yE-1,x2:xE+mm(1),y2:yE+1,stroke:'#111','stroke-width':0.4}));
  s.appendChild(txt(xE+mm(1)+1.5, yE+0.8, '1 m — echelle 1/'+ech, 2.4, '#111'));
  host.appendChild(s);

  const scaleHint = Object.assign(document.createElement('div'), { className:'hint',
    textContent: 'Le dessin est en millimetres reels : imprime a 100 % (sans « ajuster a la page »), ' +
      'le segment temoin en bas mesure exactement 1 m a l\'echelle 1/' + ech + '. Verifie-le au ' +
      'double-decimetre avant de tracer. Le repere R est le depart du cote de reference ; les ' +
      'deux cordeaux a tendre en premier sont X le long de ce cote et Y perpendiculaire.' });
  host.appendChild(scaleHint);

  // ---- controle d'equerrage ----
  const tD = document.createElement('table');
  tD.className='attrTable';
  tD.appendChild(Object.assign(document.createElement('tr'),
    { innerHTML:'<th>Controle</th><th>Mesure</th><th>Role</th>' }));
  I.diagonales.forEach(d=>{
    const tr=document.createElement('tr');
    tr.innerHTML = '<td>Diagonale sommet '+(d.de+1)+' → '+(d.a+1)+'</td><td>'+d.d.toFixed(3)+
      ' m</td><td>a mesurer au ruban avant de fixer quoi que ce soit</td>';
    tD.appendChild(tr);
  });
  if(I.diagonales.length===2){
    const ecart = Math.abs(I.diagonales[0].d - I.diagonales[1].d);
    const tr=document.createElement('tr');
    tr.style.fontWeight='600';
    tr.innerHTML = '<td>Ecart entre diagonales</td><td>'+(ecart*1000).toFixed(0)+' mm</td>'+
      '<td>'+(ecart<0.005 ? 'contour d\'equerre' : 'contour non rectangle — normal si la forme ne l\'est pas')+'</td>';
    tD.appendChild(tr);
  }
  const titreEquerrage = Object.assign(document.createElement('div'),
    { className:'sectionTitle', textContent:'Controle d\'equerrage', style:'margin-top:18px;' });
  host.appendChild(titreEquerrage);
  host.appendChild(tD);

  // ---- coordonnees, par rangee ----
  const titrePieces = Object.assign(document.createElement('div'),
    { className:'sectionTitle', textContent:'Implantation des '+nom+' — pièce par pièce', style:'margin-top:18px;' });
  host.appendChild(titrePieces);
  const pieceHint = Object.assign(document.createElement('div'), { className:'hint',
    textContent: 'Une pièce = un cordeau. On materialise la piece entre ses deux extremites ' +
      '(coordonnees X/Y depuis le repere R), puis on marque ses appuis au ruban le long d\'elle. ' +
      I.appuis.length + ' ' + nom + ' repartis sur ' + I.lignes.length + ' pieces.' });
  host.appendChild(pieceHint);
  const tR = document.createElement('table');
  tR.className='attrTable';
  tR.appendChild(Object.assign(document.createElement('tr'),
    { innerHTML:'<th>Piece</th><th>Depart X / Y</th><th>Fin X / Y</th><th>Nb</th>' +
                '<th>Appuis, distance depuis le depart (m)</th>' }));
  I.lignes.forEach(l=>{
    const tr=document.createElement('tr');
    const cell=t=>{const td=document.createElement('td'); td.textContent=t; return td;};
    const nb=t=>{const td=cell(t); td.style.cssText='font-variant-numeric:tabular-nums;'; return td;};
    tr.appendChild(cell(l.ref + ' — ' + l.type));
    tr.appendChild(nb(l.depart.x.toFixed(3) + ' / ' + l.depart.y.toFixed(3)));
    tr.appendChild(nb(l.fin.x.toFixed(3) + ' / ' + l.fin.y.toFixed(3)));
    tr.appendChild(cell(String(l.appuis.length)));
    const tdD=cell(l.appuis.map(a=>a.d.toFixed(3)).join('  ·  '));
    tdD.style.cssText='font-variant-numeric:tabular-nums; font-size:0.84rem;';
    tr.appendChild(tdD);
    tR.appendChild(tr);
  });
  host.appendChild(tR);

  // ---- sommets ----
  const titreSommets = Object.assign(document.createElement('div'),
    { className:'sectionTitle', textContent:'Sommets du contour', style:'margin-top:18px;' });
  host.appendChild(titreSommets);
  const tS = document.createElement('table');
  tS.className='attrTable';
  tS.appendChild(Object.assign(document.createElement('tr'),
    { innerHTML:'<th>Sommet</th><th>X (m)</th><th>Y (m)</th><th>Cote suivant (m)</th>' }));
  I.sommets.forEach((v,i)=>{
    const tr=document.createElement('tr');
    const L = dist(obj.pts[i], obj.pts[(i+1)%obj.pts.length]);
    tr.innerHTML = '<td>'+(i+1)+(i===I.R.cote?' (repere R)':'')+'</td><td>'+v.x.toFixed(3)+
      '</td><td>'+v.y.toFixed(3)+'</td><td>'+L.toFixed(3)+'</td>';
    tS.appendChild(tr);
  });
  host.appendChild(tS);

  // Impression : une fenetre autonome, pour ne pas dependre de la mise en page de l'appli. Le
  // plan seul ne suffit pas sur le chantier : les tableaux (equerrage, coordonnees piece par
  // piece, sommets) portent les chiffres a reporter au ruban, donc ils s'impriment SOUS le plan,
  // pas seulement affiches a l'ecran.
  btn.addEventListener('click', ()=>{
    const w = window.open('', '_blank');
    if(!w){ showToast('Autorise les fenetres pop-up pour imprimer le plan.'); return; }
    w.document.write('<!doctype html><meta charset="utf-8"><title>Implantation — '+
      escapeHtml(obj.name||'terrasse')+' — 1/'+ech+'</title>' +
      '<style>@page{margin:10mm} body{margin:0;font-family:Arial,sans-serif;font-size:10pt}' +
      'h1{font-size:12pt;margin:0 0 4mm}' +
      '.hint{color:#555;font-size:9pt;margin:3mm 0}' +
      '.sectionTitle{font-weight:600;font-size:10.5pt;margin:6mm 0 2mm;page-break-after:avoid}' +
      'table{border-collapse:collapse;width:100%;margin-bottom:2mm}' +
      'th,td{border:1px solid #999;padding:1.2mm 2mm;text-align:left;font-size:8.5pt}' +
      'th{background:#eee}' +
      'table{page-break-inside:auto} tr{page-break-inside:avoid}</style>' +
      '<h1>Implantation '+escapeHtml(nom)+' — '+escapeHtml(obj.name||'terrasse')+' — echelle 1/'+ech+
      ' — imprimer a 100 %</h1>' + s.outerHTML +
      scaleHint.outerHTML + titreEquerrage.outerHTML + tD.outerHTML +
      titrePieces.outerHTML + pieceHint.outerHTML + tR.outerHTML +
      titreSommets.outerHTML + tS.outerHTML);
    w.document.close();
    w.focus();
    setTimeout(()=>w.print(), 300);
  });
}

// Le planning : une ligne par activite reellement necessaire a CETTE terrasse, avec sa quantite
// tiree du projet et sa cadence reglable. Un forfait au m² ne se discute pas ; une ligne avec sa
// quantite et sa cadence, si.
function renderChantier(obj){
  const host = document.getElementById('terrasseChantierWrap');
  if(!host) return;
  const c = ensureConstruction(obj);
  host.innerHTML = '';
  if(!obj.pts || obj.pts.length<3){ host.innerHTML = '<div class="hint">Terrasse invalide.</div>'; return; }
  const layers = computeTerrasseLayers(obj, etat.objects);
  const ch = computeChantier(obj, layers);
  const equipe = Math.max(1, Math.round(c.equipe||2));
  const hJour = Math.max(1, c.heuresJour||7);
  const jours = ch.total/(equipe*hJour);

  const intro = document.createElement('div');
  intro.className = 'hint';
  intro.textContent = 'Toutes les activites necessaires a cette terrasse, dans l\'ordre du chantier. ' +
    'Les quantites viennent du projet — nombre d\'appuis, metres de bois, barres a debiter, m³ ' +
    'de concasse — et les cadences sont reglables ligne par ligne. Main-d\'oeuvre seule : ni ' +
    'livraison, ni prise de rendez-vous, ni sechage.';
  host.appendChild(intro);

  const barre = document.createElement('div');
  barre.className = 'controls';
  const mk = (lbl, val, step, min, apply) => {
    const w=document.createElement('span'); w.style.cssText='margin-right:18px; font-size:0.88rem;';
    const l=document.createElement('label'); l.textContent=lbl+' : '; l.style.marginRight='5px';
    const i=document.createElement('input'); i.type='number'; i.step=step; i.min=min; i.value=val; i.style.width='70px';
    i.addEventListener('change', ()=>{ apply(parseFloat(i.value)); refreshTerrasseView(); });
    w.appendChild(l); w.appendChild(i); return w;
  };
  barre.appendChild(mk('Equipe (personnes)', equipe, '1', '1', v=>c.equipe = (isNaN(v)||v<1)?2:Math.round(v)));
  barre.appendChild(mk('Heures par jour', hJour, '0.5', '1', v=>c.heuresJour = (isNaN(v)||v<1)?7:v));
  host.appendChild(barre);

  const tbl = document.createElement('table');
  tbl.className = 'attrTable';
  tbl.appendChild(Object.assign(document.createElement('tr'),
    { innerHTML:'<th>Activite</th><th>Quantite</th><th>Cadence</th><th>Duree</th><th>Part</th>' }));
  CHANTIER_PHASES.forEach(phase=>{
    const lignes = ch.lignes.filter(l=>l.phase===phase);
    if(!lignes.length) return;
    const hPhase = lignes.reduce((s,l)=>s+l.heures,0);
    const trP = document.createElement('tr');
    trP.style.cssText = 'font-weight:600; background:var(--accent-light);';
    trP.innerHTML = '<td>' + phase + '</td><td></td><td></td><td>' + hPhase.toFixed(1) +
      ' h</td><td>' + (100*hPhase/(ch.total||1)).toFixed(0) + ' %</td>';
    tbl.appendChild(trP);
    lignes.forEach(l=>{
      const tr = document.createElement('tr');
      const cell = t => { const td=document.createElement('td'); td.textContent=t; return td; };
      const td0 = cell('　' + l.label);
      if(ch.dominant && l.cle===ch.dominant.cle) td0.style.fontWeight='600';
      tr.appendChild(td0);
      tr.appendChild(cell(l.qte.toFixed(l.unite==='u'?0:2) + ' ' + l.unite));
      const tdC = document.createElement('td');
      const inp = document.createElement('input');
      inp.type='number'; inp.step='0.01'; inp.min='0'; inp.style.width='80px';
      inp.value = l.cadence.toFixed(2);
      inp.title = 'Heures par ' + l.unite;
      inp.addEventListener('change', ()=>{
        const v = parseFloat(inp.value);
        if(isNaN(v)||v<0) delete c.cadences[l.cle]; else c.cadences[l.cle] = v;
        refreshTerrasseView();
      });
      tdC.appendChild(inp);
      const u=document.createElement('span'); u.textContent=' h/'+l.unite;
      u.style.cssText='font-size:0.78rem; color:var(--ink-soft);'; tdC.appendChild(u);
      tr.appendChild(tdC);
      const tdH = cell(l.heures.toFixed(1) + ' h');
      tdH.style.cssText = 'font-variant-numeric:tabular-nums;';
      tr.appendChild(tdH);
      tr.appendChild(cell((100*l.heures/(ch.total||1)).toFixed(0) + ' %'));
      tbl.appendChild(tr);
    });
  });
  const tot = document.createElement('tr');
  tot.style.fontWeight = '700';
  tot.innerHTML = '<td>Total main-d\'oeuvre</td><td>' + ch.surf.toFixed(2) + ' m²</td><td></td><td>' +
    ch.total.toFixed(1) + ' h</td><td>100 %</td>';
  tbl.appendChild(tot);
  host.appendChild(tbl);

  const bilan = document.createElement('div');
  bilan.className = 'hint';
  bilan.innerHTML = '<b>' + ch.total.toFixed(0) + ' heures</b> au total, soit <b>' +
    jours.toFixed(1) + ' jours</b> a ' + equipe + ' personne' + (equipe>1?'s':'') + ' sur ' +
    hJour + ' h — et ' + (ch.total/ch.surf).toFixed(1) + ' h/m².' +
    (ch.dominant ? ' Le poste le plus lourd est <b>' + ch.dominant.label.toLowerCase() + '</b> (' +
      ch.dominant.heures.toFixed(1) + ' h, ' + (100*ch.dominant.heures/ch.total).toFixed(0) +
      ' % du chantier) : c\'est lui qu\'il faut attaquer pour raccourcir.' : '');
  host.appendChild(bilan);

  if(!estPlots(c) && ch.nbAppuis > 0){
    const cmp = document.createElement('div');
    cmp.className = 'hint';
    cmp.textContent = 'A titre de comparaison, poser un plot prend environ ' +
      CADENCES.posePlots.h.toFixed(2) + ' h contre ' + CADENCES.vissage.h.toFixed(2) +
      ' h pour visser une vis de fondation — mais il en faut trois a quatre fois plus, et il ' +
      'faut prealablement realiser l\'assise. Le mode de pose se decide sur le sol et le budget, ' +
      'pas sur la duree seule.';
    host.appendChild(cmp);
  }
}

// The method sheet is generated from the very constants the engine runs on, so it cannot drift
// away from what the plan actually does: change PORTEE_VIS_K and this page changes with it.
function renderMethode(obj){
  const host = document.getElementById('terrasseMethodeWrap');
  if(!host) return;
  const c = ensureConstruction(obj);

  // The tables are generated with the project's own calibration, so they show what this plan
  // actually uses rather than the factory defaults.
  const cal = e => ({ soliveSection:'', soliveEntraxe:e, kPortee:c.kPortee, chargeNormale:c.chargeNormale });
  const sectionRows = SOLIVE_SECTIONS.map(s=>{
    const d = SOLIVE_SECTION_DIMS[s];
    const p40 = Math.round(maxPorteeVisM({...cal(40), soliveSection:s})*100);
    const p50 = Math.round(maxPorteeVisM({...cal(50), soliveSection:s})*100);
    const p70 = Math.round(maxPorteeVisM({...cal(70), soliveSection:s})*100);
    return '<tr><td>' + s + ' mm</td><td>' + d.b + ' × ' + d.h + '</td><td>' + p40 +
           ' cm</td><td>' + p50 + ' cm</td><td>' + p70 + ' cm</td></tr>';
  }).join('');

  const lameRows = [19,21,22,24,25,27,28].map(ep=>{
    const K = c.kEntraxeLame;
    const bois = maxEntraxeLameCm({epaisseurLame:ep, essenceBois:'pin-classe4', kEntraxeLame:K});
    const compo = maxEntraxeLameCm({epaisseurLame:ep, essenceBois:'composite', kEntraxeLame:K});
    const exo = maxEntraxeLameCm({epaisseurLame:ep, essenceBois:'exotique', kEntraxeLame:K});
    return '<tr><td>' + ep + ' mm</td><td>' + bois + ' cm</td><td>' + exo + ' cm</td><td>' +
           compo + ' cm</td></tr>';
  }).join('');

  const span = porteeVisM(c);
  const ok = obj.pts && obj.pts.length>=3;
  const S = ok ? computeStructure(obj, etat.objects) : {cadre:[],solives:[],lambourdes:[],solivesSpa:[]};
  const vis = ok ? buildVisGrid(obj, S, etat.objects) : [];
  const roles = {rive:0, courant:0, spa:0};
  vis.forEach(p=>roles[p.role]=(roles[p.role]||0)+1);
  const surf = shoelace(obj.pts) || 1;
  const ml = a => a.reduce((s,l)=>s+dist(l.a,l.b),0);

  host.innerHTML =
  '<div style="max-width:none; line-height:1.55;">' +

  '<div class="hint" style="margin-bottom:14px;"><b>Ce que fait ce calcul, et ce qu\'il ne fait pas.</b> ' +
  'Il s\'agit d\'un pré-dimensionnement destiné à chiffrer et à implanter, calé sur les usages du ' +
  'métier et sur le NF DTU 51.4. Ce n\'est pas une note de calcul : pas de vérification Eurocode 5, ' +
  'pas de prise en compte du fluage réel en classe de service 3, ni du sol sous les vis (qui ' +
  'conditionne leur longueur et leur tenue). Pour une terrasse portée en hauteur, recevant du ' +
  'public, ou fondée sur un sol douteux, il faut une étude.</div>' +

  '<div class="sectionTitle">1. Hypothèses de charge</div>' +
  '<p>La charge d\'exploitation visée est réglable dans l\'onglet Construction. Elle vaut ' +
  'actuellement <b>' + (c.chargeNormale||250) + ' kg/m²</b> en zone courante et <b>' +
  (c.chargeSpa||500) + ' kg/m²</b> en zone d\'équipement. La référence du métier pour une ' +
  'terrasse privative est 250 kg/m² répartis (ou 200 kg ponctuels), et c\'est sur cette valeur ' +
  'que le coefficient du §2 est calé : demander davantage raccourcit la portée admissible dans ' +
  'le rapport (250/charge)<sup>1/3</sup>, même exposant que le reste de la formule.</p>' +
  '<p>Une <b>zone d\'équipement</b> est l\'emprise de tout objet du plan dont la fonction est ' +
  '« équipement », quelle que soit sa forme : spa rond, bain nordique, cuve, bac maçonné, ' +
  'barbecue. Ce n\'est ni son nom ni sa géométrie qui la désigne, mais ce qu\'elle porte. ' +
  'L\'emprise réelle est élargie de la marge réglée dans Construction, puis chaque portion de ' +
  'pièce qui la traverse est redécoupée plus serré. Un spa rempli et occupé pèse 1,5 à 2 t sur ' +
  '3 à 4 m², d\'où l\'ordre de grandeur de 500 kg/m² retenu par défaut. C\'est ce rapport de ' +
  'charges qui resserre les appuis : ' + Math.round(span*100) + ' cm en zone courante contre <b>' +
  Math.round(porteeVisSpaM(c)*100) + ' cm</b> sous l\'équipement.</p>' +

  '<div class="sectionTitle">2. Portée admissible d\'une pièce entre deux appuis</div>' +
  '<p>La flèche d\'une poutre uniformément chargée varie comme <i>5wL⁴/384EI</i>. En plafonnant ' +
  'la flèche à une fraction de la portée, la portée admissible varie comme <i>(EI / charge)</i> ' +
  'puissance 1/3. Avec <i>I = b·h³/12</i> et une charge proportionnelle à l\'entraxe (la largeur ' +
  'de terrasse que la pièce reprend), tout se simplifie en :</p>' +
  '<p style="text-align:center; font-size:1.05rem; margin:10px 0;"><b>portée = K · h · (b / entraxe)<sup>1/3</sup> · (250 / charge)<sup>1/3</sup></b></p>' +
  '<p>La forme est donc dérivée, mais le coefficient <b>K = ' + (c.kPortee||PORTEE_VIS_K) + '</b> (longueurs en mm) ' +
  'est <i>calé</i> sur la pratique plutôt que calculé — ce qui évite d\'avoir à modéliser le fluage, ' +
  'la classe de résistance réelle et les coefficients de sécurité un par un. Deux points de calage, ' +
  'indépendants l\'un de l\'autre, tombent tous deux sur K = ' + PORTEE_VIS_K +
  ' (la valeur par défaut, modifiable dans Construction) :</p>' +
  '<ul><li>un <b>45×70</b> à 70 cm d\'entraxe doit donner les <b>70 cm</b> entre appuis que le ' +
  'NF DTU 51.4 fixe comme plafond pour les lambourdes → le calcul rend ' +
  Math.round(maxPorteeVisM({soliveSection:'45x70', soliveEntraxe:70})*100) + ' cm ;</li>' +
  '<li>un <b>45×145</b> à 70 cm doit donner les <b>1,50 m</b> retenus dans le métier pour une ' +
  'solive sur vis de fondation → le calcul rend 1,50 m.</li></ul>' +
  '<p>Portées obtenues pour les sections proposées :</p>' +
  '<table class="attrTable"><tr><th>Section</th><th>b × h (mm)</th><th>entraxe 40</th>' +
  '<th>entraxe 50</th><th>entraxe 70</th></tr>' + sectionRows + '</table>' +
  '<p class="hint">Le résultat est borné à 2,50 m : au-delà, la pièce n\'est plus une solive de ' +
  'terrasse courante et relève d\'un calcul propre.</p>' +

  '<div class="sectionTitle">3. Écartement maximal des appuis sous les lames</div>' +
  '<p>Le NF DTU 51.4 donne cet écartement en fonction de l\'épaisseur, de la largeur et de la ' +
  'classe de la lame. Sur la plage courante l\'abaque se résume à un rapport quasi constant — ' +
  '22 mm avec 40 cm, 24 mm avec 45 cm, 27 mm avec 50 cm — soit environ ' +
  '<b>' + (c.kEntraxeLame||ENTRAXE_LAME_K) + ' × l\'épaisseur</b>, arrondi à 5 cm, multiplié par un ' +
  'coefficient de raideur propre à la lame. Le composite flue nettement plus (' +
  LAME_RAIDEUR.composite.toFixed(2) + ' par défaut), les bois exotiques denses un peu moins (' +
  LAME_RAIDEUR.exotique.toFixed(2) + '). Ce coefficient est modifiable pour l\'essence ' +
  'sélectionnée dans l\'onglet Construction — il vaut actuellement <b>' +
  coefRaideurLame(c).toFixed(2) + '</b>, soit des appuis à ' + maxEntraxeLameCm(c) + ' cm.</p>' +
  '<table class="attrTable"><tr><th>Épaisseur lame</th><th>Bois résineux</th><th>Exotique</th>' +
  '<th>Composite</th></tr>' + lameRows + '</table>' +
  '<p>C\'est cette limite qui pilote l\'optimisation : elle fixe l\'entraxe de la couche qui porte ' +
  'les lames — les lambourdes s\'il y en a, sinon les solives elles-mêmes.</p>' +

  '<div class="sectionTitle">4. Les deux modes de fondation</div>' +
  '<p><b>Une vis est une fondation. Un plot n\'en est pas une</b> : c\'est un appui posé sur ' +
  'quelque chose qui, lui, doit faire fondation. Toute la différence entre les deux modes découle ' +
  'de cette phrase.</p>' +
  '<table class="attrTable">' +
  '<tr><th></th><th>Vis de fondation</th><th>Plots réglables</th></tr>' +
  '<tr><td>Nature</td><td>Fondation ponctuelle profonde</td><td>Appui posé, reporté sur une assise</td></tr>' +
  '<tr><td>Ancrage</td><td>Compression <b>et</b> arrachement</td><td>Compression seule</td></tr>' +
  '<tr><td>Hors gel</td><td>Par la profondeur</td><td>À assurer par l\'assise</td></tr>' +
  '<tr><td>Portée entre appuis</td><td>Déduite de la section, jusqu\'à 2,50 m</td>' +
  '<td>Plafonnée à <b>' + Math.round(PLOT_ENTRAXE_MAX_M*100) + ' cm</b> quoi qu\'en dise la section</td></tr>' +
  '<tr><td>Densité</td><td>1,0 à 1,5 /m²</td><td>3 à 5 /m²</td></tr>' +
  '<tr><td>Domaine</td><td>Large</td><td>≤ ' + PLOT_HAUTEUR_DTU_CM + ' cm de plot, ≤ 1 m de platelage</td></tr>' +
  '<tr><td>Assise</td><td>Aucune — la vis se fonde seule</td><td>Dalle, ou décaissement + géotextile + concassé</td></tr>' +
  '</table>' +
  '<p><b>Deux topologies sur plots.</b> En <i>pose simple</i>, les lambourdes reposent directement ' +
  'sur les plots et il n\'y a pas de solive ; le cadre devient une lambourde de rive. En ' +
  '<i>structure double</i>, les plots portent des solives et les lambourdes viennent au-dessus : ' +
  'plus de bois, moins de plots. L\'optimiseur compare les deux.</p>' +
  '<p><b>Poinçonnement.</b> Le NF DTU 51.4 demande une surface d\'assise d\'au moins ' +
  PLOT_ASSISE_MIN_CM2 + ' cm² (⌀ 19,5 cm). La charge par plot — charge cible × surface reprise — ' +
  'et la pression correspondante sont affichées dans Construction. Anodin sur une dalle, à ' +
  'regarder de près sur du concassé.</p>' +
  '<p class="hint"><b>Le spa sur plots.</b> Les appuis sont resserrés comme en mode vis, mais un ' +
  'plot n\'est pas ancré et reporte sa charge sur une assise qui peut tasser de façon ' +
  'différentielle. La solution du métier est une dalle béton dédiée, fondée pour elle-même, le ' +
  'platelage étant construit autour. L\'avertissement s\'affiche dans Construction.</p>' +

  '<div class="sectionTitle">5. Les deux structures, et pourquoi elles ne se vissent pas pareil</div>' +
  '<p>Ce ne sont pas deux réglages d\'un même ouvrage, mais <b>deux structures différentes</b>. ' +
  'Le programme calcule donc le réseau de pièces d\'abord, et n\'en déduit les vis qu\'ensuite : ' +
  'une vis n\'est jamais posée ailleurs que sous une pièce réellement dessinée.</p>' +
  '<table class="attrTable">' +
  '<tr><th></th><th>Sans lambourdes</th><th>Avec lambourdes</th></tr>' +
  '<tr><td>Rôle des solives</td><td>Elles portent les lames elles-mêmes</td>' +
  '<td>Poutres primaires, elles portent les lambourdes</td></tr>' +
  '<tr><td>Direction</td><td>Perpendiculaires aux lames</td><td>Parallèles aux lames</td></tr>' +
  '<tr><td>Entraxe</td><td>Imposé par l\'épaisseur de lame (§3)</td>' +
  '<td>Libre, jusqu\'à la portée d\'une lambourde</td></tr>' +
  '<tr><td>Second lit</td><td>—</td><td>Lambourdes ⟂ aux lames, entraxe du §3</td></tr>' +
  '<tr><td>Renfort spa</td><td>Vis resserrées sur les solives en place</td>' +
  '<td>Solives supplémentaires ajoutées dans l\'emprise</td></tr>' +
  '<tr><td>Densité de vis</td><td>Élevée : beaucoup de solives à reprendre</td>' +
  '<td>Faible : peu de poutres, donc peu d\'appuis</td></tr>' +
  '</table>' +
  '<p>Le renfort du spa est le point où les deux divergent vraiment. Quand les solives sont déjà ' +
  'espacées de 40 cm, la surcharge se reprend en <b>resserrant les vis le long de ces solives</b> : ' +
  'le bois est déjà là. Quand ce sont des poutres primaires à deux mètres l\'une de l\'autre, ' +
  'aucune vis semée entre elles ne sert à quoi que ce soit — la zone reçoit ses <b>propres ' +
  'solives</b>, menées de cadre à cadre comme toutes les autres.</p>' +

  '<div class="sectionTitle">6. Le cadre périmétrique</div>' +
  '<p>Les deux ouvrages sont fermés par un <b>cadre</b> — une solive de rive qui suit le contour, ' +
  'axe rentré d\'une demi-section pour que sa face extérieure affleure le bord. Sans lui, la pièce ' +
  'porteuse la plus extérieure tombe où l\'entraxe la laisse tomber, et la rive de la terrasse ' +
  'repose sur rien : c\'est elle qui reçoit la lame de rive et les extrémités de toutes les lames.</p>' +
  '<p>Les solives intérieures sont alors réparties en <b>travées égales d\'un bord à l\'autre</b> ' +
  '(largeur divisée en travées entières ≤ entraxe maximal), et non calées sur le centre de la ' +
  'terrasse. Chaque solive va donc de cadre à cadre.</p>' +
  '<p><b>Conséquence sur les vis :</b> une solive appuyée à ses deux extrémités sur le cadre ' +
  'n\'a besoin de vis intermédiaires que si elle est plus longue que sa portée. C\'est ce qui fait ' +
  'chuter le nombre d\'appuis par rapport à une trame posée a priori.</p>' +
  '<ol>' +
  '<li><b>Cadre.</b> Une vis sous chaque angle, où deux pièces de rive se rejoignent et où la ' +
  'charge se concentre, puis les tronçons subdivisés pour rester dans la portée du §2.</li>' +
  '<li><b>Solives.</b> Extrémités portées par le cadre ; l\'intérieur divisé en travées égales ' +
  'ne dépassant pas la portée.</li>' +
  '<li><b>Zone d\'équipement.</b> Chaque portion de solive traversant l\'emprise est redécoupée ' +
  'à l\'entraxe resserré saisi, en plus des solives ajoutées le cas échéant. Une emprise concave ' +
  '— un bac en L, un muret en U — peut être traversée plusieurs fois par la même pièce : chaque ' +
  'traversée est traitée séparément.</li>' +
  '<li><b>Fusion.</b> Deux vis trop proches n\'en font qu\'une sur le chantier : la plus ' +
  'sollicitée est conservée (équipement, puis rive, puis courante).</li>' +
  '</ol>' +
  '<p><b>Cette terrasse :</b> ' + surf.toFixed(2) + ' m², portée ' + Math.round(span*100) + ' cm → ' +
  '<b>' + vis.length + ' vis</b> (' + roles.rive + ' sous cadre, ' + roles.courant +
  ' sous solives, ' + roles.spa + ' en zone d\'équipement), soit ' + (vis.length/surf).toFixed(2) +
  ' vis/m² au total et ' + ((vis.length-roles.spa)/surf).toFixed(2) + ' vis/m² hors équipement. ' +
  'C\'est ce second chiffre qui se compare à l\'usage du métier, entre 1,0 et 1,5 vis/m². ' +
  'Bois porteur : ' + ml(S.cadre).toFixed(1) + ' ml de cadre, ' + ml(S.solives).toFixed(1) +
  ' ml de solives' + (S.solivesSpa.length ? ' (+ ' + ml(S.solivesSpa).toFixed(1) + ' ml de renfort sous équipement)' : '') +
  (S.lambourdes.length ? ', ' + ml(S.lambourdes).toFixed(1) + ' ml de lambourdes' : '') + '.</p>' +

  '<div class="sectionTitle">7. Débit et prix d\'achat</div>' +
  '<p>Rien n\'est chiffré en surface majorée d\'un pourcentage de chute : tout part du linéaire ' +
  'réellement tracé, découpé dans les longueurs du fournisseur. Deux débits séparés, parce que ' +
  'ce sont deux produits achetés séparément :</p>' +
  '<ul>' +
  '<li><b>Lames</b> — les lames du platelage et la bordure à plat, même produit acheté en même ' +
  'temps, donc un seul débit et une seule ligne au BOM.</li>' +
  '<li><b>Bois porteur</b> — cadre et solives. Les lambourdes les rejoignent tant qu\'elles ' +
  'partagent leur section : même pièce, même commande. Dès que la section diffère, elles ' +
  'deviennent un produit à part et prennent leur propre débit, leurs propres longueurs ' +
  'achetables et leurs propres prix — les mélanger reviendrait à les couper et les chiffrer ' +
  'sur la mauvaise pièce.</li>' +
  '</ul>' +
  '<p>Chaque débit a son jeu de longueurs achetables, réglable juste au-dessus de son tableau : ' +
  'un marchand ne tient pas les mêmes longueurs en lame et en bois de structure.</p>' +
  '<p><b>Vis de fondation.</b> Achetées à la pièce, avec un conditionnement réglable : une boîte ' +
  'entamée se paie entière, donc la quantité est arrondie au conditionnement supérieur. Leur prix ' +
  'dépend surtout de leur longueur, donc du sol — de ' + VIS_PRICE.bas + ' à ' + VIS_PRICE.haut +
  ' € pièce hors pose pour du courant. La pose à la visseuse hydraulique, si elle est ' +
  'sous-traitée, se facture à part et n\'est pas comptée.</p>' +
  '<p>C\'est ce qui rend l\'arbitrage du §7 réellement économique : baisser le prix de la vis ' +
  'déplace l\'optimum vers plus d\'appuis et moins de bois, et inversement.</p>' +
  '<p><b>Deux contraintes de pose.</b> Un about entre deux lames doit reposer sur une pièce : ' +
  'un tronçon qui ne finit pas sa travée est donc coupé à un multiple de l\'entraxe des appuis, ' +
  'et une barre trop courte pour atteindre un appui ne peut pas servir en milieu de travée. ' +
  'Les chutes d\'au moins ' + (c.chuteMinReutilisable||50) + ' cm repartent au pot et resservent ' +
  'sur une autre travée — c\'est de là que vient l\'essentiel de l\'économie.</p>' +
  '<p><b>Calcul.</b> Chaque travée est résolue <i>exactement</i> par programmation dynamique : ' +
  'le jeu de barres le moins cher qui la couvre. Un choix glouton échoue ici, parce que couvrir ' +
  'le maximum tout de suite force régulièrement une barre entière pour le reliquat — dix travées ' +
  'de 2,50 m se paient dix barres de 2,50 m, pas neuf barres de 3 m. La mutualisation des chutes ' +
  'se fait ensuite, en second passage.</p>' +
  '<p><b>Prix.</b> Les barres se chiffrent à la pièce, et le tarif au mètre n\'est pas le même ' +
  'd\'une longueur à l\'autre — les courtes sont souvent plus chères au mètre, et une longueur ' +
  'de la gamme est fréquemment en promotion. Chaque longueur a donc son prix, saisissable dans ' +
  'son tableau de débit, <b>au choix à la barre ou au m²</b> : les deux colonnes se déduisent ' +
  'l\'une de l\'autre par la surface de la barre, on saisit celle que le marchand donne et ' +
  'l\'autre suit. Afficher les deux rend d\'ailleurs visible quelle longueur est la mieux ' +
  'placée au m². Tant qu\'aucun prix n\'est saisi, il est estimé (tarif au m² de l\'essence × ' +
  'largeur × longueur pour les lames, tarif au ml × longueur pour le bois porteur). Les totaux ' +
  'remontent dans les lignes « Lames », « Bois porteur » et « Vis » du BOM, qui ne sont pas ' +
  'saisissables à la main : deux sources de vérité pour un même coût finissent par diverger.</p>' +
  '<p class="hint">Le problème de découpe pris globalement est NP-difficile ; par travée il est ' +
  'petit et exactement soluble, et le passage de mutualisation récupère l\'essentiel du reste. ' +
  'Il subsiste 1 à 2 % : une gamme de longueurs plus courte produit des chutes identiques donc ' +
  'plus réutilisables, et bat parfois une gamme large. Le tableau affiche le pourcentage de ' +
  'chute pour permettre la comparaison.</p>' +

  '<div class="sectionTitle">8. Optimisation des paramètres</div>' +
  '<p>Le bouton de l\'onglet Construction balaie les configurations qui respectent ' +
  '<i>simultanément</i> les deux règles ci-dessus, et les classe par coût de structure.</p>' +
  '<p><b>Espace exploré.</b> Sans lambourdes, les solives portent les lames directement : leur ' +
  'entraxe est imposé par le §3 et seule la section reste libre. Avec lambourdes, les lames ' +
  'reposent sur les lambourdes (entraxe imposé par le §3) et les solives peuvent s\'écarter ' +
  'jusqu\'à la portée d\'une lambourde de cette section — même formule qu\'au §2, appliquée un ' +
  'étage plus bas, l\'entraxe repris étant cette fois celui des lambourdes.</p>' +
  '<p><b>Coût comparé.</b> Nombre de vis × prix unitaire + mètres linéaires de bois porteur × ' +
  'tarif au ml — cadre, solives, renfort spa et lambourdes compris, puisque tout cela se paie. ' +
  'Le tarif au ml du bois est celui du débit courant, chute comprise, et non le prix catalogue : ' +
  'refaire un débit complet pour chacune des 63 configurations serait exact mais bien plus lent, ' +
  'et le classement ne s\'y joue pas. Les lames sont exclues : leur métré ne dépend pas de la ' +
  'structure porteuse, elles ne feraient que décaler tous les totaux.</p>' +
  '<p><b>Quantités.</b> Chaque configuration est mesurée avec les fonctions qui tracent le plan — ' +
  'même génération de lignes, même implantation de vis. Un chiffre annoncé par l\'optimiseur est ' +
  'donc celui qu\'on relèvera sur le dessin après application, et non une estimation parallèle ' +
  'susceptible de diverger.</p>' +
  '<p class="hint">L\'arbitrage récurrent : passer aux lambourdes ajoute du bois mais laisse les ' +
  'solives s\'écarter, ce qui fait chuter le nombre de vis — souvent le poste le plus cher. Monter ' +
  'en section joue dans le même sens.</p>' +

  '<div class="sectionTitle">9. Chantier — activités et durées</div>' +
  '<p>L\'onglet Chantier liste les activités réellement nécessaires à cette terrasse, dans ' +
  'l\'ordre d\'exécution, groupées en cinq phases : préparation, appuis, structure, platelage, ' +
  'finitions. Une activité n\'apparaît que si sa quantité est non nulle — pas de décaissement sur ' +
  'dalle existante, pas de lame de rive si elle n\'est pas activée.</p>' +
  '<p><b>Les quantités viennent du projet</b>, jamais d\'un forfait au m² : nombre d\'appuis, ' +
  'mètres de cadre, de solives et de lambourdes, barres à débiter, m³ de concassé, m² de ' +
  'platelage. Chaque ligne porte sa cadence en heures par unité, réglable : une terrasse en fond ' +
  'de jardin sans accès engin n\'a pas les cadences de la même terrasse devant un garage.</p>' +
  '<p>Le total est converti en jours selon la taille d\'équipe et les heures travaillées, tous ' +
  'deux réglables. Le poste le plus lourd est signalé — c\'est celui qu\'il faut attaquer pour ' +
  'raccourcir le chantier, et sur une terrasse sur vis c\'est presque toujours le vissage.</p>' +
  '<p class="hint">Main-d\'œuvre de pose seule. Ni livraison, ni délai d\'approvisionnement, ni ' +
  'séchage, ni intempéries, ni dépose d\'un existant. Sur plots, la préparation de l\'assise est ' +
  'comptée, mais l\'évacuation des terres suppose une benne sur place.</p>' +

  '<div class="sectionTitle">10. Sources</div>' +
  '<ul>' +
  '<li>NF DTU 51.4 « Platelages extérieurs en bois » — entraxes d\'appuis (≤ 70 cm sur 3 appuis, ' +
  '≤ 60 cm sur 2 appuis), débord des lames, retrait des plots en rive.</li>' +
  '<li>Guide de conception et de réalisation des terrasses en bois — FCBA / France Bois Forêt / ' +
  'FNB / LCB / ATB.</li>' +
  '<li>Abaques de portée et pratique courante des poseurs sur vis de fondation (≈ 1,2 à 1,5 vis/m², ' +
  'solives 45×145 tous les 1,50 m à 70 cm d\'entraxe).</li>' +
  '</ul>' +
  '</div>';
}

// The optimiser panel stays open once asked for, and re-ranks itself after every change, so
// the user can watch a config they are editing move up or down the list.
let optimVisible = false;
function renderOptimResult(obj){
  const host = document.getElementById('terrasseOptimResult');
  if(!optimVisible || !obj || !obj.pts || obj.pts.length<3){ host.style.display='none'; return; }
  const c = ensureConstruction(obj);
  const res = optimiserParametres(obj, etat.objects);
  host.style.display = '';
  host.innerHTML = '';
  if(!res.length){ host.innerHTML = '<div class="hint">Aucune configuration exploitable.</div>'; return; }

  const entraxeLame = maxEntraxeLameCm(c);
  const intro = document.createElement('div');
  intro.className = 'hint';
  intro.textContent = 'Lames de ' + (c.epaisseurLame||25) + ' mm en ' +
    ((ESSENCE_PRICES[c.essenceBois]||{}).label || c.essenceBois) + ' : appuis a ' + entraxeLame +
    ' cm maximum. Une ligne par strategie de construction (section × avec ou sans lambourdes), ' +
    'a chaque fois son meilleur entraxe ; toutes respectent cette limite et la portee de chaque ' +
    'piece. Classement par cout de structure (vis + bois porteur) : les lames sont identiques ' +
    'dans tous les cas, donc exclues. Detail du calcul dans l\'onglet Methode.';
  host.appendChild(intro);

  const tbl = document.createElement('table');
  tbl.className = 'attrTable';
  const head = document.createElement('tr');
  head.innerHTML = '<th>Section</th><th>Lambourdes</th><th>Entraxe solives</th>' +
    '<th>Portee vis</th><th>Vis</th><th>Bois</th><th>Densite</th><th>Cout structure</th><th></th>';
  tbl.appendChild(head);

  const surPlots = estPlots(c);
  const isCurrent = r => surPlots
    ? (r.topologie === (c.plotAvecSolives ? 'double' : 'simple') &&
       r.section === (c.plotAvecSolives ? c.soliveSection : sectionLambourde(c)) &&
       (r.topologie==='simple' || r.soliveEntraxe===c.soliveEntraxe))
    : (r.section===c.soliveSection && r.avecLambourde===!!c.avecLambourde &&
       r.soliveEntraxe===c.soliveEntraxe);
  // Neighbouring entraxes of one strategy differ by a couple of euros and would fill the table
  // with the same answer eight times; keep the best of each section/lambourdes pairing so every
  // row is a genuinely different way to build the thing.
  const seen = new Set();
  const distinct = res.filter(r=>{
    const key = r.section + '|' + (surPlots ? r.topologie : r.avecLambourde);
    if(seen.has(key)) return false;
    seen.add(key); return true;
  });
  // Always show where the current config stands, even when it is not the best of its family.
  if(!distinct.some(isCurrent)){
    const mine = res.find(isCurrent);
    if(mine) distinct.push(mine);
  }
  distinct.forEach((r,i)=>{
    const tr = document.createElement('tr');
    const cur = isCurrent(r);
    if(cur) tr.style.cssText = 'font-weight:600; background:var(--accent-light);';
    const cell = txt => { const td=document.createElement('td'); td.textContent=txt; return td; };
    tr.appendChild(cell(r.section + (i===0 ? '  ← optimum' : '')));
    tr.appendChild(cell(surPlots
      ? (r.topologie==='double' ? 'double (plots sous solives)' : 'simple (plots sous lambourdes)')
      : (r.avecLambourde ? 'oui (' + r.lambourdeEntraxe + ' cm)' : 'non')));
    tr.appendChild(cell(surPlots && r.topologie==='simple' ? '—' : r.soliveEntraxe + ' cm'));
    tr.appendChild(cell(r.portee + ' cm'));
    tr.appendChild(cell(String(r.vis)));
    tr.appendChild(cell(r.ml + ' ml'));
    tr.appendChild(cell(r.densite + '/m²'));
    tr.appendChild(cell(r.cout + ' €'));
    const tdBtn = document.createElement('td');
    if(cur){ tdBtn.textContent = 'config actuelle'; tdBtn.style.cssText='font-size:0.8rem; color:var(--ink-soft);'; }
    else {
      const b = document.createElement('button'); b.className='objbtn'; b.textContent='Appliquer';
      b.addEventListener('click', ()=>{
        if(surPlots){
          c.plotAvecSolives = (r.topologie === 'double');
          if(r.topologie === 'double'){ c.soliveSection = r.section; c.soliveEntraxe = r.soliveEntraxe; }
          else { c.lambourdeSection = r.section; }
          c.avecLambourde = true;
          c.plotEntraxeAuto = true;
        } else {
          c.soliveSection = r.section;
          c.avecLambourde = r.avecLambourde;
          c.soliveEntraxe = r.soliveEntraxe;
          c.lambourdeEntraxe = r.lambourdeEntraxe;
          c.visModeAuto = true;
        }
        refreshTerrasseView();
      });
      tdBtn.appendChild(b);
    }
    tr.appendChild(tdBtn);
    tbl.appendChild(tr);
  });
  host.appendChild(tbl);

  const best = res[0];
  const actuel = evaluerStructure(obj, c,
    surPlots ? prixPlotUnite(c) : prixUnitaire(c,'vis',VIS_PRICE),
    prixUnitaire(c,'bois',SOLIVE_PRICE),
    lamesAngleOf(obj), shoelace(obj.pts)||1, etat.objects);
  const note = document.createElement('div');
  note.className = 'hint';
  const gain = actuel.cout - best.cout;
  note.textContent = res.length + ' configurations testees. Config actuelle : ' + actuel.vis +
    ' vis, ' + actuel.densite + '/m², ' + actuel.cout + ' € — optimum : ' + best.vis + ' vis, ' +
    best.densite + '/m², ' + best.cout + ' €' +
    (gain > 0 ? ', soit ' + gain + ' € et ' + (actuel.vis-best.vis) + ' vis en moins.'
              : '. La config actuelle est deja au niveau de l\'optimum.') +
    ' Pre-dimensionnement indicatif sur base 250 kg/m², sans valeur de note de calcul.';
  host.appendChild(note);
}
document.getElementById('terrasseOptimBtn').addEventListener('click', ()=>{
  const obj = etat.objects.find(o=>o.key===etat.terrasseSelectedKey);
  if(!obj) return;
  optimVisible = !optimVisible;
  document.getElementById('terrasseOptimBtn').textContent =
    optimVisible ? 'Masquer l\'optimisation' : 'Optimisation des parametres';
  renderOptimResult(obj);
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
  if(!glbViewerScene) return;
  const { camera, controls, renderer, scene } = glbViewerScene;
  const offset = new THREE.Vector3().subVectors(camera.position, controls.target).multiplyScalar(0.8);
  camera.position.copy(controls.target).add(offset);
  controls.update(); renderer.render(scene, camera);
});
document.getElementById('glbViewerZoomOut').addEventListener('click', ()=>{
  if(!glbViewerScene) return;
  const { camera, controls, renderer, scene } = glbViewerScene;
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
  if(!glbViewerScene) return;
  const terr = etat.objects.find(o=>o.key===etat.terrasseSelectedKey && o.fonction==='terrasse')
            || etat.objects.find(o=>o.fonction==='terrasse');
  if(!terr) return;
  const { camera, controls, renderer, scene } = glbViewerScene;
  camera.position.y = hauteurFinieMm(terr)/1000 + HAUTEUR_YEUX_M;
  controls.update();
  renderer.render(scene, camera);
});
document.getElementById('glbViewerFilaire').addEventListener('change', function(){
  glbViewerFilaire = this.checked;
  if(glbViewerOuvert) rafraichirVisionneuseGlb(glbViewerScene && { pos: glbViewerScene.camera.position.clone(), cible: glbViewerScene.controls.target.clone() });
});
document.getElementById('glbViewerShadows').addEventListener('change', function(){
  glbViewerShadows = this.checked;
  if(glbViewerOuvert) rafraichirVisionneuseGlb(glbViewerScene && { pos: glbViewerScene.camera.position.clone(), cible: glbViewerScene.controls.target.clone() });
});
// Simple bascule de visibilite sur la lumiere existante : pas besoin de reconstruire toute la
// scene (contrairement a filaire/ombre, qui changent la geometrie ou l'etat du renderer).
document.getElementById('glbViewerLumiereAppoint').addEventListener('change', function(){
  glbViewerLumiereAppoint = this.checked;
  appliquerLumiereGlb();
});
document.getElementById('glbViewerFond').addEventListener('change', function(){
  glbViewerFond = this.value;
  if(glbViewerScene){
    // dispose the outgoing background if it's a texture (the checkerboard case) before swapping
    // it out, otherwise it leaks - see the comment on disposeThreeSceneResources().
    if(glbViewerScene.scene.background && glbViewerScene.scene.background.isTexture) glbViewerScene.scene.background.dispose();
    glbViewerScene.scene.background = fondGlbViewer();
  }
});
// "input" (pas "change") pour un rendu qui suit le glisser en direct, pas seulement au relachement.
document.getElementById('glbViewerDate').addEventListener('change', function(){
  if(!this.value) return;
  glbViewerDateStr = this.value;
  syncSemaineDepuisDate();
  appliquerLumiereGlb();
});
document.getElementById('glbViewerSemaine').addEventListener('input', function(){
  const nouvelleValeur = parseInt(this.value,10);
  const deltaSemaines = nouvelleValeur - glbViewerSemaineAffichee;
  glbViewerSemaineAffichee = nouvelleValeur;
  if(deltaSemaines === 0) return;
  const [annee, mois, jour] = glbViewerDateStr.split('-').map(Number);
  glbViewerDateStr = new Date(Date.UTC(annee, mois-1, jour) + deltaSemaines*7*86400000).toISOString().slice(0,10);
  document.getElementById('glbViewerDate').value = glbViewerDateStr;
  appliquerLumiereGlb();
});
document.getElementById('glbViewerHeure').addEventListener('input', function(){
  glbViewerMinutes = parseInt(this.value,10);
  document.getElementById('glbViewerHeureTexte').textContent = formatHeureMin(glbViewerMinutes);
  appliquerLumiereGlb();
});
document.getElementById('glbViewerIntensite').addEventListener('input', function(){
  const pct = parseInt(this.value,10);
  glbViewerIntensiteSoleil = pct/100;
  document.getElementById('glbViewerIntensiteTexte').textContent = pct + ' %';
  appliquerLumiereGlb();
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

setupProjectBar(seed);
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

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
  projectOntoSegment, distancePointSegment, angleOfSegment, nearestSegmentIndex,
  lineSegIntersect, lineLineIntersect
} from './geometry/segments.js';
import { estRectangle, rectangleDepuisCoin, rectangleDepuisCote, RECT_MIN_M } from './geometry/rect.js';
import {
  clipLineToPolygon, polygonOffset, ringSegments, clipPolygonByConvex, exteriorBisector, offsetZone
} from './geometry/polygon.js';
import { memePoint, decouperAnneau, chainerSegments, fusionnerAnneaux, simplifierContour } from './geometry/rings.js';
import { parseSvgPathPoints } from './geometry/path.js';
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
import { geometrieMesure, coordonneesCote, coordonneesPoint } from './render/measures.js';
import { editerAngle, editerLongueur, contourDeContrainte } from './interaction/editing.js';
import { creerDomObjet, reconstruirePoignees } from './render/objects.js';
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
import {
  A4_L, A4_H, PT_PAR_METRE, MARGE_PDF, ECHELLES_DOSSIER,
  pdfEscape, horodatagePdfInfo, assemblerPDF, pdfTexte, pdfPolygone, pdfCercle,
  pdfFlecheNord, pdfEchelleGraphique, echelleQuiTient
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
const scene = creerScene();
// W et H : dans `etat.scene` (spec 6.1) - la taille utile de la scene.
function computeSize(){
  const margin = 40;
  etat.scene.W = Math.max(320, Math.min(window.innerWidth - margin, 1600));
  etat.scene.H = Math.max(420, Math.min(Math.round(window.innerHeight*0.62), 780));
}
computeSize();

function toScreen(p){ return versEcran(scene, p); }
function toWorld(p){ return versMonde(scene, p); }

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

// ================= Render =================
function polyStr(pts){ return pts.map(p=>{const s=toScreen(p); return s.x+','+s.y;}).join(' '); }

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


function pathD(pts, curve){
  if(pts.length<2) return '';
  const s = pts.map(toScreen);
  if(!curve || s.length<3){
    return 'M ' + s.map(p=>p.x.toFixed(1)+','+p.y.toFixed(1)).join(' L ');
  }
  // Catmull-Rom to cubic Bezier (smooth curve through all points)
  let d = 'M ' + s[0].x.toFixed(1) + ',' + s[0].y.toFixed(1) + ' ';
  for(let i=0;i<s.length-1;i++){
    const p0 = s[Math.max(0,i-1)], p1 = s[i], p2 = s[i+1], p3 = s[Math.min(s.length-1,i+2)];
    const c1 = {x:p1.x+(p2.x-p0.x)/6, y:p1.y+(p2.y-p0.y)/6};
    const c2 = {x:p2.x-(p3.x-p1.x)/6, y:p2.y-(p3.y-p1.y)/6};
    d += 'C ' + c1.x.toFixed(1)+','+c1.y.toFixed(1)+' '+c2.x.toFixed(1)+','+c2.y.toFixed(1)+' '+p2.x.toFixed(1)+','+p2.y.toFixed(1)+' ';
  }
  return d;
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
function renderParasolOverlay(){
  parasolGroup.innerHTML = '';
  if(etat.appMode !== 'plan') return;
  const parasols = etat.objects.filter(o=>o.fonction==='parasol' && !o.hidden);
  if(!parasols.length) return;
  contraindreParasols();
  if(etat.parasol.carteAffichee){
    calculerCartesOmbre(contexteSoleilParasol(), etat.objects).forEach(carte=>{
      const cote = carte.pas*scene.scale;
      carte.cells.forEach(c=>{
        if(c.frac <= 0) return;
        const s = toScreen({x:c.x, y:c.y});
        const rect = document.createElementNS(svgNS,'rect');
        rect.setAttribute('x', s.x-cote/2); rect.setAttribute('y', s.y-cote/2);
        rect.setAttribute('width', cote); rect.setAttribute('height', cote);
        rect.setAttribute('fill', '#1e3c5a');
        rect.setAttribute('fill-opacity', (0.08 + c.frac*0.62).toFixed(3));
        parasolGroup.appendChild(rect);
      });
    });
  }
  if(etat.parasol.ombreAffichee){
    parasols.forEach(par=>{
      const g = ombreInstantanee(par, contexteSoleilParasol());
      if(!g) return;
      const s = toScreen({x:g.cx, y:g.cy});
      const el = document.createElementNS(svgNS,'ellipse');
      el.setAttribute('cx', s.x); el.setAttribute('cy', s.y);
      el.setAttribute('rx', g.demiGrand*scene.scale); el.setAttribute('ry', g.demiPetit*scene.scale);
      // L'axe long suit (ux,uy) en coordonnees plan ; a l'ecran l'axe Y est inverse, d'ou -uy.
      const deg = Math.atan2(-g.uy, g.ux) * 180/Math.PI;
      el.setAttribute('transform', 'rotate(' + deg.toFixed(2) + ' ' + s.x + ' ' + s.y + ')');
      el.setAttribute('fill', '#2b3a2a');
      el.setAttribute('fill-opacity', '0.32');
      el.setAttribute('stroke', '#2b3a2a');
      el.setAttribute('stroke-opacity', '0.55');
      el.setAttribute('stroke-dasharray', '4 3');
      parasolGroup.appendChild(el);
    });
  }
  // Pied du mat : au centre pour un parasol droit, en bord de toile pour un deporte. Redessine
  // par-dessus tout le reste (le groupe est remis en fin de svg juste avant).
  parasolMatGroup.innerHTML = '';
  svg.appendChild(parasolMatGroup);
  parasols.forEach(par=>{
    const m = positionMat(par);
    const s = toScreen(m);
    const c = document.createElementNS(svgNS,'circle');
    c.setAttribute('cx', s.x); c.setAttribute('cy', s.y); c.setAttribute('r', 4);
    c.setAttribute('fill', '#3f2d18');
    c.setAttribute('stroke', '#fff'); c.setAttribute('stroke-width', '1.5');
    parasolMatGroup.appendChild(c);
    if(par.matDeporte){
      // Un trait relie le pied au centre de la toile : sans lui, sur un deporte, on ne voit pas
      // a quel parasol appartient ce pied quand plusieurs se chevauchent.
      const sc = toScreen(par.center);
      const l = document.createElementNS(svgNS,'line');
      l.setAttribute('x1', s.x); l.setAttribute('y1', s.y);
      l.setAttribute('x2', sc.x); l.setAttribute('y2', sc.y);
      l.setAttribute('stroke', '#3f2d18'); l.setAttribute('stroke-width', '1.5');
      l.setAttribute('stroke-dasharray', '3 2');
      parasolMatGroup.appendChild(l);
    }
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

  etat.objects.forEach(obj=>{
    const isSel = obj.key===activeSel;

    // Masque : rien de cet objet ne se dessine, y compris ses poignees s'il se trouve etre
    // l'objet selectionne - un contour invisible avec des coins bien visibles serait plus
    // deroutant qu'utile. Il reste choisissable depuis la barre laterale pour le demasquer.
    if(objetMasque(obj)){
      vue(obj).el.style.display = 'none';
      vue(obj).nameEl.style.display = 'none';
      if(vue(obj).camMarkerEl) vue(obj).camMarkerEl.style.display = 'none';
      vue(obj).pointEls.forEach(e=>e.style.display='none');
      vue(obj).ptLabelEls.forEach(e=>e.style.display='none');
      vue(obj).edgeEls.forEach(e=>e.style.display='none');
      vue(obj).segLabelEls.forEach(e=>e.style.display='none');
      if(vue(obj).radiusHandle) vue(obj).radiusHandle.style.display='none';
      return;
    }
    vue(obj).el.style.display = '';
    vue(obj).nameEl.style.display = '';
    if(vue(obj).camMarkerEl) vue(obj).camMarkerEl.style.display = '';

    if(obj.type==='polygon'){
      vue(obj).el.setAttribute('points', polyStr(obj.pts));
    } else if(obj.type==='path'){
      vue(obj).el.setAttribute('d', pathD(obj.pts, !!obj.curve));
      vue(obj).el.setAttribute('stroke-width', Math.max(1, (obj.width||1)*scene.scale));
      if(vue(obj).camMarkerEl){
        const p0 = toScreen(obj.pts[0]);
        vue(obj).camMarkerEl.setAttribute('cx',p0.x); vue(obj).camMarkerEl.setAttribute('cy',p0.y);
      }
    } else {
      const c = toScreen(obj.center);
      vue(obj).el.setAttribute('cx',c.x); vue(obj).el.setAttribute('cy',c.y); vue(obj).el.setAttribute('r',obj.r*scene.scale);
    }
    if(obj.type!=='path') vue(obj).el.setAttribute('stroke-width', isSel ? '3' : (obj.type==='circle'?'0.08':'1.8'));
    else vue(obj).el.setAttribute('stroke-opacity', isSel ? '1' : '0.85');

    // Avec le fond orthophoto, un terrain rempli a 100 % masque exactement ce qu'on est venu
    // voir. La transparence est appliquee A L'AFFICHAGE, sans toucher au fillOpacity de l'objet :
    // le projet n'est pas modifie, rien a re-enregistrer, et decocher le fond rend au terrain son
    // remplissage d'origine. Le contour, lui, ne bouge pas : c'est lui qui porte l'information.
    if(obj.type==='polygon' && estTerrain(obj)){
      vue(obj).el.setAttribute('fill-opacity', orthoActif ? orthoParcelleOpacite : obj.fillOpacity);
    }

    const cen = obj.type==='polygon' ? centroid(obj.pts) : (obj.type==='path' ? centroid(obj.pts) : obj.center);
    const cs = toScreen(cen);
    vue(obj).nameEl.setAttribute('x',cs.x); vue(obj).nameEl.setAttribute('y',cs.y);
    vue(obj).nameEl.setAttribute('font-size', obj.key==='parcelle'||obj.key==='maison' ? 14 : 10);
    vue(obj).nameEl.textContent = obj.showName ? obj.name : '';

    if(obj.type==='polygon' || obj.type==='path'){
      const n = obj.pts.length;
      const edgeCount = obj.type==='path' ? Math.max(0,n-1) : n;
      if(vue(obj).pointEls.length !== n) rebuildHandles(obj);
      const objCenter = cen;
      for(let i=0;i<n;i++){
        const p = toScreen(obj.pts[i]);
        vue(obj).pointEls[i].setAttribute('cx',p.x); vue(obj).pointEls[i].setAttribute('cy',p.y);
        const showPtForPick = pickState && pickState.mode==='target';
        vue(obj).pointEls[i].style.display = (isSel || showPtForPick) ? '' : 'none';
        const isFrozen = obj.type==='polygon' && obj.frozenVertices && obj.frozenVertices[i];
        vue(obj).pointEls[i].setAttribute('fill', isFrozen ? obj.stroke : '#fff');
        vue(obj).pointEls[i].setAttribute('r', isFrozen ? 7.5 : 6.5);

        // offset vertex label: exterior bisector for closed polygons, simple perpendicular for open paths
        let ext;
        if(obj.type==='polygon'){
          ext = exteriorBisector(obj, i);
        } else {
          const nb = obj.pts[Math.min(i+1,n-1)], pb2 = obj.pts[Math.max(i-1,0)];
          const dx = nb.x-pb2.x, dy = nb.y-pb2.y; const L=Math.hypot(dx,dy)||1;
          ext = {x:-dy/L, y:dx/L};
        }
        vue(obj).ptLabelEls[i].setAttribute('x', p.x + ext.x*13);
        vue(obj).ptLabelEls[i].setAttribute('y', p.y - ext.y*13 + 3);
        vue(obj).ptLabelEls[i].setAttribute('text-anchor','middle');
        let vertTxt = '';
        const vName = obj.vertexNames[i] || ('P'+(i+1));
        const showAngleHere = obj.showAngles && obj.type==='polygon';
        if(obj.showVertNames && showAngleHere) vertTxt = vName + ' — ' + interiorAngleDeg(obj,i).toFixed(1) + '°';
        else if(obj.showVertNames) vertTxt = vName;
        else if(showAngleHere) vertTxt = interiorAngleDeg(obj,i).toFixed(1) + '°';
        vue(obj).ptLabelEls[i].textContent = vertTxt;
        vue(obj).ptLabelEls[i].style.display = vertTxt ? '' : 'none';

        if(i < edgeCount){
          const a=obj.pts[i], b=obj.pts[(i+1)%n];
          const pa=toScreen(a), pb=toScreen(b);
          vue(obj).edgeEls[i].setAttribute('x1',pa.x); vue(obj).edgeEls[i].setAttribute('y1',pa.y);
          vue(obj).edgeEls[i].setAttribute('x2',pb.x); vue(obj).edgeEls[i].setAttribute('y2',pb.y);
          const showEdgeForPick = pickState && pickState.mode==='ref';
          vue(obj).edgeEls[i].style.display = (isSel || showEdgeForPick) ? '' : 'none';
          vue(obj).edgeEls[i].style.pointerEvents = (isSel || showEdgeForPick) ? 'all' : 'none';

          const mid = {x:(pa.x+pb.x)/2, y:(pa.y+pb.y)/2};
          vue(obj).segLabelEls[i].setAttribute('x',mid.x); vue(obj).segLabelEls[i].setAttribute('y',mid.y-5);
          let segTxt = '';
          if(obj.showSegNames && obj.showDims) segTxt = obj.segmentNames[i] + ' — ' + dist(a,b).toFixed(2)+' m';
          else if(obj.showSegNames) segTxt = obj.segmentNames[i];
          else if(obj.showDims) segTxt = dist(a,b).toFixed(2)+' m';
          vue(obj).segLabelEls[i].textContent = segTxt;
          vue(obj).segLabelEls[i].style.display = segTxt ? '' : 'none';
        }
      }
      vue(obj).el.style.cursor = obj.locked ? 'not-allowed' : (isSel ? 'move' : 'pointer');
    } else {
      const rp = toScreen({x:obj.center.x+obj.r, y:obj.center.y});
      vue(obj).radiusHandle.setAttribute('cx',rp.x); vue(obj).radiusHandle.setAttribute('cy',rp.y);
      vue(obj).radiusHandle.style.display = isSel ? '' : 'none';
      vue(obj).el.style.cursor = obj.locked ? 'not-allowed' : (isSel ? 'move' : 'pointer');
    }
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

function renderAttrTable(){
  const obj = etat.objects.find(o=>o.key===etat.selectedKey);
  const nameTbl = document.getElementById('attrNameTable');
  const tabsDiv = document.getElementById('attrTabs');
  const tbl = document.getElementById('attrTable');

  const delObjBtn = document.getElementById('delObjBtn');
  delObjBtn.disabled = !obj || obj.key==='parcelle' || obj.locked;
  delObjBtn.title = !obj ? 'Selectionne d\'abord un objet' : (obj.key==='parcelle' ? 'La parcelle ne peut pas etre supprimee' : (obj.locked ? 'Objet verrouille' : ''));

  const dupObjBtn = document.getElementById('dupObjBtn');
  dupObjBtn.disabled = !obj || obj.key==='parcelle';
  dupObjBtn.title = !obj ? 'Selectionne d\'abord un objet' : (obj.key==='parcelle' ? 'La parcelle ne peut pas etre dupliquee' : 'Cree une copie, decalee de 5 m vers la gauche');

  if(!obj){
    document.getElementById('attrTitle').textContent = 'Aucune sélection';
    nameTbl.innerHTML = '';
    tabsDiv.innerHTML = '';
    tbl.innerHTML = '<tr><td style="padding:10px; color:#8a8a80;">Clique sur un objet (ou son bouton ci-dessus) pour l\'éditer.</td></tr>';
    return;
  }
  const titleSurf = obj.type==='polygon' ? shoelace(obj.pts) : (obj.type==='circle' ? Math.PI*obj.r*obj.r : null);
  document.getElementById('attrTitle').textContent = libelleTypeObjet(obj) + ' — ' + obj.name + (titleSurf!==null ? '  (' + titleSurf.toFixed(2) + ' m²)' : '');

  // --- name table (always visible, not tabbed) ---
  nameTbl.innerHTML = '';
  const rowName = document.createElement('tr');
  const tdLabel = document.createElement('td'); tdLabel.textContent = "Objet";
  const tdBlank = document.createElement('td');
  const tdInput = document.createElement('td');
  const inp = document.createElement('input'); inp.type='text'; inp.value=obj.name;
  inp.addEventListener('input', ()=>{
    // Update just the name everywhere it's shown, without a full render(): render() rebuilds
    // this very input from scratch (renderAttrTable -> nameTbl.innerHTML=''), which would kill
    // focus and cursor position on every keystroke.
    obj.name = inp.value;
    markDirty();
    rebuildSelector();
    if(vue(obj).nameEl) vue(obj).nameEl.textContent = obj.showName ? obj.name : '';
    document.getElementById('attrTitle').textContent = libelleTypeObjet(obj) + ' — ' + obj.name + (titleSurf!==null ? '  (' + titleSurf.toFixed(2) + ' m²)' : '');
  });
  tdInput.appendChild(inp);
  rowName.appendChild(tdLabel); rowName.appendChild(tdBlank); rowName.appendChild(tdInput);
  nameTbl.appendChild(rowName);

  // --- tabs ---
  tabsDiv.innerHTML = '';
  if(obj.type==='polygon'){
    [['objet','Objet'],['segments','Cotes'],['angles','Coins']].forEach(([key,label])=>{
      const b = document.createElement('button');
      b.className = 'attrTabBtn' + (etat.attrTab===key ? ' active' : '');
      b.textContent = label;
      b.addEventListener('click', ()=>{ etat.attrTab=key; render(); });
      tabsDiv.appendChild(b);
    });
  } else if(obj.type==='path'){
    if(etat.attrTab==='angles') etat.attrTab='segments'; // path has no angle tab
    [['objet','Objet'],['segments','Points / Segments']].forEach(([key,label])=>{
      const b = document.createElement('button');
      b.className = 'attrTabBtn' + (etat.attrTab===key ? ' active' : '');
      b.textContent = label;
      b.addEventListener('click', ()=>{ etat.attrTab=key; render(); });
      tabsDiv.appendChild(b);
    });
  } else {
    etat.attrTab = 'objet'; // circles only have the Objet tab
    const b = document.createElement('button');
    b.className = 'attrTabBtn active';
    b.textContent = 'Objet';
    tabsDiv.appendChild(b);
  }

  // --- content table (tabbed for polygons, single view for circle) ---
  tbl.innerHTML = '';
  const head = document.createElement('tr');
  head.innerHTML = (obj.type==='polygon' && etat.attrTab==='angles')
    ? '<th>Champ</th><th>Nom</th><th>Valeur</th><th>Figé</th>'
    : '<th>Champ</th><th>Nom</th><th>Valeur</th>';
  tbl.appendChild(head);

  if(etat.attrTab==='objet'){
    const parcelleForSurf = etat.objects.find(o=>o.key==='parcelle');
    const sParcelle = parcelleForSurf ? shoelace(parcelleForSurf.pts) : 0;
    const surf = obj.type==='polygon' ? shoelace(obj.pts) : (obj.type==='circle' ? Math.PI*obj.r*obj.r : null);
    const addRow = (label, valueEl) => {
      const tr=document.createElement('tr');
      const td0=document.createElement('td'); td0.textContent=label;
      const td1=document.createElement('td');
      const td2=document.createElement('td'); td2.appendChild(valueEl);
      tr.appendChild(td0); tr.appendChild(td1); tr.appendChild(td2);
      tbl.appendChild(tr);
    };
    const typeSpan = document.createElement('span');
    typeSpan.textContent = libelleTypeObjet(obj);
    addRow('Type', typeSpan);

    const colorInp = document.createElement('input'); colorInp.type='color'; colorInp.value = obj.fill;
    colorInp.addEventListener('input', ()=>{
      obj.fill = colorInp.value;
      if(obj.type==='path'){ vue(obj).el.setAttribute('stroke', obj.fill); obj.stroke = obj.fill; }
      else vue(obj).el.setAttribute('fill', obj.fill);
      markDirty();
      rebuildSelector();
    });
    addRow('Couleur', colorInp);

    const fnSelect = document.createElement('select');
    ['terrain','batiment','annexe','arbre','terrasse','massif','mobilier','dalle','equipement','chemin','parasol','limite','autre'].forEach(opt=>{
      const o2 = document.createElement('option'); o2.value=opt; o2.textContent=opt;
      if(obj.fonction===opt) o2.selected=true;
      fnSelect.appendChild(o2);
    });
    fnSelect.addEventListener('change', ()=>{
      // Plusieurs champs (Élévation, Texture, les champs "arbre" ci-dessous...) n'apparaissent
      // ou ne disparaissent que selon la Fonction - sans le re-rendu, ils restent invisibles
      // jusqu'a ce que l'utilisateur reselectionne l'objet, ce qui les fait passer pour absents.
      obj.fonction = fnSelect.value;
      markDirty();
      renderAttrTable();
    });
    addRow('Fonction', fnSelect);

    const prioInp = document.createElement('input'); prioInp.type='number'; prioInp.step='1'; prioInp.value=obj.priority;
    prioInp.title = 'Priorite d\'affichage : plus eleve = dessine au-dessus des autres (hors objet selectionne, toujours au premier plan)';
    prioInp.addEventListener('change', ()=>{ obj.priority = parseInt(prioInp.value,10)||0; markDirty(); reapplyStackingOrder(); render(); });
    addRow('Priorité affichage', prioInp);

    const matInp = document.createElement('input'); matInp.type='text'; matInp.value=obj.matiere||'';
    matInp.placeholder='ex: beton, bois, gazon...';
    matInp.addEventListener('input', ()=>{ obj.matiere = matInp.value; markDirty(); });
    addRow('Matière', matInp);

    // La hauteur sert la Vue 3D (option "Afficher tous les objets") : chaque objet du plan y
    // devient un bloc simple extrude a cette hauteur. Une terrasse fait exception - elle a deja
    // sa propre modelisation dans Mode Terrasse, seule source fiable pour elle, donc le champ ici
    // est desactive et affiche cette valeur calculee plutot que d'en proposer une seconde,
    // saisissable, qui pourrait diverger de la premiere.
    if(obj.fonction !== 'camera'){
      // La parcelle/un terrain n'a pas de hauteur (toujours plat par definition) : le champ
      // Élévation n'a pas de sens pour elle, mais elle recoit quand meme les deux champs Texture
      // juste apres, comme tout objet autre qu'un point de vue.
      if(obj.key !== 'parcelle' && obj.fonction !== 'terrain'){
        if(obj.fonction === 'terrasse' && obj.type==='polygon'){
          const elevSpan = document.createElement('span');
          elevSpan.style.cssText = 'font-variant-numeric:tabular-nums; color:var(--ink-soft);';
          // 3 decimales : a 2, 0.095 m arrondit en "0.10 m" et fait croire a un centimetre de plus
          // que ce que la Construction affiche ("9.5 cm").
          elevSpan.textContent = elevationOf(obj).toFixed(3) + ' m';
          addRow('Élévation (m)', elevSpan);
          const noteTr = document.createElement('tr');
          const noteTd = document.createElement('td'); noteTd.colSpan = 3;
          noteTd.style.cssText = 'font-size:0.8rem; color:var(--ink-soft); padding-top:0;';
          noteTd.textContent = 'calculee depuis Mode Terrasse (appui + structure + lame) — non modifiable ici';
          noteTr.appendChild(noteTd); tbl.appendChild(noteTr);
        } else {
          const elevInp = document.createElement('input'); elevInp.type='number'; elevInp.step='0.1'; elevInp.min='0';
          elevInp.value = elevationOf(obj).toFixed(2);
          elevInp.title = 'Hauteur au-dessus du sol, utilisee par la Vue 3D (option "Afficher tous les objets")';
          elevInp.addEventListener('change', ()=>{ obj.elevation = Math.max(0, parseFloat(elevInp.value)) || 0; markDirty(); });
          addRow('Élévation (m)', elevInp);
        }
      }

      // Texture verticale = les faces laterales du bloc extrude en Vue 3D (murs) ; horizontale =
      // le dessus (toit). Deux champs separes parce qu'un mur et un toit ne partagent quasiment
      // jamais le meme materiau. Chacun ouvre le meme selecteur Poly Haven, juste range dans un
      // champ different a l'enregistrement.
      const champTexture = (label, cle) => {
        const wrap = document.createElement('div');
        wrap.style.cssText = 'display:flex; align-items:center; gap:8px;';
        const tex = obj[cle];
        const vignette = document.createElement('img');
        vignette.style.cssText = 'width:28px; height:28px; object-fit:cover; border-radius:2px; border:1px solid var(--rule); background:var(--accent-light,#eee);';
        vignette.src = tex ? tex.vignette : '';
        vignette.style.visibility = tex ? 'visible' : 'hidden';
        const nomSpan = document.createElement('span');
        nomSpan.style.cssText = 'font-size:0.82rem; flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;';
        nomSpan.textContent = tex ? tex.nom : 'Aucune (couleur unie)';
        const choisirBtn = document.createElement('button'); choisirBtn.type='button'; choisirBtn.className='secondary small';
        choisirBtn.textContent = tex ? 'Changer…' : 'Choisir…';
        choisirBtn.addEventListener('click', ()=>{
          // Les chemins d'un meme jardin partagent presque toujours le meme revetement : la case
          // "appliquer a tous les chemins" evite de repeter la recherche/choix chemin par chemin,
          // et pose la MEME texture sur les deux champs (vertical + horizontale) de chacun - pas
          // seulement celui qu'on est en train d'editer - pour qu'aucun chemin ne se retrouve
          // avec un dessus et des bords depareilles.
          const estChemin = obj.fonction === 'chemin';
          ouvrirSelecteurTexture(label, (choix, appliquerTous)=>{
            if(appliquerTous){
              etat.objects.filter(o=>o.fonction==='chemin').forEach(o=>{
                o.textureVerticale = choix; o.textureHorizontale = choix;
              });
            } else {
              obj[cle] = choix;
            }
            markDirty();
            renderAttrTable();
            const t = threeScene && etat.objects.find(o=>o.key===etat.terrasseSelectedKey);
            if(t) buildThreeScene(t);
          }, estChemin ? { checkboxLabel: 'Appliquer à tous les chemins (vertical + horizontale)' } : undefined);
        });
        wrap.appendChild(vignette); wrap.appendChild(nomSpan); wrap.appendChild(choisirBtn);
        if(tex){
          const clearBtn = document.createElement('button'); clearBtn.type='button'; clearBtn.className='secondary small';
          clearBtn.textContent = '×'; clearBtn.title = 'Retirer cette texture';
          clearBtn.addEventListener('click', ()=>{
            obj[cle] = null; markDirty(); renderAttrTable();
            const t = threeScene && etat.objects.find(o=>o.key===etat.terrasseSelectedKey);
            if(t) buildThreeScene(t);
          });
          wrap.appendChild(clearBtn);
        }
        addRow(label, wrap);
      };
      champTexture('Texture verticale', 'textureVerticale');
      champTexture('Texture horizontale', 'textureHorizontale');

      if(obj.fonction === 'arbre'){
        // Le feuillage est une sphere posee sur le tronc (le prisme existant, base sur l'emprise
        // et l'Élévation ci-dessus, qui reste la hauteur du TRONC) - un jeu de champs a part,
        // independant de la silhouette/hauteur du tronc, parce qu'un feuillage n'a ni la meme
        // forme ni la meme matiere que l'ecorce.
        const diamInp = document.createElement('input'); diamInp.type='number'; diamInp.step='0.1'; diamInp.min='0.1';
        diamInp.value = (obj.diametreArbre !== undefined && obj.diametreArbre !== null) ? obj.diametreArbre : 3;
        diamInp.title = 'Diametre du feuillage (sphere posee sur le tronc), utilise par la Vue 3D';
        diamInp.addEventListener('change', ()=>{
          obj.diametreArbre = Math.max(0.1, parseFloat(diamInp.value)) || 3;
          markDirty();
          const t = threeScene && etat.objects.find(o=>o.key===etat.terrasseSelectedKey);
          if(t) buildThreeScene(t);
        });
        addRow('Diamètre du feuillage (m)', diamInp);

        const couleurArbreInp = document.createElement('input'); couleurArbreInp.type='color';
        couleurArbreInp.value = obj.couleurArbre || '#4a7c3a';
        couleurArbreInp.title = 'Couleur du feuillage';
        couleurArbreInp.addEventListener('input', ()=>{
          obj.couleurArbre = couleurArbreInp.value;
          markDirty();
          const t = threeScene && etat.objects.find(o=>o.key===etat.terrasseSelectedKey);
          if(t) buildThreeScene(t);
        });
        addRow('Couleur du feuillage', couleurArbreInp);

        champTexture('Texture du feuillage', 'textureArbre');
      }

      if(obj.fonction === 'parasol'){
        // Terrasse de rattachement : c'est elle dont l'ombrage est mesure et sur laquelle porte la
        // recherche de position. Indispensable des qu'il y a plusieurs terrasses.
        const terrasses = etat.objects.filter(o=>o.fonction==='terrasse');
        const tSelect = document.createElement('select');
        if(!terrasses.length){
          const o0 = document.createElement('option');
          o0.textContent = 'Aucune terrasse dans le plan'; o0.value = '';
          tSelect.appendChild(o0); tSelect.disabled = true;
        } else {
          const courante = terrasseDuParasol(obj, etat.objects, etat.terrasseSelectedKey);
          terrasses.forEach(t=>{
            const o2 = document.createElement('option');
            o2.value = t.key; o2.textContent = t.name;
            if(courante && t.key === courante.key) o2.selected = true;
            tSelect.appendChild(o2);
          });
          // Le lien retenu par defaut (celle qui contient le parasol) est ecrit en dur des le
          // premier affichage : sans ca, il resterait implicite et changerait tout seul si on
          // deplacait le parasol hors de cette terrasse.
          if(courante) obj.terrasseLieeKey = courante.key;
        }
        tSelect.addEventListener('change', ()=>{
          obj.terrasseLieeKey = tSelect.value;
          markDirty();
          render();
        });
        addRow('Terrasse rattachée', tSelect);

        // Le diametre de la toile est deja le "Rayon" du cercle (champ existant plus bas) : seule
        // la hauteur du mat manque, c'est elle qui fixe la longueur de l'ombre projetee.
        const hInp = document.createElement('input'); hInp.type='number'; hInp.step='0.1'; hInp.min='0.5';
        hInp.value = hauteurParasolDe(obj);
        hInp.title = 'Hauteur de la toile au-dessus du sol - plus le mat est haut, plus l\'ombre se decale loin du pied';
        hInp.addEventListener('change', ()=>{
          obj.hauteurParasol = Math.max(0.5, parseFloat(hInp.value)) || 2.2;
          hInp.value = obj.hauteurParasol;
          markDirty();
          render();
          const t = threeScene && etat.objects.find(o=>o.key===etat.terrasseSelectedKey);
          if(t) buildThreeScene(t);
        });
        addRow('Hauteur du mât (m)', hInp);

        const cbBord = document.createElement('input'); cbBord.type='checkbox'; cbBord.checked = !!obj.matSurPerimetre;
        cbBord.title = 'Le pied reste colle au pourtour de la terrasse rattachee - y compris quand on glisse le parasol, et la recherche de position ne teste plus que le bord';
        cbBord.addEventListener('change', ()=>{
          obj.matSurPerimetre = cbBord.checked;
          markDirty();
          render(); renderAttrTable();
        });
        addRow('Mât sur le périmètre de la terrasse', cbBord);

        const cbDep = document.createElement('input'); cbDep.type='checkbox'; cbDep.checked = !!obj.matDeporte;
        cbDep.title = 'Parasol deporte : le mat n\'est plus au centre de la toile mais sur son bord, ce qui degage la surface sous la toile';
        cbDep.addEventListener('change', ()=>{
          obj.matDeporte = cbDep.checked;
          markDirty();
          render(); renderAttrTable();
          const t = threeScene && etat.objects.find(o=>o.key===etat.terrasseSelectedKey);
          if(t) buildThreeScene(t);
        });
        addRow('Mât déporté (en bord de toile)', cbDep);

        if(obj.matDeporte){
          const angInp = document.createElement('input'); angInp.type='number'; angInp.step='5';
          angInp.value = Math.round(matAngleDe(obj));
          angInp.title = 'Direction du pied vu depuis le centre de la toile : 0 = Est, 90 = Nord';
          angInp.addEventListener('change', ()=>{
            obj.matAngleDeg = ((parseFloat(angInp.value)||0) % 360 + 360) % 360;
            angInp.value = Math.round(obj.matAngleDeg);
            markDirty();
            render();
            const t = threeScene && etat.objects.find(o=>o.key===etat.terrasseSelectedKey);
            if(t) buildThreeScene(t);
          });
          addRow('Orientation du mât (°)', angInp);
        }

        const dateInp = document.createElement('input'); dateInp.type='date'; dateInp.value = etat.parasol.dateStr;
        dateInp.addEventListener('change', ()=>{ if(dateInp.value){ etat.parasol.dateStr = dateInp.value; render(); } });
        addRow('Ombre — date', dateInp);

        const wrapH = document.createElement('div');
        wrapH.style.cssText = 'display:flex; align-items:center; gap:8px;';
        const heureInp = document.createElement('input'); heureInp.type='range';
        heureInp.min='0'; heureInp.max='1439'; heureInp.step='5'; heureInp.value = etat.parasol.minutes;
        heureInp.style.cssText = 'flex:1;';
        const heureTxt = document.createElement('span');
        heureTxt.style.cssText = 'min-width:44px; text-align:right; font-variant-numeric:tabular-nums;';
        heureTxt.textContent = formatHeureMin(etat.parasol.minutes);
        heureInp.addEventListener('input', ()=>{
          etat.parasol.minutes = parseInt(heureInp.value,10);
          heureTxt.textContent = formatHeureMin(etat.parasol.minutes);
          render();
        });
        wrapH.appendChild(heureInp); wrapH.appendChild(heureTxt);
        addRow('Ombre — heure', wrapH);

        const cbOmbre = document.createElement('input'); cbOmbre.type='checkbox'; cbOmbre.checked = etat.parasol.ombreAffichee;
        cbOmbre.addEventListener('change', ()=>{ etat.parasol.ombreAffichee = cbOmbre.checked; render(); });
        addRow('Afficher l\'ombre', cbOmbre);

        const cbCarte = document.createElement('input'); cbCarte.type='checkbox'; cbCarte.checked = etat.parasol.carteAffichee;
        cbCarte.title = 'Colore la terrasse selon la part des apres-midis d\'ete (mai a septembre, 12h-18h) passee a l\'ombre';
        cbCarte.addEventListener('change', ()=>{ etat.parasol.carteAffichee = cbCarte.checked; render(); });
        addRow('Carte de chaleur (heures d\'ombre)', cbCarte);

        const wrapOpt = document.createElement('div');
        wrapOpt.style.cssText = 'display:flex; align-items:center; gap:8px; flex-wrap:wrap;';
        const optBtn = document.createElement('button'); optBtn.type='button'; optBtn.className='objbtn small';
        optBtn.textContent = 'Placer au mieux';
        const optTxt = document.createElement('span');
        optTxt.style.cssText = 'font-size:0.8rem; color:var(--ink-soft);';
        optBtn.addEventListener('click', ()=>{
          const terr = terrasseDuParasol(obj, etat.objects, etat.terrasseSelectedKey);
          if(!terr){ showToast('Aucune terrasse : cree d\'abord un objet avec Fonction = terrasse.'); return; }
          optBtn.disabled = true; optBtn.textContent = 'Recherche…';
          // Laisse le navigateur peindre l'etat "Recherche…" avant de bloquer le thread : sans ce
          // report, le calcul demarre dans le meme tour de boucle et le bouton ne change jamais
          // visuellement d'aspect.
          setTimeout(()=>{
            const res = chercherMeilleurePositionParasol(obj, contexteSoleilParasol(), etat.objects);
            optBtn.disabled = false; optBtn.textContent = 'Placer au mieux';
            if(!res){ showToast('Pas de position calculable (soleil trop bas ou terrasse trop petite).'); return; }
            pushHistory();
            obj.center.x = res.x; obj.center.y = res.y;
            if(obj.matDeporte && res.angleDeg !== undefined) obj.matAngleDeg = res.angleDeg;
            render();
            renderAttrTable();
            showToast('Parasol place sur "' + terr.name + '" : ' + (res.couverture*100).toFixed(0) + ' % a l\'ombre en moyenne (mai-sept., 12h-18h).');
          }, 30);
        });
        optTxt.textContent = 'Cherche sur la terrasse la position qui ombrage le plus, mai→sept. 12h–18h.';
        wrapOpt.appendChild(optBtn); wrapOpt.appendChild(optTxt);
        addRow('Meilleure position', wrapOpt);
      }
    }

    if(surf !== null && obj.fonction !== 'camera'){
      const surfSpan = document.createElement('span');
      surfSpan.textContent = surf.toFixed(2) + ' m²' + (obj.key!=='parcelle' && sParcelle>0 ? '  (' + (surf/sParcelle*100).toFixed(1) + ' % de la parcelle)' : '');
      addRow('Surface', surfSpan);
    }

    const lockCb = document.createElement('input'); lockCb.type='checkbox'; lockCb.checked = !!obj.locked;
    lockCb.title = 'Verrouille l\'objet entier : bloque le glisser, la suppression, l\'ajout/suppression de points';
    lockCb.addEventListener('change', ()=>{ pushHistory(); obj.locked = lockCb.checked; render(); });
    addRow('Verrouiller objet', lockCb);

    if(obj.type==='polygon' && obj.pts.length===4){
      const rectCb = document.createElement('input'); rectCb.type='checkbox';
      // Derived from the freeze state rather than a separate stored flag: freezing all 4
      // corners is what actually blocks angle/length edits elsewhere in the app (Coins/
      // Cotes tabs, point/edge drag), so this stays true to reality even if a corner gets
      // individually un-frozen later (double-click on a point handle).
      rectCb.checked = obj.frozenVertices.every(Boolean);
      rectCb.title = 'Verrouille les 4 angles a 90 degres (fige les 4 coins)';
      rectCb.addEventListener('change', ()=>{
        if(rectCb.checked){
          // Deja d'equerre : on verrouille tel quel, sans redresser. Une terrasse rectangulaire
          // mais orientee a 30 degres n'a aucune raison de basculer sur les axes de l'ecran.
          if(dejaRectangle(obj.pts)){
            pushHistory();
            obj.frozenVertices = obj.frozenVertices.map(()=>true);
            render();
            return;
          }
          const xs = obj.pts.map(p=>p.x), ys = obj.pts.map(p=>p.y);
          const minX=Math.min(...xs), maxX=Math.max(...xs), minY=Math.min(...ys), maxY=Math.max(...ys);
          // Envoyer chaque point vers le coin le plus proche selon les medianes parait naturel,
          // mais sur une forme oblique (losange, parallelogramme) deux points atterrissent sur le
          // MEME coin et le polygone devient degenere. On attribue donc les quatre coins dans
          // l'ordre de parcours, en partant de celui le plus proche du premier point : quatre
          // coins distincts, et le sens de rotation conserve.
          const coins = [{x:minX,y:minY},{x:maxX,y:minY},{x:maxX,y:maxY},{x:minX,y:maxY}];
          if(signedArea(obj.pts) < 0) coins.reverse();
          let depart = 0, meilleure = Infinity;
          coins.forEach((cc,k)=>{ const d = dist(cc, obj.pts[0]); if(d < meilleure){ meilleure = d; depart = k; } });
          const newPts = obj.pts.map((_,i)=>({ ...coins[(depart+i)%4] }));
          const bound = (obj.constrained && etat.objects.find(o=>o.key==='parcelle')) ? etat.objects.find(o=>o.key==='parcelle').pts : null;
          if(bound && !newPts.every(p=>pointInPolygon(p,bound))){
            showToast('Le rectangle sortirait de la parcelle - mode rectangle non active.');
            rectCb.checked = false;
            return;
          }
          pushHistory();
          obj.pts = newPts;
          obj.frozenVertices = obj.frozenVertices.map(()=>true);
          rebuildHandles(obj);
        } else {
          pushHistory();
          obj.frozenVertices = obj.frozenVertices.map(()=>false);
        }
        render();
      });
      addRow('Mode rectangle (angles à 90°)', rectCb);
    }

    if(obj.type==='circle'){
      const rr=document.createElement('input'); rr.type='number'; rr.step='0.01'; rr.min='0.1';
      rr.value = obj.r.toFixed(2);
      rr.addEventListener('change', ()=>{
        const v = parseFloat(rr.value);
        if(!isNaN(v) && v>0.05){
          pushHistory();
          const bound = (obj.constrained && etat.objects.find(o=>o.key==='parcelle')) ? etat.objects.find(o=>o.key==='parcelle').pts : null;
          let ok = !bound;
          if(bound){
            ok = true;
            for(let a=0;a<16;a++){
              const ang=a/16*2*Math.PI;
              const bp={x:obj.center.x+v*Math.cos(ang), y:obj.center.y+v*Math.sin(ang)};
              if(!pointInPolygon(bp,bound)){ ok=false; break; }
            }
          }
          if(ok) obj.r=v; else rr.value=obj.r.toFixed(2);
          render();
        }
      });
      addRow('Rayon (m)', rr);
    }

    if(obj.type==='path' && obj.fonction!=='camera'){
      let totalLen = 0;
      for(let i=0;i<obj.pts.length-1;i++) totalLen += dist(obj.pts[i], obj.pts[i+1]);
      const lenSpan = document.createElement('span'); lenSpan.textContent = totalLen.toFixed(2) + ' m';
      addRow('Longueur totale', lenSpan);

      const wInp = document.createElement('input'); wInp.type='number'; wInp.step='0.05'; wInp.min='0.05';
      wInp.value = (obj.width||1).toFixed(2);
      wInp.addEventListener('change', ()=>{
        const v = parseFloat(wInp.value);
        if(!isNaN(v) && v>0){ pushHistory(); obj.width = v; render(); }
      });
      addRow('Largeur (m)', wInp);

      const curveCb = document.createElement('input'); curveCb.type='checkbox'; curveCb.checked = !!obj.curve;
      curveCb.addEventListener('change', ()=>{ obj.curve = curveCb.checked; markDirty(); render(); });
      addRow('Courbe (passe par les points)', curveCb);
    }

    // Point de vue : le point 1 (pts[0]) porte la position, le point 2 (pts[1]) la direction -
    // glisser l'un ou l'autre sur le plan les regle directement. La direction affichee ici est
    // DERIVEE des deux points a chaque fois, jamais stockee a part : deplacer un point sur le
    // plan ne pourrait sinon plus jamais desynchroniser le nombre affiche de la fleche dessinee.
    if(obj.type==='path' && obj.fonction==='camera'){
      if(obj.altitude===undefined) obj.altitude = 1.6;
      const altInp = document.createElement('input'); altInp.type='number'; altInp.step='0.1'; altInp.min='0.1';
      altInp.value = obj.altitude.toFixed(2);
      altInp.title = 'Hauteur de la camera au-dessus du sol (m)';
      altInp.addEventListener('change', ()=>{ obj.altitude = Math.max(0.1, parseFloat(altInp.value)||1.6); markDirty(); });
      addRow('Altitude (m)', altInp);

      const ddx = obj.pts[1].x-obj.pts[0].x, ddy = obj.pts[1].y-obj.pts[0].y;
      const distDir = Math.hypot(ddx,ddy) || 2;
      const dirActuel = Math.atan2(ddy,ddx)*180/Math.PI;
      const dirInp = document.createElement('input'); dirInp.type='number'; dirInp.step='5';
      dirInp.value = Math.round(dirActuel);
      dirInp.title = 'Direction visee, en degres : 0° = Est, 90° = Nord. Deplace le point "Direction" sur le plan - ce champ le suit, ou le repositionne.';
      dirInp.addEventListener('change', ()=>{
        const rad = (parseFloat(dirInp.value)||0)*Math.PI/180;
        obj.pts[1] = { x: obj.pts[0].x+Math.cos(rad)*distDir, y: obj.pts[0].y+Math.sin(rad)*distDir };
        markDirty();
        render();
      });
      addRow('Direction (°)', dirInp);

      const gotoBtn = document.createElement('button'); gotoBtn.type='button'; gotoBtn.className='secondary small';
      gotoBtn.textContent = 'Aller à cette vue en Vue 3D';
      gotoBtn.addEventListener('click', ()=>allerAuPointDeVue(obj));
      addRow('', gotoBtn);
    }

    if(obj.type==='polygon' || obj.type==='path'){
      const alignTitle = document.createElement('div');
      alignTitle.className = 'sectionTitle';
      alignTitle.style.marginTop = '10px';
      alignTitle.textContent = 'Alignement par rotation';
      const tr0 = document.createElement('tr');
      const td0a = document.createElement('td'); td0a.colSpan = 3; td0a.appendChild(alignTitle);
      tr0.appendChild(td0a); tbl.appendChild(tr0);

      const explainRow = document.createElement('tr');
      const explainTd = document.createElement('td'); explainTd.colSpan = 3;
      explainTd.className = 'hint';
      explainTd.textContent = "Choisis un segment cible sur le plan (n'importe quel objet) : l'objet sélectionné pivote autour du milieu de son côté le plus proche de ce segment cible, pour devenir parallèle à celui-ci.";
      explainRow.appendChild(explainTd); tbl.appendChild(explainRow);

      const btnRow = document.createElement('tr');
      const btnTd = document.createElement('td'); btnTd.colSpan = 3;
      const pickBtn = document.createElement('button');
      pickBtn.className = 'secondary small';
      const isPickingAlign = pickState && pickState.purpose==='align';
      pickBtn.textContent = isPickingAlign ? 'Clique un segment sur le plan…' : 'Choisir un segment cible';
      if(isPickingAlign) pickBtn.disabled = true;
      pickBtn.addEventListener('click', ()=>startPick('ref', false, 'align'));
      btnTd.appendChild(pickBtn);
      btnRow.appendChild(btnTd); tbl.appendChild(btnRow);

      const infoRow = document.createElement('tr');
      const infoTd = document.createElement('td'); infoTd.colSpan = 3;
      infoTd.style.fontSize = '0.8rem'; infoTd.style.padding = '4px 6px';
      let nearestLbl = '(choisis d\'abord un segment cible)';
      if(alignTargetSeg){
        const tgt = measureSegCoords(alignTargetSeg);
        if(tgt){
          const idx = nearestSegmentIndex(obj, tgt);
          if(idx>=0) nearestLbl = obj.segmentNames[idx] || ('Cote '+(idx+1));
        }
      }
      infoTd.textContent = 'Segment cible : ' + refLabel(alignTargetSeg) + '  |  Côté le plus proche de "' + obj.name + '" : ' + nearestLbl;
      infoRow.appendChild(infoTd); tbl.appendChild(infoRow);

      const distRow = document.createElement('tr');
      const distTd0 = document.createElement('td'); distTd0.textContent = 'Distance au segment (m)';
      const distTd1 = document.createElement('td');
      const distTd2 = document.createElement('td');
      const distInp = document.createElement('input'); distInp.id='alignDistanceInput';
      distInp.type='number'; distInp.step='0.01'; distInp.min='0';
      distInp.placeholder='vide = pas de changement';
      distInp.value = alignDistanceValue;
      distInp.addEventListener('input', ()=>{ alignDistanceValue = distInp.value; });
      distTd2.appendChild(distInp);
      distRow.appendChild(distTd0); distRow.appendChild(distTd1); distRow.appendChild(distTd2);
      tbl.appendChild(distRow);

      const alignBtnRow = document.createElement('tr');
      const alignBtnTd = document.createElement('td'); alignBtnTd.colSpan = 3;
      const alignBtn = document.createElement('button');
      alignBtn.textContent = 'Aligner par rotation';
      alignBtn.disabled = !alignTargetSeg || obj.locked;
      alignBtn.title = obj.locked ? 'Objet verrouille' : '';
      alignBtn.addEventListener('click', ()=>{ alignObjectByRotation(obj); });
      alignBtnTd.appendChild(alignBtn);
      alignBtnRow.appendChild(alignBtnTd); tbl.appendChild(alignBtnRow);
    }
  } else if(obj.type==='polygon' && etat.attrTab==='angles'){
    obj.vertexNames.forEach((vn,i)=>{
      const tr=document.createElement('tr');
      if(etat.highlight.type==='vertex' && etat.highlight.index===i) tr.className='highlightRow';
      const frozen = !!obj.frozenVertices[i];
      const td0=document.createElement('td'); td0.textContent='Coin '+(i+1)+' (angle)';
      const td1=document.createElement('td');
      const ii=document.createElement('input'); ii.type='text'; ii.value=vn;
      ii.addEventListener('input', ()=>{
        // Targeted update instead of render(): render() rebuilds this whole table from
        // scratch, which recreates this very input and kills focus/cursor on every keystroke.
        obj.vertexNames[i] = ii.value;
        if(vue(obj).ptLabelEls && vue(obj).ptLabelEls[i]){
          const vName = obj.vertexNames[i] || ('P'+(i+1));
          const showAngleHere = obj.showAngles && obj.type==='polygon';
          let vertTxt = '';
          if(obj.showVertNames && showAngleHere) vertTxt = vName + ' — ' + interiorAngleDeg(obj,i).toFixed(1) + '°';
          else if(obj.showVertNames) vertTxt = vName;
          else if(showAngleHere) vertTxt = interiorAngleDeg(obj,i).toFixed(1) + '°';
          vue(obj).ptLabelEls[i].textContent = vertTxt;
        }
      });
      td1.appendChild(ii);
      const td2=document.createElement('td');
      const ang=document.createElement('input'); ang.type='number'; ang.step='0.1';
      ang.value = interiorAngleDeg(obj,i).toFixed(1);
      ang.disabled = frozen;
      ang.title = frozen ? 'Angle fige - decoche "Fige" pour le modifier' : '';
      ang.addEventListener('change', ()=>{
        const v = parseFloat(ang.value);
        if(!isNaN(v)){
          pushHistory();
          const ok = applyAngleEdit(obj,i,v);
          if(!ok) ang.value = interiorAngleDeg(obj,i).toFixed(1); // reverted: would exit parcelle
          rebuildHandles(obj); render();
        }
      });
      const spanDeg = document.createElement('span'); spanDeg.textContent=' °'; spanDeg.style.fontSize='0.75rem';
      td2.appendChild(ang); td2.appendChild(spanDeg);
      const delBtnV = document.createElement('button');
      delBtnV.textContent = 'Supprimer'; delBtnV.className='secondary small';
      delBtnV.style.marginLeft = '6px';
      delBtnV.disabled = obj.pts.length <= 3 || frozen;
      delBtnV.title = obj.pts.length<=3 ? 'Impossible: il faut garder au moins 3 sommets' : (frozen ? 'Coin fige' : 'Supprime ce coin (fusionne les deux cotes voisins)');
      delBtnV.addEventListener('click', ()=>{ deleteVertex(obj, i); });
      td2.appendChild(delBtnV);
      const td3 = document.createElement('td');
      const fz = document.createElement('input'); fz.type='checkbox'; fz.checked=frozen;
      fz.title = 'Figer cet angle : empeche de le deplacer (glisser, longueur adjacente, angle) pour faciliter les autres modifications';
      fz.addEventListener('change', ()=>{ obj.frozenVertices[i]=fz.checked; render(); });
      td3.appendChild(fz);
      tr.appendChild(td0); tr.appendChild(td1); tr.appendChild(td2); tr.appendChild(td3);
      tbl.appendChild(tr);
    });
  } else if((obj.type==='polygon' || obj.type==='path') && etat.attrTab==='segments'){
    if(obj.type==='path'){
      obj.vertexNames.forEach((vn,i)=>{
        const tr=document.createElement('tr');
        if(etat.highlight.type==='vertex' && etat.highlight.index===i) tr.className='highlightRow';
        const td0=document.createElement('td'); td0.textContent='Point '+(i+1);
        const td1=document.createElement('td');
        const ii=document.createElement('input'); ii.type='text'; ii.value=vn;
        ii.addEventListener('input', ()=>{
          obj.vertexNames[i] = ii.value;
          if(vue(obj).ptLabelEls && vue(obj).ptLabelEls[i]){
            const vName = obj.vertexNames[i] || ('P'+(i+1));
            vue(obj).ptLabelEls[i].textContent = obj.showVertNames ? vName : '';
          }
        });
        td1.appendChild(ii);
        const td2=document.createElement('td');
        const delBtnP = document.createElement('button');
        delBtnP.textContent = 'Supprimer'; delBtnP.className='secondary small';
        delBtnP.disabled = obj.pts.length <= 2;
        delBtnP.title = obj.pts.length<=2 ? 'Impossible: il faut garder au moins 2 points' : 'Supprime ce point';
        delBtnP.addEventListener('click', ()=>{ deleteVertex(obj, i); });
        td2.appendChild(delBtnP);
        tr.appendChild(td0); tr.appendChild(td1); tr.appendChild(td2);
        tbl.appendChild(tr);
      });
    }
    const minPts = obj.type==='path' ? 2 : 3;
    obj.segmentNames.forEach((sn,i)=>{
      const n = obj.pts.length;
      if(obj.type==='path' && i >= n-1) return; // no closing segment for open paths
      const tr=document.createElement('tr');
      if(etat.highlight.type==='segment' && etat.highlight.index===i) tr.className='highlightRow';
      const td0=document.createElement('td'); td0.textContent='Cote '+(i+1)+' (longueur)';
      const td1=document.createElement('td');
      const ii=document.createElement('input'); ii.type='text'; ii.value=sn;
      ii.addEventListener('input', ()=>{
        obj.segmentNames[i] = ii.value;
        if(vue(obj).segLabelEls && vue(obj).segLabelEls[i]){
          const a=obj.pts[i], b=obj.pts[(i+1)%obj.pts.length];
          let segTxt = '';
          if(obj.showSegNames && obj.showDims) segTxt = obj.segmentNames[i] + ' — ' + dist(a,b).toFixed(2)+' m';
          else if(obj.showSegNames) segTxt = obj.segmentNames[i];
          else if(obj.showDims) segTxt = dist(a,b).toFixed(2)+' m';
          vue(obj).segLabelEls[i].textContent = segTxt;
        }
      });
      td1.appendChild(ii);
      const td2=document.createElement('td');
      const len=document.createElement('input'); len.type='number'; len.step='0.01'; len.min='0.05';
      len.value = dist(obj.pts[i], obj.pts[(i+1)%n]).toFixed(2);
      const aFrozenUi = !!obj.frozenVertices[i];
      const bFrozenUi = !!obj.frozenVertices[(i+1)%n];
      const bothFrozenUi = aFrozenUi && bFrozenUi;
      len.disabled = bothFrozenUi;
      len.title = bothFrozenUi ? 'Les deux coins de ce cote sont figes' : (aFrozenUi || bFrozenUi ? 'Un coin est fige : l\'autre extremite du cote sera deplacee pour atteindre cette longueur' : '');
      len.addEventListener('change', ()=>{
        const v = parseFloat(len.value);
        if(!isNaN(v) && v>0){
          pushHistory();
          const ok = applyLengthEdit(obj,i,v);
          if(!ok) len.value = dist(obj.pts[i], obj.pts[(i+1)%n]).toFixed(2); // reverted
          rebuildHandles(obj); render();
        }
      });
      const spanM = document.createElement('span'); spanM.textContent=' m'; spanM.style.fontSize='0.75rem';
      td2.appendChild(len); td2.appendChild(spanM);
      const delBtn = document.createElement('button');
      delBtn.textContent = 'Supprimer'; delBtn.className='secondary small';
      delBtn.style.marginLeft = '6px';
      delBtn.disabled = obj.pts.length <= minPts;
      delBtn.title = obj.pts.length<=minPts ? 'Impossible: nombre minimum de sommets atteint' : 'Supprime ce cote (fusionne les deux sommets voisins)';
      delBtn.addEventListener('click', ()=>{ deleteVertex(obj, (i+1)%n); });
      td2.appendChild(delBtn);
      tr.appendChild(td0); tr.appendChild(td1); tr.appendChild(td2);
      tbl.appendChild(tr);
    });
  } else {
    const tr=document.createElement('tr');
    const td0=document.createElement('td'); td0.textContent='(rien a afficher)';
    tr.appendChild(td0);
    tbl.appendChild(tr);
  }
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
        alignTargetSeg = picked;
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
    activeDrag = {type:'pan', startScreen:{x:e.clientX-rect.left, y:e.clientY-rect.top}, startOrigin:{...scene.origine}};
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

  if(activeDrag.type === 'pan'){
    const rect = stage.getBoundingClientRect();
    const cur = {x:e.clientX-rect.left, y:e.clientY-rect.top};
    scene.origine = {
      x: activeDrag.startOrigin.x + (cur.x-activeDrag.startScreen.x),
      y: activeDrag.startOrigin.y + (cur.y-activeDrag.startScreen.y)
    };
    render();
    return;
  }

  const w = worldFromEvent(e);
  const dx = w.x-activeDrag.startWorld.x, dy = w.y-activeDrag.startWorld.y;
  const obj = activeDrag.obj;
  const parcelleNow = objByKey('parcelle');
  const bound = (obj.constrained && parcelleNow) ? parcelleNow.pts : null;

  if(activeDrag.type === 'circleMove'){
    activeDrag.moved = true;
    const cand = {x:activeDrag.startCenter.x+dx, y:activeDrag.startCenter.y+dy};
    let ok = !bound || pointInPolygon(cand, bound);
    if(ok && bound){
      for(let a=0;a<16;a++){
        const ang=a/16*2*Math.PI;
        const bp={x:cand.x+obj.r*Math.cos(ang), y:cand.y+obj.r*Math.sin(ang)};
        if(!pointInPolygon(bp,bound)){ ok=false; break; }
      }
    }
    if(ok) obj.center = cand;
  } else if(activeDrag.type === 'point' && estRectangle(obj)){
    // Tirer un coin redimensionne le rectangle : l'oppose reste fixe, les voisins suivent.
    const pts = rectangleDepuisCoin(obj.pts, activeDrag.idx, w);
    if(pts && (!bound || pts.every(p=>pointInPolygon(p,bound)))) obj.pts = pts;
  } else if(activeDrag.type === 'edge' && estRectangle(obj)){
    const pts = rectangleDepuisCote(obj.pts, activeDrag.i, activeDrag.j, activeDrag.startA, dx, dy);
    if(pts && (!bound || pts.every(p=>pointInPolygon(p,bound)))) obj.pts = pts;
  } else if(activeDrag.type === 'point'){
    let candidate = w;
    if(obj.type==='polygon' && obj.frozenVertices){
      const n = obj.pts.length;
      const idx = activeDrag.idx;
      const prevIdx = (idx-1+n)%n, nextIdx = (idx+1)%n;
      const prevFrozen = obj.frozenVertices[prevIdx];
      const nextFrozen = obj.frozenVertices[nextIdx];
      if(prevFrozen && nextFrozen){
        candidate = null; // both neighbours frozen: angle at both would change, no valid move
      } else if(prevFrozen || nextFrozen){
        // one neighbour is frozen: keep the angle at that frozen corner fixed by only
        // allowing movement along the original direction from the frozen corner
        const anchor = obj.pts[prevFrozen ? prevIdx : nextIdx];
        const origDir = {x:activeDrag.startPt.x-anchor.x, y:activeDrag.startPt.y-anchor.y};
        const dirLen = Math.hypot(origDir.x,origDir.y) || 1e-9;
        const ux = origDir.x/dirLen, uy = origDir.y/dirLen;
        const rel = {x:w.x-anchor.x, y:w.y-anchor.y};
        const t = Math.max(0.05, rel.x*ux + rel.y*uy); // signed distance along the fixed direction, min 5cm
        candidate = {x:anchor.x+ux*t, y:anchor.y+uy*t};
      }
    }
    if(candidate && (!bound || pointInPolygon(candidate, bound))) obj.pts[activeDrag.idx] = candidate;
  } else if(activeDrag.type === 'edge'){
    const na={x:activeDrag.startA.x+dx,y:activeDrag.startA.y+dy};
    const nb={x:activeDrag.startB.x+dx,y:activeDrag.startB.y+dy};
    if(!bound || (pointInPolygon(na,bound)&&pointInPolygon(nb,bound))){
      obj.pts[activeDrag.i]=na; obj.pts[activeDrag.j]=nb;
    }
  } else if(activeDrag.type === 'shapeMove'){
    activeDrag.moved = true;
    const cand = activeDrag.startPts.map(p=>({x:p.x+dx,y:p.y+dy}));
    if(!bound || cand.every(p=>pointInPolygon(p,bound))) obj.pts = cand;
  } else if(activeDrag.type === 'radius'){
    const newR = Math.max(0.15, dist(obj.center, w));
    let ok = !bound;
    if(bound){
      ok = true;
      for(let a=0;a<16;a++){
        const ang=a/16*2*Math.PI;
        const bp={x:obj.center.x+newR*Math.cos(ang), y:obj.center.y+newR*Math.sin(ang)};
        if(!pointInPolygon(bp,bound)){ ok=false; break; }
      }
    }
    if(ok) obj.r = newR;
  }
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
  const bound = (obj.constrained && etat.objects.find(o=>o.key==='parcelle')) ? etat.objects.find(o=>o.key==='parcelle').pts : null;
  if(bound && !pointInPolygon(newPt, bound)) return;
  pushHistory();
  obj.pts.splice(segIndex+1, 0, newPt);
  obj.vertexNames.splice(segIndex+1, 0, 'Coin '+(obj.pts.length));
  obj.segmentNames.splice(segIndex+1, 0, 'Cote '+(obj.pts.length));
  obj.frozenVertices.splice(segIndex+1, 0, false);
  rebuildHandles(obj);
  render();
}

function deleteVertex(obj, idx){
  if(obj.locked) return;
  const minPts = obj.type==='path' ? 2 : 3;
  if(obj.pts.length <= minPts) return; // keep at least a valid shape
  pushHistory();
  obj.pts.splice(idx,1);
  obj.vertexNames.splice(idx,1);
  if(idx < obj.segmentNames.length) obj.segmentNames.splice(idx,1); else obj.segmentNames.pop();
  obj.frozenVertices.splice(idx,1);
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

svg.addEventListener('wheel', e=>{
  e.preventDefault();
  const rect = stage.getBoundingClientRect();
  const mouse = {x:e.clientX-rect.left, y:e.clientY-rect.top};
  const wb = toWorld(mouse);
  const factor = e.deltaY<0 ? 1.1 : 1/1.1;
  scene.scale = Math.min(220, Math.max(6, scene.scale*factor));
  scene.origine = {x: mouse.x - wb.x*scene.scale, y: mouse.y + wb.y*scene.scale};
  render();
}, {passive:false});

const activePointers = new Map();
let pinchState=null, panState=null;
function stageRel(e){ const r=stage.getBoundingClientRect(); return {x:e.clientX-r.left, y:e.clientY-r.top}; }
function midOf(arr){ const n=arr.length; return {x:arr.reduce((s,p)=>s+p.x,0)/n, y:arr.reduce((s,p)=>s+p.y,0)/n}; }
stage.addEventListener('pointerdown', e=>{
  activePointers.set(e.pointerId, stageRel(e));
  if(activePointers.size===2){
    activeDrag=null;
    const arr=[...activePointers.values()];
    pinchState={dist0:dist(arr[0],arr[1]), scale0:scene.scale, midWorld:toWorld(midOf(arr))};
    panState=null;
  } else if(activePointers.size===3){
    activeDrag=null; pinchState=null;
    const arr=[...activePointers.values()];
    panState={avg0:midOf(arr), origin0:{...scene.origine}};
  } else if(activePointers.size>3){ pinchState=null; panState=null; }
});
window.addEventListener('pointermove', e=>{
  if(!activePointers.has(e.pointerId)) return;
  activePointers.set(e.pointerId, stageRel(e));
  if(activePointers.size===2 && pinchState){
    const arr=[...activePointers.values()];
    const d=dist(arr[0],arr[1]); const mid=midOf(arr);
    scene.scale = Math.min(220, Math.max(6, pinchState.scale0*(d/pinchState.dist0)));
    scene.origine = {x: mid.x-pinchState.midWorld.x*scene.scale, y: mid.y+pinchState.midWorld.y*scene.scale};
    render();
  } else if(activePointers.size===3 && panState){
    const arr=[...activePointers.values()];
    const avg=midOf(arr);
    scene.origine = {x: panState.origin0.x+(avg.x-panState.avg0.x), y: panState.origin0.y+(avg.y-panState.avg0.y)};
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
    scene.origine = {
      x: etat.scene.W/2 - centerWorldBefore.x*scene.scale,
      y: etat.scene.H/2 + centerWorldBefore.y*scene.scale
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
  if(threeScene) buildThreeScene(etat.objects.find(o=>o.key===etat.terrasseSelectedKey) || null);
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
    vue(obj).el.remove(); vue(obj).nameEl.remove();
    vue(obj).pointEls.forEach(el=>el.remove()); vue(obj).ptLabelEls.forEach(el=>el.remove());
    vue(obj).edgeEls.forEach(el=>el.remove()); vue(obj).segLabelEls.forEach(el=>el.remove());
    if(vue(obj).radiusHandle) vue(obj).radiusHandle.remove();
    if(vue(obj).camMarkerEl) vue(obj).camMarkerEl.remove();
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

const NAME_SEP = '\u241F'; // unlikely-to-collide separator for encoding name arrays in SVG data-* attrs

function buildExportSVG(){
  const allPts = [];
  etat.objects.forEach(o=>{
    if(o.type==='polygon' || o.type==='path') o.pts.forEach(p=>allPts.push(p));
    else { allPts.push({x:o.center.x-o.r,y:o.center.y-o.r}); allPts.push({x:o.center.x+o.r,y:o.center.y+o.r}); }
  });
  const xs=allPts.map(p=>p.x).filter(v=>Number.isFinite(v));
  const ys=allPts.map(p=>p.y).filter(v=>Number.isFinite(v));
  if(xs.length===0 || ys.length===0) throw new Error('Aucune coordonnee valide a exporter');
  const minx=Math.min(...xs), maxx=Math.max(...xs), miny=Math.min(...ys), maxy=Math.max(...ys);
  const pad=4;
  const w=(maxx-minx)+2*pad, h=(maxy-miny)+2*pad+3;
  const exScale = 20;
  // Match on-screen HTML font sizes exactly: live render uses fixed pixel sizes
  // (segLabelEls=11px, ptLabelEls=10px, nameEl=14px or 10px). The export viewBox
  // is in meters at exScale px/meter, so divide the live pixel sizes by exScale
  // to get the equivalent font-size in viewBox units.
  const fsSeg = 11/exScale;
  const fsVert = 10/exScale;
  const fsNameBig = 14/exScale;
  const fsNameSmall = 10/exScale;
  function exToSvg(p){ return {x:(p.x-(minx-pad)), y:((maxy+pad)-p.y)}; }

  function exPathD(pts, curve){
    if(pts.length<2) return '';
    const s = pts.map(exToSvg);
    if(!curve || s.length<3){
      return 'M ' + s.map(p=>p.x.toFixed(2)+','+p.y.toFixed(2)).join(' L ');
    }
    let d = 'M ' + s[0].x.toFixed(2) + ',' + s[0].y.toFixed(2) + ' ';
    for(let i=0;i<s.length-1;i++){
      const p0 = s[Math.max(0,i-1)], p1 = s[i], p2 = s[i+1], p3 = s[Math.min(s.length-1,i+2)];
      const c1 = {x:p1.x+(p2.x-p0.x)/6, y:p1.y+(p2.y-p0.y)/6};
      const c2 = {x:p2.x-(p3.x-p1.x)/6, y:p2.y-(p3.y-p1.y)/6};
      d += 'C ' + c1.x.toFixed(2)+','+c1.y.toFixed(2)+' '+c2.x.toFixed(2)+','+c2.y.toFixed(2)+' '+p2.x.toFixed(2)+','+p2.y.toFixed(2)+' ';
    }
    return d;
  }

  let body = '';
  etat.objects.forEach(obj=>{
    if(obj.type==='polygon'){
      const pts = obj.pts.map(p=>{const s=exToSvg(p); return s.x.toFixed(2)+','+s.y.toFixed(2);}).join(' ');
      body += '<polygon points="'+pts+'" fill="'+obj.fill+'" fill-opacity="'+obj.fillOpacity+'" stroke="'+obj.stroke+'" stroke-width="0.15" data-objkey="'+escapeXml(obj.key)+'" data-locked="'+(!!obj.locked)+'" data-name="'+escapeXml(obj.name)+'" data-fonction="'+escapeXml(obj.fonction||'')+'" data-matiere="'+escapeXml(obj.matiere||'')+'" data-priority="'+(obj.priority||0)+'" data-points="'+escapeXml(obj.pts.map(p=>p.x.toFixed(4)+','+p.y.toFixed(4)).join(' '))+'" data-vertex-names="'+escapeXml(obj.vertexNames.join(NAME_SEP))+'" data-segment-names="'+escapeXml(obj.segmentNames.join(NAME_SEP))+'"/>\n';
      const n = obj.pts.length;
      for(let i=0;i<n;i++){
        const a=obj.pts[i], b=obj.pts[(i+1)%n];
        const pa=exToSvg(a), pb=exToSvg(b);
        let segTxt='';
        if(obj.showSegNames && obj.showDims) segTxt = obj.segmentNames[i]+' - '+dist(a,b).toFixed(2)+' m';
        else if(obj.showSegNames) segTxt = obj.segmentNames[i];
        else if(obj.showDims) segTxt = dist(a,b).toFixed(2)+' m';
        if(segTxt){
          const mx=(pa.x+pb.x)/2, my=(pa.y+pb.y)/2;
          body += '<text x="'+mx.toFixed(2)+'" y="'+(my-0.3).toFixed(2)+'" font-size="'+fsSeg+'" text-anchor="middle" font-family="Helvetica Neue, Arial, sans-serif" fill="#12210f">'+escapeXml(segTxt)+'</text>\n';
        }
        let exVertTxt = '';
        const exVName = obj.vertexNames[i]||'';
        if(obj.showVertNames && obj.showAngles) exVertTxt = exVName + ' - ' + interiorAngleDeg(obj,i).toFixed(1) + 'deg';
        else if(obj.showVertNames) exVertTxt = exVName;
        else if(obj.showAngles) exVertTxt = interiorAngleDeg(obj,i).toFixed(1) + 'deg';
        if(exVertTxt){
          body += '<text x="'+(pa.x+0.4).toFixed(2)+'" y="'+(pa.y-0.4).toFixed(2)+'" font-size="'+fsVert+'" font-family="Helvetica Neue, Arial, sans-serif" fill="#333">'+escapeXml(exVertTxt)+'</text>\n';
        }
      }
    } else if(obj.type==='path'){
      body += '<path d="'+exPathD(obj.pts, !!obj.curve)+'" fill="none" stroke="'+obj.stroke+'" stroke-width="'+(obj.width||1)+'" stroke-linecap="butt" stroke-linejoin="round" data-objkey="'+escapeXml(obj.key)+'" data-locked="'+(!!obj.locked)+'" data-name="'+escapeXml(obj.name)+'" data-fonction="'+escapeXml(obj.fonction||'')+'" data-matiere="'+escapeXml(obj.matiere||'')+'" data-priority="'+(obj.priority||0)+'" data-width="'+(obj.width||1)+'" data-curve="'+(!!obj.curve)+'" data-points="'+escapeXml(obj.pts.map(p=>p.x.toFixed(4)+','+p.y.toFixed(4)).join(' '))+'" data-vertex-names="'+escapeXml(obj.vertexNames.join(NAME_SEP))+'" data-segment-names="'+escapeXml(obj.segmentNames.join(NAME_SEP))+'"/>\n';
      for(let i=0;i<obj.pts.length-1;i++){
        const a=obj.pts[i], b=obj.pts[i+1];
        const pa=exToSvg(a), pb=exToSvg(b);
        let segTxt='';
        if(obj.showSegNames && obj.showDims) segTxt = (obj.segmentNames[i]||('Cote '+(i+1)))+' - '+dist(a,b).toFixed(2)+' m';
        else if(obj.showSegNames) segTxt = obj.segmentNames[i]||('Cote '+(i+1));
        else if(obj.showDims) segTxt = dist(a,b).toFixed(2)+' m';
        if(segTxt){
          const mx=(pa.x+pb.x)/2, my=(pa.y+pb.y)/2;
          body += '<text x="'+mx.toFixed(2)+'" y="'+(my-0.3).toFixed(2)+'" font-size="'+fsSeg+'" text-anchor="middle" font-family="Helvetica Neue, Arial, sans-serif" fill="#12210f">'+escapeXml(segTxt)+'</text>\n';
        }
      }
      if(obj.showVertNames){
        obj.pts.forEach((p,i)=>{
          const ps = exToSvg(p);
          body += '<text x="'+(ps.x+0.4).toFixed(2)+'" y="'+(ps.y-0.4).toFixed(2)+'" font-size="'+fsVert+'" font-family="Helvetica Neue, Arial, sans-serif" fill="#333">'+escapeXml(obj.vertexNames[i]||'')+'</text>\n';
        });
      }
    } else {
      const c = exToSvg(obj.center);
      body += '<circle cx="'+c.x.toFixed(2)+'" cy="'+c.y.toFixed(2)+'" r="'+obj.r.toFixed(2)+'" fill="'+obj.fill+'" fill-opacity="'+obj.fillOpacity+'" stroke="'+obj.stroke+'" stroke-width="0.08" data-objkey="'+escapeXml(obj.key)+'" data-locked="'+(!!obj.locked)+'" data-name="'+escapeXml(obj.name)+'" data-fonction="'+escapeXml(obj.fonction||'')+'" data-matiere="'+escapeXml(obj.matiere||'')+'" data-priority="'+(obj.priority||0)+'" data-center="'+obj.center.x.toFixed(4)+','+obj.center.y.toFixed(4)+'" data-radius="'+obj.r.toFixed(4)+'"/>\n';
    }
    if(obj.showName){
      const cen = (obj.type==='polygon' || obj.type==='path') ? centroid(obj.pts) : obj.center;
      const cs = exToSvg(cen);
      const fs = (obj.key==='parcelle'||obj.key==='maison') ? fsNameBig : fsNameSmall;
      body += '<text x="'+cs.x.toFixed(2)+'" y="'+cs.y.toFixed(2)+'" font-size="'+fs+'" font-weight="700" text-anchor="middle" font-family="Helvetica Neue, Arial, sans-serif" fill="'+obj.stroke+'">'+escapeXml(obj.name)+'</text>\n';
    }
  });

  // draw visible measures (matches the live plan) + embed a hidden JSON copy for exact re-import
  const pcObjForExport = etat.objects.find(o=>o.key==='parcelle');
  etat.measures.forEach(m=>{
    if(!m.show || !pcObjForExport) return;
    const g = computeMeasureGeom(m);
    if(!g) return;
    const anchor = measureOutsideAnchor(g.p, pcObjForExport.pts, 2, {x:g.B.x-g.A.x, y:g.B.y-g.A.y});
    const pPt = exToSvg(g.p), pAnchor = exToSvg(anchor);
    body += '<line x1="'+pPt.x.toFixed(2)+'" y1="'+pPt.y.toFixed(2)+'" x2="'+pAnchor.x.toFixed(2)+'" y2="'+pAnchor.y.toFixed(2)+'" stroke="#1E6B8C" stroke-width="0.05" stroke-dasharray="0.15 0.1"/>\n';
    const value = (m.displayMode==='along') ? g.along : g.perp;
    const prefix = (m.displayMode==='along') ? '-&gt; ' : 'T ';
    body += '<text x="'+pAnchor.x.toFixed(2)+'" y="'+pAnchor.y.toFixed(2)+'" text-anchor="middle" font-size="'+fsVert+'" font-family="Helvetica Neue, Arial, sans-serif" fill="#0F4C63">'+prefix+value.toFixed(2)+' m</text>\n';
  });
  if(etat.measures.length){
    const measuresJSON = JSON.stringify(etat.measures.map(m=>({
      refObjKey:m.refObjKey, refSegIndex:m.refSegIndex, startEnd:m.startEnd,
      targetObjKey:m.targetObjKey, targetPtIndex:m.targetPtIndex, show:m.show, displayMode:m.displayMode
    })));
    body += '<g id="measures-data" data-measures="'+escapeXml(measuresJSON)+'" style="display:none"></g>\n';
  }

  const meters = niceStep(2.5);
  const sbX0 = w-meters-3, sbY0 = h-1.5;
  body += '<line x1="'+sbX0+'" y1="'+sbY0+'" x2="'+(sbX0+meters).toFixed(2)+'" y2="'+sbY0+'" stroke="#3B2E1F" stroke-width="0.1"/>\n';
  body += '<text x="'+sbX0+'" y="'+(sbY0+1.1).toFixed(2)+'" font-size="0.6" text-anchor="middle" font-family="Helvetica Neue, Arial, sans-serif">0</text>\n';
  body += '<text x="'+(sbX0+meters).toFixed(2)+'" y="'+(sbY0+1.1).toFixed(2)+'" font-size="0.6" text-anchor="middle" font-family="Helvetica Neue, Arial, sans-serif">'+meters+' m</text>\n';

  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 '+w.toFixed(2)+' '+h.toFixed(2)+'" width="'+Math.round(w*exScale)+'" height="'+Math.round(h*exScale)+'" font-family="Helvetica Neue, Arial, sans-serif" data-plan-interactif="1" data-app-version="'+APP_VERSION+'" data-schema-version="'+SCHEMA_VERSION+'" data-minx="'+minx+'" data-pad="'+pad+'" data-maxy="'+maxy+'">\n'
    + '<rect width="'+w.toFixed(2)+'" height="'+h.toFixed(2)+'" fill="white"/>\n'
    + body
    + '</svg>';
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
  scene.scale = Math.max(6, Math.min(220, Math.min((etat.scene.W-60)/spanX, (etat.scene.H-60)/spanY)));
  scene.origine = { x: etat.scene.W/2 - midX*scene.scale, y: etat.scene.H/2 + midY*scene.scale };
})();

// Zoom & center the view on a given object (or the whole parcel if none)
function fitToObject(obj){
  let xs, ys;
  if(!obj){
    const parcelle = etat.objects.find(o=>o.key==='parcelle');
    if(!parcelle){
      if(!etat.objects.length) return;
      xs = []; ys = [];
      etat.objects.forEach(o=>{
        if(o.type==='circle'){ xs.push(o.center.x-o.r, o.center.x+o.r); ys.push(o.center.y-o.r, o.center.y+o.r); }
        else { o.pts.forEach(p=>{ xs.push(p.x); ys.push(p.y); }); }
      });
    } else {
      xs = parcelle.pts.map(p=>p.x); ys = parcelle.pts.map(p=>p.y);
    }
  } else if(obj.type==='circle'){
    xs = [obj.center.x-obj.r, obj.center.x+obj.r];
    ys = [obj.center.y-obj.r, obj.center.y+obj.r];
  } else {
    xs = obj.pts.map(p=>p.x); ys = obj.pts.map(p=>p.y);
  }
  const minX=Math.min(...xs), maxX=Math.max(...xs), minY=Math.min(...ys), maxY=Math.max(...ys);
  const midX=(minX+maxX)/2, midY=(minY+maxY)/2;
  const spanX=Math.max(0.5, maxX-minX), spanY=Math.max(0.5, maxY-minY);
  const pad = 80; // screen px of breathing room around the object
  scene.scale = Math.max(6, Math.min(400, Math.min((etat.scene.W-pad)/spanX, (etat.scene.H-pad)/spanY)));
  scene.origine = { x: etat.scene.W/2 - midX*scene.scale, y: etat.scene.H/2 + midY*scene.scale };
  render();
}


function buildExportDXF(){
  let ents = '';
  etat.objects.forEach(obj=>{
    if(obj.type==='polygon'){
      ents += '0\nLWPOLYLINE\n8\n' + escapeXml(obj.name).replace(/[^\w-]/g,'_') + '\n90\n' + obj.pts.length + '\n70\n1\n';
      obj.pts.forEach(p=>{
        ents += '10\n' + dxfNum(p.x) + '\n20\n' + dxfNum(p.y) + '\n';
      });
    } else if(obj.type==='path'){
      ents += '0\nLWPOLYLINE\n8\n' + escapeXml(obj.name).replace(/[^\w-]/g,'_') + '\n90\n' + obj.pts.length + '\n70\n0\n';
      obj.pts.forEach(p=>{
        ents += '10\n' + dxfNum(p.x) + '\n20\n' + dxfNum(p.y) + '\n';
      });
    } else {
      ents += '0\nCIRCLE\n8\n' + escapeXml(obj.name).replace(/[^\w-]/g,'_') + '\n10\n' + dxfNum(obj.center.x) + '\n20\n' + dxfNum(obj.center.y) + '\n40\n' + dxfNum(obj.r) + '\n';
    }
  });
  etat.measures.forEach(m=>{
    if(!m.show) return;
    const g = computeMeasureGeom(m);
    if(!g) return;
    ents += '0\nLINE\n8\nMESURES\n10\n' + dxfNum(g.foot.x) + '\n20\n' + dxfNum(g.foot.y) + '\n11\n' + dxfNum(g.p.x) + '\n21\n' + dxfNum(g.p.y) + '\n';
    ents += '0\nLINE\n8\nMESURES\n10\n' + dxfNum(g.A.x) + '\n20\n' + dxfNum(g.A.y) + '\n11\n' + dxfNum(g.foot.x) + '\n21\n' + dxfNum(g.foot.y) + '\n';
  });
  // 999 = commentaire DXF, admis avant toute section : le fichier arrive souvent seul chez un
  // bureau d'etudes, il doit dire quelle version l'a ecrit (RELEASE.md 5.2).
  return '999\n' + signatureExport().replace(/[\r\n]/g, ' ') + '\n'
    + '0\nSECTION\n2\nENTITIES\n' + ents + '0\nENDSEC\n0\nEOF\n';
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

function hexToRgb01(hex){
  hex = (hex||'#888888').replace('#','');
  if(hex.length===3) hex = hex.split('').map(c=>c+c).join('');
  const r = parseInt(hex.substr(0,2),16)/255 || 0;
  const g = parseInt(hex.substr(2,2),16)/255 || 0;
  const b = parseInt(hex.substr(4,2),16)/255 || 0;
  return [r,g,b];
}

function buildExportPDF(scaleDenom){
  scaleDenom = Math.max(1, scaleDenom || 200);
  const allPts = [];
  etat.objects.forEach(o=>{
    if(o.type==='polygon'||o.type==='path') o.pts.forEach(p=>allPts.push(p));
    else { allPts.push({x:o.center.x-o.r,y:o.center.y-o.r}); allPts.push({x:o.center.x+o.r,y:o.center.y+o.r}); }
  });
  // also account for visible measure labels, which are placed outside the parcel and
  // would otherwise fall outside the page's computed bounding box (invisible/clipped)
  const pcObjForBBox = etat.objects.find(o=>o.key==='parcelle');
  if(pcObjForBBox){
    etat.measures.forEach(m=>{
      if(!m.show) return;
      const g = computeMeasureGeom(m);
      if(!g) return;
      const anchor = measureOutsideAnchor(g.p, pcObjForBBox.pts, 2, {x:g.B.x-g.A.x, y:g.B.y-g.A.y});
      // pad a little extra so the label TEXT (not just its anchor point) stays on the page
      allPts.push({x:anchor.x+anchor.dirX*0.6, y:anchor.y+anchor.dirY*0.6});
      allPts.push({x:g.p.x, y:g.p.y});
    });
  }
  const xs=allPts.map(p=>p.x).filter(Number.isFinite), ys=allPts.map(p=>p.y).filter(Number.isFinite);
  if(!xs.length) throw new Error('Rien a exporter');
  const minx=Math.min(...xs), maxx=Math.max(...xs), miny=Math.min(...ys), maxy=Math.max(...ys);

  const ptsPerMeter = 2834.645 / scaleDenom; // 1 point = 1/72 inch ; 1 m = 2834.645 pt at 1:1
  const margin = 36, titleArea = 74;
  const drawW = Math.max(1,(maxx-minx))*ptsPerMeter;
  const drawH = Math.max(1,(maxy-miny))*ptsPerMeter;
  const pageW = drawW + margin*2;
  const pageH = drawH + margin*2 + titleArea;

  function toPdf(p){ return { x: margin + (p.x-minx)*ptsPerMeter, y: margin + (p.y-miny)*ptsPerMeter }; }
  function pdfPathD(pts, curve){
    // mirrors the live pathD(): straight segments, or Catmull-Rom -> cubic Bezier when curve is on
    const s = pts.map(toPdf);
    let cmds = [];
    if(!curve || s.length<3){
      s.forEach((p,i)=>{ cmds.push(p.x.toFixed(2)+' '+p.y.toFixed(2)+' '+(i===0?'m':'l')); });
      return cmds.join('\n')+'\n';
    }
    cmds.push(s[0].x.toFixed(2)+' '+s[0].y.toFixed(2)+' m');
    for(let i=0;i<s.length-1;i++){
      const p0=s[Math.max(0,i-1)], p1=s[i], p2=s[i+1], p3=s[Math.min(s.length-1,i+2)];
      const c1 = {x:p1.x+(p2.x-p0.x)/6, y:p1.y+(p2.y-p0.y)/6};
      const c2 = {x:p2.x-(p3.x-p1.x)/6, y:p2.y-(p3.y-p1.y)/6};
      cmds.push(c1.x.toFixed(2)+' '+c1.y.toFixed(2)+' '+c2.x.toFixed(2)+' '+c2.y.toFixed(2)+' '+p2.x.toFixed(2)+' '+p2.y.toFixed(2)+' c');
    }
    return cmds.join('\n')+'\n';
  }

  // register one ExtGState per distinct fill-opacity value, so translucent fills
  // (e.g. Terrasse at 0.68) let objects underneath show through, matching the live plan
  const opacityValues = [...new Set(etat.objects.map(o=>Math.round((o.fillOpacity!=null?o.fillOpacity:1)*100)/100))];
  if(!opacityValues.includes(1)) opacityValues.push(1);
  const gsName = v => 'GS'+Math.round(v*100);

  let content = '1 w\n';

  etat.objects.forEach(obj=>{
    if(obj.type==='polygon'){
      const [fr,fg,fb] = hexToRgb01(obj.fill);
      const [sr,sg,sb] = hexToRgb01(obj.stroke);
      content += '/'+gsName(obj.fillOpacity!=null?obj.fillOpacity:1)+' gs\n';
      content += fr.toFixed(3)+' '+fg.toFixed(3)+' '+fb.toFixed(3)+' rg\n';
      content += sr.toFixed(3)+' '+sg.toFixed(3)+' '+sb.toFixed(3)+' RG\n';
      obj.pts.forEach((p,i)=>{
        const pp = toPdf(p);
        content += pp.x.toFixed(2)+' '+pp.y.toFixed(2)+' '+(i===0?'m':'l')+'\n';
      });
      content += 'h B\n';
      content += '/'+gsName(1)+' gs\n';
      const n = obj.pts.length;
      for(let i=0;i<n;i++){
        const a=obj.pts[i], b=obj.pts[(i+1)%n];
        const pa=toPdf(a), pb=toPdf(b);
        let segTxt='';
        if(obj.showSegNames && obj.showDims) segTxt = obj.segmentNames[i]+' - '+dist(a,b).toFixed(2)+' m';
        else if(obj.showSegNames) segTxt = obj.segmentNames[i];
        else if(obj.showDims) segTxt = dist(a,b).toFixed(2)+' m';
        if(segTxt){
          const mx=(pa.x+pb.x)/2, my=(pa.y+pb.y)/2;
          content += 'BT /F1 7 Tf 0.07 0.13 0.06 rg '+mx.toFixed(2)+' '+my.toFixed(2)+' Td ('+pdfEscape(segTxt)+') Tj ET\n';
        }
        let vertTxt = '';
        const vName = obj.vertexNames[i]||'';
        if(obj.showVertNames && obj.showAngles) vertTxt = vName + ' - ' + interiorAngleDeg(obj,i).toFixed(1) + 'deg';
        else if(obj.showVertNames) vertTxt = vName;
        else if(obj.showAngles) vertTxt = interiorAngleDeg(obj,i).toFixed(1) + 'deg';
        if(vertTxt){
          content += 'BT /F1 6.5 Tf 0.2 0.2 0.2 rg '+(pa.x+3).toFixed(2)+' '+(pa.y+3).toFixed(2)+' Td ('+pdfEscape(vertTxt)+') Tj ET\n';
        }
      }
    } else if(obj.type==='path'){
      const [sr,sg,sb] = hexToRgb01(obj.stroke);
      content += sr.toFixed(3)+' '+sg.toFixed(3)+' '+sb.toFixed(3)+' RG\n';
      content += Math.max(0.5,(obj.width||1)*ptsPerMeter).toFixed(2)+' w\n';
      content += pdfPathD(obj.pts, !!obj.curve);
      content += 'S\n1 w\n';
      for(let i=0;i<obj.pts.length-1;i++){
        const a=obj.pts[i], b=obj.pts[i+1];
        const pa=toPdf(a), pb=toPdf(b);
        let segTxt='';
        if(obj.showSegNames && obj.showDims) segTxt = (obj.segmentNames[i]||('Cote '+(i+1)))+' - '+dist(a,b).toFixed(2)+' m';
        else if(obj.showSegNames) segTxt = obj.segmentNames[i]||('Cote '+(i+1));
        else if(obj.showDims) segTxt = dist(a,b).toFixed(2)+' m';
        if(segTxt){
          const mx=(pa.x+pb.x)/2, my=(pa.y+pb.y)/2;
          content += 'BT /F1 7 Tf 0.07 0.13 0.06 rg '+mx.toFixed(2)+' '+my.toFixed(2)+' Td ('+pdfEscape(segTxt)+') Tj ET\n';
        }
      }
      if(obj.showVertNames){
        obj.pts.forEach((p,i)=>{
          const pp = toPdf(p);
          content += 'BT /F1 6.5 Tf 0.2 0.2 0.2 rg '+(pp.x+3).toFixed(2)+' '+(pp.y+3).toFixed(2)+' Td ('+pdfEscape(obj.vertexNames[i]||'')+') Tj ET\n';
        });
      }
    } else {
      const [fr,fg,fb] = hexToRgb01(obj.fill);
      const [sr,sg,sb] = hexToRgb01(obj.stroke);
      content += '/'+gsName(obj.fillOpacity!=null?obj.fillOpacity:1)+' gs\n';
      content += fr.toFixed(3)+' '+fg.toFixed(3)+' '+fb.toFixed(3)+' rg\n';
      content += sr.toFixed(3)+' '+sg.toFixed(3)+' '+sb.toFixed(3)+' RG\n';
      content += '0.6 w\n';
      const c = toPdf(obj.center);
      const r = obj.r*ptsPerMeter, k = 0.5523;
      content += (c.x+r).toFixed(2)+' '+c.y.toFixed(2)+' m\n';
      [[c.x+r,c.y+r*k,c.x+r*k,c.y+r,c.x,c.y+r],
       [c.x-r*k,c.y+r,c.x-r,c.y+r*k,c.x-r,c.y],
       [c.x-r,c.y-r*k,c.x-r*k,c.y-r,c.x,c.y-r],
       [c.x+r*k,c.y-r,c.x+r,c.y-r*k,c.x+r,c.y]].forEach(a=>{
        content += a.map(v=>v.toFixed(2)).join(' ')+' c\n';
      });
      content += 'B\n1 w\n';
      content += '/'+gsName(1)+' gs\n';
    }
    if(obj.showName){
      const cen = (obj.type==='polygon'||obj.type==='path') ? centroid(obj.pts) : obj.center;
      const cp = toPdf(cen);
      const [sr,sg,sb] = hexToRgb01(obj.stroke);
      content += 'BT /F1 9 Tf '+sr.toFixed(3)+' '+sg.toFixed(3)+' '+sb.toFixed(3)+' rg '+cp.x.toFixed(2)+' '+cp.y.toFixed(2)+' Td ('+pdfEscape(obj.name)+') Tj ET\n';
    }
  });

  // measures (only those with "Afficher" checked, same rule as the live plan and the SVG export)
  const pcObjPdf = etat.objects.find(o=>o.key==='parcelle');
  etat.measures.forEach(m=>{
    if(!m.show || !pcObjPdf) return;
    const g = computeMeasureGeom(m);
    if(!g) return;
    const anchor = measureOutsideAnchor(g.p, pcObjPdf.pts, 2, {x:g.B.x-g.A.x, y:g.B.y-g.A.y});
    const pPt = toPdf(g.p), pAnchor = toPdf(anchor);
    content += '0.118 0.420 0.549 RG\n0.8 w [3 2] 0 d\n';
    content += pPt.x.toFixed(2)+' '+pPt.y.toFixed(2)+' m '+pAnchor.x.toFixed(2)+' '+pAnchor.y.toFixed(2)+' l S\n';
    content += '[] 0 d\n'; // reset dash pattern
    const value = (m.displayMode==='along') ? g.along : g.perp;
    const prefix = (m.displayMode==='along') ? '-> ' : 'T ';
    content += 'BT /F1 8 Tf 0.059 0.298 0.388 rg '+pAnchor.x.toFixed(2)+' '+pAnchor.y.toFixed(2)+' Td ('+prefix+value.toFixed(2)+' m) Tj ET\n';
  });

  // north arrow (fixed in the top-right corner of the drawing area), respects the same
  // "Afficher la fleche Nord" checkbox as the live plan and the SVG export
  if(etat.showNorth){
    const nx = margin+drawW-14, ny = margin+drawH-28;
    content += '0.23 0.18 0.12 RG 0.23 0.18 0.12 rg 1.4 w [] 0 d\n';
    content += nx.toFixed(2)+' '+(ny-4).toFixed(2)+' m '+nx.toFixed(2)+' '+(ny+16).toFixed(2)+' l S\n';
    content += (nx-5).toFixed(2)+' '+(ny+12).toFixed(2)+' m '+nx.toFixed(2)+' '+(ny+22).toFixed(2)+' l '+(nx+5).toFixed(2)+' '+(ny+12).toFixed(2)+' l h f\n';
    content += 'BT /F1 10 Tf '+(nx+4).toFixed(2)+' '+(ny+4).toFixed(2)+' Td (N) Tj ET\n';
  }

  // title block
  content += '0.23 0.18 0.12 rg\n';
  content += 'BT /F1 14 Tf '+margin.toFixed(2)+' '+(pageH-margin-16).toFixed(2)+' Td (Plan interactif - Parcelle AE 101) Tj ET\n';
  content += 'BT /F1 9 Tf '+margin.toFixed(2)+' '+(pageH-margin-34).toFixed(2)+' Td (Echelle 1/'+scaleDenom+' - genere le '+new Date().toLocaleDateString('fr-FR')+' - Plan interactif v'+APP_VERSION+') Tj ET\n';

  // scene.scale bar (nice round length, sized to look reasonable on paper regardless of scene.scale)
  const barMeters = niceStep(120/ptsPerMeter);
  const barPts = barMeters*ptsPerMeter;
  const sbX = margin, sbY = pageH-margin-58;
  content += '0.23 0.18 0.12 RG\n1.2 w\n';
  content += sbX.toFixed(2)+' '+sbY.toFixed(2)+' m '+(sbX+barPts).toFixed(2)+' '+sbY.toFixed(2)+' l S\n';
  content += 'BT /F1 8 Tf '+sbX.toFixed(2)+' '+(sbY-11).toFixed(2)+' Td (0) Tj ET\n';
  content += 'BT /F1 8 Tf '+(sbX+barPts-14).toFixed(2)+' '+(sbY-11).toFixed(2)+' Td ('+barMeters+' m) Tj ET\n';

  // ---- second page: surfaces summary table ----
  const pcObjSurf = etat.objects.find(o=>o.key==='parcelle');
  const sParcelleSurf = pcObjSurf ? shoelace(pcObjSurf.pts) : 0;
  const surfRows = etat.objects.map(o=>{
    let s;
    if(o.type==='polygon') s = shoelace(o.pts);
    else if(o.type==='circle') s = Math.PI*o.r*o.r;
    else { let L=0; for(let i=0;i<o.pts.length-1;i++) L+=dist(o.pts[i],o.pts[i+1]); s = L*(o.width||1); }
    return {name:o.name, key:o.key, s};
  });
  let totalHors = 0;
  surfRows.forEach(r=>{ if(r.key!=='parcelle') totalHors += r.s; });

  const rowH = 18, tblTop = 40, colName = margin, colSurf = margin+280, colPct = margin+400;
  const tblMargin = 36;
  const page2H = tblTop + margin + rowH*(surfRows.length+3) + 30;
  const page2W = pageW;

  let content2 = '';
  content2 += '0.23 0.18 0.12 rg\n';
  content2 += 'BT /F1 14 Tf '+tblMargin.toFixed(2)+' '+(page2H-tblMargin).toFixed(2)+' Td (Tableau des surfaces) Tj ET\n';
  let ry = page2H - tblMargin - 30;
  content2 += 'BT /F1 9 Tf '+colName.toFixed(2)+' '+ry.toFixed(2)+' Td (Objet) Tj ET\n';
  content2 += 'BT /F1 9 Tf '+colSurf.toFixed(2)+' '+ry.toFixed(2)+' Td (Surface) Tj ET\n';
  content2 += 'BT /F1 9 Tf '+colPct.toFixed(2)+' '+ry.toFixed(2)+' Td (% parcelle) Tj ET\n';
  content2 += '0.6 w 0.23 0.18 0.12 RG\n'+colName.toFixed(2)+' '+(ry-6).toFixed(2)+' m '+(page2W-tblMargin).toFixed(2)+' '+(ry-6).toFixed(2)+' l S\n';
  ry -= rowH;
  surfRows.forEach(r=>{
    const pct = (r.key!=='parcelle' && sParcelleSurf>0) ? (r.s/sParcelleSurf*100).toFixed(1)+' %' : '-';
    content2 += 'BT /F1 9 Tf 0.15 0.12 0.08 rg '+colName.toFixed(2)+' '+ry.toFixed(2)+' Td ('+pdfEscape(r.name)+') Tj ET\n';
    content2 += 'BT /F1 9 Tf '+colSurf.toFixed(2)+' '+ry.toFixed(2)+' Td ('+r.s.toFixed(2)+' m2) Tj ET\n';
    content2 += 'BT /F1 9 Tf '+colPct.toFixed(2)+' '+ry.toFixed(2)+' Td ('+pct+') Tj ET\n';
    ry -= rowH;
  });
  content2 += '0.6 w 0.23 0.18 0.12 RG\n'+colName.toFixed(2)+' '+(ry+8).toFixed(2)+' m '+(page2W-tblMargin).toFixed(2)+' '+(ry+8).toFixed(2)+' l S\n';
  ry -= 4;
  content2 += 'BT /F1 9 Tf 0.23 0.18 0.12 rg '+colName.toFixed(2)+' '+ry.toFixed(2)+' Td (Emprise totale hors parcelle) Tj ET\n';
  content2 += 'BT /F1 9 Tf '+colSurf.toFixed(2)+' '+ry.toFixed(2)+' Td ('+totalHors.toFixed(2)+' m2) Tj ET\n';
  if(sParcelleSurf>0){
    content2 += 'BT /F1 9 Tf '+colPct.toFixed(2)+' '+ry.toFixed(2)+' Td ('+(totalHors/sParcelleSurf*100).toFixed(1)+' %) Tj ET\n';
  }

  const objs = [];
  objs.push('<< /Type /Catalog /Pages 2 0 R >>');
  objs.push('<< /Type /Pages /Kids [3 0 R 6 0 R] /Count 2 >>');
  const gsStartNum = 8; // etat.objects 1..7 are Catalog/Pages/Page1/Content1/Font/Page2/Content2
  const extGStateDict = '<< ' + opacityValues.map((v,i)=>'/'+gsName(v)+' '+(gsStartNum+i)+' 0 R').join(' ') + ' >>';
  const resourcesDict = '<< /Font << /F1 5 0 R >> /ExtGState '+extGStateDict+' >>';
  objs.push('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 '+pageW.toFixed(2)+' '+pageH.toFixed(2)+'] /Resources '+resourcesDict+' /Contents 4 0 R >>');
  objs.push('<< /Length '+content.length+' >>\nstream\n'+content+'\nendstream');
  objs.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  objs.push('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 '+page2W.toFixed(2)+' '+page2H.toFixed(2)+'] /Resources '+resourcesDict+' /Contents 7 0 R >>');
  objs.push('<< /Length '+content2.length+' >>\nstream\n'+content2+'\nendstream');
  opacityValues.forEach(v=>{
    objs.push('<< /Type /ExtGState /ca '+v.toFixed(3)+' /CA '+v.toFixed(3)+' >>');
  });

  // Dictionnaire /Info : un PDF finit imprime chez un artisan, sans la page qui l'a produit. La
  // version doit voyager avec le fichier (RELEASE.md 5.2). Ajoute en dernier pour ne decaler
  // aucune des numerotations calculees plus haut. Chaines en ASCII pur : un PDF sans encodage
  // declare rend le reste illisible.
  const numInfo = objs.length + 1;
  objs.push('<< /Producer (Plan interactif ' + APP_VERSION + ') /Creator (plan.html build ' + BUILD_AT
    + ') /CreationDate (' + horodatagePdfInfo() + ') >>');
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objs.forEach((body,i)=>{
    offsets.push(pdf.length);
    pdf += (i+1)+' 0 obj\n'+body+'\nendobj\n';
  });
  const xrefOffset = pdf.length;
  pdf += 'xref\n0 '+(objs.length+1)+'\n0000000000 65535 f \n';
  for(let i=1;i<=objs.length;i++) pdf += String(offsets[i]).padStart(10,'0')+' 00000 n \n';
  pdf += 'trailer\n<< /Size '+(objs.length+1)+' /Root 1 0 R /Info '+numInfo+' 0 R >>\nstartxref\n'+xrefOffset+'\n%%EOF';
  return pdf;
}

// ================= Dossier PDF : plan de masse + une section par terrasse =================
// L'export PDF existant sort UNE vue du plan a l'echelle demandee. Ce dossier-ci est un autre
// document : format A4 fixe, une page de situation puis une page par terrasse retenue, avec ses
// cotes et le tableau des dimensions - de quoi discuter le projet ou le donner a un artisan.
// L'ecrivain PDF est le meme (fait main, pas de bibliotheque disponible), mais l'assemblage des
// objets est generique ici : buildExportPDF() numerote ses deux pages en dur.

// Emprise d'un objet, en metres : ce que le tableau des dimensions doit annoncer.
function dimensionsObjet(o){
  if(o.type === 'circle'){
    return { libelle: 'diametre ' + (o.r*2).toFixed(2).replace('.',',') + ' m',
             surface: Math.PI*o.r*o.r, largeur: o.r*2, longueur: o.r*2 };
  }
  const xs = o.pts.map(p=>p.x), ys = o.pts.map(p=>p.y);
  const l = Math.max(...xs)-Math.min(...xs), h = Math.max(...ys)-Math.min(...ys);
  if(o.type === 'path'){
    let L = 0;
    for(let i=0;i<o.pts.length-1;i++) L += dist(o.pts[i], o.pts[i+1]);
    return { libelle: 'longueur ' + L.toFixed(2).replace('.',',') + ' m x ' + (o.width||0.5).toFixed(2).replace('.',',') + ' m',
             surface: L*(o.width||0.5), largeur:o.width||0.5, longueur:L };
  }
  return { libelle: 'emprise ' + Math.max(l,h).toFixed(2).replace('.',',') + ' x ' + Math.min(l,h).toFixed(2).replace('.',',') + ' m',
           surface: shoelace(o.pts), largeur: Math.min(l,h), longueur: Math.max(l,h) };
}
// Equipements poses SUR une terrasse : centre a l'interieur du polygone. Les reperes (points de
// vue, limites cadastrales) et le terrain n'en sont pas. Le parasol non plus : sa toile n'est pas
// une emprise au sol, la coter sur un plan d'execution induirait en erreur.
// Angle interieur au sommet i, en degres.
function angleSommetDeg(pts, i){
  const n = pts.length;
  const a = pts[(i-1+n)%n], b = pts[i], c = pts[(i+1)%n];
  const u = {x:a.x-b.x, y:a.y-b.y}, v = {x:c.x-b.x, y:c.y-b.y};
  const nu = Math.hypot(u.x,u.y), nv = Math.hypot(v.x,v.y);
  if(nu < 1e-9 || nv < 1e-9) return null;
  return Math.acos(Math.max(-1, Math.min(1, (u.x*v.x + u.y*v.y)/(nu*nv))))*180/Math.PI;
}
// Largeur approchee d'un texte Helvetica, pour centrer une cote sur sa ligne. Le PDF n'expose pas
// les metriques de la police ici : 0,5 em par caractere est l'ordre de grandeur usuel.
function largeurTexte(txt, taille){ return String(txt).length * taille * 0.5; }

// Cotation d'un contour ferme : ligne de cote reportee a l'exterieur, lignes d'attache, valeur
// centree au-dessus de la ligne. La normale sortante se deduit du SENS DE PARCOURS du polygone
// (aire signee), pas d'une comparaison au centroide : sur une forme concave, le centroide peut
// tomber du mauvais cote d'un cote rentrant et la cote partait alors vers l'interieur, par-dessus
// le trait - exactement le defaut constate.
function cotationPolygone(pts, P, opts){
  const o = opts || {};
  const decalage = o.decalage || 17;
  const taille = o.taille || 7.5;
  const sens = aireSignee(pts) > 0 ? 1 : -1;   // +1 = sens trigonometrique
  let c = '';
  pts.forEach((a, i)=>{
    const b = pts[(i+1) % pts.length];
    const lon = dist(a,b);
    if(lon < (o.longueurMin || 0.05)) return;
    const dx = (b.x-a.x)/lon, dy = (b.y-a.y)/lon;
    const nx = sens * dy, ny = sens * -dx;     // normale sortante
    const pa = P(a), pb = P(b);
    const ex = nx*decalage, ey = ny*decalage;
    const la = {x:pa.x+ex, y:pa.y+ey}, lb = {x:pb.x+ex, y:pb.y+ey};
    c += '0.45 0.38 0.30 RG 0.5 w [] 0 d\n';
    c += pa.x.toFixed(2)+' '+pa.y.toFixed(2)+' m '+(pa.x+ex*1.14).toFixed(2)+' '+(pa.y+ey*1.14).toFixed(2)+' l S\n';
    c += pb.x.toFixed(2)+' '+pb.y.toFixed(2)+' m '+(pb.x+ex*1.14).toFixed(2)+' '+(pb.y+ey*1.14).toFixed(2)+' l S\n';
    c += '0.7 w\n' + la.x.toFixed(2)+' '+la.y.toFixed(2)+' m '+lb.x.toFixed(2)+' '+lb.y.toFixed(2)+' l S\n';
    const txt = lon.toFixed(2).replace('.',',') + ' m';
    let ang = Math.atan2(b.y-a.y, b.x-a.x)*180/Math.PI;
    let ux = (lb.x-la.x), uy = (lb.y-la.y);
    const nu = Math.hypot(ux,uy) || 1; ux/=nu; uy/=nu;
    if(ang > 90 || ang < -90){ ang += 180; ux = -ux; uy = -uy; }   // jamais de texte a l'envers
    const larg = largeurTexte(txt, taille);
    const mid = {x:(la.x+lb.x)/2, y:(la.y+lb.y)/2};
    // 5 pt au-dessus de la ligne de cote : la ligne de base du texte ne doit pas la toucher.
    c += pdfTexte(mid.x - ux*larg/2 + nx*5, mid.y - uy*larg/2 + ny*5, taille, txt, [0.23,0.18,0.12], ang);
  });
  return c;
}
function anglesPolygone(pts, P, opts){
  const o = opts || {};
  const taille = o.taille || 6.5;
  let c = '';
  pts.forEach((s, i)=>{
    const ang = angleSommetDeg(pts, i);
    if(ang === null) return;
    const n = pts.length;
    const a = pts[(i-1+n)%n], b = pts[(i+1)%n];
    const u = {x:a.x-s.x, y:a.y-s.y}, v = {x:b.x-s.x, y:b.y-s.y};
    const nu = Math.hypot(u.x,u.y) || 1, nv = Math.hypot(v.x,v.y) || 1;
    let bx = u.x/nu + v.x/nv, by = u.y/nu + v.y/nv;
    const nb = Math.hypot(bx,by);
    if(nb < 1e-6){ bx = -(v.y/nv); by = v.x/nv; } else { bx/=nb; by/=nb; }
    const q = P(s);
    const txt = Math.round(ang) + ' deg';
    c += pdfTexte(q.x + bx*15 - largeurTexte(txt, taille)/2, q.y + by*15 - 2, taille, txt, [0.35,0.30,0.24]);
  });
  return c;
}
function equipementsSurTerrasse(terrasse){
  return etat.objects.filter(o=>{
    if(o === terrasse || o.hidden) return false;
    if(FONCTIONS_HORS_EQUIPEMENT.indexOf(o.fonction) >= 0) return false;
    const c = o.type === 'circle' ? o.center : centroid(o.pts);
    return pointInPolygon(c, terrasse.pts);
  });
}

function pagePlanDeMasse(terrasses, equipementsParTerrasse, avecEquipements){
  const parcelle = trouverParcelleCloture();
  // Un plan de masse ne montre QUE la propriete : ni les parcelles voisines - seule la parcelle
  // principale est tracee -, ni le bati qui leur appartient. Trois marqueurs distinguent ce bati
  // secondaire, selon la facon dont il est entre dans le plan :
  //   - `voisinage` : import de voisinage depuis « Actualiser IGN » ;
  //   - `bdtopo.surParcellePrincipale === false` : import cadastre initial avec des voisines ;
  //   - a defaut, son centre tombe hors de la parcelle principale (batiment dessine a la main).
  const surPropriete = o => {
    if(o.voisinage) return false;
    if(o.bdtopo && o.bdtopo.surParcellePrincipale === false) return false;
    if(!parcelle) return true;
    return pointInPolygon(o.type === 'circle' ? o.center : centroid(o.pts), parcelle.pts);
  };
  const batiments = etat.objects.filter(o=>(o.fonction === 'batiment' || o.fonction === 'annexe') && !o.hidden && surPropriete(o));
  const aDessiner = [];
  if(parcelle) aDessiner.push(parcelle);
  batiments.forEach(b=>aDessiner.push(b));
  terrasses.forEach(t=>aDessiner.push(t));
  if(avecEquipements) terrasses.forEach(t=>equipementsParTerrasse.get(t.key).forEach(e=>aDessiner.push(e)));
  const pts = [];
  aDessiner.forEach(o=>{
    if(o.type === 'circle'){ pts.push({x:o.center.x-o.r,y:o.center.y-o.r}, {x:o.center.x+o.r,y:o.center.y+o.r}); }
    else o.pts.forEach(p=>pts.push(p));
  });
  if(!pts.length) throw new Error('rien a dessiner');
  const minx = Math.min(...pts.map(p=>p.x)), maxx = Math.max(...pts.map(p=>p.x));
  const miny = Math.min(...pts.map(p=>p.y)), maxy = Math.max(...pts.map(p=>p.y));
  const hautTitre = 96, basCartouche = 54;
  const dispoL = A4_L - MARGE_PDF*2, dispoH = A4_H - MARGE_PDF*2 - hautTitre - basCartouche;
  // Les cotes de la parcelle sont reportees a l'exterieur de son contour : la place qu'elles
  // prennent doit etre reservee avant de choisir l'echelle, sinon elles sortent de la feuille.
  const MARGE_COTATION_MASSE = 30;
  const denom = echelleQuiTient(maxx-minx, maxy-miny,
    Math.max(40, dispoL - MARGE_COTATION_MASSE*2), Math.max(40, dispoH - MARGE_COTATION_MASSE*2));
  const k = PT_PAR_METRE/denom;
  const decX = MARGE_PDF + (dispoL - (maxx-minx)*k)/2;
  const decY = MARGE_PDF + basCartouche + (dispoH - (maxy-miny)*k)/2;
  const P = p => ({ x: decX + (p.x-minx)*k, y: decY + (p.y-miny)*k });

  let c = '';
  aDessiner.forEach(o=>{
    const fond = hexToRgb01(o.fill), trait = hexToRgb01(o.stroke);
    if(o.type === 'circle'){
      const q = P(o.center);
      c += pdfCercle(q.x, q.y, o.r*k, fond, trait, 0.9);
    } else if(o.type === 'path'){
      c += pdfPolygone(o.pts.map(P), null, trait, Math.max(0.6, (o.width||0.5)*k), 1);
    } else {
      const estParcelle = (o === parcelle);
      c += pdfPolygone(o.pts.map(P), estParcelle ? null : fond, trait, estParcelle ? 1.4 : 0.8, estParcelle ? 1 : 0.9);
    }
  });
  // Dimensions des cotes de la parcelle : c'est la cotation attendue sur un plan de masse.
  if(parcelle) c += cotationPolygone(parcelle.pts, P, {decalage:20, taille:7.5});
  // Reperes de section : le lecteur doit pouvoir relier une terrasse du plan de masse a sa page.
  terrasses.forEach((t, i)=>{
    const q = P(centroid(t.pts));
    c += pdfCercle(q.x, q.y, 9, [1,1,1], [0.23,0.18,0.12], 1);
    c += pdfTexte(q.x-5, q.y-3, 9, 'S' + (i+1), [0.23,0.18,0.12]);
  });
  c += pdfFlecheNord(A4_L - MARGE_PDF - 20, A4_H - MARGE_PDF - hautTitre + 24);
  c += pdfEchelleGraphique(MARGE_PDF, MARGE_PDF + 26, k, denom);

  const nomProjet = (seed && seed.meta && seed.meta.name) || (parcelle && parcelle.name) || 'Plan';
  c += pdfTexte(MARGE_PDF, A4_H - MARGE_PDF - 14, 16, 'Plan de masse');
  c += pdfTexte(MARGE_PDF, A4_H - MARGE_PDF - 32, 10, nomProjet, [0.35,0.3,0.24]);
  const lieu = (parcelle && parcelle.nomLieu) ? parcelle.nomLieu : '';
  const cad = parcelle && parcelle.cadastre;
  const ligneCad = cad ? ('Parcelle ' + (cad.section||'') + ' ' + String(cad.numero||'').replace(/^0+/,'') + (lieu ? ' - ' + lieu : '')) : lieu;
  if(ligneCad) c += pdfTexte(MARGE_PDF, A4_H - MARGE_PDF - 46, 9, ligneCad, [0.35,0.3,0.24]);
  if(parcelle) c += pdfTexte(MARGE_PDF, A4_H - MARGE_PDF - 60, 9, 'Surface parcelle : ' + shoelace(parcelle.pts).toFixed(1).replace('.',',') + ' m2', [0.35,0.3,0.24]);
  c += pdfTexte(MARGE_PDF, A4_H - MARGE_PDF - 74, 9,
    terrasses.length + ' terrasse(s) au dossier : ' + terrasses.map((t,i)=>'S' + (i+1) + ' ' + t.name).join(', '), [0.35,0.3,0.24]);
  c += pdfTexte(MARGE_PDF, MARGE_PDF - 8, 7,
    'Genere le ' + new Date().toLocaleDateString('fr-FR') + ' - dimensions en metres, X+ = Est, Y+ = Nord - Plan interactif v' + APP_VERSION, [0.5,0.45,0.4]);
  return { l:A4_L, h:A4_H, contenu:c };
}

function pageTerrasse(terrasse, equipements, indice, total){
  const pts = terrasse.pts.slice();
  equipements.forEach(o=>{
    if(o.type === 'circle'){ pts.push({x:o.center.x-o.r,y:o.center.y-o.r}, {x:o.center.x+o.r,y:o.center.y+o.r}); }
    else o.pts.forEach(p=>pts.push(p));
  });
  const minx = Math.min(...pts.map(p=>p.x)), maxx = Math.max(...pts.map(p=>p.x));
  const miny = Math.min(...pts.map(p=>p.y)), maxy = Math.max(...pts.map(p=>p.y));
  // Le tableau prend le bas de page ; le dessin occupe le reste, cote et donc un peu au large.
  const lignes = terrasse.pts.length + equipements.length + 6;
  const hautTableau = Math.min(300, 34 + lignes*14);
  const hautTitre = 66;
  const dispoL = A4_L - MARGE_PDF*2 - 40, dispoH = A4_H - MARGE_PDF*2 - hautTitre - hautTableau - 20;
  // La cotation est reportee a l'exterieur du contour (ligne de cote + texte) : elle deborde du
  // polygone d'environ 25 pt de chaque cote. Si l'echelle est choisie sur le seul polygone, ce
  // debord sort de la feuille sur une forme qui remplit deja la zone de dessin.
  const MARGE_COTATION = 26;
  const denom = echelleQuiTient(maxx-minx, maxy-miny,
    Math.max(40, dispoL - MARGE_COTATION*2), Math.max(40, dispoH - MARGE_COTATION*2));
  const k = PT_PAR_METRE/denom;
  const decX = MARGE_PDF + 20 + (dispoL - (maxx-minx)*k)/2;
  const decY = MARGE_PDF + hautTableau + 20 + (dispoH - (maxy-miny)*k)/2;
  const P = p => ({ x: decX + (p.x-minx)*k, y: decY + (p.y-miny)*k });

  let c = '';
  c += pdfPolygone(terrasse.pts.map(P), hexToRgb01(terrasse.fill), hexToRgb01(terrasse.stroke), 1.2, 0.9);
  equipements.forEach(o=>{
    const fond = hexToRgb01(o.fill), trait = hexToRgb01(o.stroke);
    if(o.type === 'circle'){ const q = P(o.center); c += pdfCercle(q.x, q.y, o.r*k, fond, trait, 0.75); }
    else if(o.type === 'path') c += pdfPolygone(o.pts.map(P), null, trait, Math.max(0.6,(o.width||0.5)*k), 1);
    else c += pdfPolygone(o.pts.map(P), fond, trait, 0.8, 0.75);
  });
  // Cotation : la ligne de cote est REPORTEE a l'exterieur du contour, decalee d'une distance
  // fixe en points (donc constante sur le papier quelle que soit l'echelle), avec ses lignes
  // d'attache. Une cote posee sur le segment lui-meme se confond avec le trait de la terrasse et
  // devient illisible des que la forme se complique.
  c += cotationPolygone(terrasse.pts, P, {decalage:18, taille:7.5});
  c += anglesPolygone(terrasse.pts, P, {taille:6.5});
  equipements.forEach(o=>{
    const q = P(o.type === 'circle' ? o.center : centroid(o.pts));
    c += pdfTexte(q.x - 14, q.y - 3, 7, o.name, [0.15,0.12,0.08]);
  });
  // Fleche et echelle calees sur la PAGE, pas sur la zone de dessin recentree : avec un petit
  // objet, le decalage de centrage poussait la fleche au-dela du bord de la feuille.
  c += pdfFlecheNord(A4_L - MARGE_PDF - 20, A4_H - MARGE_PDF - hautTitre - 28);
  // Echelle a droite et bien au-dessus du tableau : posee juste au-dessus de lui, sa mention
  // « Echelle 1/x » venait se superposer au titre « Dimensions ».
  c += pdfEchelleGraphique(A4_L - MARGE_PDF - 150, MARGE_PDF + hautTableau + 34, k, denom);

  c += pdfTexte(MARGE_PDF, A4_H - MARGE_PDF - 14, 15, 'Section ' + indice + ' / ' + total + ' - ' + terrasse.name);
  const cons = terrasse.construction;
  const sousTitre = 'Surface ' + shoelace(terrasse.pts).toFixed(2).replace('.',',') + ' m2' +
    ' - perimetre ' + terrasse.pts.reduce((s,p,i)=>s + dist(p, terrasse.pts[(i+1)%terrasse.pts.length]), 0).toFixed(2).replace('.',',') + ' m' +
    (cons && cons.essenceBois ? ' - ' + cons.essenceBois : '');
  c += pdfTexte(MARGE_PDF, A4_H - MARGE_PDF - 30, 9, sousTitre, [0.35,0.3,0.24]);

  // ---- tableau des dimensions ----
  let y = MARGE_PDF + hautTableau - 6;
  const colA = MARGE_PDF, colB = MARGE_PDF + 210, colC = MARGE_PDF + 350, colD = MARGE_PDF + 440;
  c += pdfTexte(colA, y, 10, 'Dimensions');
  y -= 15;
  c += '0.23 0.18 0.12 RG 0.7 w\n' + colA.toFixed(2)+' '+(y+9).toFixed(2)+' m '+(A4_L-MARGE_PDF).toFixed(2)+' '+(y+9).toFixed(2)+' l S\n';
  c += pdfTexte(colA, y, 8, 'Element', [0.4,0.35,0.3]) + pdfTexte(colB, y, 8, 'Cote / emprise', [0.4,0.35,0.3]) +
       pdfTexte(colC, y, 8, 'Surface', [0.4,0.35,0.3]) + pdfTexte(colD, y, 8, 'Angle au depart', [0.4,0.35,0.3]);
  y -= 13;
  terrasse.pts.forEach((a, i)=>{
    const b = terrasse.pts[(i+1) % terrasse.pts.length];
    const nom = (terrasse.segmentNames && terrasse.segmentNames[i]) || ('Cote ' + (i+1));
    const ang = angleSommetDeg(terrasse.pts, i);
    // L'angle porte sur le sommet ou le cote commence : c'est ce qu'on trace en premier sur place.
    c += pdfTexte(colA, y, 8, nom) + pdfTexte(colB, y, 8, dist(a,b).toFixed(2).replace('.',',') + ' m') +
         pdfTexte(colD, y, 8, ang === null ? '-' : (Math.round(ang) + ' deg'));
    y -= 12;
  });
  let perimetre = 0;
  terrasse.pts.forEach((a,i)=>{ perimetre += dist(a, terrasse.pts[(i+1)%terrasse.pts.length]); });
  c += '0.7 0.65 0.58 RG 0.5 w\n' + colA.toFixed(2)+' '+(y+9).toFixed(2)+' m '+(A4_L-MARGE_PDF).toFixed(2)+' '+(y+9).toFixed(2)+' l S\n';
  c += pdfTexte(colA, y, 8, 'Terrasse ' + terrasse.name) +
       pdfTexte(colB, y, 8, 'perimetre ' + perimetre.toFixed(2).replace('.',',') + ' m') +
       pdfTexte(colC, y, 8, shoelace(terrasse.pts).toFixed(2).replace('.',',') + ' m2') +
       pdfTexte(colD, y, 8, terrasse.pts.length + ' sommets');
  y -= 14;
  if(equipements.length){
    c += '0.7 0.65 0.58 RG 0.5 w\n' + colA.toFixed(2)+' '+(y+9).toFixed(2)+' m '+(A4_L-MARGE_PDF).toFixed(2)+' '+(y+9).toFixed(2)+' l S\n';
    equipements.forEach(o=>{
      const d = dimensionsObjet(o);
      c += pdfTexte(colA, y, 8, o.name) + pdfTexte(colB, y, 8, d.libelle) +
           pdfTexte(colC, y, 8, d.surface.toFixed(2).replace('.',',') + ' m2');
      y -= 12;
    });
    const empriseEquip = equipements.reduce((s,o)=>s + dimensionsObjet(o).surface, 0);
    const surfT = shoelace(terrasse.pts);
    c += pdfTexte(colA, y, 8, 'Emprise equipements', [0.35,0.3,0.24]) +
         pdfTexte(colC, y, 8, empriseEquip.toFixed(2).replace('.',',') + ' m2', [0.35,0.3,0.24]) +
         pdfTexte(colD, y, 8, surfT > 0 ? (empriseEquip/surfT*100).toFixed(0) + ' %' : '-', [0.35,0.3,0.24]);
  }
  // Meme pied de page que le plan de masse : une section imprimee seule doit rester rattachable
  // a la version qui l'a produite (RELEASE.md 5.2).
  c += pdfTexte(MARGE_PDF, MARGE_PDF - 8, 7,
    'Genere le ' + new Date().toLocaleDateString('fr-FR') + ' - dimensions en metres - Plan interactif v' + APP_VERSION, [0.5,0.45,0.4]);
  return { l:A4_L, h:A4_H, contenu:c };
}

// Liste des terrasses a inclure, reconstruite a chaque ouverture de l'onglet Export : une
// terrasse ajoutee ou renommee entre-temps doit apparaitre, et les cases deja cochees rester
// cochees.
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
    const equip = equipementsSurTerrasse(t);
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
    res = buildDossierPDF(cles, document.getElementById('chkDossierEquipements').checked);
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

function buildDossierPDF(cles, avecEquipements){
  const terrasses = etat.objects.filter(o=>o.fonction === 'terrasse' && o.type === 'polygon' && cles.indexOf(o.key) >= 0);
  if(!terrasses.length) throw new Error('aucune terrasse selectionnee');
  const equipements = new Map();
  terrasses.forEach(t=>equipements.set(t.key, avecEquipements ? equipementsSurTerrasse(t) : []));
  const pages = [ pagePlanDeMasse(terrasses, equipements, avecEquipements) ];
  terrasses.forEach((t, i)=>pages.push(pageTerrasse(t, equipements.get(t.key), i+1, terrasses.length)));
  return { pdf: assemblerPDF(pages), pages: pages.length, terrasses, equipements };
}

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
  scene.traverse(o=>{
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
        const dejaActive = threeScene && dernierObj3dKey===terr.key;
        if(!dejaActive) buildThreeScene(terr);
        attendreTexturesPretes(threeScene.scene, 15000).then(()=>{
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
            exporter.parse(threeScene.scene, (result)=>{
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
let alignTargetSeg = null; // {objKey, segIndex} - reference segment for the rotation-alignment tool
let alignDistanceValue = ''; // remembers the typed distance across re-renders; blank = no translation

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
function rayPolygonExitDistance(center, dir, poly){
  let maxT = 0;
  const n = poly.length;
  for(let i=0;i<n;i++){
    const a=poly[i], b=poly[(i+1)%n];
    const ex=b.x-a.x, ey=b.y-a.y;
    const det = ex*dir.y - ey*dir.x;
    if(Math.abs(det) < 1e-9) continue;
    const acx = a.x-center.x, acy = a.y-center.y;
    const t = (ex*acy - ey*acx) / det;
    const s = (dir.x*acy - dir.y*acx) / det;
    if(t>=0 && s>=0 && s<=1 && t>maxT) maxT = t;
  }
  return maxT;
}

// Anchor point for a measure's witness line / label. The line is ALWAYS perpendicular
// to the reference segment (90°) and ALWAYS points toward the OUTSIDE of the parcel
// polygon, starting at the measured point and continuing until it clears the polygon by
// at least `clearance` meters. `segDir` is the reference segment's direction vector.
function measureOutsideAnchor(point, poly, clearance, segDir){
  // the two perpendiculars to the reference segment
  const sl = Math.hypot(segDir.x, segDir.y) || 1;
  const nx = -segDir.y/sl, ny = segDir.x/sl;
  const c = centroid(poly);
  // pick the perpendicular that heads away from the parcel centroid (i.e. outward)
  const outward = ((point.x-c.x)*nx + (point.y-c.y)*ny) >= 0;
  const dirX = outward ? nx : -nx;
  const dirY = outward ? ny : -ny;
  const exitDist = rayPolygonExitDistance(point, {x:dirX,y:dirY}, poly);
  const baseDist = Math.max(exitDist, 0);
  return {x:point.x+dirX*(baseDist+clearance), y:point.y+dirY*(baseDist+clearance), dirX, dirY};
}

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
  if(!alignTargetSeg) return;
  if(obj.locked){ showToast('Objet verrouille.'); return; }
  // Une parcelle issue du cadastre porte l'orientation reelle du terrain : la faire tourner
  // decale le nord du plan, donc l'ombre du parasol et la Vue 3D, sans que rien ne le signale.
  if(obj.cadastre) showToast('Attention : cette parcelle vient du cadastre. La faire tourner desaligne le plan du nord reel (ombres, Vue 3D).');
  const target = measureSegCoords(alignTargetSeg);
  if(!target) return;
  const idx = nearestSegmentIndex(obj, target);
  if(idx<0) return;
  const n = obj.pts.length;
  const a = obj.pts[idx], b = obj.pts[(idx+1)%n];
  const curAngle = angleOfSegment(a,b);
  const targetAngle = angleOfSegment(target.a, target.b);
  let diff = Math.atan2(Math.sin(targetAngle-curAngle), Math.cos(targetAngle-curAngle));
  if(diff > Math.PI/2) diff -= Math.PI;
  else if(diff < -Math.PI/2) diff += Math.PI;

  // pivot = midpoint of the nearest (closest-matching) side: that side moves the least,
  // the rest of the object rotates around it
  const pivot = {x:(a.x+b.x)/2, y:(a.y+b.y)/2};
  const cosA=Math.cos(diff), sinA=Math.sin(diff);
  let newPts = obj.pts.map(p=>{
    const dx=p.x-pivot.x, dy=p.y-pivot.y;
    return {x:pivot.x+dx*cosA-dy*sinA, y:pivot.y+dx*sinA+dy*cosA};
  });

  // optional: also set the perpendicular distance between the aligned side and the
  // target segment's line. Left blank = no translation, only the rotation is applied.
  const distInput = document.getElementById('alignDistanceInput');
  const distRaw = distInput ? distInput.value.trim() : '';
  if(distRaw !== ''){
    const desired = parseFloat(distRaw);
    if(!isNaN(desired) && desired>=0){
      const ux=target.b.x-target.a.x, uy=target.b.y-target.a.y;
      const L=Math.hypot(ux,uy)||1e-9;
      const nx=-uy/L, ny=ux/L; // unit normal to the target line
      const dx=pivot.x-target.a.x, dy=pivot.y-target.a.y;
      const curSigned = dx*nx+dy*ny; // current signed distance of the pivot from the target line
      const sign = curSigned>=0 ? 1 : -1; // keep the object on the same side it's already on
      const delta = sign*desired - curSigned;
      newPts = newPts.map(p=>({x:p.x+nx*delta, y:p.y+ny*delta}));
    }
  }

  const bound = (obj.constrained && etat.objects.find(o=>o.key==='parcelle')) ? etat.objects.find(o=>o.key==='parcelle').pts : null;
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

function drawMeasures(){
  measureGroup.innerHTML = '';
  const pc = etat.objects.find(o=>o.key==='parcelle');

  // draft (in-progress) picks: highlight ref segment and picked targets
  if(draftRef){
    const seg = measureSegCoords(draftRef);
    if(seg){
      const pa=toScreen(seg.a), pb=toScreen(seg.b);
      const l = document.createElementNS(svgNS,'line');
      l.setAttribute('x1',pa.x); l.setAttribute('y1',pa.y); l.setAttribute('x2',pb.x); l.setAttribute('y2',pb.y);
      l.setAttribute('stroke',SVG_MEASURE_LINE); l.setAttribute('stroke-width','4'); l.setAttribute('stroke-opacity','0.55');
      measureGroup.appendChild(l);
    }
  }
  draftTargets.forEach(t=>{
    const p = measurePointCoord(t);
    if(!p) return;
    const ps = toScreen(p);
    const c = document.createElementNS(svgNS,'circle');
    c.setAttribute('cx',ps.x); c.setAttribute('cy',ps.y); c.setAttribute('r','9');
    c.setAttribute('fill','none'); c.setAttribute('stroke',SVG_MEASURE_LINE); c.setAttribute('stroke-width','2.5');
    measureGroup.appendChild(c);
  });

  etat.measures.forEach(m=>{
    if(!m.show || !pc) return;
    const g = computeMeasureGeom(m);
    if(!g) return;
    const anchor = measureOutsideAnchor(g.p, pc.pts, 2, {x:g.B.x-g.A.x, y:g.B.y-g.A.y});
    const pPt = toScreen(g.p), pAnchor = toScreen(anchor);

    // witness line starts at the measured point and heads toward the reference segment
    // (perpendicular to it), continuing just past it until clear of the parcel by 2m
    const l1 = document.createElementNS(svgNS,'line');
    l1.setAttribute('x1',pPt.x); l1.setAttribute('y1',pPt.y);
    l1.setAttribute('x2',pAnchor.x); l1.setAttribute('y2',pAnchor.y);
    l1.setAttribute('stroke',SVG_MEASURE_LINE); l1.setAttribute('stroke-width','1.4'); l1.setAttribute('stroke-dasharray','4 2.5');
    measureGroup.appendChild(l1);

    [pPt, pAnchor].forEach(p=>{
      const tick = document.createElementNS(svgNS,'circle');
      tick.setAttribute('cx',p.x); tick.setAttribute('cy',p.y); tick.setAttribute('r','2');
      tick.setAttribute('fill',SVG_MEASURE_LINE);
      measureGroup.appendChild(tick);
    });

    const value = (m.displayMode==='along') ? g.along : g.perp;
    const prefix = (m.displayMode==='along') ? '→ ' : '⊥ ';
    const t = document.createElementNS(svgNS,'text');
    t.setAttribute('x',pAnchor.x); t.setAttribute('y',pAnchor.y);
    t.setAttribute('text-anchor','middle');
    t.setAttribute('font-family','Helvetica Neue, Arial, sans-serif'); t.setAttribute('font-size','11');
    t.setAttribute('fill',SVG_MEASURE_TEXT); t.setAttribute('font-weight','700');
    t.setAttribute('paint-order','stroke'); t.setAttribute('stroke',SVG_LABEL_HALO); t.setAttribute('stroke-width','4');
    t.textContent = prefix + value.toFixed(2)+' m';
    measureGroup.appendChild(t);
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

// ================= Import cadastre : adresse -> parcelle (+ voisines) =================
// Geocodage : Base Adresse Nationale. Geometrie : API Carto Cadastre (PCI), en WGS84.
// Deux pieges verifies sur le terrain expliquent la forme de ce code :
//   1. le point d'adresse de la BAN est DEVANT LA PORTE, donc sur la voirie - qui n'est pas
//      cadastree. L'interroger tel quel renvoie zero parcelle (et, sur une adresse d'angle,
//      parfois celle d'en face). On cherche donc toujours sur une EMPRISE autour du point ;
//      le point ne sert plus qu'a classer les candidates.
//   2. API Carto IGNORE les parametres qu'il ne connait pas (?lon=&lat= n'existe pas) au lieu
//      de renvoyer une erreur : la requete degenere en vidage national, en 200 OK, a l'autre
//      bout de la France. D'ou les garde-fous de interrogerCadastre().
const BAN_URL = 'https://api-adresse.data.gouv.fr/search/';
const CADASTRE_URL = 'https://apicarto.ign.fr/api/cadastre/parcelle';
const RESEAU_TIMEOUT_MS = 8000;
const RAYONS_RECHERCHE_M = [12, 25, 50];
const ADJACENCE_TOL_M = 0.5;   // deux parcelles mitoyennes partagent leur limite au cm pres
const ECART_AUTO_M = 3;        // en dessous, on ne tranche pas a la place de l'utilisateur
const SIMPLIF_M = 0.02;
const MAX_VOISINES = 20;

function fetchJSONTimeout(url){
  const controller = new AbortController();
  const timer = setTimeout(()=>controller.abort(), RESEAU_TIMEOUT_MS);
  return fetch(url, {signal:controller.signal, cache:'no-store'})
    .then(r=>{
      if(!r.ok) throw Object.assign(new Error('Le service a repondu HTTP ' + r.status + '.'), {statut:r.status});
      return r.json();
    })
    .finally(()=>clearTimeout(timer));
}
// Une seule reprise, et seulement sur ce qui peut passer tout seul (reseau coupe, 5xx) :
// rejouer une erreur de validation ne ferait que la repeter.
async function fetchJSONReseau(url){
  try {
    return await fetchJSONTimeout(url);
  } catch(e){
    if(e && e.name === 'AbortError') throw new Error('Le service ne repond pas (8 s). Reessaie.');
    if(e && e.statut && e.statut < 500) throw e;
    try {
      return await fetchJSONTimeout(url);
    } catch(e2){
      if(e2 && e2.name === 'AbortError') throw new Error('Le service ne repond pas (8 s). Reessaie.');
      if(e2 instanceof TypeError && location.protocol === 'file:'){
        throw new Error('Import cadastre indisponible quand la page est ouverte en fichier local : sers-la par un serveur web.');
      }
      throw e2;
    }
  }
}


function aireSignee(pts){
  let s = 0;
  for(let i=0;i<pts.length;i++){
    const a = pts[i], b = pts[(i+1)%pts.length];
    s += a.x*b.y - b.x*a.y;
  }
  return s/2;
}
function distancePointContour(p, pts){
  let d = Infinity;
  for(let i=0;i<pts.length;i++) d = Math.min(d, distancePointSegment(p, pts[i], pts[(i+1)%pts.length]));
  return d;
}
function distanceContours(A, B){
  let d = Infinity;
  for(let i=0;i<A.length;i++) d = Math.min(d, distancePointContour(A[i], B));
  for(let i=0;i<B.length;i++) d = Math.min(d, distancePointContour(B[i], A));
  return d;
}
// Longueur de limite commune, par echantillonnage des cotes : c'est un critere de CLASSEMENT
// des voisines, pas une mesure publiee - inutile d'y mettre une vraie intersection de segments.
function longueurFrontiere(A, B, tol){
  let total = 0;
  for(let i=0;i<A.length;i++){
    const a = A[i], b = A[(i+1)%A.length];
    const len = Math.hypot(b.x-a.x, b.y-a.y);
    if(len < 1e-6) continue;
    const n = Math.max(2, Math.min(60, Math.ceil(len/0.5)));
    let touchants = 0;
    for(let k=0;k<=n;k++){
      const t = k/n;
      if(distancePointContour({x:a.x+(b.x-a.x)*t, y:a.y+(b.y-a.y)*t}, B) < tol) touchants++;
    }
    total += len * touchants/(n+1);
  }
  return total;
}

// API Carto renvoie un MultiPolygon meme pour une parcelle simple : l'anneau exterieur est en
// coordinates[0][0], pas en coordinates[0]. Un code ecrit pour le seul cas Polygon se trompe
// d'un niveau de profondeur et lit des tableaux la ou il attend des nombres.
function anneauExterieur(geometry){
  if(!geometry) return null;
  const polys = geometry.type === 'MultiPolygon' ? geometry.coordinates
              : geometry.type === 'Polygon' ? [geometry.coordinates] : null;
  if(!polys || !polys.length) return null;
  let meilleur = null, aireMax = -1;
  polys.forEach(poly=>{
    const anneau = poly && poly[0];
    if(!Array.isArray(anneau) || anneau.length < 4) return;
    let s = 0;
    for(let i=0;i<anneau.length;i++){
      const p1 = anneau[i], p2 = anneau[(i+1)%anneau.length];
      s += p1[0]*p2[1] - p2[0]*p1[1];
    }
    const a = Math.abs(s/2);
    if(a > aireMax){ aireMax = a; meilleur = anneau; }
  });
  return meilleur;
}
function anneauVersPts(anneau, proj, simplifier){
  let pts = anneau.map(c=>proj.versMetres(c[0], c[1]));
  // GeoJSON ferme l'anneau ; l'appli, elle, garde des pts implicitement fermes.
  if(pts.length > 1 && Math.hypot(pts[0].x-pts[pts.length-1].x, pts[0].y-pts[pts.length-1].y) < 1e-6) pts.pop();
  const nets = [];
  pts.forEach(p=>{
    if(!nets.length || Math.hypot(p.x-nets[nets.length-1].x, p.y-nets[nets.length-1].y) > 0.01) nets.push(p);
  });
  pts = simplifier ? simplifierContour(nets, SIMPLIF_M) : nets;
  // Sens horaire, comme les parcelles des projets existants (l'aire, elle, est en valeur absolue).
  if(aireSignee(pts) > 0) pts.reverse();
  return pts.map(p=>({ x:Math.round(p.x*1000)/1000, y:Math.round(p.y*1000)/1000 }));
}

async function geocoderBAN(texte, autocomplete){
  const url = BAN_URL + '?q=' + encodeURIComponent(texte) + '&limit=5' + (autocomplete ? '&autocomplete=1' : '');
  const data = await fetchJSONReseau(url);
  return ((data && data.features) || []).map(f=>({
    label: (f.properties && f.properties.label) || '',
    score: (f.properties && f.properties.score) || 0,
    genre: (f.properties && f.properties.type) || '',
    citycode: (f.properties && f.properties.citycode) || '',
    ville: (f.properties && f.properties.city) || '',
    lon: f.geometry.coordinates[0],
    lat: f.geometry.coordinates[1]
  }));
}
function empriseGeoJSON(lon, lat, proj, rayonM){
  const dLon = rayonM/proj.kx, dLat = rayonM/proj.ky;
  return { type:'Polygon', coordinates:[[
    [lon-dLon, lat-dLat], [lon+dLon, lat-dLat], [lon+dLon, lat+dLat], [lon-dLon, lat+dLat], [lon-dLon, lat-dLat]
  ]]};
}
// Emprise autour d'une PARCELLE, pas autour du point d'adresse : une parcelle fait couramment
// 30 a 40 m de long, donc la boite de recherche initiale (centree sur l'adresse, en bordure de
// voirie) ne voit jamais les mitoyennes du fond de terrain. Sur la parcelle de test, la boite
// d'adresse ramenait 5 parcelles la ou celle de la parcelle en ramene 13.
function empriseAutourAnneau(anneau, proj, margeM){
  let lonMin = Infinity, lonMax = -Infinity, latMin = Infinity, latMax = -Infinity;
  anneau.forEach(c=>{
    lonMin = Math.min(lonMin, c[0]); lonMax = Math.max(lonMax, c[0]);
    latMin = Math.min(latMin, c[1]); latMax = Math.max(latMax, c[1]);
  });
  const dLon = margeM/proj.kx, dLat = margeM/proj.ky;
  return { type:'Polygon', coordinates:[[
    [lonMin-dLon, latMin-dLat], [lonMax+dLon, latMin-dLat], [lonMax+dLon, latMax+dLat],
    [lonMin-dLon, latMax+dLat], [lonMin-dLon, latMin-dLat]
  ]]};
}
async function interrogerCadastre(geom, codeInsee){
  let url = CADASTRE_URL + '?geom=' + encodeURIComponent(JSON.stringify(geom)) + '&_limit=60';
  if(codeInsee) url += '&code_insee=' + encodeURIComponent(codeInsee);
  const data = await fetchJSONReseau(url);
  const features = (data && data.features) || [];
  // Garde-fou du piege n°2 : une reponse qui ne ressemble pas a un voisinage n'est pas affichee
  // du tout, plutot que d'etre prise pour un resultat. _limit plafonne deja le nombre, donc
  // c'est la commune qui trahit un filtre ignore (le vidage national commence dans le 13).
  if(features.length > 200) throw new Error('Reponse incoherente du service cadastre (' + features.length + ' parcelles).');
  if(codeInsee){
    const etrangere = features.find(f=>f.properties && f.properties.code_insee && f.properties.code_insee !== codeInsee);
    if(etrangere) throw new Error('Reponse incoherente du service cadastre (commune ' + etrangere.properties.code_insee + ' au lieu de ' + codeInsee + ').');
  }
  return features;
}
function construireCandidats(features, proj, ptRef, simplifier){
  const vus = new Set();
  const out = [];
  features.forEach(f=>{
    const p = f.properties || {};
    if(!p.idu || vus.has(p.idu)) return;
    const anneau = anneauExterieur(f.geometry);
    if(!anneau) return;
    const pts = anneauVersPts(anneau, proj, simplifier);
    if(pts.length < 3) return;
    const aire = shoelace(pts);
    if(!(aire > 0)) return;
    vus.add(p.idu);
    out.push({
      idu: p.idu,
      section: p.section || '',
      numero: p.numero || '',
      codeInsee: p.code_insee || '',
      commune: p.nom_com || '',
      contenance: typeof p.contenance === 'number' ? p.contenance : null,
      anneauDeg: anneau,
      pts, aire,
      dedans: pointInPolygon(ptRef, pts),
      distance: distancePointContour(ptRef, pts)
    });
  });
  return out;
}
function classerCandidats(cands){
  return cands.slice().sort((a,b)=>{
    if(a.dedans !== b.dedans) return a.dedans ? -1 : 1;
    if(Math.abs(a.distance - b.distance) > 0.30) return a.distance - b.distance;
    return (b.contenance || b.aire) - (a.contenance || a.aire);
  });
}
function libelleParcelle(c){
  const num = String(c.numero || '').replace(/^0+/, '') || String(c.numero || '');
  return ((c.section || '') + ' ' + num).trim() || c.idu;
}
function trierVoisines(principale, cands){
  const adjacentes = [], autres = [];
  cands.forEach(c=>{
    if(c.idu === principale.idu) return;
    c.distancePrincipale = distanceContours(principale.pts, c.pts);
    if(c.distancePrincipale < ADJACENCE_TOL_M){
      c.frontiere = longueurFrontiere(principale.pts, c.pts, ADJACENCE_TOL_M);
      adjacentes.push(c);
    } else {
      autres.push(c);
    }
  });
  adjacentes.sort((a,b)=> (b.frontiere - a.frontiere) || (b.aire - a.aire));
  autres.sort((a,b)=> a.distancePrincipale - b.distancePrincipale);
  return {
    adjacentes: adjacentes.slice(0, MAX_VOISINES),
    autres: autres.slice(0, MAX_VOISINES),
    tropDense: adjacentes.length > MAX_VOISINES
  };
}

// ---- BD TOPO (batiments, haies, vegetation) et GPU (PLU), memes conventions que le cadastre ----
// Le WFS de la Geoplateforme sert la BD TOPO. Deux details qui se paient cher si on les rate :
//   - en EPSG:4326 "urn:ogc:def:crs", l'ordre des coordonnees de BBOX est LAT,LON (pas lon,lat) ;
//   - les nombres arrivent en texte a virgule francaise ("5,2"), parseFloat les tronque a 5.
const WFS_URL = 'https://data.geopf.fr/wfs/ows';
const GPU_URL = 'https://apicarto.ign.fr/api/gpu';
const COUCHE_BATIMENT = 'BDTOPO_V3:batiment';
const COUCHE_VEGETATION = 'BDTOPO_V3:zone_de_vegetation';
const COUCHE_HAIE = 'BDTOPO_V3:haie';
const ESPACEMENT_ARBRES_M = 8;      // un arbre pour ~64 m2 de couvert : ordre de grandeur d'un bois
const MAX_ARBRES_ESTIMES = 60;

function bboxDegDesAnneaux(anneaux, proj, margeM){
  let lonMin = Infinity, lonMax = -Infinity, latMin = Infinity, latMax = -Infinity;
  anneaux.forEach(anneau=>anneau.forEach(c=>{
    lonMin = Math.min(lonMin, c[0]); lonMax = Math.max(lonMax, c[0]);
    latMin = Math.min(latMin, c[1]); latMax = Math.max(latMax, c[1]);
  }));
  const dLon = margeM/proj.kx, dLat = margeM/proj.ky;
  return { lonMin:lonMin-dLon, lonMax:lonMax+dLon, latMin:latMin-dLat, latMax:latMax+dLat };
}
async function interrogerWfs(couche, bbox, max){
  const bboxParam = [bbox.latMin, bbox.lonMin, bbox.latMax, bbox.lonMax, 'urn:ogc:def:crs:EPSG::4326'].join(',');
  const url = WFS_URL + '?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature'
    + '&TYPENAMES=' + encodeURIComponent(couche)
    + '&SRSNAME=EPSG:4326&BBOX=' + encodeURIComponent(bboxParam)
    + '&OUTPUTFORMAT=application/json&COUNT=' + (max || 80);
  const data = await fetchJSONReseau(url);
  return (data && data.features) || [];
}
function construireElementsIgn(features, proj, simplifier, genre){
  const out = [];
  features.forEach(f=>{
    const anneau = anneauExterieur(f.geometry);
    if(!anneau) return;
    // Les geometries BD TOPO portent une 3e coordonnee (altitude) : anneauVersPts n'en lit que
    // les deux premieres, l'altitude reste dans les attributs (altitude_minimale_sol).
    const pts = anneauVersPts(anneau, proj, simplifier);
    if(pts.length < 3) return;
    const aire = shoelace(pts);
    if(!(aire > 0)) return;
    const p = f.properties || {};
    out.push({ id: f.id || p.cleabs, genre, pts, anneauDeg: anneau, props: p, aire, parcelles: new Set() });
  });
  return out;
}
function polygonesSeTouchent(A, B){
  if(A.some(p=>pointInPolygon(p, B))) return true;
  if(B.some(p=>pointInPolygon(p, A))) return true;
  return pointInPolygon(centroid(A), B);
}
// Un batiment appartient a toutes les parcelles qu'il recouvre : une annexe a cheval sur la limite
// doit pouvoir arriver aussi bien avec la parcelle principale qu'avec la voisine cochee.
function rattacherElementsAuxParcelles(elements, parcelles){
  elements.forEach(e=>{
    e.parcelles = new Set();
    parcelles.forEach(p=>{ if(polygonesSeTouchent(e.pts, p.pts)) e.parcelles.add(p.idu); });
  });
}
function hauteurBatiment(p){
  const h = nombreFr(p.hauteur);
  if(h && h > 0) return h;
  // Beaucoup d'annexes (garages, abris) n'ont pas de hauteur mesuree dans la BD TOPO : on la
  // deduit du nombre d'etages plutot que de poser un batiment plat de hauteur nulle.
  const etages = nombreFr(p.nombre_d_etages);
  if(etages && etages > 0) return Math.round(etages*2.7*10)/10;
  return 2.5;
}
const HAUTEUR_VEGETATION = {
  'Haie': 2, 'Bois': 12, 'Forêt fermée de feuillus': 15, 'Forêt fermée de conifères': 18,
  'Forêt fermée mixte': 16, 'Forêt ouverte': 10, 'Peupleraie': 18, 'Verger': 4,
  'Vigne': 1.5, 'Lande ligneuse': 1.2, 'Zone arborée': 10, 'Bois de conifères': 18
};
function hauteurVegetation(nature){
  const h = HAUTEUR_VEGETATION[nature];
  return h !== undefined ? h : 6;
}
// Arbres ESTIMES : la BD TOPO ne cartographie pas les arbres isoles en zone urbaine. On repartit
// donc une grille reguliere, decalee d'un bruit deterministe (meme import = memes arbres, sinon
// deux imports de la meme parcelle ne donneraient pas le meme plan), en ne gardant que les points
// tombant dans le polygone. C'est un ordre de grandeur de couvert, pas un releve.
function arbresEstimes(pts, espacement, maxArbres){
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  pts.forEach(p=>{
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
  });
  const out = [];
  const bruit = (i, j) => { const s = Math.sin(i*127.1 + j*311.7)*43758.5453; return (s - Math.floor(s)) - 0.5; };
  for(let i=0; minX + i*espacement <= maxX && out.length < maxArbres; i++){
    for(let j=0; minY + j*espacement <= maxY && out.length < maxArbres; j++){
      const p = {
        x: minX + (i + 0.5 + bruit(i,j)*0.6)*espacement,
        y: minY + (j + 0.5 + bruit(j,i)*0.6)*espacement
      };
      if(pointInPolygon(p, pts)) out.push({ x:Math.round(p.x*100)/100, y:Math.round(p.y*100)/100 });
    }
  }
  return out;
}
// PLU : zonage du Geoportail de l'urbanisme au point donne. urlfic pointe le reglement PDF reel
// de la commune - c'est le seul lien qui evite d'aller le chercher a la main.
async function interrogerPlu(lon, lat){
  const geom = encodeURIComponent(JSON.stringify({ type:'Point', coordinates:[lon, lat] }));
  const lire = async (endpoint) => {
    try { return await fetchJSONReseau(GPU_URL + '/' + endpoint + '?geom=' + geom); }
    catch(e){ return null; }   // le GPU est incomplet sur certaines communes : absence != panne
  };
  const [zonesRep, communeRep, prescRep, infoRep, docRep, supSRep, supLRep, supPRep, genSRep] = await Promise.all([
    lire('zone-urba'), lire('municipality'), lire('prescription-surf'), lire('info-surf'),
    lire('document'),
    // Servitudes d'utilite publique : l'ASSIETTE est l'emprise qui touche la parcelle, le
    // GENERATEUR ce qui la produit. C'est le generateur qui porte le type reel (typegen = "SPR",
    // "Site", "Monument historique"...) ; les deux se recoupent par idgen.
    lire('assiette-sup-s'), lire('assiette-sup-l'), lire('assiette-sup-p'), lire('generateur-sup-s')
  ]);
  const zones = ((zonesRep && zonesRep.features) || []).map(f=>{
    const p = f.properties || {};
    return {
      libelle: p.libelle || '', libelong: p.libelong || '', typezone: p.typezone || '',
      partition: p.partition || '', urlfic: p.urlfic || '', nomfic: p.nomfic || '', datappro: p.datappro || ''
    };
  });
  const commune = (communeRep && communeRep.features && communeRep.features[0] && communeRep.features[0].properties) || null;
  const prescriptions = ((prescRep && prescRep.features) || []).map(f=>{
    const p = f.properties || {};
    return { libelle: p.libelle || p.txt || '', typepsc: p.typepsc || '', urlfic: p.urlfic || '' };
  });
  const informations = ((infoRep && infoRep.features) || []).map(f=>{
    const p = f.properties || {};
    return { libelle: p.libelle || p.txt || '', typeinf: p.typeinf || '', nomfic: p.nomfic || '', urlfic: p.urlfic || '' };
  });
  const generateurs = {};
  ((genSRep && genSRep.features) || []).forEach(f=>{
    const p = f.properties || {};
    if(p.idgen) generateurs[p.idgen] = p;
  });
  const servitudes = [];
  [[supSRep,'surfacique'], [supLRep,'lineaire'], [supPRep,'ponctuelle']].forEach(([rep, forme])=>{
    ((rep && rep.features) || []).forEach(f=>{
      const p = f.properties || {};
      const g = generateurs[p.idgen] || {};
      servitudes.push({
        type: (p.suptype || '').toUpperCase(),   // AC1, AC2, AC4 (SPR), PT1, I4...
        nom: p.nomsuplitt || p.nomass || '',
        assiette: p.typeass || '',               // "Perimetre du SPR", "Enceinte du site"...
        forme,
        generateur: g.typegen || '',             // "SPR", "Site", "Monument historique"...
        nature: g.type || '',                    // "Inscrit", "Classe"...
        source: g.srcgeogen || p.srcgeoass || '',
        fichier: p.fichier || '',
        partition: p.partition || '',
        urlreg: p.urlreg || g.urlreg || ''
      });
    });
  });
  // Un SPR est une servitude AC4 : il n'existe pas d'endpoint dedie, on le reconnait a son type -
  // c'est ce que porte la donnee elle-meme.
  const spr = servitudes.filter(s=>s.type === 'AC4' || /SPR/i.test(s.generateur) || /SPR/i.test(s.assiette));
  const doc = (docRep && docRep.features && docRep.features[0] && docRep.features[0].properties) || null;
  return {
    zones, prescriptions, informations, servitudes, spr,
    document: doc ? { nom: doc.name || '', type: doc.du_type || '', partition: doc.partition || '' } : null,
    commune: commune ? { nom: commune.name || '', insee: commune.insee || '', rnu: !!(commune.is_rnu === true || commune.is_rnu === 'True') } : null,
    interrogeLe: new Date().toISOString(),
    lon, lat
  };
}
function lienGeoportailUrbanisme(lon, lat){
  return 'https://www.geoportail-urbanisme.gouv.fr/map/#tile=1&lon=' + lon.toFixed(6) + '&lat=' + lat.toFixed(6) + '&zoom=18';
}
// Page "territoire" du Geoportail de l'urbanisme : c'est la que se telechargent le reglement, les
// annexes et les actes des servitudes de la commune - la seule page qui les rassemble.
function lienTerritoireUrbanisme(insee){
  return insee ? 'https://www.geoportail-urbanisme.gouv.fr/territoire/' + insee : '';
}

// ---- Fusion de parcelles contigues (une propriete = souvent plusieurs parcelles) ----
// Union par parcours d'aretes plutot que par un vrai moteur booleen : les parcelles cadastrales
// mitoyennes partagent leur limite au centimetre pres (mesure : 0,000 m), donc les aretes
// communes s'annulent deux a deux et il ne reste que le contour exterieur. Les aretes annulees
// sont rendues telles quelles : ce sont les limites internes, celles qu'on garde en pointille.
const FUSION_TOL_M = 0.05;


function objetsDepuisCadastre(etat){
  const principale = etat.principale;
  // Origine (0,0) = sommet le plus au nord de la parcelle principale : c'est la convention du
  // plan (X+ = Est, Y+ = Nord), celle qu'annonce aussi le resume de l'onglet Export.
  // Une propriete tient souvent sur plusieurs parcelles : celles marquees "propriete" sont
  // fusionnees en UN seul objet parcelle (le terrain reel), et leurs limites internes sont
  // conservees a part, en pointille. Si la fusion echoue (parcelles non contigues, trou), on ne
  // sort pas un contour faux : chaque parcelle reste un objet distinct.
  const parcellesPropriete = etat.parcellesPropriete();
  const fusion = parcellesPropriete.length > 1
    ? fusionnerAnneaux(parcellesPropriete.map(p=>p.pts), FUSION_TOL_M)
    : { contour: principale.pts.map(p=>({x:p.x, y:p.y})), limites: [] };
  etat.fusionEchouee = parcellesPropriete.length > 1 && !fusion;
  const ptsFusion = fusion ? fusion.contour : principale.pts;
  const limitesInternes = fusion ? fusion.limites : [];
  const parcellesFusionnees = fusion ? parcellesPropriete : [principale];

  let nord = ptsFusion[0];
  ptsFusion.forEach(p=>{ if(p.y > nord.y) nord = p; });
  const dec = p => ({ x: Math.round((p.x - nord.x)*1000)/1000, y: Math.round((p.y - nord.y)*1000)/1000 });
  const proj = etat.proj;
  const origineDeg = proj.versDegres(nord.x, nord.y);
  const recupereLe = new Date().toISOString();

  function meta(c, principaleOuNon){
    const info = {
      idu: c.idu, codeInsee: c.codeInsee, commune: c.commune,
      section: c.section, numero: c.numero,
      contenanceM2: c.contenance,
      source: 'IGN/API Carto/PCI', recupereLe,
      origineLat: origineDeg.lat, origineLon: origineDeg.lon,
      simplifieM: etat.simplifier ? SIMPLIF_M : 0,
      geometrieSource: { type:'Polygon', coordinates:[c.anneauDeg] }
    };
    if(principaleOuNon && etat.geo){
      info.adresse = etat.geo.label;
      info.adresseLon = etat.geo.lon;
      info.adresseLat = etat.geo.lat;
      info.adresseScore = etat.geo.score;
      info.rayonM = etat.rayon;
      info.distanceBordM = Math.round(c.distance*100)/100;
    }
    return info;
  }
  function formeCommune(c, pts){
    return {
      pts,
      vertexNames: pts.map((_,i)=>'Point ' + (i+1)),
      segmentNames: pts.map((_,i)=>'Cote ' + (i+1)),
      frozenVertices: pts.map(()=>false),
      showName:true, showSegNames:false, showVertNames:false, showAngles:false,
      fonction:'terrain', matiere:'', priority:0, locked:true, constrained:false
    };
  }

  const ptsP = ptsFusion.map(dec);
  const centreP = centroid(ptsP);
  const centreDeg = proj.versDegres(centreP.x + nord.x, centreP.y + nord.y);
  const metaParcelle = meta(principale, true);
  if(parcellesFusionnees.length > 1){
    metaParcelle.fusionDe = parcellesFusionnees.map(c=>({
      idu:c.idu, section:c.section, numero:c.numero, contenanceM2:c.contenance,
      geometrieSource:{ type:'Polygon', coordinates:[c.anneauDeg] }
    }));
    metaParcelle.contenanceM2 = parcellesFusionnees.reduce((s,c)=>s + (c.contenance || 0), 0) || null;
  }
  const objets = [Object.assign({
    key:'parcelle', type:'polygon',
    name:'Parcelle ' + parcellesFusionnees.map(libelleParcelle).join(' + '),
    fill:'#FBF3D9', fillOpacity:1, stroke:'#3B2E1F',
    showDims:true,
    // Le lieu (course du soleil, parasol, Vue 3D) se prend au centre de la parcelle, pas au
    // point d'adresse : celui-ci est sur la voirie.
    latitude: Math.round(centreDeg.lat*1e6)/1e6,
    longitude: Math.round(centreDeg.lon*1e6)/1e6,
    nomLieu: principale.commune || (etat.geo && etat.geo.ville) || '',
    cadastre: metaParcelle
  }, formeCommune(principale, ptsP))];

  const clesPrises = new Set(['parcelle']);

  // Limites cadastrales internes a la propriete : elles ne sont plus une limite de terrain, mais
  // elles restent une information (bornage, mitoyennete, deux titres de propriete). Rendues en
  // pointille, verrouillees, et ignorees par la 3D - un trait au sol n'a pas de volume.
  chainerSegments(limitesInternes, FUSION_TOL_M).forEach((chaine, i)=>{
    const pts = chaine.map(dec);
    const cle = 'limite-' + (i+1);
    clesPrises.add(cle);
    objets.push({
      key:cle, type:'path', name:'Limite cadastrale ' + (i+1),
      fill:'#8A7B63', fillOpacity:1, stroke:'#8A7B63',
      pts,
      vertexNames: pts.map((_,k)=>'Point ' + (k+1)),
      segmentNames: pts.slice(0,-1).map((_,k)=>'Cote ' + (k+1)),
      frozenVertices: pts.map(()=>false),
      width:0.12, curve:false,
      showName:false, showSegNames:false, showVertNames:false, showDims:false, showAngles:false,
      constrained:false, fonction:'limite', matiere:'', priority:1, locked:true, elevation:0
    });
  });

  // Une parcelle fusionnee dans la propriete n'est plus une voisine a importer separement.
  etat.voisinesRetenues().filter(c=>!parcellesFusionnees.some(p=>p.idu === c.idu)).forEach(c=>{
    const pts = c.pts.map(dec);
    let cle = ('parcelle-' + libelleParcelle(c)).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/-+$/,'');
    if(clesPrises.has(cle)){
      let n = 2;
      while(clesPrises.has(cle + '-' + n)) n++;
      cle = cle + '-' + n;
    }
    clesPrises.add(cle);
    objets.push(Object.assign({
      key:cle, type:'polygon', name: libelleParcelle(c),
      fill:'#EFE8D5', fillOpacity:0.45, stroke:'#8A7B63',
      // Les cotes de trois voisines par-dessus le plan le rendent illisible : la parcelle
      // principale garde ses dimensions, les voisines sont un decor de reference.
      showDims:false,
      cadastre: meta(c, false)
    }, formeCommune(c, pts)));
  });

  // ---- BD TOPO : batiments, haies, vegetation, arbres estimes ----
  const parcellesRetenues = new Set([principale.idu].concat(etat.voisinesRetenues().map(c=>c.idu)));
  const surParcellesRetenues = e => [...e.parcelles].some(idu=>parcellesRetenues.has(idu));
  const cleUnique = base => {
    let cle = base, n = 2;
    while(clesPrises.has(cle)){ cle = base + '-' + n; n++; }
    clesPrises.add(cle);
    return cle;
  };
  const formeIgn = (pts, fonction, nom, fill, stroke, opts) => Object.assign({
    key: cleUnique(opts.cle), type:'polygon', name: nom,
    fill, fillOpacity: opts.opacite !== undefined ? opts.opacite : 0.9, stroke,
    pts,
    vertexNames: pts.map((_,i)=>'Point ' + (i+1)),
    segmentNames: pts.map((_,i)=>'Cote ' + (i+1)),
    frozenVertices: pts.map(()=>false),
    showName:true, showSegNames:false, showVertNames:false, showDims:false, showAngles:false,
    // Jamais contraints a la parcelle : un batiment mitoyen deborde legitimement la limite, et la
    // contrainte le deformerait au premier deplacement.
    constrained:false, fonction, matiere:'', priority:2,
    elevation: opts.hauteur
  }, opts.extra || {});

  if(etat.importerBatiments){
    // "Sur la propriete" et non "sur la parcelle principale" : apres fusion, un batiment pose sur
    // la deuxieme parcelle du terrain est tout autant chez soi - il doit rester modifiable.
    const iduPropriete = new Set(parcellesFusionnees.map(p=>p.idu));
    etat.batiments.filter(surParcellesRetenues).forEach(b=>{
      const p = b.props || {};
      const surPrincipale = [...b.parcelles].some(idu=>iduPropriete.has(idu));
      const usage = p.usage_1 || p.nature || 'Batiment';
      objets.push(formeIgn(b.pts.map(dec), 'batiment',
        usage + (p.nombre_d_etages ? ' (' + p.nombre_d_etages + ' niv.)' : ''),
        surPrincipale ? '#D9B694' : '#CFC3B4', surPrincipale ? '#7A4A2A' : '#8A7B63', {
          cle: 'bati-' + (b.id || '').replace(/[^a-z0-9]+/gi,'-').toLowerCase(),
          hauteur: hauteurBatiment(p),
          opacite: surPrincipale ? 0.92 : 0.6,
          // Le bati de la parcelle est modifiable (on aligne une terrasse dessus) ; celui des
          // voisins est un reference : verrouille, pour ne pas le deplacer par megarde.
          extra: {
            locked: !surPrincipale,
            bdtopo: {
              couche:'BDTOPO_V3:batiment', id:b.id, cleabs:p.cleabs || null,
              nature:p.nature || null, usage1:p.usage_1 || null, usage2:p.usage_2 || null,
              hauteurM: nombreFr(p.hauteur), hauteurRetenueM: hauteurBatiment(p),
              nombreEtages: nombreFr(p.nombre_d_etages), nombreLogements: nombreFr(p.nombre_de_logements),
              altitudeSolM: nombreFr(p.altitude_minimale_sol), altitudeToitM: nombreFr(p.altitude_minimale_toit),
              constructionLegere: String(p.construction_legere) === 'True',
              etat: p.etat_de_l_objet || null, dateApparition: p.date_d_apparition || null,
              identifiantRnb: p.identifiants_rnb || null,
              surParcellePrincipale: surPrincipale,
              recupereLe: recupereLe
            }
          }
        }));
    });
  }
  if(etat.importerHaies){
    etat.haies.filter(surParcellesRetenues).forEach(h=>{
      const p = h.props || {};
      const haut = nombreFr(p.hauteur) || 2;
      objets.push(formeIgn(h.pts.map(dec), 'massif', 'Haie', '#7FA86B', '#3F5C33', {
        cle: 'haie-' + (h.id || '').replace(/[^a-z0-9]+/gi,'-').toLowerCase(),
        hauteur: haut, opacite: 0.8,
        extra: { bdtopo: { couche:'BDTOPO_V3:haie', id:h.id, cleabs:p.cleabs || null,
                           nature:p.nature || 'Haie', hauteurM: nombreFr(p.hauteur), hauteurRetenueM: haut,
                           recupereLe: recupereLe } }
      }));
    });
  }
  if(etat.importerVegetation){
    etat.vegetation.filter(surParcellesRetenues).forEach(v=>{
      const p = v.props || {};
      const haut = hauteurVegetation(p.nature);
      objets.push(formeIgn(v.pts.map(dec), 'massif', p.nature || 'Vegetation', '#A9BE8E', '#4A6B32', {
        cle: 'vegetation-' + (v.id || '').replace(/[^a-z0-9]+/gi,'-').toLowerCase(),
        hauteur: haut, opacite: 0.55,
        extra: { bdtopo: { couche:'BDTOPO_V3:zone_de_vegetation', id:v.id, cleabs:p.cleabs || null,
                           nature:p.nature || null, hauteurRetenueM: haut, hauteurM: null,
                           recupereLe: recupereLe } }
      }));
    });
    if(etat.importerArbres){
      etat.vegetation.filter(surParcellesRetenues).forEach(v=>{
        const haut = hauteurVegetation(v.props && v.props.nature);
        arbresEstimes(v.pts, ESPACEMENT_ARBRES_M, MAX_ARBRES_ESTIMES).forEach((a, i)=>{
          const c2 = dec(a);
          objets.push({
            key: cleUnique('arbre-' + (v.id || 'veg').replace(/[^a-z0-9]+/gi,'-').toLowerCase() + '-' + (i+1)),
            type:'circle', name:'Arbre (estime)',
            fill:'#6E8B4E', fillOpacity:0.7, stroke:'#3F5C33',
            center:{x:c2.x, y:c2.y}, r: 2.5,
            showName:false, showSegNames:false, showVertNames:false, showDims:false, showAngles:false,
            constrained:false, fonction:'arbre', matiere:'', priority:3, locked:false,
            elevation: haut, diametreArbre: 5,
            bdtopo: { couche:'estimation', origine: v.id, estime:true, hauteurRetenueM: haut, recupereLe: recupereLe }
          });
        });
      });
    }
  }
  // Le zonage PLU se range sur la parcelle : c'est elle qu'il qualifie, et il suit donc le projet
  // sans nouvelle cle a faire transiter par api.php.
  if(etat.plu) objets[0].plu = etat.plu;
  return objets;
}

function ouvrirImportCadastre(){
  const etatImport = {
    etape: 1,
    suggestions: [], geo: null, occupe: false, message: '', erreur: '',
    candidats: [], principale: null, adjacentes: [], autres: [],
    selection: new Set(), simplifier: true, rayon: null, proj: null,
    tropDense: false, survol: null, voisinageCharge: new Set(),
    batiments: [], haies: [], vegetation: [], plu: null, ignCharge: new Set(), ignErreur: '',
    importerBatiments: true, importerHaies: true, importerVegetation: true, importerArbres: false,
    // Parcelles cochees "propriete" : elles seront FUSIONNEES avec la principale en un seul
    // terrain. La principale en fait toujours partie, en premier (c'est elle qui porte l'adresse).
    propriete: new Set(),
    parcellesPropriete(){
      const autres = this.adjacentes.concat(this.autres).filter(c=>this.propriete.has(c.idu));
      return [this.principale].concat(autres);
    },
    estPropriete(idu){ return this.principale && (idu === this.principale.idu || this.propriete.has(idu)); },
    voisinesRetenues(){
      return this.adjacentes.concat(this.autres).filter(c=>this.selection.has(c.idu) || this.propriete.has(c.idu));
    }
  };

  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed; inset:0; background:rgba(30,22,14,0.45); z-index:9998; display:flex; align-items:center; justify-content:center; padding:14px;';
  const box = document.createElement('div');
  box.style.cssText = 'background:var(--panel-bg,#fff); color:var(--ink,#222); padding:18px 20px; border-radius:8px; width:min(700px,96vw); max-height:92vh; overflow:auto; font-family:"Helvetica Neue",Arial,sans-serif; box-shadow:0 4px 24px rgba(0,0,0,0.3); font-size:0.88rem;';
  const titre = document.createElement('div');
  titre.style.cssText = 'font-weight:600; font-size:1.05rem; margin-bottom:10px;';
  const corps = document.createElement('div');
  const etatLigne = document.createElement('div');
  etatLigne.style.cssText = 'margin-top:10px; font-size:0.82rem; min-height:1.2em; line-height:1.35;';
  const pied = document.createElement('div');
  pied.style.cssText = 'display:flex; gap:8px; justify-content:flex-end; margin-top:14px; flex-wrap:wrap;';
  const mention = document.createElement('div');
  mention.style.cssText = 'margin-top:12px; font-size:0.74rem; line-height:1.35; opacity:0.75; border-top:1px solid var(--border,#ddd); padding-top:8px;';
  mention.textContent = 'Le plan cadastral (PCI, IGN) est un document fiscal de reference : il ne vaut pas bornage. Seul un geometre-expert peut etablir les limites reelles de propriete.';
  box.appendChild(titre); box.appendChild(corps); box.appendChild(etatLigne); box.appendChild(pied); box.appendChild(mention);
  overlay.appendChild(box);
  overlay.addEventListener('click', e=>{ if(e.target === overlay) fermer(); });
  document.body.appendChild(overlay);
  document.addEventListener('keydown', surTouche);
  function surTouche(e){ if(e.key === 'Escape') fermer(); }
  function fermer(){ document.removeEventListener('keydown', surTouche); overlay.remove(); }

  function bouton(texte, principal, onClic){
    const b = document.createElement('button');
    b.type = 'button'; b.textContent = texte;
    if(!principal) b.className = 'secondary';
    b.style.fontSize = '0.85rem';
    b.addEventListener('click', onClic);
    return b;
  }
  function majEtat(){
    etatLigne.textContent = etatImport.erreur || etatImport.message || '';
    etatLigne.style.color = etatImport.erreur ? '#a02020' : 'inherit';
  }
  function occuper(actif, texte){
    etatImport.occupe = actif;
    etatImport.message = actif ? texte : '';
    if(actif) etatImport.erreur = '';
    majEtat();
    [...pied.querySelectorAll('button')].forEach(b=>{ b.disabled = actif; });
  }

  // ---- apercu SVG partage par les etapes 2 et 3 ----
  function dessinerApercu(hote){
    hote.innerHTML = '';
    if(!etatImport.principale) return;
    // L'apercu montre la propriete telle qu'elle sera importee : fusionnee d'un seul tenant, avec
    // ses limites internes en pointille. Sinon on verrait des parcelles separees et le resultat
    // serait une surprise apres coup.
    const parcellesProp = etatImport.parcellesPropriete();
    const fusionApercu = parcellesProp.length > 1
      ? fusionnerAnneaux(parcellesProp.map(p=>p.pts), FUSION_TOL_M)
      : null;
    const lots = [];
    if(fusionApercu){
      lots.push({
        c: { idu:'__propriete__', pts: fusionApercu.contour, section:'', numero:'' },
        role:'principale',
        libelle: parcellesProp.map(libelleParcelle).join(' + ')
      });
    } else {
      parcellesProp.forEach(p=>lots.push({ c:p, role:'principale' }));
    }
    etatImport.adjacentes.concat(etatImport.autres).forEach(c=>{
      if(etatImport.estPropriete(c.idu)) return;
      lots.push({ c, role: etatImport.selection.has(c.idu) ? 'retenue' : 'libre' });
    });
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    lots.forEach(l=>l.c.pts.forEach(p=>{
      minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
    }));
    const marge = Math.max(2, (maxX-minX + maxY-minY)*0.03);
    minX -= marge; maxX += marge; minY -= marge; maxY += marge;
    const w = maxX-minX, h = maxY-minY;
    const svgEl = document.createElementNS(svgNS, 'svg');
    svgEl.setAttribute('viewBox', '0 0 ' + w.toFixed(2) + ' ' + h.toFixed(2));
    svgEl.style.cssText = 'width:100%; height:min(46vh,340px); background:var(--input-bg,#fff); border:1px solid var(--border,#ddd); border-radius:4px; display:block;';
    const trait = Math.max(0.08, w/500);
    lots.slice().reverse().forEach(l=>{
      const poly = document.createElementNS(svgNS, 'polygon');
      poly.setAttribute('points', l.c.pts.map(p=>(p.x-minX).toFixed(3) + ',' + (maxY-p.y).toFixed(3)).join(' '));
      const survole = etatImport.survol === l.c.idu;
      if(l.role === 'principale'){ poly.setAttribute('fill', '#FBF3D9'); poly.setAttribute('stroke', '#3B2E1F'); }
      else if(l.role === 'retenue'){ poly.setAttribute('fill', '#EDE3CB'); poly.setAttribute('stroke', '#8A7B63'); }
      else { poly.setAttribute('fill', 'transparent'); poly.setAttribute('stroke', '#9a9a9a'); poly.setAttribute('stroke-dasharray', (trait*4).toFixed(2) + ' ' + (trait*3).toFixed(2)); }
      poly.setAttribute('stroke-width', (survole ? trait*2.2 : trait).toFixed(3));
      // Le lot fusionne n'est pas une parcelle : rien a selectionner dessus, ses composantes se
      // decochent dans la liste.
      if(l.c.idu !== '__propriete__'){
        poly.style.cursor = 'pointer';
        poly.addEventListener('mouseenter', ()=>{ etatImport.survol = l.c.idu; rafraichirVue(); });
        poly.addEventListener('mouseleave', ()=>{ if(etatImport.survol === l.c.idu){ etatImport.survol = null; rafraichirVue(); } });
        poly.addEventListener('click', ()=>{
          if(etatImport.etape === 2) choisirPrincipale(l.c);
          else if(l.c.idu !== etatImport.principale.idu) basculerVoisine(l.c);
        });
      }
      svgEl.appendChild(poly);
      const c = centroid(l.c.pts);
      const txt = document.createElementNS(svgNS, 'text');
      txt.setAttribute('x', (c.x-minX).toFixed(2));
      txt.setAttribute('y', (maxY-c.y).toFixed(2));
      txt.setAttribute('text-anchor', 'middle');
      txt.setAttribute('font-size', Math.max(0.9, w/40).toFixed(2));
      txt.setAttribute('fill', '#3B2E1F');
      txt.setAttribute('pointer-events', 'none');
      txt.textContent = l.libelle || libelleParcelle(l.c);
      svgEl.appendChild(txt);
    });
    // Limites internes de la propriete, en pointille : elles disparaissent comme limite de
    // terrain mais restent tracees, exactement comme dans le plan produit.
    if(fusionApercu){
      chainerSegments(fusionApercu.limites, FUSION_TOL_M).forEach(chaine=>{
        const l = document.createElementNS(svgNS, 'polyline');
        l.setAttribute('points', chaine.map(p=>(p.x-minX).toFixed(3) + ',' + (maxY-p.y).toFixed(3)).join(' '));
        l.setAttribute('fill', 'none');
        l.setAttribute('stroke', '#8A7B63');
        l.setAttribute('stroke-width', (trait*1.1).toFixed(3));
        l.setAttribute('stroke-dasharray', (trait*5).toFixed(2) + ' ' + (trait*4).toFixed(2));
        l.setAttribute('pointer-events', 'none');
        svgEl.appendChild(l);
      });
    }
    // Couches BD TOPO par-dessus le parcellaire : elles ne sont pas cliquables (leur import se
    // regle par les cases de l'etape 3), mais sans elles l'apercu ne montrerait pas ce qui va
    // reellement arriver dans le plan.
    const parcellesRetenues = new Set([etatImport.principale.idu].concat(etatImport.voisinesRetenues().map(v=>v.idu)));
    const dessinerCouche = (elements, actif, remplissage, contour, opacite) => {
      elements.forEach(e=>{
        const retenu = actif && [...e.parcelles].some(idu=>parcellesRetenues.has(idu));
        const poly = document.createElementNS(svgNS, 'polygon');
        poly.setAttribute('points', e.pts.map(p=>(p.x-minX).toFixed(3) + ',' + (maxY-p.y).toFixed(3)).join(' '));
        poly.setAttribute('fill', retenu ? remplissage : 'none');
        poly.setAttribute('fill-opacity', retenu ? (opacite || 0.85) : 0);
        poly.setAttribute('stroke', retenu ? contour : '#b0b0b0');
        poly.setAttribute('stroke-width', (retenu ? trait : trait*0.7).toFixed(3));
        if(!retenu) poly.setAttribute('stroke-dasharray', (trait*2).toFixed(2) + ' ' + (trait*2).toFixed(2));
        poly.setAttribute('pointer-events', 'none');
        svgEl.appendChild(poly);
      });
    };
    dessinerCouche(etatImport.vegetation, etatImport.importerVegetation, '#A9BE8E', '#4A6B32', 0.55);
    dessinerCouche(etatImport.haies, etatImport.importerHaies, '#7FA86B', '#3F5C33', 0.8);
    dessinerCouche(etatImport.batiments, etatImport.importerBatiments, '#D9B694', '#7A4A2A', 0.9);

    // Le point d'adresse, souvent hors de toute parcelle : le montrer evite de croire a un bug.
    const pa = document.createElementNS(svgNS, 'circle');
    pa.setAttribute('cx', (0-minX).toFixed(3));
    pa.setAttribute('cy', (maxY-0).toFixed(3));
    pa.setAttribute('r', Math.max(0.4, w/120).toFixed(3));
    pa.setAttribute('fill', '#a02020');
    pa.setAttribute('pointer-events', 'none');
    svgEl.appendChild(pa);
    hote.appendChild(svgEl);
  }
  function ligneSurface(c){
    const calc = Math.round(c.aire);
    if(c.contenance === null) return calc + ' m² (calcul)';
    const ecart = Math.abs(calc - c.contenance)/c.contenance;
    // Au-dela de 3 %, on montre les deux : la contenance cadastrale est arrondie et calculee
    // autrement, l'ecart est normal - mais le cacher ferait douter de la geometrie importee.
    return ecart > 0.03 ? (c.contenance + ' m² (cadastre) / ' + calc + ' m² (calcul)') : (c.contenance + ' m²');
  }

  // ---- etapes ----
  let etapeConstruite = 0;
  let champAdresse = null, listeSuggestions = null, hoteApercu = null, listeVoisines = null, champNom = null, blocIgn = null, resumePropriete = null;

  // Compte les elements BD TOPO qui tomberaient effectivement dans le plan : ceux qui recouvrent
  // la parcelle principale ou une voisine COCHEE. Recalcule a chaque coche, donc les compteurs
  // suivent la selection au lieu d'annoncer un total theorique.
  function elementsRetenus(liste){
    const retenues = new Set([etatImport.principale.idu].concat(etatImport.voisinesRetenues().map(v=>v.idu)));
    return liste.filter(e=>[...e.parcelles].some(idu=>retenues.has(idu)));
  }
  function remplirBlocIgn(){
    if(!blocIgn) return;
    blocIgn.innerHTML = '';
    const ligne = (cle, libelle, n, titre) => {
      const lab = document.createElement('label');
      lab.style.cssText = 'display:flex; align-items:center; gap:6px; font-size:0.82rem; cursor:pointer;';
      if(titre) lab.title = titre;
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = !!etatImport[cle];
      cb.disabled = n === 0;
      cb.addEventListener('change', ()=>{ etatImport[cle] = cb.checked; remplirBlocIgn(); if(hoteApercu) dessinerApercu(hoteApercu); });
      lab.appendChild(cb);
      lab.appendChild(document.createTextNode(libelle + ' — ' + n));
      if(n === 0) lab.style.opacity = '0.55';
      blocIgn.appendChild(lab);
    };
    const bats = elementsRetenus(etatImport.batiments);
    const iduPropriete = new Set(etatImport.parcellesPropriete().map(p=>p.idu));
    const surPrincipale = bats.filter(b=>[...b.parcelles].some(idu=>iduPropriete.has(idu)));
    const hauteurs = surPrincipale.map(b=>hauteurBatiment(b.props)).sort((a,b)=>b-a);
    ligne('importerBatiments', 'Bâtiments (BD TOPO, avec hauteur)', bats.length,
      'Emprise et hauteur reelles des batiments. Ceux de la parcelle sont modifiables, ceux des voisins arrivent verrouilles.');
    if(hauteurs.length){
      const d = document.createElement('div');
      d.style.cssText = 'font-size:0.78rem; opacity:0.75; margin:-2px 0 2px 22px;';
      d.textContent = 'Sur la propriété : ' + surPrincipale.length + ' bâtiment(s), hauteurs ' +
        hauteurs.map(h=>h.toFixed(1).replace('.',',') + ' m').join(', ');
      blocIgn.appendChild(d);
    }
    ligne('importerHaies', 'Haies (géométrie + hauteur)', elementsRetenus(etatImport.haies).length,
      'Couche haie de la BD TOPO : renseignee surtout en zone de bocage, souvent vide en ville.');
    const vegs = elementsRetenus(etatImport.vegetation);
    ligne('importerVegetation', 'Zones de végétation', vegs.length,
      'Bois, forets, vergers... hauteur deduite de la nature de la zone.');
    ligne('importerArbres', 'Arbres estimés dans ces zones (~' + Math.min(MAX_ARBRES_ESTIMES,
      vegs.reduce((s,v)=>s + arbresEstimes(v.pts, ESPACEMENT_ARBRES_M, MAX_ARBRES_ESTIMES).length, 0)) + ')',
      vegs.length, 'ESTIMATION : la BD TOPO ne cartographie pas les arbres isoles. Une grille reguliere d\'un arbre pour 64 m2 est repartie dans les zones de vegetation - un ordre de grandeur du couvert, pas un releve.');

    const plu = document.createElement('div');
    plu.style.cssText = 'font-size:0.8rem; margin-top:8px; line-height:1.45;';
    if(etatImport.plu && etatImport.plu.zones && etatImport.plu.zones.length){
      const z = etatImport.plu.zones[0];
      plu.innerHTML = '<b>PLU</b> — zone ' + escapeHtml(z.libelle) + (z.typezone ? ' (type ' + escapeHtml(z.typezone) + ')' : '') +
        (z.libelong ? '<br>' + escapeHtml(z.libelong) : '') +
        (z.urlfic ? '<br><a href="' + escapeHtml(z.urlfic) + '" target="_blank" rel="noopener">Règlement (PDF)</a>' : '') +
        '<br><span style="opacity:0.75;">Le zonage est rattaché à la parcelle et consultable dans l\'onglet PLU.</span>';
    } else if(etatImport.plu && etatImport.plu.commune && etatImport.plu.commune.rnu){
      plu.textContent = 'PLU : commune au RNU (pas de document d\'urbanisme local).';
    } else {
      plu.textContent = 'PLU : aucun zonage renvoye par le Geoportail de l\'urbanisme pour ce point.';
    }
    blocIgn.appendChild(plu);
    if(etatImport.ignErreur){
      const e = document.createElement('div');
      e.style.cssText = 'font-size:0.8rem; color:#a02020; margin-top:6px;';
      e.textContent = etatImport.ignErreur;
      blocIgn.appendChild(e);
    }
  }

  // Cases a cocher de l'etape 3, indexees par idu : cocher une voisine met a jour l'apercu ET
  // la case correspondante SANS reconstruire la liste. Reconstruire remplacerait les <input>
  // en cours d'utilisation - le clavier perdrait sa position a chaque coche, et une reference
  // gardee sur une case (clic sur l'apercu, par exemple) pointerait un noeud detache.
  const casesVoisines = new Map();
  function rafraichirVue(){
    if(hoteApercu) dessinerApercu(hoteApercu);
    // Les compteurs BD TOPO dependent des parcelles cochees : cocher une voisine peut faire
    // entrer son batiment dans le lot.
    remplirBlocIgn();
    casesVoisines.forEach((ligne, idu)=>{
      ligne.cb.checked = etatImport.selection.has(idu) || etatImport.propriete.has(idu);
      ligne.cb.disabled = etatImport.propriete.has(idu);
      if(ligne.cbProp) ligne.cbProp.checked = etatImport.propriete.has(idu);
      ligne.lab.style.background = (etatImport.survol === idu) ? 'rgba(139,107,61,0.18)' : 'transparent';
    });
    majResumePropriete();
  }
  function rendre(){
    if(etapeConstruite !== etatImport.etape){
      corps.innerHTML = ''; pied.innerHTML = '';
      hoteApercu = listeVoisines = blocIgn = resumePropriete = null;
      if(etatImport.etape === 1) construireEtape1();
      else if(etatImport.etape === 2) construireEtape2();
      else construireEtape3();
      etapeConstruite = etatImport.etape;
    }
    majEtat();
  }

  function construireEtape1(){
    titre.textContent = 'Nouveau projet depuis une adresse (1/3)';
    const lab = document.createElement('div');
    lab.style.cssText = 'margin-bottom:6px;';
    lab.textContent = 'Adresse du terrain (ou coordonnees « latitude, longitude ») :';
    champAdresse = document.createElement('input');
    champAdresse.type = 'text';
    champAdresse.className = 'promptInput';
    champAdresse.placeholder = '2 allee des Limites 78110 Le Vesinet';
    listeSuggestions = document.createElement('div');
    listeSuggestions.style.cssText = 'margin-top:8px; display:flex; flex-direction:column; gap:4px;';
    corps.appendChild(lab); corps.appendChild(champAdresse); corps.appendChild(listeSuggestions);

    let minuteur = null, requeteEnCours = 0;
    // On ne reconstruit QUE la liste des suggestions a chaque frappe : reconstruire le corps
    // entier remplacerait le champ de saisie et lui ferait perdre le focus a chaque lettre.
    champAdresse.addEventListener('input', ()=>{
      clearTimeout(minuteur);
      const texte = champAdresse.value.trim();
      if(texte.length < 3){ etatImport.suggestions = []; remplirSuggestions(); return; }
      minuteur = setTimeout(async ()=>{
        const monTour = ++requeteEnCours;
        try {
          const res = await geocoderBAN(texte, true);
          if(monTour !== requeteEnCours) return; // une frappe plus recente a pris la main
          etatImport.suggestions = res; etatImport.erreur = '';
        } catch(e){
          if(monTour !== requeteEnCours) return;
          etatImport.suggestions = []; etatImport.erreur = 'Geocodage impossible : ' + (e.message || e);
        }
        remplirSuggestions(); majEtat();
      }, 250);
    });
    champAdresse.addEventListener('keydown', e=>{
      if(e.key === 'Enter'){
        e.preventDefault();
        if(etatImport.suggestions.length) choisirAdresse(etatImport.suggestions[0]);
        else lancerRechercheTexte(champAdresse.value.trim());
      }
    });
    pied.appendChild(bouton('Annuler', false, fermer));
    pied.appendChild(bouton('Rechercher', true, ()=>lancerRechercheTexte(champAdresse.value.trim())));
    setTimeout(()=>champAdresse.focus(), 0);
  }
  function remplirSuggestions(){
    listeSuggestions.innerHTML = '';
    etatImport.suggestions.forEach(s=>{
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'secondary';
      b.style.cssText = 'text-align:left; font-size:0.84rem; padding:6px 8px;';
      b.textContent = s.label + (s.genre && s.genre !== 'housenumber' ? '  (niveau ' + s.genre + ')' : '');
      b.addEventListener('click', ()=>choisirAdresse(s));
      listeSuggestions.appendChild(b);
    });
  }
  const RE_COORDS = /^\s*(-?\d+[.,]\d+)\s*[,; ]\s*(-?\d+[.,]\d+)\s*$/;
  async function lancerRechercheTexte(texte){
    if(!texte || texte.length < 3){ etatImport.erreur = 'Saisis une adresse (au moins 3 caracteres).'; majEtat(); return; }
    const m = texte.match(RE_COORDS);
    if(m){
      const lat = parseFloat(m[1].replace(',', '.')), lon = parseFloat(m[2].replace(',', '.'));
      choisirAdresse({ label:'Point ' + lat.toFixed(6) + ', ' + lon.toFixed(6), score:1, genre:'coordonnees', citycode:'', ville:'', lon, lat });
      return;
    }
    occuper(true, 'Geocodage en cours…');
    try {
      const res = await geocoderBAN(texte, false);
      occuper(false);
      if(!res.length){ etatImport.erreur = 'Aucune adresse trouvee. Essaie sans le numero, ou avec le code postal.'; majEtat(); return; }
      etatImport.suggestions = res; remplirSuggestions();
      choisirAdresse(res[0]);
    } catch(e){
      occuper(false);
      etatImport.erreur = 'Geocodage impossible : ' + (e.message || e);
      majEtat();
    }
  }
  async function choisirAdresse(sug){
    etatImport.geo = sug;
    occuper(true, 'Recherche de la parcelle…');
    try {
      const proj = projecteurLocal(sug.lat, sug.lon);
      const ptRef = {x:0, y:0};   // le point d'adresse est l'origine de cette projection
      let features = [], rayon = null;
      for(const r of RAYONS_RECHERCHE_M){
        features = await interrogerCadastre(empriseGeoJSON(sug.lon, sug.lat, proj, r), sug.citycode);
        if(features.length){ rayon = r; break; }
      }
      occuper(false);
      if(!features.length){
        etatImport.erreur = 'Aucune parcelle cadastrale trouvee dans un rayon de ' + RAYONS_RECHERCHE_M[RAYONS_RECHERCHE_M.length-1] + ' m.';
        majEtat(); return;
      }
      const cands = classerCandidats(construireCandidats(features, proj, ptRef, etatImport.simplifier));
      if(!cands.length){
        etatImport.erreur = 'Geometrie inexploitable renvoyee par le service cadastre.';
        majEtat(); return;
      }
      // Le filtre geom pourrait etre ignore sans que rien ne le signale : une "plus proche"
      // parcelle a 200 m de l'adresse trahirait ce cas mieux que n'importe quel code HTTP.
      if(cands[0].distance > 120){
        etatImport.erreur = 'Reponse incoherente du service cadastre (parcelle la plus proche a ' + Math.round(cands[0].distance) + ' m de l\'adresse).';
        majEtat(); return;
      }
      etatImport.proj = proj;
      etatImport.rayon = rayon;
      etatImport.candidats = cands;
      etatImport.selection = new Set();
      etatImport.voisinageCharge = new Set();
      occuper(true, 'Recherche des parcelles voisines…');
      try {
        await chargerVoisinage(cands[0]);
      } catch(e){
        // Le voisinage est un complement : son echec ne doit pas emporter la parcelle trouvee.
        etatImport.erreur = 'Parcelles voisines non chargees : ' + (e.message || e);
      }
      occuper(false);
      appliquerPrincipale(cands[0]);
      await chargerIgnAvecMessage(cands[0]);
      etatImport.etape = 2;
      rendre();
    } catch(e){
      occuper(false);
      etatImport.erreur = (e.message || String(e));
      majEtat();
    }
  }
  // Deuxieme requete, centree sur la parcelle retenue : c'est elle qui donne la liste COMPLETE
  // des mitoyennes. Faite une seule fois par parcelle (un changement de parcelle principale
  // rouvre un voisinage different, mais y revenir ne redemande rien).
  async function chargerVoisinage(c){
    if(etatImport.voisinageCharge.has(c.idu)) return;
    const emprise = empriseAutourAnneau(c.anneauDeg, etatImport.proj, 20);
    const features = await interrogerCadastre(emprise, etatImport.geo ? etatImport.geo.citycode : '');
    const connus = new Set(etatImport.candidats.map(x=>x.idu));
    const nouveaux = construireCandidats(features, etatImport.proj, {x:0, y:0}, etatImport.simplifier)
      .filter(x=>!connus.has(x.idu));
    if(nouveaux.length) etatImport.candidats = classerCandidats(etatImport.candidats.concat(nouveaux));
    etatImport.voisinageCharge.add(c.idu);
  }
  function appliquerPrincipale(c){
    etatImport.principale = c;
    const tri = trierVoisines(c, etatImport.candidats);
    etatImport.adjacentes = tri.adjacentes;
    etatImport.autres = tri.autres;
    etatImport.tropDense = tri.tropDense;
    etatImport.selection = new Set([...etatImport.selection].filter(idu => idu !== c.idu));
    // La nouvelle principale ne peut plus figurer dans la liste des parcelles a lui fusionner.
    etatImport.propriete.delete(c.idu);
    rattacherElementsAuxParcelles(etatImport.batiments, etatImport.candidats);
    rattacherElementsAuxParcelles(etatImport.haies, etatImport.candidats);
    rattacherElementsAuxParcelles(etatImport.vegetation, etatImport.candidats);
  }
  // BD TOPO + PLU sur l'emprise de la parcelle et de ses mitoyennes. Chargement separe du
  // cadastre : ces couches sont un complement, leur indisponibilite ne doit pas empecher
  // d'importer la parcelle (message a cote, et cases correspondantes vides).
  async function chargerDonneesIgn(c){
    if(etatImport.ignCharge.has(c.idu)) return;
    const anneaux = [c.anneauDeg].concat(etatImport.adjacentes.map(v=>v.anneauDeg));
    const bbox = bboxDegDesAnneaux(anneaux, etatImport.proj, 10);
    const centre = centroid(c.pts);
    const centreDeg = etatImport.proj.versDegres(centre.x, centre.y);
    const [bat, veg, haie, plu] = await Promise.all([
      interrogerWfs(COUCHE_BATIMENT, bbox, 80).catch(e=>{ throw e; }),
      interrogerWfs(COUCHE_VEGETATION, bbox, 40).catch(()=>[]),
      interrogerWfs(COUCHE_HAIE, bbox, 40).catch(()=>[]),
      interrogerPlu(centreDeg.lon, centreDeg.lat).catch(()=>null)
    ]);
    etatImport.batiments = construireElementsIgn(bat, etatImport.proj, etatImport.simplifier, 'batiment');
    etatImport.vegetation = construireElementsIgn(veg, etatImport.proj, etatImport.simplifier, 'vegetation');
    etatImport.haies = construireElementsIgn(haie, etatImport.proj, etatImport.simplifier, 'haie');
    etatImport.plu = plu;
    rattacherElementsAuxParcelles(etatImport.batiments, etatImport.candidats);
    rattacherElementsAuxParcelles(etatImport.haies, etatImport.candidats);
    rattacherElementsAuxParcelles(etatImport.vegetation, etatImport.candidats);
    etatImport.ignCharge.add(c.idu);
  }
  async function chargerIgnAvecMessage(c){
    occuper(true, 'Bâtiments, végétation et PLU…');
    try {
      await chargerDonneesIgn(c);
      etatImport.ignErreur = '';
    } catch(e){
      etatImport.batiments = []; etatImport.haies = []; etatImport.vegetation = [];
      etatImport.ignErreur = 'Donnees BD TOPO indisponibles : ' + (e.message || e);
    }
    occuper(false);
    if(etatImport.ignErreur) etatImport.erreur = etatImport.ignErreur;
  }
  async function choisirPrincipale(c){
    if(!c || c.idu === etatImport.principale.idu) return;
    occuper(true, 'Recherche des parcelles voisines…');
    try {
      await chargerVoisinage(c);
    } catch(e){
      etatImport.erreur = 'Parcelles voisines non chargees : ' + (e.message || e);
    }
    occuper(false);
    appliquerPrincipale(c);
    await chargerIgnAvecMessage(c);
    etapeConstruite = 0; // la liste des candidates et l'apercu changent entierement
    rendre();
  }
  function basculerVoisine(c){
    if(etatImport.propriete.has(c.idu)) return;   // une parcelle de la propriete est importee d'office
    if(etatImport.selection.has(c.idu)) etatImport.selection.delete(c.idu);
    else etatImport.selection.add(c.idu);
    rafraichirVue();
  }
  function basculerPropriete(c){
    if(etatImport.propriete.has(c.idu)) etatImport.propriete.delete(c.idu);
    else {
      etatImport.propriete.add(c.idu);
      etatImport.selection.delete(c.idu);   // elle n'est plus une voisine : elle EST la parcelle
    }
    rafraichirVue();
  }
  // Resume de la propriete : surface fusionnee reelle (pas la somme des contenances) et etatImport de
  // la fusion. Une fusion impossible doit se voir AVANT la creation du projet, pas apres.
  function majResumePropriete(){
    if(!resumePropriete) return;
    const parcelles = etatImport.parcellesPropriete();
    if(parcelles.length <= 1){
      resumePropriete.textContent = 'Propriété : ' + libelleParcelle(etatImport.principale) + ' seule. Coche « propriété » sur une mitoyenne pour fusionner plusieurs parcelles en un seul terrain.';
      resumePropriete.style.color = '';
      return;
    }
    const fusion = fusionnerAnneaux(parcelles.map(p=>p.pts), FUSION_TOL_M);
    if(!fusion){
      resumePropriete.textContent = 'Fusion impossible : ' + parcelles.map(libelleParcelle).join(' + ') +
        ' ne forment pas un ensemble d\'un seul tenant. Elles seront importées séparément.';
      resumePropriete.style.color = '#a02020';
      return;
    }
    resumePropriete.style.color = '';
    resumePropriete.textContent = 'Propriété fusionnée : ' + parcelles.map(libelleParcelle).join(' + ') +
      ' — ' + Math.round(shoelace(fusion.contour)) + ' m² au total, ' +
      chainerSegments(fusion.limites, FUSION_TOL_M).length + ' limite(s) interne(s) conservée(s) en pointillé.';
  }

  function construireEtape2(){
    titre.textContent = 'Parcelle trouvee (2/3)';
    hoteApercu = document.createElement('div');
    corps.appendChild(hoteApercu);
    const info = document.createElement('div');
    info.style.cssText = 'margin-top:10px; line-height:1.5;';
    const p = etatImport.principale;
    const ecartAuto = etatImport.candidats.length > 1 ? (etatImport.candidats[1].distance - etatImport.candidats[0].distance) : Infinity;
    info.innerHTML = '<b>' + escapeHtml('Parcelle ' + libelleParcelle(p)) + '</b> — ' + escapeHtml(p.commune) +
      ' (INSEE ' + escapeHtml(p.codeInsee) + ')<br>Surface : ' + escapeHtml(ligneSurface(p)) +
      '<br>Adresse : ' + escapeHtml(etatImport.geo.label) +
      '<br>Point d\'adresse : ' + (p.dedans ? 'dans la parcelle' : 'a ' + p.distance.toFixed(2) + ' m du bord (il est pose devant la porte, sur la voirie)') +
      (etatImport.geo.genre && etatImport.geo.genre !== 'housenumber' && etatImport.geo.genre !== 'coordonnees'
        ? '<br><i>Adresse resolue au niveau ' + escapeHtml(etatImport.geo.genre) + ' : la parcelle proposee est approximative.</i>' : '') +
      (ecartAuto < ECART_AUTO_M ? '<br><i>Plusieurs parcelles sont a distance comparable : verifie le choix ci-dessous.</i>' : '');
    corps.appendChild(info);

    const titreListe = document.createElement('div');
    titreListe.style.cssText = 'margin-top:12px; font-weight:600;';
    titreListe.textContent = 'Autre parcelle ? (clic sur l\'apercu ou dans la liste)';
    corps.appendChild(titreListe);
    const liste = document.createElement('div');
    liste.style.cssText = 'margin-top:6px; display:flex; flex-direction:column; gap:3px; max-height:22vh; overflow:auto;';
    etatImport.candidats.forEach(c=>{
      const b = document.createElement('button');
      b.type = 'button';
      b.className = c.idu === p.idu ? '' : 'secondary';
      b.style.cssText = 'text-align:left; font-size:0.82rem; padding:5px 8px;';
      b.textContent = libelleParcelle(c) + ' — ' + ligneSurface(c) + ' — ' + c.distance.toFixed(2) + ' m de l\'adresse';
      b.addEventListener('mouseenter', ()=>{ etatImport.survol = c.idu; dessinerApercu(hoteApercu); });
      b.addEventListener('mouseleave', ()=>{ etatImport.survol = null; dessinerApercu(hoteApercu); });
      b.addEventListener('click', ()=>choisirPrincipale(c));
      liste.appendChild(b);
    });
    corps.appendChild(liste);

    const optSimplif = document.createElement('label');
    optSimplif.style.cssText = 'display:flex; align-items:center; gap:6px; margin-top:10px; font-size:0.82rem;';
    const cb = document.createElement('input');
    cb.type = 'checkbox'; cb.checked = etatImport.simplifier;
    cb.addEventListener('change', ()=>{
      etatImport.simplifier = cb.checked;
      // Retour a la geometrie source : re-projeter depuis les anneaux WGS84 conserves, plutot
      // que de re-simplifier un contour deja simplifie (ce qui ne reviendrait jamais en arriere).
      etatImport.candidats.forEach(c=>{
        c.pts = anneauVersPts(c.anneauDeg, etatImport.proj, etatImport.simplifier);
        c.aire = shoelace(c.pts);
        c.dedans = pointInPolygon({x:0,y:0}, c.pts);
        c.distance = distancePointContour({x:0,y:0}, c.pts);
      });
      appliquerPrincipale(etatImport.candidats.find(c=>c.idu === etatImport.principale.idu) || etatImport.principale);
      etapeConstruite = 0; rendre();
    });
    optSimplif.appendChild(cb);
    optSimplif.appendChild(document.createTextNode('Simplifier les contours (sommets alignes a moins de 2 cm)'));
    corps.appendChild(optSimplif);

    pied.appendChild(bouton('Annuler', false, fermer));
    pied.appendChild(bouton('← Changer d\'adresse', false, ()=>{ etatImport.etape = 1; etatImport.suggestions = []; rendre(); }));
    pied.appendChild(bouton('Parcelles voisines →', true, ()=>{ etatImport.etape = 3; rendre(); }));
    dessinerApercu(hoteApercu);
  }

  function construireEtape3(){
    titre.textContent = 'Parcelles voisines et creation (3/3)';
    hoteApercu = document.createElement('div');
    corps.appendChild(hoteApercu);
    resumePropriete = document.createElement('div');
    resumePropriete.style.cssText = 'margin-top:8px; font-size:0.82rem; font-weight:600; line-height:1.4;';
    corps.appendChild(resumePropriete);
    const aide = document.createElement('div');
    aide.style.cssText = 'margin-top:8px; font-size:0.82rem; opacity:0.8;';
    aide.textContent = 'Coche « propriété » pour les parcelles qui forment ton terrain (elles seront fusionnées en une seule), « importer » pour celles qui restent un simple décor de référence. Un clic sur l\'aperçu bascule « importer ». '
      + 'Un objet coche « contraint a la parcelle » reste enferme dans la parcelle principale : pour construire a cheval sur une voisine, decoche cette contrainte dans le panneau Objet.';
    corps.appendChild(aide);
    const barreSelection = document.createElement('div');
    barreSelection.style.cssText = 'display:flex; gap:6px; margin-top:8px; flex-wrap:wrap;';
    barreSelection.appendChild(bouton('Cocher toutes les mitoyennes', false, ()=>{
      etatImport.adjacentes.forEach(c=>etatImport.selection.add(c.idu));
      rafraichirVue();
    }));
    barreSelection.appendChild(bouton('Tout decocher', false, ()=>{
      etatImport.selection.clear();
      rafraichirVue();
    }));
    corps.appendChild(barreSelection);
    listeVoisines = document.createElement('div');
    listeVoisines.style.cssText = 'margin-top:8px; display:flex; flex-direction:column; gap:3px; max-height:26vh; overflow:auto;';
    corps.appendChild(listeVoisines);

    // ---- Donnees IGN (BD TOPO + PLU) ----
    const titreIgn = document.createElement('div');
    titreIgn.style.cssText = 'margin-top:14px; font-weight:600;';
    titreIgn.textContent = 'Données IGN à importer sur les parcelles retenues';
    corps.appendChild(titreIgn);
    blocIgn = document.createElement('div');
    blocIgn.style.cssText = 'margin-top:4px; display:flex; flex-direction:column; gap:3px;';
    corps.appendChild(blocIgn);
    remplirBlocIgn();

    const labNom = document.createElement('div');
    labNom.style.cssText = 'margin-top:12px; margin-bottom:4px;';
    labNom.textContent = 'Nom du projet :';
    champNom = document.createElement('input');
    champNom.type = 'text';
    champNom.className = 'promptInput';
    champNom.value = (libelleParcelle(etatImport.principale) + ' — ' + (etatImport.geo ? etatImport.geo.label : '')).slice(0, 60);
    corps.appendChild(labNom); corps.appendChild(champNom);

    pied.appendChild(bouton('Annuler', false, fermer));
    pied.appendChild(bouton('← Retour', false, ()=>{ etatImport.etape = 2; rendre(); }));
    pied.appendChild(bouton('Creer le projet', true, creerProjet));
    remplirListeVoisines();
    // Le resume de propriete se remplit a l'arrivee sur l'etape, pas seulement au premier clic :
    // c'est lui qui annonce quelle parcelle est la principale et la surface qui sera creee.
    majResumePropriete();
    dessinerApercu(hoteApercu);
  }
  function remplirListeVoisines(){
    listeVoisines.innerHTML = '';
    casesVoisines.clear();
    const groupe = (titreTxte, liste) => {
      if(!liste.length) return;
      const t = document.createElement('div');
      t.style.cssText = 'font-weight:600; margin-top:6px; font-size:0.82rem;';
      t.textContent = titreTxte;
      listeVoisines.appendChild(t);
      liste.forEach(c=>{
        const rang = document.createElement('div');
        rang.style.cssText = 'display:flex; align-items:center; gap:10px; font-size:0.82rem; padding:2px 0; background:transparent;';
        if(etatImport.survol === c.idu) rang.style.background = 'rgba(139,107,61,0.18)';
        // Deux cases distinctes : "propriete" fusionne la parcelle avec la principale (un seul
        // terrain), "importer" la pose a cote en simple reference. La premiere implique la
        // seconde, d'ou la case importer cochee et desactivee dans ce cas.
        const labProp = document.createElement('label');
        labProp.style.cssText = 'display:flex; align-items:center; gap:5px; cursor:pointer; white-space:nowrap;';
        labProp.title = 'Cette parcelle fait partie de la propriete : elle sera fusionnee avec la parcelle principale, sa limite interne restant en pointille.';
        const cbProp = document.createElement('input');
        cbProp.type = 'checkbox';
        cbProp.checked = etatImport.propriete.has(c.idu);
        cbProp.addEventListener('change', ()=>basculerPropriete(c));
        labProp.appendChild(cbProp);
        labProp.appendChild(document.createTextNode('propriété'));

        const labImport = document.createElement('label');
        labImport.style.cssText = 'display:flex; align-items:center; gap:5px; cursor:pointer; white-space:nowrap;';
        labImport.title = 'Importer cette parcelle comme voisine, en decor de reference.';
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = etatImport.selection.has(c.idu) || etatImport.propriete.has(c.idu);
        cb.disabled = etatImport.propriete.has(c.idu);
        cb.addEventListener('change', ()=>basculerVoisine(c));
        labImport.appendChild(cb);
        labImport.appendChild(document.createTextNode('importer'));

        const texte = document.createElement('span');
        texte.style.cssText = 'cursor:pointer; flex:1;';
        texte.textContent = libelleParcelle(c) + ' — ' + ligneSurface(c) +
          (c.frontiere ? ' — ' + c.frontiere.toFixed(1) + ' m de limite commune' : ' — a ' + c.distancePrincipale.toFixed(1) + ' m');
        texte.addEventListener('click', ()=>basculerVoisine(c));

        // Permuter la principale sans repasser par l'etape 2 : c'est ici qu'on voit le voisinage
        // en entier, donc ici qu'on se rend compte qu'on a designe la mauvaise parcelle. Le
        // changement relance tout (adjacences, elements BD TOPO, origine du plan a la creation) -
        // jamais un remplacement partiel de la geometrie.
        const btnPrincipale = document.createElement('button');
        btnPrincipale.type = 'button';
        btnPrincipale.className = 'secondary';
        btnPrincipale.style.cssText = 'font-size:0.72rem; padding:2px 7px; white-space:nowrap;';
        btnPrincipale.textContent = '↑ principale';
        btnPrincipale.title = 'En faire la parcelle principale : celle qui porte l\'adresse, l\'origine du plan et le zonage PLU. L\'actuelle redevient une voisine.';
        btnPrincipale.addEventListener('click', e=>{ e.stopPropagation(); choisirPrincipale(c); });

        rang.addEventListener('mouseenter', ()=>{ etatImport.survol = c.idu; rafraichirVue(); });
        rang.addEventListener('mouseleave', ()=>{ if(etatImport.survol === c.idu){ etatImport.survol = null; rafraichirVue(); } });
        casesVoisines.set(c.idu, {cb, cbProp, lab:rang});
        rang.appendChild(labProp);
        rang.appendChild(labImport);
        rang.appendChild(texte);
        rang.appendChild(btnPrincipale);
        listeVoisines.appendChild(rang);
      });
    };
    groupe('Parcelles mitoyennes', etatImport.adjacentes);
    groupe('Autres parcelles du secteur', etatImport.autres);
    if(etatImport.tropDense){
      const t = document.createElement('div');
      t.style.cssText = 'font-size:0.8rem; color:#a02020; margin-top:6px;';
      t.textContent = 'Perimetre tres dense : seules les ' + MAX_VOISINES + ' plus grandes limites communes sont proposees.';
      listeVoisines.appendChild(t);
    }
  }

  async function creerProjet(){
    const nom = (champNom.value || '').trim() || ('Parcelle ' + libelleParcelle(etatImport.principale));
    let objets;
    try {
      objets = objetsDepuisCadastre(etatImport);
    } catch(e){
      etatImport.erreur = 'Construction du plan impossible : ' + (e.message || e);
      majEtat(); return;
    }
    if(!seed.apiAvailable){
      // Mode local : pas de serveur ou ecrire. On charge quand meme le plan (meme chemin que
      // l'import JSON), en le disant clairement plutot que de faire semblant d'enregistrer.
      fermer();
      appliquerProjetImporte({ meta:{}, objets, mesures:[], ignores:0 }, true);
      showToast('Mode local : le plan cadastral est charge mais ne sera pas enregistre. Utilise Export JSON pour le conserver.');
      return;
    }
    occuper(true, 'Creation du projet…');
    try {
      const cree = await apiSave({ name: nom, objects: objets, measures: [] });
      localStorage.setItem(LS_LAST_PROJECT, cree.id);
      location.href = withProjectParam(cree.id);
    } catch(e){
      occuper(false);
      etatImport.erreur = 'Impossible de creer le projet : ' + (e.message || e);
      majEtat();
    }
  }

  rendre();
}

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
  if(threeScene) buildThreeScene(etat.objects.find(o=>o.key===etat.terrasseSelectedKey) || null);
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
    t.el.setAttribute('width', Math.max(1, t.largeur*scene.scale));
    t.el.setAttribute('height', Math.max(1, t.hauteur*scene.scale));
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
        showConfirm('Des modifications ne sont pas enregistrees. Ouvrir l\'import cadastre quand meme ?', ouvrirImportCadastre);
        return;
      }
      ouvrirImportCadastre();
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
let threeScene = null;

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
  if(!threeScene || !threeScene.dirLight) return;
  const { dirLight, dirFill, hemiLight, extent } = threeScene;
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
  threeScene.renderer.render(threeScene.scene, threeScene.camera);
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
let dernierObj3dKey = null;
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
function disposeThreeScene(){
  if(threeScene){
    cancelAnimationFrame(threeScene.raf);
    // OrbitControls (r128) attaches its drag-continuation listeners to `document`/`window`, not
    // just to the canvas being removed below - without an explicit dispose(), those listeners
    // (and everything they close over: this camera, this scene, this renderer) are never
    // released, so every 3D-view rebuild leaves the previous one pinned in memory. Over a
    // session with several rebuilds this accumulates real RAM, which is what was actually
    // driving iOS into killing the page ("Impossible de charger la page") - a step further than
    // the WebGL-context cap alone.
    if(threeScene.controls && threeScene.controls.dispose) threeScene.controls.dispose();
    disposeThreeSceneResources(threeScene.scene);
    threeScene.renderer.dispose();
    // iOS Safari caps the number of *live* WebGL contexts a page may hold at once (historically
    // as few as 8-16) and does not free one just because renderer.dispose() released its GPU
    // memory - the context object itself lingers until GC catches up. Once the cap is hit,
    // subsequent WebGLRenderer creations silently get a context where gl.createShader() returns
    // null, and Three.js passes that null straight into shaderSource() - which is exactly the
    // "Argument 1 ('shader') ... must be an instance of WebGLShader" crash reported on iPhone.
    // forceContextLoss() explicitly releases the context immediately instead of waiting on GC.
    if(threeScene.renderer.forceContextLoss) threeScene.renderer.forceContextLoss();
    if(threeScene.renderer.domElement.parentNode) threeScene.renderer.domElement.parentNode.removeChild(threeScene.renderer.domElement);
    threeScene = null;
  }
}

// ================= Visionneuse GLB (relit le dernier .glb reellement exporte) =================
// Scene Three.js totalement separee de `threeScene` (la Vue 3D "live", construite depuis les
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
    renderer.shadowMap.enabled = glbViewerShadows;
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
    if(glbViewerShadows){
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
  const camaraAConserver = (threeScene && dernierObj3dKey === cleVue)
    ? { pos: threeScene.camera.position.clone(), cible: threeScene.controls.target.clone() }
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
  if(cbAll) cbAll.checked = show3dAllObjects;
  const cbOpaque = document.getElementById('terrasse3dObjectsOpaque');
  if(cbOpaque) cbOpaque.checked = objects3dOpaque;
  const cbTextures = document.getElementById('terrasse3dTextures');
  if(cbTextures) cbTextures.checked = show3dTextures;
  const cbShadows = document.getElementById('terrasse3dShadows');
  if(cbShadows) cbShadows.checked = show3dShadows;
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
  scene.background = new THREE.Color(0xdfe7ea);

  // En mode "tous les objets", la camera et le sol doivent couvrir tout le plan, pas seulement
  // cette terrasse - sinon la maison ou la parcelle se retrouvent hors champ ou sous un sol trop
  // petit pour les recevoir.
  const ptsPourEtendue = obj ? obj.pts.slice() : [];
  // Sans terrasse, "tous les objets" n'est pas une option : ils sont la seule chose a montrer.
  if(show3dAllObjects || !obj){
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
  renderer.shadowMap.enabled = show3dShadows;
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
  dernierObj3dKey = cleVue;

  // Une seule lumiere directionnelle laisse tout ce qui lui tourne le dos (l'interieur d'un
  // retrait, le cote oppose d'un batiment) eclaire uniquement par l'ambiante plate - aucun
  // degrade pour distinguer les faces entre elles, un angle rentrant se lit alors comme une
  // seule tache uniforme. HemisphereLight (ciel/sol, degrade selon que la face regarde vers le
  // haut ou le bas) remplace l'ambiante plate, et une seconde directionnelle plus faible, venant
  // a peu pres de l'oppose de la premiere, apporte un degrade meme aux faces que le soleil
  // principal n'atteint pas.
  const hemiLight = new THREE.HemisphereLight(0xffffff, 0x4a3c2a, 0.5);
  scene.add(hemiLight);
  // Position/intensite/couleur posees juste apres construction par appliquerLumiereVue3d(),
  // d'apres la date, l'heure et le lieu de la parcelle : ces valeurs-ci ne servent qu'a exister.
  const dirLight = new THREE.DirectionalLight(0xffffff, 0.75);
  dirLight.position.set(extent, extent*1.5, extent*0.6);
  if(show3dShadows){
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
  ground.receiveShadow = show3dShadows;
  scene.add(ground);

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
    scene.add(outline);
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
      dalle.receiveShadow = show3dShadows;
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
    scene.add(objet);
  }
  // Silhouette au sol : sert pour la parcelle (jamais un bloc plein).
  function addGroundOutline(pts, color, closed){
    if(!pts || pts.length < 2) return;
    const vpts = pts.map(p=>{ const l=toLocal(p); return new THREE.Vector3(l.x, 0.008, l.z); });
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
    scene.add(mesh);
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
  function addPlot(p, yTop, color){
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
  const texturesTerrasse = show3dTextures ? {horizontale:obj.textureHorizontale, vertical:obj.textureVerticale} : null;
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
  if(show3dAllObjects || !obj){
    // "Objets opaques" ignore l'opacite du plan 2D (souvent < 1 pour voir a travers en mode
    // Plan) et force un rendu plein - plus proche d'un rendu final, quand la transparence du
    // plan de travail n'apporte plus rien face a une vraie vue 3D.
    const opaciteDe = o => objects3dOpaque ? undefined : o.fillOpacity;
    // "Texture" decoche revient a la couleur unie sans avoir a retirer la texture de chaque
    // objet - un simple objet vide desactive le rendu texture le temps de la case decochee.
    const texturesDe = o => show3dTextures ? {horizontale:o.textureHorizontale, vertical:o.textureVerticale} : null;
    etat.objects.forEach(o=>{
      if(o===obj) return;
      if(objetMasque(o)) return; // masque dans le plan = masque partout, y compris ici (voisinage compris)
      if(o.key==='parcelle' || o.fonction==='terrain'){
        addRibbonFlat(o.pts, o.fill||'#FBF3D9', 0.003, opaciteDe(o), show3dTextures ? o.textureHorizontale : null);
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
          else if(poly) addRibbonFlat(poly, couleur, 0.006, opaciteDe(o), show3dTextures ? o.textureHorizontale : null);
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
        const texToile = show3dTextures ? (o.textureHorizontale || o.textureVerticale) : null;
        if(texToile && texToile.url) matToile.map = chargerTexturePolyhaven(texToile.url);
        // Cone tres plat pose sur le mat : la silhouette d'un parasol ouvert, et surtout la meme
        // emprise circulaire au sol que le rayon utilise pour calculer l'ombre en 2D.
        const toile = new THREE.Mesh(new THREE.ConeGeometry(o.r, Math.max(0.15, o.r*0.28), 24), matToile);
        toile.position.set(pl.x, hMat + Math.max(0.15, o.r*0.28)/2, pl.z);
        scene.add(toile);
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
        if(show3dTextures && o.textureArbre && o.textureArbre.url){
          matSphere.map = chargerTexturePolyhaven(o.textureArbre.url);
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
  const parcelleCloture = trouverParcelleCloture();
  if(parcelleCloture && parcelleCloture.clotureActive && parcelleCloture.pts && parcelleCloture.pts.length>=3){
    const EPAISSEUR_CLOTURE = 0.05;
    const hauteurCloture = Math.max(0.1, parcelleCloture.clotureHauteur || 1.8);
    const couleurCloture = parcelleCloture.clotureCouleur || '#6b4a2a';
    const texturesCloture = show3dTextures && parcelleCloture.clotureTexture ? {vertical: parcelleCloture.clotureTexture} : null;
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
    if(!show3dShadows) return;
    scene.traverse(o=>{
      if(o.isMesh){ o.castShadow = true; o.receiveShadow = true; }
    });
    ground.castShadow = false;
  }
  appliquerOmbres();

  function animate(){
    threeScene.raf = requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
  }
  threeScene = { renderer, scene, camera, controls, raf:null, dirLight, dirFill, hemiLight, extent, cen };
  const sceneCourante = threeScene;
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
    if(threeScene !== sceneCourante) return;
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
  if(threeScene) buildThreeScene(obj || null);
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
  if(!threeScene) return;
  const { camera, controls, renderer, scene } = threeScene;
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
  if(!threeScene) return;
  const { controls, renderer } = threeScene;
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
  if(!threeScene){ showErrBanner('Vue 3D pas encore chargee.'); return; }
  threeScene.renderer.render(threeScene.scene, threeScene.camera); // capture le tout dernier etat
  threeScene.renderer.domElement.toBlob(blob=>{
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
  if(!obj || !threeScene) return;
  const { camera, controls, renderer, scene } = threeScene;
  camera.position.y = hauteurFinieMm(obj)/1000 + HAUTEUR_YEUX_M;
  controls.update();
  renderer.render(scene, camera);
});
// Le filaire change la geometrie, pas seulement un materiau : la scene se reconstruit.
document.getElementById('terrasse3dFilaire').addEventListener('change', function(){
  const obj = etat.objects.find(o=>o.key===etat.terrasseSelectedKey);
  if(!obj) return;
  ensureConstruction(obj).lames3dFilaire = this.checked;
  if(threeScene) buildThreeScene(obj);
});
let show3dAllObjects = true;
document.getElementById('terrasse3dAllObjects').addEventListener('change', function(){
  show3dAllObjects = this.checked;
  const obj = etat.objects.find(o=>o.key===etat.terrasseSelectedKey);
  // obj peut etre null (Vue 3D sans terrasse) : la scene se reconstruit quand meme.
  if(threeScene) buildThreeScene(obj || null);
});
let objects3dOpaque = true;
document.getElementById('terrasse3dObjectsOpaque').addEventListener('change', function(){
  objects3dOpaque = this.checked;
  const obj = etat.objects.find(o=>o.key===etat.terrasseSelectedKey);
  // obj peut etre null (Vue 3D sans terrasse) : la scene se reconstruit quand meme.
  if(threeScene) buildThreeScene(obj || null);
});
// Coche par defaut (les textures Poly Haven, une fois choisies, s'affichent) : decocher revient a
// la couleur unie du plan sans avoir a retirer la texture de chaque objet un par un - pratique
// pour comparer les deux rendus, ou pour un apercu rapide qui n'attend pas le chargement d'images.
let show3dTextures = true;
document.getElementById('terrasse3dTextures').addEventListener('change', function(){
  show3dTextures = this.checked;
  const obj = etat.objects.find(o=>o.key===etat.terrasseSelectedKey);
  // obj peut etre null (Vue 3D sans terrasse) : la scene se reconstruit quand meme.
  if(threeScene) buildThreeScene(obj || null);
});
// Decochee par defaut : une vraie ombre portee (shadow map) coute plus cher a calculer que
// l'eclairage a trois lumieres sans ombres deja en place - un utilisateur qui veut juste
// verifier une implantation n'a pas besoin de payer ce cout a chaque rendu.
let show3dShadows = false;
document.getElementById('terrasse3dShadows').addEventListener('change', function(){
  show3dShadows = this.checked;
  const obj = etat.objects.find(o=>o.key===etat.terrasseSelectedKey);
  // obj peut etre null (Vue 3D sans terrasse) : la scene se reconstruit quand meme.
  if(threeScene) buildThreeScene(obj || null);
});

// "Enregistrer la vue" cree un objet Point de vue (Mode Plan) a la position et la direction
// actuelles de la camera - l'inverse de toLocal (centroide de la terrasse ouverte) donne ses
// coordonnees plan, et l'angle horizontal camera->cible donne sa direction.
document.getElementById('terrasse3dSaveViewBtn').addEventListener('click', ()=>{
  if(!threeScene) return;
  // Centre retenu par buildThreeScene (la terrasse, ou a defaut la parcelle) : le relire ici
  // plutot que de recalculer un centroide de terrasse permet d'enregistrer un point de vue
  // meme depuis un plan sans terrasse.
  const cen = threeScene.cen || {x:0, y:0};
  const { camera, controls } = threeScene;
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
    if(threeScene && dernierObj3dKey===terr.key){
      const cen = centroid(terr.pts);
      // Position = pts[0], direction = vecteur pts[0]->pts[1] (point + vecteur, pas un angle
      // stocke a part) - normalise puis reporte a 1,5 m, une distance de conversation courante.
      const ddx = vp.pts[1].x-vp.pts[0].x, ddy = vp.pts[1].y-vp.pts[0].y;
      const dl = Math.hypot(ddx,ddy) || 1;
      const rad = Math.atan2(ddy/dl, ddx/dl);
      const eyeY = vp.altitude || 1.6;
      const lx = vp.pts[0].x-cen.x, lz = cen.y-vp.pts[0].y;
      threeScene.camera.position.set(lx, eyeY, lz);
      threeScene.controls.target.set(lx+Math.cos(rad)*1.5, eyeY, lz-Math.sin(rad)*1.5);
      threeScene.controls.update();
      threeScene.renderer.render(threeScene.scene, threeScene.camera);
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
  if(!threeScene) return;
  const host = document.getElementById('terrasse3dCanvasHost');
  const w = host.clientWidth || 600, h = host.clientHeight || 420;
  threeScene.camera.aspect = w/h;
  threeScene.camera.updateProjectionMatrix();
  threeScene.renderer.setSize(w, h);
  threeScene.renderer.render(threeScene.scene, threeScene.camera);
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
window.addEventListener('resize', ()=>{ if(threeScene) resizeThreeScene(); if(glbViewerScene) resizeGlbViewerScene(); });

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
  } else if(threeScene){
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

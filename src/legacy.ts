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
import { telechargerTexte } from './shell/download.js';
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
import { DEMO_OBJECTS, DEMO_MEASURES } from './model/demo.js';
import { LONGUEURS_BOIS_DEFAUT, LONGUEURS_LAMES_DEFAUT, PRIX_STORE, achatPlots, achatVis, chargePlot, computeAssise, computeBOM, coutDebit, largeurProduit, longueursBois, longueursDispo, longueursLambourde, parseLongueurs, prixBarre, prixBarreDefaut, prixM2De, prixPersonnalise, prixPlotUnite, prixVisUnite, setPrixBarre, setPrixM2 } from './engine/bom.js';
import { CADENCES, CHANTIER_PHASES, cadenceDe, computeChantier } from './engine/chantier.js';
import { CONCASSE_PRICE, DALLE_STAB_PRICE, ESSENCE_PRICES, GEOTEXTILE_PRICE, LAME_RIVE_EPAISSEUR_M, LAME_RIVE_PRICE, PLOT_ASSISE_MIN_CM2, PLOT_ENTRAXE_MAX_M, PLOT_HAUTEUR_DTU_CM, PLOT_HAUTEUR_MAX_CM, PLOT_MODELES, SOLIVE_PRICE, SOLIVE_SECTIONS, SUPPORT_TYPES, VISSERIE_PRICE, VIS_DEPASSEMENT_MAX_CM, VIS_DEPASSEMENT_USUEL_CM, VIS_PRICE, estPlots, plotModele } from './engine/constantes.js';
import { defaultConstruction, ensureConstruction } from './engine/construction.js';
import { hauteurAppuiMm, hauteurFinieMm, elevationOf } from './engine/hauteurs.js';
import { anneeEtSemaineDepuisDate, dateDecaleeDeSemaines } from './util/semaine.js';
import { lieuDeParcelle, libelleLieuTexte } from './model/lieu.js';
import { normalizeObjects } from './model/normalisation.js';
import { creerCreation, nouveauPointDeVue } from './model/creation.js';
import { cleObjet } from './model/cles.js';
import { construireResume } from './export/resume.js';
import { rebuildPanelTabs as construireOngletsPanneau } from './ui/panelTabs.js';
import { alignerObjetParRotation } from './interaction/outilAlignement.js';
import { exporterProjetJSON } from './io/exportProjet.js';
import { genererGlb as genererGlbModule } from './three/exportGlb.js';
import { telechargerBinaire } from './shell/download.js';
import {
  parPriorite, amenerDevant, amenerPoigneesDevant as remonterPoignees,
  reappliquerEmpilement, reculerObjet
} from './render/empilement.js';
import { interiorAngleDeg } from './geometry/angles.js';
import { creerNavigation3d, HAUTEUR_YEUX_M } from './three/navigation.js';
import { creerModes } from './app/modes.js';
import { computeDebitLames, computeDebitsBois, optimiserDebitLames } from './engine/debit.js';
import { computeImplantation, repereImplantation } from './engine/implantation.js';
import { empriseLame, etendueLame, generateParallelLines, longueurLameReelle } from './engine/lames.js';
import { ouvrirSelecteurTexture } from './ui/texturePicker.js';
import { showErrBanner, showToast, showProjectLoadError, showConfirm, showPrompt } from './shell/dialogs.js';
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
import { vue3d, glb, chargement, soleilVue3d } from './three/etat3d.js';
import { mesure, annulerMesureEnCours } from './interaction/outilMesure.js';
import { brancherPointeur } from './interaction/pointeur.js';
import { validerProjetJSON } from './io/validation.js';
import { rendreScene } from './render/pipeline.js';
import { creerHistorique } from './core/historique.js';
import {
  LS_LAST_PROJECT, getProjectIdFromUrl, withProjectParam,
  apiList, apiLoad, apiSave, apiDelete, chargerProjetInitial
} from './io/api.js';
import {
  dossierSelection, renderDossierTerrasses as construireListeDossier,
  debitTable as construireTableDebit, renderBOMTable as construireTableBom,
  champLongueurs as construireChampLongueurs, bilanDebit, prixPersonnaliseplot,
  renderDebitLames as construireDebitLames
} from './ui/tables.js';
import { appliquerProjetImporte as chargerProjetImporte, restaurerAffichageDuProjet as restaurerAffichage } from './io/projet.js';
import {
  ortho, configOrtho, enregistrerConfigOrtho, syncControlesOrtho, restaurerOrthoDuProjet,
  referenceGeoPlan, urlTuileOrtho, chargerTuileOrtho, chargerOrthophoto,
  placerOrthophoto as placerOrthophotoModule, basculerOrthophoto as basculerOrthophotoModule
} from './render/ortho.js';
import {
  startPick as demarrerPointage, cancelPick as annulerPointage,
  rebuildMeasurePanel as construirePanneauMesure, renderMeasureResults as construireResultatsMesure
} from './ui/mesurePanel.js';
import { rebuildSelector as construireSelecteur, renderDispTable as construireTableAffichage } from './ui/selector.js';

import {
  syncSemaineDepuisDate as syncSemaineSoleilVue3d,
  syncControles as syncControlesSoleil,
  appliquer as appliquerSoleilVue3d
} from './three/soleilVue3d.js';
import { chargerTexturePolyhaven, ensureGLTFLoaderLoaded } from './three/chargeurs.js';
import {
  renderTerrasseLayerTabs as construireOngletsCouches,
  renderTerrasseLayerView as dessinerCouches
} from './render/terrasseCouches.js';
import { trouverParcelleCloture as chercherParcelleCloture, syncClotureControls } from './ui/cloture.js';
import {
  attendreTexturesPretes, ensureThreeLoaded, ensureGLTFExporterLoaded,
  disposeThreeSceneResources, disposeThreeScene, disposeGlbViewerScene,
  fondGlbViewer, appliquerLumiereGlb, buildGlbViewerScene,
  syncSemaineGlb, syncControlesGlb, rafraichirVisionneuseGlb as rafraichirSceneGlb
} from './three/glbViewer.js';
import { serializeObjects, serializeMeasures } from './io/serialisation.js';
import { importSVGString as importerSVG } from './io/importSvg.js';
import { setupProjectBar, renderPanneauPlu, actualiserDepuisIgn, ouvrirDialogueActualisation, construireVoisinage } from './ui/projectBar.js';
import {
  renderTerrasseConfigurator, renderParametresCalcul, renderTerrasseCoupe, renderDebitBois,
  renderImplantation, renderChantier, renderMethode, renderOptimResult, basculerOptimisation,
  renderTerrasseSelector as construireSelecteurTerrasse
} from './ui/terrassePanels.js';
import { interrogerPluDepuisBouton } from './ui/projectBar.js';
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
import { creerScene, versEcran, versMonde } from './geometry/vue.js';
import { vue, detruireVue, viderVues, nombreDeVues } from './render/vues.js';
import { computeTerrasseLayers } from './engine/layers.js';
import { PARASOL_ELEV_MIN_DEG, PARASOL_HEURES, PARASOL_MOIS, calculerCartesOmbre, chercherMeilleurePositionParasol, contraindreParasols, decalageMat, echantillonsSoleilParasol, geometrieOmbre, grillePolygone, hauteurParasolDe, matAngleDe, ombreInstantanee, pointDansOmbre, pointsPerimetre, positionMat, projeterSurPerimetre, terrasseDuParasol } from './engine/parasol.js';
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
// Le client de api.php vit dans io/api.ts. Cette enveloppe lui fournit le jeu de demonstration :
// c'est le seul endroit qui decide de quoi demarrer quand il n'y a pas de serveur.
async function loadInitialProject(){ return chargerProjetInitial(DEMO_OBJECTS, DEMO_MEASURES); }



function boot(seed){

// ================= Etat de l'application (spec §6.1) =================
// Un seul objet, cree ici, en tete de boot() : tout ce qui etait une variable libre de cette
// fermeture le rejoint au fil de la migration. `normalizeObjects` est passe en parametre parce
// qu'il vit encore dans ce fichier - core/ ne doit pas dependre de legacy (§3.3).
const etat = creerEtat(seed, normalizeObjects);

// Ce dont la barre de projet, l'actualisation cadastrale et le panneau PLU ont besoin. Fabrique a
// chaque appel : ce contexte porte des fonctions qui n'existent qu'une fois boot() lance.
// Le selecteur et la table d'affichage vivent dans ui/selector.ts ; ces enveloppes leur passent
// l'etat et ce qu'ils doivent pouvoir declencher.
function rebuildSelector(){ construireSelecteur(etat, ctxListes()); }
function renderDispTable(){ construireTableAffichage(etat, ctxListes()); }
// Le chargement d'un projet importe vit dans io/projet.ts ; ces enveloppes lui passent l'etat et
// ce qu'il doit pouvoir declencher.
function ctxProjetImporte(){
  return { buildThreeScene, fitToObject, lieuActuel, markDirty, pushHistory, rebuildSelector,
    render, restoreState, syncBasculeGrille, syncBasculeVoisinage, syncLieuTitre,
    trouverParcelleCloture, validerProjetJSON, toScreen, orthoGroup: ()=>orthoGroup, etat };
}
function appliquerProjetImporte(valide, remplacer){ chargerProjetImporte(valide, remplacer, etat, ctxProjetImporte()); }
function restaurerAffichageDuProjet(){ restaurerAffichage(etat, ctxProjetImporte()); }
// Les tables du dossier et du chiffrage vivent dans ui/tables.ts, les panneaux du mode Terrasse
// dans ui/terrassePanels.ts : ces deux fabriques leur passent ce qu'ils doivent pouvoir declencher.
function ctxTables(){
  return { refreshTerrasseView, renderDebitLames: (o,l)=>construireDebitLames(o, l, ctxTables()),
    renderDebitBois: (o,l)=>renderDebitBois(o, l, ctxPanneauxTerrasse()) };
}
function ctxPanneauxTerrasse(){
  return { bilanDebit, champLongueurs: (c,ch,lib)=>construireChampLongueurs(c, ch, lib, ctxTables()),
    debitTable: (h,c,d,l,k)=>construireTableDebit(h,c,d,l,k,ctxTables()),
    hauteurAppuiMm, hauteurFinieMm, prixPersonnaliseplot, pushHistory, refreshTerrasseView,
    objets: ()=>etat.objects };
}
function ctxListes(){ return { markDirty, render, restoreState }; }

// L'outil de cotation vit dans ui/mesurePanel.ts ; ces enveloppes lui passent l'etat et ce qu'il
// doit pouvoir declencher.
function ctxMesure(){ return { render, computeMeasureGeom, refLabel, targetLabel }; }
function rebuildMeasurePanel(){ construirePanneauMesure(etat, ctxMesure()); }
function renderMeasureResults(){ construireResultatsMesure(etat, ctxMesure()); }
function startPick(mode, multi, purpose){ demarrerPointage(mode, multi, purpose, etat, ctxMesure()); }
function cancelPick(){ annulerPointage(etat, ctxMesure()); }

function ctxProjet(){
  return {
    etat, apiDelete, apiSave, lieuActuel, markDirty, pushHistory, rebuildSelector,
    refreshProjectStatus: ()=>historique.declencherRafraichissementStatut(),
    render, restoreState, serializeMeasures, serializeObjects, syncBasculeVoisinage,
    syncLieuTitre, trouverParcelleCloture, withProjectParam,
    initialState: ()=>initialState,
    initialMeasures: ()=>initialMeasures,
    cleDernierProjet: LS_LAST_PROJECT,
    ouvrirDialogueActualisation: (b)=>ouvrirDialogueActualisation(b, ctxProjet()),
    actualiserDepuisIgn: (o,b)=>actualiserDepuisIgn(o, b, ctxProjet()),
    construireVoisinage,
    definirRafraichisseurStatut: (f)=>historique.definirRafraichisseurStatut(f),
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
// L'historique vit dans core/historique.ts ; il a ete sorti tel quel, pour etre reecrit ensuite -
// son en-tete dit ce qu'une reecriture doit savoir (pas de retablissement, instantane complet,
// meme liste blanche que l'enregistrement).
const historique = creerHistorique(etat, {
  serializeObjects, serializeMeasures, normalizeObjects, detruireVue, createObjectDOM,
  rebuildHandles, reapplyStackingOrder, rebuildSelector, renderMeasureResults, render,
  boutonAnnuler: ()=>document.getElementById('undoBtn')
});
historique.brancherRaccourci();

function markDirty(){ historique.marquerModifie(); }
function pushHistory(){ historique.empiler(); }
function restoreState(snapshot){ historique.restaurer(snapshot); }
function undo(){ historique.annuler(); }
function updateUndoBtn(){ historique.majBoutonAnnuler(); }
// ================= Top-level panel tabs (Edition / Affichage / Mesure / Export) =================
// panelTab, selectedKey, highlight et attrTab vivent desormais dans `etat` (spec §6.1).
// Les onglets du panneau lateral vivent dans ui/panelTabs.ts.
function rebuildPanelTabs(){
  construireOngletsPanneau(etat, {
    rebuildMeasurePanel, renderMeasureResults,
    renderPanneauPlu: ()=>renderPanneauPlu(ctxProjet()),
    construireListeDossier: ()=>construireListeDossier(etat)
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
// La mise en forme des objets qui entrent dans le plan vit dans model/normalisation.ts.
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
// Un objet par sa cle, et la position monde d'un evenement de pointeur : deux raccourcis dont le
// reste du fichier se sert partout.
function objByKey(key){ return etat.objects.find(o=>o.key===key); }
function worldFromEvent(e){
  const rect = stage.getBoundingClientRect();
  return toWorld({x:e.clientX-rect.left, y:e.clientY-rect.top});
}

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
etat.objects.slice().sort(parPriorite).forEach(createObjectDOM);

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
rebuildSelector();


// L'ordre d'empilement vit dans render/empilement.ts ; ces enveloppes lui passent la racine SVG et
// la vue de chaque objet.
function ctxEmpilement(){ return { svg, vue }; }
function bringToFront(obj){ amenerDevant(obj, ctxEmpilement()); }
function amenerPoigneesDevant(obj){ remonterPoignees(obj, ctxEmpilement()); }
function reapplyStackingOrder(){ reappliquerEmpilement(etat.objects, ctxEmpilement()); }
function sendObjectBackward(obj){
  if(!reculerObjet(obj, etat.objects)) return;
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
  contraindreParasols(etat.objects, etat.terrasseSelectedKey);
  dessinerCalqueParasols({
    groupeOmbres: parasolGroup, groupeMats: parasolMatGroup, racine: svg,
    etat, ctxSoleil: contexteSoleilParasol(), positionMat
  });
}


// Le dessin du plan est orchestre dans render/pipeline.ts ; cette enveloppe lui fournit l'etat et
// les briques qu'il assemble.
function render(){ rendreScene(etat, ctxRendu()); }
function ctxRendu(){
  return { drawGrid, renderParasolOverlay, amenerPoigneesDevant, objetMasque, rebuildHandles,
    renderAttrTable, renderDispTable, drawScaleBar, drawNorthArrow, drawMeasures,
    renderMeasureResults, renderTerrasseLayerView, estTerrain, trouverParcelleCloture,
    toScreen, markDirty, lieuActuel, render, etat, orthoGroup: ()=>orthoGroup };
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


// L'angle interieur d'un sommet vit dans geometry/angles.ts.




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
    pickState: ()=>mesure.pointage,
    vue3dOuverte: ()=>vue3d.scene
  });
}


// ================= Display toggle table per object =================

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
// Ajout et retrait d'un sommet : l'operation vit ici parce qu'elle touche a l'historique et au
// rendu, que le module de pointeur ne connait pas.
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

// Les evenements de pointeur vivent dans interaction/pointeur.ts ; ce branchement leur fournit
// l'etat et tout ce qu'ils doivent pouvoir declencher.
brancherPointeur(svg, stage, etat, {
  insertPointOnSegment, deleteVertex, objByKey, pushHistory, rebuildHandles,
  rebuildMeasurePanel, rebuildSelector, render, renderAttrTable, sendObjectBackward,
  toWorld, worldFromEvent
});


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
document.getElementById('chkOrtho').addEventListener('change', e=>{ basculerOrthophotoModule(e.target.checked, { trouverParcelleCloture, render, toScreen, markDirty, lieuActuel, etat, orthoGroup: ()=>orthoGroup }); });
document.getElementById('orthoOpacite').addEventListener('input', function(){
  ortho.opacite = parseInt(this.value,10)/100;
  document.getElementById('orthoOpaciteTexte').textContent = this.value + ' %';
  if(ortho.actif) placerOrthophotoModule({ trouverParcelleCloture, render, toScreen, markDirty, lieuActuel, etat, orthoGroup: ()=>orthoGroup });
  enregistrerConfigOrtho({ trouverParcelleCloture, render, toScreen, markDirty, lieuActuel, etat, orthoGroup: ()=>orthoGroup });
});
document.getElementById('orthoParcelleOpacite').addEventListener('input', function(){
  ortho.parcelleOpacite = parseInt(this.value,10)/100;
  document.getElementById('orthoParcelleOpaciteTexte').textContent = this.value + ' %';
  // Seul l'affichage change : render() reapplique l'opacite effective sur les terrains.
  if(ortho.actif) render();
  enregistrerConfigOrtho({ trouverParcelleCloture, render, toScreen, markDirty, lieuActuel, etat, orthoGroup: ()=>orthoGroup });
});
document.getElementById('orthoParcelleDefaut').addEventListener('click', function(){
  ortho.parcelleOpacite = 0.15;
  syncControlesOrtho();
  if(ortho.actif) render();
  enregistrerConfigOrtho({ trouverParcelleCloture, render, toScreen, markDirty, lieuActuel, etat, orthoGroup: ()=>orthoGroup });
});

// ================= Add / delete whole object =================
// newObjCounter : dans `etat` (spec 6.1). La naissance et la mort d'un objet vivent dans
// model/creation.ts ; ces enveloppes lui fournissent l'etat et les briques qu'il assemble.
function ctxCreation(){
  return { pushHistory, createObjectDOM, rebuildHandles, reapplyStackingOrder, rebuildSelector,
    render, detruireVue, serializeObjects, normalizeObjects, showToast, showConfirm };
}
function addNewObject(enRectangle){ creerCreation(etat, ctxCreation()).ajouterObjet(enRectangle); }
function addNewPath(){ creerCreation(etat, ctxCreation()).ajouterChemin(); }
function addNewCircle(){ creerCreation(etat, ctxCreation()).ajouterCercle(); }
function addNewParasol(){ creerCreation(etat, ctxCreation()).ajouterParasol(); }
function addNewViewpoint(){ creerCreation(etat, ctxCreation()).ajouterPointDeVue(); }
function duplicateSelectedObject(){ creerCreation(etat, ctxCreation()).dupliquer(); }
function deleteSelectedObject(){ creerCreation(etat, ctxCreation()).supprimer(); }


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

// Le resume vit dans export/resume.ts ; ici, seulement de quoi l'afficher.
document.getElementById('exportBtn').addEventListener('click', ()=>{
  const out = construireResume(etat.objects, etat.measures, {
    appVersion: APP_VERSION, computeMeasureGeom, refLabel, targetLabel
  });
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
// L'export GLB vit dans three/exportGlb.ts.
function genererGlb(btn, telecharger){
  genererGlbModule(etat, btn, telecharger, {
    buildThreeScene, rafraichirVisionneuseGlbSiOuverte, telechargerBinaire
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




// L'alignement vit dans interaction/outilAlignement.ts, a cote du cote de reference qu'il lit.
function alignObjectByRotation(obj){
  const champ = document.getElementById('alignDistanceInput');
  alignerObjetParRotation(obj, etat, champ ? champ.value : '', {
    measureSegCoords, nearestSegmentIndex, alignerSurCote, pointInPolygon,
    contourDeContrainte: (o)=>contourDeContrainte(etat.objects, o),
    pushHistory, rebuildHandles, render, showToast
  });
}


// Le dessin des cotes vit dans render/measures.ts ; cette enveloppe fournit ce que le module ne
// lit plus lui-meme : les objets, les mesures et la cote en cours de saisie.
function drawMeasures(){
  dessinerCotes(measureGroup, {
    scene: etat.scene,
    objets: etat.objects,
    mesures: etat.measures,
    brouillonRef: mesure.ref,
    brouillonCibles: mesure.cibles
  });
}

document.getElementById('recalcMeasureBtn').addEventListener('click', ()=>{
  renderMeasureResults();
  render();
});

document.getElementById('clearMeasureBtn').addEventListener('click', ()=>{
  const doClear = ()=>{
    etat.measures = []; mesure.cibles = []; mesure.ref = null; mesure.pointage = null;
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



// ================= Import / Export du projet en JSON (fichier local) =================
// Le fichier produit est exactement la reponse de api.php?action=load ({meta, objects,
// measures}) : ce qui sort d'ici se recharge tel quel ici, et se repost e a action=save une
// fois remis a plat ({name, objects, measures}). L'import accepte les deux formes.


// L'export du projet vit dans io/exportProjet.ts.
function exportProjetJSON(){
  exporterProjetJSON(etat, document.getElementById('chkExportSansParcelle').checked, {
    serializeObjects, serializeMeasures, telechargerTexte, showToast,
    appVersion: APP_VERSION, schemaVersion: SCHEMA_VERSION,
    metaProjet: ()=>(seed && seed.meta) || {}
  });
}

const IMPORT_JSON_TAILLE_MAX = 5 * 1024 * 1024;



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






// ================= Fond orthophoto (WMTS IGN, calque de reference) =================
// Le plan est en metres dans un repere local ; les tuiles WMTS, elles, sont decoupees en
// longitude/latitude. Le raccord se fait par un point de calage connu : l'origine (0,0) du plan,
// dont la position reelle est enregistree par l'import cadastre (cadastre.origineLat/Lon). Sans
// import cadastre, on retombe sur le lieu de la parcelle, cale sur son centroide - moins precis,
// mais coherent avec ce que l'appli sait du terrain.
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


// ================= Actualisation des donnees IGN d'un plan existant =================



// ================= Onglet PLU (Geoportail de l'urbanisme) =================
// L'interrogation vit dans ui/projectBar.ts, a cote du panneau qu'elle remplit.
document.getElementById('pluInterrogerBtn').addEventListener('click', function(){
  interrogerPluDepuisBouton(this, ctxProjet());
});












// Les hauteurs (appui, hauteur finie, elevation) vivent dans engine/hauteurs.ts : elles sont lues
// par le plan de coupe, la 3D, le dossier PDF et le chiffrage, et doivent rester une seule regle.

// La barre de choix de la terrasse vit dans ui/terrassePanels.ts.
function rebuildTerrasseSelector(){
  return construireSelecteurTerrasse(etat, modes.sousOnglet, { refreshTerrasseView, hauteurFinieMm });
}



// Le calque des couches vit dans render/terrasseCouches.ts ; ces enveloppes lui fournissent son
// groupe SVG, l'etat et la transformation d'ecran.
const terrasseLayerGroup = document.createElementNS(svgNS,'g');
svg.appendChild(terrasseLayerGroup);

function renderTerrasseLayerTabs(obj){ construireOngletsCouches(obj, ()=>renderTerrasseLayerView(obj)); }
function renderTerrasseLayerView(obj){ dessinerCouches(terrasseLayerGroup, obj, etat, toScreen); }


// ================= Coupe verticale (empilement des couches, a l'echelle) =================

// ================= Vue 3D (Three.js, charge a la demande depuis un CDN) =================
// Seule dependance externe de tout le fichier, et uniquement chargee si on ouvre la vue 3D :
// le reste de l'appli reste 100% autonome sans connexion internet.

// Le soleil de la Vue 3D vit dans three/soleilVue3d.ts, son etat dans `soleilVue3d` (etat3d.ts),
// dans les memes champs que celui de la visionneuse et volontairement separe de lui.
function ctxSoleilVue3d(){ return { lieuActuel, libelleLieu, formatHeureMin }; }
function syncSemaineVue3dDepuisDate(){ syncSemaineSoleilVue3d(); }
function syncControlesSoleilVue3d(){ syncControlesSoleil(ctxSoleilVue3d()); }
function appliquerLumiereVue3d(){ appliquerSoleilVue3d(ctxSoleilVue3d()); }

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
function lieuActuel(){ return lieuDeParcelle(trouverParcelleCloture()); }
function libelleLieu(){ return libelleLieuTexte(lieuActuel()); }
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
// Le curseur "semaine" et le rafraichissement de la visionneuse vivent dans three/glbViewer.ts.
function syncSemaineDepuisDate(){ syncSemaineGlb(); }
function rafraichirVisionneuseGlb(camaraAConserver){
  rafraichirSceneGlb(camaraAConserver, { lieuActuel, render, renderVue3DSelect });
}
// Un nouvel export pendant que l'onglet est deja ouvert doit se refleter sans que l'utilisateur
// ait besoin de le rouvrir - mais ne construit rien si l'onglet n'est pas affiche (pas de scene
// qui tourne en arriere-plan sans que personne ne la regarde).
function rafraichirVisionneuseGlbSiOuverte(){
  if(glb.ouvert) rafraichirVisionneuseGlb();
}
// L'ouverture et la fermeture de la visionneuse appartiennent au pilotage des vues (app/modes.ts) :
// c'est la qu'on decide qui recouvre la page. Ne reste ici que ce qui lui est propre.
function preparerVisionneuse(){
  disposeThreeScene(); // une seule scene 3D active a la fois
  syncLieuGlbViewer();
  syncControlesGlb(formatHeureMin);
  rafraichirVisionneuseGlb();
}
function quitterPleinPageVisionneuse(){
  if(nav3d.glbViewerPleinePage) setGlbViewerPleinePage(false);
}

// La scene 3D est construite dans three/scene.ts ; cette enveloppe lui passe l'etat et ce qu'elle
// doit pouvoir declencher.
function buildThreeScene(obj){
  construireScene3D(obj, etat, {
    appliquerLumiereVue3d, applyMode3D, chargerTexturePolyhaven, disposeThreeScene, elevationOf,
    hauteurAppuiMm, objetMasque, positionMat, render, renderVue3DSelect, syncClotureControls,
    syncControlesSoleilVue3d, trouverParcelleCloture, buildThreeScene,
    orthoActif: ()=>ortho.actif,
    orthoTuiles: ()=>ortho.tuiles
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
// La cloture et sa parcelle porteuse vivent dans ui/cloture.ts.
function trouverParcelleCloture(){ return chercherParcelleCloture(etat.objects); }
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
// Le pilotage des deux vues 3D (zoom, mode du glisser, points de vue, plein page) vit dans
// three/navigation.ts ; ces enveloppes gardent les noms qu'utilisent les ecouteurs.
const nav3d = creerNavigation3d(etat, {
  showToast, showErrBanner, centroid, hauteurFinieMm,
  ouvrirVue3d: ()=>modes.goVue3D()
});
function zoom3D(factor){ nav3d.zoom3D(factor); }
function applyMode3D(){ nav3d.applyMode3D(); }
function setMode3D(m){ nav3d.setMode3D(m); }
function allerAuPointDeVue(vp){ nav3d.allerAuPointDeVue(vp); }
function allerAuPointDeVueGlb(vp){ nav3d.allerAuPointDeVueGlb(vp); }
function resizeThreeScene(){ nav3d.resizeThreeScene(); }
function resizeGlbViewerScene(){ nav3d.resizeGlbViewerScene(); }
function setVue3dPleinePage(actif){ nav3d.setVue3dPleinePage(actif); }
function setGlbViewerPleinePage(actif){ nav3d.setGlbViewerPleinePage(actif); }
document.getElementById('terrasse3dZoomIn').addEventListener('click', ()=>zoom3D(0.8));
document.getElementById('terrasse3dZoomOut').addEventListener('click', ()=>zoom3D(1.25));
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
document.getElementById('terrasse3dEyeLevel').addEventListener('click', ()=>nav3d.hauteurDesYeux());
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
  // Meme fabrique que le bouton "+ Point de vue" du plan : seules la direction et l'altitude
  // changent. En revanche l'objet n'est PAS selectionne ici et le plan n'est pas redessine : on est
  // dans la Vue 3D, changer la selection du plan sous l'utilisateur n'aurait pas de sens.
  const { obj: newObj } = nouveauPointDeVue(
    { x: planX, y: planY }, cleObjet('path', etat), n,
    { x: planDx, y: planDz }, camera.position.y
  );
  etat.objects.push(newObj);
  createObjectDOM(newObj);
  rebuildHandles(newObj);
  reapplyStackingOrder();
  rebuildSelector();
  showToast('Point de vue cree : "' + newObj.name + '" (visible en Mode Plan).');
});

document.getElementById('terrasse3dFullPageBtn').addEventListener('click', ()=>{
  setVue3dPleinePage(!nav3d.vue3dPleinePage);
});
document.getElementById('glbViewerFullPageBtn').addEventListener('click', ()=>{
  setGlbViewerPleinePage(!nav3d.glbViewerPleinePage);
});
window.addEventListener('keydown', e=>{
  if(e.key === 'Escape' && nav3d.vue3dPleinePage) setVue3dPleinePage(false);
  if(e.key === 'Escape' && nav3d.glbViewerPleinePage) setGlbViewerPleinePage(false);
});
// La fenetre peut changer de taille pendant que la vue est ouverte (plein page ou non) : le
// canvas suit, au lieu de rester fige a la taille qu'il avait au dernier rendu de la scene.
window.addEventListener('resize', ()=>{ if(vue3d.scene) resizeThreeScene(); if(glb.scene) resizeGlbViewerScene(); });

// Le pilotage des modes vit dans app/modes.ts ; ces enveloppes gardent les noms qu'utilisent les
// ecouteurs et les panneaux.
const modes = creerModes(etat, {
  stage, terrasseLayerGroup, rebuildTerrasseSelector, fitToObject,
  ensureConstruction, ensureThreeLoaded, buildThreeScene, disposeThreeScene, render,
  preparerVisionneuse, quitterPleinPageVisionneuse, disposeGlbViewerScene,
  rendrePanneauxTerrasse(obj){
    renderTerrasseConfigurator(obj, ctxPanneauxTerrasse());
    renderTerrasseLayerTabs(obj);
    renderTerrasseLayerView(obj);
    renderTerrasseCoupe(obj, ctxPanneauxTerrasse());
    construireTableBom(obj, etat, ctxTables());
    renderOptimResult(obj, ctxPanneauxTerrasse());
    renderImplantation(obj, ctxPanneauxTerrasse());
    renderChantier(obj, ctxPanneauxTerrasse());
    renderMethode(obj, ctxPanneauxTerrasse());
  }
});
function refreshTerrasseView(){ modes.refreshTerrasseView(); }
function rebuildTerrasseSubTabs(){ modes.rebuildTerrasseSubTabs(); }
function updateStagePlacement(){ modes.updateStagePlacement(); }



// The optimiser panel stays open once asked for, and re-ranks itself after every change, so
// the user can watch a config they are editing move up or down the list.
document.getElementById('terrasseOptimBtn').addEventListener('click', ()=>{
  const obj = etat.objects.find(o=>o.key===etat.terrasseSelectedKey);
  if(!obj) return;
  document.getElementById('terrasseOptimBtn').textContent =
    basculerOptimisation() ? 'Masquer l\'optimisation' : 'Optimisation des parametres';
  renderOptimResult(obj, ctxPanneauxTerrasse());
});
document.getElementById('modePlanBtn').addEventListener('click', ()=>modes.allerAuPlan());
document.getElementById('modeTerrasseBtn').addEventListener('click', ()=>modes.allerAuModeTerrasse());
document.getElementById('mode3dBtn').addEventListener('click', ()=>modes.goVue3D());
document.getElementById('glbViewerBtn').addEventListener('click', ()=>modes.ouvrirVisionneuse());
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
  const deltaSemaines = nouvelleValeur - glb.semaineAffichee;
  glb.semaineAffichee = nouvelleValeur;
  if(deltaSemaines === 0) return;
  glb.dateStr = dateDecaleeDeSemaines(glb.dateStr, deltaSemaines);
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
  soleilVue3d.dateStr = this.value;
  syncSemaineVue3dDepuisDate();
  appliquerLumiereVue3d();
});
document.getElementById('vue3dSemaine').addEventListener('input', function(){
  const nouvelleValeur = parseInt(this.value,10);
  const deltaSemaines = nouvelleValeur - soleilVue3d.semaineAffichee;
  soleilVue3d.semaineAffichee = nouvelleValeur;
  if(deltaSemaines === 0) return;
  soleilVue3d.dateStr = dateDecaleeDeSemaines(soleilVue3d.dateStr, deltaSemaines);
  document.getElementById('vue3dDate').value = soleilVue3d.dateStr;
  appliquerLumiereVue3d();
});
document.getElementById('vue3dHeure').addEventListener('input', function(){
  soleilVue3d.minutes = parseInt(this.value,10);
  document.getElementById('vue3dHeureTexte').textContent = formatHeureMin(soleilVue3d.minutes);
  appliquerLumiereVue3d();
});
document.getElementById('vue3dIntensite').addEventListener('input', function(){
  const pct = parseInt(this.value,10);
  soleilVue3d.intensiteSoleil = pct/100;
  document.getElementById('vue3dIntensiteTexte').textContent = pct + ' %';
  appliquerLumiereVue3d();
});
document.getElementById('vue3dLumiereAppoint').addEventListener('change', function(){
  soleilVue3d.lumiereAppoint = this.checked;
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
restaurerOrthoDuProjet({ trouverParcelleCloture, render, toScreen, markDirty, lieuActuel, etat, orthoGroup: ()=>orthoGroup });
// Masquage du voisinage : meme mecanique, meme rangement sur la parcelle.
restaurerAffichageDuProjet();

}

// main.ts n'a plus besoin que de ces deux points d'entree : l'ecran de reprise vient desormais
// directement de ui/dialogs.
export { boot, loadInitialProject };

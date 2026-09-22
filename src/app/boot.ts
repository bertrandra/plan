// Racine de composition de l'application (spec §4 Phase 4, §6 "Killing the boot() closure").
//
// Tout ce qui restait dans `legacy.ts` etait du cablage, et il tenait dans une seule fermeture
// parce que tout y fermait sur `etat`, sur la racine SVG et sur une soixantaine d'enveloppes.
// C'est ce qui l'avait rendu insecable jusqu'ici : sortir un ecouteur, c'etait sortir tout ce sur
// quoi il fermait.
//
// Ce fichier est la reponse : la fermeture EST `boot()`, mais elle vit maintenant dans un module
// type plutot que dans `legacy.ts` sous `@ts-nocheck`. `app/atelier.ts` decrit deja la forme de
// l'objet nomme que `boot()` construit (`Atelier`) et que les groupes d'ecouteurs recoivent en
// parametre. Rien ne change de place dans l'ordre d'execution ici — seule la portee devient
// verifiee par le compilateur.
//
// Pas de bus d'evenements (§6.3 l'esquissait, jamais construit) : `render()` reste appele
// directement depuis chaque enveloppe qui modifie le plan, exactement comme avant. §6.3
// l'autorisait deja explicitement ("Keep that — do not introduce reactivity").
import { centroid, pointInPolygon } from '../geometry/basic.js';
import { formatHeureMin } from '../util/format.js';
import { telechargerTexte } from '../shell/download.js';
import { el, elOpt } from '../shell/dom.js';
import { projectOntoSegment, nearestSegmentIndex } from '../geometry/segments.js';
import { DEMO_OBJECTS, DEMO_MEASURES } from '../model/demo.js';
import { ensureConstruction } from '../engine/construction.js';
import { hauteurAppuiMm, hauteurFinieMm, elevationOf } from '../engine/hauteurs.js';
import { lieuDeParcelle, libelleLieuTexte } from '../model/lieu.js';
import { normalizeObjects } from '../model/normalisation.js';
import { creerCreation } from '../model/creation.js';
import { construireResume } from '../export/resume.js';
import { rebuildPanelTabs as construireOngletsPanneau, activerOnglet as activerOngletPanneau } from '../ui/panelTabs.js';
import { alignerObjetParRotation } from '../interaction/outilAlignement.js';
import { exporterProjetJSON } from '../io/exportProjet.js';
import { genererGlb as genererGlbModule } from '../three/exportGlb.js';
import { brancherObjets } from './ecouteurs/objets.js';
import { brancherAffichage } from './ecouteurs/affichage.js';
import { brancherVue3d } from './ecouteurs/vue3d.js';
import { brancherBoutonsDeVue } from './ecouteurs/modes.js';
import { brancherVisionneuse } from './ecouteurs/visionneuse.js';
import { brancherCommandesSoleil } from './ecouteurs/soleil.js';
import { brancherExports } from './ecouteurs/exports.js';
import { brancherFichiers } from './ecouteurs/fichiers.js';
import { brancherCloture } from './ecouteurs/cloture.js';
import { brancherDivers, brancherFiletsDErreur } from './ecouteurs/divers.js';
import { creerRegistre } from './commandes.js';
import { creerMagasin } from './magasin.js';
import { telechargerBinaire } from '../shell/download.js';
import {
  parPriorite, amenerPoigneesDevant as remonterPoignees, reappliquerEmpilement, reculerObjet,
  type ContexteEmpilement
} from '../render/empilement.js';
import { interiorAngleDeg } from '../geometry/angles.js';
import { creerNavigation3d, HAUTEUR_YEUX_M } from '../three/navigation.js';
import { creerModes } from './modes.js';
import { showErrBanner, showToast, showConfirm } from '../shell/dialogs.js';
import { dessinerFlecheNord, dessinerEchelle } from '../render/decor.js';
import { dessinerGrille } from '../render/grille.js';
import { geometrieMesure, coordonneesCote, dessinerCotes } from '../render/measures.js';
import { editerAngle, editerLongueur, contourDeContrainte } from '../interaction/editing.js';
import { insererSommet, supprimerSommet, minimumSommets } from '../model/sommets.js';
import { alignerSurCote } from '../geometry/alignement.js';
import { renderAttrTable as renderAttrTablePanneau } from '../ui/attrPanel.js';
import { vue3d, glb, soleilVue3d } from '../three/etat3d.js';
import { mesure } from '../interaction/outilMesure.js';
import { brancherPointeur } from '../interaction/pointeur.js';
import { validerProjetJSON } from '../io/validation.js';
import { rendreScene } from '../render/pipeline.js';
import { creerHistorique } from '../core/historique.js';
import { LS_LAST_PROJECT, withProjectParam, apiSave, apiDelete, chargerProjetInitial } from '../io/api.js';
import {
  clesDossier,
  debitTable as construireTableDebit, renderBOMTable as construireTableBom,
  champLongueurs as construireChampLongueurs, bilanDebit, prixPersonnaliseplot,
  renderDebitLames as construireDebitLames
} from '../ui/tables.js';
import { appliquerProjetImporte as chargerProjetImporte, restaurerAffichageDuProjet as restaurerAffichage } from '../io/projet.js';
import { ortho, restaurerOrthoDuProjet } from '../render/ortho.js';
import {
  startPick as demarrerPointage, rebuildMeasurePanel as construirePanneauMesure,
  renderMeasureResults as construireResultatsMesure
} from '../ui/mesurePanel.js';
import { synchroniserContexteTerrasse, terrasseCourante as terrasseCouranteDe } from '../core/contexteTerrasse.js';
import { creerExplorateur } from './explorateur.js';

import {
  syncSemaineDepuisDate as syncSemaineSoleilVue3d,
  syncControles as syncControlesSoleil,
  appliquer as appliquerSoleilVue3d
} from '../three/soleilVue3d.js';
import { chargerTexturePolyhaven } from '../three/chargeurs.js';
import { renderTerrasseLayerView as dessinerCouches } from '../render/terrasseCouches.js';
import { trouverParcelleCloture as chercherParcelleCloture, syncClotureControls } from '../ui/cloture.js';
import {
  ensureThreeLoaded, disposeThreeScene, disposeGlbViewerScene, appliquerLumiereGlb, syncSemaineGlb,
  syncControlesGlb, rafraichirVisionneuseGlb as rafraichirSceneGlb
} from '../three/glbViewer.js';
import type { CameraConservee } from '../three/glbViewer.js';
import { serializeObjects, serializeMeasures } from '../io/serialisation.js';
import { importSVGString as importerSVG } from '../io/importSvg.js';
import { renderPanneauPlu, actualiserDepuisIgn, ouvrirDialogueActualisation, construireVoisinage } from '../ui/projectBar.js';
import { ouvrirImportCadastre } from '../ui/cadastreDialog.js';
import { creerProjet } from './projet.js';
import { monterZones } from '../zones/monter.js';
import {
  renderTerrasseConfigurator, renderTerrasseCoupe, renderDebitBois, renderImplantation,
  renderChantier, renderMethode, renderOptimResult, basculerOptimisation
} from '../ui/terrassePanels.js';
import { interrogerPluDepuisBouton } from '../ui/projectBar.js';
import { buildThreeScene as construireScene3D } from '../three/scene.js';
import { cadrerSur, empriseDe } from '../interaction/navigation.js';
import { creerDomObjet, reconstruirePoignees } from '../render/objects.js';
import { dessinerCalqueParasols } from '../render/parasolOverlay.js';
import { svgNS } from '../render/svg.js';
import { creerEtat } from '../core/state.js';
import { versEcran, versMonde } from '../geometry/vue.js';
import { vue, detruireVue } from '../render/vues.js';
import { contraindreParasols, positionMat } from '../engine/parasol.js';
import { APP_VERSION, SCHEMA_VERSION, BUILD_AT, signatureExport } from '../model/version.js';
import { construireDXF } from '../export/dxfPlan.js';
import { construireSVG } from '../export/svgPlan.js';
import { construirePDF } from '../export/pdfPlan.js';
import { construireDossierPDF } from '../export/dossierPdf.js';
import { aDesSommets, enPoints } from '../model/formes.js';
import type { ObjetPlan, ObjetAPoints, ObjetBrut, PtBrut, PtEcran, Mesure, Construction } from '../model/types.js';
import type { FormeASommets } from '../model/sommets.js';
import type { ObjetRendu } from '../render/objects.js';
import type { CouchesTerrasse } from '../engine/layers.js';
import type { Debit } from '../engine/debit.js';
import type { ProduitBarre } from '../engine/bom.js';
import type { Pointage } from '../interaction/outilMesure.js';
import type { Mode3D } from '../three/navigation.js';
import type { PointDeVue } from '../three/etat3d.js';
import type { OptionsActualisation } from '../ui/projectBar.js';
import type { ProjetValide } from '../io/validation.js';
import type { Instantane } from '../core/history.js';

brancherFiletsDErreur();

/**
 * Le passage « ce qui arrive de dehors » -> « les objets du plan ». `normalizeObjects` clone et
 * complete, mais ne fabrique pas de `key` : celle-la vient du fichier. L'affirmation se fait donc
 * ici, au meme endroit pour les trois appelants (etat initial, historique, duplication), et nulle
 * part ailleurs — c'est exactement ce que demande la signature de `creerEtat` (core/state.ts).
 */
function normaliserEnObjetsDuPlan(bruts: ObjetBrut[]): ObjetPlan[] {
  return normalizeObjects(bruts) as ObjetPlan[];
}

/**
 * Les fonctions de geometrie demandent un objet dont `pts`, `vertexNames` et `segmentNames`
 * existent ; `enPoints` (model/formes.ts) n'affirme que les sommets. Les enveloppes ci-dessous ne
 * sont appelees que sur des formes a points, que la serialisation a completees : le dire une fois
 * vaut mieux qu'un `as` a chaque ligne.
 */
function aPoints(obj: ObjetPlan): ObjetAPoints & FormeASommets {
  return enPoints(obj) as ObjetAPoints & FormeASommets;
}

/**
 * Meme idee pour le dessin : `render/objects.ts` demande un objet dont l apparence est complete
 * (`type`, `fill`, `fillOpacity`, `stroke`), la ou `ObjetPlan` les donne pour facultatifs. Tout ce
 * qui arrive jusqu au dessin est passe par la liste blanche de la serialisation, qui les pose.
 */
function aDessiner(obj: ObjetPlan): ObjetRendu {
  return obj as ObjetRendu;
}



// ================= Persistance : projets via api.php (fichiers JSON cote serveur) =================
// Si api.php est absent ou injoignable (fichier ouvert en local, hebergement sans
// backend deploye...), l'appli reste 100% fonctionnelle avec le jeu de donnees de
// demonstration ci-dessous, exactement comme avant l'ajout de la persistance.

// Le client de api.php vit dans io/api.ts. Cette enveloppe lui fournit le jeu de demonstration :
// c'est le seul endroit qui decide de quoi demarrer quand il n'y a pas de serveur.
async function loadInitialProject(){ return chargerProjetInitial(DEMO_OBJECTS, DEMO_MEASURES); }

/** Ce que `boot()` recoit : le derive de la fonction qui le produit, pas une forme ecrite a part. */
type GraineDemarrage = Awaited<ReturnType<typeof loadInitialProject>>;

function boot(seed: GraineDemarrage): void {

// ================= Etat de l'application (spec §6.1) =================
// Un seul objet, cree ici, en tete de boot() : tout ce qui etait une variable libre de cette
// fermeture l'a rejoint au fil de la migration. La normalisation est passee en parametre parce
// que c'est ici, et non dans core/, qu'on decide de quoi normaliser (§3.3).
const etat = creerEtat(seed, normaliserEnObjetsDuPlan);
// Etape 0 de la reconstruction de l'interface (spec-ihm-zones §6) : le magasin observe l'etat, le
// registre nomme les commandes. Ni l'un ni l'autre ne change l'ecran.
const magasin = creerMagasin(etat);
const commandes = creerRegistre();

// Ce dont la barre de projet, l'actualisation cadastrale et le panneau PLU ont besoin. Fabrique a
// chaque appel : ce contexte porte des fonctions qui n'existent qu'une fois boot() lance.
// Le selecteur d'objets est l'explorateur (zones/Explorateur.tsx) depuis l'etape 3 de la
// reconstruction : il se redessine sur le magasin. Les modules qui demandaient a « reconstruire le
// selecteur » le previennent, et c'est tout ce qu'il reste a faire.
function rebuildSelector(){ magasin.notifier(); }
// Le chargement d'un projet importe vit dans io/projet.ts ; ces enveloppes lui passent l'etat et
// ce qu'il doit pouvoir declencher.
function ctxProjetImporte(){
  return { buildThreeScene, fitToObject, lieuActuel, markDirty, pushHistory, rebuildSelector,
    render, restoreState, syncBasculeGrille, syncBasculeVoisinage, syncLieuTitre,
    trouverParcelleCloture, validerProjetJSON, toScreen, orthoGroup: ()=>orthoGroup, etat };
}
function appliquerProjetImporte(valide: ProjetValide, remplacer: boolean){ chargerProjetImporte(valide, remplacer, etat, ctxProjetImporte()); }
function restaurerAffichageDuProjet(){ restaurerAffichage(etat, ctxProjetImporte()); }
// Les tables du dossier et du chiffrage vivent dans ui/tables.ts, les panneaux du mode Terrasse
// dans ui/terrassePanels.ts : ces deux fabriques leur passent ce qu'ils doivent pouvoir declencher.
function ctxTables(){
  return { refreshTerrasseView,
    renderDebitLames: (o: ObjetPlan, l: CouchesTerrasse)=>construireDebitLames(o, l, ctxTables()),
    renderDebitBois: (o: ObjetPlan, l: CouchesTerrasse)=>renderDebitBois(o, l, ctxPanneauxTerrasse()) };
}
function ctxPanneauxTerrasse(){
  return { bilanDebit,
    champLongueurs: (c: Construction, ch: string, lib: string)=>construireChampLongueurs(c, ch, lib, ctxTables()),
    debitTable: (h: HTMLElement, c: Construction, d: Debit, l: number[], k: ProduitBarre)=>construireTableDebit(h,c,d,l,k,ctxTables()),
    hauteurAppuiMm, hauteurFinieMm, prixPersonnaliseplot, pushHistory, refreshTerrasseView,
    objets: ()=>etat.objects };
}

// L'outil de cotation vit dans ui/mesurePanel.ts ; ces enveloppes lui passent l'etat et ce qu'il
// doit pouvoir declencher.
function ctxMesure(){ return { render, computeMeasureGeom, refLabel, targetLabel }; }
function rebuildMeasurePanel(){ construirePanneauMesure(etat, ctxMesure()); }
function renderMeasureResults(){ construireResultatsMesure(etat, ctxMesure()); }
function startPick(mode: Pointage['mode'], multi: boolean, purpose?: Pointage['purpose']){ demarrerPointage(mode, multi, purpose, etat, ctxMesure()); }

function ctxProjet(){
  return {
    etat, apiDelete, apiSave, lieuActuel, markDirty, pushHistory, rebuildSelector,
    refreshProjectStatus: ()=>historique.declencherRafraichissementStatut(),
    render, restoreState, serializeMeasures, serializeObjects, syncBasculeVoisinage,
    syncLieuTitre, trouverParcelleCloture, withProjectParam,
    initialState: ()=>initialState,
    initialMeasures: ()=>initialMeasures,
    cleDernierProjet: LS_LAST_PROJECT,
    ouvrirDialogueActualisation: (b: HTMLButtonElement)=>ouvrirDialogueActualisation(b, ctxProjet()),
    actualiserDepuisIgn: (o: OptionsActualisation | null, b: HTMLButtonElement | null)=>actualiserDepuisIgn(o, b, ctxProjet()),
    construireVoisinage,
    definirRafraichisseurStatut: (f: () => void)=>historique.definirRafraichisseurStatut(f),
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
// terrasseSelectedKey : dans `etat`, tenu par core/contexteTerrasse.ts (spec 6.1).


// ================= Undo history =================
// L'historique vit dans core/historique.ts ; il a ete sorti tel quel, pour etre reecrit ensuite -
// son en-tete dit ce qu'une reecriture doit savoir (pas de retablissement, instantane complet,
// meme liste blanche que l'enregistrement).
const historique = creerHistorique(etat, {
  serializeObjects, serializeMeasures, detruireVue, createObjectDOM,
  rebuildHandles, reapplyStackingOrder, rebuildSelector, renderMeasureResults, render,
  normalizeObjects: normaliserEnObjetsDuPlan,
  // Le bouton Annuler est rendu par la palette (zones/) d'apres `peutAnnuler` : l'historique n'a
  // plus d'element a desarmer lui-meme, il signale.
  boutonAnnuler: ()=>null,
  signalerPile: (vide)=>magasin.definirPeutAnnuler(!vide)
});
historique.brancherRaccourci();

function markDirty(){ historique.marquerModifie(); }
function pushHistory(){ historique.empiler(); }
function restoreState(snapshot: Instantane){ historique.restaurer(snapshot); }
function undo(){ historique.annuler(); }
// ================= Top-level panel tabs (Edition / Affichage / Mesure / Export) =================
// panelTab, selectedKey, highlight et attrTab vivent desormais dans `etat` (spec §6.1).
// Les onglets du panneau lateral vivent dans ui/panelTabs.ts.
function ctxOnglets(){
  return {
    rebuildMeasurePanel, renderMeasureResults,
    renderPanneauPlu: ()=>renderPanneauPlu(ctxProjet()),
    refreshTerrasseView
  };
}
function rebuildPanelTabs(){ construireOngletsPanneau(etat, ctxOnglets()); }
rebuildPanelTabs();

// Un quadrilatere deja d'equerre, meme tourne, est deja un rectangle : le redresser sur les axes
// n'aurait aucun sens et le ferait souvent sortir de la parcelle.
function dejaRectangle(pts: PtBrut[] | undefined, tolDeg?: number): boolean {
  if(!pts || pts.length!==4) return false;
  const tol = tolDeg || 1;
  return pts.every((_,i)=>{
    const a=pts[(i-1+4)%4]!, b=pts[i]!, c=pts[(i+1)%4]!;
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
// La palette (zones/Palette.tsx) prend sa largeur a gauche du plan ; sous 1 024 px elle s'escamote.
const LARGEUR_PALETTE = 72;
const LARGEUR_EXPLORATEUR = 248;
function computeSize(){
  // La palette et l'explorateur (zones/) prennent leur largeur au plan des 1 024 px ; en dessous, la
  // feuille de style les escamote. L'explorateur replie la rend.
  const explorateur = magasin.store.getState().explorateurOuvert ? LARGEUR_EXPLORATEUR : 0;
  const margin = 40 + (window.innerWidth >= 1024 ? LARGEUR_PALETTE + explorateur : 0);
  etat.scene.W = Math.max(320, Math.min(window.innerWidth - margin, 1600));
  etat.scene.H = Math.max(420, Math.min(Math.round(window.innerHeight*0.62), 780));
}
computeSize();

function toScreen(p: PtBrut): PtEcran { return versEcran(etat.scene, p); }
function toWorld(p: PtEcran): PtBrut { return versMonde(etat.scene, p); }
// Un objet par sa cle, et la position monde d'un evenement de pointeur : deux raccourcis dont le
// reste du fichier se sert partout.
function objByKey(key: string | null){ return etat.objects.find(o=>o.key===key); }

// ================= Build SVG =================
const stage = document.getElementById('stage')!;
stage.style.width = etat.scene.W+'px'; stage.style.height = etat.scene.H+'px';
// svgNS : dans render/svg.ts
const svg = document.createElementNS(svgNS,'svg');
svg.setAttribute('width', String(etat.scene.W)); svg.setAttribute('height', String(etat.scene.H));
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




// Paint low-priority objects first so higher "Priorite d'affichage" ends up on top; ties
// keep the objects' array order (stable sort), which double-clicking an object still
// La fabrication des elements SVG d'un objet vit dans render/objects.ts ; ces enveloppes lui
// fournissent la racine, la scene, et ce que lui seul ne peut pas savoir : quel objet est
// selectionne, et comment passer des pixels aux metres.
function createObjectDOM(obj: ObjetPlan){ creerDomObjet(svg, aDessiner(obj), etat.scene); }
function rebuildHandles(obj: ObjetPlan){
  reconstruirePoignees(aDessiner(obj), {
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

// voisinageVisible : dans `etat` (spec 6.1).
// grilleVisible : dans `etat` (spec 6.1).


// L'ordre d'empilement vit dans render/empilement.ts ; ces enveloppes lui passent la racine SVG et
// la vue de chaque objet.
// La vue d'un objet empile a toujours son `el` : `creerDomObjet` l'a pose avant. Le type de `vue()`
// ne le sait pas ; l'ajout au SVG le suppose comme le faisait l'appel direct.
function ctxEmpilement(): ContexteEmpilement<SVGElement | null>{ return { svg: { appendChild: (el)=>svg.appendChild(el!) }, vue }; }
function amenerPoigneesDevant(obj: ObjetPlan){ remonterPoignees(obj, ctxEmpilement()); }
function reapplyStackingOrder(){ reappliquerEmpilement(etat.objects, ctxEmpilement()); }
function sendObjectBackward(obj: ObjetPlan){
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
  contraindreParasols(etat.objects, etat.terrasseSelectedKey);
  dessinerCalqueParasols({
    groupeOmbres: parasolGroup, groupeMats: parasolMatGroup, racine: svg,
    etat, ctxSoleil: contexteSoleilParasol(), positionMat
  });
}


// Le dessin du plan est orchestre dans render/pipeline.ts ; cette enveloppe lui fournit l'etat et
// les briques qu'il assemble.
function render(){
  // La terrasse courante suit la selection (core/contexteTerrasse.ts) ; quand elle change alors que
  // l'onglet Terrasse est ouvert, ses panneaux se refont pour elle.
  const contexteChange = synchroniserContexteTerrasse(etat);
  rendreScene(etat, ctxRendu());
  if(contexteChange && etat.panelTab === 'terrasse') refreshTerrasseView();
  magasin.notifier();
}
function ctxRendu(){
  return { drawGrid, renderParasolOverlay, amenerPoigneesDevant, objetMasque, rebuildHandles,
    renderAttrTable, drawScaleBar, drawNorthArrow, drawMeasures,
    renderMeasureResults, renderTerrasseLayerView, estTerrain, trouverParcelleCloture,
    toScreen, markDirty, lieuActuel, render, etat, orthoGroup: ()=>orthoGroup };
}

// ================= Attribute table for selected object =================
// L'edition par cote et par angle vit dans interaction/editing.ts ; ces enveloppes fournissent le
// contour de contrainte, que le module ne va plus chercher lui-meme.
function applyAngleEdit(obj: ObjetPlan, i: number, newAngleDeg: number){
  return editerAngle(aPoints(obj), i, newAngleDeg, contourDeContrainte(etat.objects, aPoints(obj)));
}
function applyLengthEdit(obj: ObjetPlan, i: number, newLen: number){
  return editerLongueur(aPoints(obj), i, newLen, contourDeContrainte(etat.objects, aPoints(obj)));
}


// L'angle interieur d'un sommet vit dans geometry/angles.ts.




// Le type geometrique brut (Chemin) ne dit rien d'utile pour un point de vue - il est
// techniquement un chemin a 2 points, mais personne ne le pense comme "un chemin". Fonction prime
// sur type des qu'elle donne un nom plus parlant ; sinon on retombe sur le type geometrique.
function libelleTypeObjet(obj: ObjetPlan){
  if(obj.fonction==='camera') return 'Point de vue';
  if(obj.fonction==='parasol') return 'Parasol';
  return obj.type==='polygon' ? 'Polygone' : (obj.type==='path' ? 'Chemin' : 'Cercle');
}

// Le panneau d'attributs vit dans ui/attrPanel.ts ; cette enveloppe lui fournit l'etat et tout
// ce qu'il doit pouvoir declencher.
function renderAttrTable(){
  renderAttrTablePanneau(etat, {
    alignObjectByRotation, allerAuPointDeVue, applyAngleEdit, applyLengthEdit, buildThreeScene,
    contexteSoleilParasol, dejaRectangle, deleteVertex, elevationOf,
    libelleTypeObjet, markDirty, measureSegCoords, pushHistory, reapplyStackingOrder,
    rebuildHandles, rebuildSelector, refLabel, render, renderAttrTable, startPick,
    interiorAngleDeg: (obj, i)=>interiorAngleDeg(aPoints(obj), i),
    pickState: ()=>mesure.pointage,
    vue3dOuverte: ()=>!!vue3d.scene
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
function insertPointOnSegment(obj: ObjetPlan, segIndex: number, clickWorld: PtBrut){
  if(obj.locked) return;
  // Point de vue : exactement 2 points (position, direction) - un 3e casserait la lecture
  // point+vecteur (quel bout regarderait quoi ?), donc jamais d'ajout ici.
  if(obj.fonction==='camera') return;
  const n = enPoints(obj).pts.length;
  const a = enPoints(obj).pts[segIndex]!, b = enPoints(obj).pts[(segIndex+1)%n]!;
  const newPt = projectOntoSegment(clickWorld, a, b);
  const bound = contourDeContrainte(etat.objects, aPoints(obj));
  if(bound && !pointInPolygon(newPt, bound)) return;
  pushHistory();
  insererSommet(aPoints(obj), segIndex, clickWorld);
  rebuildHandles(obj);
  render();
}
function deleteVertex(obj: ObjetPlan, idx: number){
  if(obj.locked) return;
  if(enPoints(obj).pts.length <= minimumSommets(obj.type)) return; // keep at least a valid shape
  pushHistory();
  supprimerSommet(aPoints(obj), idx);
  rebuildHandles(obj);
  render();
}

// La barre d'etat (zones/) affiche le pointeur en metres : le plan le publie, elle le lit.
stage.addEventListener('pointermove', (e)=>{
  const r = stage.getBoundingClientRect();
  magasin.definirPointeur(toWorld({ x: e.clientX - r.left, y: e.clientY - r.top }));
});
stage.addEventListener('pointerleave', ()=>magasin.definirPointeur(null));

// Les evenements de pointeur vivent dans interaction/pointeur.ts ; ce branchement leur fournit
// l'etat et tout ce qu'ils doivent pouvoir declencher.
brancherPointeur(svg, stage, etat, {
  insertPointOnSegment, pushHistory,
  rebuildMeasurePanel, rebuildSelector, render, renderAttrTable, sendObjectBackward,
  toWorld
});


// ================= Responsive resize =================
// Le centre du monde est releve AVANT le changement de taille et remis au centre apres : sans cela,
// agrandir la fenetre ferait deriver le plan hors de l'ecran au lieu de l'elargir.
function redimensionnerLePlan(){
  const centreAvant = toWorld({x: etat.scene.W/2, y: etat.scene.H/2});
  computeSize();
  stage.style.width = etat.scene.W+'px'; stage.style.height = etat.scene.H+'px';
  svg.setAttribute('width', String(etat.scene.W)); svg.setAttribute('height', String(etat.scene.H));
  etat.scene.origine = {
    x: etat.scene.W/2 - centreAvant.x*etat.scene.scale,
    y: etat.scene.H/2 + centreAvant.y*etat.scene.scale
  };
  render();
}

// ================= Reset / Export =================
// L'atelier : la fermeture de boot() devient un objet nomme, que les groupes d'ecouteurs recoivent
// en parametre (app/atelier.ts). Rien ne change de place dans l'ordre d'execution ; seule la portee
// devient explicite.
const atelier = {
  etat, objByKey,
  initialState: ()=>initialState,
  initialMeasures: ()=>initialMeasures,
  pushHistory, markDirty, undo, restoreState,
  render, rebuildSelector, rebuildHandles, reapplyStackingOrder, fitToObject,
  addNewObject, addNewPath, addNewCircle, addNewParasol, addNewViewpoint,
  duplicateSelectedObject, deleteSelectedObject, sendObjectBackward
};
brancherObjets(atelier, commandes);

function ctxOrtho(){
  return { trouverParcelleCloture, render, toScreen, markDirty, lieuActuel, etat, orthoGroup: ()=>orthoGroup };
}
brancherAffichage(atelier, { enregistrerAffichage, syncBasculeGrille, ctxOrtho, buildThreeScene }, commandes);
// Branche AVANT les commandes 3D : le redimensionnement du plan etait enregistre en premier, et
// deux ecouteurs de `resize` s'executent dans leur ordre d'enregistrement.
brancherDivers(atelier, {
  renderMeasureResults, rebuildMeasurePanel, redimensionnerLePlan,
  renderPanneauPlu: ()=>renderPanneauPlu(ctxProjet()),
  interrogerPluDepuisBouton: (b)=>interrogerPluDepuisBouton(b, ctxProjet()),
  basculerOptimisation,
  renderOptimResult: (obj)=>renderOptimResult(obj, ctxPanneauxTerrasse()),
  activerOnglet: (onglet)=>activerOngletPanneau(onglet, etat, ctxOnglets()),
  startPick,
  ouvrirOngletObjet: ()=>{ etat.attrTab = 'objet'; renderAttrTable(); }
}, commandes);
brancherFichiers({
  exportProjetJSON, validerProjetJSON, appliquerProjetImporte,
  importerSVG: (contenu)=>importerSVG(contenu, etat, {
    pushHistory, createObjectDOM, rebuildHandles, reapplyStackingOrder, rebuildSelector,
    render, renderMeasureResults
  })
}, commandes);

// ================= Add / delete whole object =================
// newObjCounter : dans `etat` (spec 6.1). La naissance et la mort d'un objet vivent dans
// model/creation.ts ; ces enveloppes lui fournissent l'etat et les briques qu'il assemble.
function ctxCreation(){
  return { pushHistory, createObjectDOM, rebuildHandles, reapplyStackingOrder, rebuildSelector,
    render, detruireVue, serializeObjects, showToast, showConfirm,
    normalizeObjects: normaliserEnObjetsDuPlan };
}
function addNewObject(enRectangle: boolean){ creerCreation(etat, ctxCreation()).ajouterObjet(enRectangle); }
function addNewPath(){ creerCreation(etat, ctxCreation()).ajouterChemin(); }
function addNewCircle(){ creerCreation(etat, ctxCreation()).ajouterCercle(); }
function addNewParasol(){ creerCreation(etat, ctxCreation()).ajouterParasol(); }
function addNewViewpoint(){ creerCreation(etat, ctxCreation()).ajouterPointDeVue(); }
function duplicateSelectedObject(){ creerCreation(etat, ctxCreation()).dupliquer(); }
function deleteSelectedObject(){ creerCreation(etat, ctxCreation()).supprimer(); }



function buildExportSVG(){
  return construireSVG(etat.objects, etat.measures, {appVersion:APP_VERSION, schemaVersion:SCHEMA_VERSION});
}

// center the initial view on the parcel, using the actual responsive canvas size
(function centerInitialView(){
  const parcelle = etat.objects.find(o=>o.key==='parcelle');
  const xs = enPoints(parcelle!).pts.map(p=>p.x), ys = enPoints(parcelle!).pts.map(p=>p.y);
  const midX = (Math.min(...xs)+Math.max(...xs))/2;
  const midY = (Math.min(...ys)+Math.max(...ys))/2;
  const spanX = Math.max(...xs)-Math.min(...xs), spanY = Math.max(...ys)-Math.min(...ys);
  etat.scene.scale = Math.max(6, Math.min(220, Math.min((etat.scene.W-60)/spanX, (etat.scene.H-60)/spanY)));
  etat.scene.origine = { x: etat.scene.W/2 - midX*etat.scene.scale, y: etat.scene.H/2 + midY*etat.scene.scale };
})();

// Zoom & center the view on a given object (or the whole parcel if none)
// Le cadrage vit dans interaction/navigation.ts ; ici, le choix de CE QU'ON cadre : l'objet
// demande, sinon la parcelle, sinon tout le plan.
function fitToObject(obj: ObjetPlan | null){
  const formes = obj ? [obj]
    : (etat.objects.find(o=>o.key==='parcelle') ? [etat.objects.find(o=>o.key==='parcelle')!] : etat.objects);
  const emprise = empriseDe(formes);
  if(!emprise) return;
  etat.scene = cadrerSur(etat.scene, emprise);
  render();
}


function buildExportDXF(){
  return construireDXF(etat.objects, etat.measures, signatureExport());
}



function buildExportPDF(scaleDenom: number){
  return construirePDF(etat.objects, etat.measures, scaleDenom, {
    appVersion: APP_VERSION, buildAt: BUILD_AT, montrerNord: etat.showNorth
  });
}

// L'export GLB vit dans three/exportGlb.ts.
function genererGlb(btn: HTMLButtonElement | null, telecharger: boolean){
  genererGlbModule(etat, btn, telecharger, {
    buildThreeScene, rafraichirVisionneuseGlbSiOuverte, telechargerBinaire
  });
}

// Les boutons de l'onglet Export vivent dans app/ecouteurs/exports.ts ; ici, seulement de quoi
// fabriquer chaque contenu.
brancherExports({
  buildExportSVG, buildExportDXF, buildExportPDF, genererGlb,
  construireResume: ()=>construireResume(etat.objects, etat.measures, {
    appVersion: APP_VERSION, computeMeasureGeom, refLabel, targetLabel
  }),
  construireDossier: ()=>construireDossierPDF(etat.objects, clesDossier(etat.objects),
    el<HTMLInputElement>('chkDossierEquipements').checked,
    { nomProjet: (seed && seed.meta && seed.meta.name), appVersion: APP_VERSION }),
  clesDossier: ()=>clesDossier(etat.objects),
  nomProjet: ()=>(seed && seed.meta && seed.meta.name)
}, commandes);

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
function computeMeasureGeom(m: Mesure){ return geometrieMesure(etat.objects, m); }
function measureSegCoords(ref: { objKey: string; segIndex: number }){ return coordonneesCote(etat.objects, ref); }

const measureGroup = document.createElementNS(svgNS,'g');
svg.appendChild(measureGroup);

function refLabel(ref: { objKey: string; segIndex: number } | null){
  if(!ref) return '(aucun)';
  const obj = etat.objects.find(o=>o.key===ref.objKey);
  if(!obj) return '(objet supprime)';
  return obj.name + ': ' + (obj.segmentNames![ref.segIndex]||('Cote '+(ref.segIndex+1)));
}
function targetLabel(t: { objKey: string; ptIndex: number }){
  const obj = etat.objects.find(o=>o.key===t.objKey);
  if(!obj) return '(objet supprime)';
  if(obj.type==='circle') return obj.name + ' (centre)';
  return obj.name + ': ' + (obj.vertexNames![t.ptIndex]||('P'+(t.ptIndex+1)));
}

// Distance from `center` to where the ray (center -> center+dir) exits the polygon `poly`.
// Returns 0 if no intersection is found (e.g. center already outside).




// L'alignement vit dans interaction/outilAlignement.ts, a cote du cote de reference qu'il lit.
function alignObjectByRotation(obj: ObjetPlan){
  const champ = elOpt<HTMLInputElement>('alignDistanceInput');
  alignerObjetParRotation(obj, etat, champ ? champ.value : '', {
    measureSegCoords, alignerSurCote, pointInPolygon,
    nearestSegmentIndex: (obj, cible)=>nearestSegmentIndex(aPoints(obj), cible),
    contourDeContrainte: (o)=>contourDeContrainte(etat.objects, aPoints(o)),
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





// ================= Import / Export du projet en JSON (fichier local) =================
// Le fichier produit est exactement la reponse de api.php?action=load ({meta, objects,
// measures}) : ce qui sort d'ici se recharge tel quel ici, et se repost e a action=save une
// fois remis a plat ({name, objects, measures}). L'import accepte les deux formes.


// L'export du projet vit dans io/exportProjet.ts.
function exportProjetJSON(){
  exporterProjetJSON(etat, el<HTMLInputElement>('chkExportSansParcelle').checked, {
    serializeObjects, serializeMeasures, telechargerTexte, showToast,
    appVersion: APP_VERSION, schemaVersion: SCHEMA_VERSION,
    metaProjet: ()=>(seed && seed.meta) || {}
  });
}










// ================= Fond orthophoto (WMTS IGN, calque de reference) =================
// Le plan est en metres dans un repere local ; les tuiles WMTS, elles, sont decoupees en
// longitude/latitude. Le raccord se fait par un point de calage connu : l'origine (0,0) du plan,
// dont la position reelle est enregistree par l'import cadastre (cadastre.origineLat/Lon). Sans
// import cadastre, on retombe sur le lieu de la parcelle, cale sur son centroide - moins precis,
// mais coherent avec ce que l'appli sait du terrain.
// Terrain au sens large : la parcelle principale et les parcelles voisines importees.
function estTerrain(o: ObjetPlan){ return o.key === 'parcelle' || o.fonction === 'terrain'; }

// ---- Masquage du voisinage importe (parcelles adjacentes, leur bati, leur vegetation) ----
// Bascule d'affichage : rien n'est supprime, et le champ `hidden` propre a chaque objet n'est pas
// touche - sinon decocher puis recocher effacerait les objets que l'utilisateur avait masques
// lui-meme. Le reglage se range sur la parcelle, comme le fond orthophoto, donc il se sauvegarde.
// Les deux bascules ci-dessous sont declarees en tete de la section "Selector buttons" :
// rebuildSelector() les lit pendant le boot, bien avant cette ligne.
function estVoisinage(o: ObjetPlan){ return !!o.voisinage; }
function syncBasculeGrille(){
  const b = document.getElementById('gridBtn');
  if(!b) return;
  b.classList.toggle('off', !etat.grilleVisible);
  b.title = (etat.grilleVisible ? 'Masquer' : 'Afficher') + ' la grille du plan';
  b.setAttribute('aria-pressed', etat.grilleVisible ? 'true' : 'false');
}
function objetMasque(o: ObjetPlan): boolean { return !!o.hidden || !!(o.voisinage && !etat.voisinageVisible); }
function syncBasculeVoisinage(){
  const lab = document.getElementById('voisinageToggle');
  const cb = elOpt<HTMLInputElement>('chkVoisinage');
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












// Les hauteurs (appui, hauteur finie, elevation) vivent dans engine/hauteurs.ts : elles sont lues
// par le plan de coupe, la 3D, le dossier PDF et le chiffrage, et doivent rester une seule regle.




// Le calque des couches vit dans render/terrasseCouches.ts ; cette enveloppe lui fournit son groupe
// SVG, l'etat et la transformation d'ecran. Les couches ne se dessinent que si l'explorateur les a
// demandees (`etat.calquesVisibles`) : un appel sans objet vide le calque.
const terrasseLayerGroup = document.createElementNS(svgNS,'g');
svg.appendChild(terrasseLayerGroup);
function renderTerrasseLayerView(obj: ObjetPlan | null | undefined){ dessinerCouches(terrasseLayerGroup, etat.calquesVisibles ? obj : null, etat, toScreen); }


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
// Le lieu s'affiche dans la barre d'application (zones/), qui le lit dans le magasin.
function syncLieuTitre(){
  const p = trouverParcelleCloture();
  magasin.definirLieu(p ? libelleLieu() : '');
}
// Le curseur "semaine" et le rafraichissement de la visionneuse vivent dans three/glbViewer.ts.
function syncSemaineDepuisDate(){ syncSemaineGlb(); }
function rafraichirVisionneuseGlb(camaraAConserver: CameraConservee = null){
  rafraichirSceneGlb(camaraAConserver, { lieuActuel, renderVue3DSelect });
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
function buildThreeScene(obj: ObjetPlan | null){
  construireScene3D(obj, etat, {
    appliquerLumiereVue3d, applyMode3D, chargerTexturePolyhaven, disposeThreeScene, elevationOf,
    hauteurAppuiMm, objetMasque, positionMat, renderVue3DSelect, syncClotureControls,
    syncControlesSoleilVue3d, trouverParcelleCloture,
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
    const sel = elOpt<HTMLSelectElement>(id);
    if(!sel) return;
    sel.innerHTML = '<option value="">Aller a un point de vue enregistre…</option>';
    vues.forEach(v=>{
      const o = document.createElement('option'); o.value = v.key; o.textContent = v.name;
      sel.appendChild(o);
    });
    sel.disabled = vues.length===0;
  });
}

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
// Explicit zoom buttons: move the camera along its current line of sight to the orbit
// target, rather than relying only on OrbitControls' own wheel handling.
// Le pilotage des deux vues 3D (zoom, mode du glisser, points de vue, plein page) vit dans
// three/navigation.ts ; ces enveloppes gardent les noms qu'utilisent les ecouteurs.
const nav3d = creerNavigation3d(etat, {
  showToast, showErrBanner, centroid, hauteurFinieMm,
  ouvrirVue3d: ()=>modes.goVue3D()
});
function zoom3D(factor: number){ nav3d.zoom3D(factor); }
function applyMode3D(){ nav3d.applyMode3D(); }
function setMode3D(m: Mode3D){ nav3d.setMode3D(m); }
function allerAuPointDeVue(vp: PointDeVue){ nav3d.allerAuPointDeVue(vp); }
function allerAuPointDeVueGlb(vp: PointDeVue){ nav3d.allerAuPointDeVueGlb(vp); }
function resizeThreeScene(){ nav3d.resizeThreeScene(); }
function resizeGlbViewerScene(){ nav3d.resizeGlbViewerScene(); }
function setVue3dPleinePage(actif: boolean){ nav3d.setVue3dPleinePage(actif); }
function setGlbViewerPleinePage(actif: boolean){ nav3d.setGlbViewerPleinePage(actif); }
brancherVue3d(atelier, {
  zoom3D, setMode3D, buildThreeScene, createObjectDOM,
  hauteurDesYeux: ()=>nav3d.hauteurDesYeux(),
  setVue3dPleinePage, setGlbViewerPleinePage,
  vue3dPleinePage: ()=>nav3d.vue3dPleinePage,
  glbViewerPleinePage: ()=>nav3d.glbViewerPleinePage,
  resizeThreeScene, resizeGlbViewerScene
}, commandes);

// Le pilotage des vues et de l'onglet Terrasse vit dans app/modes.ts ; ces enveloppes gardent les
// noms qu'utilisent les ecouteurs et les panneaux.
const modes = creerModes({
  terrasseCourante: ()=>terrasseCouranteDe(etat),
  ensureConstruction, ensureThreeLoaded, buildThreeScene, disposeThreeScene, render,
  preparerVisionneuse, quitterPleinPageVisionneuse, disposeGlbViewerScene,
  signalerVue: (vue)=>magasin.definirVue(vue),
  rendrePanneauxTerrasse(obj){
    renderTerrasseConfigurator(obj, ctxPanneauxTerrasse());
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



brancherCloture({
  trouverParcelle: trouverParcelleCloture, syncControles: syncClotureControls,
  rafraichirApresCloture, markDirty, objByKey,
  allerAuPointDeVue, allerAuPointDeVueGlb
}, commandes);
brancherBoutonsDeVue({
  allerAuPlan: ()=>modes.allerAuPlan(),
  goVue3D: ()=>modes.goVue3D(),
  ouvrirVisionneuse: ()=>modes.ouvrirVisionneuse()
}, commandes);
brancherVisionneuse(atelier, {
  genererGlb,
  rafraichir: (cam)=>rafraichirVisionneuseGlb(cam),
  appliquerLumiere: ()=>appliquerLumiereGlb({ lieuActuel, renderVue3DSelect }),
  hauteurFinieMm, hauteurYeuxM: HAUTEUR_YEUX_M
}, commandes);
// Les memes cinq commandes, deux fois : les deux vues reglent leur soleil separement.
brancherCommandesSoleil({
  prefixe: 'glbViewer', etat: glb, formatHeureMin,
  syncSemaine: syncSemaineDepuisDate,
  appliquer: ()=>appliquerLumiereGlb({ lieuActuel, renderVue3DSelect })
});
brancherCommandesSoleil({
  prefixe: 'vue3d', etat: soleilVue3d, formatHeureMin,
  syncSemaine: syncSemaineVue3dDepuisDate,
  appliquer: appliquerLumiereVue3d
});

// Le projet cote serveur devient des commandes (app/projet.ts) ; la barre d'application et la barre
// d'etat (zones/) les affichent. Montees en dernier : tout ce qu'elles lisent existe alors.
const projet = creerProjet(seed, {
  etat, apiSave, apiDelete, serializeObjects, serializeMeasures, withProjectParam,
  initialState: ()=>initialState,
  initialMeasures: ()=>initialMeasures,
  cleDernierProjet: LS_LAST_PROJECT,
  definirRafraichisseurStatut: (f)=>historique.definirRafraichisseurStatut(f),
  ouvrirImportCadastre: ()=>ouvrirImportCadastre(ctxProjet().contexteImport()),
  ouvrirDialogueActualisation: (b)=>ouvrirDialogueActualisation(b, ctxProjet())
}, magasin, commandes);
// L'explorateur (zones/) demande au plan par ce service ; il lit le reste dans le magasin.
const explorateur = creerExplorateur(etat, { render, markDirty, redimensionner: redimensionnerLePlan }, magasin);
monterZones({ magasin, commandes, projet, explorateur });
render();
// Cadrage d'ouverture sur le terrain quand il vient du cadastre : sa taille reelle n'a aucune
// raison de tomber sur l'echelle par defaut du plan de demonstration. Un plan dessine a la main
// garde, lui, le cadrage historique - ses coordonnees ont ete posees avec.
(function cadrerSurTerrainImporte(){
  const p = etat.objects.find(o=>o.key==='parcelle');
  if(p && p.cadastre && aDesSommets(p) && p.pts.length >= 3) fitToObject(p);
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

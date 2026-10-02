// Racine de composition de l'application (spec §4 Phase 4, §6 "Killing the boot() closure").
//
// `boot()` a ete longtemps la fermeture ou tout se cablait : une soixantaine d'enveloppes fermant
// sur `etat` et sur la racine SVG. Ces enveloppes vivent maintenant dans app/assemblage/, par
// famille — la surface et ses calques, le dessin, l'affichage, le cadrage, les cotes, les gestes,
// les vues 3D, les exports —, et `boot()` ne fait plus que les composer, dans l'ordre ou elles
// doivent exister. Cet ordre compte : les ecouteurs se declenchent dans leur ordre d'enregistrement
// et les calques du SVG s'empilent dans leur ordre d'ajout.
//
// Pas de bus d'evenements (§6.3 l'esquissait, jamais construit) : `render()` reste appele
// directement depuis chaque geste qui modifie le plan. §6.3 l'autorisait deja explicitement
// ("Keep that — do not introduce reactivity").
import { DEMO_OBJECTS, DEMO_TEMOIN_OBJECTS, DEMO_MEASURES } from '../model/demo.js';
import { elevationOf } from '../engine/hauteurs.js';
import { interiorAngleDeg } from '../geometry/angles.js';
import { aDesSommets } from '../model/formes.js';
import { creerEtat } from '../core/state.js';
import { creerHistorique } from '../core/historique.js';
import { synchroniserContexteTerrasse, terrasseCourante, terrasseSelectionnee } from '../core/contexteTerrasse.js';
import { parPriorite } from '../render/empilement.js';
import { detruireVue } from '../render/vues.js';
import { rendreScene } from '../render/pipeline.js';
import { restaurerOrthoDuProjet, basculerOrthophoto, ortho } from '../render/ortho.js';
import { mesure } from '../interaction/outilMesure.js';
import { brancherPointeur } from '../interaction/pointeur.js';
import { validerProjetJSON } from '../io/validation.js';
import { importSVGString as importerSVG } from '../io/importSvg.js';
import { serializeObjects, serializeMeasures } from '../io/serialisation.js';
import { cleDernierProjet, withProjectParam, apiSave, apiDelete, chargerProjetInitial } from '../io/api.js';
import { appliquerProjetImporte as chargerProjetImporte, restaurerAffichageDuProjet } from '../io/projet.js';
import { brancherObjets } from './ecouteurs/objets.js';
import { brancherAffichage } from './ecouteurs/affichage.js';
import { brancherFichiers } from './ecouteurs/fichiers.js';
import { brancherDivers, brancherFiletsDErreur } from './ecouteurs/divers.js';
import { creerRegistre } from './commandes.js';
import { droitsCourants, enLectureSeule } from './acces.js';
import { creerMagasin, type Feuille } from './magasin.js';
import { creerTiroir } from './tiroir.js';
import { creerResultats } from './resultats.js';
import { creerInspecteur, type Inspecteur } from './inspecteur.js';
import { creerExplorateur, type Explorateur } from './explorateur.js';
import { creerProjet, projetARemplir } from './projet.js';
import { retenirProjetsConnus } from '../plateforme/quotaProjets.js';
import { signalerLimiteProjets } from './limiteProjets.js';
import { actualisation, ouvrirDialogueActualisation } from './actualisationIgn.js';
import { creerImportCadastre } from './importCadastre.js';
import { parcours } from './parcours.js';
import { demanderPremierPas } from './premierPas.js';
import { appliquerClasse } from './classe.js';
import { brancherClavier } from './clavier.js';
import { normaliserEnObjetsDuPlan, aPoints } from './assemblage/formes.js';
import { creerSurface } from './assemblage/surface.js';
import { creerDessin } from './assemblage/dessin.js';
import { creerAffichage } from './assemblage/affichage.js';
import { creerCadrage, mesurerScene } from './assemblage/cadrage.js';
import { creerMesures } from './assemblage/mesures.js';
import { creerGestes, libelleTypeObjet, dejaRectangle } from './assemblage/gestes.js';
import { creerVues3d, type Vues3d } from './assemblage/vues3d.js';
import { brancherLesExports, exporterLeProjet, resumeDuProjet } from './assemblage/exports.js';
import { monterZones } from '../zones/monter.js';
import { dessinerReleves } from '../render/releve.js';
import { creerServiceReleve } from './releve.js';
import { brancherFacade } from './ecouteurs/facade.js';
import type { Atelier } from './atelier.js';
import type { ObjetPlan, ObjetBrut, Mesure } from '../model/types.js';
import type { ProjetResume } from '../io/api.js';
import { vue3d } from '../three/etat3d.js';
import { creerIsolement } from './isolement.js';
import { EXPOSITION } from './exposition.js';
import { APP_VERSION } from '../model/version.js';
import type { SourceControleurs } from './controleurs.js';
import type { RegistreCommandes } from './commandes.js';
import { quandScenePrete, appliquerZoom, trouverPointDeVue, animerHeure, dateDuJour, type SceneZoomable, type Vitrine } from './vitrine.js';
import type { Pointage } from '../interaction/outilMesure.js';
import type { ProjetValide } from '../io/validation.js';

brancherFiletsDErreur();

// ================= Persistance : projets via api.php (fichiers JSON cote serveur) =================
// Si api.php est absent ou injoignable (fichier ouvert en local, hebergement sans backend
// deploye...), l'appli reste 100% fonctionnelle avec le jeu de donnees de demonstration.
//
// Le depot des projets vit dans io/api.ts. Cette enveloppe lui fournit les deux choses qu'il ne peut
// pas aller chercher lui-meme : le jeu de demonstration, et l'ecran qui demande par quoi commencer
// quand il n'y a aucun plan a ouvrir. Les deux viennent de couches plus hautes que la sienne.
async function loadInitialProject(){
  // En developpement, `?temoin` ouvre le plan de demonstration d'origine, celui dont les golden
  // files sont captures (tests/fixtures/golden/EMPREINTES.md) ; le fichier livre ne le propose pas.
  const temoin = import.meta.env.DEV && new URLSearchParams(location.search).has('temoin');
  return chargerProjetInitial(temoin ? DEMO_TEMOIN_OBJECTS : DEMO_OBJECTS, DEMO_MEASURES, demanderPremierPas);
}

/**
 * La graine de la vitrine (app/vitrine.ts) : le plan de demonstration, sans rien demander a
 * personne — ni plateforme, ni stockage du navigateur. La forme est celle que rend
 * `chargerProjetInitial` quand aucune API ne repond.
 */
function graineVitrine(){
  return {
    apiAvailable: false,
    list: [] as ProjetResume[],
    objects: JSON.parse(JSON.stringify(DEMO_OBJECTS)) as ObjetBrut[],
    measures: JSON.parse(JSON.stringify(DEMO_MEASURES)) as Mesure[],
    meta: null as ProjetResume | null,
    schemaVersion: null as number | null,
    ouvrirAdresse: false
  } satisfies GraineDemarrage;
}

/** Ce que `boot()` recoit : le derive de la fonction qui le produit, pas une forme ecrite a part. */
type GraineDemarrage = Awaited<ReturnType<typeof loadInitialProject>>;

/**
 * Ce qui nait apres l'atelier et que le plan doit pourtant pouvoir appeler : les vues 3D (le
 * rafraichissement des panneaux de terrasse) et les deux panneaux lateraux (repliés sur tablette).
 * Rien ne les appelle avant qu'ils existent ; l'appel optionnel le dit sans l'affirmer.
 */
interface Tardifs { vues?: Vues3d; explorateur?: Explorateur; inspecteur?: Inspecteur }

/** Le plan, sans ses ecouteurs ni ses panneaux : l'etat, la surface et son dessin, l'historique, le tiroir, les gestes. */
function assemblerLePlan(seed: GraineDemarrage, tardifs: Tardifs) {
  // Un seul etat, cree en tete. La normalisation est passee en parametre parce que c'est ici, et
  // non dans core/, qu'on decide de quoi normaliser (§3.3).
  const etat = creerEtat(seed, normaliserEnObjetsDuPlan);
  // Lecture seule : la personne n'a pas `projects.write` sur la plateforme. Les gestes du pointeur
  // (interaction/) le lisent sur l'etat ; hors plateforme, faux.
  etat.lectureSeule = enLectureSeule();
  const magasin = creerMagasin(etat);
  // Les droits viennent de la plateforme quand il y en a une, et laissent tout passer sinon.
  // Le nombre de projets vus : la limite se compte aussi sur eux (plateforme/quotaProjets.ts).
  retenirProjetsConnus(seed.list.length);
  const commandes = creerRegistre(droitsCourants(), (_id, message) => signalerLimiteProjets(message));
  // Le selecteur d'objets est l'explorateur (zones/) : il se redessine sur le magasin.
  const rebuildSelector = () => magasin.notifier();
  const refreshTerrasseView = () => tardifs.vues?.refreshTerrasseView();

  const affichage = creerAffichage(etat, magasin, () => historique.marquerModifie());
  // La classe d'ecran decide de la place du plan ; la surface prend la taille mesuree.
  appliquerClasse(magasin);
  mesurerScene(etat, magasin);
  const surface = creerSurface(etat);
  const dessin = creerDessin(etat, surface, {
    insererSommetAuClic: (o, i, p) => gestes.insertPointOnSegment(o, i, p),
    contexteSoleil: affichage.contexteSoleilParasol
  });
  const mesures = creerMesures(etat);
  const historique = creerHistorique(etat, {
    serializeObjects, serializeMeasures, detruireVue, createObjectDOM: dessin.createObjectDOM,
    rebuildHandles: dessin.rebuildHandles, reapplyStackingOrder: dessin.reapplyStackingOrder, rebuildSelector, render,
    normalizeObjects: normaliserEnObjetsDuPlan,
    // Le bouton Annuler est rendu par la palette d'apres `peutAnnuler` : l'historique signale.
    boutonAnnuler: () => null,
    signalerPile: (vide) => magasin.definirPeutAnnuler(!vide),
    rafraichirResultats: refreshTerrasseView
  });
  const pushHistory = () => historique.empiler();
  const markDirty = () => historique.marquerModifie();
  // Le tiroir des resultats (zones/Resultats.tsx) tient ses onglets ; ses panneaux ecrivent par
  // `resultats`, ou chaque saisie s'annule et marque le projet modifie.
  const tiroir = creerTiroir(etat, { refreshTerrasseView, terrasseSelectionnee: () => terrasseSelectionnee(etat) }, magasin);
  const resultats = creerResultats(etat, {
    pushHistory, markDirty, render, renderTerrasseLayerView: dessin.renderTerrasseLayerView,
    terrasseCourante: () => terrasseCourante(etat),
    trouverParcelle: affichage.trouverParcelleCloture, lieuActuel: affichage.lieuActuel,
    construireResume: () => resumeDuProjet(etat, mesures),
    refLabel: mesures.refLabel, targetLabel: mesures.targetLabel, computeMeasureGeom: mesures.computeMeasureGeom,
    montrerResume: () => {
      tiroir.activer('resume');
      if (magasin.store.getState().classe === 'compact') magasin.definirFeuille('resultats');
    }
  }, magasin);

  // Le dessin du plan est orchestre dans render/pipeline.ts. La terrasse courante suit la selection
  // (core/contexteTerrasse.ts), et le tiroir la suit a chaque rendu.
  function render(): void {
    const contexteChange = synchroniserContexteTerrasse(etat);
    rendreScene(etat, {
      ...dessin, ...affichage, markDirty, render, etat, orthoGroup: () => surface.ortho,
      renderReleves: () => dessinerReleves(surface.releves, etat, dessin.toScreen, affichage.objetMasque)
    });
    tiroir.synchroniser(contexteChange);
    magasin.notifier();
  }
  const gestes = creerGestes(etat, { ...dessin, pushHistory, render, rebuildSelector, mesures });
  const cadrage = creerCadrage(etat, magasin, surface, {
    render, toWorld: dessin.toWorld,
    basculerExplorateur: () => tardifs.explorateur?.basculerOuverture(),
    basculerInspecteur: () => tardifs.inspecteur?.basculerOuverture()
  });
  return {
    etat, magasin, commandes, affichage, surface, dessin, mesures, historique, tiroir, resultats, gestes, cadrage,
    render, rebuildSelector, pushHistory, markDirty, refreshTerrasseView
  };
}

type Plan = ReturnType<typeof assemblerLePlan>;

/** L'atelier : ce que les ecouteurs ont le droit de demander au plan (app/atelier.ts). */
function atelierDu(p: Plan): Atelier {
  const { etat, historique, dessin } = p;
  // Les references de « Reinitialiser tout » : le plan et ses cotes tels qu'ils ont ete charges.
  const initialState: ObjetPlan[] = JSON.parse(JSON.stringify(etat.objects));
  const initialMeasures = serializeMeasures(etat.measures);
  return {
    etat, objByKey: (key) => etat.objects.find(o => o.key === key),
    initialState: () => initialState, initialMeasures: () => initialMeasures,
    pushHistory: p.pushHistory, markDirty: p.markDirty,
    undo: () => historique.annuler(), restoreState: (i) => historique.restaurer(i),
    render: p.render, rebuildSelector: p.rebuildSelector,
    rebuildHandles: dessin.rebuildHandles, reapplyStackingOrder: dessin.reapplyStackingOrder,
    fitToObject: p.cadrage.cadrer, ...p.gestes
  };
}

/**
 * Le chargement d'un projet (io/projet.ts), l'import depuis une adresse et l'actualisation IGN
 * (des parcours, app/parcours.ts) : ce qu'ils doivent pouvoir declencher.
 */
function chargements(p: Plan, seed: GraineDemarrage, tardifs: Tardifs) {
  const { etat, affichage, dessin, historique } = p;
  const ctxOrtho = () => ({
    trouverParcelleCloture: affichage.trouverParcelleCloture, render: p.render, toScreen: dessin.toScreen,
    markDirty: p.markDirty, lieuActuel: affichage.lieuActuel, etat, orthoGroup: () => p.surface.ortho
  });
  const ctxProjetImporte = () => ({
    ...ctxOrtho(), ...affichage, buildThreeScene: (o: ObjetPlan | null) => tardifs.vues?.buildThreeScene(o),
    fitToObject: p.cadrage.cadrer, pushHistory: p.pushHistory, rebuildSelector: p.rebuildSelector,
    restoreState: historique.restaurer, validerProjetJSON
  });
  const appliquerProjetImporte = (valide: ProjetValide, remplacer: boolean) => chargerProjetImporte(valide, remplacer, etat, ctxProjetImporte());
  return {
    ctxOrtho, appliquerProjetImporte,
    restaurerAffichage: () => restaurerAffichageDuProjet(etat, ctxProjetImporte()),
    ouvrirImportCadastre() {
      const importe = creerImportCadastre({ apiSave, appliquerProjetImporte, withProjectParam,
        apiDisponible: seed.apiAvailable, cleDernierProjet: cleDernierProjet(),
        // Un projet neuf (document `{}`) se remplit, tant que rien n'y a ete dessine.
        projetCible: () => projetARemplir(seed, etat) }, () => parcours.fermer());
      parcours.ouvrir({ type: 'cadastre', importe });
    },
    ouvrirActualisation: () => ouvrirDialogueActualisation({
      etat, markDirty: p.markDirty, pushHistory: p.pushHistory, rebuildSelector: p.rebuildSelector, render: p.render,
      restoreState: historique.restaurer, serializeMeasures, serializeObjects,
      syncBasculeVoisinage: affichage.syncBasculeVoisinage, syncLieuTitre: affichage.syncLieuTitre,
      trouverParcelleCloture: affichage.trouverParcelleCloture
    })
  };
}

/** Les objets deja presents recoivent leur DOM, puis les gestes du pointeur et les commandes du plan. */
function brancherLePlan(p: Plan, atelier: Atelier, ch: ReturnType<typeof chargements>, seed: GraineDemarrage, tardifs: Tardifs) {
  const { etat, magasin, commandes, surface, dessin, affichage, resultats, tiroir } = p;
  // Les priorites d'affichage les plus basses d'abord ; a egalite, l'ordre du tableau (tri stable).
  etat.objects.slice().sort(parPriorite).forEach(dessin.createObjectDOM);
  etat.objects.forEach(dessin.rebuildHandles);
  surface.poserCalquesDuDessus();
  // La barre d'etat (zones/) affiche le pointeur en metres : le plan le publie, elle le lit.
  surface.stage.addEventListener('pointermove', (e) => {
    const r = surface.stage.getBoundingClientRect();
    magasin.definirPointeur(dessin.toWorld({ x: e.clientX - r.left, y: e.clientY - r.top }));
  });
  surface.stage.addEventListener('pointerleave', () => magasin.definirPointeur(null));
  brancherPointeur(surface.svg, surface.stage, etat, {
    insertPointOnSegment: p.gestes.insertPointOnSegment, pushHistory: p.pushHistory,
    rebuildSelector: p.rebuildSelector, render: p.render, sendObjectBackward: p.gestes.sendObjectBackward,
    toWorld: dessin.toWorld
  });
  brancherObjets(atelier, commandes);
  // Ctrl+Z et Ctrl+S passent par le registre. Pas de Ctrl+Y : il n'y a pas de retablissement.
  brancherClavier(commandes);
  brancherAffichage(atelier, {
    enregistrerAffichage: affichage.enregistrerAffichage, syncBasculeGrille: affichage.syncBasculeGrille,
    ctxOrtho: ch.ctxOrtho, buildThreeScene: (o) => tardifs.vues?.buildThreeScene(o)
  }, commandes);
  // Branche AVANT les commandes 3D : deux ecouteurs de `resize` s'executent dans leur ordre
  // d'enregistrement, et le plan doit etre redimensionne avant la scene.
  brancherDivers(atelier, {
    resultats, redimensionnerLePlan: p.cadrage.redimensionner,
    rafraichirInspecteur: () => magasin.notifier(),
    activerOnglet: (onglet) => tiroir.activer(onglet),
    startPick: (mode: Pointage['mode'], multi: boolean, but?: Pointage['purpose']) => resultats.pointer(mode, multi, but)
  }, commandes);
  brancherFichiers({
    exportProjetJSON: () => exporterLeProjet(etat, seed), validerProjetJSON, appliquerProjetImporte: ch.appliquerProjetImporte,
    importerSVG: (contenu) => importerSVG(contenu, etat, {
      pushHistory: p.pushHistory, createObjectDOM: dessin.createObjectDOM, rebuildHandles: dessin.rebuildHandles,
      reapplyStackingOrder: dessin.reapplyStackingOrder, rebuildSelector: p.rebuildSelector, render: p.render
    })
  }, commandes);
  brancherLesExports(etat, seed, commandes, { mesures: p.mesures, resultats, genererGlb: (t) => tardifs.vues?.genererGlb(t) });
}

/** Les panneaux (zones/) et les services qu'ils lisent : projet, explorateur, inspecteur. Montes en dernier. */
function monterLesPanneaux(p: Plan, atelier: Atelier, ch: ReturnType<typeof chargements>, vues: Vues3d, seed: GraineDemarrage) {
  const { etat, magasin, commandes, historique, resultats, tiroir, mesures, gestes } = p;
  const projet = creerProjet(seed, {
    etat, apiSave, apiDelete, serializeObjects, serializeMeasures, withProjectParam,
    initialState: atelier.initialState, initialMeasures: atelier.initialMeasures,
    cleDernierProjet: cleDernierProjet(),
    definirRafraichisseurStatut: (f) => historique.definirRafraichisseurStatut(f),
    ouvrirImportCadastre: ch.ouvrirImportCadastre,
    ouvrirDialogueActualisation: ch.ouvrirActualisation,
    actualisationEnCours: () => actualisation.enCours()
  }, magasin, commandes);
  const explorateur = creerExplorateur(etat, { render: p.render, markDirty: p.markDirty, redimensionner: p.cadrage.redimensionner }, magasin);
  // L'inspecteur rend des descripteurs de champs (ui/champs/) ; ce service leur donne leur contexte.
  const inspecteur = creerInspecteur(etat, {
    libelleType: libelleTypeObjet, elevationOf, refLabel: mesures.refLabel, measureSegCoords: mesures.measureSegCoords, dejaRectangle,
    interiorAngleDeg: (obj, i) => interiorAngleDeg(aPoints(obj), i),
    contexteSoleil: p.affichage.contexteSoleilParasol,
    applyAngleEdit: gestes.applyAngleEdit, applyLengthEdit: gestes.applyLengthEdit, deleteVertex: gestes.deleteVertex,
    alignObjectByRotation: gestes.alignObjectByRotation, allerAuPointDeVue: vues.allerAuPointDeVue,
    startPick: (mode, multi, but) => resultats.pointer(mode, multi, but),
    pushHistory: p.pushHistory, render: p.render, markDirty: p.markDirty, refreshTerrasseView: p.refreshTerrasseView,
    buildThreeScene: vues.buildThreeScene, reapplyStackingOrder: p.dessin.reapplyStackingOrder, rebuildHandles: p.dessin.rebuildHandles,
    trouverParcelle: p.affichage.trouverParcelleCloture,
    optimisation: { visible: () => resultats.optimisationVisible() },
    resultats,
    redimensionner: p.cadrage.redimensionner
  }, magasin, commandes);
  // Le pointage en cours (Cote, Aligner) et le moyen d'en sortir : le bandeau du canevas et Echap.
  const pointage = { courant: () => mesure.pointage, arreter: () => resultats.arreterPointage() };
  // Le releve de facade : le parcours de prise de vue (zones/Releve.tsx) et ses deux commandes.
  const releve = creerServiceReleve({ etat, pushHistory: p.pushHistory, render: p.render, buildThreeScene: vues.buildThreeScene, elevationOf });
  brancherFacade({ etat, releve, pushHistory: p.pushHistory, render: p.render, buildThreeScene: vues.buildThreeScene }, commandes);
  monterZones({ magasin, commandes, projet, explorateur, inspecteur, tiroir, pointage, resultats, vues3d: vues.vues3d, releve });
  return { explorateur, inspecteur, projet };
}

/**
 * La decouverte des controleurs (app/controleurs.ts) : ce que Plan a monte, lu sans rien executer.
 * Les sections de l'inspecteur dependent de l'objet : on en demande une par sorte d'objet du plan.
 */
function sourceControleurs(commandes: RegistreCommandes, inspecteur: Inspecteur, objets: ObjetPlan[]): SourceControleurs {
  const sortes = new Map<string, ObjetPlan>();
  for (const o of objets) {
    const cle = o.type + '.' + (o.fonction || 'aucune');
    if (!sortes.has(cle)) sortes.set(cle, o);
  }
  return {
    appVersion: APP_VERSION,
    commandes: commandes.lister(),
    exposition: EXPOSITION,
    inspecteur: [...sortes].sort(([a], [b]) => a.localeCompare(b)).map(([cle, o]) => {
      const c = inspecteur.contexte(o);
      return { cle, nom: libelleTypeObjet(o), sections: inspecteur.sections(c) };
    })
  };
}

function boot(seed: GraineDemarrage, options: { vitrine?: Vitrine; controleurs?: (lire: () => SourceControleurs) => void } = {}): void {
  const tardifs: Tardifs = {};
  const p = assemblerLePlan(seed, tardifs);
  const { etat, magasin, commandes, tiroir, cadrage } = p;
  // La commande « Actualiser IGN » se grise pendant une actualisation : les zones doivent le voir.
  actualisation.abonner(() => magasin.notifier());
  const atelier = atelierDu(p);
  const ch = chargements(p, seed, tardifs);
  brancherLePlan(p, atelier, ch, seed, tardifs);
  cadrage.centrerSurParcelle();
  const vues = creerVues3d(atelier, magasin, commandes, { affichage: p.affichage, createObjectDOM: p.dessin.createObjectDOM, resultats: p.resultats });
  tardifs.vues = vues;
  brancherIsolement(p);
  const { explorateur, inspecteur, projet } = monterLesPanneaux(p, atelier, ch, vues, seed);
  tardifs.explorateur = explorateur;
  tardifs.inspecteur = inspecteur;
  // Sur tablette, l'explorateur et l'inspecteur flottent sur le plan : ouverts d'office, ils en
  // couvriraient les deux tiers. Ils s'ouvrent a la demande.
  cadrage.replierPourTablette();
  // Le tiroir a un onglet actif des l'ouverture : le balisage n'en montre aucun.
  tiroir.activer(etat.panelTab, false);
  p.render();
  // Un terrain venu du cadastre est cadre a sa taille reelle ; un plan dessine a la main garde le
  // cadrage historique, ses coordonnees ont ete posees avec.
  const parcelle = etat.objects.find(o => o.key === 'parcelle');
  if (parcelle && parcelle.cadastre && aDesSommets(parcelle) && parcelle.pts.length >= 3) cadrage.cadrer(parcelle);
  // Le fond orthophoto et le masquage du voisinage enregistres avec le projet sont restitues.
  restaurerOrthoDuProjet(ch.ctxOrtho());
  ch.restaurerAffichage();
  // « Partir d'une adresse » au premier pas passe par la COMMANDE : elle porte la capacite, la
  // permission et le quota, et un premier pas ne doit pas etre le seul chemin qui les contourne.
  if (options.vitrine) {
    // La vitrine ne montre que la Vue 3D, ombres cochees d'office (app/vitrine.ts). Rien a proposer :
    // le plan ne s'y enregistre pas.
    vue3d.ombres = true;
    // La terrasse choisie, sinon la Vue 3D montrerait le terrain sans sa structure.
    const terrasse = etat.objects.find(o => o.fonction === 'terrasse' && o.type === 'polygon');
    if (terrasse) explorateur.selectionner(terrasse.key);
    commandes.executer('vue.3d');
    // Le point de vue d'abord, le zoom ensuite, depuis lui. Une fois la scene la : poser la camera
    // avant, c'est la poser sur une scene que la construction remplacera.
    const pdv = trouverPointDeVue(etat.objects.filter(o => o.fonction === 'camera'), options.vitrine.pdv);
    const zoom = options.vitrine.zoom;
    if (pdv || zoom) {
      quandScenePrete(() => vue3d.scene as SceneZoomable | null, (sc) => {
        if (pdv) vues.allerAuPointDeVue(pdv);
        if (zoom) appliquerZoom(vue3d.scene as SceneZoomable | null ?? sc, zoom);
      });
    }
    // La photo aerienne se telecharge : la scene s'ouvre sans, et se refait quand les tuiles sont
    // la. Meme terrasse, donc meme camera : le zoom demande est garde (three/scene.ts).
    // Le soleil court sur la journee du jour (heureauto=y) : la date d'abord, puis l'heure a chaque pas.
    if (options.vitrine.heureAuto) {
      vues.vues3d.soleil3d.date(dateDuJour());
      animerHeure(options.vitrine.heureAuto, (m) => vues.vues3d.soleil3d.heure(m));
    }
    if (options.vitrine.orthophoto) {
      void basculerOrthophoto(true, ch.ctxOrtho()).then(() => { if (ortho.actif) commandes.executer('vue.3d'); });
    }
  }
  else if (seed.ouvrirAdresse) commandes.executer('projet.depuisAdresse');
  // Un projet d'un schema anterieur : proposer de le mettre a jour, une fois le plan a l'ecran.
  else projet.proposerMiseAJour();
  if (import.meta.env.DEV) exposerPourLesCaptures(p, explorateur);
  // L'ecran des controleurs relit a chaque demande : on lui donne la lecture, pas son resultat.
  if (options.controleurs) options.controleurs(() => sourceControleurs(commandes, inspecteur, etat.objects));
}

/**
 * La bascule « Isoler la terrasse » (app/isolement.ts) : la commande, et la sortie automatique quand
 * la terrasse isolee n'est plus selectionnee.
 */
function brancherIsolement(p: Plan): void {
  const { etat, magasin, cadrage, commandes } = p;
  const isolement = creerIsolement({
    etat,
    render: () => p.render(),
    cadrer: (obj) => cadrage.cadrer(obj),
    vue3dOuverte: () => magasin.store.getState().vue === 'vue3d',
    reconstruire3d(recadrer) {
      // Sans cle de vue, la scene reconstruite ne reprend pas la camera : elle se cadre sur ce
      // qu'elle montre (three/scene.ts).
      if (recadrer) vue3d.dernierObjKey = null;
      commandes.executer('vue.3d');
    },
    lireCamera() {
      const sc = vue3d.scene;
      if (!sc) return null;
      const { x, y, z } = sc.camera.position, t = sc.controls.target;
      return { pos: { x, y, z }, cible: { x: t.x, y: t.y, z: t.z } };
    },
    poserCamera(c) {
      const sc = vue3d.scene;
      if (!sc) return;
      sc.camera.position.set(c.pos.x, c.pos.y, c.pos.z);
      sc.controls.target.set(c.cible.x, c.cible.y, c.cible.z);
      sc.controls.update();
      sc.renderer.render(sc.scene, sc.camera);
    },
    notifier: () => magasin.notifier()
  });
  commandes.declarer({
    id: 'terrasse.isoler', libelle: 'Isoler la terrasse', groupe: 'terrasse',
    description: 'Ne montre que la terrasse sélectionnée, en transparence, et cadre la vue sur elle. Rebasculer, ou désélectionner la terrasse, rend la vue d\'avant.',
    actif: () => isolement.actif() || !!terrasseSelectionnee(etat),
    executer: () => isolement.basculer()
  });
  // La selection change par le plan, l'explorateur, le clavier : le magasin est le seul endroit ou
  // tous ces chemins se retrouvent.
  magasin.store.subscribe(() => isolement.suivreSelection());
}

/**
 * Les poignees des captures de reference (scripts/captures.mjs) et de la fumee automatisee
 * (scripts/fumee.mjs). En developpement seulement : le fichier livre ne les porte pas.
 */
function exposerPourLesCaptures(p: Plan, explorateur: Explorateur): void {
  const { etat, magasin, commandes, tiroir } = p;
  Object.assign(window, { __plan: {
    executer: (id: string) => commandes.executer(id),
    selectionnerPremiere: (fonction: string) => {
      const o = etat.objects.find(x => x.fonction === fonction);
      if (o) explorateur.selectionner(o.key);
    },
    ouvrirFeuille: (feuille: Feuille) => magasin.definirFeuille(feuille),
    ouvrirResultats: (onglet: string) => tiroir.activer(onglet),
    // Lecture seule : ce qu'un geste a change se mesure dans l'etat, pas a l'oeil.
    etat: () => etat,
    selectionnerCle: (cle: string | null) => explorateur.selectionner(cle),
    magasin: () => magasin.store.getState()
  } });
}

// main.ts n'a besoin que de ces deux points d'entree.
export { boot, loadInitialProject, graineVitrine };

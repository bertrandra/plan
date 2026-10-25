// Le plan sans ses ecouteurs ni ses panneaux (app/boot.ts) : l'etat, la surface et son dessin, l'historique, le tiroir, les gestes,
// et l'atelier que les ecouteurs recoivent.

import { creerEtat } from '../../core/state.js';
import { creerHistorique } from '../../core/historique.js';
import { synchroniserContexteTerrasse, terrasseCourante, terrasseSelectionnee } from '../../core/contexteTerrasse.js';
import { detruireVue } from '../../render/vues.js';
import { rendreScene, rendreObjets, type ContexteRendu } from '../../render/pipeline.js';
import { dessinerCourbesRelief } from '../../render/relief.js';
import { dessinerNomsDesRues } from '../../render/rues.js';
import { creerApercuVue } from '../../render/apercuVue.js';
import { modeDiagnostic, couleurDiagnostic } from '../diagnostic.js';
import { serializeObjects, serializeMeasures } from '../../io/serialisation.js';
import { creerRegistre } from '../commandes.js';
import { droitsCourants, enLectureSeule } from '../acces.js';
import { creerMagasin } from '../magasin.js';
import { creerTiroir } from '../tiroir.js';
import { creerResultats } from '../resultats.js';
import { type Inspecteur } from '../inspecteur.js';
import { type Explorateur } from '../explorateur.js';
import { type Projet } from '../projet.js';
import { retenirProjetsConnus } from '../../plateforme/quotaProjets.js';
import { signalerLimiteProjets } from '../limiteProjets.js';
import { appliquerClasse } from '../classe.js';
import { normaliserEnObjetsDuPlan } from '../assemblage/formes.js';
import { creerSurface } from '../assemblage/surface.js';
import { creerDessin } from '../assemblage/dessin.js';
import { creerAffichage } from '../assemblage/affichage.js';
import { creerCadrage, mesurerScene } from '../assemblage/cadrage.js';
import { creerMesures } from '../assemblage/mesures.js';
import { creerGestes } from '../assemblage/gestes.js';
import { type Vues3d } from '../assemblage/vues3d.js';
import { resumeDuProjet } from '../assemblage/exports.js';
import { dessinerReleves } from '../../render/releve.js';
import { dessinerCloture } from '../../render/cloture.js';
import type { Atelier } from '../atelier.js';
import type { ObjetPlan } from '../../model/types.js';
import { estPiscine } from '../../model/fonctions.js';
import type { GraineDemarrage } from './graines.js';

/**
 * La lecture des toits en tache de fond (app/toitsFond.ts) est-elle permise ? Pas dans la vitrine,
 * qui montre un plan fige, ni en developpement sur le plan temoin ou sous la fumee et les captures
 * (`window.__sansToitsFond`) : une lecture qui aboutirait changerait les toits qu'elles mesurent.
 */
let permis = true;
/** Pose une fois au demarrage (boot) ; les chargements le relisent. */
export function permettreToitsFond(oui: boolean): void { permis = oui; }
export const toitsFondPermis = (): boolean => permis;
/** Le mode de diagnostic de l'adresse (app/diagnostic.ts), lu une fois. */
export const diagnostic = modeDiagnostic();
/** Au-dela, un rendu complet est trop lent pour suivre un geste : la vue passe par un apercu (render/apercuVue.ts). */
const RENDU_LENT_MS = 30;
export const lectureDeFondPermise = (vitrine: boolean) => !vitrine && !(import.meta.env.DEV
  && (new URLSearchParams(location.search).has('temoin') || !!(window as { __sansToitsFond?: boolean }).__sansToitsFond));

/**
 * Ce qui nait apres l'atelier et que le plan doit pourtant pouvoir appeler : les vues 3D (le
 * rafraichissement des panneaux de terrasse) et les deux panneaux lateraux (repliés sur tablette).
 * Rien ne les appelle avant qu'ils existent ; l'appel optionnel le dit sans l'affirmer.
 */
export interface Tardifs { vues?: Vues3d; explorateur?: Explorateur; inspecteur?: Inspecteur; projet?: Projet }

/** Le plan, sans ses ecouteurs ni ses panneaux : l'etat, la surface et son dessin, l'historique, le tiroir, les gestes. */
export function assemblerLePlan(seed: GraineDemarrage, tardifs: Tardifs) {
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
  const piscineSelectionnee = () => { const o = etat.objects.find(x => x.key === etat.selectedKey); return o && estPiscine(o) ? o : undefined; };
  const tiroir = creerTiroir(etat, { refreshTerrasseView, terrasseSelectionnee: () => terrasseSelectionnee(etat), piscineSelectionnee }, magasin);
  const resultats = creerResultats(etat, {
    pushHistory, markDirty, render, renderTerrasseLayerView: dessin.renderTerrasseLayerView,
    terrasseCourante: () => terrasseCourante(etat),
    trouverParcelle: affichage.trouverParcelleCloture, lieuActuel: affichage.lieuActuel,
    construireResume: () => resumeDuProjet(etat, mesures),
    refLabel: mesures.refLabel, targetLabel: mesures.targetLabel, computeMeasureGeom: mesures.computeMeasureGeom,
    montrerResume: () => {
      tiroir.activer('resume');
      if (magasin.store.getState().classe === 'compact') magasin.definirFeuille('resultats');
    },
    montrerProfil: () => {
      tiroir.activer('profil');
      if (magasin.store.getState().classe === 'compact') magasin.definirFeuille('resultats');
    }
  }, magasin);

  // Le dessin du plan est orchestre dans render/pipeline.ts. La terrasse courante suit la selection
  // (core/contexteTerrasse.ts), et le tiroir la suit a chaque rendu.
  function render(): void {
    const debut = performance.now();
    apercu.annuler();
    const contexteChange = synchroniserContexteTerrasse(etat);
    // Le plancher du zoom suit les parcelles affichees : un voisinage ajoute ou demasque doit
    // pouvoir tenir en entier dans la scene au geste suivant.
    cadrage.ajusterPlancher();
    rendreScene(etat, contexteRendu());
    tiroir.synchroniser(contexteChange);
    magasin.notifier();
    dureeDernierRendu = performance.now() - debut;
  }
  // Le zoom et le deplacement s'adaptent au plan (render/apercuVue.ts) : un rendu complet tant qu'il
  // est rapide (un petit plan), un apercu par transformation pendant le geste quand il ne l'est plus.
  const apercu = creerApercuVue({ element: surface.svg, rendre: () => render() });
  let dureeDernierRendu = 0;
  const vueChangee = (avant: typeof etat.scene) => {
    if (dureeDernierRendu < RENDU_LENT_MS) render();
    else apercu.changer(avant, etat.scene);
  };
  /** Ces objets seulement, sans le reste du plan ni les zones : la lecture des toits en tache de fond. */
  function redessinerObjets(cles: readonly string[]): void {
    // Pendant un apercu, le dessin ne suit pas encore la scene : le rendu complet qui suit les reprendra.
    if (apercu.enCours()) return;
    const objets = etat.objects.filter((o) => cles.includes(o.key));
    if (objets.length) rendreObjets(etat, contexteRendu(), objets);
  }
  function contexteRendu(): ContexteRendu {
    return {
      ...dessin, ...affichage, markDirty, render, etat, orthoGroup: () => surface.ortho,
      // ?mode=devroof ou devwall : chaque batiment peint selon l'origine de son toit ou de ses murs.
      ...(diagnostic ? { couleurDiagnostic: (o: ObjetPlan) => couleurDiagnostic(o, diagnostic) } : {}),
      // Les courbes de niveau du relief, dans leur calque au-dessus de la grille (render/relief.ts).
      // Le voisinage masque emporte le paysage (courbes au-dela de la parcelle) et le nom des rues.
      dessinerRelief: () => dessinerCourbesRelief(surface.relief, etat.objects, etat.scene, etat.voisinageVisible),
      // Le nom des rues, si la case de la section « Voisinage » est cochee (render/rues.ts).
      dessinerRues: () => { if (etat.voisinageVisible) dessinerNomsDesRues(surface.rues, etat.objects, etat.scene, affichage.objetMasque); else surface.rues.innerHTML = ''; },
      // Les ouvertures relevees puis la cloture, dans le meme groupe : le premier le vide.
      renderReleves: () => {
        dessinerReleves(surface.releves, etat, dessin.toScreen, affichage.objetMasque);
        const parcelle = affichage.trouverParcelleCloture();
        if (parcelle && !affichage.objetMasque(parcelle)) dessinerCloture(surface.releves, etat, dessin.toScreen, parcelle);
      }
    };
  }
  const gestes = creerGestes(etat, { ...dessin, pushHistory, render, rebuildSelector, mesures });
  const cadrage = creerCadrage(etat, magasin, surface, {
    render, toWorld: dessin.toWorld, objetMasque: affichage.objetMasque,
    basculerExplorateur: () => tardifs.explorateur?.basculerOuverture(),
    basculerInspecteur: () => tardifs.inspecteur?.basculerOuverture()
  });
  return {
    etat, magasin, commandes, affichage, surface, dessin, mesures, historique, tiroir, resultats, gestes, cadrage,
    render, redessinerObjets, vueChangee, rebuildSelector, pushHistory, markDirty, refreshTerrasseView
  };
}

export type Plan = ReturnType<typeof assemblerLePlan>;

/** L'atelier : ce que les ecouteurs ont le droit de demander au plan (app/atelier.ts). */
export function atelierDu(p: Plan): Atelier {
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

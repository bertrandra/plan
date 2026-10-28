// Le plan sans ses ecouteurs ni ses panneaux (app/boot.ts) : l'etat, la surface et son dessin, l'historique, le tiroir, les gestes,
// et l'atelier que les ecouteurs recoivent.

import { creerEtat } from '../../core/state.js';
import { creerHistorique } from '../../core/historique.js';
import { detruireVue } from '../../render/vues.js';
import { serializeObjects, serializeMeasures } from '../../io/serialisation.js';
import { creerRegistre } from '../commandes.js';
import { droitsCourants, enLectureSeule } from '../acces.js';
import { creerMagasin } from '../magasin.js';
import type { Inspecteur } from '../inspecteur.js';
import type { Explorateur } from '../explorateur.js';
import type { Projet } from '../projet.js';
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
import type { Vues3d } from '../assemblage/vues3d.js';
import type { Atelier } from '../atelier.js';
import type { ObjetPlan } from '../../model/types.js';
import type { GraineDemarrage } from './graines.js';
import { creerRendu } from './rendu.js';
import { assemblerLesResultats } from './resultatsDuPlan.js';
import { soleilDuProjet } from '../../core/soleil.js';

/**
 * La lecture des toits en tache de fond (app/toits/toitsFond.ts) est-elle permise ? Pas dans la vitrine,
 * qui montre un plan fige, ni en developpement sur le plan temoin ou sous la fumee et les captures
 * (`window.__sansToitsFond`) : une lecture qui aboutirait changerait les toits qu'elles mesurent.
 */
let permis = true;
/** Pose une fois au demarrage (boot) ; les chargements le relisent. */
export function permettreToitsFond(oui: boolean): void { permis = oui; }
export const toitsFondPermis = (): boolean => permis;
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
  // Une ecriture nomme les objets qu'elle modifie sur place, quand elle les connait (core/controleurObjets.ts) ; sans objet, tout est neuf.
  const pushHistory = (...objets: object[]) => historique.empiler(...objets);
  const markDirty = (...objets: object[]) => historique.marquerModifie(...objets);
  // Le tiroir des resultats et ses panneaux (app/boot/resultatsDuPlan.ts).
  const { tiroir, resultats } = assemblerLesResultats(etat, magasin, {
    pushHistory, markDirty, render, refreshTerrasseView, renderTerrasseLayerView: dessin.renderTerrasseLayerView, affichage, mesures
  });

  // Le dessin du plan, le rendu complet et l'apercu pendant un geste : app/boot/rendu.ts. `render` est hisse, parce que
  // l'historique et le dessin le recoivent avant que le rendu n'existe ; il ne s'appelle qu'une fois le plan assemble.
  function render(): void { rendu.render(); }
  const rendu = creerRendu({ etat, magasin, surface, dessin, affichage, tiroir, markDirty, cadrage: () => cadrage });
  const { vueChangee, redessinerObjets } = rendu;
  const gestes = creerGestes(etat, { ...dessin, pushHistory, markDirty, render, rebuildSelector, mesures });
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
    // Le soleil du projet n'est pas un pas d'annulation : l'instantane restaure porte celui d'avant, et il est range de nouveau
    // sur la parcelle tel qu'il est a l'ecran (core/soleil.ts). L'ouverture d'un projet, elle, le relit (io/projet.ts).
    undo: () => { historique.annuler(); soleilDuProjet.ranger(etat.objects); },
    restoreState: (i) => { historique.restaurer(i); soleilDuProjet.ranger(etat.objects); },
    render: p.render, rebuildSelector: p.rebuildSelector,
    rebuildHandles: dessin.rebuildHandles, reapplyStackingOrder: dessin.reapplyStackingOrder,
    fitToObject: p.cadrage.cadrer, ...p.gestes
  };
}

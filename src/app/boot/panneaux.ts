// Les panneaux (zones/) et les services qu'ils lisent, et ce que la decouverte des controleurs lit de Plan en marche (app/boot.ts).

import { elevationOf } from '../../engine/hauteurs.js';
import { interiorAngleDeg } from '../../geometry/angles.js';
import { mesure } from '../../interaction/outilMesure.js';
import { serializeObjects, serializeMeasures } from '../../io/serialisation.js';
import { cleDernierProjet, withProjectParam, apiSave, apiDelete } from '../../io/api.js';
import { analyseClaudeDuNavigateur } from '../audit/parcelle/analyseNavigateur.js';
import { creerInspecteur, type Inspecteur } from '../inspecteur.js';
import { creerExplorateur } from '../explorateur.js';
import { brancherCommandesCiblees } from '../ecouteurs/cibles.js';
import { creerProjet } from '../projet.js';
import { actualisation } from '../cadastre/actualisationIgn.js';
import { aPoints } from '../assemblage/formes.js';
import { libelleTypeObjet, dejaRectangle } from '../assemblage/gestes.js';
import type { Vues3d } from '../assemblage/vues3d.js';
import { monterZones } from '../../zones/monter.js';
import { creerServiceReleve } from '../releve/releve.js';
import { aideReleveDuNavigateur } from '../releve/renfortReleve.js';
import { brancherFacade } from '../ecouteurs/facade.js';
import type { Atelier } from '../atelier.js';
import type { ObjetPlan } from '../../model/types.js';
import { EXPOSITION } from '../exposition.js';
import { APP_VERSION } from '../../model/version.js';
import { PREFIXE_ECHANTILLON, type SourceControleurs } from '../administration/controleurs.js';
import type { ChampChoix } from '../../ui/champs/types.js';
import type { RegistreCommandes } from '../commandes.js';
import type { GraineDemarrage } from './graines.js';
import type { Plan } from './plan.js';
import type { chargements } from './chargements.js';

/** Les panneaux (zones/) et les services qu'ils lisent : projet, explorateur, inspecteur. Montes en dernier. */
export function monterLesPanneaux(p: Plan, atelier: Atelier, ch: ReturnType<typeof chargements>, vues: Vues3d, seed: GraineDemarrage) {
  const { etat, magasin, commandes, historique, resultats, tiroir, mesures, gestes } = p;
  const projet = creerProjet(seed, {
    etat, apiSave, apiDelete, serializeObjects, serializeMeasures, withProjectParam,
    initialState: atelier.initialState, initialMeasures: atelier.initialMeasures,
    cleDernierProjet: cleDernierProjet(),
    definirRafraichisseurStatut: (f) => historique.definirRafraichisseurStatut(f),
    modifications: () => historique.modifications(),
    ouvrirImportCadastre: ch.ouvrirImportCadastre,
    ouvrirDialogueActualisation: ch.ouvrirActualisation,
    ouvrirActualisationProjet: ch.ouvrirActualisationProjet,
    actualisationEnCours: () => actualisation.enCours()
  }, magasin, commandes);
  const explorateur = creerExplorateur(etat, { render: p.render, redimensionner: p.cadrage.redimensionner }, magasin);
  // Les commandes qui portent sur un objet ou une cote : l'explorateur et le tiroir les declenchent.
  brancherCommandesCiblees(commandes, { etat, explorateur, resultats });
  // L'inspecteur rend des descripteurs de champs (ui/champs/) ; ce service leur donne leur contexte.
  const inspecteur = creerInspecteur(etat, {
    libelleType: libelleTypeObjet, elevationOf, refLabel: mesures.refLabel, measureSegCoords: mesures.measureSegCoords, dejaRectangle,
    interiorAngleDeg: (obj, i) => interiorAngleDeg(aPoints(obj), i),
    contexteSoleil: p.affichage.contexteSoleilParasol,
    applyAngleEdit: gestes.applyAngleEdit, applyLengthEdit: gestes.applyLengthEdit, deleteVertex: gestes.deleteVertex,
    alignObjectByRotation: gestes.alignObjectByRotation, allerAuPointDeVue: vues.allerAuPointDeVue,
    startPick: (mode, multi, but, indice) => resultats.pointer(mode, multi, but, indice),
    pushHistory: p.pushHistory, preparerHistorique: () => p.historique.preparer(), render: p.render, markDirty: p.markDirty, refreshTerrasseView: p.refreshTerrasseView,
    buildThreeScene: vues.buildThreeScene, reapplyStackingOrder: p.dessin.reapplyStackingOrder, rebuildHandles: p.dessin.rebuildHandles,
    trouverParcelle: p.affichage.trouverParcelleCloture,
    optimisation: { visible: () => resultats.optimisationVisible() },
    resultats,
    redimensionner: p.cadrage.redimensionner
  }, magasin, commandes);
  // Le pointage en cours (Cote, Aligner) et le moyen d'en sortir : le bandeau du canevas et Echap.
  const pointage = { courant: () => mesure.pointage, arreter: () => resultats.arreterPointage() };
  // Le releve de facade : le parcours de prise de vue (zones/Releve.tsx) et ses deux commandes.
  // L'aide de Claude au releve (lot L18) : le meme client, la meme identite et le meme accord par projet que l'audit.
  const aide = aideReleveDuNavigateur(analyseClaudeDuNavigateur(etat, () => magasin.store.getState().projet.courant?.id ?? null));
  const releve = creerServiceReleve({ etat, pushHistory: p.pushHistory, render: p.render, buildThreeScene: vues.buildThreeScene, elevationOf, aide });
  brancherFacade({ etat, releve, pushHistory: p.pushHistory, render: p.render, buildThreeScene: vues.buildThreeScene }, commandes);
  monterZones({ magasin, commandes, projet, explorateur, inspecteur, tiroir, pointage, resultats, vues3d: vues.vues3d, releve });
  return { explorateur, inspecteur, projet };
}

/**
 * La decouverte des controleurs (app/administration/controleurs.ts) : ce que Plan a monte, lu sans rien executer.
 * Les sections de l'inspecteur dependent de l'objet : on en demande une par sorte d'objet du plan.
 */
export function sourceControleurs(commandes: RegistreCommandes, inspecteur: Inspecteur, objets: ObjetPlan[], ecran: NonNullable<SourceControleurs['ecran']>): SourceControleurs {
  const sortes = new Map<string, ObjetPlan>();
  for (const o of objets) {
    const cle = o.type + '.' + (o.fonction || 'aucune');
    if (!sortes.has(cle)) sortes.set(cle, o);
  }
  return {
    appVersion: APP_VERSION,
    // Ce que la page affiche sans le rattacher au registre, dans chaque classe d'ecran.
    ecran,
    commandes: commandes.lister(),
    exposition: EXPOSITION,
    inspecteur: [...sortes].sort(([a], [b]) => a.localeCompare(b)).map(([cle, o]) => {
      const c = inspecteur.contexte(o);
      // Les valeurs permises d'une liste dependent de l'objet : on les demande pour celui-ci. Une
      // liste qui ne se laisse pas lire est signalee vide plutot que de casser la decouverte.
      const optionsDe = (ch: ChampChoix) => { try { return ch.options(c); } catch { return null; } };
      return { cle, nom: libelleTypeObjet(o), sections: inspecteur.sections(c), optionsDe, echantillon: o.key.startsWith(PREFIXE_ECHANTILLON) };
    })
  };
}

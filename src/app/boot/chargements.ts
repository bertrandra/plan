// Ce que le chargement d'un projet, l'import depuis une adresse et l'actualisation IGN doivent pouvoir declencher (app/boot.ts).

import { poserQuestionsToitsACheval } from '../toitsACheval.js';
import { terrasseCourante } from '../../core/contexteTerrasse.js';
import { chargerOrthophoto, ortho } from '../../render/ortho.js';
import { lectureToits } from '../../core/lectureToits.js';
import { creerToitsFond, texteFinToitsFond, PARALLELE_TOITS_FOND } from '../toitsFond.js';
import { creerRegulateur, brancherRegulateur } from '../regulateur.js';
import { creerProfilsFacadesFond } from '../profilsFacadesFond.js';
import { validerProjetJSON } from '../../io/validation.js';
import { serializeObjects, serializeMeasures } from '../../io/serialisation.js';
import { cleDernierProjet, withProjectParam, apiSave } from '../../io/api.js';
import { appliquerProjetImporte as chargerProjetImporte, restaurerAffichageDuProjet } from '../../io/projet.js';
import { projetARemplir } from '../projet.js';
import { showToast } from '../../shell/dialogs.js';
import { ouvrirDialogueActualisation, type ContexteActualisation } from '../actualisationIgn.js';
import { ouvrirActualisationProjet } from '../actualiserProjet.js';
import { creerImportCadastre } from '../importCadastre.js';
import { parcours } from '../parcours.js';
import type { ObjetPlan } from '../../model/types.js';
import { vue3d } from '../../three/etat3d.js';
import type { ProjetValide } from '../../io/validation.js';
import type { GraineDemarrage } from './graines.js';
import { toitsFondPermis, type Plan, type Tardifs } from './plan.js';

/**
 * Le chargement d'un projet (io/projet.ts), l'import depuis une adresse et l'actualisation IGN
 * (des parcours, app/parcours.ts) : ce qu'ils doivent pouvoir declencher.
 */
export function chargements(p: Plan, seed: GraineDemarrage, tardifs: Tardifs) {
  const { etat, affichage, dessin, historique } = p;
  const ctxOrtho = () => ({
    trouverParcelleCloture: affichage.trouverParcelleCloture, render: p.render, toScreen: dessin.toScreen,
    markDirty: p.markDirty, lieuActuel: affichage.lieuActuel, etat, orthoGroup: () => p.surface.ortho
  });
  const ctxProjetImporte = () => ({
    ...ctxOrtho(), ...affichage, buildThreeScene: (o: ObjetPlan | null) => tardifs.vues?.buildThreeScene(o),
    fitToObject: p.cadrage.cadrer, cadrerTerrains: p.cadrage.cadrerTerrains, pushHistory: p.pushHistory, rebuildSelector: p.rebuildSelector,
    restoreState: historique.restaurer, validerProjetJSON
  });
  // Un batiment a cheval sur deux parcelles dont la toiture laisse un doute : une question chacun
  // (app/toitsACheval.ts), a l'ouverture, apres un import et apres une actualisation IGN.
  const questionsACheval = () => poserQuestionsToitsACheval({
    objets: () => etat.objects, lectureSeule: () => !!etat.lectureSeule, preparer: () => historique.preparer(),
    apresModification: () => { p.render(); if (vue3d.scene) tardifs.vues?.buildThreeScene(terrasseCourante(etat) || null); },
    montrer: (o) => tardifs.explorateur?.selectionner(o.key)
  });
  // Apres une actualisation, tout se redessine : le plan, la Vue 3D si elle est ouverte, et la photo
  // aerienne, relue sur l'etendue nouvelle (le voisinage, son relief). Il fallait sinon repasser
  // par le plan ou la 3D pour voir le resultat.
  // Les toits que l'import ou l'actualisation n'ont pas lus (les trente plus proches seulement), en
  // tache de fond, par lots (app/toitsFond.ts) : chaque lot ecrit se dessine, la 3D ouverte suit au
  // plus toutes les dix secondes - une scene de milliers de batiments ne se rebatit pas a chaque toit.
  const toitsFond = creerToitsFond({
    objets: () => etat.objects,
    lectureSeule: () => !!etat.lectureSeule || !toitsFondPermis(),
    progression: (pr) => lectureToits.definir(pr),
    modifications: historique.modifications, sale: () => !!etat.dirty,
    enregistrer: () => tardifs.projet?.enregistrerSansBruit() ?? Promise.resolve(false),
    // Le rythme suit l'utilisateur et le poste (app/regulateur.ts) : tout tourne ici, avec l'interface.
    regulateur: (() => { const r = creerRegulateur({ max: PARALLELE_TOITS_FOND }); return { r, brancher: () => brancherRegulateur(r) }; })(),
    // Au bout : le bilan de ce qui a ete lu, et les toits a cheval sur deux parcelles qui attendent
    // une reponse - un mitoyen lu en fond a pu en ajouter un.
    fin: (b) => {
      showToast(texteFinToitsFond(b));
      questionsACheval();
    },
    // Les batiments ecrits seulement, dans le plan et dans la Vue 3D ouverte : rebatir des milliers
    // d'objets a chaque lot figeait l'ecran plusieurs secondes (MD/roadmap-toits-fond.md, mesure).
    apresLot: (cles) => {
      p.markDirty();
      p.redessinerObjets(cles);
      if (vue3d.scene && !tardifs.vues?.remplacerObjets3d(cles)) tardifs.vues?.buildThreeScene(terrasseCourante(etat) || null);
    }
  });
  // Les profils de facades rechoisis apres un changement de reglages (app/profilsFacadesFond.ts) : sans
  // reseau, par lots ; seuls les batiments dont le profil change se redessinent dans la Vue 3D ouverte.
  const profilsFacades = creerProfilsFacadesFond({
    objets: () => etat.objects,
    lectureSeule: () => !!etat.lectureSeule || !toitsFondPermis(),
    apresLot: (b) => {
      p.markDirty();
      if (b.changes.length && vue3d.scene && !tardifs.vues?.remplacerObjets3d(b.changes)) tardifs.vues?.buildThreeScene(terrasseCourante(etat) || null);
    }
  });
  const apresActualisation = () => {
    questionsACheval();
    toitsFond.relancer();
    void profilsFacades.relancer();
    const refaire3d = () => { if (vue3d.scene) tardifs.vues?.buildThreeScene(terrasseCourante(etat) || null); };
    p.render();
    refaire3d();
    if (ortho.actif) void chargerOrthophoto(ctxOrtho()).catch(() => null).then(() => { p.render(); refaire3d(); });
  };
  // Le contexte des deux actualisations (IGN, et le projet entier aux valeurs par defaut).
  const contexteActualisation = (): ContexteActualisation => ({
    etat, markDirty: p.markDirty, pushHistory: p.pushHistory, rebuildSelector: p.rebuildSelector, render: p.render,
    restoreState: historique.restaurer, serializeMeasures, serializeObjects,
    syncLieuTitre: affichage.syncLieuTitre,
    trouverParcelleCloture: affichage.trouverParcelleCloture,
    apresActualisation
  });
  const appliquerProjetImporte = (valide: ProjetValide, remplacer: boolean) => {
    const r = chargerProjetImporte(valide, remplacer, etat, ctxProjetImporte());
    questionsACheval();
    // Un autre plan : la lecture en cours s'arrete, et reprend sur celui-ci.
    toitsFond.arreter();
    toitsFond.relancer();
    profilsFacades.arreter();
    void profilsFacades.relancer();
    return r;
  };
  return {
    ctxOrtho, appliquerProjetImporte, questionsACheval, toitsFond, profilsFacades,
    restaurerAffichage: () => restaurerAffichageDuProjet(etat, ctxProjetImporte()),
    ouvrirImportCadastre() {
      const importe = creerImportCadastre({ apiSave, appliquerProjetImporte, withProjectParam,
        apiDisponible: seed.apiAvailable, cleDernierProjet: cleDernierProjet(),
        // Un projet neuf (document `{}`) se remplit, tant que rien n'y a ete dessine.
        projetCible: () => projetARemplir(seed, etat) }, () => parcours.fermer());
      parcours.ouvrir({ type: 'cadastre', importe });
      // Par defaut, la parcelle sous la position de l'appareil : sur le terrain, c'est la bonne.
      void importe.utiliserMaPosition(true);
    },
    ouvrirActualisation: () => ouvrirDialogueActualisation(contexteActualisation()),
    ouvrirActualisationProjet: () => ouvrirActualisationProjet(contexteActualisation())
  };
}

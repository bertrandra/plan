// Le tiroir des resultats et le service qui ecrit par lui (app/tiroir.ts, app/resultats.ts), assembles pour le plan
// (app/boot/plan.ts) : ses onglets suivent la terrasse ou la piscine choisie, ses panneaux ecrivent par `resultats`, ou chaque saisie
// s'annule et marque le projet modifie. A part du plan, qui n'a plus a connaitre la terrasse courante, la piscine ni le resume
// (MD/roadmap-architecture.md, etape 3.3).

import { terrasseCourante, terrasseSelectionnee } from '../../core/contexteTerrasse.js';
import type { EtatApp } from '../../core/state.js';
import { estPiscine } from '../../model/fonctions.js';
import type { ObjetPlan } from '../../model/types.js';
import { creerTiroir } from '../tiroir.js';
import { creerResultats } from '../resultats.js';
import type { Magasin } from '../magasin.js';
import { resumeDuProjet } from '../assemblage/exports.js';
import type { Affichage } from '../assemblage/affichage.js';
import type { Mesures } from '../assemblage/mesures.js';

/** Ce que le tiroir demande au reste du plan. */
export interface DependancesResultats {
  pushHistory: () => void;
  markDirty: () => void;
  render: () => void;
  refreshTerrasseView: () => void;
  renderTerrasseLayerView: (obj: ObjetPlan) => void;
  affichage: Pick<Affichage, 'trouverParcelleCloture' | 'lieuActuel'>;
  mesures: Mesures;
}

export function assemblerLesResultats(etat: EtatApp, magasin: Magasin, d: DependancesResultats) {
  const piscineSelectionnee = () => { const o = etat.objects.find(x => x.key === etat.selectedKey); return o && estPiscine(o) ? o : undefined; };
  const tiroir = creerTiroir(etat, { refreshTerrasseView: d.refreshTerrasseView, terrasseSelectionnee: () => terrasseSelectionnee(etat), piscineSelectionnee }, magasin);
  // Sur telephone, l'onglet montre s'ouvre dans la feuille des resultats.
  const montrer = (onglet: string) => {
    tiroir.activer(onglet);
    if (magasin.store.getState().classe === 'compact') magasin.definirFeuille('resultats');
  };
  const resultats = creerResultats(etat, {
    pushHistory: d.pushHistory, markDirty: d.markDirty, render: d.render, renderTerrasseLayerView: d.renderTerrasseLayerView,
    terrasseCourante: () => terrasseCourante(etat),
    trouverParcelle: d.affichage.trouverParcelleCloture, lieuActuel: d.affichage.lieuActuel,
    construireResume: () => resumeDuProjet(etat, d.mesures),
    refLabel: d.mesures.refLabel, targetLabel: d.mesures.targetLabel, computeMeasureGeom: d.mesures.computeMeasureGeom,
    montrerResume: () => montrer('resume'),
    montrerProfil: () => montrer('profil')
  }, magasin);
  return { tiroir, resultats };
}

// Sujet « couverture » : le materiau de couverture que Claude voit sur l'orthophoto et les photos.

import { libelleDe, COUVERTURES_VUES } from '../../../model/ceQueJeVois.js';
import type { CouvertureChoisie } from '../../../model/types.js';
import type { Proposition } from '../../../regles/decisions.js';
import { deClaude, type EntreeSujet, type Sujet } from './contrat.js';

/** Le materiau de couverture de Claude dans le vocabulaire du projet ; null quand le projet n'a pas ce terme. */
export function couvertureDuVocabulaire(v: string): CouvertureChoisie | null {
  const table: Record<string, CouvertureChoisie> = { 'tuile-plate': 'tuile-plate', 'tuile-canal': 'tuile-canal', 'tuile-mecanique': 'tuile', ardoise: 'ardoise', zinc: 'zinc' };
  return table[v] ?? null;
}

function propositionCouverture({ o, b, v, et, contra }: EntreeSujet): Proposition | null {
  const couverture = couvertureDuVocabulaire(v.couverture.valeur);
  if (!couverture || !o.toit || o.toit.couverture === couverture) return null;
  const choisie = o.toit.couverture;
  return deClaude({
    id: b.cle + ':claude:couverture', cible: { type: 'batiment', cle: b.cle }, objet: 'Couverture de ' + b.nom,
    avant: choisie ? libelleDe(COUVERTURES_VUES, choisie) : 'déduite par Plan', apres: libelleDe(COUVERTURES_VUES, couverture) + ', vue par Claude',
    effet: { type: 'couverture', couverture },
  }, 'couverture', v.couverture, et, contra, choisie ? libelleDe(COUVERTURES_VUES, choisie).toLowerCase() : null);
}

export const couverture: Sujet = { id: 'couverture', libelle: 'Couverture', proposer: propositionCouverture };

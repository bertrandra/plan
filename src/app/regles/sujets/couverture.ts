// Sujet « couverture » : le materiau de couverture que Claude voit sur l'orthophoto et les photos.

import { couvertureDuMot, libelleMotCouverture, motDeLaCouverture, motDuToit, type MotCouverture } from '../../../model/couvertureLue.js';
import type { Proposition } from '../../../regles/decisions.js';
import { deClaude, type EntreeSujet, type Sujet } from './contrat.js';

/**
 * Le mot de couverture de Claude dans le vocabulaire du projet (la table de model/couvertureLue.ts, lot L2) : `tuile-mecanique` y est
 * `tuile`, `ardoise-losange` reste le mot de l'ardoise en losange ; null quand le projet n'a pas ce terme (`gravillons`).
 */
export function couvertureDuVocabulaire(v: string): MotCouverture | null {
  const c = couvertureDuMot(v);
  return c ? motDeLaCouverture(c.couverture, c.pose) : null;
}

function propositionCouverture({ o, b, v, et, contra }: EntreeSujet): Proposition | null {
  const mot = couvertureDuVocabulaire(v.couverture.valeur);
  const lu = mot ? couvertureDuMot(mot) : null;
  const avant = motDuToit(o.batiment?.toit);
  if (!mot || !lu || !o.batiment?.toit || avant === mot) return null;
  return deClaude({
    id: b.cle + ':claude:couverture', cible: { type: 'batiment', cle: b.cle }, objet: 'Couverture de ' + b.nom,
    avant: avant ? libelleMotCouverture(avant) : 'déduite par Plan', apres: libelleMotCouverture(mot) + ', vue par Claude',
    effet: { type: 'couverture', couverture: lu.couverture, ...(lu.pose ? { pose: lu.pose } : {}) },
  }, 'couverture', v.couverture, et, contra, avant ? libelleMotCouverture(avant).toLowerCase() : null);
}

export const couverture: Sujet = { id: 'couverture', attribut: 'couverture', effet: 'couverture', proposer: propositionCouverture };

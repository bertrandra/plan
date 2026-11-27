// Les profils des rues dessinees du plan, gardes d'un dessin a l'autre (option « Rues », MD/spec-rues.md §8, core/).
//
// Le calcul est une fonction pure (model/trottoirs.ts, `profilerRues`) ; le plan le demande a chaque geste et la Vue 3D a chaque
// construction. On garde ici le dernier : il n'est refait que si les chaussees lues, la part des trottoirs ou les contours des
// parcelles changent. Rien n'est enregistre : c'est un cache, pas un etat du projet.

import { parcelleDuProjet } from '../model/fonctions.js';
import { chausseesAffichees } from '../model/rues.js';
import { parcellesConnues, partTrottoirs, profilerRues, type ProfilRue } from '../model/trottoirs.js';
import type { ChausseeRue, ObjetPlan } from '../model/types.js';

/** Le dernier calcul, pour le plan qui se redessine a chaque geste : refait seulement si les chaussees, la part ou les limites changent. */
let dernier: { chaussees: readonly ChausseeRue[]; cle: string; profils: ProfilRue[] } | null = null;

/**
 * Les profils des rues dessinees du plan (option « Rues » cochee), ou aucun. Garde le dernier calcul : le plan et la Vue 3D le
 * demandent a chaque dessin, et rien n'a change tant que les chaussees, la part des trottoirs et les contours des parcelles sont les memes.
 */
export function profilsDuPlan(objets: readonly ObjetPlan[]): ProfilRue[] {
  const parcelle = parcelleDuProjet(objets as ObjetPlan[]);
  const chaussees = chausseesAffichees(parcelle);
  if (!chaussees.length) return [];
  const parcelles = parcellesConnues(objets);
  const part = partTrottoirs(parcelle);
  const cle = part + '|' + parcelles.map((p) => (p.projet ? '*' : '') + p.pts.map((q) => q.x.toFixed(2) + ',' + q.y.toFixed(2)).join(' ')).join(';');
  if (dernier && dernier.chaussees === chaussees && dernier.cle === cle) return dernier.profils;
  const profils = profilerRues(chaussees, parcelles, part);
  dernier = { chaussees, cle, profils };
  return profils;
}


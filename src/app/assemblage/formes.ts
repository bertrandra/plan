// Trois affirmations sur les objets du plan, faites une fois pour tout l'assemblage (app/assemblage/).
//
// Chacune dit ce que le compilateur ne peut pas prouver a travers la serialisation, et le dit a un
// seul endroit plutot qu'un `as` a chaque ligne.

import { normalizeObjects } from '../../model/normalisation.js';
import { enPoints } from '../../model/formes.js';
import type { ObjetAPoints, ObjetBrut, ObjetPlan } from '../../model/types.js';
import type { FormeASommets } from '../../model/sommets.js';
import type { ObjetRendu } from '../../render/objects.js';

/**
 * Le passage « ce qui arrive de dehors » -> « les objets du plan ». `normalizeObjects` clone et
 * complete, mais ne fabrique pas de `key` : celle-la vient du fichier. L'affirmation se fait donc
 * ici, pour les trois appelants (etat initial, historique, duplication), et nulle part ailleurs.
 */
export function normaliserEnObjetsDuPlan(bruts: ObjetBrut[]): ObjetPlan[] {
  return normalizeObjects(bruts) as ObjetPlan[];
}

/**
 * Les fonctions de geometrie demandent un objet dont `pts`, `vertexNames` et `segmentNames`
 * existent ; `enPoints` (model/formes.ts) n'affirme que les sommets. Les appelants ne passent que des
 * formes a points, que la serialisation a completees.
 */
export function aPoints(obj: ObjetPlan): ObjetAPoints & FormeASommets {
  return enPoints(obj) as ObjetAPoints & FormeASommets;
}

/**
 * Meme idee pour le dessin : `render/objects.ts` demande une apparence complete (`type`, `fill`,
 * `fillOpacity`, `stroke`), la ou `ObjetPlan` les donne pour facultatifs. Tout ce qui arrive jusqu'au
 * dessin est passe par la liste blanche de la serialisation, qui les pose.
 */
export function aDessiner(obj: ObjetPlan): ObjetRendu {
  return obj as ObjetRendu;
}

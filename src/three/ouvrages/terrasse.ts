// La terrasse dans la scene 3D, quand elle n'est pas la terrasse courante (MD/spec-ouvrages.md, etape 6.6 : un module 3D par
// ouvrage). Elle s'extrude a sa hauteur, percee de ses trous ; la terrasse courante, elle, se construit piece par piece
// (three/sceneTerrasse.ts). Ce qu'elle lit de la terrasse passe par ce que la terrasse publie (engine/ouvrages/terrasse.ts).

import { dessusTerrasseM } from '../../engine/hauteurs.js';
import { formeDeTerrasse, trousDeTerrasse } from '../../engine/ouvrages/terrasse.js';
import type { Sol } from '../../engine/sol.js';
import type { ObjetPlan, PtBrut } from '../../model/types.js';
import { estTerrasse } from '../../model/fonctions.js';

/**
 * Les morceaux a extruder d'un objet : ses volumes, chacun avec les trous de la terrasse. Tout autre objet n'en a aucun et garde
 * ses volumes tels quels.
 */
export function piecesDeTerrasse<V extends { pts: PtBrut[]; hauteur: number }>(o: ObjetPlan, volumes: V[], h: number, objets: ObjetPlan[]):
  ((V & { trous: PtBrut[][] }) | { pts: PtBrut[]; hauteur: number; trous: PtBrut[][] })[] {
  // Une terrasse percee (le bassin de sa piscine, un trou) garde son trou : pleine, elle recouvrait
  // le bassin des qu'elle n'etait pas la terrasse courante (vitrine, « tous les objets »). Un
  // bassin a cheval sur son bord l'encoche : elle s'extrude alors morceau par morceau.
  const forme = formeDeTerrasse(o, objets);
  return forme ? forme.map((m) => ({ pts: m.contour, hauteur: h, trous: m.trous })) : volumes.map((v) => ({ ...v, trous: trousDeTerrasse(o, objets) }));
}

/**
 * Une autre terrasse est de niveau a sa hauteur finie au-dessus du point HAUT du sol sous elle
 * (engine/hauteurs.ts), comme la terrasse courante : son prisme monte jusque-la. `null` pour tout autre objet, ou sur sol plat.
 */
export function dessusDeTerrasse(o: ObjetPlan, solMoteur: Sol | null): number | null {
  return solMoteur && estTerrasse(o) ? dessusTerrasseM(o, solMoteur) : null;
}

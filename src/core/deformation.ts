// Apres un geste qui deforme le contour d'un objet (un sommet tire, ajoute ou retire, un cote, un rectangle redimensionne, une
// longueur ou un angle saisis) : ce qui est range par rang de cote ou de sommet suit, et le toit lu au LiDAR se relit sur le
// nouveau contour (model/contourDeforme.ts). Le geste a deja pris son pas d'historique : Ctrl+Z defait tout ensemble.

import { mesuresSuivent, suivreDeformation } from '../model/contourDeforme.js';
import type { Origine } from '../model/protections.js';
import type { Mesure, ObjetPlan, PtBrut } from '../model/types.js';
import { toucher } from './controleurObjets.js';
import { lectureToits } from './lectureToits.js';

/** Ce qui protege un toit, dit a la personne. */
const RAISON: Partial<Record<Origine, string>> = {
  fige: 'réglé à la main', verifie: 'vérifié sur place', toitSaisi: 'saisi', toitPhoto: 'lu sur une photo de façade',
};

/** La phrase qui dit qu'un toit protege ne suit pas le contour, ou null. */
export function messageToitGarde(o: { name?: string }, marque: Origine | null): string | null {
  if (!marque) return null;
  return 'Le toit de « ' + (o.name || 'ce bâtiment') + ' » est ' + (RAISON[marque] ?? 'protégé') + ' : il n’est pas relu sur le nouveau contour. '
    + 'Ajustez ses corps en Mode Toit.';
}

/**
 * Le contour de `o` vient de passer de `avant` a son contour d'aujourd'hui, par un geste. Recompte les rangs (releves, fenetres,
 * cotes du plan), remet le toit a lire et relance la lecture en fond ; rend la phrase a dire quand le toit, protege, reste.
 */
export function apresDeformation(etat: { measures: Mesure[] }, o: ObjetPlan, avant: readonly PtBrut[]): string | null {
  if (o.type === 'circle' || !Array.isArray(o.pts)) return null;
  const suite = suivreDeformation(o, avant, 'geste');
  if (!suite.deforme) return null;
  if (avant.length !== o.pts.length) etat.measures = mesuresSuivent(etat.measures, o.key, avant, o.pts, 'geste');
  toucher(o);
  if (suite.relire) lectureToits.demanderRelecture();
  return messageToitGarde(o, suite.toitGarde);
}

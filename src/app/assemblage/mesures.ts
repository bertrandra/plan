// Les cotes vues du reste du programme (app/assemblage/) : leur geometrie, recalculee a chaque rendu
// pour suivre les objets, et leurs libelles — « Terrasse: Cote 2 », « Dalle: P3 ».

import { geometrieMesure, coordonneesCote } from '../../render/measures.js';
import type { EtatApp } from '../../core/state.js';
import type { Mesure } from '../../model/types.js';

export interface Mesures {
  computeMeasureGeom(m: Mesure): ReturnType<typeof geometrieMesure>;
  measureSegCoords(ref: { objKey: string; segIndex: number }): ReturnType<typeof coordonneesCote>;
  refLabel(ref: { objKey: string; segIndex: number } | null): string;
  targetLabel(t: { objKey: string; ptIndex: number }): string;
}

export function creerMesures(etat: EtatApp): Mesures {
  return {
    computeMeasureGeom: (m) => geometrieMesure(etat.objects, m),
    measureSegCoords: (ref) => coordonneesCote(etat.objects, ref),
    refLabel(ref) {
      if (!ref) return '(aucun)';
      const obj = etat.objects.find(o => o.key === ref.objKey);
      if (!obj) return '(objet supprime)';
      return obj.name + ': ' + (obj.segmentNames?.[ref.segIndex] || ('Cote ' + (ref.segIndex + 1)));
    },
    targetLabel(t) {
      const obj = etat.objects.find(o => o.key === t.objKey);
      if (!obj) return '(objet supprime)';
      if (obj.type === 'circle') return obj.name + ' (centre)';
      return obj.name + ': ' + (obj.vertexNames?.[t.ptIndex] || ('P' + (t.ptIndex + 1)));
    }
  };
}

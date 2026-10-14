import { describe, it, expect } from 'vitest';
import { parametresQualite, qualiteParDefaut, estQualite3d, QUALITES_3D, DETAIL_FIN_M } from '../../../src/three/qualite.js';

describe('qualite de la Vue 3D', () => {
  it('Normale est la Vue 3D d avant le reglage, a l identique', () => {
    expect(parametresQualite('normale')).toEqual({ pixelRatioMax: 1, anticrenelage: true, ombresParDefaut: true, carteOmbre: 2048, occlusion: false, detailFinM: DETAIL_FIN_M });
  });

  it('chaque niveau ajoute ou retire autour de Normale', () => {
    const e = parametresQualite('econome'), n = parametresQualite('normale'), s = parametresQualite('soignee');
    expect(e.carteOmbre).toBeLessThan(n.carteOmbre);
    expect(s.carteOmbre).toBeGreaterThan(n.carteOmbre);
    expect(e.ombresParDefaut).toBe(false);
    expect(s.occlusion).toBe(true);
    expect(e.anticrenelage).toBe(false);
    expect(s.pixelRatioMax).toBeGreaterThan(1);
  });

  it('propose Econome au seul appareil tactile modeste, jamais Soignee', () => {
    expect(qualiteParDefaut({ tactile: false, coeurs: 2, memoireGo: 1 })).toBe('normale');
    expect(qualiteParDefaut({ tactile: true, coeurs: 8, memoireGo: 8 })).toBe('normale');
    expect(qualiteParDefaut({ tactile: true, coeurs: 4 })).toBe('econome');
    expect(qualiteParDefaut({ tactile: true, coeurs: 8, memoireGo: 2 })).toBe('econome');
    expect(qualiteParDefaut({ tactile: true })).toBe('normale');
  });

  it('reconnait les trois niveaux et rien d autre', () => {
    expect(QUALITES_3D.map((q) => q.id)).toEqual(['econome', 'normale', 'soignee']);
    expect(QUALITES_3D.every((q) => estQualite3d(q.id))).toBe(true);
    expect(estQualite3d('haute')).toBe(false);
    expect(estQualite3d(null)).toBe(false);
  });
});

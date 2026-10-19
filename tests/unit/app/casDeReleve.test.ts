import { describe, it, expect } from 'vitest';
import { casDepuisReleve, facadesRelevees } from '../../../src/app/casDeReleve.js';
import { lireCasStocke } from '../../../src/facade/corpusReel.js';
import type { ObjetBrut, ReleveFacade } from '../../../src/model/types.js';

// Un cas de calibration tire d'une facade relevee : une photo deja de face (la texture), ses coins aux angles du mur sous la bande
// au-dessus de l'egout, et les ouvertures validees au releve comme depart de la verite.

const releve = (r: Partial<ReleveFacade> = {}): ReleveFacade => ({
  cote: 0, largeur: 10, hauteur: 6, hauteurTexture: 7.5, texture: 'data:image/jpeg;base64,AAAA',
  ouvertures: [{ type: 'fenetre', x: 1.234, y: 1, l: 1.2, h: 1.4 } as ReleveFacade['ouvertures'][number]],
  distance: null, sourceDistance: null, releveLe: '2026-10-19T08:00:00Z', partieBasse: null, ...r,
});

describe('les cas tires d une facade relevee', () => {
  it('pose les coins aux angles du mur dans la texture, sous la bande de l egout, et reprend les ouvertures', () => {
    const cas = casDepuisReleve(releve(), 'Maison', { l: 1000, h: 750 }, 'Démo', 'Sud');
    expect(cas).not.toBeNull();
    expect(cas?.photos[0]?.coins).toEqual([{ x: 0, y: 150 }, { x: 1000, y: 150 }, { x: 1000, y: 750 }, { x: 0, y: 750 }]);
    expect(cas?.ouvertures).toEqual([{ type: 'fenetre', x: 1.23, y: 1, l: 1.2, h: 1.4 }]);
    expect(cas?.nom).toBe('Maison · façade sud (Démo)');
    // Le cas se relit comme tout cas de calibration.
    expect(() => lireCasStocke(cas)).not.toThrow();
  });

  it('ne fait rien d un releve sans photo', () => {
    expect(casDepuisReleve(releve({ texture: null }), 'Maison', { l: 1000, h: 750 })).toBeNull();
  });

  it('parcourt les batiments d un projet, sans s arreter a une image illisible', async () => {
    const objets = [
      { key: 'a', name: 'Maison', type: 'polygon', pts: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 8 }, { x: 0, y: 8 }], facades: [releve(), releve({ cote: 1, texture: 'data:image/jpeg;base64,BBBB' })] },
      { key: 'b', name: 'Abri', type: 'polygon', pts: [] },
    ] as unknown as ObjetBrut[];
    const dims = async (u: string) => { if (u.endsWith('BBBB')) throw new Error('illisible'); return { l: 1000, h: 750 }; };
    const f = await facadesRelevees(objets, dims, 'Démo');
    expect(f).toHaveLength(1);
    expect(f[0]?.libelle).toMatch(/^Maison · façade sud · 10 × 6 m · 1 ouverture relevée$/);
  });
});

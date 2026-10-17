import { describe, it, expect } from 'vitest';
import { avecFormesDuCatalogue, corpsCalcules, FORMES_SANS_DEMANDE } from '../../../../../src/facade/regles/toits/catalogue.js';
import { reconstruireCorps } from '../../../../../src/facade/toitCorps.js';
import { formeDesCorps } from '../../../../../src/model/formeToit.js';
import { corpsLus } from '../../../../../src/app/toitsLidar.js';
import { brise, corps, rect, surface } from '../../../../fixtures/surfacesToits.js';
import type { CorpsToit, ObjetPlan } from '../../../../../src/model/types.js';

// Les formes du catalogue a la lecture du LiDAR (facade/regles/toits/catalogue.ts) : un toit que la mesure porte nettement mieux
// en forme du catalogue la prend des la lecture, sans audit ; le coyau, que le lissage de la surface imite, attend qu'on le demande ;
// une couronne d'arbre au-dessus d'un petit toit n'est pas une tourelle.

const lu = (c: CorpsToit, L: number, W: number, hauteur: number | null = null) => {
  const m = surface(c, L, W), contour = rect(L, W);
  return { calcules: corpsCalcules(m, contour, { hauteurBdTopo: hauteur }), simples: reconstruireCorps(m, contour) };
};

describe('les formes du catalogue a la lecture', () => {
  it('une demi-croupe, un gambrel, un berceau, une tourelle conique : la lecture les pose sans demande', () => {
    const cas: [string, number, number, Partial<CorpsToit>][] = [
      ['demi-croupes', 12, 8, { faitage: 7, bouts: [{ type: 'demi-croupe', profondeurM: 1.8, hauteurPignonM: 2.4 }, { type: 'pignon' }] }],
      ['gambrel', 12, 8, { faitage: 7, profil: [brise, brise], bouts: [{ type: 'pignon' }, { type: 'pignon' }] }],
      ['berceau', 12, 8, { faitage: 6, profil: [{ type: 'courbe', flecheM: 0.9 }, { type: 'courbe', flecheM: 0.9 }] }],
      ['conique', 8, 8, { faitage: 9, speciale: { type: 'conique' } }],
    ];
    for (const [forme, L, W, plus] of cas) {
      const { calcules, simples } = lu(corps(L, W, plus), L, W, 5);
      expect(formeDesCorps(simples), forme + ' : les formes simples ne la lisent pas').not.toBe(forme);
      expect(formeDesCorps(calcules), forme).toBe(forme);
    }
  });

  it('un deux-pans, un quatre-pans, un toit plat restent tels que les formes simples les lisent', () => {
    for (const plus of [{ faitage: 7 }, { faitage: 7, croupes: [3, 3] as [number, number] }, { faitage: 3 }]) {
      const { calcules, simples } = lu(corps(12, 8, plus), 12, 8);
      expect(calcules, JSON.stringify(plus)).toEqual(simples);
    }
  });

  it('le coyau ne se pose pas sans demande : le lissage de la surface imite le bas adouci d un pan', () => {
    expect(FORMES_SANS_DEMANDE.has('coyau')).toBe(false);
    const { calcules, simples } = lu(corps(12, 8, { faitage: 7, profil: [{ type: 'coyau', largeurM: 1.6, penteDeg: 12 }, { type: 'coyau', largeurM: 1.6, penteDeg: 12 }] }), 12, 8);
    expect(calcules).toEqual(simples);
  });

  it('un cone dont l egout passe la hauteur BD TOPO de plus d un metre est un arbre : pas de tourelle', () => {
    const cone = corps(8, 8, { faitage: 9, egouts: [7, 7], speciale: { type: 'conique' } });
    expect(formeDesCorps(lu(cone, 8, 8, 5.6).calcules)).not.toBe('conique');
    expect(formeDesCorps(lu(cone, 8, 8, 6.5).calcules)).toBe('conique');
    // Sans hauteur BD TOPO, rien a opposer.
    expect(formeDesCorps(lu(cone, 8, 8, null).calcules)).toBe('conique');
  });

  it('sans corps lus, rien a changer', () => {
    const m = surface(corps(12, 8, {}), 12, 8);
    expect(avecFormesDuCatalogue(null, m, rect(12, 8))).toBe(null);
    expect(avecFormesDuCatalogue([], m, rect(12, 8))).toEqual([]);
  });

  it('l application pose la forme du catalogue a l import (corpsLus), avant le fait et les garde-fous', () => {
    const L = 12, W = 8;
    const m = surface(corps(L, W, { faitage: 7, bouts: [{ type: 'demi-croupe', profondeurM: 1.8, hauteurPignonM: 2.4 }, { type: 'pignon' }] }), L, W);
    const o = { key: 'b', type: 'polygon', fonction: 'batiment', pts: rect(L, W), bdtopo: { hauteurM: 5 } } as unknown as ObjetPlan;
    expect(formeDesCorps(corpsLus(o as never, m, rect(L, W), null))).toBe('demi-croupes');
  });
});

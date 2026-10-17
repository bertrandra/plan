import { describe, it, expect } from 'vitest';
import { lireFormes, lireForme } from '../../../src/facade/lectureFormes.js';
import { reconstruireCorps } from '../../../src/facade/toitCorps.js';
import { brise, corps, rect, surface } from '../../fixtures/surfacesToits.js';
import { pointInPolygon } from '../../../src/geometry/basic.js';
import { NOMS_SEUILS_FORMES, SEUILS_FORMES, lireFormesToits } from '../../../src/regles/toits/formes.js';
import type { CorpsToit } from '../../../src/model/types.js';

// La lecture des formes du catalogue, de bout en bout sur des surfaces synthetiques : on dessine un toit avec le code de la 3D
// (hauteurCorpsEn), on en tire une grille LiDAR de 50 cm, le moteur des corps la lit, et la lecture des formes doit retrouver la forme.

function lire(c: CorpsToit, L: number, W: number, options = {}) {
  const m = surface(c, L, W), contour = rect(L, W);
  const base = reconstruireCorps(m, contour) ?? [];
  return { base, lectures: lireFormes(m, base, contour, options), m, contour };
}

const FORMES: [string, number, number, Partial<CorpsToit>][] = [
  ['gambrel', 12, 8, { faitage: 7, profil: [brise, brise], bouts: [{ type: 'pignon' }, { type: 'pignon' }] }],
  ['mansart', 12, 8, { faitage: 7, profil: [brise, brise], bouts: [{ type: 'brisis', largeurM: 1.4 }, { type: 'brisis', largeurM: 1.4 }] }],
  ['coyau', 12, 8, { faitage: 7, profil: [{ type: 'coyau', largeurM: 1.6, penteDeg: 12 }, { type: 'coyau', largeurM: 1.6, penteDeg: 12 }] }],
  ['berceau', 12, 8, { faitage: 6, profil: [{ type: 'courbe', flecheM: 0.9 }, { type: 'courbe', flecheM: 0.9 }] }],
  ['papillon', 12, 8, { faitage: 3, egouts: [5.5, 5.5] }],
  ['demi-croupes', 12, 8, { faitage: 7, bouts: [{ type: 'demi-croupe', profondeurM: 1.8, hauteurPignonM: 2.4 }, { type: 'pignon' }] }],
  ['carene', 12, 8, { faitage: 6.8, egouts: [3, 3], profil: [{ type: 'courbe', flecheM: 1.3 }, { type: 'courbe', flecheM: 1.3 }], bouts: [{ type: 'croupe', profondeurM: 2.5 }, { type: 'croupe', profondeurM: 2.5 }] }],
  ['polygonal', 8, 8, { faitage: 8, speciale: { type: 'polygonal', cotes: 6 } }],
  ['polygonal', 8, 8, { faitage: 8, speciale: { type: 'polygonal', cotes: 8 } }],
  ['conique', 8, 8, { faitage: 9, speciale: { type: 'conique' } }],
  ['dome', 8, 8, { faitage: 7, speciale: { type: 'dome' } }],
  ['imperiale', 8, 8, { faitage: 10, speciale: { type: 'imperiale' } }],
  ['fleche', 5, 5, { faitage: 12, speciale: { type: 'fleche', cotes: 4 } }],
];

describe('la lecture des formes du catalogue sur une surface mesuree', () => {
  for (const [forme, L, W, plus] of FORMES) {
    it('retrouve ' + forme + ', et mieux que le corps lu par les formes simples', () => {
      const { base, lectures } = lire(corps(L, W, plus), L, W);
      expect(lectures.length, 'une lecture au moins').toBeGreaterThan(0);
      expect(lectures[0]?.forme).toBe(forme);
      expect(lectures[0]?.ecart).toBeLessThan(0.3);
      // Le candidat remplace le principal et ses accoles : un papillon lu comme deux appentis n'en fait plus qu'un.
      expect(lectures[0]?.corps.length).toBe(forme === 'papillon' ? 1 : base.length);
    });
  }

  it('lit le nombre de faces d une pyramide, et une carene par les croupes de son pan bombe', () => {
    for (const cotes of [5, 6, 8]) {
      const { lectures } = lire(corps(8, 8, { faitage: 8, speciale: { type: 'polygonal', cotes } }), 8, 8);
      expect(lectures[0]?.corps.at(-1)?.speciale, 'cotes ' + cotes).toEqual({ type: 'polygonal', cotes });
    }
    const { lectures } = lire(corps(12, 8, { faitage: 6.8, egouts: [3, 3], profil: [{ type: 'courbe', flecheM: 1.3 }, { type: 'courbe', flecheM: 1.3 }], bouts: [{ type: 'croupe', profondeurM: 2.5 }, { type: 'croupe', profondeurM: 2.5 }] }), 12, 8);
    const c = lectures[0]?.corps.at(-1);
    expect(c?.bouts?.map((b) => b.type)).toEqual(['croupe', 'croupe']);
  });

  it('chaque regle citee par une lecture est un seuil de regles/toits/formes.json', () => {
    for (const [, L, W, plus] of FORMES) {
      for (const l of lire(corps(L, W, plus), L, W).lectures) expect(NOMS_SEUILS_FORMES as readonly string[], l.forme).toContain(l.regle);
    }
  });

  it('ne voit rien de plus dans un deux-pans, un quatre-pans ni un toit plat', () => {
    for (const plus of [{ faitage: 7 }, { faitage: 7, croupes: [3, 3] as [number, number] }, { faitage: 3 }]) {
      const { lectures } = lire(corps(12, 8, plus), 12, 8);
      expect(lectures, JSON.stringify(plus)).toEqual([]);
    }
  });

  it('ne lit rien sans mesure ou sans corps', () => {
    const m = surface(corps(12, 8, {}), 12, 8);
    expect(lireFormes(m, [], rect(12, 8))).toEqual([]);
  });

  it('une forme demandee et pas vue se lit au mieux (souple), pourvu que la mesure la porte sous le seuil des formes demandees', () => {
    const c = corps(12, 8, { faitage: 7, profil: [brise, { type: 'droit' }] });
    const { m, contour, base } = lire(c, 12, 8);
    const souple = lireFormes(m, base, contour, { souple: true });
    for (const l of souple) expect(l.ecart).toBeLessThanOrEqual(SEUILS_FORMES.ECART_FORME_DEMANDEE_M);
    expect(lireForme(m, base, contour, 'gambrel', { souple: true })).not.toBeNull();
    expect(lireForme(m, base, contour, 'dome', { souple: true })).toBeNull();
  });

  it('les seuils viennent de regles/toits/formes.json, et un fichier abimé est refusé', () => {
    expect(SEUILS_FORMES.GAIN_PROFIL).toBe(0.6);
    expect(() => lireFormesToits({ format: 'autre' })).toThrow(/format inconnu/);
    const f = JSON.parse(JSON.stringify({ format: 'plan-formes-toits', seuils: Object.fromEntries(Object.keys(SEUILS_FORMES).map((n) => [n, { valeur: 1, unite: 'm', pourquoi: 'x' }])) }));
    f.seuils.PART_BRIS_MIN.valeur = 2;
    expect(() => lireFormesToits(f)).toThrow(/PART_BRIS_MIN doit etre sous PART_BRIS_MAX/);
    delete f.seuils.GAIN_PROFIL;
    expect(() => lireFormesToits(f)).toThrow(/GAIN_PROFIL/);
  });

  it('un point du contour hors du toit n entre pas dans la lecture', () => {
    expect(pointInPolygon({ x: 1, y: 1 }, rect(12, 8))).toBe(true);
  });
});

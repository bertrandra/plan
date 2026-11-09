import { describe, it, expect } from 'vitest';
import { corpsColles, pousserLeMur } from '../../../../src/facade/modeToit/pousserMur.js';
import { glisser, poigneesDe } from '../../../../src/facade/modeToit/poignees.js';
import { corpsDeSaillie, murDuCorps } from '../../../../src/facade/modeToit/saillies.js';
import { point, repere } from '../../../../src/facade/toits/toitCorps.js';
import type { CorpsToit, PtBrut } from '../../../../src/model/types.js';

// Un corps de 10 x 6 m (le faitage le long de x, au milieu), avec ce qui se pose dessus : un pignon et une lucarne sur le pan 0, une fenetre
// de toit sur le pan 1, une cheminee, une travee reculee sur chacun des murs 0 et 1, et un bow-window sur le mur 0.
const corpsDeBase = (): CorpsToit[] => {
  const c: CorpsToit = {
    pts: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 6 }, { x: 0, y: 6 }], posFaitage: 3, faitage: 8, egouts: [5, 5], ecart: 0,
    pignons: [{ pan: 0, debut: 2, fin: 5, faitage: 7.5, profondeur: 3 }],
    lucarnes: [{ type: 'jacobine', pan: 0, debutM: 6, finM: 7.2, faitageM: 7, profondeurM: 1.2, source: 'observation' }],
    elementsToit: [{ type: 'fenetre-toit', pan: 1, sM: 4, dM: 1.5 }],
    cheminees: [{ x: 8, y: 4, largeurM: 0.6, profondeurM: 0.6, sommetM: 9 }],
    travees: [{ mur: 0, de: 1, a: 3, nature: 'mur', reculM: 0.5 }, { mur: 1, de: 1, a: 2.5, nature: 'mur', reculM: 0.25 }]
  } as CorpsToit;
  const bow = corpsDeSaillie(c, { genre: 'bow-window', hote: 0, mur: 0, centreM: 7.5, largeurM: 2, profondeurM: 0.8, forme: 'rectangle', niveau: 'rdc', toit: 'pan' });
  return [c, bow];
};

const proche = (a: PtBrut, b: PtBrut) => { expect(a.x).toBeCloseTo(b.x, 2); expect(a.y).toBeCloseTo(b.y, 2); };
/** Le point d'un mur a `s` metres de son debut. */
const surMur = (c: CorpsToit, mur: number, s: number): PtBrut => { const w = murDuCorps(c, mur); return { x: w.a.x + w.u.x * s, y: w.a.y + w.u.y * s }; };

describe('pousser un mur d un corps, le mur oppose en place', () => {
  for (const mur of [0, 1, 2, 3]) {
    for (const delta of [1.5, -1]) {
      it(`mur ${mur}, ${delta > 0 ? 'avance' : 'recule'} de ${Math.abs(delta)} m`, () => {
        const avant = corpsDeBase(), c = avant[0]!, w = murDuCorps(c, mur);
        const apres = pousserLeMur(avant, 0, mur, delta).corps, k = apres[0]!;
        // Le mur oppose ne bouge pas ; le mur tire glisse sur sa normale.
        for (const i of [(mur + 2) % 4, (mur + 3) % 4]) expect(k.pts[i]).toEqual(c.pts[i]);
        for (const i of [mur, (mur + 1) % 4]) proche(k.pts[i]!, { x: c.pts[i]!.x + w.n.x * delta, y: c.pts[i]!.y + w.n.y * delta });
        const r = repere(c.pts), r2 = repere(k.pts);
        if (mur % 2 === 0) { expect(r2.W).toBeCloseTo(r.W + delta, 5); expect(r2.L).toBeCloseTo(r.L, 5); expect(k.posFaitage).toBeCloseTo(r2.W / 2, 5); }
        else { expect(r2.L).toBeCloseTo(r.L + delta, 5); expect(r2.W).toBeCloseTo(r.W, 5); expect(k.posFaitage).toBe(c.posFaitage); }
        // Le pignon, la lucarne, la fenetre de toit gardent leur place le long du faitage, dans le plan.
        const g = c.pignons[0]!, g2 = k.pignons[0]!;
        if (mur % 2 === 1) {
          proche(point(r2, g2.debut, 0), point(r, g.debut, 0));
          proche(point(r2, k.lucarnes![0]!.debutM, 0), point(r, c.lucarnes![0]!.debutM, 0));
          proche(point(r2, k.elementsToit![0]!.sM, 0), point(r, c.elementsToit![0]!.sM, 0));
        } else {
          // En travers : le pignon va encore au faitage, qui reste au milieu.
          expect(g2.profondeur).toBeCloseTo(k.posFaitage, 5);
          expect(g2.debut).toBe(g.debut);
        }
        // La cheminee ne bouge pas.
        expect(k.cheminees).toEqual(c.cheminees);
        // Chaque travee garde sa place dans le plan : sur le mur tire, elle le suit ; sur un autre mur, elle reste.
        c.travees!.forEach((t, i) => {
          const t2 = k.travees![i]!, suit = t.mur === mur ? { x: w.n.x * delta, y: w.n.y * delta } : { x: 0, y: 0 };
          const a = surMur(c, t.mur, t.de), b = surMur(k, t2.mur, t2.de);
          proche(b, { x: a.x + suit.x, y: a.y + suit.y });
          expect(t2.a - t2.de).toBeCloseTo(t.a - t.de, 5);
          expect(t2.reculM).toBe(t.reculM);
        });
        // Le bow-window : sur le mur tire, il avance avec lui ; sinon, il reste ou il est.
        const b0 = avant[1]!, b1 = apres[1]!, suit = b0.saillie!.mur === mur ? { x: w.n.x * delta, y: w.n.y * delta } : { x: 0, y: 0 };
        b0.pts.forEach((p, i) => proche(b1.pts[i]!, { x: p.x + suit.x, y: p.y + suit.y }));
      });
    }
  }

  it('l aller-retour rend le corps tel quel', () => {
    const avant = corpsDeBase();
    for (const mur of [0, 1, 2, 3]) {
      const aller = pousserLeMur(avant, 0, mur, 1.25).corps;
      expect(JSON.stringify(pousserLeMur(aller, 0, mur, -1.25).corps)).toBe(JSON.stringify(avant));
    }
  });

  it('borne a 2,5 m, sans ramener a 2,5 m un corps deja plus petit ; 5 cm ronds', () => {
    const avant = corpsDeBase();
    expect(repere(pousserLeMur(avant, 0, 3, -50).corps[0]!.pts).L).toBeCloseTo(2.5, 5);
    expect(repere(pousserLeMur(avant, 0, 0, -50).corps[0]!.pts).W).toBeCloseTo(2.5, 5);
    expect(repere(pousserLeMur(avant, 0, 1, 0.33).corps[0]!.pts).L).toBeCloseTo(10.35, 5);
    const petit: CorpsToit[] = [{ pts: [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 1.8 }, { x: 0, y: 1.8 }], posFaitage: 0, faitage: 3, egouts: [2.4, 2.4], pignons: [], ecart: 0 }];
    // Un appentis de 1,8 m : il retrecit encore d'un cran, ne saute pas a 2,5 m, et son faitage reste sur son mur haut.
    const p = pousserLeMur(petit, 0, 2, 0.1).corps[0]!;
    expect(repere(p.pts).W).toBeCloseTo(1.9, 5);
    expect(p.posFaitage).toBe(0);
    expect(repere(pousserLeMur(petit, 0, 2, -9).corps[0]!.pts).W).toBeCloseTo(1.8, 5);
  });

  it('ce qui ne tient plus est borne au corps, et une travee trop courte part', () => {
    const avant = corpsDeBase();
    // Le bout s = 0 recule de 4 m : le pignon (2 a 5 m) est rogne a 1 m, la travee du mur 0 (1 a 3 m) n'a plus de place.
    const k = pousserLeMur(avant, 0, 3, -4).corps[0]!;
    expect(k.pignons).toEqual([]);
    expect(k.travees!.some((t) => t.mur === 0)).toBe(false);
    expect(k.lucarnes![0]!.debutM).toBeGreaterThanOrEqual(0.1);
  });

  it('un corps colle contre le mur tire le suit, un corps a l ecart reste', () => {
    const [c] = corpsDeBase();
    const aile: CorpsToit = { pts: [{ x: 10, y: 1 }, { x: 13, y: 1 }, { x: 13, y: 5 }, { x: 10, y: 5 }], posFaitage: 2, faitage: 6, egouts: [4, 4], pignons: [], ecart: 0 };
    const loin: CorpsToit = { pts: [{ x: 20, y: 0 }, { x: 24, y: 0 }, { x: 24, y: 4 }, { x: 20, y: 4 }], posFaitage: 2, faitage: 6, egouts: [4, 4], pignons: [], ecart: 0 };
    const corps = [c!, aile, loin];
    expect(corpsColles(corps, 0, 1)).toEqual([1]);
    expect(corpsColles(corps, 0, 3)).toEqual([]);
    const k = pousserLeMur(corps, 0, 1, 2).corps;
    expect(k[1]!.pts).toEqual(aile.pts.map((p) => ({ x: p.x + 2, y: p.y })));
    expect(k[2]).toEqual(loin);
  });

  it('le mur se colle a la ligne d un mur parallele d un autre corps, a moins de 25 cm', () => {
    const [c] = corpsDeBase();
    const voisin: CorpsToit = { pts: [{ x: 14, y: 10 }, { x: 18, y: 10 }, { x: 18, y: 14 }, { x: 14, y: 14 }], posFaitage: 2, faitage: 6, egouts: [4, 4], pignons: [], ecart: 0 };
    const r = pousserLeMur([c!, voisin], 0, 1, 3.85);
    expect(r.colle).toBe(true);
    expect(r.corps[0]!.pts[1]!.x).toBeCloseTo(14, 5);
    const libre = pousserLeMur([c!, voisin], 0, 1, 3.5);
    expect(libre.colle).toBe(false);
    expect(libre.corps[0]!.pts[1]!.x).toBeCloseTo(13.5, 5);
  });

  it('un element de facade pose ne se tire pas ainsi', () => {
    const avant = corpsDeBase();
    expect(pousserLeMur(avant, 1, 0, 1).corps).toEqual(avant);
  });
});

describe('les poignees qui tirent un cote', () => {
  it('de face, chaque bout de la facade se tire, l autre reste ; la facade avance devant son mur oppose', () => {
    const avant = corpsDeBase(), c = avant[0]!;
    const ids = poigneesDe(avant, { type: 'facade', rang: 0, i: 0, mur: 0 }).map((p) => p.libelle);
    expect(ids.some((l) => /^Bout gauche/.test(l)) && ids.some((l) => /^Bout droit/.test(l))).toBe(true);
    const t = { type: 'facade', rang: 0, i: 0, mur: 0 } as const;
    const debut = glisser(avant, t, 'debut', { long: -1 }).corps[0]!;
    expect(debut.pts[1]).toEqual(c.pts[1]);
    expect(debut.pts[2]).toEqual(c.pts[2]);
    expect(debut.pts[0]!.x).toBeCloseTo(-1, 5);
    const fin = glisser(avant, t, 'long', { long: 1 }).corps[0]!;
    expect(fin.pts[0]).toEqual(c.pts[0]);
    expect(fin.pts[1]!.x).toBeCloseTo(11, 5);
    const av = glisser(avant, t, 'avancer', { prof: 0.5 }).corps[0]!;
    expect(av.pts[2]).toEqual(c.pts[2]);
    expect(av.pts[0]!.y).toBeCloseTo(-0.5, 5);
  });

  it('de dessus, une poignee au milieu de chaque mur, nommee par son orientation', () => {
    const avant = corpsDeBase(), c = avant[0]!;
    const p = poigneesDe(avant, { type: 'corps', rang: 0, i: 0 });
    expect(p.find((q) => q.id === 'mur0')!.libelle).toBe('Côté sud (le côté nord reste en place)');
    const t = { type: 'corps', rang: 0, i: 0 } as const;
    // Le mur 0 (sud) : la normale du repere sort par lui.
    expect(glisser(avant, t, 'mur0', { prof: 1 }).corps[0]!.pts[3]).toEqual(c.pts[3]);
    expect(glisser(avant, t, 'mur2', { prof: -1 }).corps[0]!.pts[2]!.y).toBeCloseTo(7, 5);
    expect(glisser(avant, t, 'mur1', { long: 1 }).corps[0]!.pts[1]!.x).toBeCloseTo(11, 5);
    expect(glisser(avant, t, 'mur3', { long: 1 }).corps[0]!.pts[0]!.x).toBeCloseTo(1, 5);
  });
});

import { describe, it, expect } from 'vitest';
import { aimanterAuContour, appentisLies, arretDuMur, collesEtButees, corpsColles, murCommun, pousserLeMur, MOTIF_AUTRE_CORPS, MOTIF_CORPS_VOISIN, MOTIF_PIGNON, MOTIF_TRAVEE } from '../../../../src/facade/modeToit/pousserMur.js';
import { retourDAngle } from '../../../../src/facade/modeToit/decroche.js';
import { boutsLies } from '../../../../src/three/toitCorps3d.js';
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
    // Rien de pose dessus : seule la taille du corps borne le geste (un pignon ou une travee l'arretent avant, plus bas).
    const avant: CorpsToit[] = [{ ...corpsDeBase()[0]!, pignons: [], travees: [], lucarnes: [], elementsToit: [] }];
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

  it('le mur s arrete au bord d un pignon ou d une travee, et dit pourquoi (decision du 9 novembre 2026)', () => {
    const avant = corpsDeBase(), c = avant[0]!;
    // Le bout s = 0 recule de 4 m : la travee du mur 0 (1 a 3 m) l'arrete a 1 m, avant le pignon (2 a 5 m) ; rien ne disparait.
    const r = pousserLeMur(avant, 0, 3, -4), k = r.corps[0]!;
    expect(repere(k.pts).L).toBeCloseTo(9, 5);
    expect(r.motif).toBe(MOTIF_TRAVEE);
    expect(k.pignons).toEqual([{ ...c.pignons[0]!, debut: 1, fin: 4 }]);
    expect(k.travees!.filter((t) => t.mur === 0)).toEqual([{ ...c.travees![0]!, de: 0, a: 2 }]);
    // Sans la travee, c'est le pignon qui l'arrete, a son bord (2 m).
    const sansTravee: CorpsToit[] = [{ ...c, travees: [] }];
    const p = pousserLeMur(sansTravee, 0, 3, -4);
    expect(repere(p.corps[0]!.pts).L).toBeCloseTo(8, 5);
    expect(p.motif).toBe(MOTIF_PIGNON);
    expect(p.corps[0]!.pignons[0]).toMatchObject({ debut: 0, fin: 3 });
    // Un pignon deja contre le bout le suit, raccourci jusqu'a 1,4 m, puis le mur s'arrete.
    const contre: CorpsToit[] = [{ ...c, travees: [], pignons: [{ ...c.pignons[0]!, debut: 0, fin: 3 }] }];
    const q = pousserLeMur(contre, 0, 3, -4);
    expect(q.corps[0]!.pignons[0]).toMatchObject({ debut: 0, fin: 1.4 });
    expect(q.motif).toBe(MOTIF_PIGNON);
    // Une travee d'angle (contre le mur tire) raccourcit jusqu'a 30 cm.
    const angle: CorpsToit[] = [{ ...c, pignons: [], travees: [{ mur: 0, de: 0, a: 2, nature: 'mur', reculM: 0.5 }] }];
    const t = pousserLeMur(angle, 0, 3, -4);
    expect(t.corps[0]!.travees![0]).toMatchObject({ de: 0, a: 0.3 });
    expect(arretDuMur(angle[0]!, 3)).toEqual({ d: -1.7, motif: MOTIF_TRAVEE });
    // Un recul qui n'atteint rien ne dit rien ; avancer n'est jamais arrete.
    expect(pousserLeMur(avant, 0, 3, -0.5).motif).toBeUndefined();
    expect(pousserLeMur(avant, 0, 3, 3).motif).toBeUndefined();
    // La lucarne reste bornee au corps, comme avant.
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

describe('un mur commun glisse entre deux corps (decision du 9 novembre 2026)', () => {
  // Un corps coupe en deux a x = 6 : deux moities de 6 m de profondeur, le meme toit.
  const coupe = (): CorpsToit[] => [
    { pts: [{ x: 0, y: 0 }, { x: 6, y: 0 }, { x: 6, y: 6 }, { x: 0, y: 6 }], posFaitage: 3, faitage: 8, egouts: [5, 5], pignons: [], ecart: 0 },
    { pts: [{ x: 6, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 6 }, { x: 6, y: 6 }], posFaitage: 3, faitage: 8, egouts: [5, 5], pignons: [], ecart: 0 }
  ];
  const xs = (c: CorpsToit) => c.pts.map((p) => p.x);

  it('l un grandit, l autre retrecit d autant : l emprise ne change pas', () => {
    expect(murCommun(coupe(), 0, 1)).toEqual({ rang: 1, mur: 3 });
    for (const delta of [1, -1.5]) {
      const [a, b] = pousserLeMur(coupe(), 0, 1, delta).corps;
      expect(Math.max(...xs(a!))).toBeCloseTo(6 + delta, 5);
      expect(Math.min(...xs(b!))).toBeCloseTo(6 + delta, 5);
      expect(Math.min(...xs(a!))).toBe(0);
      expect(Math.max(...xs(b!))).toBe(10);
    }
    // Depuis l'autre corps, le meme mur glisse de la meme facon.
    const [a2, b2] = pousserLeMur(coupe(), 1, 3, 1).corps;
    expect(Math.max(...xs(a2!))).toBeCloseTo(5, 5);
    expect(Math.min(...xs(b2!))).toBeCloseTo(5, 5);
  });

  it('l autre corps ne descend pas sous 2,5 m, et le dit ; ce qui est pose sur lui l arrete aussi', () => {
    const r = pousserLeMur(coupe(), 0, 1, 5);
    expect(Math.min(...xs(r.corps[1]!))).toBeCloseTo(7.5, 5);
    expect(r.motif).toBe(MOTIF_AUTRE_CORPS);
    // Une travee de l'autre corps a 50 cm du mur commun : le mur s'arrete a son bord.
    const l = coupe();
    l[1] = { ...l[1]!, travees: [{ mur: 0, de: 0.5, a: 2, nature: 'mur', reculM: 0.4 }] };
    const t = pousserLeMur(l, 0, 1, 2);
    expect(Math.max(...xs(t.corps[0]!))).toBeCloseTo(6.5, 5);
    expect(t.motif).toBe(MOTIF_TRAVEE);
  });

  it('une aile plus courte posee au bout, ou un auvent adosse par son mur haut, est poussee comme avant', () => {
    const aile: CorpsToit = { pts: [{ x: 10, y: 1 }, { x: 13, y: 1 }, { x: 13, y: 4 }, { x: 10, y: 4 }], posFaitage: 1.5, faitage: 6, egouts: [4, 4], pignons: [], ecart: 0 };
    const l = [...coupe(), aile];
    expect(murCommun(l, 1, 1)).toBeNull();
    expect(pousserLeMur(l, 1, 1, 1).corps[2]!.pts[0]).toEqual({ x: 11, y: 1 });
    // L'auvent le long de toute la facade sud (mur haut contre elle) : il suit la facade, sa profondeur gardee.
    const auvent: CorpsToit = { pts: [{ x: 0, y: 0 }, { x: 6, y: 0 }, { x: 6, y: -2 }, { x: 0, y: -2 }], posFaitage: 0, faitage: 3.2, egouts: [3.2, 2.4], pignons: [], ecart: 0 };
    const m = [coupe()[0]!, auvent];
    expect(murCommun(m, 0, 0)).toBeNull();
    const k = pousserLeMur(m, 0, 0, 1).corps[1]!;
    expect(k.pts.map((p) => p.y)).toEqual([-1, -1, -3, -3]);
  });
});

describe('deux appentis lies a l angle gardent la meme largeur (decision du 9 novembre 2026)', () => {
  const maison = (): CorpsToit => ({ pts: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 6 }, { x: 0, y: 6 }], posFaitage: 3, faitage: 7, egouts: [4, 4], pignons: [], ecart: 0 });
  // Un auvent de 3 m de profondeur : il peut retrecir sans passer sous 2,5 m.
  const auvent = (): CorpsToit => ({ pts: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: -3 }, { x: 0, y: -3 }], posFaitage: 0, faitage: 3.2, egouts: [3.2, 2.4], pignons: [], ecart: 0, ouvert: true });
  const lies = () => retourDAngle([maison(), auvent()], 1, 'droite')!;

  it('la rive basse de l un tiree, l autre suit : l aretier reste', () => {
    const l = lies();
    expect(appentisLies(l, 1).map((x) => x.rang)).toEqual([2]);
    for (const delta of [0.75, -0.5]) {
      const k = pousserLeMur(l, 1, 2, delta).corps;
      expect(repere(k[1]!.pts).W).toBeCloseTo(3 + delta, 5);
      expect(repere(k[2]!.pts).W).toBeCloseTo(3 + delta, 5);
      expect(boutsLies(k[1]!, k).filter(Boolean)).toHaveLength(1);
      expect(boutsLies(k[2]!, k).filter(Boolean)).toHaveLength(1);
      // Depuis le retour, la meme chose.
      const j = pousserLeMur(l, 2, 2, delta).corps;
      expect(repere(j[1]!.pts).W).toBeCloseTo(3 + delta, 5);
      expect(boutsLies(j[1]!, j).filter(Boolean)).toHaveLength(1);
    }
  });

  it('le mur haut de l un tire : le coin de l aretier le suit, les deux restent lies', () => {
    const l = lies();
    const k = pousserLeMur(l, 1, 0, -0.5).corps;
    expect(repere(k[1]!.pts).W).toBeCloseTo(2.5, 5);
    expect(repere(k[2]!.pts).W).toBeCloseTo(2.5, 5);
    expect(boutsLies(k[1]!, k).filter(Boolean)).toHaveLength(1);
    expect(boutsLies(k[2]!, k).filter(Boolean)).toHaveLength(1);
  });

  it('un bout tire (la longueur) ne touche pas l autre ; sans retour, rien ne change', () => {
    const l = lies();
    const k = pousserLeMur(l, 1, 3, 1).corps;
    expect(k[2]).toEqual(l[2]);
    expect(appentisLies([maison(), auvent()], 1)).toEqual([]);
  });
});

describe('le trace IGN aimante un mur tire et un corps deplace (decision du 9 novembre 2026)', () => {
  const seul = (): CorpsToit[] => [{ pts: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 6 }, { x: 0, y: 6 }], posFaitage: 3, faitage: 8, egouts: [5, 5], pignons: [], ecart: 0 }];
  const ign = [{ x: -0.2, y: -0.3 }, { x: 10.4, y: -0.3 }, { x: 10.4, y: 6.1 }, { x: -0.2, y: 6.1 }];

  it('a moins de 25 cm d un cote parallele du trace, le mur s y colle, et rend ce cote', () => {
    const r = pousserLeMur(seul(), 0, 3, 0.1, ign);
    expect(r.corps[0]!.pts[0]!.x).toBeCloseTo(-0.2, 5);
    expect(r.colle).toBe(true);
    expect(r.aretes).toEqual([{ a: ign[3], b: ign[0] }]);
    const loin = pousserLeMur(seul(), 0, 3, 0.5, ign);
    expect(loin.corps[0]!.pts[0]!.x).toBeCloseTo(-0.5, 5);
    expect(loin.aretes).toBeUndefined();
    // Sans trace, le geste d'avant.
    expect(pousserLeMur(seul(), 0, 3, 0.1).corps[0]!.pts[0]!.x).toBeCloseTo(-0.1, 5);
  });

  it('un corps deplace pres du trace s y colle sur ses deux axes : ses coins vont aux coins du trace', () => {
    const c = seul()[0]!;
    const a = aimanterAuContour(c, 0.25, -0.2, ign);
    expect(a.aretes).toHaveLength(2);
    // Son mur est sur x = 10,4 (a 15 cm ; l'ouest est a 45 cm du sien), son mur sud sur y = -0,3.
    expect(a.dy).toBeCloseTo(-0.3, 5);
    expect(a.dx).toBeCloseTo(0.4, 5);
    const k = glisser(seul(), { type: 'corps', rang: 0, i: 0 }, 'deplacer', { long: 0.25, prof: 0.2 }, ign);
    expect(k.aretes).toHaveLength(2);
    expect(k.corps[0]!.pts[1]).toEqual({ x: 10.4, y: -0.3 });
    // Loin du trace, les 5 cm ronds d'avant.
    expect(aimanterAuContour(c, 3, 3, ign).aretes).toEqual([]);
  });
});

describe('un element de facade se tire par chacun de ses bords (decision du 9 novembre 2026)', () => {
  it('le bord gauche d un bow-window se tire, le droit reste ; et l inverse ; nommes vus de dehors', () => {
    const avant = corpsDeBase(), s = avant[1]!.saillie!, cible = { type: 'saillie', rang: 1, i: 0 } as const;
    const g = s.centreM - s.largeurM / 2, d = s.centreM + s.largeurM / 2;
    const p = poigneesDe(avant, cible);
    expect(p.filter((q) => /^Bord (gauche|droit) \(le bord (droit|gauche) reste en place\)$/.test(q.libelle)).map((q) => q.id).sort()).toEqual(['gauche', 'larg']);
    const a = glisser(avant, cible, 'gauche', { long: -0.5 }).corps[1]!.saillie!;
    expect(a.centreM + a.largeurM / 2).toBeCloseTo(d, 5);
    expect(a.centreM - a.largeurM / 2).toBeCloseTo(g - 0.5, 5);
    const b = glisser(avant, cible, 'larg', { long: 0.6 }).corps[1]!.saillie!;
    expect(b.centreM - b.largeurM / 2).toBeCloseTo(g, 5);
    // Au-dela du bout du mur, le bord s'arrete au mur et l'autre ne bouge toujours pas.
    const c = glisser(avant, cible, 'larg', { long: 9 }).corps[1]!.saillie!;
    expect(c.centreM - c.largeurM / 2).toBeCloseTo(g, 5);
    expect(c.centreM + c.largeurM / 2).toBeLessThanOrEqual(10);
  });
});

describe('audit du Mode Toit (9 novembre 2026) : ce qu un mur tire emmene, et le trace IGN sous le mur', () => {
  const rect = (x0: number, y0: number, x1: number, y1: number): CorpsToit =>
    ({ pts: [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }], posFaitage: (y1 - y0) / 2, faitage: 8, egouts: [5, 5], pignons: [], ecart: 0 });

  it('raccourcir une aile par son joint ne deplace pas la maison : un corps plus long ne se laisse pas emmener', () => {
    // La maison 12 x 8 m, une aile de 5 x 4 m collee a son mur est ; le mur 3 de l'aile est le joint.
    const maison = rect(0, 0, 12, 8), aile = rect(12, 2, 17, 6), corps = [maison, aile];
    expect(corpsColles(corps, 1, 3)).toEqual([]);
    const r = pousserLeMur(corps, 1, 3, -1).corps;
    expect(r[0]).toEqual(maison);
    expect(Math.min(...r[1]!.pts.map((p) => p.x))).toBeCloseTo(13, 5);
    expect(Math.max(...r[1]!.pts.map((p) => p.x))).toBe(17);
    // Le mur de bout de la maison emmene toujours l'aile posee au bout (son joint plus court).
    expect(corpsColles(corps, 0, 1)).toEqual([1]);
  });

  it('tirer le mur haut d un appentis adosse ne tire pas la maison', () => {
    const maison = rect(0, 0, 12, 8);
    // Un appentis au sud, mur haut (mur 0, y = 0) contre la maison.
    const app: CorpsToit = { pts: [{ x: 10, y: 0 }, { x: 2, y: 0 }, { x: 2, y: -3 }, { x: 10, y: -3 }], posFaitage: 0, faitage: 4, egouts: [3, 3], pignons: [], ecart: 0 };
    const corps = [maison, app];
    expect(corpsColles(corps, 1, 0)).toEqual([]);
    const r = pousserLeMur(corps, 1, 0, -0.5).corps;
    expect(r[0]).toEqual(maison);
    expect(r[1]!.pts.map((p) => p.y)).toEqual([-0.5, -0.5, -3, -3]);
  });

  it('le corps principal n est jamais emmene, meme par un corps aussi long que lui', () => {
    const maison = rect(0, 0, 12, 8), annexe = rect(12, 0, 16, 8);
    // Deux murs de meme longueur : un mur commun, qui glisse ; hors mur commun (le corps principal), rien n'est emmene.
    expect(corpsColles([maison, annexe], 1, 3)).toEqual([]);
  });

  it('le cote du trace IGN sur lequel le mur est deja ne le retient pas : un pas de 5 a 25 cm compte', () => {
    const c = rect(0, 0, 12, 8), ign = [{ x: 0, y: 0 }, { x: 12, y: 0 }, { x: 12, y: 8 }, { x: 0, y: 8 }];
    for (const d of [0.05, 0.1, 0.2, 0.25, -0.2]) {
      const r = pousserLeMur([c], 0, 2, d, ign);
      expect(repere(r.corps[0]!.pts).W).toBeCloseTo(8 + d, 5);
      expect(r.colle).toBe(false);
    }
    // Un corps pose sur le trace se deplace aussi par petits pas.
    const a = aimanterAuContour(c, 0.1, 0, ign);
    expect(a.aretes).toEqual([]);
    expect(glisser([c], { type: 'corps', rang: 0, i: 0 }, 'deplacer', { long: 0.1, prof: 0 }, ign).corps[0]!.pts[0]!.x).toBeCloseTo(0.1, 5);
    // Le meme pour un autre corps aligne sur le mur : sa ligne, ou le mur est deja, ne le retient pas.
    const voisin = rect(20, 8, 24, 12);
    expect(repere(pousserLeMur([c, voisin], 0, 2, 0.1).corps[0]!.pts).W).toBeCloseTo(8.1, 5);
  });
});

describe('second audit du Mode Toit (9 novembre 2026) : un mur sur une ligne y reste, un corps voisin l arrete', () => {
  const rect = (x0: number, y0: number, x1: number, y1: number): CorpsToit =>
    ({ pts: [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }], posFaitage: (y1 - y0) / 2, faitage: 8, egouts: [5, 5], pignons: [], ecart: 0 });
  // Un corps lu sur l'IGN : ni sa place ni sa taille ne sont des multiples de 5 cm, et il est pose sur le trace.
  const lu = () => rect(0.03, 0, 10.03, 7.43);
  const trace = [{ x: 0.03, y: 0 }, { x: 10.03, y: 0 }, { x: 10.03, y: 7.43 }, { x: 0.03, y: 7.43 }];

  it('un toucher ne decolle pas un mur pose sur le trace ; un pas de 5 cm le deplace de 5 cm', () => {
    for (const d of [0, 0.01, -0.02]) {
      const r = pousserLeMur([lu()], 0, 2, d, trace);
      expect(r.corps[0]).toEqual(lu());
    }
    expect(repere(pousserLeMur([lu()], 0, 2, 0.04, trace).corps[0]!.pts).W).toBeCloseTo(7.48, 5);
    expect(repere(pousserLeMur([lu()], 0, 2, -0.05, trace).corps[0]!.pts).W).toBeCloseTo(7.38, 5);
    // Contre le mur d'un autre corps, de meme.
    const voisin = rect(12, 7.43, 16, 12);
    expect(pousserLeMur([lu(), voisin], 0, 2, 0.01).corps[0]).toEqual(lu());
  });

  it('un mur a 3 cm du trace s y colle, du cote ou il va ; une ligne derriere le geste ne le ramene pas', () => {
    const ign = [{ x: 0, y: 0 }, { x: 10.03, y: 0 }, { x: 10.03, y: 7.43 }, { x: 0, y: 7.43 }];
    for (const d of [0.03, 0.05, 0.2]) {
      const r = pousserLeMur([lu()], 0, 3, d, ign);
      expect(r.corps[0]!.pts[0]!.x).toBeCloseTo(0, 5);
      expect(r.colle).toBe(true);
    }
    // Le mur recule de 5 cm (vers l'interieur) : le cote du trace, derriere lui, ne le reprend pas.
    const r = pousserLeMur([lu()], 0, 3, -0.05, ign);
    expect(r.corps[0]!.pts[0]!.x).toBeCloseTo(0.08, 5);
    expect(r.colle).toBe(false);
  });

  it('un corps pose sur le trace qu on deplace le long de lui y reste : le deplacement s arrondit, pas sa place', () => {
    const cible = { type: 'corps' as const, rang: 0, i: 0 };
    // Un tremblement de 2 cm en travers ne le decolle pas, le long il avance de 1 m pile.
    const g = glisser([lu()], cible, 'deplacer', { long: 1, prof: 0.02 }, trace);
    expect(g.corps[0]!.pts.map((p) => p.y)).toEqual([0, 0, 7.43, 7.43]);
    expect(g.corps[0]!.pts[0]!.x).toBeCloseTo(1.03, 5);
    expect(glisser([lu()], cible, 'deplacer', { long: 0.02, prof: -0.01 }, trace).corps[0]).toEqual(lu());
    // Sans trace aussi : un corps de biais garde sa forme (ses coins ne s'arrondissent pas chacun).
    const a = Math.PI / 7, biais: CorpsToit = { ...lu(), pts: lu().pts.map((p) => ({ x: Math.round((p.x * Math.cos(a) - p.y * Math.sin(a)) * 100) / 100, y: Math.round((p.x * Math.sin(a) + p.y * Math.cos(a)) * 100) / 100 })) };
    const k = glisser([biais], cible, 'deplacer', { long: 0.5, prof: 0 }).corps[0]!;
    expect(repere(k.pts).L).toBeCloseTo(repere(biais.pts).L, 1);
    expect(repere(k.pts).W).toBeCloseTo(repere(biais.pts).W, 1);
    expect(Math.hypot(k.pts[0]!.x - biais.pts[0]!.x, k.pts[0]!.y - biais.pts[0]!.y)).toBeCloseTo(0.5, 1);
  });

  it('maison en T : le pignon pousse vers l aile en travers s arrete contre elle, et le dit ; il s en ecarte librement', () => {
    const maison = rect(0, 0, 10, 6);
    const aile: CorpsToit = { pts: [{ x: 14, y: -2 }, { x: 14, y: 8 }, { x: 10, y: 8 }, { x: 10, y: -2 }], posFaitage: 2, faitage: 8, egouts: [5, 5], pignons: [], ecart: 0 };
    const corps = [maison, aile];
    expect(collesEtButees(corps, 0, 1)).toEqual({ colles: [], butees: [1] });
    const r = pousserLeMur(corps, 0, 1, 1);
    expect(r.corps).toEqual(corps);
    expect(r.motif).toBe(MOTIF_CORPS_VOISIN);
    const recul = pousserLeMur(corps, 0, 1, -1);
    expect(Math.max(...recul.corps[0]!.pts.map((p) => p.x))).toBeCloseTo(9, 5);
    expect(recul.corps[1]).toEqual(aile);
    expect(recul.motif).toBeUndefined();
    // L'aile tiree par son joint vers la maison (le corps principal) s'arrete aussi ; tiree vers l'exterieur, elle laisse la maison en place.
    expect(pousserLeMur([rect(0, 0, 12, 8), rect(12, 2, 17, 6)], 1, 3, 1).motif).toBe(MOTIF_CORPS_VOISIN);
    // Le mur haut d'un appentis adosse, pousse dans la maison, s'arrete contre elle.
    const app: CorpsToit = { pts: [{ x: 10, y: 0 }, { x: 2, y: 0 }, { x: 2, y: -3 }, { x: 10, y: -3 }], posFaitage: 0, faitage: 4, egouts: [3, 3], pignons: [], ecart: 0 };
    const ad = pousserLeMur([rect(0, 0, 12, 8), app], 1, 0, 0.5);
    expect(ad.corps[1]).toEqual(app);
    expect(ad.motif).toBe(MOTIF_CORPS_VOISIN);
  });
});

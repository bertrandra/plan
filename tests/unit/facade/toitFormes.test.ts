import { describe, it, expect } from 'vitest';
import { facettesEtendues, facettesLucarnes, formeEtendue, hauteurEtendue, type Sommet } from '../../../src/facade/toitFormes.js';
import { hauteurCorpsEn } from '../../../src/facade/toitCorps.js';
import type { CorpsToit, Lucarne } from '../../../src/model/types.js';

// Les formes que le dessin apprend apres les croupes : le profil brise (gambrel, Mansart), la demi-croupe, le
// brisis aux bouts, et les lucarnes (MD/spec-regles-toits.md §3, §4). Un corps de 12 m sur 8 m, faitage au milieu.

const L = 12, W = 8;
type Corps = Pick<CorpsToit, 'posFaitage' | 'faitage' | 'egouts' | 'croupes'> & Partial<Pick<CorpsToit, 'profil' | 'bouts' | 'lucarnes'>>;
const base = (plus: Partial<Corps> = {}): Corps => ({ posFaitage: 4, faitage: 6.4, egouts: [3, 3], croupes: [0, 0], ...plus });
const BRIS = { type: 'brise' as const, largeurBrisisM: 1, hauteurBrisM: 5 };
const SANS = { egout0: 0, egout1: 0, rive0: 0, rive1: 0 };

/** L'aire d'un polygone du plan (s, t). */
const aire = (f: readonly Sommet[]): number => Math.abs(f.reduce((a, p, i) => { const q = f[(i + 1) % f.length] as Sommet; return a + (p.s * q.t - q.s * p.t); }, 0)) / 2;
const mansart = () => base({ profil: [BRIS, BRIS], bouts: [{ type: 'brisis', largeurM: 1 }, { type: 'brisis', largeurM: 1 }] });
const gambrel = () => base({ profil: [BRIS, BRIS], bouts: [{ type: 'pignon' }, { type: 'pignon' }] });
const demi = () => base({ bouts: [{ type: 'demi-croupe', profondeurM: 1.2, hauteurPignonM: 1 }, { type: 'pignon' }] });

describe('quelles formes le dessin sait faire', () => {
  it('un corps ordinaire n’est pas concerné : il garde le dessin d’avant, croupes comprises', () => {
    expect(formeEtendue(base(), L, W)).toBeNull();
    expect(formeEtendue(base({ croupes: [2, 2] }), L, W)).toBeNull();
    expect(formeEtendue(base({ bouts: [{ type: 'croupe', profondeurM: 2 }, { type: 'pignon' }] }), L, W)).toBeNull();
    // Des deux pentes droites déclarées (profil droit) ne changent rien non plus.
    expect(formeEtendue(base({ profil: [{ type: 'droit' }, { type: 'droit' }] }), L, W)).toBeNull();
    expect(hauteurEtendue(base(), L, W, 6, 2)).toBeNull();
  });

  it('reconnaît le Mansart, le gambrel et la demi-croupe', () => {
    expect(formeEtendue(mansart(), L, W)?.famille).toBe('mansart');
    expect(formeEtendue(gambrel(), L, W)?.famille).toBe('gambrel');
    expect(formeEtendue(demi(), L, W)?.famille).toBe('demi-croupe');
  });

  it('refuse ce qu’il ne sait pas dessiner : le corps garde alors son dessin d’avant', () => {
    // Un brisis sans bris des deux côtés, un bris avec une croupe ou une demi-croupe, des pignons traversants, un bris hors du pan.
    expect(formeEtendue(base({ profil: [BRIS, { type: 'droit' }], bouts: [{ type: 'brisis', largeurM: 1 }, { type: 'brisis', largeurM: 1 }] }), L, W)).toBeNull();
    expect(formeEtendue(base({ profil: [BRIS, BRIS], bouts: [{ type: 'croupe', profondeurM: 2 }, { type: 'pignon' }] }), L, W)).toBeNull();
    expect(formeEtendue(base({ profil: [BRIS, BRIS], bouts: [{ type: 'demi-croupe', profondeurM: 1, hauteurPignonM: 1 }, { type: 'pignon' }] }), L, W)).toBeNull();
    expect(formeEtendue({ ...gambrel(), pignons: [{ pan: 0, debut: 2, fin: 5, faitage: 5, profondeur: 2 }] }, L, W)).toBeNull();
    expect(formeEtendue(base({ profil: [{ type: 'brise', largeurBrisisM: 3.9, hauteurBrisM: 5 }, BRIS], bouts: [{ type: 'pignon' }, { type: 'pignon' }] }), L, W)?.bris[0]).toBeNull();
    expect(formeEtendue(base({ profil: [{ type: 'brise', largeurBrisisM: 1, hauteurBrisM: 7 }, { type: 'droit' }], bouts: [{ type: 'pignon' }, { type: 'pignon' }] }), L, W)).toBeNull();
    // Un toit plat, un appentis : jamais.
    expect(formeEtendue({ ...gambrel(), faitage: 3 }, L, W)).toBeNull();
    expect(formeEtendue({ ...gambrel(), posFaitage: 0 }, L, W)).toBeNull();
  });
});

describe.each([['le Mansart', mansart], ['le gambrel', gambrel], ['la demi-croupe', demi]])('%s : le toit est fermé', (_nom, fabrique) => {
  const c = fabrique();
  const f = facettesEtendues(c, L, W, SANS, 3)!;

  it('les facettes couvrent le rectangle une fois, sans trou ni recouvrement', () => {
    expect(f.pans.reduce((a, p) => a + aire(p), 0)).toBeCloseTo(L * W, 6);
  });

  it('aucune facette n’a de sommet double (le plan et la triangulation s’y perdraient)', () => {
    for (const p of f.pans) {
      expect(p.length).toBeGreaterThanOrEqual(3);
      p.forEach((q, i) => { const n = p[(i + 1) % p.length] as Sommet; expect(Math.hypot(q.s - n.s, q.t - n.t)).toBeGreaterThan(1e-6); });
    }
  });

  it('chaque facette est plane, et la hauteur du toit en chacun de ses sommets est la sienne', () => {
    for (const p of f.pans) {
      for (const q of p) expect(hauteurEtendue(c, L, W, q.s, q.t)).toBeCloseTo(q.z, 6);
      // Le centre de la facette est sur son plan : la moyenne des hauteurs de ses sommets.
      const m = { s: p.reduce((a, q) => a + q.s, 0) / p.length, t: p.reduce((a, q) => a + q.t, 0) / p.length, z: p.reduce((a, q) => a + q.z, 0) / p.length };
      expect(hauteurEtendue(c, L, W, m.s, m.t)).toBeCloseTo(m.z, 6);
    }
  });

  it('le faîtage et l’égout sont aux hauteurs du corps, et corpsEn les rend', () => {
    expect(hauteurCorpsEn(c, L, W, L / 2, 4)).toBeCloseTo(6.4, 6);
    expect(hauteurCorpsEn(c, L, W, L / 2, 0)).toBeCloseTo(3, 6);
    expect(hauteurCorpsEn(c, L, W, L / 2, W)).toBeCloseTo(3, 6);
    expect(hauteurCorpsEn(c, L, W, L / 2, 2)).toBeLessThan(hauteurCorpsEn(c, L, W, L / 2, 4));
  });

  it('un mur de bout monte du prisme jusqu’au toit, et se ferme', () => {
    // Un Mansart a des brisis aux bouts : le mur s'arrête aux égouts et n'a rien à montrer au-dessus du prisme.
    expect(f.murs.length).toBe(c.bouts?.[0]?.type === 'brisis' ? 0 : 2);
    for (const m of f.murs) {
      expect(m[0]?.z).toBe(3);
      expect(m[m.length - 1]?.z).toBe(3);
      expect(m.every((q) => q.z >= 3 - 1e-9)).toBe(true);
    }
  });

  it('le débord prolonge les plans sous l’égout et au-delà du bout, sans changer le toit au-dessus du mur', () => {
    const d = facettesEtendues(c, L, W, { egout0: 0.35, egout1: 0.35, rive0: 0.2, rive1: 0.2 }, 3)!;
    expect(d.pans.reduce((a, p) => a + aire(p), 0)).toBeCloseTo((L + 0.4) * (W + 0.7), 6);
    expect(Math.min(...d.pans.flat().map((q) => q.z))).toBeLessThan(3);
    expect(hauteurEtendue(c, L, W, 6, 0)).toBeCloseTo(3, 6);
  });
});

describe('le Mansart', () => {
  const c = mansart();
  it('le brisis est raide, le terrasson doux : la ligne de bris est à 1 m du mur et à 5 m', () => {
    expect(hauteurEtendue(c, L, W, 6, 1)).toBeCloseTo(5, 6);
    expect(hauteurEtendue(c, L, W, 6, W - 1)).toBeCloseTo(5, 6);
    expect(hauteurEtendue(c, L, W, 6, 0.5)).toBeCloseTo(4, 6);
  });
  it('il a huit facettes : quatre brisis, et un terrasson de chaque côté et à chaque bout', () => {
    expect(facettesEtendues(c, L, W, SANS, 3)!.pans).toHaveLength(8);
  });
  it('le brisis fait le tour : à 1 m de chaque mur de bout, le toit est à la hauteur de bris', () => {
    expect(hauteurEtendue(c, L, W, 1, 4)).toBeCloseTo(5, 1);
    expect(hauteurEtendue(c, L, W, L - 1, 4)).toBeCloseTo(5, 1);
    expect(hauteurEtendue(c, L, W, 0, 4)).toBeCloseTo(3, 6);
  });
});

describe('le gambrel', () => {
  const c = gambrel();
  it('le mur de bout est un pignon à pans brisés : sa ligne passe par les deux points de bris', () => {
    const m = facettesEtendues(c, L, W, SANS, 3)!.murs[0]!;
    expect(m.map((q) => [q.t, q.z])).toEqual([[0, 3], [0, 3], [1, 5], [4, 6.4], [7, 5], [8, 3], [8, 3]]);
  });
  it('quatre facettes : deux brisis et deux terrassons', () => {
    expect(facettesEtendues(c, L, W, SANS, 3)!.pans).toHaveLength(4);
  });
});

describe('la demi-croupe', () => {
  const c = demi();
  it('le petit pignon monte à 1 m au-dessus de l’égout, la croupe de 1,2 m de profondeur couvre le reste', () => {
    const f = facettesEtendues(c, L, W, SANS, 3)!;
    expect(hauteurEtendue(c, L, W, 0, 4)).toBeCloseTo(4, 6);
    expect(hauteurEtendue(c, L, W, 1.2, 4)).toBeCloseTo(6.4, 6);
    // Trois facettes de plus qu'un deux-pans : la croupe est une seule facette ; les deux pans sont entaillés.
    expect(f.pans).toHaveLength(3);
    const mur = f.murs.find((m) => m[0]?.s === 0)!;
    expect(Math.max(...mur.map((q) => q.z))).toBeCloseTo(4, 6);
    // L'autre bout, en pignon, monte jusqu'au faîtage.
    expect(Math.max(...f.murs.find((m) => m[0]?.s === L)!.map((q) => q.z))).toBeCloseTo(6.4, 6);
  });
});

describe('les lucarnes', () => {
  const lu = (type: Lucarne['type'], plus: Partial<Lucarne> = {}): Lucarne => ({ type, pan: 0, debutM: 4, finM: 6, faitageM: 4.6, profondeurM: 1.5, source: 'observation', ...plus });
  const corps = (l: Lucarne, plus: Partial<Corps> = {}) => base({ lucarnes: [l], ...plus });
  const dessus = (c: Corps, fs: Sommet[][]) => {
    for (const q of fs.flat()) expect(q.z).toBeGreaterThanOrEqual((hauteurCorpsEn(c, L, W, q.s, q.t)) - 1e-6);
  };

  it.each([['jacobine', 2, 3], ['capucine', 3, 3], ['meuniere', 2, 3], ['inconnue', 2, 3], ['chien-assis', 1, 3], ['rampante', 1, 3]] as const)('%s : %i pans de toit, %i faces', (type, pans, murs) => {
    const c = corps(lu(type));
    const f = facettesLucarnes(c, L, W);
    expect(f.pans).toHaveLength(pans);
    expect(f.murs).toHaveLength(murs);
    // Posée sur le pan, jamais dessous ; entièrement dans le corps.
    dessus(c, [...f.pans, ...f.murs]);
    for (const q of [...f.pans, ...f.murs].flat()) { expect(q.s).toBeGreaterThanOrEqual(0); expect(q.s).toBeLessThanOrEqual(L); expect(q.t).toBeGreaterThanOrEqual(0); expect(q.t).toBeLessThanOrEqual(4 + 1e-9); }
  });

  it('le faîtage de la jacobine est à la hauteur dite, et sa face est à profondeur en deçà du point où il rejoint le pan', () => {
    const f = facettesLucarnes(corps(lu('jacobine')), L, W);
    expect(Math.max(...f.pans.flat().map((q) => q.z))).toBeCloseTo(4.6, 6);
    const face = f.murs[0]!;
    const dF = Math.min(...face.map((q) => q.t));
    // Le faîtage 4,6 m rejoint le pan à (4,6 - 3) / (6,4 - 3) * 4 = 1,88 m du mur.
    expect(dF).toBeCloseTo(1.88 - 1.5, 2);
  });

  it('une meunière affleure le mur d’égout ; une lucarne sur le pan 1 est de l’autre côté du faîtage', () => {
    const m = facettesLucarnes(corps(lu('meuniere')), L, W);
    expect(Math.min(...m.murs[0]!.map((q) => q.t))).toBeCloseTo(0, 6);
    const p1 = facettesLucarnes(corps(lu('jacobine', { pan: 1 })), L, W);
    expect(Math.max(...p1.murs[0]!.map((q) => q.t))).toBeGreaterThan(4);
  });

  it('un chien-assis a son toit en pente inverse du pan : il descend vers le faîtage du corps', () => {
    const f = facettesLucarnes(corps(lu('chien-assis')), L, W);
    const toit = f.pans[0]!;
    const devant = toit.filter((q) => q.t === Math.min(...toit.map((x) => x.t)));
    const derriere = toit.filter((q) => q.t === Math.max(...toit.map((x) => x.t)));
    expect(devant[0]!.z).toBeGreaterThan(derriere[0]!.z);
  });

  it('une lucarne trop étroite, hors du corps ou plus haute que le faîtage ne casse rien', () => {
    expect(facettesLucarnes(corps(lu('jacobine', { debutM: 5, finM: 5.2 })), L, W).pans).toHaveLength(0);
    const haute = facettesLucarnes(corps(lu('jacobine', { faitageM: 9 })), L, W);
    expect(Math.max(...haute.pans.flat().map((q) => q.z))).toBeLessThanOrEqual(6.4);
    expect(facettesLucarnes(corps(lu('jacobine', { debutM: -3, finM: 20 })), L, W).pans).toHaveLength(2);
  });

  it('sur un Mansart, la lucarne se pose dans le brisis : son faîtage rejoint le pan sous la ligne de bris', () => {
    const c = base({ profil: [BRIS, BRIS], bouts: [{ type: 'brisis', largeurM: 1 }, { type: 'brisis', largeurM: 1 }], lucarnes: [lu('jacobine', { faitageM: 4.4, profondeurM: 0.6 })] });
    const f = facettesLucarnes(c, L, W);
    dessus(c, [...f.pans, ...f.murs]);
    expect(Math.max(...f.murs.flat().map((q) => q.t))).toBeLessThanOrEqual(1 + 1e-6);
  });
});

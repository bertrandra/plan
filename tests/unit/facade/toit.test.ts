import { describe, it, expect } from 'vitest';
import {
  plansDuToit,
  hauteurToitEn,
  facettesToit,
  trianguler,
  classerProfil,
  corrigerFuite,
  toitDepuisEstimation,
  penteDeg,
  angleDuPlusLongCote,
  profilSilhouette,
  type Toit,
} from '../../../src/facade/toit.js';

const p = (x: number, y: number) => ({ x, y });
const maison = [p(0, 0), p(10, 0), p(10, 6), p(0, 6)];
const deuxPans: Toit = { forme: 'deux-pans', hauteur: 3, angleFaitage: 0 };

describe('plans du toit', () => {
  it('deux pans : faitage au milieu, egout sur les longs cotes', () => {
    const pl = plansDuToit(maison, deuxPans);
    expect(hauteurToitEn(pl, p(5, 3))).toBeCloseTo(3, 9);
    expect(hauteurToitEn(pl, p(5, 0))).toBeCloseTo(0, 9);
    expect(hauteurToitEn(pl, p(2, 1.5))).toBeCloseTo(1.5, 9);
    expect(penteDeg(maison, deuxPans)).toBeCloseTo(45, 6);
  });

  it('quatre pans : croupes de meme pente', () => {
    const pl = plansDuToit(maison, { ...deuxPans, forme: 'quatre-pans' });
    expect(hauteurToitEn(pl, p(5, 3))).toBeCloseTo(3, 9);
    expect(hauteurToitEn(pl, p(0, 3))).toBeCloseTo(0, 9);
    expect(hauteurToitEn(pl, p(1, 3))).toBeCloseTo(1, 9);
  });

  it('appentis : monte d un long cote a l autre', () => {
    const pl = plansDuToit(maison, { ...deuxPans, forme: 'appentis' });
    expect(hauteurToitEn(pl, p(5, 0))).toBeCloseTo(0, 9);
    expect(hauteurToitEn(pl, p(5, 6))).toBeCloseTo(3, 9);
  });

  it('le faitage par defaut suit le plus long cote', () => {
    expect(angleDuPlusLongCote(maison)).toBe(0);
    expect(angleDuPlusLongCote([p(0, 0), p(4, 0), p(4, 9), p(0, 9)])).toBe(90);
  });
});

describe('facettes', () => {
  const aire = (c: { x: number; y: number }[], t: [number, number, number][]) =>
    t.reduce((s, [a, b, d]) => s + Math.abs((c[b]!.x - c[a]!.x) * (c[d]!.y - c[a]!.y) - (c[b]!.y - c[a]!.y) * (c[d]!.x - c[a]!.x)) / 2, 0);

  it('deux pans couvrent tout le contour, deux pignons a l est et a l ouest', () => {
    const { pans, pignons } = facettesToit(maison, deuxPans);
    expect(pans).toHaveLength(2);
    const total = pans.reduce((s, pan) => s + aire(pan.contour, pan.triangles), 0);
    expect(total).toBeCloseTo(60, 6);
    expect(pignons.map((g) => g.cote).sort()).toEqual([1, 3]);
    const est = pignons.find((g) => g.cote === 1)!;
    expect(est.profil.map((q) => q.z)).toEqual([0, 3, 0].map((z) => expect.closeTo(z, 6)));
  });

  it('quatre pans : quatre facettes, aucun pignon', () => {
    const { pans, pignons } = facettesToit(maison, { ...deuxPans, forme: 'quatre-pans' });
    expect(pans).toHaveLength(4);
    expect(pignons).toHaveLength(0);
  });

  it('toit plat : une facette a l egout', () => {
    const { pans, pignons } = facettesToit(maison, { ...deuxPans, forme: 'plat' });
    expect(pans).toHaveLength(1);
    expect(pans[0]!.contour.every((q) => q.z === 0)).toBe(true);
    expect(pignons).toHaveLength(0);
  });

  it('marche sur un contour en L', () => {
    const L = [p(0, 0), p(10, 0), p(10, 4), p(4, 4), p(4, 10), p(0, 10)];
    const { pans } = facettesToit(L, deuxPans);
    const total = pans.reduce((s, pan) => s + aire(pan.contour, pan.triangles), 0);
    expect(total).toBeCloseTo(64, 6);
  });

  it('triangule un polygone concave', () => {
    const L = [p(0, 0), p(2, 0), p(2, 1), p(1, 1), p(1, 2), p(0, 2)];
    expect(trianguler(L)).toHaveLength(4);
    expect(aire(L, trianguler(L))).toBeCloseTo(3, 9);
  });
});

describe('estimation depuis la silhouette', () => {
  const n = 60;
  const t = (i: number) => (i + 0.5) / n;

  it('reconnait un pignon', () => {
    const e = classerProfil(Array.from({ length: n }, (_, i) => 3 * (1 - Math.abs(2 * t(i) - 1))));
    expect(e.forme).toBe('deux-pans');
    expect(e.faitage).toBe('perpendiculaire');
    expect(e.hauteur).toBeCloseTo(3, 1);
  });

  it('reconnait un long pan', () => {
    const e = classerProfil(Array.from({ length: n }, () => 1.8));
    expect(e.forme).toBe('deux-pans');
    expect(e.faitage).toBe('parallele');
    expect(e.hauteur).toBeCloseTo(1.8, 6);
  });

  it('reconnait une croupe', () => {
    const e = classerProfil(Array.from({ length: n }, (_, i) => 2 * Math.min(1, t(i) / 0.25, (1 - t(i)) / 0.25)));
    expect(e.forme).toBe('quatre-pans');
  });

  it('reconnait un appentis', () => {
    const e = classerProfil(Array.from({ length: n }, (_, i) => 2.5 * t(i)));
    expect(e.forme).toBe('appentis');
  });

  it('reconnait un toit plat', () => {
    expect(classerProfil(Array.from({ length: n }, () => 0.1)).forme).toBe('plat');
  });

  it('corrige la fuite d un faitage vu d en bas', () => {
    // Faitage a 3 m au-dessus d'un egout a 3 m, 3 m derriere le mur, vu a 3 m du mur, oeil a 1,5 m :
    // il se projette sur le plan du mur a 1,5 + 4,5 x 3/6 = 3,75 m, soit 0,75 m au-dessus de l'egout.
    expect(corrigerFuite(0.75, 3, 3, 3)).toBeCloseTo(3, 9);
  });

  it('oriente le faitage d apres la facade photographiee', () => {
    const pignon = toitDepuisEstimation(maison, 1, { forme: 'deux-pans', faitage: 'perpendiculaire', hauteur: 3, ecart: 0 }, 3, 3);
    expect(pignon.angleFaitage).toBe(0);
    expect(pignon.hauteur).toBe(3);
    const egout = toitDepuisEstimation(maison, 0, { forme: 'deux-pans', faitage: 'parallele', hauteur: 0.75, ecart: 0 }, 3, 3);
    expect(egout.angleFaitage).toBe(0);
    expect(egout.hauteur).toBeCloseTo(3, 6);
  });

  it('lit la silhouette d un pignon sur ciel bleu', () => {
    const L = 200,
      H = 100,
      px = 50; // 4 m x 2 m au-dessus de l'egout
    const d = new Uint8ClampedArray(L * H * 4);
    for (let y = 0; y < H; y++)
      for (let x = 0; x < L; x++) {
        const hPignon = 2 * (1 - Math.abs((2 * (x + 0.5)) / L - 1)); // metres
        const bati = (H - y) / px <= hPignon;
        const o = (y * L + x) * 4;
        const c = bati ? [200, 120, 90] : [140, 185, 235];
        d[o] = c[0]!;
        d[o + 1] = c[1]!;
        d[o + 2] = c[2]!;
        d[o + 3] = 255;
      }
    const profil = profilSilhouette({ largeur: L, hauteur: H, donnees: d }, px, 40);
    const e = classerProfil(profil);
    expect(e.forme).toBe('deux-pans');
    expect(e.faitage).toBe('perpendiculaire');
    expect(e.hauteur).toBeCloseTo(2, 0);
  });
});

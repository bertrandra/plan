import { describe, it, expect } from 'vitest';
import { coinsEnglobants, mesurerPartieBasse, intersection, ouverturesDansLeMur, contourDuMur, egoutEn, volumesDuBatiment } from '../../../src/facade/profil.js';
import { analyserReleve } from '../../../src/facade/analyse.js';
import { homographie, appliquer } from '../../../src/facade/homographie.js';
import { focalePx } from '../../../src/facade/cadrage.js';

const p = (x: number, y: number) => ({ x, y });

/**
 * Un mur en L de 10 m : partie haute de 0 a 6 m, egout a 6 m ; partie basse (garage) de 6 a 10 m,
 * egout a 3 m. Ciel au-dessus. Deux fenetres en haut, une en bas, une porte de garage.
 */
function elevation() {
  const px = 40,
    L = 10 * px,
    H = 8 * px; // 8 m de haut : de quoi voir le ciel au-dessus
  const d = new Uint8ClampedArray(L * H * 4);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < L; x++) {
      const xm = (x + 0.5) / px,
        ym = 8 - (y + 0.5) / px;
      let c = [140, 185, 235];
      if (ym <= (xm < 6 ? 6 : 3)) c = [222, 205, 176];
      const dans = (a: number, b: number, c0: number, e: number) => xm >= a && xm < a + b && ym >= c0 && ym < c0 + e;
      if (dans(1, 1.2, 3.8, 1.2) || dans(3.5, 1.2, 3.8, 1.2) || dans(1, 1.2, 0.9, 1.35)) c = [55, 62, 70];
      if (dans(7, 2.4, 0, 2.1)) c = [95, 95, 100];
      const g = ((x * 7919 + y * 104729) % 17) - 8;
      const o = (y * L + x) * 4;
      d[o] = c[0]! + g;
      d[o + 1] = c[1]! + g;
      d[o + 2] = c[2]! + g;
      d[o + 3] = 255;
    }
  return { L, H, d, px };
}

/** Appareil a stenope a 12 m, oeil a 1,6 m, legerement de biais ; image 1600 x 1200. */
function camera() {
  const W = 1600,
    Hp = 1200,
    f = focalePx(W, Hp, 67),
    a = (6 * Math.PI) / 180;
  const projeter = (x: number, y: number) => {
    const X = x - 5,
      Y = y - 1.6,
      Z = 12;
    const xc = Math.cos(a) * X - Math.sin(a) * Z,
      zc = Math.sin(a) * X + Math.cos(a) * Z;
    return p(W / 2 + (f * xc) / zc, Hp / 2 - (f * Y) / zc);
  };
  return { W, Hp, f, projeter };
}

function photographier() {
  const e = elevation(),
    cam = camera();
  const cm = [p(0, 8), p(10, 8), p(10, 0), p(0, 0)];
  const versMur = homographie(cm.map((q) => cam.projeter(q.x, q.y)), cm)!;
  const d = new Uint8ClampedArray(cam.W * cam.Hp * 4);
  for (let y = 0; y < cam.Hp; y++)
    for (let x = 0; x < cam.W; x++) {
      const m = appliquer(versMur, p(x + 0.5, y + 0.5));
      const xi = Math.floor(m.x * e.px),
        yi = Math.floor((8 - m.y) * e.px);
      const o = (y * cam.W + x) * 4;
      let c = [140, 185, 235];
      if (m.y < 0) c = [110, 160, 80];
      else if (xi >= 0 && xi < e.L && yi >= 0 && yi < e.H) {
        const s = (yi * e.L + xi) * 4;
        c = [e.d[s]!, e.d[s + 1]!, e.d[s + 2]!];
      }
      d[o] = c[0]!;
      d[o + 1] = c[1]!;
      d[o + 2] = c[2]!;
      d[o + 3] = 255;
    }
  return { photo: { largeur: cam.W, hauteur: cam.Hp, donnees: d }, cam };
}

describe('mur en L : geometrie', () => {
  const { cam } = photographier();
  // Les quatre coins visibles du L et les deux points du decrochement.
  const coins = [cam.projeter(0, 6), cam.projeter(10, 3), cam.projeter(10, 0), cam.projeter(0, 0)];
  const decrochement = { cote: 'droite' as const, haut: cam.projeter(6, 6), bas: cam.projeter(6, 3) };

  it('construit le coin cache au-dessus de la partie basse', () => {
    const e = coinsEnglobants(coins, decrochement)!;
    const vrai = cam.projeter(10, 6);
    expect(e[1]!.x).toBeCloseTo(vrai.x, 6);
    expect(e[1]!.y).toBeCloseTo(vrai.y, 6);
  });

  it('mesure le decrochement et l egout de la partie basse', () => {
    const e = coinsEnglobants(coins, decrochement)!;
    expect(mesurerPartieBasse(e, decrochement, 10, 6)).toEqual({ debut: 6, fin: 10, hauteur: 3 });
  });

  it('marche aussi avec la partie basse a gauche', () => {
    const c = [cam.projeter(0, 3), cam.projeter(10, 6), cam.projeter(10, 0), cam.projeter(0, 0)];
    const d = { cote: 'gauche' as const, haut: cam.projeter(4, 6), bas: cam.projeter(4, 3) };
    const e = coinsEnglobants(c, d)!;
    expect(mesurerPartieBasse(e, d, 10, 6)).toEqual({ debut: 0, fin: 4, hauteur: 3 });
  });

  it('refuse des droites paralleles', () => {
    expect(intersection(p(0, 0), p(1, 0), p(0, 1), p(1, 1))).toBeNull();
  });

  it('donne l egout et le contour du mur', () => {
    const pb = { debut: 6, fin: 10, hauteur: 3 };
    expect(egoutEn(2, 6, pb)).toBe(6);
    expect(egoutEn(8, 6, pb)).toBe(3);
    expect(contourDuMur(10, 6, pb)).toHaveLength(6);
    expect(ouverturesDansLeMur([{ x: 7, y: 2.5, l: 2, h: 2 }, { x: 1, y: 3.8, l: 1.2, h: 1.2 }], 6, pb)).toHaveLength(1);
  });
});

describe('mur en L : analyse complete', () => {
  const { photo, cam } = photographier();
  const coins = [cam.projeter(0, 6), cam.projeter(10, 3), cam.projeter(10, 0), cam.projeter(0, 0)];
  const r = analyserReleve({
    photo,
    coins,
    largeur: 10,
    hauteur: 6,
    contour: [p(0, 0), p(10, 0), p(10, 8), p(0, 8)],
    cote: 0,
    distance: 12,
    decrochement: { cote: 'droite', haut: cam.projeter(6, 6), bas: cam.projeter(6, 3) },
  })!;

  it('rend la partie basse mesuree', () => {
    expect(r.partieBasse).toEqual({ debut: 6, fin: 10, hauteur: 3 });
  });

  it('trouve les baies des deux parties, et pas le ciel au-dessus du garage', () => {
    expect(r.ouvertures.map((o) => o.type).sort()).toEqual(['fenetre', 'fenetre', 'fenetre', 'garage']);
    const garage = r.ouvertures.find((o) => o.type === 'garage')!;
    expect(Math.abs(garage.x - 7)).toBeLessThan(0.08);
    expect(Math.abs(garage.l - 2.4)).toBeLessThan(0.08);
  });

  it('compte la couverture sur le L seulement', () => {
    expect(r.couverture).toBeGreaterThan(0.97);
  });
});

describe('mur en L : la hauteur se mesure sur la photo', () => {
  const { photo, cam } = photographier();
  const coins = [cam.projeter(0, 6), cam.projeter(10, 3), cam.projeter(10, 0), cam.projeter(0, 0)];
  // Le cadastre dit 7,5 m : l'egout haut est en fait a 6 m, le garage a 3 m.
  const r = analyserReleve({
    photo,
    coins,
    largeur: 10,
    hauteur: 7.5,
    focalePx: cam.f,
    contour: [p(0, 0), p(10, 0), p(10, 8), p(0, 8)],
    cote: 0,
    distance: 12,
    decrochement: { cote: 'droite', haut: cam.projeter(6, 6), bas: cam.projeter(6, 3) },
  })!;

  it('mesure l egout haut sur le rectangle englobant, puis la partie basse a cette echelle', () => {
    expect(r.hauteurMesuree).toBe(true);
    expect(Math.abs(r.hauteur - 6)).toBeLessThan(0.03);
    expect(Math.abs(r.partieBasse!.debut - 6)).toBeLessThan(0.03);
    expect(Math.abs(r.partieBasse!.hauteur - 3)).toBeLessThan(0.03);
  });
});

describe('volumes du batiment', () => {
  // Maison 6 x 8 m prolongee a l'est par un garage de 4 x 5 m, moins profond : l'encoche est au plan.
  const L = [p(0, 0), p(10, 0), p(10, 5), p(6, 5), p(6, 8), p(0, 8)];
  const releve = (partieBasse: { debut: number; fin: number; hauteur: number }, cote = 0) => ({
    cote,
    largeur: 10,
    hauteur: 6,
    texture: null,
    ouvertures: [],
    distance: null,
    sourceDistance: null,
    releveLe: '',
    partieBasse,
  });
  const aire = (q: { x: number; y: number }[]) => Math.abs(q.reduce((s, a, i) => { const b = q[(i + 1) % q.length]!; return s + a.x * b.y - b.x * a.y; }, 0)) / 2;

  it('sans mur en L, un seul volume', () => {
    expect(volumesDuBatiment(L, 6, [])).toHaveLength(1);
  });

  it('la partie basse prend la profondeur du pignon adjacent', () => {
    const [haute, basse] = volumesDuBatiment(L, 6, [releve({ debut: 6, fin: 10, hauteur: 3 })]);
    expect(basse!.hauteur).toBe(3);
    expect(aire(basse!.pts)).toBeCloseTo(4 * 5, 9);
    expect(aire(haute!.pts)).toBeCloseTo(6 * 8, 9);
    expect(haute!.hauteur).toBe(6);
    // L'aire ne suffit pas : un aller-retour vers le coin du garage n'en a pas. L'etendue, si.
    expect(Math.max(...haute!.pts.map((q) => q.x))).toBeCloseTo(6, 9);
    expect(Math.min(...basse!.pts.map((q) => q.x))).toBeCloseTo(6, 9);
  });

  it('ne depend pas du sens de saisie du contour', () => {
    const horaire = [...L].reverse();
    // Le cote sud (0,0)-(10,0) est maintenant le cote 4 : de (10,0) a (0,0).
    const [haute, basse] = volumesDuBatiment(horaire, 6, [releve({ debut: 6, fin: 10, hauteur: 3 }, 4)]);
    expect(aire(basse!.pts)).toBeCloseTo(20, 9);
    expect(aire(haute!.pts)).toBeCloseTo(48, 9);
    expect(Math.max(...haute!.pts.map((q) => q.x))).toBeCloseTo(6, 9);
  });

  it('sur un contour rectangle, le pignon adjacent est tout le cote : pleine profondeur', () => {
    const R = [p(0, 0), p(10, 0), p(10, 8), p(0, 8)];
    const [haute, basse] = volumesDuBatiment(R, 6, [releve({ debut: 6, fin: 10, hauteur: 3 })]);
    expect(aire(basse!.pts)).toBeCloseTo(32, 9);
    expect(aire(haute!.pts)).toBeCloseTo(48, 9);
    expect(Math.max(...haute!.pts.map((q) => q.x))).toBeCloseTo(6, 9);
  });

  it('partie basse a gauche', () => {
    const G = [p(0, 0), p(10, 0), p(10, 8), p(4, 8), p(4, 5), p(0, 5)];
    const [haute, basse] = volumesDuBatiment(G, 6, [releve({ debut: 0, fin: 4, hauteur: 3 })]);
    expect(aire(basse!.pts)).toBeCloseTo(20, 9);
    expect(aire(haute!.pts)).toBeCloseTo(48, 9);
    expect(Math.min(...haute!.pts.map((q) => q.x))).toBeCloseTo(4, 9);
  });
});

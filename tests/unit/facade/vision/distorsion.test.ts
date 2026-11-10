import { describe, it, expect } from 'vitest';
import {
  modeleDistorsion,
  corrigerPoint,
  distordrePoint,
  redresserDistorsion,
  estimerDistorsion,
  corrigerDistorsion,
  grandAngleACorriger,
  focale35DePixels,
  FOCALE_GRAND_ANGLE_MM,
} from '../../../../src/facade/vision/distorsion.js';
import { detecterTraces } from '../../../../src/facade/vision/segments.js';
import type { Image } from '../../../../src/facade/vision/homographie.js';

// La distorsion du grand-angle (spec-facades-calage-detection §4, lot L8) : le modele s'inverse, le
// coefficient se retrouve sur des aretes verticales courbees, une photo droite n'est pas retouchee,
// et rien n'est fait au-dela de 20 mm.

const L = 640,
  H = 480;

/**
 * Des montants sombres sur un fond clair, vus par un objectif de coefficient `k` (forme division) :
 * chaque pixel de la photo lit le stenope au point que donne le modele, sans l'echelle.
 */
function montants(k: number): Image {
  const m = { ...modeleDistorsion(L, H, k), echelle: 1 };
  const xs = [60, 150, 250, 400, 500, 590];
  const d = new Uint8ClampedArray(L * H * 4);
  for (let j = 0; j < H; j++)
    for (let i = 0; i < L; i++) {
      const u = corrigerPoint({ x: i + 0.5, y: j + 0.5 }, m);
      const sombre = u.y > 40 && u.y < 440 && xs.some((x) => Math.abs(u.x - x) < 5);
      const o = (j * L + i) * 4;
      d[o] = sombre ? 50 : 225;
      d[o + 1] = sombre ? 55 : 215;
      d[o + 2] = sombre ? 60 : 200;
      d[o + 3] = 255;
    }
  return { largeur: L, hauteur: H, donnees: d };
}

describe('modele de distorsion', () => {
  it('corrige et deforme un point en aller-retour, le centre restant fixe', () => {
    for (const k of [-0.3, -0.12, 0, 0.08]) {
      const m = modeleDistorsion(4000, 3000, k);
      expect(corrigerPoint({ x: 2000, y: 1500 }, m)).toEqual({ x: 2000, y: 1500 });
      for (const p of [
        { x: 0, y: 0 },
        { x: 3900, y: 200 },
        { x: 1200, y: 2900 },
      ]) {
        const q = distordrePoint(corrigerPoint(p, m), m);
        expect(q.x).toBeCloseTo(p.x, 6);
        expect(q.y).toBeCloseTo(p.y, 6);
      }
    }
  });

  it('ramene les coins d une photo en barillet dans le cadre corrige', () => {
    const m = modeleDistorsion(4000, 3000, -0.2);
    expect(m.echelle).toBeCloseTo(0.8, 9);
    const c = corrigerPoint({ x: 0, y: 0 }, m);
    expect(c.x).toBeCloseTo(0, 6);
    expect(c.y).toBeCloseTo(0, 6);
    // Au milieu d'un cote, le bord recule : l'image corrigee y prolonge celui de la photo.
    expect(corrigerPoint({ x: 0, y: 1500 }, m).x).toBeGreaterThan(0);
    expect(modeleDistorsion(4000, 3000, 0.05).echelle).toBe(1);
  });

  it('dit la focale equivalente d une focale en pixels, et le seuil du grand-angle', () => {
    expect(focale35DePixels(1000, 1440, 1080)).toBeCloseTo(25, 9);
    expect(grandAngleACorriger(13)).toBe(true);
    expect(grandAngleACorriger(FOCALE_GRAND_ANGLE_MM)).toBe(false);
    expect(grandAngleACorriger(26)).toBe(false);
    expect(grandAngleACorriger(null)).toBe(false);
  });
});

describe('estimation et correction', () => {
  it('retrouve le coefficient sur des aretes verticales courbees, et les rend droites', () => {
    const img = montants(-0.15);
    const e = estimerDistorsion(img);
    expect(e.fiable).toBe(true);
    expect(e.aretes).toBeGreaterThanOrEqual(4);
    expect(e.k1).toBeGreaterThan(-0.18);
    expect(e.k1).toBeLessThan(-0.12);
    expect(e.residuApresPx ?? Infinity).toBeLessThan((e.residuAvantPx ?? 0) / 2);
    // Sur l'image corrigee, les aretes sont droites : plus rien a corriger.
    const c = corrigerDistorsion(img, 13);
    expect(c).not.toBeNull();
    const apres = estimerDistorsion(c!.image);
    expect(apres.fiable).toBe(false);
    expect(apres.residuAvantPx ?? Infinity).toBeLessThan(e.residuAvantPx ?? 0);
  });

  it('laisse une photo aux aretes droites telle quelle', () => {
    const img = montants(0);
    const e = estimerDistorsion(img);
    expect(e.fiable).toBe(false);
    expect(e.k1).toBe(0);
    expect(Math.abs(e.k1Brut)).toBeLessThan(0.02);
    expect(corrigerDistorsion(img, 13)).toBeNull();
  });

  it('ne fait rien au-dela de 20 mm, ni sans aretes', () => {
    const img = montants(-0.15);
    expect(corrigerDistorsion(img, 26)).toBeNull();
    expect(corrigerDistorsion(img, null)).toBeNull();
    const uni: Image = { largeur: 200, hauteur: 150, donnees: new Uint8ClampedArray(200 * 150 * 4).fill(200) };
    expect(estimerDistorsion(uni)).toMatchObject({ fiable: false, k1: 0, aretes: 0 });
  });

  it('redresse l image sans changer sa taille, ni le centre', () => {
    const img = montants(-0.15);
    const m = modeleDistorsion(L, H, -0.15);
    const r = redresserDistorsion(img, m);
    expect([r.largeur, r.hauteur]).toEqual([L, H]);
    // Le pixel du centre lit le centre de la photo.
    const o = ((H / 2) * L + L / 2) * 4;
    expect(r.donnees[o]).toBe(img.donnees[o]);
  });
});

describe('traces', () => {
  it('gardent les pixels d une arete courbee, en coordonnees de la photo', () => {
    const t = detecterTraces(montants(-0.15), { pixelsMin: 20 });
    expect(t.length).toBeGreaterThan(0);
    for (const x of t) {
      expect(x.points.length).toBe(2 * x.poids.length);
      expect(x.pas).toBe(1);
      for (let q = 0; q < x.poids.length; q++) {
        expect(x.points[2 * q]).toBeGreaterThanOrEqual(0);
        expect(x.points[2 * q]).toBeLessThanOrEqual(L);
      }
    }
  });
});

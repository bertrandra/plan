import { describe, it, expect } from 'vitest';
import { placeDuSoleil, partDeCouchant, HAUTEUR_AFFICHEE_MAX, DISTANCE_COURSE } from '../../../src/three/soleilVitrine.js';

// Le soleil qu'on voit dans la vitrine : autour de la parcelle, plus bas que le vrai pour rester
// dans le champ ; et la part de couchant qui teinte le ciel.

const deg = (d: number) => d * Math.PI / 180;
const cercle = { x: 10, z: -5, rayon: 20 };

describe('la place du disque du soleil', () => {
  it('tourne autour de la parcelle, a l azimut du soleil (x Est, z Sud)', () => {
    const d = cercle.rayon * DISTANCE_COURSE;
    const est = placeDuSoleil(deg(10), deg(90), cercle);
    expect(est.x).toBeGreaterThan(cercle.x + d * 0.9);
    expect(Math.abs(est.z - cercle.z)).toBeLessThan(1e-9);
    const sud = placeDuSoleil(deg(10), deg(180), cercle);
    expect(sud.z).toBeGreaterThan(cercle.z + d * 0.9);
    const ouest = placeDuSoleil(deg(10), deg(270), cercle);
    expect(ouest.x).toBeLessThan(cercle.x - d * 0.9);
  });

  it('reste bas : la hauteur affichee est ecrasee et bornee, pour rester dans le champ', () => {
    const midiEte = placeDuSoleil(deg(65), deg(180), cercle);
    const d = cercle.rayon * DISTANCE_COURSE;
    expect(Math.asin(midiEte.y / d)).toBeLessThanOrEqual(HAUTEUR_AFFICHEE_MAX + 1e-9);
    expect(placeDuSoleil(deg(30), deg(180), cercle).y).toBeLessThan(midiEte.y + 1e-9);
  });

  it('disparait sous l horizon', () => {
    expect(placeDuSoleil(deg(5), deg(270), cercle).visible).toBe(true);
    expect(placeDuSoleil(deg(-3), deg(300), cercle).visible).toBe(false);
  });
});

describe('la part de couchant', () => {
  it('nulle en plein jour, pleine au coucher, et retombe dans la nuit', () => {
    expect(partDeCouchant(deg(40))).toBe(0);
    expect(partDeCouchant(deg(12))).toBe(0);
    expect(partDeCouchant(deg(6))).toBeCloseTo(0.5);
    expect(partDeCouchant(deg(0))).toBe(1);
    expect(partDeCouchant(deg(-3))).toBeCloseTo(0.5);
    expect(partDeCouchant(deg(-10))).toBe(0);
  });
});

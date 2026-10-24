import { describe, it, expect } from 'vitest';
import { bouger, calageDe, coinsDuCalage, egoutDuCalage } from '../../../src/facade/calageSilhouette.js';

// Le calage de la silhouette sur l'assemblage : un mur de 10 x 5 m (rapport 0,5), pose de 100 a 500 px, sol a 400 px.
const coins = [{ x: 100, y: 200 }, { x: 500, y: 200 }, { x: 500, y: 400 }, { x: 100, y: 400 }];

describe('le calage de la silhouette', () => {
  it('part du mur trouve, l etirement faisant tomber l egout de la silhouette sur le sien', () => {
    const c = calageDe(coins, 0.5);
    expect(c).toEqual({ x0: 100, x1: 500, sol: 400, k: 1 });
    expect(egoutDuCalage(c, 0.5)).toBe(200);
  });
  it('garde les proportions : tirer un bout change la hauteur au rapport du plan', () => {
    const c = bouger('droite', 100, 0, calageDe(coins, 0.5), 20);
    expect(egoutDuCalage(c, 0.5)).toBe(150);
  });
  it('etire la photo par son haut sans bouger le sol, dans les bornes admises', () => {
    const c = bouger('haut', 0, -200, calageDe(coins, 0.5), 20);
    expect(c.sol).toBe(400);
    expect(c.k).toBeCloseTo(1.5, 6);
    expect(bouger('haut', 0, -5000, c, 20).k).toBe(2);
  });
  it('rend les coins sur l assemblage non etire : l egout de la silhouette ramene par l etirement', () => {
    const c = { x0: 100, x1: 500, sol: 400, k: 2 };
    expect(coinsDuCalage(c, 0.5)).toEqual([{ x: 100, y: 300 }, { x: 500, y: 300 }, { x: 500, y: 400 }, { x: 100, y: 400 }]);
  });
});

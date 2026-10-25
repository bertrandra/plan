import { describe, it, expect } from 'vitest';
import { creerScene, versEcran, versMonde } from '../../../src/geometry/vue.js';

describe('transformation de scene', () => {
  const scene = creerScene();

  it('place l origine du plan a la position d origine de l ecran', () => {
    expect(versEcran(scene, { x: 0, y: 0 })).toEqual(scene.origine);
  });

  it('inverse Y et seulement Y : le nord du plan monte a l ecran', () => {
    const nord = versEcran(scene, { x: 0, y: 10 });
    const est = versEcran(scene, { x: 10, y: 0 });
    expect(nord.y).toBeLessThan(scene.origine.y);
    expect(est.x).toBeGreaterThan(scene.origine.x);
  });

  it('fait un aller-retour exact', () => {
    const p = { x: 12.34, y: -56.78 };
    const retour = versMonde(scene, versEcran(scene, p));
    expect(retour.x).toBeCloseTo(p.x, 12);
    expect(retour.y).toBeCloseTo(p.y, 12);
  });

  it('applique l echelle en pixels par metre', () => {
    const zoome = { ...creerScene(), scale: 33 };
    expect(versEcran(zoome, { x: 1, y: 0 }).x - zoome.origine.x).toBe(33);
  });

  it('deplace toute la scene quand l origine bouge, sans changer l echelle', () => {
    const decale = { ...creerScene(), origine: { x: 500, y: 200 } };
    const a = versEcran(creerScene(), { x: 3, y: 4 });
    const b = versEcran(decale, { x: 3, y: 4 });
    expect(b.x - a.x).toBe(70);
    expect(b.y - a.y).toBe(110);
  });
});

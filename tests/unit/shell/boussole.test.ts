import { describe, it, expect } from 'vitest';
import { capDepuisOrientation, lisserCap, ecartCap } from '../../../src/shell/boussole.js';

// La boussole : le cap depuis l'evenement d'orientation de Safari ou de Chrome, l'ecran tourne, et
// un lissage qui passe par le nord sans faire le tour.

describe('la boussole', () => {
  it('lit le cap de Safari, de Chrome, et refuse une orientation sans nord', () => {
    expect(capDepuisOrientation({ alpha: 10, absolute: false, webkitCompassHeading: 250 })).toBe(250);
    expect(capDepuisOrientation({ alpha: 90, absolute: true })).toBe(270);
    expect(capDepuisOrientation({ alpha: 0, absolute: true })).toBe(0);
    expect(capDepuisOrientation({ alpha: 90, absolute: false })).toBeNull();
    expect(capDepuisOrientation({ alpha: null, absolute: true })).toBeNull();
  });

  it('ajoute l angle de l ecran en paysage', () => {
    expect(capDepuisOrientation({ alpha: 0, absolute: true }, 90)).toBe(90);
    expect(capDepuisOrientation({ alpha: null, absolute: false, webkitCompassHeading: 300 }, 90)).toBe(30);
  });

  it('lisse par le plus court chemin', () => {
    expect(lisserCap(null, 359)).toBe(359);
    const l = lisserCap(359, 1, 0.5);
    expect(l === 0 || l === 360 ? 0 : l).toBeCloseTo(0);
    expect(ecartCap(350, 10)).toBe(20);
    expect(ecartCap(10, 350)).toBe(-20);
  });
});

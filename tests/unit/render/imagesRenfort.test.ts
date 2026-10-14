import { describe, it, expect } from 'vitest';
import { cadragePhotoRenfort, versCanevas, MARGE_PHOTO } from '../../../src/render/imagesRenfort.js';

// Le cadrage de la photo du renfort (lot L18) : reduite sous 1 024 px marge comprise, la marge grise
// assez large pour un coin hors cadre d'un repere et demi.

describe('le cadrage de la photo du renfort', () => {
  it('reduit la photo et sa marge sous 1 024 px, sans agrandir une petite photo', () => {
    const c = cadragePhotoRenfort(4032, 3024);
    expect(Math.max(c.largeur, c.hauteur)).toBeLessThanOrEqual(1024);
    expect(c.marge).toBe(Math.round(Math.max(c.l, c.h) * MARGE_PHOTO));
    expect(c.l / c.h).toBeCloseTo(4032 / 3024, 2);
    const petite = cadragePhotoRenfort(400, 300);
    expect([petite.l, petite.h]).toEqual([400, 300]);
  });

  it('place un point de la photo dans le canevas, et un coin hors cadre dans la marge', () => {
    const c = cadragePhotoRenfort(1000, 750);
    expect(versCanevas({ x: 0, y: 0 }, c, 1000, 750)).toEqual({ x: c.marge, y: c.marge });
    expect(versCanevas({ x: 1000, y: 750 }, c, 1000, 750)).toEqual({ x: c.marge + c.l, y: c.marge + c.h });
    const dehors = versCanevas({ x: -100, y: 375 }, c, 1000, 750);
    expect(dehors.x).toBeGreaterThan(0);
    expect(dehors.x).toBeLessThan(c.marge);
  });
});

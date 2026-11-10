import { describe, it, expect } from 'vitest';
import { reculPourVoir, ecartDerriere, orienterEcart, capDuDeplacement, VUE_DEVANT_M, INCLINAISON_DEG } from '../../../../src/app/audit/camera.js';

// La camera du mode audit : derriere vous, assez haut pour voir 70 m devant, tournee sur votre cap.
// Repere local de la scene : x vers l'est, z vers le sud.

describe('la vue « drone »', () => {
  it('voit VUE_DEVANT_M devant la position en haut de l ecran', () => {
    const fov = 45;
    const { recul, hauteur } = reculPourVoir(VUE_DEVANT_M, fov);
    // Le rayon du haut de l'ecran touche le sol a VUE_DEVANT_M devant la cible.
    const haut = ((INCLINAISON_DEG - fov / 2) * Math.PI) / 180;
    expect(hauteur / Math.tan(haut) - recul).toBeCloseTo(VUE_DEVANT_M, 6);
    expect(Math.atan2(hauteur, recul) * 180 / Math.PI).toBeCloseTo(INCLINAISON_DEG, 6);
    expect(recul).toBeGreaterThan(30);
    expect(recul).toBeLessThan(60);
  });

  it('se place derriere vous sur votre cap', () => {
    const n = ecartDerriere(0, 10, 5);
    expect(n.x).toBeCloseTo(0); expect(n.z).toBeCloseTo(10); expect(n.y).toBe(5);   // cap nord : camera au sud
    const e = ecartDerriere(90, 10, 5);
    expect(e.x).toBeCloseTo(-10); expect(e.z).toBeCloseTo(0);                        // cap est : camera a l'ouest
  });

  it('tourne avec le cap en gardant distance et hauteur (votre zoom)', () => {
    const o = orienterEcart({ x: 3, y: 7, z: 4 }, 180);
    expect(Math.hypot(o.x, o.z)).toBeCloseTo(5); expect(o.y).toBe(7);
    expect(o.z).toBeCloseTo(-5);                                                       // cap sud : camera au nord
  });

  it('lit le sens de la marche, pas le tremblement du GPS', () => {
    expect(capDuDeplacement({ x: 0, y: 0 }, { x: 1, y: 2 })).toBeNull();
    expect(capDuDeplacement({ x: 0, y: 0 }, { x: 0, y: 10 })).toBeCloseTo(0);
    expect(capDuDeplacement({ x: 0, y: 0 }, { x: 10, y: 0 })).toBeCloseTo(90);
    expect(capDuDeplacement({ x: 0, y: 0 }, { x: -10, y: 0 })).toBeCloseTo(270);
  });
});

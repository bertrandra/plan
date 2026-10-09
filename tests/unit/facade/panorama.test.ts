import { describe, it, expect } from 'vitest';
import { champVertical, fenetreEntiere, fenetreUtile, recadrerEquirectangulaire } from '../../../src/facade/panorama.js';
import type { Image } from '../../../src/facade/homographie.js';

/** Un panoramique synthetique : la teinte rouge code le cap, la verte l'elevation. */
function panoramique(l: number, h: number): Image {
  const donnees = new Uint8ClampedArray(l * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < l; x++) {
    const o = (y * l + x) * 4;
    donnees[o] = Math.round((x / (l - 1)) * 255);
    donnees[o + 1] = Math.round((y / (h - 1)) * 255);
    donnees[o + 3] = 255;
  }
  return { largeur: l, hauteur: h, donnees };
}

describe('fenetres', () => {
  it('fenetreEntiere couvre tout l horizon autour du cap central', () => {
    expect(fenetreEntiere(100)).toEqual({ azimutGauche: -80, azimutDroit: 280, elevationHaut: 90, elevationBas: -90 });
  });
  it('champVertical suit les proportions', () => {
    expect(champVertical(90, 100, 100)).toBeCloseTo(90, 6);
    expect(champVertical(65, 4, 3)).toBeCloseTo(51.2, 0);
  });
  it('fenetreUtile encadre le champ vise avec une marge', () => {
    const f = fenetreUtile(30, 60, 400, 300, 4);
    expect(f.azimutGauche).toBe(-4);
    expect(f.azimutDroit).toBe(64);
    expect(f.elevationHaut).toBeCloseTo(champVertical(60, 400, 300) / 2 + 4, 6);
  });
});

describe('recadrerEquirectangulaire', () => {
  const src = panoramique(720, 360);
  it('le centre de la photo plate regarde le cap demande, a l horizon', () => {
    const img = recadrerEquirectangulaire(src, fenetreEntiere(0), 90, 60, 200, 150);
    const o = (75 * 200 + 100) * 4;
    // Cap 90 = colonne 540 sur 720 (le cap 0 est au milieu, colonne 360) : rouge = 540/719.
    expect(img.donnees[o]! / 255).toBeCloseTo(540 / 719, 1);
    // L'horizon : ligne du milieu.
    expect(img.donnees[o + 1]! / 255).toBeCloseTo(0.5, 1);
    expect(img.donnees[o + 3]).toBe(255);
  });
  it('les bords gauche et droit de la photo plate voient cap - champ/2 et cap + champ/2', () => {
    const img = recadrerEquirectangulaire(src, fenetreEntiere(0), 0, 90, 300, 100);
    const gauche = img.donnees[(50 * 300 + 0) * 4]! / 255, droite = img.donnees[(50 * 300 + 299) * 4]! / 255;
    // Cap -45 = colonne 270, cap +45 = colonne 450.
    expect(gauche).toBeCloseTo(270 / 719, 1);
    expect(droite).toBeCloseTo(450 / 719, 1);
  });
  it('le haut de la photo regarde vers le ciel, le bas vers le sol', () => {
    const img = recadrerEquirectangulaire(src, fenetreEntiere(0), 0, 60, 200, 150);
    expect(img.donnees[(0 * 200 + 100) * 4 + 1]!).toBeLessThan(128);
    expect(img.donnees[(149 * 200 + 100) * 4 + 1]!).toBeGreaterThan(128);
  });
  it('une bande partielle donne la meme image que le panoramique entier', () => {
    const entier = recadrerEquirectangulaire(src, fenetreEntiere(0), 350, 60, 120, 90);
    // La bande : caps 310 a 390 (colonnes 620..719 puis 0..99), elevations +40 a -40.
    const fenetre = { azimutGauche: 310, azimutDroit: 390, elevationHaut: 40, elevationBas: -40 };
    const l = 160, h = 160;
    const donnees = new Uint8ClampedArray(l * h * 4);
    for (let y = 0; y < h; y++) for (let x = 0; x < l; x++) {
      const az = 310 + (x / (l - 1)) * 80, el = 40 - (y / (h - 1)) * 80;
      const sx = ((((az + 180) % 360) + 360) % 360) / 360 * 719, sy = ((90 - el) / 180) * 359;
      const o = (y * l + x) * 4;
      donnees[o] = Math.round((sx / 719) * 255);
      donnees[o + 1] = Math.round((sy / 359) * 255);
      donnees[o + 3] = 255;
    }
    const partiel = recadrerEquirectangulaire({ largeur: l, hauteur: h, donnees }, fenetre, 350, 60, 120, 90);
    let ecartMax = 0;
    for (let i = 0; i < entier.donnees.length; i += 4) ecartMax = Math.max(ecartMax, Math.abs(entier.donnees[i]! - partiel.donnees[i]!), Math.abs(entier.donnees[i + 1]! - partiel.donnees[i + 1]!));
    expect(ecartMax).toBeLessThanOrEqual(6);
  });
});

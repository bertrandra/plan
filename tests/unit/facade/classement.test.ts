import { describe, it, expect } from 'vitest';
import { classer, classerAvecIndices, formeDeTache, lamesHorizontales, estVitree } from '../../../src/facade/classement.js';
import { reglagesStructure } from '../../../src/facade/reglagesStructure.js';
import type { Image } from '../../../src/facade/homographie.js';

// Le classement des ouvertures (spec-facades §11, lot L15) : les regles de taille d'avant le lot, et
// ce que l'image ajoute (vitree, balcon, lames, forme). Chaque lecture est prudente.

const rg = reglagesStructure();

describe('classer : les regles de taille', () => {
  it('garde les quatre types et leurs seuils', () => {
    expect(classer(0, 2.4, 2.1)).toBe('garage');
    expect(classer(0, 1.4, 2.15)).toBe('porte-fenetre');
    expect(classer(0, 0.95, 2.15)).toBe('porte');
    expect(classer(0.3, 1.2, 2)).toBe('porte-fenetre');
    expect(classer(0.9, 1.2, 1.35)).toBe('fenetre');
  });
});

describe('classerAvecIndices', () => {
  it('une grande baie au sol vitree est une porte-fenetre, pas un garage', () => {
    expect(classerAvecIndices(0, 2.4, 2.1, { vitree: true })).toBe('porte-fenetre');
    expect(classerAvecIndices(0, 2.4, 2.1, { vitree: false })).toBe('garage');
  });

  it('une haute baie d etage au-dessus d un balcon est une porte-fenetre', () => {
    expect(classerAvecIndices(3.05, 1.4, 2.1, { details: { allege: 'balcon' } })).toBe('porte-fenetre');
    expect(classerAvecIndices(3.05, 1.4, 2.1, { details: { allege: 'garde-corps' } })).toBe('porte-fenetre');
    expect(classerAvecIndices(3.05, 1.4, 2.1)).toBe('fenetre');
    expect(classerAvecIndices(3.05, 1.2, 1.35, { details: { allege: 'balcon' } })).toBe('fenetre');
  });
});

describe('formeDeTache', () => {
  const l = 24,
    h = 32;
  it('rectangle plein : rect', () => {
    expect(formeDeTache(l, h, () => true, rg)).toBe('rect');
  });

  it('haut en demi-cercle : cintre', () => {
    const r = l / 2;
    const cintre = (x: number, y: number) => y >= r || Math.hypot(x + 0.5 - r, y + 0.5 - r) <= r;
    expect(formeDeTache(l, h, cintre, rg)).toBe('cintre');
  });

  it('disque : rond (oeil-de-boeuf)', () => {
    const rond = (x: number, y: number) => Math.hypot(x + 0.5 - 12, y + 0.5 - 12) <= 12;
    expect(formeDeTache(24, 24, rond, rg)).toBe('rond');
  });

  it('un seul coin rogne (une haie, une ombre) : pas un cintre', () => {
    const ronge = (x: number, y: number) => !(x < 8 && y < 8);
    expect(formeDeTache(l, h, ronge, rg)).toBe('rect');
  });

  it('un haut dentele (un houppier devant la baie) : pas un cintre', () => {
    const dentele = (x: number, y: number) => {
      const r = l / 2;
      const arc = Math.max(0, r - Math.sqrt(Math.max(0, r * r - (x + 0.5 - r) ** 2)));
      return y >= arc + (x % 3 === 0 ? 3 : 0);
    };
    expect(formeDeTache(l, h, dentele, rg)).toBe('rect');
  });

  it('une baie posee sur une haie plus large qu elle (un T) : pas un cintre (lot G17)', () => {
    // La haie : toute la largeur, sur le bas ; la baie : le milieu, sur toute la hauteur.
    const t = (x: number, y: number) => y >= 12 || (x >= 4 && x < l - 4);
    expect(formeDeTache(l, h, t, rg)).toBe('rect');
    // Le meme T, la haie a peine plus large que la baie (un pixel de chaque cote) : la marche est au
    // bord, comme la naissance d'un arc ; mais son haut plat n'est pas un arc qui descend.
    const etroit = (x: number, y: number) => y >= 12 || (x >= 1 && x < l - 1);
    expect(formeDeTache(l, h, etroit, rg)).toBe('rect');
  });

  it('un plein cintre ou un arc surbaisse, a la resolution de la detection (5 cm) : cintre', () => {
    for (const [lp, hp, f] of [
      [22, 32, 11],
      [24, 30, 6],
      [16, 28, 8],
    ] as const) {
      const R = (f * f + (lp / 2) ** 2) / (2 * f);
      const arc = (x: number, y: number) => y >= f || Math.hypot(x + 0.5 - lp / 2, y + 0.5 - R) <= R;
      expect(formeDeTache(lp, hp, arc, rg), `${lp} x ${hp}, fleche ${f}`).toBe('cintre');
    }
  });
});

/** Une image unie de `l` x `h` pixels, dont la couleur de chaque pixel est donnee. */
function image(l: number, h: number, c: (x: number, y: number) => number): Image {
  const d = new Uint8ClampedArray(l * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < l; x++) {
      const v = c(x, y);
      d.set([v, v, v, 255], (y * l + x) * 4);
    }
  return { largeur: l, hauteur: h, donnees: d };
}

describe('lamesHorizontales (persiennes)', () => {
  const b = { X0: 10, X1: 130, Y0: 10, Y1: 150 };
  it('lit le pas de lames regulieres', () => {
    const img = image(140, 160, (_, y) => (Math.floor(y / 4) % 2 ? 90 : 150));
    expect(lamesHorizontales(img, b, 100, rg)).toBeCloseTo(0.08, 2);
  });

  it('ne dit rien d un vitrage uni, ni d un grain fin', () => {
    expect(lamesHorizontales(image(140, 160, () => 80), b, 100, rg)).toBeNull();
    expect(lamesHorizontales(image(140, 160, (x, y) => 80 + ((x * 7 + y * 13) % 5) * 6), b, 100, rg)).toBeNull();
  });
});

describe('estVitree', () => {
  const b = { X0: 0, X1: 200, Y0: 0, Y1: 200 };
  it('des aretes verticales (vantaux, meneau) : vitree ; des rainures horizontales : non', () => {
    expect(estVitree(image(200, 200, (x) => (x % 40 < 4 ? 240 : 60)), b, rg)).toBe(true);
    expect(estVitree(image(200, 200, (_, y) => (y % 20 < 3 ? 200 : 120)), b, rg)).toBe(false);
  });
});

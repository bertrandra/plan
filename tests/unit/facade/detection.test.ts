import { describe, it, expect } from 'vitest';
import { detecterFacade, detecterOuvertures, type OuvertureDetectee } from '../../../src/facade/detection.js';
import type { Image } from '../../../src/facade/homographie.js';

// Les candidats ouvertures (spec-facades §9, lot L14) : fond local, filtre d'ombre, volets battants,
// fusion des indices et confiance. Elevations peintes a 100 px/m, du sol (bas de l'image) vers le haut.

type RGB = [number, number, number];
const PX = 100;

/** Un bruit reproductible de -1 a 1. */
const bruit = (x: number, y: number) => {
  const v = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return (v - Math.floor(v)) * 2 - 1;
};

interface Rect {
  x: number;
  y: number;
  l: number;
  h: number;
  /** Teinte, ou facteur de lumiere (ombre) applique a ce qui est dessous. */
  c?: RGB;
  ombre?: number;
  /** Cotes obliques (ombre portee) : decalage en x par metre de hauteur. */
  pente?: number;
}

/** Une elevation de `L` x `H` metres : un enduit, puis les rectangles (en metres, y depuis le sol). */
function elevation(L: number, H: number, mur: RGB, rects: Rect[], grain = 4): Image {
  const l = Math.round(L * PX),
    h = Math.round(H * PX);
  const d = new Uint8ClampedArray(l * h * 4);
  for (let j = 0; j < h; j++)
    for (let i = 0; i < l; i++) {
      const X = (i + 0.5) / PX,
        Z = H - (j + 0.5) / PX;
      let c: RGB = [...mur];
      for (const r of rects) {
        const dx = (r.pente ?? 0) * (Z - r.y);
        if (X < r.x + dx || X >= r.x + dx + r.l || Z < r.y || Z >= r.y + r.h) continue;
        if (r.c) c = [...r.c];
        if (r.ombre) c = [c[0] * r.ombre, c[1] * r.ombre, c[2] * r.ombre];
      }
      const n = bruit(i, j) * grain;
      d.set([c[0] + n, c[1] + n, c[2] + n, 255], (j * l + i) * 4);
    }
  return { largeur: l, hauteur: h, donnees: d };
}

const ENDUIT: RGB = [222, 205, 176];
const VITRE: RGB = [55, 62, 70];
const BLANC: RGB = [242, 242, 238];

/** Une fenetre : dormant blanc de 6 cm, vitrage sombre. */
const fenetre = (x: number, y: number, l: number, h: number): Rect[] => [
  { x, y, l, h, c: BLANC },
  { x: x + 0.06, y: y + 0.06, l: l - 0.12, h: h - 0.12, c: VITRE },
];

const proche = (o: OuvertureDetectee | undefined, x: number, y: number, l: number, h: number, tol = 0.03) => {
  expect(o, 'ouverture absente').toBeDefined();
  expect(Math.abs(o!.x - x), `x ${o!.x}`).toBeLessThanOrEqual(tol);
  expect(Math.abs(o!.y - y), `y ${o!.y}`).toBeLessThanOrEqual(tol);
  expect(Math.abs(o!.l - l), `l ${o!.l}`).toBeLessThanOrEqual(tol);
  expect(Math.abs(o!.h - h), `h ${o!.h}`).toBeLessThanOrEqual(tol);
};

describe('detecterOuvertures : fond local (A)', () => {
  it('garde les baies du rez-de-chaussee au-dessus d un soubassement en pierre', () => {
    // Soubassement gris de 75 cm, tres granuleux ; fenetres a 20 cm au-dessus ; une porte qui le traverse.
    const img = elevation(8, 5, ENDUIT, [{ x: 0, y: 0, l: 8, h: 0.75, c: [150, 146, 138] }, ...fenetre(1, 0.95, 1.1, 1.3), ...fenetre(6, 0.95, 1.1, 1.3), { x: 3.5, y: 0, l: 1, h: 2.2, c: [70, 50, 40] }]);
    const o = detecterOuvertures(img, PX);
    expect(o).toHaveLength(3);
    proche(o[0], 1, 0.95, 1.1, 1.3);
    expect(o[1]!.type).toBe('porte');
    proche(o[2], 6, 0.95, 1.1, 1.3);
  });
});

describe('detecterOuvertures : filtre d ombre (C)', () => {
  it('ne colle pas l ombre du debord aux fenetres de l etage', () => {
    // L'ombre (60 % de la lumiere) descend de l'egout jusqu'au milieu des fenetres.
    const img = elevation(8, 5, ENDUIT, [...fenetre(1, 3.2, 1.2, 1.2), ...fenetre(5, 3.2, 1.2, 1.2), { x: 0, y: 3.9, l: 8, h: 1.1, ombre: 0.6 }]);
    const o = detecterOuvertures(img, PX);
    expect(o).toHaveLength(2);
    proche(o[0], 1, 3.2, 1.2, 1.2);
    proche(o[1], 5, 3.2, 1.2, 1.2);
  });

  it('ecarte l ombre portee d un balcon, aux cotes obliques', () => {
    const img = elevation(6, 4, ENDUIT, [{ x: 1.5, y: 1.2, l: 2, h: 0.8, ombre: 0.55, pente: -0.6 }]);
    expect(detecterOuvertures(img, PX)).toEqual([]);
  });

  it('garde une porte grise sur un enduit gris : plus sombre, de meme teinte, mais a tableaux francs', () => {
    const img = elevation(6, 4, [190, 190, 188], [{ x: 2.5, y: 0, l: 0.95, h: 2.15, c: [112, 112, 111] }]);
    const o = detecterOuvertures(img, PX);
    expect(o).toHaveLength(1);
    expect(o[0]!.type).toBe('porte');
    proche(o[0], 2.5, 0, 0.95, 2.15);
  });
});

describe('detecterOuvertures : volets battants', () => {
  it('rend la baie seule, pas la baie et ses deux volets ouverts', () => {
    const VERT: RGB = [70, 112, 92];
    const img = elevation(8, 5, ENDUIT, [{ x: 2.4, y: 1, l: 0.6, h: 1.3, c: VERT }, { x: 4.2, y: 1, l: 0.6, h: 1.3, c: VERT }, ...fenetre(3, 1, 1.2, 1.3)]);
    const o = detecterOuvertures(img, PX);
    expect(o).toHaveLength(1);
    proche(o[0], 3, 1, 1.2, 1.3);
  });
});

describe('detecterOuvertures : confiance et reglages', () => {
  const img = elevation(8, 5, ENDUIT, [...fenetre(1, 1, 1.2, 1.3), ...fenetre(5, 1, 1.2, 1.3), { x: 3.3, y: 0, l: 0.95, h: 2.15, c: [120, 70, 40] }]);

  it('donne une confiance pleine aux baies nettes', () => {
    const o = detecterOuvertures(img, PX);
    expect(o).toHaveLength(3);
    for (const x of o) {
      expect(x.confiance).toBeGreaterThanOrEqual(0.7);
      expect(x.confiance).toBeLessThanOrEqual(1);
    }
  });

  it('lit les reglages nommes : une largeur minimale de 1,1 m ecarte la porte', () => {
    const o = detecterOuvertures(img, PX, null, { reglages: { 'facades.detection.largeurMinM': 1.1 } });
    expect(o.map((x) => x.type)).toEqual(['fenetre', 'fenetre']);
  });
});

describe('detecterFacade : structure et details (lot L15)', () => {
  const VERT: RGB = [70, 112, 92];
  /** Trois travees, deux niveaux ; la porte au milieu du rez. */
  const reguliere = (sauf: number[] = []): Rect[] =>
    [fenetre(1, 0.9, 1.2, 1.35), [{ x: 4.5, y: 0, l: 0.95, h: 2.15, c: [120, 70, 40] as RGB }], fenetre(7.8, 0.9, 1.2, 1.35), fenetre(1, 3.8, 1.2, 1.35), fenetre(4.38, 3.8, 1.2, 1.35), fenetre(7.8, 3.8, 1.2, 1.35)]
      .filter((_, i) => !sauf.includes(i))
      .flat();

  it('rend la grille, et la rangee et la travee de chaque ouverture', () => {
    const d = detecterFacade(elevation(10, 6, ENDUIT, reguliere()), PX);
    expect(d.ouvertures).toHaveLength(6);
    expect(d.grille?.niveaux).toHaveLength(2);
    expect(d.grille?.travees).toHaveLength(3);
    expect(d.symetrique).toBe(true);
    for (const o of d.ouvertures) {
      expect(o.source).toBe('detectee');
      expect(o.niveau).toBe(o.y > 3 ? 1 : 0);
      expect(o.travee).toBe(o.x < 3 ? 0 : o.x < 6 ? 1 : 2);
    }
  });

  it('devine une baie cochee au croisement cache par le masque (source devinee)', () => {
    const img = elevation(10, 6, ENDUIT, reguliere());
    // Le masque cache la fenetre de gauche du rez (de 0,6 a 2,6 m, du sol a 2,6 m).
    const vu = new Uint8Array(img.largeur * img.hauteur).fill(1);
    for (let j = img.hauteur - 260; j < img.hauteur; j++) for (let i = 60; i < 260; i++) vu[j * img.largeur + i] = 0;
    const d = detecterFacade(img, PX, vu);
    const g = d.ouvertures.find((o) => o.source === 'devinee');
    expect(d.ouvertures).toHaveLength(6);
    proche(g, 1, 0.9, 1.2, 1.35, 0.05);
    expect(g?.niveau).toBe(0);
    expect(g?.travee).toBe(0);
  });

  it('ne devine rien dans un mur vu et net : la fenetre absente reste absente', () => {
    const d = detecterFacade(elevation(10, 6, ENDUIT, reguliere([0])), PX);
    expect(d.ouvertures).toHaveLength(5);
    expect(d.devinees).toEqual([]);
  });

  it('fusionne les volets battants dans la baie (details.volets)', () => {
    const img = elevation(8, 5, ENDUIT, [{ x: 2.4, y: 1, l: 0.6, h: 1.3, c: VERT }, { x: 4.2, y: 1, l: 0.6, h: 1.3, c: VERT }, ...fenetre(3, 1, 1.2, 1.3)]);
    const d = detecterFacade(img, PX);
    expect(d.ouvertures).toHaveLength(1);
    expect(d.ouvertures[0]?.details?.volets).toBe('battants');
  });

  it('lit un balcon sous une grande baie d etage : porte-fenetre, details.allege', () => {
    const img = elevation(8, 6, ENDUIT, [...fenetre(3, 3.2, 1.4, 2.1), { x: 2.5, y: 3.0, l: 2.4, h: 0.16, c: [150, 150, 150] }]);
    const d = detecterFacade(img, PX);
    const o = d.ouvertures.find((x) => x.y > 3);
    expect(o?.details?.allege).toBe('balcon');
    expect(o?.type).toBe('porte-fenetre');
  });

  it('ne lit pas de balcon au-dessus d un bandeau qui court sur toute la facade', () => {
    const img = elevation(8, 5, ENDUIT, [{ x: 0, y: 0.75, l: 8, h: 0.12, c: [150, 146, 138] }, ...fenetre(1, 0.95, 1.1, 1.3), ...fenetre(6, 0.95, 1.1, 1.3)]);
    const os = detecterFacade(img, PX).ouvertures;
    expect(os).toHaveLength(2);
    for (const o of os) expect(o.details?.allege).toBeUndefined();
  });
});

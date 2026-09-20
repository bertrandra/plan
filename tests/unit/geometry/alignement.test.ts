import { describe, it, expect } from 'vitest';
import { alignerSurCote, rotationDAlignement, tourner } from '../../../src/geometry/alignement.js';
import { angleOfSegment } from '../../../src/geometry/segments.js';

const deg = (rad: number) => (rad * 180) / Math.PI;

// Un carre de 4 m, penche de 10 degres, a poser le long d'une limite horizontale.
const carre = [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 4 }, { x: 0, y: 4 }];
const limiteHorizontale = { a: { x: -10, y: 10 }, b: { x: 10, y: 10 } };

describe('rotationDAlignement', () => {
  it('ne tourne pas ce qui est deja parallele', () => {
    expect(rotationDAlignement({ x: 0, y: 0 }, { x: 4, y: 0 }, limiteHorizontale)).toBeCloseTo(0, 12);
  });

  it('redresse un cote penche du plus court chemin', () => {
    const a = { x: 0, y: 0 };
    const b = { x: Math.cos(0.2), y: Math.sin(0.2) };
    expect(rotationDAlignement(a, b, limiteHorizontale)).toBeCloseTo(-0.2, 12);
  });

  it('prend le demi-tour equivalent plutot que de retourner la forme', () => {
    // Un cote a 170 degres est parallele a l'horizontale a 10 degres pres. Tourner de +170 degres
    // alignerait aussi, mais mettrait l'objet bout pour bout - un abri se retrouverait porte au
    // fond. On tourne donc de -10 degres.
    const dixDegres = (10 * Math.PI) / 180;
    const a = { x: 0, y: 0 };
    const b = { x: Math.cos(Math.PI - dixDegres), y: Math.sin(Math.PI - dixDegres) };
    expect(deg(rotationDAlignement(a, b, limiteHorizontale))).toBeCloseTo(10, 6);
  });

  it('ne depasse jamais le quart de tour, quel que soit le cote vise', () => {
    for (let d = 0; d < 360; d += 7) {
      const r = (d * Math.PI) / 180;
      const rot = rotationDAlignement({ x: 0, y: 0 }, { x: Math.cos(r), y: Math.sin(r) }, limiteHorizontale);
      expect(Math.abs(rot)).toBeLessThanOrEqual(Math.PI / 2 + 1e-12);
    }
  });
});

describe('tourner', () => {
  it('laisse le pivot exactement en place', () => {
    const pivot = { x: 3, y: 7 };
    const r = tourner([pivot, { x: 5, y: 7 }], pivot, 1.1);
    expect(r[0]!.x).toBeCloseTo(3, 12);
    expect(r[0]!.y).toBeCloseTo(7, 12);
  });

  it('conserve les distances', () => {
    const r = tourner(carre, { x: 2, y: 2 }, 0.7);
    expect(Math.hypot(r[1]!.x - r[0]!.x, r[1]!.y - r[0]!.y)).toBeCloseTo(4, 12);
    expect(Math.hypot(r[2]!.x - r[1]!.x, r[2]!.y - r[1]!.y)).toBeCloseTo(4, 12);
  });
});

describe('alignerSurCote', () => {
  const penche = tourner(carre, { x: 2, y: 2 }, 0.35);

  it('rend le cote vise parallele a la cible', () => {
    const r = alignerSurCote(penche, 0, limiteHorizontale);
    const angle = angleOfSegment(r[0]!, r[1]!);
    expect(Math.sin(angle - angleOfSegment(limiteHorizontale.a, limiteHorizontale.b))).toBeCloseTo(0, 12);
  });

  it('garde le milieu du cote aligne immobile', () => {
    // Le pivot est ce milieu : c'est le cote qu'on cale qui doit bouger le moins.
    const avant = { x: (penche[0]!.x + penche[1]!.x) / 2, y: (penche[0]!.y + penche[1]!.y) / 2 };
    const r = alignerSurCote(penche, 0, limiteHorizontale);
    const apres = { x: (r[0]!.x + r[1]!.x) / 2, y: (r[0]!.y + r[1]!.y) / 2 };
    expect(apres.x).toBeCloseTo(avant.x, 12);
    expect(apres.y).toBeCloseTo(avant.y, 12);
  });

  it('ne translate rien quand aucune distance n est demandee', () => {
    const r = alignerSurCote(carre, 0, limiteHorizontale);
    expect(r.map((p) => [+p.x.toFixed(12), +p.y.toFixed(12)])).toEqual(carre.map((p) => [p.x, p.y]));
  });

  it('pose le cote aligne a la distance demandee de la droite cible', () => {
    const r = alignerSurCote(carre, 0, limiteHorizontale, 3);
    const milieu = { x: (r[0]!.x + r[1]!.x) / 2, y: (r[0]!.y + r[1]!.y) / 2 };
    expect(Math.abs(milieu.y - 10)).toBeCloseTo(3, 12);
  });

  it('laisse le cote aligne du cote ou il etait deja', () => {
    // Le carre est sous la limite (y=10) : son cote se pose 3 m dessous, il ne saute pas au-dessus.
    const r = alignerSurCote(carre, 0, limiteHorizontale, 3);
    const milieu = { x: (r[0]!.x + r[1]!.x) / 2, y: (r[0]!.y + r[1]!.y) / 2 };
    expect(milieu.y).toBeCloseTo(7, 12);
  });

  it('mesure la distance depuis le cote aligne, pas depuis la forme entiere', () => {
    // Consequence a connaitre : un carre de 4 m dont le cote est pose a 3 m d'une limite depasse
    // cette limite de 1 m par son cote oppose. C'est voulu - on demande « ce cote-la, a 3 m » - et
    // c'est le controle du contour, chez l'appelant, qui refusera le resultat s'il sort vraiment.
    const r = alignerSurCote(carre, 0, limiteHorizontale, 3);
    expect(Math.max(...r.map((p) => p.y))).toBeCloseTo(11, 12);
  });

  it('traite de meme une forme situee de l autre cote', () => {
    const auDessus = carre.map((p) => ({ x: p.x, y: p.y + 20 }));
    const r = alignerSurCote(auDessus, 0, limiteHorizontale, 3);
    expect(r.every((p) => p.y > 10)).toBe(true);
    const milieu = { x: (r[0]!.x + r[1]!.x) / 2, y: (r[0]!.y + r[1]!.y) / 2 };
    expect(milieu.y - 10).toBeCloseTo(3, 12);
  });

  it('accepte une distance nulle : le cote se pose sur la limite', () => {
    const r = alignerSurCote(carre, 0, limiteHorizontale, 0);
    const milieu = { x: (r[0]!.x + r[1]!.x) / 2, y: (r[0]!.y + r[1]!.y) / 2 };
    expect(milieu.y).toBeCloseTo(10, 12);
  });

  it('ignore une distance illisible plutot que de projeter la forme a l infini', () => {
    const r = alignerSurCote(carre, 0, limiteHorizontale, NaN);
    expect(r.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y))).toBe(true);
    expect(r[0]!.y).toBeCloseTo(0, 12);
  });

  it('ne divise pas par zero sur un cote cible degenere', () => {
    const point = { a: { x: 5, y: 5 }, b: { x: 5, y: 5 } };
    const r = alignerSurCote(carre, 0, point, 2);
    expect(r.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y))).toBe(true);
  });

  it('conserve la forme : les longueurs des cotes ne changent pas', () => {
    const r = alignerSurCote(penche, 1, limiteHorizontale, 2);
    for (let i = 0; i < 4; i++) {
      const av = Math.hypot(penche[(i + 1) % 4]!.x - penche[i]!.x, penche[(i + 1) % 4]!.y - penche[i]!.y);
      const ap = Math.hypot(r[(i + 1) % 4]!.x - r[i]!.x, r[(i + 1) % 4]!.y - r[i]!.y);
      expect(ap).toBeCloseTo(av, 12);
    }
  });
});

import { describe, it, expect } from 'vitest';
import { isolignes, type GrilleScalaire } from '../../../src/geometry/isolignes.js';

// Les isolignes d'une grille (MD/spec-relief.md §5.3, §9.2) : sur un plan incline, des droites
// paralleles perpendiculaires a la pente ; sur une bosse, une ligne fermee ; un trou arrete la ligne.

const grille = (nx: number, ny: number, f: (x: number, y: number) => number | null, pas = 1): GrilleScalaire => ({
  nx, ny, valeur: (i, j) => f(i * pas, -j * pas), position: (i, j) => ({ x: i * pas, y: -j * pas })
});

describe('isolignes', () => {
  it('trace des droites paralleles, perpendiculaires a la pente, sur un plan incline', () => {
    // z = x / 10 : la courbe z = 0,5 est la droite x = 5.
    const g = grille(11, 6, (x) => x / 10);
    const lignes = isolignes(g, 0.5);
    expect(lignes).toHaveLength(1);
    const l = lignes[0]!;
    expect(l.length).toBeGreaterThanOrEqual(6);
    l.forEach(p => expect(p.x).toBeCloseTo(5, 9));
    // Ouverte : d'un bord a l'autre, sans point repete.
    expect(l[0]!.y).not.toBeCloseTo(l[l.length - 1]!.y, 6);
  });

  it('ferme la ligne autour d une bosse et repete son premier point', () => {
    const g = grille(21, 21, (x, y) => 10 - Math.hypot(x - 10, y + 10));
    const lignes = isolignes(g, 7);
    expect(lignes).toHaveLength(1);
    const l = lignes[0]!;
    expect(l[0]).toEqual(l[l.length - 1]);
    // Chaque point est a 3 m du sommet, a l'interpolation lineaire pres (le cercle est inscrit dans la grille).
    l.forEach(p => expect(Math.hypot(p.x - 10, p.y + 10)).toBeCloseTo(3, 0));
  });

  it('ne trace rien a un niveau hors de la grille, ni dans une cellule sans donnee', () => {
    const g = grille(11, 6, (x) => x / 10);
    expect(isolignes(g, 2)).toEqual([]);
    const trouee = grille(11, 6, (x, y) => (x === 5 && y === -2 ? null : x / 10));
    const lignes = isolignes(trouee, 0.5);
    // Le trou coupe la droite x = 5 en deux morceaux.
    expect(lignes.length).toBe(2);
    lignes.forEach(l => l.forEach(p => expect(p.x).toBeCloseTo(5, 9)));
  });

  it('interpole lineairement la position du niveau sur l arete', () => {
    const g = grille(2, 2, (x) => x * 4);   // 0 a gauche, 4 a droite
    const [l] = isolignes(g, 1);
    l!.forEach(p => expect(p.x).toBeCloseTo(0.25, 9));
  });
});

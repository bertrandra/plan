import { describe, it, expect } from 'vitest';
import { nommerLaMaison } from '../../../src/geo/cadastreObjets.js';
import type { ObjetPlan } from '../../../src/model/types.js';

// Le batiment principal s'appelle « Maison » apres l'import (audit UX de la 5.45.0, constat 4) ; l'usage de la BD TOPO reste.
const carre = (x: number, y: number, c: number) => [{ x, y }, { x: x + c, y }, { x: x + c, y: y + c }, { x, y: y + c }];
const parcelle = { key: 'parcelle', type: 'polygon', fonction: 'terrain', pts: carre(0, 0, 40) };
const bati = (key: string, x: number, c: number) => ({ key, type: 'polygon', fonction: 'batiment', name: 'Résidentiel (2 niv.)', pts: carre(x, 5, c), bdtopo: { usage1: 'Résidentiel' } });

describe('nommerLaMaison', () => {
  it('nomme le plus grand batiment de la parcelle, et lui seul, sans toucher a ses donnees', () => {
    const objets = [parcelle, bati('petit', 2, 4), bati('grand', 15, 12)] as unknown as ObjetPlan[];
    nommerLaMaison(objets);
    expect(objets.map((o) => o.name)).toEqual([undefined, 'Résidentiel (2 niv.)', 'Maison']);
    expect((objets[2] as { bdtopo: { usage1: string } }).bdtopo.usage1).toBe('Résidentiel');
  });
  it('ne nomme pas un batiment dessine a la main', () => {
    const objets = [parcelle, { ...bati('main', 5, 10), bdtopo: undefined, name: 'Atelier' }] as unknown as ObjetPlan[];
    nommerLaMaison(objets);
    expect(objets[1]!.name).toBe('Atelier');
  });
});

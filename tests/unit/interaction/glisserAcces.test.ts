import { describe, it, expect } from 'vitest';
import { decalageDeSaisie, glisserAcces } from '../../../src/interaction/glisserAcces.js';
import { nouveauPortail } from '../../../src/model/cloture.js';
import type { PtBrut } from '../../../src/model/types.js';

// Glisser un acces le long de la cloture (interaction/glisserAcces.ts) : il suit le cote le plus
// proche du pointeur, garde l'ecart de la prise, et ne deborde jamais de son cote.

// Rectangle 20 x 10, sens trigonometrique : le cote 0 est le bas (y = 0), le cote 1 la droite (x = 20).
const PTS: PtBrut[] = [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 10 }, { x: 0, y: 10 }];

function portail(cote: number, x: number) {
  const a = nouveauPortail('portail', cote, 20);
  a.cote = cote; a.x = x; a.largeur = 3; a.piliers = null;
  return a;
}

describe('glisser un acces', () => {
  it('garde l\'ecart de la prise : saisi par un bord, il ne saute pas sous le pointeur', () => {
    const a = portail(0, 5);
    const prise = { x: 15, y: 0.2 }; // vu de dehors (du sud), la gauche du cote bas est a l'ouest
    const d = decalageDeSaisie(a, PTS, prise);
    expect(glisserAcces(a, PTS, prise, d)).toBe(false);
    expect(a.x).toBe(5);
  });

  it('suit le pointeur le long du cote, au centimetre', () => {
    const a = portail(0, 5);
    const d = decalageDeSaisie(a, PTS, { x: 13.5, y: 0 });
    expect(glisserAcces(a, PTS, { x: 11.5, y: 0.3 }, d)).toBe(true);
    expect(a.cote).toBe(0);
    expect(a.x).toBeCloseTo(3);
  });

  it('reste dans son cote', () => {
    const a = portail(0, 5);
    glisserAcces(a, PTS, { x: 19.9, y: 0.1 }, 0);
    expect(a.x).toBeCloseTo(17);
    glisserAcces(a, PTS, { x: 0.1, y: 0.1 }, 0);
    expect(a.x).toBeCloseTo(0);
  });

  it('passe l\'angle : il prend le cote le plus proche du pointeur', () => {
    const a = portail(0, 5);
    expect(glisserAcces(a, PTS, { x: 19.8, y: 5 }, 0)).toBe(true);
    expect(a.cote).toBe(1);
    expect(a.x).toBeCloseTo(3.5);
  });
});

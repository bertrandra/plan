import { describe, it, expect, vi } from 'vitest';
import { creerApercuVue, transformation, DELAI_APERCU_MS } from '../../../src/render/apercuVue.js';
import { versEcran } from '../../../src/geometry/vue.js';

// L'apercu d'un geste de vue (render/apercuVue.ts) : la transformation qui mene le dessin d'avant a la
// scene courante, puis un seul rendu complet, une fois le geste pose.

describe('l apercu d un geste de vue', () => {
  it('la transformation place chaque point dessine la ou la nouvelle scene le mettrait', () => {
    const avant = { scale: 2, origine: { x: 100, y: 300 } }, apres = { scale: 5, origine: { x: -40, y: 520 } };
    const m = /matrix\(([^)]+)\)/.exec(transformation(avant, apres))![1]!.split(',').map(Number);
    for (const w of [{ x: 0, y: 0 }, { x: 12, y: -7 }, { x: -30, y: 44 }]) {
      const p0 = versEcran({ ...avant, W: 800, H: 600 } as never, w), p1 = versEcran({ ...apres, W: 800, H: 600 } as never, w);
      expect(m[0]! * p0.x + m[4]!).toBeCloseTo(p1.x, 9);
      expect(m[3]! * p0.y + m[5]!).toBeCloseTo(p1.y, 9);
    }
  });

  it('montre tout de suite, depuis le dernier dessin, et ne redessine qu une fois le geste pose', () => {
    vi.useFakeTimers();
    const element = { style: { transform: '', transformOrigin: '' } };
    const rendre = vi.fn();
    const a = creerApercuVue({ element, rendre });
    const s0 = { scale: 2, origine: { x: 0, y: 0 } }, s1 = { scale: 4, origine: { x: 0, y: 0 } }, s2 = { scale: 8, origine: { x: 0, y: 0 } };
    a.changer(s0, s1);
    a.changer(s1, s2);
    // Toujours depuis le dessin fait a s0 : un facteur 4, pas 2.
    expect(element.style.transform).toBe('matrix(4,0,0,4,0,0)');
    expect(a.enCours()).toBe(true);
    vi.advanceTimersByTime(DELAI_APERCU_MS - 1);
    expect(rendre).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(rendre).toHaveBeenCalledTimes(1);
    // Le rendu complet annule l'apercu.
    a.annuler();
    expect(element.style.transform).toBe('');
    expect(a.enCours()).toBe(false);
    vi.useRealTimers();
  });
});

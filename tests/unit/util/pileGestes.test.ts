import { describe, it, expect } from 'vitest';
import { creerPileGestes } from '../../../src/util/pileGestes.js';

// La pile des gestes d'une facade avant V4 (Ctrl+Z, Ctrl+Y ; decision du proprietaire, 3 novembre 2026).

describe('la pile des gestes', () => {
  it('defait le dernier geste, le refait, et un geste nouveau efface ce qui etait a refaire', () => {
    const p = creerPileGestes<number>();
    let etat = 0;
    const faire = (v: number) => { p.empiler('f', etat); etat = v; };
    faire(1); faire(2);
    expect(p.peutAnnuler()).toBe(true);
    let g = p.annuler(() => etat); etat = g!.etat;
    expect(etat).toBe(1);
    g = p.retablir(() => etat); etat = g!.etat;
    expect(etat).toBe(2);
    g = p.annuler(() => etat); etat = g!.etat;
    faire(5);
    expect(p.peutRetablir()).toBe(false);
    expect(p.annuler(() => etat)?.etat).toBe(1);
    expect(p.annuler(() => etat)?.etat).toBe(0);
    expect(p.annuler(() => etat)).toBeNull();
  });
  it('s oublie d un coup', () => {
    const p = creerPileGestes<string>();
    p.empiler('a', 'x');
    p.vider();
    expect([p.peutAnnuler(), p.peutRetablir()]).toEqual([false, false]);
  });
});

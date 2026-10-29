import { describe, it, expect } from 'vitest';
import { profilDeLaFacade } from '../../../src/facade/regles/toits/profilDeFacade.js';
import type { CorpsToit } from '../../../src/model/types.js';

// Un corps de 10 x 6 : faitage le long de x, a y = 3 ; egouts 3 m, faitage 5,5 m. Le mur sud est le long de y = 0, normale vers -y.
const corps = (extra: Partial<CorpsToit> = {}): CorpsToit => ({ pts: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 6 }, { x: 0, y: 6 }], posFaitage: 3, faitage: 5.5, egouts: [3, 3], pignons: [], ecart: 0.1, ...extra });
const mur = (largeur: number) => ({ gauche: { x: 0, y: 0 }, droite: { x: largeur, y: 0 }, normale: { x: 0, y: -1 }, largeur });

describe('le profil de la facade', () => {
  it('un long pan : le haut a l egout, de bout en bout, a l echelle', () => {
    const p = profilDeLaFacade(mur(10), [corps()])!;
    expect(p.troncons).toHaveLength(1);
    expect(p.largeur).toBe(10);
    expect(p.hauteurMax).toBeCloseTo(3, 1);
    expect(p.hauteurMin).toBeCloseTo(3, 1);
    expect(p.troncons[0]![0]!.x).toBe(0);
    expect(p.troncons[0]!.at(-1)!.x).toBeCloseTo(10, 5);
  });
  it('un pignon monte au-dessus de l egout, un corps plus haut derriere l emporte', () => {
    const p = profilDeLaFacade(mur(10), [corps({ pignons: [{ pan: 0, debut: 3, fin: 6, faitage: 5.5, profondeur: 3 }] })])!;
    expect(p.hauteurMin).toBeCloseTo(3, 1);
    expect(p.hauteurMax).toBeGreaterThan(5);
    // Le triangle du pignon : un sommet (au milieu) entre deux pieds ; la ligne simplifiee garde peu de points.
    const sommet = p.troncons[0]!.reduce((m, q) => (q.y > m.y ? q : m));
    expect(sommet.x).toBeCloseTo(4.5, 1);
    expect(p.troncons[0]!.length).toBeLessThan(12);
  });
  it('sans corps derriere la facade, rien', () => {
    expect(profilDeLaFacade({ ...mur(10), gauche: { x: 50, y: 50 }, droite: { x: 60, y: 50 } }, [corps()])).toBeNull();
  });
  it('un trou entre deux corps coupe le profil en deux troncons', () => {
    const autre = corps({ pts: [{ x: 14, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 6 }, { x: 14, y: 6 }] });
    const p = profilDeLaFacade(mur(20), [corps(), autre])!;
    expect(p.troncons).toHaveLength(2);
  });
});

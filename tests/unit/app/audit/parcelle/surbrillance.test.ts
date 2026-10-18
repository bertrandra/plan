import { describe, it, expect } from 'vitest';
import { surbrillanceDe } from '../../../../../src/app/audit/parcelle/surbrillance.js';
import type { Proposition } from '../../../../../src/regles/decisions.js';
import type { CorpsToit, ObjetPlan, PtBrut } from '../../../../../src/model/types.js';

// Ce qu'une ligne de propositions vise, surligne dans la 3D : le mur d'une facade, le corps qu'une ligne relit seul, le batiment.

const rect = (x0: number, y0: number, x1: number, y1: number): PtBrut[] => [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];
const CORPS: CorpsToit[] = [
  { pts: rect(0, 0, 10, 8), posFaitage: 4, faitage: 9, egouts: [6, 6], pignons: [], ecart: 0.1 },
  { pts: rect(10, 0, 14, 5), posFaitage: 2, faitage: 5, egouts: [3, 3], pignons: [], ecart: 0.1 },
];
const maison = { key: 'maison', name: 'maison', type: 'polygon', fonction: 'batiment', pts: rect(0, 0, 14, 8), elevation: 6, corpsToit: CORPS } as unknown as ObjetPlan;
const ligne = (cible: Proposition['cible'], effet: Proposition['effet']): Proposition => ({ id: 'x', cible, objet: 'x', source: 'arbitrage', avant: '', apres: '', confiance: null, indices: [], remplaceChoix: null, reserve: null, effet });

describe('la surbrillance d une ligne de propositions', () => {
  it('une façade : son mur, du pied au haut du mur, vu de face', () => {
    const s = surbrillanceDe(ligne({ type: 'facade', cle: 'maison', cote: 0 }, { type: 'couleurMurs', couleur: '#fff' }), [maison]);
    expect(s?.formes).toHaveLength(1);
    expect(s?.formes[0]).toMatchObject({ bas: 0, ferme: false });
    expect(s?.formes[0]?.pts).toHaveLength(2);
    expect(s?.normale).not.toBeNull();
  });

  it('une ligne qui relit un corps seul : ce corps, jusqu’à son faîtage', () => {
    const s = surbrillanceDe(ligne({ type: 'batiment', cle: 'maison' }, { type: 'corpsDuToit', corps: 1, toit: CORPS[1] as CorpsToit }), [maison]);
    expect(s?.formes[0]).toMatchObject({ pts: CORPS[1]?.pts, haut: 5, ferme: true });
    expect(s?.normale).toBeNull();
  });

  it('une autre ligne du bâtiment : son contour, jusqu’au plus haut faîtage ; rien quand il n’est plus dans le plan', () => {
    const p = ligne({ type: 'batiment', cle: 'maison' }, { type: 'cheminees', corps: 0, cheminees: [] });
    expect(surbrillanceDe(p, [maison])?.formes[0]).toMatchObject({ haut: 9, ferme: true });
    expect(surbrillanceDe(p, [])).toBeNull();
  });
});

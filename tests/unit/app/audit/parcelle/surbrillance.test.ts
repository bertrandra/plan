import { describe, it, expect } from 'vitest';
import { surbrillanceArbitrage, surbrillanceDe, surbrillanceObservation } from '../../../../../src/app/audit/parcelle/surbrillance.js';
import type { Proposition } from '../../../../../src/regles/decisions.js';
import type { CorpsToit, ObjetPlan, PtBrut } from '../../../../../src/model/types.js';

// Ce qu'une ligne de propositions vise, surligne dans la 3D : le mur d'une facade, le corps qu'une ligne relit seul, le batiment.

const rect = (x0: number, y0: number, x1: number, y1: number): PtBrut[] => [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];
const CORPS: CorpsToit[] = [
  { pts: rect(0, 0, 10, 8), posFaitage: 4, faitage: 9, egouts: [6, 6], pignons: [], ecart: 0.1 },
  { pts: rect(10, 0, 14, 5), posFaitage: 2, faitage: 5, egouts: [3, 3], pignons: [], ecart: 0.1 },
];
const maison = { key: 'maison', name: 'maison', type: 'polygon', fonction: 'batiment', pts: rect(0, 0, 14, 8), elevation: 6, batiment: { corpsToit: CORPS } } as unknown as ObjetPlan;
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

  it('une observation de Claude : le mur d’un relevé revu, le toit, ou les murs ; rien quand le bâtiment a disparu', () => {
    const mur = surbrillanceObservation('maison:obs:renfort:0', [maison]);
    expect(mur?.formes[0]).toMatchObject({ bas: 0, ferme: false });
    expect(mur?.normale).not.toBeNull();
    // Un toit : de l'egout (6 m) au faitage, corps par corps.
    expect(surbrillanceObservation('maison:obs:forme', [maison])?.formes[0]).toMatchObject({ bas: 6, haut: 9, ferme: true });
    expect(surbrillanceObservation('maison:obs:decorMurs', [maison])?.formes[0]).toMatchObject({ bas: 0, haut: 6, ferme: true });
    expect(surbrillanceObservation('maison:obs:forme', [])).toBeNull();
  });

  it('une facade nommee : son mur au contour en gras, pour une proposition, une observation ou un arbitrage', () => {
    const p = surbrillanceDe(ligne({ type: 'facade', cle: 'maison', cote: 0 }, { type: 'couleurMurs', couleur: '#fff' }), [maison]);
    expect(p?.formes[0]?.epais).toBe(true);
    expect(surbrillanceObservation('maison:obs:renfort:0', [maison])?.formes[0]?.epais).toBe(true);
    expect(surbrillanceArbitrage('facade:maison#0', 'silhouetteFacade', [maison])?.formes[0]).toMatchObject({ epais: true, ferme: false });
    // Un corps de toit ou le batiment entier ne sont pas une facade nommee.
    expect(surbrillanceDe(ligne({ type: 'batiment', cle: 'maison' }, { type: 'corpsDuToit', corps: 1, toit: CORPS[1] as CorpsToit }), [maison])?.formes[0]?.epais).toBeUndefined();
  });

  it('un arbitrage de « Sources » : le toit, les murs ou le batiment selon l’attribut ; rien quand le batiment a disparu', () => {
    expect(surbrillanceArbitrage('batiment:maison', 'formeToit', [maison])?.formes[0]).toMatchObject({ bas: 6, haut: 9 });
    expect(surbrillanceArbitrage('batiment:maison', 'hauteurEgout', [maison])?.formes[0]).toMatchObject({ bas: 0, haut: 6 });
    expect(surbrillanceArbitrage('batiment:maison', 'ouverturesFacade', [maison])?.formes[0]).toMatchObject({ bas: 0, haut: 9 });
    expect(surbrillanceArbitrage('batiment:maison', 'formeToit', [])).toBeNull();
    expect(surbrillanceArbitrage('n’importe quoi', 'formeToit', [maison])).toBeNull();
  });

  it('une facade nommee garde sa vraie silhouette (pas un rectangle) et ses ouvertures', () => {
    const avecReleve = { ...maison, batiment: { ...(maison as ObjetPlan).batiment, facades: [{ cote: 0, largeur: 14, hauteur: 6, texture: null, ouvertures: [{ type: 'fenetre', x: 2, y: 1, l: 1, h: 1.2 }], distance: null, sourceDistance: null, releveLe: '2026-10-19' }] } } as unknown as ObjetPlan;
    for (const z of [
      surbrillanceDe(ligne({ type: 'facade', cle: 'maison', cote: 0 }, { type: 'couleurMurs', couleur: '#fff' }), [avecReleve]),
      surbrillanceObservation('maison:obs:renfort:0', [avecReleve]),
      surbrillanceArbitrage('facade:maison#0', 'silhouetteFacade', [avecReleve]),
    ]) {
      const f = z?.formes[0];
      expect(f?.profil?.length).toBeGreaterThanOrEqual(3);
      // Le pied est a 0 ; le haut suit les corps du toit, il depasse le mur de 6 m quelque part.
      expect(Math.min(...(f?.profil ?? []).map((q) => q.y))).toBe(0);
      expect(Math.max(...(f?.profil ?? []).map((q) => q.y))).toBeGreaterThan(6);
      expect(f?.ouvertures).toEqual([{ x: 2, y: 1, l: 1, h: 1.2 }]);
    }
  });
});

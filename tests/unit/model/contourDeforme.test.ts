import { describe, it, expect, vi } from 'vitest';
import { mesuresSuivent, rangsDesCotes, suivreDeformation } from '../../../src/model/contourDeforme.js';
import { apresDeformation } from '../../../src/core/deformation.js';
import { lectureToits } from '../../../src/core/lectureToits.js';
import { insererSommet, supprimerSommet } from '../../../src/model/sommets.js';
import type { Mesure, ObjetPlan, PtBrut, ReleveFacade } from '../../../src/model/types.js';

// Ce qui suit un contour deforme (MD/spec-ouvrages.md, flux du batiment, point 8) : les rangs des releves, des fenetres et des
// cotes, et le toit lu au LiDAR, relu sur le nouveau contour sauf s'il est protege.

const rect = (): PtBrut[] => [{ x: 0, y: 0 }, { x: 12, y: 0 }, { x: 12, y: 8 }, { x: 0, y: 8 }];
const releve = (cote: number) => ({ cote, ouvertures: [] }) as unknown as ReleveFacade;
const corps = { pts: rect(), posFaitage: 4, faitage: 9, egouts: [6, 6] as [number, number], pignons: [], ecart: 0.1 };
function maison(plus: Partial<NonNullable<ObjetPlan['batiment']>> = {}): ObjetPlan {
  const pts = rect();
  return {
    key: 'm', type: 'polygon', name: 'Maison', fonction: 'batiment', pts,
    vertexNames: pts.map((_, i) => 'Point ' + (i + 1)), segmentNames: pts.map((_, i) => 'Cote ' + (i + 1)), frozenVertices: pts.map(() => false),
    bdtopo: { id: 'B1' },
    batiment: {
      toit: { forme: 'deux-pans', hauteur: 3, angleFaitage: 0, source: 'lidar' }, corpsToit: [corps], toitLidarLu: 7,
      facades: [releve(1), releve(2)], fenetres3d: { mode: 'uneParUne', largeur: 1, hauteur: 1.2, appui: 1, entraxe: 3, liste: [{ cote: 3, type: 'fenetre', x: 1, y: 1, l: 1, h: 1.2 }] },
      ...plus,
    },
  } as unknown as ObjetPlan;
}
const mesure = (refSegIndex: number, targetPtIndex: number): Mesure => ({ id: 'c' + refSegIndex + targetPtIndex, refObjKey: 'm', refSegIndex, startEnd: 'B', targetObjKey: 'm', targetPtIndex });
const pts = (o: ObjetPlan) => (o as ObjetPlan & { pts: PtBrut[] }).pts;
const forme = (o: ObjetPlan) => o as unknown as Parameters<typeof insererSommet>[0];

describe('un sommet ajoute ou retire', () => {
  it('les releves, les fenetres reglees et les cotes gardent leur mur ; le toit lu redevient a lire', () => {
    const o = maison(), avant = rect();
    insererSommet(forme(o), 0, { x: 6, y: 0 });
    const suite = suivreDeformation(o, avant, 'geste');
    expect(suite).toEqual({ deforme: true, relire: true, toitGarde: null });
    expect(o.batiment?.facades?.map((r) => r.cote)).toEqual([2, 3]);
    expect(o.batiment?.fenetres3d?.liste?.map((f) => f.cote)).toEqual([4]);
    expect(o.batiment?.toitLidarLu).toBeNull();
    // Les corps restent jusqu'a la relecture, qui y prend ce qui est pose dessus.
    expect(o.batiment?.corpsToit).toEqual([corps]);
    expect(mesuresSuivent([mesure(2, 3), mesure(0, 0)], 'm', avant, pts(o), 'geste').map((m) => [m.refSegIndex, m.targetPtIndex])).toEqual([[3, 4], [0, 0]]);
  });

  it('un sommet retire emporte ses cotes ; les cotes qui suivent descendent d un rang', () => {
    const o = maison(), avant = rect();
    supprimerSommet(forme(o), 1);
    suivreDeformation(o, avant, 'geste');
    // Le coin (12, 0) retire : les cotes 0 et 1 deviennent la diagonale, le cote 2 devient le 1.
    expect(o.batiment?.facades?.map((r) => r.cote)).toEqual([0, 1]);
    expect(mesuresSuivent([mesure(2, 1), mesure(2, 2)], 'm', avant, pts(o), 'geste').map((m) => [m.refSegIndex, m.targetPtIndex])).toEqual([[1, 1]]);
  });
});

describe('un sommet ou un cote tire', () => {
  it('les rangs ne bougent pas ; le toit lu se relit, un toit protege reste et le dit', () => {
    const o = maison(), avant = rect();
    pts(o)[2] = { x: 14, y: 9 };
    expect(suivreDeformation(o, avant, 'geste')).toEqual({ deforme: true, relire: true, toitGarde: null });
    expect(o.batiment?.facades?.map((r) => r.cote)).toEqual([1, 2]);
    const fige = maison({ toitFige: true });
    pts(fige)[2] = { x: 14, y: 9 };
    expect(suivreDeformation(fige, avant, 'geste')).toEqual({ deforme: true, relire: false, toitGarde: 'fige' });
    expect(fige.batiment?.toitLidarLu).toBe(7);
  });

  it('un deplacement d un bloc, ou le meme contour, ne change rien (suivreLeContour s en charge)', () => {
    const o = maison(), avant = rect();
    (o as ObjetPlan & { pts: PtBrut[] }).pts = rect().map((p) => ({ x: p.x + 3, y: p.y - 1 }));
    expect(suivreDeformation(o, avant, 'geste').deforme).toBe(false);
    expect(o.batiment?.toitLidarLu).toBe(7);
  });

  it('apres le geste : le batiment est relu en fond, et un toit protege se dit', () => {
    const relancer = vi.fn();
    const fin = lectureToits.surRelecture(relancer);
    const etat = { measures: [mesure(2, 3)] };
    const o = maison(), avant = rect();
    insererSommet(forme(o), 0, { x: 6, y: 0 });
    expect(apresDeformation(etat, o, avant)).toBeNull();
    expect(relancer).toHaveBeenCalledTimes(1);
    expect(etat.measures.map((m) => [m.refSegIndex, m.targetPtIndex])).toEqual([[3, 4]]);
    const fige = maison({ toitFige: true });
    pts(fige)[2] = { x: 14, y: 9 };
    expect(apresDeformation(etat, fige, avant)).toBe('Le toit de « Maison » est réglé à la main : il n’est pas relu sur le nouveau contour. Ajustez ses corps en Mode Toit.');
    expect(relancer).toHaveBeenCalledTimes(1);
    fin();
  });
});

describe('une actualisation IGN, par la geometrie', () => {
  it('un contour qui commence a un autre sommet : chaque cote suit son mur', () => {
    const avant = rect(), apres = [rect()[2]!, rect()[3]!, rect()[0]!, rect()[1]!];
    expect(rangsDesCotes(avant, apres, 'geometrie')).toEqual([2, 3, 0, 1]);
    // Un geste ne change pas le premier sommet : les rangs restent.
    expect(rangsDesCotes(avant, avant, 'geste')).toEqual([0, 1, 2, 3]);
    expect(mesuresSuivent([mesure(0, 0)], 'm', avant, apres, 'geometrie').map((m) => [m.refSegIndex, m.targetPtIndex])).toEqual([[2, 2]]);
  });
});

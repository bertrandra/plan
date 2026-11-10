import { describe, it, expect } from 'vitest';
import { suivreLeContour } from '../../../src/model/ouvrages/index.js';
import type { ObjetPlan } from '../../../src/model/types.js';

// Un batiment glisse ou tourne d'un bloc : son toit le suit (MD/spec-ouvrages.md, etape 6.3). Avant, les corps du toit, les
// cheminees, les edicules et les volumes restaient a l'ancienne place, et la Vue 3D dessinait le toit a cote de la maison.

const contour = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 6 }, { x: 0, y: 6 }];
function maison(): ObjetPlan {
  return {
    key: 'm', type: 'polygon', fonction: 'batiment', name: 'Maison', pts: contour.map((p) => ({ ...p })),
    batiment: {
      toit: { forme: 'deux-pans', hauteur: 3, angleFaitage: 0 },
      corpsToit: [{ pts: contour.map((p) => ({ ...p })), posFaitage: 3, faitage: 7, egouts: [4, 4], pignons: [], ecart: 0,
        cheminees: [{ x: 2, y: 3, largeurM: 0.5, profondeurM: 0.5, sommetM: 8, position: 'faitage', source: 'observation' }],
        terrasse: { edicules: [{ pts: [{ x: 1, y: 1 }, { x: 2, y: 1 }, { x: 2, y: 2 }], sommetM: 6 }], source: 'observation' } }],
      volumesToit: [{ pts: contour.map((p) => ({ ...p })), toit: { forme: 'deux-pans', hauteur: 3, angleFaitage: 170 } }],
      toitMesure: { pas: 0.5, x0: 0, y0: 6, nx: 20, ny: 12, z: [], egout: 4, faite: 7, source: 'lidar' }
    }
  } as unknown as ObjetPlan;
}

describe('le toit suit son batiment', () => {
  it('glisse : tout ce qui est en coordonnees absolues se translate', () => {
    const o = maison();
    const apres = contour.map((p) => ({ x: p.x + 3, y: p.y - 2 }));
    suivreLeContour(o, contour, apres);
    const b = o.batiment!;
    expect(b.corpsToit![0]!.pts[0]).toEqual({ x: 3, y: -2 });
    expect(b.corpsToit![0]!.cheminees![0]).toMatchObject({ x: 5, y: 1 });
    expect(b.corpsToit![0]!.terrasse!.edicules![0]!.pts[0]).toEqual({ x: 4, y: -1 });
    expect(b.volumesToit![0]!.pts[2]).toEqual({ x: 13, y: 4 });
    expect(b.toitMesure).toMatchObject({ x0: 3, y0: 4 });
    expect(b.toit!.angleFaitage).toBe(0);
  });

  it('tourne : les corps et le faitage tournent ; la grille mesuree, qui ne tourne pas, part', () => {
    const o = maison();
    const apres = contour.map((p) => ({ x: -p.y, y: p.x }));
    suivreLeContour(o, contour, apres);
    const b = o.batiment!;
    expect(b.corpsToit![0]!.pts[1]!.x).toBeCloseTo(0, 9);
    expect(b.corpsToit![0]!.pts[1]!.y).toBeCloseTo(10, 9);
    expect(b.toit!.angleFaitage).toBeCloseTo(90, 9);
    expect(b.volumesToit![0]!.toit.angleFaitage).toBeCloseTo(80, 9);
    expect(b.toitMesure).toBeNull();
  });

  it('un contour deforme ne fait rien suivre', () => {
    const o = maison();
    const avant = JSON.stringify(o.batiment);
    suivreLeContour(o, contour, contour.map((p, i) => (i === 2 ? { x: 11, y: 6 } : p)));
    expect(JSON.stringify(o.batiment)).toBe(avant);
  });

  it('un ouvrage sans donnee absolue n est pas touche', () => {
    const t = { key: 't', type: 'polygon', fonction: 'terrasse', pts: contour.map((p) => ({ ...p })) } as unknown as ObjetPlan;
    const avant = JSON.stringify(t);
    suivreLeContour(t, contour, contour.map((p) => ({ x: p.x + 1, y: p.y })));
    expect(JSON.stringify(t)).toBe(avant);
  });
});

import { describe, it, expect, vi } from 'vitest';
import { creerServiceReleve } from '../../../src/app/releve.js';
import type { ObjetPlan, ReleveFacade, Toit } from '../../../src/model/types.js';

// Le service du releve de facade (app/releve.ts) : ce qu'il ecrit a la validation, et surtout ce
// qu'il n'ecrit pas — la hauteur du batiment, que la photo ne change plus.

vi.mock('../../../src/shell/dialogs.js', () => ({ showToast: vi.fn() }));
vi.mock('../../../src/three/etat3d.js', () => ({ vue3d: { scene: null } }));

const maison = (): ObjetPlan => ({ key: 'maison', name: 'Maison', type: 'polygon', fonction: 'batiment', elevation: 6, pts: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 6 }, { x: 0, y: 6 }] } as unknown as ObjetPlan);
const releve = (cote: number): ReleveFacade => ({ cote, largeur: 10, hauteur: 6, texture: null, hauteurTexture: 6, ouvertures: [{ type: 'fenetre', x: 1, y: 1, l: 1, h: 1.2 }], distance: null, sourceDistance: null, releveLe: '' });

function service(o: ObjetPlan) {
  const ctx = { etat: { objects: [o] } as never, pushHistory: vi.fn(), render: vi.fn(), buildThreeScene: vi.fn(), elevationOf: (x: ObjetPlan) => x.elevation ?? 0 };
  return { ctx, s: creerServiceReleve(ctx) };
}

describe('le service du releve', () => {
  it('ecrit le releve et le toit en un pas d historique, et garde la hauteur du batiment', () => {
    const o = maison();
    const { ctx, s } = service(o);
    s.ouvrir('maison', 0);
    expect(s.hauteurMur()).toBe(6);
    const toit: Toit = { forme: 'deux-pans', hauteur: 2.5, angleFaitage: 0, source: 'photo' };
    s.valider(releve(0), toit, 7.4);
    expect(ctx.pushHistory).toHaveBeenCalledTimes(1);
    expect(o.facades).toHaveLength(1);
    expect(o.toit).toEqual(toit);
    // La photo mesurait 7,4 m : le batiment reste a 6 m.
    expect(o.elevation).toBe(6);
    expect(s.courant()).toBeNull();
    // Un second releve du meme cote le remplace, un autre cote s'ajoute, dans l'ordre des cotes.
    s.ouvrir('maison', 2);
    s.valider(releve(2), null, 6);
    s.ouvrir('maison', 0);
    s.valider({ ...releve(0), ouvertures: [] }, null, 6);
    expect(o.facades?.map((r) => [r.cote, r.ouvertures.length])).toEqual([[0, 0], [2, 1]]);
    expect(o.toit).toEqual(toit);
  });
});

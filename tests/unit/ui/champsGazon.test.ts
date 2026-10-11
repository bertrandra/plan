import { describe, it, expect } from 'vitest';
import { sectionsObjet } from '../../../src/ui/champs/objet.js';
import { champsVisibles, type ChampCase, type ContexteChamps } from '../../../src/ui/champs/types.js';
import { serializeObjects } from '../../../src/io/serialisation.js';
import type { ObjetPlan } from '../../../src/model/types.js';

// « Gazon (3D) », section Apparence de la parcelle du projet : montre par defaut, une preference
// d'affichage gardee a la reouverture (seul son retrait s'ecrit).

const pts = [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 15 }, { x: 0, y: 15 }];
function contexte(obj: Record<string, unknown>, principale = true): ContexteChamps {
  const o = { type: 'polygon', fonction: 'terrain', pts, fill: '#cccccc', name: 'P', ...obj } as unknown as ObjetPlan;
  const parcelle = principale ? o : ({ key: 'parcelle', type: 'polygon', fonction: 'terrain', pts } as unknown as ObjetPlan);
  return { etat: { objects: [o], highlight: {}, lectureSeule: false }, obj: o, objets: [o], parcelle, elevationOf: () => 0, render: () => {} } as unknown as ContexteChamps;
}
const apparence = (c: ContexteChamps) => sectionsObjet(c).find(s => s.id === 'apparence')!;
const gazon = (c: ContexteChamps) => apparence(c).champs.find(ch => ch.cle === 'gazon3d') as ChampCase;

describe('Gazon (3D)', () => {
  it('ne se montre que sur la parcelle du projet, coche par defaut', () => {
    const c = contexte({ key: 'parcelle' });
    expect(champsVisibles(apparence(c), c).map(ch => ch.cle)).toContain('gazon3d');
    expect(gazon(c).lire(c)).toBe(true);
    const voisine = contexte({ key: 'v1' }, false);
    expect(champsVisibles(apparence(voisine), voisine).map(ch => ch.cle)).not.toContain('gazon3d');
  });

  it('est une preference d affichage enregistree, et la texture horizontale l emporte', () => {
    const c = contexte({ key: 'parcelle' });
    const g = gazon(c);
    expect(g.sale).toBe(false);
    expect(g.enregistre).toBe(true);
    expect(g.effets).toEqual(['scene3d']);
    g.ecrire(c, false);
    expect(c.obj.gazon3d).toBe(false);
    expect(serializeObjects([c.obj])[0]!.gazon3d).toBe(false);
    g.ecrire(c, true);
    expect('gazon3d' in c.obj).toBe(false);
    expect(serializeObjects([c.obj])[0]).not.toHaveProperty('gazon3d');
    expect(g.note!(contexte({ key: 'parcelle', textureHorizontale: { id: 'x' } }))).toBe('La texture horizontale choisie l’emporte.');
  });
});

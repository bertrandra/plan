import { describe, it, expect } from 'vitest';
import { sectionsObjet } from '../../../src/ui/champs/objet.js';
import type { ChampNombre, ContexteChamps } from '../../../src/ui/champs/types.js';
import type { ObjetPlan } from '../../../src/model/types.js';

// « Élévation » de l'inspecteur : d'un batiment, c'est la hauteur a l'egout ; saisie, elle est choisie (`egoutChoisi`), et ni le
// LiDAR ni l'actualisation IGN ne la reecrivent (model/protections.ts). D'un autre objet, rien que la hauteur.

const pts = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 8 }, { x: 0, y: 8 }];
function contexte(fonction: string): ContexteChamps {
  const o = { key: 'o', type: 'polygon', fonction, pts, fill: '#cccccc', name: 'O' } as unknown as ObjetPlan;
  return { etat: { objects: [o], highlight: {}, lectureSeule: false }, obj: o, objets: [o], parcelle: null, elevationOf: () => 2.5, render: () => {} } as unknown as ContexteChamps;
}
const elevation = (c: ContexteChamps) => sectionsObjet(c).flatMap((s) => s.champs).find((ch) => ch.cle === 'elevation') as ChampNombre;

describe('Élévation', () => {
  it('saisie sur un batiment, elle devient la hauteur a l egout choisie', () => {
    const c = contexte('batiment');
    elevation(c).ecrire(c, 5.4);
    expect(c.obj.elevation).toBe(5.4);
    expect(c.obj.batiment?.egoutChoisi).toBe('saisie');
  });

  it('sur un autre objet, elle ne pose rien d autre', () => {
    const c = contexte('autre');
    elevation(c).ecrire(c, 1.2);
    expect(c.obj.elevation).toBe(1.2);
    expect(c.obj.batiment).toBeUndefined();
  });
});

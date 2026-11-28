import { describe, it, expect } from 'vitest';
import { sectionsObjet } from '../../../src/ui/champs/objet.js';
import type { ChampNombre, ContexteChamps } from '../../../src/ui/champs/types.js';
import type { ObjetPlan } from '../../../src/model/types.js';

// « Élévation » de l'inspecteur : d'un objet, rien que sa hauteur. D'un batiment, c'est la hauteur a l'egout, qui se regle dans
// l'atelier du toit (controleur du toit, tests/unit/facade/modeToit/reglagesBatiment.test.ts) : l'inspecteur ne la montre plus ici.

const pts = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 8 }, { x: 0, y: 8 }];
function contexte(fonction: string): ContexteChamps {
  const o = { key: 'o', type: 'polygon', fonction, pts, fill: '#cccccc', name: 'O' } as unknown as ObjetPlan;
  return { etat: { objects: [o], highlight: {}, lectureSeule: false }, obj: o, objets: [o], parcelle: null, elevationOf: () => 2.5, render: () => {} } as unknown as ContexteChamps;
}
const champs = (c: ContexteChamps) => sectionsObjet(c).flatMap((s) => s.champs);
const elevation = (c: ContexteChamps) => champs(c).find((ch) => ch.cle === 'elevation') as ChampNombre;

describe('Élévation', () => {
  it('ne se montre pas sur un batiment : sa hauteur a l egout se regle dans l atelier du toit, ni « Rendre au calcul »', () => {
    const c = contexte('batiment');
    expect(elevation(c).visible?.(c)).toBe(false);
    expect(champs(c).map((ch) => ch.cle)).not.toContain('rendreEgout');
  });

  it('sur un autre objet, elle ne pose rien d autre', () => {
    const c = contexte('autre');
    expect(elevation(c).visible?.(c)).toBe(true);
    elevation(c).ecrire(c, 1.2);
    expect(c.obj.elevation).toBe(1.2);
    expect(c.obj.batiment).toBeUndefined();
  });
});

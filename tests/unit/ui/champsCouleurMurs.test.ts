import { describe, it, expect } from 'vitest';
import { champsCouleurMurs, decrireCouleurMurs } from '../../../src/ui/champs/couleurMurs.js';
import { champsVisibles, type ChampChoix, type ContexteChamps } from '../../../src/ui/champs/types.js';
import type { ObjetPlan } from '../../../src/model/types.js';

// Le choix de la couleur des murs en 3D (MD/spec-toit-ign.md §6.5), section « Apparence ».

const pts = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 8 }, { x: 0, y: 8 }];
function contexte(plus: Record<string, unknown>): ContexteChamps {
  const o = { key: 'm', fonction: 'batiment', type: 'polygon', pts, fill: '#cccccc', ...plus } as unknown as ObjetPlan;
  return { etat: { objects: [o], highlight: {}, lectureSeule: false }, obj: o, objets: [o], elevationOf: () => 6, render: () => {} } as unknown as ContexteChamps;
}
const section = { id: 'apparence', titre: 'Apparence', champs: champsCouleurMurs };
const cles = (c: ContexteChamps) => champsVisibles(section as never, c).map((x) => x.cle);
const choix = champsCouleurMurs[0] as ChampChoix;
const photo = { couleur: '#D9D2C4', id: 'p', date: '2018-03-21T12:00:00Z', auteur: 'IGN', licence: null };

describe('Murs en 3D', () => {
  it('sans lecture, rien a choisir', () => {
    expect(cles(contexte({}))).toEqual([]);
    expect(cles(contexte({ bdtopo: { materiauxMurs: '90' } }))).toEqual([]);
  });

  it('propose les sources lues, dit d ou vient chaque couleur et laquelle est retenue', () => {
    const c = contexte({ bdtopo: { materiauxMurs: '24' }, couleurMurs: { photo } });
    expect(cles(c)).toEqual(['sourceCouleurMurs', 'couleurMursLue']);
    expect(choix.options(c).map((o) => o.valeur)).toEqual(['auto', 'photo', 'materiau', 'plan']);
    expect(choix.lire(c)).toBe('auto');
    expect(decrireCouleurMurs(c.obj)).toBe('Photo de rue du 21/03/2018 (IGN) : #D9D2C4 · matériau : meulière et brique, #B3895A · retenue : photo de rue');
  });

  it('le choix se range sur le batiment ; « Automatique » l efface, la lecture reste', () => {
    const c = contexte({ bdtopo: { materiauxMurs: '40' }, couleurMurs: { photo } });
    choix.ecrire(c, 'materiau');
    expect(c.obj.couleurMurs).toEqual({ photo, source: 'materiau' });
    expect(decrireCouleurMurs(c.obj)).toContain('retenue : matériau');
    choix.ecrire(c, 'plan');
    expect(decrireCouleurMurs(c.obj)).toContain('retenue : couleur du plan');
    choix.ecrire(c, 'auto');
    expect(c.obj.couleurMurs).toEqual({ photo });
    // Le materiau seul : pas d'option « Photo de rue ».
    expect(choix.options(contexte({ bdtopo: { materiauxMurs: '10' } })).map((o) => o.valeur)).toEqual(['auto', 'materiau', 'plan']);
  });
});

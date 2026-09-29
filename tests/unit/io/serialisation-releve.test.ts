import { describe, it, expect } from 'vitest';
import { serializeObjects } from '../../../src/io/serialisation.js';
import { normalizeObjects } from '../../../src/model/normalisation.js';
import type { ObjetPlan, ReleveFacade, Toit } from '../../../src/model/types.js';

const maison = (): ObjetPlan => ({
  key: 'maison',
  type: 'polygon',
  name: 'Maison',
  fonction: 'batiment',
  elevation: 6,
  pts: [
    { x: 0, y: 0 },
    { x: 8, y: 0 },
    { x: 8, y: 6 },
    { x: 0, y: 6 },
  ],
  vertexNames: ['A', 'B', 'C', 'D'],
  segmentNames: ['Sud', 'Est', 'Nord', 'Ouest'],
});

const releve: ReleveFacade = {
  cote: 0,
  largeur: 8,
  hauteur: 6,
  texture: 'data:image/jpeg;base64,AAAA',
  hauteurTexture: 10.8,
  ouvertures: [{ type: 'porte', x: 3.5, y: 0, l: 0.95, h: 2.15 }],
  distance: 3.05,
  sourceDistance: 'lidar',
  releveLe: '2026-09-28T20:00:00.000Z',
};
const toit: Toit = { forme: 'deux-pans', hauteur: 3, angleFaitage: 90, source: 'photo' };

describe('serialisation du releve de facade', () => {
  it("n'ajoute aucune cle a un batiment sans releve : projet.json garde sa forme", () => {
    const [o] = serializeObjects([maison()]);
    expect(Object.keys(o!)).not.toContain('facades');
    expect(Object.keys(o!)).not.toContain('toit');
  });

  it('garde releve et toit, a l identique, a travers enregistrement et relecture', () => {
    const m = { ...maison(), facades: [releve], toit };
    const lu = normalizeObjects(JSON.parse(JSON.stringify(serializeObjects([m]))) as ObjetPlan[]);
    expect(lu[0]!.facades).toEqual([releve]);
    expect(lu[0]!.toit).toEqual(toit);
  });

  it('copie en profondeur : un instantane d historique ne partage rien avec le plan', () => {
    const m = { ...maison(), facades: [releve], toit: { ...toit } };
    const [copie] = normalizeObjects([m]);
    copie!.facades![0]!.ouvertures[0]!.l = 2;
    copie!.toit!.hauteur = 9;
    expect(m.facades[0]!.ouvertures[0]!.l).toBe(0.95);
    expect(m.toit.hauteur).toBe(3);
  });

  it("n'ecrit pas une liste de releves vide", () => {
    const [o] = serializeObjects([{ ...maison(), facades: [] }]);
    expect(Object.keys(o!)).not.toContain('facades');
  });
});

import { describe, it, expect } from 'vitest';
import { serializeObjects } from '../../../src/io/serialisation.js';
import { normalizeObjects } from '../../../src/model/normalisation.js';
import type { Cheminee, CorpsToit, ObjetPlan, TerrasseToit } from '../../../src/model/types.js';

// Cheminees et toits-terrasses dans les corps (MD/spec-regles-toits.md §4) : facultatifs, ils
// passent l'enregistrement tels quels, et un fichier ancien (des corps sans eux) garde son sens.

const pts = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 8 }, { x: 0, y: 8 }];
const corps: CorpsToit = { pts, posFaitage: 4, faitage: 8, egouts: [5, 5], pignons: [], ecart: 0.2 };
const cheminee: Cheminee = { x: 5, y: 4, largeurM: 0.6, profondeurM: 0.4, sommetM: 8.6, position: 'faitage', conduits: 2, materiau: 'brique', couronnement: 'mitrons', source: 'observation' };
const terrasse: TerrasseToit = { accessible: true, revetement: 'bois', acrotereM: 0.6, gardeCorps: true, edicules: [{ pts: [{ x: 1, y: 1 }, { x: 3, y: 1 }, { x: 3, y: 3 }], sommetM: 5.5 }], source: 'observation' };
const batiment = (corpsToit: CorpsToit[]) => ({
  key: 'b', type: 'polygon', name: 'Maison', pts, fonction: 'batiment', vertexNames: ['A', 'B', 'C', 'D'], segmentNames: ['1', '2', '3', '4'],
  frozenVertices: [false, false, false, false], batiment: { corpsToit },
}) as unknown as ObjetPlan;

function allerRetour(o: ObjetPlan): CorpsToit[] {
  const [s] = serializeObjects([o]);
  const [relu] = normalizeObjects([JSON.parse(JSON.stringify(s))]) as unknown as { batiment: { corpsToit: CorpsToit[] } }[];
  return relu!.batiment.corpsToit;
}

describe('cheminees et terrasses a l enregistrement', () => {
  it('une souche et une terrasse observees reviennent a l identique', () => {
    const plat: CorpsToit = { ...corps, faitage: 3, egouts: [3, 3], terrasse };
    const relus = allerRetour(batiment([{ ...corps, cheminees: [cheminee] }, plat]));
    expect(relus[0]!.cheminees).toEqual([cheminee]);
    expect(relus[1]!.terrasse).toEqual(terrasse);
  });

  it('un corps sans elles (un fichier ancien) n en gagne pas : ni a l ecriture, ni a la relecture', () => {
    const [s] = serializeObjects([batiment([corps])]) as unknown as { corpsToit: Record<string, unknown>[] }[];
    expect(s!.corpsToit[0]).not.toHaveProperty('cheminees');
    expect(s!.corpsToit[0]).not.toHaveProperty('terrasse');
    const relus = allerRetour(batiment([corps]));
    expect(relus[0]).toEqual(corps);
  });

  it('une liste vide de cheminees ne s ecrit pas', () => {
    const [s] = serializeObjects([batiment([{ ...corps, cheminees: [] }])]) as unknown as { corpsToit: Record<string, unknown>[] }[];
    expect(s!.corpsToit[0]).not.toHaveProperty('cheminees');
  });
});

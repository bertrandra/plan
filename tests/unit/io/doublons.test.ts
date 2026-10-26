import { describe, expect, it } from 'vitest';
import { nouvelObjet } from '../../../src/model/creation.js';
import { normalizeObjects } from '../../../src/model/normalisation.js';
import { fusionnerDoublons, nombreDeDoublons, trouverDoublons } from '../../../src/io/doublons.js';
import type { Mesure, ObjetPlan } from '../../../src/model/types.js';
import { DEMO_OBJECTS } from '../../../src/model/demo.js';
import { normaliserEnObjetsDuPlan } from '../../../src/app/assemblage/formes.js';

const objet = (key: string, x = 0, y = 0): ObjetPlan => normalizeObjects([nouvelObjet({ x, y }, key, true).obj])[0] as ObjetPlan;
const mesure = (ref: string, cible: string): Mesure => ({ id: ref + cible, refObjKey: ref, refSegIndex: 0, startEnd: 'start', targetObjKey: cible, targetPtIndex: 0 });

describe('doublons', () => {
  it('trouve deux objets identiques, quels que soient leur cle, leur nom et leur verrou', () => {
    const a = objet('a'), b = { ...objet('b'), name: 'Copie' };
    const g = trouverDoublons([a, b, objet('c', 5, 5)]);
    expect(g).toHaveLength(1);
    expect(g[0]?.garde.key).toBe('a');
    expect(nombreDeDoublons(g)).toBe(1);
  });

  it('ne tient pas pour doublon une copie decalee, ni la parcelle', () => {
    expect(trouverDoublons([objet('a'), objet('b', 0.5, 0)])).toEqual([]);
    expect(trouverDoublons([objet('parcelle'), objet('autre')])).toEqual([]);
  });

  it('sur la demonstration : aucun doublon, puis les copies posees, dans l ordre du plan (le tri par forme ne perd rien)', () => {
    const objets = normaliserEnObjetsDuPlan(JSON.parse(JSON.stringify(DEMO_OBJECTS)));
    expect(trouverDoublons(objets)).toEqual([]);
    // Deux copies exactes, une copie dont seul un reglage differe (pas un doublon), dans le desordre du plan.
    const [p, q] = [objets[20] as ObjetPlan, objets[5] as ObjetPlan];
    const copie = (o: ObjetPlan, cle: string) => ({ ...JSON.parse(JSON.stringify(o)), key: cle, name: 'Copie' }) as ObjetPlan;
    const autre = { ...copie(q, 'q3'), elevation: (q.elevation ?? 0) + 1 } as ObjetPlan;
    const avec = [...objets, copie(p, 'p2'), copie(q, 'q2'), autre];
    const groupes = trouverDoublons(avec);
    expect(groupes.map((g) => [g.garde.key, g.doublons.map((d) => d.key)])).toEqual([[q.key, ['q2']], [p.key, ['p2']]]);
  });

  it('garde l objet verrouille', () => {
    const b = { ...objet('b'), locked: true };
    expect(trouverDoublons([objet('a'), b])[0]?.garde.key).toBe('b');
  });

  it('retire les doublons et reporte les cotes sur l objet garde, sans cote en double', () => {
    const objets = [objet('a'), objet('b'), objet('c', 9, 9)];
    const r = fusionnerDoublons(objets, [mesure('b', 'c'), mesure('a', 'c')], trouverDoublons(objets));
    expect(r.objets.map((o) => o.key)).toEqual(['a', 'c']);
    expect(r.retires).toBe(1);
    expect(r.mesures).toHaveLength(1);
    expect(r.mesures[0]?.refObjKey).toBe('a');
  });
});

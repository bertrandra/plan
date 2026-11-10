import { describe, it, expect, vi } from 'vitest';
import { objetsHorsSession, validerLaSession, type SessionToit } from '../../../../src/app/toits/modeToit.js';
import { creerHistorique, ecrireLeGeste, empiler, restaurer } from '../../../../src/facade/modeToit/sessionToit.js';
import { serializeObjects } from '../../../../src/io/serialisation.js';
import type { CorpsToit, ObjetPlan } from '../../../../src/model/types.js';

// Une session du Mode Toit n'entre dans le projet qu'a « Valider » (MD/spec-flux-batiment.md, point 14) : l'enregistrement seul de la
// lecture des toits en fond (app/toits/toitsFond.ts) ou Ctrl+S, partis pendant la session, ecrivent le batiment a son depart ; une
// session abandonnee ne laisse donc aucune trace dans ce qui a ete enregistre.

const corps: CorpsToit = { pts: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 8 }, { x: 0, y: 8 }], posFaitage: 4, faitage: 9, egouts: [6, 6], pignons: [], ecart: 0.1 };
const maison = (): ObjetPlan => ({
  key: 'm', name: 'Maison', type: 'polygon', fonction: 'batiment', pts: corps.pts, elevation: 6,
  batiment: { toit: { forme: 'deux-pans', hauteur: 3, angleFaitage: 0, source: 'lidar' }, corpsToit: [structuredClone(corps)], toitLidarLu: 7 },
}) as unknown as ObjetPlan;
const voisin = (): ObjetPlan => ({ key: 'v', name: 'Abri', type: 'polygon', fonction: 'batiment', pts: corps.pts, elevation: 2 }) as unknown as ObjetPlan;
const session = (o: ObjetPlan): SessionToit => ({ cle: o.key, hist: creerHistorique(o), facade: null, derniere: null, vue: 'libre', corpsIsole: null, selection: null, indice: false, vueAvant: null, isole: false, validee: false });

/** Un geste du mode : un panneau solaire, et l'egout du corps principal descendu (l'elevation suit). */
function geste(o: ObjetPlan, s: SessionToit): void {
  ecrireLeGeste(o, [{ ...structuredClone(corps), elementsToit: [{ type: 'solaire', pan: 0, centreM: 5, basM: 1 }] } as unknown as CorpsToit], 4.5);
  empiler(s.hist, o);
}

describe('ce qui s enregistre pendant une session du Mode Toit', () => {
  it('le batiment en session s enregistre a son depart ; le plan, lui, garde le geste', () => {
    const o = maison(), autre = voisin(), s = session(o);
    const avant = serializeObjects([o, autre]);
    geste(o, s);
    const enregistre = serializeObjects(objetsHorsSession([o, autre], s));
    expect(enregistre).toEqual(avant);
    // Le batiment du plan n'est pas touche : la scene montre toujours le geste.
    expect(o.batiment?.toitFige).toBe(true);
    expect(o.batiment?.corpsToit?.[0]?.elementsToit).toHaveLength(1);
    expect(o.elevation).toBe(4.5);
    // Les autres objets passent tels quels (memes objets, pas de copie).
    expect(objetsHorsSession([o, autre], s)[1]).toBe(autre);
  });

  it('abandonnee, la session ne laisse rien : le plan revient a ce qui a ete enregistre pendant la session', () => {
    const o = maison(), s = session(o);
    geste(o, s);
    const enregistre = serializeObjects(objetsHorsSession([o], s));
    restaurer(o, s.hist.pas[0] ?? {});
    expect(serializeObjects([o])).toEqual(enregistre);
  });

  it('validee, elle entre dans le projet : hors session, tout s enregistre tel quel', () => {
    const o = maison(), s = session(o);
    geste(o, s);
    const a = { pushHistory: vi.fn(), markDirty: vi.fn() };
    expect(validerLaSession(a, o, s)).toBe(true);
    expect(a.markDirty).toHaveBeenCalledTimes(1);
    const enregistre = serializeObjects(objetsHorsSession([o], null));
    expect(enregistre[0]?.toitFige).toBe(true);
    expect(enregistre[0]?.elevation).toBe(4.5);
  });

  it('sans session, rien ne change', () => {
    const objets = [maison(), voisin()];
    expect(objetsHorsSession(objets, null)).toBe(objets);
  });
});

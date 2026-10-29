import { describe, it, expect, vi } from 'vitest';
import { validerLaSession, type SessionToit } from '../../../../src/app/toits/modeToit.js';
import { creerHistorique, empiler } from '../../../../src/facade/modeToit/sessionToit.js';
import { reprendreLectureAuto } from '../../../../src/three/gestesToits.js';
import { lectureToits } from '../../../../src/core/lectureToits.js';
import type { CorpsToit, ObjetPlan } from '../../../../src/model/types.js';

// Valider une session du mode Toit (app/toits/modeToit.ts) : chaque geste fige le toit ; « Règles allumées » le rend a la lecture
// automatique, et la validation ne doit ni le refiger ni attendre la prochaine ouverture du projet pour le relire.

const corps: CorpsToit = { pts: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 8 }, { x: 0, y: 8 }], posFaitage: 4, faitage: 9, egouts: [6, 6], pignons: [], ecart: 0.1 };
const maison = (fige: boolean): ObjetPlan => ({
  key: 'm', name: 'Maison', type: 'polygon', fonction: 'batiment', bdtopo: { id: 'B1' }, pts: corps.pts, elevation: 6,
  batiment: { toit: { forme: 'deux-pans', hauteur: 3, angleFaitage: 0, source: 'lidar' }, corpsToit: [corps], toitLidarLu: 7, ...(fige ? { toitFige: true } : {}) },
}) as unknown as ObjetPlan;
const session = (o: ObjetPlan): SessionToit => ({ cle: o.key, hist: creerHistorique(o), facade: null, derniere: null, vue: 'libre', corpsIsole: null, selection: null, indice: false, vueAvant: null, isole: false, validee: false, silhouette: true });

describe('valider une session du mode Toit', () => {
  it('« Règles allumées » puis Valider : le toit reste rendu a la lecture, et la lecture repart tout de suite', () => {
    const o = maison(true), s = session(o), relire = vi.fn();
    const fin = lectureToits.surRelecture(relire);
    reprendreLectureAuto(o);
    empiler(s.hist, o);
    const a = { pushHistory: vi.fn(), markDirty: vi.fn() };
    expect(validerLaSession(a, o, s)).toBe(true);
    expect(o.batiment?.toitFige).toBeUndefined();
    expect(o.batiment?.corpsToit).toBeUndefined();
    expect(relire).toHaveBeenCalledTimes(1);
    expect(a.pushHistory).toHaveBeenCalledTimes(1);
    fin();
  });

  it('un geste fige le toit : Valider le garde fige, sans relecture', () => {
    const o = maison(false), s = session(o), relire = vi.fn();
    const fin = lectureToits.surRelecture(relire);
    o.batiment!.corpsToit = [{ ...corps, faitage: 9.5 }];
    o.batiment!.toitFige = true;
    empiler(s.hist, o);
    expect(validerLaSession({ pushHistory: vi.fn(), markDirty: vi.fn() }, o, s)).toBe(true);
    expect(o.batiment?.toitFige).toBe(true);
    expect(relire).not.toHaveBeenCalled();
    fin();
  });
});

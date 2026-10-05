// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Les confirmations acceptent d'emblee, les messages sont releves.
const toasts: string[] = [];
vi.mock('../../../../src/shell/dialogs.js', () => ({
  showToast: (m: string) => { toasts.push(m); },
  showConfirm: (_m: string, oui: () => void) => { oui(); }
}));

import { creerRegistre } from '../../../../src/app/commandes.js';
import { brancherObjets } from '../../../../src/app/ecouteurs/objets.js';
import { fauxAtelier, droits } from './faux.js';
import type { ObjetPlan } from '../../../../src/model/types.js';

// Les commandes d'objet (app/ecouteurs/objets.ts) : elles demandent toutes le droit d'ecrire, sauf
// l'annulation ; elles se grisent hors de propos ; reculer et replacer disent quand rien ne change.

const poly = (key: string, pts: [number, number][], plus: Partial<ObjetPlan> = {}) =>
  ({ key, name: key, type: 'polygon', pts: pts.map(([x, y]) => ({ x, y })), ...plus }) as unknown as ObjetPlan;
const cercle = (key: string, x: number, y: number) => ({ key, name: key, type: 'circle', center: { x, y }, r: 1 }) as unknown as ObjetPlan;

function monter(selection: string | null, ecrire = true, initiaux: ObjetPlan[] = []) {
  const a = fauxAtelier({ objects: [poly('parcelle', [[0, 0], [10, 0], [10, 10]]), poly('a', [[1, 1], [3, 1], [3, 3]]), poly('verrou', [[0, 0], [1, 0], [1, 1]], { locked: true }), cercle('c', 5, 5)], selectedKey: selection }, initiaux);
  const cmd = creerRegistre(droits(ecrire));
  brancherObjets(a, cmd);
  return { a, cmd };
}

beforeEach(() => { toasts.length = 0; });

describe('commandes d objet', () => {
  it('demandent le droit d ecrire, sauf l annulation', () => {
    const { a, cmd } = monter('a', false);
    expect(cmd.executer('objet.ajouter.polygone')).toBe(false);
    expect(cmd.executer('objet.supprimer')).toBe(false);
    expect(a.addNewObject).not.toHaveBeenCalled();
    expect(cmd.executer('objet.annuler')).toBe(true);
    expect(a.undo).toHaveBeenCalledTimes(1);
  });

  it('creent chaque forme par l atelier, le rectangle en mode rectangle', () => {
    const { a, cmd } = monter(null);
    cmd.executer('objet.ajouter.polygone'); cmd.executer('objet.ajouter.rectangle');
    expect(a.addNewObject).toHaveBeenNthCalledWith(1, false);
    expect(a.addNewObject).toHaveBeenNthCalledWith(2, true);
    for (const [id, m] of [['objet.ajouter.chemin', 'addNewPath'], ['objet.ajouter.cercle', 'addNewCircle'], ['objet.ajouter.parasol', 'addNewParasol'], ['objet.ajouter.pergola', 'addNewPergola'], ['objet.ajouter.carport', 'addNewCarport'], ['objet.ajouter.pointDeVue', 'addNewViewpoint']] as const) {
      cmd.executer(id);
      expect(a[m]).toHaveBeenCalledTimes(1);
    }
  });

  it('ne dupliquent ni ne suppriment la parcelle, ne suppriment pas un objet verrouille', () => {
    expect(monter('parcelle').cmd.etat('objet.dupliquer').utilisable).toBe(false);
    expect(monter('parcelle').cmd.etat('objet.supprimer').utilisable).toBe(false);
    expect(monter('verrou').cmd.etat('objet.supprimer').utilisable).toBe(false);
    expect(monter('verrou').cmd.etat('objet.dupliquer').utilisable).toBe(true);
    const { a, cmd } = monter('a');
    cmd.executer('objet.dupliquer'); cmd.executer('objet.supprimer');
    expect(a.duplicateSelectedObject).toHaveBeenCalledTimes(1);
    expect(a.deleteSelectedObject).toHaveBeenCalledTimes(1);
  });

  it('reculent l objet choisi, jamais la parcelle, et le disent quand rien ne bouge', () => {
    expect(monter(null).cmd.etat('objet.reculer').utilisable).toBe(false);
    const p = monter('parcelle');
    p.cmd.executer('objet.reculer');
    expect(p.a.pushHistory).not.toHaveBeenCalled();
    expect(toasts).toContain('La parcelle reste toujours au fond.');
    const r = monter('a');
    r.cmd.executer('objet.reculer');
    expect(r.a.pushHistory).toHaveBeenCalledTimes(1);
    expect(r.a.sendObjectBackward).toHaveBeenCalledWith(r.a.objByKey('a'));
    // L'atelier factice ne deplace rien : l'objet est « deja au fond ».
    expect(toasts.at(-1)).toMatch(/au fond de sa priorit/);
  });

  it('replacent un objet a sa place du chargement, sans changer sa forme', () => {
    const initA = poly('a', [[11, 11], [13, 11], [13, 13]]);
    const { a, cmd } = monter('a', true, [initA, cercle('c', 0, 0)]);
    cmd.executer('objet.positionInitiale');
    expect(a.pushHistory).toHaveBeenCalledTimes(1);
    expect(a.objByKey('a')!.type === 'polygon' && (a.objByKey('a') as unknown as { pts: { x: number; y: number }[] }).pts).toEqual([{ x: 11, y: 11 }, { x: 13, y: 11 }, { x: 13, y: 13 }]);
    a.etat.selectedKey = 'c';
    cmd.executer('objet.positionInitiale');
    expect((a.objByKey('c') as unknown as { center: { x: number; y: number } }).center).toEqual({ x: 0, y: 0 });
  });

  it('ne replacent pas un objet cree apres le chargement, et le disent', () => {
    const { a, cmd } = monter('a', true, []);
    cmd.executer('objet.positionInitiale');
    expect(a.pushHistory).not.toHaveBeenCalled();
    expect(toasts.at(-1)).toMatch(/cree apres le chargement/);
  });

  it('reinitialisent tout le plan, apres confirmation et en un pas annulable', () => {
    const initiaux = [poly('parcelle', [[0, 0], [1, 0], [1, 1]])];
    const { a, cmd } = monter(null, true, initiaux);
    cmd.executer('projet.reinitialiser');
    expect(a.pushHistory).toHaveBeenCalledTimes(1);
    expect(a.restoreState).toHaveBeenCalledWith({ objects: initiaux, measures: [] });
  });
});

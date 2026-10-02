// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';

const confirmations: string[] = [];
vi.mock('../../../../src/shell/dialogs.js', () => ({
  showToast: () => {}, showErrBanner: () => {},
  showConfirm: (m: string, oui: () => void) => { confirmations.push(m); oui(); }
}));

import { creerRegistre } from '../../../../src/app/commandes.js';
import { brancherDivers, type ContexteDivers } from '../../../../src/app/ecouteurs/divers.js';
import { fauxAtelier, droits } from './faux.js';
import type { Resultats } from '../../../../src/app/resultats.js';
import type { ObjetPlan, Mesure } from '../../../../src/model/types.js';

// Les commandes sans groupe (app/ecouteurs/divers.ts) : cadrage, cote et alignement, PLU,
// optimisation, cotes effacees, et le redimensionnement apaise.

function monter(opts: { selection?: string | null; parcelle?: boolean; pluEnCours?: boolean; mesures?: number; ecrire?: boolean } = {}) {
  const objets = [{ key: 'a', name: 'A' }, { key: 'b', name: 'B' }] as unknown as ObjetPlan[];
  const a = fauxAtelier({ objects: objets, selectedKey: opts.selection ?? null, measures: Array.from({ length: opts.mesures ?? 0 }, (_, i) => ({ id: 'm' + i })) as unknown as Mesure[] });
  const resultats = {
    parcelle: () => (opts.parcelle ? objets[0] : undefined), pluEnCours: () => !!opts.pluEnCours,
    interrogerPlu: vi.fn(async () => {}), basculerOptimisation: vi.fn(), effacerCotes: vi.fn()
  } as unknown as Resultats;
  const ctx: ContexteDivers = { resultats, redimensionnerLePlan: vi.fn(), activerOnglet: vi.fn(), rafraichirInspecteur: vi.fn(), startPick: vi.fn() };
  const cmd = creerRegistre(droits(opts.ecrire ?? true));
  brancherDivers(a, ctx, cmd);
  return { a, ctx, cmd, resultats };
}

describe('commandes diverses', () => {
  it('cadrent sur l objet selectionne, sinon sans objet', () => {
    const m = monter({ selection: 'b' });
    m.cmd.executer('vue.ajuster');
    expect(m.a.fitToObject).toHaveBeenCalledWith(m.a.objByKey('b'));
    const n = monter();
    n.cmd.executer('vue.ajuster');
    expect(n.a.fitToObject).toHaveBeenCalledWith(null);
  });

  it('ouvrent une cote sur l onglet des cotes, et un alignement seulement avec une selection', () => {
    const m = monter({ selection: 'a' });
    m.cmd.executer('mesure.nouvelle');
    expect(m.ctx.activerOnglet).toHaveBeenCalledWith('mesure');
    expect(m.ctx.startPick).toHaveBeenCalledWith('ref', false);
    m.cmd.executer('objet.aligner');
    expect(m.ctx.startPick).toHaveBeenLastCalledWith('ref', false, 'align');
    expect(monter().cmd.etat('objet.aligner').utilisable).toBe(false);
  });

  it('interrogent le PLU seulement avec une parcelle, une fois a la fois, avec le droit d ecrire', () => {
    expect(monter().cmd.etat('plu.interroger').utilisable).toBe(false);
    expect(monter({ parcelle: true, pluEnCours: true }).cmd.etat('plu.interroger').utilisable).toBe(false);
    expect(monter({ parcelle: true, ecrire: false }).cmd.etat('plu.interroger').utilisable).toBe(false);
    const m = monter({ parcelle: true });
    expect(m.cmd.executer('plu.interroger')).toBe(true);
    expect(m.resultats.interrogerPlu).toHaveBeenCalledTimes(1);
  });

  it('basculent l optimisation et rafraichissent l inspecteur qui la montre', () => {
    const m = monter();
    m.cmd.executer('terrasse.optimisation');
    expect(m.resultats.basculerOptimisation).toHaveBeenCalledTimes(1);
    expect(m.ctx.rafraichirInspecteur).toHaveBeenCalledTimes(1);
  });

  it('effacent les cotes, en demandant confirmation s il y en a', () => {
    confirmations.length = 0;
    const vide = monter();
    vide.cmd.executer('mesure.effacer');
    expect(confirmations).toHaveLength(0);
    expect(vide.resultats.effacerCotes).toHaveBeenCalledTimes(1);
    const pleine = monter({ mesures: 3 });
    pleine.cmd.executer('mesure.effacer');
    expect(confirmations).toHaveLength(1);
    expect(pleine.resultats.effacerCotes).toHaveBeenCalledTimes(1);
    expect(monter({ mesures: 3, ecrire: false }).cmd.executer('mesure.effacer')).toBe(false);
  });

  it('recalculent les cotes en redessinant', () => {
    const m = monter();
    m.cmd.executer('mesure.recalculer');
    expect(m.a.render).toHaveBeenCalledTimes(1);
  });

  it('redimensionnent le plan une seule fois apres une rafale de resize', () => {
    vi.useFakeTimers();
    const m = monter();
    for (let i = 0; i < 10; i++) window.dispatchEvent(new Event('resize'));
    expect(m.ctx.redimensionnerLePlan).not.toHaveBeenCalled();
    vi.advanceTimersByTime(200);
    expect(m.ctx.redimensionnerLePlan).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
});

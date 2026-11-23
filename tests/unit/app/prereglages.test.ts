import { describe, it, expect, vi } from 'vitest';
import { creerRegistre } from '../../../src/app/commandes.js';
import { brancherPrereglages, type DependancesPrereglages } from '../../../src/app/prereglages.js';
import { droits } from './ecouteurs/faux.js';
import { ensureConstruction } from '../../../src/engine/construction.js';
import type { ContexteChamps } from '../../../src/ui/champs/types.js';
import type { EtatApp } from '../../../src/core/state.js';
import type { ObjetPlan } from '../../../src/model/types.js';

// Les departs d'une terrasse en commandes du registre (decision B5) : un geste annulable d'un seul Ctrl+Z, qui marque le projet,
// refuse sans droit d'ecrire, en lecture seule, et sans terrasse selectionnee.

function monter(selection: string | null, ecrire = true, lectureSeule = false) {
  const t = { key: 't', name: 'T', fonction: 'terrasse', type: 'polygon', pts: [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 4 }, { x: 0, y: 4 }], construction: { typePose: 'vis-fondation' } } as unknown as ObjetPlan;
  ensureConstruction(t);
  const arbre = { key: 'a', name: 'A', fonction: 'arbre', type: 'circle', center: { x: 1, y: 1 }, r: 1 } as unknown as ObjetPlan;
  const etat = { objects: [t, arbre], selectedKey: selection, lectureSeule, highlight: {} } as unknown as EtatApp;
  const empiles: number[] = [];
  const d: DependancesPrereglages = {
    contexte: (obj) => ({ etat, obj, objets: etat.objects, parcelle: undefined, construction: () => ensureConstruction(obj) }) as unknown as ContexteChamps,
    preparerHistorique: vi.fn(() => () => { empiles.push(1); }),
    markDirty: vi.fn(), apres: vi.fn(), toast: vi.fn()
  };
  const cmd = creerRegistre(droits(ecrire));
  brancherPrereglages(cmd, etat, d);
  return { t, cmd, d, empiles };
}

describe('les commandes des departs de terrasse', () => {
  it('posent le depart en un seul pas d annulation, marquent le projet et recalculent la terrasse', () => {
    const { t, cmd, d, empiles } = monter('t');
    expect(cmd.executer('terrasse.prereglage.pinPlots')).toBe(true);
    expect(t.construction!.typePose).toBe('plots');
    expect(empiles).toEqual([1]);
    expect(d.markDirty).toHaveBeenCalledWith(t);
    expect(d.apres).toHaveBeenCalledTimes(1);
  });

  it('ne refont rien quand le depart est deja en place : pas de pas d annulation vide', () => {
    const { cmd, empiles, d } = monter('t');
    cmd.executer('terrasse.prereglage.pinPlots');
    cmd.executer('terrasse.prereglage.pinPlots');
    expect(empiles).toEqual([1]);
    expect(d.toast).toHaveBeenLastCalledWith('« Pin sur plots » est déjà en place.');
  });

  it('se grisent sans terrasse selectionnee, en lecture seule, et sans droit d ecrire', () => {
    expect(monter('a').cmd.etat('terrasse.prereglage.pinVis').utilisable).toBe(false);
    expect(monter(null).cmd.etat('terrasse.prereglage.pinVis').utilisable).toBe(false);
    const lecture = monter('t', true, true);
    expect(lecture.cmd.executer('terrasse.prereglage.exotiquePlots')).toBe(false);
    expect(lecture.t.construction!.typePose).toBe('vis-fondation');
    const sansDroit = monter('t', false);
    expect(sansDroit.cmd.etat('terrasse.prereglage.exotiquePlots')).toMatchObject({ utilisable: false, raison: 'permission' });
  });
});

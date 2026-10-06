// Un atelier et des droits factices pour les tests des ecouteurs (src/app/ecouteurs/) : chaque
// methode est un espion, l'etat est celui qu'on donne.

import { vi } from 'vitest';
import type { Atelier } from '../../../../src/app/atelier.js';
import type { Droits } from '../../../../src/app/commandes.js';
import type { EtatApp } from '../../../../src/core/state.js';
import type { ObjetPlan } from '../../../../src/model/types.js';

export const droits = (ecrire = true): Droits => ({
  branchee: () => true, aCapacite: () => true, aPermission: () => ecrire, reste: () => null
});

export function fauxAtelier(etat: Partial<EtatApp>, initiaux: ObjetPlan[] = []): Atelier & { etat: EtatApp } {
  const e = { objects: [], measures: [], selectedKey: null, ...etat } as unknown as EtatApp;
  return {
    etat: e,
    objByKey: (k) => e.objects.find((o) => o.key === k),
    initialState: () => initiaux,
    initialMeasures: () => [],
    pushHistory: vi.fn(), markDirty: vi.fn(), undo: vi.fn(), restoreState: vi.fn(),
    render: vi.fn(), rebuildSelector: vi.fn(), rebuildHandles: vi.fn(), reapplyStackingOrder: vi.fn(), fitToObject: vi.fn(),
    addNewObject: vi.fn(), addNewPath: vi.fn(), addNewCircle: vi.fn(), addNewParasol: vi.fn(), addNewPergola: vi.fn(), addNewCarport: vi.fn(), addNewPiscine: vi.fn(), addNewViewpoint: vi.fn(), addTerrassePiscine: vi.fn(), addTrouTerrasse: vi.fn(), selectObject: vi.fn(),
    duplicateSelectedObject: vi.fn(), deleteSelectedObject: vi.fn(), sendObjectBackward: vi.fn()
  };
}

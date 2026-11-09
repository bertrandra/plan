// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';

vi.mock('../../../src/shell/dialogs.js', () => ({ showToast: () => {}, showErrBanner: () => {}, showConfirm: () => {} }));
vi.mock('../../../src/render/ortho.js', () => ({ ortho: { tuiles: [], tuilesLarges: [], couverture: null }, restaurerOrthoDuProjet: () => {} }));

import { appliquerProjetImporte, type ContexteImportProjet } from '../../../src/io/projet.js';
import { vue3d } from '../../../src/three/etat3d.js';
import type { EtatApp } from '../../../src/core/state.js';
import type { ObjetPlan } from '../../../src/model/types.js';

// Ouvrir un projet (fichier ou cadastre) avec la Vue 3D ouverte la rebatit une seule fois, a la fin, sur le lieu, le soleil et
// l'affichage restitues : ni la restauration (sansSuite), ni la premiere restitution de l'affichage (avant le cadrage) ne la refont.
// Audit des PR #621 a #641 : la scene etait batie deux fois, trois pour un projet venu du cadastre.

const carre = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }];

function monter(cadastre: boolean) {
  const etat = { objects: [] as ObjetPlan[], measures: [], selectedKey: null } as unknown as EtatApp;
  const parcelle = { key: 'parcelle', type: 'polygon', name: 'Parcelle', pts: carre, ...(cadastre ? { cadastre: { idu: 'X' } } : {}) };
  const ctx = {
    etat, pushHistory: vi.fn(), rebuildSelector: vi.fn(), fitToObject: vi.fn(), cadrerTerrains: vi.fn(), syncLieuTitre: vi.fn(),
    markDirty: vi.fn(), render: vi.fn(), toScreen: (p: { x: number; y: number }) => p, orthoGroup: () => null,
    lieuActuel: () => ({ latitude: 48.9, longitude: 2.15 }),
    trouverParcelleCloture: () => etat.objects.find((o) => o.key === 'parcelle'),
    buildThreeScene: vi.fn(),
    restoreState: vi.fn((s: { objects: unknown[] }) => { etat.objects = s.objects as ObjetPlan[]; })
  } as unknown as ContexteImportProjet & { buildThreeScene: ReturnType<typeof vi.fn>; restoreState: ReturnType<typeof vi.fn> };
  appliquerProjetImporte({ meta: {}, objets: [parcelle], mesures: [], ignores: 0 } as never, true, etat, ctx);
  return ctx;
}

afterEach(() => { (vue3d as { scene: unknown }).scene = null; });

describe('ouvrir un projet, Vue 3D ouverte', () => {
  it.each([[false, 'un fichier'], [true, 'le cadastre']])('rebatit la scene une seule fois (%s : %s)', (cadastre) => {
    (vue3d as { scene: unknown }).scene = {};
    const ctx = monter(cadastre);
    expect(ctx.restoreState).toHaveBeenCalledWith(expect.anything(), { sansSuite: true });
    expect(ctx.buildThreeScene).toHaveBeenCalledTimes(1);
  });

  it('ne batit rien quand elle est fermee', () => {
    const ctx = monter(true);
    expect(ctx.buildThreeScene).not.toHaveBeenCalled();
  });
});

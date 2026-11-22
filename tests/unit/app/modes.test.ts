// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { creerModes, type ContexteModes } from '../../../src/app/modes.js';

// Le pilotage des vues (app/modes.ts) quand la 3D se charge a la demande (AD-10).
describe('les vues', () => {
  function monter() {
    for (const id of ['zoneAtelier', 'zoneResultats']) { const d = document.createElement('div'); d.id = id; document.body.appendChild(d); }
    let charge: (() => void) | null = null;
    const ctx: ContexteModes = {
      terrasseCourante: () => undefined, ensureConstruction: vi.fn(), render: vi.fn(), rendrePanneauxTerrasse: vi.fn(),
      ensureThreeLoaded: (cb) => { charge = cb; }, buildThreeScene: vi.fn(), disposeThreeScene: vi.fn(), libererTexturesPartagees: vi.fn(),
      preparerVisionneuse: vi.fn(), quitterPleinPageVisionneuse: vi.fn(), disposeGlbViewerScene: vi.fn(), signalerVue: vi.fn(),
      rendreMaintenant: (f) => f()
    };
    return { ctx, modes: creerModes(ctx), finirLeChargement: () => charge?.() };
  }

  it('construit la scene une fois la 3D chargee', () => {
    const { ctx, modes, finirLeChargement } = monter();
    modes.goVue3D();
    expect(ctx.buildThreeScene).not.toHaveBeenCalled();
    finirLeChargement();
    expect(ctx.buildThreeScene).toHaveBeenCalledWith(null);
  });

  it('previent avant d’entrer en Vue 3D, une fois par entree : la selection d’accueil y est lachee (core/selectionAccueil.ts)', () => {
    const { ctx, modes } = monter();
    const avant = vi.fn(() => { expect(modes.vue).toBe('plan'); });
    ctx.avantVue3d = avant;
    modes.goVue3D();
    modes.goVue3D(); // la scene se refait (un reglage), on n'entre pas
    expect(avant).toHaveBeenCalledTimes(1);
    modes.allerAuPlan();
    modes.goVue3D();
    expect(avant).toHaveBeenCalledTimes(2);
  });

  it('ne construit rien si l’on est revenu au plan pendant le chargement', () => {
    const { ctx, modes, finirLeChargement } = monter();
    modes.goVue3D();
    modes.allerAuPlan();
    finirLeChargement();
    expect(ctx.buildThreeScene).not.toHaveBeenCalled();
    expect(ctx.libererTexturesPartagees).toHaveBeenCalled();
    expect(modes.vue).toBe('plan');
  });
});

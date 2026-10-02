// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';

const journal = { toasts: [] as string[], bannieres: [] as string[], blobs: [] as string[] };
vi.mock('../../../../src/shell/dialogs.js', () => ({
  showToast: (m: string) => { journal.toasts.push(m); },
  showErrBanner: (m: string) => { journal.bannieres.push(m); }
}));
vi.mock('../../../../src/shell/download.js', () => ({ telechargerBlob: (nom: string) => { journal.blobs.push(nom); } }));

import { creerRegistre } from '../../../../src/app/commandes.js';
import { brancherVue3d, type ContexteVue3d } from '../../../../src/app/ecouteurs/vue3d.js';
import { brancherVisionneuse, type ContexteVisionneuse } from '../../../../src/app/ecouteurs/visionneuse.js';
import { vue3d, glb, affichage3d } from '../../../../src/three/etat3d.js';
import { fauxAtelier, droits } from './faux.js';
import type { ObjetPlan } from '../../../../src/model/types.js';

// La Vue 3D et la visionneuse (app/ecouteurs/vue3d.ts, visionneuse.ts) : la camera, les captures, le
// plein ecran, et les reglages qui reconstruisent la scene.

const terrasse = { key: 't', name: 'Terrasse sud', type: 'polygon', fonction: 'terrasse', pts: [] } as unknown as ObjetPlan;

/** Une scene 3D minimale : ce que les commandes lisent de la camera et du rendu. */
function fausseScene() {
  return {
    cen: { x: 10, y: 20 },
    camera: { position: { x: 1, y: 1.6, z: -2 } },
    controls: { target: { x: 4, y: 0, z: 2 }, update: vi.fn() },
    renderer: { render: vi.fn(), domElement: { toBlob: (f: (b: Blob | null) => void) => f(new Blob(['png'])) } },
    scene: {}
  };
}

function monter(ecrire = true) {
  const a = fauxAtelier({ objects: [terrasse], terrasseSelectedKey: 't' } as never);
  let plein = false;
  const ctx: ContexteVue3d = {
    zoom3D: vi.fn(), setMode3D: vi.fn(), hauteurDesYeux: vi.fn(), buildThreeScene: vi.fn(), createObjectDOM: vi.fn(),
    setVue3dPleinePage: vi.fn((v: boolean) => { plein = v; }), setGlbViewerPleinePage: vi.fn(),
    vue3dPleinePage: () => plein, glbViewerPleinePage: () => false, resizeThreeScene: vi.fn(), resizeGlbViewerScene: vi.fn()
  };
  const cmd = creerRegistre(droits(ecrire));
  const reglages = brancherVue3d(a, ctx, cmd);
  return { a, ctx, cmd, reglages };
}

beforeEach(() => {
  for (const l of Object.values(journal)) l.length = 0;
  vue3d.scene = null;
});

describe('Vue 3D', () => {
  it('commande la camera par son contexte', () => {
    const { ctx, cmd } = monter();
    cmd.executer('3d.zoomAvant'); cmd.executer('3d.zoomArriere');
    expect(ctx.zoom3D).toHaveBeenNthCalledWith(1, 0.8);
    expect(ctx.zoom3D).toHaveBeenNthCalledWith(2, 1.25);
    cmd.executer('3d.modeOrbite'); cmd.executer('3d.modeDeplacement'); cmd.executer('3d.modeZoom');
    expect((ctx.setMode3D as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0])).toEqual(['orbit', 'pan', 'zoom']);
    cmd.executer('3d.hauteurDesYeux');
    expect(ctx.hauteurDesYeux).toHaveBeenCalledTimes(1);
  });

  it('capture la vue en PNG, nommee d apres la terrasse ; sans scene, le dit', () => {
    const { cmd } = monter();
    cmd.executer('3d.enregistrerPng');
    expect(journal.bannieres).toEqual(['Vue 3D pas encore chargee.']);
    vue3d.scene = fausseScene() as never;
    cmd.executer('3d.enregistrerPng');
    expect(journal.blobs).toHaveLength(1);
    expect(journal.blobs[0]).toMatch(/^vue3d_.*\.png$/);
  });

  it('enregistre la vue comme point de vue, en un pas annulable et avec le droit d ecrire', () => {
    const { a, cmd } = monter();
    cmd.executer('3d.enregistrerPointDeVue');
    expect(a.pushHistory).not.toHaveBeenCalled();
    vue3d.scene = fausseScene() as never;
    cmd.executer('3d.enregistrerPointDeVue');
    expect(a.pushHistory).toHaveBeenCalledTimes(1);
    const pdv = a.etat.objects.at(-1) as unknown as { fonction: string; name: string };
    expect(pdv.fonction).toBe('camera');
    expect(journal.toasts[0]).toContain(pdv.name);
    const lecteur = monter(false);
    expect(lecteur.cmd.executer('3d.enregistrerPointDeVue')).toBe(false);
  });

  it('bascule le plein ecran, et Echap en sort', () => {
    const { ctx, cmd } = monter();
    cmd.executer('3d.pleinePage');
    expect(ctx.setVue3dPleinePage).toHaveBeenLastCalledWith(true);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(ctx.setVue3dPleinePage).toHaveBeenLastCalledWith(false);
  });

  it('reconstruit la scene quand un reglage change, seulement si elle est ouverte', () => {
    const { ctx, reglages } = monter();
    reglages.basculerOmbres(false);
    expect(vue3d.ombres).toBe(false);
    expect(ctx.buildThreeScene).not.toHaveBeenCalled();
    vue3d.scene = fausseScene() as never;
    reglages.basculerTextures(false);
    expect(vue3d.textures).toBe(false);
    expect(ctx.buildThreeScene).toHaveBeenCalledWith(terrasse);
    reglages.basculerOmbres(true); reglages.basculerTextures(true);
  });

  it('range le filaire dans la construction de la terrasse', () => {
    const { reglages } = monter();
    expect(reglages.filaire()).toBe(false);
    reglages.basculerFilaire(true);
    expect(reglages.filaire()).toBe(true);
  });
});

describe('visionneuse', () => {
  function monterVis() {
    const a = fauxAtelier({ objects: [terrasse], terrasseSelectedKey: 't' } as never);
    const ctx: ContexteVisionneuse = { genererGlb: vi.fn(), rafraichir: vi.fn(), appliquerLumiere: vi.fn(), hauteurFinieMm: () => 300, hauteurYeuxM: 1.6 };
    const cmd = creerRegistre(droits(true));
    return { ctx, cmd, reglages: brancherVisionneuse(a, ctx, cmd) };
  }

  it('genere le modele sans le telecharger, une production a la fois', () => {
    const { ctx, cmd } = monterVis();
    cmd.executer('visionneuse.generer');
    expect(ctx.genererGlb).toHaveBeenCalledWith(false);
    affichage3d.generation = true as never;
    expect(cmd.etat('visionneuse.regenerer').utilisable).toBe(false);
    affichage3d.generation = false as never;
  });

  it('place la camera a hauteur d yeux sur la terrasse', () => {
    const { cmd } = monterVis();
    const s = fausseScene();
    glb.scene = s as never;
    cmd.executer('visionneuse.hauteurDesYeux');
    expect(s.camera.position.y).toBeCloseTo(0.3 + 1.6);
    expect(s.renderer.render).toHaveBeenCalledTimes(1);
    glb.scene = null;
  });

  it('rafraichit la visionneuse ouverte quand un reglage change', () => {
    const { ctx, reglages } = monterVis();
    glb.ouvert = false;
    reglages.basculerOmbres(false);
    expect(ctx.rafraichir).not.toHaveBeenCalled();
    glb.ouvert = true;
    reglages.basculerFilaire(true);
    expect(glb.filaire).toBe(true);
    expect(ctx.rafraichir).toHaveBeenCalledTimes(1);
    glb.ouvert = false; glb.filaire = false; glb.ombres = true;
  });
});

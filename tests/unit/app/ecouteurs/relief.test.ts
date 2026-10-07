// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';

const toasts: string[] = [];
vi.mock('../../../../src/shell/dialogs.js', () => ({
  showToast: (m: string) => { toasts.push(m); }, showErrBanner: () => {}, showConfirm: () => {}
}));

import { creerRegistre } from '../../../../src/app/commandes.js';
import { brancherRelief, type ContexteRelief } from '../../../../src/app/ecouteurs/relief.js';
import { lectureRelief } from '../../../../src/core/lectureRelief.js';
import { vue3d } from '../../../../src/three/etat3d.js';
import { fauxAtelier, droits } from './faux.js';
import type { ObjetPlan, PtBrut, Relief } from '../../../../src/model/types.js';

// Les commandes du relief (app/ecouteurs/relief.ts, MD/spec-relief.md §4, §8) : lire, actualiser,
// supprimer. Une lecture est une modification annulable, empilee seulement au succes ; une erreur
// n'ecrit rien ; les preferences d'affichage survivent a une actualisation.

function grille(zRef = 100): Relief {
  return { source: 'rge-alti', couche: 'c', dateLecture: '2026-10-06', origine: 'test', precision: 'Emq < 30 cm', systemeAltimetrique: 'NGF-IGN69', pas: 1, x0: 0.5, y0: 9.5, nx: 2, ny: 2, z: [100, 100, 100, 100], zRef };
}

function monter(opts: { calee?: boolean; relief?: Relief | null; ecrire?: boolean; lire?: ContexteRelief['lire']; scene?: boolean } = {}) {
  const parcelle = { key: 'parcelle', name: 'Parcelle', fonction: 'terrain', type: 'polygon', pts: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 8 }, { x: 0, y: 8 }], ...(opts.relief ? { relief: opts.relief } : {}) } as unknown as ObjetPlan & { pts: PtBrut[] };
  const terrasse = { key: 't', name: 'T', fonction: 'terrasse', type: 'polygon', pts: [{ x: 2, y: 2 }, { x: 4, y: 2 }, { x: 4, y: 4 }, { x: 2, y: 4 }] } as unknown as ObjetPlan;
  const a = fauxAtelier({ objects: [parcelle, terrasse], terrasseSelectedKey: 't' });
  const ctx: ContexteRelief = {
    reference: () => (opts.calee ?? true) ? { lat: 48.8, lon: 2.3, x: 0, y: 0, exact: true } : null,
    buildThreeScene: vi.fn(), rafraichir: vi.fn(),
    lire: opts.lire ?? vi.fn(async () => grille(101))
  };
  const cmd = creerRegistre(droits(opts.ecrire ?? true));
  brancherRelief(a, ctx, cmd);
  (vue3d as { scene: unknown }).scene = opts.scene ? {} : null;
  toasts.length = 0;
  return { a, ctx, cmd, parcelle };
}

/** Attend que la lecture lancee par la commande soit finie. */
const finie = async () => { while (lectureRelief.enCours()) await new Promise(r => setTimeout(r, 0)); await new Promise(r => setTimeout(r, 0)); };

describe('relief.lire', () => {
  it('ne s active qu avec une parcelle calee par le cadastre, sans relief, avec le droit d ecrire', () => {
    expect(monter().cmd.etat('relief.lire').utilisable).toBe(true);
    expect(monter({ calee: false }).cmd.etat('relief.lire').utilisable).toBe(false);
    expect(monter({ relief: grille() }).cmd.etat('relief.lire').utilisable).toBe(false);
    expect(monter({ ecrire: false }).cmd.etat('relief.lire')).toMatchObject({ utilisable: false, raison: 'permission' });
  });

  it('disparait sans la capacite plan.relief', () => {
    const cmd = creerRegistre({ ...droits(), aCapacite: (c) => c !== 'plan.relief' });
    brancherRelief(fauxAtelier({ objects: [] }), { reference: () => null, buildThreeScene: vi.fn(), rafraichir: vi.fn() }, cmd);
    expect(cmd.effacee('relief.lire')).toBe(true);
    expect(cmd.effacee('relief.actualiser')).toBe(true);
    expect(cmd.effacee('relief.supprimer')).toBe(true);
  });

  it('lit la grille, l ecrit d un bloc sur la parcelle, annulable, et le dit', async () => {
    const m = monter({ scene: true });
    expect(m.cmd.executer('relief.lire')).toBe(true);
    // Pendant la lecture : en cours, la commande grisee, les zones prevenues.
    expect(lectureRelief.enCours()).toBe(true);
    expect(m.cmd.etat('relief.lire').utilisable).toBe(false);
    expect(m.ctx.rafraichir).toHaveBeenCalled();
    await finie();
    expect(m.ctx.lire).toHaveBeenCalledWith(expect.objectContaining({ parcelle: m.parcelle.pts, ref: expect.objectContaining({ exact: true }), cleTerrasse: 't' }));
    expect(m.parcelle.relief?.zRef).toBe(101);
    expect(m.a.pushHistory).toHaveBeenCalledTimes(1);
    expect(m.a.markDirty).toHaveBeenCalled();
    expect(m.a.render).toHaveBeenCalled();
    expect(m.ctx.buildThreeScene).toHaveBeenCalledWith(m.a.objByKey('t'));
    expect(toasts[0]).toMatch(/^Relief lu : RGE ALTI, 1 m · lu en 2026 · Emq < 30 cm$/);
    expect(lectureRelief.enCours()).toBe(false);
    expect(m.cmd.etat('relief.lire').utilisable).toBe(false);
    expect(m.cmd.etat('relief.actualiser').utilisable).toBe(true);
  });

  it('n ecrit rien et n empile rien quand l IGN ne repond pas', async () => {
    const m = monter({ lire: vi.fn(async () => { throw new Error('Pas de relief IGN pour cette parcelle.'); }) });
    m.cmd.executer('relief.lire');
    await finie();
    expect(m.parcelle.relief).toBeUndefined();
    expect(m.a.pushHistory).not.toHaveBeenCalled();
    expect(m.a.markDirty).not.toHaveBeenCalled();
    expect(toasts).toEqual(['Pas de relief IGN pour cette parcelle.']);
    expect(lectureRelief.enCours()).toBe(false);
    expect(m.cmd.etat('relief.lire').utilisable).toBe(true);
  });
});

describe('relief.actualiser et relief.supprimer', () => {
  it('actualiser remplace la grille entiere, zRef compris, et garde les preferences d affichage', async () => {
    const ancien = { ...grille(100), affichage: { courbes: false, equidistance: 0.5 } };
    const m = monter({ relief: ancien });
    expect(m.cmd.etat('relief.actualiser').utilisable).toBe(true);
    m.cmd.executer('relief.actualiser');
    await finie();
    expect(m.parcelle.relief?.zRef).toBe(101);
    expect(m.parcelle.relief?.affichage).toEqual({ courbes: false, equidistance: 0.5 });
    expect(m.a.pushHistory).toHaveBeenCalledTimes(1);
    expect(toasts[0]).toMatch(/^Relief actualisé : /);
  });

  it('supprimer retire le relief, annulable, et reconstruit la 3D ouverte', () => {
    const m = monter({ relief: grille(), scene: true });
    expect(m.cmd.etat('relief.supprimer').utilisable).toBe(true);
    expect(m.cmd.executer('relief.supprimer')).toBe(true);
    expect('relief' in m.parcelle).toBe(false);
    expect(m.a.pushHistory).toHaveBeenCalledTimes(1);
    expect(m.a.markDirty).toHaveBeenCalled();
    expect(m.a.render).toHaveBeenCalled();
    expect(m.ctx.buildThreeScene).toHaveBeenCalledTimes(1);
    expect(m.cmd.etat('relief.supprimer').utilisable).toBe(false);
    expect(m.cmd.etat('relief.lire').utilisable).toBe(true);
  });

  it('sont grises sans relief, et refuses sans le droit d ecrire', () => {
    expect(monter().cmd.etat('relief.actualiser').utilisable).toBe(false);
    expect(monter().cmd.etat('relief.supprimer').utilisable).toBe(false);
    expect(monter({ relief: grille(), ecrire: false }).cmd.etat('relief.supprimer')).toMatchObject({ raison: 'permission' });
  });
});

describe('affichage.relief', () => {
  it('montre ou cache ensemble les courbes de niveau et le sol 3D, sans annulation ni projet modifie', () => {
    const m = monter({ relief: grille(), scene: true });
    // Par defaut, les deux sont montres : un clic cache les deux.
    m.cmd.executer('affichage.relief');
    expect(m.parcelle.relief!.affichage).toMatchObject({ courbes: false, sol3d: false });
    expect(m.a.pushHistory).not.toHaveBeenCalled();
    expect(m.a.markDirty).not.toHaveBeenCalled();
    expect(m.a.render).toHaveBeenCalled();
    expect(m.ctx.buildThreeScene).toHaveBeenCalled();
    // Un seul des deux montre : le clic montre les deux, et garde l'equidistance reglee.
    m.parcelle.relief!.affichage = { courbes: true, sol3d: false, equidistance: 0.5 };
    m.cmd.executer('affichage.relief');
    expect(m.parcelle.relief!.affichage).toEqual({ courbes: true, sol3d: true, equidistance: 0.5 });
  });

  it('se grise sans relief ; reste permise en lecture seule et sans la capacite plan.relief', () => {
    expect(monter().cmd.etat('affichage.relief').utilisable).toBe(false);
    expect(monter({ relief: grille(), ecrire: false }).cmd.etat('affichage.relief').utilisable).toBe(true);
    const cmd = creerRegistre({ ...droits(), aCapacite: (c) => c !== 'plan.relief' });
    brancherRelief(fauxAtelier({ objects: [] }), { reference: () => null, buildThreeScene: vi.fn(), rafraichir: vi.fn() }, cmd);
    expect(cmd.effacee('affichage.relief')).toBe(false);
  });
});

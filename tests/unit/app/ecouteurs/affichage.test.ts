// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';

// Le fond orthophoto telecharge des tuiles : on le remplace par son etat et des espions.
const orthoEspions = vi.hoisted(() => ({
  ortho: { actif: false, opacite: 0.85, parcelleOpacite: 0.15 },
  basculer: vi.fn(async () => {}), placer: vi.fn(), enregistrer: vi.fn()
}));
vi.mock('../../../../src/render/ortho.js', () => ({
  ortho: orthoEspions.ortho,
  basculerOrthophoto: orthoEspions.basculer, placerOrthophoto: orthoEspions.placer, enregistrerConfigOrtho: orthoEspions.enregistrer
}));

import { creerRegistre, type Droits } from '../../../../src/app/commandes.js';
import { brancherAffichage, type ContexteAffichage } from '../../../../src/app/ecouteurs/affichage.js';
import { brancherBoutonsDeVue } from '../../../../src/app/ecouteurs/modes.js';
import { fauxAtelier } from './faux.js';
import { vue3d } from '../../../../src/three/etat3d.js';
import type { ObjetPlan } from '../../../../src/model/types.js';

// L'affichage (app/ecouteurs/affichage.ts) et les boutons de vue (modes.ts) : des bascules qui ne
// touchent pas aux objets, dont certaines s'enregistrent avec le projet.

const tout: Droits = { branchee: () => true, aCapacite: () => true, aPermission: () => true, reste: () => null };
const sansOrtho: Droits = { ...tout, aCapacite: (c) => c !== 'plan.ortho' && c !== 'plan.3d' };

function monter(droits = tout, selection: string | null = null) {
  const objets = [{ key: 'parcelle' }, { key: 'v1', voisinage: true }, { key: 'a' }] as unknown as ObjetPlan[];
  const a = fauxAtelier({ objects: objets, selectedKey: selection, showNorth: true, voisinageVisible: true, grilleVisible: true, highlight: { type: 'vertex', index: 1 } } as never);
  let replier = false;
  const sectionsRepliees = { lire: () => replier, definir: vi.fn((v: boolean) => { replier = v; }) };
  const ctx: ContexteAffichage = { enregistrerAffichage: vi.fn(), ctxOrtho: () => ({}) as never, buildThreeScene: vi.fn(), sectionsRepliees };
  const cmd = creerRegistre(droits);
  brancherAffichage(a, ctx, cmd);
  return { a, ctx, cmd };
}
const curseur = (v: number) => Object.assign(document.createElement('input'), { value: String(v) });

describe('affichage', () => {
  it('replie les sections de l inspecteur : preference du navigateur, ni projet ni rendu', () => {
    localStorage.removeItem('plan.inspecteur.sectionsRepliees');
    const { a, ctx, cmd } = monter();
    // Au branchement, la preference memorisee (aucune : deplie) est posee dans le magasin.
    expect(ctx.sectionsRepliees.definir).toHaveBeenLastCalledWith(false);
    cmd.executer('affichage.sectionsRepliees');
    expect(ctx.sectionsRepliees.lire()).toBe(true);
    expect(localStorage.getItem('plan.inspecteur.sectionsRepliees')).toBe('1');
    expect(ctx.enregistrerAffichage).not.toHaveBeenCalled();
    expect(a.render).not.toHaveBeenCalled();
    // Un autre atelier (un autre projet, une autre session) la retrouve.
    expect(monter().ctx.sectionsRepliees.definir).toHaveBeenLastCalledWith(true);
    cmd.executer('affichage.sectionsRepliees');
    expect(localStorage.getItem('plan.inspecteur.sectionsRepliees')).toBe('0');
    // Permise en lecture seule : elle ne demande aucune permission d'ecrire.
    expect(monter({ ...tout, aPermission: () => false }).cmd.etat('affichage.sectionsRepliees').utilisable).toBe(true);
  });

  it('bascule la fleche du Nord, sans l enregistrer avec le projet', () => {
    const { a, ctx, cmd } = monter();
    cmd.executer('affichage.nord');
    expect(a.etat.showNorth).toBe(false);
    expect(ctx.enregistrerAffichage).not.toHaveBeenCalled();
    expect(a.render).toHaveBeenCalledTimes(1);
  });

  it('bascule la grille et l enregistre avec le projet', () => {
    const { a, ctx, cmd } = monter();
    cmd.executer('affichage.grille');
    expect(a.etat.grilleVisible).toBe(false);
    expect(ctx.enregistrerAffichage).toHaveBeenCalledTimes(1);
  });

  it('masque le voisinage, et deplace la selection qui s y trouvait vers la parcelle', () => {
    const { a, ctx, cmd } = monter(tout, 'v1');
    cmd.executer('affichage.voisinage');
    expect(a.etat.voisinageVisible).toBe(false);
    expect(a.etat.selectedKey).toBe('parcelle');
    expect(a.etat.highlight).toEqual({ type: null, index: null });
    expect(ctx.enregistrerAffichage).toHaveBeenCalledTimes(1);
    expect(a.rebuildSelector).toHaveBeenCalledTimes(1);
    const autre = monter(tout, 'a');
    autre.cmd.executer('affichage.voisinage');
    expect(autre.a.etat.selectedKey).toBe('a');
  });

  it('regle les opacites du fond depuis leur curseur, et les enregistre', () => {
    const { cmd } = monter();
    orthoEspions.ortho.actif = true;
    cmd.executer('affichage.orthoOpacite', curseur(40));
    expect(orthoEspions.ortho.opacite).toBe(0.4);
    expect(orthoEspions.placer).toHaveBeenCalledTimes(1);
    cmd.executer('affichage.orthoParcelleOpacite', curseur(60));
    expect(orthoEspions.ortho.parcelleOpacite).toBe(0.6);
    cmd.executer('affichage.orthoParcelleDefaut');
    expect(orthoEspions.ortho.parcelleOpacite).toBe(0.15);
    expect(orthoEspions.enregistrer).toHaveBeenCalledTimes(3);
    // Un curseur illisible ne change rien.
    cmd.executer('affichage.orthoOpacite', curseur(Number.NaN));
    expect(orthoEspions.ortho.opacite).toBe(0.4);
  });

  it('allume ou eteint le fond, et l efface sans la capacite', () => {
    orthoEspions.ortho.actif = false;
    monter().cmd.executer('affichage.orthophoto');
    expect(orthoEspions.basculer).toHaveBeenCalledWith(true, {});
    const sans = monter(sansOrtho).cmd;
    for (const id of ['affichage.orthophoto', 'affichage.orthoOpacite', 'affichage.orthoParcelleOpacite']) expect(sans.effacee(id), id).toBe(true);
    expect(sans.effacee('affichage.grille')).toBe(false);
  });

  it('reconstruit la 3D ouverte une fois le fond bascule, pas avant ; rien sans 3D', async () => {
    let finir = () => {};
    orthoEspions.basculer.mockImplementationOnce(() => new Promise<void>((r) => { finir = r; }));
    vue3d.scene = {} as never;
    try {
      const { ctx, cmd } = monter();
      cmd.executer('affichage.orthophoto');
      expect(ctx.buildThreeScene).not.toHaveBeenCalled();
      finir();
      await Promise.resolve(); await Promise.resolve();
      expect(ctx.buildThreeScene).toHaveBeenCalledTimes(1);
    } finally { vue3d.scene = null; }
    const sans3d = monter();
    sans3d.cmd.executer('affichage.orthophoto');
    await Promise.resolve(); await Promise.resolve();
    expect(sans3d.ctx.buildThreeScene).not.toHaveBeenCalled();
  });
});

describe('boutons de vue', () => {
  it('menent au plan, a la 3D et a la visionneuse ; la 3D s efface sans sa capacite', () => {
    const ctx = { allerAuPlan: vi.fn(), goVue3D: vi.fn(), ouvrirVisionneuse: vi.fn() };
    const cmd = creerRegistre(tout);
    brancherBoutonsDeVue(ctx, cmd);
    cmd.executer('vue.plan'); cmd.executer('vue.3d'); cmd.executer('vue.visionneuse');
    expect([ctx.allerAuPlan, ctx.goVue3D, ctx.ouvrirVisionneuse].map((f) => f.mock.calls.length)).toEqual([1, 1, 1]);
    const sans = creerRegistre(sansOrtho);
    brancherBoutonsDeVue(ctx, sans);
    expect([sans.effacee('vue.plan'), sans.effacee('vue.3d'), sans.effacee('vue.visionneuse')]).toEqual([false, true, true]);
  });
});

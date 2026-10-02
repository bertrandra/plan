import { describe, it, expect, vi } from 'vitest';
import { creerRegistre } from '../../../../src/app/commandes.js';
import { brancherFacade } from '../../../../src/app/ecouteurs/facade.js';
import { designerFacade } from '../../../../src/facade/choix.js';
import { droits } from './faux.js';
import type { EtatApp } from '../../../../src/core/state.js';
import type { ServiceReleve } from '../../../../src/app/releve.js';

// Les commandes de facade (app/ecouteurs/facade.ts) : relever un mur d'un batiment, retirer un
// releve en un pas annulable ; ni l'une ni l'autre sans le droit d'ecrire.

function monter(selection: string, ecrire = true) {
  const etat = { selectedKey: selection, objects: [
    { key: 'maison', type: 'polygon', fonction: 'batiment', facades: [{ cote: 0 }, { cote: 2 }] },
    { key: 'garage', type: 'polygon', fonction: 'annexe' },
    { key: 'terrasse', type: 'polygon', fonction: 'terrasse' }
  ] } as unknown as EtatApp;
  const releve = { ouvrir: vi.fn() } as unknown as ServiceReleve;
  const ctx = { etat, releve, pushHistory: vi.fn(), render: vi.fn(), buildThreeScene: vi.fn() };
  const cmd = creerRegistre(droits(ecrire));
  brancherFacade(ctx, cmd);
  return { ctx, cmd, maison: etat.objects[0] as unknown as { facades?: { cote: number }[] } };
}

describe('facades', () => {
  it('relevent un mur d un batiment ou d une annexe, sur le mur designe', () => {
    expect(monter('terrasse').cmd.etat('facade.relever').utilisable).toBe(false);
    expect(monter('garage').cmd.etat('facade.relever').utilisable).toBe(true);
    const { ctx, cmd } = monter('maison');
    designerFacade(2);
    cmd.executer('facade.relever');
    expect(ctx.releve.ouvrir).toHaveBeenCalledWith('maison', 2);
    // La designation ne vaut qu'une fois.
    cmd.executer('facade.relever');
    expect(ctx.releve.ouvrir).toHaveBeenLastCalledWith('maison', null);
  });

  it('retirent le releve du mur designe en un pas annulable, et la liste quand elle est vide', () => {
    expect(monter('garage').cmd.etat('facade.retirer').utilisable).toBe(false);
    const { ctx, cmd, maison } = monter('maison');
    designerFacade(0);
    cmd.executer('facade.retirer');
    expect(ctx.pushHistory).toHaveBeenCalledTimes(1);
    expect(maison.facades).toEqual([{ cote: 2 }]);
    designerFacade(2);
    cmd.executer('facade.retirer');
    expect(maison.facades).toBeUndefined();
    expect(ctx.render).toHaveBeenCalledTimes(2);
  });

  it('ne retirent rien sans mur designe', () => {
    const { ctx, cmd, maison } = monter('maison');
    cmd.executer('facade.retirer');
    expect(ctx.pushHistory).not.toHaveBeenCalled();
    expect(maison.facades).toHaveLength(2);
  });

  it('ne s executent pas sans le droit d ecrire', () => {
    const { ctx, cmd } = monter('maison', false);
    designerFacade(0);
    expect(cmd.executer('facade.retirer')).toBe(false);
    expect(cmd.executer('facade.relever')).toBe(false);
    expect(ctx.pushHistory).not.toHaveBeenCalled();
    designerFacade(null);
  });
});

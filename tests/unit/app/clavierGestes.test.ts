// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { brancherGestesFacade, COMMANDE_ANNULER_GESTE, COMMANDE_RETABLIR_GESTE } from '../../../src/app/clavierGestes.js';
import { creerRegistre } from '../../../src/app/commandes.js';

// Ctrl+Z et Ctrl+Y sur les gestes d'une facade : dans l'ecran de la facade, tant qu'un geste reste a defaire ; sinon le projet.

function monter(ouvert: boolean, peut: boolean) {
  const cmd = creerRegistre();
  const annuler = vi.fn(), retablir = vi.fn(), projet = vi.fn();
  cmd.declarer({ id: COMMANDE_ANNULER_GESTE, libelle: 'a', groupe: 'facade', actif: () => peut, executer: annuler });
  cmd.declarer({ id: COMMANDE_RETABLIR_GESTE, libelle: 'r', groupe: 'facade', actif: () => peut, executer: retablir });
  const cible = document.createElement('div');
  document.body.appendChild(cible);
  brancherGestesFacade(cible, () => ouvert, cmd);
  // Le raccourci du projet ecoute plus haut, apres (phase de bulle) : il ne voit que ce que la facade laisse passer.
  document.body.addEventListener('keydown', projet);
  const touche = (key: string, plus: KeyboardEventInit = {}, sur: HTMLElement = cible) => sur.dispatchEvent(new KeyboardEvent('keydown', { key, ctrlKey: true, bubbles: true, cancelable: true, ...plus }));
  return { annuler, retablir, projet, touche, cible, fin: () => { document.body.removeEventListener('keydown', projet); cible.remove(); } };
}

describe('Ctrl+Z et Ctrl+Y sur les gestes d une facade', () => {
  it('defait et refait le geste dans l ecran de la facade, sans que le projet le voie', () => {
    const t = monter(true, true);
    t.touche('z'); t.touche('y'); t.touche('Z', { shiftKey: true });
    expect(t.annuler).toHaveBeenCalledTimes(1);
    expect(t.retablir).toHaveBeenCalledTimes(2);
    expect(t.projet).not.toHaveBeenCalled();
    t.fin();
  });
  it('laisse Ctrl+Z au projet sans geste a defaire, hors de l ecran de la facade, et dans un champ', () => {
    const sans = monter(true, false);
    sans.touche('z');
    expect([sans.annuler.mock.calls.length, sans.projet.mock.calls.length]).toEqual([0, 1]);
    sans.fin();
    const ailleurs = monter(false, true);
    ailleurs.touche('z');
    expect([ailleurs.annuler.mock.calls.length, ailleurs.projet.mock.calls.length]).toEqual([0, 1]);
    ailleurs.fin();
    const champ = monter(true, true);
    const input = document.createElement('input');
    champ.cible.appendChild(input);
    champ.touche('z', {}, input);
    expect(champ.annuler).not.toHaveBeenCalled();
    champ.fin();
  });
});

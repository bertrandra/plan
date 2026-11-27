// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { createElement, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Inspecteur } from '../../../src/zones/Inspecteur.js';
import { creerMagasin } from '../../../src/app/magasin.js';
import { creerRegistre, type Droits } from '../../../src/app/commandes.js';
import { droits } from '../app/ecouteurs/faux.js';
import type { Inspecteur as ServiceInspecteur } from '../../../src/app/inspecteur.js';
import type { ContexteChamps } from '../../../src/ui/champs/types.js';
import type { EtatApp } from '../../../src/core/state.js';
import type { ObjetPlan } from '../../../src/model/types.js';

// Les boutons du pied de l'inspecteur lisent l'etat de leur commande, comme la palette et les
// menus : en lecture seule, « Réinitialiser tout » et « Réinitialiser la position » se grisent et
// disent pourquoi, au lieu d'un clic refuse sans un mot.

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const rien = () => undefined;

function monter(d: Droits, classe = 'large'): { racine: Root; hote: HTMLElement } {
  const obj = { key: 'o1', name: 'A', type: 'polygon', fonction: 'autre', pts: [] } as unknown as ObjetPlan;
  const etat = { objects: [obj], selectedKey: 'o1' } as unknown as EtatApp;
  const magasin = creerMagasin(etat);
  (magasin as unknown as { definirClasse?: (c: string) => void }).definirClasse?.(classe);
  const commandes = creerRegistre(d);
  for (const id of ['objet.positionInitiale', 'projet.reinitialiser']) {
    commandes.declarer({ id, libelle: id, groupe: 'objet', permission: 'plan.write', executer: rien });
  }
  const c = { etat, obj } as unknown as ContexteChamps;
  const service = { objet: () => obj, contexte: () => c, titre: () => 'A', sections: () => [], appliquer: () => true, executer: rien, basculerOuverture: rien } as unknown as ServiceInspecteur;
  const hote = document.createElement('div');
  document.body.appendChild(hote);
  const racine = createRoot(hote);
  act(() => { racine.render(createElement(Inspecteur, { magasin, commandes, inspecteur: service })); });
  return { racine, hote };
}

describe('le pied de l inspecteur', () => {
  let monte: { racine: Root; hote: HTMLElement } | null = null;
  afterEach(() => { if (monte) { const m = monte; act(() => m.racine.unmount()); m.hote.remove(); monte = null; } });
  const bouton = (id: string) => monte!.hote.querySelector<HTMLButtonElement>('[data-commande="' + id + '"]')!;

  it('grise les reinitialisations en lecture seule et dit pourquoi', () => {
    monte = monter(droits(false));
    // « Réinitialiser la position » n'est plus qu'a la palette (lot 3 : un geste, un endroit).
    expect(monte.hote.querySelector('[data-commande="objet.positionInitiale"]')).toBeNull();
    for (const id of ['projet.reinitialiser']) {
      expect(bouton(id).disabled).toBe(true);
      expect(bouton(id).title).not.toBe('');
    }
  });

  it('les laisse utilisables avec le droit d ecrire', () => {
    monte = monter(droits(true));
    expect(bouton('projet.reinitialiser').disabled).toBe(false);
  });

  it('ecrit la raison sous les boutons au doigt', () => {
    monte = monter(droits(false), 'moyen');
    expect(monte.hote.querySelector('.refusPied')?.textContent).toBeTruthy();
  });

  it('range le rappel des gestes du plan dans un pli ferme', () => {
    // Plus de 400 caracteres sous chaque objet (audit de l'inspecteur, lot A5) : un titre, et le texte derriere.
    for (const classe of ['large', 'moyen', 'compact']) {
      const m = monter(droits(true), classe);
      const pli = m.hote.querySelector<HTMLDetailsElement>('.inspecteurPied details.gestesPlan')!;
      expect(pli.open).toBe(false);
      expect(pli.querySelector('summary')?.textContent).toBe('Gestes sur le plan');
      // La regle des gestes du 27 novembre 2026 : choisir d'abord, puis glisser ; glisser ailleurs deplace la vue.
      expect(pli.querySelector('p.hint')?.textContent).toMatch(/(Touchez|Cliquez) un objet pour le choisir, puis faites-le glisser\. Glissez ailleurs pour vous déplacer/);
      expect(m.hote.querySelectorAll('.inspecteurPied > p.hint:not(.refusPied)').length).toBe(0);
      act(() => m.racine.unmount()); m.hote.remove();
    }
  });
});

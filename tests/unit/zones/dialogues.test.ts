// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Dialogues } from '../../../src/zones/Dialogues.js';
import { dialogues } from '../../../src/shell/dialogues.js';

// Z8, un choix avec une option (shell/dialogues.ts `case`, zones/Dialogues.tsx) : la case se dessine
// sous les points, chaque bascule remonte a celui qui pose la question, et la reponse principale
// part avec l'etat qu'il a note. Sans `case`, rien de plus qu'avant.

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let racine: Root, hote: HTMLElement;
beforeEach(() => { hote = document.createElement('div'); document.body.appendChild(hote); racine = createRoot(hote); act(() => racine.render(createElement(Dialogues))); });
afterEach(() => { act(() => dialogues.fermer()); act(() => racine.unmount()); hote.remove(); });

describe('un choix avec une case', () => {
  it('dessine la case decochee, remonte chaque bascule, et repond avec l etat note', () => {
    const changer = vi.fn();
    const executer = vi.fn();
    act(() => dialogues.ouvrir({
      type: 'choix', titre: 'Actualiser', texte: 'Tout relire.', points: ['Un point.'],
      case: { libelle: 'Recalculer aussi la maison vérifiée', cochee: false, changer },
      principal: { libelle: 'Actualiser', executer }, secondaire: { libelle: 'Annuler', executer: () => {} },
    }));
    const c = hote.querySelector<HTMLInputElement>('input[data-controle="dialogue.case"]');
    expect(c).not.toBeNull();
    expect(c?.checked).toBe(false);
    expect(hote.querySelector('.dialogueCase')?.textContent).toBe('Recalculer aussi la maison vérifiée');
    // La case vit dans la boite, au-dessus des boutons.
    const boite = hote.querySelector('.dialogueBoite');
    expect(boite?.querySelector('.dialogueCase + .dialogueBoutons')).not.toBeNull();
    act(() => c?.click());
    expect(c?.checked).toBe(true);
    expect(changer).toHaveBeenLastCalledWith(true);
    act(() => c?.click());
    expect(changer).toHaveBeenLastCalledWith(false);
    expect(changer).toHaveBeenCalledTimes(2);
    act(() => hote.querySelector<HTMLButtonElement>('[data-controle="dialogue.principal"]')?.click());
    expect(executer).toHaveBeenCalledTimes(1);
    expect(dialogues.courant()).toBeNull();
  });

  it('ne dessine aucune case quand le choix n en a pas', () => {
    act(() => dialogues.ouvrir({ type: 'choix', titre: 'Question', texte: 'Oui ou non ?', principal: { libelle: 'Oui', executer: () => {} }, secondaire: { libelle: 'Non', executer: () => {} } }));
    expect(hote.querySelector('[data-controle="dialogue.case"]')).toBeNull();
    expect(hote.querySelector('[data-controle="dialogue.principal"]')?.textContent).toBe('Oui');
  });
});

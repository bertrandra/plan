// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  showToast, showConfirm, showPrompt, showErrBanner, showProjectLoadError
} from '../../../src/shell/dialogs.js';

// Ces dialogues remplacent alert()/confirm()/prompt(), silencieusement bloques en iframe bac a
// sable. Ils n'etaient testables par rien jusqu'ici : sortis de la fermeture de boot(), ils le
// deviennent sous jsdom (spec §11.2).

const overlays = () =>
  [...document.body.children].filter((e) => (e as HTMLElement).style.zIndex === '9998');
const boutonNomme = (racine: Element, texte: string) =>
  [...racine.querySelectorAll('button')].find((b) => b.textContent?.trim() === texte);

beforeEach(() => {
  document.body.innerHTML = '';
  vi.useRealTimers();
});

describe('showToast', () => {
  it('affiche le message puis le retire tout seul', async () => {
    vi.useFakeTimers();
    showToast('Export JSON : 35 objet(s)');
    const boite = document.body.lastElementChild as HTMLElement;
    expect(boite.textContent).toBe('Export JSON : 35 objet(s)');
    vi.advanceTimersByTime(10000);
    expect(document.body.contains(boite)).toBe(false);
  });
});

describe('showConfirm', () => {
  it('appelle l action sur « Confirmer », et ferme', () => {
    const action = vi.fn();
    showConfirm('Reinitialiser tout le plan ?', action);
    const ov = overlays()[0]!;
    expect(ov.textContent).toContain('Reinitialiser tout le plan ?');
    boutonNomme(ov, 'Confirmer')!.click();
    expect(action).toHaveBeenCalledTimes(1);
    expect(overlays()).toHaveLength(0);
  });

  it('n appelle rien sur « Annuler »', () => {
    const action = vi.fn();
    showConfirm('Supprimer ?', action);
    boutonNomme(overlays()[0]!, 'Annuler')!.click();
    expect(action).not.toHaveBeenCalled();
    expect(overlays()).toHaveLength(0);
  });

  it('ferme aussi en cliquant hors de la boite, sans confirmer', () => {
    // Cliquer a cote est un geste d'abandon : il ne doit surtout pas valider.
    const action = vi.fn();
    showConfirm('Supprimer ?', action);
    const ov = overlays()[0]!;
    ov.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(action).not.toHaveBeenCalled();
    expect(overlays()).toHaveLength(0);
  });
});

describe('showPrompt', () => {
  it('rend la valeur saisie', () => {
    const recu = vi.fn();
    showPrompt('Nom du nouveau projet :', 'Plan (copie)', recu);
    const ov = overlays()[0]!;
    const champ = ov.querySelector('input') as HTMLInputElement;
    expect(champ.value).toBe('Plan (copie)');
    champ.value = '  Jardin nord  ';
    boutonNomme(ov, 'Valider')!.click();
    expect(recu).toHaveBeenCalledWith('Jardin nord');
  });

  it('n appelle rien quand la saisie est vide', () => {
    const recu = vi.fn();
    showPrompt('Nom :', '', recu);
    const ov = overlays()[0]!;
    (ov.querySelector('input') as HTMLInputElement).value = '   ';
    boutonNomme(ov, 'Valider')!.click();
    expect(recu).not.toHaveBeenCalled();
  });

  it('valide a la touche Entree et abandonne a Echap', () => {
    const recu = vi.fn();
    showPrompt('Nom :', 'defaut', recu);
    const champ = overlays()[0]!.querySelector('input') as HTMLInputElement;
    champ.value = 'Terrasse sud';
    champ.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(recu).toHaveBeenCalledWith('Terrasse sud');

    const recu2 = vi.fn();
    showPrompt('Nom :', 'defaut', recu2);
    const champ2 = overlays()[0]!.querySelector('input') as HTMLInputElement;
    champ2.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(recu2).not.toHaveBeenCalled();
    expect(overlays()).toHaveLength(0);
  });
});

describe('showErrBanner', () => {
  it('affiche le message prefixe, et empile les erreurs suivantes', () => {
    showErrBanner('Cannot access X before initialization');
    const banniere = document.body.lastElementChild as HTMLElement;
    expect(banniere.textContent).toBe('Erreur JS: Cannot access X before initialization');
    showErrBanner('deuxieme');
    expect(document.body.children).toHaveLength(2);
  });
});

describe('showProjectLoadError', () => {
  it('nomme la cause quand elle est connue', () => {
    showProjectLoadError({ reason: 'network' });
    expect(document.body.textContent).toContain('injoignable');
  });

  it('reste comprehensible sur une cause inconnue', () => {
    showProjectLoadError(null);
    expect(document.body.textContent).toContain('Chargement du projet impossible');
    expect(document.body.textContent).toContain('Réessayer');
  });

  it('dit explicitement que la demonstration n a PAS ete chargee a la place', () => {
    // Le point important de cet ecran : ne pas laisser croire qu'on regarde son projet.
    showProjectLoadError({ reason: 'server' });
    expect(document.body.textContent).toMatch(/demonstration n'a pas ete charge/i);
  });
});

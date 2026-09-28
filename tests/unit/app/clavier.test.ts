import { describe, it, expect } from 'vitest';
import { brancherClavier } from '../../../src/app/clavier.js';
import { creerRegistre } from '../../../src/app/commandes.js';

// Les raccourcis passent par le registre (MD/spec-ihm-mobile.md, D2 et D6).

function monter() {
  let ecouteur: ((e: Event) => void) | null = null;
  const cible = { addEventListener: (_t: string, f: EventListenerOrEventListenerObject) => { ecouteur = f as (e: Event) => void; } } as unknown as Window;
  const commandes = creerRegistre();
  const faits: string[] = [];
  commandes.declarer({ id: 'objet.annuler', libelle: 'Annuler', groupe: 'objet', executer: () => faits.push('annuler') });
  commandes.declarer({ id: 'projet.enregistrer', libelle: 'Enregistrer', groupe: 'projet', executer: () => faits.push('enregistrer') });
  brancherClavier(commandes, cible);
  const appuyer = (key: string, mods: Partial<KeyboardEvent> = {}) => {
    let empeche = false;
    ecouteur!({ key, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, ...mods, preventDefault: () => { empeche = true; } } as unknown as Event);
    return empeche;
  };
  return { faits, appuyer };
}

describe('les raccourcis clavier', () => {
  it('Ctrl+Z et Cmd+Z annulent par la commande', () => {
    const { faits, appuyer } = monter();
    expect(appuyer('z', { ctrlKey: true })).toBe(true);
    expect(appuyer('Z', { metaKey: true })).toBe(true);
    expect(faits).toEqual(['annuler', 'annuler']);
  });

  it('Ctrl+S enregistre, et n ouvre jamais l enregistrement de la page', () => {
    const { faits, appuyer } = monter();
    expect(appuyer('s', { ctrlKey: true })).toBe(true);
    expect(faits).toEqual(['enregistrer']);
  });

  it('laisse passer les touches sans Ctrl, et les combinaisons avec Maj ou Alt', () => {
    const { faits, appuyer } = monter();
    expect(appuyer('z')).toBe(false);
    expect(appuyer('z', { ctrlKey: true, shiftKey: true })).toBe(false);
    expect(appuyer('s', { ctrlKey: true, altKey: true })).toBe(false);
    expect(faits).toEqual([]);
  });
});

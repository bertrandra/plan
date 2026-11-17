// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { brancherClavier, RACCOURCIS, raccourcisDe, raccourcisAffiches } from '../../../src/app/clavier.js';
import { creerRegistre } from '../../../src/app/commandes.js';
import { dialogues } from '../../../src/shell/dialogues.js';

// Les raccourcis passent par le registre (MD/spec-ihm-mobile.md, D2 et D6) ; une seule table les dit (lot 4).

function monter() {
  let ecouteur: ((e: Event) => void) | null = null;
  const cible = { addEventListener: (_t: string, f: EventListenerOrEventListenerObject) => { ecouteur = f as (e: Event) => void; } } as unknown as Window;
  const commandes = creerRegistre();
  const faits: string[] = [];
  commandes.declarer({ id: 'objet.annuler', libelle: 'Annuler', groupe: 'objet', executer: () => faits.push('annuler') });
  commandes.declarer({ id: 'objet.retablir', libelle: 'Rétablir', groupe: 'objet', executer: () => faits.push('retablir') });
  commandes.declarer({ id: 'objet.supprimer', libelle: 'Supprimer l’objet', groupe: 'objet', executer: () => faits.push('supprimer') });
  commandes.declarer({ id: 'projet.enregistrer', libelle: 'Enregistrer', groupe: 'projet', executer: () => faits.push('enregistrer') });
  brancherClavier(commandes, cible);
  const appuyer = (key: string, mods: Partial<KeyboardEvent> & { target?: unknown } = {}) => {
    let empeche = false;
    ecouteur!({ key, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, defaultPrevented: false, target: document.body, ...mods, preventDefault: () => { empeche = true; } } as unknown as Event);
    return empeche;
  };
  return { faits, appuyer, commandes };
}

beforeEach(() => { dialogues.fermer(); document.body.innerHTML = ''; });

describe('les raccourcis clavier', () => {
  it('Ctrl+Z et Cmd+Z annulent par la commande', () => {
    const { faits, appuyer } = monter();
    expect(appuyer('z', { ctrlKey: true })).toBe(true);
    expect(appuyer('Z', { metaKey: true })).toBe(true);
    expect(faits).toEqual(['annuler', 'annuler']);
  });

  it('Ctrl+Y et Ctrl+Maj+Z retablissent', () => {
    const { faits, appuyer } = monter();
    expect(appuyer('y', { ctrlKey: true })).toBe(true);
    expect(appuyer('Z', { ctrlKey: true, shiftKey: true })).toBe(true);
    expect(appuyer('y', { metaKey: true })).toBe(true);
    expect(faits).toEqual(['retablir', 'retablir', 'retablir']);
  });

  it('Ctrl+S enregistre, et n ouvre jamais l enregistrement de la page', () => {
    const { faits, appuyer } = monter();
    expect(appuyer('s', { ctrlKey: true })).toBe(true);
    expect(faits).toEqual(['enregistrer']);
  });

  it('Suppr supprime la selection, sur le plan seulement', () => {
    const { faits, appuyer } = monter();
    expect(appuyer('Delete')).toBe(true);
    expect(faits).toEqual(['supprimer']);
    // Dans un champ, Suppr efface du texte.
    const champ = document.createElement('input');
    document.body.append(champ);
    expect(appuyer('Delete', { target: champ })).toBe(false);
    // Sous un dialogue, ou une feuille modale, rien.
    dialogues.ouvrir({ type: 'confirmation', texte: '?', confirmer: () => {} });
    expect(appuyer('Delete')).toBe(false);
    dialogues.fermer();
    const feuille = document.createElement('div');
    feuille.setAttribute('aria-modal', 'true');
    document.body.append(feuille);
    expect(appuyer('Delete')).toBe(false);
    feuille.remove();
    // Une touche deja prise (le mode Toit) ne va pas plus loin.
    expect(appuyer('Delete', { defaultPrevented: true })).toBe(false);
    expect(faits).toEqual(['supprimer']);
  });

  it('laisse passer les touches sans Ctrl, et les combinaisons avec Alt ou d autres modificateurs', () => {
    const { faits, appuyer } = monter();
    expect(appuyer('z')).toBe(false);
    expect(appuyer('s', { ctrlKey: true, altKey: true })).toBe(false);
    expect(appuyer('s', { ctrlKey: true, shiftKey: true })).toBe(false);
    expect(appuyer('Delete', { ctrlKey: true })).toBe(false);
    expect(faits).toEqual([]);
  });
});

describe('la table des raccourcis, seule source', () => {
  it('chaque commande n a qu une ligne, et aucune touche ne sert deux fois', () => {
    const ids = RACCOURCIS.map((r) => r.commande);
    expect(new Set(ids).size).toBe(ids.length);
    const touches = RACCOURCIS.flatMap((r) => r.touches);
    expect(new Set(touches).size).toBe(touches.length);
    expect(raccourcisDe('objet.retablir')).toEqual(['Ctrl+Y', 'Ctrl+Maj+Z']);
    expect(raccourcisDe('objet.dupliquer')).toEqual([]);
  });

  it('le menu Aide montre les raccourcis des commandes declarees et offertes, avec leur libelle du registre', () => {
    const { commandes } = monter();
    expect(raccourcisAffiches(commandes).map((r) => r.libelle + ' : ' + r.touches.join(' ou '))).toEqual([
      'Annuler : Ctrl+Z', 'Rétablir : Ctrl+Y ou Ctrl+Maj+Z', 'Supprimer l’objet : Suppr', 'Enregistrer : Ctrl+S'
    ]);
    // Une commande absente du registre (ou effacee) ne se montre pas.
    const vide = creerRegistre();
    expect(raccourcisAffiches(vide)).toEqual([]);
  });
});

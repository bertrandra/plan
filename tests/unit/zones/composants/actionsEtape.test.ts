// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { ActionsEtape, valeurEnClair, valeursEnClair } from '../../../../src/zones/composants/ActionsEtape.js';
import type { ActionEtape, ElementAction } from '../../../../src/model/etapeFacade.js';

// Les actions d'une etape a l'ecran (calibration et audit) : la chaine rend des identifiants (`fenetre`, `porte-fenetre`) et des textes
// qu'elle enregistre ; l'ecran les ecrit en francais correct (ui/texteFacade.ts) sans que la donnee change (le reste du lot 4).

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let racine: Root, hote: HTMLElement;
beforeEach(() => { hote = document.createElement('div'); document.body.appendChild(hote); racine = createRoot(hote); });
afterEach(() => { act(() => racine.unmount()); hote.remove(); });

describe('les valeurs d’une action en clair', () => {
  it('écrit un identifiant dans les mots de l’écran, un nombre à la française, et laisse un mot inconnu', () => {
    expect(valeurEnClair('fenetre')).toBe('fenêtre');
    expect(valeurEnClair('porte')).toBe('porte');
    expect(valeurEnClair(1.25)).toBe('1,25');
    expect(valeursEnClair({ type: 'porte-fenetre', x: 4.33, sourceFocale: 'defaut', silhouette: 'trapeze' })).toBe('type porte-fenêtre · x (m) 4,33 · source défaut · haut trapèze');
  });
});

describe('les actions d’une étape à l’écran', () => {
  const element: ElementAction = {
    cle: 'ouverture:0', famille: 'ouverture', consommePar: ['ouvertures'], genre: 'boite', statut: 'retrouvee', type: 'fenetre', rect: { x: 1.2, y: 0.89, l: 1.2, h: 1.35 },
    valeurs: { calcul: { type: 'fenetre', x: 1.2 }, claude: { type: 'porte-fenetre', x: 1.17 }, manuel: null }, sourceLue: 'calcul',
  };
  const action = {
    id: 'boites', type: 'claude', libelle: 'Les boîtes de Claude', etat: 'ok',
    texte: "Une partie du mur (2 %) reste cachée sur toutes les vues : aucune ouverture n'y est cherchée. Optique rangée : 27.2 mm éq. (supposée).",
    elements: [element],
  } as unknown as ActionEtape;

  it('montre le type et les valeurs avec leurs accents, la virgule et l’apostrophe ; la donnée reste la sienne', () => {
    act(() => racine.render(createElement(ActionsEtape, { actions: [action], libelle: 'Actions' })));
    const ligne = hote.querySelector('.elementAction');
    expect(ligne?.querySelector('strong')?.textContent).toBe('fenêtre');
    expect(ligne?.textContent).toContain('calcul : type fenêtre · x (m) 1,2 · Claude : type porte-fenêtre · x (m) 1,17');
    expect(ligne?.getAttribute('data-cle')).toBe('ouverture:0');
    expect(hote.querySelector('.actionEtape > .calNote')?.textContent).toBe('Une partie du mur (2 %) reste cachée sur toutes les vues : aucune ouverture n’y est cherchée. Optique rangée : 27,2 mm éq. (supposée).');
    expect(hote.textContent).not.toMatch(/(?<!\p{L})(porte-)?fenetre(?!\p{L})/u);
    expect(element.type).toBe('fenetre');
    expect(action.texte).toContain("n'y est cherchée");
  });
});

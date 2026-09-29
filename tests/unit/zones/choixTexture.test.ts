// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Parcours } from '../../../src/zones/Parcours.js';
import { ouvrirSelecteurTexture, parcours } from '../../../src/app/parcours.js';
import { chargerCataloguePolyhaven } from '../../../src/io/polyhaven.js';

// Le selecteur parle a une API publique (Poly Haven). Le catalogue est simule : ce qu'on verifie
// ici, c'est le comportement de la fenetre — pas la disponibilite du service.

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const CATALOGUE = {
  wood_planks: { name: 'Wood planks', categories: ['wood'], tags: ['bois'], download_count: 900, thumbnail_url: 'w.jpg' },
  red_brick: { name: 'Red brick', categories: ['brick'], tags: ['brique'], download_count: 500, thumbnail_url: 'b.jpg' },
  concrete: { name: 'Concrete floor', categories: ['concrete'], tags: ['beton'], download_count: 100, thumbnail_url: 'c.jpg' }
};
// « Enregistrer » va chercher la liste des fichiers de la texture, pas le catalogue : la simulation
// doit distinguer les deux URL, sinon on croirait tester l'enregistrement alors qu'on teste un echec.
const FICHIERS = { Diffuse: { '4k': { jpg: { url: 'https://exemple/4k.jpg' } }, '1k': { jpg: { url: 'https://exemple/1k.jpg' } } } };

let racine: Root, hote: HTMLElement;
const attendre = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
const fenetre = () => hote.querySelector('.dialogueTextures');
const bouton = (texte: string) => [...hote.querySelectorAll('button')].find((b) => b.textContent?.trim() === texte)!;
const cliquer = (el: Element) => act(() => { (el as HTMLElement).click(); });
async function ouvrir(titre: string, choisi: Parameters<typeof ouvrirSelecteurTexture>[1], options?: { checkboxLabel?: string }) {
  act(() => ouvrirSelecteurTexture(titre, choisi, options));
  await attendre();
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => ({ ok: true, json: async () => (String(url).includes('/files/') ? FICHIERS : CATALOGUE) })));
  hote = document.createElement('div');
  document.body.appendChild(hote);
  racine = createRoot(hote);
  act(() => racine.render(createElement(Parcours)));
});
afterEach(() => {
  act(() => { parcours.fermer(); racine.unmount(); });
  hote.remove();
  vi.unstubAllGlobals();
});

describe('selecteur de textures', () => {
  it('affiche les vignettes, la plus telechargee en premier', async () => {
    await ouvrir('Sol', () => {});
    const vignettes = [...hote.querySelectorAll('button[data-id]')];
    expect(vignettes.length).toBe(3);
    expect(vignettes[0]!.getAttribute('data-id')).toBe('wood_planks');
  });

  it('garde le catalogue en memoire : deux appels rendent le meme objet', async () => {
    // 800 ko de JSON : rouvrir le selecteur ne doit pas refrapper l'API. Le cache est au niveau du
    // module : on compare les references plutot que de compter les appels reseau.
    const a = await chargerCataloguePolyhaven();
    const b = await chargerCataloguePolyhaven();
    expect(a).toBe(b);
    expect(a).toMatchObject({ wood_planks: { name: 'Wood planks' } });
  });

  it('filtre sur le nom, la categorie et les mots-cles', async () => {
    await ouvrir('Sol', () => {});
    const champ = hote.querySelector('input[type=text]') as HTMLInputElement;
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(champ, 'brique');
      champ.dispatchEvent(new Event('input', { bubbles: true }));
    });
    const ids = [...hote.querySelectorAll('button[data-id]')].map((b) => b.getAttribute('data-id'));
    expect(ids).toEqual(['red_brick']);
  });

  it('n active « Enregistrer » qu une fois une texture choisie', async () => {
    await ouvrir('Sol', () => {});
    expect(bouton('Enregistrer').disabled).toBe(true);
    await cliquer(hote.querySelector('button[data-id="red_brick"]')!);
    expect(bouton('Enregistrer').disabled).toBe(false);
  });

  it('rappelle le choix seulement a l enregistrement, jamais a la navigation, avec l image la plus legere', async () => {
    const choisi = vi.fn();
    await ouvrir('Sol', choisi);
    await cliquer(hote.querySelector('button[data-id="wood_planks"]')!);
    expect(choisi).not.toHaveBeenCalled();
    await cliquer(bouton('Enregistrer'));
    await attendre();
    expect(choisi).toHaveBeenCalledTimes(1);
    expect(choisi.mock.calls[0]![0]).toMatchObject({ id: 'wood_planks', url: 'https://exemple/1k.jpg' });
    expect(fenetre()).toBeNull();
  });

  it('ne rappelle rien sur « Annuler », et ferme la fenetre', async () => {
    const choisi = vi.fn();
    await ouvrir('Sol', choisi);
    await cliquer(bouton('Annuler'));
    expect(choisi).not.toHaveBeenCalled();
    expect(fenetre()).toBeNull();
  });

  it('se ferme sur Echap', async () => {
    await ouvrir('Sol', () => {});
    act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); });
    expect(fenetre()).toBeNull();
  });

  it('affiche la case « appliquer a tous » seulement si on la demande', async () => {
    await ouvrir('Sol', () => {});
    expect(hote.querySelector('input[type=checkbox]')).toBeNull();
    await ouvrir('Clôture', () => {}, { checkboxLabel: 'Appliquer à toutes les clôtures' });
    const case1 = hote.querySelector('input[type=checkbox]') as HTMLInputElement;
    expect(case1).not.toBeNull();
    expect(case1.checked).toBe(false);
    expect(fenetre()!.textContent).toContain('Appliquer à toutes les clôtures');
  });

  it('transmet l etat de la case au moment d enregistrer', async () => {
    const choisi = vi.fn();
    await ouvrir('Clôture', choisi, { checkboxLabel: 'Toutes' });
    await cliquer(hote.querySelector('input[type=checkbox]')!);
    await cliquer(hote.querySelector('button[data-id="concrete"]')!);
    await cliquer(bouton('Enregistrer'));
    await attendre();
    expect(choisi.mock.calls[0]![1]).toBe(true);
  });
});

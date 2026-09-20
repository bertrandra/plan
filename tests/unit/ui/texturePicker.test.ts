// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { ouvrirSelecteurTexture, chargerCataloguePolyhaven } from '../../../src/ui/texturePicker.js';

// Le selecteur parle a une API publique (Poly Haven). Le catalogue est simule : ce qu'on verifie
// ici, c'est le comportement de la fenetre - pas la disponibilite du service.

const CATALOGUE = {
  wood_planks: { name: 'Wood planks', categories: ['wood'], tags: ['bois'], download_count: 900, thumbnail_url: 'w.jpg' },
  red_brick: { name: 'Red brick', categories: ['brick'], tags: ['brique'], download_count: 500, thumbnail_url: 'b.jpg' },
  concrete: { name: 'Concrete floor', categories: ['concrete'], tags: ['beton'], download_count: 100, thumbnail_url: 'c.jpg' }
};

const overlay = () =>
  [...document.body.children].filter((e) => (e as HTMLElement).style.zIndex === '9998')[0];
const bouton = (texte: string) =>
  [...overlay()!.querySelectorAll('button')].find((b) => b.textContent?.trim() === texte)!;
const attendre = () => new Promise((r) => setTimeout(r, 0));

// Le bouton « Enregistrer » va chercher la liste des fichiers de la texture, pas le catalogue :
// la simulation doit distinguer les deux URL, sinon on croirait tester l'enregistrement alors
// qu'on teste un echec.
const FICHIERS = { Diffuse: { '4k': { jpg: { url: 'https://exemple/4k.jpg' } }, '1k': { jpg: { url: 'https://exemple/1k.jpg' } } } };

beforeEach(() => {
  document.body.innerHTML = '';
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => ({
      ok: true,
      json: async () => (String(url).includes('/files/') ? FICHIERS : CATALOGUE)
    }))
  );
});
afterEach(() => vi.unstubAllGlobals());

describe('selecteur de textures', () => {
  it('affiche les vignettes, la plus telechargee en premier', async () => {
    ouvrirSelecteurTexture('Sol', () => {});
    await attendre();
    const vignettes = [...overlay()!.querySelectorAll('button[data-id]')];
    expect(vignettes.length).toBe(3);
    expect(vignettes[0]!.getAttribute('data-id')).toBe('wood_planks');
  });

  it('garde le catalogue en memoire : deux appels rendent le meme objet', async () => {
    // 800 ko de JSON : rouvrir le selecteur ne doit pas refrapper l'API. Le cache etant au
    // niveau du module, il survit d'un test a l'autre - on compare donc les references plutot
    // que de compter les appels reseau, qui dependraient de l'ordre des tests.
    const a = await chargerCataloguePolyhaven();
    const b = await chargerCataloguePolyhaven();
    expect(a).toBe(b);
    expect(a).toMatchObject({ wood_planks: { name: 'Wood planks' } });
  });

  it('filtre sur le nom, la categorie et les mots-cles', async () => {
    ouvrirSelecteurTexture('Sol', () => {});
    await attendre();
    const champ = overlay()!.querySelector('input[type=text]') as HTMLInputElement;
    champ.value = 'brique';
    champ.dispatchEvent(new Event('input', { bubbles: true }));
    await attendre();
    const ids = [...overlay()!.querySelectorAll('button[data-id]')].map((b) => b.getAttribute('data-id'));
    expect(ids).toEqual(['red_brick']);
  });

  it('n active « Enregistrer » qu une fois une texture choisie', async () => {
    ouvrirSelecteurTexture('Sol', () => {});
    await attendre();
    expect(bouton('Enregistrer').disabled).toBe(true);
    (overlay()!.querySelector('button[data-id="red_brick"]') as HTMLButtonElement).click();
    await attendre();
    expect(bouton('Enregistrer').disabled).toBe(false);
  });

  it('rappelle le choix seulement a l enregistrement, jamais a la navigation', async () => {
    const choisi = vi.fn();
    ouvrirSelecteurTexture('Sol', choisi);
    await attendre();
    (overlay()!.querySelector('button[data-id="wood_planks"]') as HTMLButtonElement).click();
    await attendre();
    expect(choisi).not.toHaveBeenCalled();
    bouton('Enregistrer').click();
    await attendre();
    expect(choisi).toHaveBeenCalledTimes(1);
    expect(choisi.mock.calls[0]![0]).toMatchObject({ id: 'wood_planks' });
  });

  it('ne rappelle rien sur « Annuler », et ferme la fenetre', async () => {
    const choisi = vi.fn();
    ouvrirSelecteurTexture('Sol', choisi);
    await attendre();
    bouton('Annuler').click();
    expect(choisi).not.toHaveBeenCalled();
    expect(overlay()).toBeUndefined();
  });

  it('affiche la case « appliquer a tous » seulement si on la demande', async () => {
    ouvrirSelecteurTexture('Sol', () => {});
    await attendre();
    expect(overlay()!.querySelector('input[type=checkbox]')).toBeNull();
    document.body.innerHTML = '';

    ouvrirSelecteurTexture('Clôture', () => {}, { checkboxLabel: 'Appliquer à toutes les clôtures' });
    await attendre();
    const case1 = overlay()!.querySelector('input[type=checkbox]') as HTMLInputElement;
    expect(case1).not.toBeNull();
    expect(case1.checked).toBe(false);
    expect(overlay()!.textContent).toContain('Appliquer à toutes les clôtures');
  });

  it('transmet l etat de la case au moment d enregistrer', async () => {
    const choisi = vi.fn();
    ouvrirSelecteurTexture('Clôture', choisi, { checkboxLabel: 'Toutes' });
    await attendre();
    (overlay()!.querySelector('input[type=checkbox]') as HTMLInputElement).checked = true;
    (overlay()!.querySelector('button[data-id="concrete"]') as HTMLButtonElement).click();
    await attendre();
    bouton('Enregistrer').click();
    await attendre();
    expect(choisi.mock.calls[0]![1]).toBe(true);
  });
});

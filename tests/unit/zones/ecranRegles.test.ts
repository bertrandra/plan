// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { createElement, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { EcranRegles, type PropsEcranRegles } from '../../../src/zones/EcranRegles.js';
import { demandeEcranRegles } from '../../../src/app/ecranRegles.js';
import { DESCRIPTIONS_SUJETS } from '../../../src/regles/sujets/liste.js';
import { genererFichiers } from '../../../src/regles/sujets/generation.js';
import { SUJETS } from '../../../src/app/regles/sujets/index.js';

// L'ecran Admin › Regles (`?admin&ecran=regles`) : les sujets du depot, le prompt et le schema recalcules a
// chaque frappe, ce qui change par rapport au livre, les controles, un sujet nouveau, et le brouillon.

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('l ecran des regles', () => {
  let monte: { racine: Root; hote: HTMLElement } | null = null;
  afterEach(() => { if (monte) { const m = monte; act(() => m.racine.unmount()); m.hote.remove(); monte = null; } });

  async function monter(plus: Partial<PropsEcranRegles> = {}) {
    const telechargements: { nom: string; contenu: string }[] = [];
    const memoire: { texte: string | null } = { texte: null };
    const copies: string[] = [];
    const props: PropsEcranRegles = {
      sujets: DESCRIPTIONS_SUJETS,
      proposeurs: SUJETS.map((s) => ({ id: s.id, libelle: s.libelle, effet: s.effet })),
      accords: {},
      brouillon: { lire: () => memoire.texte, ecrire: (t) => { memoire.texte = t; }, effacer: () => { memoire.texte = null; } },
      telecharger: (nom, contenu) => { telechargements.push({ nom, contenu }); },
      copier: async (t) => { copies.push(t); },
      ...plus,
    };
    const hote = document.createElement('div');
    document.body.appendChild(hote);
    const racine = createRoot(hote);
    await act(async () => { racine.render(createElement(EcranRegles, props)); });
    monte = { racine, hote };
    return { hote, telechargements, memoire, copies, remonter: async () => { await act(async () => { racine.render(createElement(EcranRegles, props)); }); } };
  }
  const texte = (h: HTMLElement, sel: string) => [...h.querySelectorAll(sel)].map((e) => e.textContent?.replace(/\s+/g, ' ').trim());
  const cliquer = async (b: Element | null | undefined) => { await act(async () => { (b as HTMLElement).click(); }); };
  const bouton = (h: HTMLElement, nom: string) => [...h.querySelectorAll('button')].find((b) => b.textContent?.trim() === nom);
  /** Une frappe : la valeur d'un champ React se pose par le setter natif, puis l'evenement. */
  const taper = async (c: Element | null, valeur: string) => {
    const proto = c instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    await act(async () => { Object.getOwnPropertyDescriptor(proto, 'value')?.set?.call(c, valeur); c?.dispatchEvent(new Event('input', { bubbles: true })); });
  };
  const sortie = (h: HTMLElement) => h.querySelector('pre.reglSortie')?.textContent ?? '';

  it('s ouvre par l adresse', () => {
    expect(demandeEcranRegles('?admin&ecran=regles')).toBe(true);
    expect(demandeEcranRegles('?admin&ecran=conformite')).toBe(false);
  });

  it('montre les huit sujets du dépôt, le prompt livré et un état identique', async () => {
    const { hote } = await monter();
    expect(hote.querySelector('h1')?.textContent).toBe('Règles');
    expect([...hote.querySelectorAll('.reglSujet')].map((l) => l.getAttribute('data-sujet'))).toEqual(DESCRIPTIONS_SUJETS.map((s) => s.id));
    const tuiles = texte(hote, '.consTuile');
    expect(tuiles[0]).toContain('8 / 8');
    expect(tuiles[1]).toMatch(/tokens/);
    expect(tuiles[4]).toContain('Identique');
    // Le prompt est celui du fichier livre, a l'octet, ligne a ligne (le signe de marge s'ajoute devant).
    const g = genererFichiers();
    expect(sortie(hote).split('\n').map((l) => l.slice(1)).join('\n').trimEnd()).toBe(g.prompt.trimEnd());
  });

  it('dit pour chaque sujet s’il propose au projet, ce qu’il écrit, et l’accord mesuré de Claude', async () => {
    const { hote } = await monter({ accords: { couverture: 0.97 } });
    const ligne = (id: string) => hote.querySelector('[data-sujet="' + id + '"]')?.textContent?.replace(/\s+/g, ' ') ?? '';
    expect(ligne('formeToit')).toContain('écrit corpsToit');
    expect(ligne('formeToit')).toContain('accord non mesuré');
    expect(ligne('couverture')).toContain('accord 97 %');
    expect(ligne('lucarnes')).toContain('Observation seule');
  });

  it('recalcule le prompt à chaque frappe, compte la ligne qui change et propose la version suivante', async () => {
    const { hote } = await monter();
    await cliquer(hote.querySelector('[data-sujet="couverture"] button.small'));
    const champ = hote.querySelector('textarea[aria-label="Consignes (comment répondre) 1"]');
    expect(champ).not.toBeNull();
    await taper(champ, '- `couverture` : le matériau de couverture du corps principal, vu sur le versant sud.');
    expect(sortie(hote)).toContain('vu sur le versant sud');
    expect(texte(hote, '[data-diff="ajoute"]').join('\n')).toContain('vu sur le versant sud');
    const tuiles = texte(hote, '.consTuile');
    expect(tuiles[4]).toContain('1 ligne change');
    expect(tuiles[4]).toContain('version 5 à poser dans versions.ts');
    expect(tuiles[1]).toContain('version 5');
    expect(hote.querySelector('[data-sujet="couverture"]')?.textContent).toContain('Modifié');
    await cliquer(hote.querySelector('#reglOnglet-ecarts'));
    // La version de l'en-tete change avec le texte (4 -> 5), et la consigne d'avant disparait.
    expect(texte(hote, '.reglRetrait').join('\n')).toContain('- `couverture` : le matériau de couverture du corps principal.');
    expect(texte(hote, '.reglAjout').join('\n')).toContain('version: 5');
    await cliquer(bouton(hote, 'Revenir au livré'));
    expect(texte(hote, '.consTuile')[4]).toContain('Identique');
  });

  it('retire un sujet du prompt d’une case, sans toucher au dépôt', async () => {
    const { hote } = await monter();
    await cliquer(hote.querySelector('[aria-label="Dans le prompt : Cheminées"]'));
    expect(sortie(hote)).not.toContain('- `cheminees`');
    expect(texte(hote, '.consTuile')[0]).toContain('7 / 8');
    expect(hote.querySelector('[data-sujet="cheminees"]')?.textContent).toContain('Hors du prompt');
  });

  it('ajoute un sujet en brouillon : dans le prompt et le schéma, contrôles verts, module à télécharger', async () => {
    const { hote, telechargements } = await monter();
    await cliquer(bouton(hote, 'Nouveau sujet'));
    expect((bouton(hote, 'Ajouter en brouillon') as HTMLButtonElement).disabled).toBe(true);
    await taper(hote.querySelector('input[name="id"]'), 'chienAssis');
    await taper(hote.querySelector('input[name="libelle"]'), 'Chiens-assis');
    await taper(hote.querySelector('input[name="question"]'), 'le nombre de chiens-assis vus sur le versant, ou « indetermine »');
    expect((bouton(hote, 'Ajouter en brouillon') as HTMLButtonElement).disabled).toBe(false);
    await cliquer(bouton(hote, 'Ajouter en brouillon'));
    expect(sortie(hote)).toContain('- `chienAssis` : le nombre de chiens-assis vus sur le versant, ou « indetermine ».');
    expect(texte(hote, '.consTuile')[0]).toContain('9 / 9');
    expect(texte(hote, '.consTuile')[0]).toContain('1 brouillon');
    expect(hote.querySelector('[data-sujet="chienAssis"]')?.textContent).toContain('Brouillon');
    await cliquer(hote.querySelector('#reglOnglet-schema'));
    expect(sortie(hote)).toContain('"chienAssis"');
    await cliquer(hote.querySelector('#reglOnglet-controles'));
    expect(texte(hote, '.reglControles li')[0]).toMatch(/^Bon /);
    await cliquer([...hote.querySelectorAll('button')].find((b) => /descriptions\/chienAssis\.ts/.test(b.textContent ?? '')));
    expect(telechargements.map((t) => t.nom)).toEqual(['chienAssis.ts']);
    expect(telechargements[0]?.contenu).toContain('export const chienAssis: DescriptionSujet = {');
  });

  it('refuse un identifiant déjà pris ou mal écrit, et dit pourquoi', async () => {
    const { hote } = await monter();
    await cliquer(bouton(hote, 'Nouveau sujet'));
    await taper(hote.querySelector('input[name="id"]'), 'Chien assis');
    expect(hote.querySelector('.reglNouveau')?.textContent).toContain('lettres et chiffres');
    await taper(hote.querySelector('input[name="id"]'), 'couverture');
    expect(hote.querySelector('.reglNouveau')?.textContent).toContain('déjà pris');
  });

  it('une erreur de contrôle grise les téléchargements, avec la raison', async () => {
    const { hote, telechargements } = await monter();
    await cliquer(hote.querySelector('[data-sujet="couverture"] button.small'));
    // Retirer la seule consigne du champ « couverture » : Claude ne saurait pas le remplir.
    await cliquer(hote.querySelector('button[aria-label^="Retirer ce texte (Consignes"]'));
    const t = bouton(hote, 'Télécharger le prompt') as HTMLButtonElement;
    expect(t.disabled).toBe(true);
    expect(t.title).toMatch(/Corrigez les erreurs/);
    expect(hote.querySelector('.confRaison')?.textContent).toMatch(/un prompt invalide ne s’écrit pas/);
    expect(texte(hote, '.consTuile')[3]).toContain('1 erreur');
    await cliquer(t);
    expect(telechargements).toEqual([]);
  });

  it('télécharge les deux fichiers tels que le serveur les lirait, et copie le prompt', async () => {
    const { hote, telechargements, copies } = await monter();
    await cliquer(bouton(hote, 'Télécharger le prompt'));
    await cliquer(bouton(hote, 'Télécharger le schéma'));
    await cliquer(bouton(hote, 'Copier le prompt'));
    const g = genererFichiers();
    expect(telechargements).toEqual([{ nom: 'prompt-analyse.md', contenu: g.prompt }, { nom: 'schema-analyse.json', contenu: g.schema }]);
    expect(copies).toEqual([g.prompt]);
  });

  it('garde le brouillon dans le navigateur : il revient à la réouverture, et « Revenir au livré » l’efface', async () => {
    const premier = await monter();
    await cliquer(premier.hote.querySelector('[aria-label="Dans le prompt : Cheminées"]'));
    expect(premier.memoire.texte).toContain('"exclus":["cheminees"]');
    const memoire = premier.memoire;
    // La page se ferme : l'ecran se demonte, le navigateur garde le brouillon.
    if (monte) { const m = monte; act(() => m.racine.unmount()); m.hote.remove(); monte = null; }
    const second = await monter({ brouillon: { lire: () => memoire.texte, ecrire: (t) => { memoire.texte = t; }, effacer: () => { memoire.texte = null; } } });
    expect(texte(second.hote, '.consTuile')[0]).toContain('7 / 8');
    await cliquer(bouton(second.hote, 'Revenir au livré'));
    expect(memoire.texte).toBeNull();
    expect(texte(second.hote, '.consTuile')[0]).toContain('8 / 8');
  });

  it('un brouillon abîmé est ignoré : on repart du dépôt', async () => {
    const { hote } = await monter({ brouillon: { lire: () => '{ pas du json', ecrire: () => undefined, effacer: () => undefined } });
    expect(texte(hote, '.consTuile')[0]).toContain('8 / 8');
  });
});

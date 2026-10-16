// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { createElement, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { EcranRegles, type PropsEcranRegles } from '../../../src/zones/EcranRegles.js';
import { demandeEcranRegles } from '../../../src/app/ecranRegles.js';
import { DESCRIPTIONS_SUJETS } from '../../../src/regles/sujets/liste.js';
import { genererFichiers } from '../../../src/regles/sujets/generation.js';
import { SUJETS } from '../../../src/app/regles/sujets/index.js';
import type { BrouillonReglesServeur, ClientRegles } from '../../../src/io/reglesServeur.js';
import { FICHIERS_DONNEES } from '../../../src/regles/donnees/fichiers.js';

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
      proposeurs: SUJETS.filter((s) => s.proposer).map((s) => ({ id: s.id, ...(s.attribut ? { attribut: s.attribut } : {}), ...(s.effet ? { effet: s.effet } : {}) })),
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
    expect(tuiles[4]).toContain('version 8 à poser dans versions.ts');
    expect(tuiles[1]).toContain('version 8');
    expect(hote.querySelector('[data-sujet="couverture"]')?.textContent).toContain('Modifié');
    await cliquer(hote.querySelector('#reglOnglet-ecarts'));
    // La version de l'en-tete change avec le texte (5 -> 6), et la consigne d'avant disparait.
    expect(texte(hote, '.reglRetrait').join('\n')).toContain('- `couverture` : le matériau de couverture du corps principal.');
    expect(texte(hote, '.reglAjout').join('\n')).toContain('version: 8');
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

  // Le brouillon sur le serveur (admin/claude/regles) : lu a l'ouverture, enregistre, repris, retire.
  describe('le brouillon du serveur', () => {
    const attendre = async () => { await act(async () => { await new Promise((ok) => setTimeout(ok, 0)); }); };
    function fauxServeur(depart: BrouillonReglesServeur | null = null) {
      let garde = depart;
      const client: ClientRegles = {
        lire: vi.fn(async () => garde),
        enregistrer: vi.fn(async (b) => { garde = { enregistreLe: '2026-10-16T10:00:00Z', prompt: 8, schema: 4, promptTexte: b.prompt, schemaTexte: b.schema, etat: b.etat }; return { enregistreLe: garde.enregistreLe, prompt: 8, schema: 4 }; }),
        retirer: vi.fn(async () => { garde = null; }),
      };
      return client;
    }
    const etat = (h: HTMLElement) => h.querySelector('p[role="status"]')?.textContent ?? '';

    it('ne propose rien sans serveur, et dit qu il n y a pas de brouillon quand le serveur n en a pas', async () => {
      const sans = await monter();
      expect(bouton(sans.hote, 'Enregistrer sur le serveur')).toBeUndefined();
      act(() => monte!.racine.unmount()); monte!.hote.remove(); monte = null;
      const { hote } = await monter({ serveur: fauxServeur() });
      await attendre();
      expect(etat(hote)).toContain('Aucun brouillon sur le serveur : les analyses partent avec le prompt livré.');
      // Rien ne differe du livre : il n'y a rien a essayer.
      expect((bouton(hote, 'Enregistrer sur le serveur') as HTMLButtonElement).disabled).toBe(true);
      expect((bouton(hote, 'Reprendre celui du serveur') as HTMLButtonElement).disabled).toBe(true);
      expect((bouton(hote, 'Retirer du serveur') as HTMLButtonElement).disabled).toBe(true);
    });

    it('enregistre le prompt, le schéma et l état de l éditeur, dit la version, et propose de le retirer', async () => {
      const serveur = fauxServeur();
      const { hote } = await monter({ serveur });
      await attendre();
      await cliquer(hote.querySelector('[data-sujet="couverture"] button.small'));
      await taper(hote.querySelector('textarea[aria-label="Consignes (comment répondre) 1"]'), '- `couverture` : le matériau, vu sur le versant sud.');
      const enregistrer = bouton(hote, 'Enregistrer sur le serveur') as HTMLButtonElement;
      expect(enregistrer.disabled).toBe(false);
      await cliquer(enregistrer);
      await attendre();
      const envoi = vi.mocked(serveur.enregistrer).mock.calls[0]![0];
      expect(envoi.prompt).toContain('version: 8');
      expect(envoi.prompt).toContain('vu sur le versant sud');
      expect(JSON.parse(envoi.schema).version).toBe(3);
      expect(envoi.etat).toMatchObject({ exclus: [], liste: expect.any(Array) });
      expect(hote.querySelector('.consEtat')?.textContent).toContain('Brouillon enregistré sur le serveur (prompt version 8)');
      expect(etat(hote)).toContain('Brouillon du serveur : prompt version 8, schéma version 4, enregistré le 2026-10-16 10:00.');
      expect(etat(hote)).toContain('?regles=local');
      await cliquer(bouton(hote, 'Retirer du serveur'));
      await attendre();
      expect(serveur.retirer).toHaveBeenCalled();
      expect(etat(hote)).toContain('Aucun brouillon sur le serveur');
      expect(hote.querySelector('.consEtat')?.textContent).toContain('les analyses repartent avec le prompt livré');
    });

    it('un exclu enregistre aussi : le serveur reçoit le prompt sans ce sujet', async () => {
      const serveur = fauxServeur();
      const { hote } = await monter({ serveur });
      await attendre();
      await cliquer(hote.querySelector('[aria-label="Dans le prompt : Cheminées"]'));
      await cliquer(bouton(hote, 'Enregistrer sur le serveur'));
      await attendre();
      expect(vi.mocked(serveur.enregistrer).mock.calls[0]![0].prompt).not.toContain('- `cheminees`');
      expect(vi.mocked(serveur.enregistrer).mock.calls[0]![0].etat).toMatchObject({ exclus: ['cheminees'] });
    });

    it('reprend l éditeur tel que le serveur l a gardé, d un autre navigateur', async () => {
      const g = genererFichiers();
      const gardeEtat = { liste: DESCRIPTIONS_SUJETS, exclus: ['elements'] };
      const serveur = fauxServeur({ enregistreLe: '2026-10-16T10:00:00Z', prompt: 8, schema: 4, promptTexte: g.prompt, schemaTexte: g.schema, etat: gardeEtat });
      const { hote } = await monter({ serveur });
      await attendre();
      expect(texte(hote, '.consTuile')[0]).toContain('8 / 8');
      expect(etat(hote)).toContain('prompt version 8');
      await cliquer(bouton(hote, 'Reprendre celui du serveur'));
      expect(texte(hote, '.consTuile')[0]).toContain('7 / 8');
      expect(hote.querySelector('[data-sujet="elements"]')?.textContent).toContain('Hors du prompt');
      expect(hote.querySelector('.consEtat')?.textContent).toContain('Brouillon du serveur repris');
    });

    it('dit pourquoi le serveur a refusé, sans perdre l édition', async () => {
      const serveur = fauxServeur();
      vi.mocked(serveur.enregistrer).mockRejectedValueOnce(new Error('Prompt vide.'));
      const { hote } = await monter({ serveur });
      await attendre();
      await cliquer(hote.querySelector('[aria-label="Dans le prompt : Cheminées"]'));
      await cliquer(bouton(hote, 'Enregistrer sur le serveur'));
      await attendre();
      expect(hote.querySelector('.consEtat')?.textContent).toBe('Enregistrement impossible : Prompt vide.');
      expect(texte(hote, '.consTuile')[0]).toContain('7 / 8');
    });
  });

  // Les reglages des toits et des facades et les faits des toits : le meme ecran, une autre vue.
  describe('les réglages et les faits', () => {
    const donnees = { versions: { toits: 3, facades: 1 } };
    const onglet = (h: HTMLElement) => h.querySelector('#reglVue-donnees');
    const fichier = (h: HTMLElement, id: string) => h.querySelector('[data-fichier="' + id + '"]') as HTMLElement;
    const toits = FICHIERS_DONNEES.find((f) => f.id === 'reglagesToits')!;

    it('n est pas proposé sans fichiers, et ouvre les quatre fichiers du moteur sans rien changer', async () => {
      const sans = await monter();
      expect(onglet(sans.hote)).toBeNull();
      act(() => monte!.racine.unmount()); monte!.hote.remove(); monte = null;
      const { hote } = await monter({ donnees });
      await cliquer(onglet(hote));
      expect([...hote.querySelectorAll('[data-fichier]')].map((e) => e.getAttribute('data-fichier'))).toEqual(['reglagesToits', 'reglagesFacades', 'faitsToits', 'silhouettesToits']);
      expect(hote.querySelector('.reglSujet[data-sujet]')).toBeNull();
      for (const f of FICHIERS_DONNEES) expect(fichier(hote, f.id).textContent).toContain('Le moteur l’accepte.');
      // Rien ne change : rien a telecharger, rien a ajouter aux versions de lecture.
      expect((bouton(fichier(hote, 'reglagesToits'), 'Télécharger reglages.json') as HTMLButtonElement).disabled).toBe(true);
      expect(hote.querySelector('[aria-label="Lignes de version à ajouter"]')).toBeNull();
      // Les faits sont listes avec leur clé et leur adresse.
      expect(fichier(hote, 'faitsToits').textContent).toContain('BATIMENT0000000322509182');
      await cliquer(hote.querySelector('#reglVue-sujets'));
      expect(hote.querySelectorAll('.reglSujet[data-sujet]')).toHaveLength(8);
    });

    it('change un seuil : une ligne change, l empreinte aussi, la ligne de version est donnée, le fichier se télécharge', async () => {
      const { hote, telechargements } = await monter({ donnees });
      await cliquer(onglet(hote));
      await taper(hote.querySelector('input[aria-label="Valeur de SEUIL_MARCHE_M"]'), '0.9');
      const f = fichier(hote, 'reglagesToits');
      expect(f.textContent).toContain('1 ligne change');
      expect(f.textContent).toMatch(/L’empreinte passe de [0-9a-f]{8} à [0-9a-f]{8}/);
      expect(f.textContent).toContain('les toits déjà lus sur le LiDAR sont relus');
      expect(f.querySelector('[data-seuil="SEUIL_MARCHE_M"]')?.textContent).toContain('Modifié');
      const ligne = hote.querySelector('[aria-label="Lignes de version à ajouter"]')?.textContent ?? '';
      expect(ligne).toMatch(/LECTURES_TOITS.*\{ version: 4, reglages: '[0-9a-f]{8}', faits: '[0-9a-f]{8}' \},/);
      await cliquer(bouton(f, 'Télécharger reglages.json'));
      expect(telechargements).toHaveLength(1);
      expect(telechargements[0]!.nom).toBe('reglages.json');
      expect(telechargements[0]!.contenu).toContain('"SEUIL_MARCHE_M": { "valeur": 0.9,');
      expect(telechargements[0]!.contenu.split('\n').length).toBe(toits.livre.split('\n').length);
      // Revenir au livre defait tout.
      await cliquer(bouton(f, 'Revenir au livré'));
      expect(f.textContent).not.toContain('ligne change');
      expect(hote.querySelector('[aria-label="Lignes de version à ajouter"]')).toBeNull();
    });

    it('une raison changée ne relit aucun toit ; un fichier abîmé est refusé et ne se télécharge pas', async () => {
      const { hote } = await monter({ donnees });
      await cliquer(onglet(hote));
      await taper(hote.querySelector('textarea[aria-label="Pourquoi SEUIL_MARCHE_M"]'), 'Une autre raison.');
      const f = fichier(hote, 'reglagesToits');
      expect(f.textContent).toContain('L’empreinte ne change pas');
      expect(hote.querySelector('[aria-label="Lignes de version à ajouter"]')).toBeNull();
      await taper(f.querySelector('textarea[aria-label="Texte de regles/toits/reglages.json"]'), '{ pas du json');
      expect(f.textContent).toContain('Refusé');
      expect(f.querySelector('[role="alert"]')?.textContent).toMatch(/Le moteur refuserait ce fichier : JSON illisible/);
      expect((bouton(f, 'Télécharger reglages.json') as HTMLButtonElement).disabled).toBe(true);
    });

    it('garde les fichiers édités dans le navigateur, à part du brouillon des sujets', async () => {
      const mem: { texte: string | null } = { texte: null };
      const brouillon = { lire: () => mem.texte, ecrire: (t: string) => { mem.texte = t; }, effacer: () => { mem.texte = null; } };
      const { hote } = await monter({ donnees: { ...donnees, brouillon } });
      await cliquer(onglet(hote));
      await taper(hote.querySelector('input[aria-label="Valeur de SEUIL_MARCHE_M"]'), '0.9');
      expect(Object.keys(JSON.parse(mem.texte!))).toEqual(['reglagesToits']);
      expect(JSON.parse(mem.texte!).reglagesToits).toContain('"valeur": 0.9,');
      act(() => monte!.racine.unmount()); monte!.hote.remove(); monte = null;
      const second = await monter({ donnees: { ...donnees, brouillon } });
      await cliquer(onglet(second.hote));
      expect((second.hote.querySelector('input[aria-label="Valeur de SEUIL_MARCHE_M"]') as HTMLInputElement).value).toBe('0.9');
      await cliquer(bouton(fichier(second.hote, 'reglagesToits'), 'Revenir au livré'));
      expect(mem.texte).toBeNull();
    });
  });
});

// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { createElement, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { EcranPalette, ongletDeLAdresse, texteCss } from '../../../src/zones/EcranPalette.js';
import { demandeEcranPalette } from '../../../src/app/ecranPalette.js';
import { MODELES_PALETTE } from '../../../src/styles/modeles.js';
import { JETONS, FAMILLES_JETONS, ROLES_JETONS, PAIRES_CONTRASTE, POLICES, RAYONS, ECHELLE_TEXTE } from '../../../src/styles/jetons.js';

// L'ecran de la palette (`?palette`) : il montre chaque jeton, famille par
// famille, chaque paire de contraste, et pose sur chaque panneau les variables de son theme.

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const telecharges: { nom: string; texte: string }[] = [];
vi.mock('../../../src/shell/download.js', () => ({ telechargerTexte: (nom: string, texte: string) => { telecharges.push({ nom, texte }); } }));

describe('l ecran de la palette', () => {
  let monte: { racine: Root; hote: HTMLElement } | null = null;
  afterEach(() => { if (monte) { const m = monte; act(() => m.racine.unmount()); m.hote.remove(); monte = null; } });
  const monter = (props: Parameters<typeof EcranPalette>[0] = {}) => {
    // L'onglet se lit dans l'adresse : chaque ecran part de la palette.
    history.replaceState(null, '', '/');
    const hote = document.createElement('div');
    document.body.appendChild(hote);
    const racine = createRoot(hote);
    act(() => { racine.render(createElement(EcranPalette, props)); });
    monte = { racine, hote };
    return hote;
  };

  it('s ouvre sur ?palette (et l ancienne adresse), pas sur l ecran des controleurs', () => {
    expect(demandeEcranPalette('?palette')).toBe(true);
    expect(demandeEcranPalette('?admin&ecran=palette')).toBe(true);
    expect(demandeEcranPalette('')).toBe(false);
    expect(demandeEcranPalette('?admin&ecran=controleurs')).toBe(false);
  });

  it('range chaque jeton dans une famille, et chaque famille en a au moins un', () => {
    const familles = new Set(Object.values(ROLES_JETONS).map(r => r.famille));
    expect([...familles].sort()).toEqual(FAMILLES_JETONS.map(f => f.id).sort());
    expect(Object.keys(ROLES_JETONS).sort()).toEqual(Object.keys(JETONS.clair).sort());
  });

  it('montre une carte par jeton et une ligne par paire de contraste', () => {
    const hote = monter();
    const noms = [...hote.querySelectorAll('.palCarte .palNom')].map(e => e.textContent);
    expect(noms.sort()).toEqual(Object.keys(ROLES_JETONS).map(n => '--' + n).sort());
    expect(hote.querySelectorAll('.palContrastes tbody tr').length).toBe(PAIRES_CONTRASTE.length);
    // Le verdict est ecrit en toutes lettres, pas porte par la seule couleur.
    expect(hote.querySelectorAll('.palVerdict--non').length).toBe(0);
  });

  it('pose les variables de chaque theme sur son panneau, et n en montre qu un sur demande', () => {
    const hote = monter();
    const sombre = hote.querySelector<HTMLElement>('[data-theme-montre="sombre"]')!;
    expect(sombre.style.getPropertyValue('--ink')).toBe(JETONS.sombre.ink);
    const clair = [...hote.querySelectorAll('[role="radio"]')].find(b => b.textContent === 'Clair') as HTMLButtonElement;
    act(() => { clair.click(); });
    expect(hote.querySelectorAll('[data-theme-montre="sombre"]').length).toBe(0);
    expect(hote.querySelectorAll('[data-theme-montre="clair"]').length).toBeGreaterThan(0);
  });

  const onglet = (hote: HTMLElement, nom: string) => {
    const b = [...hote.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find(e => e.textContent === nom)!;
    act(() => { b.click(); });
  };

  it('range l ecran en trois onglets : Palette, CSS, Typo', () => {
    const hote = monter();
    expect([...hote.querySelectorAll('[role="tab"]')].map(e => e.textContent)).toEqual(['Palette', 'CSS', 'Typo']);
    expect(hote.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toBe('Palette');
    expect(hote.querySelector('.palCodeTexte')).toBeNull();
    onglet(hote, 'CSS');
    expect(hote.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toBe('CSS');
    expect(hote.querySelector('.palCarte')).toBeNull();
    expect(hote.querySelector('.palCodeTexte')?.textContent).toContain('--ink: ' + JETONS.clair.ink + ';');
    expect(ongletDeLAdresse('#typo')).toBe('typo');
    expect(ongletDeLAdresse('#inconnu')).toBe('palette');
  });

  it('a un bouton de retour au plan', () => {
    const hote = monter();
    expect(hote.querySelector<HTMLAnchorElement>('.ecranRetour')?.getAttribute('href')).toBe('?admin');
  });

  it('engendre les declarations CSS des deux themes, polices et rayons compris', () => {
    const css = texteCss();
    for (const n of Object.keys(JETONS.clair)) expect(css).toContain('--' + n + ': ');
    for (const [n, v] of Object.entries(RAYONS)) expect(css).toContain('--' + n + ': ' + v + ';');
    expect(css).toContain('--serif: ' + POLICES.serif.pile + ';');
    expect(css.slice(css.indexOf('@media'))).toContain('--ink: ' + JETONS.sombre.ink + ';');
  });

  it('montre chaque police et chaque taille de l echelle, dans chaque theme', () => {
    const hote = monter();
    onglet(hote, 'Typo');
    const themes = hote.querySelectorAll('.palTypo').length;
    expect(themes).toBe(2);
    expect(hote.querySelectorAll('.palPolice').length).toBe(Object.keys(POLICES).length * themes);
    expect(hote.querySelectorAll('.palEchelleExemple').length).toBe(ECHELLE_TEXTE.length * themes);
  });

  /** Saisit un code de couleur comme au clavier. */
  const saisir = (champ: HTMLInputElement, valeur: string) => {
    const poser = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    act(() => { poser.call(champ, valeur); champ.dispatchEvent(new Event('input', { bubbles: true })); });
  };
  const code = (hote: HTMLElement, nom: string, theme: string) =>
    hote.querySelector<HTMLInputElement>('[data-jeton="' + nom + '"] [data-theme="' + theme + '"] .palCodeCouleur')!;
  const bouton = (hote: HTMLElement, texte: string) => [...hote.querySelectorAll<HTMLButtonElement>('button')].find(b => b.textContent === texte)!;

  it('donne a chaque couleur un selecteur et un code, par theme', () => {
    const hote = monter();
    const n = Object.keys(ROLES_JETONS).length;
    expect(hote.querySelectorAll('.palCarte input[type="color"]').length).toBe(n * 2);
    expect(hote.querySelectorAll('.palCarte .palCodeCouleur').length).toBe(n * 2);
    expect(code(hote, 'accent', 'sombre').value).toBe(JETONS.sombre.accent);
  });

  it('applique un code valide partout, et signale un code invalide sans rien changer', () => {
    const hote = monter();
    saisir(code(hote, 'accent', 'clair'), '#336699');
    const carte = hote.querySelector('[data-jeton="accent"]')!;
    expect(carte.querySelector<HTMLInputElement>('[data-theme="clair"] input[type="color"]')!.value).toBe('#336699');
    expect(hote.querySelector('[data-theme-montre="clair"]')!.getAttribute('style')).toContain('--accent: #336699');
    expect(hote.textContent).toContain('modifications non enregistrées');
    saisir(code(hote, 'ink', 'clair'), '#12');
    expect(code(hote, 'ink', 'clair').getAttribute('aria-invalid')).toBe('true');
    expect(hote.querySelector('[data-theme-montre="clair"]')!.getAttribute('style')).toContain('--ink: ' + JETONS.clair.ink);
    // Un contraste qui tombe se dit dans la barre.
    saisir(code(hote, 'ink-soft', 'clair'), '#FFFDF8');
    expect(hote.querySelector('.palPastilleContraste')?.textContent).toMatch(/insuffisant/);
  });

  it('enregistre sur le serveur, exporte le JSON, et annule les modifications', async () => {
    const enregistres: unknown[] = [];
    const appliquees: unknown[] = [];
    const hote = monter({ enregistrer: async (d) => { enregistres.push(d); return null; }, appliquer: (c) => { appliquees.push(c); } });
    expect(bouton(hote, 'Enregistrer…').disabled).toBe(true);
    saisir(code(hote, 'ok', 'sombre'), '#00FF00');
    expect(bouton(hote, 'Enregistrer…').disabled).toBe(false);
    // Le recapitulatif nomme ce qui part sur le serveur, avant et apres, et rien n'est encore envoye.
    act(() => { bouton(hote, 'Enregistrer…').click(); });
    const recap = hote.querySelector('.palRecapitulatif')!;
    expect(recap.getAttribute('role')).toBe('alertdialog');
    expect(recap.querySelectorAll('.palDifferences li')).toHaveLength(1);
    expect(recap.textContent).toContain('--ok');
    expect(recap.textContent).toContain(JETONS.sombre.ok);
    expect(recap.textContent).toContain('#00FF00');
    expect(enregistres).toHaveLength(0);
    await act(async () => { bouton(hote, 'Enregistrer sur le serveur').click(); });
    expect(enregistres).toHaveLength(1);
    expect((enregistres[0] as { couleurs: { sombre: { ok: string } } }).couleurs.sombre.ok).toBe('#00FF00');
    expect(appliquees).toHaveLength(1);
    expect(hote.querySelector('.palRecapitulatif')).toBeNull();
    expect(bouton(hote, 'Enregistrer…').disabled).toBe(true);
    act(() => { bouton(hote, 'Exporter le JSON').click(); });
    expect(telecharges.at(-1)?.nom).toBe('plan-palette.json');
    expect(JSON.parse(telecharges.at(-1)!.texte).couleurs.sombre.ok).toBe('#00FF00');
    saisir(code(hote, 'ok', 'sombre'), '#0000FF');
    act(() => { bouton(hote, 'Annuler les modifications').click(); });
    expect(code(hote, 'ok', 'sombre').value).toBe('#00FF00');
    act(() => { bouton(hote, 'Couleurs d’origine').click(); });
    expect(code(hote, 'ok', 'sombre').value).toBe(JETONS.sombre.ok);
  });

  it('part de la palette du serveur quand il y en a une', () => {
    const c = JSON.parse(JSON.stringify(JETONS));
    c.clair.accent = '#123456';
    const hote = monter({ enregistree: { couleurs: c, modifieLe: '2026-10-03T08:00:00.000Z' } });
    expect(code(hote, 'accent', 'clair').value).toBe('#123456');
    expect(hote.textContent).toContain('Palette du serveur, enregistrée le');
  });

  it('importe un JSON de palette sans l enregistrer, et refuse un fichier qui n en est pas un', async () => {
    const enregistres: unknown[] = [];
    const hote = monter({ enregistrer: async (d) => { enregistres.push(d); return null; } });
    const champ = hote.querySelector<HTMLInputElement>('input[type="file"]')!;
    const deposer = async (nom: string, texte: string) => {
      Object.defineProperty(champ, 'files', { configurable: true, value: [new File([texte], nom, { type: 'application/json' })] });
      await act(async () => { champ.dispatchEvent(new Event('change', { bubbles: true })); for (let i = 0; i < 20; i++) await new Promise(r => setTimeout(r, 5)); });
    };
    await deposer('autre.json', JSON.stringify({ format: 'plan-palette', couleurs: { clair: { accent: '#AA2200', ink: 'rouge' } } }));
    expect(code(hote, 'accent', 'clair').value).toBe('#AA2200');
    expect(code(hote, 'ink', 'clair').value).toBe(JETONS.clair.ink);
    expect(hote.querySelector('.palMessage')?.textContent).toMatch(/importée de « autre\.json » : 1 couleur/);
    expect(enregistres).toHaveLength(0);
    expect(bouton(hote, 'Enregistrer…').disabled).toBe(false);
    await deposer('plan.json', JSON.stringify({ objects: [] }));
    expect(hote.querySelector('.palMessage--erreur')?.textContent).toMatch(/n’est pas une palette/);
    expect(code(hote, 'accent', 'clair').value).toBe('#AA2200');
    await deposer('casse.json', '{ pas du json');
    expect(hote.querySelector('.palMessage--erreur')?.textContent).toMatch(/casse\.json/);
  });

  it('propose les huit modeles et en charge un sans l enregistrer', () => {
    const enregistres: unknown[] = [];
    const hote = monter({ enregistrer: async (d) => { enregistres.push(d); return null; } });
    const entrees = [...hote.querySelectorAll<HTMLButtonElement>('.palMenuModeles [data-modele]')];
    expect(entrees.map(b => b.querySelector('.palModeleNom')?.textContent)).toEqual(['Eau vive', 'Vert jardin', 'Fleurie', 'Zen', 'Monochrome', 'Multicolore', 'Psychédélique', 'Halloween']);
    const halloween = MODELES_PALETTE.find(m => m.id === 'halloween')!;
    act(() => { entrees.find(b => b.dataset.modele === 'halloween')!.click(); });
    expect(code(hote, 'accent', 'clair').value).toBe(halloween.couleurs.clair.accent);
    expect(code(hote, 'paper', 'sombre').value).toBe(halloween.couleurs.sombre.paper);
    expect(hote.querySelector('.palMessage')?.textContent).toMatch(/Modèle « Halloween » chargé/);
    expect(enregistres).toHaveLength(0);
    expect(bouton(hote, 'Enregistrer…').disabled).toBe(false);
  });

  it('demande confirmation, dans l ecran, avant de remplacer des reglages non enregistres', () => {
    const hote = monter();
    saisir(code(hote, 'ink', 'clair'), '#101010');
    const zen = () => hote.querySelector<HTMLButtonElement>('[data-modele="zen"]')!;
    act(() => { zen().click(); });
    const confirmation = hote.querySelector('.palConfirmation')!;
    expect(confirmation.getAttribute('role')).toBe('alertdialog');
    expect(code(hote, 'ink', 'clair').value).toBe('#101010');
    act(() => { bouton(hote, 'Garder mes réglages').click(); });
    expect(hote.querySelector('.palConfirmation')).toBeNull();
    expect(code(hote, 'ink', 'clair').value).toBe('#101010');
    act(() => { zen().click(); });
    act(() => { bouton(hote, 'Charger le modèle').click(); });
    expect(code(hote, 'ink', 'clair').value).toBe(MODELES_PALETTE.find(m => m.id === 'zen')!.couleurs.clair.ink);
  });

  it('mene des contrastes insuffisants au tableau filtre sur les paires en defaut', () => {
    const hote = monter();
    expect(hote.querySelector('.palPastilleContraste')).toBeNull();
    saisir(code(hote, 'ink-soft', 'clair'), '#FFFDF8');
    const pastille = hote.querySelector<HTMLButtonElement>('.palPastilleContraste')!;
    expect(pastille.textContent).toBe('3 contrastes insuffisants');
    act(() => { pastille.click(); });
    const lignes = [...hote.querySelectorAll('.palContrastes tbody tr')];
    expect(lignes).toHaveLength(3);
    expect(lignes.every(l => l.textContent!.includes('--ink-soft'))).toBe(true);
    act(() => { hote.querySelector<HTMLInputElement>('.palFiltreContraste input')!.click(); });
    expect(hote.querySelectorAll('.palContrastes tbody tr').length).toBe(PAIRES_CONTRASTE.length);
  });

  it('previent, au recapitulatif, que des contrastes restent insuffisants', () => {
    const hote = monter({ enregistrer: async () => null });
    saisir(code(hote, 'ink-soft', 'clair'), '#FFFDF8');
    act(() => { bouton(hote, 'Enregistrer…').click(); });
    expect(hote.querySelector('.palRecapitulatif')!.textContent).toMatch(/3 contrastes restent insuffisants/);
    act(() => { bouton(hote, 'Revoir').click(); });
    expect(hote.querySelector('.palRecapitulatif')).toBeNull();
  });
});

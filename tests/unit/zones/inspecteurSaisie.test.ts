// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { createElement } from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Inspecteur } from '../../../src/zones/Inspecteur.js';
import { Voile } from '../../../src/zones/composants/Feuille.js';
import { creerMagasin, HAUTEUR_PAR_DEFAUT, type Magasin } from '../../../src/app/magasin.js';
import { creerRegistre } from '../../../src/app/commandes.js';
import { CLASSES, type Classe } from '../../../src/app/exposition.js';
import { chercherReglages, normaliser } from '../../../src/ui/champs/recherche.js';
import type { Champ, ContexteChamps, Section } from '../../../src/ui/champs/types.js';
import type { Inspecteur as ServiceInspecteur } from '../../../src/app/inspecteur.js';
import type { EtatApp } from '../../../src/core/state.js';
import type { ObjetPlan } from '../../../src/model/types.js';

// La seconde moitie de l'audit de l'inspecteur (22 novembre 2026) : le widget nombre (B4), la recherche d'un reglage (B6) et la
// feuille a mi-hauteur au telephone (B8).

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const rien = () => undefined;
let pente = 20;
let entraxe = 40;
const ecrites: { cle: string; v: number; historique: boolean | undefined }[] = [];

function sections(): Section[] {
  return [
    { id: 'objet', titre: 'Objet', champs: [{ type: 'texte', cle: 'nom', libelle: 'Nom', lire: () => 'Pergola', ecrire: rien }] },
    { id: 'pergola', titre: 'Pergola', principale: true, champs: [
      { type: 'nombre', cle: 'pente', libelle: 'Pente', unite: '°', pas: 1, min: 2, max: 45, lire: () => pente, ecrire: (_c, v) => { pente = v; } },
      { type: 'nombre', cle: 'entraxe', libelle: 'Entraxe solives', unite: 'cm', pas: 5, min: 20, aide: 'Distance entre deux solives, d’axe en axe', lire: () => entraxe, ecrire: (_c, v) => { entraxe = v; } },
      { type: 'case', cle: 'detail', libelle: 'Épaisseur réglée', repli: 'Détail', lire: () => false, ecrire: rien },
      { type: 'nombre', cle: 'kPortee', libelle: 'K portée', pas: 0.1, expert: true, lire: () => 25, ecrire: rien },
      { type: 'nombre', cle: 'cache', libelle: 'Entraxe des plots', pas: 5, visible: () => false, lire: () => 65, ecrire: rien }
    ] },
    { id: 'cotes', titre: 'Côtés', repliee: true, champs: [{ type: 'lecture', cle: 'cote0', libelle: 'Côté 1', valeur: () => '3,20 m' }] }
  ];
}

function monter(classe: Classe, magasin?: Magasin): { racine: Root; hote: HTMLElement; magasin: Magasin; fermer: () => void } {
  const obj = { key: 'o1', name: 'Pergola', type: 'polygon', fonction: 'pergola', pts: [] } as unknown as ObjetPlan;
  const etat = { objects: [obj], selectedKey: 'o1' } as unknown as EtatApp;
  const m = magasin ?? creerMagasin(etat);
  m.definirClasse(classe);
  const contexte = () => ({ etat, obj, modeSimple: !m.store.getState().options.modeExpert }) as unknown as ContexteChamps;
  const service: ServiceInspecteur = {
    objet: () => obj, parcelle: () => undefined, contexte, titre: () => 'Pergola', sections: () => sections(),
    appliquer: (champ: Champ, _c, ecrire) => { const r = ecrire(); if (champ.type === 'nombre') ecrites.push({ cle: champ.cle, v: champ.lire({} as ContexteChamps), historique: champ.historique }); return r !== false; },
    executer: rien, basculerOuverture: rien
  };
  const hote = document.createElement('div');
  document.body.appendChild(hote);
  const racine = createRoot(hote);
  act(() => { racine.render(createElement(Inspecteur, { magasin: m, commandes: creerRegistre(), inspecteur: service })); });
  return { racine, hote, magasin: m, fermer: () => { act(() => racine.unmount()); hote.remove(); } };
}

const attendre = (ms = 30) => act(() => new Promise<void>((r) => setTimeout(r, ms)));
let monte: ReturnType<typeof monter> | null = null;
afterEach(() => { monte?.fermer(); monte = null; ecrites.length = 0; pente = 20; entraxe = 40; vi.useRealTimers(); });

describe('le widget nombre (decision B4)', () => {
  for (const classe of CLASSES) {
    it('a ses « − » et « + », et un curseur quand ses deux bornes sont fermes, en ' + classe, () => {
      monte = monter(classe);
      const ligne = (cle: string) => monte!.hote.querySelector<HTMLElement>('[data-cle="' + cle + '"]')!;
      expect(ligne('pente').querySelectorAll('button.pasBouton')).toHaveLength(2);
      expect(ligne('entraxe').querySelectorAll('button.pasBouton')).toHaveLength(2);
      const curseur = ligne('pente').querySelector<HTMLInputElement>('input[type=range]')!;
      expect([curseur.min, curseur.max, curseur.value]).toEqual(['2', '45', '20']);
      expect(curseur.getAttribute('aria-label')).toBe('Pente (curseur)');
      // Sans borne haute, pas de curseur : il inventerait une limite.
      expect(ligne('entraxe').querySelector('input[type=range]')).toBeNull();
    });

    it('le curseur ecrit a chaque cran, et sa glissade ne fait qu un pas d annulation, en ' + classe, () => {
      monte = monter(classe);
      const curseur = monte.hote.querySelector<HTMLInputElement>('[data-cle="pente"] input[type=range]')!;
      const poser = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
      for (const v of ['25', '30', '31']) act(() => { poser.call(curseur, v); curseur.dispatchEvent(new Event('input', { bubbles: true })); });
      expect(ecrites.map((e) => e.v)).toEqual([25, 30, 31]);
      expect(ecrites.map((e) => e.historique)).toEqual([undefined, false, false]);
    });

    it('maintenu, « − » accelere, et un seul pas d annulation couvre l appui, en ' + classe, () => {
      vi.useFakeTimers();
      entraxe = 125;
      monte = monter(classe);
      const moins = monte.hote.querySelector<HTMLButtonElement>('[data-cle="entraxe"] button.pasBouton')!;
      // jsdom n'a pas de PointerEvent : un MouseEvent du meme nom porte le bouton, et React le lit pareil.
      act(() => { moins.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 })); });
      act(() => { vi.advanceTimersByTime(400 + 90 * 12); });
      act(() => { moins.dispatchEvent(new MouseEvent('pointerup', { bubbles: true })); });
      const pas = ecrites.map((e, i) => (i ? ecrites[i - 1]!.v - e.v : 125 - e.v));
      // L'appui et ses cinq premieres repetitions font un pas de 5 cm, pour viser pres ; puis le pas double.
      expect(pas.slice(0, 6)).toEqual([5, 5, 5, 5, 5, 5]);
      expect(pas.slice(6, -1)).toEqual(Array(pas.length - 7).fill(10));
      // Le dernier pas s'arrete au minimum : de 125 a 20 cm en un appui de 1,5 s.
      expect(entraxe).toBe(20);
      expect(ecrites.filter((e) => e.historique !== false)).toHaveLength(1);
    });
  }

  it('au bureau, « − » et « + » restent hors de la tabulation : les fleches du champ font le meme pas', () => {
    monte = monter('large');
    const boutons = [...monte.hote.querySelectorAll<HTMLButtonElement>('[data-cle="pente"] button.pasBouton')];
    expect(boutons.map((b) => b.tabIndex)).toEqual([-1, -1]);
    expect(boutons.map((b) => b.getAttribute('aria-label'))).toEqual(['Diminuer Pente', 'Augmenter Pente']);
    expect(monte.hote.querySelector('[data-cle="pente"] input[type=number]')).not.toBeNull();
  });
});

describe('chercher un reglage (decision B6)', () => {
  const c = (modeSimple: boolean) => ({ modeSimple }) as unknown as ContexteChamps;

  it('lit libelles et aides sans accents ni majuscules, et les libelles passent devant', () => {
    expect(normaliser('  Épaisseur   RÉGLÉE ')).toBe('epaisseur reglee');
    expect(chercherReglages(sections(), c(false), 'EPAIS').map((r) => r.cle)).toEqual(['detail']);
    // « axe » n'est que dans l'aide d'« Entraxe solives »... et dans le libelle d'« Entraxe » : les deux, le libelle devant.
    expect(chercherReglages(sections(), c(false), 'distance').map((r) => r.cle)).toEqual(['entraxe']);
    expect(chercherReglages(sections(), c(false), 'cote').map((r) => r.titreSection)).toEqual(['Côtés']);
  });

  it('trouve ce que le mode simple cache, en le disant, mais pas ce que sa condition cache', () => {
    expect(chercherReglages(sections(), c(true), 'portee')).toMatchObject([{ cle: 'kPortee', avance: true }]);
    expect(chercherReglages(sections(), c(false), 'portee')).toMatchObject([{ cle: 'kPortee', avance: false }]);
    expect(chercherReglages(sections(), c(true), 'plots')).toEqual([]);
    expect(chercherReglages(sections(), c(true), 'e')).toEqual([]);
  });

  for (const classe of CLASSES) {
    it('ouvre la section du reglage choisi, deplie son pli, le met en evidence, en ' + classe, async () => {
      monte = monter(classe);
      const champ = monte.hote.querySelector<HTMLInputElement>('input[type=search]')!;
      expect(champ.getAttribute('aria-label')).toBe('Chercher un réglage');
      const poser = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
      act(() => { poser.call(champ, 'epaisseur reglee'); champ.dispatchEvent(new Event('input', { bubbles: true })); });
      const resultats = [...monte.hote.querySelectorAll<HTMLButtonElement>('.resultatsRecherche button')];
      expect(resultats.map((b) => b.textContent)).toEqual(['Épaisseur régléePergola']);
      // On ferme la section avant d'y aller : la recherche doit la rouvrir.
      act(() => { monte!.hote.querySelector<HTMLDetailsElement>('details[data-section="pergola"]')!.open = false; });
      act(() => { resultats[0]!.click(); });
      await attendre(40);
      const section = monte.hote.querySelector<HTMLDetailsElement>('details[data-section="pergola"]')!;
      expect(section.open).toBe(true);
      expect(monte.hote.querySelector<HTMLDetailsElement>('details[data-pli="Détail"]')!.open).toBe(true);
      expect(monte.hote.querySelector('[data-cle="detail"]')!.classList.contains('champTrouve')).toBe(true);
      // La recherche s'efface ; au bureau seulement, le champ recoit le focus (au doigt, il ouvrirait le clavier).
      expect(champ.value).toBe('');
      expect(monte.hote.querySelector('[data-cle="detail"]')!.contains(document.activeElement)).toBe(classe === 'large');
    });

    it('un reglage avance allume le mode expert, puis y va, en ' + classe, async () => {
      monte = monter(classe);
      expect(monte.hote.querySelector('[data-cle="kPortee"]')).toBeNull();
      const champ = monte.hote.querySelector<HTMLInputElement>('input[type=search]')!;
      const poser = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
      act(() => { poser.call(champ, 'k portée'); champ.dispatchEvent(new Event('input', { bubbles: true })); });
      const resultat = monte.hote.querySelector<HTMLButtonElement>('.resultatsRecherche button')!;
      expect(resultat.textContent).toContain('avancé');
      act(() => { resultat.click(); });
      await attendre(40);
      expect(monte.magasin.store.getState().options.modeExpert).toBe(true);
      expect(monte.hote.querySelector('[data-cle="kPortee"]')!.classList.contains('champTrouve')).toBe(true);
    });

    it('Entree va au premier resultat, Echap vide la recherche, et elle dit quand rien ne repond, en ' + classe, async () => {
      monte = monter(classe);
      const champ = monte.hote.querySelector<HTMLInputElement>('input[type=search]')!;
      const poser = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
      const taper = (t: string) => act(() => { poser.call(champ, t); champ.dispatchEvent(new Event('input', { bubbles: true })); });
      taper('zzz');
      expect(monte.hote.querySelector('.etatRecherche')?.textContent).toBe('Aucun réglage de cet objet ne porte ce nom.');
      taper('pent');
      act(() => { champ.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })); });
      expect(champ.value).toBe('');
      taper('pent');
      act(() => { champ.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })); });
      await attendre(40);
      expect(monte.hote.querySelector('[data-cle="pente"]')!.classList.contains('champTrouve')).toBe(true);
    });
  }
});

describe('la feuille des proprietes a mi-hauteur au telephone (decision B8)', () => {
  it('s ouvre a mi-hauteur ; les resultats et le projet restent en plein ecran', () => {
    expect(HAUTEUR_PAR_DEFAUT.proprietes).toBe('mi');
    expect([HAUTEUR_PAR_DEFAUT.resultats, HAUTEUR_PAR_DEFAUT.projet]).toEqual(['plein', 'plein']);
  });

  it('monte en plein ecran quand un champ appelle le clavier, pas pour un « − » ni un curseur', () => {
    const etat = { objects: [], selectedKey: null } as unknown as EtatApp;
    const magasin = creerMagasin(etat);
    monte = monter('compact', magasin);
    act(() => { magasin.definirFeuille('proprietes'); });
    expect(magasin.store.getState().hauteurFeuille).toBe('mi');
    act(() => { monte!.hote.querySelector<HTMLButtonElement>('[data-cle="pente"] button.pasBouton')!.focus(); });
    act(() => { monte!.hote.querySelector<HTMLInputElement>('[data-cle="pente"] input[type=range]')!.focus(); });
    expect(magasin.store.getState().hauteurFeuille).toBe('mi');
    act(() => { monte!.hote.querySelector<HTMLInputElement>('[data-cle="pente"] input[inputmode="decimal"]')!.focus(); });
    expect(magasin.store.getState().hauteurFeuille).toBe('plein');
  });

  it('a mi-hauteur, le voile laisse voir le plan sans l assombrir ; en plein ecran, il l assombrit', () => {
    const etat = { objects: [], selectedKey: null } as unknown as EtatApp;
    const magasin = creerMagasin(etat);
    magasin.definirClasse('compact');
    const hote = document.createElement('div');
    document.body.appendChild(hote);
    const racine = createRoot(hote);
    act(() => { racine.render(createElement(Voile, { magasin })); });
    act(() => { magasin.definirFeuille('proprietes'); });
    expect(hote.querySelector('.voileFeuille')!.classList.contains('voileTransparent')).toBe(true);
    act(() => { magasin.definirHauteurFeuille('plein'); });
    expect(hote.querySelector('.voileFeuille')!.classList.contains('voileTransparent')).toBe(false);
    // Les autres feuilles du telephone gardent leur voile.
    act(() => { magasin.definirFeuille('objets'); });
    expect(hote.querySelector('.voileFeuille')!.classList.contains('voileTransparent')).toBe(false);
    act(() => racine.unmount()); hote.remove();
  });
});

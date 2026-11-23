// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createElement } from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Inspecteur } from '../../../src/zones/Inspecteur.js';
import { creerMagasin } from '../../../src/app/magasin.js';
import { creerRegistre } from '../../../src/app/commandes.js';
import { CLASSES } from '../../../src/app/exposition.js';
import type { Champ, ContexteChamps, Section } from '../../../src/ui/champs/types.js';
import type { Inspecteur as ServiceInspecteur } from '../../../src/app/inspecteur.js';
import type { EtatApp } from '../../../src/core/state.js';
import type { ObjetPlan } from '../../../src/model/types.js';

// La carte des champs (MD/spec-ihm-mobile.md §3.2) : le telephone change la FORME d'un champ, jamais
// sa presence. L'inspecteur ne connait aucun champ par son nom, il rend des descripteurs ; on lui
// donne donc une section qui porte un champ de chaque type, et on verifie que chacun est rendu, une
// fois, dans chaque classe d'ecran.

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const rien = () => undefined;

/** Ce que lit le nombre borne : un test le change pour jouer un projet qui porte une valeur hors bornes. */
let entraxe = 40;
/** Les valeurs que le nombre borne a recues, et celle qu'il refuse de lui-meme. */
const ecrites: number[] = [];

/** Un champ de chaque type, et une ligne qui en porte trois. */
function champs(): Champ[] {
  return [
    { type: 'nombre', cle: 'borne', libelle: 'Entraxe', unite: 'cm', pas: 5, min: 20, max: 150, lire: () => entraxe, ecrire: (_c, v) => { if (v === 99) return false; ecrites.push(v); entraxe = v; } },
    { type: 'texte', cle: 'texte', libelle: 'Texte', aide: 'Ce que ce texte règle, en une phrase.', lire: () => 'abc', ecrire: rien },
    { type: 'case', cle: 'grisee', libelle: 'Grisée', aide: 'Pourquoi cette case est grisée.', actif: () => false, lire: () => false, ecrire: rien },
    { type: 'nombre', cle: 'nombre', libelle: 'Nombre', unite: 'cm', pas: 5, lire: () => 40, ecrire: rien },
    { type: 'case', cle: 'case', libelle: 'Case', lire: () => true, ecrire: rien },
    { type: 'choix', cle: 'choixCourt', libelle: 'Choix court', options: () => [{ valeur: 'a', libelle: 'A' }, { valeur: 'b', libelle: 'B' }], lire: () => 'a', ecrire: rien },
    { type: 'choix', cle: 'choixOptionsLongues', libelle: 'Lame', options: () => ['a', 'b', 'c', 'd'].map(v => ({ valeur: v, libelle: v + ' — une lame du commerce de 145 × 27 mm' })), lire: () => 'a', ecrire: rien },
    { type: 'choix', cle: 'choixLong', libelle: 'Choix long', options: () => ['a', 'b', 'c', 'd', 'e'].map(v => ({ valeur: v, libelle: v.toUpperCase() })), lire: () => 'c', ecrire: rien },
    { type: 'couleur', cle: 'couleur', libelle: 'Couleur', lire: () => '#336699', ecrire: rien },
    { type: 'date', cle: 'date', libelle: 'Date', lire: () => '2026-06-21', ecrire: rien },
    { type: 'curseur', cle: 'curseur', libelle: 'Curseur', min: 0, max: 100, pas: 5, format: (v) => v + ' %', lire: () => 50, ecrire: rien },
    { type: 'lecture', cle: 'lecture', libelle: 'Lecture', valeur: () => '12,5 m²' },
    { type: 'texture', cle: 'texture', libelle: 'Texture', lire: () => null, ecrire: rien },
    { type: 'bouton', cle: 'bouton', libelle: 'Bouton', agit: 'interface', executer: rien },
    { type: 'bouton', cle: 'boutonLarge', libelle: '', texte: () => 'Bouton pleine largeur', agit: 'interface', executer: rien },
    { type: 'alerte', cle: 'alerte', libelle: '', texte: () => 'Attention' },
    { type: 'carte', cle: 'carte', libelle: '', nom: 'Carte', carte: () => ({ largeur: 4, hauteur: 3, cellules: [{ coins: [{ x: 1, y: 1 }, { x: 2, y: 1 }, { x: 2, y: 2 }, { x: 1, y: 2 }], couleur: 'hsl(0, 80%, 48%)', z: 7 }], contour: [{ x: 1, y: 1 }, { x: 3, y: 1 }, { x: 3, y: 2 }], corps: [{ coins: [{ x: 1, y: 1 }, { x: 3, y: 1 }, { x: 3, y: 2 }, { x: 1, y: 2 }], faitage: { de: { x: 1, y: 1.5 }, a: { x: 3, y: 1.5 } }, aretiers: [], libelle: { a: { x: 2, y: 1.5 }, texte: '7,0 m' } }], pignons: [], nord: 20, zMin: 3, zMax: 7 }) },
    { type: 'ligne', cle: 'ligne', libelle: 'Côté 1', champs: [
      { type: 'texte', cle: 'nom', libelle: 'Nom', lire: () => 'AB', ecrire: rien },
      { type: 'nombre', cle: 'longueur', libelle: 'Longueur', unite: 'm', lire: () => 3.2, ecrire: rien },
      { type: 'case', cle: 'fige', libelle: 'Figé', lire: () => false, ecrire: rien },
      { type: 'bouton', cle: 'supprimer', libelle: 'Supprimer', agit: 'projet', executer: rien }
    ] },
    { type: 'texte', cle: 'invisible', libelle: 'Invisible', visible: () => false, lire: () => '', ecrire: rien }
  ];
}

const SECTIONS: Section[] = [
  { id: 'tous', titre: 'Tous les types', champs: champs() },
  { id: 'repliee', titre: 'Repliée', repliee: true, champs: [{ type: 'lecture', cle: 'dansRepliee', libelle: 'Dans une section repliée', valeur: () => 'x' }] }
];

const CLES_ATTENDUES = ['borne', 'texte', 'grisee', 'nombre', 'case', 'choixCourt', 'choixOptionsLongues', 'choixLong', 'couleur', 'date', 'curseur', 'lecture', 'texture', 'bouton', 'boutonLarge', 'alerte', 'carte', 'ligne', 'dansRepliee'];

function monter(classe: string, appliquer: ServiceInspecteur['appliquer'] = () => true): { racine: Root; hote: HTMLElement } {
  const obj = { key: 'o1', name: 'Terrasse', type: 'polygon', fonction: 'terrasse', pts: [] } as unknown as ObjetPlan;
  const etat = { objects: [obj], selectedKey: 'o1' } as unknown as EtatApp;
  const magasin = creerMagasin(etat);
  const avecClasse = magasin as unknown as { definirClasse?: (c: string) => void };
  if (avecClasse.definirClasse) avecClasse.definirClasse(classe);
  const commandes = creerRegistre();
  const c = { etat, obj } as unknown as ContexteChamps;
  const service: ServiceInspecteur = {
    objet: () => obj,
    parcelle: () => undefined,
    contexte: () => c,
    titre: () => 'Polygone — Terrasse',
    sections: () => SECTIONS,
    appliquer,
    executer: rien,
    basculerOuverture: rien
  };
  const hote = document.createElement('div');
  document.body.appendChild(hote);
  const racine = createRoot(hote);
  act(() => { racine.render(createElement(Inspecteur, { magasin, commandes, inspecteur: service })); });
  return { racine, hote };
}

describe('la carte des champs de l inspecteur', () => {
  let monte: { racine: Root; hote: HTMLElement } | null = null;
  beforeEach(() => { monte = null; });
  afterEach(() => { if (monte) { const m = monte; act(() => m.racine.unmount()); m.hote.remove(); } });

  for (const classe of CLASSES) {
    it('rend chaque champ visible une fois, et aucun champ masque, en ' + classe, () => {
      monte = monter(classe);
      const cles = [...monte.hote.querySelectorAll('[data-cle]')].map(e => e.getAttribute('data-cle'));
      expect([...cles].sort()).toEqual([...CLES_ATTENDUES].sort());
    });

    it('garde les trois commandes d une ligne, en ' + classe, () => {
      monte = monter(classe);
      const ligne = monte.hote.querySelector('[data-cle="ligne"]')!;
      expect(ligne.querySelector('input[type="text"]')).not.toBeNull();
      expect(ligne.textContent).toContain('Supprimer');
      // Le nombre garde une saisie directe, quelle que soit sa forme (champ ou pas a pas).
      expect(ligne.querySelector('input[type="number"], input[inputmode="decimal"]')).not.toBeNull();
    });
  }
});

describe('les libelles qui se lisent', () => {
  for (const classe of CLASSES) {
    it('ecrit « Figé » a cote de sa case dans une ligne, en ' + classe, () => {
      // Sur un coin, la case n'avait aucun libelle visible : un interrupteur seul (audit de l'inspecteur, lot A5).
      const m = monter(classe);
      const ligne = m.hote.querySelector('[data-cle="ligne"]')!;
      expect(ligne.querySelector('.texteCase')?.textContent).toBe('Figé');
      expect(ligne.querySelector('.texteCase')?.closest('label')?.querySelector('input[type="checkbox"]')).not.toBeNull();
      // Hors d'une ligne, le libelle du champ suffit : pas de texte en double.
      expect(m.hote.querySelector('[data-cle="case"] .texteCase')).toBeNull();
      act(() => m.racine.unmount()); m.hote.remove();
    });

    it('marque une liste aux options longues, pour qu elle passe sous son libelle, en ' + classe, () => {
      const m = monter(classe);
      expect(m.hote.querySelector('[data-cle="choixOptionsLongues"] select')?.classList.contains('long')).toBe(true);
      expect(m.hote.querySelector('[data-cle="choixLong"] select')?.classList.contains('long')).toBe(false);
      act(() => m.racine.unmount()); m.hote.remove();
    });
  }
});

describe('la saisie d un nombre', () => {
  for (const classe of CLASSES) {
    it('n ecrit qu une fois quand on valide par Entree, en ' + classe, () => {
      // Entree validait, puis la sortie du champ validait une seconde fois : deux ecritures, deux
      // instantanes d'annulation, et un Ctrl+Z qui semblait ne rien faire (trouve par la liste de
      // fumee de la 2.1.0, point 17).
      let ecritures = 0;
      const m = monter(classe, (_ch, _c, ecrire) => { ecritures++; ecrire(); return true; });
      const champ = m.hote.querySelector<HTMLInputElement>('[data-cle="nombre"] input')!;
      act(() => { champ.focus(); });
      const poser = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
      act(() => { poser.call(champ, '55'); champ.dispatchEvent(new Event('input', { bubbles: true })); });
      act(() => { champ.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); });
      act(() => { champ.blur(); });
      expect(ecritures).toBe(1);
      act(() => m.racine.unmount()); m.hote.remove();
    });
  }
});

describe('l explication d un champ, au doigt comme a la souris', () => {
  // Audit de l'inspecteur, lot A2 : l'aide n'etait qu'une infobulle, qui ne s'affiche jamais au doigt.
  for (const classe of CLASSES) {
    it('un « i » pres du libelle ecrit l aide sous le champ, un second toucher la referme, en ' + classe, () => {
      const m = monter(classe);
      const ligne = m.hote.querySelector<HTMLElement>('[data-cle="texte"]')!;
      const i = ligne.querySelector<HTMLButtonElement>('label.libelle button.aideBouton')!;
      expect(i.getAttribute('aria-expanded')).toBe('false');
      expect(i.getAttribute('aria-label')).toBe('Explication : Texte');
      expect(ligne.querySelector('.aideChamp')).toBeNull();
      act(() => i.click());
      expect(i.getAttribute('aria-expanded')).toBe('true');
      const aide = ligne.querySelector<HTMLElement>('.aideChamp')!;
      expect(aide.textContent).toBe('Ce que ce texte règle, en une phrase.');
      expect(aide.id).toBe(i.getAttribute('aria-controls'));
      act(() => i.click());
      expect(i.getAttribute('aria-expanded')).toBe('false');
      expect(ligne.querySelector('.aideChamp')).toBeNull();
      // L'infobulle du bureau reste.
      expect(ligne.querySelector('label.libelle')?.getAttribute('title')).toBe('Ce que ce texte règle, en une phrase.');
      act(() => m.racine.unmount()); m.hote.remove();
    });

    it('Echap referme l aide, et toucher le libelle ne l ouvre pas, en ' + classe, () => {
      const m = monter(classe);
      const ligne = m.hote.querySelector<HTMLElement>('[data-cle="texte"]')!;
      const i = ligne.querySelector<HTMLButtonElement>('button.aideBouton')!;
      act(() => ligne.querySelector<HTMLElement>('.texteLibelle')!.click());
      expect(ligne.querySelector('.aideChamp')).toBeNull();
      act(() => i.click());
      expect(ligne.querySelector('.aideChamp')).not.toBeNull();
      act(() => { i.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
      expect(ligne.querySelector('.aideChamp')).toBeNull();
      act(() => m.racine.unmount()); m.hote.remove();
    });

    it('pas de « i » sans aide, ni sur une ligne composee, en ' + classe, () => {
      const m = monter(classe);
      expect(m.hote.querySelector('[data-cle="nombre"] button.aideBouton')).toBeNull();
      expect(m.hote.querySelector('[data-cle="ligne"] button.aideBouton')).toBeNull();
      act(() => m.racine.unmount()); m.hote.remove();
    });
  }

  it('au doigt, l aide d un champ grise reste ecrite sous lui, sans « i » en double', () => {
    for (const classe of CLASSES) {
      const m = monter(classe);
      const ligne = m.hote.querySelector<HTMLElement>('[data-cle="grisee"]')!;
      if (classe === 'large') expect(ligne.querySelector('button.aideBouton')).not.toBeNull();
      else {
        expect(ligne.querySelector('button.aideBouton')).toBeNull();
        expect(ligne.querySelector('.note')?.textContent).toBe('Pourquoi cette case est grisée.');
      }
      act(() => m.racine.unmount()); m.hote.remove();
    }
  });
});

describe('une valeur refusee dit pourquoi', () => {
  // Audit de l'inspecteur, lot A3 : au clavier, 3 et −10 passaient pour un minimum de 20, et un refus revenait sans un mot.
  const poser = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  const taper = (champ: HTMLInputElement, texte: string) => {
    act(() => { champ.focus(); });
    act(() => { poser.call(champ, texte); champ.dispatchEvent(new Event('input', { bubbles: true })); });
    act(() => { champ.blur(); });
  };
  const ouvrir = (classe: string) => {
    let appels = 0;
    const m = monter(classe, (_ch, _c, ecrire) => { appels++; return ecrire() !== false; });
    const ligne = m.hote.querySelector<HTMLElement>('[data-cle="borne"]')!;
    return { m, ligne, champ: ligne.querySelector<HTMLInputElement>('input')!, appels: () => appels, message: () => ligne.querySelector('.refusChamp')?.textContent ?? null, fermer: () => { act(() => m.racine.unmount()); m.hote.remove(); } };
  };
  beforeEach(() => { entraxe = 40; ecrites.length = 0; });

  for (const classe of CLASSES) {
    it('refuse au clavier une valeur hors des bornes declarees, et l ecrit sous le champ, en ' + classe, () => {
      const x = ouvrir(classe);
      for (const saisie of ['3', '-10', '151']) {
        taper(x.champ, saisie);
        expect(x.message()).toBe('Entre 20 et 150 cm');
        expect(x.champ.getAttribute('aria-invalid')).toBe('true');
        expect(x.ligne.querySelector('.refusChamp')?.id).toBe(x.champ.getAttribute('aria-describedby'));
      }
      expect(x.appels()).toBe(0);
      expect(ecrites).toEqual([]);
      expect(entraxe).toBe(40);
      // Une valeur admise s'ecrit, et le message s'en va.
      taper(x.champ, '55');
      expect(ecrites).toEqual([55]);
      expect(x.message()).toBeNull();
      expect(x.champ.hasAttribute('aria-invalid')).toBe(false);
      x.fermer();
    });

    it('dit qu une valeur dans les bornes est refusee par le champ, en ' + classe, () => {
      const x = ouvrir(classe);
      taper(x.champ, '99');
      expect(x.appels()).toBe(1);
      expect(x.message()).toMatch(/n’est pas possible ici/);
      expect(entraxe).toBe(40);
      // Reprendre la saisie efface le message.
      act(() => { x.champ.focus(); });
      act(() => { poser.call(x.champ, '6'); x.champ.dispatchEvent(new Event('input', { bubbles: true })); });
      expect(x.message()).toBeNull();
      x.fermer();
    });

    it('montre telle quelle la valeur hors bornes d un projet, sans l ecrire ni la signaler, en ' + classe, () => {
      entraxe = 3;
      const x = ouvrir(classe);
      expect(x.champ.value).toBe('3');
      expect(x.message()).toBeNull();
      act(() => { x.champ.focus(); });
      act(() => { x.champ.blur(); });
      expect(x.appels()).toBe(0);
      expect(entraxe).toBe(3);
      x.fermer();
    });
  }

  for (const classe of CLASSES.filter(k => k !== 'large')) {
    it('grise « − » au minimum et « + » au maximum, en ' + classe, () => {
      entraxe = 20;
      let x = ouvrir(classe);
      const boutons = () => [...x.ligne.querySelectorAll<HTMLButtonElement>('button.pasBouton')];
      expect(boutons().map(b => b.disabled)).toEqual([true, false]);
      expect(boutons()[0]!.title).toBe('Entre 20 et 150 cm');
      x.fermer();
      entraxe = 150;
      x = ouvrir(classe);
      expect(boutons().map(b => b.disabled)).toEqual([false, true]);
      x.fermer();
      entraxe = 40;
      x = ouvrir(classe);
      expect(boutons().map(b => b.disabled)).toEqual([false, false]);
      x.fermer();
    });
  }
});

describe('les fleches d un nombre appliquent tout de suite', () => {
  // Audit de l'inspecteur, lot A7 : au bureau, les fleches changeaient le chiffre affiche, et le plan attendait Entree.
  const poser = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  const ouvrir = (classe: string) => {
    const descripteurs: Champ[] = [];
    const m = monter(classe, (ch, _c, ecrire) => { descripteurs.push(ch); return ecrire() !== false; });
    const champ = m.hote.querySelector<HTMLInputElement>('[data-cle="borne"] input')!;
    const fleche = (key: 'ArrowUp' | 'ArrowDown') => act(() => { champ.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })); });
    return { m, champ, descripteurs, fleche, fermer: () => { act(() => m.racine.unmount()); m.hote.remove(); } };
  };
  beforeEach(() => { entraxe = 40; ecrites.length = 0; });

  for (const classe of CLASSES) {
    it('chaque fleche du clavier ecrit son pas, et la serie ne compte qu une annulation, en ' + classe, () => {
      const x = ouvrir(classe);
      act(() => { x.champ.focus(); });
      x.fleche('ArrowUp'); x.fleche('ArrowUp'); x.fleche('ArrowDown');
      expect(ecrites).toEqual([45, 50, 45]);
      expect(entraxe).toBe(45);
      // Le premier pas porte l'historique du champ ; les suivants de la serie le retirent (un seul instantane).
      expect(x.descripteurs.map(d => d.historique)).toEqual([undefined, false, false]);
      // Quitter le champ n'ecrit rien de plus : il n'y a pas de brouillon.
      act(() => { x.champ.blur(); });
      expect(ecrites).toEqual([45, 50, 45]);
      x.fermer();
    });

    it('la fleche s arrete a la borne, en ' + classe, () => {
      entraxe = 150;
      const x = ouvrir(classe);
      x.fleche('ArrowUp');
      expect(ecrites).toEqual([]);
      x.fleche('ArrowDown');
      expect(ecrites).toEqual([145]);
      x.fermer();
    });

    it('la fleche part de la saisie en cours, en ' + classe, () => {
      const x = ouvrir(classe);
      act(() => { x.champ.focus(); });
      act(() => { poser.call(x.champ, '60'); x.champ.dispatchEvent(new Event('input', { bubbles: true })); });
      expect(ecrites).toEqual([]);
      x.fleche('ArrowUp');
      expect(ecrites).toEqual([65]);
      x.fermer();
    });
  }

  it('au bureau, les fleches du champ (bouton de la souris enfonce) ecrivent a chaque pas, une frappe attend la validation', () => {
    const x = ouvrir('large');
    const changer = (texte: string) => act(() => { poser.call(x.champ, texte); x.champ.dispatchEvent(new Event('input', { bubbles: true })); });
    act(() => { x.champ.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 })); });
    changer('45'); changer('50');
    expect(ecrites).toEqual([45, 50]);
    expect(x.descripteurs.map(d => d.historique)).toEqual([undefined, false]);
    act(() => { window.dispatchEvent(new MouseEvent('mouseup')); });
    // Le bouton relache, une frappe est un brouillon : rien ne s'ecrit avant de quitter le champ.
    act(() => { x.champ.focus(); });
    changer('70');
    expect(ecrites).toEqual([45, 50]);
    act(() => { x.champ.blur(); });
    expect(ecrites).toEqual([45, 50, 70]);
    x.fermer();
  });
});

describe('les familles de sections', () => {
  it('rangent chaque section dans Reglages, Objet ou Geometrie, par une regle unique', async () => {
    const { familleDeSection: familleDe } = await import('../../../src/ui/champs/sections.js');
    // Ce que l'objet est (son etat civil, la reference cadastrale d'un terrain) et son apparence.
    expect(['objet', 'parcelle', 'apparence'].map(familleDe)).toEqual(Array(3).fill('objet'));
    expect(['cotes', 'coins'].map(familleDe)).toEqual(Array(2).fill('geometrie'));
    // Tout ce qui est propre a l'ouvrage, toujours sous le meme onglet (decision B3) : les etapes d'une terrasse, d'un abri, d'une
    // piscine, le toit et les facades, mais aussi la section d'un arbre ou d'un parasol, le relief et les fenetres en 3D (sous Objet
    // jusque-la), la cloture et les portails d'une parcelle (sous Objet depuis la 5.38, faute d'un onglet qui les annonce).
    const propres = ['implantation', 'lames', 'structure', 'parametres', 'toit', 'releve', 'pergola', 'pergolaStructure', 'pergolaCouleurs', 'noteCalcul', 'piscine',
      'arbre', 'parasol', 'pointDeVue', 'massif', 'equipement', 'trou', 'relief', 'fenetres3d', 'cloture', 'portails'];
    expect(propres.map(familleDe)).toEqual(propres.map(() => 'reglages'));
  });

  it('montrent « Réglages » en premier, et l onglet porte ce nom', async () => {
    const source = (await import('node:fs')).readFileSync('src/zones/Inspecteur.tsx', 'utf8');
    const ordre = [...source.matchAll(/\{ id: '(reglages|objet|geometrie)', libelle: '([^']+)' \}/g)].map(m => m[1] + ':' + m[2]);
    expect(ordre).toEqual(['reglages:Réglages', 'objet:Objet', 'geometrie:Géométrie']);
  });
});

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

/** Un champ de chaque type, et une ligne qui en porte trois. */
function champs(): Champ[] {
  return [
    { type: 'texte', cle: 'texte', libelle: 'Texte', lire: () => 'abc', ecrire: rien },
    { type: 'nombre', cle: 'nombre', libelle: 'Nombre', unite: 'cm', pas: 5, lire: () => 40, ecrire: rien },
    { type: 'case', cle: 'case', libelle: 'Case', lire: () => true, ecrire: rien },
    { type: 'choix', cle: 'choixCourt', libelle: 'Choix court', options: () => [{ valeur: 'a', libelle: 'A' }, { valeur: 'b', libelle: 'B' }], lire: () => 'a', ecrire: rien },
    { type: 'choix', cle: 'choixLong', libelle: 'Choix long', options: () => ['a', 'b', 'c', 'd', 'e'].map(v => ({ valeur: v, libelle: v.toUpperCase() })), lire: () => 'c', ecrire: rien },
    { type: 'couleur', cle: 'couleur', libelle: 'Couleur', lire: () => '#336699', ecrire: rien },
    { type: 'date', cle: 'date', libelle: 'Date', lire: () => '2026-06-21', ecrire: rien },
    { type: 'curseur', cle: 'curseur', libelle: 'Curseur', min: 0, max: 100, pas: 5, format: (v) => v + ' %', lire: () => 50, ecrire: rien },
    { type: 'lecture', cle: 'lecture', libelle: 'Lecture', valeur: () => '12,5 m²' },
    { type: 'texture', cle: 'texture', libelle: 'Texture', lire: () => null, ecrire: rien },
    { type: 'bouton', cle: 'bouton', libelle: 'Bouton', executer: rien },
    { type: 'bouton', cle: 'boutonLarge', libelle: '', texte: () => 'Bouton pleine largeur', executer: rien },
    { type: 'alerte', cle: 'alerte', libelle: '', texte: () => 'Attention' },
    { type: 'optimisation', cle: 'optimisation', libelle: '' },
    { type: 'ligne', cle: 'ligne', libelle: 'Côté 1', champs: [
      { type: 'texte', cle: 'nom', libelle: 'Nom', lire: () => 'AB', ecrire: rien },
      { type: 'nombre', cle: 'longueur', libelle: 'Longueur', unite: 'm', lire: () => 3.2, ecrire: rien },
      { type: 'bouton', cle: 'supprimer', libelle: 'Supprimer', executer: rien }
    ] },
    { type: 'texte', cle: 'invisible', libelle: 'Invisible', visible: () => false, lire: () => '', ecrire: rien }
  ];
}

const SECTIONS: Section[] = [
  { id: 'tous', titre: 'Tous les types', champs: champs() },
  { id: 'repliee', titre: 'Repliée', repliee: true, champs: [{ type: 'lecture', cle: 'dansRepliee', libelle: 'Dans une section repliée', valeur: () => 'x' }] }
];

const CLES_ATTENDUES = ['texte', 'nombre', 'case', 'choixCourt', 'choixLong', 'couleur', 'date', 'curseur', 'lecture', 'texture', 'bouton', 'boutonLarge', 'alerte', 'optimisation', 'ligne', 'dansRepliee'];

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

describe('les familles de sections', () => {
  it('rangent chaque section dans Objet, Geometrie ou Construction', async () => {
    const { familleDe } = await import('../../../src/zones/Inspecteur.js');
    expect(['objet', 'apparence', 'parasol', 'pointDeVue', 'parcelle'].map(familleDe)).toEqual(Array(5).fill('objet'));
    expect(['cotes', 'coins', 'alignement'].map(familleDe)).toEqual(Array(3).fill('geometrie'));
    expect(['fondation', 'structure', 'lames', 'finitions', 'optimisation', 'parametres'].map(familleDe)).toEqual(Array(6).fill('construction'));
  });
});

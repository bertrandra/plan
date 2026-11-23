// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { createElement, act } from 'react';
import { createRoot } from 'react-dom/client';
import { Inspecteur } from '../../../src/zones/Inspecteur.js';
import { creerMagasin, brancherModeExpert } from '../../../src/app/magasin.js';
import { toucher as toucherObjet } from '../../../src/core/controleurObjets.js';
import { creerRegistre } from '../../../src/app/commandes.js';
import { droits } from '../app/ecouteurs/faux.js';
import { sectionsObjet } from '../../../src/ui/champs/objet.js';
import type { Inspecteur as ServiceInspecteur } from '../../../src/app/inspecteur.js';
import type { Champ, ContexteChamps, Section } from '../../../src/ui/champs/types.js';
import type { EtatApp } from '../../../src/core/state.js';
import type { ObjetPlan } from '../../../src/model/types.js';

// Audit de l'inspecteur, decision B7 : une ligne par cote et par coin, repliee sur son nom et sa longueur (ou son angle), qui se
// deplie en place sur ses champs.

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const rien = () => undefined;

function carre(key: string, noms: string[] = ['Coin 1', 'Coin 2', 'Coin 3', 'Coin 4']): ObjetPlan {
  return { key, name: key, type: 'polygon', fonction: 'autre', pts: [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 3 }, { x: 0, y: 3 }],
    segmentNames: ['Cote 1', 'Façade rue', 'Cote 3', 'Cote 4'], vertexNames: noms, frozenVertices: [false, true, false, false] } as unknown as ObjetPlan;
}

function monter(sectionsDe: (c: ContexteChamps) => Section[], classe = 'large', modeExpert = false) {
  const a = carre('a'), b = carre('b');
  const etat = { objects: [a, b], selectedKey: 'a', highlight: {} } as unknown as EtatApp;
  const magasin = creerMagasin(etat);
  (magasin as unknown as { definirClasse?: (c: string) => void }).definirClasse?.(classe);
  // Le mode expert se branche comme au demarrage : chaque bascule redessine les zones (sans toucher au stockage du navigateur).
  brancherModeExpert(magasin, { getItem: () => (modeExpert ? 'oui' : 'non'), setItem: () => undefined });
  let courant = a;
  const supprimes: number[] = [];
  const service = {
    objet: () => courant,
    contexte: (o: ObjetPlan) => ({ etat, obj: o, objets: etat.objects, commandeUtilisable: () => true, interiorAngleDeg: () => 90, deleteVertex: (_o: ObjetPlan, i: number) => { supprimes.push(i); },
      modeSimple: !magasin.store.getState().options.modeExpert }) as unknown as ContexteChamps,
    titre: () => courant.name, sections: sectionsDe,
    appliquer: (_ch: Champ, _c: ContexteChamps, ecrire: () => void | boolean) => { const r = ecrire() !== false; toucherObjet(courant); act(() => magasin.notifier()); return r; },
    executer: (ch: Champ, c: ContexteChamps) => { if (ch.type === 'bouton') ch.executer(c); }, basculerOuverture: rien
  } as unknown as ServiceInspecteur;
  const hote = document.createElement('div');
  document.body.appendChild(hote);
  const racine = createRoot(hote);
  const rendre = () => act(() => { racine.render(createElement(Inspecteur, { magasin, commandes: creerRegistre(droits(true)), inspecteur: service })); });
  rendre();
  const ligne = (cle: string) => hote.querySelector<HTMLElement>('.champ[data-cle="' + cle + '"]')!;
  const resume = (cle: string) => ligne(cle).querySelector<HTMLButtonElement>(':scope > button.ligneResume')!;
  const toucher = (el: HTMLElement) => act(() => { el.click(); });
  const selectionner = (o: 'a' | 'b') => { courant = o === 'a' ? a : b; (etat as { selectedKey: string }).selectedKey = o; rendre(); };
  return { racine, hote, magasin, a, b, ligne, resume, toucher, selectionner, supprimes, fermer: () => { act(() => racine.unmount()); hote.remove(); } };
}

const geometrie = (c: ContexteChamps) => sectionsObjet(c).filter(s => s.id === 'cotes' || s.id === 'coins');

describe('une ligne par cote et par coin (B7)', () => {
  let m: ReturnType<typeof monter> | null = null;
  afterEach(() => { m?.fermer(); m = null; });

  it('repliee : le libelle, le nom donne par la personne, la longueur ou l angle, et « figé » ecrit', () => {
    m = monter(geometrie);
    // Un nom par defaut (« Cote 1 ») ne redit pas le libelle ; un nom donne se cite.
    expect(m.resume('cote0').textContent).toBe('Côté 14,00 m');
    expect(m.resume('cote1').textContent).toBe('Côté 2« Façade rue » · 3,00 m');
    expect(m.resume('coin0').textContent).toBe('Coin 190,0°');
    expect(m.resume('coin1').textContent).toBe('Coin 290,0° · figé');
    // Repliee, la ligne ne porte aucune commande que son bouton : ni champ de nom, ni « Supprimer ».
    for (const cle of ['cote0', 'coin0']) {
      expect(m.resume(cle).getAttribute('aria-expanded')).toBe('false');
      expect(m.ligne(cle).querySelectorAll('input, select, button').length).toBe(1);
    }
  });

  it('un toucher la deplie en place : renommer, regler, figer, supprimer restent atteignables', () => {
    m = monter(geometrie);
    m.toucher(m.resume('coin0'));
    expect(m.resume('coin0').getAttribute('aria-expanded')).toBe('true');
    const detail = m.ligne('coin0').querySelector<HTMLElement>('.ligneDetail')!;
    expect(detail.id).toBe(m.resume('coin0').getAttribute('aria-controls'));
    expect([...detail.querySelectorAll<HTMLElement>(':scope > .champ')].map(x => x.dataset.cle)).toEqual(['nom', 'angle', 'fige', 'supprimer']);
    // Chaque champ du detail a sa rangee, avec son libelle.
    expect([...detail.querySelectorAll('.texteLibelle')].map(x => x.textContent)).toEqual(['Nom', 'Angle', 'Figé']);
    // Renommer : le nom s'ecrit dans l'objet, et le resume le cite.
    const nom = detail.querySelector<HTMLInputElement>('.champ[data-cle="nom"] input')!;
    const poser = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    act(() => { poser.call(nom, 'Angle du portail'); nom.dispatchEvent(new Event('input', { bubbles: true })); });
    expect((m.a as unknown as { vertexNames: string[] }).vertexNames[0]).toBe('Angle du portail');
    expect(m.resume('coin0').textContent).toContain('« Angle du portail »');
    // Figer, puis supprimer (le bouton du detail, pleine largeur).
    const fige = detail.querySelector<HTMLInputElement>('.champ[data-cle="fige"] input[type=checkbox]')!;
    m.toucher(fige);
    expect((m.a as unknown as { frozenVertices: boolean[] }).frozenVertices[0]).toBe(true);
    m.toucher(m.resume('coin2'));
    m.toucher(m.ligne('coin2').querySelector<HTMLButtonElement>('.champ[data-cle="supprimer"] button')!);
    expect(m.supprimes).toEqual([2]);
    // Un second toucher replie.
    m.toucher(m.resume('coin0'));
    expect(m.ligne('coin0').querySelector('.ligneDetail')).toBeNull();
  });

  it('au clavier : la ligne est un vrai bouton, que Tab atteint et qu Entree bascule', () => {
    m = monter(geometrie);
    const b = m.resume('cote0');
    expect(b.tagName).toBe('BUTTON');
    expect(b.type).toBe('button');
    expect(b.tabIndex).toBe(0);
  });

  it('le depli appartient a l objet : le suivant, aux memes lignes, arrive replie', () => {
    m = monter(geometrie);
    m.toucher(m.resume('cote0'));
    expect(m.ligne('cote0').querySelector('.ligneDetail')).not.toBeNull();
    m.selectionner('b');
    expect(m.ligne('cote0').querySelector('.ligneDetail')).toBeNull();
  });

  it('la meme forme dans les trois classes d ecran', () => {
    for (const classe of ['compact', 'moyen', 'large']) {
      const x = monter(geometrie, classe);
      expect(x.hote.querySelectorAll('.champ.repliable > button.ligneResume').length, classe).toBe(8);
      x.toucher(x.resume('coin1'));
      // Un coin fige ne se supprime pas : au doigt, la raison s'ecrit sous le bouton grise (pas d'infobulle).
      const supprimer = x.ligne('coin1').querySelector<HTMLElement>('.champ[data-cle="supprimer"]')!;
      expect(supprimer.querySelector('button')!.disabled, classe).toBe(true);
      expect(supprimer.querySelector('.note')?.textContent ?? null, classe).toBe(classe === 'large' ? null : 'Coin figé');
      x.fermer();
    }
  });
});

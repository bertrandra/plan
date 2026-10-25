// @vitest-environment jsdom
import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { act, createElement, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { EtapeResultat, type Verification } from '../../../src/zones/releve/EtapeResultat.js';
import { useOuvertures, type OuverturesEnCours } from '../../../src/zones/releve/ouvertures.js';
import type { OuvertureDetectee } from '../../../src/facade/detection/detection.js';
import type { Resultat } from '../../../src/facade/releve/serie.js';

// L'etape Verifier du releve (lot L15, spec facades §12) : une baie devinee peu sure se dessine en
// pointille, decochee ; une touche la garde, la case la rend au pointille ; les gestes de la grille se
// grisent quand il n'y a rien a faire ; les corrections se tracent sur la proposition.

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

beforeAll(() => {
  // jsdom ne mesure rien : l'elevation suit sa taille et saisit le pointeur, on le lui simule.
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class { observe() {} disconnect() {} };
  const proto = window.SVGElement.prototype as unknown as Record<string, unknown>;
  proto.getScreenCTM = () => null;
  proto.setPointerCapture = () => {};
});

const f = (x: number, y: number, l = 1.2): OuvertureDetectee => ({ type: 'fenetre', x, y, l, h: 1.35, confiance: 0.95, source: 'detectee' });
const analyse = {
  ouvertures: [f(1, 0.9), { type: 'porte' as const, x: 4.5, y: 0, l: 0.95, h: 2.15, confiance: 0.9, source: 'detectee' as const }, f(1, 3.8, 1.05), f(4.4, 3.8), f(7.8, 3.8)],
  devinees: [{ ...f(7.8, 0.9), confiance: 0.5, source: 'devinee' as const }],
};
const resultat: Resultat = { partieBasse: null, texture: 'data:', hauteurTexture: 6, hauteurMesuree: true, couverture: 1, toitPropose: null, avis: null };

let racine: Root, hote: HTMLElement, ouv: OuverturesEnCours | null;
function Banc() {
  const o = useOuvertures();
  ouv = o;
  // La proposition se pose une fois, comme a la fin de l'analyse.
  useEffect(() => o.poser(analyse), []);
  const v: Verification = {
    resultat, largeur: 10, hauteurMur: 6, ouvertures: o.ouvertures, setOuvertures: o.setOuvertures, choisie: o.choisie, setChoisie: o.setChoisie,
    devinees: o.devinees, garder: o.garder, ecarter: o.ecarter, toit: null, setToit: () => {}, appliquerToit: false, setAppliquerToit: () => {},
    contour: [], cote: 0, partieBasse: null, setPartieBasse: () => {}, hauteurEstimee: 6, hauteurMesuree: true, corrigerHauteur: () => {},
  };
  return createElement(EtapeResultat, { v, onRevoir: () => {}, onValider: () => {} });
}
beforeEach(() => { hote = document.createElement('div'); document.body.appendChild(hote); racine = createRoot(hote); act(() => racine.render(createElement(Banc))); });
afterEach(() => { act(() => racine.unmount()); hote.remove(); ouv = null; });

const retenues = () => hote.querySelectorAll('g.releveOuverture:not(.decochee)');
const pointillees = () => hote.querySelectorAll('g.releveOuverture.decochee');
const toucher = (el: Element | null | undefined) => act(() => { el?.dispatchEvent(new window.MouseEvent('pointerdown', { bubbles: true })); });
const bouton = (cle: string) => hote.querySelector<HTMLButtonElement>(`[data-controle="${cle}"]`);

describe('la baie devinee, en pointille', () => {
  it('se dessine decochee, se garde d une touche, et la case la rend au pointille', () => {
    expect(retenues()).toHaveLength(5);
    expect(pointillees()).toHaveLength(1);
    expect(hote.textContent).toContain('Une baie devinée par la grille est en pointillé : touchez-la pour la garder.');
    toucher(pointillees()[0]?.querySelector('rect'));
    expect(pointillees()).toHaveLength(0);
    expect(retenues()).toHaveLength(6);
    expect(hote.querySelector('g.releveOuverture.choisie.incertaine')).not.toBeNull();
    expect(hote.querySelector('.releveFiche')?.textContent).toContain('Devinée par la grille de la façade (confiance 50 %)');
    const garder = hote.querySelector<HTMLInputElement>('input[data-controle="releve.garderDevinee"]');
    expect(garder?.checked).toBe(true);
    act(() => garder?.click());
    expect(pointillees()).toHaveLength(1);
    expect(retenues()).toHaveLength(5);
    expect(hote.querySelector('.releveFiche')).toBeNull();
  });

  it('gardee, elle est tracee comme l ajout d une devinee', () => {
    toucher(pointillees()[0]?.querySelector('rect'));
    const t = ouv?.conclure(1);
    expect(t?.corrections).toEqual([{ geste: 'ajout', type: 'fenetre', x: 7.8, y: 0.9, l: 1.2, h: 1.35, source: 'devinee' }]);
  });
});

describe('les gestes de la grille', () => {
  it('« Ajouter dans la grille » pose la baie au croisement libre, et se grise quand la grille est pleine', () => {
    expect(bouton('releve.ajouterDansGrille')?.disabled).toBe(false);
    act(() => bouton('releve.ajouterDansGrille')?.click());
    expect(retenues()).toHaveLength(6);
    expect(hote.querySelector('.releveFiche')?.textContent).toContain('Ajoutée par vous.');
    expect(bouton('releve.ajouterDansGrille')?.disabled).toBe(true);
    expect(bouton('releve.ajouterDansGrille')?.title).toContain('Aucun croisement libre');
  });

  it('« Même taille pour la travée » egalise la travee, puis se grise ; la retouche est tracee', () => {
    toucher(retenues()[0]?.querySelector('rect'));
    const taille = bouton('releve.memeTailleTravee');
    expect(taille?.disabled).toBe(false);
    expect(bouton('releve.memeHauteurNiveau')?.disabled).toBe(true);
    act(() => taille?.click());
    expect(bouton('releve.memeTailleTravee')?.disabled).toBe(true);
    expect(hote.textContent).toContain('Rien à égaliser');
    const t = ouv?.conclure(1);
    expect(t?.corrections.map((c) => c.geste)).toEqual(['deplacement']);
    expect(t?.ouvertures.find((o) => o.y > 3 && o.x < 2)).toMatchObject({ l: 1.2, source: 'corrigee' });
  });
});

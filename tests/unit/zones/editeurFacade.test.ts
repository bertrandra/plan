// @vitest-environment jsdom
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Releve } from '../../../src/zones/Releve.js';
import { creerServiceReleve, type ServiceReleve } from '../../../src/app/releve/releve.js';
import type { ObjetPlan, OuvertureFacade, ReleveFacade } from '../../../src/model/types.js';

// L'editeur d'une facade relevee (zones/Releve.tsx, lot F6) : la capture est dans l'audit, le releve corrige ce qui est releve. Une
// baie devinee se rend au pointille et se garde d'une touche ; les gestes de la grille se grisent quand il n'y a rien a faire ; une
// ouverture se verifie ; « Valider la façade » ecrit en un pas, « Annuler » et Echap ne touchent a rien.

vi.mock('../../../src/shell/dialogs.js', () => ({ showToast: vi.fn() }));
vi.mock('../../../src/three/etat3d.js', () => ({ vue3d: { scene: null } }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

beforeAll(() => {
  // jsdom ne mesure rien : l'elevation suit sa taille et saisit le pointeur, on le lui simule.
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class { observe() {} disconnect() {} };
  const proto = window.SVGElement.prototype as unknown as Record<string, unknown>;
  proto.getScreenCTM = () => null;
  proto.setPointerCapture = () => {};
});

const f = (x: number, y: number, l = 1.2, plus: Partial<OuvertureFacade> = {}): OuvertureFacade => ({ type: 'fenetre', x, y, l, h: 1.35, confiance: 0.95, source: 'detectee', ...plus });
const releve = (): ReleveFacade => ({
  cote: 0, largeur: 10, hauteur: 6, texture: 'data:image/jpeg;base64,AA==', hauteurTexture: 6, distance: null, sourceDistance: null, releveLe: '2026-10-28T10:00:00.000Z', depuisAudit: true,
  calage: { photos: [{ coins: [], pxParMSource: 150 }] },
  ouvertures: [f(1, 0.9), { type: 'porte', x: 4.5, y: 0, l: 0.95, h: 2.15, confiance: 0.9, source: 'detectee' }, f(1, 3.8, 1.05), f(4.4, 3.8), f(7.8, 3.8), f(7.8, 0.9, 1.2, { confiance: 0.5, source: 'devinee' })],
});

let racine: Root, hote: HTMLElement, s: ServiceReleve, o: ObjetPlan, pushHistory: ReturnType<typeof vi.fn>;
beforeEach(() => {
  o = { key: 'maison', type: 'polygon', fonction: 'batiment', name: 'Maison', pts: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 6 }, { x: 0, y: 6 }], batiment: { facades: [releve()] } } as unknown as ObjetPlan;
  pushHistory = vi.fn();
  s = creerServiceReleve({ etat: { objects: [o] } as never, pushHistory, render: vi.fn(), buildThreeScene: vi.fn(), aujourdhui: () => '2026-10-29' });
  hote = document.createElement('div'); document.body.appendChild(hote); racine = createRoot(hote);
  act(() => racine.render(createElement(Releve, { releve: s })));
  act(() => s.ouvrir('maison', 0));
});
afterEach(() => { act(() => racine.unmount()); hote.remove(); });

const retenues = () => hote.querySelectorAll('g.releveOuverture:not(.decochee)');
const pointillees = () => hote.querySelectorAll('g.releveOuverture.decochee');
const toucher = (el: Element | null | undefined) => act(() => { el?.dispatchEvent(new window.MouseEvent('pointerdown', { bubbles: true })); });
const bouton = (cle: string) => hote.querySelector<HTMLButtonElement>(`[data-controle="${cle}"]`);
const ecrit = () => o.batiment?.facades?.[0] as ReleveFacade;

describe('l editeur, ouvert sur le releve du mur', () => {
  it('montre l elevation, ses ouvertures, la precision de ses cotes, et rien de la capture', () => {
    expect(hote.querySelector('[role="dialog"]')?.getAttribute('aria-label')).toBe('Façade sud · 10,00 × 6,00 m');
    expect(hote.textContent).toContain('Modifier la façade');
    expect(retenues()).toHaveLength(6);
    expect(hote.textContent).toContain('Cotes précises au centimètre : la photo voyait le mur à 150 pixels par mètre.');
    // Ni prise de vue, ni coins, ni analyse : la capture est dans l'audit.
    for (const k of ['releve.importerPhoto', 'releve.declencher', 'releve.analyser', 'releve.revoir', 'releve.hauteur', 'releve.appliquerToit']) expect(bouton(k), k).toBeNull();
    expect(hote.querySelector('input[type="file"], video')).toBeNull();
  });

  it('« Annuler » et Echap ferment sans rien ecrire', () => {
    act(() => bouton('releve.annuler')?.click());
    expect(s.courant()).toBeNull();
    expect(hote.querySelector('[role="dialog"]')).toBeNull();
    act(() => s.ouvrir('maison', 0));
    act(() => { window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape' })); });
    expect(s.courant()).toBeNull();
    expect(pushHistory).not.toHaveBeenCalled();
    expect(ecrit().depuisAudit).toBe(true);
  });
});

describe('la baie devinee, en pointille', () => {
  it('sa case la rend au pointille, une touche la garde ; rendue, elle ne s ecrit pas et son retrait est trace', () => {
    toucher(retenues()[5]?.querySelector('rect'));
    expect(hote.querySelector('.releveFiche')?.textContent).toContain('Devinée par la grille de la façade (confiance 50 %)');
    const garder = hote.querySelector<HTMLInputElement>('input[data-controle="releve.garderDevinee"]');
    expect(garder?.checked).toBe(true);
    act(() => garder?.click());
    expect(pointillees()).toHaveLength(1);
    expect(retenues()).toHaveLength(5);
    expect(hote.textContent).toContain('Une baie devinée par la grille est en pointillé : touchez-la pour la garder.');
    toucher(pointillees()[0]?.querySelector('rect'));
    expect(pointillees()).toHaveLength(0);
    act(() => hote.querySelector<HTMLInputElement>('input[data-controle="releve.garderDevinee"]')?.click());
    act(() => bouton('releve.valider')?.click());
    expect(pushHistory).toHaveBeenCalledTimes(1);
    expect(ecrit().ouvertures).toHaveLength(5);
    expect(ecrit().corrections).toEqual([{ geste: 'retrait', type: 'fenetre', x: 7.8, y: 0.9, l: 1.2, h: 1.35, source: 'devinee' }]);
    expect(ecrit().depuisAudit).toBeUndefined();
  });
});

describe('les gestes de la grille', () => {
  it('« Ajouter dans la grille » pose la baie au croisement libre, puis se grise ; l ajout s ecrit et se trace', () => {
    // Un releve dont la fenetre d'etage de droite manque : un croisement de la grille est libre.
    act(() => s.fermer());
    const r = releve();
    r.ouvertures.splice(4, 1);
    (o.batiment as { facades: ReleveFacade[] }).facades = [r];
    act(() => s.ouvrir('maison', 0));
    expect(bouton('releve.ajouterDansGrille')?.disabled).toBe(false);
    act(() => bouton('releve.ajouterDansGrille')?.click());
    expect(retenues()).toHaveLength(6);
    expect(hote.querySelector('.releveFiche')?.textContent).toContain('Ajoutée par vous.');
    expect(bouton('releve.ajouterDansGrille')?.disabled).toBe(true);
    expect(bouton('releve.ajouterDansGrille')?.title).toContain('Aucun croisement libre');
    act(() => bouton('releve.valider')?.click());
    expect(ecrit().ouvertures.filter((x) => x.source === 'ajoutee')).toHaveLength(1);
    expect(ecrit().grille?.niveaux).toHaveLength(2);
  });

  it('« Même taille pour la travée » egalise la travee, puis se grise ; la retouche est tracee', () => {
    toucher(retenues()[0]?.querySelector('rect'));
    const taille = bouton('releve.memeTailleTravee');
    expect(taille?.disabled).toBe(false);
    act(() => taille?.click());
    expect(bouton('releve.memeTailleTravee')?.disabled).toBe(true);
    expect(hote.textContent).toContain('Rien à égaliser');
    act(() => bouton('releve.valider')?.click());
    expect(ecrit().corrections?.map((c) => c.geste)).toEqual(['deplacement']);
    expect(ecrit().ouvertures.find((x) => x.y > 3 && x.x < 2)).toMatchObject({ l: 1.2, source: 'corrigee' });
  });
});

describe('verifier une ouverture', () => {
  it('la case la verifie du jour : plus aucun rejeu ne la deplace ; decochee, la date part', () => {
    toucher(retenues()[1]?.querySelector('rect'));
    const verifiee = () => hote.querySelector<HTMLInputElement>('input[data-controle="releve.verifierOuverture"]');
    expect(verifiee()?.checked).toBe(false);
    act(() => verifiee()?.click());
    expect(verifiee()?.checked).toBe(true);
    expect(hote.querySelector('.releveFiche')?.textContent).toContain('Vérifiée sur la photo le 29/10/2026');
    act(() => bouton('releve.valider')?.click());
    expect(ecrit().ouvertures[1]).toMatchObject({ type: 'porte', verifieeLe: '2026-10-29', source: 'detectee' });
    // Une verification n'est pas une correction de la detection.
    expect(ecrit().corrections).toBeUndefined();
  });
});

// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { CorrectionRedressement } from '../../../src/model/auditParcelle.js';
import { CoinsPhotoAudit } from '../../../src/zones/parcours/CoinsPhotoAudit.js';

// La pose a la main des quatre coins d'une photo de facade (audit de la parcelle), quand le redressement automatique a echoue.

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let racine: Root, hote: HTMLElement;
const ImageOrigine = window.Image;
beforeEach(() => {
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class { observe() {} disconnect() {} };
  (SVGElement.prototype as unknown as { getScreenCTM: () => null }).getScreenCTM = () => null;
  hote = document.createElement('div'); document.body.appendChild(hote); racine = createRoot(hote);
  // jsdom ne charge pas les images : une image de 800 x 600 qui « charge » aussitot.
  class FausseImage { naturalWidth = 800; naturalHeight = 600; onload: (() => void) | null = null; set src(_: string) { queueMicrotask(() => this.onload?.()); } }
  (window as unknown as { Image: unknown }).Image = FausseImage;
});
afterEach(() => { act(() => racine.unmount()); hote.remove(); (window as unknown as { Image: unknown }).Image = ImageOrigine; });

const bouton = (c: string) => hote.querySelector(`[data-controle="${c}"]`) as HTMLButtonElement;
async function monter(depart?: { x: number; y: number }[]) {
  const appliquer = vi.fn<(c: CorrectionRedressement) => void>(), retablir = vi.fn(), fermer = vi.fn();
  const props = { photo: { type: 'image/jpeg' as const, base64: 'AAAA' }, rang: 1, nom: 'Façade sud', depart, mur: undefined, largeurPlanM: 9.5, echelleDepart: undefined, appliquer, retablir, fermer };
  await act(async () => { racine.render(createElement(CoinsPhotoAudit, props)); await Promise.resolve(); });
  return { appliquer, retablir, fermer };
}

describe('la pose de quatre reperes', () => {
  it('montre quatre poignees et applique des reperes par defaut dans la photo, jamais les coins du mur', async () => {
    const p = await monter();
    expect(hote.querySelectorAll('[role="slider"]')).toHaveLength(4);
    act(() => bouton('auditParcelle.appliquerCoins').click());
    const c = p.appliquer.mock.calls[0]?.[0] as CorrectionRedressement;
    expect(c.reperes).toHaveLength(4);
    expect(c.reperes?.[0]).toEqual({ x: 96, y: 72 });
    // Des reperes, pas les coins du mur : ni « Égout » ni « Sol » sur la photo.
    expect(c.coins).toBeUndefined();
    expect(hote.textContent).not.toMatch(/Égout|Sol\b/);
    expect(c.echelleLargeurM).toBeUndefined();
    expect(p.fermer).toHaveBeenCalled();
  });
  it('part des reperes donnes (ceux deja poses, ou le mur du calcul)', async () => {
    const depart = [{ x: 10, y: 20 }, { x: 700, y: 20 }, { x: 700, y: 500 }, { x: 10, y: 500 }];
    const p = await monter(depart);
    act(() => bouton('auditParcelle.appliquerCoins').click());
    expect(p.appliquer.mock.calls[0]?.[0].reperes).toEqual(depart);
  });
  it('porte l echelle tapee, et refuse un texte qui n est pas un nombre', async () => {
    const p = await monter();
    const champ = hote.querySelector('[data-controle="auditParcelle.echelleMur"]') as HTMLInputElement;
    const ecrire = (v: string) => act(() => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(champ, v); champ.dispatchEvent(new Event('input', { bubbles: true })); });
    ecrire('abc');
    expect(bouton('auditParcelle.appliquerCoins').disabled).toBe(true);
    expect(hote.querySelector('[role="alert"]')?.textContent).toMatch(/nombre de mètres/);
    ecrire('9,5');
    expect(bouton('auditParcelle.appliquerCoins').disabled).toBe(false);
    act(() => bouton('auditParcelle.appliquerCoins').click());
    expect(p.appliquer.mock.calls[0]?.[0].echelleLargeurM).toBe(9.5);
  });
  it('revient a l automatique, ou annule sans rien changer', async () => {
    const p = await monter();
    act(() => bouton('auditParcelle.retablirCoins').click());
    expect(p.retablir).toHaveBeenCalled();
    act(() => bouton('auditParcelle.annulerCoins').click());
    expect(p.appliquer).not.toHaveBeenCalled();
  });
});

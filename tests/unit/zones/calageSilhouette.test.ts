// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { P2 } from '../../../src/facade/homographie.js';
import { CalageSilhouette } from '../../../src/zones/CalageSilhouette.js';

// Le calage de la silhouette sur la facade complete (calibration, etapes 9 et 10) : proportions du plan, puis hauteur de la photo.

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let racine: Root, hote: HTMLElement;
beforeEach(() => {
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class { observe() {} disconnect() {} };
  (SVGElement.prototype as unknown as { getScreenCTM: () => null }).getScreenCTM = () => null;
  hote = document.createElement('div'); document.body.appendChild(hote); racine = createRoot(hote);
});
afterEach(() => { act(() => racine.unmount()); hote.remove(); });

// Un mur de 8 x 4 m (rapport 0,5) pose sur l'assemblage de 400 px de large : 200 px de large, egout a 100 px au-dessus du sol.
const COINS: P2[] = [{ x: 100, y: 200 }, { x: 300, y: 200 }, { x: 300, y: 300 }, { x: 100, y: 300 }];

function monter() {
  const appliquer = vi.fn<(c: P2[]) => void>();
  act(() => racine.render(createElement(CalageSilhouette, { url: 'data:,', largeur: 400, hauteur: 400, coins: COINS, gabarit: [{ u: 0, v: 1 }, { u: 1, v: 1 }], largeurM: 8, hauteurM: 4, appliquer })));
  return appliquer;
}
const touche = (nom: string, key: string, shiftKey = false) => act(() => { (hote.querySelector(`[role="slider"][aria-label="${nom}"]`) as SVGElement).dispatchEvent(new KeyboardEvent('keydown', { key, shiftKey, bubbles: true })); });
const appliquer = () => act(() => (hote.querySelector('[data-controle="calibration.appliquerCalage"]') as HTMLButtonElement).click());

describe('le calage de la silhouette', () => {
  it('rend le mur de depart tel quel', () => {
    const f = monter();
    appliquer();
    expect(f.mock.calls[0]?.[0]).toEqual(COINS);
  });

  it('garde les proportions du plan : un bout tire, l egout suit la largeur', () => {
    const f = monter();
    touche('Bout droit de la silhouette', 'ArrowRight', true); // + 8 px
    appliquer();
    const c = f.mock.calls[0]?.[0] as P2[];
    expect((c[1] as P2).x).toBeCloseTo(308, 6);
    // 208 px de large, rapport 0,5 : l'egout a 104 px au-dessus du sol.
    expect((c[0] as P2).y).toBeCloseTo(300 - 104, 6);
  });

  it('deplace la silhouette entiere, et le sol seul', () => {
    const f = monter();
    touche('Silhouette du mur : la déplacer', 'ArrowLeft', true);
    touche('Sol de la silhouette', 'ArrowDown', true);
    appliquer();
    const c = f.mock.calls[0]?.[0] as P2[];
    expect(c.map((q) => q.x)).toEqual([92, 292, 292, 92]);
    expect((c[2] as P2).y).toBeCloseTo(308, 6);
  });

  it('etire la photo en hauteur autour du sol : l egout se ramene sur la photo non etiree', () => {
    const f = monter();
    // Le haut de l'image (a 0) monte de trois pas de 8 px : etirement (300 + 24) / 300 = 1,08.
    for (let i = 0; i < 3; i++) touche('Haut de la photo', 'ArrowUp', true);
    expect(hote.textContent).toContain('Étirement : 108 %');
    appliquer();
    const c = f.mock.calls[0]?.[0] as P2[];
    expect((c[0] as P2).y).toBeCloseTo(300 - 100 / 1.08, 6);
    expect((c[2] as P2).y).toBeCloseTo(300, 6);
  });
});

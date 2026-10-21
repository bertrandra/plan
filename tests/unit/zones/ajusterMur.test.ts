// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { Image, P2 } from '../../../src/facade/homographie.js';

// La reprise a la main de l'egout, du sol et des bouts du mur sur la photo redressee entiere (zones/releve/AjusterMur.tsx).

// jsdom n'a pas de canevas : l'image redressee ne s'encode pas, son adresse est factice.
vi.mock('../../../src/ui/releve/camera.js', () => ({ versJpeg: () => 'data:image/jpeg;base64,AAAA' }));
const { AjusterMur } = await import('../../../src/zones/releve/AjusterMur.js');

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let racine: Root, hote: HTMLElement;
beforeEach(() => {
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class { observe() {} disconnect() {} };
  (SVGElement.prototype as unknown as { getScreenCTM: () => null }).getScreenCTM = () => null;
  hote = document.createElement('div'); document.body.appendChild(hote); racine = createRoot(hote);
});
afterEach(() => { act(() => racine.unmount()); hote.remove(); });

/** Une photo de 400 x 300, prise de face : les reperes (un rectangle droit) ne la tournent pas. */
const photo = (): Image => ({ largeur: 400, hauteur: 300, donnees: new Uint8ClampedArray(400 * 300 * 4).fill(200) });
const REPERES: P2[] = [{ x: 100, y: 80 }, { x: 300, y: 80 }, { x: 300, y: 220 }, { x: 100, y: 220 }];
const MUR: P2[] = [{ x: 60, y: 50 }, { x: 340, y: 50 }, { x: 340, y: 260 }, { x: 60, y: 260 }];

async function monter() {
  const changer = vi.fn<(c: P2[]) => void>();
  const charger = async () => photo();
  await act(async () => { racine.render(createElement(AjusterMur, { charger, reperes: REPERES, mur: MUR, changer })); await new Promise((ok) => setTimeout(ok, 0)); });
  return changer;
}
const ligne = (nom: string) => hote.querySelector(`[role="slider"][aria-label="${nom}"]`) as SVGLineElement;

describe('la reprise a la main du mur sur la photo redressee', () => {
  it('montre quatre lignes, l egout, le sol et les deux bouts, au depart sur le mur trouve', async () => {
    await monter();
    expect(hote.querySelectorAll('[role="slider"]')).toHaveLength(4);
    // De face, la vue est la photo a la meme echelle : les lignes tombent sur le mur donne.
    expect(Number(ligne('Égout').getAttribute('y1'))).toBeCloseTo(50, 0);
    expect(Number(ligne('Sol').getAttribute('y1'))).toBeCloseTo(260, 0);
    expect(Number(ligne('Bout gauche du mur').getAttribute('x1'))).toBeCloseTo(60, 0);
  });

  it('descend l egout au clavier, et rend les coins du mur sur la photo', async () => {
    const changer = await monter();
    act(() => { ligne('Égout').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', shiftKey: true, bubbles: true })); });
    expect(changer).toHaveBeenCalled();
    const coins = changer.mock.calls.at(-1)?.[0] as P2[];
    expect(coins).toHaveLength(4);
    // L'egout est descendu (8 px : dix pas de 0,2 % du grand cote) ; le sol et les bouts n'ont pas bouge.
    expect((coins[0] as P2).y).toBeCloseTo(58, 0);
    expect((coins[1] as P2).y).toBeCloseTo(58, 0);
    expect((coins[2] as P2).y).toBeCloseTo(260, 0);
    expect((coins[0] as P2).x).toBeCloseTo(60, 0);
  });

  it('ne laisse pas l egout passer sous le sol', async () => {
    const changer = await monter();
    for (let i = 0; i < 40; i++) act(() => { ligne('Égout').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', shiftKey: true, bubbles: true })); });
    const coins = changer.mock.calls.at(-1)?.[0] as P2[];
    expect((coins[0] as P2).y).toBeLessThan((coins[3] as P2).y);
  });
});

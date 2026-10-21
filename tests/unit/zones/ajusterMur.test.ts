// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { Image, P2 } from '../../../src/facade/homographie.js';

// La reprise a la main de l'egout, du sol et des bouts du mur sur la photo redressee entiere (zones/releve/AjusterMur.tsx).

// jsdom n'a pas de canevas : l'image redressee ne s'encode pas, son adresse est factice.
vi.mock('../../../src/ui/releve/camera.js', () => ({ versJpeg: () => 'data:image/jpeg;base64,AAAA' }));
const { AjusterMur } = await import('../../../src/zones/releve/AjusterMur.js');
type MurAjuste = import('../../../src/zones/releve/AjusterMur.js').MurAjuste;

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

const PIGNON: P2[] = [{ x: 60, y: 120 }, { x: 200, y: 40 }, { x: 340, y: 120 }];

async function monter(silhouette: P2[] | null = null) {
  const changer = vi.fn<(m: MurAjuste) => void>();
  const charger = async () => photo();
  await act(async () => { racine.render(createElement(AjusterMur, { charger, reperes: REPERES, mur: MUR, silhouette, changer })); await new Promise((ok) => setTimeout(ok, 0)); });
  return changer;
}
const poignee = (nom: string) => hote.querySelector(`[role="slider"][aria-label="${nom}"]`) as SVGElement;
const touche = (nom: string, key: string, shiftKey = false) => act(() => { poignee(nom).dispatchEvent(new KeyboardEvent('keydown', { key, shiftKey, bubbles: true })); });
const dernier = (c: ReturnType<typeof vi.fn<(m: MurAjuste) => void>>) => c.mock.calls.at(-1)?.[0] as MurAjuste;

describe('la reprise a la main du mur sur la photo redressee', () => {
  it('sans silhouette lue, part d une ligne droite a l egout : deux angles, le sol et les deux bouts', async () => {
    await monter();
    expect(hote.querySelectorAll('[role="slider"]')).toHaveLength(5);
    // De face, la vue est la photo a la meme echelle : les poignees tombent sur le mur donne.
    expect(Number(poignee('Égout, angle gauche').getAttribute('cy'))).toBeCloseTo(50, 0);
    expect(Number(poignee('Sol').getAttribute('y1'))).toBeCloseTo(260, 0);
  });

  it('montre la silhouette d un pignon, et en tire le sommet sans toucher a l egout', async () => {
    const changer = await monter(PIGNON);
    expect(hote.querySelectorAll('[role="slider"]')).toHaveLength(6);
    touche('Haut du mur, sommet 1', 'ArrowUp', true);
    const m = dernier(changer);
    expect((m.silhouette[1] as P2).y).toBeCloseTo(32, 0);
    // L'egout reste aux angles : les coins du haut du mur ne bougent pas.
    expect((m.coins[0] as P2).y).toBeCloseTo(120, 0);
    expect((m.silhouette[0] as P2).x).toBeCloseTo(60, 0);
  });

  it('prend pour egout le plus bas des deux angles (une rampe)', async () => {
    const changer = await monter([{ x: 60, y: 120 }, { x: 340, y: 60 }]);
    touche('Égout, angle droit', 'ArrowDown');
    const m = dernier(changer);
    expect((m.coins[0] as P2).y).toBeCloseTo(120, 0);
    expect((m.coins[1] as P2).y).toBeCloseTo(120, 0);
    expect((m.silhouette[1] as P2).y).toBeCloseTo(60.8, 0);
  });

  it('ajoute un sommet au plus long troncon, et le retire par Suppr', async () => {
    const changer = await monter();
    act(() => (hote.querySelector('[data-controle="releve.ajouterSommet"]') as HTMLButtonElement).click());
    expect(dernier(changer).silhouette).toHaveLength(3);
    touche('Haut du mur, sommet 1', 'Delete');
    expect(dernier(changer).silhouette).toHaveLength(2);
  });

  it('ne laisse pas le haut du mur passer sous le sol', async () => {
    const changer = await monter();
    for (let i = 0; i < 40; i++) touche('Égout, angle gauche', 'ArrowDown', true);
    const m = dernier(changer);
    expect((m.coins[0] as P2).y).toBeLessThan((m.coins[3] as P2).y);
  });
});

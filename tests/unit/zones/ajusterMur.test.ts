// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { Image, P2 } from '../../../src/facade/vision/homographie.js';

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

/** Un pignon centre qui monte de la moitie de la hauteur du mur au-dessus de l'egout. */
const PIGNON = [{ u: 0, v: 1 }, { u: 0.5, v: 1.5 }, { u: 1, v: 1 }];

async function monter(gabarit: { u: number; v: number }[] | null = null) {
  const changer = vi.fn<(m: MurAjuste) => void>();
  const charger = async () => photo();
  await act(async () => { racine.render(createElement(AjusterMur, { charger, reperes: REPERES, mur: MUR, ...(gabarit ? { gabarit } : {}), changer })); await new Promise((ok) => setTimeout(ok, 0)); });
  return changer;
}
const poignee = (nom: string) => hote.querySelector(`[role="slider"][aria-label="${nom}"]`) as SVGElement;
const touche = (nom: string, key: string, shiftKey = false) => act(() => { poignee(nom).dispatchEvent(new KeyboardEvent('keydown', { key, shiftKey, bubbles: true })); });
// Le haut du mur dessine sur la vue (de face, a l'echelle de la photo) : la polyligne sans ses deux pieds.
const hautDessine = (): P2[] => (hote.querySelector('.ajusterMurLigne.silhouette')?.getAttribute('points') ?? '').split(' ').map((q) => { const [x, y] = q.split(',').map(Number); return { x: x as number, y: y as number }; }).slice(1, -1);
const dernier = (c: ReturnType<typeof vi.fn<(m: MurAjuste) => void>>) => c.mock.calls.at(-1)?.[0] as MurAjuste;

describe('la reprise a la main du mur sur la photo redressee', () => {
  it('part du mur donne : quatre lignes a tirer, l egout, le sol et les deux bouts', async () => {
    await monter();
    expect(hote.querySelectorAll('[role="slider"]')).toHaveLength(4);
    // De face, la vue est la photo a la meme echelle : les lignes tombent sur le mur donne.
    expect(Number(poignee('Égout').getAttribute('y1'))).toBeCloseTo(50, 0);
    expect(Number(poignee('Sol').getAttribute('y1'))).toBeCloseTo(260, 0);
  });

  it('pose le gabarit tel quel : le pignon suit l egout et le sol sans changer de forme', async () => {
    const changer = await monter(PIGNON);
    touche('Égout', 'ArrowDown', true);
    const m = dernier(changer);
    const egout = (m.coins[0] as P2).y, sol = (m.coins[3] as P2).y;
    expect(egout).toBeCloseTo(58, 0);
    // Le faite est a la moitie de la hauteur du mur au-dessus de l'egout, au milieu des bouts ; les angles sont a l'egout.
    const haut = hautDessine();
    expect(haut).toHaveLength(3);
    expect((haut[1] as P2).y).toBeCloseTo(egout - (sol - egout) / 2, 0);
    expect((haut[1] as P2).x).toBeCloseTo(200, 0);
    expect((haut[0] as P2).y).toBeCloseTo(egout, 0);
  });

  it('suit un bout tire : le gabarit s etire en largeur', async () => {
    const changer = await monter(PIGNON);
    touche('Bout droit du mur', 'ArrowLeft', true);
    const m = dernier(changer);
    expect((m.coins[1] as P2).x).toBeCloseTo(332, 0);
    expect((hautDessine()[1] as P2).x).toBeCloseTo((60 + 332) / 2, 0);
  });

  it('ne laisse pas l egout passer sous le sol', async () => {
    const changer = await monter();
    for (let i = 0; i < 40; i++) touche('Égout', 'ArrowDown', true);
    const m = dernier(changer);
    expect((m.coins[0] as P2).y).toBeLessThan((m.coins[3] as P2).y);
  });
});

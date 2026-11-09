// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { creerNavigation3d } from '../../../src/three/navigation.js';
import { debrancherPincementFacade } from '../../../src/three/pincementFacade.js';
import { vue3d } from '../../../src/three/etat3d.js';

// Chaque construction de la Vue 3D cree un canevas ; le pincement de facade suit les doigts sur la fenetre. Il se branchait une fois par
// canevas et ne se debranchait jamais : un jeu d'ecouteurs de plus sur la fenetre par reconstruction, chacun retenant son ancien canevas.

/** Les ecouteurs de pointeur poses en capture sur la fenetre, moins ceux retires. */
function compter() {
  const vivants = new Map<string, Set<unknown>>();
  const ajout = vi.spyOn(window, 'addEventListener'), retrait = vi.spyOn(window, 'removeEventListener');
  const cle = (t: string, o: unknown) => t + (o === true || (typeof o === 'object' && o !== null && (o as { capture?: boolean }).capture) ? ':capture' : '');
  ajout.mockImplementation(((t: string, f: unknown, o?: unknown) => { const k = cle(t, o); if (!vivants.has(k)) vivants.set(k, new Set()); vivants.get(k)?.add(f); }) as never);
  retrait.mockImplementation(((t: string, f: unknown, o?: unknown) => { vivants.get(cle(t, o))?.delete(f); }) as never);
  return (k: string) => vivants.get(k)?.size ?? 0;
}

/** Une scene minimale de la Vue 3D : son canevas neuf, ses controles. */
const scene = () => ({ renderer: { domElement: document.createElement('canvas') }, controls: { mouseButtons: {}, touches: {} } });

afterEach(() => { vi.restoreAllMocks(); debrancherPincementFacade(); vue3d.scene = null; });

describe('le pincement de la vue de facade', () => {
  it('apres N reconstructions de la Vue 3D, un seul jeu d ecouteurs reste sur la fenetre', () => {
    (globalThis as { THREE?: unknown }).THREE = { MOUSE: { PAN: 2, ROTATE: 0 }, TOUCH: { PAN: 1, ROTATE: 0 } };
    const vivants = compter();
    const nav = creerNavigation3d({ objects: [], terrasseSelectedKey: null, scene: { W: 0, H: 0 } } as never, { showErrBanner: () => undefined, hauteurFinieMm: () => 0, ouvrirVue3d: () => undefined } as never);
    for (let n = 0; n < 5; n++) {
      vue3d.scene = scene() as never;
      nav.applyMode3D();
      nav.applyMode3D(); // le meme canevas : rien de plus
    }
    expect(vivants('pointermove:capture')).toBe(1);
    expect(vivants('pointerup:capture')).toBe(1);
    expect(vivants('pointercancel:capture')).toBe(1);
    // La scene demolie (disposeThreeScene), plus rien.
    debrancherPincementFacade();
    expect(vivants('pointermove:capture')).toBe(0);
  });
});

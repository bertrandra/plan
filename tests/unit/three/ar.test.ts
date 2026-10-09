// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { ouvrirAR, capacitesAR, conseilAR, chargerModelViewer, MODEL_VIEWER_URL } from '../../../src/three/ar.js';

// La realite augmentee (three/ar.ts) : la superposition, ses attributs model-viewer, le conseil
// selon l'appareil, et la fermeture qui libere l'URL du modele.

// jsdom n'a pas d'URL d'objet : on en pose une fausse, qui compte les creations et les liberations.
const urls = { crees: 0, liberees: [] as string[] };
beforeEach(() => {
  urls.crees = 0; urls.liberees = [];
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: () => { urls.crees++; return 'blob:plan/modele'; } });
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: (u: string) => { urls.liberees.push(u); } });
});
afterEach(() => { document.body.innerHTML = ''; vi.restoreAllMocks(); });

describe('capacitesAR et conseilAR', () => {
  it('reconnait Android (WebXR), Apple (Quick Look) et un ordinateur', () => {
    const doc = (ar: boolean) => ({ createElement: () => ({ relList: { supports: (r: string) => ar && r === 'ar' } }) }) as unknown as Document;
    expect(capacitesAR({ xr: {} } as unknown as Navigator, doc(false))).toEqual({ webxr: true, quickLook: false });
    expect(capacitesAR({} as Navigator, doc(true))).toEqual({ webxr: false, quickLook: true });
    expect(capacitesAR({} as Navigator, doc(false))).toEqual({ webxr: false, quickLook: false });
    expect(conseilAR({ webxr: true, quickLook: false })).toContain('grandeur nature');
    expect(conseilAR({ webxr: false, quickLook: true })).toContain('Quick Look');
    expect(conseilAR({ webxr: false, quickLook: false })).toContain('Android');
  });
});

describe('ouvrirAR', () => {
  it('pose model-viewer sur le modele, avec l AR dans la page puis Quick Look, et ferme en liberant l URL', async () => {
    const charger = vi.fn(async () => {});
    const s = await ouvrirAR(new ArrayBuffer(8), 'Terrasse 1', { charger });
    expect(charger).toHaveBeenCalledTimes(1);
    expect(urls.crees).toBe(1);
    const mv = document.querySelector('model-viewer')!;
    expect(mv.getAttribute('src')).toBe('blob:plan/modele');
    expect(mv.getAttribute('ar')).toBe('');
    expect(mv.getAttribute('ar-modes')).toBe('webxr quick-look');
    expect(mv.getAttribute('ar-placement')).toBe('floor');
    expect(mv.querySelector('[slot="ar-button"]')?.textContent).toBe('Voir chez vous');
    expect(document.querySelector('.conseilAR')?.textContent).toContain('Android');
    expect(document.querySelector('.titreAR')?.textContent).toBe('Terrasse 1');
    (document.querySelector('[data-controle="visionneuse.arFermer"]') as HTMLButtonElement).click();
    expect(document.querySelector('.voileAR')).toBeNull();
    expect(urls.liberees).toEqual(['blob:plan/modele']);
    expect(s.element.isConnected).toBe(false);
  });

  it('se ferme par Echap', async () => {
    await ouvrirAR(new ArrayBuffer(8), 'T', { charger: async () => {} });
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(document.querySelector('.voileAR')).toBeNull();
  });

  it('charge model-viewer une fois, depuis la version epinglee', async () => {
    const importer = vi.fn(async () => ({}));
    await chargerModelViewer(importer);
    await chargerModelViewer(importer);
    expect(importer).toHaveBeenCalledTimes(1);
    expect(importer).toHaveBeenCalledWith(MODEL_VIEWER_URL);
    expect(MODEL_VIEWER_URL).toMatch(/model-viewer@3\.5\.0/);
  });
});

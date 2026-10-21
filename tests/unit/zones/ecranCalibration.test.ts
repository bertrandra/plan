// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { EcranCalibration, type DepsCalibration } from '../../../src/zones/EcranCalibration.js';
import { FORMAT_CAS_REEL, type CasStocke, type DocumentCalibration } from '../../../src/facade/corpusReel.js';
import type { Image } from '../../../src/facade/homographie.js';

// L'ecran Admin › Calibrer la detection, branche sur de fausses dependances : la liste des cas, un nouveau cas avec ses photos,
// la mesure et la calibration sur un cas fabrique d'une scene du banc, et l'application des reglages.

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let racine: Root, hote: HTMLElement;
const ImageOrigine = window.Image;
beforeEach(() => {
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class { observe() {} disconnect() {} };
  (SVGElement.prototype as unknown as { getScreenCTM: () => null }).getScreenCTM = () => null;
  hote = document.createElement('div'); document.body.appendChild(hote); racine = createRoot(hote);
});
afterEach(() => { act(() => racine.unmount()); hote.remove(); (window as unknown as { Image: unknown }).Image = ImageOrigine; });

/** Un mur de 9 x 5 m a 100 px/m, trois fenetres sombres : la photo est le mur de face, les coins sont ceux de l'image. */
const scene = (() => {
  const L = 900, H = 500, donnees = new Uint8ClampedArray(L * H * 4);
  const baies = [1, 4, 7].map((x) => ({ type: 'fenetre' as const, x, y: 2, l: 1, h: 1.4 }));
  for (let j = 0; j < H; j++) for (let i = 0; i < L; i++) {
    const dedans = baies.some((b) => i >= b.x * 100 && i < (b.x + b.l) * 100 && j >= H - (b.y + b.h) * 100 && j < H - b.y * 100);
    const c = dedans ? [38, 44, 54] : [205, 186, 152];
    const k = (j * L + i) * 4;
    donnees[k] = c[0] as number; donnees[k + 1] = c[1] as number; donnees[k + 2] = c[2] as number; donnees[k + 3] = 255;
  }
  const coins = [{ x: 0, y: 0 }, { x: L, y: 0 }, { x: L, y: H }, { x: 0, y: H }];
  const cas: CasStocke = { format: FORMAT_CAS_REEL, version: 1, nom: 'Synthèse 02', statut: 'valide', largeurM: 9, hauteurM: 5, photos: [{ fichier: 'p', coins }], images: ['data:image/jpeg;base64,SCENE'], ouvertures: baies };
  return { cas, image: { largeur: L, hauteur: H, donnees } as Image };
})();

function fausses(plus: Partial<DepsCalibration> = {}) {
  const docs: DocumentCalibration[] = [];
  const stock = new Map<string, CasStocke>([['cas-a', scene.cas]]);
  const deps: DepsCalibration = {
    lireCalibration: async () => null,
    enregistrerCalibration: vi.fn(async (d: DocumentCalibration) => { docs.push(d); return null; }),
    lister: async () => [...stock.entries()].map(([id, c]) => ({ id, nom: c.nom, statut: c.statut, photos: c.photos.length, ouvertures: c.ouvertures.length, updatedAt: '2026-10-17T10:00:00.000Z' })),
    lireCas: async (id) => stock.get(id),
    enregistrerCas: vi.fn(async (id: string, c: CasStocke) => { stock.set(id, c); return null; }),
    supprimerCas: vi.fn(async (id: string) => { stock.delete(id); return null; }),
    reduirePhoto: async () => 'data:image/jpeg;base64,NEUVE',
    decoder: async (): Promise<Image> => scene.image,
    elevationEnUrl: () => 'data:image/jpeg;base64,ELEV',
    maintenant: () => new Date('2026-10-17T10:00:00Z'),
    ...plus,
  };
  return { deps, docs, stock };
}

const bouton = (c: string) => hote.querySelector(`[data-controle="${c}"]`) as HTMLButtonElement | null;
async function monter(deps: DepsCalibration) {
  await act(async () => { racine.render(createElement(EcranCalibration, { deps })); await Promise.resolve(); await Promise.resolve(); });
}
const attendre = async (ms = 0) => { await act(async () => { await new Promise((ok) => setTimeout(ok, ms)); }); };
/** Attend qu'une condition tienne (le calcul automatique dure plus ou moins selon la machine), 10 s au plus. */
const attendreQue = async (ok: () => boolean) => { for (let t = 0; t < 100 && !ok(); t++) await attendre(100); };

describe('l ecran de calibration', () => {
  it('liste les cas du serveur et propose un nouveau cas', async () => {
    const { deps } = fausses();
    await monter(deps);
    expect(hote.textContent).toContain('Calibrer la détection');
    expect(hote.textContent).toContain('Synthèse 02');
    expect(hote.textContent).toContain('Valeurs livrées en usage');
    expect(bouton('calibration.nouveauCas')).not.toBeNull();
    expect(bouton('calibration.revenir')?.disabled).toBe(true);
  });

  it('enregistre un nouveau cas : nom, photo, dimensions, relu sur la photo', async () => {
    const { deps, stock } = fausses();
    await monter(deps);
    await act(async () => { bouton('calibration.nouveauCas')?.click(); });
    // Sans nom, l'enregistrement est refuse avec un mot clair.
    await act(async () => { bouton('calibration.enregistrerCas')?.click(); });
    expect(hote.querySelector('[role="alert"]')?.textContent).toMatch(/nom/);
    const nom = hote.querySelector('[data-controle="calibration.nomCas"]') as HTMLInputElement;
    await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(nom, 'Maison nord'); nom.dispatchEvent(new Event('input', { bubbles: true })); });
    await act(async () => { bouton('calibration.enregistrerCas')?.click(); });
    expect(hote.querySelector('[role="alert"]')?.textContent).toMatch(/photo/);
    const champ = hote.querySelector('[data-controle="calibration.photo"]') as HTMLInputElement;
    Object.defineProperty(champ, 'files', { value: [new File(['x'], 'p.jpg')], configurable: true });
    await act(async () => { champ.dispatchEvent(new Event('change', { bubbles: true })); await Promise.resolve(); await Promise.resolve(); });
    // Ajouter une photo cherche ses coins, redresse le mur et propose la detection, sans autre geste.
    await attendreQue(() => !!bouton('calibration.proposer'));
    expect(hote.querySelectorAll('[aria-label="Photos du cas"] li')).toHaveLength(1);
    expect(hote.querySelectorAll('.releveCoins [role="slider"]')).toHaveLength(4);
    expect(hote.querySelector('[data-controle="calibration.originePhoto"]')?.textContent).toMatch(/coins (trouvés|devinés|lus sur l’assemblage)/);
    expect(bouton('calibration.proposer')).not.toBeNull();
    expect(hote.textContent).toMatch(/\d+ ouvertures? annotée/);
    const valide = hote.querySelector('[data-controle="calibration.valide"]') as HTMLInputElement;
    await act(async () => { valide.click(); });
    await act(async () => { bouton('calibration.enregistrerCas')?.click(); await Promise.resolve(); });
    await attendre(10);
    const ajoute = [...stock.entries()].find(([id]) => id.startsWith('cas-') && id !== 'cas-a');
    expect(ajoute?.[1]).toMatchObject({ nom: 'Maison nord', statut: 'valide', images: ['data:image/jpeg;base64,NEUVE'] });
    expect(ajoute?.[1].photos[0]?.coins).toHaveLength(4);
    // Le cas rejoint la liste et l'editeur se ferme.
    expect(hote.textContent).toContain('Maison nord');
    expect(bouton('calibration.enregistrerCas')).toBeNull();
  });

  it('ajoute une seconde photo : redressement et assemblage seuls, la photo qui ne se recale pas est signalee et gardee', async () => {
    const grise: Image = { largeur: 640, hauteur: 480, donnees: new Uint8ClampedArray(640 * 480 * 4).fill(128) };
    let n = 0;
    const { deps } = fausses({ decoder: async () => (n++ < 2 ? scene.image : grise) });
    await monter(deps);
    await act(async () => { bouton('calibration.nouveauCas')?.click(); });
    const champ = hote.querySelector('[data-controle="calibration.photo"]') as HTMLInputElement;
    for (let k = 0; k < 2; k++) {
      Object.defineProperty(champ, 'files', { value: [new File(['x'], 'p' + k + '.jpg')], configurable: true });
      await act(async () => { champ.dispatchEvent(new Event('change', { bubbles: true })); await Promise.resolve(); await Promise.resolve(); });
      await attendre(1500);
    }
    expect(hote.querySelectorAll('[aria-label="Photos du cas"] li')).toHaveLength(2);
    expect(hote.textContent).toMatch(/coins devinés, à vérifier/);
    expect(hote.querySelector('[data-controle="calibration.avisFusion"]')?.textContent).toMatch(/photo \d reste hors de l’assemblage/);
  }, 60_000);

  it('redresse un cas, part de la detection pour annoter, et enregistre', async () => {
    const { deps, stock } = fausses();
    await monter(deps);
    await act(async () => { bouton('calibration.ouvrirCas')?.click(); await Promise.resolve(); });
    await attendre(10);
    await act(async () => { bouton('calibration.redresser')?.click(); });
    await attendre(300);
    expect(bouton('calibration.proposer')).not.toBeNull();
    expect(hote.textContent).toMatch(/\d+ ouvertures? annotée/);
    await act(async () => { bouton('calibration.viderBaies')?.click(); });
    expect(hote.textContent).toContain('0 ouverture');
    await act(async () => { bouton('calibration.proposer')?.click(); });
    expect(hote.textContent).toContain('3 ouvertures annotées');
    await act(async () => { bouton('calibration.enregistrerCas')?.click(); await Promise.resolve(); });
    await attendre(10);
    expect(stock.get('cas-a')?.ouvertures).toHaveLength(3);
  }, 60_000);

  it('mesure les cas valides, cherche de meilleurs reglages et les applique', async () => {
    const { deps, docs } = fausses();
    await monter(deps);
    await act(async () => { bouton('calibration.charger')?.click(); });
    await attendre(100);
    expect(hote.textContent).toContain('Valeurs livrées');
    expect(hote.textContent).toContain('Valeurs en usage (serveur)');
    expect(hote.textContent).toMatch(/Sous 20 cas validés/);
    await act(async () => { bouton('calibration.calibrer')?.click(); });
    await attendre(1500);
    const region = hote.querySelector('[aria-label="Proposition de calibration"]');
    expect(region).not.toBeNull();
    const appliquer = bouton('calibration.appliquer');
    if (appliquer && !appliquer.disabled) {
      await act(async () => { appliquer.click(); await Promise.resolve(); });
      await attendre(10);
      expect(docs).toHaveLength(1);
      expect(docs[0]?.format).toBe('plan-calibration');
      expect(docs[0]?.historique).toHaveLength(1);
      expect(Object.keys(docs[0]?.parametres ?? {}).every((n) => n.startsWith('facades.'))).toBe(true);
    } else {
      expect(region?.textContent).toMatch(/Aucun changement/);
    }
  }, 120_000);

  it('montre les reglages calibres en usage et revient aux valeurs livrees, historique garde', async () => {
    const doc: DocumentCalibration = { format: 'plan-calibration', version: 1, modifieLe: '2026-10-16T08:00:00.000Z', parametres: { 'facades.detection.areteNette': 0.7 },
      historique: [{ t: '2026-10-16T08:00:00.000Z', casValides: 3, modifications: [{ nom: 'facades.detection.areteNette', avant: 0.6, apres: 0.7, gain: 0.02 }], avant: { precision: 0.8, rappel: 0.7, f1: 0.75, brier: 0.1 }, apres: { precision: 0.9, rappel: 0.8, f1: 0.85, brier: 0.08 } }] };
    const { deps, docs } = fausses({ lireCalibration: async () => doc });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    await monter(deps);
    expect(hote.textContent).toContain('1 réglage calibré en usage');
    expect(hote.textContent).toContain('F1 75 % → 85 %');
    await act(async () => { bouton('calibration.revenir')?.click(); await Promise.resolve(); });
    await attendre(10);
    expect(docs).toHaveLength(1);
    expect(docs[0]?.parametres).toEqual({});
    expect(docs[0]?.historique).toHaveLength(1);
    expect(hote.textContent).toContain('Valeurs livrées en usage');
  });
});

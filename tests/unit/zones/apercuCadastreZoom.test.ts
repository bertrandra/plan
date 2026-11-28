// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { ImportCadastre } from '../../../src/zones/parcours/ImportCadastre.js';
import { creerImportCadastre } from '../../../src/app/cadastre/importCadastre.js';
import { projecteurLocal } from '../../../src/geo/projection.js';
import type { PtBrut } from '../../../src/model/types.js';

// L'apercu des parcelles s'agrandit et se deplace, aux etapes 2 et 3 : les boutons, la molette, le
// glisser, et la regle qui separe un glisser d'un toucher (un glisser ne choisit jamais rien).

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const lat = 48.9, lon = 2.15, proj = projecteurLocal(lat, lon);
const carre = (x0: number, y0: number, l: number): PtBrut[] => [{ x: x0, y: y0 }, { x: x0 + l, y: y0 }, { x: x0 + l, y: y0 + l }, { x: x0, y: y0 + l }];
const feature = (id: string, pts: PtBrut[], props: Record<string, unknown>) => ({ type: 'Feature', id, properties: props, geometry: { type: 'Polygon', coordinates: [[...pts, pts[0]!].map(p => { const d = proj.versDegres(p.x, p.y); return [d.lon, d.lat]; })] } });
const reponse = (corps: unknown) => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(corps) } as unknown as Response);

let racine: Root | null = null;
afterEach(() => { act(() => racine?.unmount()); racine = null; document.body.innerHTML = ''; vi.unstubAllGlobals(); vi.restoreAllMocks(); });
const attendre = () => act(async () => { for (let k = 0; k < 20; k++) await new Promise((r) => setTimeout(r, 0)); });

/** Un evenement de pointeur que React lit : jsdom n'a pas toujours PointerEvent. */
function pointeur(cible: Element, type: string, x: number, y: number, id = 1): void {
  const ev = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0 });
  Object.defineProperty(ev, 'pointerId', { value: id });
  Object.defineProperty(ev, 'pointerType', { value: 'mouse' });
  act(() => { cible.dispatchEvent(ev); });
}

async function ouvrirEtape2() {
  // Une grille de parcelles de 20 m, sur 200 m : le secteur que l'apercu montre en entier.
  vi.stubGlobal('fetch', vi.fn((url: string) => {
    const u = new URL(url);
    if (u.hostname === 'apicarto.ign.fr' && u.pathname.includes('cadastre')) {
      const tout: unknown[] = [];
      for (let x = -100; x < 100; x += 20) for (let y = -100; y < 100; y += 20) tout.push(feature('p' + x + '_' + y, carre(x, y, 20), { idu: 'I' + x + '_' + y, section: 'AE', numero: x + '' + y, code_insee: '78650', nom_com: 'Le Vesinet', contenance: 400 }));
      const start = parseInt(u.searchParams.get('_start') ?? '0', 10), limit = parseInt(u.searchParams.get('_limit') ?? '60', 10);
      return reponse({ features: tout.slice(start, start + limit), totalFeatures: tout.length });
    }
    return reponse({ features: [] });
  }));
  // jsdom ne met rien en page : l'apercu y fait 400 x 300 px.
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, right: 400, bottom: 300, width: 400, height: 300, x: 0, y: 0, toJSON: () => ({}) } as DOMRect);
  const i = creerImportCadastre({ apiSave: vi.fn(), appliquerProjetImporte: vi.fn(), withProjectParam: (id) => id, apiDisponible: true, cleDernierProjet: 'k' }, vi.fn());
  i.basculerImportDirect(false);
  const hote = document.createElement('div');
  document.body.appendChild(hote);
  racine = createRoot(hote);
  act(() => racine!.render(createElement(ImportCadastre, { importe: i })));
  await act(async () => { await i.choisirAdresse({ label: 'Adresse', score: 1, genre: 'housenumber', citycode: '78650', ville: 'Le Vesinet', lon, lat }); });
  await attendre();
  return { i, hote };
}

const vueDe = (hote: HTMLElement) => hote.querySelector('svg.apercuCadastre')!.getAttribute('viewBox')!.split(' ').map(Number);
const bouton = (hote: HTMLElement, cle: string) => hote.querySelector<HTMLButtonElement>(`[data-controle="cadastre.${cle}"]`)!;
const cliquer = (el: Element) => act(() => { el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); });

describe('le zoom de l apercu des parcelles', () => {
  it('agrandit, reduit et recadre par ses boutons, de 44 px et nommes', async () => {
    const { hote } = await ouvrirEtape2();
    expect(hote.textContent).toContain('Parcelle trouvée (2/3)');
    const complet = vueDe(hote);
    expect(bouton(hote, 'apercuReduire').disabled).toBe(true);
    expect(bouton(hote, 'apercuToutVoir').disabled).toBe(true);
    expect(bouton(hote, 'apercuAgrandir').getAttribute('aria-label')).toBe('Agrandir l’aperçu');
    cliquer(bouton(hote, 'apercuAgrandir'));
    const un = vueDe(hote);
    expect(un[2]!).toBeCloseTo(complet[2]! / 1.5, 2);
    expect(bouton(hote, 'apercuReduire').disabled).toBe(false);
    // Les traits gardent leur epaisseur a l'ecran : divises par le grossissement.
    const trait = (h: HTMLElement) => Number(h.querySelector('.apercuCadastre g polygon')!.getAttribute('stroke-width'));
    const t1 = trait(hote);
    cliquer(bouton(hote, 'apercuAgrandir'));
    expect(trait(hote)).toBeCloseTo(t1 / 1.5, 3);
    cliquer(bouton(hote, 'apercuToutVoir'));
    expect(vueDe(hote)).toEqual(complet);
    // Jamais plus pres que la plus petite parcelle (20 m) : les boutons s'arretent la, puis se grisent.
    for (let k = 0; k < 20; k++) if (!bouton(hote, 'apercuAgrandir').disabled) cliquer(bouton(hote, 'apercuAgrandir'));
    expect(vueDe(hote)[2]!).toBeCloseTo(20, 2);
    expect(bouton(hote, 'apercuAgrandir').disabled).toBe(true);
  });

  it('agrandit a la touche + quand l apercu a le focus, et la molette sous le pointeur', async () => {
    const { hote } = await ouvrirEtape2();
    const svg = hote.querySelector('svg.apercuCadastre')!;
    const complet = vueDe(hote);
    act(() => { svg.dispatchEvent(new KeyboardEvent('keydown', { key: '+', bubbles: true })); });
    expect(vueDe(hote)[2]!).toBeLessThan(complet[2]!);
    act(() => { svg.dispatchEvent(new KeyboardEvent('keydown', { key: '-', bubbles: true })); });
    expect(vueDe(hote)).toEqual(complet);
    const molette = new WheelEvent('wheel', { deltaY: -200, clientX: 50, clientY: 50, bubbles: true, cancelable: true });
    act(() => { svg.dispatchEvent(molette); });
    expect(molette.defaultPrevented).toBe(true);
    const v = vueDe(hote);
    expect(v[2]!).toBeLessThan(complet[2]!);
    // Le coin haut gauche (le pointeur y etait) se rapproche du coin du complet, pas du centre.
    expect(v[0]! - complet[0]!).toBeLessThan((complet[2]! - v[2]!) / 2);
    // Tout vu, reculer a la molette laisse defiler le dialogue.
    cliquer(bouton(hote, 'apercuToutVoir'));
    const recul = new WheelEvent('wheel', { deltaY: 200, bubbles: true, cancelable: true });
    act(() => { svg.dispatchEvent(recul); });
    expect(recul.defaultPrevented).toBe(false);
  });

  it('un glisser deplace la vue et ne choisit pas la parcelle ; un toucher immobile la choisit', async () => {
    const { i, hote } = await ouvrirEtape2();
    const choisir = vi.spyOn(i, 'choisirPrincipale');
    cliquer(bouton(hote, 'apercuAgrandir'));
    cliquer(bouton(hote, 'apercuAgrandir'));
    const avant = vueDe(hote);
    const parcelle = [...hote.querySelectorAll('.apercuCadastre polygon')].find(p => p.getAttribute('style')?.includes('pointer'))!;
    pointeur(parcelle, 'pointerdown', 200, 150);
    pointeur(parcelle, 'pointermove', 240, 170);
    pointeur(parcelle, 'pointerup', 240, 170);
    cliquer(parcelle);
    const apres = vueDe(hote);
    expect(apres[0]!).toBeLessThan(avant[0]!);   // la vue suit la main : le dessin part a droite
    expect(choisir).not.toHaveBeenCalled();
    // Trois pixels : un toucher, qui choisit.
    pointeur(parcelle, 'pointerdown', 200, 150);
    pointeur(parcelle, 'pointermove', 202, 152);
    pointeur(parcelle, 'pointerup', 202, 152);
    cliquer(parcelle);
    expect(vueDe(hote)).toEqual(apres);
    expect(choisir).toHaveBeenCalledTimes(1);
  });

  it('garde le zoom de l etape 2 a l etape 3, et repart de tout voir a une nouvelle adresse', async () => {
    const { i, hote } = await ouvrirEtape2();
    cliquer(bouton(hote, 'apercuAgrandir'));
    const zoome = vueDe(hote);
    act(() => i.allerA(3));
    await attendre();
    expect(hote.textContent).toContain('(3/3)');
    expect(vueDe(hote)).toEqual(zoome);
    expect(i.etat().vueApercu).not.toBeNull();
    act(() => i.allerA(1));
    await act(async () => { await i.choisirAdresse({ label: 'Autre', score: 1, genre: 'housenumber', citycode: '78650', ville: 'Le Vesinet', lon, lat }); });
    expect(i.etat().vueApercu).toBeNull();
  });
});

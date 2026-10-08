// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { ImportCadastre } from '../../../src/zones/parcours/ImportCadastre.js';
import { Actualisation } from '../../../src/zones/parcours/Actualisation.js';
import { creerImportCadastre } from '../../../src/app/importCadastre.js';
import { projecteurLocal } from '../../../src/geo/projection.js';
import type { VoisinageRayon } from '../../../src/geo/apiIgn.js';
import type { PtBrut } from '../../../src/model/types.js';

// Les deux dialogues du voisinage etendu, rendus pour de vrai : le curseur de 10 a 200 m, le
// compte des parcelles et des batiments affiche AVANT de creer, et le resume de l'import direct.

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const lat = 48.9, lon = 2.15, proj = projecteurLocal(lat, lon);
const carre = (x0: number, y0: number, l: number): PtBrut[] => [{ x: x0, y: y0 }, { x: x0 + l, y: y0 }, { x: x0 + l, y: y0 + l }, { x: x0, y: y0 + l }];
const feature = (id: string, pts: PtBrut[], props: Record<string, unknown>) => ({ type: 'Feature', id, properties: props, geometry: { type: 'Polygon', coordinates: [[...pts, pts[0]!].map(p => { const d = proj.versDegres(p.x, p.y); return [d.lon, d.lat]; })] } });
const grille = (f: (x: number, y: number) => unknown) => { const out: unknown[] = []; for (let x = -160; x <= 140; x += 20) for (let y = -160; y <= 140; y += 20) out.push(f(x, y)); return out; };
const reponse = (corps: unknown) => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(corps) } as unknown as Response);

let racine: Root | null = null;
afterEach(() => { act(() => racine?.unmount()); racine = null; document.body.innerHTML = ''; vi.unstubAllGlobals(); });
const attendre = () => act(async () => { for (let k = 0; k < 20; k++) await new Promise((r) => setTimeout(r, 0)); });
function monter(el: ReturnType<typeof createElement>): HTMLElement {
  const hote = document.createElement('div');
  document.body.appendChild(hote);
  racine = createRoot(hote);
  act(() => racine!.render(el));
  return hote;
}
/** Un curseur React se pilote par la valeur native puis un evenement `input`. */
function glisser(curseur: HTMLInputElement, valeur: number): void {
  const poser = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  act(() => { poser.call(curseur, String(valeur)); curseur.dispatchEvent(new Event('input', { bubbles: true })); });
}
const cocher = (el: Element) => act(() => { (el as HTMLInputElement).click(); });

describe('l import depuis une adresse, en import direct', () => {
  it('montre le curseur, le resume et le compte avant de creer', async () => {
    vi.stubGlobal('fetch', vi.fn((url: string) => {
      const u = new URL(url);
      if (u.hostname === 'apicarto.ign.fr' && u.pathname.includes('cadastre')) {
        const tout = grille((x, y) => feature('p' + x + '_' + y, carre(x, y, 20), { idu: 'I' + x + '_' + y, section: 'AE', numero: x + '' + y, code_insee: '78650', nom_com: 'Le Vesinet', contenance: 400 }));
        const start = parseInt(u.searchParams.get('_start') ?? '0', 10), limit = parseInt(u.searchParams.get('_limit') ?? '60', 10);
        return reponse({ features: tout.slice(start, start + limit), totalFeatures: tout.length });
      }
      if ((u.searchParams.get('TYPENAMES') ?? '').includes('batiment')) { const b = grille((x, y) => feature('b' + x + '_' + y, carre(x + 5, y + 5, 8), { cleabs: 'B' + x + '_' + y })); return reponse({ features: b, numberMatched: b.length }); }
      return reponse({ features: [] });
    }));
    const i = creerImportCadastre({ apiSave: vi.fn(), appliquerProjetImporte: vi.fn(), withProjectParam: (id) => id, apiDisponible: true, cleDernierProjet: 'k' }, vi.fn());
    const hote = monter(createElement(ImportCadastre, { importe: i }));
    cocher(hote.querySelector('[data-controle="cadastre.importDirect"]')!);
    const curseur = hote.querySelector<HTMLInputElement>('[data-controle="cadastre.rayon"]')!;
    expect(curseur.min).toBe('10');
    expect(curseur.max).toBe('1000');
    expect(curseur.disabled).toBe(true);
    cocher(hote.querySelector('[data-controle="cadastre.voisinageEtendu"]')!);
    expect(curseur.disabled).toBe(false);
    glisser(curseur, 60);
    expect(hote.textContent).toContain('dans un rayon de 60 m');
    await act(async () => { await i.choisirAdresse({ label: 'Adresse', score: 1, genre: 'housenumber', citycode: '78650', ville: 'Le Vesinet', lon, lat }); });
    await attendre();
    expect(hote.querySelector('[data-controle="cadastre.creerDirect"]')).not.toBeNull();
    expect(hote.querySelector('[data-controle="cadastre.ajuster"]')).not.toBeNull();
    const compte = () => hote.querySelector('.blocIgn .detailIgn')!.textContent!;
    const m60 = /^(\d+) parcelle\(s\) et (\d+) bâtiment\(s\) seront ajoutés/.exec(compte());
    expect(m60).not.toBeNull();
    glisser(curseur, 160);
    const m160 = /^(\d+) parcelle\(s\) et (\d+) bâtiment\(s\)/.exec(compte())!;
    expect(Number(m160[1])).toBeGreaterThan(Number(m60![1]));
    expect(Number(m160[2])).toBeGreaterThan(Number(m60![2]));
    expect(hote.querySelector('.apercuCadastre circle[stroke-dasharray]')).not.toBeNull();
    // Au-dela de 200 m, l'avertissement sur le poids du plan ; et le palier de 500 m est relu.
    expect(hote.querySelector('.avertissementRayon')).toBeNull();
    glisser(curseur, 300);
    expect(hote.querySelector('.avertissementRayon')?.textContent).toContain('Au-delà de 200 m');
    await attendre();
    expect(i.etat().etenduMax?.rayonM).toBe(500);
    const m300 = /^(\d+) parcelle\(s\) et (\d+) bâtiment\(s\)/.exec(compte())!;
    expect(Number(m300[1])).toBeGreaterThanOrEqual(Number(m160[1]));
  });
});

describe('l actualisation, voisinage au curseur', () => {
  it('lit le disque une fois et compte ce qui est nouveau au rayon du curseur', async () => {
    const centre = { x: 0, y: 0 };
    const v: VoisinageRayon = {
      rayonM: 200, tronque: false,
      parcelles: [10, 50, 120, 190].map((d, k) => ({ idu: 'P' + k, section: 'AE', numero: String(k), codeInsee: '1', commune: 'C', contenance: 1, anneauDeg: [], pts: carre(d, 0, 5), aire: 25, dedans: false, distance: d })),
      batiments: [20, 150].map((d, k) => ({ id: 'B' + k, genre: 'batiment', pts: carre(d, 0, 4), props: {}, anneauDeg: [], aire: 16, parcelles: new Set<string>() }))
    };
    const lire = vi.fn(() => Promise.resolve(v));
    const lancer = vi.fn();
    const hote = monter(createElement(Actualisation, { infos: { parcelle: 'Parcelle AE 1', nbIgn: 0, nbVoisines: 0, reliefPermis: true, aUnRelief: false, voisinage: { centre, lire, idus: new Set(['P0']), ids: new Set<string>() } }, lancer, fermer: vi.fn() }));
    cocher(hote.querySelector('[data-controle="actualisation.voisinage"]')!);
    const [adjacentes, enRayon] = [...hote.querySelectorAll('[data-controle="actualisation.rayon"]')];
    expect(adjacentes).toBeDefined();
    cocher(enRayon!);
    await attendre();
    const curseur = hote.querySelector<HTMLInputElement>('[data-controle="actualisation.rayonM"]')!;
    glisser(curseur, 100);
    // P0 est deja dans le plan : seule P1 (50 m) est nouvelle sous 100 m ; un batiment (20 m).
    expect(hote.textContent).toContain('1 parcelle(s) et 1 bâtiment(s) nouveaux à moins de 100 m');
    glisser(curseur, 200);
    expect(hote.textContent).toContain('3 parcelle(s) et 2 bâtiment(s) nouveaux à moins de 200 m');
    expect(lire).toHaveBeenCalledTimes(1);
    expect(lire).toHaveBeenCalledWith(200);
    expect(hote.querySelector('.avertissementRayon')).toBeNull();
    // Le curseur passe le palier : le disque de 500 m est demande, et le poids du plan annonce.
    glisser(curseur, 400);
    await attendre();
    expect(lire).toHaveBeenCalledTimes(2);
    expect(lire).toHaveBeenLastCalledWith(500);
    expect(hote.querySelector('.avertissementRayon')).not.toBeNull();
    glisser(curseur, 200);
    act(() => { (hote.querySelector('[data-controle="actualisation.lancer"]') as HTMLButtonElement).click(); });
    expect(lancer.mock.calls[0]![0].voisinage).toMatchObject({ actif: true, rayonM: 200 });
  });

  it('l actualisation decoche haies, vegetation et arbres, et relit le relief sur toutes les parcelles', () => {
    const lancer = vi.fn();
    const infos = { parcelle: 'Parcelle AE 1', nbIgn: 0, nbVoisines: 0, reliefPermis: true, aUnRelief: true };
    const hote = monter(createElement(Actualisation, { infos, lancer, fermer: vi.fn() }));
    const couches = [...hote.querySelectorAll<HTMLInputElement>('[data-controle="actualisation.couche"]')].map(c => c.checked);
    expect(couches).toEqual([true, false, false]);
    expect(hote.querySelector<HTMLInputElement>('[data-controle="actualisation.relief"]')!.checked).toBe(true);
    const toutes = hote.querySelector<HTMLInputElement>('[data-controle="actualisation.reliefToutes"]')!;
    expect(toutes.checked).toBe(true);
    act(() => { (hote.querySelector('[data-controle="actualisation.lancer"]') as HTMLButtonElement).click(); });
    expect(lancer.mock.calls[0]![0].relief).toEqual({ actif: true, toutesParcelles: true });
    cocher(toutes);
    act(() => { (hote.querySelector('[data-controle="actualisation.lancer"]') as HTMLButtonElement).click(); });
    expect(lancer.mock.calls[1]![0].relief).toEqual({ actif: true, toutesParcelles: false });
  });

  it('sans la capacite relief, le dialogue ne le propose pas et ne le demande pas', () => {
    const lancer = vi.fn();
    const hote = monter(createElement(Actualisation, { infos: { parcelle: 'P', nbIgn: 0, nbVoisines: 0, reliefPermis: false, aUnRelief: false }, lancer, fermer: vi.fn() }));
    expect(hote.querySelector('[data-controle="actualisation.relief"]')).toBeNull();
    act(() => { (hote.querySelector('[data-controle="actualisation.lancer"]') as HTMLButtonElement).click(); });
    expect(lancer.mock.calls[0]![0].relief.actif).toBe(false);
  });
});

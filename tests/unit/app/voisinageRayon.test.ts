import { describe, it, expect, vi, afterEach } from 'vitest';
import { construireVoisinage } from '../../../src/app/actualisationIgn.js';
import { dansLeRayon, distanceAuCentre, interrogerCadastreEtendu, MAX_OBJETS_RAYON } from '../../../src/geo/apiIgn.js';
import { projecteurLocal } from '../../../src/geo/projection.js';
import { empriseGeoJSON } from '../../../src/geo/apiIgn.js';
import type { ObjetPlan } from '../../../src/model/types.js';

// Le voisinage etendu : tout ce qui est dans un rayon, en plusieurs requetes a l'IGN. Un service
// factice sert le cadastre par pages de 1 000 (`_start`) et la BD TOPO par pages (`STARTINDEX`).

const lat0 = 45.75, lon0 = 4.8;
const proj = projecteurLocal(lat0, lon0);
/** Un carre de 10 m de cote dont le coin sud-ouest est en (x, y) metres, en anneau de degres. */
const carre = (x: number, y: number): [number, number][] => [[x, y], [x + 10, y], [x + 10, y + 10], [x, y + 10], [x, y]].map(([a, b]) => { const d = proj.versDegres(a as number, b as number); return [d.lon, d.lat] as [number, number]; });
const feature = (id: string, x: number, y: number, props: Record<string, unknown>) => ({ type: 'Feature', id, properties: props, geometry: { type: 'Polygon', coordinates: [carre(x, y)] } });
/** Des parcelles sur une grille de 100 m, de -800 a +800 m : 17 x 17 = 289, dont ~80 a moins de 500 m. */
const grille = (fabrique: (n: number, x: number, y: number) => unknown): unknown[] => {
  const out: unknown[] = [];
  let n = 1;
  for (let x = -800; x <= 800; x += 100) for (let y = -800; y <= 800; y += 100) { out.push(fabrique(n, x, y)); n++; }
  return out;
};
const parcelles = () => grille((n, x, y) => feature('p' + n, x, y, { idu: 'IDU' + n, section: 'AB', numero: String(n), code_insee: x < 0 ? '69001' : '69002', nom_com: 'Lyon', contenance: 100 }));
const batiments = () => grille((n, x, y) => feature('BAT' + n, x + 2, y + 2, { cleabs: 'BAT' + n, hauteur: '6,5', nature: 'Indifférenciée', usage_1: 'Résidentiel' }));

const reponse = (corps: unknown) => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(corps) } as unknown as Response);
function service(pageCadastre = 1000, pageWfs = 2000) {
  const appels: string[] = [];
  const f = vi.fn((url: string) => {
    appels.push(url);
    const u = new URL(url);
    if (u.hostname === 'apicarto.ign.fr') {
      const start = parseInt(u.searchParams.get('_start') ?? '0', 10), limit = Math.min(pageCadastre, parseInt(u.searchParams.get('_limit') ?? '60', 10));
      // Comme le vrai service : le filtre de commune est honore quand il est demande.
      const insee = u.searchParams.get('code_insee');
      const tout = parcelles().filter(f => !insee || (f as { properties: { code_insee: string } }).properties.code_insee === insee);
      return reponse({ type: 'FeatureCollection', features: tout.slice(start, start + limit), totalFeatures: tout.length });
    }
    const start = parseInt(u.searchParams.get('STARTINDEX') ?? '0', 10), count = Math.min(pageWfs, parseInt(u.searchParams.get('COUNT') ?? '80', 10));
    if ((u.searchParams.get('TYPENAMES') ?? '').includes('batiment')) { const tout = batiments(); return reponse({ type: 'FeatureCollection', features: tout.slice(start, start + count), numberMatched: tout.length }); }
    return reponse({ type: 'FeatureCollection', features: [] });
  });
  vi.stubGlobal('fetch', f);
  return { appels };
}
afterEach(() => vi.unstubAllGlobals());

const parcelle = { key: 'parcelle', type: 'polygon', name: 'P', fonction: 'terrain', pts: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }] } as ObjetPlan;
const cad = { idu: 'IDU145', codeInsee: '69002', origineLat: lat0, origineLon: lon0, geometrieSource: { coordinates: [carre(0, 0)] } };

describe('le disque', () => {
  it('retient ce qui touche le rayon et trie du plus proche au plus loin', () => {
    expect(dansLeRayon([{ x: 490, y: 0 }, { x: 510, y: 0 }], { x: 0, y: 0 }, 500)).toBe(true);
    expect(dansLeRayon([{ x: 510, y: 0 }], { x: 0, y: 0 }, 500)).toBe(false);
    expect(distanceAuCentre([{ x: 30, y: 40 }, { x: 300, y: 400 }], { x: 0, y: 0 })).toBe(50);
  });
});

describe('le voisinage dans un rayon de 500 m', () => {
  it('pagine le cadastre et la BD TOPO, ne garde que le disque, et ne refait pas la parcelle du projet', async () => {
    const s = service(100, 50);   // des petites pages : la pagination est forcee
    const r = await construireVoisinage(parcelle, cad, proj, true, { batiments: true, vegetation: false, arbres: false, rayonM: 500 }, []);
    expect(r.rayonM).toBe(500);
    expect(r.tronque).toBeFalsy();
    const pagesCadastre = s.appels.filter(u => u.includes('apicarto.ign.fr'));
    expect(pagesCadastre.length).toBeGreaterThan(1);
    expect(pagesCadastre.every(u => u.includes('_start=') && !u.includes('code_insee'))).toBe(true);
    expect(s.appels.filter(u => u.includes('STARTINDEX')).length).toBeGreaterThan(1);
    const parcellesAjoutees = r.objets.filter(o => o.fonction === 'terrain');
    expect(r.parcelles).toBe(parcellesAjoutees.length);
    // Un carre de 10 m touche le disque de 500 m des que l'un de ses coins est dedans ; la parcelle du projet n'y est pas.
    parcellesAjoutees.forEach(o => { expect(dansLeRayon((o as { pts: { x: number; y: number }[] }).pts, { x: 5, y: 5 }, 500)).toBe(true); expect(o.cadastre?.idu).not.toBe('IDU145'); });
    expect(parcellesAjoutees.length).toBeGreaterThan(70);
    expect(parcellesAjoutees.length).toBeLessThan(120);
    // Les plus proches d'abord, et les deux communes.
    const d = parcellesAjoutees.map(o => distanceAuCentre((o as { pts: { x: number; y: number }[] }).pts, { x: 5, y: 5 }));
    expect(d.every((v, i) => i === 0 || v >= (d[i - 1] ?? 0))).toBe(true);
    expect(new Set(parcellesAjoutees.map(o => o.cadastre?.codeInsee)).size).toBe(2);
    expect(r.batiments).toBeGreaterThan(70);
    expect(r.objets.filter(o => o.fonction === 'batiment').every(o => o.voisinage && o.locked)).toBe(true);
  });

  it('ne duplique pas ce qui est deja dans le plan', async () => {
    service();
    const deja = [{ key: 'x', type: 'polygon', fonction: 'terrain', pts: [], cadastre: { idu: 'IDU146' } }, { key: 'y', type: 'polygon', fonction: 'batiment', pts: [], bdtopo: { id: 'BAT146' } }] as never[];
    const r = await construireVoisinage(parcelle, cad, proj, true, { batiments: true, vegetation: false, arbres: false, rayonM: 500 }, deja);
    expect(r.objets.some(o => o.cadastre?.idu === 'IDU146')).toBe(false);
    expect(r.objets.some(o => (o.bdtopo as { id?: string } | undefined)?.id === 'BAT146')).toBe(false);
  });

  it('en mode adjacent, rien ne change : une seule requete cadastre, filtree par commune, sans pagination', async () => {
    const s = service();
    const r = await construireVoisinage(parcelle, cad, proj, true, { batiments: false, vegetation: false, arbres: false }, []);
    expect(r.rayonM).toBeUndefined();
    const cadastre = s.appels.filter(u => u.includes('apicarto.ign.fr'));
    expect(cadastre).toHaveLength(1);
    expect(cadastre[0]).toContain('code_insee=69002');
    expect(cadastre[0]).not.toContain('_start');
  });
});

describe('les garde-fous du service cadastre etendu', () => {
  it('refuse une reponse dont une parcelle est loin de l emprise (vidage national)', async () => {
    vi.stubGlobal('fetch', vi.fn(() => reponse({ type: 'FeatureCollection', features: [feature('loin', 0, 0, { idu: 'X' }), { type: 'Feature', id: 'ailleurs', properties: { idu: 'Y' }, geometry: { type: 'Polygon', coordinates: [[[5.5, 43.3], [5.5, 43.31], [5.51, 43.31], [5.5, 43.3]]] } }] })));
    await expect(interrogerCadastreEtendu(empriseGeoJSON(lon0, lat0, proj, 600), 10)).rejects.toThrow(/incoherente/);
  });

  it('s arrete au plafond', async () => {
    service();
    const emprise = empriseGeoJSON(lon0, lat0, proj, 600);
    expect((await interrogerCadastreEtendu(emprise, 50)).length).toBe(50);
    expect(MAX_OBJETS_RAYON).toBe(2000);
  });
});

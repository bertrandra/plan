import { describe, it, expect, vi } from 'vitest';
import {
  lireRelief, decoderBil, lireNombreMatched, urlGrille, urlDallesLidar, requeteAvecReprise, SOURCE_LIDAR, SOURCE_RGE_ALTI
} from '../../../src/geo/relief.js';
import type { ObjetPlan } from '../../../src/model/types.js';

// La lecture du relief a l'IGN (MD/spec-relief.md §2, §4, §9.2), sans reseau : un `fetch` factice
// rend des grilles BIL fabriquees. Le choix de la source, la reprise, le refus.

const parcelle: ObjetPlan = { key: 'parcelle', type: 'polygon', name: 'P', fonction: 'terrain', pts: [{ x: 0, y: 0 }, { x: 30, y: 0 }, { x: 30, y: -20 }, { x: 0, y: -20 }] } as ObjetPlan;
const ref = { lat: 45.75, lon: 4.8, x: 0, y: 0 };

/** Une grille BIL : `nx × ny` flottants, z(x, y) ou `sansDonnee` la ou `trou` le dit. */
function bil(nx: number, ny: number, z: (k: number) => number): ArrayBuffer {
  const b = new ArrayBuffer(nx * ny * 4), v = new DataView(b);
  for (let k = 0; k < nx * ny; k++) v.setFloat32(k * 4, z(k), true);
  return b;
}
const reponse = (corps: ArrayBuffer | string | object, ok = true, status = 200): Response => ({
  ok, status,
  arrayBuffer: () => Promise.resolve(corps as ArrayBuffer),
  text: () => Promise.resolve(String(corps)),
  json: () => Promise.resolve(corps)
}) as unknown as Response;
const dims = (url: string) => { const u = new URL(url); return { nx: +u.searchParams.get('WIDTH')!, ny: +u.searchParams.get('HEIGHT')! }; };

/** Un service factice : des dalles LiDAR ou non, et une grille par calque. */
function service(o: { dalles: number; lidar?: (k: number, nx: number) => number; rge?: (k: number, nx: number) => number; pannes?: number }) {
  let pannes = o.pannes ?? 0;
  const appels: string[] = [];
  const f = vi.fn(async (url: string) => {
    appels.push(url);
    if (pannes > 0) { pannes--; throw new TypeError('coupure'); }
    if (url.includes('RESULTTYPE=hits')) return reponse('<wfs:FeatureCollection numberMatched="' + o.dalles + '" numberReturned="0"/>');
    if (url.includes(encodeURIComponent('IGNF_LIDAR-HD_METADONNEE:metadata'))) return reponse({ features: [{ properties: { date_fin_acquisition: '2021-09-24Z', systeme_altimetrique: 'IGN69' } }] });
    if (url.includes(encodeURIComponent('ELEVATIONGRIDCOVERAGE.HIGHRES.QUALITY:source_fra'))) return reponse({ features: [{ properties: { origine: 'Corrélation d’images', resolution: '5 m', precision: 'Emq < 1 m' } }] });
    const { nx, ny } = dims(url);
    if (url.includes(SOURCE_LIDAR.couche)) return reponse(bil(nx, ny, (k) => (o.lidar ?? (() => SOURCE_LIDAR.sansDonnee))(k, nx)));
    if (url.includes(SOURCE_RGE_ALTI.couche)) return reponse(bil(nx, ny, (k) => (o.rge ?? (() => SOURCE_RGE_ALTI.sansDonnee))(k, nx)));
    return reponse('', false, 404);
  });
  return { rechercher: f as unknown as typeof fetch, appels };
}
const horloge = () => new Date('2026-10-06T10:00:00Z');

describe('decodage', () => {
  it('lit des flottants petit-boutistes, arrondit au centimetre, et fait des sans-donnee des null', () => {
    const z = decoderBil(bil(3, 2, (k) => [1.234, -9999, 2.005, 3, -99999, 4.5][k]!), 3, 2, -9999);
    expect(z).toEqual([1.23, null, 2.01, 3, null, 4.5]);
    expect(() => decoderBil(new ArrayBuffer(8), 3, 2, -9999)).toThrow(/grille inattendue/);
  });

  it('compte les dalles d une reponse hits', () => {
    expect(lireNombreMatched('<a numberMatched="507791"/>')).toBe(507791);
    expect(lireNombreMatched('')).toBe(0);
  });

  it('demande une colonne par cellule, en CRS:84, en nombres bruts', () => {
    const u = new URL(urlGrille(SOURCE_RGE_ALTI.couche, { lonMin: 4.8, latMin: 45.75, lonMax: 4.81, latMax: 45.76 }, 60, 40));
    expect(u.searchParams.get('FORMAT')).toBe('image/x-bil;bits=32');
    expect(u.searchParams.get('CRS')).toBe('CRS:84');
    expect(u.searchParams.get('BBOX')).toBe('4.8000000,45.7500000,4.8100000,45.7600000');
    expect(u.searchParams.get('WIDTH')).toBe('60');
    expect(new URL(urlDallesLidar({ lonMin: 4.8, latMin: 45.75, lonMax: 4.81, latMax: 45.76 })).searchParams.get('RESULTTYPE')).toBe('hits');
  });
});

describe('le choix de la source', () => {
  it('prend le LiDAR HD quand des dalles couvrent la parcelle et que la grille est pleine', async () => {
    const s = service({ dalles: 4, lidar: (k, nx) => 200 + (k % nx) * 0.01 });
    const r = await lireRelief({ parcelle: parcelle.pts, ref, objets: [parcelle], rechercher: s.rechercher, aujourdhui: horloge });
    expect(r.source).toBe('lidar-hd');
    expect(r.pas).toBe(0.5);
    expect(r.couche).toBe(SOURCE_LIDAR.couche);
    expect(r.dateLecture).toBe('2026-10-06');
    expect(r.dateDonnees).toBe('2021-09-24');
    expect(r.precision).toMatch(/10 cm/);
    expect(r.systemeAltimetrique).toBe('NGF-IGN69');
    // Parcelle 30 × 20, plus 10 m : 50 × 40 m a 0,5 m.
    expect(r.nx).toBe(100); expect(r.ny).toBe(80);
    expect(r.z).toHaveLength(8000);
    expect(r.x0).toBe(-9.75); expect(r.y0).toBe(9.75);
    expect(r.zRef).toBeGreaterThan(200);
    expect(s.appels.some(u => u.includes(SOURCE_RGE_ALTI.couche))).toBe(false);
  });

  it('se replie sur le RGE ALTI sans dalle, avec la precision du masque de source', async () => {
    const s = service({ dalles: 0, rge: () => 150 });
    const r = await lireRelief({ parcelle: parcelle.pts, ref, objets: [parcelle], rechercher: s.rechercher, aujourdhui: horloge });
    expect(r.source).toBe('rge-alti');
    expect(r.pas).toBe(1);
    expect(r.nx).toBe(50); expect(r.ny).toBe(40);
    expect(r.origine).toBe('Corrélation d’images (5 m)');
    expect(r.precision).toBe('Emq < 1 m');
    expect(r.dateDonnees).toBeUndefined();
    expect(r.zRef).toBe(150);
    expect(s.appels.some(u => u.includes(SOURCE_LIDAR.couche))).toBe(false);
  });

  it('se replie aussi quand le LiDAR a un trou sur la parcelle, et refuse si le RGE ALTI en a un', async () => {
    // Le LiDAR manque au centre de la parcelle ; le RGE ALTI est plein.
    const trou = (k: number, nx: number) => (k % nx === 40 && Math.floor(k / nx) === 30 ? -9999 : 100);
    const s = service({ dalles: 2, lidar: trou, rge: () => 99 });
    const r = await lireRelief({ parcelle: parcelle.pts, ref, objets: [parcelle], rechercher: s.rechercher, aujourdhui: horloge });
    expect(r.source).toBe('rge-alti');
    // Un trou sur les abords seulement ne gene pas (la premiere cellule, hors parcelle).
    const abords = service({ dalles: 2, lidar: (k) => (k === 0 ? -9999 : 100) });
    expect((await lireRelief({ parcelle: parcelle.pts, ref, objets: [parcelle], rechercher: abords.rechercher, aujourdhui: horloge })).source).toBe('lidar-hd');
    const rien = service({ dalles: 0 });
    await expect(lireRelief({ parcelle: parcelle.pts, ref, objets: [parcelle], rechercher: rien.rechercher, aujourdhui: horloge })).rejects.toThrow(/Pas de relief IGN/);
  });

  it('refuse une parcelle trop grande', async () => {
    const geante = [{ x: 0, y: 0 }, { x: 1500, y: 0 }, { x: 1500, y: -1500 }, { x: 0, y: -1500 }];
    const s = service({ dalles: 0, rge: () => 1 });
    await expect(lireRelief({ parcelle: geante, ref, objets: [], rechercher: s.rechercher, aujourdhui: horloge })).rejects.toThrow(/trop grande/);
  });
});

describe('la reprise reseau', () => {
  it('rejoue une fois une coupure, et deux coupures echouent', async () => {
    const une = service({ dalles: 0, rge: () => 10, pannes: 1 });
    const r = await lireRelief({ parcelle: parcelle.pts, ref, objets: [parcelle], rechercher: une.rechercher, aujourdhui: horloge });
    expect(r.source).toBe('rge-alti');
    const deux = service({ dalles: 0, rge: () => 10, pannes: 2 });
    // La premiere requete (les dalles) tombe deux fois : son echec est avale (zero dalle), la suite passe.
    await expect(lireRelief({ parcelle: parcelle.pts, ref, objets: [parcelle], rechercher: deux.rechercher, aujourdhui: horloge })).resolves.toBeTruthy();
    const f = vi.fn(async () => { throw new TypeError('coupure'); }) as unknown as typeof fetch;
    await expect(requeteAvecReprise('u', r => r.text(), f)).rejects.toThrow(/coupure/);
    expect(f).toHaveBeenCalledTimes(2);
  });

  it('ne rejoue pas un refus du service (4xx)', async () => {
    const f = vi.fn(async () => reponse('', false, 400)) as unknown as typeof fetch;
    await expect(requeteAvecReprise('u', r => r.text(), f)).rejects.toThrow(/HTTP 400/);
    expect(f).toHaveBeenCalledTimes(1);
  });
});

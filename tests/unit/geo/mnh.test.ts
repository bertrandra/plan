import { describe, it, expect, vi } from 'vitest';
import { lireHauteursSous, dallesLidarSur, COUCHE_MNH, RETRAIT_MNH_M } from '../../../src/geo/mnh.js';
import { projecteurLocal } from '../../../src/geo/projection.js';
import type { PtBrut } from '../../../src/model/types.js';

// Le MNH LiDAR HD sous un batiment (MD/spec-toit-ign.md §10) : la grille demandee au WMS, decodee,
// et les cellules gardees — sous le contour, en retrait des murs.

const proj = projecteurLocal(48.9, 2.13);
const p = (x: number, y: number): PtBrut => ({ x, y });
const maison = [p(0, 0), p(10, 0), p(10, 8), p(0, 8)];

/** Un service qui repond une grille BIL dont chaque cellule vaut `z(lon, lat)`. */
function serviceBil(z: (x: number, y: number) => number) {
  return vi.fn(async (url: string) => {
    const u = new URL(url);
    const nx = Number(u.searchParams.get('WIDTH')), ny = Number(u.searchParams.get('HEIGHT'));
    const [lonMin, latMin, lonMax, latMax] = (u.searchParams.get('BBOX') ?? '').split(',').map(Number) as [number, number, number, number];
    const octets = new ArrayBuffer(nx * ny * 4);
    const vue = new DataView(octets);
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const lon = lonMin + ((i + 0.5) / nx) * (lonMax - lonMin), lat = latMax - ((j + 0.5) / ny) * (latMax - latMin);
      const m = proj.versMetres(lon, lat);
      vue.setFloat32((j * nx + i) * 4, z(m.x, m.y), true);
    }
    return { ok: true, status: 200, arrayBuffer: async () => octets } as unknown as Response;
  });
}

describe('lireHauteursSous', () => {
  it('demande la couche MNH au pas de 50 cm et garde les cellules sous le contour, en retrait des murs', async () => {
    // 7 m partout, -9999 (sans donnee) sur une bande a l'est.
    const rechercher = serviceBil((x) => (x > 9 ? -9999 : 7));
    const ech = await lireHauteursSous(maison, proj, rechercher as unknown as typeof fetch);
    const url = rechercher.mock.calls[0]![0] as string;
    expect(url).toContain('LAYERS=' + encodeURIComponent(COUCHE_MNH).replace(/%2E/g, '.'));
    expect(url).toContain('FORMAT=image%2Fx-bil%3Bbits%3D32');
    // (10 - 1,2) x (8 - 1,2) m au pas de 50 cm : autour de 240 cellules, aucune a moins de 60 cm d'un mur.
    expect(ech.length).toBeGreaterThan(180);
    expect(ech.length).toBeLessThan(300);
    expect(ech.every((e) => e.z === 7)).toBe(true);
    expect(ech.every((e) => e.x >= RETRAIT_MNH_M - 0.01 && e.x <= 10 - RETRAIT_MNH_M + 0.01 && e.y >= RETRAIT_MNH_M - 0.01 && e.y <= 8 - RETRAIT_MNH_M + 0.01)).toBe(true);
    expect(ech.some((e) => e.x > 9)).toBe(false);
  });

  it('lit un abri trop etroit pour le retrait en entier', async () => {
    const abri = [p(0, 0), p(3, 0), p(3, 1), p(0, 1)];
    const ech = await lireHauteursSous(abri, proj, serviceBil(() => 2.4) as unknown as typeof fetch);
    expect(ech.length).toBeGreaterThan(5);
  });

  it('ne rend rien quand le service ne repond pas, sans lever', async () => {
    const rechercher = vi.fn(async () => ({ ok: false, status: 404 }) as unknown as Response);
    expect(await lireHauteursSous(maison, proj, rechercher as unknown as typeof fetch)).toEqual([]);
    expect(await lireHauteursSous([p(0, 0)], proj, rechercher as unknown as typeof fetch)).toEqual([]);
  });
});

describe('dallesLidarSur', () => {
  it('compte les dalles LiDAR sur l emprise des points, et dit non sans reponse', async () => {
    const oui = vi.fn(async () => ({ ok: true, status: 200, text: async () => '<wfs:FeatureCollection numberMatched="2" numberReturned="0"/>' }) as unknown as Response);
    expect(await dallesLidarSur(maison, proj, oui as unknown as typeof fetch)).toBe(true);
    expect(String((oui.mock.calls as unknown as string[][])[0]![0])).toContain('RESULTTYPE=hits');
    const non = vi.fn(async () => ({ ok: true, status: 200, text: async () => '<wfs:FeatureCollection numberMatched="0"/>' }) as unknown as Response);
    expect(await dallesLidarSur(maison, proj, non as unknown as typeof fetch)).toBe(false);
    const panne = vi.fn(async () => { throw new Error('coupure'); });
    expect(await dallesLidarSur(maison, proj, panne as unknown as typeof fetch)).toBe(false);
  });
});

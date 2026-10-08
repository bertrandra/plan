import { describe, it, expect, vi, afterEach } from 'vitest';
import { objetsDepuisCadastre, type ImportCadastral, type ParcelleCadastrale, type ObjetBdTopo } from '../../../src/geo/cadastreObjets.js';
import { lireVoisinageRayon, filtrerVoisinageRayon, rayonEtenduValide, rayonDeLecture, plafondLecture, RAYON_ETENDU_MIN_M, RAYON_ETENDU_MAX_M, RAYONS_LECTURE_M, MAX_OBJETS_RAYON } from '../../../src/geo/apiIgn.js';
import { projecteurLocal } from '../../../src/geo/projection.js';
import type { PtBrut } from '../../../src/model/types.js';

// Le voisinage etendu de l'import depuis une adresse (etape 3) : 100 ou 200 m, lu en plusieurs
// requetes, ajoute marque « voisinage » et verrouille, sans doublon, masque si l'affichage est decoche.

const proj = projecteurLocal(48.9, 2.15);
const carre = (x0: number, y0: number, l: number, h: number): PtBrut[] =>
  [{ x: x0, y: y0 }, { x: x0 + l, y: y0 }, { x: x0 + l, y: y0 + h }, { x: x0, y: y0 + h }];
const parcelle = (idu: string, numero: string, pts: PtBrut[]): ParcelleCadastrale => ({
  idu, codeInsee: '78650', commune: 'Le Vesinet', section: 'AE', numero, contenance: 100, pts,
  anneauDeg: pts.map(p => { const d = proj.versDegres(p.x, p.y); return [d.lon, d.lat] as [number, number]; }), distance: 1
});
const bati = (id: string, pts: PtBrut[]): ObjetBdTopo => ({ id, pts, parcelles: [], props: { hauteur: '6,5' } });

function importe(voisinage: NonNullable<ImportCadastral['voisinageEtendu']> | null): ImportCadastral {
  const a = parcelle('A', '0001', carre(0, 0, 20, 30));
  const v = parcelle('V', '0002', carre(20, 0, 15, 30));
  return {
    principale: a, parcellesPropriete: () => [a], proj, simplifier: true,
    voisinesRetenues: () => [v], importerBatiments: true,
    batiments: [{ id: 'B1', pts: carre(22, 5, 5, 5), parcelles: ['V'], props: {} }],
    importerHaies: false, haies: [], importerVegetation: false, vegetation: [],
    voisinageEtendu: voisinage
  };
}

describe('le voisinage etendu dans les objets importes', () => {
  it('ajoute les parcelles et le bati du disque, marques voisinage et verrouilles, sans doublon', () => {
    const objets = objetsDepuisCadastre(importe({
      parcelles: [parcelle('V', '0002', carre(20, 0, 15, 30)), parcelle('X', '0003', carre(60, 0, 10, 10)), parcelle('A', '0001', carre(0, 0, 20, 30))],
      batiments: [bati('B1', carre(22, 5, 5, 5)), bati('B2', carre(62, 2, 4, 4))],
      visible: true
    }));
    const etendus = objets.filter(o => o.voisinage);
    expect(etendus.map(o => o.cadastre?.idu ?? (o.bdtopo as { id?: string }).id)).toEqual(['X', 'B2']);
    expect(etendus.every(o => o.locked)).toBe(true);
    // La voisine cochee et son batiment restent ce qu'ils etaient : pas marques voisinage.
    expect(objets.filter(o => o.cadastre?.idu === 'V').map(o => !!o.voisinage)).toEqual([false]);
    expect(objets.filter(o => (o.bdtopo as { id?: string } | undefined)?.id === 'B1')).toHaveLength(1);
    expect(objets[0]!.affichage?.voisinage).toBeUndefined();
  });

  it('pose le voisinage masque quand l option d affichage est decochee, et ne prend pas le bati sans la couche', () => {
    const i = importe({ parcelles: [parcelle('X', '0003', carre(60, 0, 10, 10))], batiments: [bati('B2', carre(62, 2, 4, 4))], visible: false });
    i.importerBatiments = false;
    const objets = objetsDepuisCadastre(i);
    expect(objets[0]!.affichage).toEqual({ voisinage: false });
    expect(objets.filter(o => o.voisinage).map(o => o.cadastre?.idu)).toEqual(['X']);
  });

  it('ne change rien sans voisinage etendu', () => {
    const sans = objetsDepuisCadastre(importe(null));
    expect(sans.some(o => o.voisinage)).toBe(false);
    expect(sans[0]!.affichage).toBeUndefined();
  });
});

describe('la lecture d un voisinage dans un rayon', () => {
  afterEach(() => vi.unstubAllGlobals());
  const reponse = (corps: unknown) => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(corps) } as unknown as Response);
  const feature = (id: string, pts: PtBrut[], props: Record<string, unknown>) => ({ type: 'Feature', id, properties: props, geometry: { type: 'Polygon', coordinates: [[...pts, pts[0]!].map(p => { const d = proj.versDegres(p.x, p.y); return [d.lon, d.lat]; })] } });

  it('borne le curseur de 10 a 1 000 m, au pas de 10', () => {
    expect([RAYON_ETENDU_MIN_M, RAYON_ETENDU_MAX_M]).toEqual([10, 1000]);
    expect([0, 14, 15, 137, 999, 4000, Number.NaN].map(rayonEtenduValide)).toEqual([10, 10, 20, 140, 1000, 1000, 50]);
  });

  it('lit le disque par paliers, et lit plus large que le plafond au-dela de 200 m', () => {
    expect(RAYONS_LECTURE_M).toEqual([200, 500, 1000]);
    expect([10, 200, 210, 500, 510, 1000].map(rayonDeLecture)).toEqual([200, 200, 500, 500, 1000, 1000]);
    expect(plafondLecture(200)).toBe(MAX_OBJETS_RAYON * 2);
    expect(plafondLecture(1000)).toBe(MAX_OBJETS_RAYON * 5);
  });

  it('garde le disque, trie, exclut la parcelle du projet, puis filtre localement a un rayon plus petit', async () => {
    const appels: string[] = [];
    vi.stubGlobal('fetch', vi.fn((url: string) => {
      appels.push(url);
      if (url.includes('apicarto')) return reponse({ features: [
        feature('a', carre(0, 0, 10, 10), { idu: 'A' }), feature('loin', carre(180, 0, 10, 10), { idu: 'L' }),
        feature('pres', carre(40, 0, 10, 10), { idu: 'P' }), feature('hors', carre(300, 0, 10, 10), { idu: 'H' })
      ], totalFeatures: 4 });
      return reponse({ features: [feature('b', carre(45, 2, 4, 4), { cleabs: 'B' })], numberMatched: 1 });
    }));
    const r100 = await lireVoisinageRayon({ x: 5, y: 5 }, proj, 100, false, new Set(['A']));
    expect(r100.parcelles.map(c => c.idu)).toEqual(['P']);
    expect(r100.batiments).toHaveLength(1);
    const r200 = await lireVoisinageRayon({ x: 5, y: 5 }, proj, 200, false, new Set(['A']));
    expect(r200.parcelles.map(c => c.idu)).toEqual(['P', 'L']);
    // Le curseur : sans nouvel appel, le disque de 200 m ramene a 100 m rend ce que la lecture a 100 m rendait.
    const avant = appels.length;
    const f100 = filtrerVoisinageRayon(r200, { x: 5, y: 5 }, 100);
    expect(f100.parcelles.map(c => c.idu)).toEqual(r100.parcelles.map(c => c.idu));
    expect(f100.batiments).toHaveLength(1);
    expect(f100.rayonM).toBe(100);
    expect(filtrerVoisinageRayon(r200, { x: 5, y: 5 }, 30).parcelles).toEqual([]);
    expect(filtrerVoisinageRayon(r200, { x: 5, y: 5 }, 200, { idus: new Set(['L']), ids: new Set([r200.batiments[0]!.id as string]) }).parcelles.map(c => c.idu)).toEqual(['P']);
    expect(filtrerVoisinageRayon(r200, { x: 5, y: 5 }, 200, { ids: new Set([r200.batiments[0]!.id as string]) }).batiments).toEqual([]);
    expect(appels.length).toBe(avant);
    expect(appels.some(u => u.includes('_start=') && u.includes('apicarto'))).toBe(true);
    expect(appels.some(u => u.includes('STARTINDEX='))).toBe(true);
  });
});

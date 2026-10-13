import { describe, it, expect, vi } from 'vitest';
import { planDeDepart, chargerAutour, fautRecharger, RAYON_AUDIT_M, PAS_RECHARGE_M } from '../../../../src/app/audit/chargement.js';
import { projecteurLocal } from '../../../../src/geo/projection.js';
import type { ObjetPlan, ObjetBrut } from '../../../../src/model/types.js';

// Le chargement du mode audit (app/audit/chargement.ts) : la parcelle sous le point, puis tout ce qui
// est a 70 m de la position, toits en calcul entier. Les services sont remplaces par des espions.

const lat0 = 48.9, lon0 = 2.13;
const projPoint = projecteurLocal(lat0, lon0);
/** Un carre de `c` m dont le coin sud-ouest est en (x, y) metres du point, en anneau de degres. */
const carre = (x: number, y: number, c: number): [number, number][] => [[x, y], [x + c, y], [x + c, y + c], [x, y + c], [x, y]].map(([a, b]) => { const d = projPoint.versDegres(a as number, b as number); return [d.lon, d.lat] as [number, number]; });
const feature = (idu: string, x: number, y: number, c: number) => ({ type: 'Feature', id: idu, properties: { idu, section: 'AE', numero: idu.slice(-3), code_insee: '78650', nom_com: 'Le Vésinet', contenance: c * c }, geometry: { type: 'Polygon', coordinates: [carre(x, y, c)] } });

describe('le chargement du mode audit', () => {
  it('part de la parcelle qui contient le point, calee comme a l import', async () => {
    const interroger = vi.fn(async () => [feature('78650000AE0102', 15, -5, 10), feature('78650000AE0101', -10, -10, 20)] as never);
    const depart = await planDeDepart(lon0, lat0, { interrogerCadastre: interroger });
    expect(depart).not.toBeNull();
    const parcelle = depart!.objets.find((o) => o.key === 'parcelle')!;
    expect((parcelle.cadastre as { idu: string }).idu).toBe('78650000AE0101');
    expect(depart!.objets).toHaveLength(1);
    // Le repere du plan est celui du calage cadastral (sommet nord), pas celui du point.
    const p = depart!.proj.versMetres(lon0, lat0);
    expect(Math.hypot(p.x, p.y)).toBeGreaterThan(1);
    expect(await planDeDepart(lon0, lat0, { interrogerCadastre: vi.fn(async () => []) })).toBeNull();
  });

  it('lit autour de la position, garde le bati de la parcelle de depart, et lit chaque toit en calcul entier', async () => {
    const depart = (await planDeDepart(lon0, lat0, { interrogerCadastre: vi.fn(async () => [feature('78650000AE0101', -10, -10, 20)] as never) }))!;
    const bati = { key: 'bati-1', fonction: 'batiment', pts: [{ x: 0, y: 0 }, { x: 8, y: 0 }, { x: 8, y: 6 }] } as ObjetBrut;
    const voisine = { key: 'parcelle-ae-102', fonction: 'terrain', pts: [] } as unknown as ObjetBrut;
    const construire = vi.fn(async () => ({ objets: [bati, voisine], parcelles: 1, batiments: 1, vegetation: 0, arbres: 0 }));
    const toits = vi.fn(async () => ({ ajustes: 0, mesures: 0, corpsVoisins: 0, recales: 0, gardes: 0, sansLidar: false }));
    const couleurs = vi.fn(async () => ({ lus: 0, replis: 0 }) as never);
    const ajouts = await chargerAutour(depart.objets, { x: 12, y: -30 }, depart.proj, { construireVoisinage: construire as never, toitsDepuisLidar: toits as never, couleursToits: couleurs });
    expect(ajouts).toEqual([bati, voisine]);
    const choix = (construire.mock.calls[0] as unknown[])[4] as Record<string, unknown>;
    expect(choix).toMatchObject({ batiments: true, rayonM: RAYON_AUDIT_M, centre: { x: 12, y: -30 }, batiPrincipal: true });
    const options = (toits.mock.calls[0] as unknown[])[2] as { candidats: ObjetBrut[]; mitoyens: Set<string> };
    expect(options.candidats).toEqual([bati]);
    expect([...options.mitoyens]).toEqual(['bati-1']);
    expect(couleurs).toHaveBeenCalledTimes(1);
  });

  it('une lecture qui echoue ne rend rien, et un plan sans parcelle non plus', async () => {
    const depart = (await planDeDepart(lon0, lat0, { interrogerCadastre: vi.fn(async () => [feature('78650000AE0101', -10, -10, 20)] as never) }))!;
    expect(await chargerAutour(depart.objets, { x: 0, y: 0 }, depart.proj, { construireVoisinage: vi.fn(async () => { throw new Error('reseau'); }) as never })).toEqual([]);
    expect(await chargerAutour([] as ObjetPlan[], { x: 0, y: 0 }, depart.proj)).toEqual([]);
  });

  it('relit apres un pas de plus de 10 m', () => {
    expect(fautRecharger(null, { x: 0, y: 0 })).toBe(true);
    expect(fautRecharger({ x: 0, y: 0 }, { x: 6, y: 6 })).toBe(false);
    expect(fautRecharger({ x: 0, y: 0 }, { x: PAS_RECHARGE_M, y: 1 })).toBe(true);
  });
});

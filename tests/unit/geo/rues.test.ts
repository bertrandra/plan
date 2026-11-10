import { describe, it, expect } from 'vitest';
import { nomDuTroncon, ruesDepuisTroncons, lireRues, COUCHE_TRONCON_ROUTE, RAYON_RUES_M, MAX_TRONCONS } from '../../../src/geo/rues.js';
import { projecteurLocal } from '../../../src/geo/projection.js';
import type { FeatureGeoJSON } from '../../../src/geo/apiIgn.js';

const proj = projecteurLocal(48.9, 2.13);
const ligne = (nom: Record<string, unknown>, coords: [number, number][], type = 'LineString'): FeatureGeoJSON =>
  ({ type: 'Feature', properties: nom, geometry: { type, coordinates: type === 'LineString' ? coords : [coords] } }) as unknown as FeatureGeoJSON;
const deg = (x: number, y: number): [number, number] => { const d = proj.versDegres(x, y); return [d.lon, d.lat]; };

describe('nomDuTroncon', () => {
  it('prend le nom de la BAN, sinon celui de la BD TOPO ; null sans nom', () => {
    expect(nomDuTroncon({ nom_voie_ban_gauche: 'Allee des Limites', nom_1_gauche: 'ALL DES LIMITES' })).toBe('Allee des Limites');
    expect(nomDuTroncon({ nom_voie_ban_gauche: null, nom_voie_ban_droite: 'Avenue des Courlis' })).toBe('Avenue des Courlis');
    expect(nomDuTroncon({ nom_1_droite: ' Rue Haute ' })).toBe('Rue Haute');
    expect(nomDuTroncon({ nom_voie_ban_gauche: '  ' })).toBeNull();
    expect(nomDuTroncon(null)).toBeNull();
  });
});

describe('ruesDepuisTroncons', () => {
  it('regroupe par nom, ramene dans le repere du plan au centimetre, ecarte les troncons sans nom', () => {
    const rues = ruesDepuisTroncons([
      ligne({ nom_voie_ban_gauche: 'Avenue des Courlis' }, [deg(0, 0), deg(30, 0)]),
      ligne({ nom_voie_ban_gauche: 'Allee des Limites' }, [deg(0, 10), deg(0, 40)], 'MultiLineString'),
      ligne({ nom_voie_ban_gauche: 'Avenue des Courlis' }, [deg(30, 0), deg(60, 5)]),
      ligne({ nature: 'Chemin' }, [deg(5, 5), deg(9, 9)]),
    ], proj);
    expect(rues.map((r) => r.nom)).toEqual(['Allee des Limites', 'Avenue des Courlis']);
    expect(rues[1]!.troncons).toHaveLength(2);
    expect(rues[1]!.troncons[0]![1]!.x).toBeCloseTo(30, 2);
    expect(rues[0]!.troncons[0]![1]!.y).toBeCloseTo(40, 2);
  });
});

describe('lireRues', () => {
  it('interroge la couche des troncons dans le carre du rayon autour du centre, plafonnee', async () => {
    const appels: { couche: string; bbox: { latMin: number; lonMin: number; latMax: number; lonMax: number }; max: number }[] = [];
    const r = await lireRues({ lat: 48.9, lon: 2.13 }, { x: 10, y: -20 }, RAYON_RUES_M, async (couche, bbox, max) => {
      appels.push({ couche, bbox, max });
      return [ligne({ nom_voie_ban_gauche: 'Rue' }, [deg(0, 0), deg(50, 0)])];
    });
    expect(appels).toHaveLength(1);
    expect(appels[0]!.couche).toBe(COUCHE_TRONCON_ROUTE);
    expect(appels[0]!.max).toBe(MAX_TRONCONS);
    const sw = proj.versMetres(appels[0]!.bbox.lonMin, appels[0]!.bbox.latMin);
    expect(sw.x).toBeCloseTo(10 - RAYON_RUES_M, 3);
    expect(sw.y).toBeCloseTo(-20 - RAYON_RUES_M, 3);
    expect(r.rayonM).toBe(RAYON_RUES_M);
    expect(r.rues.map((x) => x.nom)).toEqual(['Rue']);
    expect(r.recupereLe).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
  });
});

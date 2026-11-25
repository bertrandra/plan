import { describe, it, expect } from 'vitest';
import { nomDuTroncon, ruesDepuisTroncons, lireRues, largeurDuTroncon, chausseesDepuisTroncons, COUCHE_TRONCON_ROUTE, RAYON_RUES_M, MAX_TRONCONS, LARGEUR_PAR_NATURE, LARGEUR_VOIE_M } from '../../../src/geo/rues.js';
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

// Les chaussees de l'option « Rues » (MD/spec-rues.md §7) : les champs tels que le WFS de la BD TOPO les rend (releve du
// 25 novembre 2026 au Vesinet : `nature`, `largeur_de_chaussee` en nombre, `nombre_de_voies`, `importance` en texte, `fictif`,
// `position_par_rapport_au_sol` en texte, `etat_de_l_objet`).
describe('largeurDuTroncon', () => {
  const route = { nature: 'Route à 1 chaussée', importance: '4', fictif: false, position_par_rapport_au_sol: '0', etat_de_l_objet: 'En service' };
  it('prend la largeur lue, sinon le nombre de voies, sinon la largeur de la nature', () => {
    expect(largeurDuTroncon({ ...route, largeur_de_chaussee: 5, nombre_de_voies: 2 })).toBe(5);
    expect(largeurDuTroncon({ ...route, largeur_de_chaussee: 0, nombre_de_voies: 2 })).toBe(2 * LARGEUR_VOIE_M);
    expect(largeurDuTroncon({ ...route, largeur_de_chaussee: null, nombre_de_voies: null })).toBe(LARGEUR_PAR_NATURE['Route à 1 chaussée']);
    expect(largeurDuTroncon({ nature: 'Chemin' })).toBe(2.5);
    // Une largeur aberrante est bornee : elle ne couvre pas le quartier.
    expect(largeurDuTroncon({ ...route, largeur_de_chaussee: 400 })).toBe(30);
    expect(largeurDuTroncon({ ...route, largeur_de_chaussee: '0.2' })).toBe(1);
  });
  it('ne dessine ni sentier, ni escalier, ni piste cyclable, ni troncon fictif, souterrain ou pas en service', () => {
    for (const nature of ['Sentier', 'Escalier', 'Piste cyclable', 'Bac ou liaison maritime', '']) expect(largeurDuTroncon({ nature, largeur_de_chaussee: 3 })).toBeNull();
    expect(largeurDuTroncon({ ...route, fictif: true })).toBeNull();
    expect(largeurDuTroncon({ ...route, position_par_rapport_au_sol: '-1' })).toBeNull();
    expect(largeurDuTroncon({ ...route, position_par_rapport_au_sol: '1', largeur_de_chaussee: 6 })).toBe(6);
    expect(largeurDuTroncon({ ...route, etat_de_l_objet: 'En construction' })).toBeNull();
    expect(largeurDuTroncon(null)).toBeNull();
  });
});

describe('chausseesDepuisTroncons', () => {
  it('garde chaque troncon de voirie, nomme ou non, avec sa nature, sa largeur, son importance, les plus importants en dernier', () => {
    const c = chausseesDepuisTroncons([
      ligne({ nature: 'Route à 1 chaussée', importance: '2', largeur_de_chaussee: 7, nom_voie_ban_gauche: 'Avenue des Courlis' }, [deg(0, 0), deg(30, 0)]),
      ligne({ nature: 'Chemin', importance: '5' }, [deg(5, 5), deg(9, 9)], 'MultiLineString'),
      ligne({ nature: 'Sentier', importance: '5' }, [deg(1, 1), deg(2, 2)]),
      ligne({ nature: 'Rond-point', importance: 'NC', largeur_de_chaussee: 5 }, [deg(0, 0), deg(1, 1)]),
    ], proj);
    expect(c.map((x) => x.nature)).toEqual(['Rond-point', 'Chemin', 'Route à 1 chaussée']);
    expect(c[2]).toMatchObject({ largeurM: 7, importance: 2, nom: 'Avenue des Courlis' });
    expect(c[2]!.pts[1]!.x).toBeCloseTo(30, 2);
    expect(c[1]).toMatchObject({ largeurM: 2.5, importance: 5 });
    expect(c[1]).not.toHaveProperty('nom');
    expect(c[0]).not.toHaveProperty('importance');
  });
});

describe('lireRues, avec les chaussees', () => {
  const lire = async () => [ligne({ nature: 'Route à 1 chaussée', largeur_de_chaussee: 5, nom_voie_ban_gauche: 'Rue' }, [deg(0, 0), deg(50, 0)]), ligne({ nature: 'Chemin' }, [deg(0, 0), deg(0, 20)])];
  it('ne garde les chaussees que si on les demande, de la meme requete', async () => {
    const sans = await lireRues({ lat: 48.9, lon: 2.13 }, { x: 0, y: 0 }, RAYON_RUES_M, lire);
    expect(sans).not.toHaveProperty('chaussees');
    const avec = await lireRues({ lat: 48.9, lon: 2.13 }, { x: 0, y: 0 }, RAYON_RUES_M, lire, { chaussees: true });
    expect(avec.rues.map((r) => r.nom)).toEqual(['Rue']);
    expect(avec.chaussees?.map((c) => [c.nature, c.largeurM])).toEqual([['Route à 1 chaussée', 5], ['Chemin', 2.5]]);
  });
});

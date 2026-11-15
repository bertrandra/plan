// « Ou importer ensuite » (banc/src/ouImporter.ts ; demande du proprietaire, 15 novembre 2026, « niveau suivant » n° 8) : une heuristique
// simple sur ce qui manque au banc (region, type de batiment), et la sonde de la couverture de Panoramax.
import { describe, expect, it } from 'vitest';
import { equilibre, lieuDe, NOMS_REGIONS } from '../src/equilibre.js';
import { dansLaZone, surfaceKm2 } from '../src/lot.js';
import { aDesPhotos, avisDeSaison, LIEUX, ouImporter, urlSondeDuLieu, zoneDuLieu } from '../src/ouImporter.js';
import type { MetaImage } from '../src/types.js';

const image = (m: Partial<MetaImage>): MetaImage => ({ id: 'i' + Math.random().toString(36).slice(2, 8), importeeLe: '2026-11-15T10:00:00Z', statut: 'importee', source: 'panoramax', bloc: '', verifiee: false, ...m });
const maison = { batiment: 'M', cote: 0, usage: 'Résidentiel', logements: 1, hauteur: 6 }, immeuble = { batiment: 'I', cote: 0, usage: 'Résidentiel', logements: 20, hauteur: 20 };

describe('la liste des lieux', () => {
  it('une grande ville et une petite par région, chacune bien dans sa région', () => {
    expect(LIEUX).toHaveLength(26);
    for (const r of NOMS_REGIONS) expect(LIEUX.filter((l) => l.region === r).map((l) => l.type).sort(), r).toEqual(['immeuble', 'maison']);
    for (const l of LIEUX) expect(lieuDe(l.lat, l.lon)?.region, l.nom).toBe(l.region);
  });

  it('la zone proposée est un carré de 1,2 km autour du centre, et la sonde ne demande qu’une photo', () => {
    const lyon = LIEUX[0];
    if (!lyon) throw new Error('sans lieu');
    const z = zoneDuLieu(lyon);
    expect(surfaceKm2(z)).toBeCloseTo(1.44, 2);
    expect(dansLaZone(z, lyon)).toBe(true);
    expect(z.nom).toContain('Lyon');
    expect(urlSondeDuLieu(lyon)).toMatch(/bbox=4\.8\d+,45\.7\d+,4\.8\d+,45\.7\d+&limit=1$/);
    expect(aDesPhotos({ features: [{}] })).toBe(true);
    expect(aDesPhotos({ features: [] })).toBe(false);
    expect(aDesPhotos(null)).toBe(false);
  });
});

describe('ouImporter : là où le jeu est pauvre', () => {
  it('un banc de pavillons d’Île-de-France : d’abord les immeubles des régions vides, une proposition par région, l’Île-de-France en dernier', () => {
    const e = equilibre(Array.from({ length: 20 }, () => image({ lat: 48.8947, lon: 2.1312, mur: maison })));
    const l = ouImporter(e);
    expect(l).toHaveLength(13);
    expect(new Set(l.map((p) => p.lieu.region)).size).toBe(13);
    expect(l.slice(0, 12).every((p) => p.lieu.type === 'immeuble' && p.score === 100)).toBe(true);
    expect(l[0]?.raisons).toEqual([`aucune photo en ${l[0]?.lieu.region}`, '0 % d’immeubles dans le jeu']);
    expect(l.at(-1)?.lieu).toMatchObject({ nom: 'Paris', region: 'Île-de-France' });
    expect(l.at(-1)?.raisons[0]).toBe('20 photo(s) seulement en Île-de-France (100 % du jeu)');
  });

  it('un banc d’immeubles : ce sont les petites villes (des maisons) qui passent devant', () => {
    const e = equilibre(Array.from({ length: 10 }, () => image({ lat: 48.859, lon: 2.347, mur: immeuble })));
    expect(ouImporter(e).slice(0, 5).every((p) => p.lieu.type === 'maison')).toBe(true);
  });

  it('un banc sans mur connu ne dit rien des types : la région seule décide, et ne le prétend pas', () => {
    const e = equilibre([image({ lat: 45.758, lon: 4.835 })]);
    const l = ouImporter(e);
    expect(l[0]?.score).toBe(60);
    expect(l[0]?.raisons).toHaveLength(1);
    expect(l.at(-1)?.lieu.region).toBe('Auvergne-Rhône-Alpes');
  });

  it('un banc vide propose quand même, région par région', () => {
    expect(ouImporter(equilibre([]))).toHaveLength(13);
  });
});

describe('la saison', () => {
  it('se dit quand le jeu manque de photos sans feuilles, sans prétendre la choisir par le lieu', () => {
    const ete = equilibre(Array.from({ length: 12 }, () => image({ date: '2025-07-01T10:00:00Z' })));
    expect(avisDeSaison(ete)).toContain('0 %');
    const hiver = equilibre(Array.from({ length: 12 }, () => image({ date: '2025-01-10T10:00:00Z' })));
    expect(avisDeSaison(hiver)).toBeNull();
    expect(avisDeSaison(equilibre([image({ date: '2025-07-01T10:00:00Z' })]))).toBeNull();
  });
});

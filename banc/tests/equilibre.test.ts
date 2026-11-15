// L'equilibre du jeu de donnees (banc/src/equilibre.ts) : le departement d'une position, la saison d'une date, les comptes, les amas
// de la carte. Demande du proprietaire, 15 novembre 2026 (« niveau suivant », n° 7).

import { describe, expect, it } from 'vitest';
import { DEPARTEMENTS } from '../src/departements.js';
import { amasser, anneeEtMois, duPerimetre, empriseDesPoints, equilibre, lieuDe, NOMS_REGIONS, rayonAmas, saisonDuMois, sansFeuilles, typeDeVue } from '../src/equilibre.js';
import type { MetaImage } from '../src/types.js';

const image = (m: Partial<MetaImage>): MetaImage => ({ id: 'i' + Math.random().toString(36).slice(2, 8), importeeLe: '2026-11-15T10:00:00Z', statut: 'importee', source: 'panoramax', bloc: '', verifiee: false, ...m });

describe('lieuDe : le departement et la region d’une position, sans service', () => {
  it('range les lieux de reference du banc', () => {
    expect(lieuDe(48.893, 2.133)).toEqual({ departement: '78', nom: 'Yvelines', region: 'Île-de-France' });   // 2 allee des Limites, Le Vesinet
    expect(lieuDe(48.8606, 2.3376)).toEqual({ departement: '75', nom: 'Paris', region: 'Île-de-France' });   // 150 rue de Rivoli
    expect(lieuDe(48.12612, 2.88168)).toEqual({ departement: '45', nom: 'Loiret', region: 'Centre-Val de Loire' });   // la campagne (Chevannes)
  });

  it('connait la Corse, une ile, une frontiere et l’outre-mer', () => {
    expect(lieuDe(41.92, 8.74)?.departement).toBe('2A');
    expect(lieuDe(46.2, -1.41)?.departement).toBe('17');
    expect(lieuDe(48.5734, 7.7521)?.departement).toBe('67');
    expect(lieuDe(43.7745, 7.4975)?.departement).toBe('06');
    expect(lieuDe(-20.88, 55.45)).toEqual({ departement: '974', nom: 'La Réunion', region: 'Outre-mer' });
  });

  it('range une photo du front de mer dans le departement voisin, mais pas le large ni l’etranger', () => {
    expect(lieuDe(48.3826, -4.495)?.departement).toBe('29');   // le port de Brest, hors du contour simplifie ou presque
    expect(lieuDe(50.2, -1)).toBeNull();
    expect(lieuDe(51.5, -0.12)).toBeNull();
    expect(lieuDe(47.37, 8.54)).toBeNull();
    expect(lieuDe(Number.NaN, 2)).toBeNull();
  });

  it('a les 96 departements de la metropole, chacun dans une region, et se retrouve au milieu de chacun', () => {
    expect(DEPARTEMENTS).toHaveLength(96);
    for (const d of DEPARTEMENTS) {
      // Le milieu des sommets n'est pas toujours dedans (un departement en croissant) : on demande au moins une region connue.
      const l = lieuDe(...milieu(d.anneaux));
      expect(l, d.code).not.toBeNull();
      expect(NOMS_REGIONS, d.code).toContain(l?.region);
    }
    expect(DEPARTEMENTS.filter((d) => lieuDe(...milieu(d.anneaux))?.departement === d.code).length).toBeGreaterThanOrEqual(90);
  });
});

function milieu(anneaux: number[][]): [number, number] {
  const a = [...anneaux].sort((x, y) => y.length - x.length)[0] ?? [];
  let sx = 0, sy = 0;
  for (let i = 0; i < a.length; i += 2) { sx += a[i] ?? 0; sy += a[i + 1] ?? 0; }
  return [sy / (a.length / 2) / 1000, sx / (a.length / 2) / 1000];
}

describe('la date : annee, mois, saison, feuilles', () => {
  it('lit la date de l’EXIF et celle de Panoramax, refuse le reste', () => {
    expect(anneeEtMois('2018-03-21T09:12:00+00:00')).toEqual({ annee: 2018, mois: 3 });
    expect(anneeEtMois('2024-12-01T08:00:00')).toEqual({ annee: 2024, mois: 12 });
    expect(anneeEtMois(null)).toBeNull();
    expect(anneeEtMois('')).toBeNull();
    expect(anneeEtMois('0000-00-00T00:00:00')).toBeNull();
    expect(anneeEtMois('2024-13-01')).toBeNull();
  });

  it('donne la saison de l’hemisphere nord et les mois sans feuilles (novembre a mars)', () => {
    expect([12, 1, 2].map(saisonDuMois)).toEqual(['hiver', 'hiver', 'hiver']);
    expect([3, 5, 6, 8, 9, 11].map(saisonDuMois)).toEqual(['printemps', 'printemps', 'ete', 'ete', 'automne', 'automne']);
    expect([11, 12, 1, 2, 3].every(sansFeuilles)).toBe(true);
    expect([4, 7, 10].some(sansFeuilles)).toBe(false);
  });
});

describe('equilibre : les comptes', () => {
  const images = [
    image({ lat: 48.893, lon: 2.133, date: '2018-03-21T10:00:00Z', panoramax: { id: 'a', panoramique: true, cap: 90 } }),
    image({ lat: 48.893, lon: 2.134, date: '2018-03-21T10:00:00Z', panoramax: { id: 'a', panoramique: true, cap: 270 }, statut: 'corrigee', bloc: 'train' }),
    image({ lat: 48.8606, lon: 2.3376, date: '2023-07-02T10:00:00Z', panoramax: { id: 'b', panoramique: false }, statut: 'corrigee', bloc: 'reserve' }),
    image({ source: 'iphone', lat: 43.2965, lon: 5.3698, date: '2025-12-24T15:00:00', statut: 'brouillon' }),
    image({ source: 'fichier', statut: 'redressee' }),
    image({ source: 'iphone', lat: 51.5, lon: -0.12, date: null }),
    image({ lat: 48.9, lon: 2.2, statut: 'rejetee' }),
  ];

  it('ne compte pas les rejetees ; le jeu ne prend que les corrigees hors reserve', () => {
    expect(duPerimetre(images, 'toutes')).toHaveLength(6);
    expect(duPerimetre(images, 'jeu')).toHaveLength(1);
  });

  it('compte par source, lieu, saison, annee, type de vue et etat, et dit ce qui manque', () => {
    const e = equilibre(duPerimetre(images, 'toutes'));
    expect(e.total).toBe(6);
    expect({ sansPosition: e.sansPosition, sansDate: e.sansDate, horsFrance: e.horsFrance, sansFeuilles: e.sansFeuilles }).toEqual({ sansPosition: 1, sansDate: 2, horsFrance: 1, sansFeuilles: 3 });
    expect(e.source.map((x) => [x.cle, x.n])).toEqual([['panoramax', 3], ['iphone', 2], ['fichier', 1]]);
    expect(e.departement.map((x) => [x.cle, x.n])).toEqual([['78', 2], ['13', 1], ['75', 1]]);
    expect(e.departement[0]?.libelle).toBe('78 · Yvelines');
    // Les treize regions de la metropole sont toutes la, les vides a zero : c'est elles qu'on cherche.
    expect(e.region).toHaveLength(13);
    expect(e.region.slice(0, 2).map((x) => [x.cle, x.n])).toEqual([['Île-de-France', 3], ['Provence-Alpes-Côte d’Azur', 1]]);
    expect(e.region.filter((x) => x.n === 0)).toHaveLength(11);
    expect(e.saison.map((x) => x.n)).toEqual([1, 2, 1, 0]);
    expect(e.annee.map((x) => [x.cle, x.n])).toEqual([['2025', 1], ['2023', 1], ['2018', 2]]);
    expect(e.vue.map((x) => [x.cle, x.n])).toEqual([['360', 2], ['plate', 4]]);
    expect(e.etat.map((x) => [x.cle, x.n])).toEqual([['importee', 2], ['redressee', 1], ['validee', 0], ['brouillon', 1], ['corrigee', 2]]);
    expect(e.points).toHaveLength(5);
  });

  it('dit le type de vue : tiree d’un 360, sinon plate', () => {
    expect(typeDeVue(image({ panoramax: { id: 'x', panoramique: true } }))).toBe('360');
    expect(typeDeVue(image({ panoramax: { id: 'x', panoramique: false } }))).toBe('plate');
    expect(typeDeVue(image({ source: 'iphone', panoramax: null }))).toBe('plate');
  });

  it('un banc vide ne compte rien et ne plante pas', () => {
    const e = equilibre([]);
    expect(e.total).toBe(0);
    expect(e.departement).toEqual([]);
    expect(e.region.every((x) => x.n === 0)).toBe(true);
    expect(empriseDesPoints(e.points)).toBeNull();
  });
});

describe('la carte : les amas', () => {
  const taille = { l: 800, h: 600 };
  const points = [{ id: 'a', lat: 48.893, lon: 2.133 }, { id: 'b', lat: 48.8931, lon: 2.1331 }, { id: 'c', lat: 43.2965, lon: 5.3698 }];

  it('de loin, deux photos voisines font un rond de deux ; de pres, chacune a le sien', () => {
    const loin = amasser(points, { lat: 46.6, lon: 2.4, zoom: 5.5 }, taille);
    expect(loin.map((a) => a.n).sort()).toEqual([1, 2]);
    expect(loin.reduce((s, a) => s + a.n, 0)).toBe(3);
    const pres = amasser(points, { lat: 48.893, lon: 2.133, zoom: 20 }, taille);
    expect(pres.map((a) => a.n)).toEqual([1, 1]);   // Marseille est hors de l'ecran
  });

  it('un rond grandit avec son nombre, sans depasser 26 px', () => {
    expect(rayonAmas(1)).toBe(7);
    expect(rayonAmas(10)).toBeGreaterThan(rayonAmas(2));
    expect(rayonAmas(100000)).toBe(26);
  });

  it('l’emprise des points les contient tous, avec une marge meme pour un seul', () => {
    const e = empriseDesPoints(points);
    expect(e && e.sud < 43.2965 && e.nord > 48.8931 && e.ouest < 2.133 && e.est > 5.3698).toBe(true);
    const un = empriseDesPoints([{ id: 'a', lat: 48, lon: 2 }]);
    expect(un && un.nord - un.sud).toBeGreaterThan(0.03);
  });
});

import { describe, it, expect } from 'vitest';
import { lirePhotosRue } from '../../../src/geo/panoramax.js';
import { projecteurLocal } from '../../../src/geo/projection.js';
import { emprise, etiquettePhoto, photosParBatiment, texteDuBatiment, idRequeteCandidat, type VillageJson } from '../../../src/app/candidatsPanoramax.js';
import { ORIGINE, RECHERCHE_PANORAMAX, VILLAGE } from '../../fixtures/candidats/village.js';

// Les cas candidats Panoramax (lot G3 bis) : le choix des photos qui montrent un toit. Un village
// entier, par les routes de l'analyse, est joue contre analyse.php (tests/unit/deploy/analysePhpCandidats.test.ts).

const vues = () => {
  const proj = projecteurLocal(ORIGINE.lat, ORIGINE.lon);
  return lirePhotosRue(RECHERCHE_PANORAMAX).map((photo) => ({ photo, ...proj.versMetres(photo.lon, photo.lat) }));
};
const faites = new Map([['A', 10], ['B', 10]]);

describe('les photos qui montrent un toit', () => {
  it('garde la photo de face, avec du recul, et ecarte celle de trop pres et celle qui tourne le dos', () => {
    const p = photosParBatiment(VILLAGE.batiments, vues(), faites);
    expect(p.get('A')?.map((x) => x.vue.photo.id)).toEqual(['pa']);
    expect(p.get('B')?.map((x) => x.vue.photo.id)).toEqual(['pb']);
    const a = p.get('A')![0]!;
    expect(a.distanceM).toBeCloseTo(23, 0);
    expect(Math.min(a.capDeg, 360 - a.capDeg)).toBeCloseTo(0, 0);
    // Le batiment est au milieu de l'image : la photo regarde droit vers lui.
    expect(a.partLargeur).toBeCloseTo(0.5, 2);
  });

  it('perd une photo quand le faite sort du haut du cadre', () => {
    expect(photosParBatiment(VILLAGE.batiments, vues(), new Map([['A', 30], ['B', 10]])).get('A')).toBeUndefined();
  });

  it('cache le batiment derriere un autre : la photo ne le voit pas', () => {
    const avecEcran: VillageJson = { ...VILLAGE, batiments: [...VILLAGE.batiments, { key: 'ecran', pts: [{ x: -2, y: -9 }, { x: 14, y: -9 }, { x: 14, y: -7 }, { x: -2, y: -7 }] }] };
    expect(photosParBatiment(avecEcran.batiments, vues(), faites).get('A')).toBeUndefined();
  });

  it('borne la recherche autour du village, et etiquette chaque photo avec la place du batiment vise', () => {
    const e = emprise(VILLAGE.batiments);
    expect(e.centre).toEqual({ x: 21, y: 5 });
    expect(e.rayonM).toBeCloseTo(15 + 40, 5);
    const a = photosParBatiment(VILLAGE.batiments, vues(), faites).get('A')![0]!;
    expect(etiquettePhoto(1, a)).toMatch(/^Image 1 : photo de rue Panoramax, prise le 2025-06-01, à 23 m du bâtiment visé, qui est vers 0° ; le bâtiment visé est à 50 % de la largeur/);
    expect(texteDuBatiment(VILLAGE.batiments[0]!, null)).toMatch(/Façades à décrire \(étiquettes\) : aucune/);
    expect(idRequeteCandidat(3, 2)).toBe('c3-p2');
  });
});

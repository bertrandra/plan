import { projecteurLocal } from '../../../src/geo/projection.js';
import { reponse } from '../audit/reponseClaude.js';
import type { ImageTelechargee, VillageJson } from '../../../src/app/candidatsPanoramax.js';

// Un petit village fige pour les cas candidats Panoramax (lot G3 bis) : deux maisons cote a cote,
// et une reponse figee de la recherche Panoramax (STAC) avec quatre photos. Pas de reseau : la
// recherche, les photos et Claude sont simules.
//
//   A (0..12 x 0..10), egout 7 m : vue de face a 18 m (photo `pa`), et de trop pres (`pres`, le faite sort du cadre)
//   B (30..42 x 0..10), egout 7 m : vue de face a 18 m (photo `pb`)
//   `dos` : a 20 m de A mais tournee vers le sud, elle ne le voit pas

export const ORIGINE = { lat: 48.8061, lon: 2.1316 };

const rect = (x0: number, y0: number, x1: number, y1: number) => [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];

export const VILLAGE: VillageJson = {
  parcelle: '78646000AE0153',
  origine: ORIGINE,
  batiments: [
    { key: 'A', d: 5, pts: rect(0, 0, 12, 10), bdtopo: { cleabs: 'BATIMENT0000000000000001', hauteurRetenueM: 7 }, toit: null, corps: null, grille: null },
    { key: 'B', d: 30, pts: rect(30, 0, 42, 10), bdtopo: { cleabs: 'BATIMENT0000000000000002', hauteurRetenueM: 7 }, toit: null, corps: null, grille: null },
  ],
};

const HOTE = 'https://panoramax.ign.fr/api/pictures/';

/** Une photo plate 4:3, champ 70 degres, posee en (x, y) du plan et tournee vers `azimut`. */
function photo(id: string, x: number, y: number, azimut: number): object {
  const g = projecteurLocal(ORIGINE.lat, ORIGINE.lon).versDegres(x, y);
  return {
    id, type: 'Feature', geometry: { type: 'Point', coordinates: [g.lon, g.lat] },
    properties: { 'view:azimuth': azimut, 'pers:interior_orientation': { field_of_view: 70, sensor_array_dimensions: [4000, 3000] }, datetime: '2025-06-01T10:00:00Z', 'geovisio:producer': 'Contributeur de test', license: 'CC-BY-SA-4.0' },
    assets: { hd: { href: HOTE + id + '/hd.jpg' }, sd: { href: HOTE + id + '/sd.jpg' }, thumb: { href: HOTE + id + '/thumb.jpg' } },
  };
}

/** La reponse figee de `GET /api/search` : quatre photos. */
export const RECHERCHE_PANORAMAX = { type: 'FeatureCollection', features: [photo('pa', 6, -18, 0), photo('pres', 6, -4, 0), photo('pb', 36, -18, 0), photo('dos', 6, -20, 180)] };

/** Un telechargement fige : chaque URL demandee est notee, l'image est un JPEG factice. */
export function telechargementFige(): { telecharger: (url: string) => Promise<ImageTelechargee | null>; urls: string[] } {
  const urls: string[] = [];
  return { urls, telecharger: async (url) => { urls.push(url); return { base64: 'QUJDRA==', mediaType: 'image/jpeg' }; } };
}

/** Ce que Claude voit sur A : un Mansart, brisis aux deux bouts, trois jacobines cote rue. */
export const SORTIE_MANSART = reponse({
  forme: { indices: [{ image: 1, vu: 'brisis raide sous un terrasson doux' }], valeur: 'mansart' },
  profil: { indices: [{ image: 1, vu: 'ligne de bris' }], valeur: 'brise' },
  faitage: { indices: [], sens: 'parallele-rue' },
  bouts: { indices: [], gauche: 'brisis', droite: 'brisis' },
  lucarnes: { indices: [{ image: 1, vu: 'trois lucarnes à deux pans dans le brisis' }], nombre: 3, types: ['jacobine'], pan: 'rue' },
  facades: [],
});

/** Ce que Claude voit sur B : un deux-pans sans lucarne, rien de ce que l'on cherche. */
export const SORTIE_DEUX_PANS = reponse({ facades: [] });

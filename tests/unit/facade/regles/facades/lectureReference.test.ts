// Le rejeu hors ligne des VRAIES reponses de Claude du run de reference (garde-fou de la lecture, MD/RELEASE.md §8.2 bis) : les sorties
// brutes x1 et x3 du run 40998593930 du workflow « Vérifier l'API Claude » (5.1.0, commit 1ea13701 ; artefact mesure-facades-x1-x3),
// versionnees dans tests/fixtures/facades/lecture-5.1.0/, repassent par le chemin d'aujourd'hui : la reponse relue comme un run
// enregistre, le vote, les regles de facade/regles/facades/ia.ts, jusqu'a la facade proposee. Sans reseau ni cle, a chaque PR.
//
// Tout ce qui ne depend pas d'un nouvel appel doit sortir A L'IDENTIQUE : baies, genres, carreaux votes, angles, pointes, parement,
// facade proposee. Un lot qui change la lecture d'une reponse ou le vote et y perd quelque chose le voit ici. Une amelioration le
// voit aussi : la reference ne se reecrit alors qu'avec la mesure du workflow qui la justifie (skill facades §5 quater).

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { comparerLecture, DOSSIER_LECTURE_510, FICHIER_REFERENCE_510, mesurerLecture, plancherDe, type ReferenceLecture } from '../../../../banc/facades/gardeLecture.js';

const reference = JSON.parse(readFileSync(FICHIER_REFERENCE_510, 'utf8')) as ReferenceLecture;
const rejeu = mesurerLecture(DOSSIER_LECTURE_510);
/** La mesure du run dont les reponses sont rejouees : la premiere des trois de la reference. */
const mesure510 = reference.mesures[0];

/**
 * Le tableau que le run de reference a imprime (journal du job, etape « Le tableau x1 contre x3 ») : scene, mode, boites VP / vraies /
 * trouvees, carreaux justes / lus, pointes justes / attendues. Recopie du journal, pour que la reference elle-meme ne derive pas.
 */
const IMPRIME: [string, 'x1' | 'x3', number, number, number, number, number, number, number][] = [
  ['02-enduit-uni-face', 'x1', 6, 6, 6, 0, 5, 0, 0],
  ['02-enduit-uni-face', 'x3', 6, 6, 6, 5, 5, 0, 0],
  ['03-brique-volets-battants', 'x1', 6, 6, 6, 0, 0, 0, 0],
  ['03-brique-volets-battants', 'x3', 6, 6, 6, 0, 0, 0, 0],
  ['04-soubassement-pierre-bandeau', 'x1', 6, 6, 6, 0, 0, 0, 0],
  ['04-soubassement-pierre-bandeau', 'x3', 6, 6, 6, 0, 0, 0, 0],
  ['05-ombres-debord-balcon', 'x1', 6, 6, 6, 0, 0, 0, 0],
  ['05-ombres-debord-balcon', 'x3', 6, 6, 6, 0, 0, 0, 0],
  ['06-volets-roulants-ton-sur-ton', 'x1', 6, 6, 6, 0, 0, 0, 0],
  ['06-volets-roulants-ton-sur-ton', 'x3', 6, 6, 6, 0, 0, 0, 0],
  ['07-voiture-haie-devant', 'x1', 8, 8, 8, 0, 0, 0, 0],
  ['07-voiture-haie-devant', 'x3', 8, 8, 8, 0, 0, 0, 0],
  ['08-prise-de-biais-forte', 'x1', 6, 6, 6, 0, 0, 0, 0],
  ['08-prise-de-biais-forte', 'x3', 6, 6, 6, 0, 0, 0, 0],
  ['09-focale-inconnue-grand-angle', 'x1', 6, 6, 6, 0, 2, 0, 0],
  ['09-focale-inconnue-grand-angle', 'x3', 6, 6, 6, 0, 2, 0, 0],
  ['10-meuliere-garage-ton-sur-ton', 'x1', 7, 7, 7, 0, 5, 0, 0],
  ['10-meuliere-garage-ton-sur-ton', 'x3', 7, 7, 7, 0, 5, 0, 0],
  ['11-pignon-ombre-arbre', 'x1', 3, 3, 3, 0, 0, 1, 1],
  ['11-pignon-ombre-arbre', 'x3', 3, 3, 3, 0, 0, 1, 1],
  ['12-haie-pied-cache-roulis', 'x1', 5, 6, 6, 0, 0, 0, 0],
  ['12-haie-pied-cache-roulis', 'x3', 6, 6, 6, 0, 0, 0, 0],
  ['13-grand-angle-distorsion-forte', 'x1', 6, 6, 6, 0, 2, 0, 0],
  ['13-grand-angle-distorsion-forte', 'x3', 6, 6, 6, 2, 2, 0, 0],
  ['14-grand-angle-distorsion-legere-biais', 'x1', 5, 5, 5, 0, 0, 0, 0],
  ['14-grand-angle-distorsion-legere-biais', 'x3', 5, 5, 5, 0, 0, 0, 0],
  ['15-grand-angle-deja-corrige', 'x1', 6, 6, 6, 0, 2, 0, 0],
  ['15-grand-angle-deja-corrige', 'x3', 6, 6, 6, 0, 2, 0, 0],
  ['16-vues-voiture-devant', 'x1', 0, 7, 0, 0, 0, 0, 0],
  ['16-vues-voiture-devant', 'x3', 7, 7, 7, 0, 0, 0, 0],
  ['17-vues-haie-devant', 'x1', 6, 6, 6, 0, 0, 0, 0],
  ['17-vues-haie-devant', 'x3', 6, 6, 6, 0, 0, 0, 0],
  ['18-deux-vues-voiture-haie', 'x1', 6, 6, 6, 0, 0, 0, 0],
  ['18-deux-vues-voiture-haie', 'x3', 6, 6, 6, 0, 0, 0, 0],
  ['19-vues-haie-haute-baie-cachee', 'x1', 5, 6, 5, 0, 0, 0, 0],
  ['19-vues-haie-haute-baie-cachee', 'x3', 5, 6, 5, 0, 0, 0, 0],
  ['20-details-cintres-persiennes-garde-corps', 'x1', 6, 6, 6, 0, 0, 0, 0],
  ['20-details-cintres-persiennes-garde-corps', 'x3', 6, 6, 6, 0, 0, 0, 0],
  ['21-ebrasements-profonds-biais', 'x1', 6, 6, 6, 0, 5, 0, 0],
  ['21-ebrasements-profonds-biais', 'x3', 6, 6, 6, 0, 5, 0, 0],
  ['22-pignon-decentre-pierre', 'x1', 4, 4, 4, 0, 0, 1, 1],
  ['22-pignon-decentre-pierre', 'x3', 4, 4, 4, 0, 0, 1, 1],
  ['23-pignon-rampe-appentis', 'x1', 2, 2, 2, 0, 0, 0, 0],
  ['23-pignon-rampe-appentis', 'x3', 2, 2, 2, 0, 0, 0, 0],
];

describe('les reponses de Claude du run de reference, rejouees dans le chemin actuel', () => {
  it('portent les 22 scenes du banc, x1 et x3, toutes lisibles', () => {
    expect(Object.keys(rejeu.scenes)).toHaveLength(22);
    expect(mesure510?.source.run).toBe('40998593930');
    expect(mesure510?.source.commit.startsWith('1ea13701')).toBe(true);
    for (const [scene, modes] of Object.entries(rejeu.scenes)) for (const m of ['x1', 'x3'] as const) expect(modes[m], scene + ' ' + m).not.toBeNull();
  });

  it('redonnent le tableau que le run a imprime, ligne par ligne', () => {
    expect(IMPRIME).toHaveLength(44);
    for (const [scene, m, vp, vraies, trouvees, carreaux, lus, pointes, attendues] of IMPRIME) {
      const l = rejeu.scenes[scene]?.[m];
      expect([l?.boites.vp, l?.boites.vraies, l?.boites.trouvees, l?.carreaux.justes, l?.carreaux.lus, l?.pointes.justes, l?.pointes.attendues], scene + ' ' + m)
        .toEqual([vp, vraies, trouvees, carreaux, lus, pointes, attendues]);
    }
    // Les totaux imprimes : x1 rappel 92,9 %, precision 99,2 %, carreaux 0 / 21 ; x3 rappel 99,2 %, precision 100 %, carreaux 7 / 21.
    expect([rejeu.totaux.x1.boites.rappel, rejeu.totaux.x1.boites.precision, rejeu.totaux.x1.carreaux.justes]).toEqual([0.9286, 0.9915, 0]);
    expect([rejeu.totaux.x3.boites.rappel, rejeu.totaux.x3.boites.precision, rejeu.totaux.x3.carreaux.justes]).toEqual([0.9921, 1, 7]);
    expect([rejeu.totaux.x1.illisibles, rejeu.totaux.x3.illisibles]).toEqual([0, 0]);
  });

  it('donnent a l identique la mesure du run 40998593930 : baies, genres, carreaux, angles, pointes, parement, facade proposee', () => {
    const r510 = mesure510?.mesure;
    expect(r510).toBeTruthy();
    if (!r510) return;
    for (const [scene, modes] of Object.entries(r510.scenes)) {
      for (const m of ['x1', 'x3'] as const) {
        const r = modes[m], x = rejeu.scenes[scene]?.[m];
        expect(x, scene + ' ' + m).toBeTruthy();
        if (!r || !x) continue;
        expect({ ...x, info: null }, scene + ' ' + m).toEqual({ ...r, info: null });
        expect([x.info.pose, x.info.cotesCm], scene + ' ' + m).toEqual([r.info.pose, r.info.cotesCm]);
      }
    }
    for (const m of ['x1', 'x3'] as const) expect(rejeu.totaux[m]).toEqual(r510.totaux[m]);
    expect(comparerLecture(reference.plancher, rejeu)).toEqual([]);
  });

  it('le plancher est le pire des trois mesures de main gardees, et chacune passe au-dessus', () => {
    expect(reference.mesures.map((m) => m.source.run)).toEqual(['40998593930', '41012308826', '41014104555']);
    expect(plancherDe(reference.mesures.map((m) => m.mesure))).toEqual(reference.plancher);
    for (const m of reference.mesures) expect(comparerLecture(reference.plancher, m.mesure), m.source.run).toEqual([]);
  });
});

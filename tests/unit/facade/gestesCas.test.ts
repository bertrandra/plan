import { describe, it, expect } from 'vitest';
import { avecLesGestes, gestesDuCas } from '../../../src/facade/gestesCas.js';
import { FORMAT_CAS_REEL, type CasStocke } from '../../../src/facade/corpusReel.js';

// Les gestes d'un cas de calibration (Ctrl+Z avant V4, le meme chemin que dans l'audit) : ce qu'un geste change, et sa remise.

const C = [{ x: 1, y: 2 }, { x: 9, y: 2 }, { x: 9, y: 8 }, { x: 1, y: 8 }];
const cas: CasStocke = { format: FORMAT_CAS_REEL, version: 1, nom: 'x', statut: 'brouillon', largeurM: 8, hauteurM: 5, ouvertures: [], images: ['a', 'b'],
  photos: [{ fichier: 'photo-1', coins: C, focalePx: 900 }, { fichier: 'photo-2', coins: C }] };

describe('les gestes d un cas de calibration', () => {
  it('remet les reperes, le mur tire et la confirmation d avant, sans toucher au reste des photos', () => {
    const avant = gestesDuCas(cas);
    const apres: CasStocke = { ...cas, murConfirme: { le: '2026-11-03T10:00:00.000Z', coins: [{ rang: 0, coins: C }] },
      photos: [{ ...cas.photos[0]!, reperes: C, murALaMain: true, coins: C.map((p) => ({ x: p.x + 1, y: p.y })) }, cas.photos[1]!] };
    const remis = avecLesGestes(apres, avant);
    expect(remis).toEqual(cas);
    expect(avecLesGestes(remis, gestesDuCas(apres))).toEqual(apres);
  });

  it('defait et refait un choix de source et un forcage de Claude (lot C2), comme les autres gestes', () => {
    const avant = gestesDuCas(cas);
    const le = '2026-11-07T10:00:00.000Z';
    const apres: CasStocke = { ...cas, choix: [{ cle: 'ouverture:0', source: 'claude', le }], forcages: [{ toutes: true, source: 'claude', le }] };
    const remis = avecLesGestes(apres, avant);
    expect(remis).toEqual(cas);
    expect(avecLesGestes(remis, gestesDuCas(apres))).toEqual(apres);
  });
});

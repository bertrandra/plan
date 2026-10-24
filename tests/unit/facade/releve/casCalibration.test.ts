import { describe, it, expect } from 'vitest';
import { casCale, originesDuCas } from '../../../../src/facade/releve/casCalibration.js';
import type { CasStocke } from '../../../../src/facade/corpusReel.js';

// Ce que l'editeur d'un cas de calibration calcule sans React (facade/releve/casCalibration.ts).
const carre = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }];
const cas = {
  nom: 'Cas', largeurM: 8, hauteurM: 5, statut: 'brouillon', ouvertures: [], images: ['a', 'b', 'c'],
  photos: [{ fichier: 'photo-1', coins: carre, murALaMain: true }, { fichier: 'photo-2', coins: carre, reperes: carre }, { fichier: 'photo-3', coins: carre }],
} as unknown as CasStocke;

describe('le cas de calibration, hors de l ecran', () => {
  it('relit d ou viennent les coins : le mur pose a la main, puis les reperes', () => {
    expect(originesDuCas(cas)).toEqual({ 0: 'main', 1: 'reperes' });
  });
  it('pose les coins du calage sur les photos assemblees, comme un mur pose a la main', () => {
    const coins = [{ x: 1, y: 1 }, { x: 9, y: 1 }, { x: 9, y: 9 }, { x: 1, y: 9 }];
    const c = casCale(cas, [null, coins, null]);
    expect(c.photos[1]).toMatchObject({ coins, murALaMain: true });
    expect(c.photos[2]).toBe(cas.photos[2]);
  });
});

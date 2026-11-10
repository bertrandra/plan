import { describe, it, expect } from 'vitest';
import { idusCadastraux } from '../../../src/model/cadastre.js';

describe('idusCadastraux', () => {
  it('rend l identifiant de la parcelle, puis ceux des parcelles qu elle fusionne, sans doublon', () => {
    expect(idusCadastraux({ cadastre: { idu: 'A', fusionDe: [{ idu: 'A' }, { idu: 'B' }, { idu: 'C' }] } })).toEqual(['A', 'B', 'C']);
  });
  it('rend la seule parcelle sans fusion, et rien sans fiche cadastrale', () => {
    expect(idusCadastraux({ cadastre: { idu: 'A' } })).toEqual(['A']);
    expect(idusCadastraux({})).toEqual([]);
    expect(idusCadastraux({ cadastre: null })).toEqual([]);
    expect(idusCadastraux({ cadastre: { fusionDe: [null, { idu: 3 }, { idu: 'B' }] } })).toEqual(['B']);
  });
});

import { describe, expect, it } from 'vitest';
import { GENRES_SAILLIE_LUE, lireProfondeursSaillies, PROFONDEURS_SAILLIES } from '../../../../src/regles/facades/saillies.js';
import { profondeurSaillieVue } from '../../../../src/facade/regles/toits/sailliesDesMurs.js';
import { DEFAUTS_SAILLIE } from '../../../../src/facade/modeToit/saillies.js';

// La profondeur d'une saillie vue (lot L1, spec-lecture-ia-elargie.md §4.2) : un reglage par genre, dont les valeurs livrees sont celles
// d'avant le reglage (une saillie posee a la main au Mode Toit), pour qu'aucune proposition ni aucun corps ne change.

describe('la profondeur d une saillie vue', () => {
  it('livre, pour chaque genre, la valeur d avant le reglage', () => {
    for (const g of GENRES_SAILLIE_LUE) {
      expect(PROFONDEURS_SAILLIES[g], g).toBe(DEFAUTS_SAILLIE[g].profondeurM);
      expect(profondeurSaillieVue(g)).toBe(DEFAUTS_SAILLIE[g].profondeurM);
    }
  });

  it('prend le reglage ; un genre absent, ou un fichier sans section, retombe sur la valeur du Mode Toit', () => {
    expect(profondeurSaillieVue('bow-window', { 'bow-window': 1.1 })).toBe(1.1);
    expect(profondeurSaillieVue('galerie', { 'bow-window': 1.1 })).toBe(DEFAUTS_SAILLIE.galerie.profondeurM);
    expect(lireProfondeursSaillies({})).toEqual({});
    expect(lireProfondeursSaillies({ saillies: { profondeursM: { auvent: 1.2 } } })).toEqual({ auvent: 1.2 });
  });

  it('refuse une profondeur qui n est pas un nombre positif, et un genre inconnu', () => {
    expect(() => lireProfondeursSaillies({ saillies: { profondeursM: { auvent: -1 } } })).toThrow(/nombre positif/);
    expect(() => lireProfondeursSaillies({ saillies: { profondeursM: { auvent: '0.9' } } })).toThrow(/nombre positif/);
    expect(() => lireProfondeursSaillies({ saillies: { profondeursM: { veranda: 2 } } })).toThrow(/inconnu/);
    expect(() => lireProfondeursSaillies({ saillies: { profondeursM: [] } })).toThrow(/objet/);
  });
});

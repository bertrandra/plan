import { describe, it, expect } from 'vitest';
import { departementDeIdu, libelleDepartement } from '../../../src/model/departements.js';

// Le departement d'une parcelle, tire de son IDU : l'axe « par region » de la conformite (lot G3)
// et le declencheur des profils (decision D19).

describe('departements', () => {
  it('se tirent de l’IDU, metropole, Corse et outre-mer', () => {
    expect(departementDeIdu('78650000AE0101')).toBe('78');
    expect(departementDeIdu('2A004000AB0001')).toBe('2A');
    expect(departementDeIdu('97411000AB0001')).toBe('974');
    expect(departementDeIdu('48.900000,2.130000')).toBeNull();
    expect(departementDeIdu(null)).toBeNull();
    expect(libelleDepartement('62')).toBe('Pas-de-Calais (62)');
  });
});

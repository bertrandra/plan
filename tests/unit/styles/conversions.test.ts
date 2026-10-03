import { describe, it, expect } from 'vitest';
import { JETONS } from '../../../src/styles/jetons.js';
import { hexVersRvb, hexVersTsl, hexVersTsv, rvbVersHex, tslVersHex, tsvVersHex } from '../../../src/styles/conversions.js';

// Les conversions du selecteur avance : chaque couleur de la palette fait l'aller-retour.

describe('les conversions de couleur', () => {
  it('lisent et ecrivent les canaux RVB', () => {
    expect(hexVersRvb('#7A5C31')).toEqual({ r: 122, v: 92, b: 49 });
    expect(rvbVersHex({ r: 122, v: 92, b: 49 })).toBe('#7A5C31');
    expect(rvbVersHex({ r: 300, v: -4, b: 15.6 })).toBe('#FF0010');
  });

  it('donnent les teintes connues', () => {
    expect(hexVersTsv('#FF0000')).toEqual({ t: 0, s: 100, v: 100 });
    expect(hexVersTsl('#00FF00')).toMatchObject({ t: 120, s: 100, l: 50 });
    expect(tsvVersHex({ t: 240, s: 100, v: 100 })).toBe('#0000FF');
    expect(tslVersHex({ t: 0, s: 0, l: 100 })).toBe('#FFFFFF');
    expect(tsvVersHex({ t: 360, s: 100, v: 100 })).toBe('#FF0000');
  });

  it('font l aller-retour pour chaque couleur de la palette, dans les deux modeles', () => {
    for (const theme of ['clair', 'sombre'] as const) {
      for (const hex of Object.values(JETONS[theme])) {
        expect(tsvVersHex(hexVersTsv(hex))).toBe(hex);
        expect(tslVersHex(hexVersTsl(hex))).toBe(hex);
      }
    }
  });
});

import { describe, it, expect } from 'vitest';
import { optiqueDeLaPhoto, memoireFocalesLocale, lireExifFichier, dimensionsReduites, type MemoireFocales } from '../../../../src/app/audit/photo.js';

// L'optique d'une photo de cas (MD/spec-audit.md §5) : la focale de l'EXIF, apprise pour le modele ;
// a defaut celle apprise pour ce modele ; sinon le champ par defaut du releve, annonce estime.

function stockage(): Pick<Storage, 'getItem' | 'setItem'> & { donnees: Map<string, string> } {
  const donnees = new Map<string, string>();
  return { donnees, getItem: (k) => donnees.get(k) ?? null, setItem: (k, v) => { donnees.set(k, v); } };
}

describe('l optique d une photo de cas', () => {
  it('prend la focale de l EXIF et l apprend pour ce modele', () => {
    const m = memoireFocalesLocale(stockage());
    expect(optiqueDeLaPhoto({ focale35: 26, modele: 'iPhone 13' }, m)).toEqual({ focale35: 26, champDeg: 69.4, sourceFocale: 'exif', modeleAppareil: 'iPhone 13' });
    expect(m.lire('iPhone 13')).toBe(26);
  });

  it('sans focale dans l EXIF, reprend celle apprise pour le modele, ou la derniere apprise sans modele', () => {
    const m = memoireFocalesLocale(stockage());
    optiqueDeLaPhoto({ focale35: 26, modele: 'iPhone 13' }, m);
    expect(optiqueDeLaPhoto({ focale35: null, modele: 'iPhone 13' }, m)).toEqual({ focale35: 26, champDeg: 69.4, sourceFocale: 'appareil', modeleAppareil: 'iPhone 13' });
    expect(optiqueDeLaPhoto({ focale35: null, modele: null }, m)).toMatchObject({ focale35: 26, sourceFocale: 'appareil', modeleAppareil: null });
    expect(optiqueDeLaPhoto({ focale35: null, modele: 'Pixel 8' }, m)).toMatchObject({ sourceFocale: 'defaut' });
  });

  it('a defaut, le champ du releve (67 degres), annonce comme une estimation', () => {
    const m = memoireFocalesLocale(stockage());
    expect(optiqueDeLaPhoto({ focale35: null, modele: null }, m)).toEqual({ focale35: 27.2, champDeg: 67, sourceFocale: 'defaut', modeleAppareil: null });
  });

  it('un stockage absent, plein ou abime n empeche pas de prendre la photo', () => {
    const casse: Pick<Storage, 'getItem' | 'setItem'> = { getItem: () => { throw new Error('bloque'); }, setItem: () => { throw new Error('plein'); } };
    for (const m of [memoireFocalesLocale(null), memoireFocalesLocale(casse)]) {
      expect(optiqueDeLaPhoto({ focale35: 24, modele: 'X' }, m)).toMatchObject({ sourceFocale: 'exif' });
      expect(m.lire('X')).toBeNull();
    }
    const abime = stockage();
    abime.donnees.set('plan.audit.focales', '{pas du json');
    expect(memoireFocalesLocale(abime).lire('X')).toBeNull();
  });

  it('une memoire qui n a rien n invente rien', () => {
    const vide: MemoireFocales = { lire: () => null, retenir: () => {} };
    expect(optiqueDeLaPhoto({ focale35: null, modele: 'iPhone 13' }, vide).sourceFocale).toBe('defaut');
  });

  it('lit l EXIF sur le fichier d origine ; un fichier qui n est pas un JPEG n en a pas', async () => {
    expect(await lireExifFichier(new Blob([new Uint8Array([1, 2, 3, 4])]))).toEqual({ focale35: null, modele: null });
  });

  it('reduit a 1 280 px sur le grand cote, proportions gardees', () => {
    expect(dimensionsReduites(4032, 3024)).toEqual({ l: 1280, h: 960 });
    expect(dimensionsReduites(800, 600)).toEqual({ l: 800, h: 600 });
  });
});

import { describe, it, expect } from 'vitest';
import { lireExif, champDepuisFocale35, focale35DepuisChamp } from '../../../../src/facade/vision/exif.js';

// L'EXIF d'une photo : la focale 24x36 du sous-IFD Exif et le modele d'appareil de l'IFD0, dans les
// deux boutismes, et rien d'invente quand le chemin ne ressemble pas a un EXIF.

interface Options { le?: boolean; modele?: string | null; focale?: number | null; avantApp1?: boolean }

/** Une photo JPEG minimale : SOI, (APP0), APP1 Exif avec IFD0 (Model, pointeur Exif) et sous-IFD Exif. */
function jpeg({ le = false, modele = null, focale = null, avantApp1 = false }: Options): ArrayBuffer {
  const octetsModele = modele === null ? null : [...modele].map((c) => c.charCodeAt(0)).concat(0);
  const balises: number[] = [];
  if (octetsModele) balises.push(0x0110);
  if (focale !== null) balises.push(0x8769);
  const tiff = new DataView(new ArrayBuffer(512));
  tiff.setUint16(0, le ? 0x4949 : 0x4d4d);
  tiff.setUint16(2, 42, le);
  tiff.setUint32(4, 8, le);
  let donnees = 8 + 2 + 12 * balises.length + 4;
  tiff.setUint16(8, balises.length, le);
  balises.forEach((balise, i) => {
    const p = 8 + 2 + 12 * i;
    tiff.setUint16(p, balise, le);
    if (balise === 0x0110 && octetsModele) {
      tiff.setUint16(p + 2, 2, le); tiff.setUint32(p + 4, octetsModele.length, le);
      if (octetsModele.length <= 4) octetsModele.forEach((b, k) => tiff.setUint8(p + 8 + k, b));
      else { tiff.setUint32(p + 8, donnees, le); octetsModele.forEach((b, k) => tiff.setUint8(donnees + k, b)); donnees += octetsModele.length; }
    }
    if (balise === 0x8769 && focale !== null) {
      tiff.setUint16(p + 2, 4, le); tiff.setUint32(p + 4, 1, le); tiff.setUint32(p + 8, donnees, le);
      tiff.setUint16(donnees, 1, le);
      tiff.setUint16(donnees + 2, 0xa405, le); tiff.setUint16(donnees + 4, 3, le); tiff.setUint32(donnees + 6, 1, le); tiff.setUint16(donnees + 10, focale, le);
      donnees += 2 + 12 + 4;
    }
  });
  const app0 = avantApp1 ? [0xff, 0xe0, 0x00, 0x04, 0x00, 0x00] : [];
  const long = donnees + 8;
  const app1 = [0xff, 0xe1, (long >> 8) & 0xff, long & 0xff, 0x45, 0x78, 0x69, 0x66, 0x00, 0x00];
  const octets = [0xff, 0xd8, ...app0, ...app1, ...new Uint8Array(tiff.buffer, 0, donnees), 0xff, 0xda, 0x00, 0x02];
  return new Uint8Array(octets).buffer;
}

describe('l EXIF d une photo', () => {
  it('lit la focale 24x36 et le modele, en gros et en petit boutisme', () => {
    expect(lireExif(jpeg({ modele: 'iPhone 13', focale: 26 }))).toEqual({ focale35: 26, modele: 'iPhone 13' });
    expect(lireExif(jpeg({ le: true, modele: 'SM-G991B', focale: 24, avantApp1: true }))).toEqual({ focale35: 24, modele: 'SM-G991B' });
    expect(lireExif(jpeg({ modele: 'iPhone 13', focale: 26 })).focale35).toBe(26);
  });

  it('lit un modele court range dans l entree elle-meme, et retire les espaces de fin', () => {
    expect(lireExif(jpeg({ modele: 'X1', focale: 28 })).modele).toBe('X1');
    expect(lireExif(jpeg({ le: true, modele: 'Pixel 8   ', focale: null })).modele).toBe('Pixel 8');
  });

  it('rend null pour ce qui manque, sans rien inventer', () => {
    expect(lireExif(jpeg({ modele: 'iPhone 13' }))).toEqual({ focale35: null, modele: 'iPhone 13' });
    expect(lireExif(jpeg({ focale: 26 }))).toEqual({ focale35: 26, modele: null });
    expect(lireExif(jpeg({ focale: 0 }))).toEqual({ focale35: null, modele: null });
    expect(lireExif(new Uint8Array([0x89, 0x50, 0x4e, 0x47]).buffer)).toEqual({ focale35: null, modele: null });
    expect(lireExif(new Uint8Array([0xff, 0xd8, 0xff, 0xda, 0, 2]).buffer)).toEqual({ focale35: null, modele: null });
  });

  it('passe de la focale au champ et retour', () => {
    expect(champDepuisFocale35(26)).toBeCloseTo(69.4, 1);
    expect(focale35DepuisChamp(67)).toBeCloseTo(27.2, 1);
    expect(focale35DepuisChamp(champDepuisFocale35(35))).toBeCloseTo(35, 9);
  });
});

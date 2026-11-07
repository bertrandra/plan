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
    expect(lireExif(jpeg({ modele: 'iPhone 13', focale: 26 }))).toMatchObject({ focale35: 26, modele: 'iPhone 13' });
    expect(lireExif(jpeg({ le: true, modele: 'SM-G991B', focale: 24, avantApp1: true }))).toMatchObject({ focale35: 24, modele: 'SM-G991B' });
    expect(lireExif(jpeg({ modele: 'iPhone 13', focale: 26 })).focale35).toBe(26);
  });

  it('lit un modele court range dans l entree elle-meme, et retire les espaces de fin', () => {
    expect(lireExif(jpeg({ modele: 'X1', focale: 28 })).modele).toBe('X1');
    expect(lireExif(jpeg({ le: true, modele: 'Pixel 8   ', focale: null })).modele).toBe('Pixel 8');
  });

  it('rend null pour ce qui manque, sans rien inventer', () => {
    expect(lireExif(jpeg({ modele: 'iPhone 13' }))).toEqual({ focale35: null, modele: 'iPhone 13', focaleMm: null, zoomNumerique: null, objectif: null, marque: null, orientation: null, datePrise: null, decalageHoraire: null, gps: null });
    expect(lireExif(jpeg({ focale: 26 }))).toMatchObject({ focale35: 26, modele: null, gps: null });
    expect(lireExif(jpeg({ focale: 0 }))).toMatchObject({ focale35: null, modele: null });
    expect(lireExif(new Uint8Array([0x89, 0x50, 0x4e, 0x47]).buffer)).toEqual({ focale35: null, modele: null });
    expect(lireExif(new Uint8Array([0xff, 0xd8, 0xff, 0xda, 0, 2]).buffer)).toEqual({ focale35: null, modele: null });
  });

  it('passe de la focale au champ et retour', () => {
    expect(champDepuisFocale35(26)).toBeCloseTo(69.4, 1);
    expect(focale35DepuisChamp(67)).toBeCloseTo(27.2, 1);
    expect(focale35DepuisChamp(champDepuisFocale35(35))).toBeCloseTo(35, 9);
  });
});

// Un EXIF complet, construit balise par balise : IFD0 (Make, Model, Orientation, pointeurs Exif et GPS), sous-IFD Exif
// (DateTimeOriginal, OffsetTimeOriginal, FocalLength, DigitalZoomRatio, FocalLengthIn35mmFilm, LensModel) et IFD GPS.
type Valeur = { type: 1 | 2 | 3 | 4; v: number | string } | { type: 5; v: [number, number][] };
type Ifd = [number, Valeur | 'exif' | 'gps'][];

function exifComplet(le: boolean, ifd0: Ifd, exif: Ifd, gps: Ifd | null): ArrayBuffer {
  const t = new DataView(new ArrayBuffer(2048));
  t.setUint16(0, le ? 0x4949 : 0x4d4d); t.setUint16(2, 42, le); t.setUint32(4, 8, le);
  let libre = 1024;
  const taille = (l: Ifd) => 2 + 12 * l.length + 4;
  const ou0 = 8, ouExif = ou0 + taille(ifd0), ouGps = ouExif + taille(exif);
  const ecrire = (ou: number, l: Ifd) => {
    t.setUint16(ou, l.length, le);
    l.forEach(([balise, val], i) => {
      const p = ou + 2 + 12 * i;
      t.setUint16(p, balise, le);
      if (val === 'exif' || val === 'gps') { t.setUint16(p + 2, 4, le); t.setUint32(p + 4, 1, le); t.setUint32(p + 8, val === 'exif' ? ouExif : ouGps, le); return; }
      t.setUint16(p + 2, val.type, le);
      if (val.type === 2) {
        const o = [...(val.v as string)].map((c) => c.charCodeAt(0)).concat(0);
        t.setUint32(p + 4, o.length, le);
        if (o.length <= 4) o.forEach((b, k) => t.setUint8(p + 8 + k, b));
        else { t.setUint32(p + 8, libre, le); o.forEach((b, k) => t.setUint8(libre + k, b)); libre += o.length; }
      } else if (val.type === 5) {
        t.setUint32(p + 4, val.v.length, le); t.setUint32(p + 8, libre, le);
        for (const [n, d] of val.v) { t.setUint32(libre, n, le); t.setUint32(libre + 4, d, le); libre += 8; }
      } else {
        t.setUint32(p + 4, 1, le);
        if (val.type === 1) t.setUint8(p + 8, val.v as number); else if (val.type === 3) t.setUint16(p + 8, val.v as number, le); else t.setUint32(p + 8, val.v as number, le);
      }
    });
  };
  ecrire(ou0, ifd0); ecrire(ouExif, exif); if (gps) ecrire(ouGps, gps);
  const long = libre + 8;
  const octets = [0xff, 0xd8, 0xff, 0xe1, (long >> 8) & 0xff, long & 0xff, 0x45, 0x78, 0x69, 0x66, 0, 0, ...new Uint8Array(t.buffer, 0, libre), 0xff, 0xda, 0, 2];
  return new Uint8Array(octets).buffer;
}

const IFD0: Ifd = [[0x010f, { type: 2, v: 'Apple' }], [0x0110, { type: 2, v: 'iPhone 13' }], [0x0112, { type: 3, v: 6 }], [0x8769, 'exif']];
const EXIF: Ifd = [
  [0x9003, { type: 2, v: '2026:11:07 10:12:31' }], [0x9011, { type: 2, v: '+01:00' }],
  [0x920a, { type: 5, v: [[51, 10]] }], [0xa404, { type: 5, v: [[0, 1]] }], [0xa405, { type: 3, v: 26 }],
  [0xa434, { type: 2, v: 'iPhone 13 back dual wide camera 5.1mm f/1.6' }],
];
// 48 deg 53 min 24,432 s N, 2 deg 9 min 54,828 s E (Le Vesinet), 45,5 m, cap 245,25 deg vrai.
const GPS: Ifd = [
  [1, { type: 2, v: 'N' }], [2, { type: 5, v: [[48, 1], [53, 1], [24432, 1000]] }],
  [3, { type: 2, v: 'E' }], [4, { type: 5, v: [[2, 1], [9, 1], [54828, 1000]] }],
  [5, { type: 1, v: 0 }], [6, { type: 5, v: [[455, 10]] }],
  [16, { type: 2, v: 'T' }], [17, { type: 5, v: [[24525, 100]] }],
];

describe('l EXIF complet d une photo (audit de la calibration, lot A)', () => {
  it('lit la focale reelle, le zoom, l objectif, la marque, l orientation, la date et le GPS, dans les deux boutismes', () => {
    for (const le of [false, true]) {
      expect(lireExif(exifComplet(le, [...IFD0, [0x8825, 'gps']], EXIF, GPS))).toEqual({
        focale35: 26, modele: 'iPhone 13', focaleMm: 5.1, zoomNumerique: 1, objectif: 'iPhone 13 back dual wide camera 5.1mm f/1.6',
        marque: 'Apple', orientation: 6, datePrise: '2026:11:07 10:12:31', decalageHoraire: '+01:00',
        gps: { lat: 48.89012, lon: 2.165230, altitudeM: 45.5, capDeg: 245.25, nordCap: 'T' },
      });
    }
  });

  it('un zoom numerique se lit tel quel ; sud, ouest et sous la mer changent le signe', () => {
    const exif: Ifd = EXIF.map(([b, v]) => (b === 0xa404 ? [b, { type: 5, v: [[2, 1]] }] : [b, v]));
    const gps: Ifd = GPS.map(([b, v]) => (b === 1 ? [b, { type: 2, v: 'S' }] : b === 3 ? [b, { type: 2, v: 'W' }] : b === 5 ? [b, { type: 1, v: 1 }] : [b, v]));
    const lu = lireExif(exifComplet(true, [...IFD0, [0x8825, 'gps']], exif, gps));
    expect(lu.zoomNumerique).toBe(2);
    expect(lu.gps).toEqual({ lat: -48.89012, lon: -2.16523, altitudeM: -45.5, capDeg: 245.25, nordCap: 'T' });
  });

  it('un GPS sans hemisphere, a zero ou incomplet n est pas une position ; l altitude et le cap sont facultatifs', () => {
    const sans = (b: number) => GPS.filter(([x]) => x !== b);
    expect(lireExif(exifComplet(false, [...IFD0, [0x8825, 'gps']], EXIF, sans(1))).gps).toBeNull();
    expect(lireExif(exifComplet(false, [...IFD0, [0x8825, 'gps']], EXIF, sans(4))).gps).toBeNull();
    const zero: Ifd = GPS.map(([b, v]) => (b === 2 || b === 4 ? [b, { type: 5, v: [[0, 1], [0, 1], [0, 1]] }] : [b, v]));
    expect(lireExif(exifComplet(false, [...IFD0, [0x8825, 'gps']], EXIF, zero)).gps).toBeNull();
    const nu: Ifd = GPS.filter(([b]) => b <= 4);
    expect(lireExif(exifComplet(false, [...IFD0, [0x8825, 'gps']], EXIF, nu)).gps).toEqual({ lat: 48.89012, lon: 2.16523, altitudeM: null, capDeg: null, nordCap: null });
    expect(lireExif(exifComplet(false, IFD0, EXIF, null)).gps).toBeNull();
  });

  it('une orientation hors de 1 a 8 et un rationnel a denominateur nul ne s inventent pas', () => {
    const ifd0: Ifd = IFD0.map(([b, v]) => (b === 0x0112 ? [b, { type: 3, v: 9 }] : [b, v]));
    const exif: Ifd = EXIF.map(([b, v]) => (b === 0x920a ? [b, { type: 5, v: [[51, 0]] }] : [b, v]));
    const lu = lireExif(exifComplet(false, ifd0, exif, null));
    expect(lu.orientation).toBeNull();
    expect(lu.focaleMm).toBeNull();
    expect(lu.focale35).toBe(26);
  });
});

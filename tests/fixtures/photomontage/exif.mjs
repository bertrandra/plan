// Une photo de test pour le photomontage : un JPEG auquel on ajoute un EXIF connu (position GPS, direction, focale equivalente
// 24x36), tel qu'un telephone l'ecrit. La fumee (scripts/fumee.mjs) et les tests unitaires s'en servent : aucune photo reelle,
// aucune position de personne, n'entre dans le depot.

/**
 * Le JPEG avec un segment APP1 « Exif » insere apres son en-tete. `lat` et `lon` en degres (signes), `capDeg` la direction de
 * l'image depuis le nord vrai, `focale35` en millimetres ; ce qui manque n'est pas ecrit.
 * @param {Uint8Array} jpeg
 * @param {{ lat?: number, lon?: number, capDeg?: number, focale35?: number }} exif
 * @returns {Uint8Array}
 */
export function avecExif(jpeg, exif) {
  if (jpeg[0] !== 0xff || jpeg[1] !== 0xd8) throw new Error('pas un JPEG');
  const gps = typeof exif.lat === 'number' && typeof exif.lon === 'number';
  const cap = gps && typeof exif.capDeg === 'number';
  // Le TIFF, petit-boutiste : l'IFD0 (deux renvois), le sous-IFD Exif (la focale), l'IFD GPS, puis les rationnels.
  const nExif = typeof exif.focale35 === 'number' ? 1 : 0, nGps = gps ? (cap ? 6 : 4) : 0;
  const ifd0 = 8, tailleIfd = (n) => 2 + 12 * n + 4;
  const ifdExif = ifd0 + tailleIfd(2), ifdGps = ifdExif + tailleIfd(nExif), donnees = ifdGps + tailleIfd(nGps);
  const tiff = new DataView(new ArrayBuffer(donnees + 24 * 2 + 8));
  tiff.setUint16(0, 0x4949); tiff.setUint16(2, 42, true); tiff.setUint32(4, ifd0, true);
  const entree = (p, balise, type, compte, valeur) => { tiff.setUint16(p, balise, true); tiff.setUint16(p + 2, type, true); tiff.setUint32(p + 4, compte, true); valeur(p + 8); };
  const long = (v) => (p) => tiff.setUint32(p, v, true);
  const court = (v) => (p) => tiff.setUint16(p, v, true);
  const lettre = (c) => (p) => tiff.setUint8(p, c.charCodeAt(0));
  tiff.setUint16(ifd0, 2, true);
  entree(ifd0 + 2, 0x8769, 4, 1, long(ifdExif));
  entree(ifd0 + 14, 0x8825, 4, 1, long(ifdGps));
  tiff.setUint16(ifdExif, nExif, true);
  if (nExif) entree(ifdExif + 2, 0xa405, 3, 1, court(exif.focale35));
  tiff.setUint16(ifdGps, nGps, true);
  if (gps) {
    const dms = (p, v) => {
      const a = Math.abs(v), d = Math.floor(a), m = Math.floor((a - d) * 60), s = ((a - d) * 60 - m) * 60;
      [[d, 1], [m, 1], [Math.round(s * 100000), 100000]].forEach(([n, den], i) => { tiff.setUint32(p + 8 * i, n, true); tiff.setUint32(p + 8 * i + 4, den, true); });
    };
    entree(ifdGps + 2, 1, 2, 2, lettre(exif.lat < 0 ? 'S' : 'N'));
    entree(ifdGps + 14, 2, 5, 3, long(donnees));
    entree(ifdGps + 26, 3, 2, 2, lettre(exif.lon < 0 ? 'W' : 'E'));
    entree(ifdGps + 38, 4, 5, 3, long(donnees + 24));
    dms(donnees, exif.lat);
    dms(donnees + 24, exif.lon);
    if (cap) {
      entree(ifdGps + 50, 16, 2, 2, lettre('T'));
      entree(ifdGps + 62, 17, 5, 1, long(donnees + 48));
      tiff.setUint32(donnees + 48, Math.round(exif.capDeg * 100), true);
      tiff.setUint32(donnees + 52, 100, true);
    }
  }
  const corps = new Uint8Array(tiff.buffer);
  const app1 = new Uint8Array(4 + 6 + corps.length);
  app1.set([0xff, 0xe1, ((corps.length + 8) >> 8) & 0xff, (corps.length + 8) & 0xff, 0x45, 0x78, 0x69, 0x66, 0, 0]);
  app1.set(corps, 10);
  const out = new Uint8Array(jpeg.length + app1.length);
  out.set(jpeg.subarray(0, 2));
  out.set(app1, 2);
  out.set(jpeg.subarray(2), 2 + app1.length);
  return out;
}

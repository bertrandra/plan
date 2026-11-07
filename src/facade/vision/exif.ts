// L'optique d'une photo JPEG, lue dans son EXIF (spec-releve-facade §5.3, MD/spec-audit.md §5).
//
// Une photo porte souvent sa focale equivalente 24x36 (`FocalLengthIn35mmFilm`, balise 0xA405 du
// sous-IFD Exif) : c'est le champ exact de l'objectif qui l'a prise, ce qui vaut mieux que la valeur
// par defaut. Le modele d'appareil (`Model`, balise 0x0110 de l'IFD0) sert a retenir cette focale
// pour les photos du meme telephone dont l'EXIF a perdu la focale.
//
// Le reste se garde pour rejouer une prise sans l'image d'origine (audit de la calibration, lot A) :
// la focale reelle et le zoom numerique (un recadrage du capteur : la focale 24x36 en tient compte,
// la focale reelle non), l'objectif (un telephone en a plusieurs), la marque, l'orientation que le
// navigateur applique a la reduction, la date de la prise, et la position GPS que l'appareil a ecrite
// (IFD GPS, 0x8825). Lecteur minimal : l'en-tete APP1, le premier IFD, les sous-IFD Exif et GPS.
// Tout ce qui ne ressemble pas a ce chemin renvoie `null`.
//
// A lire sur le fichier d'origine : la reduction par un canevas efface tout l'EXIF.

import type { ExifPhoto, GpsExif } from '../../model/audit.js';

export type { ExifPhoto, GpsExif };

const SANS_EXIF: ExifPhoto = { focale35: null, modele: null };

/** L'optique d'une photo JPEG ; `null` pour ce qui manque, et seulement les deux champs de base sans EXIF. */
export function lireExif(tampon: ArrayBuffer): ExifPhoto {
  const v = new DataView(tampon);
  if (v.byteLength < 4 || v.getUint16(0) !== 0xffd8) return { ...SANS_EXIF };
  let o = 2;
  while (o + 4 <= v.byteLength) {
    const marqueur = v.getUint16(o);
    const long = v.getUint16(o + 2);
    if (marqueur === 0xffe1 && o + 10 <= v.byteLength && v.getUint32(o + 4) === 0x45786966) return lireTiff(v, o + 10);
    if ((marqueur & 0xff00) !== 0xff00 || marqueur === 0xffda) return { ...SANS_EXIF };
    o += 2 + long;
  }
  return { ...SANS_EXIF };
}

interface Entree { type: number; compte: number; position: number }

const arrondi = (v: number, pas: number) => Math.round(v / pas) * pas;
const net = (v: number, decimales: number) => Number(v.toFixed(decimales));

function lireTiff(v: DataView, base: number): ExifPhoto {
  if (base + 8 > v.byteLength) return { ...SANS_EXIF };
  const le = v.getUint16(base) === 0x4949;
  const u16 = (p: number) => v.getUint16(p, le);
  const u32 = (p: number) => v.getUint32(p, le);
  const entree = (ifd: number | null, balise: number): Entree | null => {
    if (ifd === null || ifd + 2 > v.byteLength) return null;
    const n = u16(ifd);
    for (let i = 0; i < n; i++) {
      const e = ifd + 2 + i * 12;
      if (e + 12 > v.byteLength) return null;
      if (u16(e) === balise) return { type: u16(e + 2), compte: u32(e + 4), position: e + 8 };
    }
    return null;
  };
  // Un octet (type 1), un entier court (type 3) ou long (type 4) range dans l'entree elle-meme.
  const entier = (e: Entree | null): number | null => (e ? (e.type === 1 ? v.getUint8(e.position) : e.type === 3 ? u16(e.position) : e.type === 4 ? u32(e.position) : null) : null);
  // Une chaine ASCII (type 2) : dans l'entree si elle tient en 4 octets, sinon a un decalage du TIFF.
  const texte = (e: Entree | null): string | null => {
    if (!e || e.type !== 2 || e.compte === 0 || e.compte > 256) return null;
    const debut = e.compte <= 4 ? e.position : base + u32(e.position);
    if (debut + e.compte > v.byteLength) return null;
    let s = '';
    for (let i = 0; i < e.compte; i++) {
      const c = v.getUint8(debut + i);
      if (c === 0) break;
      s += String.fromCharCode(c);
    }
    s = s.trim();
    return s || null;
  };
  // Des rationnels (type 5 non signes, 10 signes) : huit octets chacun, toujours a un decalage du TIFF.
  const rationnels = (e: Entree | null): number[] | null => {
    if (!e || (e.type !== 5 && e.type !== 10) || e.compte === 0 || e.compte > 16) return null;
    const debut = base + u32(e.position);
    if (debut + 8 * e.compte > v.byteLength) return null;
    const out: number[] = [];
    for (let i = 0; i < e.compte; i++) {
      const p = debut + 8 * i;
      const num = e.type === 10 ? v.getInt32(p, le) : u32(p), den = e.type === 10 ? v.getInt32(p + 4, le) : u32(p + 4);
      if (den === 0) return null;
      out.push(num / den);
    }
    return out;
  };
  const rationnel = (e: Entree | null): number | null => rationnels(e)?.[0] ?? null;
  const decalage = (e: Entree | null): number | null => { const d = entier(e); return d === null ? null : base + d; };

  const ifd0 = base + u32(base + 4);
  const modele = texte(entree(ifd0, 0x0110));
  const exif = decalage(entree(ifd0, 0x8769));
  const gpsIfd = decalage(entree(ifd0, 0x8825));
  const f = entier(entree(exif, 0xa405));
  const focaleMm = rationnel(entree(exif, 0x920a));
  const zoom = rationnel(entree(exif, 0xa404));
  const orientation = entier(entree(ifd0, 0x0112));
  return {
    focale35: f && f > 0 ? f : null,
    modele,
    focaleMm: focaleMm !== null && focaleMm > 0 ? net(focaleMm, 2) : null,
    // Le zoom numerique vaut 0 quand il n'a pas servi (EXIF 2.3) : c'est un zoom de 1.
    zoomNumerique: zoom === null || zoom < 0 ? null : zoom === 0 ? 1 : net(zoom, 3),
    objectif: texte(entree(exif, 0xa434)),
    marque: texte(entree(ifd0, 0x010f)),
    orientation: orientation !== null && orientation >= 1 && orientation <= 8 ? orientation : null,
    datePrise: texte(entree(exif, 0x9003)),
    decalageHoraire: texte(entree(exif, 0x9011)),
    gps: lireGps(gpsIfd, entree, texte, rationnels, rationnel, entier),
  };
}

/** La position de l'IFD GPS : latitude et longitude en degres, minutes, secondes, chacune avec son hemisphere. */
function lireGps(
  ifd: number | null,
  entree: (ifd: number | null, balise: number) => Entree | null,
  texte: (e: Entree | null) => string | null,
  rationnels: (e: Entree | null) => number[] | null,
  rationnel: (e: Entree | null) => number | null,
  entier: (e: Entree | null) => number | null,
): GpsExif | null {
  if (ifd === null) return null;
  const degres = (balise: number): number | null => {
    const r = rationnels(entree(ifd, balise));
    if (!r || r.length !== 3 || r.some((x) => !Number.isFinite(x) || x < 0)) return null;
    return (r[0] as number) + (r[1] as number) / 60 + (r[2] as number) / 3600;
  };
  const refLat = texte(entree(ifd, 1)), refLon = texte(entree(ifd, 3));
  const lat = degres(2), lon = degres(4);
  if (lat === null || lon === null || (refLat !== 'N' && refLat !== 'S') || (refLon !== 'E' && refLon !== 'W') || lat > 90 || lon > 180) return null;
  // Un appareil sans position ecrit parfois 0, 0 : ce n'est pas une position.
  if (lat === 0 && lon === 0) return null;
  const alt = rationnel(entree(ifd, 6));
  const sousLaMer = entier(entree(ifd, 5)) === 1;
  const cap = rationnel(entree(ifd, 17));
  const nord = texte(entree(ifd, 16));
  return {
    lat: net((refLat === 'S' ? -1 : 1) * lat, 7),
    lon: net((refLon === 'W' ? -1 : 1) * lon, 7),
    altitudeM: alt === null || !Number.isFinite(alt) ? null : net(arrondi((sousLaMer ? -1 : 1) * Math.abs(alt), 0.01), 2),
    capDeg: cap === null || !Number.isFinite(cap) || cap < 0 || cap > 360 ? null : net(cap % 360, 2),
    nordCap: nord === 'T' || nord === 'M' ? nord : null,
  };
}

/** Champ du grand cote de l'image, en degres, pour une focale equivalente 24x36. */
export function champDepuisFocale35(f: number): number {
  return (2 * Math.atan(36 / 2 / f) * 180) / Math.PI;
}

/** La focale equivalente 24x36 qui donne ce champ sur le grand cote : l'inverse de `champDepuisFocale35`. */
export function focale35DepuisChamp(champDeg: number): number {
  return 36 / 2 / Math.tan((champDeg * Math.PI) / 360);
}

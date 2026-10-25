// La focale et le modele d'appareil d'une photo JPEG, lus dans son EXIF (spec-releve-facade §5.3,
// MD/spec-audit.md §5).
//
// Une photo porte souvent sa focale equivalente 24x36 (`FocalLengthIn35mmFilm`, balise 0xA405 du
// sous-IFD Exif) : c'est le champ exact de l'objectif qui l'a prise, ce qui vaut mieux que la valeur
// par defaut. Le modele d'appareil (`Model`, balise 0x0110 de l'IFD0) sert a retenir cette focale
// pour les photos du meme telephone dont l'EXIF a perdu la focale. Lecteur minimal : l'en-tete APP1,
// le premier IFD, le sous-IFD Exif. Tout ce qui ne ressemble pas a ce chemin renvoie `null`.
//
// A lire sur le fichier d'origine : la reduction par un canevas efface tout l'EXIF.

/** Ce que l'EXIF dit de l'objectif. */
export interface ExifPhoto {
  /** Focale equivalente 24x36, en millimetres. */
  focale35: number | null;
  /** Le modele d'appareil, tel que l'appareil l'ecrit (« iPhone 13 »). */
  modele: string | null;
}

const SANS_EXIF: ExifPhoto = { focale35: null, modele: null };

/** La focale et le modele d'une photo JPEG ; `null` pour ce qui manque. */
export function lireExif(tampon: ArrayBuffer): ExifPhoto {
  const v = new DataView(tampon);
  if (v.byteLength < 4 || v.getUint16(0) !== 0xffd8) return SANS_EXIF;
  let o = 2;
  while (o + 4 <= v.byteLength) {
    const marqueur = v.getUint16(o);
    const long = v.getUint16(o + 2);
    if (marqueur === 0xffe1 && o + 10 <= v.byteLength && v.getUint32(o + 4) === 0x45786966) return lireTiff(v, o + 10);
    if ((marqueur & 0xff00) !== 0xff00 || marqueur === 0xffda) return SANS_EXIF;
    o += 2 + long;
  }
  return SANS_EXIF;
}

/** Focale equivalente 24x36 en millimetres, ou `null`. */
export function focale35mm(tampon: ArrayBuffer): number | null {
  return lireExif(tampon).focale35;
}

interface Entree { type: number; compte: number; position: number }

function lireTiff(v: DataView, base: number): ExifPhoto {
  if (base + 8 > v.byteLength) return SANS_EXIF;
  const le = v.getUint16(base) === 0x4949;
  const u16 = (p: number) => v.getUint16(p, le);
  const u32 = (p: number) => v.getUint32(p, le);
  const entree = (ifd: number, balise: number): Entree | null => {
    if (ifd + 2 > v.byteLength) return null;
    const n = u16(ifd);
    for (let i = 0; i < n; i++) {
      const e = ifd + 2 + i * 12;
      if (e + 12 > v.byteLength) return null;
      if (u16(e) === balise) return { type: u16(e + 2), compte: u32(e + 4), position: e + 8 };
    }
    return null;
  };
  // Un entier court (type 3) ou long (type 4) range dans l'entree elle-meme.
  const entier = (e: Entree | null): number | null => (e ? (e.type === 3 ? u16(e.position) : u32(e.position)) : null);
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
  const ifd0 = base + u32(base + 4);
  const modele = texte(entree(ifd0, 0x0110));
  const exif = entier(entree(ifd0, 0x8769));
  const f = exif === null ? null : entier(entree(base + exif, 0xa405));
  return { focale35: f && f > 0 ? f : null, modele };
}

/** Champ du grand cote de l'image, en degres, pour une focale equivalente 24x36. */
export function champDepuisFocale35(f: number): number {
  return (2 * Math.atan(36 / 2 / f) * 180) / Math.PI;
}

/** La focale equivalente 24x36 qui donne ce champ sur le grand cote : l'inverse de `champDepuisFocale35`. */
export function focale35DepuisChamp(champDeg: number): number {
  return 36 / 2 / Math.tan((champDeg * Math.PI) / 360);
}

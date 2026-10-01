// La focale d'une photo JPEG, lue dans son EXIF (spec-releve-facade §5.3).
//
// Une photo importee plutot que prise dans Plan porte souvent sa focale equivalente 24x36
// (`FocalLengthIn35mmFilm`, balise 0xA405) : c'est le champ exact de l'objectif qui l'a prise, ce
// qui vaut mieux que la valeur par defaut. Lecteur minimal : l'en-tete APP1, le premier IFD, le
// sous-IFD Exif, une balise. Tout ce qui ne ressemble pas a ce chemin renvoie `null`.

/** Focale equivalente 24x36 en millimetres, ou `null`. */
export function focale35mm(tampon: ArrayBuffer): number | null {
  const v = new DataView(tampon);
  if (v.byteLength < 4 || v.getUint16(0) !== 0xffd8) return null;
  let o = 2;
  while (o + 4 <= v.byteLength) {
    const marqueur = v.getUint16(o);
    const long = v.getUint16(o + 2);
    if (marqueur === 0xffe1 && o + 10 <= v.byteLength && v.getUint32(o + 4) === 0x45786966) return lireTiff(v, o + 10);
    if ((marqueur & 0xff00) !== 0xff00 || marqueur === 0xffda) return null;
    o += 2 + long;
  }
  return null;
}

function lireTiff(v: DataView, base: number): number | null {
  if (base + 8 > v.byteLength) return null;
  const le = v.getUint16(base) === 0x4949;
  const u16 = (p: number) => v.getUint16(p, le);
  const u32 = (p: number) => v.getUint32(p, le);
  const entree = (ifd: number, balise: number): number | null => {
    if (ifd + 2 > v.byteLength) return null;
    const n = u16(ifd);
    for (let i = 0; i < n; i++) {
      const e = ifd + 2 + i * 12;
      if (e + 12 > v.byteLength) return null;
      if (u16(e) === balise) {
        const type = u16(e + 2);
        return type === 3 ? u16(e + 8) : u32(e + 8);
      }
    }
    return null;
  };
  const ifd0 = base + u32(base + 4);
  const exif = entree(ifd0, 0x8769);
  if (exif === null) return null;
  const f = entree(base + exif, 0xa405);
  return f && f > 0 ? f : null;
}

/** Champ du grand cote de l'image, en degres, pour une focale equivalente 24x36. */
export function champDepuisFocale35(f: number): number {
  return (2 * Math.atan(36 / 2 / f) * 180) / Math.PI;
}

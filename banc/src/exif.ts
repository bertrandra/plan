// Ce que l'EXIF d'une photo de l'iPhone dit d'elle (etape 1a) : sa position, sa date, son cap, son appareil, sa focale.
// Un lecteur minimal, sans bibliotheque : le segment APP1 d'un JPEG, IFD0, sous-IFD EXIF et GPS.

export interface ExifLu {
  lat: number | null;
  lon: number | null;
  /** Le cap de l'appareil a la prise (GPSImgDirection), en degres depuis le nord. */
  azimut: number | null;
  date: string | null;
  appareil: string | null;
  focale35: number | null;
  orientation: number | null;
}

const VIDE: ExifLu = { lat: null, lon: null, azimut: null, date: null, appareil: null, focale35: null, orientation: null };

/** Lit l'EXIF d'un JPEG ; tout ce qui manque est null (un PNG, une photo sans EXIF : tout est null). */
export function lireExif(octets: ArrayBuffer): ExifLu {
  const v = new DataView(octets);
  if (v.byteLength < 4 || v.getUint16(0) !== 0xffd8) return { ...VIDE };
  let o = 2;
  while (o + 4 <= v.byteLength) {
    const marqueur = v.getUint16(o), longueur = v.getUint16(o + 2);
    if (marqueur === 0xffe1 && o + 10 <= v.byteLength && v.getUint32(o + 4) === 0x45786966) return lireTiff(v, o + 10, longueur - 8);
    if ((marqueur & 0xff00) !== 0xff00 || marqueur === 0xffda) break;
    o += 2 + longueur;
  }
  return { ...VIDE };
}

interface Entree { type: number; n: number; valeur: number }

function lireTiff(v: DataView, debut: number, taille: number): ExifLu {
  const fin = Math.min(v.byteLength, debut + taille);
  if (debut + 8 > fin) return { ...VIDE };
  const le = v.getUint16(debut) === 0x4949;
  const u16 = (p: number) => (p + 2 <= fin ? v.getUint16(p, le) : 0);
  const u32 = (p: number) => (p + 4 <= fin ? v.getUint32(p, le) : 0);
  const ifd = (p: number): Map<number, Entree> => {
    const m = new Map<number, Entree>();
    const a = debut + p;
    const n = u16(a);
    for (let i = 0; i < n && a + 2 + 12 * i + 12 <= fin; i++) {
      const e = a + 2 + 12 * i;
      m.set(u16(e), { type: u16(e + 2), n: u32(e + 4), valeur: e + 8 });
    }
    return m;
  };
  const taillesType: Record<number, number> = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8 };
  const adresse = (e: Entree) => ((taillesType[e.type] ?? 1) * e.n > 4 ? debut + u32(e.valeur) : e.valeur);
  const texte = (e: Entree | undefined): string | null => {
    if (!e) return null;
    const a = adresse(e);
    let s = '';
    for (let i = 0; i < e.n && a + i < fin; i++) { const c = v.getUint8(a + i); if (!c) break; s += String.fromCharCode(c); }
    return s.trim() || null;
  };
  const rationnel = (e: Entree | undefined, k = 0): number | null => {
    if (!e || (e.type !== 5 && e.type !== 10)) return null;
    const a = adresse(e) + 8 * k;
    const num = e.type === 10 ? (a + 4 <= fin ? v.getInt32(a, le) : 0) : u32(a), den = e.type === 10 ? (a + 8 <= fin ? v.getInt32(a + 4, le) : 0) : u32(a + 4);
    return den ? num / den : null;
  };
  const entier = (e: Entree | undefined): number | null => (!e ? null : e.type === 3 ? u16(e.valeur) : e.type === 4 ? u32(e.valeur) : null);
  const ifd0 = ifd(u32(debut + 4));
  const exif = ifd0.has(0x8769) ? ifd(u32((ifd0.get(0x8769) as Entree).valeur)) : new Map<number, Entree>();
  const gps = ifd0.has(0x8825) ? ifd(u32((ifd0.get(0x8825) as Entree).valeur)) : new Map<number, Entree>();
  const degres = (tag: number, ref: number, negatif: string): number | null => {
    const e = gps.get(tag);
    const d = rationnel(e, 0), m = rationnel(e, 1), s = rationnel(e, 2);
    if (d === null || m === null || s === null) return null;
    const x = d + m / 60 + s / 3600;
    return texte(gps.get(ref)) === negatif ? -x : x;
  };
  const date = texte(exif.get(0x9003)) ?? texte(ifd0.get(0x0132));
  const marque = texte(ifd0.get(0x010f)), modele = texte(ifd0.get(0x0110));
  return {
    lat: degres(2, 1, 'S'),
    lon: degres(4, 3, 'W'),
    azimut: rationnel(gps.get(0x11)),
    date: date ? date.replace(/^(\d{4}):(\d{2}):(\d{2}) /, '$1-$2-$3T') : null,
    appareil: [marque, modele].filter(Boolean).join(' ') || null,
    focale35: entier(exif.get(0xa405)),
    orientation: entier(ifd0.get(0x0112)),
  };
}

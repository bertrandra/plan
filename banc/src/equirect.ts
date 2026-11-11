// Une vue plate tiree d'un panoramique equirectangulaire (etape 1b) : Panoramax a beaucoup de photos 360 ; on en garde la vue
// tournee vers l'adresse, comme si on avait pointe un appareil ordinaire sur la facade. Sans DOM, testable seul.

export interface ImageRgba { largeur: number; hauteur: number; donnees: Uint8ClampedArray }

export interface Visee {
  /** Le cap du centre du panoramique (sa colonne du milieu), en degres depuis le nord. */
  capCentre: number;
  /** Le cap vers lequel regarder, et le tangage (positif : vers le haut). */
  cap: number;
  tangage: number;
  /** Le champ horizontal de la vue, en degres. */
  champ: number;
  largeur: number;
  hauteur: number;
}

const rad = (d: number) => (d * Math.PI) / 180;

/** Lit un pixel du panoramique, bilineaire, en bouclant en longitude. */
function echantillon(src: ImageRgba, u: number, v: number, sortie: Uint8ClampedArray, k: number): void {
  const W = src.largeur, H = src.hauteur;
  const x = ((u % W) + W) % W, y = Math.min(H - 1, Math.max(0, v));
  const x0 = Math.floor(x), y0 = Math.floor(y), x1 = (x0 + 1) % W, y1 = Math.min(H - 1, y0 + 1);
  const fx = x - x0, fy = y - y0, d = src.donnees;
  for (let c = 0; c < 3; c++) {
    const a = d[(y0 * W + x0) * 4 + c] as number, b = d[(y0 * W + x1) * 4 + c] as number;
    const e = d[(y1 * W + x0) * 4 + c] as number, f = d[(y1 * W + x1) * 4 + c] as number;
    sortie[k + c] = (a * (1 - fx) + b * fx) * (1 - fy) + (e * (1 - fx) + f * fx) * fy;
  }
  sortie[k + 3] = 255;
}

/** La vue perspective : pour chaque pixel de la sortie, le rayon de la camera virtuelle, puis le point du panoramique qu'il vise. */
export function vueDuPanoramique(src: ImageRgba, v: Visee): ImageRgba {
  const L = v.largeur, H = v.hauteur, sortie = new Uint8ClampedArray(L * H * 4);
  const f = L / 2 / Math.tan(rad(v.champ) / 2);
  const lacet = rad(v.cap), tangage = rad(v.tangage), cosT = Math.cos(tangage), sinT = Math.sin(tangage);
  for (let j = 0; j < H; j++) {
    for (let i = 0; i < L; i++) {
      // Le rayon dans le repere de la camera (x a droite, y en haut, z devant), incline du tangage, tourne du lacet.
      const x = i + 0.5 - L / 2, y = H / 2 - (j + 0.5), z = f;
      const y2 = y * cosT + z * sinT, z2 = -y * sinT + z * cosT;
      const lon = lacet + Math.atan2(x, z2), lat = Math.atan2(y2, Math.hypot(x, z2));
      // Longitude en colonnes : le centre de l'image est capCentre, 360 degres sur toute la largeur.
      const dLon = ((((lon * 180) / Math.PI - v.capCentre) % 360) + 540) % 360 - 180;
      echantillon(src, (0.5 + dLon / 360) * src.largeur - 0.5, (0.5 - lat / Math.PI) * src.hauteur - 0.5, sortie, (j * L + i) * 4);
    }
  }
  return { largeur: L, hauteur: H, donnees: sortie };
}

// La texture d'une facade sans ses ombres, pour la Vue 3D (case « Ombres de la photo » decochee).
//
// La photo redressee porte les ombres de l'heure ou elle a ete prise (debord du toit, balcon, arbre, degrade de lumiere), et la
// Vue 3D pose ensuite les siennes, a l'heure choisie : des ombres en double, et souvent contraires. On estompe celles de la photo.
//
// Une ombre portee garde la teinte du mur et n'en baisse que la luminosite. L'eclairage se lit donc sur le mur seul (les baies et
// leur encadrement mis de cote), a 5 cm le pixel : la mediane de la luminosite sur une fenetre plus grande qu'une pierre et plus
// petite qu'une ombre. L'eclairage au soleil est un haut quantile de ces valeurs. Chaque pixel est eclairci du rapport entre les
// deux, la ou la teinte locale est celle du mur au soleil : un soubassement, un bandeau, une autre pierre ne sont pas des ombres.
// Les baies prennent le gain du mur qui les entoure : une fenetre dans l'ombre du debord s'eclaircit avec lui.
//
// Rien d'autre ne change : ni la photo enregistree, ni l'elevation que lit la detection, ni les cotes, ni l'export .glb.

import { PX_PAR_M, medianeGlissante, medianeMasquee, completer, reduire } from '../detection/detectionCartes.js';
import { reglagesTexture, type ValeursTexture } from '../regles/facades/texture.js';
import type { Image } from './homographie.js';

/** Une baie, en metres : x depuis la gauche, y depuis le sol. */
export interface BaieTexture { x: number; y: number; l: number; h: number }

/** Un pixel eclairci ne depasse pas le mur au soleil de plus de 5 % : le grain du parement garde sa marge. */
const PLAFOND_SOLEIL = 1.05;

/** Les pixels gardes pour lire une carte, et ceux d'une fenetre glissante : au moins cette part. */
const PART_MIN = 0.2;

/** La chromaticite (r, g) / (r + g + b) d'un pixel d'une carte a trois canaux. */
function chroma(rgb: Float32Array, i: number): [number, number] {
  const r = rgb[i * 3] ?? 0, g = rgb[i * 3 + 1] ?? 0, b = rgb[i * 3 + 2] ?? 0;
  const s = r + g + b;
  return s > 0 ? [r / s, g / s] : [1 / 3, 1 / 3];
}

/**
 * Une bande qui s'assombrit sur toute la largeur, depuis le pied du mur, est un soubassement (pierre, meuliere, enduit plus
 * sombre), pas une ombre : une ombre portee au pied d'un mur ne le couvre pas d'un bout a l'autre. Ses rangs gardent leur teinte.
 */
function pasDeSoubassement(gain: Float32Array, mur: Uint8Array, l: number, h: number, rg: ValeursTexture): void {
  const hauteurMax = Math.round(rg['facades.texture.soubassementMaxM'] * PX_PAR_M), part = rg['facades.texture.soubassementPart'];
  const rangs: number[] = [];
  for (let k = 0; k < Math.min(h, hauteurMax); k++) {
    const y = h - 1 - k;
    let n = 0, o = 0;
    for (let x = 0; x < l; x++) { const i = y * l + x; if (!mur[i]) continue; n++; if ((gain[i] ?? 1) > 1) o++; }
    // Une rangee toute en baies (une porte de garage) ne dit rien : elle suit la bande.
    if (n < 0.2 * l) { if (rangs.length) rangs.push(y); continue; }
    if (o < part * n) break;
    rangs.push(y);
  }
  if (!rangs.length) return;
  for (const y of rangs) gain.fill(1, y * l, (y + 1) * l);
}

/** Un flou de boite 3 x 3 sur une carte d'un canal : le gain ne doit pas faire de marches de 5 cm. */
function adoucir(v: Float32Array, l: number, h: number): Float32Array {
  const out = new Float32Array(v.length);
  for (let y = 0; y < h; y++) for (let x = 0; x < l; x++) {
    let s = 0, n = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const xx = x + dx, yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= l || yy >= h) continue;
      s += v[yy * l + xx] ?? 1; n++;
    }
    out[y * l + x] = s / n;
  }
  return out;
}

/**
 * La carte du gain d'eclairage (1 : rien a eclaircir), a 5 cm le pixel. `hauteurM` : la hauteur que couvre la texture, depuis le
 * sol ; les baies se placent depuis le bas de la texture.
 */
export function gainEclairage(texture: Image, pxParM: number, baies: readonly BaieTexture[], hauteurMurM: number, rg: ValeursTexture = reglagesTexture()): { gain: Float32Array; l: number; h: number; soleil: number } {
  const R = reduire(texture, pxParM, null);
  const { l, h } = R;
  // Le mur : sous l'egout (au-dessus, la bande montre le toit et le ciel repeint), ce qui n'est ni une baie ni son encadrement.
  const mur = new Uint8Array(l * h);
  const egout = Math.max(0, Math.round(h - hauteurMurM * PX_PAR_M));
  mur.fill(1, egout * l);
  const m = rg['facades.texture.margeBaieM'];
  for (const b of baies) {
    const x0 = Math.max(0, Math.floor((b.x - m) * PX_PAR_M)), x1 = Math.min(l - 1, Math.ceil((b.x + b.l + m) * PX_PAR_M));
    const y0 = Math.max(0, Math.floor(h - (b.y + b.h + m) * PX_PAR_M)), y1 = Math.min(h - 1, Math.ceil(h - (b.y - m) * PX_PAR_M));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) mur[y * l + x] = 0;
  }
  const lum = new Float32Array(l * h);
  for (let i = 0; i < l * h; i++) lum[i] = ((R.rgb[i * 3] ?? 0) + (R.rgb[i * 3 + 1] ?? 0) + (R.rgb[i * 3 + 2] ?? 0)) / 3;
  const r = Math.max(1, Math.round(rg['facades.texture.rayonEclairageM'] * PX_PAR_M));
  const global = medianeMasquee(lum, 1, mur)[0] ?? 128;
  const L = completer(medianeGlissante(lum, 1, mur, l, h, r, r, PART_MIN), 1, new Float32Array(l * h).fill(global));
  const T = completer(medianeGlissante(R.rgb, 3, mur, l, h, r, r, PART_MIN), 3, new Float32Array(R.rgb));
  // L'eclairage au soleil, et la teinte du mur qui y est : celle des pixels du mur les mieux eclaires.
  const eclaires: number[] = [];
  for (let i = 0; i < l * h; i++) if (mur[i]) eclaires.push(L[i] ?? 0);
  eclaires.sort((a, b) => a - b);
  const soleil = eclaires.length ? (eclaires[Math.min(eclaires.length - 1, Math.floor(rg['facades.texture.quantileSoleil'] * eclaires.length))] ?? global) : global;
  let cr = 0, cg = 0, n = 0;
  for (let i = 0; i < l * h; i++) if (mur[i] && (L[i] ?? 0) >= soleil) { const [a, b] = chroma(T, i); cr += a; cg += b; n++; }
  const ref: [number, number] = n ? [cr / n, cg / n] : [1 / 3, 1 / 3];
  const gainMax = rg['facades.texture.gainMax'], ecartMax = rg['facades.texture.ecartTeinteMax'], ombreMin = rg['facades.texture.ombreMin'];
  const gain = new Float32Array(l * h);
  for (let i = 0; i < l * h; i++) {
    const [a, b] = chroma(T, i);
    const memeMur = Math.hypot(a - ref[0], b - ref[1]) <= ecartMax;
    const li = L[i] ?? 0;
    const g = li > 1 ? soleil / li : 1;
    // Le gain ne porte jamais un pixel au-dela du mur au soleil : pres du bord d'une ombre, la fenetre melange ombre et soleil, et
    // le cote eclaire, eclairci a son tour, ferait un liseré clair (de meme un encadrement blanc, deja plus clair que le mur).
    const propre = (lum[i] ?? 0) > 1 ? (soleil * PLAFOND_SOLEIL) / (lum[i] ?? 1) : gainMax;
    gain[i] = memeMur && g >= ombreMin ? Math.max(1, Math.min(gainMax, g, propre)) : 1;
  }
  // Au-dessus de l'egout, la bande montre le toit et le ciel repeint : rien a eclaircir.
  gain.fill(1, 0, egout * l);
  pasDeSoubassement(gain, mur, l, h, rg);
  return { gain: adoucir(gain, l, h), l, h, soleil };
}

/** La texture sans ses ombres : une copie, eclaircie la ou le mur est a l'ombre. `baies` en metres, depuis le sol ; `hauteurMurM` : l'egout. */
export function sansOmbres(texture: Image, pxParM: number, baies: readonly BaieTexture[], hauteurMurM: number, rg: ValeursTexture = reglagesTexture()): Image {
  const { gain, l, h, soleil } = gainEclairage(texture, pxParM, baies, hauteurMurM, rg);
  // Le meme plafond qu'a 5 cm, au pixel : au bord net d'une ombre, la carte a cheval sur les deux cotes eclaircirait le cote au soleil.
  const plafond = soleil * PLAFOND_SOLEIL * 3;
  const force = rg['facades.texture.force'];
  const out = new Uint8ClampedArray(texture.donnees);
  const W = texture.largeur, H = texture.hauteur;
  const fx = l / W, fy = h / H;
  for (let y = 0; y < H; y++) {
    // Le gain se lit entre les centres des pixels de la carte (interpolation bilineaire).
    const gy = Math.min(h - 1, Math.max(0, (y + 0.5) * fy - 0.5));
    const y0 = Math.floor(gy), y1 = Math.min(h - 1, y0 + 1), ty = gy - y0;
    for (let x = 0; x < W; x++) {
      const gx = Math.min(l - 1, Math.max(0, (x + 0.5) * fx - 0.5));
      const x0 = Math.floor(gx), x1 = Math.min(l - 1, x0 + 1), tx = gx - x0;
      const k = (gain[y0 * l + x0] ?? 1) * (1 - tx) * (1 - ty) + (gain[y0 * l + x1] ?? 1) * tx * (1 - ty) + (gain[y1 * l + x0] ?? 1) * (1 - tx) * ty + (gain[y1 * l + x1] ?? 1) * tx * ty;
      if (k <= 1.001) continue;
      const i = (y * W + x) * 4;
      const somme = (out[i] ?? 0) + (out[i + 1] ?? 0) + (out[i + 2] ?? 0);
      const f = Math.min(1 + force * (k - 1), somme > 3 ? Math.max(1, plafond / somme) : k);
      out[i] = (out[i] ?? 0) * f; out[i + 1] = (out[i + 1] ?? 0) * f; out[i + 2] = (out[i + 2] ?? 0) * f;
    }
  }
  return { largeur: W, hauteur: H, donnees: out };
}

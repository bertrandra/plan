// Les indices d'une ouverture, au-dela de l'ecart a la teinte (MD/spec-facades-calage-detection.md §9,
// lot L14) : le filtre d'ombre (C), les profils de contours (B), les volets battants qui encadrent une
// baie, et l'affinage des bords au centimetre.

import { au } from '../util/tableaux.js';
import type { Image } from './homographie.js';
import { PX_PAR_M, mediane, type Reduite } from './detectionCartes.js';
import type { ValeursDetection } from './reglagesDetection.js';

/** Une boite en pixels de l'elevation : colonnes [X0, X1[, lignes [Y0, Y1[ (Y vers le bas). */
export interface BoitePx {
  X0: number;
  X1: number;
  Y0: number;
  Y1: number;
}

/* ------------------------------------------------------------------------------------------------
 * C. Le filtre d'ombre
 * --------------------------------------------------------------------------------------------- */

/**
 * Les pixels qui ne different de leur fond que par la luminance : plus sombres, de meme chromaticite
 * (r/(r+g+b), g/(r+g+b)). Une ombre portee multiplie la lumiere sans changer la teinte ; un vitrage, une
 * menuiserie, un volet ont leur propre teinte. Un vitrage dans l'ombre garde la sienne : il reste.
 */
export function carteOmbre(R: Reduite, fond: Float32Array, rg: ValeursDetection): Uint8Array {
  const o = new Uint8Array(R.l * R.h);
  const cMax = rg['facades.detection.ombreChromaMax'],
    lMin = rg['facades.detection.ombreLuminanceMin'],
    lMax = rg['facades.detection.ombreLuminanceMax'];
  for (let i = 0; i < R.l * R.h; i++) {
    if (!R.vu[i]) continue;
    const r = R.rgb[i * 3] ?? 0,
      g = R.rgb[i * 3 + 1] ?? 0,
      b = R.rgb[i * 3 + 2] ?? 0;
    const fr = fond[i * 3] ?? 0,
      fg = fond[i * 3 + 1] ?? 0,
      fb = fond[i * 3 + 2] ?? 0;
    const s = r + g + b,
      fs = fr + fg + fb;
    if (s <= 0 || fs <= 0) continue;
    const rapport = s / fs;
    if (rapport < lMin || rapport > lMax) continue;
    const dc = Math.hypot(r / s - fr / fs, g / s - fg / fs);
    if (dc < cMax) o[i] = 1;
  }
  return o;
}

/* ------------------------------------------------------------------------------------------------
 * B. Les profils de contours
 * --------------------------------------------------------------------------------------------- */

/** Les gradients de travail : horizontal (aretes verticales) et vertical (aretes horizontales). */
export interface Gradients {
  gx: Float32Array;
  gy: Float32Array;
  /** Gradient au-dessus duquel une arete est franche, d'apres le grain du mur. */
  franc: number;
}

/**
 * Les gradients de l'elevation reduite, en ecart de couleur entre les deux voisins. Apres le
 * redressement, les bords d'une baie sont horizontaux et verticaux : ses tableaux font des aretes
 * verticales, ses linteaux et appuis des aretes horizontales. Le seuil d'une arete franche suit le
 * grain du mur (la brique a plus de petites aretes qu'un enduit lisse).
 */
export function gradients(R: Reduite, mur: Uint8Array, rg: ValeursDetection): Gradients {
  const { l, h, rgb, vu } = R;
  const gx = new Float32Array(l * h),
    gy = new Float32Array(l * h);
  const d = (i: number, j: number) => Math.hypot((rgb[i * 3] ?? 0) - (rgb[j * 3] ?? 0), (rgb[i * 3 + 1] ?? 0) - (rgb[j * 3 + 1] ?? 0), (rgb[i * 3 + 2] ?? 0) - (rgb[j * 3 + 2] ?? 0));
  const surMur: number[] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < l; x++) {
      const i = y * l + x;
      if (!vu[i]) continue;
      if (x > 0 && x < l - 1 && vu[i - 1] && vu[i + 1]) gx[i] = d(i - 1, i + 1);
      if (y > 0 && y < h - 1 && vu[i - l] && vu[i + l]) gy[i] = d(i - l, i + l);
      if (mur[i]) surMur.push(gx[i] ?? 0, gy[i] ?? 0);
    }
  }
  return { gx, gy, franc: Math.max(0.8 * rg['facades.detection.seuilMin'], 3 * mediane(surMur)) };
}

/**
 * Le soutien des aretes sur les quatre cotes d'une boite de travail (x0..x1, y0..y1 inclus) : pour
 * chaque cote, la part de sa longueur (le milieu, sans les coins) ou une arete franche passe a un pixel
 * pres. Gauche, droite, haut, bas.
 */
export function soutienAretes(G: Gradients, l: number, h: number, b: { x0: number; y0: number; x1: number; y1: number }): number[] {
  const cote = (vertical: boolean, pos: number, debut: number, fin: number): number => {
    const a = debut + Math.round((fin - debut) * 0.15),
      z = fin - Math.round((fin - debut) * 0.15);
    let n = 0,
      tot = 0;
    for (let t = a; t <= z; t++) {
      tot++;
      let m = 0;
      for (let dp = -1; dp <= 1; dp++) {
        const p = pos + dp;
        if (vertical) {
          if (p >= 0 && p < l) m = Math.max(m, G.gx[t * l + p] ?? 0);
        } else if (p >= 0 && p < h) m = Math.max(m, G.gy[p * l + t] ?? 0);
      }
      if (m >= G.franc) n++;
    }
    return tot ? n / tot : 0;
  };
  // L'arete d'un bord est entre le dernier pixel du mur et le premier de la baie.
  return [cote(true, b.x0, b.y0, b.y1), cote(true, b.x1, b.y0, b.y1), cote(false, b.y0, b.x0, b.x1), cote(false, b.y1, b.x0, b.x1)];
}

/* ------------------------------------------------------------------------------------------------
 * Volets battants
 * --------------------------------------------------------------------------------------------- */

/**
 * Une baie encadree de ses deux volets battants ouverts fait une seule tache, deux fois trop large
 * (spec §2.2, L10 ; §11). Sur les colonnes de la boite (moyennes du milieu de sa hauteur, a la
 * resolution de l'elevation), on cherche trois segments : deux volets de meme teinte, unis, chacun
 * d'environ la moitie de la baie, qui encadrent un milieu d'une autre teinte. Rend les colonnes de la
 * baie, ou `null` si la tache n'a pas cette forme.
 */
export function baieEntreVolets(img: Image, vu: Uint8Array | null, b: BoitePx, pxParM: number, rg: ValeursDetection): { X0: number; X1: number } | null {
  const L = img.largeur,
    d = img.donnees;
  const w = b.X1 - b.X0;
  if (w < 3) return null;
  const ya = b.Y0 + Math.round((b.Y1 - b.Y0) * 0.25),
    yb = b.Y1 - Math.round((b.Y1 - b.Y0) * 0.25);
  // Sommes prefixes des moyennes de colonnes, et de leurs carres, pour la moyenne et la dispersion de
  // tout segment en temps constant.
  const S = new Float64Array((w + 1) * 3),
    Q = new Float64Array(w + 1);
  for (let x = 0; x < w; x++) {
    let r = 0,
      g = 0,
      bl = 0,
      n = 0;
    for (let y = ya; y < yb; y++) {
      const i = y * L + b.X0 + x;
      if (vu && !vu[i]) continue;
      r += d[i * 4] ?? 0;
      g += d[i * 4 + 1] ?? 0;
      bl += d[i * 4 + 2] ?? 0;
      n++;
    }
    if (n) {
      r /= n;
      g /= n;
      bl /= n;
    }
    S[(x + 1) * 3] = (S[x * 3] ?? 0) + r;
    S[(x + 1) * 3 + 1] = (S[x * 3 + 1] ?? 0) + g;
    S[(x + 1) * 3 + 2] = (S[x * 3 + 2] ?? 0) + bl;
    Q[x + 1] = (Q[x] ?? 0) + r * r + g * g + bl * bl;
  }
  const moy = (a: number, z: number) => [0, 1, 2].map((c) => ((S[z * 3 + c] ?? 0) - (S[a * 3 + c] ?? 0)) / (z - a));
  const disp = (a: number, z: number, m: number[]) => Math.sqrt(Math.max(0, ((Q[z] ?? 0) - (Q[a] ?? 0)) / (z - a) - (au(m, 0) ** 2 + au(m, 1) ** 2 + au(m, 2) ** 2)));
  const ecart = (p: number[], q: number[]) => Math.hypot(au(p, 0) - au(q, 0), au(p, 1) - au(q, 1), au(p, 2) - au(q, 2));
  const pMin = rg['facades.detection.voletsPartMin'],
    pMax = rg['facades.detection.voletsPartMax'];
  const wMin = rg['facades.detection.largeurMinM'] * pxParM;
  let meilleur: { x1: number; x2: number; note: number } | null = null;
  for (let x1 = 1; x1 < w - 1; x1++) {
    for (let x2 = x1 + 1; x2 < w; x2++) {
      const wl = x1,
        wm = x2 - x1,
        wr = w - x2;
      if (wm < wMin || wl < pMin * wm || wl > pMax * wm || wr < pMin * wm || wr > pMax * wm) continue;
      const mL = moy(0, x1),
        mM = moy(x1, x2),
        mR = moy(x2, w);
      const entre = ecart(mL, mR);
      if (entre > rg['facades.detection.voletsEcartMax']) continue;
      // Le contraste est l'ecart quadratique moyen des colonnes du milieu a la teinte des volets : une
      // baie (dormant clair, vitrage sombre) peut avoir en moyenne la teinte d'un volet vert, pas
      // colonne par colonne.
      const dM = disp(x1, x2, mM);
      const contraste = Math.min(Math.hypot(ecart(mL, mM), dM), Math.hypot(ecart(mR, mM), dM));
      // Un volet est uni (ses lames sont horizontales : elles ne changent pas la moyenne d'une colonne).
      const grain = Math.max(disp(0, x1, mL), disp(x2, w, mR));
      if (contraste < rg['facades.detection.voletsContrasteMin'] || grain > contraste / 2) continue;
      const note = contraste - entre - grain;
      if (!meilleur || note > meilleur.note) meilleur = { x1, x2, note };
    }
  }
  if (!meilleur) return null;
  // Le partage le plus contraste range le dormant clair avec les volets ou avec la baie selon leur
  // teinte. Le bord de la baie est la premiere colonne, en venant du volet, qui ne lui ressemble plus
  // (profil de colonnes, au centimetre). Sans une telle colonne pres de chaque coupure, la tache n'est
  // pas une baie entre ses volets mais une seule menuiserie : deux vantaux sombres separes par un
  // meneau clair ont aussi deux cotes pareils et un milieu different, mais le vitrage continue de part
  // et d'autre de la coupure.
  const { x1, x2 } = meilleur;
  const mL = moy(0, x1),
    mR = moy(x2, w),
    mM = moy(x1, x2);
  const marge = Math.ceil(0.1 * pxParM);
  const col = (x: number) => moy(x, x + 1);
  const bord = (depart: number, fin: number, pas: number, volet: number[]): number | null => {
    const limite = Math.max(ecart(volet, mM) / 2, rg['facades.detection.voletsContrasteMin']);
    for (let x = depart; pas > 0 ? x <= fin : x >= fin; x += pas) if (x >= 0 && x < w && ecart(col(x), volet) > limite) return x;
    return null;
  };
  const gauche = bord(Math.max(0, x1 - marge), Math.min(w - 1, x1 + marge), 1, mL);
  const droite = bord(Math.min(w - 1, x2 - 1 + marge), Math.max(0, x2 - 1 - marge), -1, mR);
  if (gauche === null || droite === null || droite <= gauche) return null;
  return { X0: b.X0 + gauche, X1: b.X0 + droite + 1 };
}

/* ------------------------------------------------------------------------------------------------
 * Affinage des bords
 * --------------------------------------------------------------------------------------------- */

/** Le fond et le seuil de travail au pixel (X, Y) de l'elevation. */
export interface FondPx {
  fond: Float32Array;
  seuil: Float32Array;
  l: number;
  h: number;
  f: number;
  /** Ecart moyen au-dessus duquel une arete du profil de contours est franche. */
  franc: number;
}

/**
 * Affine les bords d'une boite trouvee a 5 cm pres, a la resolution de l'elevation : sur chaque bord,
 * on balaye une bande de deux pixels de travail de part et d'autre, de l'exterieur vers l'interieur, et
 * le bord est la premiere ligne (ou colonne) dont la moitie des pixels s'ecartent du fond local. Les
 * cotes passent ainsi du demi-decimetre au centimetre, ce qui compte pour une menuiserie. `figes` : les
 * cotes deja placees sur un profil de contours (le bord d'une baie entre ses volets), que l'ecart au
 * fond ne sait pas lire.
 */
export function affiner(img: Image, F: FondPx, b: BoitePx, figes: { gauche?: boolean; droite?: boolean } = {}): BoitePx {
  const L = img.largeur,
    H = img.hauteur,
    d = img.donnees,
    f = F.f;
  const hors = (x: number, y: number) => {
    const k = (y * L + x) * 4;
    const j = Math.min(F.h - 1, Math.floor(y / f)) * F.l + Math.min(F.l - 1, Math.floor(x / f));
    return Math.hypot((d[k] ?? 0) - (F.fond[j * 3] ?? 0), (d[k + 1] ?? 0) - (F.fond[j * 3 + 1] ?? 0), (d[k + 2] ?? 0) - (F.fond[j * 3 + 2] ?? 0)) > (F.seuil[j] ?? 0);
  };
  let { X0, X1, Y0, Y1 } = b;
  const marge = Math.ceil(2 * f);
  // Le milieu de la boite seulement : les coins arrondis par la morphologie fausseraient la mesure.
  const colonne = (x: number) => {
    const a = Y0 + Math.round((Y1 - Y0) * 0.2),
      z = Y1 - Math.round((Y1 - Y0) * 0.2);
    let n = 0;
    for (let y = a; y < z; y++) if (hors(x, y)) n++;
    return z > a ? n / (z - a) : 0;
  };
  const ligne = (y: number) => {
    const a = X0 + Math.round((X1 - X0) * 0.2),
      z = X1 - Math.round((X1 - X0) * 0.2);
    let n = 0;
    for (let x = a; x < z; x++) if (hors(x, y)) n++;
    return z > a ? n / (z - a) : 0;
  };
  // Le bord tient sur quelques centimetres de suite : un joint de brique, d un centimetre, ne l est pas.
  const run = Math.max(2, Math.ceil(0.6 * f));
  const suivi = (v: number, pas: number, mesure: (v: number) => number, borne: number) => {
    for (let k = 0; k < run; k++) {
      const w = v + k * pas;
      if (w < 0 || w >= borne || mesure(w) < 0.5) return false;
    }
    return true;
  };
  const cherche = (de: number, a: number, pas: number, mesure: (v: number) => number, borne: number) => {
    for (let v = de; pas > 0 ? v <= a : v >= a; v += pas) if (v >= 0 && v < borne && suivi(v, pas, mesure, borne)) return v;
    return null;
  };
  const x0 = figes.gauche ? null : cherche(X0 - marge, X0 + marge, 1, colonne, L);
  const x1 = figes.droite ? null : cherche(X1 + marge, X1 - marge, -1, colonne, L);
  const y0 = cherche(Y0 - marge, Y0 + marge, 1, ligne, H);
  const y1 = cherche(Y1 + marge, Y1 - marge, -1, ligne, H);
  // Quand l'ecart au fond ne dit rien du bord (ton sur ton, grain du mur), le profil de contours le
  // place s'il est net : l'arete la plus forte de la bande, si elle est franche.
  const P = (vertical: boolean, pos: number) => profil(img, vertical, pos, vertical ? [Y0, Y1] : [X0, X1]);
  const pic = (vertical: boolean, centre: number, borne: number): number | null => {
    let meilleur: number | null = null,
      force = F.franc;
    for (let v = Math.max(1, centre - marge); v <= Math.min(borne - 1, centre + marge); v++) {
      const p = P(vertical, v);
      if (p >= force) {
        force = p;
        meilleur = v;
      }
    }
    return meilleur;
  };
  if (x0 !== null) X0 = x0;
  else if (!figes.gauche) X0 = pic(true, X0, L) ?? X0;
  if (x1 !== null) X1 = x1 + 1;
  else if (!figes.droite) X1 = pic(true, X1, L) ?? X1;
  if (y0 !== null) Y0 = y0;
  else Y0 = pic(false, Y0, H) ?? Y0;
  if (y1 !== null) Y1 = y1 + 1;
  else Y1 = pic(false, Y1, H) ?? Y1;
  return { X0, X1, Y0, Y1 };
}

/**
 * Le profil de contours a la colonne (ou ligne) `pos` de l'elevation : l'ecart de couleur moyen entre
 * elle et la precedente, sur le milieu de l'etendue `[a, z[` (sans les coins).
 */
function profil(img: Image, vertical: boolean, pos: number, [a0, z0]: [number, number]): number {
  const L = img.largeur,
    d = img.donnees;
  const a = a0 + Math.round((z0 - a0) * 0.2),
    z = z0 - Math.round((z0 - a0) * 0.2);
  let s = 0,
    n = 0;
  for (let t = a; t < z; t++) {
    const k = vertical ? (t * L + pos) * 4 : (pos * L + t) * 4;
    const k2 = vertical ? k - 4 : k - L * 4;
    if (k2 < 0 || k + 2 >= d.length) continue;
    s += Math.hypot((d[k] ?? 0) - (d[k2] ?? 0), (d[k + 1] ?? 0) - (d[k2 + 1] ?? 0), (d[k + 2] ?? 0) - (d[k2 + 2] ?? 0));
    n++;
  }
  return n ? s / n : 0;
}

/** Une boite de travail (pixels de 5 cm, bornes incluses) en pixels de l'elevation. */
export function versElevation(t: { x0: number; y0: number; x1: number; y1: number }, pxParM: number, H: number, hTravail: number): BoitePx {
  // Comme avant le lot : en metres depuis le bas, puis en pixels depuis le haut de l'elevation (dont la
  // hauteur n'est pas toujours un multiple exact de la resolution de travail).
  const hauteurM = hTravail / PX_PAR_M;
  const y = hauteurM - (t.y1 + 1) / PX_PAR_M,
    hm = (t.y1 - t.y0 + 1) / PX_PAR_M;
  return {
    X0: Math.round((t.x0 / PX_PAR_M) * pxParM),
    X1: Math.round(((t.x1 + 1) / PX_PAR_M) * pxParM),
    Y0: Math.round(H - (y + hm) * pxParM),
    Y1: Math.round(H - y * pxParM),
  };
}

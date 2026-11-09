// Les baies (fenetres, portes) sur la facade redressee de facade.html : un des trois detecteurs
// independants que ../baies.ts fait voter.
//
// Methode : l'alignement et la repetition. Le redressement garantit que les bords d'une baie sont
// des aretes droites, verticales et horizontales ; une facade les aligne (linteaux et appuis d'une
// ligne, tableaux d'une colonne) et les repete. D'ou, sur une image de travail d'un millier de
// pixels de cote (reduite d'un facteur entier, ou doublee si la photo est petite) :
//
//   1. les aretes droites : gradient du logarithme de la luminance (une ombre decale sans deformer),
//      aminci, garde seulement sur un alignement assez long - le crepi, le feuillage, la brique en
//      quinconce disparaissent ; restent tableaux, linteaux, appuis, meneaux ;
//   2. les travees : le profil des aretes verticales, colonne par colonne, donne les montants ;
//      deux montants en regard bornent une travee ;
//   3. les bandes : dans chaque travee, le profil des aretes horizontales donne les lignes hautes et
//      basses ; une case = une travee entre deux de ces lignes, chaque cote porte par une arete
//      (le pied des montants vaut ligne du bas pour une porte dont le seuil est cache) ;
//   4. le contenu de chaque case : une baie a une structure interieure (meneaux, traverses, vantaux)
//      ou est plus sombre que ses alentours ; ses bords s'arretent a ses coins (une ligne de
//      structure, colombage ou bandeau, file au-dela) ; elle n'est pas faite de mur - de plages
//      unies, sans arete verticale, qui ont la clarte et le grain de plages unies d'alentour (un
//      panneau d'enduit entre colombages, un trumeau, une allege) ;
//   5. le choix : les meilleures cases sans recouvrement, la plus grande a note comparable (une
//      fenetre plutot que ses vantaux), sauf si elle reunit une meilleure et autre chose (une baie
//      et son encadrement, deux baies et leur trumeau) ; les morceaux voisins et alignes d'une
//      meme baie sont reunis ;
//   6. l'alignement : une case mediocre est gardee si d'autres partagent sa ligne ou sa colonne,
//      ecartee si elle est isolee (sauf une porte : haute, large, au linteau net) ;
//   7. la repetition : chaque baie sure sert de modele, par correlation, pour retrouver ses
//      semblables le long de sa ligne et de sa colonne ;
//   8. chaque cote recale au pixel sur l'image d'origine.
//
// Les seuils (portee d'un cote, note, part de mur) ont ete etalonnes sur le jeu d'essai : des
// statistiques de cases justes et fausses, pas un modele appris. Limites connues : un vitrage
// derriere un garde-corps ou un balcon ouvrage, des volets battants (pris avec la fenetre ou a sa
// place), une porte-fenetre derriere un poteau (trouvee en partie), un rideau clair derriere la
// vitre (pris pour du mur), une vitrine sans menuiserie.
//
// La boite rendue est le hors-tout de la menuiserie. Le type suit la regle de Plan (`classer`), une
// fois le sol situe : le bas de la plus basse des baies, si c'est une porte. C'est une proposition :
// la page permet d'ajouter, recadrer, retirer une baie et d'en changer le type.

import type { Image } from '../auto.js';
import { classer, type TypeOuverture } from '../../../src/facade/detection.js';

export interface Baie {
  type: TypeOuverture;
  /** En metres : depuis le bord gauche de l'image, et au-dessus du sol (ou du bas de l'image). */
  x: number;
  y: number;
  l: number;
  h: number;
  /** Nombre de carreaux regroupes (0 : sans objet, la baie est trouvee par ses bords). */
  carreaux: number;
  /** En pixels de l'image, pour la dessiner : le hors-tout de la menuiserie. */
  px: { x: number; y: number; l: number; h: number };
}

export interface ResultatBaies {
  baies: Baie[];
  /** Le sol a-t-il ete situe (une porte trouvee) ? Sinon, les hauteurs partent du bas de l'image. */
  solTrouve: boolean;
  /** Le sol, en pixels de l'image (y), s'il a ete situe. */
  solPx: number | null;
  /** L'echelle etait-elle connue ? Sinon elle est estimee : une fenetre courante fait un metre de large. */
  echelleConnue: boolean;
}

/* ------------------------------------------------------------------------------------------------
 * L'image de travail
 * --------------------------------------------------------------------------------------------- */

/** L'image de travail : la luminance reduite d'un facteur entier, et la rugosite perdue a la reduction. */
interface Plan {
  l: number;
  h: number;
  lum: Float32Array;
  rug: Float32Array;
  /** 1 = pixel couvert par une photo. */
  ok: Uint8Array;
}

function reduire(img: Image, vu: Uint8Array | null, f: number): Plan {
  const W = img.largeur,
    d = img.donnees;
  const l = Math.max(1, Math.floor(W / f)),
    h = Math.max(1, Math.floor(img.hauteur / f));
  const n = l * h;
  const lum = new Float32Array(n),
    rug = new Float32Array(n),
    ok = new Uint8Array(n);
  const demi = (f * f) / 2;
  // La ligne du dessus dans le bloc, pour les ecarts verticaux.
  const dessus = new Int32Array(f);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < l; x++) {
      let sl = 0,
        eh = 0,
        ev = 0,
        nh = 0,
        nv = 0,
        nb = 0;
      for (let dy = 0; dy < f; dy++) {
        let i = (y * f + dy) * W + x * f;
        let avant = -1;
        for (let dx = 0; dx < f; dx++, i++) {
          if (vu && !vu[i]) {
            avant = -1;
            dessus[dx] = -1;
            continue;
          }
          const p = i * 4;
          const lu = (77 * d[p]! + 150 * d[p + 1]! + 29 * d[p + 2]!) >> 8;
          sl += lu;
          nb++;
          if (avant >= 0) {
            eh += lu > avant ? lu - avant : avant - lu;
            nh++;
          }
          if (dy > 0 && dessus[dx]! >= 0) {
            const t = dessus[dx]!;
            ev += lu > t ? lu - t : t - lu;
            nv++;
          }
          avant = lu;
          dessus[dx] = lu;
        }
      }
      const j = y * l + x;
      if (nb < demi || nb === 0) continue;
      ok[j] = 1;
      const m = sl / nb;
      lum[j] = m;
      // Rugosite isotrope : le plus petit des ecarts moyens entre voisins, en ligne et en colonne.
      // Un grain (crepi, feuillage) varie dans les deux sens ; une arete droite dans un seul.
      if (nh && nv) rug[j] = Math.min(eh / nh, ev / nv) / (m + 8);
    }
  if (f === 1) {
    // Sans reduction, les memes ecarts se lisent entre le pixel et ses voisins de droite et du dessous.
    for (let y = 0; y < h - 1; y++)
      for (let x = 0; x < l - 1; x++) {
        const j = y * l + x;
        const v = lum[j]!;
        const eh = Math.abs(lum[j + 1]! - v),
          ev = Math.abs(lum[j + l]! - v);
        rug[j] = (eh < ev ? eh : ev) / (v + 8);
      }
  }
  return { l, h, lum, rug, ok };
}

/**
 * Une petite image (une photo reduite) est doublee par interpolation : les seuils en pixels de
 * travail (longueur d'une arete, largeur d'un meneau) gardent ainsi le meme sens a toute echelle.
 */
function doubler(img: Image): Image {
  const W = img.largeur,
    H = img.hauteur,
    d = img.donnees;
  const o = new Uint8ClampedArray(W * H * 16);
  for (let y = 0; y < 2 * H; y++) {
    const fy = Math.max(0, Math.min(H - 1, (y - 0.5) / 2));
    const y0 = Math.floor(fy),
      y1 = Math.min(H - 1, y0 + 1),
      ty = fy - y0;
    for (let x = 0; x < 2 * W; x++) {
      const fx = Math.max(0, Math.min(W - 1, (x - 0.5) / 2));
      const x0 = Math.floor(fx),
        x1 = Math.min(W - 1, x0 + 1),
        tx = fx - x0;
      const a = (y0 * W + x0) * 4,
        b = (y0 * W + x1) * 4,
        c = (y1 * W + x0) * 4,
        e = (y1 * W + x1) * 4,
        j = (y * 2 * W + x) * 4;
      for (let k = 0; k < 3; k++) o[j + k] = (d[a + k]! * (1 - tx) + d[b + k]! * tx) * (1 - ty) + (d[c + k]! * (1 - tx) + d[e + k]! * tx) * ty;
      o[j + 3] = 255;
    }
  }
  return { largeur: 2 * W, hauteur: 2 * H, donnees: o };
}

function doublerMasque(vu: Uint8Array, W: number, H: number): Uint8Array {
  const o = new Uint8Array(W * H * 4);
  for (let y = 0; y < 2 * H; y++) for (let x = 0; x < 2 * W; x++) o[y * 2 * W + x] = vu[(y >> 1) * W + (x >> 1)]!;
  return o;
}

/* ------------------------------------------------------------------------------------------------
 * Les aretes droites et leurs profils
 * --------------------------------------------------------------------------------------------- */

interface Aretes {
  /** Aretes verticales fines (1 = pixel d'arete) et horizontales, apres le filtre de rectitude. */
  v: Uint8Array;
  hz: Uint8Array;
  /** Profils cumules : sv[y * l + x] = nombre de lignes < y ou la colonne x (a 1 px pres) porte une arete verticale. */
  sv: Uint16Array;
  /** sh[y * (l + 1) + x] = nombre de colonnes < x ou la ligne y (a 1 px pres) porte une arete horizontale. */
  sh: Uint16Array;
  /** Les memes cumuls sur les aretes fines (sans la tolerance de 1 px) : pour situer le sommet d'un profil. */
  svf: Uint16Array;
  shf: Uint16Array;
  /** Clarte : logarithme de la luminance (une ombre la decale sans changer les ecarts). */
  c: Float32Array;
}

function aretes(p: Plan, seuil: number, longMin: number): Aretes {
  const { l, h } = p;
  const n = l * h;
  const c = new Float32Array(n);
  const table = new Float32Array(1024);
  for (let v = 0; v < 1024; v++) table[v] = 64 * Math.log2(v / 4 + 32) - 320;
  for (let i = 0; i < n; i++) c[i] = table[Math.round(p.lum[i]! * 4)]!;
  const gx = new Float32Array(n),
    gy = new Float32Array(n);
  for (let y = 1; y < h - 1; y++)
    for (let x = 1; x < l - 1; x++) {
      const i = y * l + x;
      // Pas de gradient au bord du blanc de remplissage : ce n'est pas une arete de la facade.
      if (!p.ok[i] || !p.ok[i - 1] || !p.ok[i + 1] || !p.ok[i - l] || !p.ok[i + l] || !p.ok[i - l - 1] || !p.ok[i - l + 1] || !p.ok[i + l - 1] || !p.ok[i + l + 1]) continue;
      const a = c[i - l - 1]!,
        b = c[i - l]!,
        cc = c[i - l + 1]!,
        dd = c[i - 1]!,
        e = c[i + 1]!,
        ff = c[i + l - 1]!,
        gg = c[i + l]!,
        hh = c[i + l + 1]!;
      gx[i] = (cc + 2 * e + hh - a - 2 * dd - ff) / 4;
      gy[i] = (ff + 2 * gg + hh - a - 2 * b - cc) / 4;
    }
  const v0 = new Uint8Array(n),
    h0 = new Uint8Array(n);
  for (let y = 1; y < h - 1; y++)
    for (let x = 1; x < l - 1; x++) {
      const i = y * l + x;
      const ax = Math.abs(gx[i]!),
        ay = Math.abs(gy[i]!);
      if (ax >= seuil && ax >= 1.5 * ay && ax >= Math.abs(gx[i - 1]!) && ax > Math.abs(gx[i + 1]!)) v0[i] = 1;
      if (ay >= seuil && ay >= 1.5 * ax && ay >= Math.abs(gy[i - l]!) && ay > Math.abs(gy[i + l]!)) h0[i] = 1;
    }
  // Filtre de rectitude : une arete verticale compte si sa colonne (a 1 px pres) en porte une
  // sur longMin lignes d'affilee. Le crepi, le feuillage, la brique donnent des aretes courtes en
  // tous sens : elles tombent ici.
  const v = new Uint8Array(n),
    hz = new Uint8Array(n);
  for (let x = 1; x < l - 1; x++) {
    let debut = -1;
    for (let y = 0; y <= h; y++) {
      const i = y * l + x;
      if (y < h && (v0[i]! | v0[i - 1]! | v0[i + 1]!) !== 0) {
        if (debut < 0) debut = y;
      } else if (debut >= 0) {
        if (y - debut >= longMin) for (let yy = debut; yy < y; yy++) if (v0[yy * l + x]) v[yy * l + x] = 1;
        debut = -1;
      }
    }
  }
  for (let y = 1; y < h - 1; y++) {
    let debut = -1;
    for (let x = 0; x <= l; x++) {
      const i = y * l + x;
      if (x < l && (h0[i]! | h0[i - l]! | h0[i + l]!) !== 0) {
        if (debut < 0) debut = x;
      } else if (debut >= 0) {
        if (x - debut >= longMin) for (let xx = debut; xx < x; xx++) if (h0[y * l + xx]) hz[y * l + xx] = 1;
        debut = -1;
      }
    }
  }
  const sv = new Uint16Array((h + 1) * l),
    sh = new Uint16Array(h * (l + 1)),
    svf = new Uint16Array((h + 1) * l),
    shf = new Uint16Array(h * (l + 1));
  for (let y = 0; y < h; y++)
    for (let x = 0; x < l; x++) {
      const i = y * l + x;
      const a = (v[i]! | (x > 0 ? v[i - 1]! : 0) | (x < l - 1 ? v[i + 1]! : 0)) !== 0 ? 1 : 0;
      sv[i + l] = sv[i]! + a;
      const bb = (hz[i]! | (y > 0 ? hz[i - l]! : 0) | (y < h - 1 ? hz[i + l]! : 0)) !== 0 ? 1 : 0;
      sh[y * (l + 1) + x + 1] = sh[y * (l + 1) + x]! + bb;
      svf[i + l] = svf[i]! + v[i]!;
      shf[y * (l + 1) + x + 1] = shf[y * (l + 1) + x]! + hz[i]!;
    }
  return { v, hz, sv, sh, svf, shf, c };
}

/** Un montant possible : une colonne qui porte une arete verticale de y0 a y1 (inclus). */
interface Montant {
  x: number;
  y0: number;
  y1: number;
}

/** Les montants : les troncons du profil des aretes verticales, colonne par colonne. */
function montants(ar: Aretes, l: number, h: number, longMin: number): Montant[] {
  const res: Montant[] = [];
  const { sv, svf } = ar;
  for (let x = 1; x < l - 1; x++) {
    let debut = -1,
      trou = 0;
    for (let y = 0; y <= h; y++) {
      const on = y < h && sv[(y + 1) * l + x]! > sv[y * l + x]!;
      if (on) {
        if (debut < 0) debut = y;
        trou = 0;
      } else if (debut >= 0 && (++trou > 2 || y === h)) {
        // Un troncon s'acheve apres trois lignes sans arete (deux sont tolerees : un croisement).
        const fin = y - trou;
        if (fin - debut + 1 >= longMin) {
          // Le sommet du profil : la colonne qui porte le plus d'aretes fines sur ce troncon.
          const c = svf[(fin + 1) * l + x]! - svf[debut * l + x]!,
            g = svf[(fin + 1) * l + x - 1]! - svf[debut * l + x - 1]!,
            d = svf[(fin + 1) * l + x + 1]! - svf[debut * l + x + 1]!;
          if (c >= g && c > d) res.push({ x, y0: debut, y1: fin });
        }
        debut = -1;
        trou = 0;
      }
    }
  }
  return res;
}

/* ------------------------------------------------------------------------------------------------
 * Les cases : travees et bandes
 * --------------------------------------------------------------------------------------------- */

/** Un candidat : une case entre deux montants et deux lignes horizontales, bords sur les aretes. */
interface Case {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  /** Part de chaque cote portee par une arete : gauche, droite, haut, bas. */
  ag: number;
  ad: number;
  ah: number;
  ab: number;
  note: number;
}

interface Tailles {
  lMin: number;
  lMax: number;
  hMin: number;
  hMax: number;
  aireMin: number;
  /** Largeur a partir de laquelle une case haute et sans bas peut etre une porte. */
  lPorte: number;
}

/** Bornes du nombre de lignes par travee et du nombre de cases : le temps de calcul en depend. */
const PICS_MAX = 24,
  CASES_MAX = 90000;

function cases(ar: Aretes, ms: Montant[], l: number, h: number, t: Tailles): Case[] {
  const { sv, sh, shf } = ar;
  const res: Case[] = [];
  const parX = [...ms].sort((a, b) => a.x - b.x);
  const pics: number[] = [];
  const force: number[] = [];
  const vus = new Set<number>();
  for (let i = 0; i < parX.length; i++) {
    const a = parX[i]!;
    for (let j = i + 1; j < parX.length; j++) {
      const b = parX[j]!;
      const w = b.x - a.x;
      if (w > t.lMax) break;
      if (w < t.lMin) continue;
      const u0 = Math.max(a.y0, b.y0),
        u1 = Math.min(a.y1, b.y1);
      if (u1 - u0 + 1 < t.hMin || u1 - u0 + 1 < 0.5 * Math.min(a.y1 - a.y0 + 1, b.y1 - b.y0 + 1)) continue;
      // Profil des aretes horizontales dans la travee, de part et d'autre du recouvrement.
      const marge = Math.max(3, Math.round(0.15 * (u1 - u0)));
      const ya = Math.max(1, Math.min(a.y0, b.y0) - marge),
        yb = Math.min(h - 2, Math.max(a.y1, b.y1) + marge);
      pics.length = 0;
      force.length = 0;
      for (let y = ya; y <= yb; y++) {
        const r3 = sh[y * (l + 1) + b.x + 1]! - sh[y * (l + 1) + a.x]!;
        // Le pied des deux montants vaut ligne du bas, meme sans arete : un seuil de porte cache
        // par un buisson, un bas de porte-fenetre derriere un garde-corps.
        const pied = y === u1 + 1;
        if (r3 < 0.3 * (w + 1) && !pied) continue;
        const c = shf[y * (l + 1) + b.x + 1]! - shf[y * (l + 1) + a.x]!,
          av = shf[(y - 1) * (l + 1) + b.x + 1]! - shf[(y - 1) * (l + 1) + a.x]!,
          ap = shf[(y + 1) * (l + 1) + b.x + 1]! - shf[(y + 1) * (l + 1) + a.x]!;
        if (pied || (c >= av && c > ap)) {
          pics.push(y);
          force.push(r3 / (w + 1));
        }
      }
      if (pics.length > PICS_MAX) {
        // Une travee tres rayee (un damier, un bardage) : les lignes les mieux portees seulement,
        // pour que le nombre de cases - et le temps de calcul - reste borne.
        const garde = Array.from(pics.keys())
          .sort((i1, i2) => force[i2]! - force[i1]! || i1 - i2)
          .slice(0, PICS_MAX)
          .sort((i1, i2) => i1 - i2);
        const py = garde.map((q) => pics[q]!),
          pf = garde.map((q) => force[q]!);
        pics.length = force.length = 0;
        pics.push(...py);
        force.push(...pf);
      }
      for (let s = 0; s < pics.length; s++) {
        if (res.length >= CASES_MAX) return res;
        if (force[s]! < 0.45) continue;
        for (let q = s + 1; q < pics.length; q++) {
          const y0 = pics[s]!,
            y1 = pics[q]!;
          const hh = y1 - y0;
          if (hh < t.hMin || hh * w < t.aireMin) continue;
          if (hh > t.hMax) break;
          if (hh > 4 * w || w > 4 * hh) continue;
          const ag = (sv[y1 * l + a.x]! - sv[y0 * l + a.x]!) / hh,
            ad = (sv[y1 * l + b.x]! - sv[y0 * l + b.x]!) / hh;
          if (ag < 0.6 || ad < 0.6) continue;
          // Sans arete en bas : seulement une case haute et large, aux trois autres cotes nets.
          if (force[q]! < 0.3 && (ag < 0.8 || ad < 0.8 || force[s]! < 0.8 || hh < 1.5 * w || w < t.lPorte)) continue;
          const cle = ((a.x * 2048 + b.x) * 2048 + y0) * 2048 + y1;
          if (vus.has(cle)) continue;
          vus.add(cle);
          res.push({ x0: a.x, y0, x1: b.x, y1, ag, ad, ah: force[s]!, ab: force[q]!, note: 0 });
        }
      }
    }
  }
  return res;
}

const aire = (c: Case) => (c.x1 - c.x0) * (c.y1 - c.y0);

/** Part de la plus petite des deux cases couverte par leur intersection. */
function recouvrement(a: Case, b: Case): number {
  const ix = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0),
    iy = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
  return ix <= 0 || iy <= 0 ? 0 : (ix * iy) / Math.min(aire(a), aire(b));
}

/** Recouvrement de deux cases : intersection sur union. */
function iou(a: Case, b: Case): number {
  const ix = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0),
    iy = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
  if (ix <= 0 || iy <= 0) return 0;
  return (ix * iy) / (aire(a) + aire(b) - ix * iy);
}

/* ------------------------------------------------------------------------------------------------
 * Le contenu d'une case
 * --------------------------------------------------------------------------------------------- */

/** Image integrale : somme d'une grandeur sur [x0, x1[ x [y0, y1[ en quatre lectures. */
class Integrale {
  readonly t: Float64Array;
  readonly L: number;
  /** `binaire` : compte les valeurs non nulles ; `masque` : ne somme que la ou il vaut 1. */
  constructor(
    readonly l: number,
    readonly h: number,
    v: ArrayLike<number>,
    masque: Uint8Array | null = null,
    binaire = false,
  ) {
    const L = l + 1;
    this.L = L;
    const t = new Float64Array(L * (h + 1));
    for (let y = 0; y < h; y++) {
      let s = 0;
      const o = (y + 1) * L + 1,
        od = y * L + 1;
      for (let x = 0; x < l; x++) {
        const i = y * l + x;
        if (!masque || masque[i]) s += binaire ? (v[i] ? 1 : 0) : v[i]!;
        t[o + x] = t[od + x]! + s;
      }
    }
    this.t = t;
  }
  somme(x0: number, y0: number, x1: number, y1: number): number {
    if (x0 < 0) x0 = 0;
    if (y0 < 0) y0 = 0;
    if (x1 > this.l) x1 = this.l;
    if (y1 > this.h) y1 = this.h;
    if (x1 <= x0 || y1 <= y0) return 0;
    const t = this.t,
      L = this.L;
    return t[y1 * L + x1]! - t[y0 * L + x1]! - t[y1 * L + x0]! + t[y0 * L + x0]!;
  }
}

/** Ce qu'il faut pour juger le contenu d'une case. */
interface Contenu {
  l: number;
  h: number;
  /** Aretes verticales et horizontales fines. */
  iv: Integrale;
  ih: Integrale;
  /** Clarte ; pixels couverts. */
  ic: Integrale;
  io: Integrale;
  /** Plages unies, loin de toute arete verticale : leur nombre ; par pixel, 0 ou leur classe + 1. */
  ip: Integrale;
  uni: Uint8Array;
  /** Clarte par pixel. */
  c: Float32Array;
  ok: Uint8Array;
  /** Part de chaque classe (clarte x grain) parmi les plages unies de toute l'image. */
  global: Float32Array;
}

/** Classes de plage unie : clarte par pas de 10 (22 niveaux), grain en 3 niveaux. */
const NB = 22,
  NR = 3;
const classeUnie = (c: number, ro: number) => Math.min(NB - 1, Math.max(0, Math.floor(c / 10))) * NR + (ro < 16 ? 0 : ro < 40 ? 1 : 2);

function contenu(p: Plan, ar: Aretes, rayon: number): Contenu {
  const { l, h } = p;
  const n = l * h;
  // Rugosite en octaves, la plus faible du voisinage 3 x 3 : un crepi est rugueux partout, un
  // petit bois ou un croisement de traverses ne l'est que sur lui-meme.
  const tmp = new Float32Array(n),
    ro = new Float32Array(n);
  for (let y = 0; y < h; y++)
    for (let x = 1; x < l - 1; x++) {
      const i = y * l + x;
      tmp[i] = Math.min(p.rug[i - 1]!, p.rug[i]!, p.rug[i + 1]!);
    }
  for (let y = 1; y < h - 1; y++)
    for (let x = 0; x < l; x++) {
      const i = y * l + x;
      const r = Math.min(tmp[i - l]!, tmp[i]!, tmp[i + l]!);
      ro[i] = r > 0.002 ? Math.min(5, Math.log2(r / 0.002)) * 16 : 0;
    }
  const iv = new Integrale(l, h, ar.v);
  // Plage unie : aucune arete verticale dans le carre de cote 2 x rayon + 1 autour du pixel (les
  // joints d'une brique, les lames d'un bardage sont horizontaux : un mur reste uni). Sa classe
  // (clarte, grain) est rangee avec elle : 0 = pas unie, sinon classe + 1.
  const uni = new Uint8Array(n);
  const t = iv.t,
    L = l + 1;
  const global = new Float32Array(NB * NR);
  let nu = 0;
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - rayon),
      y1 = Math.min(h, y + rayon + 1);
    for (let x = 0; x < l; x++) {
      const i = y * l + x;
      if (!p.ok[i]) continue;
      const x0 = x - rayon < 0 ? 0 : x - rayon,
        x1 = x + rayon + 1 > l ? l : x + rayon + 1;
      if (t[y1 * L + x1]! - t[y0 * L + x1]! - t[y1 * L + x0]! + t[y0 * L + x0]! !== 0) continue;
      const cl = classeUnie(ar.c[i]!, ro[i]!);
      uni[i] = cl + 1;
      global[cl] = global[cl]! + 1;
      nu++;
    }
  }
  if (nu) for (let j = 0; j < NB * NR; j++) global[j] = global[j]! / nu;
  return { l, h, iv, ih: new Integrale(l, h, ar.hz), ic: new Integrale(l, h, ar.c, p.ok), io: new Integrale(l, h, p.ok), ip: new Integrale(l, h, uni, null, true), uni, c: ar.c, ok: p.ok, global };
}

/**
 * Les bords d'une baie s'arretent a ses coins ; une ligne de structure (colombage, bandeau,
 * corniche) file au-dela. Rend la part des prolongements des quatre cotes (un quart de la longueur,
 * de chaque bout) qui porte encore une arete : 0 = un rectangle ferme, 1 = quatre lignes qui filent.
 */
function depassement(c: Case, ar: Aretes, l: number, h: number): number {
  const w = c.x1 - c.x0,
    hh = c.y1 - c.y0;
  const dx = Math.max(4, Math.round(0.25 * w)),
    dy = Math.max(4, Math.round(0.25 * hh));
  const L = l + 1;
  let s = 0;
  const ya = Math.max(0, c.y0 - dy),
    yb = Math.min(h, c.y1 + dy);
  const xa = Math.max(0, c.x0 - dx),
    xb = Math.min(l, c.x1 + dx);
  for (const x of [c.x0, c.x1]) s += (ar.sv[(c.y0 - 2 > ya ? c.y0 - 2 : ya) * l + x]! - ar.sv[ya * l + x]! + ar.sv[yb * l + x]! - ar.sv[(c.y1 + 3 < yb ? c.y1 + 3 : yb) * l + x]!) / (2 * dy);
  for (const y of [c.y0, c.y1]) s += (ar.sh[y * L + (c.x0 - 2 > xa ? c.x0 - 2 : xa)]! - ar.sh[y * L + xa]! + ar.sh[y * L + xb]! - ar.sh[y * L + (c.x1 + 3 < xb ? c.x1 + 3 : xb)]!) / (2 * dx);
  return Math.min(1, s / 4);
}

/**
 * Note d'une case, en quelques lectures : ses bords, ce qui en fait une baie - une structure
 * interieure (meneaux, traverses, vantaux) ou un panneau plus sombre que ses alentours -, et ce
 * qui l'en eloigne - des plages unies et claires, des cotes qui filent au-dela des coins.
 */
function noter(cs: Case[], k: Contenu, ar: Aretes): void {
  for (const c of cs) {
    const w = c.x1 - c.x0,
      hh = c.y1 - c.y0;
    const x0 = c.x0 + 2,
      y0 = c.y0 + 2,
      x1 = c.x1 - 1,
      y1 = c.y1 - 1;
    const ni = k.io.somme(x0, y0, x1, y1);
    if (ni <= 0) continue;
    const g = Math.max(8, Math.min(24, Math.round(0.5 * Math.min(w, hh))));
    const na = k.io.somme(c.x0 - g, c.y0 - g, c.x1 + g + 1, c.y1 + g + 1) - k.io.somme(c.x0 - 1, c.y0 - 1, c.x1 + 2, c.y1 + 2);
    const ma = na > 0 ? (k.ic.somme(c.x0 - g, c.y0 - g, c.x1 + g + 1, c.y1 + g + 1) - k.ic.somme(c.x0 - 1, c.y0 - 1, c.x1 + 2, c.y1 + 2)) / na : 0;
    const mi = k.ic.somme(x0, y0, x1, y1) / ni;
    const struct = Math.min(1, k.iv.somme(c.x0 + 2, c.y0, c.x1 - 1, c.y1) / hh + (0.5 * k.ih.somme(c.x0, c.y0 + 2, c.x1, c.y1 - 1)) / w);
    const sombre = na > 0 ? Math.max(0, Math.min(1, (ma - mi - 5) / 25)) : 0;
    const uni = k.ip.somme(x0, y0, x1, y1) / ni;
    // Les bords : la moyenne des quatre cotes ; sans bas, la moyenne des trois autres, minoree.
    const bords = c.ab < 0.3 ? 0.85 * ((c.ag + c.ad + c.ah) / 3) : (c.ag + c.ad + c.ah + c.ab) / 4;
    c.note = bords * (0.35 + 0.65 * Math.max(struct, sombre)) * (1 - 0.25 * uni * (1 - sombre)) * (1 - 0.4 * depassement(c, ar, k.l, k.h));
  }
}

/** Tampons de `partMur`, appelee des milliers de fois. */
const TAMPON = { ha: new Float32Array(NB * NR), expl: new Float32Array(NB * NR), col: new Float32Array(64), lig: new Float32Array(64) };

/**
 * Le mur dans une case : ses plages unies qui ont la clarte et le grain de plages unies d'alentour
 * ou, a defaut, de plages unies frequentes dans toute l'image. Un panneau d'enduit entre des
 * colombages, un trumeau entre deux fenetres sont du mur ; un vitrage, meme uni, ne ressemble pas
 * au mur. Rend la part de mur, et la plus forte part de mur d'une colonne (un trumeau : la case
 * couvre deux baies) et d'une ligne (une allege). Lu sur un echantillon de pixels.
 */
function partMur(c: Case, k: Contenu): { mur: number; colonne: number; ligne: number } {
  const { ha, expl, col, lig } = TAMPON;
  ha.fill(0);
  const w = c.x1 - c.x0,
    hh = c.y1 - c.y0;
  const g = Math.max(12, Math.min(40, Math.round(0.6 * Math.min(w, hh))));
  let pa = 0,
    na = 0,
    sa = 0;
  const ex0 = Math.max(0, c.x0 - g),
    ey0 = Math.max(0, c.y0 - g),
    ex1 = Math.min(k.l - 1, c.x1 + g),
    ey1 = Math.min(k.h - 1, c.y1 + g);
  const qx = Math.max(1, Math.floor((ex1 - ex0) / 40)),
    qy = Math.max(1, Math.floor((ey1 - ey0) / 40));
  for (let y = ey0; y <= ey1; y += qy)
    for (let x = ex0; x <= ex1; x += qx) {
      if (x >= c.x0 - 1 && x <= c.x1 + 1 && y >= c.y0 - 1 && y <= c.y1 + 1) continue;
      const i = y * k.l + x;
      if (!k.ok[i]) continue;
      na++;
      sa += k.c[i]!;
      const u = k.uni[i]!;
      if (u) {
        pa++;
        ha[u - 1] = ha[u - 1]! + 1;
      }
    }
  // Une classe est du mur si elle pese un cinquieme des plages unies d'alentour, ou un douzieme
  // de celles de toute l'image (a une classe de clarte pres) - mais une plage plus sombre que les
  // alentours n'est pas du mur parce qu'elle est frequente : c'est le cas d'une facade tres vitree.
  const seuilSombre = na > 0 ? Math.floor((sa / na - 10) / 10) : 0;
  for (let b = 0; b < NB; b++)
    for (let r = 0; r < NR; r++) {
      const j = b * NR + r;
      const pres = pa >= 8 ? (ha[j]! + (b > 0 ? ha[j - NR]! : 0) + (b < NB - 1 ? ha[j + NR]! : 0)) / pa : 0;
      const loin = b >= seuilSombre ? k.global[j]! + (b > 0 ? k.global[j - NR]! : 0) + (b < NB - 1 ? k.global[j + NR]! : 0) : 0;
      expl[j] = Math.min(1, Math.max(pres / 0.2, loin / 0.08));
    }
  const pasX = Math.max(1, Math.floor(w / 24)),
    pasY = Math.max(1, Math.floor(hh / 24));
  const nx = Math.ceil((w - 3) / pasX),
    ny = Math.ceil((hh - 3) / pasY);
  if (nx <= 0 || ny <= 0) return { mur: 1, colonne: 1, ligne: 1 };
  col.fill(0);
  lig.fill(0);
  let tot = 0;
  for (let iy = 0; iy < ny; iy++)
    for (let ix = 0; ix < nx; ix++) {
      const u = k.uni[(c.y0 + 2 + iy * pasY) * k.l + c.x0 + 2 + ix * pasX]!;
      if (!u) continue;
      const e = expl[u - 1]!;
      col[ix] = col[ix]! + e;
      lig[iy] = lig[iy]! + e;
      tot += e;
    }
  let mc = 0,
    ml = 0;
  for (let ix = 0; ix < nx; ix++) mc = Math.max(mc, col[ix]! / ny);
  for (let iy = 0; iy < ny; iy++) ml = Math.max(ml, lig[iy]! / nx);
  return { mur: tot / (nx * ny), colonne: mc, ligne: ml };
}

/** Une case n'est pas du mur : peu de mur en tout, ni colonne ni ligne de mur. */
const sansMur = (m: { mur: number; colonne: number; ligne: number }) => m.mur <= 0.3 && m.colonne <= 0.8 && m.ligne <= 0.6;

/**
 * Un pan de mur traverse-t-il la case de part en part ? Un trumeau : une bande sans aucune arete
 * sur toute la hauteur, loin des bords, et de la clarte du mur qui la prolonge au-dessus et
 * au-dessous de la case. Une allege : de meme en largeur. La case couvre alors deux baies. Un
 * vitrage nu, lui, ne ressemble pas a ce qui le prolonge hors de la baie.
 */
function murTraversant(c: Case, k: Contenu): boolean {
  const w = c.x1 - c.x0,
    hh = c.y1 - c.y0;
  const large = 6,
    ecart = 12;
  const mx = Math.max(8, Math.round(0.15 * w)),
    my = Math.max(8, Math.round(0.15 * hh));
  const moy = (x0: number, y0: number, x1: number, y1: number) => {
    const n = k.io.somme(x0, y0, x1, y1);
    return n > 0 ? k.ic.somme(x0, y0, x1, y1) / n : NaN;
  };
  let debut = -1;
  for (let x = c.x0 + 3; x <= c.x1 - 2; x++) {
    const nue = x < c.x1 - 2 && k.iv.somme(x, c.y0 + 3, x + 1, c.y1 - 2) <= 0.08 * hh && k.ih.somme(x, c.y0 + 3, x + 1, c.y1 - 2) === 0;
    if (nue) {
      if (debut < 0) debut = x;
    } else {
      if (debut >= 0 && x - debut >= large && debut - c.x0 >= mx && c.x1 - x >= mx) {
        const m = moy(debut, c.y0 + 3, x, c.y1 - 2);
        if (Math.abs(m - moy(debut, c.y0 - 9, x, c.y0 - 2)) <= ecart && Math.abs(m - moy(debut, c.y1 + 3, x, c.y1 + 10)) <= ecart) return true;
      }
      debut = -1;
    }
  }
  debut = -1;
  for (let y = c.y0 + 3; y <= c.y1 - 2; y++) {
    const nue = y < c.y1 - 2 && k.ih.somme(c.x0 + 3, y, c.x1 - 2, y + 1) <= 0.08 * w && k.iv.somme(c.x0 + 3, y, c.x1 - 2, y + 1) === 0;
    if (nue) {
      if (debut < 0) debut = y;
    } else {
      if (debut >= 0 && y - debut >= large && debut - c.y0 >= my && c.y1 - y >= my) {
        const m = moy(c.x0 + 3, debut, c.x1 - 2, y);
        if (Math.abs(m - moy(c.x0 - 9, debut, c.x0 - 2, y)) <= ecart && Math.abs(m - moy(c.x1 + 3, debut, c.x1 + 10, y)) <= ecart) return true;
      }
      debut = -1;
    }
  }
  return false;
}

/* ------------------------------------------------------------------------------------------------
 * Le choix, l'alignement
 * --------------------------------------------------------------------------------------------- */

/**
 * Ce que la case `a`, contenue dans `c`, dit de `c` :
 *  - 'cadre' : `a` est en retrait de peu (un encadrement, un colombage : 8 px au plus) - `c`
 *    serait `a` et son encadrement ;
 *  - 'coin' : `a` touche un bord de `c` - `c` serait `a` et autre chose a cote ;
 *  - 'coeur' : `a` est au milieu de `c`, loin des bords - une partie de la meme baie si elle en
 *    couvre une bonne part, une baie parmi d'autres choses si elle est petite.
 */
function place(a: Case, c: Case): 'cadre' | 'coin' | 'coeur' {
  const g = a.x0 - c.x0,
    d = c.x1 - a.x1,
    ht = a.y0 - c.y0,
    b = c.y1 - a.y1;
  if (g <= 1 || d <= 1 || ht <= 1 || b <= 1) {
    const fin = Math.max(g, d) <= 8 && Math.max(ht, b) <= 8 && (g >= 2 ? 1 : 0) + (d >= 2 ? 1 : 0) + (ht >= 2 ? 1 : 0) + (b >= 2 ? 1 : 0) >= 3;
    return fin ? 'cadre' : 'coin';
  }
  return Math.max(g, d, ht, b) <= 8 ? 'cadre' : 'coeur';
}

/**
 * L'alignement : sur une facade les baies partagent linteaux et appuis (une ligne), tableaux (une
 * colonne). Une case mediocre mais alignee sur d'autres est gardee ; une case mediocre et isolee
 * est ecartee, sauf une porte : haute, large, au linteau net.
 */
function alignees(res: Case[], grand: number): Case[] {
  const tol = (v: number) => Math.max(0.012 * grand, 0.07 * v);
  return res.filter((c) => {
    const w = c.x1 - c.x0,
      hh = c.y1 - c.y0;
    let voisines = 0;
    for (const d of res) {
      if (d === c) continue;
      if (Math.abs(d.y0 - c.y0) <= tol(hh) && Math.abs(d.y1 - c.y1) <= tol(hh)) voisines++;
      if (Math.abs(d.x0 - c.x0) <= tol(w) && Math.abs(d.x1 - c.x1) <= tol(w)) voisines++;
    }
    if (c.note + 0.03 * Math.min(3, voisines) >= 0.8) return true;
    return hh >= 1.6 * w && w >= 0.04 * grand && c.ah >= 0.9;
  });
}

/**
 * Reunit les morceaux d'une meme baie restes separes : deux cases voisines et alignees (memes
 * haut et bas, ou memes cotes) que ne separe qu'un meneau ou une traverse.
 */
function reunir(res: Case[]): Case[] {
  const meneau = 5;
  let t = [...res];
  for (let encore = true; encore; ) {
    encore = false;
    boucle: for (let i = 0; i < t.length; i++)
      for (let j = i + 1; j < t.length; j++) {
        const a = t[i]!,
          b = t[j]!;
        const tx = Math.max(3, 0.05 * Math.min(a.x1 - a.x0, b.x1 - b.x0)),
          ty = Math.max(3, 0.05 * Math.min(a.y1 - a.y0, b.y1 - b.y0));
        const gx = Math.max(a.x0, b.x0) - Math.min(a.x1, b.x1),
          gy = Math.max(a.y0, b.y0) - Math.min(a.y1, b.y1);
        const cote = Math.abs(a.y0 - b.y0) <= ty && Math.abs(a.y1 - b.y1) <= ty && gx >= -2 && gx <= meneau,
          dessus = Math.abs(a.x0 - b.x0) <= tx && Math.abs(a.x1 - b.x1) <= tx && gy >= -2 && gy <= meneau;
        if (!cote && !dessus) continue;
        const g = a.x0 <= b.x0 ? a : b,
          d = a.x1 >= b.x1 ? a : b,
          ht = a.y0 <= b.y0 ? a : b,
          bs = a.y1 >= b.y1 ? a : b;
        const u: Case = { x0: g.x0, y0: ht.y0, x1: d.x1, y1: bs.y1, ag: g.ag, ad: d.ad, ah: ht.ah, ab: bs.ab, note: Math.max(a.note, b.note) };
        t = t.filter((_, q) => q !== i && q !== j);
        t.push(u);
        encore = true;
        break boucle;
      }
  }
  return t;
}

/**
 * Garde les meilleures cases sans recouvrement. A note comparable la plus grande l'emporte (une
 * fenetre plutot que ses vantaux) ; mais une case qui en contient une meilleure cede si elle en est
 * la reunion avec autre chose (deux baies et ce qui les separe, une baie et son encadrement).
 * Puis l'alignement ecarte les cases mediocres et isolees ; celles-la ne doivent pas avoir fait
 * de l'ombre a de bonnes cases : on recommence sans elles.
 */
function retenir(cs: Case[], k: Contenu, grand: number): Case[] {
  const bonnes = cs.filter((c) => c.note >= 0.55);
  const cle = new Float64Array(bonnes.length);
  bonnes.forEach((c, i) => (cle[i] = c.note * Math.pow(aire(c), 0.15)));
  // Les 60 000 mieux classees au plus : une facade en compte moins ; un damier, davantage.
  const tri = Array.from(bonnes.keys())
    .sort((a, b) => cle[b]! - cle[a]!)
    .slice(0, 60000)
    .map((i) => bonnes[i]!);
  // Rangement par position du centre, pour retrouver vite les cases contenues dans une autre.
  const pas = 32;
  const nx = Math.ceil(k.l / pas) + 1;
  const grille = new Map<number, Case[]>();
  for (const c of tri) {
    const g = Math.floor((c.y0 + c.y1) / 2 / pas) * nx + Math.floor((c.x0 + c.x1) / 2 / pas);
    const t = grille.get(g);
    if (t) t.push(c);
    else grille.set(g, [c]);
  }
  // L'examen du mur coute un echantillonnage : fait une fois par case, et compte.
  const murs = new Map<Case, boolean>();
  let essais = 0;
  const murOk = (c: Case) => {
    let v = murs.get(c);
    if (v === undefined) {
      essais++;
      v = sansMur(partMur(c, k)) && !murTraversant(c, k);
      murs.set(c, v);
    }
    return v;
  };
  const reunions = new Map<Case, boolean>();
  const reunion = (c: Case) => {
    let v = reunions.get(c);
    if (v !== undefined) return v;
    v = false;
    const ac = aire(c);
    const dedans: Case[] = [];
    for (let gy = Math.floor(c.y0 / pas); gy <= Math.floor(c.y1 / pas); gy++)
      for (let gx = Math.floor(c.x0 / pas); gx <= Math.floor(c.x1 / pas); gx++)
        for (const a of grille.get(gy * nx + gx) ?? []) if (a !== c && a.x0 >= c.x0 - 1 && a.x1 <= c.x1 + 1 && a.y0 >= c.y0 - 1 && a.y1 <= c.y1 + 1) dedans.push(a);
    for (const a of dedans) {
      if (a.note < c.note + 0.02 || aire(a) > 0.9 * ac) continue;
      const pl = place(a, c);
      if (pl !== 'cadre' && (a.note < c.note + 0.08 || aire(a) > (pl === 'coin' ? 0.7 : 0.35) * ac)) continue;
      if (!murOk(a)) continue;
      if (pl !== 'cadre') {
        // Deux vantaux, une imposte sur son vantail : des jumelles alignees que ne separe qu'un
        // meneau ou une traverse font une seule fenetre.
        const jumelle = dedans.some((b) => {
          if (b === a) return false;
          const gx = Math.max(a.x0, b.x0) - Math.min(a.x1, b.x1),
            gy = Math.max(a.y0, b.y0) - Math.min(a.y1, b.y1);
          const cote = Math.abs(a.y0 - b.y0) <= 3 && Math.abs(a.y1 - b.y1) <= 3 && gx >= -2 && gx <= 5,
            dessus = Math.abs(a.x0 - b.x0) <= 3 && Math.abs(a.x1 - b.x1) <= 3 && gy >= -2 && gy <= 5;
          return (cote || dessus) && murOk(b);
        });
        if (jumelle) continue;
      }
      v = true;
      break;
    }
    reunions.set(c, v);
    return v;
  };
  const ecartees: Case[] = [];
  let res: Case[] = [];
  for (let tour = 0; tour < 3; tour++) {
    const choix: Case[] = [];
    for (const c of tri) {
      // Ce qui est deja juge d'abord ; puis le budget de verifications : au-dela, seules les
      // cases deja jugees restent en lice (le temps de calcul reste borne sur une image chargee).
      const juge = murs.get(c);
      if (juge === false || reunions.get(c) === true || (juge === undefined && essais > 3000)) continue;
      const ac = aire(c);
      let libre = true;
      for (let i = 0; i < choix.length && libre; i++) {
        const r = choix[i]!;
        const ix = (c.x1 < r.x1 ? c.x1 : r.x1) - (c.x0 > r.x0 ? c.x0 : r.x0);
        if (ix <= 0) continue;
        const iy = (c.y1 < r.y1 ? c.y1 : r.y1) - (c.y0 > r.y0 ? c.y0 : r.y0);
        if (iy > 0 && ix * iy > 0.3 * Math.min(ac, aire(r))) libre = false;
      }
      for (let i = 0; i < ecartees.length && libre; i++) if (iou(c, ecartees[i]!) >= 0.7) libre = false;
      if (!libre || !murOk(c) || reunion(c)) continue;
      choix.push(c);
    }
    res = alignees(choix, grand);
    const perdues = choix.filter((c) => !res.includes(c));
    if (!perdues.length) break;
    ecartees.push(...perdues);
  }
  return reunir(res);
}

/* ------------------------------------------------------------------------------------------------
 * La repetition
 * --------------------------------------------------------------------------------------------- */

/** Cale chaque cote d'une case sur la ligne d'aretes la mieux portee, a 2 px pres. */
function caler(c: Case, ar: Aretes, l: number, h: number): Case {
  const L = l + 1;
  const o = { ...c };
  const hh = c.y1 - c.y0,
    w = c.x1 - c.x0;
  const vert = (x: number) => (x < 1 || x >= l - 1 ? 0 : (ar.sv[c.y1 * l + x]! - ar.sv[c.y0 * l + x]!) / hh),
    horiz = (y: number) => (y < 1 || y >= h - 1 ? 0 : (ar.sh[y * L + c.x1 + 1]! - ar.sh[y * L + c.x0]!) / (w + 1));
  o.ag = o.ad = o.ah = o.ab = -1;
  // A portee egale, la ligne la plus proche de la place prevue.
  for (const d of [0, -1, 1, -2, 2]) {
    if (vert(c.x0 + d) > o.ag + 0.05) [o.ag, o.x0] = [vert(c.x0 + d), c.x0 + d];
    if (vert(c.x1 + d) > o.ad + 0.05) [o.ad, o.x1] = [vert(c.x1 + d), c.x1 + d];
    if (horiz(c.y0 + d) > o.ah + 0.05) [o.ah, o.y0] = [horiz(c.y0 + d), c.y0 + d];
    if (horiz(c.y1 + d) > o.ab + 0.05) [o.ab, o.y1] = [horiz(c.y1 + d), c.y1 + d];
  }
  return o;
}

/**
 * La repetition : une baie retenue sert de modele pour retrouver ses semblables sur sa ligne et sur
 * sa colonne. Le modele (la clarte de la baie et d'une marge autour) glisse le long de la ligne ;
 * la ou la correlation est forte et la place libre, une baie de meme taille est ajoutee, ses cotes
 * cales sur les aretes locales - si elle en a sur ses quatre cotes et n'est pas faite de mur.
 */
function repeter(res: Case[], k: Contenu, ar: Aretes, seuil: number): Case[] {
  const sortie = [...res];
  const { l, h } = k;
  const modeles = res.filter((c) => c.note >= 0.8).sort((a, b) => b.note - a.note);
  const lignes: Case[] = [],
    colonnes: Case[] = [];
  let nb = 0;
  for (const T of modeles) {
    const w = T.x1 - T.x0,
      hh = T.y1 - T.y0;
    const tol = Math.max(3, 0.07 * Math.min(w, hh));
    // Un seul modele par ligne et par colonne de baies semblables ; douze recherches au plus.
    const semblable = (o: Case) => Math.abs(o.x1 - o.x0 - w) <= 2 * tol && Math.abs(o.y1 - o.y0 - hh) <= 2 * tol;
    const enLigne = !lignes.some((o) => semblable(o) && Math.abs(o.y0 - T.y0) <= tol && Math.abs(o.y1 - T.y1) <= tol),
      enColonne = !colonnes.some((o) => semblable(o) && Math.abs(o.x0 - T.x0) <= tol && Math.abs(o.x1 - T.x1) <= tol);
    if ((!enLigne && !enColonne) || nb >= 12) continue;
    nb++;
    // Le modele : un point tous les `pas` pixels, moyenne retiree.
    const pas = Math.max(1, Math.round(Math.max(w, hh) / 20));
    const m = Math.max(2, Math.min(8, Math.round(0.15 * Math.min(w, hh))));
    const nx = Math.floor((w + 2 * m) / pas) + 1,
      ny = Math.floor((hh + 2 * m) / pas) + 1;
    if (T.x0 - m < 0 || T.y0 - m < 0 || T.x0 - m + (nx - 1) * pas >= l || T.y0 - m + (ny - 1) * pas >= h) continue;
    const tv = new Float32Array(nx * ny);
    let tm = 0;
    for (let iy = 0; iy < ny; iy++) for (let ix = 0; ix < nx; ix++) tm += tv[iy * nx + ix] = k.c[(T.y0 - m + iy * pas) * l + T.x0 - m + ix * pas]!;
    tm /= nx * ny;
    let vt = 0;
    for (let i = 0; i < nx * ny; i++) {
      tv[i] = tv[i]! - tm;
      vt += tv[i]! * tv[i]!;
    }
    if (vt <= 0) continue;
    /** Correlation du modele avec l'image, le coin du modele pose en (ox, oy). */
    const corr = (ox: number, oy: number): number => {
      if (ox < 0 || oy < 0 || ox + (nx - 1) * pas >= l || oy + (ny - 1) * pas >= h) return -1;
      let s1 = 0,
        s2 = 0,
        st = 0;
      for (let iy = 0; iy < ny; iy++) {
        const o = (oy + iy * pas) * l + ox;
        for (let ix = 0; ix < nx; ix++) {
          const v = k.c[o + ix * pas]!;
          s1 += v;
          s2 += v * v;
          st += v * tv[iy * nx + ix]!;
        }
      }
      const vi = s2 - (s1 * s1) / (nx * ny);
      // Une plage presque unie ne ressemble a rien.
      return vi < 0.1 * vt ? 0 : st / Math.sqrt(vi * vt);
    };
    const libre = (x0: number, y0: number) => {
      const b: Case = { x0, y0, x1: x0 + w, y1: y0 + hh, ag: 0, ad: 0, ah: 0, ab: 0, note: 0 };
      return !sortie.some((r) => recouvrement(b, r) > 0.2);
    };
    const chercher = (horizontal: boolean) => {
      const fin = horizontal ? l - (nx - 1) * pas : h - (ny - 1) * pas;
      const notes = new Float32Array(Math.ceil(fin / pas) + 1).fill(-1);
      for (let i = 0, u = 0; u < fin; u += pas, i++) {
        const x0 = horizontal ? u + m : T.x0,
          y0 = horizontal ? T.y0 : u + m;
        if (!libre(x0, y0) || !k.ok[Math.min(h - 1, y0 + (hh >> 1)) * l + Math.min(l - 1, x0 + (w >> 1))]) continue;
        let best = -1;
        for (let dv = -2; dv <= 2; dv += 2) best = Math.max(best, horizontal ? corr(u, T.y0 - m + dv) : corr(T.x0 - m + dv, u));
        notes[i] = best;
      }
      // Les sommets de la correlation, du plus fort au plus faible.
      const rayon = Math.max(1, Math.round((0.6 * (horizontal ? w : hh)) / pas));
      const ordre = Array.from(notes.keys())
        .filter((i) => notes[i]! >= seuil)
        .sort((a, b) => notes[b]! - notes[a]!);
      for (const i of ordre) {
        let sommet = true;
        for (let j = Math.max(0, i - rayon); j <= Math.min(notes.length - 1, i + rayon); j++) if (notes[j]! > notes[i]!) sommet = false;
        if (!sommet) continue;
        // Au pixel pres autour du sommet.
        let bu = i * pas,
          bd = 0,
          bs = -1;
        for (let du = -pas; du <= pas; du++)
          for (let dv = -2; dv <= 2; dv++) {
            const u = i * pas + du;
            const c = horizontal ? corr(u, T.y0 - m + dv) : corr(T.x0 - m + dv, u);
            if (c > bs) {
              bs = c;
              bu = u;
              bd = dv;
            }
          }
        const x0 = horizontal ? bu + m : T.x0 + bd,
          y0 = horizontal ? T.y0 + bd : bu + m;
        if (!libre(x0, y0)) continue;
        // Calage sur les aretes locales : chaque cote va a la ligne la mieux portee a 2 px pres.
        let cale = caler({ x0, y0, x1: x0 + w, y1: y0 + hh, ag: 0, ad: 0, ah: 0, ab: 0, note: T.note * bs }, ar, l, h);
        const somme = cale.ag + cale.ad + cale.ah + cale.ab,
          mini = Math.min(cale.ag, cale.ad, cale.ah, cale.ab);
        // Quatre cotes portes ; ou, si la ressemblance est forte, trois bien portes et un tableau
        // perdu (un vitrage en plein reflet se confond avec la pierre ; un linteau, lui, est a l'ombre).
        const nets = (somme / 4 >= 0.65 && mini >= 0.35) || (bs >= 0.75 && (somme - mini) / 3 >= 0.75 && mini === Math.min(cale.ag, cale.ad));
        if (!nets) {
          // Pas d'aretes nettes : la place reste credible au croisement d'une ligne et d'une
          // colonne de baies, la ou la grille en attend une.
          const croise = res.find((r) => r !== T && (horizontal ? Math.abs(r.x0 - x0) <= tol && Math.abs(r.x1 - x0 - w) <= tol : Math.abs(r.y0 - y0) <= tol && Math.abs(r.y1 - y0 - hh) <= tol));
          if (!croise) continue;
          cale = horizontal ? { ...cale, x0: croise.x0, x1: croise.x1, y0, y1: y0 + hh } : { ...cale, y0: croise.y0, y1: croise.y1, x0, x1: x0 + w };
        }
        // Pas de mur a la place d'une baie. Pour une ressemblance forte, seule la part de mur
        // compte : un vitrage en plein reflet a par endroits la clarte de la pierre.
        const mu = partMur(cale, k);
        if (mu.mur > 0.3 || (bs < 0.75 && !sansMur(mu))) continue;
        if (!sortie.some((r) => recouvrement(cale, r) > 0.2)) sortie.push(cale);
      }
    };
    if (enLigne) {
      chercher(true);
      lignes.push(T);
    }
    if (enColonne) {
      chercher(false);
      colonnes.push(T);
    }
  }
  return sortie;
}

/* ------------------------------------------------------------------------------------------------
 * Retour a l'image d'origine
 * --------------------------------------------------------------------------------------------- */

/**
 * Recale les quatre cotes d'une boite sur l'image d'origine : a `jeu` pixels pres, la ou l'ecart
 * de luminance de part et d'autre du cote est le plus fort (ecart signe, somme le long du cote :
 * une arete franche l'emporte sur un grain).
 */
function recaler(img: Image, b: { X0: number; Y0: number; X1: number; Y1: number }, jeu: number): void {
  const W = img.largeur,
    H = img.hauteur,
    d = img.donnees;
  const lum = (x: number, y: number) => {
    const i = (Math.max(0, Math.min(H - 1, y)) * W + Math.max(0, Math.min(W - 1, x))) * 4;
    return 77 * d[i]! + 150 * d[i + 1]! + 29 * d[i + 2]!;
  };
  const meilleur = (v: number, a: number, z: number, vertical: boolean) => {
    const pas = Math.max(1, Math.floor((z - a) / 64));
    let best = Math.round(v),
      bs = -1;
    for (let u = Math.round(v) - jeu; u <= Math.round(v) + jeu; u++) {
      let s = 0;
      for (let t = Math.round(a); t <= z; t += pas) s += vertical ? lum(u, t) + lum(u + 1, t) - lum(u - 1, t) - lum(u - 2, t) : lum(t, u) + lum(t, u + 1) - lum(t, u - 1) - lum(t, u - 2);
      // A contraste egal, la position la plus proche de celle de depart.
      const n = Math.abs(s) - 0.001 * Math.abs(u - v);
      if (n > bs) {
        bs = n;
        best = u;
      }
    }
    return best;
  };
  const ya = b.Y0 + 0.15 * (b.Y1 - b.Y0),
    yz = b.Y1 - 0.15 * (b.Y1 - b.Y0),
    xa = b.X0 + 0.15 * (b.X1 - b.X0),
    xz = b.X1 - 0.15 * (b.X1 - b.X0);
  const X0 = meilleur(b.X0, ya, yz, true),
    X1 = meilleur(b.X1, ya, yz, true),
    Y0 = meilleur(b.Y0, xa, xz, false),
    Y1 = meilleur(b.Y1, xa, xz, false);
  if (X1 - X0 >= 2 && Y1 - Y0 >= 2) Object.assign(b, { X0, X1, Y0, Y1 });
}

export function detecterBaies(img: Image, vu: Uint8Array | null, pxParM: number | null): ResultatBaies {
  const W = img.largeur,
    H = img.hauteur;
  const echelleConnue = !!(pxParM && pxParM > 0);
  if (W < 16 || H < 16) return { baies: [], solTrouve: false, solPx: null, echelleConnue };
  // L'image de travail : un millier de pixels dans le grand cote. Une grande image est reduite
  // d'un facteur entier (4 a 5 cm par pixel pour une maison) ; une petite est doublee (f = 0,5).
  const petit = Math.max(W, H) <= 550;
  const f = petit ? 0.5 : Math.max(1, Math.ceil(Math.max(W, H) / 1100));
  const p = petit ? reduire(doubler(img), vu ? doublerMasque(vu, W, H) : null, 1) : reduire(img, vu, f);
  const { l, h } = p;
  const grand = Math.max(l, h);
  // Les tailles sont rapportees au grand cote : l'echelle n'est pas toujours connue.
  const ar = aretes(p, 6, Math.max(8, Math.round(grand / 64)));
  const k = contenu(p, ar, Math.max(4, Math.round(grand / 128)));
  // Sur une image tres chargee, les plus longs montants seulement : le temps de calcul reste borne.
  let ms = montants(ar, l, h, Math.max(8, Math.round(grand / 70)));
  if (ms.length > 1500) ms = ms.sort((a, b) => b.y1 - b.y0 - (a.y1 - a.y0) || a.x - b.x || a.y0 - b.y0).slice(0, 1500);
  const cs = cases(ar, ms, l, h, {
    lMin: Math.max(8, Math.round(0.02 * grand)),
    lMax: Math.round(grand / 3),
    hMin: Math.max(10, Math.round(0.03 * grand)),
    hMax: Math.round(grand / 2.2),
    aireMin: 0.001 * grand * grand,
    lPorte: 0.04 * grand,
  });
  noter(cs, k, ar);
  const choix = repeter(retenir(cs, k, grand), k, ar, 0.6);

  // Retour a l'image d'origine : chaque cote recale au pixel sur le contraste le plus net.
  const brutes = choix.map((c) => {
    const b = { X0: (c.x0 + 0.5) * f, Y0: (c.y0 + 0.5) * f, X1: (c.x1 + 0.5) * f, Y1: (c.y1 + 0.5) * f };
    if (f >= 2) recaler(img, b, Math.ceil(f / 2) + 1);
    return b;
  });
  // L'echelle : celle de l'utilisateur ; a defaut, une fenetre courante fait un metre de large.
  const largeurs = brutes.map((b) => b.X1 - b.X0).sort((a, b) => a - b);
  const s0 = pxParM && pxParM > 0 ? pxParM : largeurs.length >= 3 ? Math.max(W / 40, Math.min(W / 4, largeurs[largeurs.length >> 1]!)) : W / 12;
  // Le sol : le bas de la plus basse des baies, si c'est une porte (1,80 m de haut au moins).
  const basMax = brutes.length ? Math.max(...brutes.map((b) => b.Y1)) : H;
  const solTrouve = brutes.some((b) => (b.Y1 - b.Y0) / s0 >= 1.8 && Math.abs(b.Y1 - basMax) < 0.25 * s0);
  const sol = solTrouve ? basMax : H;
  const r2 = (v: number) => Math.round(v * 100) / 100;
  const baies: Baie[] = brutes
    .map((b) => {
      const y = Math.max(0, (sol - b.Y1) / s0),
        lw = (b.X1 - b.X0) / s0,
        lh = (b.Y1 - b.Y0) / s0;
      const type: TypeOuverture = solTrouve ? classer(y, lw, lh) : 'fenetre';
      return { type, x: r2(b.X0 / s0), y: r2(y), l: r2(lw), h: r2(lh), carreaux: 0, px: { x: b.X0, y: b.Y0, l: b.X1 - b.X0, h: b.Y1 - b.Y0 } };
    })
    .sort((a, b) => a.y - b.y || a.x - b.x);
  return { baies, solTrouve, solPx: solTrouve ? sol : null, echelleConnue };
}

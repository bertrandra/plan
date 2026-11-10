// Les baies (fenetres, portes) sur la facade redressee de facade.html : un des trois detecteurs
// independants que ../baies.ts fait voter.
//
// Methode : beaucoup de propositions, une seule note par proposition, une selection globale.
//
//   1. Image de travail : 896 pixels de cote long au plus (une fenetre y fait quelques dizaines de
//      pixels, quelle que soit la photo), gain normalise, luminance logarithmique - un ecart y est
//      un contraste, a l'ombre du porche comme au soleil. Quand l'image est reduite, la rugosite de
//      chaque case (ecart type de ses pixels d'origine) est gardee : un enduit est rugueux, une
//      vitre ou un vantail peint sont lisses.
//   2. Propositions : les chaines d'aretes verticales et horizontales (le redressement garantit
//      qu'un cadre est aligne sur les axes), puis tous les rectangles formes de deux chaines en
//      vis-a-vis et fermes par les lignes de l'autre direction (ou laisses ouverts : un bas cache
//      par un buisson). Ce generateur seul propose 99 % des ouvertures annotees du jeu
//      d'entrainement (IoU 0,5), au prix de dizaines de milliers de boites par image : tout se joue ensuite.
//   3. Note : une somme ponderee d'indices sans dimension, calcules sur une image integrale -
//      bords (appui des quatre cotes par une arete, double contour d'un dormant, trous), contenu
//      (contraste et teinte par rapport a l'anneau qui entoure la boite, aretes interieures et leur
//      symetrie, interieur uni et clair d'un panneau de mur, rugosite d'un enduit, bande de mur
//      traversante), entourage (aretes et disparite de l'anneau, baie qui continue au-dela d'un
//      montant, mur uni autour), forme (taille et proportions, en plateaux larges). Les poids
//      viennent d'une regression logistique sur le jeu d'entrainement et ses variantes
//      (demi-resolution, image assombrie), arrondis ; aucun ne depend d'une image.
//   4. Selection : pas de recouvrement ; le cadre plutot que le carreau (une boite que couvrent
//      plusieurs bonnes propositions plus petites, aux montants pres, recoit un bonus) ; un bonus
//      aux propositions alignees sur les baies deja retenues, ou de meme taille (une facade se
//      repete).
//   5. Recalage de chaque bord sur l'arete la plus nette de l'image pleine resolution, sans sortir
//      de l'image (une baie coupee par le bord garde sa position de travail).
//
// Le masque `vu` : une case n'est valide que si ses voisines sont vues (pas d'arete au bord du
// remplissage) ; le bord de l'image n'est pas du remplissage, et un masque ou tout est vu vaut une
// absence de masque.
//
// Ce qui reste fragile : le niveau d'emboitement (une imposte laissee hors de la boite, un
// colombage ou un encadrement de pierre pris dedans) ; une porte pleine dont le bas est cache et
// qu'un poteau coupe en deux ; les volets et les garde-corps, qui ont tout d'une baie ; les
// fenetres claires sur mur clair. La rugosite n'est mesuree qu'a partir d'un facteur de reduction
// de 1,5 (1344 px de cote long) : en dessous, un panneau d'enduit encadre de colombages n'est
// ecarte que s'il est uni. Le resultat depend du cadrage au pixel pres (rogner un pixel change une
// partie des baies : la note d'une image bouge de 0,07 en moyenne) ; sans echelle, la taille d'une
// baie est jugee en part du cote de l'image, et un cadrage serre perd les grandes baies.
//
// C'est une proposition : la page permet d'ajouter, recadrer, retirer une baie et d'en changer le type.

import type { Image } from '../../vision/homographie.js';
import { au } from '../../../util/tableaux.js';
import { classer } from '../classement.js';
import type { TypeOuverture } from '../../../model/typesReleve.js';

export interface Baie {
  type: TypeOuverture;
  /** En metres : depuis le bord gauche de l'image, et au-dessus du sol (ou du bas de l'image). */
  x: number;
  y: number;
  l: number;
  h: number;
  /** Nombre de vantaux ou de carreaux reconnus dans la baie (0 si elle est d'un seul tenant). */
  carreaux: number;
  /** En pixels de l'image : la boite hors tout de la menuiserie. */
  px: { x: number; y: number; l: number; h: number };
}

export interface ResultatBaies {
  baies: Baie[];
  /** Le sol a-t-il ete situe (une porte trouvee) ? Sinon, les hauteurs partent du bas de l'image. */
  solTrouve: boolean;
  /** Le sol, en pixels de l'image (y), s'il a ete situe. */
  solPx: number | null;
  /** L'echelle etait-elle connue ? Sinon elle est estimee sur la largeur des baies trouvees. */
  echelleConnue: boolean;
}

/* ------------------------------------------------------------------------------------------------
 * Image de travail
 * --------------------------------------------------------------------------------------------- */

/** Cote long de l'image de travail : assez pour un dormant de 5 cm, assez peu pour le telephone. */
const COTE = 896;

interface Travail {
  l: number;
  h: number;
  /** Pixels de l'image par pixel de travail, dans chaque sens. */
  fx: number;
  fy: number;
  /** Unite des longueurs en pixels de travail : 1 pour un cote long de 1024 pixels. */
  u: number;
  R: Float32Array;
  G: Float32Array;
  B: Float32Array;
  /** Luminance logarithmique : un ecart y est un contraste, a l'ombre comme au soleil. */
  Lw: Float32Array;
  /** 1 = case vue (et toutes ses voisines) ; null si tout est vu, avec ou sans masque. */
  V: Uint8Array | null;
  /** Rugosite relative a l'interieur de chaque case (null si l'image n'est pas assez reduite). */
  T: Float32Array | null;
}

function reduire(img: Image, vu: Uint8Array | null): Travail {
  const W = img.largeur,
    H = img.hauteur,
    d = img.donnees;
  const f = Math.max(1, Math.max(W, H) / COTE);
  const l = Math.max(1, Math.round(W / f)),
    h = Math.max(1, Math.round(H / f));
  const n = l * h;
  const R = new Float32Array(n),
    G = new Float32Array(n),
    B = new Float32Array(n),
    s1 = new Float32Array(n),
    s2 = new Float64Array(n),
    nb = new Float32Array(n);
  const col = new Int32Array(W);
  for (let x = 0; x < W; x++) col[x] = Math.min(l - 1, Math.floor((x * l) / W));
  for (let y = 0; y < H; y++) {
    const base = Math.min(h - 1, Math.floor((y * h) / H)) * l;
    let i = y * W,
      p = i * 4;
    for (let x = 0; x < W; x++, i++, p += 4) {
      if (vu && !vu[i]) continue;
      const j = base + (col[x] as number);
      const r = (d[p] as number),
        g = (d[p + 1] as number),
        b = (d[p + 2] as number);
      const lu = 0.299 * r + 0.587 * g + 0.114 * b;
      R[j] = (R[j] as number) + r;
      G[j] = (G[j] as number) + g;
      B[j] = (B[j] as number) + b;
      s1[j] = (s1[j] as number) + lu;
      s2[j] = (s2[j] as number) + lu * lu;
      nb[j] = (nb[j] as number) + 1;
    }
  }
  // Nombre de pixels de l'image par colonne et par ligne de travail : inegal si le facteur n'est
  // pas entier, et une case vue ne se juge qu'a sa propre taille.
  const parCol = new Float32Array(l),
    parLigne = new Float32Array(h);
  for (let x = 0; x < W; x++) parCol[(col[x] as number)] = (parCol[(col[x] as number)] as number) + 1;
  for (let y = 0; y < H; y++) {
    const j = Math.min(h - 1, Math.floor((y * h) / H));
    parLigne[j] = (parLigne[j] as number) + 1;
  }
  // Sous un facteur 1,5 une case n'a qu'un ou deux pixels : pas de rugosite mesurable.
  const T = f >= 1.5 ? new Float32Array(n) : null;
  const L = new Float32Array(n);
  let V: Uint8Array | null = vu ? new Uint8Array(n) : null;
  const histo = new Float64Array(256);
  for (let j = 0; j < n; j++) {
    const k = (nb[j] as number);
    // Une case est vue si la moitie au moins de ses pixels le sont.
    if (k === 0 || (vu && k < 0.5 * (parCol[j % l] as number) * (parLigne[(j - (j % l)) / l] as number))) continue;
    R[j] = (R[j] as number) / k;
    G[j] = (G[j] as number) / k;
    B[j] = (B[j] as number) / k;
    const m = (s1[j] as number) / k;
    L[j] = m;
    if (T) T[j] = Math.sqrt(Math.max(0, (s2[j] as number) / k - m * m)) / Math.max(20, m);
    if (V) V[j] = 1;
    histo[Math.min(255, Math.round(m))] = (histo[Math.min(255, Math.round(m))] as number) + 1;
  }
  // Gain : le centile 95 de la luminance ramene a 225. Une image assombrie redevient comparable.
  let total = 0;
  for (let i = 0; i < 256; i++) total += (histo[i] as number);
  let c95 = 255,
    cumul = 0;
  for (let i = 0; i < 256; i++) {
    cumul += (histo[i] as number);
    if (cumul >= 0.95 * total) {
      c95 = i;
      break;
    }
  }
  const gain = Math.max(0.7, Math.min(6, 225 / Math.max(1, c95)));
  // Le logarithme par table, au quart de niveau de gris.
  const table = new Float32Array(1021);
  for (let k = 0; k <= 1020; k++) table[k] = 100 * Math.log(1 + k / 80);
  const Lw = new Float32Array(n);
  for (let j = 0; j < n; j++) {
    R[j] = Math.min(255, (R[j] as number) * gain);
    G[j] = Math.min(255, (G[j] as number) * gain);
    B[j] = Math.min(255, (B[j] as number) * gain);
    Lw[j] = (table[Math.min(1020, Math.round(4 * (L[j] as number) * gain))] as number);
  }
  // Une case n'est valide que si ses voisines le sont : pas d'arete au bord du remplissage. Le bord
  // de l'image n'est pas du remplissage (ce qui est hors de l'image ne retire rien), et un masque
  // ou tout est vu vaut une absence de masque.
  if (V) {
    const E = new Uint8Array(n);
    let tous = true;
    for (let y = 0; y < h; y++) {
      // Au bord de l'image, le decalage vers la voisine absente est nul : la case se relit elle-meme.
      const haut = y > 0 ? -l : 0,
        bas = y < h - 1 ? l : 0;
      for (let x = 0; x < l; x++) {
        const i = y * l + x;
        const g = x > 0 ? -1 : 0,
          dr = x < l - 1 ? 1 : 0;
        if (V[i] && V[i + g] && V[i + dr] && V[i + haut] && V[i + bas] && V[i + haut + g] && V[i + haut + dr] && V[i + bas + g] && V[i + bas + dr]) E[i] = 1;
        else tous = false;
      }
    }
    V = tous ? null : E;
  }
  return { l, h, fx: W / l, fy: H / h, u: Math.max(l, h) / 1024, R, G, B, Lw, V, T };
}

/* ------------------------------------------------------------------------------------------------
 * Aretes : chaines verticales et horizontales
 * --------------------------------------------------------------------------------------------- */

/** Un segment d'arete, dans le repere de sa direction : `a` le long, `p` en travers. */
interface Seg {
  p: number;
  a0: number;
  a1: number;
  /** Force moyenne du gradient. */
  g: number;
}

/** Les aretes d'une direction : segments, et appui cumule le long de chaque ligne. */
interface Lignes {
  segs: Seg[];
  /** Nombre de lignes (en travers) et longueur de chacune. */
  np: number;
  na: number;
  /** cum[p * (na + 1) + a] : pixels d'arete (a 1 pixel pres en travers) de la ligne p avant a. */
  cum: Int32Array;
  /** La carte des chaines retenues, epaissies d'un pixel, dans le repere de l'image. */
  carte: Uint8Array;
  /** Tous les maxima du gradient, meme faibles ou isoles (leur signe). */
  brut: Int8Array;
}

/** Contraste minimal d'un maximum du gradient (centiemes de logarithme par pixel), puis d'une chaine en moyenne. */
const SEUIL_BAS = 2.5;
const SEUIL_CHAINE = 4.5;
/** Une facade de brique donne des milliers de segments courts : seuls les plus marques forment des paires. */
const SEGMENTS_MAX = 1300;

function gradients(t: Travail): { gx: Float32Array; gy: Float32Array } {
  const { l, h, Lw, V } = t;
  const gx = new Float32Array(l * h),
    gy = new Float32Array(l * h);
  for (let y = 1; y < h - 1; y++)
    for (let x = 1; x < l - 1; x++) {
      const i = y * l + x;
      if (V && !V[i]) continue;
      const a = (Lw[i - l - 1] as number),
        b = (Lw[i - l] as number),
        c = (Lw[i - l + 1] as number),
        d = (Lw[i - 1] as number),
        e = (Lw[i + 1] as number),
        f = (Lw[i + l - 1] as number),
        g = (Lw[i + l] as number),
        k = (Lw[i + l + 1] as number);
      gx[i] = (c + 2 * e + k - a - 2 * d - f) / 8;
      gy[i] = (f + 2 * g + k - a - 2 * b - c) / 8;
    }
  return { gx, gy };
}

/**
 * Les chaines d'aretes d'une direction. `g` est le gradient en travers, `go` l'autre ; une arete
 * est un maximum local de |g| en travers, plus fort que `go` (ni coin, ni oblique). Une chaine
 * suit ces maxima de proche en proche, sans changer de signe, en sautant deux pixels au plus et
 * en derivant peu : une oblique n'en fait pas.
 */
function lignes(g: Float32Array, go: Float32Array, l: number, h: number, vertical: boolean, longMin: number): Lignes {
  const na = vertical ? h : l,
    np = vertical ? l : h;
  const sa = vertical ? l : 1,
    sp = vertical ? 1 : l;
  const e = new Int8Array(l * h);
  for (let y = 1; y < h - 1; y++)
    for (let x = 1; x < l - 1; x++) {
      const i = y * l + x;
      const v = (g[i] as number),
        av = Math.abs(v);
      if (av < SEUIL_BAS || av <= Math.abs((go[i] as number))) continue;
      if (av >= Math.abs((g[i - sp] as number)) && av > Math.abs((g[i + sp] as number))) e[i] = v > 0 ? 1 : -1;
    }
  const pris = new Uint8Array(l * h);
  const carte = new Uint8Array(l * h);
  const segs: Seg[] = [];
  const ca = new Int32Array(na),
    cp = new Int32Array(na);
  for (let a = 1; a < na - 1; a++)
    for (let p = 1; p < np - 1; p++) {
      const i0 = a * sa + p * sp;
      const s = (e[i0] as number);
      if (!s || pris[i0]) continue;
      let k = 0,
        ccA = a,
        ccP = p,
        somme = 0,
        sommeP = 0,
        pMin = p,
        pMax = p;
      for (;;) {
        const i = ccA * sa + ccP * sp;
        pris[i] = 1;
        ca[k] = ccA;
        cp[k] = ccP;
        k++;
        somme += Math.abs((g[i] as number));
        sommeP += ccP;
        if (ccP < pMin) pMin = ccP;
        if (ccP > pMax) pMax = ccP;
        let suite = -1;
        for (let da = 1; da <= 3 && suite < 0 && ccA + da < na - 1; da++)
          for (let dp = 0; dp < 3; dp++) {
            // En face d'abord, puis d'un pixel de chaque cote.
            const q = ccP + (dp === 0 ? 0 : dp === 1 ? -1 : 1);
            if (q < 1 || q >= np - 1) continue;
            const j = (ccA + da) * sa + q * sp;
            if (e[j] === s && !pris[j]) {
              suite = j;
              ccA += da;
              ccP = q;
              break;
            }
          }
        if (suite < 0) break;
      }
      const long = ccA - a + 1;
      if (long < longMin || k < 0.7 * long || somme / k < SEUIL_CHAINE) continue;
      if (pMax - pMin > 2 + 0.05 * long) continue;
      segs.push({ p: sommeP / k, a0: a, a1: ccA, g: somme / k });
      // L'appui : la chaine, epaissie d'un pixel en travers, trous combles.
      for (let q = 0; q < k; q++) {
        const aFin = q + 1 < k ? (ca[q + 1] as number) : (ca[q] as number) + 1;
        for (let aa = (ca[q] as number); aa < aFin; aa++) {
          const i = aa * sa + (cp[q] as number) * sp;
          carte[i] = 1;
          carte[i - sp] = 1;
          carte[i + sp] = 1;
        }
      }
    }
  if (segs.length > SEGMENTS_MAX) {
    segs.sort((a, b) => (b.a1 - b.a0) * b.g - (a.a1 - a.a0) * a.g);
    segs.length = SEGMENTS_MAX;
  }
  const cum = new Int32Array(np * (na + 1));
  for (let p = 0; p < np; p++) {
    const b = p * (na + 1);
    for (let a = 0; a < na; a++) cum[b + a + 1] = (cum[b + a] as number) + (carte[a * sa + p * sp] as number);
  }
  return { segs, np, na, cum, carte, brut: e };
}

/** Part de la ligne de bord `b` (entre les pixels b - 1 et b) portee par une arete, de a0 a a1. */
function appui(L: Lignes, b: number, a0: number, a1: number): number {
  const q = Math.max(0, Math.min(L.np - 1, b - 1));
  a0 = Math.max(0, a0);
  a1 = Math.min(L.na, a1);
  if (a1 <= a0) return 0;
  const base = q * (L.na + 1);
  return ((L.cum[base + a1] as number) - (L.cum[base + a0] as number)) / (a1 - a0);
}

/* ------------------------------------------------------------------------------------------------
 * Propositions : les rectangles d'aretes
 * --------------------------------------------------------------------------------------------- */

/** Une boite en coordonnees de bord de l'image de travail : les pixels x0 a x1 - 1, y0 a y1 - 1. */
interface Boite {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Les propositions, sans doublon. */
class Reserve {
  private vues = new Set<number>();
  boites: Boite[] = [];
  constructor(
    private l: number,
    private h: number,
    private coteMin: number,
  ) {}
  ajouter(x0: number, y0: number, x1: number, y1: number): void {
    x0 = Math.max(0, Math.round(x0));
    y0 = Math.max(0, Math.round(y0));
    x1 = Math.min(this.l, Math.round(x1));
    y1 = Math.min(this.h, Math.round(y1));
    const w = x1 - x0,
      hh = y1 - y0;
    if (w < this.coteMin || hh < this.coteMin) return;
    if (w > 0.7 * this.l || hh > 0.8 * this.h) return;
    if (w > 5 * hh || hh > 6 * w) return;
    // A deux pixels pres, c'est la meme boite : le recalage final cherche le bord plus loin que cela.
    const cle = (((x0 >> 1) * 1024 + (y0 >> 1)) * 1024 + (x1 >> 1)) * 1024 + (y1 >> 1);
    if (this.vues.has(cle)) return;
    this.vues.add(cle);
    this.boites.push({ x0, y0, x1, y1 });
  }
}

/**
 * Rectangles d'aretes : deux segments paralleles en vis-a-vis (les cotes), fermes par les lignes
 * de l'autre direction les mieux appuyees pres de leurs extremites.
 */
function rectanglesDePaires(cotes: Lignes, fermetures: Lignes, u: number, verticaux: boolean, r: Reserve): void {
  const segs = [...cotes.segs].sort((a, b) => a.p - b.p);
  const dMin = Math.max(6, Math.round(10 * u)),
    dMax = 0.7 * cotes.np;
  const marge = Math.max(2, Math.round(3 * u));
  /** La meilleure ligne de fermeture pres de a ; -1 si aucune n'est appuyee sur plus de la moitie. */
  const ferme = (a: number, p0: number, p1: number): number => {
    let mieux = -1,
      note = 0.5;
    for (let b = a - marge; b <= a + marge + 1; b++) {
      const s = appui(fermetures, b, p0, p1);
      if (s > note) {
        note = s;
        mieux = b;
      }
    }
    return mieux;
  };
  for (let i = 0; i < segs.length; i++) {
    const A = au(segs, i);
    const lA = A.a1 - A.a0 + 1;
    for (let j = i + 1; j < segs.length; j++) {
      const B = au(segs, j);
      const d = B.p - A.p;
      if (d > dMax) break;
      if (d < dMin) continue;
      const lB = B.a1 - B.a0 + 1;
      const rec = Math.min(A.a1, B.a1) - Math.max(A.a0, B.a0) + 1;
      if (rec < 0.6 * Math.min(lA, lB) || rec < 0.45 * Math.max(lA, lB)) continue;
      if (d > 4 * Math.max(lA, lB)) continue;
      // Le maximum du gradient est le pixel d'avant le bord.
      const p0 = Math.round(A.p) + 1,
        p1 = Math.round(B.p) + 1;
      // Les lignes de fermeture pres des bouts de chaque cote ; sans aucune (un bas cache par un
      // buisson, un balcon), le bout du plus long cote.
      let d0 = ferme(A.a0, p0, p1),
        d1 = A.a0 === B.a0 ? -1 : ferme(B.a0, p0, p1);
      if (d1 === d0) d1 = -1;
      if (d0 < 0 && d1 < 0) d0 = Math.min(A.a0, B.a0);
      let f0 = ferme(A.a1 + 1, p0, p1),
        f1 = A.a1 === B.a1 ? -1 : ferme(B.a1 + 1, p0, p1);
      if (f1 === f0) f1 = -1;
      if (f0 < 0 && f1 < 0) f0 = Math.max(A.a1, B.a1) + 1;
      for (let k = 0; k < 4; k++) {
        const a0 = k & 1 ? d1 : d0,
          a1 = k & 2 ? f1 : f0;
        if (a0 < 0 || a1 < 0) continue;
        if (verticaux) r.ajouter(p0, a0, p1, a1);
        else r.ajouter(a0, p0, a1, p1);
      }
    }
  }
}

/* ------------------------------------------------------------------------------------------------
 * Indices d'une proposition
 * --------------------------------------------------------------------------------------------- */

/**
 * Une case est de l'enduit si sa rugosite relative (ecart type sur luminance, dans la case) est
 * entre ces bornes - mesure sur la maison a 1,4 cm par case : vitre claire 0,005, enduit 0,03 a
 * 0,1 (mediane 0,045) a l'ombre comme au soleil, feuillage au-dela - et si elle n'est pas sombre :
 * un verre sombre qui reflete un arbre est rugueux lui aussi, en valeur relative.
 */
const RUGUEUX_MIN = 0.03;
const RUGUEUX_MAX = 0.15;
/** Luminance logarithmique d'un gris a 50 sur 255 (apres normalisation du gain). */
const LW_SOMBRE = 125;

/** Les grandeurs sommees dans l'image integrale, une case par grandeur. */
const C_L = 0,
  C_L2 = 1,
  C_CA = 2,
  C_CB = 3,
  C_EV = 4,
  C_EH = 5,
  C_RUG = 6,
  C_VU = 7;

interface Cartes {
  t: Travail;
  /** Pixels de travail par metre, si l'echelle est connue. */
  ppm: number | null;
  V: Lignes;
  H: Lignes;
  /**
   * Image integrale de huit grandeurs entrelacees (luminance, son carre, deux ecarts de teinte,
   * aretes verticales, horizontales, cases rugueuses, cases vues) : un coin de rectangle tient
   * dans une ligne de cache, ce qui compte quand on interroge des dizaines de milliers de boites.
   * Somme sur [0, x) x [0, y) de la grandeur k en ((y * (l + 1) + x) * 8 + k).
   */
  I: Float64Array;
  /** La rugosite est-elle connue (image reduite) ? */
  rugueux: boolean;
}

function cartes(t: Travail, V: Lignes, H: Lignes, ppm: number | null): Cartes {
  const { l, h, R, G, B, Lw } = t;
  const I = new Float64Array((l + 1) * (h + 1) * 8);
  const ligne = new Float64Array(8);
  for (let y = 0; y < h; y++) {
    ligne.fill(0);
    let o = ((y + 1) * (l + 1) + 1) * 8,
      haut = (y * (l + 1) + 1) * 8;
    for (let x = 0; x < l; x++, o += 8, haut += 8) {
      const i = y * l + x;
      // Teinte : deux ecarts de couleur rapportes a la luminosite.
      const s = (R[i] as number) + (G[i] as number) + (B[i] as number) + 30;
      const lw = (Lw[i] as number);
      const ev = (V.carte[i] as number),
        eh = (H.carte[i] as number);
      ligne[C_L] = (ligne[C_L] as number) + lw;
      ligne[C_L2] = (ligne[C_L2] as number) + lw * lw;
      ligne[C_CA] = (ligne[C_CA] as number) + (300 * ((R[i] as number) - (B[i] as number))) / s;
      ligne[C_CB] = (ligne[C_CB] as number) + (300 * ((G[i] as number) - ((R[i] as number) + (B[i] as number)) / 2)) / s;
      ligne[C_EV] = (ligne[C_EV] as number) + ev;
      ligne[C_EH] = (ligne[C_EH] as number) + eh;
      // Hors des aretes : une case a cheval sur un montant est contrastee sans etre rugueuse.
      if (t.T && !ev && !eh && lw >= LW_SOMBRE) {
        const r = (t.T[i] as number);
        if (r >= RUGUEUX_MIN && r <= RUGUEUX_MAX) ligne[C_RUG] = (ligne[C_RUG] as number) + 1;
      }
      if (!t.V || t.V[i]) ligne[C_VU] = (ligne[C_VU] as number) + 1;
      I[o] = (I[haut] as number) + (ligne[0] as number);
      I[o + 1] = (I[haut + 1] as number) + (ligne[1] as number);
      I[o + 2] = (I[haut + 2] as number) + (ligne[2] as number);
      I[o + 3] = (I[haut + 3] as number) + (ligne[3] as number);
      I[o + 4] = (I[haut + 4] as number) + (ligne[4] as number);
      I[o + 5] = (I[haut + 5] as number) + (ligne[5] as number);
      I[o + 6] = (I[haut + 6] as number) + (ligne[6] as number);
      I[o + 7] = (I[haut + 7] as number) + (ligne[7] as number);
    }
  }
  return { t, ppm, V, H, I, rugueux: !!t.T };
}

/** Les huit sommes d'un rectangle, dans `s`. */
function sommes(c: Cartes, x0: number, y0: number, x1: number, y1: number, s: Float64Array): void {
  const L1 = c.t.l + 1,
    I = c.I;
  const a = (y1 * L1 + x1) * 8,
    b = (y0 * L1 + x1) * 8,
    d = (y1 * L1 + x0) * 8,
    e = (y0 * L1 + x0) * 8;
  for (let k = 0; k < 8; k++) s[k] = (I[a + k] as number) - (I[b + k] as number) - (I[d + k] as number) + (I[e + k] as number);
}
/** La somme d'une seule grandeur. */
function somme(c: Cartes, k: number, x0: number, y0: number, x1: number, y1: number): number {
  const L1 = c.t.l + 1,
    I = c.I;
  return (I[(y1 * L1 + x1) * 8 + k] as number) - (I[(y0 * L1 + x1) * 8 + k] as number) - (I[(y1 * L1 + x0) * 8 + k] as number) + (I[(y0 * L1 + x0) * 8 + k] as number);
}

/** Les indices d'une proposition : bords, contenu, entourage, forme. */
interface Indices {
  /** Appui des cotes par une arete (0 a 1) : la moyenne, le plus faible. */
  sMoy: number;
  sMin: number;
  /** L'anneau (ce qui touche la boite) : luminance, ecart type, ecart entre ses quatre bandes, densite d'aretes. */
  mAnn: number;
  sdAnn: number;
  ecAnn: number;
  eAnn: number;
  /** Contraste entre l'anneau et l'interieur (positif : interieur plus sombre), ecart de teinte. */
  dL: number;
  dC: number;
  /** L'interieur : ecart type de la luminance, densite d'aretes horizontales, part de cases rugueuses (-1 si inconnue). */
  sdIn: number;
  ehIn: number;
  rugIn: number;
  /**
   * Plus loin, au-dela de ce que serait un montant : nombre de cotes ou la baie continue (meme
   * contenu qu'a l'interieur : un autre vantail), nombre de cotes ou c'est uni (du mur).
   */
  suite: number;
  uni: number;
  /** Forme : log(hauteur / largeur) ; taille : log du cote moyen (en pixels normalises). */
  asp: number;
  tail: number;
  /** Part de pixels vus. */
  vu: number;
  /** Double contour : arete parallele juste a l'interieur (proche, puis plus loin), juste a l'exterieur. */
  dblP: number;
  dblL: number;
  extP: number;
  extL: number;
  /** Symetrie gauche-droite des aretes verticales interieures, et leur masse. */
  sym: number;
  vIn: number;
  /** Plus longue bande traversante (lignes ou colonnes) pareille a l'anneau, en part du cote. */
  murIn: number;
  /** Plus long trou sans la moindre arete le long d'un cote, en part du cote : le pire, le deuxieme. */
  trou1: number;
  trou2: number;
}

const TAMPON = new Float64Array(8);

/** Les indices a peu de frais (image integrale) ; contours et details restent a zero. */
function caracteriser(c: Cartes, b: Boite, sG: number, sD: number, sH: number, sB: number): Indices {
  const { t } = c;
  const { l, h } = t;
  const s = TAMPON;
  const { x0, y0, x1, y1 } = b;
  const w = x1 - x0,
    hh = y1 - y0,
    aire = w * hh;
  // L'anneau : quatre bandes au-dela d'un pixel de garde.
  const ep = Math.max(3, Math.round(0.15 * Math.min(w, hh)));
  let nA = 0,
    sA = 0,
    caA = 0,
    cbA = 0,
    eA = 0,
    mMin = Infinity,
    mMax = -Infinity,
    sdA = 0,
    nBandes = 0;
  for (let k = 0; k < 4; k++) {
    const X0 = Math.max(0, k === 0 ? x0 - 1 - ep : k === 1 ? x1 + 1 : x0),
      X1 = Math.min(l, k === 0 ? x0 - 1 : k === 1 ? x1 + 1 + ep : x1),
      Y0 = Math.max(0, k === 2 ? y0 - 1 - ep : k === 3 ? y1 + 1 : y0),
      Y1 = Math.min(h, k === 2 ? y0 - 1 : k === 3 ? y1 + 1 + ep : y1);
    if (X1 - X0 < 2 || Y1 - Y0 < 2) continue;
    const n = (X1 - X0) * (Y1 - Y0);
    sommes(c, X0, Y0, X1, Y1, s);
    if ((s[C_VU] as number) < 0.8 * n) continue;
    const m = (s[C_L] as number) / n;
    nA += n;
    sA += (s[C_L] as number);
    caA += (s[C_CA] as number);
    cbA += (s[C_CB] as number);
    eA += (s[C_EV] as number) + (s[C_EH] as number);
    if (m < mMin) mMin = m;
    if (m > mMax) mMax = m;
    sdA += Math.sqrt(Math.max(0, (s[C_L2] as number) / n - m * m));
    nBandes++;
  }
  sommes(c, x0, y0, x1, y1, s);
  const mIn = (s[C_L] as number) / aire;
  const sdIn = Math.sqrt(Math.max(0, (s[C_L2] as number) / aire - mIn * mIn));
  const caIn = (s[C_CA] as number) / aire,
    cbIn = (s[C_CB] as number) / aire,
    rugIn = c.rugueux ? (s[C_RUG] as number) / aire : -1,
    vu = (s[C_VU] as number) / aire;
  // Plus loin, au-dela de ce que serait un montant : le meme contenu (la baie continue, la boite
  // n'en est qu'une partie), ou une bande unie (du mur).
  const saut = Math.max(3, Math.round(0.12 * Math.min(w, hh))),
    large = Math.max(4, Math.round(0.3 * Math.min(w, hh)));
  const rx = Math.round(0.1 * w),
    ry = Math.round(0.1 * hh);
  let suite = 0,
    uni = 0;
  for (let k = 0; k < 4; k++) {
    const X0 = Math.max(0, k === 0 ? x0 - saut - large : k === 1 ? x1 + saut : x0 + rx),
      X1 = Math.min(l, k === 0 ? x0 - saut : k === 1 ? x1 + saut + large : x1 - rx),
      Y0 = Math.max(0, k === 2 ? y0 - saut - large : k === 3 ? y1 + saut : y0 + ry),
      Y1 = Math.min(h, k === 2 ? y0 - saut : k === 3 ? y1 + saut + large : y1 - ry);
    if (X1 - X0 < 2 || Y1 - Y0 < 2) continue;
    const n = (X1 - X0) * (Y1 - Y0);
    sommes(c, X0, Y0, X1, Y1, s);
    if ((s[C_VU] as number) < 0.8 * n) continue;
    const m = (s[C_L] as number) / n;
    const sd = Math.sqrt(Math.max(0, (s[C_L2] as number) / n - m * m));
    if (sd <= 10) uni++;
    else if (sdIn >= 15 && sd >= 0.6 * sdIn && Math.abs(m - mIn) <= 10 + 0.5 * sdIn) suite++;
  }
  const mAnn = nA ? sA / nA : mIn;
  return {
    sMoy: (sG + sD + sH + sB) / 4,
    sMin: Math.min(sG, sD, sH, sB),
    mAnn,
    sdAnn: nBandes ? sdA / nBandes : 0,
    ecAnn: nBandes ? mMax - mMin : 0,
    eAnn: nA ? eA / nA : 0,
    dL: mAnn - mIn,
    dC: nA ? Math.hypot(caIn - caA / nA, cbIn - cbA / nA) : 0,
    sdIn,
    ehIn: somme(c, C_EH, x0, y0 + 2, x1, y1 - 2) / aire,
    rugIn,
    suite,
    uni,
    asp: Math.log(hh / w),
    // Echelle connue : en metres, ramenes a l'echelle courante d'une image de travail (65 px/m).
    tail: Math.log(c.ppm ? (Math.sqrt(aire) / c.ppm) * 65 : Math.sqrt(aire) / t.u),
    vu,
    dblP: 0,
    dblL: 0,
    extP: 0,
    extL: 0,
    sym: 0,
    vIn: 0,
    murIn: 0,
    trou1: 0,
    trou2: 0,
  };
}

/** Les contours paralleles (un dormant fait un double contour) et la symetrie des aretes interieures. */
function contourner(c: Cartes, b: Boite, ind: Indices): void {
  const { V, H } = c;
  const { x0, y0, x1, y1 } = b;
  const w = x1 - x0,
    hh = y1 - y0;
  // L'appui est epaissi d'un pixel de part et d'autre : une ligne sur trois voit toutes les aretes,
  // et la premiere (a 4 pixels) ne voit pas celle du cote lui-meme.
  const nP = Math.max(1, Math.round((0.07 * Math.min(w, hh)) / 3)),
    nL = Math.max(1, Math.round((0.13 * Math.min(w, hh)) / 3));
  const meilleur = (L: Lignes, b0: number, pas: number, a0: number, a1: number, k0: number, n: number): number => {
    let m = 0;
    for (let k = k0; k < k0 + n; k++) m = Math.max(m, appui(L, b0 + pas * (4 + 3 * k), a0, a1));
    return m;
  };
  const contour = (pas: number, k0: number, n: number): number =>
    (meilleur(V, x0, pas, y0, y1, k0, n) + meilleur(V, x1, -pas, y0, y1, k0, n) + meilleur(H, y0, pas, x0, x1, k0, n) + meilleur(H, y1, -pas, x0, x1, k0, n)) / 4;
  ind.dblP = contour(1, 0, nP);
  ind.dblL = contour(1, nP, nL);
  ind.extP = contour(-1, 0, nP);
  ind.extL = contour(-1, nP, nL);
  // Le profil des aretes verticales, colonne par colonne, compare a son miroir.
  let mi = 0,
    ma = 0;
  const H1 = c.t.h + 1;
  const pas = w > 80 ? 2 : 1;
  for (let k = 2; k < w / 2; k += pas) {
    const a = (V.cum[(x0 + k) * H1 + y1] as number) - (V.cum[(x0 + k) * H1 + y0] as number),
      bb = (V.cum[(x1 - 1 - k) * H1 + y1] as number) - (V.cum[(x1 - 1 - k) * H1 + y0] as number);
    mi += Math.min(a, bb);
    ma += Math.max(a, bb);
  }
  ind.sym = ma ? mi / ma : 0;
  ind.vIn = (ma * pas) / (w * hh);
}

/** Les indices couteux (un parcours des lignes et des colonnes), pour les propositions encore en lice. */
function detailler(c: Cartes, b: Boite, ind: Indices): void {
  const { t, V, H } = c;
  const l = t.l;
  const { x0, y0, x1, y1 } = b;
  const w = x1 - x0,
    hh = y1 - y0;
  // Une bande traversante pareille a l'anneau (meme luminance, aussi unie) : du mur dans la boite,
  // deux fenetres prises d'un seul tenant.
  const mA = ind.mAnn;
  const tolSd = Math.max(6, 1.3 * ind.sdAnn);
  let serie = 0,
    murH = 0;
  for (let y = y0 + 1; y < y1 - 1; y++) {
    const k = w - 2;
    const m = somme(c, C_L, x0 + 1, y, x1 - 1, y + 1) / k;
    if (Math.abs(m - mA) <= 8 && Math.sqrt(Math.max(0, somme(c, C_L2, x0 + 1, y, x1 - 1, y + 1) / k - m * m)) <= tolSd) {
      serie++;
      if (serie > murH) murH = serie;
    } else serie = 0;
  }
  serie = 0;
  let murV = 0;
  for (let x = x0 + 1; x < x1 - 1; x++) {
    const k = hh - 2;
    const m = somme(c, C_L, x, y0 + 1, x + 1, y1 - 1) / k;
    if (Math.abs(m - mA) <= 8 && Math.sqrt(Math.max(0, somme(c, C_L2, x, y0 + 1, x + 1, y1 - 1) / k - m * m)) <= tolSd) {
      serie++;
      if (serie > murV) murV = serie;
    } else serie = 0;
  }
  ind.murIn = Math.max(murH / hh, murV / w);
  // Les trous : le long de chaque cote, a un pixel pres, la plus longue suite sans maximum du gradient.
  const trou = (L: Lignes, bb: number, a0: number, a1: number, vertical: boolean): number => {
    const q = Math.max(1, Math.min(L.np - 2, bb - 1));
    const pas = vertical ? 1 : l;
    let suite = 0,
      pire = 0;
    for (let a = Math.max(0, a0); a < Math.min(L.na, a1); a++) {
      const i = vertical ? a * l + q : q * l + a;
      if (L.brut[i] || L.brut[i - pas] || L.brut[i + pas]) suite = 0;
      else if (++suite > pire) pire = suite;
    }
    return pire / Math.max(1, a1 - a0);
  };
  const tr = [trou(V, x0, y0, y1, true), trou(V, x1, y0, y1, true), trou(H, y0, x0, x1, false), trou(H, y1, x0, x1, false)].sort((p, q) => q - p);
  ind.trou1 = (tr[0] as number);
  ind.trou2 = (tr[1] as number);
}

/* ------------------------------------------------------------------------------------------------
 * Note d'une proposition
 * --------------------------------------------------------------------------------------------- */

const borne = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, v));

/*
 * La note est une somme ponderee des indices (positive : plutot une baie), en trois temps pour ne
 * calculer les indices couteux que si la proposition peut encore passer. Les poids viennent d'une
 * regression logistique (propositions a IoU >= 0,7 d'une ouverture annotee contre propositions a
 * IoU < 0,3, negatifs difficiles surtout), sur le jeu d'entrainement et ses variantes a
 * demi-resolution et assombries. Trois ont ete adoucis a la main, mesure a l'appui : la baie qui
 * continue (0,15 par cote au lieu de 0,3 : les deux pans d'une baie vitree se continuent l'un
 * l'autre), le plateau des petites tailles et celui des formes larges (l'echelle d'une autre
 * facade n'est pas celle du jeu).
 */
function noteBase(i: Indices): number {
  if (i.vu < 0.9) return -99;
  // Plat : un interieur uni et pas plus sombre que ce qui l'entoure - un panneau de mur.
  const plat = borne(1 - i.sdIn / 12, 0, 1) * borne((8 - i.dL) / 16, 0, 1);
  return (
    -6.57 +
    // Un cote peut manquer (un bas cache) : les trois autres comptent alors, a peine moins.
    7.07 * Math.max(i.sMoy, (4 * i.sMoy - i.sMin) / 3 - 0.12) -
    4.29 * i.eAnn -
    6.17 * plat -
    6.35 * Math.max(0, i.rugIn) -
    0.15 * i.suite +
    0.34 * i.uni -
    1.94 * Math.min(i.ehIn, 0.4) +
    0.0188 * borne(i.dL, 0, 40) +
    0.0177 * borne(-i.dL, 0, 40) +
    0.0866 * Math.min(i.dC, 30) +
    0.0492 * Math.min(i.sdIn, 40) -
    0.0205 * Math.min(i.ecAnn, 60) +
    // Taille : un plateau de 40 a 150 pixels normalises de cote moyen (0,6 a 2,3 m).
    8 * Math.min(0, i.tail - 3.7) -
    6.27 * Math.max(0, i.tail - 5) +
    // Forme : un plateau de 1,35 fois plus large que haut a 2,7 fois plus haut que large.
    4 * Math.min(0, i.asp + 0.3) -
    5.26 * Math.max(0, i.asp - 1)
  );
}
function noteContours(i: Indices): number {
  // Vide : pas d'arete verticale a l'interieur ; c'est un panneau de mur s'il n'est pas plus sombre que ce qui l'entoure.
  const vide = Math.max(0, 1 - i.vIn / 0.08);
  return 1.04 * i.dblP + 0.62 * i.dblL + 1.84 * i.extP + 0.62 * i.extL + 1.02 * i.sym + 0.66 * Math.min(i.vIn, 0.3) - 1.37 * vide - 1.91 * vide * borne((8 - i.dL) / 16, 0, 1);
}
function noteDetails(i: Indices): number {
  return -3 * Math.max(0, i.murIn - 0.12) - 2.39 * Math.min(i.trou1, 0.5) - 3.27 * Math.min(i.trou2, 0.4);
}
/** Le plus que les contours ajoutent a une note, en pratique (les details ne font que retirer). */
const POTENTIEL_CONTOURS = 3.8;

/* ------------------------------------------------------------------------------------------------
 * Selection
 * --------------------------------------------------------------------------------------------- */

interface Candidat extends Boite {
  note: number;
  /** Ce que la selection ajoute a la note : composition, alignement. */
  bonus: number;
  /** Nombre de parties (vantaux, carreaux) reconnues dans la boite. */
  parties: number;
  ind: Indices;
}

const aireB = (b: Boite): number => (b.x1 - b.x0) * (b.y1 - b.y0);
function interB(a: Boite, b: Boite): number {
  const w = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0),
    h = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
  return w > 0 && h > 0 ? w * h : 0;
}

/** Note minimale d'une proposition retenue ; les bonus peuvent en repecher une jusqu'a MARGE en dessous. */
const SEUIL = 0.6;
const MARGE = 1.5;
/** Ce que le bonus d'alignement ajoute en moyenne a une vraie baie : le seuil final en tient compte. */
const SURSEUIL = 0.4;
/** Nombre de propositions dont on calcule les indices couteux, puis que la selection regarde. */
const DETAILS_MAX = 1500;
const RESERVE_MAX = 800;
/** Ce que gagne une boite couverte par ses parties : assez pour passer devant elles. */
const BONUS_COMPOSITION = 1.5;

/** Deux boites se genent : elles se recouvrent trop, ou l'une est pour l'essentiel dans l'autre. */
function genent(a: Boite, b: Boite): boolean {
  const i = interB(a, b);
  if (!i) return false;
  const aa = aireB(a),
    ab = aireB(b);
  return i / (aa + ab - i) > 0.15 || i / aa > 0.5 || i / ab > 0.5;
}

/** Les meilleures propositions qui ne se genent pas, par note decroissante. */
function glouton(tries: Candidat[], seuil: number): Candidat[] {
  const pris: Candidat[] = [];
  for (const c of tries) {
    if (c.note + c.bonus < seuil) continue;
    if (!pris.some((p) => genent(c, p))) pris.push(c);
  }
  return pris;
}

/**
 * Part d'une boite couverte par des parties (vantaux, carreaux), chacune etendue de `marge` : les
 * montants et le dormant qui les separent ne comptent pas comme des manques, un trumeau si.
 */
function couverture(c: Boite, parties: Boite[], marge: number): number {
  const N = 16;
  const grille = new Uint8Array(N * N);
  const w = c.x1 - c.x0,
    h = c.y1 - c.y0;
  for (const q of parties) {
    const i0 = Math.max(0, Math.ceil(((q.x0 - marge - c.x0) / w) * N - 0.5)),
      i1 = Math.min(N - 1, Math.floor(((q.x1 + marge - c.x0) / w) * N - 0.5)),
      j0 = Math.max(0, Math.ceil(((q.y0 - marge - c.y0) / h) * N - 0.5)),
      j1 = Math.min(N - 1, Math.floor(((q.y1 + marge - c.y0) / h) * N - 0.5));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) grille[j * N + i] = 1;
  }
  let n = 0;
  for (let k = 0; k < N * N; k++) n += (grille[k] as number);
  return n / (N * N);
}

/**
 * La selection globale : pas de recouvrement ; le cadre plutot que ses carreaux (une boite faite de
 * bonnes parties l'emporte sur elles) ; un bonus aux propositions alignees sur les baies deja
 * retenues ou de meme taille qu'elles (une facade se repete).
 */
function selectionner(cands: Candidat[]): Candidat[] {
  const reserve = cands
    .filter((c) => c.note >= SEUIL - MARGE)
    .sort((a, b) => b.note - a.note)
    .slice(0, RESERVE_MAX);
  // 1. Composition : une boite dont l'interieur est couvert, aux montants pres, par plusieurs
  // bonnes propositions nettement plus petites qu'elle.
  const bons = reserve.filter((c) => c.note >= SEUIL);
  const parties: Candidat[] = [];
  for (const c of reserve) {
    const aire = aireB(c);
    parties.length = 0;
    let somme = 0;
    for (const q of bons) {
      if (q.x0 < c.x0 - 1 || q.x1 > c.x1 + 1 || q.y0 < c.y0 - 1 || q.y1 > c.y1 + 1 || aireB(q) > 0.6 * aire) continue;
      parties.push(q);
      somme += aireB(q);
    }
    if (parties.length < 2 || somme < 0.8 * aire) continue;
    const marge = Math.max(1.5, 0.04 * Math.min(c.x1 - c.x0, c.y1 - c.y0));
    c.bonus = BONUS_COMPOSITION * borne((couverture(c, parties, marge) - 0.92) / 0.07, 0, 1);
    // Les parties qui ne se touchent pas : les vantaux, ou les carreaux.
    if (c.bonus > 0) c.parties = glouton(parties, -Infinity).length;
  }
  reserve.sort((a, b) => b.note + b.bonus - (a.note + a.bonus));
  // 2. Alignement et repetition, par rapport a une premiere selection : meme rangee (haut et bas),
  // meme colonne (gauche et droite), meme taille.
  const provisoire = glouton(reserve, SEUIL);
  for (const c of reserve) {
    const w = c.x1 - c.x0,
      h = c.y1 - c.y0;
    const tx = Math.max(2, 0.05 * w),
      ty = Math.max(2, 0.05 * h);
    let rangee = 0,
      colonne = 0,
      taille = 0;
    for (const p of provisoire) {
      if (p === c || interB(p, c) > 0) continue;
      if (Math.abs(p.y0 - c.y0) <= ty && Math.abs(p.y1 - c.y1) <= ty) rangee++;
      if (Math.abs(p.x0 - c.x0) <= tx && Math.abs(p.x1 - c.x1) <= tx) colonne++;
      if (Math.abs(p.x1 - p.x0 - w) <= 1.6 * tx && Math.abs(p.y1 - p.y0 - h) <= 1.6 * ty) taille++;
    }
    c.bonus += 0.35 * Math.min(2, rangee) + 0.25 * Math.min(2, colonne) + 0.15 * Math.min(3, taille);
  }
  reserve.sort((a, b) => b.note + b.bonus - (a.note + a.bonus));
  return glouton(reserve, SEUIL + SURSEUIL);
}

/* ------------------------------------------------------------------------------------------------
 * Recalage des bords a la pleine resolution
 * --------------------------------------------------------------------------------------------- */

function recaler(img: Image, t: Travail, b: Boite): Boite {
  const W = img.largeur,
    H = img.hauteur,
    d = img.donnees;
  const lum = (x: number, y: number): number => {
    const xi = Math.max(0, Math.min(W - 1, x)),
      yi = Math.max(0, Math.min(H - 1, y));
    const i = (yi * W + xi) * 4;
    return 0.299 * (d[i] as number) + 0.587 * (d[i + 1] as number) + 0.114 * (d[i + 2] as number);
  };
  /** Le bord le plus net autour de la coordonnee de travail `v`, le long de [a, bb] (pixels image). */
  const bord = (v: number, f: number, a: number, bb: number, vertical: boolean): number => {
    // L'arete de travail est a un pixel pres, avant le bord : on cherche d'un pixel et demi de part
    // et d'autre, sans sortir de l'image. Sans le moindre contraste (une baie coupee par le bord de
    // l'image, un cadre sature), la position de travail reste : la recherche rendait sinon sa
    // premiere position, a gauche ou au-dessus de l'image.
    const centre = (v - 0.75) * f,
      rayon = 1.5 * f + 1;
    const pas = Math.max(1, Math.floor((bb - a) / 80));
    const max = vertical ? W : H;
    let mieux = borne(Math.round(v * f), 0, max),
      note = 0;
    for (let p = Math.max(0, Math.round(centre - rayon)); p <= Math.min(max, Math.round(centre + rayon)); p++) {
      let s = 0;
      for (let w = Math.round(a); w <= bb; w += pas) s += vertical ? lum(p - 1, w) + lum(p - 2, w) - lum(p, w) - lum(p + 1, w) : lum(w, p - 1) + lum(w, p - 2) - lum(w, p) - lum(w, p + 1);
      if (Math.abs(s) > note) {
        note = Math.abs(s);
        mieux = p;
      }
    }
    return mieux;
  };
  const ya = (b.y0 + 0.15 * (b.y1 - b.y0)) * t.fy,
    yb = (b.y1 - 0.15 * (b.y1 - b.y0)) * t.fy,
    xa = (b.x0 + 0.15 * (b.x1 - b.x0)) * t.fx,
    xb = (b.x1 - 0.15 * (b.x1 - b.x0)) * t.fx;
  return { x0: bord(b.x0, t.fx, ya, yb, true), x1: bord(b.x1, t.fx, ya, yb, true), y0: bord(b.y0, t.fy, xa, xb, false), y1: bord(b.y1, t.fy, xa, xb, false) };
}

/* ------------------------------------------------------------------------------------------------
 * Le detecteur
 * --------------------------------------------------------------------------------------------- */

/** Les baies retenues, en coordonnees de travail, et l'image de travail. */
function analyser(img: Image, vu: Uint8Array | null, pxParM: number | null): { t: Travail; choisis: Candidat[] } {
  const t = reduire(img, vu);
  if (t.l < 16 || t.h < 16) return { t, choisis: [] };
  const { gx, gy } = gradients(t);
  const longMin = Math.max(5, Math.round(8 * t.u));
  const V = lignes(gx, gy, t.l, t.h, true, longMin);
  const H = lignes(gy, gx, t.l, t.h, false, longMin);
  const r = new Reserve(t.l, t.h, Math.max(6, Math.round(10 * t.u)));
  rectanglesDePaires(V, H, t.u, true, r);
  rectanglesDePaires(H, V, t.u, false, r);
  const c = cartes(t, V, H, pxParM && pxParM > 0 ? pxParM / t.fx : null);
  let cands: Candidat[] = [];
  const plancher = SEUIL - MARGE;
  for (const b of r.boites) {
    // Tri a peu de frais : une baie a trois cotes au moins appuyes par une arete.
    const sG = appui(V, b.x0, b.y0, b.y1),
      sD = appui(V, b.x1, b.y0, b.y1),
      sH = appui(H, b.y0, b.x0, b.x1),
      sB = appui(H, b.y1, b.x0, b.x1);
    if (sG + sD + sH + sB - Math.min(sG, sD, sH, sB) < 2.1) continue;
    const ind = caracteriser(c, b, sG, sD, sH, sB);
    let note = noteBase(ind);
    if (note + POTENTIEL_CONTOURS < plancher) continue;
    contourner(c, b, ind);
    note += noteContours(ind);
    if (note < plancher) continue;
    cands.push({ x0: b.x0, y0: b.y0, x1: b.x1, y1: b.y1, ind, note, bonus: 0, parties: 0 });
  }
  // Les details ne font que retirer : on les calcule par note decroissante, et pas au-dela de ce
  // que la selection peut regarder.
  cands.sort((a, b) => b.note - a.note);
  if (cands.length > DETAILS_MAX) cands.length = DETAILS_MAX;
  for (const k of cands) {
    detailler(c, k, k.ind);
    k.note += noteDetails(k.ind);
  }
  cands = cands.filter((k) => k.note >= plancher);
  return { t, choisis: selectionner(cands) };
}

export function detecterBaies(img: Image, vu: Uint8Array | null, pxParM: number | null): ResultatBaies {
  const W = img.largeur,
    H = img.hauteur;
  const echelleConnue = !!(pxParM && pxParM > 0);
  const { t, choisis } = analyser(img, vu, pxParM);
  const brutes = choisis.map((c) => ({ ...recaler(img, t, c), parties: c.parties })).filter((b) => b.x1 - b.x0 >= 2 && b.y1 - b.y0 >= 2);
  // Sans echelle : la largeur mediane des baies trouvees vaut a peu pres un metre (0,9 a 1,2 m sur
  // la maison comme sur les immeubles du jeu) ; a defaut de baies, 12 m dans la largeur de l'image.
  let s0 = echelleConnue ? (pxParM as number) : W / 12;
  if (!echelleConnue && brutes.length >= 3) {
    const largeurs = brutes.map((b) => b.x1 - b.x0).sort((a, b) => a - b);
    s0 = borne((largeurs[Math.floor(largeurs.length / 2)] as number) / 1.05, W / 40, W / 4);
  }
  // Le sol : le bas de la plus basse des baies, si c'est une porte (1,80 m de haut au moins).
  const portes = brutes.filter((b) => (b.y1 - b.y0) / s0 >= 1.8);
  const solY = portes.length ? Math.max(...brutes.map((b) => b.y1)) : null;
  const solTrouve = solY !== null && portes.some((p) => Math.abs(p.y1 - solY) < 0.25 * s0);
  const sol = solTrouve ? (solY as number) : H;
  const cm = (v: number): number => Math.round(v * 100) / 100;
  const baies: Baie[] = brutes
    .map((b) => {
      const y = Math.max(0, (sol - b.y1) / s0),
        lw = (b.x1 - b.x0) / s0,
        lh = (b.y1 - b.y0) / s0;
      const type: TypeOuverture = solTrouve ? classer(y, lw, lh) : 'fenetre';
      return { type, x: cm(b.x0 / s0), y: cm(y), l: cm(lw), h: cm(lh), carreaux: b.parties, px: { x: b.x0, y: b.y0, l: b.x1 - b.x0, h: b.y1 - b.y0 } };
    })
    .sort((a, b) => a.y - b.y || a.x - b.x);
  return { baies, solTrouve, solPx: solTrouve ? sol : null, echelleConnue };
}

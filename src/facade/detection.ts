// Detection des ouvertures sur une elevation redressee (MD/spec-releve-facade.md §7).
//
// Sur une facade, un mur est une grande surface a peu pres uniforme ; une fenetre, une porte, un
// volet s'en detachent - plus sombres le plus souvent, d'une autre couleur parfois. La detection
// cherche donc ce qui s'ecarte nettement de la teinte dominante du mur, en garde les taches qui ont
// la taille et la forme d'une baie, et aligne ce qui devrait l'etre : les linteaux d'un meme
// niveau sont a la meme hauteur sur une maison, pas a 3 cm pres.
//
// C'est une proposition : l'utilisateur la corrige au doigt avant de valider. Elle doit surtout ne
// pas inventer - une detection qui propose trois fausses fenetres coute plus de gestes qu'une
// detection qui en oublie une.

import type { Image } from './homographie.js';
import type { TypeOuverture } from '../model/types.js';

export type { TypeOuverture };

/** Une ouverture dans le repere de la facade : x depuis la gauche vue de dehors, y depuis le sol. */
export interface OuvertureDetectee {
  type: TypeOuverture;
  x: number;
  y: number;
  l: number;
  h: number;
  /** De 0 a 1 : part de la boite reellement couverte par la tache. */
  confiance: number;
}

/** Resolution de travail : 20 pixels par metre, soit 5 cm. Largement assez pour une baie. */
const PX_PAR_M = 20;

/** Une carte de travail : une valeur par pixel. */
interface Carte {
  l: number;
  h: number;
  v: Float32Array;
}

/** Reduit l'elevation a la resolution de travail, en moyennant les pixels vus. */
function reduire(img: Image, pxParM: number, vu: Uint8Array | null): { rgb: Float32Array; vu: Uint8Array; l: number; h: number } {
  const f = pxParM / PX_PAR_M;
  const l = Math.max(1, Math.round(img.largeur / f));
  const h = Math.max(1, Math.round(img.hauteur / f));
  const rgb = new Float32Array(l * h * 3);
  const n = new Float32Array(l * h);
  for (let y = 0; y < img.hauteur; y++) {
    const ry = Math.min(h - 1, Math.floor(y / f));
    for (let x = 0; x < img.largeur; x++) {
      const i = y * img.largeur + x;
      if (vu && !vu[i]) continue;
      const r = ry * l + Math.min(l - 1, Math.floor(x / f));
      rgb[r * 3] = rgb[r * 3]! + img.donnees[i * 4]!;
      rgb[r * 3 + 1] = rgb[r * 3 + 1]! + img.donnees[i * 4 + 1]!;
      rgb[r * 3 + 2] = rgb[r * 3 + 2]! + img.donnees[i * 4 + 2]!;
      n[r]! += 1;
    }
  }
  const vuR = new Uint8Array(l * h);
  for (let i = 0; i < l * h; i++) {
    if (n[i]! > 0) {
      rgb[i * 3] = rgb[i * 3]! / n[i]!;
      rgb[i * 3 + 1] = rgb[i * 3 + 1]! / n[i]!;
      rgb[i * 3 + 2] = rgb[i * 3 + 2]! / n[i]!;
      vuR[i] = 1;
    }
  }
  return { rgb, vu: vuR, l, h };
}

function mediane(valeurs: number[]): number {
  if (!valeurs.length) return 0;
  const s = [...valeurs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)]!;
}

/** Dilatation (max) ou erosion (min) d'une carte binaire, sur un voisinage 3x3. */
function morpho(b: Uint8Array, l: number, h: number, dilater: boolean): Uint8Array {
  const out = new Uint8Array(l * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < l; x++) {
      let v = dilater ? 0 : 1;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx,
            yy = y + dy;
          // Hors de l'image : neutre pour la dilatation, et pour l'erosion aussi - une fenetre qui
          // touche le bord de la photo ne doit pas etre rongee par ce bord.
          if (xx < 0 || yy < 0 || xx >= l || yy >= h) continue;
          const p = b[yy * l + xx]!;
          if (dilater ? p : !p) v = dilater ? 1 : 0;
        }
      }
      out[y * l + x] = v;
    }
  }
  return out;
}

interface Tache {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  n: number;
}

/** Composantes 4-connexes d'une carte binaire. */
function taches(b: Uint8Array, l: number, h: number): Tache[] {
  const vu = new Uint8Array(l * h);
  const res: Tache[] = [];
  const pile: number[] = [];
  for (let i = 0; i < l * h; i++) {
    if (!b[i] || vu[i]) continue;
    const t: Tache = { x0: l, y0: h, x1: -1, y1: -1, n: 0 };
    vu[i] = 1;
    pile.push(i);
    while (pile.length) {
      const j = pile.pop()!;
      const x = j % l,
        y = (j - x) / l;
      t.n++;
      if (x < t.x0) t.x0 = x;
      if (x > t.x1) t.x1 = x;
      if (y < t.y0) t.y0 = y;
      if (y > t.y1) t.y1 = y;
      const voisins = [x > 0 ? j - 1 : -1, x < l - 1 ? j + 1 : -1, y > 0 ? j - l : -1, y < h - 1 ? j + l : -1];
      for (const k of voisins) {
        if (k >= 0 && b[k] && !vu[k]) {
          vu[k] = 1;
          pile.push(k);
        }
      }
    }
    res.push(t);
  }
  return res;
}

/** Le type d'une baie, d'apres sa taille et sa hauteur d'appui. */
export function classer(y: number, l: number, h: number): TypeOuverture {
  const auSol = y < 0.25;
  if (auSol && l >= 2.1 && h >= 1.8) return 'garage';
  if (auSol && h >= 1.8) return l >= 1.1 ? 'porte-fenetre' : 'porte';
  if (y < 0.45 && h >= 1.9) return 'porte-fenetre';
  return 'fenetre';
}

/** Regroupe des valeurs proches (a `tol` pres) et remplace chacune par la moyenne de son groupe. */
export function aligner(valeurs: number[], tol: number): number[] {
  const ordre = valeurs.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v);
  const res = [...valeurs];
  let debut = 0;
  for (let k = 1; k <= ordre.length; k++) {
    if (k === ordre.length || ordre[k]!.v - ordre[k - 1]!.v > tol) {
      const groupe = ordre.slice(debut, k);
      const moy = groupe.reduce((s, g) => s + g.v, 0) / groupe.length;
      groupe.forEach((g) => (res[g.i] = moy));
      debut = k;
    }
  }
  return res;
}

const cm = (v: number) => Math.round(v * 100) / 100;

/**
 * Affine les quatre bords d'une boite trouvee a 5 cm pres, a la resolution de l'elevation : sur
 * chaque bord, on balaye une bande de deux pixels de travail de part et d'autre, de l'exterieur vers
 * l'interieur, et le bord est la premiere ligne (ou colonne) dont la moitie des pixels s'ecartent du
 * mur. Les cotes passent ainsi du demi-decimetre au centimetre, ce qui compte pour une menuiserie.
 */
function affiner(img: Image, pxParM: number, mur: number[], seuil: number, o: { x: number; y: number; l: number; h: number }) {
  const f = pxParM / PX_PAR_M;
  const L = img.largeur,
    H = img.hauteur,
    d = img.donnees;
  const hors = (x: number, y: number) => {
    const k = (y * L + x) * 4;
    return Math.hypot(d[k]! - mur[0]!, d[k + 1]! - mur[1]!, d[k + 2]! - mur[2]!) > seuil;
  };
  let X0 = Math.round(o.x * pxParM),
    X1 = Math.round((o.x + o.l) * pxParM),
    Y0 = Math.round(H - (o.y + o.h) * pxParM),
    Y1 = Math.round(H - o.y * pxParM);
  const marge = Math.ceil(2 * f);
  // Le milieu de la boite seulement : les coins arrondis par la morphologie fausseraient la mesure.
  const colonne = (x: number) => {
    const a = Y0 + Math.round((Y1 - Y0) * 0.2),
      b = Y1 - Math.round((Y1 - Y0) * 0.2);
    let n = 0;
    for (let y = a; y < b; y++) if (hors(x, y)) n++;
    return b > a ? n / (b - a) : 0;
  };
  const ligne = (y: number) => {
    const a = X0 + Math.round((X1 - X0) * 0.2),
      b = X1 - Math.round((X1 - X0) * 0.2);
    let n = 0;
    for (let x = a; x < b; x++) if (hors(x, y)) n++;
    return b > a ? n / (b - a) : 0;
  };
  const cherche = (de: number, a: number, pas: number, mesure: (v: number) => number, borne: number) => {
    for (let v = de; pas > 0 ? v <= a : v >= a; v += pas) if (v >= 0 && v < borne && mesure(v) >= 0.5) return v;
    return null;
  };
  const x0 = cherche(X0 - marge, X0 + marge, 1, colonne, L);
  const x1 = cherche(X1 + marge, X1 - marge, -1, colonne, L);
  const y0 = cherche(Y0 - marge, Y0 + marge, 1, ligne, H);
  const y1 = cherche(Y1 + marge, Y1 - marge, -1, ligne, H);
  if (x0 !== null) X0 = x0;
  if (x1 !== null) X1 = x1 + 1;
  if (y0 !== null) Y0 = y0;
  if (y1 !== null) Y1 = y1 + 1;
  return { x: X0 / pxParM, l: (X1 - X0) / pxParM, y: (H - Y1) / pxParM, h: (Y1 - Y0) / pxParM };
}

/**
 * Les ouvertures d'une elevation redressee de `largeurM` x `hauteurM` metres a `pxParM` pixels par
 * metre. `vu` (facultatif) masque ce que la photo n'a pas couvert.
 */
export function detecterOuvertures(img: Image, pxParM: number, vu: Uint8Array | null = null): OuvertureDetectee[] {
  const R = reduire(img, pxParM, vu);
  const { l, h } = R;
  const largeurM = l / PX_PAR_M,
    hauteurM = h / PX_PAR_M;

  // La teinte du mur : la mediane, canal par canal, de ce qui a ete vu. Une facade est surtout du
  // mur ; meme percee a 30 %, la mediane tombe sur lui.
  const canaux: number[][] = [[], [], []];
  for (let i = 0; i < l * h; i++) {
    if (!R.vu[i]) continue;
    for (let c = 0; c < 3; c++) canaux[c]!.push(R.rgb[i * 3 + c]!);
  }
  if (!canaux[0]!.length) return [];
  const mur = canaux.map(mediane);

  const ecart: Carte = { l, h, v: new Float32Array(l * h) };
  const ecarts: number[] = [];
  for (let i = 0; i < l * h; i++) {
    if (!R.vu[i]) continue;
    const d = Math.hypot(R.rgb[i * 3]! - mur[0]!, R.rgb[i * 3 + 1]! - mur[1]!, R.rgb[i * 3 + 2]! - mur[2]!);
    ecart.v[i] = d;
    ecarts.push(d);
  }
  // Seuil robuste : trois fois l'ecart median (le grain de l'enduit, le bruit du capteur), jamais
  // moins de 28 niveaux - en dessous, on detecterait les ombres portees d'une gouttiere.
  const seuil = Math.max(28, 3 * mediane(ecarts));
  let b: Uint8Array = new Uint8Array(l * h);
  for (let i = 0; i < l * h; i++) b[i] = R.vu[i] && ecart.v[i]! > seuil ? 1 : 0;

  // Fermeture puis ouverture : recoller les carreaux d'une fenetre separes par leurs petits bois,
  // puis effacer les grains isoles.
  b = morpho(morpho(b, l, h, true), l, h, true);
  b = morpho(morpho(b, l, h, false), l, h, false);
  b = morpho(b, l, h, false);
  b = morpho(b, l, h, true);

  const brutes: OuvertureDetectee[] = [];
  for (const t of taches(b, l, h)) {
    const lp = t.x1 - t.x0 + 1,
      hp = t.y1 - t.y0 + 1;
    const lm = lp / PX_PAR_M,
      hm = hp / PX_PAR_M;
    const remplissage = t.n / (lp * hp);
    if (lm < 0.35 || hm < 0.4 || lm > 5.5 || hm > 3.2) continue;
    if (remplissage < 0.55) continue;
    // Une bande qui traverse presque toute la facade est un soubassement, une ombre de toiture ou
    // le bas du cadrage, pas une baie.
    if (lm > 0.85 * largeurM) continue;
    // Une tache qui colle au haut de l'elevation est le plus souvent l'ombre du debord de toit.
    if (t.y0 === 0 && hm < 0.8) continue;
    const boite = affiner(img, pxParM, mur, seuil, { x: t.x0 / PX_PAR_M, y: hauteurM - (t.y1 + 1) / PX_PAR_M, l: lm, h: hm });
    brutes.push({ type: 'fenetre', ...boite, confiance: Math.min(1, remplissage) });
  }

  // Alignement : linteaux et appuis a 7 cm pres ramenes a la meme cote.
  const hauts = aligner(
    brutes.map((o) => o.y + o.h),
    0.07,
  );
  const bas = aligner(
    brutes.map((o) => o.y),
    0.07,
  );
  return brutes
    .map((o, i) => {
      const y = Math.max(0, bas[i]! < 0.1 ? 0 : bas[i]!);
      const hTot = hauts[i]! - y;
      const res = { ...o, x: cm(o.x), y: cm(y), l: cm(o.l), h: cm(hTot) };
      res.type = classer(res.y, res.l, res.h);
      return res;
    })
    .filter((o) => o.h > 0.3)
    .sort((a, b) => a.x - b.x || a.y - b.y);
}

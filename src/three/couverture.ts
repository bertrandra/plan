// Les textures des couvertures en 3D : tuiles romanes, plates ou canal, ardoises (et grande ardoise en losange), zinc a joints
// debout, gravillons d'un toit-terrasse (MD/spec-toit-ign.md §6.2) ; l'ecaille (ardoise, tuile plate), le bac acier, la membrane et la
// toiture vegetale (lot L2 de MD/spec-lecture-ia-elargie.md).
//
// Elles sont dessinees, pas telechargees : la vue 3D les a sans reseau, et l'export GLB les emporte.
// Chacune est en niveaux de clair, autour de 0,85 : la couleur du toit (lue sur l'orthophoto, de
// repli ou choisie) la teinte par le materiau. Une texture couvre un metre sur un metre ; les
// coordonnees de texture d'un pan sont en metres (`uvDuPan`), les rangs suivent l'egout.

import { inscrireHauteurs } from './materiauxVivants.js';
import type * as THREE_NS from 'three';
import type { MateriauCouverture } from '../model/couleurToit.js';
import type { PoseCouverture } from '../model/types.js';
import { poseAdmise } from '../model/couvertureLue.js';
import { showToast } from '../shell/dialogs.js';

const COTE = 256;

/** Un tirage reproductible : la meme texture d'une ouverture a l'autre, et dans les captures. */
function tirage(graine: number): () => number {
  let s = graine;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

/**
 * Tuiles romanes : 4 tuiles et 3 rangs par metre. Chaque tuile est bombee (plus claire au sommet de
 * sa courbe), chaque rang plus sombre sous le recouvrement du rang du dessus.
 */
function tuiles(px: Uint8ClampedArray): void {
  const rnd = tirage(11);
  const colonnes = 4,
    rangs = 3,
    l = COTE / colonnes,
    h = Math.round(COTE / rangs);
  const nuance = Array.from({ length: colonnes * rangs }, () => 0.92 + 0.1 * rnd());
  for (let y = 0; y < COTE; y++) {
    const r = Math.min(rangs - 1, Math.floor(y / h)),
      t = (y - r * h) / h;
    // En haut du rang (canevas vers le haut = vers le faitage), l'ombre du rang superieur.
    const recouvrement = 0.72 + 0.28 * Math.min(1, t / 0.35);
    const nez = t > 0.95 ? 0.6 : 1;
    for (let x = 0; x < COTE; x++) {
      const c = Math.floor(x / l),
        u = (x - c * l) / l;
      const bombe = 0.7 + 0.3 * Math.sin(Math.PI * u);
      const v = Math.min(1, bombe * recouvrement * nez * (nuance[r * colonnes + c] ?? 1) * (0.96 + 0.06 * rnd()));
      const k = (y * COTE + x) * 4;
      px[k] = px[k + 1] = px[k + 2] = Math.round(255 * v);
      px[k + 3] = 255;
    }
  }
}

/** Ardoises : 4 par metre en largeur, 8 rangs, a joints croises, chacune de sa nuance. */
function ardoises(px: Uint8ClampedArray): void {
  const rnd = tirage(23);
  const colonnes = 4,
    rangs = 8,
    l = COTE / colonnes,
    h = COTE / rangs;
  const nuance = Array.from({ length: (colonnes + 1) * rangs }, () => 0.8 + 0.16 * rnd());
  for (let y = 0; y < COTE; y++) {
    const r = Math.floor(y / h),
      t = (y - r * h) / h;
    const decalage = r % 2 ? l / 2 : 0;
    for (let x = 0; x < COTE; x++) {
      const xs = (x + decalage) % COTE,
        c = Math.floor(xs / l),
        u = (xs - c * l) / l;
      const joint = u < 0.025 || u > 0.975 || t > 0.94;
      const ombre = 0.85 + 0.15 * Math.min(1, t / 0.25);
      const v = joint ? 0.42 : Math.min(1, (nuance[r * (colonnes + 1) + c] ?? 1) * ombre * (0.97 + 0.04 * rnd()) + 0.1);
      const k = (y * COTE + x) * 4;
      px[k] = px[k + 1] = px[k + 2] = Math.round(255 * v);
      px[k + 3] = 255;
    }
  }
}

/**
 * Grande ardoise posee en losange (a la pointe de diamant) : des ardoises carrees d'environ 35 cm posees sur la pointe, donc des losanges
 * de 50 cm de diagonale, 2 par metre ; les rangs se decalent d'une demi-diagonale et les joints courent en diagonale. Chaque ardoise a sa
 * nuance, et la pointe du haut est ombree par le recouvrement de la ardoise du dessus. Le motif tient sur la texture (4 rangs, 2 losanges).
 */
function ardoisesLosange(px: Uint8ClampedArray): void {
  const rnd = tirage(41), diag = COTE / 2, rangs = 4, pas = diag / 2;
  const nuance = Array.from({ length: rangs * 2 }, () => 0.64 + 0.28 * rnd());
  // Les centres des losanges, avec un tour de plus de chaque cote pour que le motif se raccorde d'une texture a l'autre.
  const centres: { x: number; y: number; n: number }[] = [];
  for (let j = -1; j <= rangs; j++) for (let i = -1; i <= 2; i++) {
    const jm = ((j % rangs) + rangs) % rangs, im = ((i % 2) + 2) % 2;
    centres.push({ x: i * diag + (jm % 2 ? diag / 2 : 0), y: j * pas, n: nuance[jm * 2 + im] as number });
  }
  for (let y = 0; y < COTE; y++) for (let x = 0; x < COTE; x++) {
    // Le losange le plus proche, a distance de Manhattan : son rayon est la demi-diagonale.
    let best = centres[0] as { x: number; y: number; n: number }, d = Infinity;
    for (const c of centres) { const m = Math.abs(x - c.x) + Math.abs(y - c.y); if (m < d) { d = m; best = c; } }
    const bord = diag / 2 - d;
    const joint = bord < 1.6;
    // Le haut de chaque ardoise passe sous celle du dessus : un degrade d'ombre sur sa moitie haute.
    const haut = Math.max(0, (best.y - y) / (diag / 2));
    const ombre = 1 - 0.3 * haut * Math.min(1, (diag / 2 - d + 6) / 14);
    poser(px, x, y, joint ? 0.38 : Math.min(1, best.n * ombre * (0.97 + 0.05 * rnd())));
  }
}

/** Un bruit de valeur periodique sur la texture (periode `n` cellules), lisse, entre 0 et 1. */
function bruit(n: number, graine: number): (x: number, y: number) => number {
  const rnd = tirage(graine);
  const g = Array.from({ length: n * n }, () => rnd());
  const lisse = (t: number) => t * t * (3 - 2 * t);
  const v = (a: number, b: number) => g[(((b % n) + n) % n) * n + (((a % n) + n) % n)] as number;
  return (x, y) => {
    const fx = x * n, fy = y * n, i = Math.floor(fx), j = Math.floor(fy), tx = lisse(fx - i), ty = lisse(fy - j);
    const h0 = v(i, j) + (v(i + 1, j) - v(i, j)) * tx, h1 = v(i, j + 1) + (v(i + 1, j + 1) - v(i, j + 1)) * tx;
    return h0 + (h1 - h0) * ty;
  };
}

/** Ecrit un gris (0 a 1) au pixel (x, y). */
function poser(px: Uint8ClampedArray, x: number, y: number, v: number): void {
  const k = (y * COTE + x) * 4;
  px[k] = px[k + 1] = px[k + 2] = Math.round(255 * Math.min(1, Math.max(0, v)));
  px[k + 3] = 255;
}

/**
 * Tuiles plates (petit moule, le toit raide du Nord et de l'Ile-de-France) : 6 par metre en largeur,
 * un pureau de 10 cm (10 rangs), a joints croises ; chaque tuile sa nuance et un grain, le nez du rang
 * du dessus ombrant le haut de chaque rang.
 */
function tuilesPlates(px: Uint8ClampedArray): void {
  const rnd = tirage(31), grain = bruit(48, 5), colonnes = 6, rangs = 10, l = COTE / colonnes, h = COTE / rangs;
  const nuance = Array.from({ length: (colonnes + 1) * rangs }, () => 0.78 + 0.18 * rnd());
  for (let y = 0; y < COTE; y++) {
    const r = Math.floor(y / h), t = (y - r * h) / h;
    const decalage = r % 2 ? l / 2 : 0;
    const ombre = 0.7 + 0.3 * Math.min(1, t / 0.3);
    for (let x = 0; x < COTE; x++) {
      const xs = (x + decalage) % COTE, c = Math.floor(xs / l), u = (xs - c * l) / l;
      const joint = u < 0.03 || u > 0.97;
      const v = joint ? 0.5 : (nuance[r * (colonnes + 1) + c] as number) * ombre + 0.08 * (grain(x / COTE, y / COTE) - 0.5);
      poser(px, x, y, v);
    }
  }
}

/**
 * Tuiles canal (le toit provencal, peu pentu) : 3 paires par metre, chacune une tuile de couvert
 * etroite et bombee (claire a sa crete) puis un canal plus large, en creux, ombre au pied du couvert ;
 * 3 tuiles par metre dans la pente, chevauchant la suivante, les couverts decales d'une demi-tuile ;
 * des nuances fortes - de vieilles tuiles melees.
 */
function tuilesCanal(px: Uint8ClampedArray): void {
  const rnd = tirage(37), grain = bruit(32, 9), paires = 3, rangs = 3, l = COTE / paires, h = COTE / rangs, part = 0.42;
  const nuance = Array.from({ length: paires * 2 * rangs }, () => 0.7 + 0.28 * rnd());
  for (let y = 0; y < COTE; y++) {
    for (let x = 0; x < COTE; x++) {
      const p = Math.floor(x / l), u = (x - p * l) / l, couvert = u < part;
      const w = couvert ? u / part : (u - part) / (1 - part);
      const yy = (y + (couvert ? h / 2 : 0)) % COTE, r = Math.floor(yy / h), t = (yy - r * h) / h;
      const forme = couvert
        ? 0.66 + 0.4 * Math.sin(Math.PI * w)
        // Le canal : plus sombre en son fond, et dans l'ombre du couvert sur ses deux bords.
        : (0.86 - 0.18 * Math.sin(Math.PI * w)) * (0.72 + 0.28 * Math.min(1, w / 0.12, (1 - w) / 0.12));
      const chevauchement = 0.7 + 0.3 * Math.min(1, t / 0.2);
      const n = nuance[(r * paires + p) * 2 + (couvert ? 0 : 1)] as number;
      poser(px, x, y, n * forme * chevauchement + 0.06 * (grain(x / COTE, y / COTE) - 0.5));
    }
  }
}

/** Zinc a joints debout : des bandes de 50 cm dans la pente, un joint clair et son ombre, un leger moire. */
function zinc(px: Uint8ClampedArray): void {
  const moire = bruit(6, 13), fin = bruit(64, 17), bandes = 2, l = COTE / bandes;
  for (let y = 0; y < COTE; y++) for (let x = 0; x < COTE; x++) {
    const u = (x % l) / l;
    const joint = u < 0.02 ? 1 : u < 0.04 ? 0.62 : 0;
    const base = 0.8 + 0.08 * (moire(x / COTE, y / COTE) - 0.5) + 0.03 * (fin(x / COTE, y / COTE) - 0.5);
    poser(px, x, y, joint ? joint : base);
  }
}

/** Toit-terrasse en gravillons : un semis serre de petits graviers, plus ou moins clairs, sur une teinte qui varie a peine. */
function terrasse(px: Uint8ClampedArray): void {
  const rnd = tirage(59), large = bruit(4, 19), gravier = bruit(128, 61);
  for (let y = 0; y < COTE; y++) for (let x = 0; x < COTE; x++) {
    const g = gravier(x / COTE, y / COTE);
    poser(px, x, y, 0.8 + 0.06 * (large(x / COTE, y / COTE) - 0.5) + 0.16 * (g - 0.5) + 0.06 * (rnd() - 0.5));
  }
}

/**
 * Ecailles (lot L2) : des elements de `colonnes` par metre et `rangs` rangs, a joints croises, dont le bas est arrondi en demi-cercle et
 * passe sur le haut du rang du dessous (le nez de chaque ecaille ombre le rang qu'il recouvre). Chaque ecaille a sa nuance.
 */
function ecailles(px: Uint8ClampedArray, colonnes: number, rangs: number, graine: number, base: number, ecart: number): void {
  const rnd = tirage(graine), grain = bruit(48, graine + 1), l = COTE / colonnes, h = COTE / rangs;
  const nuance = Array.from({ length: (colonnes + 1) * rangs }, () => base + ecart * rnd());
  for (let y = 0; y < COTE; y++) for (let x = 0; x < COTE; x++) {
    let r = Math.floor(y / h), t = (y - r * h) / h;
    const dec = (rr: number) => (rr % 2 ? l / 2 : 0);
    let xs = (x + dec(r)) % COTE, c = Math.floor(xs / l), u = (xs - c * l) / l;
    // Le bas arrondi de l'ecaille : au-dela de son arc, c'est le haut de l'ecaille du rang du dessous qui se voit.
    const arc = 0.55 + 0.45 * Math.sqrt(Math.max(0, 1 - (2 * u - 1) ** 2));
    const nez = Math.abs(t - arc) < 0.05;
    if (t > arc) { r = (r + 1) % rangs; t = t - 1; xs = (x + dec(r)) % COTE; c = Math.floor(xs / l); u = (xs - c * l) / l; }
    const joint = u < 0.03 || u > 0.97;
    const ombre = 0.72 + 0.28 * Math.min(1, Math.max(0, t + 0.2) / 0.5);
    poser(px, x, y, nez || joint ? 0.42 : (nuance[r * (colonnes + 1) + c] as number) * ombre + 0.06 * (grain(x / COTE, y / COTE) - 0.5));
  }
}

/** Ardoises en ecaille : la taille des ardoises droites (4 par metre, 8 rangs), le bas arrondi. */
const ardoisesEcaille = (px: Uint8ClampedArray) => ecailles(px, 4, 8, 43, 0.74, 0.2);
/** Tuiles plates en ecaille (le « petit moule » arrondi) : 6 par metre, 10 rangs. */
const tuilesPlatesEcaille = (px: Uint8ClampedArray) => ecailles(px, 6, 10, 47, 0.76, 0.2);

/** Bac acier (lot L2) : une tole nervuree, une nervure trapezoidale tous les 25 cm dans la pente, claire au sommet, ombree au pied. */
function bacAcier(px: Uint8ClampedArray): void {
  const moire = bruit(4, 53), nervures = 4, l = COTE / nervures;
  for (let y = 0; y < COTE; y++) for (let x = 0; x < COTE; x++) {
    const u = (x % l) / l;
    const relief = u < 0.08 ? 0.95 : u < 0.14 ? 0.62 : u > 0.94 ? 0.78 : 0.84;
    poser(px, x, y, relief + 0.04 * (moire(x / COTE, y / COTE) - 0.5));
  }
}

/** Membrane d'etancheite (lot L2) : un revetement continu, ses lés de 1 m soudes (un recouvrement plus sombre), un leger grain. */
function membrane(px: Uint8ClampedArray): void {
  const grain = bruit(64, 67), large = bruit(5, 71);
  for (let y = 0; y < COTE; y++) for (let x = 0; x < COTE; x++) {
    const le = y < 4 ? 0.7 : y < 7 ? 0.86 : 0.8;
    poser(px, x, y, le + 0.05 * (large(x / COTE, y / COTE) - 0.5) + 0.04 * (grain(x / COTE, y / COTE) - 0.5));
  }
}

/** Toiture vegetale (lot L2) : des touffes de sedum serrees, claires au sommet, sombres entre elles, sans motif regulier. */
function vegetale(px: Uint8ClampedArray): void {
  const touffes = bruit(24, 73), fin = bruit(96, 79), large = bruit(5, 83);
  for (let y = 0; y < COTE; y++) for (let x = 0; x < COTE; x++) {
    const t = touffes(x / COTE, y / COTE);
    poser(px, x, y, 0.55 + 0.4 * t * t + 0.12 * (fin(x / COTE, y / COTE) - 0.5) + 0.08 * (large(x / COTE, y / COTE) - 0.5));
  }
}

/**
 * Ce qui se dessine sur une couverture : son materiau, et sa pose quand elle s'y dessine (lot L2). La grande ardoise en losange d'avant le
 * schema 11 est une ardoise posee en losange : meme dessin, meme texture, meme `.glb`.
 */
export type DessinCouverture = MateriauCouverture | 'ardoise-losange' | 'ardoise-ecaille' | 'tuile-plate-ecaille';

/** Le dessin d'un materiau pose ainsi : une pose qui ne s'y dessine pas (`poseAdmise`) se dessine en rangs droits. */
export function dessinCouverture(lu: MateriauCouverture, pose?: PoseCouverture | null): DessinCouverture {
  // Le materiau vient du fichier (`Toit.couverture`) : un mot hors du catalogue se dessine en tuile, sans toucher a la donnee.
  let materiau: MateriauCouverture = lu;
  if (!connu(lu)) { signalerInconnue(lu); materiau = 'tuile'; }
  const p = materiau === 'terrasse' ? undefined : poseAdmise(materiau, pose ?? undefined);
  if (p === 'losange') return 'ardoise-losange';
  if (p === 'ecaille') return materiau === 'ardoise' ? 'ardoise-ecaille' : 'tuile-plate-ecaille';
  return materiau;
}

const DESSINS: Record<DessinCouverture, (px: Uint8ClampedArray) => void> = {
  tuile: tuiles, 'tuile-plate': tuilesPlates, 'tuile-canal': tuilesCanal, ardoise: ardoises, 'ardoise-losange': ardoisesLosange, zinc, terrasse,
  'ardoise-ecaille': ardoisesEcaille, 'tuile-plate-ecaille': tuilesPlatesEcaille, 'bac-acier': bacAcier, membrane, vegetale,
};

/**
 * Un dessin du catalogue. Le materiau d'un toit se lit dans le fichier : un fichier ecrit par une version plus recente (ou a la
 * main) peut porter un mot que cette version ne dessine pas, et indexer la table par ce mot faisait planter l'ecran (Plan 2.2.0,
 * « fAe[e] is not a function » a l'ouverture d'un audit). Decision du 30 octobre 2026 : hors catalogue, la tuile.
 */
const connu = (d: unknown): d is DessinCouverture => typeof d === 'string' && Object.prototype.hasOwnProperty.call(DESSINS, d);

/** Les mots inconnus deja signales : une fois par mot et par session, pas a chaque rendu. */
const signales = new Set<string>();
// Sans document (tests, export sans page), le toast n'a nulle part ou s'afficher : rien ne doit lever pour un signal.
const toast = (message: string): void => { if (typeof document !== 'undefined') showToast(message); };
let avertir: (message: string) => void = toast;

/** Dit qu'une couverture est inconnue et dessinee en tuile, une fois par mot. Ne touche pas au projet. */
function signalerInconnue(mot: unknown): void {
  const cle = String(mot);
  if (signales.has(cle)) return;
  signales.add(cle);
  avertir('Couverture inconnue (« ' + cle + ' »), dessinée en tuile.');
}

/** Le dessin a poser : celui demande s'il est au catalogue, sinon la tuile (et le signal). */
function dessinConnu(d: DessinCouverture): DessinCouverture {
  if (connu(d)) return d;
  signalerInconnue(d);
  return 'tuile';
}

/** Pour les tests : qui recoit le signal (par defaut le toast de l'application), et l'oubli des mots deja signales. */
export function poserAvertissementCouverture(f: ((message: string) => void) | null): void {
  avertir = f ?? toast;
  signales.clear();
}

/** Les pixels (RGBA a plat, en gris) d'une couverture, sur COTE pixels de cote : pour les tests. */
export function pixelsCouverture(dessin: DessinCouverture): Uint8ClampedArray {
  const px = new Uint8ClampedArray(COTE * COTE * 4);
  DESSINS[dessinConnu(dessin)](px);
  return px;
}

/** La matiere d'une couverture en 3D : une tuile est mate, une ardoise un peu moins, le zinc brille un peu, le bac acier un peu moins. */
export function matiereCouverture(demande: DessinCouverture): { roughness: number; metalness: number } {
  const materiau = dessinConnu(demande);
  if (materiau === 'zinc') return { roughness: 0.45, metalness: 0.35 };
  if (materiau === 'bac-acier') return { roughness: 0.55, metalness: 0.25 };
  if (materiau === 'ardoise' || materiau === 'ardoise-losange' || materiau === 'ardoise-ecaille') return { roughness: 0.7, metalness: 0 };
  if (materiau === 'terrasse' || materiau === 'vegetale') return { roughness: 0.95, metalness: 0 };
  return { roughness: 0.85, metalness: 0 };
}

const cache = new Map<DessinCouverture, THREE_NS.Texture>();

/** La texture d'une couverture, ou `null` sans canevas (tests, environnement sans DOM). */
export function textureCouverture(demande: DessinCouverture): THREE_NS.Texture | null {
  const materiau = dessinConnu(demande);
  const deja = cache.get(materiau);
  if (deja) return deja;
  if (typeof document === 'undefined' || typeof THREE === 'undefined' || !THREE.CanvasTexture) return null;
  const canevas = document.createElement('canvas');
  canevas.width = canevas.height = COTE;
  const c2d = canevas.getContext('2d');
  if (!c2d) return null;
  const img = c2d.createImageData(COTE, COTE);
  DESSINS[materiau](img.data);
  c2d.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canevas);
  // Le relief de la couverture (R3, three/materiauxVivants.ts) : l'ombre sous chaque tuile est en creux.
  inscrireHauteurs(tex, new Uint8ClampedArray(img.data), COTE, false, materiau === 'zinc' || materiau === 'bac-acier' || materiau === 'membrane' ? 1.5 : 3);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  cache.set(materiau, tex);
  return tex;
}

// Les rues dessinees en Vue 3D : l'option « Rues » du menu Affichage (MD/spec-rues.md §7 et §8, three/).
//
// Les memes profils que le plan (model/trottoirs.ts, render/chaussees.ts), poses sur le sol. La chaussee est un ruban drape entre ses
// deux bords, recoupe en mailles de `PAS_CHAUSSEE_M` pour suivre la pente, chaque sommet a la hauteur du sol sous lui (le meme
// lecteur que la scene, `SolRelief.hauteur`) plus `DECALAGE_CHAUSSEE_M` ; un disque ferme chaque bout de troncon : a un carrefour,
// les rubans se rejoignent sans encoche. Les trottoirs sont drapes de la meme facon, `HAUTEUR_TROTTOIR_M` plus haut, de la chaussee a
// la limite de la parcelle : une face de bordure monte du bord de la chaussee, coiffee d'une bande de `LARGEUR_BORDURE_M` a la
// couleur de la bordure, et une face descend au sol a la limite (le trottoir ne flotte pas au-dessus du jardin).
//
// Trois mailles mates, une par couleur, rangees dans la couche des chemins (COUCHES_SOL) : elles gagnent le test de profondeur contre
// le sol, la photo et le Plan IGN ; les trottoirs, plus hauts, n'ont pas de face commune avec le gazon ni la photo. Elles ne portent
// pas d'ombre (elles en recoivent) et ne partent pas dans l'export GLB : comme le fond, c'est un repere a l'ecran.

import { JETONS } from '../styles/jetons.js';
import { poserEnCouche, percerSol, COUCHES_SOL, SANS_OMBRE, HORS_EXPORT, type VersLocal } from './primitives.js';
import type * as THREE_NS from 'three';
import type { PtBrut } from '../model/types.js';
import type { Emprise } from '../model/relief.js';
import type { CouleursRues, ProfilRue, StationRue } from '../model/trottoirs.js';

export const NOM_CHAUSSEES_3D = 'rues-chaussees';
export const NOM_TROTTOIRS_3D = 'rues-trottoirs';
export const NOM_BORDURES_3D = 'rues-bordures';
/** La hauteur du ruban au-dessus du sol : entre deux sommets du maillage du sol, le relief est plan, le ruban doit rester dessus. */
export const DECALAGE_CHAUSSEE_M = 0.06;
/** La hauteur d'un trottoir au-dessus de la chaussee : une bordure de quinze centimetres, celle d'une rue de ville. */
export const HAUTEUR_TROTTOIR_M = 0.15;
/** La largeur de la bordure vue d'en haut, au bord du trottoir. */
export const LARGEUR_BORDURE_M = 0.15;
/** La plus grande maille du ruban, en long comme en travers : assez fine pour suivre le relief, assez large pour un quartier. */
export const PAS_CHAUSSEE_M = 2;
/** Ce que la couleur du jeton perd en 3D, pour paraitre a l'ecran celle du plan une fois eclairee. */
export const ATTENUATION_3D = 0.8;
/** Le nombre de cotes du disque qui ferme un bout de troncon. */
const COTES_BOUT = 12;

/** Le jeton de chaque partie d'une rue, selon les couleurs choisies. */
const JETONS_RUE: Record<CouleursRues, Record<'chaussee' | 'trottoir' | 'bordure', 'chaussee' | 'trottoir' | 'chaussee-bord' | 'chaussee-reelle' | 'trottoir-reel' | 'bordure-reelle'>> = {
  plan: { chaussee: 'chaussee', trottoir: 'trottoir', bordure: 'chaussee-bord' },
  reelles: { chaussee: 'chaussee-reelle', trottoir: 'trottoir-reel', bordure: 'bordure-reelle' },
};

/** La couleur d'une partie des rues : le jeton de la page (la palette de l'admin comprise), sinon celui de jetons.ts. */
export function couleurRue(partie: 'chaussee' | 'trottoir' | 'bordure', couleurs: CouleursRues = 'plan'): string {
  const nom = JETONS_RUE[couleurs][partie];
  const sombre = typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-color-scheme: dark)').matches;
  const lue = typeof document !== 'undefined' ? getComputedStyle(document.documentElement).getPropertyValue('--' + nom).trim() : '';
  return lue || JETONS[sombre ? 'sombre' : 'clair'][nom];
}

/** La couleur des chaussees : le jeton `--chaussee` de la page (la palette de l'admin comprise). */
export function couleurChaussee(): string {
  return couleurRue('chaussee', 'plan');
}

const mix = (a: number, b: number, t: number) => a + (b - a) * t;

/** La mesure a `t` entre deux autres : position, normale et decalages au prorata ; un trottoir qui manque d'un cote manque. */
function entre(a: StationRue, b: StationRue, t: number): StationRue {
  const opt = (u: number | null, v: number | null) => (u === null || v === null ? (t < 0.5 ? u : v) : mix(u, v, t));
  return {
    x: mix(a.x, b.x, t), y: mix(a.y, b.y, t), nx: mix(a.nx, b.nx, t), ny: mix(a.ny, b.ny, t),
    chausseeG: mix(a.chausseeG, b.chausseeG, t), chausseeD: mix(a.chausseeD, b.chausseeD, t),
    trottoirG: opt(a.trottoirG, b.trottoirG), trottoirD: opt(a.trottoirD, b.trottoirD),
  };
}

/** Les morceaux d'un profil dont l'axe est dans le rectangle (Liang-Barsky, segment par segment), chacun d'un seul tenant. */
export function decouperProfil(stations: readonly StationRue[], e: Emprise): StationRue[][] {
  const morceaux: StationRue[][] = [];
  let courant: StationRue[] | null = null;
  for (let i = 1; i < stations.length; i++) {
    const a = stations[i - 1] as StationRue, b = stations[i] as StationRue;
    const dx = b.x - a.x, dy = b.y - a.y;
    let t0 = 0, t1 = 1, dehors = false;
    for (const [p, q] of [[-dx, a.x - e.xMin], [dx, e.xMax - a.x], [-dy, a.y - e.yMin], [dy, e.yMax - a.y]] as [number, number][]) {
      if (p === 0) { if (q < 0) dehors = true; continue; }
      const r = q / p;
      if (p < 0) { if (r > t1) dehors = true; else if (r > t0) t0 = r; } else { if (r < t0) dehors = true; else if (r < t1) t1 = r; }
    }
    if (dehors) { courant = null; continue; }
    const debut = t0 === 0 ? a : entre(a, b, t0), fin = t1 === 1 ? b : entre(a, b, t1);
    if (courant && t0 === 0) courant.push(fin);
    else { courant = [debut, fin]; morceaux.push(courant); }
    if (t1 !== 1) courant = null;
  }
  return morceaux;
}

/** Le point a `decalage` de l'axe d'une mesure. */
const point = (s: StationRue, decalage: number): PtBrut => ({ x: s.x + s.nx * decalage, y: s.y + s.ny * decalage });
const dist = (a: PtBrut, b: PtBrut) => Math.hypot(b.x - a.x, b.y - a.y);

/**
 * Un ruban drape entre deux decalages (`gauche` au-dessus de `droite`) le long des mesures : des mailles de `pas` au plus, chaque
 * sommet a la hauteur du sol sous lui plus `hauteur`. Les faces regardent le ciel.
 */
function bande(stations: readonly StationRue[], gauche: (s: StationRue) => number, droite: (s: StationRue) => number, versLocal: VersLocal,
  sol: (p: PtBrut) => number, hauteur: number, pas: number, sortie: number[]): void {
  const sommet = (p: PtBrut) => { const l = versLocal(p); sortie.push(l.x, sol(p) + hauteur, l.z); };
  const mixP = (a: PtBrut, b: PtBrut, t: number): PtBrut => ({ x: mix(a.x, b.x, t), y: mix(a.y, b.y, t) });
  for (let i = 0; i < stations.length - 1; i++) {
    const s0 = stations[i] as StationRue, s1 = stations[i + 1] as StationRue;
    const g0 = point(s0, gauche(s0)), g1 = point(s1, gauche(s1)), d0 = point(s0, droite(s0)), d1 = point(s1, droite(s1));
    const long = Math.max(1, Math.ceil(Math.max(dist(g0, g1), dist(d0, d1)) / pas - 1e-9));
    const travers = Math.max(1, Math.ceil(Math.max(dist(g0, d0), dist(g1, d1)) / pas - 1e-9));
    for (let a = 0; a < long; a++) for (let b = 0; b < travers; b++) {
      const coin = (ta: number, tb: number) => mixP(mixP(g0, g1, ta), mixP(d0, d1, ta), tb);
      const p00 = coin(a / long, b / travers), p10 = coin((a + 1) / long, b / travers);
      const p01 = coin(a / long, (b + 1) / travers), p11 = coin((a + 1) / long, (b + 1) / travers);
      [p00, p01, p11, p00, p11, p10].forEach(sommet);
    }
  }
}

/** Une face verticale le long des mesures, au decalage donne, entre deux hauteurs au-dessus du sol. */
function face(stations: readonly StationRue[], decalage: (s: StationRue) => number, versLocal: VersLocal, sol: (p: PtBrut) => number,
  bas: number, haut: number, pas: number, sortie: number[]): void {
  const sommet = (p: PtBrut, h: number) => { const l = versLocal(p); sortie.push(l.x, sol(p) + h, l.z); };
  for (let i = 0; i < stations.length - 1; i++) {
    const a = point(stations[i] as StationRue, decalage(stations[i] as StationRue)), b = point(stations[i + 1] as StationRue, decalage(stations[i + 1] as StationRue));
    const n = Math.max(1, Math.ceil(dist(a, b) / pas - 1e-9));
    for (let k = 0; k < n; k++) {
      const p = { x: mix(a.x, b.x, k / n), y: mix(a.y, b.y, k / n) }, q = { x: mix(a.x, b.x, (k + 1) / n), y: mix(a.y, b.y, (k + 1) / n) };
      sommet(p, bas); sommet(q, bas); sommet(q, haut);
      sommet(p, bas); sommet(q, haut); sommet(p, haut);
    }
  }
}

const dedans = (p: PtBrut, e: Emprise, marge: number) => p.x >= e.xMin + marge && p.x <= e.xMax - marge && p.y >= e.yMin + marge && p.y <= e.yMax - marge;

/** Les sommets (triangles a plat) du disque qui ferme un bout, chacun a la hauteur du sol sous lui. */
function disque(c: PtBrut, rayon: number, versLocal: VersLocal, sol: (p: PtBrut) => number, decalage: number, sortie: number[]): void {
  const sommet = (p: PtBrut) => { const l = versLocal(p); sortie.push(l.x, sol(p) + decalage, l.z); };
  const bord = (k: number): PtBrut => ({ x: c.x + rayon * Math.cos((2 * Math.PI * k) / COTES_BOUT), y: c.y + rayon * Math.sin((2 * Math.PI * k) / COTES_BOUT) });
  // Dans le sens trigonometrique du plan : la face regarde le ciel, comme celles du ruban drape.
  for (let k = 0; k < COTES_BOUT; k++) { sommet(c); sommet(bord(k)); sommet(bord(k + 1)); }
}

function geometrie(positions: number[]): THREE_NS.BufferGeometry | null {
  if (!positions.length) return null;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.computeVertexNormals();
  return geo;
}

/** Les morceaux d'un profil dans le sol dessine (hors de lui, un ruban flotterait dans le vide), ou le profil entier sans cadre. */
const morceaux = (p: ProfilRue, cadre?: Emprise): StationRue[][] => (cadre ? decouperProfil(p.stations, cadre) : [p.stations]);

/**
 * La geometrie des chaussees : un ruban drape entre les bords de chaque morceau de profil dans `cadre`, et un disque a chaque bout
 * d'origine qui y tient. `null` s'il n'y a rien a poser.
 */
export function geometrieChaussees(profils: readonly ProfilRue[], versLocal: VersLocal, sol: (p: PtBrut) => number, cadre?: Emprise,
  decalage = DECALAGE_CHAUSSEE_M, pas = PAS_CHAUSSEE_M): THREE_NS.BufferGeometry | null {
  const positions: number[] = [];
  for (const p of profils) {
    if (p.stations.length < 2) continue;
    for (const m of morceaux(p, cadre)) bande(m, (s) => s.chausseeG, (s) => s.chausseeD, versLocal, sol, decalage, pas, positions);
    for (const s of [p.stations[0], p.stations[p.stations.length - 1]]) {
      if (!s) continue;
      const rayon = (s.chausseeG - s.chausseeD) / 2, centre = point(s, (s.chausseeG + s.chausseeD) / 2);
      if (rayon > 0 && (!cadre || dedans(centre, cadre, rayon))) disque(centre, rayon, versLocal, sol, decalage, positions);
    }
  }
  return geometrie(positions);
}

/** Les suites de mesures d'un morceau qui ont un trottoir de ce cote. */
function suites(stations: readonly StationRue[], cote: 'G' | 'D'): StationRue[][] {
  const res: StationRue[][] = [];
  let c: StationRue[] = [];
  for (const s of stations) {
    if ((cote === 'G' ? s.trottoirG : s.trottoirD) !== null) c.push(s);
    else { if (c.length >= 2) res.push(c); c = []; }
  }
  if (c.length >= 2) res.push(c);
  return res;
}

/**
 * La geometrie des trottoirs : le dessus drape `HAUTEUR_TROTTOIR_M` au-dessus de la chaussee et la face qui descend au sol a la limite
 * (`dalles`) ; la face de bordure au bord de la chaussee et sa bande vue d'en haut (`bordures`). `null` pour ce qui manque.
 */
export function geometrieTrottoirs(profils: readonly ProfilRue[], versLocal: VersLocal, sol: (p: PtBrut) => number, cadre?: Emprise,
  decalage = DECALAGE_CHAUSSEE_M, pas = PAS_CHAUSSEE_M): { dalles: THREE_NS.BufferGeometry | null; bordures: THREE_NS.BufferGeometry | null } {
  const dalles: number[] = [], bordures: number[] = [];
  const haut = decalage + HAUTEUR_TROTTOIR_M;
  for (const p of profils) {
    for (const m of morceaux(p, cadre)) {
      for (const suite of suites(m, 'G')) {
        // A gauche : la bordure au bord de la chaussee, puis le trottoir jusqu'a la limite (decalages croissants).
        const bord = (s: StationRue) => s.chausseeG, coiffe = (s: StationRue) => Math.min(s.chausseeG + LARGEUR_BORDURE_M, s.trottoirG as number);
        bande(suite, coiffe, bord, versLocal, sol, haut, pas, bordures);
        bande(suite, (s) => s.trottoirG as number, coiffe, versLocal, sol, haut, pas, dalles);
        face(suite, bord, versLocal, sol, decalage, haut, pas, bordures);
        face(suite, (s) => s.trottoirG as number, versLocal, sol, 0, haut, pas, dalles);
      }
      for (const suite of suites(m, 'D')) {
        const bord = (s: StationRue) => s.chausseeD, coiffe = (s: StationRue) => Math.max(s.chausseeD - LARGEUR_BORDURE_M, s.trottoirD as number);
        bande(suite, bord, coiffe, versLocal, sol, haut, pas, bordures);
        bande(suite, coiffe, (s) => s.trottoirD as number, versLocal, sol, haut, pas, dalles);
        face(suite, bord, versLocal, sol, decalage, haut, pas, bordures);
        face(suite, (s) => s.trottoirD as number, versLocal, sol, 0, haut, pas, dalles);
      }
    }
  }
  return { dalles: geometrie(dalles), bordures: geometrie(bordures) };
}

/** Ce que la pose demande en plus des profils. */
export interface OptionsChaussees3d {
  /** Le sol en relief en un point du plan ; sans lui, le sol est a zero. */
  hauteurSol?: ((p: PtBrut) => number) | undefined;
  /** Le sol dessine, dans le repere du plan. */
  cadre?: Emprise | undefined;
  /** Les couleurs choisies sous « Rues » ; par defaut celles du plan. */
  couleurs?: CouleursRues;
  /** La couleur de la chaussee, a la place de son jeton. */
  couleur?: string;
}

/** Une maille mate de la couche des chemins, a la couleur donnee assombrie de ce que l'eclairage lui rend. */
function maille(scene: THREE_NS.Object3D, geo: THREE_NS.BufferGeometry, couleur: string, nom: string, deuxFaces: boolean): THREE_NS.Mesh {
  // Mat : ni brillance ni reflet, la couleur d'une carte posee sur le terrain, que le soleil eclaire comme le sol.
  const mat = new THREE.MeshStandardMaterial({ color: couleur, roughness: 1, metalness: 0, ...(deuxFaces ? { side: THREE.DoubleSide } : {}) });
  // Le soleil de la scene et sa courbe de film eclaircissent un sol mat face au ciel : l'ambre du plan y paraissait delave, presque
  // blanc sur le Plan IGN. Assombri d'autant, il se lit a l'ecran de la meme couleur que sur le plan.
  mat.color.multiplyScalar(ATTENUATION_3D);
  poserEnCouche(mat, COUCHES_SOL.chemin);
  percerSol(mat);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = nom;
  mesh.userData[SANS_OMBRE] = true;
  mesh.userData[HORS_EXPORT] = true;
  scene.add(mesh);
  return mesh;
}

/**
 * Pose les rues dans `scene` : la chaussee en une maille, et s'il y en a, les trottoirs et leurs bordures, une maille chacun. Rend la
 * maille de la chaussee, ou `null` s'il n'y avait rien a poser.
 */
export function ajouterChaussees3d(scene: THREE_NS.Object3D, versLocal: VersLocal, profils: readonly ProfilRue[], options: OptionsChaussees3d = {}): THREE_NS.Mesh | null {
  const sol = options.hauteurSol ?? (() => 0);
  const geo = geometrieChaussees(profils, versLocal, sol, options.cadre);
  if (!geo) return null;
  const couleurs = options.couleurs ?? 'plan';
  const chaussee = maille(scene, geo, options.couleur ?? couleurRue('chaussee', couleurs), NOM_CHAUSSEES_3D, false);
  const t = geometrieTrottoirs(profils, versLocal, sol, options.cadre);
  if (t.dalles) maille(scene, t.dalles, couleurRue('trottoir', couleurs), NOM_TROTTOIRS_3D, true);
  if (t.bordures) maille(scene, t.bordures, couleurRue('bordure', couleurs), NOM_BORDURES_3D, true);
  return chaussee;
}

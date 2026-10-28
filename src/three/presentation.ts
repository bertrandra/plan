// La camera et la presentation de la Vue 3D (MD/roadmap-realisme-3d.md, R6) : une focale proche de
// l'oeil a hauteur d'homme, l'heure doree en un geste, une capture en haute definition pour le
// client, et la promenade qui enchaine les points de vue enregistres puis fait le tour de la maison.
//
// Rien de ceci ne touche au projet : ni annulation, ni « projet modifie », ni export. L'heure doree
// regle le soleil de la vue, comme le curseur d'heure.

import type * as THREE_NS from 'three';
import type { SceneVue3d } from './etat3d.js';
import { leverEtCoucher } from '../geo/soleil.js';
import { lireDate } from '../util/date.js';
import { au } from '../util/tableaux.js';
import { centroid, dist, pointInPolygon, shoelace } from '../geometry/basic.js';
import { estBatiment, estPiscine, parcelleDuProjet } from '../model/fonctions.js';
import { estOuvrage, BATIMENT } from '../model/ouvrages/index.js';
import { bordDuBassin } from '../engine/ouvrages/piscine.js';
import { offsetZone } from '../geometry/polygon.js';
import { projectOntoSegment } from '../geometry/segments.js';
import { distancePointContour } from '../geometry/proximite.js';
import type { ObjetPlan, PtBrut } from '../model/types.js';

/** La focale verticale a hauteur d'homme : celle d'un oeil qui regarde devant lui, plus large que la vue d'ensemble. */
export const FOCALE_YEUX_DEG = 55;
/** Celle de la vue d'ensemble (three/scene.ts) : la camera aerienne la garde. */
export const FOCALE_VUE_DEG = 45;
/** En dessous de cette hauteur au-dessus du sol, la camera est a hauteur d'homme ; au-dessus de la seconde, aerienne. */
export const HAUTEUR_HOMME_M = 3;
export const HAUTEUR_AERIENNE_M = 6;

/** La focale voulue a une hauteur de camera au-dessus du sol : de l'oeil a la vue d'ensemble, sans saut. */
export function focaleVoulue(hauteurAuSol: number): number {
  if (hauteurAuSol <= HAUTEUR_HOMME_M) return FOCALE_YEUX_DEG;
  if (hauteurAuSol >= HAUTEUR_AERIENNE_M) return FOCALE_VUE_DEG;
  const t = (hauteurAuSol - HAUTEUR_HOMME_M) / (HAUTEUR_AERIENNE_M - HAUTEUR_HOMME_M);
  return FOCALE_YEUX_DEG + (FOCALE_VUE_DEG - FOCALE_YEUX_DEG) * t;
}

/**
 * Pose la focale voulue a la hauteur de la camera. Elle suit deja la hauteur sans saut
 * (`focaleVoulue`), si bien qu'un mouvement de camera la fait glisser d'elle-meme : une transition
 * de plus, image par image, rendait deux rendus du meme point de vue differents selon l'instant
 * (point 23 de la fumee). `solCentre` : la hauteur du sol au centre de la scene. Rend `true` si la
 * focale a change.
 */
export function accorderFocale(camera: THREE_NS.PerspectiveCamera, solCentre: number): boolean {
  const voulue = focaleVoulue(camera.position.y - solCentre);
  if (Math.abs(voulue - camera.fov) < 0.01) return false;
  camera.fov = voulue;
  camera.updateProjectionMatrix();
  return true;
}

/** Combien de minutes avant le coucher commence l'heure doree. */
export const HEURE_DOREE_AVANT_COUCHER_MIN = 50;

/**
 * L'heure doree du jour choisi, en minutes depuis minuit (heure legale) : une cinquantaine de minutes
 * avant le coucher du soleil. `null` si la date est illisible ou que le soleil ne se couche pas.
 */
export function minutesHeureDoree(dateStr: string, lieu: { latitude: number; longitude: number }): number | null {
  const d = lireDate(dateStr);
  if (!d) return null;
  const lc = leverEtCoucher(d.annee, d.mois, d.jour, lieu.latitude, lieu.longitude);
  if (!lc) return null;
  // `leverEtCoucher` rend des minutes depuis minuit.
  return Math.max(0, Math.round(lc.coucher - HEURE_DOREE_AVANT_COUCHER_MIN));
}

/** Le facteur de definition d'une capture haute definition. */
export const FACTEUR_CAPTURE_HD = 3;

/**
 * Une image de la vue en haute definition : le rendu passe un instant a `facteur` fois sa definition,
 * le temps d'une image, puis revient. Le canevas affiche n'en garde aucune trace.
 */
export function capturerHd(sc: SceneVue3d, rendre: () => void, facteur = FACTEUR_CAPTURE_HD): Promise<Blob | null> {
  const r = sc.renderer;
  const avant = r.getPixelRatio();
  // `setPixelRatio` redimensionne le tampon du canevas ; les passes de l'occlusion suivent (`rapportPixels`).
  const regler = (k: number) => { r.setPixelRatio(k); sc.rapportPixels?.(k); };
  return new Promise((fin) => {
    try {
      regler(avant * facteur);
      rendre();
      // `toBlob` copie l'image a l'appel : la definition peut revenir aussitot.
      r.domElement.toBlob((b) => fin(b), 'image/png');
      regler(avant);
      rendre();
    } catch {
      regler(avant);
      fin(null);
    }
  });
}

// ---- La promenade --------------------------------------------------------------------------------

/**
 * Un point de vue de la promenade, en coordonnees de la scene. `arret` (par defaut) : la camera s'y
 * pose un instant ; sinon elle y passe sans s'arreter (le tour de la maison).
 */
export interface EtapePromenade {
  position: { x: number; y: number; z: number };
  cible: { x: number; y: number; z: number };
  arret?: boolean;
}

/**
 * La duree minimale d'un trajet entre deux arrets, l'arret sur chacun, et l'allure de la marche.
 * Avant, chaque trajet durait 2,6 s quelle que soit sa longueur : vingt metres passaient en un
 * eclair, et six points de vue faisaient une promenade de vingt secondes (« trop courte »). La
 * camera marche maintenant au pas d'un visiteur qui regarde.
 */
export const TRAJET_MS = 4000;
export const ARRET_MS = 2500;
export const VITESSE_MARCHE_M_S = 1.2;

/** Un mouvement doux : lent au depart, lent a l'arrivee. */
export function adoucir(t: number): number {
  const u = Math.max(0, Math.min(1, t));
  return u * u * (3 - 2 * u);
}

type P3 = { x: number; y: number; z: number };
const ecart3 = (a: P3, b: P3) => Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
const melange3 = (a: P3, b: P3, u: number): P3 => ({ x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u, z: a.z + (b.z - a.z) * u });

/** La duree d'un trajet de `longueur` metres, d'un arret au suivant. */
export function dureeTrajetMs(longueur: number): number {
  return Math.max(TRAJET_MS, longueur / VITESSE_MARCHE_M_S * 1000);
}

/** Un trajet d'un arret au suivant : les etapes traversees, leurs distances cumulees, sa duree. */
interface Trajet { etapes: EtapePromenade[]; cumul: number[]; longueur: number; duree: number }

/** Les trajets d'une promenade : la premiere et la derniere etape sont toujours des arrets. */
function trajetsDe(etapes: readonly EtapePromenade[]): Trajet[] {
  const trajets: Trajet[] = [];
  let courant: EtapePromenade[] = [];
  etapes.forEach((e, i) => {
    courant.push(e);
    const arret = i === 0 || i === etapes.length - 1 || e.arret !== false;
    if (arret && courant.length >= 2) {
      const cumul = [0];
      for (let k = 1; k < courant.length; k++) cumul.push(au(cumul, k - 1) + ecart3(au(courant, k - 1).position, au(courant, k).position));
      const longueur = au(cumul, cumul.length - 1);
      trajets.push({ etapes: courant, cumul, longueur, duree: dureeTrajetMs(longueur) });
    }
    if (arret) courant = [e];
  });
  return trajets;
}

/** La duree totale d'une promenade, arrets compris, en millisecondes. */
export function dureePromenade(etapes: readonly EtapePromenade[]): number {
  const t = trajetsDe(etapes);
  return t.reduce((s, x) => s + x.duree, 0) + ARRET_MS * Math.max(0, t.length - 1);
}

/** La position et la cible a l'instant `t` (millisecondes) d'une promenade, ou `null` une fois finie. */
export function instantPromenade(etapes: readonly EtapePromenade[], t: number): EtapePromenade | null {
  if (etapes.length < 2) return null;
  let reste = t;
  const trajets = trajetsDe(etapes);
  for (const [i, tr] of trajets.entries()) {
    if (reste < tr.duree) {
      // Le long du trajet a vitesse douce : la distance parcourue suit `adoucir`, et la cible
      // glisse d'une etape a l'autre au meme rythme que la position.
      const u = adoucir(reste / tr.duree);
      const n = tr.etapes.length;
      let k = 0, f = u;
      if (tr.longueur > 1e-6) {
        const d = u * tr.longueur;
        while (k < n - 2 && au(tr.cumul, k + 1) < d) k++;
        const l = au(tr.cumul, k + 1) - au(tr.cumul, k);
        f = l > 1e-9 ? (d - au(tr.cumul, k)) / l : 1;
      } else {
        k = Math.min(n - 2, Math.floor(u * (n - 1)));
        f = u * (n - 1) - k;
      }
      const a = au(tr.etapes, k), b = au(tr.etapes, k + 1);
      return { position: melange3(a.position, b.position, f), cible: melange3(a.cible, b.cible, f) };
    }
    reste -= tr.duree;
    // Pas d'arret apres le dernier trajet : la promenade est finie.
    if (i === trajets.length - 1) break;
    if (reste < ARRET_MS) { const fin = au(tr.etapes, tr.etapes.length - 1); return { position: { ...fin.position }, cible: { ...fin.cible } }; }
    reste -= ARRET_MS;
  }
  return null;
}

// ---- Le tour de la maison ------------------------------------------------------------------------

/** La distance voulue aux murs de la maison, et la plus courte acceptee la ou la parcelle se resserre. */
export const ECART_MAISON_M = 3;
export const ECART_MAISON_MIN_M = 1.2;
/** La distance gardee a la limite de la parcelle (la cloture) et aux autres batiments. */
export const MARGE_LIMITE_M = 0.6;
/** L'espacement des points du tour, le long du chemin. */
export const PAS_TOUR_M = 2;
/** La hauteur des yeux au-dessus du sol. */
export const YEUX_M = 1.65;
/** Le regard pendant le tour : la part du sens de la marche (le reste vers la maison), et sa portee. */
export const PART_MARCHE_REGARD = 0.55;
export const PORTEE_REGARD_M = 5;

/** L'enveloppe convexe d'un contour (chaine monotone) : le tour contourne les decrochements. */
export function enveloppeConvexe(pts: readonly PtBrut[]): PtBrut[] {
  const p = [...pts].sort((a, b) => a.x - b.x || a.y - b.y);
  if (p.length < 3) return p;
  const croix = (o: PtBrut, a: PtBrut, b: PtBrut) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const bas: PtBrut[] = [], haut: PtBrut[] = [];
  for (const q of p) { while (bas.length >= 2 && croix(au(bas, bas.length - 2), au(bas, bas.length - 1), q) <= 0) bas.pop(); bas.push(q); }
  for (const q of [...p].reverse()) { while (haut.length >= 2 && croix(au(haut, haut.length - 2), au(haut, haut.length - 1), q) <= 0) haut.pop(); haut.push(q); }
  return bas.slice(0, -1).concat(haut.slice(0, -1));
}

/** Le point d'un contour ferme le plus proche de `p`. */
function plusProcheSurContour(p: PtBrut, contour: readonly PtBrut[]): PtBrut {
  let meilleur = au(contour, 0), dmin = Infinity;
  contour.forEach((a, i) => {
    const q = projectOntoSegment(p, a, au(contour, (i + 1) % contour.length));
    const d = dist(p, q);
    if (d < dmin) { dmin = d; meilleur = q; }
  });
  return meilleur;
}

/** Deux segments se coupent-ils (hors simple contact) ? */
function seCoupent(a: PtBrut, b: PtBrut, c: PtBrut, d: PtBrut): boolean {
  const o = (p: PtBrut, q: PtBrut, r: PtBrut) => Math.sign((q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x));
  return o(a, b, c) * o(a, b, d) < 0 && o(c, d, a) * o(c, d, b) < 0;
}

/** Le segment traverse-t-il le contour (un mur), ou passe-t-il dedans ? */
export function traverse(a: PtBrut, b: PtBrut, contour: readonly PtBrut[]): boolean {
  if (pointInPolygon({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, contour)) return true;
  return contour.some((c, i) => seCoupent(a, b, c, au(contour, (i + 1) % contour.length)));
}

/** Ce qui borne le tour de la maison, en coordonnees du plan. */
export interface TerrainDuTour {
  maison: readonly PtBrut[];
  parcelle: readonly PtBrut[];
  /** Les autres batiments (annexes, abri, voisins mitoyens) : le tour n'y entre pas. */
  obstacles: readonly (readonly PtBrut[])[];
}

/**
 * Les points du tour de la maison, en coordonnees du plan, dans l'ordre de la marche : sur une
 * ligne a `ECART_MAISON_M` de son enveloppe (coins arrondis), rapproches jusqu'a
 * `ECART_MAISON_MIN_M` la ou la parcelle se resserre, jamais hors de la parcelle ni dans un autre
 * batiment, et sans qu'un pas ne traverse un mur. `boucle` : le tour est complet. Une maison
 * mitoyenne, ou collee a la limite, ne se contourne pas : on longe alors la plus longue part
 * accessible. `null` s'il n'y a pas trois points ou passer.
 */
export function pointsDuTour(t: TerrainDuTour): { points: PtBrut[]; boucle: boolean } | null {
  if (t.maison.length < 3 || t.parcelle.length < 3) return null;
  const env = enveloppeConvexe(t.maison);
  if (env.length < 3) return null;
  const anneau = offsetZone(env, ECART_MAISON_M);
  // Le chemin ideal, repris a pas regulier.
  const echantillons: PtBrut[] = [];
  anneau.forEach((a, i) => {
    const b = au(anneau, (i + 1) % anneau.length);
    const n = Math.max(1, Math.round(dist(a, b) / PAS_TOUR_M));
    for (let k = 0; k < n; k++) echantillons.push({ x: a.x + (b.x - a.x) * k / n, y: a.y + (b.y - a.y) * k / n });
  });
  const libre = (q: PtBrut) => pointInPolygon(q, t.parcelle) && distancePointContour(q, t.parcelle) >= MARGE_LIMITE_M
    && !pointInPolygon(q, t.maison)
    && t.obstacles.every(o => o.length < 3 || (!pointInPolygon(q, o) && distancePointContour(q, o) >= MARGE_LIMITE_M));
  // Chaque point, rapproche de la maison s'il le faut ; `null` la ou l'on ne passe pas.
  const places = echantillons.map((q) => {
    const pied = plusProcheSurContour(q, env);
    const l = dist(q, pied) || 1;
    const n = { x: (q.x - pied.x) / l, y: (q.y - pied.y) / l };
    for (let d = ECART_MAISON_M; d >= ECART_MAISON_MIN_M - 1e-9; d -= 0.3) {
      const c = { x: pied.x + n.x * d, y: pied.y + n.y * d };
      if (libre(c)) return c;
    }
    return null;
  });
  const murs = [t.maison, env, ...t.obstacles].filter(o => o.length >= 3);
  const passe = (a: PtBrut, b: PtBrut) => !murs.some(m => traverse(a, b, m));
  const N = places.length;
  // Coupures : un point ou l'on ne passe pas, ou un pas qui traverserait un mur.
  const coupe = places.map((q, i) => { const r = places[(i + 1) % N]; return !q || !r || !passe(q, r); });
  if (!coupe.some(Boolean)) return { points: places.filter((q): q is PtBrut => !!q), boucle: true };
  // Le plus long arc sans coupure, en tournant depuis une coupure.
  let meilleur: PtBrut[] = [];
  const depart = coupe.indexOf(true);
  let courant: PtBrut[] = [];
  for (let k = 1; k <= N; k++) {
    const i = (depart + k) % N;
    const q = places[i];
    if (q) courant.push(q);
    if (coupe[i]) { if (courant.length > meilleur.length) meilleur = courant; courant = []; }
  }
  if (courant.length > meilleur.length) meilleur = courant;
  return meilleur.length >= 3 ? { points: meilleur, boucle: false } : null;
}

/**
 * Les etapes du tour de la maison, en coordonnees de la scene : les yeux a `YEUX_M` au-dessus du sol
 * sous chaque point, le regard devant soi, tourne vers la maison. On y passe sans s'arreter. `cen` : le centre de la
 * scene ; `hauteurSol` : le sol en relief (absent : plat).
 */
export function tourDeLaMaison(t: TerrainDuTour, cen: PtBrut, hauteurSol: (p: PtBrut) => number = () => 0): { etapes: EtapePromenade[]; boucle: boolean } | null {
  const tour = pointsDuTour(t);
  if (!tour) return null;
  const centre = centroid(enveloppeConvexe(t.maison));
  const pts = tour.points, n = pts.length;
  // Le regard entre le sens de la marche et la maison : a trois metres des murs, viser le centre
  // de la maison ne montrait qu'un pan de mur ; regarder devant soi, en biais vers elle, montre la
  // facade en fuite et le jardin ou l'on va.
  const etapes: EtapePromenade[] = pts.map((p, i) => {
    const avant = tour.boucle ? au(pts, (i + 1) % n) : au(pts, Math.min(n - 1, i + 1));
    const apres = tour.boucle ? au(pts, (i - 1 + n) % n) : au(pts, Math.max(0, i - 1));
    const unite = (x: number, y: number) => { const l = Math.hypot(x, y) || 1; return { x: x / l, y: y / l }; };
    const marche = unite(avant.x - apres.x, avant.y - apres.y), versMaison = unite(centre.x - p.x, centre.y - p.y);
    const regard = unite(marche.x * PART_MARCHE_REGARD + versMaison.x * (1 - PART_MARCHE_REGARD), marche.y * PART_MARCHE_REGARD + versMaison.y * (1 - PART_MARCHE_REGARD));
    const vise = { x: p.x + regard.x * PORTEE_REGARD_M, y: p.y + regard.y * PORTEE_REGARD_M };
    const yeux = hauteurSol(p) + YEUX_M;
    return { position: { x: p.x - cen.x, y: yeux, z: cen.y - p.y }, cible: { x: vise.x - cen.x, y: yeux, z: cen.y - vise.y }, arret: false };
  });
  // Une boucle se referme sur son point de depart.
  const premier = etapes[0];
  if (tour.boucle && premier) etapes.push({ ...premier, position: { ...premier.position }, cible: { ...premier.cible } });
  return { etapes, boucle: tour.boucle };
}

/**
 * La promenade entiere : les points de vue enregistres, chacun un arret, puis le tour de la maison,
 * pris au point le plus proche du dernier point de vue, jusqu'a s'arreter a la fin du tour. Entre
 * deux points de vue dont la ligne droite traverserait la maison (`maison`, en coordonnees de la
 * scene, x et z), la camera la contourne par le tour, du cote le plus court. Sans tour, les points
 * de vue seuls, comme avant.
 */
export function composerPromenade(vues: readonly EtapePromenade[], tour: { etapes: EtapePromenade[]; boucle: boolean } | null, maison: readonly { x: number; z: number }[] = []): EtapePromenade[] {
  const arrets = vues.map((v) => ({ ...v, arret: true }));
  if (!tour || tour.etapes.length < 2) return arrets;
  const anneau = tour.boucle ? tour.etapes.slice(0, -1) : tour.etapes;
  const n = anneau.length;
  const plan = (p: P3): PtBrut => ({ x: p.x, y: p.z });
  const murs = maison.map((p) => ({ x: p.x, y: p.z }));
  const plusProche = (p: P3) => { let k = 0, d = Infinity; anneau.forEach((e, i) => { const x = ecart3(e.position, p); if (x < d) { d = x; k = i; } }); return k; };
  /** Le chemin sur le tour d'un indice a l'autre, du cote le plus court (le seul, sur un arc). */
  const parLeTour = (i: number, j: number): EtapePromenade[] => {
    if (!tour.boucle) {
      const pas = i <= j ? 1 : -1;
      return Array.from({ length: Math.abs(j - i) + 1 }, (_, k) => au(anneau, i + pas * k));
    }
    const avant = (j - i + n) % n, arriere = (i - j + n) % n;
    const pas = avant <= arriere ? 1 : -1;
    return Array.from({ length: Math.min(avant, arriere) + 1 }, (_, k) => au(anneau, ((i + pas * k) % n + n) % n));
  };
  const out: EtapePromenade[] = [];
  arrets.forEach((v) => {
    const prec = out[out.length - 1];
    if (prec && murs.length >= 3 && traverse(plan(prec.position), plan(v.position), murs)) {
      out.push(...parLeTour(plusProche(prec.position), plusProche(v.position)).map((e) => ({ ...e, cible: v.cible, arret: false })));
    }
    out.push(v);
  });
  // Le tour, depuis le point le plus proche du dernier arret (ou du debut, sans point de vue).
  const dernier = out[out.length - 1];
  const k = dernier ? plusProche(dernier.position) : 0;
  const ordre = tour.boucle ? Array.from({ length: n + 1 }, (_, m) => au(anneau, (k + m) % n))
    : (k > (n - 1) / 2 ? [...anneau].reverse() : [...anneau]);
  out.push(...ordre.map((e) => ({ ...e, arret: false })));
  const fin = out[out.length - 1];
  if (fin) out[out.length - 1] = { ...fin, arret: true };
  return out;
}

let promenadeEnCours: { arreter: () => void } | null = null;

export function promenadeActive(): boolean {
  return promenadeEnCours !== null;
}

/**
 * Lance la promenade : la camera part du premier point de vue et enchaine les suivants. Un geste de
 * l'utilisateur sur la vue (les controles d'orbite qui demarrent) l'arrete, comme la commande.
 * `fin` est appelee a l'arret, quel qu'il soit.
 */
export function lancerPromenade(sc: SceneVue3d, etapes: readonly EtapePromenade[], fin: () => void): void {
  arreterPromenade();
  if (etapes.length < 2 || typeof requestAnimationFrame !== 'function') return;
  const depart = performance.now();
  let raf = 0;
  const controles = sc.controls as unknown as { addEventListener?: (e: string, f: () => void) => void; removeEventListener?: (e: string, f: () => void) => void };
  const arreter = () => {
    cancelAnimationFrame(raf);
    controles.removeEventListener?.('start', arreter);
    promenadeEnCours = null;
    fin();
  };
  controles.addEventListener?.('start', arreter);
  const pas = () => {
    const e = instantPromenade(etapes, performance.now() - depart);
    if (!e) { arreter(); return; }
    sc.camera.position.set(e.position.x, e.position.y, e.position.z);
    sc.controls.target.set(e.cible.x, e.cible.y, e.cible.z);
    sc.controls.update();
    raf = requestAnimationFrame(pas);
  };
  promenadeEnCours = { arreter };
  pas();
}

export function arreterPromenade(): void {
  promenadeEnCours?.arreter();
}

/**
 * Le terrain du tour, lu dans le plan : la maison est le plus grand batiment (hors annexe, s'il y en
 * a un) pose sur la parcelle du projet ; les obstacles, les autres batiments et le bassin des
 * piscines. Un objet masque ne compte pas. `null` sans parcelle ni maison.
 */
export function terrainDuTour(objets: ObjetPlan[]): TerrainDuTour | null {
  const parcelle = parcelleDuProjet(objets);
  if (!parcelle || parcelle.type !== 'polygon' || parcelle.pts.length < 3) return null;
  const visibles = objets.filter((o) => !o.hidden);
  const batiments = visibles.filter((o): o is ObjetPlan & { type: 'polygon' } => estBatiment(o) && o.type === 'polygon' && o.pts.length >= 3);
  const surParcelle = batiments.filter((o) => !o.voisinage && pointInPolygon(centroid(o.pts), parcelle.pts));
  const principaux = surParcelle.filter((o) => estOuvrage(o, BATIMENT));
  const candidats = principaux.length ? principaux : surParcelle;
  const maison = candidats.reduce<(ObjetPlan & { type: 'polygon' }) | null>((m, o) => (!m || shoelace(o.pts) > shoelace(m.pts) ? o : m), null);
  if (!maison) return null;
  const obstacles: PtBrut[][] = batiments.filter((o) => o !== maison).map((o) => o.pts);
  visibles.filter(estPiscine).forEach((o) => { const bord = bordDuBassin(o); if (bord) obstacles.push(bord); });
  return { maison: maison.pts, parcelle: parcelle.pts, obstacles };
}

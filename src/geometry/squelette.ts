// Le squelette droit d'un polygone (MD/spec-toit-ign.md §3).
//
// Chaque cote avance vers l'interieur a vitesse 1. Le front, un ou plusieurs anneaux de sommets
// actifs, se deforme jusqu'a disparaitre ; la trace de ses sommets est le squelette. Pose a la
// hauteur `t · tan(pente)`, c'est le toit a croupes du contour : un pan par cote, des aretiers aux
// angles sortants, des noues aux angles rentrants, un faitage ou deux fronts se rejoignent.
//
// Deux sortes d'evenements, a la maniere de Felkel et Obdrzalek :
// - **arete** : un morceau de front se reduit a rien ; ses deux sommets se fondent en un seul ;
// - **partage** : un sommet rentrant perce un cote d'en face ; l'anneau se coupe en deux.
//
// A chaque pas, tous les evenements sont recalcules et le plus proche est traite : O(n³), sans
// importance pour une maison (une trentaine de sommets). Le resultat est ensuite **verifie** —
// chaque pan dans son plan, les aires qui se somment a celle du contour — et un squelette faux rend
// `null` plutot qu'un toit troue : l'appelant a un repli.

import { au } from '../util/tableaux.js';
import { sommetDe } from './anneau.js';
import { signedArea } from './basic.js';
import type { PtBrut } from '../model/types.js';

/** Un point du squelette : sa position et l'instant ou le front y passe (sa distance au bord). */
export interface PointSquelette {
  x: number;
  y: number;
  t: number;
}

export interface Squelette {
  /** Un pan par cote du contour : `pans[k].cote` est l'indice du cote pts[cote] → pts[cote + 1]. */
  pans: { cote: number; contour: PointSquelette[] }[];
  /** L'instant du dernier evenement : la profondeur du squelette, la hauteur de son point culminant a 45°. */
  dmax: number;
}

const EPS = 1e-7;
const MAX_SOMMETS = 200;

interface Cote {
  /** Origine et direction unitaire du cote, dans le sens trigonometrique du contour. */
  ox: number;
  oy: number;
  dx: number;
  dy: number;
  /** Normale unitaire vers l'interieur. */
  nx: number;
  ny: number;
}

interface Actif {
  x: number;
  y: number;
  /** Vitesse : le sommet reste sur ses deux cotes, qui avancent a vitesse 1. */
  vx: number;
  vy: number;
  avant: number;
  apres: number;
  /** Le noeud d'ou il part. */
  depart: number;
  rentrant: boolean;
}

interface Evenement {
  dt: number;
  anneau: number;
  /** Le sommet qui declenche : son morceau de front se ferme (arete), ou il perce un cote (partage). */
  i: number;
  /** Partage seulement : le sommet au debut du morceau de front perce. */
  j: number;
  partage: boolean;
}

interface Arc {
  a: number;
  b: number;
  /** Les deux pans que l'arc separe. */
  c1: number;
  c2: number;
}

/** La vitesse d'un sommet entre deux cotes : v·n1 = 1 et v·n2 = 1. */
function vitesse(c1: Cote, c2: Cote): { vx: number; vy: number; rentrant: boolean } {
  const croix = c1.dx * c2.dy - c1.dy * c2.dx;
  const scal = c1.dx * c2.dx + c1.dy * c2.dy;
  if (Math.abs(croix) < 1e-9) {
    // Deux cotes alignes : le sommet avance avec eux. Deux cotes opposes et confondus : il ne bouge plus.
    return scal > 0 ? { vx: c1.nx, vy: c1.ny, rentrant: false } : { vx: 0, vy: 0, rentrant: false };
  }
  const det = c1.nx * c2.ny - c1.ny * c2.nx;
  return { vx: (c2.ny - c1.ny) / det, vy: (c1.nx - c2.nx) / det, rentrant: croix < 0 };
}

/** Le prochain evenement du front : le plus proche, l'arete avant le partage a egalite. */
function prochainEvenement(anneaux: readonly Actif[][], cotes: readonly Cote[], T: number): Evenement | null {
  let meilleur: Evenement | null = null;
  const proposer = (dt: number, anneau: number, i: number, j: number, partage: boolean) => {
    if (dt < -EPS) return;
    const d = Math.max(0, dt);
    // A egalite, l'arete avant le partage : un morceau de front deja nul se referme d'abord.
    if (!meilleur || d < meilleur.dt - EPS || (d < meilleur.dt + EPS && !partage && meilleur.partage)) {
      meilleur = { dt: d, anneau, i, j, partage };
    }
  };
  anneaux.forEach((a, ia) => {
    const m = a.length;
    for (let i = 0; i < m; i++) {
      const s = au(a, i),
        u = sommetDe(a, i + 1);
      const c = au(cotes, s.apres);
      // Arete : la longueur du morceau de front s -> u, le long de son cote.
      const long = (u.x - s.x) * c.dx + (u.y - s.y) * c.dy;
      const vit = (u.vx - s.vx) * c.dx + (u.vy - s.vy) * c.dy;
      if (long <= EPS) proposer(0, ia, i, 0, false);
      else if (vit < -1e-12) proposer(-long / vit, ia, i, 0, false);
      // Partage : un sommet rentrant contre un cote d'en face.
      if (!s.rentrant) continue;
      for (let j = 0; j < m; j++) {
        const b = au(a, j),
          e = sommetDe(a, j + 1);
        const k = b.apres;
        if (k === s.avant || k === s.apres) continue;
        const ce = au(cotes, k);
        const d0 = ce.nx * (s.x - ce.ox) + ce.ny * (s.y - ce.oy) - T;
        const approche = 1 - (ce.nx * s.vx + ce.ny * s.vy);
        if (approche <= 1e-12 || d0 < -EPS) continue;
        const dt = Math.max(0, d0) / approche;
        // Le point d'impact doit tomber sur le morceau de front du cote k a cet instant.
        const px = s.x + s.vx * dt,
          py = s.y + s.vy * dt;
        const sb = (b.x + b.vx * dt - px) * ce.dx + (b.y + b.vy * dt - py) * ce.dy;
        const se = (e.x + e.vx * dt - px) * ce.dx + (e.y + e.vy * dt - py) * ce.dy;
        if (sb <= EPS && se >= -EPS) proposer(dt, ia, i, j, true);
      }
    }
  });
  return meilleur;
}

/**
 * Le squelette droit d'un polygone simple, dans n'importe quel sens de parcours. `null` si le
 * contour est degenere, trop grand, ou si le squelette obtenu ne se verifie pas.
 */
export function squeletteDroit(entree: readonly PtBrut[]): Squelette | null {
  // Sommets confondus retires : ils ne portent aucun pan. Un sommet plat, lui, reste : ses deux
  // cotes avancent ensemble et le pan de chacun est borde par une arete verticale a son pied.
  const indices: number[] = [];
  entree.forEach((p, i) => {
    const q = sommetDe(entree, i + 1);
    if (Math.hypot(q.x - p.x, q.y - p.y) > 1e-6) indices.push(i);
  });
  if (indices.length < 3 || indices.length > MAX_SOMMETS) return null;
  const aire = signedArea(indices.map((i) => au(entree, i)));
  if (Math.abs(aire) < 1e-6) return null;
  // Travail dans le sens trigonometrique ; `origine[k]` rend le cote du contour d'entree.
  const ordre = aire > 0 ? indices : [...indices].reverse();
  const pts = ordre.map((i) => au(entree, i));
  const n = pts.length;
  // Le cote k va de pts[k] a pts[k+1]. Dans l'entree parcourue a l'envers, c'est le cote qui part
  // de pts[k+1].
  const origine = ordre.map((i, k) => (aire > 0 ? i : sommetDe(ordre, k + 1)));

  const cotes: Cote[] = pts.map((p, k) => {
    const q = sommetDe(pts, k + 1);
    const l = Math.hypot(q.x - p.x, q.y - p.y);
    const dx = (q.x - p.x) / l,
      dy = (q.y - p.y) / l;
    return { ox: p.x, oy: p.y, dx, dy, nx: -dy, ny: dx };
  });

  const noeuds: PointSquelette[] = [];
  const noeud = (x: number, y: number, t: number): number => {
    for (let i = 0; i < noeuds.length; i++) {
      const m = au(noeuds, i);
      if (Math.abs(m.x - x) < 1e-6 && Math.abs(m.y - y) < 1e-6) return i;
    }
    noeuds.push({ x, y, t });
    return noeuds.length - 1;
  };
  const arcs: Arc[] = [];
  const tracer = (a: number, b: number, c1: number, c2: number) => {
    if (a !== b) arcs.push({ a, b, c1, c2 });
  };

  const actif = (x: number, y: number, avant: number, apres: number, depart: number): Actif => ({
    x, y, avant, apres, depart, ...vitesse(au(cotes, avant), au(cotes, apres)),
  });
  let anneaux: Actif[][] = [pts.map((p, k) => actif(p.x, p.y, (k + n - 1) % n, k, noeud(p.x, p.y, 0)))];
  let T = 0;

  /**
   * Termine un anneau qui n'enferme plus rien : moins de trois sommets, ou une aire nulle (deux
   * morceaux de front opposes se sont rejoints, c'est un faitage). Chaque sommet trace son dernier
   * arc ; chaque morceau de front devient une arete du pan de son cote.
   */
  const clore = (anneau: Actif[]) => {
    const fins = anneau.map((s) => {
      const f = noeud(s.x, s.y, T);
      tracer(s.depart, f, s.avant, s.apres);
      return f;
    });
    if (anneau.length >= 2) anneau.forEach((s, i) => tracer(au(fins, i), sommetDe(fins, i + 1), s.apres, s.apres));
  };
  const vide = (anneau: Actif[]) => {
    if (anneau.length < 3) return true;
    let perimetre = 0;
    anneau.forEach((s, i) => {
      const u = sommetDe(anneau, i + 1);
      perimetre += Math.hypot(u.x - s.x, u.y - s.y);
    });
    return Math.abs(signedArea(anneau)) < 1e-7 * Math.max(1, perimetre);
  };

  for (let pas = 0; pas < 20 * n + 100; pas++) {
    anneaux = anneaux.filter((a) => {
      if (!vide(a)) return true;
      clore(a);
      return false;
    });
    if (!anneaux.length) break;

    const ev = prochainEvenement(anneaux, cotes, T);
    if (!ev) return null;

    // Tout le front avance jusqu'a l'evenement.
    T += ev.dt;
    for (const a of anneaux)
      for (const s of a) {
        s.x += s.vx * ev.dt;
        s.y += s.vy * ev.dt;
      }

    const a = au(anneaux, ev.anneau);
    const m = a.length;
    const s = au(a, ev.i);
    if (!ev.partage) {
      const u = sommetDe(a, ev.i + 1);
      const x = (s.x + u.x) / 2,
        y = (s.y + u.y) / 2;
      const f = noeud(x, y, T);
      tracer(s.depart, f, s.avant, s.apres);
      tracer(u.depart, f, u.avant, u.apres);
      // Le nouveau sommet prend la place de s ; u disparait.
      const neuf = actif(x, y, s.avant, u.apres, f);
      anneaux[ev.anneau] = a.map((q) => (q === s ? neuf : q)).filter((q) => q !== u);
    } else {
      const b = au(a, ev.j);
      const f = noeud(s.x, s.y, T);
      tracer(s.depart, f, s.avant, s.apres);
      const v1 = actif(s.x, s.y, s.avant, b.apres, f);
      const v2 = actif(s.x, s.y, b.apres, s.apres, f);
      // Anneau 1 : v1, puis de e (apres b) jusqu'au sommet avant s. Anneau 2 : v2, puis du sommet
      // apres s jusqu'a b.
      const un: Actif[] = [v1];
      for (let k = (ev.j + 1) % m; k !== ev.i; k = (k + 1) % m) un.push(au(a, k));
      const deux: Actif[] = [v2];
      for (let k = (ev.i + 1) % m; k !== (ev.j + 1) % m; k = (k + 1) % m) deux.push(au(a, k));
      anneaux.splice(ev.anneau, 1, un, deux);
    }
  }
  if (anneaux.length) return null;

  const dmax = noeuds.reduce((mx, q) => Math.max(mx, q.t), 0);
  const pans = assemblerPans(pts, cotes, noeuds, arcs);
  if (!pans) return null;
  return { pans: pans.map((contour, k) => ({ cote: au(origine, k), contour })), dmax };
}

/**
 * Chaque pan est borde par son cote et par les arcs qui le separent de ses voisins : on les
 * enchaine depuis la fin du cote jusqu'a son debut. Puis on verifie.
 */
function assemblerPans(pts: readonly PtBrut[], cotes: readonly Cote[], noeuds: readonly PointSquelette[], arcs: readonly Arc[]): PointSquelette[][] | null {
  const n = pts.length;
  const pans: PointSquelette[][] = [];
  let aireTotale = 0;
  for (let k = 0; k < n; k++) {
    const debut = k,
      fin = (k + 1) % n;
    const miens = arcs.filter((a) => a.c1 === k || a.c2 === k);
    const utilise = new Set<number>();
    const chaine = [debut, fin];
    let courant = fin;
    while (courant !== debut) {
      const i = miens.findIndex((a, idx) => !utilise.has(idx) && (a.a === courant || a.b === courant));
      if (i < 0) return null;
      utilise.add(i);
      const arc = au(miens, i);
      courant = arc.a === courant ? arc.b : arc.a;
      if (courant !== debut) chaine.push(courant);
      if (chaine.length > noeuds.length + 2) return null;
    }
    const contour = chaine.map((i) => au(noeuds, i));
    // Chaque point du pan est a la distance t du cote : le pan est bien un plan.
    const c = au(cotes, k);
    for (const q of contour) if (Math.abs(c.nx * (q.x - c.ox) + c.ny * (q.y - c.oy) - q.t) > 1e-5) return null;
    const a = signedArea(contour);
    if (a < -1e-6) return null;
    aireTotale += a;
    pans.push(contour);
  }
  const aire = signedArea(pts);
  if (Math.abs(aireTotale - aire) > 1e-6 * Math.max(1, aire)) return null;
  return pans;
}

/**
 * Demi-largeur approchee d'un contour : la moitie de sa plus petite etendue, mesuree dans le repere
 * de son plus long cote. Le repli quand le squelette ne se calcule pas.
 */
export function demiLargeurApprochee(pts: readonly PtBrut[]): number {
  let best = 0,
    ang = 0;
  pts.forEach((a, i) => {
    const b = sommetDe(pts, i + 1);
    const l = Math.hypot(b.x - a.x, b.y - a.y);
    if (l > best) {
      best = l;
      ang = Math.atan2(b.y - a.y, b.x - a.x);
    }
  });
  const ux = Math.cos(ang),
    uy = Math.sin(ang);
  let umin = Infinity,
    umax = -Infinity,
    vmin = Infinity,
    vmax = -Infinity;
  for (const p of pts) {
    const u = p.x * ux + p.y * uy,
      v = -p.x * uy + p.y * ux;
    umin = Math.min(umin, u);
    umax = Math.max(umax, u);
    vmin = Math.min(vmin, v);
    vmax = Math.max(vmax, v);
  }
  return Math.min(umax - umin, vmax - vmin) / 2;
}

// Forme du toit d'un batiment (MD/spec-releve-facade.md §8).
//
// Un toit simple est l'enveloppe basse de quelques plans : deux pans, c'est le plus bas de deux
// plans qui montent du bord vers le faitage ; quatre pans, le plus bas de quatre ; un appentis, un
// seul plan incline ; un toit plat, le plan de l'egout. Decrire le toit ainsi le rend valable sur
// n'importe quel contour, pas seulement sur un rectangle : chaque pan est le morceau du contour ou
// son plan est le plus bas, et les pignons sont les murs sous lesquels la hauteur du toit n'est pas
// nulle.
//
// La forme `croupes` est a part : un pan par mur, tous de meme pente, poses sur le squelette droit du
// contour (geometry/squelette.ts, MD/spec-toit-ign.md §3). C'est le toit qu'on deduit de la BD TOPO ;
// sur un rectangle, il se confond avec le quatre pans.
//
// Le repere est celui du faitage : `u` le long du faitage, `v` en travers. Les etendues du contour
// sur ces deux axes donnent la demi-largeur (du bord au faitage) et la demi-longueur.

import { au } from '../../util/tableaux.js';
import { sommetDe } from '../../geometry/anneau.js';
import type { PtBrut, Toit, FormeToit } from '../../model/types.js';
import { signedArea, pointInPolygon } from '../../geometry/basic.js';
import { squeletteDroit, demiLargeurApprochee } from '../../geometry/squelette.js';
import { estFormeSimple, FORMES_TOIT_SIMPLES, toitDessine } from '../../model/formeToit.js';

export * from './toit/estimation.js';

export type { Toit, FormeToit };

/** Couleur par defaut d'une couverture : tuile rouge (MD/spec-toit-ign.md §6). */
export const COULEUR_TOIT_DEFAUT = '#B0432F';

/**
 * Le nom de chaque forme. Les formes du catalogue (MD/spec-regles-toits.md §3.1) ne se choisissent
 * pas dans les menus tant que la 3D ne les dessine pas (`FORMES_TOIT_SIMPLES`) : elles se nomment
 * seulement, quand une observation ou les corps les disent.
 */
export const LIBELLES_FORME_TOIT: Record<FormeToit, string> = {
  plat: 'Toit plat',
  appentis: 'Appentis (un pan)',
  'deux-pans': 'Deux pans',
  'quatre-pans': 'Quatre pans',
  croupes: 'Croupes (pans sur chaque mur)',
  'demi-croupes': 'Demi-croupes',
  pavillon: 'Pavillon (pyramide)',
  mansart: 'Toit à la Mansart',
  gambrel: 'Gambrel (brisé sur les longs pans)',
  asymetrique: 'Deux pans asymétriques',
  'deux-pans-decales': 'Deux pans décalés',
  'toit-en-m': 'Toit en M',
  papillon: 'Papillon (en V)',
  coyau: 'Deux pans à coyau',
  shed: 'Shed (dents de scie)',
  berceau: 'Berceau (voûte)',
  carene: 'Carène',
  conique: 'Conique (poivrière)',
  polygonal: 'Polygonal',
  fleche: 'Flèche',
  dome: 'Dôme',
  imperiale: 'Impériale (bulbe)',
};

/**
 * Les formes proposees dans un menu de choix : les formes simples, et la forme en place si c'en est
 * une autre (elle reste proposee, comme la fonction d'un ancien fichier dans le menu « Fonction »).
 */
export function formesAuChoix(enPlace?: FormeToit | null): FormeToit[] {
  return enPlace && !estFormeSimple(enPlace) ? [...FORMES_TOIT_SIMPLES, enPlace] : [...FORMES_TOIT_SIMPLES];
}

/** Un plan de toit : z = a x + b y + c, en metres au-dessus de l'egout. */
export interface PlanToit {
  a: number;
  b: number;
  c: number;
}

export interface P3 {
  x: number;
  y: number;
  z: number;
}

import { angleDuPlusLongCote, repereFaitage } from '../../geometry/faitage.js';

const rad = (d: number) => (d * Math.PI) / 180;

// L'axe d'un contour et le repere du faitage sont de la geometrie pure : geometry/faitage.ts.
export { angleDuPlusLongCote, repereFaitage } from '../../geometry/faitage.js';

/** Pente d'un toit, en degres, pour affichage. */
export function penteDeg(pts: readonly PtBrut[], toitLu: Toit): number {
  const toit = toitDessine(toitLu);
  if (toit.forme === 'plat' || toit.hauteur <= 0) return 0;
  if (toit.forme === 'croupes') {
    if (toit.pente !== undefined) return toit.pente;
    const d = profondeurToit(pts);
    return d > 0 ? (Math.atan(toit.hauteur / d) * 180) / Math.PI : 0;
  }
  const r = repereFaitage(pts, toit.angleFaitage);
  const course = toit.forme === 'appentis' ? 2 * r.hw : r.hw;
  return course > 0 ? (Math.atan(toit.hauteur / course) * 180) / Math.PI : 0;
}

/**
 * Les plans du toit. Un plan `z = s (k - (v - v0))` s'ecrit `a x + b y + c` en developpant
 * `v = x vx + y vy`.
 */
export function plansDuToit(pts: readonly PtBrut[], toitLu: Toit): PlanToit[] {
  // Une forme du catalogue se dessine en sa forme simple la plus proche (model/formeToit.ts).
  const toit = toitDessine(toitLu);
  const H = Math.max(0, toit.hauteur);
  // Des croupes decrites en plans : le quatre pans sur l'enveloppe, qui les approche. Seul
  // `facettesToit` pose les vraies (le squelette).
  if (toit.forme === 'plat' || H === 0) return [{ a: 0, b: 0, c: 0 }];
  const r = repereFaitage(pts, toit.angleFaitage);
  if (r.hw <= 0) return [{ a: 0, b: 0, c: 0 }];
  // z = s * (k + signe * (w - w0)) ou w = x wx + y wy
  const plan = (s: number, k: number, signe: number, wx: number, wy: number, w0: number): PlanToit => ({
    a: s * signe * wx,
    b: s * signe * wy,
    c: s * (k - signe * w0),
  });
  if (toit.forme === 'appentis') {
    // Monte de v = v0 - hw (egout bas, z = 0) a v = v0 + hw (z = H).
    const s = H / (2 * r.hw);
    return [plan(s, r.hw, 1, r.vx, r.vy, r.v0)];
  }
  const s = H / r.hw;
  const pans = [plan(s, r.hw, -1, r.vx, r.vy, r.v0), plan(s, r.hw, 1, r.vx, r.vy, r.v0)];
  if (toit.forme === 'deux-pans') return pans;
  // Quatre pans : les croupes ont la meme pente que les longs pans. Si le batiment est plus large que
  // long, le "faitage" se reduit a un point, ce qui reste un toit valable (en pavillon).
  return [...pans, plan(s, r.hl, -1, r.ux, r.uy, r.u0), plan(s, r.hl, 1, r.ux, r.uy, r.u0)];
}

const zDe = (p: PlanToit, q: PtBrut) => p.a * q.x + p.b * q.y + p.c;

/** Hauteur du toit au-dessus de l'egout en un point du plan : l'enveloppe basse, jamais negative. */
export function hauteurToitEn(plans: readonly PlanToit[], q: PtBrut): number {
  let z = Infinity;
  for (const p of plans) z = Math.min(z, zDe(p, q));
  return Math.max(0, z);
}

/** Coupe un polygone (convexe ou non) par le demi-plan f(p) <= 0, avec f affine. */
export function couperDemiPlan(poly: PtBrut[], f: (p: PtBrut) => number): PtBrut[] {
  const out: PtBrut[] = [];
  for (let i = 0; i < poly.length; i++) {
    const P = au(poly, i),
      Q = sommetDe(poly, i + 1);
    const fp = f(P),
      fq = f(Q);
    if (fp <= 1e-9) out.push(P);
    if ((fp <= 1e-9) !== (fq <= 1e-9)) {
      const t = fp / (fp - fq);
      out.push({ x: P.x + t * (Q.x - P.x), y: P.y + t * (Q.y - P.y) });
    }
  }
  return out;
}

/** Triangulation par oreilles d'un polygone simple ; renvoie des triplets d'indices. */
export function trianguler(poly: readonly PtBrut[]): [number, number, number][] {
  const n = poly.length;
  if (n < 3) return [];
  const idx = poly.map((_, i) => i);
  if (signedArea(poly) < 0) idx.reverse();
  const croix = (a: PtBrut, b: PtBrut, c: PtBrut) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  const dedans = (p: PtBrut, a: PtBrut, b: PtBrut, c: PtBrut) => croix(a, b, p) >= -1e-12 && croix(b, c, p) >= -1e-12 && croix(c, a, p) >= -1e-12;
  const res: [number, number, number][] = [];
  let garde = 0;
  while (idx.length > 3 && garde++ < 10000) {
    let coupe = false;
    for (let k = 0; k < idx.length; k++) {
      const i0 = sommetDe(idx, k - 1),
        i1 = au(idx, k),
        i2 = sommetDe(idx, k + 1);
      const a = au(poly, i0),
        b = au(poly, i1),
        c = au(poly, i2);
      if (croix(a, b, c) <= 1e-12) continue;
      let vide = true;
      for (const j of idx) {
        if (j === i0 || j === i1 || j === i2) continue;
        if (dedans(au(poly, j), a, b, c)) {
          vide = false;
          break;
        }
      }
      if (!vide) continue;
      res.push([i0, i1, i2]);
      idx.splice(k, 1);
      coupe = true;
      break;
    }
    // Polygone degenere (points alignes, sommet double) : on retire le sommet le plus plat plutot que
    // de boucler. Retirer le premier venu amputait le pan d'un triangle entier (les croupes d'AE 103).
    if (!coupe) {
      let plat = 0, min = Infinity;
      idx.forEach((_, k) => {
        const v = Math.abs(croix(au(poly, sommetDe(idx, k - 1)), au(poly, au(idx, k)), au(poly, sommetDe(idx, k + 1))));
        if (v < min) { min = v; plat = k; }
      });
      idx.splice(plat, 1);
    }
  }
  if (idx.length === 3) res.push([au(idx, 0), au(idx, 1), au(idx, 2)]);
  return res;
}

/** Un pan de toit : son contour en 3D (z au-dessus de l'egout) et ses triangles. */
export interface Pan {
  contour: P3[];
  triangles: [number, number, number][];
}

/** Le profil haut d'un mur sous le toit : points (d, z), d en metres depuis `pts[cote]`. */
export interface Pignon {
  cote: number;
  profil: { d: number; z: number }[];
}

/** La profondeur du squelette : la distance du bord au point le plus haut d'un toit a croupes. */
export function profondeurToit(pts: readonly PtBrut[]): number {
  return squeletteDroit(pts)?.dmax ?? demiLargeurApprochee(pts);
}

/**
 * Un toit a croupes sur le squelette droit du contour. Le point le plus haut est a `hauteur` ; si
 * la pente est imposee (ecretage, MD/spec-toit-ign.md §3.3), les pans sont coupes a `hauteur` et
 * ce qui depasse devient un pan horizontal. Sans squelette, le quatre pans d'avant.
 */
function facettesCroupes(pts: readonly PtBrut[], toit: Toit): { pans: Pan[]; pignons: Pignon[] } {
  const sq = squeletteDroit(pts);
  if (!sq) return facettesToit(pts, { ...toit, forme: 'quatre-pans', angleFaitage: angleDuPlusLongCote(pts) });
  const H = Math.max(0, toit.hauteur);
  const tan = toit.pente !== undefined ? Math.tan(rad(toit.pente)) : sq.dmax > 0 ? H / sq.dmax : 0;
  const pans: Pan[] = [];
  const poser = (poly: PtBrut[], z: (q: PtBrut) => number) => {
    poly = poly.filter((q, i) => {
      const r = sommetDe(poly, i + 1);
      return Math.hypot(q.x - r.x, q.y - r.y) > 1e-6;
    });
    if (poly.length < 3 || Math.abs(signedArea(poly)) < 1e-6) return;
    pans.push({ contour: poly.map((q) => ({ x: q.x, y: q.y, z: z(q) })), triangles: trianguler(poly) });
  };
  for (const pan of sq.pans) {
    const a = au(pts, pan.cote),
      b = sommetDe(pts, pan.cote + 1);
    const l = Math.hypot(b.x - a.x, b.y - a.y);
    // La hauteur d'un point du pan : sa distance au mur, fois la pente.
    const z = (q: PtBrut) => (tan * Math.abs((b.x - a.x) * (q.y - a.y) - (b.y - a.y) * (q.x - a.x))) / l;
    const poly = pan.contour.map((q) => ({ x: q.x, y: q.y }));
    if (tan * sq.dmax <= H + 1e-9) {
      poser(poly, (q) => z(q));
      continue;
    }
    poser(couperDemiPlan(poly, (q) => z(q) - H), (q) => Math.min(H, z(q)));
    poser(couperDemiPlan(poly, (q) => H - z(q)), () => H);
  }
  return { pans, pignons: [] };
}

/** Les pans et les pignons d'un toit pose sur un contour. */
export function facettesToit(pts: readonly PtBrut[], toitLu: Toit): { pans: Pan[]; pignons: Pignon[] } {
  const toit = toitDessine(toitLu);
  if (toit.forme === 'croupes' && toit.hauteur > 0) return facettesCroupes(pts, toit);
  const plans = plansDuToit(pts, toit);
  const pans: Pan[] = [];
  plans.forEach((p, k) => {
    let poly: PtBrut[] = pts.map((q) => ({ x: q.x, y: q.y }));
    plans.forEach((autre, j) => {
      if (j === k || poly.length < 3) return;
      // Le pan k occupe la ou son plan est le plus bas : z_k - z_j <= 0.
      poly = couperDemiPlan(poly, (q) => zDe(p, q) - zDe(autre, q));
    });
    // Nettoyage : points confondus consecutifs.
    poly = poly.filter((q, i) => {
      const r = sommetDe(poly, i + 1);
      return Math.hypot(q.x - r.x, q.y - r.y) > 1e-6;
    });
    if (poly.length < 3 || Math.abs(signedArea(poly)) < 1e-6) return;
    pans.push({ contour: poly.map((q) => ({ x: q.x, y: q.y, z: hauteurToitEn(plans, q) })), triangles: trianguler(poly) });
  });

  const pignons: Pignon[] = [];
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const a = au(pts, i),
      b = sommetDe(pts, i + 1);
    const L = Math.hypot(b.x - a.x, b.y - a.y);
    if (L < 1e-6) continue;
    const at = (t: number) => ({ x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) });
    // Les cassures du profil : la ou deux plans s'egalent le long du cote.
    const ts = new Set<number>([0, 1]);
    for (let j = 0; j < plans.length; j++) {
      for (let k = j + 1; k < plans.length; k++) {
        const g0 = zDe(au(plans, j), a) - zDe(au(plans, k), a),
          g1 = zDe(au(plans, j), b) - zDe(au(plans, k), b);
        if (Math.abs(g0 - g1) > 1e-12) {
          const t = g0 / (g0 - g1);
          if (t > 1e-6 && t < 1 - 1e-6) ts.add(t);
        }
      }
    }
    const profil = [...ts].sort((x, y) => x - y).map((t) => ({ d: t * L, z: hauteurToitEn(plans, at(t)) }));
    if (profil.some((q) => q.z > 0.01)) pignons.push({ cote: i, profil });
  }
  return { pans, pignons };
}

/**
 * La hauteur du toit, au-dessus de l'egout, en un point du contour, d'apres ses pans : le plan du
 * pan qui contient le point. `null` hors de tout pan (hors du contour, ou sur un contour sans
 * pan). C'est ce qui vaut pour les croupes, que `plansDuToit` n'approche que par l'enveloppe.
 */
export function hauteurSurPans(pans: readonly Pan[], q: PtBrut): number | null {
  for (const pan of pans) {
    if (!pointInPolygon(q, pan.contour)) continue;
    const plan = planDuPan(pan);
    if (!plan) return au(pan.contour, 0).z;
    return plan.a * q.x + plan.b * q.y + plan.c;
  }
  return null;
}

/** Le plan `z = a x + b y + c` d'un pan, par trois sommets non alignes ; `null` si le pan est degenere. */
function planDuPan(pan: Pan): PlanToit | null {
  const c = pan.contour;
  const p0 = au(c, 0);
  for (let i = 1; i < c.length; i++) {
    for (let j = i + 1; j < c.length; j++) {
      const p1 = au(c, i),
        p2 = au(c, j);
      const det = (p1.x - p0.x) * (p2.y - p0.y) - (p2.x - p0.x) * (p1.y - p0.y);
      if (Math.abs(det) < 1e-6) continue;
      const a = ((p1.z - p0.z) * (p2.y - p0.y) - (p2.z - p0.z) * (p1.y - p0.y)) / det;
      const b = ((p1.x - p0.x) * (p2.z - p0.z) - (p2.x - p0.x) * (p1.z - p0.z)) / det;
      return { a, b, c: p0.z - a * p0.x - b * p0.y };
    }
  }
  return null;
}

/**
 * Hauteur du triangle (ou du trapeze) de toit porte par le mur `cote`, au-dessus de son egout : 0
 * quand le mur n'est pas un pignon. C'est ce qui s'ajoute a la hauteur a l'egout pour avoir la
 * hauteur de la facade, et ce que la photo doit cadrer pour lire le toit.
 */
export function hauteurPignon(pts: readonly PtBrut[], toitLu: Toit | null | undefined, cote: number): number {
  const toit = toitLu ? toitDessine(toitLu) : toitLu;
  if (!toit || toit.forme === 'plat' || !(toit.hauteur > 0)) return 0;
  const g = facettesToit(pts, toit).pignons.find((x) => x.cote === cote);
  return g ? Math.max(0, ...g.profil.map((q) => q.z)) : 0;
}

/**
 * Les coordonnees de texture d'un pan, en metres : `u` le long de l'egout, `v` dans la pente, en
 * vraie grandeur. Les rangs de tuiles ou d'ardoises suivent ainsi l'egout de chaque pan, et leur
 * pas ne s'etire pas sur un pan raide. Un pan horizontal se lit dans le repere du plan.
 */
export function uvDuPan(contour: readonly P3[]): number[] {
  // Normale de Newell : robuste sur un polygone a sommets alignes.
  let nx = 0,
    ny = 0,
    nz = 0;
  contour.forEach((a, i) => {
    const b = sommetDe(contour, i + 1);
    nx += (a.y - b.y) * (a.z + b.z);
    ny += (a.z - b.z) * (a.x + b.x);
    nz += (a.x - b.x) * (a.y + b.y);
  });
  const n = Math.hypot(nx, ny, nz);
  const horizontal = n < 1e-9 || Math.hypot(nx, ny) < 1e-6 * n;
  // Ligne de plus grande pente, dans le plan : vers le bas du pan.
  const s = nz < 0 ? -1 : 1;
  const gx = horizontal ? 0 : s * nx,
    gy = horizontal ? 1 : s * ny;
  const g = Math.hypot(gx, gy);
  const dx = gx / g,
    dy = gy / g;
  // Allongement de la pente : la distance dans le plan, rapportee a la longueur sur le pan.
  const k = horizontal ? 1 : n / Math.abs(nz || 1e-9);
  return contour.flatMap((q) => [q.x * -dy + q.y * dx, -(q.x * dx + q.y * dy) * k]);
}

// Mesures du banc de facades (MD/spec-facades-calage-detection.md §14).
//
// Detection : une ouverture vraie est retrouvee si une ouverture detectee la recouvre a plus de 50 %
// (intersection sur union, appariement un a un, du meilleur recouvrement au moins bon). On en tire
// la precision, le rappel, l'erreur des cotes (x, y, l, h, en cm) sur les ouvertures retrouvees, et
// une estimation des gestes de correction. Calage : l'erreur des coins proposes, ramenee en
// centimetres sur le mur par l'homographie vraie, et l'erreur de la hauteur mesuree.

import { homographie, appliquer, type P2 } from '../../../src/facade/vision/homographie.js';
import type { TypeOuverture } from '../../../src/model/types.js';

export interface Boite {
  x: number;
  y: number;
  l: number;
  h: number;
}

/** Recouvrement de deux boites : intersection sur union, de 0 a 1. */
export function recouvrement(a: Boite, b: Boite): number {
  const ix = Math.max(0, Math.min(a.x + a.l, b.x + b.l) - Math.max(a.x, b.x));
  const iy = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  const inter = ix * iy;
  const union = a.l * a.h + b.l * b.h - inter;
  return union > 0 ? inter / union : 0;
}

/** Seuil de recouvrement au-dela duquel une ouverture est retrouvee (spec §14). */
export const SEUIL_RECOUVREMENT = 0.5;
/** Au-dela de cet ecart sur une cote, l'utilisateur deplace ou redimensionne l'ouverture. */
export const ECART_GESTE_M = 0.05;

/** Appariement glouton, un a un, des paires de plus fort recouvrement. Indices [vraie, trouvee]. */
export function apparier(vraies: readonly Boite[], trouvees: readonly Boite[], seuil = SEUIL_RECOUVREMENT): [number, number][] {
  const paires: { i: number; j: number; r: number }[] = [];
  vraies.forEach((v, i) =>
    trouvees.forEach((t, j) => {
      const r = recouvrement(v, t);
      if (r > seuil) paires.push({ i, j, r });
    }),
  );
  paires.sort((a, b) => b.r - a.r);
  const prisV = new Set<number>(),
    prisT = new Set<number>();
  const res: [number, number][] = [];
  for (const p of paires) {
    if (prisV.has(p.i) || prisT.has(p.j)) continue;
    prisV.add(p.i);
    prisT.add(p.j);
    res.push([p.i, p.j]);
  }
  return res.sort((a, b) => a[0] - b[0]);
}

export interface MesureDetection {
  vraies: number;
  trouvees: number;
  vp: number;
  fp: number;
  fn: number;
  /** `null` quand rien n'est trouve (ou rien n'est a trouver) : ni bonne ni mauvaise. */
  precision: number | null;
  rappel: number | null;
  /** Ecarts absolus des cotes x, y, l, h des ouvertures retrouvees, en cm. */
  cotes: number[];
  typesJustes: number;
  /** Gestes estimes : retirer les fausses, ajouter les manquees, corriger les mal cotees ou mal typees. */
  corrections: number;
}

export function mesurerDetection(vraies: readonly (Boite & { type: TypeOuverture })[], trouvees: readonly (Boite & { type: TypeOuverture })[]): MesureDetection {
  const paires = apparier(vraies, trouvees);
  const cotes: number[] = [];
  let typesJustes = 0,
    corrections = 0;
  for (const [i, j] of paires) {
    const v = vraies[i],
      t = trouvees[j];
    if (!v || !t) continue;
    const e = [Math.abs(t.x - v.x), Math.abs(t.y - v.y), Math.abs(t.l - v.l), Math.abs(t.h - v.h)];
    cotes.push(...e.map((d) => Math.round(d * 1000) / 10));
    if (Math.max(...e) > ECART_GESTE_M + 1e-9) corrections++;
    if (t.type === v.type) typesJustes++;
    else corrections++;
  }
  const vp = paires.length,
    fp = trouvees.length - vp,
    fn = vraies.length - vp;
  return {
    vraies: vraies.length,
    trouvees: trouvees.length,
    vp,
    fp,
    fn,
    precision: trouvees.length ? vp / trouvees.length : null,
    rappel: vraies.length ? vp / vraies.length : null,
    cotes,
    typesJustes,
    corrections: corrections + fp + fn,
  };
}

export function mediane(valeurs: readonly number[]): number | null {
  if (!valeurs.length) return null;
  const s = [...valeurs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? (s[m] ?? 0) : ((s[m - 1] ?? 0) + (s[m] ?? 0)) / 2;
}

/**
 * Erreur de coins proposes, en cm sur le mur : chacun est ramene dans le plan du mur par l'homographie
 * vraie (photo -> metres) et compare au coin vrai. `Infinity` pour un coin propose au-dela de
 * l'horizon du mur, qui ne se ramene pas.
 */
export function erreurCoinsCm(proposes: readonly P2[], vrais: readonly P2[], largeur: number, hauteur: number): number[] {
  const rect = [
    { x: 0, y: 0 },
    { x: largeur, y: 0 },
    { x: largeur, y: hauteur },
    { x: 0, y: hauteur },
  ];
  const H = homographie(vrais, rect);
  if (!H) return proposes.map(() => Infinity);
  const w = (p: P2) => H[6] * p.x + H[7] * p.y + H[8];
  const centre = { x: vrais.reduce((s, p) => s + p.x, 0) / 4, y: vrais.reduce((s, p) => s + p.y, 0) / 4 };
  const signe = Math.sign(w(centre));
  return proposes.map((p, i) => {
    if (Math.sign(w(p)) !== signe) return Infinity;
    const m = appliquer(H, p);
    const r = rect[i] ?? { x: 0, y: 0 };
    return Math.round(Math.hypot(m.x - r.x, m.y - r.y) * 1000) / 10;
  });
}

/* ---------------------------------------------------------------------------------------------
 * Les details des ouvertures (lot G17, spec §11)
 * ------------------------------------------------------------------------------------------- */

/** Les trois details que le classement lit et que la 3D dessine. */
export const ATTRIBUTS_DETAILS = ['volets', 'allege', 'forme'] as const;
export type AttributDetail = (typeof ATTRIBUTS_DETAILS)[number];

/** Ce qui vaut « rien » pour un attribut : pas de volets, une allege pleine, un rectangle. */
const RIEN: Record<AttributDetail, string> = { volets: 'aucun', allege: 'pleine', forme: 'rect' };

/** Le compte d'un attribut sur les ouvertures retrouvees. */
export interface CompteDetail {
  /** Ouvertures retrouvees dont la verite porte ce detail. */
  vrais: number;
  /** Lu juste. */
  justes: number;
  /** Rien lu la ou la verite en porte un. */
  manques: number;
  /** Un detail lu qui n'est pas le vrai : la ou il n'y a rien, ou un autre (des persiennes pour un roulant). */
  faux: number;
  /** Ce qui a ete lu de faux, pour le dire dans le tableau. */
  lusFaux: string[];
}

export type MesureDetails = Record<AttributDetail, CompteDetail>;

type AvecDetails = Boite & { details?: Partial<Record<AttributDetail, string | boolean | undefined>> | undefined };

const compteVide = (): MesureDetails => ({
  volets: { vrais: 0, justes: 0, manques: 0, faux: 0, lusFaux: [] },
  allege: { vrais: 0, justes: 0, manques: 0, faux: 0, lusFaux: [] },
  forme: { vrais: 0, justes: 0, manques: 0, faux: 0, lusFaux: [] },
});

/** La valeur d'un attribut, `null` quand elle vaut « rien ». */
function valeurDetail(x: AvecDetails | undefined, a: AttributDetail): string | null {
  const v = x?.details?.[a];
  return typeof v === 'string' && v !== RIEN[a] ? v : null;
}

/**
 * La justesse des details (lot G17) sur les ouvertures retrouvees (meme appariement que la detection) :
 * pour chaque attribut, la valeur lue comparee a la vraie. Une ouverture manquee ne compte pas ici (elle
 * compte deja dans le rappel) ; une detection fausse compte les details qu'elle porte comme faux : la
 * fiche de l'ouverture les montre (le « cintre » d'une haie prise avec la baie au-dessus d'elle).
 */
export function mesurerDetails(vraies: readonly AvecDetails[], trouvees: readonly AvecDetails[]): MesureDetails {
  const m = compteVide();
  const paires = apparier(vraies, trouvees);
  const appariees = new Set(paires.map(([, j]) => j));
  trouvees.forEach((t, j) => {
    if (appariees.has(j)) return;
    for (const a of ATTRIBUTS_DETAILS) {
      const v = valeurDetail(t, a);
      if (!v) continue;
      m[a].faux++;
      m[a].lusFaux.push(v);
    }
  });
  for (const [i, j] of paires) {
    for (const a of ATTRIBUTS_DETAILS) {
      const v = valeurDetail(vraies[i], a),
        t = valeurDetail(trouvees[j], a);
      const c = m[a];
      if (v) c.vrais++;
      if (v && t === v) c.justes++;
      else if (v && !t) c.manques++;
      else if (t) {
        c.faux++;
        c.lusFaux.push(t);
      }
    }
  }
  return m;
}

/** Plusieurs mesures de details mises bout a bout (la ligne « Ensemble »). */
export function cumulerDetails(mesures: readonly MesureDetails[]): MesureDetails {
  const m = compteVide();
  for (const x of mesures)
    for (const a of ATTRIBUTS_DETAILS) {
      m[a].vrais += x[a].vrais;
      m[a].justes += x[a].justes;
      m[a].manques += x[a].manques;
      m[a].faux += x[a].faux;
      m[a].lusFaux.push(...x[a].lusFaux);
    }
  return m;
}

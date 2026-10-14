// La structure d'une facade (MD/spec-facades-calage-detection.md §10, lot L15) : des niveaux (rangees)
// et des travees (colonnes). Une facade est reguliere ; la structure rend la detection plus sure et les
// corrections plus courtes :
// - **regulariser** : une baie a quelques centimetres de la mediane de sa travee (largeur) ou de sa
//   rangee (hauteur, meme type) en prend la valeur, sans jamais bouger un bord de plus de 10 cm ;
// - **completer** : un croisement de la grille sans baie, cache ou peu sur, recoit une baie devinee,
//   proposee en pointille (cochee si sa confiance le permet, decochee sinon) ;
// - **les gestes** « Meme taille pour la travee », « Meme hauteur pour le niveau », « Ajouter dans la
//   grille » (spec §12).
//
// Tout est pur et ne lit pas l'image : ce que l'image dit d'un croisement (cache, mur net) vient de
// l'appelant (`EvaluerZone`).

import { au } from '../util/tableaux.js';
import { classer } from './classement.js';
import { reglagesStructure, type ValeursStructure } from './reglagesStructure.js';
import type { GrilleFacade, TypeOuverture } from '../model/types.js';

/** Ce que la structure lit d'une ouverture : son type et sa boite, en metres (y depuis le sol). */
export interface BoiteOuverture {
  type: TypeOuverture;
  x: number;
  y: number;
  l: number;
  h: number;
}

/** La grille, et la rangee et la travee de chaque ouverture (dans l'ordre de la liste). */
export interface Structure {
  grille: GrilleFacade;
  niveauDe: number[];
  traveeDe: number[];
  /** Centres des travees symetriques autour du milieu de la facade (§10.4) : sert a completer, ne deplace rien. */
  symetrique: boolean;
  /** Les hauteurs d'etage (d'un linteau au suivant) sont-elles de 2,5 a 3,2 m (§10.1) ? */
  etagesPlausibles: boolean;
}

const cm = (v: number) => Math.round(v * 100) / 100;

export function mediane(v: readonly number[]): number {
  if (!v.length) return 0;
  const s = [...v].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? au(s, m) : (au(s, m - 1) + au(s, m)) / 2;
}

/** Partition par union : `lie(i, j)` dit si deux elements sont du meme groupe (lien simple). */
function grouper(n: number, lie: (i: number, j: number) => boolean): number[][] {
  const parent = Array.from({ length: n }, (_, i) => i);
  const racine = (i: number): number => (parent[i] === i ? i : (parent[i] = racine(au(parent, i))));
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) if (lie(i, j)) parent[racine(i)] = racine(j);
  const groupes = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    const r = racine(i);
    groupes.set(r, [...(groupes.get(r) ?? []), i]);
  }
  return [...groupes.values()];
}

/** Recouvrement vertical de deux baies, rapporte a la plus basse. */
function recouvrementVertical(a: BoiteOuverture, b: BoiteOuverture): number {
  const inter = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return inter > 0 ? inter / Math.min(a.h, b.h) : 0;
}

const centre = (o: BoiteOuverture) => o.x + o.l / 2;

/**
 * Les niveaux et les travees d'une liste d'ouvertures (§10.1, §10.2). Un niveau regroupe les baies dont
 * les hauteurs se recouvrent (une porte et une fenetre du rez-de-chaussee) ; son appui et son linteau
 * sont ceux de ses fenetres (medianes), s'il en a, sinon de toutes ses baies. Une travee regroupe les centres a 10 cm
 * pres, d'une rangee a l'autre ; sa largeur est la mediane de ses baies.
 */
export function structurer<B extends BoiteOuverture>(ouvertures: readonly B[], largeur: number, reglages: Partial<ValeursStructure> = {}): Structure {
  const rg = reglagesStructure(reglages);
  const n = ouvertures.length;
  const niveaux = grouper(n, (i, j) => recouvrementVertical(au(ouvertures, i), au(ouvertures, j)) >= rg['facades.structure.niveauRecouvrementMin'])
    .map((g) => {
      const os = g.map((i) => au(ouvertures, i));
      const fenetres = os.filter((o) => o.type === 'fenetre');
      // Les fenetres disent l'appui et le linteau de la rangee ; une porte, plus haute, ne les dit pas.
      const appuiM = cm(fenetres.length ? mediane(fenetres.map((o) => o.y)) : Math.min(...os.map((o) => o.y)));
      return { membres: g, appuiM, linteauM: cm(mediane((fenetres.length ? fenetres : os).map((o) => o.y + o.h))) };
    })
    .sort((a, b) => a.linteauM - b.linteauM);
  const tol = rg['facades.structure.traveeM'];
  const travees = grouper(n, (i, j) => Math.abs(centre(au(ouvertures, i)) - centre(au(ouvertures, j))) <= tol)
    .map((g) => ({ membres: g, xM: cm(mediane(g.map((i) => centre(au(ouvertures, i))))), largeurM: cm(mediane(g.map((i) => au(ouvertures, i).l))) }))
    .sort((a, b) => a.xM - b.xM);
  const niveauDe = new Array<number>(n).fill(0),
    traveeDe = new Array<number>(n).fill(0);
  niveaux.forEach((g, k) => g.membres.forEach((i) => (niveauDe[i] = k)));
  travees.forEach((g, k) => g.membres.forEach((i) => (traveeDe[i] = k)));
  const xs = travees.map((t) => t.xM);
  const sym = rg['facades.structure.symetrieM'];
  const symetrique = xs.length >= 2 && xs.every((x) => xs.some((y) => Math.abs(x + y - largeur) <= sym));
  const etagesPlausibles = niveaux.every((g, k) => {
    if (k === 0) return true;
    const d = g.linteauM - au(niveaux, k - 1).linteauM;
    return d >= rg['facades.structure.etageMinM'] - 1e-9 && d <= rg['facades.structure.etageMaxM'] + 1e-9;
  });
  return {
    grille: { niveaux: niveaux.map(({ appuiM, linteauM }) => ({ appuiM, linteauM })), travees: travees.map(({ xM, largeurM }) => ({ xM, largeurM })) },
    niveauDe,
    traveeDe,
    symetrique,
    etagesPlausibles,
  };
}

/** L'ecart le plus grand entre les bords de deux boites, en metres. */
export function ecartBords(a: BoiteOuverture, b: BoiteOuverture): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.x + a.l - (b.x + b.l)), Math.abs(a.y - b.y), Math.abs(a.y + a.h - (b.y + b.h)));
}

/**
 * Regularise les ouvertures sur leur structure (§10.2, §10.3, §10.6) :
 * - dans une travee, pour un meme type, la largeur mediane, a 5 cm au plus (centre garde) ;
 * - dans une rangee, pour un meme type, la hauteur mediane, a 5 cm au plus (appui garde) ;
 * - jamais un bord a plus de 10 cm de sa mesure : sinon la baie garde sa mesure.
 */
export function regulariser<B extends BoiteOuverture>(ouvertures: readonly B[], s: Structure, reglages: Partial<ValeursStructure> = {}): B[] {
  const rg = reglagesStructure(reglages);
  const tol = rg['facades.structure.egaliserM'] + 1e-9;
  const res = ouvertures.map((o) => ({ ...o }));
  // Largeurs par travee et par type : une porte et la fenetre au-dessus d'elle partagent l'aplomb,
  // pas la menuiserie.
  s.grille.travees.forEach((_, t) => {
    const parType = new Map<TypeOuverture, B[]>();
    res.forEach((o, i) => {
      if (s.traveeDe[i] === t) parType.set(o.type, [...(parType.get(o.type) ?? []), o]);
    });
    for (const membres of parType.values()) {
      const m = cm(mediane(membres.map((o) => o.l)));
      for (const o of membres)
        if (Math.abs(o.l - m) <= tol) {
          const c = o.x + o.l / 2;
          o.l = m;
          o.x = cm(c - m / 2);
        }
    }
  });
  // Hauteurs par rangee et par type.
  s.grille.niveaux.forEach((_, k) => {
    const parType = new Map<TypeOuverture, B[]>();
    res.forEach((o, i) => {
      if (s.niveauDe[i] === k) parType.set(o.type, [...(parType.get(o.type) ?? []), o]);
    });
    for (const membres of parType.values()) {
      const m = cm(mediane(membres.map((o) => o.h)));
      for (const o of membres) if (Math.abs(o.h - m) <= tol) o.h = m;
    }
  });
  return res.map((o, i) => (ecartBords(o, au(ouvertures, i)) > rg['facades.structure.gardeFouM'] + 1e-9 ? { ...au(ouvertures, i) } : o));
}

/** Ce que l'image dit d'une zone de la facade, en metres : part cachee (masque), et part vue qui est le mur. */
export interface EtatZone {
  cache: number;
  mur: number;
}
export type EvaluerZone = (b: Pick<BoiteOuverture, 'x' | 'y' | 'l' | 'h'>) => EtatZone;

/** Une baie devinee au croisement d'une rangee et d'une travee (§10.5). */
export interface Devinee extends BoiteOuverture {
  confiance: number;
  niveau: number;
  travee: number;
  /** Proposee cochee (confiance suffisante) ou laissee en pointille, decochee. */
  cochee: boolean;
}

/** Deux boites se touchent-elles (a `marge` metres pres) ? */
function chevauche(a: Pick<BoiteOuverture, 'x' | 'y' | 'l' | 'h'>, b: Pick<BoiteOuverture, 'x' | 'y' | 'l' | 'h'>, marge = 0): boolean {
  return a.x < b.x + b.l + marge && b.x < a.x + a.l + marge && a.y < b.y + b.h + marge && b.y < a.y + a.h + marge;
}

/**
 * La baie qui irait au croisement de la rangee `k` et de la travee `t` : la largeur des baies de la
 * travee (de leur type le plus courant), centree sur elle ; l'appui et le linteau de la rangee.
 */
function boiteAuCroisement<B extends BoiteOuverture>(ouvertures: readonly B[], s: Structure, k: number, t: number): BoiteOuverture {
  const travee = au(s.grille.travees, t),
    niveau = au(s.grille.niveaux, k);
  const dansTravee = ouvertures.filter((_, i) => s.traveeDe[i] === t);
  const fenetres = dansTravee.filter((o) => o.type === 'fenetre');
  const l = cm(fenetres.length ? mediane(fenetres.map((o) => o.l)) : travee.largeurM);
  let y = niveau.appuiM,
    h = cm(Math.max(0.3, niveau.linteauM - niveau.appuiM));
  // Une rangee sans fenetre (une porte seule au rez) ne dit pas ou est l'appui : la baie prend la
  // hauteur des fenetres de sa travee, sous le linteau de la rangee.
  const fenetresDuNiveau = ouvertures.some((o, i) => s.niveauDe[i] === k && o.type === 'fenetre');
  if (!fenetresDuNiveau && fenetres.length) {
    h = cm(mediane(fenetres.map((o) => o.h)));
    y = cm(Math.max(0, niveau.linteauM - h));
  }
  return { type: classer(y, l, h), x: cm(travee.xM - l / 2), y, l, h };
}

/** Les croisements libres de la grille ou une baie tiendrait dans le mur, sans toucher les autres. */
export function croisementsLibres<B extends BoiteOuverture>(ouvertures: readonly B[], s: Structure, largeur: number, hauteur: number): { niveau: number; travee: number; boite: BoiteOuverture }[] {
  const res: { niveau: number; travee: number; boite: BoiteOuverture }[] = [];
  s.grille.niveaux.forEach((_, k) =>
    s.grille.travees.forEach((_, t) => {
      if (ouvertures.some((_, i) => s.niveauDe[i] === k && s.traveeDe[i] === t)) return;
      const b = boiteAuCroisement(ouvertures, s, k, t);
      if (b.x < 0 || b.x + b.l > largeur + 1e-9 || b.y + b.h > hauteur + 1e-9) return;
      if (ouvertures.some((o) => chevauche(o, b, 0.05))) return;
      res.push({ niveau: k, travee: t, boite: b });
    }),
  );
  return res;
}

/**
 * La completion (§10.5) : un croisement libre d'une travee qui a des baies sur d'autres rangees recoit
 * une baie devinee s'il est cache (masque d'occlusion) ou peu sur ; jamais dans une zone vue et
 * nettement « mur ». La confiance monte avec le soutien de la travee et de la rangee, la zone cachee
 * et la symetrie ; elle baisse si les hauteurs d'etage ne sont pas plausibles. Il faut au moins deux
 * rangees : une seule ne fait pas une grille.
 */
export function completer<B extends BoiteOuverture>(ouvertures: readonly B[], s: Structure, largeur: number, hauteur: number, zone: EvaluerZone, reglages: Partial<ValeursStructure> = {}): Devinee[] {
  const rg = reglagesStructure(reglages);
  if (s.grille.niveaux.length < 2) return [];
  const res: Devinee[] = [];
  for (const c of croisementsLibres(ouvertures, s, largeur, hauteur)) {
    const appuiTravee = new Set(ouvertures.flatMap((_, i) => (s.traveeDe[i] === c.travee ? [s.niveauDe[i]] : []))).size;
    const appuiNiveau = ouvertures.filter((_, i) => s.niveauDe[i] === c.niveau).length;
    if (appuiTravee < 1 || appuiNiveau < 1) continue;
    const z = zone(c.boite);
    const cachee = z.cache >= rg['facades.structure.cacheMin'];
    if (!cachee && z.mur >= rg['facades.structure.murNetMin']) continue;
    const t = au(s.grille.travees, c.travee);
    const miroir = s.symetrique && s.grille.travees.some((u) => Math.abs(u.xM + t.xM - largeur) <= rg['facades.structure.symetrieM']);
    let confiance = 0.3 + 0.12 * Math.min(3, appuiTravee) + 0.04 * Math.min(3, appuiNiveau) + (cachee ? 0.15 : 0) + (miroir ? 0.05 : 0);
    if (!s.etagesPlausibles) confiance -= 0.15;
    confiance = Math.round(Math.max(0.1, Math.min(0.9, confiance)) * 100) / 100;
    res.push({ ...c.boite, confiance, niveau: c.niveau, travee: c.travee, cochee: confiance >= rg['facades.structure.devineeCocheeMin'] });
  }
  return res;
}

/* ------------------------------------------------------------------------------------------------
 * Les gestes de la verification (spec §12)
 * --------------------------------------------------------------------------------------------- */

/**
 * « Meme taille pour la travee » : la largeur de l'ouverture `i` (et son centre) donnee aux ouvertures
 * du meme type de sa travee. Rend les indices touches (vide : rien a faire).
 */
export function memeTailleTravee<B extends BoiteOuverture>(ouvertures: readonly B[], i: number, largeur: number): { ouvertures: B[]; touchees: number[] } {
  const s = structurer(ouvertures, largeur);
  const ref = au(ouvertures, i);
  const c = centre(ref);
  const touchees: number[] = [];
  const res = ouvertures.map((o, k) => {
    if (k === i || s.traveeDe[k] !== s.traveeDe[i] || o.type !== ref.type) return o;
    if (o.l === ref.l && Math.abs(centre(o) - c) < 0.005) return o;
    touchees.push(k);
    return { ...o, l: ref.l, x: cm(Math.max(0, Math.min(largeur - ref.l, c - ref.l / 2))) };
  });
  return { ouvertures: res, touchees };
}

/**
 * « Meme hauteur pour le niveau » : l'appui et la hauteur de l'ouverture `i` donnes aux ouvertures du
 * meme type de sa rangee. Rend les indices touches.
 */
export function memeHauteurNiveau<B extends BoiteOuverture>(ouvertures: readonly B[], i: number, largeur: number): { ouvertures: B[]; touchees: number[] } {
  const s = structurer(ouvertures, largeur);
  const ref = au(ouvertures, i);
  const touchees: number[] = [];
  const res = ouvertures.map((o, k) => {
    if (k === i || s.niveauDe[k] !== s.niveauDe[i] || o.type !== ref.type) return o;
    if (o.y === ref.y && o.h === ref.h) return o;
    touchees.push(k);
    return { ...o, y: ref.y, h: ref.h };
  });
  return { ouvertures: res, touchees };
}

/**
 * « Ajouter dans la grille » : la baie du croisement libre le plus proche de `pres` (le centre de
 * l'ouverture choisie, ou le milieu de la facade). `null` s'il n'y a pas de croisement libre.
 */
export function ajouterDansLaGrille<B extends BoiteOuverture>(ouvertures: readonly B[], largeur: number, hauteur: number, pres: { x: number; y: number } | null = null): (BoiteOuverture & { niveau: number; travee: number }) | null {
  if (!ouvertures.length) return null;
  const s = structurer(ouvertures, largeur);
  const libres = croisementsLibres(ouvertures, s, largeur, hauteur);
  const p = pres ?? { x: largeur / 2, y: hauteur / 2 };
  let meilleur: (BoiteOuverture & { niveau: number; travee: number }) | null = null,
    d = Infinity;
  for (const c of libres) {
    const e = Math.hypot(c.boite.x + c.boite.l / 2 - p.x, c.boite.y + c.boite.h / 2 - p.y);
    if (e < d) {
      d = e;
      meilleur = { ...c.boite, niveau: c.niveau, travee: c.travee };
    }
  }
  return meilleur;
}

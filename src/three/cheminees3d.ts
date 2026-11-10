// Les souches de cheminee d'un batiment en corps, dessinees (MD/spec-regles-toits.md §2.6, §4).
//
// Une souche ne vient que d'une observation (audit, releve) : aucun batiment lu sur le LiDAR n'en
// porte, et un corps sans `cheminees` ne dessine rien de plus qu'avant. Chaque souche est un prisme
// a section rectangulaire, oriente comme son corps :
// - sur le toit (faitage, pan, pignon), elle part du pan : le bas de chaque face suit le toit a ses
//   coins. Le toit d'un corps est le minimum de plans (pans, croupes), donc une fonction concave :
//   la corde entre deux coins passe sous la couverture, et la souche n'a jamais de jour a sa base ;
// - adossee (facade), elle monte du sol jusqu'a son sommet, collee au mur exterieur ;
// - en haut, une dalle qui deborde de quelques centimetres (le couronnement), et des mitrons, un par
//   conduit, quand l'observation les a vus.

import type * as THREE_NS from 'three';
import { repere, point, hauteurCorpsEn, type Repere } from '../facade/toits/toitCorps.js';
import { maille, type S3, type ContexteToitCorps } from './toitCorps3d.js';
import type { Cheminee, CorpsToit, PtBrut } from '../model/types.js';

export const NOM_CHEMINEE_SOUCHE = 'cheminee-souche';
export const NOM_CHEMINEE_COURONNEMENT = 'cheminee-couronnement';
export const NOM_CHEMINEE_MITRONS = 'cheminee-mitrons';
/** La souche s'enfonce sous la couverture : sans cela, l'arrondi des sommets laissait un lisere de jour au pied. */
export const ENFONCEMENT_SOUCHE_M = 0.1;
/** L'epaisseur de la dalle de couronnement. */
export const EPAISSEUR_DALLE_M = 0.08;
/** Ce que la dalle deborde de la souche, de chaque cote. */
export const DEBORD_DALLE_M = 0.05;
/** Un mitron : un petit tuyau de terre cuite, carre ici, par conduit, pose sur la dalle. */
export const MITRON = { cote: 0.2, hauteur: 0.3 } as const;
/** En deca, une section n'est pas une souche (une saisie a zero, un fichier abime) : rien ne se dessine. */
const SECTION_MIN_M = 0.05;

const COULEUR_BRIQUE = 0x8a5a44;
const COULEUR_PIERRE = 0xa59d8f;
const COULEUR_METAL = 0x9aa0a6;
const COULEUR_DALLE = 0x9a9a94;
const COULEUR_MITRON = 0xb5652f;

/** Les facettes d'une souche : ses faces, sa dalle, ses mitrons. Vides si la souche n'a pas de sens. */
export interface FacettesCheminee {
  souche: S3[][];
  couronnement: S3[][];
  mitrons: S3[][];
}

/** Le contexte du dessin : celui des corps, et le sol sous une souche adossee quand le terrain n'est pas plat. */
export interface ContexteCheminees extends ContexteToitCorps {
  /** La hauteur du sol en un point du plan, depuis l'origine du groupe ; absente, sol plat a zero. */
  sol?: ((p: PtBrut) => number) | undefined;
}

const fini = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const borne = (v: number, a: number, b: number) => (a > b ? (a + b) / 2 : Math.min(b, Math.max(a, v)));

/** Une souche lisible : des nombres finis, une section, un sommet. Un fichier abime ne doit pas casser la Vue 3D. */
export function chemineeValide(ch: Partial<Cheminee> | null | undefined): ch is Cheminee {
  return !!ch && fini(ch.x) && fini(ch.y) && fini(ch.sommetM) && fini(ch.largeurM) && fini(ch.profondeurM)
    && ch.largeurM >= SECTION_MIN_M && ch.profondeurM >= SECTION_MIN_M;
}

/** Les coordonnees (s le long du faitage, t dans la largeur) d'un point du plan dans le repere d'un corps. */
function local(r: Repere, q: PtBrut): { s: number; t: number } {
  const dx = q.x - r.p0.x, dy = q.y - r.p0.y;
  return { s: dx * r.u.x + dy * r.u.y, t: dx * r.v.x + dy * r.v.y };
}

/** Un prisme vertical sur un rectangle du repere : ses quatre faces, chacune du bas `zb(s, t)` au haut `zh`. */
function faces(r: Repere, s0: number, s1: number, t0: number, t1: number, zb: (s: number, t: number) => number, zh: number): S3[][] {
  const P = (s: number, t: number, z: number): S3 => ({ ...point(r, s, t), z });
  const coins: [number, number][] = [[s0, t0], [s1, t0], [s1, t1], [s0, t1]];
  return coins.map(([sa, ta], i) => {
    const [sb, tb] = coins[(i + 1) % 4] as [number, number];
    return [P(sa, ta, zb(sa, ta)), P(sb, tb, zb(sb, tb)), P(sb, tb, zh), P(sa, ta, zh)];
  });
}

/** Une boite pleine : ses quatre faces, son dessus et son dessous. */
function boite(r: Repere, s0: number, s1: number, t0: number, t1: number, z0: number, z1: number): S3[][] {
  const P = (s: number, t: number, z: number): S3 => ({ ...point(r, s, t), z });
  return [
    ...faces(r, s0, s1, t0, t1, () => z0, z1),
    [P(s0, t0, z1), P(s1, t0, z1), P(s1, t1, z1), P(s0, t1, z1)],
    [P(s0, t1, z0), P(s1, t1, z0), P(s1, t0, z0), P(s0, t0, z0)],
  ];
}

/**
 * Les facettes d'une souche dans le plan, hauteurs au-dessus du sol. Sa place suit sa position :
 * au faitage, elle est centree sur la ligne de faitage ; dans un pan ou un pignon, elle reste dans le
 * corps (au nu du mur de bout pour un pignon) ; adossee, elle est poussee contre le mur le plus proche,
 * du cote exterieur. Une souche dont le sommet ne depasse pas le toit sous elle ne se dessine pas.
 */
export function facettesCheminee(c: CorpsToit, ch: Cheminee, sol: ((p: PtBrut) => number) | null = null): FacettesCheminee {
  const vide: FacettesCheminee = { souche: [], couronnement: [], mitrons: [] };
  if (!chemineeValide(ch)) return vide;
  const r = repere(c.pts);
  const { L, W } = r;
  if (!(L > 0) || !(W > 0)) return vide;
  const q = local(r, ch);
  // Le couronnement : une dalle par defaut ; un tubage metallique n'en a pas.
  const couronnement = ch.couronnement ?? (ch.materiau === 'metal' ? null : 'dalle');
  const dalle = couronnement ? EPAISSEUR_DALLE_M : 0;
  const zh = ch.sommetM - dalle;
  let s0: number, s1: number, t0: number, t1: number, zb: (s: number, t: number) => number;
  if (ch.position === 'facade') {
    // Le mur le plus proche du centre observe ; la souche s'y colle, sa largeur le long du mur.
    const a = ch.largeurM / 2, d = ch.profondeurM;
    const murs = [
      { cote: 't0', dist: Math.abs(q.t) }, { cote: 'tW', dist: Math.abs(W - q.t) },
      { cote: 's0', dist: Math.abs(q.s) }, { cote: 'sL', dist: Math.abs(L - q.s) },
    ].sort((m, n) => m.dist - n.dist);
    const cote = murs[0]?.cote;
    if (cote === 't0' || cote === 'tW') {
      const s = borne(q.s, a, L - a);
      [s0, s1] = [s - a, s + a];
      [t0, t1] = cote === 't0' ? [-d, 0] : [W, W + d];
    } else {
      const t = borne(q.t, a, W - a);
      [t0, t1] = [t - a, t + a];
      [s0, s1] = cote === 's0' ? [-d, 0] : [L, L + d];
    }
    // Du sol : le plus bas des quatre coins, pour qu'un terrain en pente ne la laisse pas en l'air.
    const bas = sol ? Math.min(...[[s0, t0], [s1, t0], [s1, t1], [s0, t1]].map(([s, t]) => sol(point(r, s as number, t as number)))) : 0;
    zb = () => bas;
  } else {
    const a = ch.largeurM / 2, b = ch.profondeurM / 2;
    // Au faitage, centree sur sa ligne ; sinon, dans le corps (un pignon : au nu du mur de bout).
    const s = borne(q.s, a, L - a);
    const t = ch.position === 'faitage' ? c.posFaitage : borne(q.t, b, W - b);
    [s0, s1, t0, t1] = [s - a, s + a, t - b, t + b];
    // Hors du rectangle (une souche plus large que le corps), la hauteur du bord le plus proche.
    zb = (ss, tt) => hauteurCorpsEn(c, L, W, borne(ss, 0, L), borne(tt, 0, W)) - ENFONCEMENT_SOUCHE_M;
  }
  const coins = [zb(s0, t0), zb(s1, t0), zb(s1, t1), zb(s0, t1)];
  // Le sommet sous le toit (ou au ras) : une observation incoherente, on ne dessine rien plutot qu'un trou.
  if (zh <= Math.max(...coins) + ENFONCEMENT_SOUCHE_M) return vide;
  // Le dessus de la souche n'est dessine que sans dalle : dessous, il se confondait avec elle.
  const souche = faces(r, s0, s1, t0, t1, zb, zh);
  if (!couronnement) souche.push([{ ...point(r, s0, t0), z: zh }, { ...point(r, s1, t0), z: zh }, { ...point(r, s1, t1), z: zh }, { ...point(r, s0, t1), z: zh }]);
  const e = DEBORD_DALLE_M;
  const dessus = couronnement ? boite(r, s0 - e, s1 + e, t0 - e, t1 + e, zh, ch.sommetM) : [];
  // Les mitrons, un par conduit, alignes dans le sens ou la souche s'allonge (plusieurs conduits l'allongent).
  const mitrons: S3[][] = [];
  if (couronnement === 'mitrons') {
    const n = Math.max(1, Math.round(ch.conduits ?? 1));
    const m = MITRON.cote / 2;
    const leLong = s1 - s0 >= t1 - t0 ? 's' : 't';
    for (let i = 0; i < n; i++) {
      const f = (i + 0.5) / n;
      const sc = leLong === 's' ? s0 + f * (s1 - s0) : (s0 + s1) / 2;
      const tc = leLong === 't' ? t0 + f * (t1 - t0) : (t0 + t1) / 2;
      mitrons.push(...faces(r, sc - m, sc + m, tc - m, tc + m, () => ch.sommetM, ch.sommetM + MITRON.hauteur));
    }
  }
  return { souche, couronnement: dessus, mitrons };
}

/** La couleur d'une souche : son materiau, sinon celle des murs (une souche suit souvent leur materiau). */
export function couleurSouche(ch: Pick<Cheminee, 'materiau'>, couleurMur: string | number): string | number {
  switch (ch.materiau) {
    case 'brique': return COULEUR_BRIQUE;
    case 'pierre': return COULEUR_PIERRE;
    case 'metal': return COULEUR_METAL;
    default: return couleurMur;
  }
}

/** Pose les souches de tous les corps. Rien n'est ajoute pour un corps sans cheminee. */
export function ajouterCheminees3d(ctx: ContexteCheminees, corps: readonly CorpsToit[]): { souches: number } {
  let souches = 0;
  const poser = (polys: S3[][], couleur: string | number, nom: string, rugosite: number) => {
    if (!polys.length) return;
    const m = new THREE.Mesh(maille(polys, ctx.toLocal, false), new THREE.MeshStandardMaterial({ color: couleur, roughness: rugosite, side: THREE.DoubleSide }));
    m.name = nom;
    ctx.scene.add(m as THREE_NS.Object3D);
  };
  for (const c of corps) {
    for (const ch of c.cheminees ?? []) {
      const f = facettesCheminee(c, ch, ctx.sol ?? null);
      if (!f.souche.length) continue;
      souches++;
      poser(f.souche, couleurSouche(ch, ctx.couleurMur), NOM_CHEMINEE_SOUCHE, ch.materiau === 'metal' ? 0.4 : 0.9);
      poser(f.couronnement, COULEUR_DALLE, NOM_CHEMINEE_COURONNEMENT, 0.9);
      poser(f.mitrons, COULEUR_MITRON, NOM_CHEMINEE_MITRONS, 0.9);
    }
  }
  return { souches };
}

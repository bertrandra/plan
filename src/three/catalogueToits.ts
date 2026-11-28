// Le catalogue des formes de toit que la 3D sait dessiner, en vue isometrique (Admin › Chaine).
//
// Chaque forme est un petit corps de reference (10 m sur 7 m) dont les facettes viennent du meme code que la 3D :
// `facettesEtendues` pour le brisis, le gambrel et la demi-croupe (croupe meuniere), `facettesLucarnes` pour les
// lucarnes, `facettesCorps` (le dessin meme de la 3D) pour l'avant-corps a pignon, et des plans simples pour deux-pans, croupes,
// appentis et plat. Il vit dans three/ pour cela : la couche facade n'importe pas la 3D. Rien n'est dessine a la main : si le calcul
// d'une forme change, sa vignette change avec lui.

import { facettesEtendues, facettesLucarnes, type Sommet } from '../facade/toits/toitFormes.js';
import { couperDemiPlan } from '../facade/toits/toit.js';
import { facettesCorps } from './toitCorps3d.js';
import type { CorpsToit, PtBrut } from '../model/types.js';
import { LARGEUR_M, LONGUEUR_M, type CorpsExemple, type ExempleToit } from '../facade/modeToit/exemplesToits.js';

/** Les facettes d'un toit simple : le toit est le plus bas de ses plans. */
function facettesSimples(c: CorpsExemple, L: number, W: number): { pans: Sommet[][]; murs: Sommet[][] } {
  const p = c.posFaitage, F = c.faitage, [e0, e1] = c.egouts;
  const plans: { a: number; b: number; c: number }[] = [];
  if (F - Math.min(e0, e1) < 0.05) plans.push({ a: 0, b: 0, c: F });
  else {
    if (p > 0.01) plans.push({ a: 0, b: (F - e0) / p, c: e0 });
    if (p < W - 0.01) plans.push({ a: 0, b: -(F - e1) / (W - p), c: e1 + ((F - e1) * W) / (W - p) });
    const [h0, h1] = c.croupes ?? [0, 0];
    if (h0 > 0) plans.push({ a: (F - e0) / h0, b: 0, c: e0 });
    if (h1 > 0) plans.push({ a: -(F - e1) / h1, b: 0, c: e1 + ((F - e1) * L) / h1 });
  }
  const z = (q: { a: number; b: number; c: number }, s: number, t: number) => q.a * s + q.b * t + q.c;
  const rect: PtBrut[] = [{ x: 0, y: 0 }, { x: L, y: 0 }, { x: L, y: W }, { x: 0, y: W }];
  const pans: Sommet[][] = [];
  plans.forEach((q, i) => {
    let poly = rect;
    plans.forEach((r, j) => { if (j !== i && poly.length >= 3) poly = couperDemiPlan(poly, (m) => z(q, m.x, m.y) - z(r, m.x, m.y) - (j < i ? 1e-9 : 0)); });
    if (poly.length >= 3) pans.push(poly.map((m) => ({ s: m.x, t: m.y, z: z(q, m.x, m.y) })));
  });
  // Les murs de bout et de long pan, jusqu'au toit.
  const murs: Sommet[][] = [];
  const hauteur = (s: number, t: number) => Math.min(...plans.map((q) => z(q, s, t)));
  const bord: [Sommet, Sommet][] = [[{ s: 0, t: 0, z: 0 }, { s: L, t: 0, z: 0 }], [{ s: L, t: 0, z: 0 }, { s: L, t: W, z: 0 }], [{ s: L, t: W, z: 0 }, { s: 0, t: W, z: 0 }], [{ s: 0, t: W, z: 0 }, { s: 0, t: 0, z: 0 }]];
  for (const [a, b] of bord) {
    const n = 12, haut: Sommet[] = [];
    for (let k = 0; k <= n; k++) { const s = a.s + ((b.s - a.s) * k) / n, t = a.t + ((b.t - a.t) * k) / n; haut.push({ s, t, z: hauteur(s, t) }); }
    murs.push([a, b, ...haut.reverse()]);
  }
  return { pans, murs };
}

/** `element` : une facette de ce qui est pose sur le toit (fenetre, panneau, souche), passee par `plus` ; la vignette se cadre dessus. */
export interface FacettePlate { points: [number, number][]; ton: number; mur: boolean; lucarne: boolean; vitre?: boolean; element?: true }
export interface VueIso { facettes: FacettePlate[]; largeur: number; hauteur: number }

/**
 * Les facettes d'un exemple, en projection isometrique (x vers la droite, y vers le bas), de l'arriere vers l'avant.
 * `plus` : des facettes de plus, dans le repere de l'exemple (un element de facade pose contre son mur).
 */
export function vueIsometrique(e: ExempleToit, plus: readonly { f: Sommet[]; mur: boolean; vitre?: boolean; element?: boolean }[] = []): VueIso {
  const liste: { f: Sommet[]; mur: boolean; lucarne: boolean; vitre?: boolean; element?: boolean }[] = [];
  for (const { corps: c, t0 = 0, w: W = LARGEUR_M, l: L = LONGUEUR_M } of e.corps) {
    // Un avant-corps a pignon (corps.pignons) se dessine comme la 3D : le grand pan est entaille le long des noues du pignon.
    const avecPignons = c.pignons?.length ? facettesCorps({ ...c, pts: [{ x: 0, y: t0 }, { x: L, y: t0 }, { x: L, y: t0 + W }, { x: 0, y: t0 + W }], pignons: c.pignons, ecart: 0 } as CorpsToit, null, false) : null;
    const etendu = avecPignons ? null : facettesEtendues(c, L, W, { egout0: 0, egout1: 0, rive0: 0, rive1: 0 }, 0);
    const monde = (f: { x: number; y: number; z: number }[]): Sommet[] => f.map((q) => ({ s: q.x, t: q.y - t0, z: q.z }));
    const { pans, murs: mursSimples } = avecPignons ? { pans: avecPignons.pans.map(monde), murs: avecPignons.murs.map(monde) } : etendu ?? facettesSimples(c, L, W);
    // Le dessin etendu ne rend que les murs de bout : les murs d'egout sont ceux du prisme.
    const prisme = (t: number, z: number): Sommet[] => [{ s: 0, t, z: 0 }, { s: L, t, z: 0 }, { s: L, t, z }, { s: 0, t, z }];
    const murs = etendu ? [...etendu.murs, prisme(0, c.egouts[0]), prisme(W, c.egouts[1])] : avecPignons ? [...mursSimples, prisme(0, c.egouts[0]), prisme(W, c.egouts[1]), [{ s: 0, t: 0, z: 0 }, { s: 0, t: W, z: 0 }, { s: 0, t: W, z: c.egouts[1] }, { s: 0, t: 0, z: c.egouts[0] }], [{ s: L, t: 0, z: 0 }, { s: L, t: W, z: 0 }, { s: L, t: W, z: c.egouts[1] }, { s: L, t: 0, z: c.egouts[0] }]] : mursSimples;
    const dormers = facettesLucarnes(c, L, W);
    const decale = (f: Sommet[]): Sommet[] => f.map((q) => ({ ...q, t: q.t + t0 }));
    liste.push(
      ...murs.map((f) => ({ f: decale(f), mur: true, lucarne: false })), ...pans.map((f) => ({ f: decale(f), mur: false, lucarne: false })),
      ...dormers.murs.map((f) => ({ f: decale(f), mur: true, lucarne: true })), ...dormers.pans.map((f) => ({ f: decale(f), mur: false, lucarne: true })),
    );
  }
  liste.push(...plus.map(({ f, mur, vitre, element }) => ({ f, mur, lucarne: false, vitre: !!vitre, element: !!element })));
  const K = 22, cos = Math.cos(Math.PI / 6), sin = Math.sin(Math.PI / 6);
  const proj = (m: Sommet): [number, number] => [(m.s - m.t) * cos * K, (m.s + m.t) * sin * K - m.z * K];
  const profondeur = (f: Sommet[]) => f.reduce((a, m) => a + m.s + m.t, 0) / f.length;
  // Ce qui est pose sur le toit (`element`) se peint apres lui : un panneau couche sur le pan a presque sa profondeur moyenne, et le pan
  // le recouvrait. Sa vitre, a la meme profondeur que son cadre, se peint par-dessus.
  const tries = liste.slice().sort((a, b) => Number(!!a.element) - Number(!!b.element) || profondeur(a.f) - profondeur(b.f) || Number(a.mur) - Number(b.mur) || Number(!!a.vitre) - Number(!!b.vitre));
  const plates = tries.map(({ f, mur, lucarne, vitre, element }) => {
    // Le ton vient de la normale : un pan face au soleil (haut-gauche) est clair.
    const [A, B, C] = [f[0] as Sommet, f[1] as Sommet, f[2] as Sommet];
    const [ux, uy, uz] = [B.s - A.s, B.t - A.t, B.z - A.z], [vx, vy, vz] = [C.s - A.s, C.t - A.t, C.z - A.z];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const n = Math.hypot(nx, ny, nz) || 1; nx /= n; ny /= n; nz /= n;
    const signe = nz < 0 && !mur ? -1 : 1;
    const ton = Math.max(0, Math.min(1, 0.55 + 0.45 * signe * (-0.4 * nx + 0.3 * ny + 0.85 * nz)));
    return { points: f.map(proj), ton, mur, lucarne, ...(vitre ? { vitre } : {}), ...(element ? { element: true as const } : {}) };
  });
  const xs = plates.flatMap((p) => p.points.map((q) => q[0])), ys = plates.flatMap((p) => p.points.map((q) => q[1]));
  const x0 = Math.min(...xs), y0 = Math.min(...ys);
  return {
    facettes: plates.map((p) => ({ ...p, points: p.points.map(([x, y]) => [Math.round((x - x0 + 6) * 10) / 10, Math.round((y - y0 + 6) * 10) / 10] as [number, number]) })),
    largeur: Math.max(...xs) - x0 + 12, hauteur: Math.max(...ys) - y0 + 12,
  };
}

/**
 * La part de la vignette autour de l'element pose sur le toit (lucarne, ou facettes `element`) : un carre de `ZOOM_VIGNETTE` fois sa plus
 * grande dimension, au moins `COTE_MIN_VIGNETTE` (en unites de la projection, 22 par metre), centre sur lui. Dans la maison entiere, une
 * fenetre de toit ou une jacobine ne faisaient que quelques pixels d'une tuile du catalogue (2 novembre 2026). Les facettes qui sortent du
 * carre sont coupees par la vignette elle-meme ; sans element, la vue est rendue telle quelle.
 */
export const ZOOM_VIGNETTE = 2.2;
export const COTE_MIN_VIGNETTE = 70;
export function recadrerSurElement(vue: VueIso): VueIso {
  const pts = vue.facettes.filter((f) => f.lucarne || f.element).flatMap((f) => f.points);
  if (!pts.length) return vue;
  const xs = pts.map((q) => q[0]), ys = pts.map((q) => q[1]);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  const cote = Math.max(COTE_MIN_VIGNETTE, ZOOM_VIGNETTE * Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)));
  const x0 = cx - cote / 2, y0 = cy - cote / 2;
  // Une facette dont la boite touche le carre reste (un grand pan qui le traverse sans y avoir de sommet compris).
  const dedans = (f: FacettePlate) => { const fx = f.points.map((q) => q[0]), fy = f.points.map((q) => q[1]); return Math.min(...fx) < x0 + cote && Math.max(...fx) > x0 && Math.min(...fy) < y0 + cote && Math.max(...fy) > y0; };
  return {
    facettes: vue.facettes.filter(dedans).map((f) => ({ ...f, points: f.points.map(([x, y]) => [Math.round((x - x0) * 10) / 10, Math.round((y - y0) * 10) / 10] as [number, number]) })),
    largeur: cote, hauteur: cote,
  };
}

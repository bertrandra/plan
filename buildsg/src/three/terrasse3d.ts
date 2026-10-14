// Ce que l'on sait d'une toiture-terrasse, dessine (MD/spec-regles-toits.md §2.7, §4) : l'acrotere,
// un lisere de mur qui depasse la terrasse sur ses facades, et les edicules a toit plat.
//
// Ces donnees ne viennent que d'une observation : un corps sans `terrasse` reste dessine comme
// avant (le dessus de son prisme fait le toit, three/toitCorps3d.ts). Un corps en pente qui porterait
// une `terrasse` (un fichier abime) l'ignore : une terrasse est plate.

import type * as THREE_NS from 'three';
import { repere, point } from '../facade/toitCorps.js';
import { couleurToitPlat } from '../model/couleurToit.js';
import { textureCouverture, matiereCouverture } from './couverture.js';
import { enFacade, maille, type S3, type ContexteToitCorps } from './toitCorps3d.js';
import type { CorpsToit, PtBrut, Toit } from '../model/types.js';

export const NOM_ACROTERE = 'terrasse-acrotere';
export const NOM_EDICULE_MUR = 'terrasse-edicule-mur';
export const NOM_EDICULE_TOIT = 'terrasse-edicule-toit';
/** L'epaisseur de l'acrotere, prise dans le mur : il en prolonge le nu exterieur. */
export const EPAISSEUR_ACROTERE_M = 0.2;
/** En deca, un acrotere ou un edicule ne depasse pas assez pour se voir : il ne se dessine pas. */
const SAILLIE_MIN_M = 0.05;
/** Comme pour les corps (three/toitCorps3d.ts) : moins de 5 cm de montee, le corps est plat. */
const PLAT_M = 0.05;

/** Les facettes d'une toiture-terrasse : l'acrotere, les murs et les toits des edicules. */
export interface FacettesTerrasse {
  acrotere: S3[][];
  murs: S3[][];
  toits: S3[][];
}

const fini = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Le corps est-il plat ? Une terrasse n'a de sens que la. */
export function corpsPlat(c: Pick<CorpsToit, 'faitage' | 'egouts'>): boolean {
  return c.faitage - Math.min(...c.egouts) < PLAT_M;
}

type Cote = 't0' | 'sL' | 'tW' | 's0';

/**
 * L'acrotere d'un corps plat, sur chaque cote qui est une facade du `contour` (contre un autre corps,
 * il n'y a pas de rebord). Par cote : la face exterieure dans le plan du mur, la face interieure a
 * l'epaisseur, et le dessus, coupe d'onglet aux angles ; un bout libre (le cote voisin n'en a pas)
 * est ferme.
 */
function acrotere(c: CorpsToit, z0: number, h: number, contour: readonly PtBrut[] | null): S3[][] {
  const r = repere(c.pts);
  const { L, W } = r;
  const e = EPAISSEUR_ACROTERE_M;
  if (h < SAILLIE_MIN_M || L <= 2 * e || W <= 2 * e) return [];
  const z1 = z0 + h;
  // Les cotes dans l'ordre du tour : coins exterieurs et direction vers l'interieur, dans le repere (s, t).
  const cotes: { cote: Cote; a: [number, number]; b: [number, number]; dedans: [number, number] }[] = [
    { cote: 't0', a: [0, 0], b: [L, 0], dedans: [0, 1] },
    { cote: 'sL', a: [L, 0], b: [L, W], dedans: [-1, 0] },
    { cote: 'tW', a: [L, W], b: [0, W], dedans: [0, -1] },
    { cote: 's0', a: [0, W], b: [0, 0], dedans: [1, 0] },
  ];
  const avec = cotes.map((k) => enFacade(r, contour, k.cote));
  // Les coins interieurs, au droit de chaque coin exterieur : la ou deux acroteres se rejoignent.
  const interieur = (sa: number, ta: number): [number, number] => [sa === 0 ? e : L - e, ta === 0 ? e : W - e];
  const P = ([s, t]: [number, number], z: number): S3 => ({ ...point(r, s, t), z });
  const polys: S3[][] = [];
  cotes.forEach((k, i) => {
    if (!avec[i]) return;
    const avant = avec[(i + 3) % 4], apres = avec[(i + 1) % 4];
    const decale = ([s, t]: [number, number]): [number, number] => [s + k.dedans[0] * e, t + k.dedans[1] * e];
    const ia = avant ? interieur(...k.a) : decale(k.a);
    const ib = apres ? interieur(...k.b) : decale(k.b);
    polys.push([P(k.a, z0), P(k.b, z0), P(k.b, z1), P(k.a, z1)]);
    polys.push([P(ib, z0), P(ia, z0), P(ia, z1), P(ib, z1)]);
    polys.push([P(k.a, z1), P(k.b, z1), P(ib, z1), P(ia, z1)]);
    if (!avant) polys.push([P(ia, z0), P(k.a, z0), P(k.a, z1), P(ia, z1)]);
    if (!apres) polys.push([P(k.b, z0), P(ib, z0), P(ib, z1), P(k.b, z1)]);
  });
  return polys;
}

/**
 * Les facettes de la terrasse d'un corps : rien sans `terrasse`, rien sur un corps en pente. Les
 * edicules montent du dessus de la terrasse jusqu'a leur sommet ; leur toit est plat.
 */
export function facettesTerrasse(c: CorpsToit, contour: readonly PtBrut[] | null = null): FacettesTerrasse {
  const vide: FacettesTerrasse = { acrotere: [], murs: [], toits: [] };
  const terr = c.terrasse;
  if (!terr || !corpsPlat(c)) return vide;
  // Le dessus du prisme d'un corps plat : son egout le plus bas (three/scene.ts).
  const z0 = Math.min(...c.egouts);
  const h = fini(terr.acrotereM) ? terr.acrotereM : 0;
  const murs: S3[][] = [], toits: S3[][] = [];
  for (const ed of terr.edicules ?? []) {
    if (!Array.isArray(ed?.pts) || ed.pts.length < 3 || !fini(ed.sommetM) || ed.sommetM - z0 < SAILLIE_MIN_M) continue;
    const pts = ed.pts.filter((q) => fini(q?.x) && fini(q?.y));
    if (pts.length < 3) continue;
    pts.forEach((a, i) => {
      const b = pts[(i + 1) % pts.length] as PtBrut;
      murs.push([{ ...a, z: z0 }, { ...b, z: z0 }, { ...b, z: ed.sommetM }, { ...a, z: ed.sommetM }]);
    });
    toits.push(pts.map((q) => ({ x: q.x, y: q.y, z: ed.sommetM })));
  }
  return { acrotere: acrotere(c, z0, h, contour), murs, toits };
}

/**
 * Pose l'acrotere et les edicules des corps plats. L'acrotere et les murs des edicules sont en
 * couleur de mur (avec la texture des murs hauts), le toit des edicules en gravillons, comme la terrasse.
 */
export function ajouterTerrasses3d(ctx: ContexteToitCorps, corps: readonly CorpsToit[], toitRef: Toit | null | undefined, contour: readonly PtBrut[] | null = null): { acrotere: number; edicules: number } {
  const acro: S3[][] = [], murs: S3[][] = [], toits: S3[][] = [];
  corps.forEach((c) => { const f = facettesTerrasse(c, contour); acro.push(...f.acrotere); murs.push(...f.murs); toits.push(...f.toits); });
  const texMur = (ctx.textureMur as { isTexture?: boolean } | null | undefined)?.isTexture ? (ctx.textureMur as THREE_NS.Texture) : null;
  const poserMurs = (polys: S3[][], nom: string) => {
    if (!polys.length) return;
    const m = new THREE.Mesh(maille(polys, ctx.toLocal, false, false, !!texMur), new THREE.MeshStandardMaterial({ color: ctx.couleurMur, side: THREE.DoubleSide, ...(texMur ? { map: texMur } : {}) }));
    m.name = nom;
    ctx.scene.add(m);
  };
  poserMurs(acro, NOM_ACROTERE);
  poserMurs(murs, NOM_EDICULE_MUR);
  if (toits.length) {
    const tex = ctx.textures ? textureCouverture('terrasse') : null;
    const m = new THREE.Mesh(maille(toits, ctx.toLocal, !!tex, true), new THREE.MeshStandardMaterial({ color: couleurToitPlat(toitRef), ...matiereCouverture('terrasse'), side: THREE.DoubleSide, ...(tex ? { map: tex } : {}) }));
    m.name = NOM_EDICULE_TOIT;
    ctx.scene.add(m);
  }
  return { acrotere: acro.length, edicules: toits.length };
}

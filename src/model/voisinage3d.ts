// L'apparence du voisinage en 3D (MD/spec-toit-ign.md §6.4) : ce que l'inspecteur regle sur la
// parcelle du projet, et ce que la scene en tire pour chaque maison voisine.
//
// Les defauts sont le rendu d'avant ce reglage : la couleur du plan pour les murs, la vitre
// bleu-gris, des fenetres de 1 m sur 1,2 m tous les 2,4 m, un grillage clair sur les limites.
// Ce qui est tire au hasard (deux tons, une nuance, une dimension entre un minimum et un maximum)
// l'est par un tirage reproductible depuis la cle de l'objet : deux ouvertures de la scene, et
// l'export GLB, montrent la meme maison.

import type { ObjetPlan, ReglagesVoisinage3d, TypeCloture } from './types.js';
import { DEFAUTS_PAR_TYPE, COULEUR_CLOTURE_DEFAUT } from './cloture.js';

/** La couleur des murs des maisons voisines a l'import (geo/cadastreObjets.ts), et son second ton. */
export const COULEUR_MAISON_VOISINE = '#CFC3B4';
/** La vitre d'avant : un bleu-gris qui reflete le ciel. */
export const COULEUR_VITRE_DEFAUT = '#6F8AA6';
/** Le grillage du voisinage d'avant : un gris vert clair, qui ne fait pas trait vu de loin. */
export const COULEUR_GRILLAGE_VOISINAGE = '#A9B2A6';

export const VOISINAGE_3D_DEFAUT: ReglagesVoisinage3d = {
  maisons: { mode: 'plan', couleur: COULEUR_MAISON_VOISINE, couleur2: '#B9A98F', couleur3: '#E6DED0', nombre: 2 },
  fenetres: { mode: 'unique', couleur: COULEUR_VITRE_DEFAUT, couleur2: '#8FA6BE', largeurMin: 1, largeurMax: 1, hauteurMin: 1.2, hauteurMax: 1.2, entraxeMin: 2.4, entraxeMax: 2.4 },
  cloture: { afficher: true, type: 'grillage', couleur: COULEUR_GRILLAGE_VOISINAGE },
  rues: { afficher: false },
};

/** La couleur par defaut d'une cloture du voisinage selon son type : celle du type, sauf le grillage, plus clair. */
export function couleurClotureVoisinageDefaut(type: Exclude<TypeCloture, 'aucune'>): string {
  return type === 'grillage' ? COULEUR_GRILLAGE_VOISINAGE : DEFAUTS_PAR_TYPE[type].couleur ?? COULEUR_CLOTURE_DEFAUT;
}

/** Les reglages de la parcelle, completes des defauts ; les defauts seuls sans parcelle. */
export function voisinage3dDe(parcelle: ObjetPlan | null | undefined): ReglagesVoisinage3d {
  const r = parcelle?.voisinage3d;
  const maisons = { ...VOISINAGE_3D_DEFAUT.maisons, ...(r?.maisons ?? {}) };
  // `deuxTons` est le premier nom de la nuance : un projet qui le porte se lit comme une nuance a deux couleurs.
  if (maisons.mode === 'deuxTons') { maisons.mode = 'nuance'; maisons.nombre = 2; }
  return {
    maisons,
    fenetres: { ...VOISINAGE_3D_DEFAUT.fenetres, ...(r?.fenetres ?? {}) },
    cloture: { ...VOISINAGE_3D_DEFAUT.cloture, ...(r?.cloture ?? {}) },
    rues: { ...VOISINAGE_3D_DEFAUT.rues, ...(r?.rues ?? {}) },
  };
}

/** Ecrit un reglage sur la parcelle : la structure complete y est posee a la premiere ecriture. */
export function reglerVoisinage3d(parcelle: ObjetPlan, f: (r: ReglagesVoisinage3d) => void): void {
  const r = voisinage3dDe(parcelle);
  f(r);
  parcelle.voisinage3d = r;
}

/** Une graine de tirage depuis une cle d'objet : la meme cle, le meme tirage. */
export function graineDe(cle: string): number {
  let h = 2166136261;
  for (let i = 0; i < cle.length; i++) h = Math.imul(h ^ cle.charCodeAt(i), 16777619) >>> 0;
  return (h % 2147483646) + 1;
}

/** Un tirage reproductible dans [0, 1[. */
export function tirage(graine: number): () => number {
  let s = graine;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

type Rgb = [number, number, number];
function rgbDe(hex: string): Rgb {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m?.[1]) return [128, 128, 128];
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const hexDe = ([r, g, b]: Rgb) => '#' + [r, g, b].map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('').toUpperCase();

/** La couleur a `t` le long d'une suite de couleurs (0 : la premiere, 1 : la derniere), par morceaux. */
export function nuancer(couleurs: readonly string[], t: number): string {
  if (couleurs.length < 2) return couleurs[0] ?? '#808080';
  const pos = Math.min(1, Math.max(0, t)) * (couleurs.length - 1);
  const i = Math.min(couleurs.length - 2, Math.floor(pos));
  return melanger(couleurs[i] ?? '#808080', couleurs[i + 1] ?? '#808080', pos - i);
}

/** La couleur a `t` entre deux couleurs (0 : la premiere, 1 : la seconde). */
export function melanger(a: string, b: string, t: number): string {
  const x = rgbDe(a),
    y = rgbDe(b);
  return hexDe([x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t]);
}

/** Ce qu'une maison voisine recoit : la couleur de ses murs (absente : celle du plan) et ses fenetres. */
export interface ApparenceVoisin {
  couleurMur?: string;
  fenetres: { couleur: string; largeur: number; hauteur: number; entraxe: number };
}

const entre = (min: number, max: number, t: number) => Math.min(min, max) + Math.abs(max - min) * t;
const cm = (v: number) => Math.round(v * 100) / 100;

/** L'apparence d'une maison voisine d'apres les reglages, tiree de sa cle. */
export function apparenceVoisin(r: ReglagesVoisinage3d, cle: string): ApparenceVoisin {
  const t = tirage(graineDe(cle));
  const m = r.maisons;
  const palette = m.nombre === 3 ? [m.couleur, m.couleur2, m.couleur3] : [m.couleur, m.couleur2];
  const couleurMur = m.mode === 'unique' ? m.couleur : m.mode === 'nuance' || m.mode === 'deuxTons' ? nuancer(palette, t()) : undefined;
  const f = r.fenetres;
  const couleur = f.mode === 'nuance' ? melanger(f.couleur, f.couleur2, t()) : f.couleur;
  return {
    ...(couleurMur ? { couleurMur } : {}),
    fenetres: { couleur, largeur: cm(entre(f.largeurMin, f.largeurMax, t())), hauteur: cm(entre(f.hauteurMin, f.hauteurMax, t())), entraxe: cm(entre(f.entraxeMin, f.entraxeMax, t())) },
  };
}

// La couleur des murs d'un batiment (MD/spec-toit-ign.md §6.5).
//
// Deux sources, comme pour les toits (model/couleurToit.ts) :
//   - le materiau des murs que la BD TOPO reprend des fichiers fonciers (`materiaux_des_murs`), pour
//     tous les batiments, sans appel de plus : pierre, meuliere, brique... ; il dit la matiere, pas
//     la teinte exacte, et un beton ou un agglomere est presque toujours enduit d'une teinte inconnue ;
//   - la facade vue sur une photo de rue (Panoramax), quand une photo la montre et que ses pixels
//     sont coherents : la teinte reelle.
// La photo l'emporte, le materiau la remplace quand il n'y a pas de photo ou qu'elle est ambigue ;
// l'utilisateur peut choisir l'une ou l'autre, ou la couleur du plan.
//
// Ce module est pur : render/couleurMurPhoto.ts va chercher les pixels.

import { au } from '../util/tableaux.js';
import { versHex, couvertureDesFichiersFonciers } from './couleurToit.js';

/** La texture dessinee sur les murs en 3D (three/textureMur.ts). */
export type MateriauTexture = 'pierre' | 'meuliere' | 'beton' | 'brique' | 'enduit' | 'bois';

/** Les materiaux des murs des fichiers fonciers (un chiffre chacun), leur teinte usuelle et leur texture. */
export const MATERIAUX_MURS: Record<string, { libelle: string; couleur: string; texture: MateriauTexture }> = {
  '1': { libelle: 'pierre', couleur: '#C9B99A', texture: 'pierre' },
  '2': { libelle: 'meulière', couleur: '#B3895A', texture: 'meuliere' },
  '3': { libelle: 'béton', couleur: '#BEBAB1', texture: 'beton' },
  '4': { libelle: 'brique', couleur: '#A0523B', texture: 'brique' },
  '5': { libelle: 'aggloméré enduit', couleur: '#E2DACB', texture: 'enduit' },
  '6': { libelle: 'bois', couleur: '#8B6B4A', texture: 'bois' },
};

/** Le materiau des murs lu dans la BD TOPO : le premier cite donne la teinte. */
export interface MateriauMurs {
  /** Le code tel que la BD TOPO le donne (« 24 » : meuliere et brique). */
  code: string;
  libelle: string;
  couleur: string;
  texture: MateriauTexture;
}

/**
 * Le materiau des murs d'apres le code des fichiers fonciers : deux chiffres, le materiau principal
 * puis le secondaire, 0 pour « indetermine », 9 pour « autre ». Null quand aucun n'est connu.
 */
export function materiauMurs(code: unknown): MateriauMurs | null {
  if (typeof code !== 'string' || !/^\d+$/.test(code.trim())) return null;
  const connus = [...code.trim()].filter((c, i, t) => MATERIAUX_MURS[c] && t.indexOf(c) === i);
  const principal = connus[0];
  if (!principal) return null;
  const m = MATERIAUX_MURS[principal] as { couleur: string; texture: MateriauTexture };
  return { code: code.trim(), libelle: connus.map((c) => MATERIAUX_MURS[c]?.libelle).join(' et '), couleur: m.couleur, texture: m.texture };
}

/** La couverture d'apres les fichiers fonciers : avec les toits (model/couleurToit.ts), reprise ici pour qui lit les materiaux. */
export { couvertureDesFichiersFonciers };

/** La couleur lue sur une photo de rue, et d'ou elle vient. */
export interface PhotoMur {
  couleur: string;
  /** La photo Panoramax, sa date, son auteur et sa licence : a dire, la photo n'est pas la notre. */
  id: string;
  date: string | null;
  auteur: string | null;
  licence: string | null;
}

/** Ce qui est range sur le batiment : la lecture de la photo, et la source choisie a la main. */
export interface CouleurMurs {
  photo?: PhotoMur | null;
  /** Absente : automatique (la photo, sinon le materiau, sinon la couleur du plan). */
  source?: 'photo' | 'materiau' | 'plan';
}

/** La couleur des murs retenue pour la 3D, et sa source ; null : la couleur du plan. */
export function couleurMursRetenue(o: { couleurMurs?: CouleurMurs | null; bdtopo?: unknown }): { couleur: string; source: 'photo' | 'materiau' } | null {
  const choix = o.couleurMurs?.source;
  if (choix === 'plan') return null;
  const photo = o.couleurMurs?.photo?.couleur;
  const materiau = materiauMurs((o.bdtopo as { materiauxMurs?: unknown } | null | undefined)?.materiauxMurs)?.couleur;
  if (choix !== 'materiau' && photo) return { couleur: photo, source: 'photo' };
  if (materiau) return { couleur: materiau, source: 'materiau' };
  return null;
}

/**
 * La texture des murs en 3D : celle du materiau principal des fichiers fonciers, que la couleur
 * retenue teinte (la photo, ou le materiau lui-meme). Aucune quand la couleur du plan est choisie,
 * ou que le materiau n'est pas connu.
 */
export function textureDesMurs(o: { couleurMurs?: CouleurMurs | null; bdtopo?: unknown }): MateriauTexture | null {
  if (o.couleurMurs?.source === 'plan') return null;
  return materiauMurs((o.bdtopo as { materiauxMurs?: unknown } | null | undefined)?.materiauxMurs)?.texture ?? null;
}

/* ------------------------------------------------------------------------------------------------
 * Les pixels d'une facade
 * --------------------------------------------------------------------------------------------- */

/** En dessous, trop peu de points du mur lisibles pour juger. */
export const POINTS_MUR_MIN = 40;
/** La part des points du mur qui doivent rester une fois le ciel, le feuillage et les ombres ecartes. */
const PART_LISIBLE_MIN = 0.5;
/** Distance RGB sous laquelle un point est « de la teinte dominante », et part qui doit l'etre. */
const ECART_TEINTE = 40;
const PART_COHERENTE = 0.6;
/**
 * Plus sombre : une fenetre, une ombre, un volet, une haie a contre-jour ; plus clair : un ciel blanc,
 * un reflet. Un mur a l'ombre se perd avec eux : mieux vaut le materiau qu'une haie prise pour un mur.
 */
const LUMINANCE_MIN = 70;
const LUMINANCE_MAX = 245;

type Rgb = [number, number, number];
const luminance = ([r, g, b]: Rgb) => 0.299 * r + 0.587 * g + 0.114 * b;
const distance = (a: Rgb, b: Rgb) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
/**
 * Le feuillage d'une haie ou d'un arbre devant le mur : le vert passe le bleu, et ne le cede guere au
 * rouge - une haie de thuyas a l'ombre est olive (#464631), pas verte. Un enduit beige ou une
 * meuliere ont nettement plus de rouge que de vert.
 */
const estVegetation = ([r, g, b]: Rgb) => g > b + 8 && g >= r - 6;
/** Le ciel au-dessus d'un mur trop bas ou mal place : bleu et clair. */
const estCiel = ([r, g, b]: Rgb) => b > r + 18 && b > g + 4 && luminance([r, g, b]) > 110;

/**
 * Un mur a l'ombre : sombre et sans couleur, eclaire par le seul ciel - un enduit beige d'une facade
 * nord y devient gris (92, 90, 93). Une brique ou une pierre chaudes restent lisibles plus sombres.
 */
const estOmbre = ([r, g, b]: Rgb) => luminance([r, g, b]) < OMBRE_LUMINANCE && Math.max(r, g, b) - Math.min(r, g, b) < OMBRE_ECART;
const OMBRE_LUMINANCE = 125, OMBRE_ECART = 25;

function mediane(v: number[]): number {
  const t = [...v].sort((a, b) => a - b);
  const m = t.length >> 1;
  return t.length % 2 ? au(t, m) : (au(t, m - 1) + au(t, m)) / 2;
}

/** Ce que la photo dit d'un mur : la teinte, ou rien quand la lecture n'est pas concluante. */
export interface LectureMur {
  couleur: string | null;
  /** La part des points du mur de la teinte retenue : la plus grande l'emporte entre deux murs. */
  coherence: number;
}

/**
 * La teinte d'un mur d'apres les points de la photo qui tombent dessus (RGBA a plat ; les points
 * hors de l'image ont un alpha nul). Concluante quand assez de points restent une fois ecartes le
 * ciel, le feuillage, les fenetres et les reflets, et que la plupart sont d'une meme teinte : sinon
 * une voiture, une cloture, un arbre ou le ciel sont devant, et la photo ne dit rien du mur.
 */
export function couleurMurDepuisPixels(rgba: ArrayLike<number>): LectureMur {
  const px: Rgb[] = [];
  for (let i = 0; i + 3 < rgba.length; i += 4) if (au(rgba, i + 3) >= 128) px.push([au(rgba, i), au(rgba, i + 1), au(rgba, i + 2)]);
  if (px.length < POINTS_MUR_MIN) return { couleur: null, coherence: 0 };
  const lisibles = px.filter((p) => !estVegetation(p) && !estCiel(p) && !estOmbre(p) && luminance(p) >= LUMINANCE_MIN && luminance(p) <= LUMINANCE_MAX);
  if (lisibles.length < POINTS_MUR_MIN || lisibles.length < PART_LISIBLE_MIN * px.length) return { couleur: null, coherence: 0 };
  const dominante: Rgb = [mediane(lisibles.map((p) => p[0])), mediane(lisibles.map((p) => p[1])), mediane(lisibles.map((p) => p[2]))];
  const proches = lisibles.filter((p) => distance(p, dominante) <= ECART_TEINTE);
  const coherence = proches.length / px.length;
  if (coherence < PART_COHERENTE) return { couleur: null, coherence };
  const s = proches.reduce<Rgb>((a, p) => [a[0] + p[0], a[1] + p[1], a[2] + p[2]], [0, 0, 0]);
  return { couleur: versHex([s[0] / proches.length, s[1] / proches.length, s[2] / proches.length]), coherence: Math.round(coherence * 100) / 100 };
}

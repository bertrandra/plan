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
  /**
   * La version de la lecture qui a mis `photo` a null (app/mursFond.ts, VERSION_LECTURE_MURS) : une
   * regle de lecture meilleure passe ce numero, et les murs sans lecture concluante sont relus.
   */
  lecture?: number;
  /** Absente : automatique (la photo, sinon le materiau, sinon la couleur du plan). */
  source?: 'photo' | 'materiau' | 'plan';
  /**
   * La couleur lue sur vos photos, lors d'un audit de la parcelle (MD/spec-audit.md §6.2, §14), et
   * validee : une verite terrain, qui passe avant la photo de rue. Rangee a part de `photo`, que la
   * lecture Panoramax recrit : une actualisation ne doit pas l'effacer.
   */
  terrain?: CouleurTerrain | null;
  /** Le materiau des murs vu sur place (audit de la parcelle) : il l'emporte sur celui des fichiers fonciers. */
  materiau?: MateriauTexture | null;
}

/** La couleur des murs lue sur les photos d'un audit, et le jour de la validation. */
export interface CouleurTerrain {
  couleur: string;
  /** AAAA-MM-JJ. */
  date: string;
}

/** La teinte usuelle d'un materiau vu sur place, quand aucune photo n'a donne la sienne. */
function couleurDuMateriauVu(m: MateriauTexture): string | null {
  return Object.values(MATERIAUX_MURS).find((x) => x.texture === m)?.couleur ?? null;
}

/** La couleur des murs retenue pour la 3D, et sa source ; null : la couleur du plan. */
export function couleurMursRetenue(o: { couleurMurs?: CouleurMurs | null; bdtopo?: unknown }): { couleur: string; source: 'photo' | 'materiau' } | null {
  const choix = o.couleurMurs?.source;
  if (choix === 'plan') return null;
  // La couleur vue sur place passe avant la photo de rue : elle a ete validee par quelqu'un devant le mur.
  const photo = o.couleurMurs?.terrain?.couleur ?? o.couleurMurs?.photo?.couleur;
  const vu = o.couleurMurs?.materiau;
  const materiau = (vu ? couleurDuMateriauVu(vu) : null) ?? materiauMurs((o.bdtopo as { materiauxMurs?: unknown } | null | undefined)?.materiauxMurs)?.couleur;
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
  if (o.couleurMurs?.materiau) return o.couleurMurs.materiau;
  return materiauMurs((o.bdtopo as { materiauxMurs?: unknown } | null | undefined)?.materiauxMurs)?.texture ?? null;
}

/* ------------------------------------------------------------------------------------------------
 * Les pixels d'une facade
 * --------------------------------------------------------------------------------------------- */

/** En dessous, trop peu de points du mur lisibles pour juger. */
export const POINTS_MUR_MIN = 40;
/**
 * Une facade en partie cachee (une haie, une voiture devant) se lit sur ce qui en reste : au moins
 * tant de points lisibles, et cette part des points du mur. Mesure (octobre 2026) : au Vesinet, les
 * facades derriere les haies ne se lisaient jamais quand la moitie des points devaient l'etre.
 */
const POINTS_LISIBLES_MIN = 30;
const PART_LISIBLE_MIN = 0.25;
/**
 * Distance RGB sous laquelle un point est « de la teinte dominante », et part des points lisibles qui
 * doit l'etre. C'est aussi le seuil au-dela duquel deux couleurs de facade ne sont plus la meme teinte :
 * le rejeu d'un cas d'audit propose `facade.couleur` (MD/spec-audit.md §18.4, facade/regles/rejeu.ts).
 */
export const ECART_TEINTE = 40;
const PART_COHERENTE = 0.7;
/**
 * Au-dela de cette part des points du mur sur le ciel, la photo ne montre pas ce mur la ou on le croit
 * (cap ou position de la prise de vue imprecis, mur cache plus bas que son egout) : on ne la lit pas.
 * Mesure : sans ce garde-fou, les nuages au-dessus des haies se lisaient comme des facades blanches.
 */
export const PART_CIEL_MAX = 0.2;
/**
 * Une teinte dominante plus bleue que rouge de tant est du ciel entre les branches, une vitre ou
 * l'ombre bleue du soir : enduits, briques, pierres et meulieres sont chauds ou neutres.
 */
const FROID_MAX = 6;
/**
 * Plus sombre : une fenetre, une ombre, un volet, une haie a contre-jour ; plus clair : un ciel blanc,
 * un reflet. Un mur a l'ombre se perd avec eux : mieux vaut le materiau qu'une haie prise pour un mur.
 */
const LUMINANCE_MIN = 70;
const LUMINANCE_MAX = 245;

type Rgb = [number, number, number];
const luminance = ([r, g, b]: Rgb) => 0.299 * r + 0.587 * g + 0.114 * b;
const distance = (a: Rgb, b: Rgb) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/** `#rrggbb` (ou `#rgb`) en composantes ; null pour ce qui n'est pas une couleur. */
function versRgb(hex: string): Rgb | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m?.[1]) return null;
  const h = m[1].length === 3 ? m[1].replace(/./g, (c) => c + c) : m[1];
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

/** La distance RGB entre deux couleurs ecrites en hexadecimal, comparable a ECART_TEINTE ; null si l'une n'en est pas une. */
export function ecartTeintes(a: string, b: string): number | null {
  const p = versRgb(a), q = versRgb(b);
  return p && q ? distance(p, q) : null;
}
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
 * hors de l'image ont un alpha nul). `cielPhoto` : les points que la photo montre sur le ciel (clair,
 * lisse), ecartes par l'appelant. Concluante quand le mur n'est pas pour une bonne part du ciel,
 * qu'assez de points restent une fois ecartes le ciel, le feuillage, les fenetres et les reflets, que
 * la plupart sont d'une meme teinte, et que cette teinte n'est pas froide : sinon une voiture, une
 * cloture, un arbre ou le ciel sont devant, et la photo ne dit rien du mur.
 */
export function couleurMurDepuisPixels(rgba: ArrayLike<number>, cielPhoto = 0): LectureMur {
  const px: Rgb[] = [];
  for (let i = 0; i + 3 < rgba.length; i += 4) if (au(rgba, i + 3) >= 128) px.push([au(rgba, i), au(rgba, i + 1), au(rgba, i + 2)]);
  const vus = px.length + cielPhoto;
  if (vus < POINTS_MUR_MIN) return { couleur: null, coherence: 0 };
  if ((cielPhoto + px.filter(estCiel).length) / vus > PART_CIEL_MAX) return { couleur: null, coherence: 0 };
  const lisibles = px.filter((p) => !estVegetation(p) && !estCiel(p) && !estOmbre(p) && luminance(p) >= LUMINANCE_MIN && luminance(p) <= LUMINANCE_MAX);
  if (lisibles.length < POINTS_LISIBLES_MIN || lisibles.length < PART_LISIBLE_MIN * vus) return { couleur: null, coherence: 0 };
  const dominante: Rgb = [mediane(lisibles.map((p) => p[0])), mediane(lisibles.map((p) => p[1])), mediane(lisibles.map((p) => p[2]))];
  const proches = lisibles.filter((p) => distance(p, dominante) <= ECART_TEINTE);
  // Entre deux murs, le plus grand nombre de points de la teinte l'emporte : rapporte a tous les points vus.
  const coherence = proches.length / vus;
  if (proches.length < PART_COHERENTE * lisibles.length || dominante[2] > dominante[0] + FROID_MAX) return { couleur: null, coherence };
  const s = proches.reduce<Rgb>((a, p) => [a[0] + p[0], a[1] + p[1], a[2] + p[2]], [0, 0, 0]);
  return { couleur: versHex([s[0] / proches.length, s[1] / proches.length, s[2] / proches.length]), coherence: Math.round(coherence * 100) / 100 };
}

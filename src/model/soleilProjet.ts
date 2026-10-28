// Le soleil du projet : la date et l'heure que le plan, la Vue 3D et la visionneuse eclairent
// (MD/spec-ouvrages.md, « Le soleil et l'ombre », etape 6.7).
//
// Il y avait trois soleils, chacun avec son defaut : le plan (le 21 juin de l'annee du navigateur,
// 15 h), la Vue 3D et la visionneuse (la date UTC du jour, midi). Le meme parasol n'avait donc pas
// la meme ombre sur le plan et en 3D, et un projet rouvert ne retrouvait pas son soleil. Il n'y en a
// plus qu'un, decrit ici ; l'exemplaire vivant est tenu par core/soleil.ts, le lieu reste celui de
// la parcelle (model/lieu.ts).
//
// Il s'enregistre sur la parcelle du projet, comme le lieu, et seulement une fois choisi : un projet
// qui n'y a jamais touche garde au bit pres la forme de son fichier (empreinte projet.json).

import { lireDate } from '../util/date.js';

/** La date civile (`AAAA-MM-JJ`, heure legale du lieu) et l'heure, en minutes depuis minuit. */
export interface SoleilProjet {
  dateStr: string;
  minutes: number;
}

/**
 * L'heure du soleil d'un projet qui n'en a pas choisi : 15 h. L'heure ou une terrasse sert, au
 * milieu de la fenetre de la carte des heures d'ombre (12 h - 18 h), et ou l'ombre d'un parasol se
 * lit le mieux : assez haute pour etre courte, assez de biais pour se detacher de la toile. Midi,
 * l'ancien defaut de la 3D, pose l'ombre sous le parasol et ne dit rien.
 */
export const MINUTES_PAR_DEFAUT = 15 * 60;

const deux = (n: number): string => String(n).padStart(2, '0');

/**
 * Aujourd'hui, en date locale : la seule facon de le dire pour le soleil. La date UTC montrait la
 * veille entre minuit et deux heures en ete ; l'annee seule (l'ancien 21 juin du plan) ignorait le jour.
 */
export function aujourdhui(maintenant: Date = new Date()): string {
  return maintenant.getFullYear() + '-' + deux(maintenant.getMonth() + 1) + '-' + deux(maintenant.getDate());
}

/** Le soleil d'un projet qui n'en a pas enregistre : aujourd'hui, a 15 h. */
export function soleilParDefaut(maintenant: Date = new Date()): SoleilProjet {
  return { dateStr: aujourdhui(maintenant), minutes: MINUTES_PAR_DEFAUT };
}

/** Des minutes ramenees dans la journee (0 a 23 h 59), entieres ; `null` si ce n'est pas un nombre. */
export function minutesDuJour(v: unknown): number | null {
  if (typeof v !== 'number' || !Number.isFinite(v)) return null;
  return Math.min(1439, Math.max(0, Math.round(v)));
}

/**
 * Le soleil enregistre sur une parcelle, s'il se lit : une date lisible et des minutes. Un fichier
 * abime ne pose pas un soleil en NaN ; il retombe sur le defaut, comme un fichier qui n'en a pas.
 */
export function soleilEnregistre(brut: unknown): SoleilProjet | null {
  if (!brut || typeof brut !== 'object') return null;
  const b = brut as { dateStr?: unknown; minutes?: unknown };
  if (typeof b.dateStr !== 'string' || !lireDate(b.dateStr)) return null;
  const minutes = minutesDuJour(b.minutes);
  if (minutes === null) return null;
  return { dateStr: b.dateStr.trim(), minutes };
}

/**
 * Les hauteurs de soleil, en degres, ou quelque chose change sur le plan et dans la lumiere de la
 * 3D : une seule liste, pour qu'on les retrouve. Restent ailleurs, parce qu'ils ne decident rien et
 * ne reglent qu'un degrade a l'oeil : les couleurs du ciel (three/rendu.ts) et le couchant de la
 * vitrine (three/soleilVitrine.ts).
 */
export const SEUILS_SOLEIL_DEG = {
  /** Sous cette hauteur, l'ombre d'un parasol s'etire a l'infini : le plan ne la dessine plus. */
  ombreParasol: 8,
  /** La lampe du soleil de la 3D s'eteint progressivement sur ces derniers degres avant l'horizon. */
  extinctionLampe: 10,
  /** La lampe ne descend jamais plus bas : un rayon rasant fait des artefacts d'ombre. */
  plancherLampe: 3,
  /** Le lever et le coucher : le centre du disque passe l'horizon (geo/soleil.ts). */
  horizon: 0
} as const;

/**
 * La fenetre de la carte des heures d'ombre et de « Placer au mieux » : toute la saison, pas la
 * date choisie. Un parasol se place pour l'ete, pas pour un jour ; la carte le dit a l'ecran
 * (`libelle`), a cote de la date qu'elle ne suit pas. L'annee est fixe : la course du soleil change
 * a peine d'une annee a l'autre, et le placement doit etre le meme.
 */
export const FENETRE_CARTE_OMBRE = {
  mois: [5, 6, 7, 8, 9],
  heures: [12, 13, 14, 15, 16, 17, 18],
  /** Le jour echantillonne dans chaque mois. */
  jour: 15,
  annee: 2026,
  libelle: 'mai à septembre, 12 h – 18 h'
} as const;

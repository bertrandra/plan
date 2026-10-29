// Les observations du run d'une facade par Claude (MD/spec-facade-calage-audit.md §5, §8, lot F2) : le CONTRAT d'entree du moteur de
// regles des facades, comme les faits le sont pour les toits. Claude propose, le moteur decide (decision du proprietaire, 29 octobre
// 2026 : « l'IA doit alimenter le module regles ») : rien de ce qu'il rend n'est lu par la chaine des facades autrement que par les
// regles de facade/regles/facades/ia.ts, qui en tirent des decisions (une pose candidate pour l'arbitre, des zones de colombage qui
// ecartent des poses, des boites cochees ou non, des alertes de hauteur) ; les observations de toit (silhouette, bout, pointes,
// appentis, corps, elements) sont enregistrees, et n'iront au toit que par corpsSousContrainte (lot F4).
//
// Une requete par facade, sur l'image prise pour la suite (l'assemblage), rend tout d'un coup (deploy/schema-facade.json, genere) :
// - le calage : les deux angles du mur, en part de l'IMAGE (x, et le y de l'egout et du sol a chaque angle) ; les pointes des pignons,
//   les appentis, les corps et ce qui cache le mur, en part du MUR (u le long du mur, v en hauteurs d'egout depuis le sol) ;
// - la forme du haut (silhouette, bout), les elements du toit vus sur la ligne du haut ;
// - le parement du mur (le principal, et les zones d'un autre : un colombage) ;
// - les ouvertures (type, boite en u et v, niveau, travee, confiance), leurs details et leurs carreaux.
// Claude ne voit ni les pixels ni les metres : les dimensions viennent du plan et du LiDAR (decision 1).
//
// Ici : la lecture d'une passe (vocabulaire ferme, rien d'invente), le texte qui accompagne l'image, la reponse enregistree. Pur.

import { boutLu, silhouetteLue, type BoutVu, type SilhouetteFacade } from '../../model/silhouetteFacade.js';
import type { DetailsOuverture, TypeOuverture } from '../../model/types.js';

export type ConfianceIa = 'forte' | 'moyenne' | 'faible' | 'indetermine';
/** Un angle du mur, en part de l'image : sa place, et le haut (l'egout) et le bas (le sol) du mur a cet angle. */
export interface AngleIa { x: number; egout: number; sol: number; confiance: ConfianceIa }
/** Une partie du mur, de `debut` a `fin` en part de sa largeur. */
export interface Etendue { debut: number; fin: number }
type Grille = { colonnes: number | null; rangees: number | null };

/** La division du vitrage (§3.3, decision 15) : lue maintenant, dessinee en 3D plus tard (F8). `null` : non dit. */
export interface Carreaux extends Grille {
  vantaux: number | null;
  petitsBois: 'aucun' | 'fins' | 'epais' | null;
  /** La partie haute vitree a part : `hauteur` en part de la baie ; `aucune` quand il n'y en a pas. */
  imposte: (Grille & { hauteur: number }) | 'aucune' | null;
  vitrage: 'clair' | 'depoli' | 'teinte' | 'vitrail' | null;
}

export interface OuvertureIa {
  type: TypeOuverture;
  /** La boite en part du mur : u le long du mur depuis l'angle gauche, v en hauteurs d'egout depuis le sol. */
  u0: number; u1: number; v0: number; v1: number;
  niveau: number | null;
  travee: number | null;
  confiance: ConfianceIa;
  details: Pick<DetailsOuverture, 'volets' | 'allege' | 'forme'>;
  carreaux: Carreaux | null;
}

/** Les parements d'un mur (deploy/schema-facade.json, `surface`). */
export type Parement = 'enduit' | 'pierre' | 'brique' | 'colombage' | 'bardage-bois' | 'bardage-metal' | 'beton';
const PAREMENTS: readonly Parement[] = ['enduit', 'pierre', 'brique', 'colombage', 'bardage-bois', 'bardage-metal', 'beton'];
/** Une partie du mur d'un autre parement, en part du mur. */
export interface ZoneSurface { type: Parement; u0: number; u1: number; v0: number; v1: number; confiance: ConfianceIa }

export interface ObservationsFacade {
  calage: {
    angles: { gauche: AngleIa | null; droite: AngleIa | null };
    pointes: { u: number; v: number; confiance: ConfianceIa }[];
    appentis: Etendue[];
    corps: Etendue[];
    cache: (Etendue & { quoi: 'arbre' | 'haie' | 'voiture' | 'autre' })[];
  };
  forme: { silhouette: SilhouetteFacade; bout: BoutVu };
  elements: { element: 'cheminee' | 'lucarne'; u: number; confiance: ConfianceIa }[];
  /** Le parement du mur : le principal, et les zones d'un autre (un etage en colombage sur un rez-de-chaussee enduit). */
  surface: { principale: Parement | 'mixte' | 'indetermine'; zones: ZoneSurface[]; confiance: ConfianceIa };
  ouvertures: OuvertureIa[];
  confiance: 'faible' | 'moyenne' | 'forte';
}

/* ------------------------------------------------------------------------------------------------
 * La lecture : un mot inconnu est indetermine, un nombre illisible ecarte son objet (rien n'est invente)
 * --------------------------------------------------------------------------------------------- */

const objet = (v: unknown): Record<string, unknown> | null => (v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : null);
const liste = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const fini = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const parmi = <T extends string>(v: unknown, termes: readonly T[]): T | null => (typeof v === 'string' && (termes as readonly string[]).includes(v) ? v as T : null);
const entier = (v: unknown): number | null => (fini(v) && v >= 0 && Math.floor(v) === v ? v : null);
const CONFIANCES = ['forte', 'moyenne', 'faible'] as const;
const confiance = (v: unknown): ConfianceIa => parmi(v, CONFIANCES) ?? 'indetermine';
const TYPES: readonly TypeOuverture[] = ['fenetre', 'porte-fenetre', 'porte', 'garage'];

function lireAngle(v: unknown): AngleIa | null {
  const o = objet(v);
  return o && fini(o.x) && fini(o.egout) && fini(o.sol) && o.sol > o.egout ? { x: o.x, egout: o.egout, sol: o.sol, confiance: confiance(o.confiance) } : null;
}

function lireEtendue(v: unknown): Etendue | null {
  const o = objet(v);
  return o && fini(o.debut) && fini(o.fin) && o.fin > o.debut ? { debut: o.debut, fin: o.fin } : null;
}

const grille = (o: Record<string, unknown>): Grille => ({ colonnes: entier(o.colonnes), rangees: entier(o.rangees) });

function lireCarreaux(v: unknown): Carreaux | null {
  const o = objet(v);
  if (!o) return null;
  const imp = objet(o.imposte);
  const c: Carreaux = {
    vantaux: entier(o.vantaux), ...grille(o), petitsBois: parmi(o.petitsBois, ['aucun', 'fins', 'epais'] as const),
    imposte: imp && fini(imp.hauteur) && imp.hauteur > 0 && imp.hauteur < 1 ? { hauteur: imp.hauteur, ...grille(imp) } : o.imposte === 'aucune' ? 'aucune' : null,
    vitrage: parmi(o.vitrage, ['clair', 'depoli', 'teinte', 'vitrail'] as const),
  };
  return Object.values(c).some((x) => x !== null) ? c : null;
}

function lireOuverture(v: unknown): OuvertureIa | null {
  const o = objet(v);
  const type = parmi(o?.type, TYPES);
  if (!o || !type || !fini(o.u0) || !fini(o.u1) || !fini(o.v0) || !fini(o.v1) || !(o.u1 > o.u0) || !(o.v1 > o.v0)) return null;
  const d = objet(o.details) ?? {};
  const details: OuvertureIa['details'] = {};
  const volets = parmi(d.volets, ['battants', 'roulant', 'persiennes', 'aucun'] as const), allege = parmi(d.allege, ['balcon', 'garde-corps', 'pleine'] as const), forme = parmi(d.forme, ['rect', 'cintre', 'rond'] as const);
  if (volets) details.volets = volets;
  if (allege) details.allege = allege;
  if (forme) details.forme = forme;
  return { type, u0: o.u0, u1: o.u1, v0: o.v0, v1: o.v1, niveau: entier(o.niveau), travee: entier(o.travee), confiance: confiance(o.confiance), details, carreaux: lireCarreaux(o.carreaux) };
}

export const garder = <T>(l: (T | null)[]): T[] => l.filter((x): x is T => x !== null);

/** La reponse d'une passe, ramenee a ce que Plan sait lire ; null quand elle n'a pas la forme du run (une autre reponse, du texte). */
export function lireObservationsFacade(v: unknown): ObservationsFacade | null {
  const r = objet(v), calage = objet(r?.calage);
  if (!r || !calage || !Array.isArray(r.ouvertures)) return null;
  const angles = objet(calage.angles) ?? {}, forme = objet(r.forme) ?? {}, surface = objet(r.surface) ?? {};
  return {
    calage: {
      angles: { gauche: lireAngle(angles.gauche), droite: lireAngle(angles.droite) },
      pointes: garder(liste(calage.pointes).map((p) => { const o = objet(p); return o && fini(o.u) && fini(o.v) ? { u: o.u, v: o.v, confiance: confiance(o.confiance) } : null; })),
      appentis: garder(liste(calage.appentis).map(lireEtendue)),
      corps: garder(liste(calage.corps).map(lireEtendue)),
      cache: garder(liste(calage.cache).map((c) => { const e = lireEtendue(c), quoi = parmi(objet(c)?.quoi, ['arbre', 'haie', 'voiture', 'autre'] as const); return e && quoi ? { ...e, quoi } : null; })),
    },
    forme: { silhouette: silhouetteLue(forme.silhouette), bout: boutLu(forme.bout) },
    elements: garder(liste(r.elements).map((x) => { const o = objet(x), element = parmi(o?.element, ['cheminee', 'lucarne'] as const); return o && element && fini(o.u) ? { element, u: o.u, confiance: confiance(o.confiance) } : null; })),
    surface: {
      principale: parmi(surface.principale, [...PAREMENTS, 'mixte'] as const) ?? 'indetermine',
      zones: garder(liste(surface.zones).map((z) => { const o = objet(z), type = parmi(o?.type, PAREMENTS); return o && type && fini(o.u0) && fini(o.u1) && fini(o.v0) && fini(o.v1) && o.u1 > o.u0 && o.v1 > o.v0 ? { type, u0: o.u0, u1: o.u1, v0: o.v0, v1: o.v1, confiance: confiance(o.confiance) } : null; })),
      confiance: confiance(surface.confiance),
    },
    ouvertures: garder(r.ouvertures.map(lireOuverture)),
    confiance: parmi(r.confiance, ['faible', 'moyenne', 'forte'] as const) ?? 'faible',
  };
}

/* ------------------------------------------------------------------------------------------------
 * Le texte qui accompagne l'image
 * --------------------------------------------------------------------------------------------- */

const IMAGES = {
  assemblage: 'L’image est l’assemblage des photos redressées du mur.',
  photo: 'L’image est une seule photo du mur, pas encore redressée : situez les angles là où la photo les montre.',
  elevation: 'L’image est le mur seul, déjà redressé et cadré, du sol (en bas) à l’égout (en haut) : ses angles sont aux bords gauche et droit de l’image.',
} as const;

/**
 * Le texte du run : l'etiquette de la facade, ce qu'est l'image, ce que le plan attend du haut (les pointes du gabarit, en part du
 * mur et en hauteurs d'egout) et le parement deja connu (`parement`, en clair : ce que la personne a vu sur place, sinon la BD TOPO),
 * pour que Claude lise la photo avec lui (un colombage se distingue mieux quand on l'attend). Des attentes que Claude confirme ou
 * contredit, jamais des valeurs a recopier. Aucune dimension.
 */
export function texteRunFacade(e: { etiquette: string; image: keyof typeof IMAGES; pointes: readonly { u: number; v: number }[]; parement?: string | null }): string {
  const n = (v: number, k = 2) => String(Math.round(v * 10 ** k) / 10 ** k);
  const attente = e.pointes.length
    ? 'Le plan attend ' + (e.pointes.length > 1 ? e.pointes.length + ' pointes de pignon' : 'une pointe de pignon') + ' : ' + e.pointes.map((p) => 'u ' + n(p.u) + ', à environ ' + n(p.v, 1) + ' fois l’égout').join(' ; ') + '.'
    : 'Le plan attend un haut sans pignon : une ligne droite à l’égout.';
  const parement = e.parement ? 'Le parement du mur que Plan connaît (relevé sur place ou porté par le plan) : ' + e.parement + '. Dites ce que l’image montre, zone par zone.' : null;
  return ['Façade : ' + e.etiquette + '.', IMAGES[e.image], attente, ...(parement ? [parement] : [])].join('\n');
}


/* ------------------------------------------------------------------------------------------------
 * La reponse enregistree (§7.2, §8 « Reproductibilite ») : une par appel, a cote des precedentes, jamais en les ecrasant
 * --------------------------------------------------------------------------------------------- */

/** Un appel de Claude, tel que la calibration le garde avec son cas, et le rejoue sans reseau ni cout. */
export interface RunEnregistre {
  /** Le jour et l'heure de l'appel (ISO). */
  le: string;
  modele: string;
  /** Les versions du prompt et du schema qui ont servi (deploy/prompt-facade.md, schema-facade.json). */
  prompt: number;
  schema: number;
  /** x1 (le mode par defaut) ou x3 (trois passes votees : l'option du rejeu, pour mesurer). */
  passes: 1 | 3;
  /** Les sorties des passes reussies, telles que le serveur les a rendues (ramenees au schema). */
  sorties: unknown[];
  /** Le cout de l'appel, en dollars, toutes passes comprises ; null : un tarif manquait au serveur. */
  cout: number | null;
  /** Les tokens de l'appel : en entree (cache compris) et en sortie. */
  tokens: { entree: number; sortie: number };
  /** L'image envoyee (ses pixels), et la version de la chaine qui l'avait assemblee. */
  image: { largeur: number; hauteur: number };
  chaine: number;
  /** Une reponse fabriquee pour les tests et le banc, jamais de Claude : l'ecran le dit. */
  synthetique?: true;
}

/** Une reponse enregistree relue d'un cas ; null si elle n'en a pas la forme (elle est alors ignoree, pas inventee). */
export function lireRunEnregistre(v: unknown): RunEnregistre | null {
  const o = objet(v), im = objet(o?.image), t = objet(o?.tokens);
  if (!o || typeof o.le !== 'string' || typeof o.modele !== 'string' || !fini(o.prompt) || !fini(o.schema) || (o.passes !== 1 && o.passes !== 3) || !Array.isArray(o.sorties)) return null;
  if (!im || !fini(im.largeur) || !fini(im.hauteur) || !fini(o.chaine)) return null;
  return {
    le: o.le, modele: o.modele, prompt: o.prompt, schema: o.schema, passes: o.passes, sorties: o.sorties, cout: fini(o.cout) ? o.cout : null,
    tokens: { entree: fini(t?.entree) ? t.entree : 0, sortie: fini(t?.sortie) ? t.sortie : 0 }, image: { largeur: im.largeur, hauteur: im.hauteur }, chaine: o.chaine,
    ...(o.synthetique === true ? { synthetique: true as const } : {}),
  };
}

// Les observations du run d'une facade par Claude (MD/spec-facade-calage-audit.md §5, §8, lot F2) : le CONTRAT d'entree du moteur de
// regles des facades, comme les faits le sont pour les toits. Claude propose, le moteur decide (decision du proprietaire, 29 octobre
// 2026 : « l'IA doit alimenter le module regles ») : rien de ce qu'il rend n'est lu par la chaine des facades autrement que par les
// regles de facade/regles/facades/ia.ts, qui en tirent des decisions (une pose candidate pour l'arbitre, des zones de colombage qui
// ecartent des poses, des boites cochees ou non, des alertes de hauteur) ; les observations de toit (silhouette, bout, pointes,
// appentis, corps, elements) entrent dans le diagnostic de forme (lot F4, facade/regles/facades/diagnosticForme.ts), et n'iront au toit
// que par corpsSousContrainte, une fois la proposition cochee par la personne.
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
import { MOTS_PALETTE, type CouleurLue } from './palette.js';
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

/**
 * Les details de la facade enrichie (lot L1 de MD/spec-lecture-ia-elargie.md §4.1), lus sur une ouverture : les mots de Claude, que les
 * regles (facade/regles/facades/menuiseries.ts) traduisent ; `null` : non dit, ou `indetermine`.
 */
export interface DetailsLus {
  menuiserie: { materiau: 'bois' | 'pvc' | 'alu' | 'acier' | null; couleur: CouleurLue | null };
  /** `sans-objet` : pas de volets. */
  couleurVolets: CouleurLue | 'sans-objet' | null;
  /** `sans-objet` : pas de garde-corps ; `haut` : le dessus de la main courante, en hauteurs d'egout. */
  gardeCorps: { type: 'barreaux' | 'fer-forge' | 'verre' | 'plein' | 'sans-objet' | null; haut: number | null; couleur: CouleurLue | null };
}

export type GenreSaillieLu = 'bow-window' | 'galerie' | 'auvent' | 'appentis';
/** Une saillie vue sur le mur (lot L1), de `u0` a `u1` ; sans profondeur (une vue de face ne la montre pas, decision 4). */
export interface SaillieIa {
  genre: GenreSaillieLu; u0: number; u1: number;
  forme: 'pans' | 'rectangle' | 'arc' | 'conge'; niveau: 'rdc' | 'toit'; toit: 'pan' | 'pavillon' | 'plat';
  /** Le bas de son toit, en hauteurs d'egout ; null : non dit. */
  haut: number | null;
  couverture: 'verre' | 'tuile' | 'zinc' | 'autre' | null;
  confiance: ConfianceIa;
}
/** Un changement de nu du mur, a `u` : la partie de droite avance ou recule (lot L1). */
export interface DecrocheIa { u: number; sens: 'avance' | 'recul'; confiance: ConfianceIa }
/** La modenature lue (lot L1) : null pour un mot non dit. */
export interface ModenatureIa {
  egout: 'aucune' | 'corniche' | 'genoise' | null;
  rangsGenoise: number | null;
  bandeaux: number[];
  chaines: 'aucune' | 'pierre' | 'brique' | null;
  encadrements: 'aucun' | 'enduit' | 'pierre' | 'brique' | null;
  soubassement: { haut: number; parement: Parement | null } | 'aucun' | null;
  descentes: number[];
}
export interface BoiteUV { u0: number; u1: number; v0: number; v1: number }
/** Ce qui est pose contre le mur (lot L1), dans sa boite. */
export interface AppendiceIa extends BoiteUV { nature: 'perron' | 'store' | 'unite-exterieure' | 'boite-aux-lettres'; marches: number | null; confiance: ConfianceIa }
/** Une zone de l'etat du mur (lot L1, decision 8 : un signal). */
export interface EtatIa extends BoiteUV { nature: 'fissure' | 'enduit-abime' | 'humidite' | 'mousses' | 'autre'; confiance: ConfianceIa }

export interface OuvertureIa {
  type: TypeOuverture;
  /** La boite en part du mur : u le long du mur depuis l'angle gauche, v en hauteurs d'egout depuis le sol. */
  u0: number; u1: number; v0: number; v1: number;
  niveau: number | null;
  travee: number | null;
  confiance: ConfianceIa;
  details: Pick<DetailsOuverture, 'volets' | 'allege' | 'forme'>;
  carreaux: Carreaux | null;
  /**
   * La menuiserie, les volets, le garde-corps (lot L1) : poses apres le vote, depuis la baie de la lecture enrichie qui recouvre
   * l'ouverture ; absents sans lecture enrichie.
   */
  lus?: DetailsLus;
  /** `escalade` : vue par l'escalade seule, pas par le vote des passes (la regle de l'escalade l'a ajoutee). */
  source?: 'escalade';
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
  /** La facade enrichie (lot L1) : vides, ou null pour la modenature, dans une reponse d'avant le lot. */
  saillies: SaillieIa[];
  decroches: DecrocheIa[];
  modenature: ModenatureIa | null;
  appendices: AppendiceIa[];
  etat: EtatIa[];
  confiance: 'faible' | 'moyenne' | 'forte';
  /**
   * L'escalade a ete lue (facade/regles/facades/ia.ts, `escaladerObservations`) : son modele, et ce qu'elle a tranche contre le vote
   * des passes (en mots, pour l'ecran ; vide : elle s'accordait avec lui). Absent : le vote seul.
   */
  escalade?: { modele: string; tranche: string[] };
}

/* ------------------------------------------------------------------------------------------------
 * La lecture : un mot inconnu est indetermine, un nombre illisible ecarte son objet (rien n'est invente)
 * --------------------------------------------------------------------------------------------- */

const objet = (v: unknown): Record<string, unknown> | null => (v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : null);
const liste = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const fini = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
/**
 * Les bornes des reperes (le prompt les dit, la sortie structuree ne peut pas les imposer : ni `minimum` ni `maximum`). Une part de
 * l'image ou du mur va de 0 a 1 ; une hauteur en hauteurs d'egout part de 0 et ne passe pas V_MAX (une pointe de pignon est a 2 ou 3,
 * jamais a 6). Un debord d'arrondi (MARGE : un bord du mur lu a 1.01) se ramene au bord ; au-dela, le nombre n'est pas une part :
 * des pixels (`egout: 258`, verification de l'API du 29 octobre 2026) ou des metres, et l'objet qui le porte est ecarte, comme un
 * nombre illisible.
 */
const V_MAX = 6;
const MARGE = 0.05;
const borne = (v: unknown, max: number): number | null => (fini(v) && v >= -MARGE && v <= max + MARGE ? Math.min(max, Math.max(0, v)) : null);
const enPart = (v: unknown): number | null => borne(v, 1);
const enHauteur = (v: unknown): number | null => borne(v, V_MAX);
/** Une boite en part du mur (u de 0 a 1, v en hauteurs d'egout), non vide ; null hors des reperes. */
function boite(o: Record<string, unknown>): { u0: number; u1: number; v0: number; v1: number } | null {
  const u0 = enPart(o.u0), u1 = enPart(o.u1), v0 = enHauteur(o.v0), v1 = enHauteur(o.v1);
  return u0 !== null && u1 !== null && v0 !== null && v1 !== null && u1 > u0 && v1 > v0 ? { u0, u1, v0, v1 } : null;
}
const parmi = <T extends string>(v: unknown, termes: readonly T[]): T | null => (typeof v === 'string' && (termes as readonly string[]).includes(v) ? v as T : null);
const entier = (v: unknown): number | null => (fini(v) && v >= 0 && Math.floor(v) === v ? v : null);
const CONFIANCES = ['forte', 'moyenne', 'faible'] as const;
const confiance = (v: unknown): ConfianceIa => parmi(v, CONFIANCES) ?? 'indetermine';
const TYPES: readonly TypeOuverture[] = ['fenetre', 'porte-fenetre', 'porte', 'garage'];

function lireAngle(v: unknown): AngleIa | null {
  const o = objet(v);
  const x = enPart(o?.x), egout = enPart(o?.egout), sol = enPart(o?.sol);
  return o && x !== null && egout !== null && sol !== null && sol > egout ? { x, egout, sol, confiance: confiance(o.confiance) } : null;
}

function lireEtendue(v: unknown): Etendue | null {
  const o = objet(v);
  const debut = enPart(o?.debut), fin = enPart(o?.fin);
  return debut !== null && fin !== null && fin > debut ? { debut, fin } : null;
}

const grille = (o: Record<string, unknown>): Grille => ({ colonnes: entier(o.colonnes), rangees: entier(o.rangees) });

/**
 * L'imposte : un nombre depuis la version 4 du schema (sa part de la baie, 0 sans imposte, -1 non vue ; ses carreaux a cote), un objet
 * ou un mot dans une reponse enregistree d'avant, relue telle quelle.
 */
function lireImposte(o: Record<string, unknown>): Carreaux['imposte'] {
  const h = o.imposte;
  if (fini(h)) return h > 0 && h < 1 ? { hauteur: h, colonnes: entier(o.imposteColonnes), rangees: entier(o.imposteRangees) } : h === 0 ? 'aucune' : null;
  const imp = objet(h);
  return imp && fini(imp.hauteur) && imp.hauteur > 0 && imp.hauteur < 1 ? { hauteur: imp.hauteur, ...grille(imp) } : h === 'aucune' ? 'aucune' : null;
}

function lireCarreaux(v: unknown): Carreaux | null {
  const o = objet(v);
  if (!o) return null;
  const c: Carreaux = {
    vantaux: entier(o.vantaux), ...grille(o), petitsBois: parmi(o.petitsBois, ['aucun', 'fins', 'epais'] as const),
    imposte: lireImposte(o),
    vitrage: parmi(o.vitrage, ['clair', 'depoli', 'teinte', 'vitrail'] as const),
  };
  return Object.values(c).some((x) => x !== null) ? c : null;
}

const couleurLue = (v: unknown): CouleurLue | null => parmi(v, MOTS_PALETTE);

/** Les details d'une baie de la lecture enrichie (lot L1), a plat dans la reponse : un objet de moins a compiler pour la sortie structuree. */
function lireDetailsLus(d: Record<string, unknown>): DetailsLus {
  return {
    menuiserie: { materiau: parmi(d.menuiserie, ['bois', 'pvc', 'alu', 'acier'] as const), couleur: couleurLue(d.couleurMenuiserie) },
    couleurVolets: d.couleurVolets === 'sans-objet' ? 'sans-objet' : couleurLue(d.couleurVolets),
    gardeCorps: { type: parmi(d.gardeCorps, ['barreaux', 'fer-forge', 'verre', 'plein', 'sans-objet'] as const), haut: enHauteur(d.hautGardeCorps), couleur: couleurLue(d.couleurGardeCorps) },
  };
}

function lireOuverture(v: unknown): OuvertureIa | null {
  const o = objet(v);
  const type = parmi(o?.type, TYPES);
  const b = o ? boite(o) : null;
  if (!o || !type || !b) return null;
  const d = objet(o.details) ?? {};
  const details: OuvertureIa['details'] = {};
  const volets = parmi(d.volets, ['battants', 'roulant', 'persiennes', 'aucun'] as const), allege = parmi(d.allege, ['balcon', 'garde-corps', 'pleine'] as const), forme = parmi(d.forme, ['rect', 'cintre', 'rond'] as const);
  if (volets) details.volets = volets;
  if (allege) details.allege = allege;
  if (forme) details.forme = forme;
  return { type, ...b, niveau: entier(o.niveau), travee: entier(o.travee), confiance: confiance(o.confiance), details, carreaux: lireCarreaux(o.carreaux) };
}

function lireSaillie(v: unknown): SaillieIa | null {
  const o = objet(v), genre = parmi(o?.genre, ['bow-window', 'galerie', 'auvent', 'appentis'] as const);
  const u0 = enPart(o?.u0), u1 = enPart(o?.u1);
  if (!o || !genre || u0 === null || u1 === null || !(u1 > u0)) return null;
  return {
    genre, u0, u1, forme: parmi(o.forme, ['pans', 'rectangle', 'arc', 'conge'] as const) ?? 'rectangle', niveau: parmi(o.niveau, ['rdc', 'toit'] as const) ?? 'rdc',
    toit: parmi(o.toit, ['pan', 'pavillon', 'plat'] as const) ?? 'pan', haut: enHauteur(o.haut), couverture: parmi(o.couverture, ['verre', 'tuile', 'zinc', 'autre'] as const), confiance: confiance(o.confiance),
  };
}

/** Des hauteurs (bandeaux) ou des places (descentes) : celles qui sont dans leur repere, triees. */
const nombres = (v: unknown, lire: (x: unknown) => number | null): number[] => garder(liste(v).map(lire)).sort((a, b) => a - b);

function lireModenature(v: unknown): ModenatureIa | null {
  const o = objet(v);
  if (!o) return null;
  // Le soubassement : son haut en hauteurs d'egout (0 : aucun ; -1 : non vu) et son parement a cote.
  const haut = enHauteur(o.soubassement);
  return {
    egout: parmi(o.egout, ['aucune', 'corniche', 'genoise'] as const), rangsGenoise: entier(o.rangsGenoise),
    bandeaux: nombres(o.bandeaux, enHauteur),
    chaines: parmi(o.chaines, ['aucune', 'pierre', 'brique'] as const), encadrements: parmi(o.encadrements, ['aucun', 'enduit', 'pierre', 'brique'] as const),
    soubassement: haut === null ? null : haut > 0 ? { haut, parement: parmi(o.parementSoubassement, PAREMENTS) } : 'aucun',
    descentes: nombres(o.descentes, enPart),
  };
}

function lireAppendice(v: unknown): AppendiceIa | null {
  const o = objet(v), nature = parmi(o?.nature, ['perron', 'store', 'unite-exterieure', 'boite-aux-lettres'] as const), b = o ? boite(o) : null;
  return o && nature && b ? { nature, ...b, marches: entier(o.marches), confiance: confiance(o.confiance) } : null;
}

function lireEtat(v: unknown): EtatIa | null {
  const o = objet(v), nature = parmi(o?.nature, ['fissure', 'enduit-abime', 'humidite', 'mousses', 'autre'] as const), b = o ? boite(o) : null;
  return o && nature && b ? { nature, ...b, confiance: confiance(o.confiance) } : null;
}

export const garder = <T>(l: (T | null)[]): T[] => l.filter((x): x is T => x !== null);

/** Les champs de la facade enrichie d'un run qui n'en a pas lu (ou d'avant le lot L1). */
export const SANS_ENRICHIE: Pick<ObservationsFacade, 'saillies' | 'decroches' | 'modenature' | 'appendices' | 'etat'> = Object.freeze({ saillies: [], decroches: [], modenature: null, appendices: [], etat: [] });

/**
 * Une baie de la lecture enrichie (lot L1) : sa boite en part du mur, et ses details. Elle se rapporte a une ouverture du run par sa
 * boite (facade/regles/facades/voteEnrichi.ts) : les deux requetes ne se lisent pas l'une l'autre.
 */
export interface BaieLue extends BoiteUV { lus: DetailsLus }

/** La lecture enrichie d'une facade (lot L1) : la seconde requete sur l'image du run, deploy/schema-facade-enrichie.json. */
export interface LectureEnrichie extends Pick<ObservationsFacade, 'saillies' | 'decroches' | 'modenature' | 'appendices' | 'etat'> { baies: BaieLue[] }

/** Une passe de la lecture enrichie, ramenee a ce que Plan sait lire ; null quand elle n'en a pas la forme. */
export function lireLectureEnrichie(v: unknown): LectureEnrichie | null {
  const r = objet(v);
  if (!r || !Array.isArray(r.baies)) return null;
  return {
    baies: garder(r.baies.map((x) => { const o = objet(x), b = o ? boite(o) : null; return o && b ? { ...b, lus: lireDetailsLus(o) } : null; })),
    saillies: garder(liste(r.saillies).map(lireSaillie)),
    decroches: garder(liste(r.decroches).map((x) => { const o = objet(x), u = enPart(o?.u), sens = parmi(o?.sens, ['avance', 'recul'] as const); return o && u !== null && sens ? { u, sens, confiance: confiance(o.confiance) } : null; })),
    modenature: lireModenature(r.modenature),
    appendices: garder(liste(r.appendices).map(lireAppendice)),
    etat: garder(liste(r.etat).map(lireEtat)),
  };
}

/** La reponse d'une passe, ramenee a ce que Plan sait lire ; null quand elle n'a pas la forme du run (une autre reponse, du texte). */
export function lireObservationsFacade(v: unknown): ObservationsFacade | null {
  const r = objet(v), calage = objet(r?.calage);
  if (!r || !calage || !Array.isArray(r.ouvertures)) return null;
  const angles = objet(calage.angles) ?? {}, forme = objet(r.forme) ?? {}, surface = objet(r.surface) ?? {};
  return {
    calage: {
      angles: { gauche: lireAngle(angles.gauche), droite: lireAngle(angles.droite) },
      pointes: garder(liste(calage.pointes).map((p) => { const o = objet(p); const u = enPart(o?.u), h = enHauteur(o?.v); return o && u !== null && h !== null ? { u, v: h, confiance: confiance(o.confiance) } : null; })),
      appentis: garder(liste(calage.appentis).map(lireEtendue)),
      corps: garder(liste(calage.corps).map(lireEtendue)),
      cache: garder(liste(calage.cache).map((c) => { const e = lireEtendue(c), quoi = parmi(objet(c)?.quoi, ['arbre', 'haie', 'voiture', 'autre'] as const); return e && quoi ? { ...e, quoi } : null; })),
    },
    forme: { silhouette: silhouetteLue(forme.silhouette), bout: boutLu(forme.bout) },
    elements: garder(liste(r.elements).map((x) => { const o = objet(x), element = parmi(o?.element, ['cheminee', 'lucarne'] as const); const u = enPart(o?.u); return o && element && u !== null ? { element, u, confiance: confiance(o.confiance) } : null; })),
    surface: {
      principale: parmi(surface.principale, [...PAREMENTS, 'mixte'] as const) ?? 'indetermine',
      zones: garder(liste(surface.zones).map((z) => { const o = objet(z), type = parmi(o?.type, PAREMENTS); const b = o ? boite(o) : null; return o && type && b ? { type, ...b, confiance: confiance(o.confiance) } : null; })),
      confiance: confiance(surface.confiance),
    },
    ouvertures: garder(r.ouvertures.map(lireOuverture)),
    // La facade enrichie n'est pas dans le run : sa lecture a part (lireLectureEnrichie) la pose apres le vote (facade/regles/facades/ia.ts).
    ...SANS_ENRICHIE,
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
  elevationBande: 'L’image est le mur, déjà redressé et cadré, du sol (en bas) jusqu’au-dessus du haut de la façade : ses angles sont aux bords gauche et droit de l’image, et l’égout est à {egout} de sa hauteur depuis le bas ; au-dessus de lui se voient le toit, les pignons, les cheminées et les lucarnes.',
} as const;

/**
 * Le texte du run : l'etiquette de la facade, ce qu'est l'image, ce que le plan attend du haut (les pointes du gabarit, en part du
 * mur et en hauteurs d'egout) et le parement deja connu (`parement`, en clair : ce que la personne a vu sur place, sinon la BD TOPO),
 * pour que Claude lise la photo avec lui (un colombage se distingue mieux quand on l'attend). Des attentes que Claude confirme ou
 * contredit, jamais des valeurs a recopier. Aucune dimension.
 */
export function texteRunFacade(e: { etiquette: string; image: keyof typeof IMAGES; pointes: readonly { u: number; v: number }[]; parement?: string | null; egoutPart?: number }): string {
  const n = (v: number, k = 2) => String(Math.round(v * 10 ** k) / 10 ** k);
  const attente = e.pointes.length
    ? 'Le plan attend ' + (e.pointes.length > 1 ? e.pointes.length + ' pointes de pignon' : 'une pointe de pignon') + ' : ' + e.pointes.map((p) => 'u ' + n(p.u) + ', à environ ' + n(p.v, 1) + ' fois l’égout').join(' ; ') + '.'
    : 'Le plan attend un haut sans pignon : une ligne droite à l’égout.';
  const parement = e.parement ? 'Le parement du mur que Plan connaît (relevé sur place ou porté par le plan) : ' + e.parement + '. Dites ce que l’image montre, zone par zone.' : null;
  const image = IMAGES[e.image].replace('{egout}', Math.round((e.egoutPart ?? 1) * 100) + ' %');
  return ['Façade : ' + e.etiquette + '.', image, attente, ...(parement ? [parement] : [])].join('\n');
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
  /**
   * Les passes envoyees : trois, votees, en production (`facades.ia.passes`, decision du 29 octobre 2026) ; une, pour mesurer (et les
   * reponses enregistrees d'avant).
   */
  passes: 1 | 2 | 3;
  /** Les sorties des passes reussies, telles que le serveur les a rendues (ramenees au schema). */
  sorties: unknown[];
  /** Le cout de l'appel, en dollars, toutes passes comprises ; null : un tarif manquait au serveur. */
  cout: number | null;
  /** Les tokens de l'appel : en entree (cache compris) et en sortie. */
  tokens: { entree: number; sortie: number };
  /**
   * L'image envoyee : ses pixels avant reduction, et (lot L0, MD/spec-lecture-ia-elargie.md 4.8) l'empreinte et la taille des octets
   * que Claude a vus, tels que le serveur les garde avec la trace de la requete (`images/<sha256>.jpg`). Absentes d'une reponse
   * enregistree d'avant le lot, qui reste lisible ; la version de la chaine qui l'avait assemblee suit.
   */
  image: ImageEnvoyee;
  chaine: number;
  /** Une reponse fabriquee pour les tests et le banc, jamais de Claude : l'ecran le dit. */
  synthetique?: true;
  /** L'escalade demandee par la personne : une lecture de plus, par le modele de l'usage `escalade`, gardee pour le rejeu. */
  escalade?: EscaladeEnregistree;
  /**
   * La lecture enrichie (lot L1) : la seconde requete, sur la meme image, avec ses passes, ses versions et son cout. Absente d'un run
   * d'avant le lot ; `erreur` quand elle n'a rien rendu de lisible (le run reste entier, la facade est proposee sans ses champs).
   */
  enrichie?: LectureEnrichieEnregistree;
}

/** La lecture enrichie d'un run (lot L1) : ses passes reussies, ses versions, son modele, son cout ; ou ce qui l'a empechee. */
export interface LectureEnrichieEnregistree {
  le: string;
  modele: string;
  prompt: number;
  schema: number;
  passes: 1 | 2 | 3;
  sorties: unknown[];
  cout: number | null;
  tokens: { entree: number; sortie: number };
  /** Ce qui l'a empechee, en clair ; alors `sorties` est vide. */
  erreur?: string;
}

/** L'image d'un run : ses pixels, et l'empreinte (sha256 hexadecimal) et la taille des octets envoyes quand le serveur les a dites. */
export interface ImageEnvoyee { largeur: number; hauteur: number; sha256?: string; octets?: number }

/** Une escalade : une requete, jamais plus, sur la meme image et le meme texte que les passes ; sa sortie, ses versions, son cout. */
export interface EscaladeEnregistree {
  le: string;
  modele: string;
  prompt: number;
  schema: number;
  sortie: unknown;
  cout: number | null;
  tokens: { entree: number; sortie: number };
  /** L'empreinte des octets envoyes (lot L0) : celle des passes quand l'image est la meme. */
  sha256?: string;
}

const SHA256 = /^[0-9a-f]{64}$/;
/** L'empreinte relue d'un enregistrement : 64 chiffres hexadecimaux, sinon rien (jamais inventee). */
const empreinte = (v: unknown): { sha256: string } | Record<string, never> => (typeof v === 'string' && SHA256.test(v) ? { sha256: v } : {});

function lireEscalade(v: unknown): EscaladeEnregistree | null {
  const o = objet(v), t = objet(o?.tokens);
  if (!o || typeof o.le !== 'string' || typeof o.modele !== 'string' || !fini(o.prompt) || !fini(o.schema) || !lireObservationsFacade(o.sortie)) return null;
  return { le: o.le, modele: o.modele, prompt: o.prompt, schema: o.schema, sortie: o.sortie, cout: fini(o.cout) ? o.cout : null, tokens: { entree: fini(t?.entree) ? t.entree : 0, sortie: fini(t?.sortie) ? t.sortie : 0 }, ...empreinte(o.sha256) };
}

function lireEnrichie(v: unknown): LectureEnrichieEnregistree | null {
  const o = objet(v), t = objet(o?.tokens);
  if (!o || typeof o.le !== 'string' || typeof o.modele !== 'string' || !fini(o.prompt) || !fini(o.schema) || (o.passes !== 1 && o.passes !== 2 && o.passes !== 3) || !Array.isArray(o.sorties)) return null;
  return {
    le: o.le, modele: o.modele, prompt: o.prompt, schema: o.schema, passes: o.passes, sorties: o.sorties, cout: fini(o.cout) ? o.cout : null,
    tokens: { entree: fini(t?.entree) ? t.entree : 0, sortie: fini(t?.sortie) ? t.sortie : 0 }, ...(typeof o.erreur === 'string' ? { erreur: o.erreur } : {}),
  };
}

/** Une reponse enregistree relue d'un cas ; null si elle n'en a pas la forme (elle est alors ignoree, pas inventee). */
export function lireRunEnregistre(v: unknown): RunEnregistre | null {
  const o = objet(v), im = objet(o?.image), t = objet(o?.tokens);
  if (!o || typeof o.le !== 'string' || typeof o.modele !== 'string' || !fini(o.prompt) || !fini(o.schema) || (o.passes !== 1 && o.passes !== 2 && o.passes !== 3) || !Array.isArray(o.sorties)) return null;
  if (!im || !fini(im.largeur) || !fini(im.hauteur) || !fini(o.chaine)) return null;
  return {
    le: o.le, modele: o.modele, prompt: o.prompt, schema: o.schema, passes: o.passes, sorties: o.sorties, cout: fini(o.cout) ? o.cout : null,
    tokens: { entree: fini(t?.entree) ? t.entree : 0, sortie: fini(t?.sortie) ? t.sortie : 0 }, image: { largeur: im.largeur, hauteur: im.hauteur, ...empreinte(im.sha256), ...(entier(im.octets) !== null ? { octets: im.octets as number } : {}) }, chaine: o.chaine,
    ...(o.synthetique === true ? { synthetique: true as const } : {}),
    ...(lireEscalade(o.escalade) ? { escalade: lireEscalade(o.escalade) as EscaladeEnregistree } : {}),
    ...(lireEnrichie(o.enrichie) ? { enrichie: lireEnrichie(o.enrichie) as LectureEnrichieEnregistree } : {}),
  };
}

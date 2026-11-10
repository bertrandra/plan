// Les profils de toits de regles/toits/reglages.json (MD/spec-regles-toits.md §6, §9.1).
//
// Un profil surcharge quelques seuils de la lecture des toits pour les batiments qui remplissent toutes
// ses conditions (`quand`). Les conditions parlent un vocabulaire ferme, fait de ce qui se mesure sur un
// batiment : departement, latitude, materiaux des fichiers fonciers, hauteur, surface, mitoyennete,
// forme du contour, epoque. Jamais une adresse ni un batiment : ce serait un fait deguise
// (regles/toits/faits.json). Un profil nait d'une contradiction entre deux cas (spec §8.3), d'ou les
// deux cas au moins qu'il cite.
//
// Ce module lit et verifie les profils, et choisit ceux d'un batiment deja decrit ; la description du
// batiment (sa geometrie, ses voisins, son lieu) est faite par facade/regles/toits/profils.ts. Deux profils qui
// touchent le meme seuil : le plus precis (le plus de conditions) l'emporte ; a precision egale, s'ils
// peuvent s'appliquer au meme batiment, le fichier est refuse - c'est la CI qui le dit, pas un batiment
// tire au sort en production.

/** Les materiaux des murs des fichiers fonciers (`materiaux_des_murs`, premier chiffre connu). */
export const MATERIAUX_MURS_PROFIL = { '1': 'pierre', '2': 'meuliere', '3': 'beton', '4': 'brique', '5': 'agglomere', '6': 'bois' } as const;
export type MateriauMursProfil = (typeof MATERIAUX_MURS_PROFIL)[keyof typeof MATERIAUX_MURS_PROFIL];
/** Les couvertures des fichiers fonciers (`materiaux_de_la_toiture`, model/couleurToit.ts). */
export const MATERIAUX_TOITURE_PROFIL = ['tuile', 'ardoise', 'zinc', 'beton'] as const;
export type MateriauToitureProfil = (typeof MATERIAUX_TOITURE_PROFIL)[number];
/** La part du contour d'un batiment collee a un autre batiment, en trois niveaux. */
export const NIVEAUX_MITOYENNETE = ['aucune', 'partielle', 'forte'] as const;
export type NiveauMitoyennete = (typeof NIVEAUX_MITOYENNETE)[number];
/**
 * La forme du contour : un rectangle (a l'equerre a 15 degres pres), plusieurs rectangles (en L, en T),
 * un trapeze (quatre cotes, pas a l'equerre), ou un contour de biais a plus de quatre cotes.
 */
export const FORMES_CONTOUR = ['rectangle', 'composee', 'trapeze', 'biais'] as const;
export type FormeContour = (typeof FORMES_CONTOUR)[number];

/**
 * Les niveaux de mitoyennete, sur la part du perimetre collee a un autre batiment (a 50 cm pres). Un
 * pavillon jumele colle un mur sur quatre (20 a 30 %) ; une maison de rang, ou de village, deux (40 % et
 * plus). Ils font partie du vocabulaire : les changer change le sens des profils, d'ou leur place dans
 * l'empreinte (`formeEmpreinteProfils`).
 */
export const MITOYENNETE_PARTIELLE_MIN = 0.05;
export const MITOYENNETE_FORTE_MIN = 0.4;
/** La distance a laquelle deux murs sont colles : deux traces de la BD TOPO ne tombent pas l'un sur l'autre. */
export const TOLERANCE_MITOYENNETE_M = 0.5;

/** Le niveau de mitoyennete d'une part de perimetre collee. */
export function niveauMitoyennete(part: number): NiveauMitoyennete {
  return part >= MITOYENNETE_FORTE_MIN ? 'forte' : part >= MITOYENNETE_PARTIELLE_MIN ? 'partielle' : 'aucune';
}

/** Une plage de valeurs : `min` compris, `max` exclu (deux plages qui se suivent ne se recouvrent pas). */
export interface Plage { min?: number; max?: number }

/** Les conditions d'un profil : toutes doivent etre remplies. Une condition absente n'est pas verifiee. */
export interface QuandProfil {
  /** Codes de departement : `"13"`, `"2A"`, `"971"`. Tire de l'IDU ou du code INSEE de la parcelle du projet. */
  departements?: string[];
  /** En degres : `{ "min": 43, "max": 45 }`. */
  latitude?: Plage;
  materiauxMurs?: MateriauMursProfil[];
  materiauxToiture?: MateriauToitureProfil[];
  /** La hauteur a l'egout de la BD TOPO, en metres. */
  hauteur?: Plage;
  /** L'aire du contour, en metres carres. */
  surface?: Plage;
  mitoyennete?: NiveauMitoyennete[];
  formeContour?: FormeContour[];
  /** L'annee de la BD TOPO (`date_d_apparition`) ; inconnue, la condition n'est pas remplie. */
  epoque?: Plage;
}
export type CleCondition = keyof QuandProfil;

/** Un profil lu et verifie. */
export interface ProfilToit {
  id: string;
  quand: QuandProfil;
  /** Les seuils qu'il change, par nom (un nom de regles/toits/reglages.json). */
  surcharges: Record<string, number>;
  pourquoi: string;
  /** Les cas qui l'ont montre, `village/batiment` : deux au moins, ceux qui se contredisaient. */
  cas: string[];
}

/** Ce qu'on sait d'un batiment pour choisir ses profils. `null` : inconnu, et la condition n'est pas remplie. */
export interface DescriptionBatiment {
  departement: string | null;
  latitude: number | null;
  materiauMurs: MateriauMursProfil | null;
  materiauToiture: MateriauToitureProfil | null;
  hauteur: number | null;
  surface: number | null;
  mitoyennete: NiveauMitoyennete | null;
  formeContour: FormeContour | null;
  epoque: number | null;
}

/** Des profils illisibles ne doivent pas laisser lire les toits avec un seuil mal surcharge. */
export class ProfilsToitsIllisibles extends Error {}

/** Le type de chaque condition : une liste fermee de mots, ou une plage de nombres. */
const LISTES: Partial<Record<CleCondition, readonly string[] | RegExp>> = {
  departements: /^(0[1-9]|[1-8]\d|9[0-5]|2A|2B|97[1-6])$/,
  materiauxMurs: Object.values(MATERIAUX_MURS_PROFIL),
  materiauxToiture: MATERIAUX_TOITURE_PROFIL,
  mitoyennete: NIVEAUX_MITOYENNETE,
  formeContour: FORMES_CONTOUR,
};
const PLAGES: readonly CleCondition[] = ['latitude', 'hauteur', 'surface', 'epoque'];
/** Le vocabulaire, dans l'ordre : ce qu'un profil peut dire, et rien d'autre. */
export const VOCABULAIRE_PROFILS: readonly CleCondition[] = ['departements', 'latitude', 'materiauxMurs', 'materiauxToiture', 'hauteur', 'surface', 'mitoyennete', 'formeContour', 'epoque'];

const refuser = (texte: string): never => { throw new ProfilsToitsIllisibles('regles/toits/reglages.json, profils : ' + texte); };
const estObjet = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

function lirePlage(id: string, cle: string, v: unknown): Plage {
  if (!estObjet(v)) return refuser(id + ' : ' + cle + ' attend { min, max }');
  const p: Plage = {};
  for (const [k, x] of Object.entries(v)) {
    if (k !== 'min' && k !== 'max') return refuser(id + ' : ' + cle + ' ne connait que min et max, pas ' + k);
    if (typeof x !== 'number' || !Number.isFinite(x)) return refuser(id + ' : ' + cle + '.' + k + ' doit etre un nombre');
    p[k] = x;
  }
  if (p.min === undefined && p.max === undefined) return refuser(id + ' : ' + cle + ' sans borne');
  if (p.min !== undefined && p.max !== undefined && p.min >= p.max) return refuser(id + ' : ' + cle + ' vide (min >= max)');
  return p;
}

function lireListe(id: string, cle: CleCondition, v: unknown): string[] {
  // Un mot seul vaut une liste d'un mot : `"mitoyennete": "forte"` (l'exemple de la spec).
  const liste = typeof v === 'string' ? [v] : v;
  if (!Array.isArray(liste) || !liste.length) return refuser(id + ' : ' + cle + ' attend une liste non vide');
  const admis = LISTES[cle];
  for (const x of liste) {
    const ok = typeof x === 'string' && (admis instanceof RegExp ? admis.test(x) : !!admis?.includes(x));
    if (!ok) return refuser(id + ' : ' + cle + ' ne connait pas ' + JSON.stringify(x));
  }
  return [...new Set(liste as string[])];
}

function lireQuand(id: string, v: unknown): QuandProfil {
  if (!estObjet(v) || !Object.keys(v).length) return refuser(id + ' : quand doit dire au moins une condition (sans condition, c\'est un seuil a changer)');
  const inconnue = Object.keys(v).find((cle) => !VOCABULAIRE_PROFILS.includes(cle as CleCondition));
  if (inconnue) return refuser(id + ' : condition inconnue ' + inconnue + ' (vocabulaire ferme : ' + VOCABULAIRE_PROFILS.join(', ') + ')');
  // Dans l'ordre du vocabulaire : l'empreinte ne depend pas de l'ordre d'ecriture du fichier.
  const q: Record<string, unknown> = {};
  for (const cle of VOCABULAIRE_PROFILS) {
    if (v[cle] !== undefined) q[cle] = PLAGES.includes(cle) ? lirePlage(id, cle, v[cle]) : lireListe(id, cle, v[cle]);
  }
  return q as QuandProfil;
}

function lireSurcharges(id: string, v: unknown, seuils: ReadonlySet<string>): Record<string, number> {
  if (!estObjet(v) || !Object.keys(v).length) return refuser(id + ' : surcharges doit changer au moins un seuil');
  const out: Record<string, number> = {};
  for (const [nom, x] of Object.entries(v).sort(([m], [n]) => (m < n ? -1 : 1))) {
    if (!seuils.has(nom)) return refuser(id + ' : seuil inconnu ' + nom);
    if (typeof x !== 'number' || !Number.isFinite(x)) return refuser(id + ' : ' + nom + ' doit etre un nombre');
    out[nom] = x;
  }
  return out;
}

/** Un profil du fichier, verifie. */
function lireProfil(v: unknown, seuils: ReadonlySet<string>): ProfilToit {
  if (!estObjet(v)) return refuser('un profil doit etre un objet');
  const id = typeof v.id === 'string' && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(v.id) ? v.id : refuser('id manquant ou mal forme (minuscules et tirets) : ' + JSON.stringify(v.id));
  const inconnues = Object.keys(v).filter((k) => !['id', 'quand', 'surcharges', 'pourquoi', 'cas'].includes(k));
  if (inconnues.length) return refuser(id + ' : champ inconnu ' + inconnues.join(', '));
  const pourquoi = typeof v.pourquoi === 'string' && v.pourquoi.trim().length > 10 ? v.pourquoi : refuser(id + ' : pourquoi manquant');
  const cas = Array.isArray(v.cas) && v.cas.length >= 2 && v.cas.every((c) => typeof c === 'string' && c) ? (v.cas as string[]) : refuser(id + ' : un profil nait d\'une contradiction entre deux cas au moins (cas)');
  return { id, quand: lireQuand(id, v.quand), surcharges: lireSurcharges(id, v.surcharges, seuils), pourquoi, cas };
}

/** La precision d'un profil : le nombre de ses conditions. */
export const precision = (p: ProfilToit): number => Object.keys(p.quand).length;

const plagesSeRecouvrent = (a: Plage, b: Plage): boolean => (a.min ?? -Infinity) < (b.max ?? Infinity) && (b.min ?? -Infinity) < (a.max ?? Infinity);

/**
 * Deux profils peuvent-ils s'appliquer au meme batiment ? Oui, sauf si une condition qu'ils ont en commun
 * les separe (des listes sans mot commun, des plages disjointes). Des conditions differentes ne se
 * comparent pas (un departement et une latitude) : on les tient pour compatibles, par prudence.
 */
export function compatibles(a: QuandProfil, b: QuandProfil): boolean {
  for (const cle of VOCABULAIRE_PROFILS) {
    const x = a[cle], y = b[cle];
    if (x === undefined || y === undefined) continue;
    if (Array.isArray(x) && Array.isArray(y) ? !x.some((m) => (y as string[]).includes(m)) : !plagesSeRecouvrent(x as Plage, y as Plage)) return false;
  }
  return true;
}

/** Les conflits d'une liste de profils : meme precision, meme seuil, et un batiment qui pourrait remplir les deux. */
export function conflitsDeProfils(profils: readonly ProfilToit[]): string[] {
  const out: string[] = [];
  profils.forEach((a, i) => profils.slice(i + 1).forEach((b) => {
    if (precision(a) !== precision(b) || !compatibles(a.quand, b.quand)) return;
    const communs = Object.keys(a.surcharges).filter((n) => n in b.surcharges);
    if (communs.length) out.push(a.id + ' et ' + b.id + ' : meme precision (' + precision(a) + ') sur ' + communs.join(', '));
  }));
  return out;
}

/**
 * Les profils du fichier, verifies : vocabulaire ferme, seuils connus, ids uniques, pas de conflit.
 * Rend la liste dans l'ordre du fichier. `seuils` : les noms de regles/toits/reglages.json.
 */
export function lireProfilsToits(donnees: unknown, seuils: Iterable<string>): ProfilToit[] {
  if (donnees === undefined) return [];
  if (!Array.isArray(donnees)) return refuser('une liste est attendue');
  const noms = new Set(seuils);
  const profils = donnees.map((p) => lireProfil(p, noms));
  const ids = profils.map((p) => p.id);
  const double = ids.find((id, i) => ids.indexOf(id) !== i);
  if (double) refuser('deux profils s\'appellent ' + double);
  const conflits = conflitsDeProfils(profils);
  if (conflits.length) refuser('a precision egale, le plus precis ne se decide pas : ' + conflits.join(' ; '));
  return profils;
}

/** La valeur de la description qu'une condition regarde. */
function valeurPour(cle: CleCondition, d: DescriptionBatiment): string | number | null {
  switch (cle) {
    case 'departements': return d.departement;
    case 'latitude': return d.latitude;
    case 'materiauxMurs': return d.materiauMurs;
    case 'materiauxToiture': return d.materiauToiture;
    case 'hauteur': return d.hauteur;
    case 'surface': return d.surface;
    case 'mitoyennete': return d.mitoyennete;
    case 'formeContour': return d.formeContour;
    case 'epoque': return d.epoque;
  }
}

/** Le batiment remplit-il toutes les conditions du profil ? Une valeur inconnue ne remplit rien. */
export function profilApplicable(p: ProfilToit, d: DescriptionBatiment): boolean {
  return (Object.keys(p.quand) as CleCondition[]).every((cle) => {
    const v = valeurPour(cle, d), c = p.quand[cle];
    if (v === null) return false;
    if (Array.isArray(c)) return typeof v === 'string' && (c as string[]).includes(v);
    const plage = c as Plage;
    return typeof v === 'number' && v >= (plage.min ?? -Infinity) && v < (plage.max ?? Infinity);
  });
}

/** Ce que les profils font a un batiment : les seuils surcharges, et pour chacun le profil qui l'a donne. */
export interface ChoixProfils {
  surcharges: Record<string, number>;
  /** Pour chaque seuil surcharge, l'id du profil retenu. */
  source: Record<string, string>;
  /** Les profils dont les conditions sont remplies, dans l'ordre du fichier. */
  applicables: string[];
}

/**
 * Les surcharges des profils qui s'appliquent a ce batiment : pour chaque seuil, celle du profil le plus
 * precis. A precision egale, `lireProfilsToits` a deja refuse le fichier ; le premier du fichier
 * l'emporte alors, pour qu'un jeu de profils non verifie (un test) reste deterministe.
 */
export function choisirProfils(profils: readonly ProfilToit[], d: DescriptionBatiment): ChoixProfils {
  const choix: ChoixProfils = { surcharges: {}, source: {}, applicables: [] };
  const retenus = profils.filter((p) => profilApplicable(p, d));
  const rang = new Map<string, number>();
  for (const p of retenus) {
    choix.applicables.push(p.id);
    for (const [nom, v] of Object.entries(p.surcharges)) {
      if ((rang.get(nom) ?? -1) >= precision(p)) continue;
      rang.set(nom, precision(p));
      choix.surcharges[nom] = v;
      choix.source[nom] = p.id;
    }
  }
  return choix;
}

/**
 * Ce qui, des profils, entre dans l'empreinte de la lecture (regles/toits/reglages.ts) : leurs conditions
 * et leurs surcharges, et les bornes du vocabulaire qui leur donnent un sens. Sans profil, une liste
 * vide : l'empreinte reste celle d'avant le moteur des profils, et rien n'est relu.
 */
export function formeEmpreinteProfils(profils: readonly ProfilToit[]): unknown {
  if (!profils.length) return [];
  return {
    vocabulaire: { MITOYENNETE_PARTIELLE_MIN, MITOYENNETE_FORTE_MIN, TOLERANCE_MITOYENNETE_M },
    profils: profils.map((p) => ({ id: p.id, quand: p.quand, surcharges: p.surcharges })),
  };
}

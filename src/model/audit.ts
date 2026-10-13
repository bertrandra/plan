// Le mode audit (MD/spec-audit.md) : ce que la promenade note et le fichier qu'elle partage.
//
// Un cas est un batiment marque sur le terrain : votre constat (categorie, problemes, note, photo)
// et le calcul fige au moment de la marque. `entrees` est ce qu'il faut pour le rejouer sans reseau
// (contour, BD TOPO, grille LiDAR), au format des fichiers de village du skill `toits`, que
// `banc.ts` sait deja rejouer ; `sorties` est ce que le code en a fait ce jour-la. Le fichier de la
// promenade les rassemble, un seul par promenade.

import type { PtBrut, Toit, CorpsToit, ToitMesure } from './types.js';
import type { GrilleRelief } from './relief.js';

export type CategorieAudit = 'toit' | 'facade' | 'contour' | 'hauteur' | 'autre';

export const CATEGORIES_AUDIT: readonly { code: CategorieAudit; libelle: string }[] = [
  { code: 'toit', libelle: 'Toit' },
  { code: 'facade', libelle: 'Façade' },
  { code: 'contour', libelle: 'Contour' },
  { code: 'hauteur', libelle: 'Hauteur' },
  { code: 'autre', libelle: 'Autre' },
];

/**
 * Les problemes a cocher (spec §4.5). Le code est stable : le script de rejeu et les tests le
 * lisent ; le libelle est ce que la fiche montre.
 */
export const PROBLEMES_AUDIT: readonly { code: string; categorie: CategorieAudit; libelle: string }[] = [
  { code: 'toit.sens-faitage', categorie: 'toit', libelle: 'Sens du faîtage' },
  { code: 'toit.forme', categorie: 'toit', libelle: 'Forme (croupes, appentis, plat…)' },
  { code: 'toit.position-faitage', categorie: 'toit', libelle: 'Faîtage décentré' },
  { code: 'toit.hauteur', categorie: 'toit', libelle: 'Toit écrasé ou trop pointu' },
  { code: 'toit.pignon-manquant', categorie: 'toit', libelle: 'Pignon manquant' },
  { code: 'toit.pignon-en-trop', categorie: 'toit', libelle: 'Pignon en trop' },
  { code: 'toit.morceaux', categorie: 'toit', libelle: 'Découpé en morceaux' },
  { code: 'toit.fusion', categorie: 'toit', libelle: 'Aile ou annexe avalée' },
  { code: 'toit.trou', categorie: 'toit', libelle: 'Coin sans toit, ou toit qui déborde' },
  { code: 'toit.vegetation', categorie: 'toit', libelle: 'Arbre pris pour le toit' },
  { code: 'toit.cheval', categorie: 'toit', libelle: 'Deux maisons, un seul toit' },
  { code: 'toit.absent', categorie: 'toit', libelle: 'Aucun toit construit' },
  { code: 'toit.couverture', categorie: 'toit', libelle: 'Matériau ou couleur du toit' },
  { code: 'toit.autre', categorie: 'toit', libelle: 'Autre (dans la note)' },
  { code: 'facade.couleur', categorie: 'facade', libelle: 'Couleur des murs' },
  { code: 'facade.materiau', categorie: 'facade', libelle: 'Matériau ou texture' },
  { code: 'facade.fenetres', categorie: 'facade', libelle: 'Fenêtres' },
  { code: 'contour.decale', categorie: 'contour', libelle: 'Bâtiment décalé' },
  { code: 'contour.forme', categorie: 'contour', libelle: 'Forme du bâtiment' },
  { code: 'contour.existence', categorie: 'contour', libelle: 'Absent ou démoli' },
  { code: 'hauteur.murs', categorie: 'hauteur', libelle: 'Murs trop hauts ou trop bas' },
  { code: 'autre', categorie: 'autre', libelle: 'Autre (dans la note)' },
];

/** Le statut d'un cas, de la promenade a la reference (spec §6). */
export type StatutCas = 'a_corriger' | 'corrige' | 'valide' | 'sans_suite';

/**
 * D'ou vient la focale d'une photo : son EXIF ; celle retenue pour ce modele d'appareil (une photo
 * precedente du meme telephone la portait) ; sinon le champ par defaut du releve, une estimation.
 */
export type SourceFocale = 'exif' | 'appareil' | 'defaut';

/**
 * Ou et vers ou la photo a ete prise : la position de l'appareil (repere du plan et degres) et le cap
 * de sa boussole a cet instant. `deplacement` : sans boussole, le sens de la marche, a defaut.
 *
 * Depuis la version 2 du fichier, l'optique et l'attitude du telephone : la projection d'un mur
 * dans la photo en depend (spec §5). Facultatives : une photo de version 1 ne les a pas.
 */
export interface PrisePhoto {
  t: string;
  x: number;
  y: number;
  lat: number | null;
  lon: number | null;
  precisionM: number | null;
  azimutDeg: number | null;
  sourceAzimut: 'boussole' | 'deplacement' | null;
  /** L'axe de visee au-dessus de l'horizon, en degres (negatif : vers le bas). */
  inclinaisonDeg?: number | null;
  /** La rotation de l'image autour de l'axe de visee, en degres, sens horaire positif. */
  roulisDeg?: number | null;
  /** Focale equivalente 24x36, en millimetres. */
  focale35?: number | null;
  /** Le champ du grand cote de l'image, en degres. */
  champDeg?: number | null;
  sourceFocale?: SourceFocale | null;
  modeleAppareil?: string | null;
}

/** Une photo prise sur place, reduite (environ 300 Ko), en base64, avec sa prise de vue. */
export interface PhotoCas { type: 'image/jpeg'; base64: string; prise?: PrisePhoto }

/** Les photos d'un cas de promenade, au plus (spec §5) : six pesent deja environ 2,4 Mo. */
export const PHOTOS_PAR_CAS_MAX = 6;

export interface ConstatCas {
  categorie: CategorieAudit;
  problemes: string[];
  note: string;
  /** L'heure de la marque, ISO. */
  t: string;
  /** Votre position au moment de la marque, dans le repere du plan. */
  position: { x: number; y: number; precisionM: number | null };
  /** De zero a six photos, dans l'ordre de la prise (version 2 ; la version 1 n'en avait qu'une, `photo`). */
  photos: PhotoCas[];
}

export interface EntreesCas {
  /** Le contour recale, dans le repere de l'origine de la promenade. */
  pts: PtBrut[];
  bdtopo: Record<string, unknown> | null;
  /** La grille MNH relue au moment de la marque, au centimetre. */
  grille: GrilleRelief | null;
  /** Les contours des batiments a moins de 5 m : ce qui touche ou masque le batiment. */
  voisins: { cle: string; pts: PtBrut[] }[];
}

export interface SortiesCas {
  /** `entier` : le calcul du projet et des mitoyens, coupes comprises (spec §11, point 4). */
  mode: 'entier';
  elevation: number | null;
  toit: Toit | null;
  corps: CorpsToit[] | null;
  toitMesure: ToitMesure | null;
  couleurMurs: string | null;
  sourceMurs: string | null;
}

export interface CasAudit {
  id: string;
  /** La cle de l'objet dans le plan de la promenade. */
  cle: string;
  statut: StatutCas;
  constat: ConstatCas;
  identite: { cleBdtopo: string | null; idu: string | null; adresse: string | null };
  entrees: EntreesCas;
  sorties: SortiesCas;
  attendu: SortiesCas | null;
  historique: { t: string; texte: string }[];
}

export interface MetaPromenade {
  debut: string;
  fin: string;
  commune: string | null;
  origine: { lat: number; lon: number };
  emprise: { xMin: number; xMax: number; yMin: number; yMax: number } | null;
  code: { version: string; commit: string | null };
  regles: { lectureToits: number; lectureMurs: number };
}

/** La version du fichier de la promenade qu'ecrit ce code (spec §19). */
export const VERSION_FICHIER_PROMENADE = 2;

export interface FichierPromenade {
  format: 'plan-audit';
  version: typeof VERSION_FICHIER_PROMENADE;
  promenade: MetaPromenade;
  cas: CasAudit[];
}

/** Le fichier de la promenade, tel qu'il se partage. */
export function fichierPromenade(meta: MetaPromenade, cas: readonly CasAudit[]): FichierPromenade {
  return { format: 'plan-audit', version: VERSION_FICHIER_PROMENADE, promenade: meta, cas: cas.map((c) => ({ ...c, constat: { ...c.constat, photos: [...c.constat.photos] } })) };
}

/** Un fichier qui n'est pas une promenade lisible par ce code : le message se montre tel quel. */
export class FichierPromenadeIllisible extends Error {}

/**
 * Relit un fichier de promenade, de la version 1 ou 2, et le rend en version 2 : la `photo` unique
 * d'un cas de version 1 devient `photos[0]`. Le reste du cas est garde tel quel, rien n'est recalcule :
 * un cas fige doit se rejouer comme il a ete note.
 */
export function lireFichierPromenade(donnees: unknown): FichierPromenade {
  const f = donnees as { format?: unknown; version?: unknown; promenade?: unknown; cas?: unknown } | null;
  if (!f || typeof f !== 'object' || f.format !== 'plan-audit') throw new FichierPromenadeIllisible('Ce fichier n’est pas un fichier de promenade d’audit.');
  if (typeof f.version !== 'number' || f.version < 1) throw new FichierPromenadeIllisible('La version de ce fichier de promenade est inconnue.');
  if (f.version > VERSION_FICHIER_PROMENADE) throw new FichierPromenadeIllisible('Ce fichier de promenade vient d’une version plus récente de Plan : mettez Plan à jour pour le lire.');
  if (!f.promenade || typeof f.promenade !== 'object' || !Array.isArray(f.cas)) throw new FichierPromenadeIllisible('Ce fichier de promenade est incomplet.');
  const cas = (f.cas as CasAudit[]).map((c) => {
    const { photo, photos, ...constat } = c.constat as ConstatCas & { photo?: PhotoCas };
    const liste = Array.isArray(photos) ? photos : photo ? [photo] : [];
    return { ...c, constat: { ...constat, photos: liste } };
  });
  return { format: 'plan-audit', version: VERSION_FICHIER_PROMENADE, promenade: f.promenade as MetaPromenade, cas };
}

/** `audit-2026-10-13-0912-le-vesinet.json` : la date et l'heure locales du debut, la commune sans accents. */
export function nomFichierPromenade(debut: Date, commune: string | null): string {
  const d2 = (n: number) => String(n).padStart(2, '0');
  const date = debut.getFullYear() + '-' + d2(debut.getMonth() + 1) + '-' + d2(debut.getDate()) + '-' + d2(debut.getHours()) + d2(debut.getMinutes());
  const lieu = (commune ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return 'audit-' + date + (lieu ? '-' + lieu : '') + '.json';
}

/** Les problemes que la fiche propose pour une categorie. */
export function problemesDe(categorie: CategorieAudit): { code: string; libelle: string }[] {
  return PROBLEMES_AUDIT.filter((p) => p.categorie === categorie).map(({ code, libelle }) => ({ code, libelle }));
}

/** Une grille arrondie au centimetre, comme celles des fichiers de village : le fichier reste lisible et compact. */
export function grilleAuCentimetre(g: GrilleRelief | null): GrilleRelief | null {
  return g && { ...g, z: g.z.map((v) => (v === null ? null : Math.round(v * 100) / 100)) };
}

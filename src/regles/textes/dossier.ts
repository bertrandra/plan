// Les textes du dossier de declaration prealable et ses photographies (lot L5 de la lecture IA elargie, MD/spec-lecture-ia-elargie.md
// §4.6) : le contrat de ce que le projet garde, et sa relecture d'un fichier. Donnees pures.
//
// Un texte d'une piece passe par deux etats, et ils ne se melangent pas :
//   - le BROUILLON, redige par Claude depuis les faits du projet (usage `texte` du serveur) : il porte de quoi le refaire et le dater
//     (modele, versions, cout, trace) et l'empreinte des faits envoyes (`entrees`) ; quand les faits ont change depuis, il est perime ;
//   - le texte VALIDE, que la personne a relu (et corrige) : le seul que l'export imprime, a l'identique a chaque export ; il ne se
//     reecrit jamais seul. Il garde l'empreinte des faits du jour ou il a ete valide, pour que la relecture dise qu'il date.
// Sans texte valide, l'export garde le texte calcule d'aujourd'hui (export/cerfa13703.ts).
//
// Les photographies DP7 (environnement proche) et DP8 (paysage lointain) : une photo choisie par piece (question 2 de la spec), prise
// parmi celles de l'audit de la parcelle. Comme l'elevation d'un releve, la photo voyage dans le fichier en `data:` et sort du
// document vers l'appareil quand il part a la plateforme (io/photosLocales.ts) : le projet n'en garde alors que la cle.

/** Les pieces ecrites : la description du cerfa (C2ZD1), la notice descriptive, le texte d'insertion paysagere. */
export type PieceTexte = 'description' | 'notice' | 'insertion';
export const PIECES_TEXTE: readonly PieceTexte[] = ['description', 'notice', 'insertion'];
export const LIBELLES_PIECES_TEXTE: Readonly<Record<PieceTexte, string>> = {
  description: 'Description du projet (cerfa)',
  notice: 'Notice descriptive',
  insertion: 'Insertion paysagère',
};

/** Le champ C2ZD1_description du cerfa 13703*12 tient 1 000 caracteres : un texte valide plus long y serait coupe a l'export. */
export const LONGUEUR_MAX_DESCRIPTION = 1000;
/** Une notice ou un texte d'insertion : de quoi tenir sur la page de notice, en corps 10. */
export const LONGUEUR_MAX_TEXTE = 6000;
export const longueurMax = (p: PieceTexte): number => (p === 'description' ? LONGUEUR_MAX_DESCRIPTION : LONGUEUR_MAX_TEXTE);

/** Ce que Claude a redige pour une piece, et de quoi le refaire et dire s'il est perime. */
export interface BrouillonTexte {
  texte: string;
  /** Ce que Claude dit ne pas pouvoir affirmer depuis les faits (a completer par la personne) ; vide sinon. */
  reserves: string[];
  /** Le jour de la redaction (ISO). */
  le: string;
  modele: string;
  prompt: number;
  schema: number;
  /** SHA-256 des faits envoyes (export/faitsDossier.ts::texteDesFaits) : different de celui du projet du moment, le brouillon est perime. */
  entrees: string;
  cout: number | null;
  /** La trace de l'appel sur le serveur (lot L0) : ce qui est parti (les faits) et ce qui est revenu. */
  trace?: string;
  /** Une redaction de demonstration ou de test, pas de Claude : l'ecran le dit. */
  synthetique?: boolean;
}

/** Le texte relu et retenu par la personne : celui que l'export imprime. */
export interface TexteValide {
  texte: string;
  /** Le jour de la validation (ISO). */
  le: string;
  /** SHA-256 des faits du projet le jour de la validation : la relecture dit quand le projet a change depuis. */
  entrees?: string;
}

export interface TexteDossier { piece: PieceTexte; brouillon?: BrouillonTexte; valide?: TexteValide }

export type PiecePhoto = 'DP7' | 'DP8';
export const PIECES_PHOTO: readonly PiecePhoto[] = ['DP7', 'DP8'];
export const LIBELLES_PIECES_PHOTO: Readonly<Record<PiecePhoto, string>> = {
  DP7: 'Photographie de l’environnement proche',
  DP8: 'Photographie du paysage lointain',
};

/** La photographie choisie pour une piece. */
export interface PhotoDossier {
  piece: PiecePhoto;
  /** `data:image/jpeg;base64,...` ; null quand la photo est restee sur un autre appareil (`photoLocale` dit sa cle). */
  image: string | null;
  /** La cle de la photo gardee sur l'appareil (io/photosLocales.ts), une fois le projet parti a la plateforme. */
  photoLocale?: string;
  /** D'ou elle vient : une photo de l'audit de la parcelle (les photos se prennent dans l'audit). */
  source: 'audit';
  largeur: number;
  hauteur: number;
  choisieLe: string;
}

/** Ce que le projet garde du dossier : ses textes et ses photographies (sur la parcelle du projet, schema 12). */
export interface DossierProjet { textes: TexteDossier[]; photos?: PhotoDossier[] }

const texte = (v: unknown, max: number): string => (typeof v === 'string' ? v.slice(0, max) : '');
const nombreOuNull = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const estPiece = (v: unknown): v is PieceTexte => typeof v === 'string' && (PIECES_TEXTE as readonly string[]).includes(v);
const estPiecePhoto = (v: unknown): v is PiecePhoto => typeof v === 'string' && (PIECES_PHOTO as readonly string[]).includes(v);

function brouillonLu(v: unknown, piece: PieceTexte): BrouillonTexte | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  if (typeof o.texte !== 'string' || typeof o.entrees !== 'string' || typeof o.modele !== 'string') return null;
  return {
    texte: o.texte.slice(0, longueurMax(piece) * 2), reserves: (Array.isArray(o.reserves) ? o.reserves : []).filter((r): r is string => typeof r === 'string').map((r) => r.slice(0, 400)).slice(0, 20),
    le: texte(o.le, 40), modele: o.modele.slice(0, 64), prompt: nombreOuNull(o.prompt) ?? 0, schema: nombreOuNull(o.schema) ?? 0,
    entrees: o.entrees.slice(0, 64), cout: nombreOuNull(o.cout),
    ...(typeof o.trace === 'string' && o.trace ? { trace: o.trace.slice(0, 80) } : {}),
    ...(o.synthetique === true ? { synthetique: true } : {}),
  };
}

function valideLu(v: unknown, piece: PieceTexte): TexteValide | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  if (typeof o.texte !== 'string' || !o.texte.trim()) return null;
  return { texte: o.texte.slice(0, longueurMax(piece)), le: texte(o.le, 40), ...(typeof o.entrees === 'string' && o.entrees ? { entrees: o.entrees.slice(0, 64) } : {}) };
}

function photoLue(v: unknown): PhotoDossier | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  const image = typeof o.image === 'string' && /^data:image\/jpeg;base64,/.test(o.image) ? o.image : null;
  const cle = typeof o.photoLocale === 'string' && o.photoLocale ? o.photoLocale.slice(0, 64) : undefined;
  if (!estPiecePhoto(o.piece) || (!image && !cle)) return null;
  return {
    piece: o.piece, image, ...(cle ? { photoLocale: cle } : {}), source: 'audit',
    largeur: nombreOuNull(o.largeur) ?? 0, hauteur: nombreOuNull(o.hauteur) ?? 0, choisieLe: texte(o.choisieLe, 40),
  };
}

/**
 * Le dossier relu d'un fichier de projet : verifie, copie en profondeur ; une piece au plus par nom (la premiere), un texte sans
 * brouillon ni texte valide retire. Null quand il ne reste rien : la normalisation retire alors le champ.
 */
export function dossierEnregistre(v: unknown): DossierProjet | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  const vues = new Set<string>();
  const textes: TexteDossier[] = [];
  for (const t of Array.isArray(o.textes) ? o.textes : []) {
    const x = t as Record<string, unknown> | null;
    if (!x || !estPiece(x.piece) || vues.has(x.piece)) continue;
    const brouillon = brouillonLu(x.brouillon, x.piece), valide = valideLu(x.valide, x.piece);
    if (!brouillon && !valide) continue;
    vues.add(x.piece);
    textes.push({ piece: x.piece, ...(brouillon ? { brouillon } : {}), ...(valide ? { valide } : {}) });
  }
  const photos: PhotoDossier[] = [];
  for (const p of Array.isArray(o.photos) ? o.photos : []) {
    const lue = photoLue(p);
    if (lue && !photos.some((x) => x.piece === lue.piece)) photos.push(lue);
  }
  if (!textes.length && !photos.length) return null;
  return { textes, ...(photos.length ? { photos } : {}) };
}

/** Le texte d'une piece dans ce dossier, ou rien. */
export const texteDe = (d: DossierProjet | null | undefined, piece: PieceTexte): TexteDossier | undefined => d?.textes.find((t) => t.piece === piece);
/** Le texte VALIDE d'une piece : le seul qu'un export imprime. */
export const texteValide = (d: DossierProjet | null | undefined, piece: PieceTexte): string | null => texteDe(d, piece)?.valide?.texte ?? null;
/** La photographie choisie pour une piece, ou rien. */
export const photoDe = (d: DossierProjet | null | undefined, piece: PiecePhoto): PhotoDossier | undefined => d?.photos?.find((p) => p.piece === piece);

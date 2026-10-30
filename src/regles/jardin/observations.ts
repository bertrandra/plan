// Les observations de la lecture du jardin par Claude (lot L3 de la lecture IA elargie) : le CONTRAT d'entree du moteur de regles du
// jardin, comme les observations du run d'une facade le sont pour les facades. Claude propose, le moteur decide : rien de ce qu'il
// rend n'entre dans le plan autrement que par les regles de facade/regles/jardin.ts, qui en tirent des objets proposes, et une personne
// les confirme dans l'avant/apres de l'audit.
//
// Une requete par parcelle, sur l'orthophoto recadree sur elle (deploy/schema-jardin.json, genere) : chaque objet du jardin, son genre,
// sa place en PARTS de l'image (x, y depuis le haut gauche), son etendue en part du cote, le genre d'un arbre dans une liste fermee.
// Claude ne voit ni les pixels ni les metres : le cadrage de l'image, enregistre avec elle, les donne.
//
// Ici : la lecture d'une reponse (vocabulaire ferme, rien d'invente), le texte qui accompagne l'image, et la lecture enregistree. Pur.

import { GENRES_ARBRE, GENRES_OBJET, NATURES_OBJET_JARDIN } from '../sujets/descriptions/jardinRun.js';

export type GenreObjetJardin = (typeof GENRES_OBJET)[number];
export type GenreArbre = (typeof GENRES_ARBRE)[number];
export type NatureObjetJardin = (typeof NATURES_OBJET_JARDIN)[number];
export type TailleVue = 'petit' | 'moyen' | 'grand' | 'tres-grand';
export type Certitude = 'forte' | 'moyenne' | 'faible';

/** Un point, en part de l'image : x de gauche a droite, y de haut en bas. */
export interface PointImage { x: number; y: number }

export interface ObservationJardin {
  genre: GenreObjetJardin;
  points: PointImage[];
  /** Le diametre d'un houppier, la largeur d'une haie ou d'un chemin, en part du cote de l'image ; 0 sans objet. */
  etendue: number;
  /** Un arbre : son genre, sa taille, persistant ou non ; null pour tout autre objet. */
  arbre: { genre: GenreArbre; taille: TailleVue | null; persistant: boolean | null } | null;
  nature: NatureObjetJardin | null;
  indices: { image: number; vu: string }[];
  certitude: Certitude;
}

export interface ObservationsJardin { objets: ObservationJardin[]; confiance: Certitude }

/** La certitude dite, en part : celle que les regles comparent a leur seuil. */
export const PART_CERTITUDE: Readonly<Record<Certitude, number>> = { faible: 0.5, moyenne: 0.75, forte: 0.9 };

const dans = <T extends string>(liste: readonly T[], v: unknown): v is T => typeof v === 'string' && (liste as readonly string[]).includes(v);
const fini = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Un point lu : deux parts, un rien au-dela de l'image tolere (un portail au bord). */
function point(v: unknown): PointImage | null {
  const p = v as { x?: unknown; y?: unknown } | null;
  if (!p || !fini(p.x) || !fini(p.y) || p.x < -0.05 || p.x > 1.05 || p.y < -0.05 || p.y > 1.05) return null;
  return { x: p.x, y: p.y };
}

/** Un objet lu ; null s'il n'a pas de genre connu, ou pas un point lisible. Un point illisible au milieu d'une ligne la fait tomber. */
function objet(v: unknown): ObservationJardin | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  if (!dans(GENRES_OBJET, o.genre) || !Array.isArray(o.points) || !o.points.length) return null;
  const points = o.points.map(point);
  if (points.some((p) => p === null)) return null;
  const a = o.arbre as Record<string, unknown> | null | undefined;
  const arbre = o.genre === 'arbre'
    ? { genre: a && dans(GENRES_ARBRE, a.genre) ? a.genre : 'indetermine' as GenreArbre,
        taille: a && dans(['petit', 'moyen', 'grand', 'tres-grand'] as const, a.taille) ? a.taille : null,
        persistant: a?.persistant === 'oui' ? true : a?.persistant === 'non' ? false : null }
    : null;
  const indices = (Array.isArray(o.indices) ? o.indices : []).flatMap((i) => {
    const x = i as { image?: unknown; vu?: unknown } | null;
    return x && typeof x.vu === 'string' && x.vu.trim() ? [{ image: fini(x.image) ? Math.round(x.image) : 1, vu: x.vu.trim().slice(0, 200) }] : [];
  });
  const nature = dans(NATURES_OBJET_JARDIN, o.nature) && o.nature !== 'sans-objet' && o.nature !== 'indetermine' ? o.nature : null;
  return {
    genre: o.genre, points: points as PointImage[], etendue: fini(o.etendue) && o.etendue > 0 && o.etendue <= 1 ? o.etendue : 0, arbre, nature, indices,
    certitude: dans(['forte', 'moyenne', 'faible'] as const, o.certitude) ? o.certitude : 'faible',
  };
}

/** Une reponse lue : les objets lisibles, dans l'ordre ; null si ce n'est pas une reponse de la lecture du jardin. */
export function lireObservationsJardin(v: unknown): ObservationsJardin | null {
  if (!v || typeof v !== 'object' || !Array.isArray((v as { objets?: unknown }).objets)) return null;
  const s = v as { objets: unknown[]; confiance?: unknown };
  return {
    objets: s.objets.map(objet).filter((o): o is ObservationJardin => o !== null),
    confiance: dans(['forte', 'moyenne', 'faible'] as const, s.confiance) ? s.confiance : 'faible',
  };
}

/** Le cadrage de l'image envoyee, dans le repere du plan : le coin sud-ouest et le cote, en metres (nord en haut). */
export interface CadrageJardin { xMin: number; yMin: number; coteM: number }

/** Un point de l'image, en metres du plan : x vers l'est, y vers le nord (le haut de l'image). */
export const versPlan = (c: CadrageJardin, p: PointImage): { x: number; y: number } => ({ x: c.xMin + p.x * c.coteM, y: c.yMin + (1 - p.y) * c.coteM });
/** Un point du plan, en part de l'image (pour le texte et les tests). */
export const versImage = (c: CadrageJardin, p: { x: number; y: number }): PointImage => ({ x: (p.x - c.xMin) / c.coteM, y: 1 - (p.y - c.yMin) / c.coteM });

/** Ce que le texte de la requete dit du plan : la taille de l'image, et ce que le jardin porte deja (en clair, par sorte). */
export function texteJardin(e: { coteM: number; dejaLa: readonly string[]; photos: number }): string {
  const lignes = ['L’image 1 couvre ' + (Math.round(e.coteM * 10) / 10).toString().replace('.', ',') + ' m de côté, nord en haut.'];
  lignes.push(e.photos ? 'Les images 2 à ' + (e.photos + 1) + ' sont des photos prises sur place (clôture, portail) : elles aident à reconnaître, jamais à placer.' : 'Aucune photo prise sur place n’est jointe.');
  lignes.push(e.dejaLa.length ? 'Le plan contient déjà dans le jardin : ' + e.dejaLa.join(', ') + '.' : 'Le plan ne contient encore rien dans le jardin.');
  return lignes.join('\n');
}

/**
 * La lecture du jardin enregistree avec l'audit (pour la rejouer sans reseau ni cout) : la reponse brute, les versions du prompt et du
 * schema, le modele, les tokens et le cout, l'image exacte envoyee et son cadrage, le texte. L'image est celle que le serveur garde avec
 * la trace de la requete (lot L0 : `images/<sha256>.jpg`, une fois par empreinte) : la lecture en garde l'empreinte ; ses octets
 * (base64) ne restent que si le serveur ne l'a pas gardee (un serveur d'avant le lot L0).
 */
export interface RunJardin {
  le: string;
  modele: string;
  prompt: number;
  schema: number;
  /** La sortie de Claude, telle que le serveur l'a ramenee au schema ; relue par `lireObservationsJardin`. */
  sortie: unknown;
  cout: number | null;
  tokens: { entree: number; sortie: number };
  image: { mediaType: 'image/jpeg' | 'image/png'; largeur: number; hauteur: number; sha256?: string; octets?: number; base64?: string };
  cadrage: CadrageJardin;
  /** Les photos de la capture jointes (cloture, portail) : leur nombre ; elles restent dans la capture. */
  photos: number;
  texte: string;
  /** L'empreinte des seuils du moteur quand la lecture a ete faite (regles/jardin/reglages.json). */
  reglages?: string;
}

/** Une lecture enregistree relue (un brouillon, un fichier) ; null si elle est illisible. */
export function lireRunJardin(v: unknown): RunJardin | null {
  if (!v || typeof v !== 'object') return null;
  const r = v as Record<string, unknown>;
  const i = r.image as Record<string, unknown> | null, c = r.cadrage as Record<string, unknown> | null;
  if (typeof r.le !== 'string' || typeof r.modele !== 'string' || !fini(r.prompt) || !fini(r.schema)) return null;
  if (!i || (typeof i.base64 !== 'string' && typeof i.sha256 !== 'string') || (i.mediaType !== 'image/jpeg' && i.mediaType !== 'image/png') || !fini(i.largeur) || !fini(i.hauteur)) return null;
  if (!c || !fini(c.xMin) || !fini(c.yMin) || !fini(c.coteM) || !(c.coteM > 0)) return null;
  const t = r.tokens as Record<string, unknown> | null;
  return {
    le: r.le, modele: r.modele, prompt: r.prompt, schema: r.schema, sortie: r.sortie ?? null, cout: fini(r.cout) ? r.cout : null,
    tokens: { entree: fini(t?.entree) ? t.entree : 0, sortie: fini(t?.sortie) ? t.sortie : 0 },
    image: { mediaType: i.mediaType, largeur: i.largeur, hauteur: i.hauteur, ...(typeof i.sha256 === 'string' ? { sha256: i.sha256 } : {}), ...(fini(i.octets) ? { octets: i.octets } : {}), ...(typeof i.base64 === 'string' ? { base64: i.base64 } : {}) }, cadrage: { xMin: c.xMin, yMin: c.yMin, coteM: c.coteM },
    photos: fini(r.photos) ? r.photos : 0, texte: typeof r.texte === 'string' ? r.texte : '', ...(typeof r.reglages === 'string' ? { reglages: r.reglages } : {}),
  };
}

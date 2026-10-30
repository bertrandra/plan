// Le reglement ecrit de la zone d'une parcelle, au Geoportail de l'urbanisme (lot L4 de la lecture IA elargie).
//
// L'interrogation du PLU (`apiIgn.ts::interrogerPlu`) range le zonage sur la parcelle ; elle n'en garde pas l'identifiant du document
// au GPU (`gpu_doc_id`), sans lequel le PDF ne se retrouve pas. On relit donc la zone au meme point (`zone-urba`, la meme requete,
// rejouee par les donnees temoin de la fumee), et l'adresse du reglement s'en deduit :
//
//   https://data.geopf.fr/annexes/gpu/documents/<partition>/<gpu_doc_id>/<fichier>.pdf
//
// `nomfic` porte le fichier, et souvent la page ou commence le chapitre de la zone (`78146_reglement_20181003.pdf#page=38`).
// `urlfic`, quand il existe, ne sert que s'il pointe deja la : une autre adresse (le site de la metropole, une archive .zip) n'est
// pas un PDF que la page puisse lire (CSP `connect-src`, CORS). data.geopf.fr sert les documents avec `Access-Control-Allow-Origin: *`.

import { GPU_URL, fetchJSONReseau } from './apiIgn.js';

/** Le reglement d'une zone : ou le lire, a partir de quelle page, et de quel document il s'agit. */
export interface AdresseReglement {
  url: string;
  /** La page ou commence le chapitre de la zone (`#page=` du GPU) ; null quand le GPU ne la donne pas. */
  page: number | null;
  /** Le libelle de la zone (`ULp`) et son libelle long. */
  zone: string;
  libelong: string;
  /** Le document d'urbanisme (`idurba` : `78146_PLU_20181003`) et sa partition (`DU_78146`). */
  document: string;
  partition: string;
}

const RACINE_DOCUMENTS = 'https://data.geopf.fr/annexes/gpu/documents/';
const chaine = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

/** La page d'un `#page=N` (de 1 a 5000), ou null. */
function pageDe(adresse: string): number | null {
  const m = /#page=(\d{1,4})\b/i.exec(adresse);
  const n = m ? Number(m[1]) : NaN;
  return n >= 1 && n <= 5000 ? n : null;
}

/**
 * L'adresse du reglement d'une zone, d'apres les proprietes d'une entite `zone-urba` du GPU ; null quand elles ne suffisent pas a
 * la construire (ni fichier PDF, ni identifiant du document).
 */
export function adresseDuReglement(p: Record<string, unknown>): AdresseReglement | null {
  const nomfic = chaine(p.nomfic), urlfic = chaine(p.urlfic), partition = chaine(p.partition), id = chaine(p.gpu_doc_id);
  const commun = { zone: chaine(p.libelle), libelong: chaine(p.libelong), document: chaine(p.idurba), partition };
  const page = pageDe(nomfic) ?? pageDe(urlfic);
  if (urlfic.startsWith(RACINE_DOCUMENTS) && /\.pdf(#|$)/i.test(urlfic)) return { ...commun, url: urlfic.replace(/#.*$/, ''), page };
  // Le fichier : celui de `nomfic`, sinon le dernier segment d'`urlfic` quand c'est un PDF.
  const fichier = (nomfic || (urlfic.split('/').pop() ?? '')).replace(/#.*$/, '');
  if (!/^[\w.-]+\.pdf$/i.test(fichier) || !/^[\w-]+$/.test(partition) || !/^[0-9a-f]{16,64}$/i.test(id)) return null;
  return { ...commun, url: RACINE_DOCUMENTS + partition + '/' + id + '/' + fichier, page };
}

/** Les reglements des zones au point (le plus souvent une seule) ; vide quand le GPU ne renvoie aucune zone exploitable. */
export async function chercherReglements(lon: number, lat: number, lire: (url: string) => Promise<unknown> = fetchJSONReseau): Promise<AdresseReglement[]> {
  const geom = encodeURIComponent(JSON.stringify({ type: 'Point', coordinates: [lon, lat] }));
  const rep = await lire(GPU_URL + '/zone-urba?geom=' + geom) as { features?: { properties?: Record<string, unknown> }[] } | null;
  return (rep?.features ?? []).map((f) => adresseDuReglement(f.properties ?? {})).filter((a): a is AdresseReglement => !!a);
}

/** Le PDF du reglement, en octets ; leve avec une phrase lisible quand il ne vient pas (60 s : un reglement pese 5 a 20 Mo). */
export async function telechargerReglement(url: string, rechercher: typeof fetch = fetch): Promise<Uint8Array> {
  let r: Response;
  try {
    r = await rechercher(url, { signal: AbortSignal.timeout(60000) });
  } catch {
    throw new Error('Le règlement ne se télécharge pas depuis le Géoportail de l’urbanisme (réseau ou délai de 60 s).');
  }
  if (!r.ok) throw new Error('Le Géoportail de l’urbanisme ne sert pas ce règlement (HTTP ' + r.status + ').');
  const octets = new Uint8Array(await r.arrayBuffer());
  // « %PDF- » : un document, pas une page d'erreur servie en 200.
  if (octets.length < 5 || String.fromCharCode(...octets.subarray(0, 5)) !== '%PDF-') throw new Error('Le fichier servi pour ce règlement n’est pas un PDF.');
  return octets;
}

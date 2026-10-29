// Ce que la lecture du reglement par Claude devient : des faits du PLU PROPOSES (lot L4). Le lecteur de la reponse, la seule porte
// entre le JSON de Claude et le projet : rien d'autre ne lit la sortie. Il n'invente rien — une ligne sans article ou sans citation
// n'est pas un fait, un nombre hors de ce qu'une regle d'urbanisme peut dire (une hauteur de 300 m, une emprise de 140 %) perd sa
// valeur, une unite qui ne va pas avec la grandeur aussi — et il ne valide rien : chaque fait arrive `propose`, decoche, et la
// personne le compare au texte avant que les regles ne le lisent (engine/regles/plu/conformite.ts).

import { GRANDEURS_PLU, MATERIAUX_TOIT_PLU, type ConfiancePlu, type FaitPlu, type GrandeurPlu, type MateriauToitPlu, type UnitePlu } from './faits.js';

/** Les bornes plausibles d'une valeur, par unite : au-dela, le nombre n'est pas une regle d'urbanisme et il est ecarte. */
const BORNES: Record<UnitePlu, [number, number]> = { m: [0, 100], pourcent: [0, 100], degres: [0, 90], places: [0, 20], aucune: [0, 0] };
/** Une citation de moins de ces caracteres ne se compare a rien dans le document. */
const CITATION_MIN = 12;

export interface LectureLue {
  /** La zone que Claude dit avoir lue, et s'il l'a trouvee dans l'extrait. */
  zone: string;
  trouvee: 'oui' | 'non' | 'indetermine';
  faits: FaitPlu[];
  remarques: string;
  /** Les lignes de Claude qui ne sont pas devenues des faits, et pourquoi : l'ecran les compte. */
  ecartees: { grandeur: string; motif: string }[];
}

const texte = (v: unknown, max: number): string => (typeof v === 'string' ? v.trim().slice(0, max) : '');

/**
 * Les faits proposes d'une sortie (deja ramenee au schema par le serveur). `pages` : les pages envoyees (numeros du document entier),
 * pour ecarter une page citee hors de l'extrait.
 */
export function faitsDeLaSortie(sortie: unknown, pages: [number, number]): LectureLue {
  const s = (sortie && typeof sortie === 'object' ? sortie : {}) as Record<string, unknown>;
  const z = (s.zone && typeof s.zone === 'object' ? s.zone : {}) as Record<string, unknown>;
  const trouvee = z.trouvee === 'oui' || z.trouvee === 'non' ? z.trouvee : 'indetermine';
  const lu: LectureLue = { zone: texte(z.libelle, 64), trouvee, faits: [], remarques: texte(s.remarques, 2000), ecartees: [] };
  // La zone absente de l'extrait : Claude n'a rien a dire d'elle, et ce qu'il dirait viendrait d'une autre zone.
  if (trouvee === 'non') return lu;
  const vus = new Set<string>();
  for (const r of Array.isArray(s.regles) ? s.regles : []) {
    const o = (r && typeof r === 'object' ? r : {}) as Record<string, unknown>;
    const g = o.grandeur;
    if (typeof g !== 'string' || !(g in GRANDEURS_PLU)) { lu.ecartees.push({ grandeur: String(g ?? '?'), motif: 'grandeur inconnue' }); continue; }
    const grandeur = g as GrandeurPlu, def = GRANDEURS_PLU[grandeur];
    const article = texte(o.article, 200), citation = texte(o.citation, 4000);
    if (!article) { lu.ecartees.push({ grandeur, motif: 'sans article' }); continue; }
    if (citation.length < CITATION_MIN) { lu.ecartees.push({ grandeur, motif: 'sans citation du texte' }); continue; }
    const termes = Array.isArray(o.termes) ? [...new Set(o.termes.filter((t): t is MateriauToitPlu => (MATERIAUX_TOIT_PLU as readonly string[]).includes(t as string)))] : [];
    if (grandeur === 'materiaux-toit' && !termes.length) { lu.ecartees.push({ grandeur, motif: 'aucune couverture nommée' }); continue; }
    // La valeur : un nombre dans l'unite de la grandeur, et dans ses bornes ; sinon aucune (la regle reste, « à vérifier »).
    let valeur: number | null = typeof o.valeur === 'number' && Number.isFinite(o.valeur) ? o.valeur : null;
    if (valeur !== null && (!def.nombre && def.unite !== 'places')) valeur = null;
    if (valeur !== null && o.unite !== def.unite) valeur = null;
    const [min, max] = BORNES[def.unite];
    if (valeur !== null && (valeur < min || valeur > max)) valeur = null;
    const page = typeof o.page === 'number' && Number.isInteger(o.page) && o.page >= pages[0] && o.page <= pages[1] ? o.page : null;
    const confiance: ConfiancePlu = o.confiance === 'forte' || o.confiance === 'moyenne' ? o.confiance : 'faible';
    const condition = texte(o.condition, 400);
    const cle = [grandeur, valeur, termes.join('+'), condition.toLowerCase(), article.toLowerCase()].join('|');
    if (vus.has(cle)) continue;
    vus.add(cle);
    lu.faits.push({ id: 'f' + (lu.faits.length + 1), grandeur, valeur, termes: grandeur === 'materiaux-toit' ? termes : [], condition, article, citation, page, confiance, statut: 'propose' });
  }
  return lu;
}

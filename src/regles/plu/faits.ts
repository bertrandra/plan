// Les faits du PLU d'un projet (lot L4 de la lecture IA elargie, MD/spec-lecture-ia-elargie.md §L4) : ce que le reglement de la zone
// impose, tel que Claude l'a lu et que la personne l'a valide. Un fait du PLU n'est pas un fait des toits (regles/toits/faits.json,
// un batiment, change par PR) : il vaut pour UNE zone d'UNE commune, il vient d'un document public lu pour ce projet, et il se range
// donc dans le projet, sur la parcelle (`ObjetPlan.reglementPlu`), avec sa source, sa date et sa citation.
//
// Trois regles tiennent la discipline du moteur (MD/architecture.md §5.2.4) :
//   - Claude propose, la personne decide : un fait arrive `propose`, et seules les regles des faits `valide` controlent le projet ;
//   - un fait n'est jamais invente : sans article ni citation du texte, la ligne de Claude n'en devient pas un (observations.ts) ;
//   - ce que Claude a lu reste relisible : l'empreinte de l'extrait, son adresse et ses pages, la reponse brute, le modele, les
//     versions du prompt et du schema, le cout (`LecturePlu`).
//
// Donnees pures : ni reseau, ni DOM. Le vocabulaire (`GRANDEURS_PLU`) est celui du schema de la reponse (lecture.ts).

/** Les grandeurs qu'un fait du PLU peut fixer : un vocabulaire ferme, le meme que le schema de la reponse de Claude. */
export const GRANDEURS_PLU = {
  'hauteur-egout-max': { theme: 'hauteur', unite: 'm', libelle: 'Hauteur maximale à l’égout', nombre: true },
  'hauteur-faitage-max': { theme: 'hauteur', unite: 'm', libelle: 'Hauteur maximale au faîtage', nombre: true },
  'hauteur-absolue-max': { theme: 'hauteur', unite: 'm', libelle: 'Hauteur maximale (point le plus haut)', nombre: true },
  'hauteur-annexe-max': { theme: 'annexes', unite: 'm', libelle: 'Hauteur maximale des annexes', nombre: true },
  'recul-voie-min': { theme: 'implantation', unite: 'm', libelle: 'Recul minimal depuis la voie', nombre: true },
  'recul-limites-min': { theme: 'implantation', unite: 'm', libelle: 'Recul minimal des limites séparatives', nombre: true },
  'emprise-max': { theme: 'emprise', unite: 'pourcent', libelle: 'Emprise au sol maximale', nombre: true },
  'espaces-verts-min': { theme: 'espaces-verts', unite: 'pourcent', libelle: 'Part minimale d’espaces verts', nombre: true },
  'stationnement': { theme: 'stationnement', unite: 'places', libelle: 'Stationnement', nombre: false },
  'pente-toit-min': { theme: 'toiture', unite: 'degres', libelle: 'Pente de toit minimale', nombre: true },
  'pente-toit-max': { theme: 'toiture', unite: 'degres', libelle: 'Pente de toit maximale', nombre: true },
  'materiaux-toit': { theme: 'toiture', unite: 'aucune', libelle: 'Matériaux de couverture admis', nombre: false },
  'couleurs': { theme: 'aspect', unite: 'aucune', libelle: 'Couleurs et matériaux des façades', nombre: false },
  'cloture-voie-hauteur-max': { theme: 'clotures', unite: 'm', libelle: 'Hauteur maximale de clôture sur voie', nombre: true },
  'cloture-limites-hauteur-max': { theme: 'clotures', unite: 'm', libelle: 'Hauteur maximale de clôture en limite séparative', nombre: true },
  'clotures-haies': { theme: 'clotures', unite: 'aucune', libelle: 'Clôtures et haies', nombre: false },
  'annexes': { theme: 'annexes', unite: 'aucune', libelle: 'Annexes', nombre: false },
} as const satisfies Record<string, { theme: string; unite: UnitePlu; libelle: string; nombre: boolean }>;

export type GrandeurPlu = keyof typeof GRANDEURS_PLU;
export type UnitePlu = 'm' | 'pourcent' | 'degres' | 'places' | 'aucune';
export const UNITES_PLU: readonly UnitePlu[] = ['m', 'pourcent', 'degres', 'places', 'aucune'];
export const LISTE_GRANDEURS_PLU = Object.keys(GRANDEURS_PLU) as GrandeurPlu[];

/** Les couvertures qu'un fait `materiaux-toit` peut admettre (le vocabulaire de la reponse). */
export const MATERIAUX_TOIT_PLU = ['tuile', 'tuile-plate', 'tuile-canal', 'tuile-mecanique', 'ardoise', 'zinc', 'bac-acier', 'membrane', 'vegetale', 'verre', 'autre'] as const;
export type MateriauToitPlu = typeof MATERIAUX_TOIT_PLU[number];

export type ConfiancePlu = 'faible' | 'moyenne' | 'forte';

/** Un fait du PLU : une regle de la zone, sa valeur, et de quoi la verifier dans le texte. */
export interface FaitPlu {
  /** Stable dans sa lecture (`f1`, `f2`…) : la validation le nomme. */
  id: string;
  grandeur: GrandeurPlu;
  /** Dans l'unite de la grandeur ; null quand la grandeur n'est pas un nombre, ou que le texte n'en donne pas. */
  valeur: number | null;
  /** Les couvertures admises (`materiaux-toit`) ; vide sinon. */
  termes: MateriauToitPlu[];
  /** A quoi la regle s'applique quand le texte le precise (« constructions annexes », « en limite séparative »…) ; vide sinon. */
  condition: string;
  /** L'article du reglement (« UL 10 », « 10.2 »). */
  article: string;
  /** Le texte du reglement, cite mot pour mot : c'est ce que la personne compare au document avant de valider. */
  citation: string;
  /** La page du document (celle du PDF entier), quand Claude la dit. */
  page: number | null;
  confiance: ConfiancePlu;
  /** `propose` : lu par Claude, pas encore verifie ; `valide` : la personne l'a compare au texte et l'a retenu. */
  statut: 'propose' | 'valide';
  /** Le jour de la validation (ISO), seulement pour un fait valide. */
  valideLe?: string;
}

/** D'ou vient le texte lu : l'adresse du reglement, les pages envoyees, et l'empreinte de l'extrait exact. */
export interface SourcePlu {
  /** Le reglement entier, tel que le Geoportail de l'urbanisme le sert. */
  url: string;
  /** La page de la zone dans le document (`#page=` du GPU), ou null quand le GPU ne la donne pas. */
  page: number | null;
  /** Les pages envoyees a Claude, de la premiere a la derniere (numeros du document entier, a partir de 1). */
  pages: [number, number];
  /** Pages du document entier. */
  pagesDocument: number;
  /** SHA-256 de l'extrait PDF envoye, en hexadecimal : relire le meme extrait donne la meme empreinte. */
  empreinte: string;
  /** SHA-256 du document entier tel que le GPU l'a servi : il dit si le reglement a change depuis la lecture. */
  empreinteDocument: string;
  /** Taille de l'extrait envoye, en octets. */
  octets: number;
  luLe: string;
}

/** Ce que la lecture a coute et rendu : de quoi la rejouer et la comparer (re-analyse). */
export interface LecturePlu {
  modele: string;
  prompt: number;
  schema: number;
  /** En dollars ; null quand le serveur n'avait pas de tarif. */
  cout: number | null;
  tokens: { entree: number; ecritureCache: number; lectureCache: number; sortie: number } | null;
  /** Le texte rendu par le modele, tel quel (null quand le serveur ne le rend pas). */
  brut: string | null;
  /** La sortie ramenee au schema par le serveur. */
  sortie: unknown;
  demandeeLe: string;
  /** Une lecture de demonstration ou de test, pas de Claude (fumee, tests) : l'ecran le dit. */
  synthetique?: boolean;
  /** La trace de l'appel sur le serveur (lot L0) : ce qui est parti, le PDF par son empreinte, et ce qui est revenu. */
  trace?: string;
}

/** Le reglement d'une zone, lu pour le projet : la zone, la source, la lecture et ses faits. */
export interface ReglementPlu {
  format: 'plan-reglement-plu';
  version: 1;
  /** Le libelle de la zone au GPU (`ULp`), et la zone que Claude dit avoir lue (`UL`). */
  zone: string;
  zoneLue: string;
  /** Le document d'urbanisme (`idurba` du GPU : `78146_PLU_20181003`). */
  document: string;
  insee: string | null;
  source: SourcePlu;
  lecture: LecturePlu;
  faits: FaitPlu[];
  /** Ce que Claude ajoute hors des faits (un renvoi aux dispositions generales, un chapitre coupe) ; vide sinon. */
  remarques: string;
}

const texte = (v: unknown, max = 4000): string => (typeof v === 'string' ? v.slice(0, max) : '');
const nombreOuNull = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const estGrandeur = (v: unknown): v is GrandeurPlu => typeof v === 'string' && v in GRANDEURS_PLU;
const CONFIANCES: readonly ConfiancePlu[] = ['faible', 'moyenne', 'forte'];

/** Un fait relu d'un fichier, ou null s'il est mal forme (un fait sans grandeur connue, sans article ou sans citation n'en est pas un). */
export function faitPluLu(v: unknown): FaitPlu | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  const article = texte(o.article, 200).trim(), citation = texte(o.citation).trim();
  if (!estGrandeur(o.grandeur) || typeof o.id !== 'string' || !o.id || !article || !citation) return null;
  const valide = o.statut === 'valide';
  return {
    id: o.id.slice(0, 32), grandeur: o.grandeur, valeur: nombreOuNull(o.valeur),
    termes: Array.isArray(o.termes) ? o.termes.filter((t): t is MateriauToitPlu => (MATERIAUX_TOIT_PLU as readonly string[]).includes(t as string)) : [],
    condition: texte(o.condition, 400), article, citation, page: nombreOuNull(o.page),
    confiance: CONFIANCES.includes(o.confiance as ConfiancePlu) ? o.confiance as ConfiancePlu : 'faible',
    statut: valide ? 'valide' : 'propose',
    ...(valide && typeof o.valideLe === 'string' ? { valideLe: o.valideLe.slice(0, 40) } : {}),
  };
}

/**
 * Le reglement relu d'un fichier de projet : verifie, copie en profondeur (rien n'est partage avec le fichier) ; null s'il ne se lit
 * pas, et la normalisation le retire alors plutot que de garder une forme que rien ne sait lire.
 */
export function reglementPluEnregistre(v: unknown): ReglementPlu | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  if (o.format !== 'plan-reglement-plu' || o.version !== 1) return null;
  const s = (o.source ?? {}) as Record<string, unknown>, l = (o.lecture ?? {}) as Record<string, unknown>;
  const pages = Array.isArray(s.pages) && s.pages.length === 2 && s.pages.every((p) => typeof p === 'number') ? [s.pages[0] as number, s.pages[1] as number] as [number, number] : null;
  if (typeof s.url !== 'string' || typeof s.empreinte !== 'string' || !pages || typeof l.modele !== 'string') return null;
  const t = l.tokens as Record<string, unknown> | null | undefined;
  const faits = (Array.isArray(o.faits) ? o.faits : []).map(faitPluLu).filter((f): f is FaitPlu => !!f);
  return {
    format: 'plan-reglement-plu', version: 1,
    zone: texte(o.zone, 64), zoneLue: texte(o.zoneLue, 64), document: texte(o.document, 128), insee: typeof o.insee === 'string' ? o.insee.slice(0, 8) : null,
    source: { url: s.url.slice(0, 2000), page: nombreOuNull(s.page), pages, pagesDocument: nombreOuNull(s.pagesDocument) ?? pages[1], empreinte: s.empreinte.slice(0, 128),
              empreinteDocument: texte(s.empreinteDocument, 128),
              octets: nombreOuNull(s.octets) ?? 0, luLe: texte(s.luLe, 40) },
    lecture: {
      modele: l.modele.slice(0, 64), prompt: nombreOuNull(l.prompt) ?? 0, schema: nombreOuNull(l.schema) ?? 0, cout: nombreOuNull(l.cout),
      tokens: t && typeof t === 'object' ? { entree: nombreOuNull(t.entree) ?? 0, ecritureCache: nombreOuNull(t.ecritureCache) ?? 0, lectureCache: nombreOuNull(t.lectureCache) ?? 0, sortie: nombreOuNull(t.sortie) ?? 0 } : null,
      brut: typeof l.brut === 'string' ? l.brut.slice(0, 200000) : null,
      sortie: l.sortie === undefined ? null : JSON.parse(JSON.stringify(l.sortie)) as unknown,
      demandeeLe: texte(l.demandeeLe, 40),
      ...(l.synthetique === true ? { synthetique: true } : {}),
      ...(typeof l.trace === 'string' && l.trace ? { trace: l.trace.slice(0, 80) } : {}),
    },
    faits, remarques: texte(o.remarques),
  };
}

/** Les faits que les regles lisent : ceux que la personne a valides, et eux seuls. */
export const faitsValides = (r: ReglementPlu | null | undefined): FaitPlu[] => (r ? r.faits.filter((f) => f.statut === 'valide') : []);

/** « 7 m », « 40 % », « 35° », « 1 place » : la valeur d'un fait dans son unite, pour l'ecran. */
export function valeurLisible(f: Pick<FaitPlu, 'grandeur' | 'valeur' | 'termes'>): string {
  if (f.grandeur === 'materiaux-toit') return f.termes.length ? f.termes.join(', ') : '—';
  if (f.valeur === null) return '—';
  const n = String(Math.round(f.valeur * 100) / 100).replace('.', ',');
  const u = GRANDEURS_PLU[f.grandeur].unite;
  return u === 'm' ? n + ' m' : u === 'pourcent' ? n + ' %' : u === 'degres' ? n + '°' : u === 'places' ? n + (f.valeur > 1 ? ' places' : ' place') : n;
}

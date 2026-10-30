// La consommation de Claude, vue par l'administrateur (MD/spec-audit.md 13.3, lot L16 bis).
//
// Le serveur (deploy/analyse.php) ecrit une ligne de journal par appel a
// l'API et rend, sur `GET admin/consommation`, les lignes de la periode deja filtrees, l'etat des
// plafonds de chaque organisation et les sept derniers jours sans filtre (pour les alertes). Tout
// le reste se calcule ici, sans DOM ni reseau : les series dans le temps, les tableaux par parcelle,
// par usage et par organisation, les chiffres cles et les alertes. Le navigateur ne compte rien
// lui-meme : il ne fait qu'additionner ce que le journal a lu dans le champ `usage` de l'API.

/** Les compteurs d'un appel, tels que le journal les garde (champ `usage` de l'API). */
export interface TokensJournal {
  entree: number;
  ecritureCache: number;
  ecritureCache1h: number;
  lectureCache: number;
  sortie: number;
}

/**
 * Ce qu'une reponse contenait, compte par le serveur quand il l'a relue (champ `trouve` du journal) :
 * le journal ne garde pas la reponse, seulement ces nombres. Les cles suivent les deux schemas
 * (deploy/schema-analyse.json, deploy/schema-renfort.json).
 */
export interface Trouvailles {
  /** Analyse : les ouvertures comptees niveau par niveau ; renfort : celles qu'il garde. */
  ouvertures: number;
  /** Les ouvertures que la detection de Plan n'avait pas vues. */
  manquees: number;
  /** Analyse : celles comptees en trop ; renfort : celles qu'il retire. */
  enTrop: number;
  /** Les bouts du toit reconnus (pignon, croupe, demi-croupe, brisis). */
  bouts: number;
  lucarnes: number;
  /** Les elements du toit (fenetre de toit, verriere, acrotere…). */
  elements: number;
  /** Les ecarts signales entre le modele de Plan et ce que montre la photo. */
  ecarts: number;
  /** Renfort : les coins du mur situes sur la photo. */
  coins: number;
  /** Les attributs tranches (forme, profil, faitage, couverture, terrasse ; le mur du renfort). */
  determines: number;
  /** La reponse ne dit rien : tout est `indetermine` ou vide. */
  vide: boolean;
}

export const CLES_TROUVAILLES = ['ouvertures', 'manquees', 'enTrop', 'bouts', 'lucarnes', 'elements', 'ecarts', 'coins', 'determines'] as const;
export type CleTrouvaille = typeof CLES_TROUVAILLES[number];

export const NOMS_TROUVAILLES: Record<CleTrouvaille, string> = {
  ouvertures: 'Ouvertures',
  manquees: 'Manquées signalées',
  enTrop: 'En trop',
  bouts: 'Pignons et croupes',
  lucarnes: 'Lucarnes',
  elements: 'Éléments de toit',
  ecarts: 'Écarts au modèle',
  coins: 'Coins situés',
  determines: 'Attributs tranchés'
};

/** Une ligne du journal, telle que la route la rend (sans photo ni reponse : des compteurs). */
export interface LigneConsommation {
  t: string;
  organisation: string;
  projet: string | null;
  idu: string | null;
  adresse: string | null;
  audit: string | null;
  usage: string;
  modele: string;
  batch: boolean;
  /** Le batch de la requete ; `null` hors batch, ou sur un journal d'avant. */
  idBatch: string | null;
  passe: number | null;
  tokens: TokensJournal;
  images: number;
  /** Les facades que la requete couvrait (lot L17) ; 0 sur un journal d'avant. */
  facades: number;
  /** En dollars ; `null` quand aucun tarif n'etait connu ce jour-la. */
  cout: number | null;
  /** `reussi`, `echoue`, `expire`, `annule`, ou `plafond` (refuse avant l'appel). */
  statut: string;
  /** Ce que la reponse contenait ; `null` sans reponse lue, ou sur un journal d'avant les comptes. */
  trouve: Trouvailles | null;
}

/** Ce qu'une organisation a depense aujourd'hui et ce mois-ci, et ses plafonds. */
export interface EtatOrganisation {
  id: string;
  jour: number;
  mois: number;
  plafond: { jour: number; mois: number };
}

export interface ReponseConsommation {
  du: string;
  au: string;
  /** Le jour du serveur (UTC) : celui des plafonds. */
  aujourdhui: string;
  lignes: LigneConsommation[];
  /** Les sept derniers jours, sans filtre : les alertes ne dependent pas de ce qu'on regarde. */
  recents: LigneConsommation[];
  organisations: EtatOrganisation[];
  choix: { organisations: string[]; modeles: string[]; usages: string[]; parcelles: { idu: string; adresse: string | null }[] };
}

export type Pas = 'jour' | 'semaine' | 'mois';
export type Mesure = 'tokens' | 'cout';

/** L'estimation de la spec (13.2) : de l'ordre de 1 a 2 centimes par parcelle, trois passes comprises. */
export const ESTIMATION_PAR_PARCELLE = { min: 0.01, max: 0.02 } as const;
/** Les seuils des alertes (13.3). */
export const SEUILS = { plafond: 0.8, derive: 2, echecs: 0.05 } as const;

/**
 * Les modeles connus, dans l'ordre de leurs couleurs. La couleur suit le modele, jamais son rang :
 * un filtre qui retire Haiku ne repeint pas Sonnet. Un modele inconnu rejoint « Autres modeles ».
 */
export const MODELES_CONNUS: { id: string; nom: string; serie: 1 | 2 | 3 }[] = [
  { id: 'claude-haiku-5-5', nom: 'Claude Haiku 5.5', serie: 1 },
  { id: 'claude-sonnet-5-5', nom: 'Claude Sonnet 5.5', serie: 2 },
  { id: 'claude-opus-5-5', nom: 'Claude Opus 5.5', serie: 3 }
];
export const AUTRES_MODELES = 'autres';

export const NOMS_USAGES: Record<string, string> = {
  analyse: 'Analyse',
  escalade: 'Escalade',
  renfort: 'Renfort',
  immediat: 'Immédiat',
  // Les cas candidats Panoramax du skill regles-toits (lot G3 bis) : leur cout se lit a part.
  candidats: 'Cas candidats',
  // Le rejeu d'un audit stocke, pour comparer les modeles et les versions du prompt (spec-audit 15.5).
  rejeu: 'Rejeu des audits',
  // La lecture du jardin d'une parcelle sur son orthophoto (lot L3).
  jardin: 'Lecture du jardin',
  // La seconde lecture d'une facade, sur l'image de son run : menuiseries, modenature, saillies (lot L1).
  'facade-enrichie': 'Façade enrichie',
  // La troisieme lecture d'une facade : son toit, sa couverture, ses fenetres de toit (lot L2).
  'facade-toit': 'Toit d’une façade',
  // La redaction d'un texte du dossier de declaration prealable (lot L5).
  texte: 'Textes du dossier',
  // Une demande a l'assistant en langue naturelle, traduite en etapes du registre (lot L6).
  assistant: 'Assistant'
};

/** Le nom d'un modele, ou d'une serie (`autres`), pour l'ecran et le CSV. */
export function nomModele(id: string): string {
  if (id === AUTRES_MODELES) return 'Autres modèles';
  return MODELES_CONNUS.find((m) => m.id === id)?.nom ?? id;
}

/** La serie d'un modele dans les graphiques : lui-meme s'il est connu, sinon « autres ». */
export function serieDuModele(id: string): string {
  return MODELES_CONNUS.some((m) => m.id === id) ? id : AUTRES_MODELES;
}

/** Le jeton de couleur de la serie (`--serie-1`…), ou `null` pour « autres » (encre secondaire). */
export function couleurSerie(serie: string): 1 | 2 | 3 | null {
  return MODELES_CONNUS.find((m) => m.id === serie)?.serie ?? null;
}

/** Les series presentes, dans l'ordre fixe des couleurs, « autres » a la fin. */
export function ordonnerSeries(series: Iterable<string>): string[] {
  const vues = new Set(series);
  return [...MODELES_CONNUS.map((m) => m.id).filter((id) => vues.has(id)), ...(vues.has(AUTRES_MODELES) ? [AUTRES_MODELES] : [])];
}

// --- Lecture de la reponse ------------------------------------------------------------------------

const JOUR = /^\d{4}-\d{2}-\d{2}$/;
const fini = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const texte = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);
const positif = (v: unknown): number => (fini(v) && v > 0 ? v : 0);

/** Les comptes d'une ligne ; `null` quand le journal n'en a pas (ligne d'avant, ou reponse non lue). */
function lireTrouvailles(v: unknown): Trouvailles | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  const t = Object.fromEntries(CLES_TROUVAILLES.map((k) => [k, Math.round(positif(o[k]))])) as Record<CleTrouvaille, number>;
  return { ...t, vide: o.vide === true };
}

function lireLigne(d: unknown): LigneConsommation | null {
  if (!d || typeof d !== 'object') return null;
  const o = d as Record<string, unknown>;
  if (typeof o.t !== 'string' || !JOUR.test(o.t.slice(0, 10)) || typeof o.modele !== 'string' || typeof o.usage !== 'string') return null;
  const t = (o.tokens && typeof o.tokens === 'object' ? o.tokens : {}) as Record<string, unknown>;
  return {
    t: o.t,
    organisation: texte(o.organisation) ?? 'admin',
    projet: texte(o.projet),
    idu: texte(o.idu),
    adresse: texte(o.adresse),
    audit: texte(o.audit),
    usage: o.usage,
    modele: o.modele,
    batch: o.batch === true,
    idBatch: texte(o.idBatch),
    passe: fini(o.passe) ? o.passe : null,
    tokens: { entree: positif(t.entree), ecritureCache: positif(t.ecritureCache), ecritureCache1h: positif(t.ecritureCache1h), lectureCache: positif(t.lectureCache), sortie: positif(t.sortie) },
    images: positif(o.images),
    facades: positif(o.facades),
    cout: fini(o.cout) ? o.cout : null,
    statut: typeof o.statut === 'string' ? o.statut : 'echoue',
    trouve: lireTrouvailles(o.trouve)
  };
}

const lignes = (v: unknown): LigneConsommation[] => (Array.isArray(v) ? v.map(lireLigne).filter((l): l is LigneConsommation => l !== null) : []);
const textes = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x !== '') : []);

/** La reponse de `GET admin/consommation`, ou `null` si elle n'en a pas la forme. Une ligne abimee est ecartee. */
export function lireReponseConsommation(d: unknown): ReponseConsommation | null {
  if (!d || typeof d !== 'object') return null;
  const o = d as Record<string, unknown>;
  if (o.format !== 'plan-claude-consommation' || typeof o.du !== 'string' || typeof o.au !== 'string' || !JOUR.test(o.du) || !JOUR.test(o.au)) return null;
  const choix = (o.choix && typeof o.choix === 'object' ? o.choix : {}) as Record<string, unknown>;
  const organisations = Array.isArray(o.organisations) ? o.organisations.flatMap((x): EtatOrganisation[] => {
    const e = x as Record<string, unknown> | null;
    const p = (e && typeof e.plafond === 'object' && e.plafond ? e.plafond : {}) as Record<string, unknown>;
    return e && typeof e.id === 'string' ? [{ id: e.id, jour: positif(e.jour), mois: positif(e.mois), plafond: { jour: positif(p.jour), mois: positif(p.mois) } }] : [];
  }) : [];
  const parcelles = Array.isArray(choix.parcelles) ? choix.parcelles.flatMap((x) => {
    const p = x as Record<string, unknown> | null;
    return p && typeof p.idu === 'string' && p.idu ? [{ idu: p.idu, adresse: texte(p.adresse) }] : [];
  }) : [];
  return {
    du: o.du,
    au: o.au,
    aujourdhui: typeof o.aujourdhui === 'string' && JOUR.test(o.aujourdhui) ? o.aujourdhui : o.au,
    lignes: lignes(o.lignes),
    recents: lignes(o.recents),
    organisations,
    choix: { organisations: textes(choix.organisations), modeles: textes(choix.modeles), usages: textes(choix.usages), parcelles }
  };
}

// --- Dates -----------------------------------------------------------------------------------------

const enJour = (ms: number): string => new Date(ms).toISOString().slice(0, 10);
const enMs = (jour: string): number => Date.UTC(Number(jour.slice(0, 4)), Number(jour.slice(5, 7)) - 1, Number(jour.slice(8, 10)));

/** Un jour decale de `n` jours (UTC). */
export function decalerJour(jour: string, n: number): string {
  return enJour(enMs(jour) + n * 86400000);
}

export type Periode = '7j' | '30j' | '90j' | '12m' | '24m';
export const PERIODES: { id: Periode; libelle: string }[] = [
  { id: '7j', libelle: '7 derniers jours' },
  { id: '30j', libelle: '30 derniers jours' },
  { id: '90j', libelle: '90 derniers jours' },
  { id: '12m', libelle: '12 derniers mois' },
  { id: '24m', libelle: '24 derniers mois' }
];

/** Les bornes d'une periode qui finit aujourd'hui, jour compris. Le journal est garde 24 mois. */
export function bornesPeriode(p: Periode, aujourdhui: string): { du: string; au: string } {
  if (p === '12m' || p === '24m') {
    const mois = p === '12m' ? 11 : 23;
    const a = Number(aujourdhui.slice(0, 4)), m = Number(aujourdhui.slice(5, 7)) - 1 - mois;
    return { du: enJour(Date.UTC(a, m, 1)), au: aujourdhui };
  }
  return { du: decalerJour(aujourdhui, -(Number(p.replace('j', '')) - 1)), au: aujourdhui };
}

/** Le pas qui convient a une periode : une cinquantaine de points au plus. */
export function pasParDefaut(du: string, au: string): Pas {
  const jours = (enMs(au) - enMs(du)) / 86400000 + 1;
  return jours <= 62 ? 'jour' : jours <= 190 ? 'semaine' : 'mois';
}

/** La cle de l'intervalle d'un jour : le jour, le lundi de sa semaine (ISO), ou son mois. */
export function cleDePas(jour: string, pas: Pas): string {
  if (pas === 'jour') return jour;
  if (pas === 'mois') return jour.slice(0, 7);
  const ms = enMs(jour);
  const dow = (new Date(ms).getUTCDay() + 6) % 7;
  return enJour(ms - dow * 86400000);
}

/** Les intervalles qui couvrent la periode, dans l'ordre, sans trou (un jour sans appel vaut zero). */
export function intervalles(du: string, au: string, pas: Pas): string[] {
  const cles: string[] = [];
  for (let ms = enMs(du); ms <= enMs(au); ms += 86400000) {
    const c = cleDePas(enJour(ms), pas);
    if (cles[cles.length - 1] !== c) cles.push(c);
  }
  return cles;
}

// --- Agregation ------------------------------------------------------------------------------------

/** Tous les tokens d'un appel : entree, ecriture et lecture du cache, sortie. */
export function totalTokens(t: TokensJournal): number {
  return t.entree + t.ecritureCache + t.lectureCache + t.sortie;
}

/** Les tokens d'entree au sens large : ce qui part vers le modele, cache compris. */
const tokensEntree = (t: TokensJournal): number => t.entree + t.ecritureCache + t.lectureCache;
const cout = (l: LigneConsommation): number => l.cout ?? 0;
const arrondi = (x: number): number => Math.round(x * 1e8) / 1e8;
/** Un appel compte s'il est parti : un refus du plafond n'a rien coute ni consomme. */
const appel = (l: LigneConsommation): boolean => l.statut !== 'plafond';
const echec = (l: LigneConsommation): boolean => l.statut === 'echoue' || l.statut === 'expire';

export interface SerieTemps {
  cles: string[];
  series: string[];
  /** Par serie, une valeur par intervalle. */
  valeurs: Record<string, number[]>;
  totaux: number[];
}

/** Tokens ou dollars par intervalle et par modele : la matiere des aires empilees. */
export function serieTemps(ls: LigneConsommation[], du: string, au: string, pas: Pas, mesure: Mesure): SerieTemps {
  const cles = intervalles(du, au, pas);
  const index = new Map(cles.map((c, i) => [c, i]));
  const valeurs: Record<string, number[]> = {};
  for (const l of ls) {
    const i = index.get(cleDePas(l.t.slice(0, 10), pas));
    if (i === undefined || !appel(l)) continue;
    const v = (valeurs[serieDuModele(l.modele)] ??= cles.map(() => 0));
    v[i] = (v[i] ?? 0) + (mesure === 'tokens' ? totalTokens(l.tokens) : cout(l));
  }
  const series = ordonnerSeries(Object.keys(valeurs));
  if (mesure === 'cout') for (const s of series) valeurs[s] = (valeurs[s] ?? []).map(arrondi);
  const totaux = cles.map((_, i) => arrondi(series.reduce((n, s) => n + (valeurs[s]?.[i] ?? 0), 0)));
  return { cles, series, valeurs, totaux };
}

/** La valeur d'une serie a un intervalle ; zero si elle n'y figure pas. */
export function valeurA(s: SerieTemps, serie: string, i: number): number {
  return s.valeurs[serie]?.[i] ?? 0;
}

/** Les usages d'une premiere analyse : eux seuls comptent les facades (cout par facade). */
const USAGES_QUI_COMPTENT = new Set(['analyse', 'immediat']);

export interface LigneParcelle {
  cle: string;
  idu: string | null;
  adresse: string | null;
  audits: number;
  tokensParModele: Record<string, number>;
  tokens: number;
  /** Part des tokens d'entree lus en cache. */
  partCache: number;
  cout: number;
  /** Les facades couvertes par les appels, comptees sur la premiere passe de chaque maison. */
  facades: number;
  /** Le cout rapporte aux facades ; null sans facade comptee (journal d'avant le lot L17). */
  coutParFacade: number | null;
  /** Le jour du dernier appel. */
  dernier: string;
}

/** Une ligne par parcelle : l'IDU, sinon l'adresse, sinon « sans parcelle ». */
export function parParcelle(ls: LigneConsommation[]): LigneParcelle[] {
  const groupes = new Map<string, { l: LigneConsommation[]; audits: Set<string> }>();
  for (const l of ls) {
    if (!appel(l)) continue;
    const cle = l.idu ?? (l.adresse ? 'adresse:' + l.adresse : 'sans');
    const g = groupes.get(cle) ?? { l: [], audits: new Set<string>() };
    g.l.push(l);
    if (l.audit) g.audits.add(l.audit);
    groupes.set(cle, g);
  }
  return [...groupes].map(([cle, g]) => {
    const tokensParModele: Record<string, number> = {};
    let entree = 0, lu = 0, c = 0, dernier = '';
    // Les trois passes d'une maison couvrent les memes facades : seule la premiere (ou l'appel
    // unique, sans passe) les compte. Une escalade ou un renfort revoit des facades deja comptees ;
    // un envoi refuse au plafond n'a rien coute : ni l'un ni l'autre ne compte.
    let facades = 0;
    for (const l of g.l) {
      const s = serieDuModele(l.modele);
      tokensParModele[s] = (tokensParModele[s] ?? 0) + totalTokens(l.tokens);
      entree += tokensEntree(l.tokens);
      lu += l.tokens.lectureCache;
      c += cout(l);
      if (l.t > dernier) dernier = l.t;
      if ((l.passe === null || l.passe === 1) && l.statut !== 'plafond' && USAGES_QUI_COMPTENT.has(l.usage)) facades += l.facades;
    }
    const premiere = g.l.find((l) => l.adresse) ?? g.l[0];
    return {
      cle, idu: g.l[0]?.idu ?? null, adresse: premiere?.adresse ?? null, audits: g.audits.size, tokensParModele,
      tokens: Object.values(tokensParModele).reduce((a, b) => a + b, 0),
      partCache: entree ? lu / entree : 0, cout: arrondi(c), facades, coutParFacade: facades ? arrondi(c / facades) : null, dernier: dernier.slice(0, 10)
    };
  });
}

export interface LigneUsage {
  usage: string;
  appels: number;
  tokens: number;
  cout: number;
  partCout: number;
  /** Part des appels passes par l'API Batch. */
  partBatch: number;
}

/** La repartition entre analyse, escalade, renfort, immediat et cas candidats. Les cinq usages sont toujours la. */
export function parUsage(ls: LigneConsommation[], usages: string[] = Object.keys(NOMS_USAGES)): LigneUsage[] {
  const total = ls.filter(appel).reduce((n, l) => n + cout(l), 0);
  const ordre = [...usages, ...new Set(ls.map((l) => l.usage).filter((u) => !usages.includes(u)))];
  return ordre.map((usage) => {
    const u = ls.filter((l) => appel(l) && l.usage === usage);
    const c = u.reduce((n, l) => n + cout(l), 0);
    return {
      usage, appels: u.length, tokens: u.reduce((n, l) => n + totalTokens(l.tokens), 0), cout: arrondi(c),
      partCout: total ? c / total : 0, partBatch: u.length ? u.filter((l) => l.batch).length / u.length : 0
    };
  });
}

export interface LigneModele {
  modele: string;
  /** Les appels partis (un refus du plafond n'en est pas un). */
  requetes: number;
  /** Les batches distincts ; les appels immediats n'en ont pas. */
  batchs: number;
  immediats: number;
  images: number;
  tokens: number;
  cout: number;
  /** Les facades examinees, comptees sur la premiere passe de chaque requete, quel qu'en soit l'usage. */
  facades: number;
  /** Le cout rapporte aux facades examinees ; null sans facade comptee (journal d'avant le lot L17). */
  coutParFacade: number | null;
  echecs: number;
  /** Les reponses dont le serveur a lu les comptes. */
  lues: number;
  vides: number;
  /** Part des reponses lues qui ne disent rien ; null sans reponse lue. */
  partVide: number | null;
  /**
   * Les reponses reussies sans comptes : journal d'avant les comptes, ou sortie coupee, refusee ou
   * illisible. Ni vides ni pleines : hors du calcul de la part vide.
   */
  sansComptes: number;
  /** Les comptes additionnes sur les reponses lues. */
  trouve: Record<CleTrouvaille, number>;
}

/**
 * Une ligne par modele, sur la periode et les filtres choisis : ce qu'il a coute, et surtout ce que
 * ses reponses contiennent. Les modeles connus dans l'ordre de leurs couleurs, les autres ensuite.
 */
export function parModele(ls: LigneConsommation[]): LigneModele[] {
  const partis = ls.filter(appel);
  const connus = MODELES_CONNUS.map((m) => m.id);
  const ids = [...new Set(partis.map((l) => l.modele))].sort((a, b) => {
    const ia = connus.indexOf(a), ib = connus.indexOf(b);
    return (ia < 0 ? connus.length : ia) - (ib < 0 ? connus.length : ib) || a.localeCompare(b);
  });
  return ids.map((modele) => {
    const m = partis.filter((l) => l.modele === modele);
    const c = m.reduce((n, l) => n + cout(l), 0);
    const facades = m.reduce((n, l) => n + (l.passe === null || l.passe === 1 ? l.facades : 0), 0);
    const lues = m.filter((l) => l.trouve !== null);
    const vides = lues.filter((l) => l.trouve?.vide).length;
    const trouve = Object.fromEntries(CLES_TROUVAILLES.map((k) => [k, lues.reduce((n, l) => n + (l.trouve?.[k] ?? 0), 0)])) as Record<CleTrouvaille, number>;
    return {
      modele, requetes: m.length,
      batchs: new Set(m.filter((l) => l.batch && l.idBatch).map((l) => l.idBatch)).size,
      immediats: m.filter((l) => !l.batch).length,
      images: m.reduce((n, l) => n + l.images, 0),
      tokens: m.reduce((n, l) => n + totalTokens(l.tokens), 0),
      cout: arrondi(c), facades, coutParFacade: facades ? arrondi(c / facades) : null,
      echecs: m.filter(echec).length,
      lues: lues.length, vides, partVide: lues.length ? vides / lues.length : null,
      sansComptes: m.filter((l) => l.statut === 'reussi' && l.trouve === null).length,
      trouve
    };
  });
}

export interface LigneOrganisation {
  id: string;
  /** Ce qu'elle a coute sur la periode et les filtres choisis. */
  coutPeriode: number;
  jour: number;
  mois: number;
  plafondJour: number;
  plafondMois: number;
  partJour: number;
  partMois: number;
}

/** Une ligne par organisation : le mois en cours face a son plafond, et la periode regardee. */
export function parOrganisation(ls: LigneConsommation[], etats: EtatOrganisation[]): LigneOrganisation[] {
  const ids = [...new Set([...etats.map((e) => e.id), ...ls.map((l) => l.organisation)])];
  return ids.map((id) => {
    const e = etats.find((x) => x.id === id) ?? { id, jour: 0, mois: 0, plafond: { jour: 0, mois: 0 } };
    return {
      id, coutPeriode: arrondi(ls.filter((l) => l.organisation === id).reduce((n, l) => n + cout(l), 0)),
      jour: e.jour, mois: e.mois, plafondJour: e.plafond.jour, plafondMois: e.plafond.mois,
      partJour: e.plafond.jour > 0 ? e.jour / e.plafond.jour : 0, partMois: e.plafond.mois > 0 ? e.mois / e.plafond.mois : 0
    };
  });
}

export interface ChiffresCles {
  cout: number;
  tokens: number;
  appels: number;
  /** Audits distincts (une capture et son analyse) ; a defaut d'audit, la parcelle. */
  audits: number;
  coutMoyenParAudit: number | null;
  /** Part du cout passee en escalade. */
  partEscalade: number;
  /** Part des tokens d'entree lus en cache. */
  partCacheLu: number;
  tauxEchec: number;
  refusPlafond: number;
}

export function chiffresCles(ls: LigneConsommation[]): ChiffresCles {
  const partis = ls.filter(appel);
  const c = partis.reduce((n, l) => n + cout(l), 0);
  const entree = partis.reduce((n, l) => n + tokensEntree(l.tokens), 0);
  const audits = new Set(partis.map((l) => l.audit ?? l.idu ?? l.adresse).filter((x): x is string => !!x)).size;
  return {
    cout: arrondi(c),
    tokens: partis.reduce((n, l) => n + totalTokens(l.tokens), 0),
    appels: partis.length,
    audits,
    coutMoyenParAudit: audits ? arrondi(c / audits) : null,
    partEscalade: c ? partis.filter((l) => l.usage === 'escalade').reduce((n, l) => n + cout(l), 0) / c : 0,
    partCacheLu: entree ? partis.reduce((n, l) => n + l.tokens.lectureCache, 0) / entree : 0,
    tauxEchec: partis.length ? partis.filter(echec).length / partis.length : 0,
    refusPlafond: ls.length - partis.length
  };
}

export interface Alerte {
  code: 'plafond-jour' | 'plafond-mois' | 'derive' | 'echecs';
  message: string;
}

const pourcent = (x: number): string => Math.round(x * 100) + ' %';
const dollars = (x: number): string => x.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 4 }) + ' $';

/**
 * Les alertes de la spec : une organisation a 80 % de son plafond du jour ou du mois ; un cout moyen
 * par parcelle au-dela de deux fois l'estimation sur sept jours ; plus de 5 % d'echecs sur sept jours.
 * Elles portent sur les sept derniers jours sans filtre, pas sur ce que l'ecran montre.
 */
export function alertes(etats: EtatOrganisation[], recents: LigneConsommation[]): Alerte[] {
  const a: Alerte[] = [];
  for (const e of etats) {
    if (e.plafond.jour > 0 && e.jour >= SEUILS.plafond * e.plafond.jour) {
      a.push({ code: 'plafond-jour', message: 'Organisation « ' + e.id + ' » : ' + pourcent(e.jour / e.plafond.jour) + ' du plafond du jour (' + dollars(e.jour) + ' sur ' + dollars(e.plafond.jour) + ').' });
    }
    if (e.plafond.mois > 0 && e.mois >= SEUILS.plafond * e.plafond.mois) {
      a.push({ code: 'plafond-mois', message: 'Organisation « ' + e.id + ' » : ' + pourcent(e.mois / e.plafond.mois) + ' du plafond du mois (' + dollars(e.mois) + ' sur ' + dollars(e.plafond.mois) + ').' });
    }
  }
  const k = chiffresCles(recents);
  if (k.coutMoyenParAudit !== null && k.coutMoyenParAudit > SEUILS.derive * ESTIMATION_PAR_PARCELLE.max) {
    a.push({ code: 'derive', message: 'Coût moyen par parcelle sur sept jours : ' + dollars(k.coutMoyenParAudit) + ', plus de deux fois l’estimation (' + dollars(ESTIMATION_PAR_PARCELLE.max) + ').' });
  }
  if (k.appels > 0 && k.tauxEchec > SEUILS.echecs) {
    a.push({ code: 'echecs', message: 'Taux d’échec sur sept jours : ' + pourcent(k.tauxEchec) + ' des appels (seuil : 5 %).' });
  }
  return a;
}

/** Trie des lignes sur une colonne ; les textes a la francaise, les vides a la fin. */
export function trier<T>(ls: T[], valeur: (l: T) => string | number | null, sens: 'asc' | 'desc'): T[] {
  const s = sens === 'asc' ? 1 : -1;
  return [...ls].sort((a, b) => {
    const x = valeur(a), y = valeur(b);
    if (x === null || x === '') return y === null || y === '' ? 0 : 1;
    if (y === null || y === '') return -1;
    return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'fr')) * s;
  });
}

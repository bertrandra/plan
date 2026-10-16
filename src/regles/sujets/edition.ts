// Ce que l'ecran Admin › Regles fait des descriptions de sujets : les modifier sans jamais toucher les
// originales (des copies, rendues neuves), en ajouter un en brouillon, controler l'ensemble, et dire
// ce qui change par rapport au livre. Pur : l'ecran n'y met que des champs et des boutons.

import type { Bloc, BlocDeSection, BlocTitre, DescriptionSujet, SchemaJson } from './description.js';
import { assemblerPrompt, assemblerSchema } from './assembler.js';

/** Les listes de texte d'un sujet que l'on edite, avec le nom qu'elles ont a l'ecran. */
export const FAMILLES = {
  consignes: 'Consignes (comment répondre)',
  vocabulaire: 'Vocabulaire',
  lectures: 'Sections de lecture',
  grille: 'Grille de lecture',
  confusions: 'Confusions',
  rappels: 'Rappels',
} as const;
export type Famille = keyof typeof FAMILLES;

/** Un texte, un rang ; les listes `vocabulaire`, `lectures` et `rappels` portent en plus leur section ou leur titre. */
export type BlocEditable = Bloc & Partial<Pick<BlocDeSection, 'section'>> & Partial<Pick<BlocTitre, 'titre'>>;

/** Une copie de la liste dont le sujet `id` est remplace par `f(sujet)`. */
export function remplacerSujet(liste: readonly DescriptionSujet[], id: string, f: (s: DescriptionSujet) => DescriptionSujet): DescriptionSujet[] {
  return liste.map((s) => (s.id === id ? f(s) : s));
}

/** Change un morceau d'une liste de texte d'un sujet (le texte, le rang, le titre ou la section). */
export function modifierBloc(s: DescriptionSujet, famille: Famille, index: number, patch: Partial<BlocEditable>): DescriptionSujet {
  const blocs = (s[famille] as BlocEditable[]).map((b, i) => (i === index ? { ...b, ...patch } : b));
  return { ...s, [famille]: blocs } as DescriptionSujet;
}

/** Retire un morceau (un sujet brouillon qui n'en veut plus). */
export function retirerBloc(s: DescriptionSujet, famille: Famille, index: number): DescriptionSujet {
  return { ...s, [famille]: (s[famille] as BlocEditable[]).filter((_, i) => i !== index) } as DescriptionSujet;
}

/** Remplace le schema d'un champ par le JSON donne ; un texte qui n'est pas un objet JSON est refuse, avec la raison. */
export function modifierChamp(s: DescriptionSujet, champ: string, json: string): { sujet: DescriptionSujet } | { erreur: string } {
  let v: unknown;
  try { v = JSON.parse(json); } catch (e) { return { erreur: 'JSON illisible : ' + (e as Error).message }; }
  if (!v || typeof v !== 'object' || Array.isArray(v)) return { erreur: 'Le schéma d’un champ est un objet JSON.' };
  return { sujet: { ...s, champs: { ...s.champs, [champ]: v as SchemaJson } } };
}

/* ------------------------------------------------------------------------------------------------
 * Un sujet nouveau, en brouillon
 * --------------------------------------------------------------------------------------------- */

export interface TermeNouveau { terme: string; definition: string }
export interface SpecSujetNouveau {
  id: string;
  libelle: string;
  /** Ce que Claude doit dire de ce sujet, a l'infinitif ou en groupe nominal : « le nombre de chiens-assis vus sur le versant ». */
  question: string;
  /** Les valeurs admises ; `indetermine` est ajoute. Vide : un nombre (entier ou `indetermine`). */
  termes: TermeNouveau[];
}

/** Le premier rang libre apres `apres`, et avant `avant` : le brouillon s'intercale sans renumeroter. */
function rangLibre(pris: ReadonlySet<number>, apres: number): number {
  let r = Math.round((apres + 0.5) * 100) / 100;
  while (pris.has(r)) r = Math.round((r + 0.01) * 100) / 100;
  return r;
}

export const IDENTIFIANT = /^[a-z][a-zA-Z0-9]*$/;

/**
 * La description d'un sujet a partir de ce que l'on sait en dire : un champ `{ indices, valeur }` (ou
 * `{ indices, nombre }`), une consigne, et son vocabulaire. Elle s'intercale avant `transverse` (la fin de
 * la reponse) ; son vocabulaire ferme le « Vocabulaire ». `attributs` reste vide : un sujet nouveau est une
 * observation tant que son module de proposition et son attribut n'existent pas dans le code.
 */
export function nouveauSujet(spec: SpecSujetNouveau, existants: readonly DescriptionSujet[]): DescriptionSujet {
  const consignes = new Set(existants.flatMap((s) => s.consignes.map((b) => b.rang)));
  const vocab = existants.flatMap((s) => s.vocabulaire.map((b) => b.rang));
  const termes = spec.termes.filter((t) => t.terme.trim());
  const valeur: SchemaJson = termes.length
    ? { type: 'string', enum: [...termes.map((t) => t.terme.trim()), 'indetermine'] }
    : { $ref: '#/$defs/compte' };
  const dernier = Math.max(0, ...existants.filter((s) => s.id !== 'transverse').flatMap((s) => s.consignes.map((b) => b.rang)));
  return {
    id: spec.id, libelle: spec.libelle.trim() || spec.id, attributs: [],
    champs: { [spec.id]: { type: 'object', additionalProperties: false, required: ['indices', termes.length ? 'valeur' : 'nombre'], properties: { indices: { $ref: '#/$defs/indices' }, [termes.length ? 'valeur' : 'nombre']: valeur } } },
    definitions: {},
    consignes: [{ rang: rangLibre(consignes, dernier), texte: '- `' + spec.id + '` : ' + spec.question.trim() + '.' }],
    vocabulaire: termes.length ? termes.map((t, i) => ({ section: 'Vocabulaire : ' + (spec.libelle.trim() || spec.id), rang: rangLibreVocabulaire(vocab, i), texte: '- `' + t.terme.trim() + '` : ' + t.definition.trim() + '.' })) : [],
    lectures: [], grille: [], confusions: [], rappels: [],
  };
}

function rangLibreVocabulaire(pris: readonly number[], i: number): number {
  return Math.max(40, ...pris) + 1 + i / 100;
}

/** Insere un sujet avant `transverse` (la fin de la reponse), ou a la fin s'il n'y est pas. */
export function insererAvantLaFin(liste: readonly DescriptionSujet[], s: DescriptionSujet): DescriptionSujet[] {
  const fin = liste.findIndex((x) => x.id === 'transverse');
  return fin < 0 ? [...liste, s] : [...liste.slice(0, fin), s, ...liste.slice(fin)];
}

/* ------------------------------------------------------------------------------------------------
 * Controles
 * --------------------------------------------------------------------------------------------- */

export interface Controle { niveau: 'erreur' | 'alerte' | 'ok'; code: string; message: string }

/** Sans accents, sans casse, tirets et apostrophes en espaces : de quoi retrouver « fenetre-de-toit » dans « Fenêtre de toit ». */
const normaliser = (t: string): string => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[-'’]/g, ' ');

const TERMES_LIBRES = new Set(['indetermine', 'oui', 'non', 'sans-objet', 'aucun']);

/** Toutes les valeurs d'une enumeration, au fond d'un schema. */
function enumerations(n: unknown, sortie: string[] = []): string[] {
  if (!n || typeof n !== 'object') return sortie;
  if (Array.isArray(n)) { n.forEach((x) => enumerations(x, sortie)); return sortie; }
  const o = n as Record<string, unknown>;
  if (Array.isArray(o.enum)) for (const v of o.enum) if (typeof v === 'string') sortie.push(v);
  for (const v of Object.values(o)) enumerations(v, sortie);
  return sortie;
}

/** Les references `$ref` d'un schema. */
function references(n: unknown, sortie: string[] = []): string[] {
  if (!n || typeof n !== 'object') return sortie;
  if (Array.isArray(n)) { n.forEach((x) => references(x, sortie)); return sortie; }
  for (const [k, v] of Object.entries(n as Record<string, unknown>)) {
    if (k === '$ref' && typeof v === 'string') sortie.push(v); else references(v, sortie);
  }
  return sortie;
}

/** Les objets du schema doivent etre fermes, tous leurs champs requis (limites de la sortie structuree). */
function objetsOuverts(n: unknown, ou: string, sortie: string[] = []): string[] {
  if (!n || typeof n !== 'object') return sortie;
  const o = n as Record<string, unknown>;
  if (o.type === 'object') {
    if (o.additionalProperties !== false) sortie.push(ou + ' : additionalProperties doit valoir false');
    const requis = Array.isArray(o.required) ? [...(o.required as string[])].sort().join() : '';
    const propres = o.properties && typeof o.properties === 'object' ? Object.keys(o.properties).sort().join() : '';
    if (requis !== propres) sortie.push(ou + ' : tous les champs doivent etre requis');
  }
  for (const [k, v] of Object.entries(o)) objetsOuverts(v, ou + '.' + k, sortie);
  return sortie;
}

/**
 * Ce qui ne va pas dans cet ensemble de sujets, et ce qui va : le meme controle que les tests de
 * deploy/ (objets fermes, termes definis dans le prompt), plus les identifiants, les references et les
 * rangs. Une erreur empeche d'ecrire les fichiers ; une alerte se lit et se decide.
 */
export function controler(sujets: readonly DescriptionSujet[]): Controle[] {
  const out: Controle[] = [];
  const erreur = (code: string, message: string) => out.push({ niveau: 'erreur', code, message });
  const alerte = (code: string, message: string) => out.push({ niveau: 'alerte', code, message });

  const ids = sujets.map((s) => s.id);
  for (const id of new Set(ids.filter((x, i) => ids.indexOf(x) !== i))) erreur('id-double', 'Deux sujets portent l’identifiant « ' + id + ' ».');
  for (const s of sujets) if (!IDENTIFIANT.test(s.id)) erreur('id', 'Identifiant « ' + s.id + ' » : des lettres et des chiffres, en commençant par une lettre.');

  const champs = sujets.flatMap((s) => Object.keys(s.champs).map((c) => [s.id, c] as const));
  for (const c of new Set(champs.map((x) => x[1]).filter((x, i, l) => l.indexOf(x) !== i))) erreur('champ-double', 'Le champ « ' + c + ' » est décrit par deux sujets.');

  const prompt = assemblerPrompt(sujets);
  const schema = assemblerSchema(sujets, { version: 0, note: '' }) as { schema: { properties: Record<string, unknown>; $defs: Record<string, unknown> } };

  for (const s of sujets) {
    for (const nom of Object.keys(s.champs)) {
      if (!s.consignes.some((b) => b.texte.includes('`' + nom))) erreur('consigne-absente', 'Le champ « ' + nom + ' » (' + s.libelle + ') n’a aucune consigne : Claude ne saurait pas le remplir.');
    }
    for (const ref of references(s.champs)) {
      const nom = ref.replace('#/$defs/', '');
      if (!ref.startsWith('#/$defs/') || !(nom in schema.schema.$defs)) erreur('ref', 'Le sujet « ' + s.libelle + ' » référence ' + ref + ', qui n’existe pas.');
    }
    for (const m of objetsOuverts(s.champs, s.id)) erreur('schema-ferme', m);
  }

  // Un terme est defini si le prompt le nomme entre accents graves, ou le dit en toutes lettres
  // (« fenetre-de-toit » : « Fenêtre de toit »). Un champ dont des termes ne sont dits nulle part est
  // signale une fois, avec ses termes : Claude les devine alors de son vocabulaire, pas du notre.
  const lu = normaliser(prompt);
  for (const s of sujets) {
    for (const [nom, champ] of Object.entries(s.champs)) {
      const sans = [...new Set(enumerations(champ).filter((x) => !TERMES_LIBRES.has(x)))].filter((t) => !prompt.includes('`' + t + '`') && !lu.includes(normaliser(t)));
      if (sans.length) alerte('terme-non-defini', 'Champ « ' + nom + ' » : ' + (sans.length > 1 ? 'termes' : 'terme') + ' du schéma que le prompt ne définit pas : ' + sans.join(', ') + '.');
    }
  }

  const doubles = (nom: string, rangs: number[]) => { for (const r of new Set(rangs.filter((x, i) => rangs.indexOf(x) !== i))) erreur('rang-double', nom + ' : deux textes portent le rang ' + r + '.'); };
  doubles('Consignes', sujets.flatMap((s) => s.consignes.map((b) => b.rang)));
  doubles('Confusions', sujets.flatMap((s) => s.confusions.map((b) => b.rang)));
  doubles('Vocabulaire', sujets.flatMap((s) => s.vocabulaire.map((b) => b.rang)));
  doubles('Grille', sujets.flatMap((s) => s.grille.map((b) => b.rang)));
  doubles('Sections de lecture', sujets.flatMap((s) => s.lectures.map((b) => b.rang)));
  doubles('Rappels', sujets.flatMap((s) => s.rappels.map((b) => b.rang)));

  if (!out.some((c) => c.niveau === 'erreur')) out.unshift({ niveau: 'ok', code: 'ok', message: 'Le schéma est fermé, chaque champ a sa consigne, les rangs sont uniques.' });
  return out;
}

/* ------------------------------------------------------------------------------------------------
 * Ce qui change
 * --------------------------------------------------------------------------------------------- */

export interface LigneDiff { type: '=' | '+' | '-'; texte: string }

/** Les lignes qui changent entre deux textes (plus longue sous-suite commune) ; les inchangees y sont aussi. */
export function diffLignes(avant: string, apres: string): LigneDiff[] {
  const a = avant.split('\n'), b = apres.split('\n');
  const n = a.length, m = b.length;
  // La table des longueurs de sous-suite commune, a plat : l[i * (m + 1) + j] pour a[i..] et b[j..].
  const l = new Int32Array((n + 1) * (m + 1));
  const au = (i: number, j: number): number => l[i * (m + 1) + j] ?? 0;
  const ligne = (t: readonly string[], i: number): string => t[i] ?? '';
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) l[i * (m + 1) + j] = ligne(a, i) === ligne(b, j) ? au(i + 1, j + 1) + 1 : Math.max(au(i + 1, j), au(i, j + 1));
  }
  const out: LigneDiff[] = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (ligne(a, i) === ligne(b, j)) { out.push({ type: '=', texte: ligne(a, i) }); i++; j++; }
    else if (au(i + 1, j) >= au(i, j + 1)) { out.push({ type: '-', texte: ligne(a, i) }); i++; }
    else { out.push({ type: '+', texte: ligne(b, j) }); j++; }
  }
  while (i < n) { out.push({ type: '-', texte: ligne(a, i) }); i++; }
  while (j < m) { out.push({ type: '+', texte: ligne(b, j) }); j++; }
  return out;
}

/** Le nombre de lignes ajoutees ou retirees : une ligne remplacee en compte deux. */
export const lignesChangees = (d: readonly LigneDiff[]): number => d.filter((x) => x.type !== '=').length;

/** Le nombre de lignes qui changent, une ligne remplacee comptant une fois : de quoi dire « 1 ligne change ». */
export const lignesModifiees = (d: readonly LigneDiff[]): number => Math.max(d.filter((x) => x.type === '+').length, d.filter((x) => x.type === '-').length);

/** Une estimation du nombre de tokens d'un texte francais : un token pour 3,5 caracteres. Une estimation, pas un compte. */
export const estimerTokens = (texte: string): number => Math.ceil(texte.length / 3.5);

/* ------------------------------------------------------------------------------------------------
 * Le module qu'on pose dans le depot
 * --------------------------------------------------------------------------------------------- */

const gabarit = (s: string): string => '`' + s.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${') + '`';
const indente = (o: unknown): string => JSON.stringify(o, null, 2).replace(/\n/g, '\n  ');
const liste = (blocs: readonly string[]): string => '[' + blocs.map((b) => '\n    ' + b + ',').join('') + '\n  ]';

/**
 * Le texte du module `src/regles/sujets/descriptions/<id>.ts` : celui que l'on pose dans le depot pour
 * qu'un sujet edite ou nouveau entre dans le prompt livre. Meme forme que les modules existants (un
 * test relit les huit et exige le meme texte), donc un diff de PR lisible.
 */
export function sourceDescription(s: DescriptionSujet): string {
  const attributs = '[' + s.attributs.map((a) => "'" + a + "'").join(', ') + ']';
  return [
    '// Description du sujet « ' + s.id + ' » : ce que Claude doit lire, comment il doit repondre, ce que l\'on',
    '// en assemble dans le prompt et le schema d\'analyse (src/regles/sujets/assembler.ts).',
    '// Donnees pures : les textes sont ceux du prompt livre (deploy/prompt-analyse.md), decoupes par sujet.',
    '',
    "import type { DescriptionSujet } from '../description.js';",
    '',
    'export const ' + s.id + ': DescriptionSujet = {',
    "  id: '" + s.id + "',",
    '  libelle: ' + gabarit(s.libelle) + ',',
    '  attributs: ' + attributs + ',',
    '  champs: ' + indente(s.champs) + ',',
    '  definitions: ' + indente(s.definitions) + ',',
    '  consignes: ' + liste(s.consignes.map((b) => '{ rang: ' + b.rang + ', texte: ' + gabarit(b.texte) + ' }')) + ',',
    '  vocabulaire: ' + liste(s.vocabulaire.map((b) => '{ section: ' + gabarit(b.section) + ', rang: ' + b.rang + ', texte: ' + gabarit(b.texte) + ' }')) + ',',
    '  lectures: ' + liste(s.lectures.map((b) => '{ rang: ' + b.rang + ', titre: ' + gabarit(b.titre) + ', texte: ' + gabarit(b.texte) + ' }')) + ',',
    '  grille: ' + liste(s.grille.map((b) => '{ rang: ' + b.rang + ', texte: ' + gabarit(b.texte) + ' }')) + ',',
    '  confusions: ' + liste(s.confusions.map((b) => '{ rang: ' + b.rang + ', texte: ' + gabarit(b.texte) + ' }')) + ',',
    '  rappels: ' + liste(s.rappels.map((b) => '{ rang: ' + b.rang + ', titre: ' + gabarit(b.titre) + ', texte: ' + gabarit(b.texte) + ' }')) + ',',
    '};',
    '',
  ].join('\n');
}

// Le run d'une facade par Claude, cote page (MD/spec-facade-calage-audit.md §8, lots F2 et F3) : trois passes par facade, votees par
// le moteur (`facades.ia.passes`, decision du 29 octobre 2026 ; une, pour mesurer), par la route immediate du serveur (usage
// `facade` : son prompt, son schema et son modele sont au serveur). L'escalade, a la demande de la personne, en ajoute UNE, au modele
// de l'usage `escalade` (le meme prompt, le meme schema, la meme image), enregistree avec le run. Ce qui revient est ENREGISTRE avec les versions du prompt et du schema, le modele, les tokens
// et le cout (facade/detection/runFacade.ts::RunEnregistre) : la calibration le rejoue ensuite sans reseau ni cout.
//
// Deux appelants : « Rappeler Claude » de la calibration (sur l'assemblage du cas), et l'audit de la parcelle, qui envoie le meme
// contenu dans son batch et enregistre la reponse de la meme facon (app/audit/parcelle/runsFacades.ts, lot F3). L'aide de Claude au
// releve est partie avec la capture du releve (lot F6) : les photos d'une facade se prennent dans l'audit, et c'est son run qui les lit.
// Les photos ne partent qu'avec l'accord de la personne (decision D2), le meme par projet que l'analyse de l'audit (io/accordAnalyse.ts).

import { EchecAnalyse, type BlocAnalyse, type ClientAnalyse, type MotifAnalyse, type RequeteAnalyse, type ResultatsImmediats } from '../../io/analyseClaude.js';
import { lireLectureEnrichie, lireObservationsFacade, type LectureEnrichieEnregistree, type ObservationsFacade, type RunEnregistre } from '../../regles/facades/observations.js';
import { observationsDuRun } from '../../facade/regles/facades/ia.js';
import type { EscaladeEnregistree } from '../../regles/facades/observations.js';
import { VERSION_CHAINE_FACADES } from '../../facade/releve/chaine.js';
import type { ImageAnalyse } from '../../render/imagesAnalyse.js';
import type { Image } from '../../facade/vision/homographie.js';

const MESSAGES: Record<MotifAnalyse, string> = {
  reseau: 'Le serveur de l’analyse ne répond pas : réessayez plus tard, ou placez les coins et les ouvertures au doigt.',
  refuse: 'L’aide de Claude n’est pas ouverte à ce compte.',
  plafond: 'Le plafond de l’analyse est atteint pour aujourd’hui ou ce mois-ci.',
  nonConfigure: 'L’aide de Claude n’est pas configurée sur ce serveur.',
  pasPret: 'Claude n’a pas encore répondu.',
  introuvable: 'Le serveur ne retrouve pas cette demande.',
  serveur: 'Le serveur de l’analyse a répondu de travers.',
};

/**
 * Le contenu d'une requete du run : l'image, puis le texte. Les trois passes d'un appel x3 recoivent exactement ce contenu ; l'audit
 * envoie le meme dans son batch (app/audit/parcelle/runsFacades.ts).
 */
export function contenuRunFacade(image: Pick<ImageAnalyse, 'base64' | 'mediaType'>, texte: string): BlocAnalyse[] {
  return [{ type: 'image', source: { type: 'base64', media_type: image.mediaType, data: image.base64 } }, { type: 'text', text: texte }];
}

/**
 * Les requetes d'un appel : `prefixe-p1` (x1), jusqu'a `prefixe-p3` (x3) ; la facade compte sur la premiere du run. La lecture enrichie
 * (lot L1, usage `facade-enrichie`) envoie le meme contenu, et ne compte pas la facade une seconde fois.
 */
function requetesRunFacade(prefixe: string, contenu: BlocAnalyse[], passes: 1 | 2 | 3, usage: 'facade' | 'facade-enrichie' = 'facade'): RequeteAnalyse[] {
  return Array.from({ length: passes }, (_, i) => ({ id: prefixe + '-p' + (i + 1), passe: (i + 1) as 1 | 2 | 3, usage, facades: i === 0 && usage === 'facade' ? 1 : 0, contenu }));
}

/**
 * La lecture enrichie enregistree (lot L1) : ses passes lisibles, ses versions, son modele, son cout ; `erreur` quand aucune ne s'est
 * lue (le run reste entier, et la facade est proposee sans ses champs). Le meme pour un appel immediat et pour un batch.
 */
export function enrichieDesResultats(lu: Pick<ResultatsImmediats, 'modele' | 'prompt' | 'schema' | 'resultats'>, passes: 1 | 2 | 3, le: Date): LectureEnrichieEnregistree {
  const sorties = lu.resultats.filter((r) => r.statut === 'reussi' && lireLectureEnrichie(r.sortie)).sort((a, b) => (a.passe ?? 0) - (b.passe ?? 0)).map((r) => r.sortie);
  const couts = lu.resultats.map((r) => r.cout);
  const t = (k: 'entree' | 'ecritureCache' | 'lectureCache' | 'sortie') => lu.resultats.reduce((s, r) => s + (r.tokens?.[k] ?? 0), 0);
  const r0 = lu.resultats[0];
  const raison = lu.resultats.find((r) => r.erreur)?.erreur?.message;
  return {
    le: le.toISOString(), modele: r0?.modele ?? lu.modele, prompt: r0?.prompt ?? lu.prompt, schema: r0?.schema ?? lu.schema, passes, sorties,
    cout: couts.length && couts.every((c) => typeof c === 'number') ? Math.round(couts.reduce((s: number, c) => s + (c as number), 0) * 1e6) / 1e6 : null,
    tokens: { entree: t('entree') + t('ecritureCache') + t('lectureCache'), sortie: t('sortie') },
    ...(sorties.length ? {} : { erreur: 'La lecture des détails (menuiseries, modénature…) n’a rendu aucune réponse lisible' + (raison ? ' (' + raison + ')' : '') + '.' }),
  };
}

/** La lecture enrichie d'un appel immediat : jamais une exception (son echec laisse le run entier), ce qui l'a empechee sinon. */
async function lireEnrichieImmediate(client: ClientAnalyse, demande: { projet: string | null; idu: string | null; adresse: string | null; audit: string }, contenu: BlocAnalyse[], passes: 1 | 2 | 3, le: Date): Promise<LectureEnrichieEnregistree> {
  try {
    return enrichieDesResultats(await client.immediat({ ...demande, usage: 'facade-enrichie', requetes: requetesRunFacade('enrichie', contenu, passes, 'facade-enrichie') }), passes, le);
  } catch (e) {
    const motif = e instanceof EchecAnalyse ? MESSAGES[e.motif] : String((e as Error).message || e);
    return { le: le.toISOString(), modele: '', prompt: 0, schema: 0, passes, sorties: [], cout: null, tokens: { entree: 0, sortie: 0 }, erreur: 'La lecture des détails n’a pas pu partir : ' + motif };
  }
}

/**
 * L'appel enregistre : les sorties des passes reussies, le cout et les tokens de toutes, les versions et le modele que le serveur a
 * servis ; null quand aucune passe n'a rendu une reponse lisible. Le meme pour un appel immediat et pour les requetes d'une facade
 * dans le batch de l'audit (leurs seuls resultats).
 */
export function runDesResultats(lu: Pick<ResultatsImmediats, 'modele' | 'prompt' | 'schema' | 'resultats'>, passes: 1 | 2 | 3, image: { largeur: number; hauteur: number }, le: Date): RunEnregistre | null {
  // L'image que Claude a vue, par l'empreinte que le serveur en garde (lot L0) : les passes recoivent le meme contenu.
  const vue = lu.resultats.find((r) => r.empreintes?.length)?.empreintes?.[0];
  const sorties = lu.resultats.filter((r) => r.statut === 'reussi' && lireObservationsFacade(r.sortie)).sort((a, b) => (a.passe ?? 0) - (b.passe ?? 0)).map((r) => r.sortie);
  if (!sorties.length) return null;
  const couts = lu.resultats.map((r) => r.cout);
  const t = (k: 'entree' | 'ecritureCache' | 'lectureCache' | 'sortie') => lu.resultats.reduce((s, r) => s + (r.tokens?.[k] ?? 0), 0);
  return {
    le: le.toISOString(), modele: lu.modele, prompt: lu.prompt, schema: lu.schema, passes, sorties,
    cout: couts.every((c) => typeof c === 'number') ? Math.round(couts.reduce((s: number, c) => s + (c as number), 0) * 1e6) / 1e6 : null,
    tokens: { entree: t('entree') + t('ecritureCache') + t('lectureCache'), sortie: t('sortie') }, image: { largeur: image.largeur, hauteur: image.hauteur, ...(vue ? { sha256: vue.sha256, octets: vue.octets } : {}) }, chaine: VERSION_CHAINE_FACADES,
  };
}

/** Ce que demande un appel : l'image prise pour la suite (et ce qu'elle ne montre pas), le texte, une ou trois passes. */
interface DemandeRun {
  image: Image;
  /** Les pixels que rien ne montre (1) : peints en gris sur l'image envoyee. */
  cache?: Uint8Array | null;
  texte: string;
  passes: 1 | 2 | 3;
}

/** L'appel, son enregistrement et sa reponse lue ; ou ce qui l'a empeche, en clair. */
export type ResultatRun = { run: RunEnregistre; reponse: ObservationsFacade } | { erreur: string };

export interface ContexteRun {
  client: () => ClientAnalyse | null;
  identite: () => { projet: string | null; idu: string | null; adresse: string | null };
  /** L'image envoyee : le navigateur la reduit et l'encode (render/imageFacade.ts), un simulacre dans les tests. */
  encoder: (img: Image, cache: Uint8Array | null) => Pick<ImageAnalyse, 'base64' | 'mediaType'> | null;
  maintenant: () => Date;
}

/** Appelle Claude sur une facade, et rend l'appel enregistre. */
export async function appelerRunFacade(ctx: ContexteRun, d: DemandeRun, origine: 'calibration'): Promise<ResultatRun> {
  const client = ctx.client();
  if (!client) return { erreur: MESSAGES.refuse };
  const image = ctx.encoder(d.image, d.cache ?? null);
  if (!image) return { erreur: 'L’image n’a pas pu être préparée pour Claude.' };
  const le = ctx.maintenant();
  const audit = (origine + '-' + le.toISOString().replace(/[^0-9]/g, '').slice(0, 14)).slice(0, 64);
  try {
    const lu = await client.immediat({ ...ctx.identite(), audit, usage: 'facade', requetes: requetesRunFacade('facade', contenuRunFacade(image, d.texte), d.passes) });
    const run = runDesResultats(lu, d.passes, d.image, le);
    const reponse = run ? observationsDuRun(run) : null;
    if (!run || !reponse) {
      const raison = lu.resultats.find((r) => r.erreur)?.erreur?.message;
      return { erreur: 'Claude n’a rendu aucune réponse lisible' + (raison ? ' (' + raison + ')' : '') + '.' };
    }
    return { run, reponse };
  } catch (e) {
    return { erreur: e instanceof EchecAnalyse ? MESSAGES[e.motif] : 'La demande n’a pas pu partir : ' + String((e as Error).message || e) };
  }
}

/**
 * Le contexte d'un appel dont l'image ne s'encode qu'une fois : les deux requetes d'une facade (le run et la lecture enrichie, decision du
 * proprietaire du 30 octobre 2026) envoient alors les memes octets, que le serveur garde une fois (lot L0).
 */
export function encodageUnique(ctx: ContexteRun): ContexteRun {
  const vus = new Map<Image, ReturnType<ContexteRun['encoder']>>();
  return { ...ctx, encoder: (img, cache) => { if (!vus.has(img)) vus.set(img, ctx.encoder(img, cache)); return vus.get(img) ?? null; } };
}

/**
 * La lecture enrichie d'une facade (lot L1), la seconde requete sur l'image et le texte du run : jamais une exception, son echec est
 * enregistre (`erreur`) ; null quand rien ne part (ni client, ni image), comme le run.
 */
export async function appelerLectureEnrichie(ctx: ContexteRun, d: DemandeRun, origine: 'calibration'): Promise<LectureEnrichieEnregistree | null> {
  const client = ctx.client();
  const image = client ? ctx.encoder(d.image, d.cache ?? null) : null;
  if (!client || !image) return null;
  const le = ctx.maintenant();
  const audit = (origine + '-' + le.toISOString().replace(/[^0-9]/g, '').slice(0, 14)).slice(0, 64);
  return lireEnrichieImmediate(client, { ...ctx.identite(), audit }, contenuRunFacade(image, d.texte), d.passes, le);
}

/**
 * Le run et sa lecture enrichie ensemble : la lecture enrichie se garde avec le run et se pose sur ce qu'il lit, sans rien lui faire
 * perdre (son echec la laisse sans champs, avec sa raison).
 */
export function avecSaLectureEnrichie(r: ResultatRun, enrichie: LectureEnrichieEnregistree | null): ResultatRun {
  if ('erreur' in r || !enrichie) return r;
  const run = { ...r.run, enrichie };
  return { run, reponse: observationsDuRun(run) ?? r.reponse };
}

/** L'escalade lue d'un appel : sa requete reussie et lisible, ses versions, son modele, son cout ; null sinon. */
function escaladeDesResultats(lu: Pick<ResultatsImmediats, 'modele' | 'prompt' | 'schema' | 'resultats'>, le: Date): EscaladeEnregistree | null {
  const r = lu.resultats.find((x) => x.statut === 'reussi' && lireObservationsFacade(x.sortie));
  if (!r) return null;
  const t = r.tokens;
  return {
    le: le.toISOString(), modele: r.modele ?? lu.modele, prompt: r.prompt ?? lu.prompt, schema: r.schema ?? lu.schema, sortie: r.sortie, cout: typeof r.cout === 'number' ? r.cout : null,
    tokens: { entree: (t?.entree ?? 0) + (t?.ecritureCache ?? 0) + (t?.lectureCache ?? 0), sortie: t?.sortie ?? 0 },
    ...(r.empreintes?.[0] ? { sha256: r.empreintes[0].sha256 } : {}),
  };
}

/** Les prix du modele de l'escalade, en dollars par million de tokens. */
export interface PrixEscalade { modele: string; prix: { entree: number; sortie: number } | null }

/**
 * Ce que l'escalade d'un run coutera, a peu pres : les tokens d'une de ses passes, aux prix du modele de l'escalade (un appel immediat,
 * sans remise) ; null sans prix. C'est une annonce sur le bouton, pas un compte : le serveur journalise le vrai cout.
 */
function coutEstimeEscalade(run: Pick<RunEnregistre, 'tokens' | 'passes'>, p: PrixEscalade | null): number | null {
  if (!p?.prix) return null;
  const n = Math.max(1, run.passes);
  return Math.round(((run.tokens.entree / n) * p.prix.entree + (run.tokens.sortie / n) * p.prix.sortie) / 1e6 * 1e5) / 1e5;
}

/** Le libelle du bouton de l'escalade : le cout annonce, ou ce qui l'empeche. */
export function libelleEscalade(run: Pick<RunEnregistre, 'tokens' | 'passes' | 'escalade'> | null, p: PrixEscalade | null): string {
  if (run?.escalade) return 'Escaladée (' + run.escalade.modele + ')';
  const c = run ? coutEstimeEscalade(run, p) : null;
  return 'Escalader' + (p ? ' vers ' + p.modele : '') + (c === null ? '' : ' (≈ ' + c.toFixed(4).replace('.', ',') + ' $)');
}

/**
 * L'escalade d'un run, a la demande de la personne : UNE requete, sur la meme image et le meme texte, au modele de l'usage `escalade`
 * (la demande porte cet usage ; la requete garde l'usage `facade`, son prompt, son schema et sa sortie structuree, au serveur). Rend le
 * run avec son escalade, ou ce qui l'a empechee. Jamais deux : un run deja escalade est rendu tel quel.
 */
export async function appelerEscaladeFacade(ctx: ContexteRun, d: Omit<DemandeRun, 'passes'>, run: RunEnregistre, origine: 'audit' | 'calibration'): Promise<{ run: RunEnregistre } | { erreur: string }> {
  if (run.escalade) return { run };
  const client = ctx.client();
  if (!client) return { erreur: MESSAGES.refuse };
  const image = ctx.encoder(d.image, d.cache ?? null);
  if (!image) return { erreur: 'L’image n’a pas pu être préparée pour Claude.' };
  return envoyerEscalade(client, ctx.identite(), origine, contenuRunFacade(image, d.texte), run, ctx.maintenant());
}

/** L'escalade, son contenu deja prepare (l'audit envoie celui de son batch : l'elevation de la facade, son texte). */
export async function envoyerEscalade(client: ClientAnalyse, identite: { projet: string | null; idu: string | null; adresse: string | null; depot?: string | null }, origine: 'audit' | 'calibration', contenu: BlocAnalyse[], run: RunEnregistre, le: Date): Promise<{ run: RunEnregistre } | { erreur: string }> {
  if (run.escalade) return { run };
  const audit = (origine + '-esc-' + le.toISOString().replace(/[^0-9]/g, '').slice(0, 14)).slice(0, 64);
  try {
    const requete: RequeteAnalyse = { id: 'escalade-p1', passe: 1, usage: 'facade', facades: 0, contenu };
    // Le `depot` de l'audit, quand il en a un : l'escalade se garde a cote des passes, la meme image une seule fois (lot L0).
    const lu = await client.immediat({ ...identite, audit, usage: 'escalade', requetes: [requete] });
    const escalade = escaladeDesResultats(lu, le);
    if (!escalade) {
      const raison = lu.resultats.find((r) => r.erreur)?.erreur?.message;
      return { erreur: 'L’escalade n’a rendu aucune réponse lisible' + (raison ? ' (' + raison + ')' : '') + '.' };
    }
    return { run: { ...run, escalade } };
  } catch (e) {
    return { erreur: e instanceof EchecAnalyse ? MESSAGES[e.motif] : 'La demande n’a pas pu partir : ' + String((e as Error).message || e) };
  }
}

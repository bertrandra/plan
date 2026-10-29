// Le run d'une facade par Claude, cote page (MD/spec-facade-calage-audit.md §8, lot F2) : une requete par facade (x1), ou ses trois
// passes (x3, l'option du rejeu de la calibration, pour mesurer), par la route immediate du serveur (usage `facade` : son prompt, son
// schema et son modele sont au serveur). Ce qui revient est ENREGISTRE avec les versions du prompt et du schema, le modele, les tokens
// et le cout (facade/detection/runFacade.ts::RunEnregistre) : la calibration le rejoue ensuite sans reseau ni cout.
//
// Trois appelants : « Rappeler Claude » de la calibration (sur l'assemblage du cas), l'aide du releve (sur la photo a l'etape des
// coins, sur l'elevation redressee a la verification), et l'audit de la parcelle, qui envoie le meme contenu dans son batch et
// enregistre la reponse de la meme facon (app/audit/parcelle/runsFacades.ts, lot F3). Plus personne ne fait trois passes de renfort.
// Les photos ne partent qu'avec l'accord de la personne (decision D2), le meme par projet que l'analyse de l'audit (io/accordAnalyse.ts).

import { EchecAnalyse, type BlocAnalyse, type ClientAnalyse, type MotifAnalyse, type RequeteAnalyse, type ResultatsImmediats } from '../../io/analyseClaude.js';
import { lireObservationsFacade, type ObservationsFacade, type RunEnregistre } from '../../regles/facades/observations.js';
import { observationsDuRun } from '../../facade/regles/facades/ia.js';
import { VERSION_CHAINE_FACADES } from '../../facade/releve/chaine.js';
import { dessinerImageFacade } from '../../render/imageFacade.js';
import type { ImageAnalyse } from '../../render/imagesAnalyse.js';
import type { AnalyseDuNavigateur } from '../audit/parcelle/analyseNavigateur.js';
import type { Image } from '../../facade/vision/homographie.js';
import type { AccordAnalyse } from '../../model/auditParcelle.js';

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

/** Les requetes d'un appel : `prefixe-p1` (x1), jusqu'a `prefixe-p3` (x3) ; la facade compte sur la premiere. */
function requetesRunFacade(prefixe: string, contenu: BlocAnalyse[], passes: 1 | 3): RequeteAnalyse[] {
  return Array.from({ length: passes }, (_, i) => ({ id: prefixe + '-p' + (i + 1), passe: (i + 1) as 1 | 2 | 3, usage: 'facade' as const, facades: i === 0 ? 1 : 0, contenu }));
}

/**
 * L'appel enregistre : les sorties des passes reussies, le cout et les tokens de toutes, les versions et le modele que le serveur a
 * servis ; null quand aucune passe n'a rendu une reponse lisible. Le meme pour un appel immediat et pour les requetes d'une facade
 * dans le batch de l'audit (leurs seuls resultats).
 */
export function runDesResultats(lu: Pick<ResultatsImmediats, 'modele' | 'prompt' | 'schema' | 'resultats'>, passes: 1 | 3, image: { largeur: number; hauteur: number }, le: Date): RunEnregistre | null {
  const sorties = lu.resultats.filter((r) => r.statut === 'reussi' && lireObservationsFacade(r.sortie)).sort((a, b) => (a.passe ?? 0) - (b.passe ?? 0)).map((r) => r.sortie);
  if (!sorties.length) return null;
  const couts = lu.resultats.map((r) => r.cout);
  const t = (k: 'entree' | 'ecritureCache' | 'lectureCache' | 'sortie') => lu.resultats.reduce((s, r) => s + (r.tokens?.[k] ?? 0), 0);
  return {
    le: le.toISOString(), modele: lu.modele, prompt: lu.prompt, schema: lu.schema, passes, sorties,
    cout: couts.every((c) => typeof c === 'number') ? Math.round(couts.reduce((s: number, c) => s + (c as number), 0) * 1e6) / 1e6 : null,
    tokens: { entree: t('entree') + t('ecritureCache') + t('lectureCache'), sortie: t('sortie') }, image: { largeur: image.largeur, hauteur: image.hauteur }, chaine: VERSION_CHAINE_FACADES,
  };
}

/** Ce que demande un appel : l'image prise pour la suite (et ce qu'elle ne montre pas), le texte, une ou trois passes. */
interface DemandeRun {
  image: Image;
  /** Les pixels que rien ne montre (1) : peints en gris sur l'image envoyee. */
  cache?: Uint8Array | null;
  texte: string;
  passes: 1 | 3;
}

/** L'appel, son enregistrement et sa reponse lue ; ou ce qui l'a empeche, en clair. */
export type ResultatRun = { run: RunEnregistre; reponse: ObservationsFacade } | { erreur: string };

interface ContexteRun {
  client: () => ClientAnalyse | null;
  identite: () => { projet: string | null; idu: string | null; adresse: string | null };
  /** L'image envoyee : le navigateur la reduit et l'encode (render/imageFacade.ts), un simulacre dans les tests. */
  encoder: (img: Image, cache: Uint8Array | null) => Pick<ImageAnalyse, 'base64' | 'mediaType'> | null;
  maintenant: () => Date;
}

/** Appelle Claude sur une facade, et rend l'appel enregistre. */
export async function appelerRunFacade(ctx: ContexteRun, d: DemandeRun, origine: 'releve' | 'calibration'): Promise<ResultatRun> {
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

/** L'aide de Claude au releve : le run d'une facade, propose sur signal, apres l'accord de la personne pour ce projet. */
export interface AideClaudeReleve {
  /** Le serveur de l'analyse est-il joignable pour cette personne (plateforme ou administrateur) ? */
  disponible(): boolean;
  /** L'accord d'envoyer les photos est-il donne pour ce projet ? */
  accordDonne(): boolean;
  /** Donne l'accord pour ce projet (le geste de la personne). */
  accorder(): void;
  demander(d: Omit<DemandeRun, 'passes'>): Promise<ResultatRun>;
}

function creerAideReleve(ctx: ContexteRun & { memoire: { lire(): AccordAnalyse | null; ecrire(a: AccordAnalyse | null): void } }): AideClaudeReleve {
  return {
    disponible: () => !!ctx.client(),
    accordDonne: () => !!ctx.memoire.lire(),
    accorder() { ctx.memoire.ecrire({ t: ctx.maintenant().toISOString(), partage: true }); },
    demander: (d) => appelerRunFacade(ctx, { ...d, passes: 1 }, 'releve'),
  };
}

/** L'aide du releve dans le navigateur : le client, l'identite et l'accord de l'analyse de l'audit, l'image encodee par le canevas. */
export function aideReleveDuNavigateur(a: Pick<AnalyseDuNavigateur, 'client' | 'identite' | 'memoire'>, encoder: ContexteRun['encoder'] = dessinerImageFacade): AideClaudeReleve {
  return creerAideReleve({ client: () => a.client, identite: () => a.identite(), memoire: a.memoire, encoder, maintenant: () => new Date() });
}

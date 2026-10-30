// L'analyse par Claude, cote client (MD/spec-audit.md §13.2, lot L17) : l'accord de l'utilisateur
// (decision D2 : une fois par projet, rappele au lancement, revocable), les entrees preparees
// (app/audit/parcelle/entreesAnalyse.ts), l'envoi en trois passes par les routes du serveur
// (io/analyseClaude.ts), le suivi du batch, la lecture des resultats et la notification quand les
// propositions sont pretes. Les propositions elles-memes : propositionsClaude.ts.
//
// Tout ce qui compte vit dans la capture (`analyse`), donc dans le brouillon de l'appareil : un
// rechargement retrouve l'accord, le batch en cours et ses resultats, et reprend le suivi. Sans
// accord, sans reseau, ou hors plateforme, seules les mesures deviennent des propositions : l'audit
// marche, avec moins de details.
//
// Le navigateur ne compte rien et ne choisit rien : prompt, schema, modele et plafonds sont au
// serveur ; ici on prepare les images, on envoie, on attend, on lit.

import type { ImageDuRun } from '../../../facade/releve/imageDuRun.js';
import { EchecAnalyse, type ClientAnalyse, type DemandeAnalyse, type ResultatBatch } from '../../../io/analyseClaude.js';
import { signatureAnalyse, type AccordAnalyse, type AccordFacadeCapture, type AnalyseCapture, type BatchAnalyse, type ResultatsAnalyse } from '../../../model/auditParcelle.js';
import { murDeLaTexture, rangerRuns, type ImageRunFacade } from './runsFacades.js';
import { preparerJardin, runJardinDesResultats, type FabriqueImagesJardin } from './jardinClaude.js';
import type { RunJardin } from '../../../regles/jardin/observations.js';
import { dessinerImageFacade } from '../../../render/imageFacade.js';
import type { Image } from '../../../facade/vision/homographie.js';
import { chargerPixels } from '../../../render/couleurMurPhoto.js';
import type { ReleveFacade } from '../../../model/types.js';
import type { RunEnregistre } from '../../../regles/facades/observations.js';
import { estReponseAnalyse } from '../../../model/analyseClaude.js';
import { CHAMPS_SIMPLES } from '../../regles/sujets/vote.js';
import { ortho } from '../../../render/ortho.js';
import { dessinerCarteHauteurs, dessinerOrthoRecadree, reduirePhotoAnalyse } from '../../../render/imagesAnalyse.js';
import { rendreDepuisPrise } from '../../../three/renduPrise.js';
import { epurerLeTemps } from '../../../three/scene.js';
import { jourDe } from '../reprise.js';
import { preparerDemande, type FabriqueImages, type IdentiteAnalyse } from './entreesAnalyse.js';
import { escaladerLeBatch } from './escalade.js';
import { escaladerUneFacade } from './escaladeFacade.js';
import type { PrixEscalade } from '../../releve/runFacade.js';
import type { ReponsesBatiment } from './propositionsClaude.js';
import type { EntreesPropositions } from './propositions.js';
import type { CaptureEnCours } from './capture.js';

/** Le batch rend en general en quelques minutes : on le relit toutes les vingt secondes. */
export const DELAI_SUIVI_MS = 20000;

export type EtatAnalyse =
  /** Hors plateforme et hors admin, ou le serveur n'a pas l'analyse : la question ne se pose pas. */
  | 'indisponible'
  /** La capture est terminee, l'accord n'a pas ete demande ou a ete retire : la question est posee. */
  | 'sansAccord'
  /** « Seulement les mesures » a ete choisi pour cette capture. */
  | 'refusee'
  | 'preparation'
  | 'enCours'
  | 'prete'
  /** Des photos ont change depuis l'envoi : l'analyse se relance a la demande. */
  | 'aRelancer'
  | 'erreur'
  /** La capture n'est pas terminee : rien a analyser encore. */
  | 'attente';

export interface ContexteAnalyse {
  capture: CaptureEnCours;
  /** Les entrees des propositions, mesures comprises : le plan, la liste, la capture. */
  entrees: () => EntreesPropositions;
  /** Les mesures du telephone doivent etre faites avant l'envoi : elles sont des indices pour Claude. */
  mesuresPretes: () => Promise<void>;
  /** Null hors plateforme et hors admin : l'analyse est alors indisponible. */
  client: ClientAnalyse | null;
  images: FabriqueImages;
  identite: () => IdentiteAnalyse;
  signaler: (message: string) => void;
  /** Une notification hors de la page (l'onglet est en arriere-plan) ; facultative. */
  notifier?: (message: string) => void;
  /** Au moment de l'accord (un geste de la personne) : demander le droit de notifier, s'il ne l'est pas. */
  preparerNotification?: () => void;
  /**
   * L'accord garde pour ce projet (io/accordAnalyse.ts) : donne une fois, il vaut pour les audits
   * suivants du meme projet, et se retire de la meme facon. Absent : l'accord vit dans la capture seule.
   */
  memoire?: { lire(): AccordAnalyse | null; ecrire(a: AccordAnalyse | null): void };
  maintenant: () => Date;
  /**
   * Le run de chaque facade (lot F3) : ce que le moteur de regles decide de sa reponse, l'accord de ses boites avec la detection de
   * la facade mesuree. Absent, les runs sont gardes sans etre accordes.
   */
  accorder?: (runs: Record<string, RunEnregistre>) => Promise<Record<string, AccordFacadeCapture>>;
  delaiSuiviMs?: number;
  /**
   * La lecture du jardin (lot L3) : qui dessine l'orthophoto de la parcelle et reduit les photos de la cloture. Absente, le batch ne
   * porte pas de requete du jardin (les tests de l'analyse des maisons).
   */
  jardin?: FabriqueImagesJardin;
  /**
   * L'essai du brouillon des regles est-il demande (`?regles=local`, administrateur) ? L'analyse part alors
   * avec le prompt du brouillon enregistre au serveur, s'il y en a un ; sinon avec celui du depot, et on le dit.
   */
  essai?: () => boolean;
  /** Pour les tests : qui planifie la relecture. */
  planifier?: (f: () => void, ms: number) => () => void;
}

export interface AnalyseClaude {
  etat(): EtatAnalyse;
  /**
   * Une phrase pour l'ecran : ce qui se passe, ou pourquoi rien ne se passe. Avec les comptes de
   * l'ecran des propositions, « prêtes » dit combien de propositions et d'observations Claude a rendues.
   */
  detail(comptes?: ComptesClaude): string | null;
  accord(): AccordAnalyse | null;
  /** L'accord est donne (et la case « partager » notee) : l'analyse part. */
  accorder(partage: boolean): Promise<void>;
  /** « Seulement les mesures » : la question n'est plus posee pour cette capture. */
  refuser(): void;
  /** L'accord est retire : plus rien ne part, et les propositions de Claude disparaissent. */
  retirerAccord(): void;
  /** Envoie si l'accord est la et que rien n'a ete envoye pour ces photos ; sinon reprend le suivi. */
  lancer(): Promise<void>;
  /** A la reprise d'un brouillon : le suivi d'un batch en cours repart. */
  reprendre(): void;
  arreter(): void;
  /** Les reponses lues, par batiment, avec les etiquettes de ses images ; null sans resultat ou sans accord. */
  reponses(): Record<string, ReponsesBatiment> | null;
  /** L'accord du run de chaque facade avec sa detection (`cle#cote`) ; null sans resultat ou sans accord de la personne. */
  accords(): Record<string, AccordFacadeCapture> | null;
  /** Le run de Claude de chaque facade (`cle#cote`), escalade comprise ; null sans resultat ou sans accord de la personne. */
  runs(): Record<string, RunEnregistre> | null;
  /** La lecture du jardin enregistree (lot L3) ; null sans resultat ou sans accord de la personne. */
  jardin(): RunJardin | null;
  /** L'escalade d'une facade, a la demande de la personne : une requete ; rend la phrase a lui dire. */
  escaladerFacade(k: string): Promise<string>;
  /** Le modele de l'escalade et ses prix, pour annoncer son cout ; null tant qu'ils ne sont pas connus. */
  prixEscalade(): PrixEscalade | null;
  /** Change a chaque resultat ou retrait : les propositions se recalculent. */
  version(): number;
  abonner(f: () => void): () => void;
}

const MESSAGES: Record<EchecAnalyse['motif'], string> = {
  reseau: 'Le serveur de l’analyse ne répond pas : seules les mesures sont proposées. L’envoi reprendra quand vous relancerez l’analyse.',
  refuse: 'L’analyse par Claude n’est pas ouverte à ce compte : seules les mesures sont proposées.',
  plafond: 'Le plafond de l’analyse est atteint pour aujourd’hui ou ce mois-ci : seules les mesures sont proposées.',
  nonConfigure: 'L’analyse par Claude n’est pas configurée sur ce serveur : seules les mesures sont proposées.',
  pasPret: 'L’analyse n’est pas terminée.',
  introuvable: 'Le serveur ne retrouve plus cette analyse : relancez-la.',
  serveur: 'Le serveur de l’analyse a répondu de travers : seules les mesures sont proposées.',
};

/**
 * Le rendu du modele n'a pas pu etre joint (la Vue 3D fermee, ou le dessin a echoue) : l'analyse part
 * quand meme, Claude est prevenu dans la requete qu'il n'a pas de rendu a comparer.
 */
const messageSansRendu = (noms: readonly string[]): string =>
  'Le rendu du modèle n’a pas pu être joint pour ' + noms.join(', ') + ' : l’analyse part sans lui (ouvrez la Vue 3D avant de la lancer pour qu’elle compare les photos au modèle).';

/** Les images du navigateur : les photos reduites, la Vue 3D hors ecran, les tuiles du fond, la grille LiDAR. */
export function fabriqueImagesNavigateur(): FabriqueImages {
  return {
    photo: (p) => reduirePhotoAnalyse(p.base64),
    rendu: (prise, cible, gardes) => {
      if (prise.azimutDeg === null) return null;
      const dessiner = () => rendreDepuisPrise({ x: prise.x, y: prise.y, azimutDeg: prise.azimutDeg as number, inclinaisonDeg: prise.inclinaisonDeg ?? null, champDeg: prise.champDeg ?? null }, cible ?? null);
      // Epure le temps de l'image : la cloture du premier plan cachait le pied du mur.
      return gardes ? epurerLeTemps(gardes, dessiner) : dessiner();
    },
    ortho: (contour) => dessinerOrthoRecadree([...ortho.tuiles, ...ortho.tuilesLarges], contour),
    carte: (o, contour) => (o.batiment?.toitMesure ? dessinerCarteHauteurs(o.batiment?.toitMesure, contour) : null),
    facade: { elevation: elevationRunNavigateur },
  };
}

/** Les pixels d'une image `data:` (la texture d'un releve), lus par le canevas du navigateur. */
export async function decoderImageNavigateur(url: string): Promise<Image | null> {
  const p = await chargerPixels(url);
  return p ? { largeur: p.largeur, hauteur: p.hauteur, donnees: p.data instanceof Uint8ClampedArray ? p.data : new Uint8ClampedArray(Array.from(p.data)) } : null;
}

/**
 * L'image d'une facade pour son run : la photo du releve redressee jusqu'au haut de la facade, quand la mesure l'a faite (lot F7) ;
 * sinon le mur seul, decoupe dans la texture de son releve mesure (lot F3). Reduite sous 1 024 px, en JPEG.
 */
async function elevationRunNavigateur(r: ReleveFacade, imageRun: ImageDuRun | null): Promise<ImageRunFacade | null> {
  const avecBande = imageRun ? await decoderImageNavigateur(imageRun.image).catch(() => null) : null;
  if (imageRun && avecBande) {
    const image = dessinerImageFacade(avecBande);
    return image ? { image, largeur: avecBande.largeur, hauteur: avecBande.hauteur, egoutPart: imageRun.egoutPart } : null;
  }
  const texture = r.texture ? await decoderImageNavigateur(r.texture).catch(() => null) : null;
  if (!texture) return null;
  const mur = murDeLaTexture(texture, r);
  const image = dessinerImageFacade(mur);
  return image ? { image, largeur: mur.largeur, hauteur: mur.hauteur } : null;
}

/** L'identifiant de l'audit pour le journal (`[A-Za-z0-9_-]`, 64 au plus) : la capture et l'heure de son debut. */
export function idAuditAnalyse(c: { id: string; debut: string }): string {
  return (c.id + '-' + c.debut.replace(/[^0-9]/g, '').slice(0, 12)).replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 64);
}

/** Les reponses d'un batch, rangees par batiment : les passes reussies, dans l'ordre des passes. Une requete d'un autre usage (le run d'une
 * facade, la lecture du jardin) n'est pas une maison. */
export function rangerResultats(resultats: readonly ResultatBatch[], requetes: BatchAnalyse['requetes']): Record<string, unknown[]> {
  const out: Record<string, { passe: number; sortie: unknown }[]> = {};
  for (const r of resultats) {
    const q = requetes[r.id];
    if (!q || q.usage || r.statut !== 'reussi' || !estReponseAnalyse(r.sortie, CHAMPS_SIMPLES)) continue;
    (out[q.cle] ??= []).push({ passe: q.passe, sortie: r.sortie });
  }
  return Object.fromEntries(Object.entries(out).map(([cle, l]) => [cle, l.sort((a, b) => a.passe - b.passe).map((x) => x.sortie)]));
}

/**
 * Le message d'un echec, pour l'ecran : la phrase du motif, et ce que le serveur a dit quand il a
 * refuse la demande elle-meme (un 400 : « Trop d’images dans une requête (40 au plus). »). Sans ce
 * detail, l'essai sur le terrain n'avait lu que « répondu de travers ».
 */
export function messageEchec(e: EchecAnalyse): string {
  if (e.motif !== 'serveur') return MESSAGES[e.motif];
  const dit = e.message.replace(/^[^:]*:\s*/, '').trim();
  return 'Le serveur de l’analyse a refusé ou n’a pas compris la demande' + (dit ? ' (« ' + dit + ' »)' : '') + ' : seules les mesures sont proposées.';
}

/** Ce que l'ecran des propositions compte pour dire ce que Claude a rendu. */
export interface ComptesClaude { propositions: number; observations: number }

/** « 2 propositions et 5 observations » ; null sans comptes. */
function texteComptes(c: ComptesClaude | undefined): string | null {
  if (!c) return null;
  const p = c.propositions + ' proposition' + (c.propositions > 1 ? 's' : '');
  const o = c.observations + ' observation' + (c.observations > 1 ? 's' : '');
  return p + ' et ' + o;
}

/** Une phrase pour l'ecran, selon l'etat : ce qui se passe, ou pourquoi rien ne se passe. */
export function detailAnalyse(etat: EtatAnalyse, a: AnalyseCapture, phase: 'repos' | 'preparation' | 'envoi', erreurSuivi: string | null, comptes?: ComptesClaude): string | null {
  const batiments = Object.keys(a.resultats?.parBatiment ?? {}).length;
  switch (etat) {
    case 'indisponible': return 'L’analyse par Claude demande un compte de la plateforme : seules les mesures sont proposées.';
    case 'attente': return null;
    case 'sansAccord': return 'Claude peut regarder vos photos (façades, toit, orthophoto, relief) et proposer ce qu’il y voit : volets, cheminées, matériaux, toiture. Vos photos ne servent qu’à cette analyse. Votre accord vaut pour ce projet, et se retire à tout moment.';
    case 'refusee': return 'Analyse par Claude non demandée : seules les mesures sont proposées.';
    case 'preparation': return phase === 'envoi' ? 'Envoi de vos photos à l’analyse…' : 'Préparation des images (photos réduites, rendu du modèle, orthophoto, relief)…';
    case 'enCours': return 'Analyse par Claude en cours (envoyée le ' + jourDe(new Date(a.batch?.creeLe ?? Date.now())) + ')' + (erreurSuivi ? ' — ' + erreurSuivi : ', en général quelques minutes') + '. Vous serez prévenu quand les propositions seront prêtes.';
    case 'prete': {
      const quoi = batiments + ' bâtiment' + (batiments > 1 ? 's' : '') + ', accord du ' + jourDe(new Date(a.accord?.t ?? Date.now()));
      // « Prêtes » sur une liste vide laissait croire a une panne : on dit ce qui est arrive.
      if (comptes && !comptes.propositions && !comptes.observations) return 'Claude a répondu (' + quoi + '), mais n’a rien vu à proposer ni à signaler.';
      const n = texteComptes(comptes);
      return 'Propositions de Claude prêtes' + (n ? ' : ' + n : '') + ' (' + quoi + ').';
    }
    case 'aRelancer': return 'Les photos ont changé depuis la dernière analyse : relancez-la pour que Claude les regarde.';
    case 'erreur': return a.erreur ?? null;
  }
}

/**
 * L'accord du run des facades, facade par facade quand sa mesure est la. Les mesures ne se font qu'apres la capture (et a la reprise
 * d'un brouillon, le batch est souvent deja fini) : on les attend, puis on accorde les facades dont le releve existe et qui n'ont pas
 * encore d'accord. Un accord vide n'est jamais note : il fermerait la porte aux mesures suivantes.
 */
function accordsDifferes(ctx: ContexteAnalyse, lire: () => AnalyseCapture, noter: (a: Partial<AnalyseCapture>) => void, publier: () => void) {
  let enCours: Promise<void> | null = null;
  /** Le modele de l'escalade et ses prix (l'etat du serveur), lus une fois ; undefined : pas encore demandes. */
  let prix: PrixEscalade | null | undefined;
  /** Les facades deja tentees, avec le releve d'alors : un accord sans resultat ne se rejoue pas sur le meme releve. */
  const tentees = new Map<string, unknown>();
  const sansAccord = (r: ResultatsAnalyse): string[] => Object.keys(r.runs ?? {}).filter((k) => !r.accords?.[k]);

  function completer(): Promise<void> {
    const r0 = lire().resultats;
    if (enCours || !ctx.accorder || !r0 || !sansAccord(r0).length) return enCours ?? Promise.resolve();
    const accorder = ctx.accorder;
    // Les memes resultats, accord toujours donne : un retrait ou une relance pendant l'attente l'emporte.
    const memes = () => { const a = lire(); return a.accord && a.resultats && a.resultats.t === r0.t ? a.resultats : null; };
    enCours = (async () => {
      await ctx.mesuresPretes().catch(() => {});
      const r = memes();
      if (!r) return;
      const mesures = ctx.entrees().mesures;
      const aFaire = Object.fromEntries(sansAccord(r).flatMap((k) => {
        const releve = mesures.get(k)?.releve, run = r.runs?.[k];
        if (!releve || !run || tentees.get(k) === releve) return [];
        tentees.set(k, releve);
        return [[k, run]];
      }));
      if (!Object.keys(aFaire).length) return;
      const neuf = await accorder(aFaire).catch(() => ({}));
      const apres = memes();
      if (!apres || !Object.keys(neuf).length) return;
      noter({ resultats: { ...apres, accords: { ...(apres.accords ?? {}), ...neuf } } });
    })().finally(() => { enCours = null; });
    return enCours;
  }

  /** Le modele de l'escalade et ses prix ; demandes au serveur la premiere fois (l'ecran se redessine a leur arrivee). */
  function prixEscalade(): PrixEscalade | null {
    if (prix === undefined && ctx.client) {
      prix = null;
      void ctx.client.etat().then((e) => { prix = e.escaladeFacade ?? null; publier(); }, () => {});
    }
    return prix ?? null;
  }

  /**
   * L'escalade d'une facade, a la demande (escaladeFacade.ts) : gardee dans son run, puis l'accord de la facade est refait par le
   * moteur. Rend la phrase a dire a la personne.
   */
  async function escalader(k: string): Promise<string> {
    const r0 = lire().resultats, run = r0?.runs?.[k];
    if (!ctx.client || !ctx.images.facade || !lire().accord || !r0 || !run) return 'Claude n’a pas encore lu cette façade : il n’y a rien à escalader.';
    const x = await escaladerUneFacade({ client: ctx.client, entrees: ctx.entrees, fab: ctx.images.facade, identite: ctx.identite, maintenant: ctx.maintenant }, k, run);
    if ('erreur' in x) return x.erreur;
    const r = lire().resultats;
    if (!r || r.t !== r0.t || !lire().accord) return 'L’analyse a changé pendant l’escalade : sa réponse n’est pas gardée.';
    const accords = { ...(r.accords ?? {}) };
    delete accords[k];
    tentees.delete(k);
    noter({ resultats: { ...r, runs: { ...(r.runs ?? {}), [k]: x.run }, accords } });
    await completer();
    const e = x.run.escalade;
    return 'Escalade de la façade enregistrée (' + (e?.modele ?? '?') + (typeof e?.cout === 'number' ? ', ' + e.cout.toFixed(4).replace('.', ',') + ' $' : '') + ') : le moteur l’a pesée contre le vote des passes.';
  }

  return { completer, escalader, prixEscalade };
}

/** Les reponses lues de la capture, par batiment, avec les etiquettes de ses images et, si l'escalade a eu lieu pour lui, la reponse du modele fin. */
function reponsesDe(a: AnalyseCapture): Record<string, ReponsesBatiment> | null {
  if (!a.accord || !a.resultats || !a.batch) return null;
  const fins = a.resultats.escalade ?? {};
  return Object.fromEntries(Object.entries(a.resultats.parBatiment).map(([cle, reponses]) => [cle, { reponses, etiquettes: a.batch?.etiquettes[cle] ?? [], ...(cle in fins ? { escalade: fins[cle] } : {}) }]));
}

/** En essai du brouillon des regles, la demande le nomme ; sans brouillon au serveur, elle part telle quelle et on le dit. */
async function avecEssai(ctx: ContexteAnalyse, client: ClientAnalyse, demande: DemandeAnalyse): Promise<DemandeAnalyse> {
  if (!ctx.essai?.()) return demande;
  const etat = await client.etat().catch(() => null);
  if (!etat?.admin || !etat.brouillon) {
    ctx.signaler('Essai des règles demandé, mais le serveur n’a pas de brouillon (Admin › Règles, « Enregistrer sur le serveur ») : l’analyse part avec le prompt livré.');
    return demande;
  }
  ctx.signaler('Essai : l’analyse part avec le prompt du brouillon des règles (version ' + etat.brouillon.prompt + ', enregistré le ' + (etat.brouillon.enregistreLe ?? '?').slice(0, 16).replace('T', ' ') + ').');
  return { ...demande, essai: 'brouillon' };
}

/**
 * Ce qui part : l'analyse des maisons (preparerDemande) et, dans le meme batch, la lecture du jardin (lot L3) : une requete pour la
 * parcelle, meme sans photo d'une maison. `prepare` null : rien a envoyer.
 */
async function preparerEnvoi(ctx: ContexteAnalyse) {
  const maisons = await preparerDemande(ctx.entrees(), ctx.images, ctx.identite());
  const jardin = ctx.jardin ? await preparerJardin(ctx.entrees(), ctx.jardin).catch(() => null) : null;
  if (!maisons && !jardin) return { prepare: null, jardin: null };
  const prepare = maisons ?? { demande: { ...ctx.identite(), usage: 'analyse' as const, requetes: [] }, requetes: {}, etiquettes: {}, sansRendu: [] };
  if (jardin) {
    prepare.demande.requetes.push(jardin.requete);
    prepare.requetes[jardin.requete.id] = { cle: 'parcelle', passe: 1, usage: 'jardin' };
  }
  return { prepare, jardin };
}

export function creerAnalyseClaude(ctx: ContexteAnalyse): AnalyseClaude {
  const abonnes = new Set<() => void>();
  const publier = () => abonnes.forEach((f) => f());
  let version = 0;
  let phase: 'repos' | 'preparation' | 'envoi' = 'repos';
  let annulerSuivi: (() => void) | null = null;
  let erreurSuivi: string | null = null;
  const planifier = ctx.planifier ?? ((f, ms) => { const t = setTimeout(f, ms); return () => clearTimeout(t); });
  const lire = (): AnalyseCapture => ctx.capture.lire().analyse ?? { accord: null };
  const noter = (a: Partial<AnalyseCapture>) => { ctx.capture.noterAnalyse(a); version++; publier(); };
  const signature = () => signatureAnalyse(ctx.capture.lire());

  /**
   * L'accord deja donne pour ce projet passe dans la capture qui n'en a pas encore (et qui ne l'a
   * pas refuse) : la question ne se repose pas, et l'envoi le rappelle (decision D2).
   */
  function adopter(): void {
    const a = lire();
    if (a.accord || a.refus || !ctx.memoire) return;
    const garde = ctx.memoire.lire();
    if (garde) noter({ accord: garde });
  }

  function etat(): EtatAnalyse {
    if (!ctx.client) return 'indisponible';
    const a = lire();
    if (ctx.capture.lire().phase !== 'analyse') return 'attente';
    if (!a.accord) return a.refus ? 'refusee' : 'sansAccord';
    if (phase === 'preparation' || phase === 'envoi') return 'preparation';
    if (a.erreur) return 'erreur';
    if (!a.batch) return 'aRelancer';
    if (a.batch.signature !== signature()) return 'aRelancer';
    return a.resultats ? 'prete' : 'enCours';
  }

  const { completer: completerAccords, escalader, prixEscalade } = accordsDifferes(ctx, lire, noter, publier);

  /** Le batch est termine : ses resultats sont lus, ranges par batiment, et l'on previent ; l'accord des facades suit, mesures faites. */
  async function lireResultats(batch: BatchAnalyse): Promise<boolean> {
    const client = ctx.client as ClientAnalyse;
    const lu = await client.resultats(batch.id);
    const parBatiment = rangerResultats(lu.resultats, batch.requetes);
    const runs = rangerRuns(lu, batch.requetes, ctx.maintenant());
    const jardin = batch.jardin ? runJardinDesResultats(lu, batch.jardin, ctx.maintenant()) : null; // le jardin (lot L3) : l'image passe du batch a la lecture
    // D20 : un modele plus fin departage les passes en desaccord (appel immediat, sous les plafonds), avant les propositions.
    const esc = await escaladerLeBatch({ client, entrees: ctx.entrees, images: ctx.images, identite: ctx.identite }, parBatiment);
    if (esc.message) ctx.signaler(esc.message);
    const resultats: ResultatsAnalyse = { t: ctx.maintenant().toISOString(), modele: lu.modele, schema: lu.schema, prompt: lu.prompt, parBatiment, escalade: esc.parBatiment, ...(Object.keys(runs).length ? { runs } : {}), ...(jardin ? { jardin } : {}) };
    const n = Object.keys(parBatiment).length, s = n > 1 ? 's' : '';
    const raison = lu.resultats.find((r) => r.erreur)?.erreur?.message;
    noter({ resultats, ...(jardin ? { batch: { ...batch, jardin: null } } : {}), erreur: n || jardin ? null : 'Claude n’a rendu aucune analyse lisible' + (raison ? ' (' + raison + ')' : '') + ' : seules les mesures sont proposées.' });
    if (n || jardin) {
      const texte = 'Les propositions de Claude sont prêtes : ' + (n ? n + ' bâtiment' + s + ' analysé' + s : '') + (n && jardin ? ', et ' : '') + (jardin ? 'le jardin lu sur la photo aérienne' : '') + '.';
      ctx.signaler(texte);
      ctx.notifier?.(texte);
    }
    await completerAccords();
    return true;
  }

  /** Relit l'etat du batch jusqu'a sa fin ; une panne passagere ne l'arrete pas. */
  function suivre(): void {
    if (annulerSuivi || !ctx.client) return;
    const client = ctx.client;
    const tour = async () => {
      annulerSuivi = null;
      const a = lire();
      if (!a.accord || !a.batch || a.resultats) return;
      const batch = a.batch;
      try {
        const vue = await client.etatBatch(batch.id);
        if (vue.etat === 'ended') { await lireResultats(batch); return; }
        erreurSuivi = null;
      } catch (e) {
        if (e instanceof EchecAnalyse && (e.motif === 'introuvable' || e.motif === 'refuse' || e.motif === 'nonConfigure')) { noter({ erreur: MESSAGES[e.motif] }); return; }
        erreurSuivi = e instanceof EchecAnalyse ? MESSAGES[e.motif] : String((e as Error).message || e);
        publier();
      }
      if (lire().batch?.id === batch.id) annulerSuivi = planifier(() => { void tour(); }, ctx.delaiSuiviMs ?? DELAI_SUIVI_MS);
    };
    annulerSuivi = planifier(() => { void tour(); }, 0);
  }

  /** Prepare les entrees et envoie les trois passes ; note le batch, ou l'erreur. */
  async function envoyer(accord: AccordAnalyse): Promise<void> {
    const client = ctx.client as ClientAnalyse;
    phase = 'preparation';
    publier();
    try {
      await ctx.mesuresPretes();
      const { prepare, jardin } = await preparerEnvoi(ctx);
      if (!prepare) { noter({ erreur: 'Aucune photo à analyser : photographiez une façade ou le toit.' }); return; }
      if (prepare.sansRendu.length) ctx.signaler(messageSansRendu(prepare.sansRendu));
      phase = 'envoi';
      publier();
      const sig = signature();
      const cree = await client.creerBatch(await avecEssai(ctx, client, prepare.demande));
      const batch: BatchAnalyse = { id: cree.batch.id, creeLe: ctx.maintenant().toISOString(), signature: sig, requetes: prepare.requetes, etiquettes: prepare.etiquettes, ...(jardin ? { jardin: jardin.envoi } : {}) };
      noter({ batch, resultats: null, erreur: null });
      ctx.signaler('Vos photos sont parties à l’analyse par Claude (accord du ' + jourDe(new Date(accord.t)) + ') : les propositions arriveront dans quelques minutes. Vous pouvez retirer cet accord depuis les propositions.');
      suivre();
    } catch (e) {
      noter({ erreur: e instanceof EchecAnalyse ? messageEchec(e) : 'L’analyse n’a pas pu partir : ' + String((e as Error).message || e) });
    } finally {
      phase = 'repos';
      publier();
    }
  }

  async function lancer(): Promise<void> {
    adopter();
    const a = lire();
    if (!ctx.client || !a.accord || ctx.capture.lire().phase !== 'analyse' || phase !== 'repos') return;
    if (a.batch && a.batch.signature === signature() && !a.erreur) { if (!a.resultats) suivre(); else await completerAccords(); return; }
    await envoyer(a.accord);
  }

  const detail = (comptes?: ComptesClaude): string | null => detailAnalyse(etat(), lire(), phase, erreurSuivi, comptes);

  return {
    etat, detail,
    accord: () => lire().accord,
    async accorder(partage) {
      const accord: AccordAnalyse = { t: ctx.maintenant().toISOString(), partage };
      ctx.memoire?.ecrire(accord);
      ctx.preparerNotification?.();
      noter({ accord, refus: null, erreur: null });
      await lancer();
    },
    refuser() { noter({ accord: null, refus: ctx.maintenant().toISOString() }); },
    retirerAccord() {
      annulerSuivi?.(); annulerSuivi = null;
      ctx.memoire?.ecrire(null);
      noter({ accord: null, refus: ctx.maintenant().toISOString(), batch: null, resultats: null, erreur: null });
      ctx.signaler('Accord retiré pour ce projet : plus aucune photo ne part à l’analyse, et les propositions de Claude sont retirées.');
    },
    lancer,
    // Un brouillon repris : le suivi d'un batch en cours repart ; un batch deja lu dont les runs
    // attendaient les mesures les accorde des qu'elles sont faites.
    reprendre() { adopter(); const a = lire(); if (ctx.client && a.accord && a.batch) { if (!a.resultats) suivre(); else void completerAccords(); } },
    arreter() { annulerSuivi?.(); annulerSuivi = null; },
    reponses: () => reponsesDe(lire()),
    accords: () => { const a = lire(); return a.accord && a.resultats?.accords ? a.resultats.accords : null; },
    runs: () => { const a = lire(); return a.accord && a.resultats?.runs ? a.resultats.runs : null; },
    jardin: () => { const a = lire(); return a.accord && a.resultats?.jardin ? a.resultats.jardin : null; },
    escaladerFacade: escalader, prixEscalade,
    version: () => version,
    abonner(f) { abonnes.add(f); return () => { abonnes.delete(f); }; },
  };
}

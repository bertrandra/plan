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

import { EchecAnalyse, type ClientAnalyse, type ResultatBatch } from '../../../io/analyseClaude.js';
import { signatureAnalyse, type AccordAnalyse, type AnalyseCapture, type BatchAnalyse, type ResultatsAnalyse } from '../../../model/auditParcelle.js';
import { estReponseAnalyse } from '../../../model/analyseClaude.js';
import { ortho } from '../../../render/ortho.js';
import { dessinerCarteHauteurs, dessinerOrthoRecadree, reduirePhotoAnalyse } from '../../../render/imagesAnalyse.js';
import { rendreDepuisPrise } from '../../../three/renduPrise.js';
import { jourDe } from '../reprise.js';
import { preparerDemande, type FabriqueImages, type IdentiteAnalyse } from './entreesAnalyse.js';
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
  maintenant: () => Date;
  delaiSuiviMs?: number;
  /** Pour les tests : qui planifie la relecture. */
  planifier?: (f: () => void, ms: number) => () => void;
}

export interface AnalyseClaude {
  etat(): EtatAnalyse;
  /** Une phrase pour l'ecran : ce qui se passe, ou pourquoi rien ne se passe. */
  detail(): string | null;
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

/** Les images du navigateur : les photos reduites, la Vue 3D hors ecran, les tuiles du fond, la grille LiDAR. */
export function fabriqueImagesNavigateur(): FabriqueImages {
  return {
    photo: (p) => reduirePhotoAnalyse(p.base64),
    rendu: (prise) => (prise.azimutDeg === null ? null : rendreDepuisPrise({ x: prise.x, y: prise.y, azimutDeg: prise.azimutDeg, inclinaisonDeg: prise.inclinaisonDeg ?? null, champDeg: prise.champDeg ?? null })),
    ortho: (contour) => dessinerOrthoRecadree([...ortho.tuiles, ...ortho.tuilesLarges], contour),
    carte: (o, contour) => (o.toitMesure ? dessinerCarteHauteurs(o.toitMesure, contour) : null),
  };
}

/** Les reponses d'un batch, rangees par batiment : les passes reussies, dans l'ordre des passes. */
export function rangerResultats(resultats: readonly ResultatBatch[], requetes: BatchAnalyse['requetes']): Record<string, unknown[]> {
  const out: Record<string, { passe: number; sortie: unknown }[]> = {};
  for (const r of resultats) {
    const q = requetes[r.id];
    if (!q || r.statut !== 'reussi' || !estReponseAnalyse(r.sortie)) continue;
    (out[q.cle] ??= []).push({ passe: q.passe, sortie: r.sortie });
  }
  return Object.fromEntries(Object.entries(out).map(([cle, l]) => [cle, l.sort((a, b) => a.passe - b.passe).map((x) => x.sortie)]));
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

  /** Le batch est termine : ses resultats sont lus, ranges par batiment, et l'on previent. */
  async function lireResultats(batch: BatchAnalyse): Promise<boolean> {
    const client = ctx.client as ClientAnalyse;
    const lu = await client.resultats(batch.id);
    const parBatiment = rangerResultats(lu.resultats, batch.requetes);
    const resultats: ResultatsAnalyse = { t: ctx.maintenant().toISOString(), modele: lu.modele, schema: lu.schema, prompt: lu.prompt, parBatiment };
    if (!Object.keys(parBatiment).length) {
      const raison = lu.resultats.find((r) => r.erreur)?.erreur?.message;
      noter({ resultats, erreur: 'Claude n’a rendu aucune analyse lisible' + (raison ? ' (' + raison + ')' : '') + ' : seules les mesures sont proposées.' });
      return true;
    }
    noter({ resultats, erreur: null });
    const texte = 'Les propositions de Claude sont prêtes : ' + Object.keys(parBatiment).length + ' bâtiment' + (Object.keys(parBatiment).length > 1 ? 's' : '') + ' analysé' + (Object.keys(parBatiment).length > 1 ? 's' : '') + '.';
    ctx.signaler(texte);
    ctx.notifier?.(texte);
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
      const prepare = await preparerDemande(ctx.entrees(), ctx.images, ctx.identite());
      if (!prepare) { noter({ erreur: 'Aucune photo à analyser : photographiez une façade ou le toit.' }); return; }
      phase = 'envoi';
      publier();
      const sig = signature();
      const cree = await client.creerBatch(prepare.demande);
      const batch: BatchAnalyse = { id: cree.batch.id, creeLe: ctx.maintenant().toISOString(), signature: sig, requetes: prepare.requetes, etiquettes: prepare.etiquettes };
      noter({ batch, resultats: null, erreur: null });
      ctx.signaler('Vos photos sont parties à l’analyse par Claude (accord du ' + jourDe(new Date(accord.t)) + ') : les propositions arriveront dans quelques minutes. Vous pouvez retirer cet accord depuis les propositions.');
      suivre();
    } catch (e) {
      noter({ erreur: e instanceof EchecAnalyse ? MESSAGES[e.motif] : 'L’analyse n’a pas pu partir : ' + String((e as Error).message || e) });
    } finally {
      phase = 'repos';
      publier();
    }
  }

  async function lancer(): Promise<void> {
    const a = lire();
    if (!ctx.client || !a.accord || ctx.capture.lire().phase !== 'analyse' || phase !== 'repos') return;
    if (a.batch && a.batch.signature === signature() && !a.erreur) { if (!a.resultats) suivre(); return; }
    await envoyer(a.accord);
  }

  function detail(): string | null {
    const a = lire();
    switch (etat()) {
      case 'indisponible': return 'L’analyse par Claude demande un compte de la plateforme : seules les mesures sont proposées.';
      case 'attente': return null;
      case 'sansAccord': return 'Claude peut regarder vos photos (façades, toit, orthophoto, relief) et proposer ce qu’il y voit : volets, cheminées, matériaux, toiture. Vos photos ne servent qu’à cette analyse.';
      case 'refusee': return 'Analyse par Claude non demandée : seules les mesures sont proposées.';
      case 'preparation': return phase === 'envoi' ? 'Envoi de vos photos à l’analyse…' : 'Préparation des images (photos réduites, rendu du modèle, orthophoto, relief)…';
      case 'enCours': return 'Analyse par Claude en cours (envoyée le ' + jourDe(new Date(a.batch?.creeLe ?? Date.now())) + ')' + (erreurSuivi ? ' — ' + erreurSuivi : ', en général quelques minutes') + '. Vous serez prévenu quand les propositions seront prêtes.';
      case 'prete': return 'Propositions de Claude prêtes (' + Object.keys(a.resultats?.parBatiment ?? {}).length + ' bâtiment' + (Object.keys(a.resultats?.parBatiment ?? {}).length > 1 ? 's' : '') + ', accord du ' + jourDe(new Date(a.accord?.t ?? Date.now())) + ').';
      case 'aRelancer': return 'Les photos ont changé depuis la dernière analyse : relancez-la pour que Claude les regarde.';
      case 'erreur': return a.erreur ?? null;
    }
  }

  return {
    etat, detail,
    accord: () => lire().accord,
    async accorder(partage) {
      noter({ accord: { t: ctx.maintenant().toISOString(), partage }, refus: null, erreur: null });
      await lancer();
    },
    refuser() { noter({ accord: null, refus: ctx.maintenant().toISOString() }); },
    retirerAccord() {
      annulerSuivi?.(); annulerSuivi = null;
      noter({ accord: null, refus: ctx.maintenant().toISOString(), batch: null, resultats: null, erreur: null });
      ctx.signaler('Accord retiré : plus aucune photo ne part à l’analyse, et les propositions de Claude sont retirées.');
    },
    lancer,
    reprendre() { const a = lire(); if (ctx.client && a.accord && a.batch && !a.resultats) suivre(); },
    arreter() { annulerSuivi?.(); annulerSuivi = null; },
    reponses() {
      const a = lire();
      if (!a.accord || !a.resultats || !a.batch) return null;
      return Object.fromEntries(Object.entries(a.resultats.parBatiment).map(([cle, reponses]) => [cle, { reponses, etiquettes: a.batch?.etiquettes[cle] ?? [] }]));
    },
    version: () => version,
    abonner(f) { abonnes.add(f); return () => { abonnes.delete(f); }; },
  };
}

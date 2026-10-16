// L'escalade (decision D20 de MD/plan-vague-3-generaliser.md, MD/spec-audit.md §13.2) : quand les trois passes de
// Claude sur un batiment ne s'accordent pas toutes sur un attribut, une quatrieme reponse, d'un modele plus fin
// (celui que l'administrateur a regle pour l'usage `escalade`), tranche. Elle ne part que pour ces batiments-la, par
// l'appel immediat (trois requetes au plus), sous les plafonds de l'organisation : un plafond atteint arrete
// l'escalade sans rien perdre, les propositions restent celles des trois passes.
//
// Le vote la lit comme une reponse de plus qui ne fait que trancher (model/analyseClaude.ts, `voter`) : un attribut
// unanime n'est jamais change, un attribut tranche arrive decoche et dit qu'un modele plus fin a decide.

import { EchecAnalyse, type ClientAnalyse, type DemandeAnalyse, type RequeteAnalyse } from '../../../io/analyseClaude.js';
import { attributsEnDesaccord } from '../../../model/analyseClaude.js';
import type { BatchAnalyse } from '../../../model/auditParcelle.js';
import { passesLues, voterAnalyse } from '../../regles/sujets/vote.js';
import { preparerDemande, type FabriqueImages, type IdentiteAnalyse } from './entreesAnalyse.js';
import type { EntreesPropositions } from './propositions.js';

/** L'appel immediat prend trois requetes au plus (deploy/analyse.php, REQUETES_IMMEDIATES). */
export const ESCALADE_PAR_APPEL = 3;

/** Les batiments dont les passes se desaccordent sur au moins un attribut, avec les attributs. */
export function batimentsEnDesaccord(parBatiment: Readonly<Record<string, readonly unknown[]>>): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const [cle, sorties] of Object.entries(parBatiment)) {
    const passes = passesLues(sorties as unknown[]);
    if (passes.length < 2) continue;
    const attributs = attributsEnDesaccord(voterAnalyse(passes));
    if (attributs.length) out[cle] = attributs;
  }
  return out;
}

/** Ce que l'escalade a rendu : la reponse du modele fin par batiment, et pourquoi elle s'est arretee s'il y a lieu. */
export interface ResultatEscalade {
  parBatiment: Record<string, unknown>;
  /** `plafond` : l'organisation a atteint son plafond ; `echec` : le serveur a refuse ou n'a pas repondu. */
  arret: 'plafond' | 'echec' | null;
  message: string | null;
}

/**
 * Les requetes de l'escalade : pour chaque batiment en desaccord, la premiere passe de la demande de l'analyse
 * (meme contenu, memes images), sans facades a compter (elles l'ont deja ete) et sans le renfort.
 */
export function requetesEscalade(demande: DemandeAnalyse, requetes: BatchAnalyse['requetes'], cles: readonly string[]): { requete: RequeteAnalyse; cle: string }[] {
  return cles.flatMap((cle) => {
    const r = demande.requetes.find((x) => (x.usage ?? 'analyse') === 'analyse' && requetes[x.id]?.cle === cle && requetes[x.id]?.passe === 1);
    return r ? [{ requete: { ...r, usage: 'analyse', facades: 0 }, cle }] : [];
  });
}

/** Appelle le modele fin pour ces batiments, trois a la fois ; s'arrete au premier refus du serveur. */
export async function escalader(client: ClientAnalyse, demande: DemandeAnalyse, requetes: BatchAnalyse['requetes'], cles: readonly string[]): Promise<ResultatEscalade> {
  const out: ResultatEscalade = { parBatiment: {}, arret: null, message: null };
  const aEnvoyer = requetesEscalade(demande, requetes, cles);
  for (let i = 0; i < aEnvoyer.length; i += ESCALADE_PAR_APPEL) {
    const lot = aEnvoyer.slice(i, i + ESCALADE_PAR_APPEL);
    try {
      // Pas de `depot` : l'appel immediat ne garde pas de trace dans le dossier de l'audit.
      const lu = await client.immediat({ ...demande, depot: null, usage: 'escalade', requetes: lot.map((x) => x.requete) });
      for (const r of lu.resultats) {
        const cle = lot.find((x) => x.requete.id === r.id)?.cle;
        if (cle && r.statut === 'reussi' && r.sortie) out.parBatiment[cle] = r.sortie;
      }
    } catch (e) {
      out.arret = e instanceof EchecAnalyse && e.motif === 'plafond' ? 'plafond' : 'echec';
      out.message = e instanceof EchecAnalyse && e.motif === 'plafond'
        ? 'Le plafond de l’analyse est atteint : les passes qui se désaccordent ne sont pas départagées par un modèle plus fin.'
        : 'Le modèle plus fin n’a pas pu départager les passes (' + ((e as Error).message || String(e)) + ') : les propositions restent celles des trois passes.';
      break;
    }
  }
  return out;
}

/** Ce qu'il faut pour preparer a nouveau la demande de l'analyse (les memes images, les memes textes). */
export interface ContexteEscalade {
  client: ClientAnalyse;
  entrees: () => EntreesPropositions;
  images: FabriqueImages;
  identite: () => IdentiteAnalyse;
}

/**
 * L'escalade d'un batch lu : les batiments en desaccord, la demande rejouee a l'identique pour eux seuls, la reponse du
 * modele fin par batiment. Rend `{}` quand rien ne se desaccorde ; ne leve jamais : un echec est un message.
 */
export async function escaladerLeBatch(ctx: ContexteEscalade, parBatiment: Readonly<Record<string, readonly unknown[]>>): Promise<ResultatEscalade> {
  const cles = Object.keys(batimentsEnDesaccord(parBatiment));
  if (!cles.length) return { parBatiment: {}, arret: null, message: null };
  try {
    const prepare = await preparerDemande(ctx.entrees(), { photo: ctx.images.photo, rendu: ctx.images.rendu, ortho: ctx.images.ortho, carte: ctx.images.carte }, ctx.identite());
    if (!prepare) return { parBatiment: {}, arret: 'echec', message: null };
    return await escalader(ctx.client, prepare.demande, prepare.requetes, cles);
  } catch (e) {
    return { parBatiment: {}, arret: 'echec', message: 'Le modèle plus fin n’a pas pu départager les passes (' + ((e as Error).message || String(e)) + ') : les propositions restent celles des trois passes.' };
  }
}

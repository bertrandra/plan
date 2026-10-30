// « Appliquer » la liste de l'assistant (lot L6 de MD/spec-lecture-ia-elargie.md §5.5) : le registre execute, l'assistant n'ecrit rien.
//
// Les etapes grisees ne s'executent pas (la liste les montre, avec leur raison). Les autres, en deux temps :
//   1. les preferences d'affichage d'abord, hors historique, comme a la main (« Filaire », les bascules du menu Affichage : ni Ctrl+Z,
//      ni lecture seule) : poses AVANT l'instantane, elles ne reviennent pas avec un Ctrl+Z de la liste ;
//   2. les etapes qui ecrivent le projet, dans UNE transaction de l'historique (core/historique.ts `transaction`) : une seule etape
//      d'annulation, et Ctrl+Z rend le projet d'avant la liste, a l'identique.
// Chaque etape relit son etat juste avant de s'executer (une etape d'avant a pu le changer). Une etape refusee en route annule tout :
// la transaction rend le plan d'avant, et les preferences deja posees reviennent a leur valeur.

import { raisonDeRefus } from './catalogue.js';
import type { EtapeProposee, ValeurChamp } from './etapes.js';
import type { EtatCommande } from '../commandes.js';

/** Ce qu'Appliquer demande a Plan (app/assistant/branchement.ts ; un plan factice dans les tests). */
export interface ContexteApplication {
  lectureSeule: () => boolean;
  etat: (id: string) => EtatCommande;
  /** Execute la commande par le registre ; faux s'il la refuse. */
  executer: (id: string) => boolean;
  /** La valeur actuelle d'un champ d'un objet, ou undefined s'il n'existe pas (ou plus). */
  lireChamp: (objet: string, cle: string) => ValeurChamp | undefined;
  /** Ecrit un champ par le service de l'inspecteur (historique, lecture seule, effets) ; faux s'il l'a refuse. */
  ecrireChamp: (objet: string, cle: string, valeur: ValeurChamp) => boolean;
  /** Plusieurs gestes, une etape d'annulation ; `f` rend faux pour tout defaire. */
  transaction: (f: () => boolean) => boolean;
}

export type ResultatApplication = { ok: true; faites: number; ignorees: number } | { ok: false; raison: string };

/** Une etape, executee ; la raison de son refus sinon. */
function executer(e: EtapeProposee, ctx: ContexteApplication): string | null {
  if (e.ecrit === 'projet' && ctx.lectureSeule()) return 'Lecture seule : « ' + e.libelle + ' » ne s’applique pas.';
  if (e.commande) {
    const refus = raisonDeRefus(ctx.etat(e.commande));
    if (refus) return '« ' + e.libelle + ' » : ' + refus;
    return ctx.executer(e.commande) ? null : '« ' + e.libelle + ' » a été refusée par Plan.';
  }
  const f = e.champ;
  if (!f) return '« ' + e.libelle + ' » : étape vide.';
  if (ctx.lireChamp(f.objet, f.cle) === undefined) return '« ' + e.libelle + ' » : ce champ n’existe plus pour cet objet.';
  return ctx.ecrireChamp(f.objet, f.cle, f.valeur) ? null : '« ' + e.libelle + ' » a été refusée par Plan.';
}

/** Applique les etapes utilisables ; tout ou rien. */
export function appliquerEtapes(etapes: readonly EtapeProposee[], ctx: ContexteApplication): ResultatApplication {
  const utiles = etapes.filter((e) => !e.refus);
  if (!utiles.length) return { ok: false, raison: 'Aucune étape de la liste ne s’applique.' };
  const affichage = utiles.filter((e) => e.ecrit === 'affichage'), projet = utiles.filter((e) => e.ecrit === 'projet');
  // Les preferences posees, et de quoi les rendre si la suite echoue.
  const retours: (() => void)[] = [];
  const rendre = () => { for (const r of retours.reverse()) r(); };
  for (const e of affichage) {
    const avant = e.champ ? ctx.lireChamp(e.champ.objet, e.champ.cle) : undefined;
    const refus = executer(e, ctx);
    if (refus) { rendre(); return { ok: false, raison: refus + ' Rien n’a été appliqué.' }; }
    if (e.commande) { const id = e.commande; retours.push(() => { ctx.executer(id); }); }
    else if (e.champ && avant !== undefined) { const { objet, cle } = e.champ; retours.push(() => { ctx.ecrireChamp(objet, cle, avant); }); }
  }
  let raison = '';
  const ok = !projet.length || ctx.transaction(() => {
    for (const e of projet) {
      const refus = executer(e, ctx);
      if (refus) { raison = refus; return false; }
    }
    return true;
  });
  if (!ok) { rendre(); return { ok: false, raison: (raison || 'Une étape a échoué.') + ' Rien n’a été appliqué.' }; }
  return { ok: true, faites: utiles.length, ignorees: etapes.length - utiles.length };
}

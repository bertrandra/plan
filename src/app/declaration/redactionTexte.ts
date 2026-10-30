// La redaction d'une piece ecrite du dossier par Claude (lot L5 de la lecture IA elargie, §5.4) : des faits du projet a un BROUILLON.
//
//   1. les faits du projet (export/faitsDossier.ts), en JSON, et leur empreinte ;
//   2. l'appel immediat du serveur (usage `texte`, deploy/analyse.php), une requete, une passe (on ne vote pas une prose) : le serveur
//      choisit le prompt, le schema et le modele, journalise le cout et garde la trace (les faits envoyes, lot L0) ;
//   3. la reponse lue ici : son texte devient le brouillon, ses reserves se montrent a cote ; rien n'est valide ici.
//
// Ce module ne touche pas au projet : le service du dossier (serviceDossier.ts) range le brouillon sur la parcelle, en un pas
// d'annulation. Les faits ne disent rien du declarant (ni nom ni naissance) : seulement le terrain et les ouvrages.

import { faitsDuDossier, texteDesFaits } from '../../export/faitsDossier.js';
import { sha256Texte } from '../../util/sha256.js';
import { longueurMax, type BrouillonTexte, type PieceTexte } from '../../regles/textes/dossier.js';
import type { ClientAnalyse } from '../../io/analyseClaude.js';
import type { ObjetPlan } from '../../model/types.js';

export interface ContexteRedaction {
  /** Le client des routes de Claude ; null hors plateforme et hors admin (la redaction est alors refusee, avec sa raison). */
  client: () => ClientAnalyse | null;
  identite: () => { projet: string | null; idu: string | null; adresse: string | null };
  maintenant: () => Date;
}

/** Le texte de la requete : la piece demandee, puis les faits du projet, tels quels. */
export function texteDemandeRedaction(piece: PieceTexte, faits: string): string {
  return 'Pièce demandée : ' + piece + '.\n\nFaits du projet (JSON) :\n' + faits;
}

/** La sortie de Claude relue : un texte non vide et ses reserves ; null sinon. */
export function lireSortieTexte(v: unknown, piece: PieceTexte): { texte: string; reserves: string[] } | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as { texte?: unknown; reserves?: unknown };
  const texte = typeof o.texte === 'string' ? o.texte.trim() : '';
  if (!texte) return null;
  const reserves = (Array.isArray(o.reserves) ? o.reserves : []).filter((r): r is string => typeof r === 'string' && !!r.trim()).map((r) => r.trim().slice(0, 400)).slice(0, 20);
  return { texte: texte.slice(0, longueurMax(piece) * 2), reserves };
}

/** Redige le brouillon d'une piece pour ce projet. Rend le brouillon, ou la phrase a dire quand quelque chose manque. */
export async function redigerTexte(objets: ObjetPlan[], piece: PieceTexte, ctx: ContexteRedaction): Promise<{ brouillon: BrouillonTexte } | { erreur: string }> {
  const client = ctx.client();
  if (!client) return { erreur: 'La rédaction par Claude passe par le serveur de Plan : connectez-vous à votre organisation.' };
  const faits = texteDesFaits(faitsDuDossier(objets));
  const lu = await client.immediat({
    ...ctx.identite(), audit: 'texte-' + piece, usage: 'texte',
    requetes: [{ id: 'texte-' + piece, passe: 1, facades: 0, contenu: [{ type: 'text', text: texteDemandeRedaction(piece, faits) }] }],
  });
  const x = lu.resultats[0];
  const sortie = x && x.statut === 'reussi' ? lireSortieTexte(x.sortie, piece) : null;
  if (!x || !sortie) return { erreur: 'Claude n’a pas rendu de texte utilisable' + (x?.erreur?.message ? ' (' + x.erreur.message + ')' : '') + '. Réessayez plus tard, ou écrivez le texte vous-même.' };
  return {
    brouillon: {
      texte: sortie.texte, reserves: sortie.reserves, le: ctx.maintenant().toISOString(),
      modele: x.modele ?? lu.modele, prompt: x.prompt ?? lu.prompt, schema: x.schema ?? lu.schema, entrees: sha256Texte(faits), cout: x.cout ?? null,
      ...(lu.trace ? { trace: lu.trace } : {}), ...(x.synthetique === true ? { synthetique: true } : {}),
    },
  };
}

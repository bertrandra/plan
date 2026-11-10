// L'escalade d'une facade dans l'audit de la parcelle (decision du proprietaire, 29 octobre 2026 : « trois lectures, et une escalade
// a la demande ») : la personne touche « Escalader » sous la barre d'une facade ; UNE requete part, par l'appel immediat, au modele de
// l'usage `escalade`, sur le contenu exact du run de cette facade dans le batch (l'elevation, le texte). Sa reponse est gardee dans le
// run de la capture (`escalade`), et le moteur de regles la pese contre le vote des passes (facade/regles/facades/ia.ts,
// `escaladerObservations`) ; l'accord avec la detection est refait. Jamais automatique, jamais deux pour le meme run.
//
// Ce n'est pas l'escalade D20 des maisons (escalade.ts), qui part seule quand les passes d'une maison se desaccordent.

import { envoyerEscalade } from '../../releve/runFacade.js';
import { contenuDeLaFacade, type FabriqueImageRunFacade } from './runsFacades.js';
import type { ClientAnalyse } from '../../../io/analyseClaude.js';
import type { RunEnregistre } from '../../../regles/facades/observations.js';
import type { EntreesPropositions } from './propositions.js';

interface DepsEscaladeFacade {
  client: ClientAnalyse;
  entrees: () => EntreesPropositions;
  fab: FabriqueImageRunFacade;
  identite: () => { projet: string | null; idu: string | null; adresse: string | null; depot?: string | null };
  maintenant: () => Date;
}

/** La facade `cle#cote` : son batiment et son cote. */
function lireCle(k: string): { cle: string; cote: number } | null {
  const i = k.lastIndexOf('#');
  const cote = Number(k.slice(i + 1));
  return i > 0 && Number.isInteger(cote) ? { cle: k.slice(0, i), cote } : null;
}

/** Escalade le run de la facade `k` (`cle#cote`) : le run complete, ou ce qui l'a empeche, en clair. */
export async function escaladerUneFacade(d: DepsEscaladeFacade, k: string, run: RunEnregistre): Promise<{ run: RunEnregistre } | { erreur: string }> {
  if (run.escalade) return { erreur: 'Cette façade est déjà escaladée : une seule escalade par lecture.' };
  const f = lireCle(k);
  const e = d.entrees();
  const nom = f ? e.liste.batiments.find((b) => b.cle === f.cle)?.nom ?? f.cle : '';
  const c = f ? await contenuDeLaFacade(e, f.cle, f.cote, nom, d.fab) : null;
  if (!c) return { erreur: 'La façade n’est plus mesurée : rejouez-la avant de l’escalader.' };
  return envoyerEscalade(d.client, d.identite(), 'audit', c.contenu, run, d.maintenant());
}

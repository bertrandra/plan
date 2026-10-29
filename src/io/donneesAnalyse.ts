// Les donnees d'analyse gardees par le serveur (lot L0, MD/spec-lecture-ia-elargie.md 4.8 ; deploy/analyse.php) : l'export a
// travers tous les audits, et le rejeu du run d'une facade depuis son image gardee. Une image se demande par son empreinte, une a une
// (`admin/claude/images/<sha256>.<ext>`). A
// l'administrateur seul (sa session) : la page les lit et les exporte, elle ne les ecrit pas.
//
//   GET  admin/claude/donnees-analyse?du=&au=&modele=&usage=   l'export `plan-donnees-analyse` (JSON)
//   POST admin/claude/rejouer                                  { audit, trace, requete, passes } : le run repart, memes octets
//   GET  admin/claude/images/<sha256>.<ext>[?audit=]            une image gardee

import { ENTETE_ADMIN, RACINE_ADMIN } from './depotDemos.js';
import type { ResultatsImmediats } from './analyseClaude.js';

type Fetch = (entree: string, init?: RequestInit) => Promise<Response>;

/** Une requete revenue d'une trace : une passe, le run d'une facade, une escalade, un rejeu. */
export interface LigneRequeteAnalyse {
  nature: 'requete';
  trace: string;
  /** La nature de la trace : `analyse`, `rejeu` (batches), `immediat`, `rejeu-facade`. */
  lot: string;
  audit: string | null;
  organisation: string | null;
  idu: string | null;
  adresse: string | null;
  t: string;
  finLe: string | null;
  idBatch: string | null;
  requete: string;
  batiment: string;
  facade: number | null;
  passe: number | null;
  /** L'usage compte (`facade`, `escalade`, `rejeu`…), et celui du prompt de la requete. */
  usage: string | null;
  usageRequete: string | null;
  modele: string | null;
  prompt: number | null;
  schema: number | null;
  essai: boolean;
  statut: string | null;
  arret: string | null;
  erreur: { type: string; message: string } | null;
  tokens: Record<string, number> | null;
  cout: number | null;
  refusFormat: string | null;
  /** Les empreintes des images envoyees, et celle du texte brut rendu. */
  empreintes: string[];
  /** Les octets de ces images, tels qu'ils sont partis (le volume garde). */
  octets: number;
  reponse: string | null;
  trouve: Record<string, number | boolean> | null;
  sortie: unknown;
  texte: string | null;
}

/** Une proposition d'un audit recu, et ce qui en a ete fait. */
export interface LignePropositionAnalyse {
  nature: 'proposition';
  audit: string;
  organisation: string | null;
  idu: string | null;
  adresse: string | null;
  t: string;
  proposition: string;
  objet: string | null;
  batiment: string | null;
  facade: number | null;
  effet: string | null;
  source: string | null;
  avant: string | null;
  apres: string | null;
  confiance: number | null;
  reserve: string | null;
  decision: 'validee' | 'refusee' | null;
  /** Les decisions des arbitrages du moteur (`auto`, `manuelle`…), null sans arbitrage. */
  moteur: string | null;
  /** `accord`, `desaccord`, `claude-seul`, `sans-claude`. */
  accordClaude: string | null;
}

export interface DonneesAnalyse {
  format: 'plan-donnees-analyse';
  version: number;
  genereLe: string;
  du: string;
  au: string;
  filtres: { modele: string | null; usage: string | null };
  requetes: LigneRequeteAnalyse[];
  propositions: LignePropositionAnalyse[];
}

export interface FiltresDonneesAnalyse { du: string; au: string; modele?: string | null; usage?: string | null }

export interface ClientDonneesAnalyse {
  exporter(f: FiltresDonneesAnalyse): Promise<DonneesAnalyse>;
  /** Rejoue le run d'une facade gardee, depuis son image : sa trace dans l'audit (`audit`) ou sans depot (null). */
  rejouerFacade(d: { audit: string | null; trace: string; requete: string; passes: 1 | 2 | 3 }): Promise<ResultatsImmediats & { source?: string }>;
}

export class EchecDonneesAnalyse extends Error {}

export function creerClientDonneesAnalyse(f: Fetch): ClientDonneesAnalyse {
  async function appeler<T>(chemin: string, quoi: string, init: RequestInit = {}): Promise<T> {
    let r: Response;
    try { r = await f(RACINE_ADMIN + '/claude/' + chemin, { credentials: 'same-origin', cache: 'no-store', ...init }); } catch (e) { throw new EchecDonneesAnalyse(quoi + ' : ' + ((e as Error).message || String(e))); }
    if (!r.ok) {
      let message = 'HTTP ' + r.status;
      try { const d = await r.json() as { error?: { message?: string } }; if (d.error?.message) message = d.error.message; } catch { /* le statut suffit */ }
      throw new EchecDonneesAnalyse(quoi + ' : ' + message);
    }
    try { return await r.json() as T; } catch { throw new EchecDonneesAnalyse(quoi + ' : réponse illisible du serveur'); }
  }
  return {
    async exporter(x) {
      const q = new URLSearchParams({ du: x.du, au: x.au, ...(x.modele ? { modele: x.modele } : {}), ...(x.usage ? { usage: x.usage } : {}) });
      const d = await appeler<DonneesAnalyse>('donnees-analyse?' + q.toString(), 'données d’analyse');
      if (d?.format !== 'plan-donnees-analyse' || !Array.isArray(d.requetes) || !Array.isArray(d.propositions)) throw new EchecDonneesAnalyse('données d’analyse : réponse illisible du serveur');
      return d;
    },
    rejouerFacade: (d) => appeler('rejouer', 'rejeu de la façade', { method: 'POST', headers: { 'Content-Type': 'application/json', ...ENTETE_ADMIN }, body: JSON.stringify(d) }),
  };
}

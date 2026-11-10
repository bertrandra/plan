// Le brouillon des regles sur le serveur (deploy/analyse.php) :
// le prompt et le schema edites dans Admin › Regles, gardes pour essayer une analyse ou un rejeu AVANT
// la PR. A l'administrateur seul (cookie de sa session) ; ce brouillon ne remplace jamais le prompt livre,
// seule une demande qui le nomme (`essai: 'brouillon'`, io/analyseClaude.ts) le lit.
//
//   GET    admin/claude/regles    le brouillon (versions, date, textes, etat de l'editeur) ou `null`
//   PUT    admin/claude/regles    l'enregistre (remplace le precedent)
//   DELETE admin/claude/regles    le retire

import { ENTETE_ADMIN, RACINE_ADMIN } from './depotDemos.js';
import { lireBrouillonServeur, type BrouillonServeur } from './analyseClaude.js';

type Fetch = (entree: string, init?: RequestInit) => Promise<Response>;

/** Le brouillon tel que le serveur le rend a l'administrateur : de quoi rouvrir l'editeur. */
export interface BrouillonReglesServeur extends BrouillonServeur {
  /** Le fichier prompt-analyse.md que le serveur lirait, en-tete compris. */
  promptTexte: string;
  /** Le fichier schema-analyse.json que le serveur lirait. */
  schemaTexte: string;
  /** L'etat de l'editeur (`{ liste, exclus }`), tel que l'ecran l'a envoye. */
  etat: unknown;
}

/** Ce que l'ecran envoie : les deux fichiers recalcules et l'etat de l'editeur qui les a produits. */
export interface EnvoiBrouillonRegles { prompt: string; schema: string; etat: unknown }

export interface ClientRegles {
  lire(): Promise<BrouillonReglesServeur | null>;
  enregistrer(b: EnvoiBrouillonRegles): Promise<BrouillonServeur>;
  retirer(): Promise<void>;
}

async function message(r: Response, quoi: string): Promise<Error> {
  let m = 'HTTP ' + r.status;
  try { const d = await r.json() as { error?: { message?: string } }; if (d.error?.message) m = d.error.message; } catch { /* corps vide : le statut suffit */ }
  return new Error(quoi + ' : ' + m);
}

export function creerClientRegles(f: Fetch): ClientRegles {
  const url = RACINE_ADMIN + '/claude/regles';
  async function appeler(quoi: string, init: RequestInit = {}): Promise<{ brouillon: unknown }> {
    let r: Response;
    try { r = await f(url, { credentials: 'same-origin', cache: 'no-store', ...init }); } catch (e) { throw new Error(quoi + ' : ' + ((e as Error).message || String(e))); }
    if (!r.ok) throw await message(r, quoi);
    try { return await r.json() as { brouillon: unknown }; } catch { throw new Error(quoi + ' : réponse illisible'); }
  }
  return {
    async lire() {
      const d = (await appeler('lecture du brouillon des règles')).brouillon as Record<string, unknown> | null;
      const v = lireBrouillonServeur(d);
      if (!v || !d || typeof d.prompt_texte !== 'string' || typeof d.schema_texte !== 'string') return null;
      return { ...v, promptTexte: d.prompt_texte, schemaTexte: d.schema_texte, etat: d.etat ?? null };
    },
    async enregistrer(b) {
      const d = await appeler('enregistrement du brouillon des règles', { method: 'PUT', headers: { 'Content-Type': 'application/json', ...ENTETE_ADMIN }, body: JSON.stringify(b) });
      const v = lireBrouillonServeur(d.brouillon);
      if (!v) throw new Error('enregistrement du brouillon des règles : réponse illisible');
      return v;
    },
    async retirer() { await appeler('retrait du brouillon des règles', { method: 'DELETE', headers: ENTETE_ADMIN }); },
  };
}

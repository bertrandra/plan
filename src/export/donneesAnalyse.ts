// L'export « données d'analyse » en CSV (lot L0, MD/spec-lecture-ia-elargie.md 4.8) : le fichier `plan-donnees-analyse` du serveur
// (io/donneesAnalyse.ts) mis en une table, au format du tableau de bord (csvConsommation.ts : `;`, virgule decimale, BOM, CRLF,
// formule neutralisee). Une ligne par requete revenue (une passe, le run d'une facade, une escalade, un rejeu), puis une ligne par
// proposition d'un audit recu ; la colonne « Nature » les distingue. Les champs simples de la sortie (un mot, un nombre, et le
// nombre d'elements d'une liste, a deux niveaux au plus) ont chacun leur colonne, `sortie.` devant : le corpus se compte dans un
// tableur sans relire le JSON. Le texte brut de Claude et la sortie entiere restent au JSON. Aucune image : leurs empreintes.

import { csv } from './csvConsommation.js';
import type { DonneesAnalyse, LigneRequeteAnalyse } from '../io/donneesAnalyse.js';

type Cellule = string | number | null;

const objet = (v: unknown): Record<string, unknown> | null => (v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : null);

/** Les champs simples d'une sortie : `forme.silhouette` -> le mot ; `ouvertures` -> le nombre d'elements ; deux niveaux au plus. */
export function champsSimples(sortie: unknown, prefixe = '', profondeur = 0): Record<string, Cellule> {
  const o = objet(sortie);
  const out: Record<string, Cellule> = {};
  if (!o) return out;
  for (const [k, v] of Object.entries(o)) {
    const cle = prefixe + k;
    if (typeof v === 'string' || typeof v === 'number') out[cle] = v;
    else if (typeof v === 'boolean') out[cle] = v ? 'oui' : 'non';
    else if (Array.isArray(v)) out[cle + ' (nombre)'] = v.length;
    else if (objet(v) && profondeur < 1) Object.assign(out, champsSimples(v, cle + '.', profondeur + 1));
  }
  return out;
}

const tokensEntree = (t: LigneRequeteAnalyse['tokens']) => (t ? (t.entree ?? 0) + (t.ecritureCache ?? 0) + (t.ecritureCache1h ?? 0) + (t.lectureCache ?? 0) : null);

const ENTETES = ['Nature', 'Date', 'Audit', 'Parcelle', 'Adresse', 'Organisation', 'Trace', 'Lot', 'Batch', 'Requête', 'Bâtiment', 'Façade', 'Passe', 'Usage', 'Usage du prompt',
  'Modèle', 'Prompt', 'Schéma', 'Brouillon', 'Statut', 'Arrêt', 'Erreur', 'Format refusé', 'Tokens en entrée', 'Tokens en sortie', 'Coût ($)', 'Images (empreintes)', 'Images (octets)', 'Réponse (empreinte)',
  'Proposition', 'Objet', 'Effet', 'Source', 'Avant', 'Après', 'Confiance', 'Réserve', 'Décision', 'Décision du moteur', 'Accord de Claude'];

const DECISIONS = { validee: 'validée', refusee: 'refusée' } as const;

/** Le CSV de l'export : les requetes, puis les propositions ; les champs simples des sorties en colonnes a la suite. */
export function csvDonneesAnalyse(d: DonneesAnalyse): string {
  const simples = d.requetes.map((l) => champsSimples(l.sortie, 'sortie.'));
  const colonnes = [...new Set(simples.flatMap((s) => Object.keys(s)))].sort();
  const vides = (n: number): Cellule[] => Array.from({ length: n }, () => null);
  const requetes: Cellule[][] = d.requetes.map((l, i) => [
    'requête', l.t, l.audit, l.idu, l.adresse, l.organisation, l.trace, l.lot, l.idBatch, l.requete, l.batiment, l.facade, l.passe, l.usage, l.usageRequete,
    l.modele, l.prompt, l.schema, l.essai ? 'oui' : 'non', l.statut, l.arret, l.erreur ? l.erreur.type + ' : ' + l.erreur.message : null, l.refusFormat,
    tokensEntree(l.tokens), l.tokens?.sortie ?? null, l.cout, l.empreintes.join(' '), l.octets, l.reponse,
    ...vides(11), ...colonnes.map((c) => simples[i]?.[c] ?? null)]);
  const propositions: Cellule[][] = d.propositions.map((p) => [
    'proposition', p.t, p.audit, p.idu, p.adresse, p.organisation, ...vides(4), p.batiment, p.facade, ...vides(17),
    p.proposition, p.objet, p.effet, p.source, p.avant, p.apres, p.confiance, p.reserve, p.decision ? DECISIONS[p.decision] : 'en attente', p.moteur, p.accordClaude,
    ...vides(colonnes.length)]);
  return csv([...ENTETES, ...colonnes], [...requetes, ...propositions]);
}

/** Le nom des fichiers de l'export : `donnees-analyse-<du>-<au>.json|csv`. */
export const nomDonneesAnalyse = (d: Pick<DonneesAnalyse, 'du' | 'au'>, extension: 'json' | 'csv'): string => 'donnees-analyse-' + d.du + '-' + d.au + '.' + extension;

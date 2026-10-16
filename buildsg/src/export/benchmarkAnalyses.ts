// La comparaison des analyses et des rejeux d'un audit (MD/spec-audit.md 15.5) : une ligne par
// analyse, cote a cote par modele et par version du prompt et du schema, et son export CSV au format
// du tableau de bord (csvConsommation.ts : `;`, virgule decimale, BOM).
//
// Les comptes d'une analyse sont ceux de chaque batiment, passe par passe (les trois passes d'une
// maison recoivent le meme contenu) : on retient la mediane des passes reussies de chaque batiment,
// comme un vote, puis on additionne les batiments. Une passe en echec ne compte pas ; une reponse
// lue mais vide compte zero et s'ajoute aux « vides ».

import { csv } from './csvConsommation.js';
import { CLES_TROUVAILLES, NOMS_TROUVAILLES, nomModele, type CleTrouvaille } from '../model/consommation.js';
import type { ResumeAnalyse, ResultatResume } from '../io/analysesAudits.js';

export interface LigneBenchmark {
  id: string;
  nature: 'analyse' | 'rejeu';
  etat: 'en_cours' | 'termine';
  creeLe: string;
  modele: string;
  prompt: number;
  schema: number;
  effort: string | null;
  requetes: number;
  reussies: number;
  echouees: number;
  /** Les reponses lues qui ne trouvent rien. */
  vides: number;
  images: number;
  tokensEntree: number;
  tokensSortie: number;
  cout: number | null;
  /** De l'envoi a la fin du batch, en secondes ; null tant qu'il n'est pas fini. */
  dureeS: number | null;
  /** La mediane des passes de chaque batiment, additionnee ; null tant qu'aucune n'est lue. */
  comptes: Record<CleTrouvaille, number> | null;
}

/** Le batiment d'une requete : `b0-p2` -> `b0` ; une requete sans passe est son propre batiment. */
export const batimentDe = (id: string): string => id.replace(/-p\d+$/, '');

function mediane(v: number[]): number {
  const t = [...v].sort((a, b) => a - b);
  const m = Math.floor(t.length / 2);
  return t.length % 2 ? t[m] ?? 0 : ((t[m - 1] ?? 0) + (t[m] ?? 0)) / 2;
}

/** Les comptes d'une analyse : mediane par batiment des passes lues, additionnee. */
export function comptesAnalyse(resultats: readonly ResultatResume[]): Record<CleTrouvaille, number> | null {
  const parBatiment = new Map<string, ResultatResume[]>();
  for (const r of resultats) if (r.trouve) parBatiment.set(batimentDe(r.id), [...(parBatiment.get(batimentDe(r.id)) ?? []), r]);
  if (!parBatiment.size) return null;
  const c = Object.fromEntries(CLES_TROUVAILLES.map((k) => [k, 0])) as Record<CleTrouvaille, number>;
  for (const passes of parBatiment.values()) for (const k of CLES_TROUVAILLES) c[k] += mediane(passes.map((p) => p.trouve?.[k] ?? 0));
  return c;
}

export function ligneBenchmark(r: ResumeAnalyse): LigneBenchmark {
  const res = r.resultats ?? [];
  const debut = Date.parse(r.creeLe), fin = r.finLe ? Date.parse(r.finLe) : NaN;
  return {
    id: r.id, nature: r.nature, etat: r.etat, creeLe: r.creeLe, modele: r.modele, prompt: r.prompt, schema: r.schema, effort: r.effort ?? null,
    requetes: r.requetes, reussies: res.filter((x) => x.statut === 'reussi' && !x.erreur).length, echouees: res.filter((x) => x.statut !== 'reussi' || !!x.erreur).length,
    vides: res.filter((x) => x.trouve?.vide).length, images: r.images,
    tokensEntree: r.tokens ? r.tokens.entree + r.tokens.ecritureCache + r.tokens.ecritureCache1h + r.tokens.lectureCache : 0, tokensSortie: r.tokens?.sortie ?? 0,
    cout: r.cout, dureeS: Number.isFinite(debut) && Number.isFinite(fin) ? Math.max(0, Math.round((fin - debut) / 1000)) : null,
    comptes: res.length ? comptesAnalyse(res) : null,
  };
}

/** Les lignes, les plus anciennes d'abord : la comparaison se lit dans l'ordre des essais. */
export function lignesBenchmark(rs: readonly ResumeAnalyse[]): LigneBenchmark[] {
  return rs.map(ligneBenchmark).sort((a, b) => a.creeLe.localeCompare(b.creeLe));
}

export function csvBenchmark(ls: readonly LigneBenchmark[]): string {
  return csv(['Analyse', 'Nature', 'Envoyée le', 'Modèle', 'Identifiant du modèle', 'Prompt', 'Schéma', 'Effort', 'État', 'Requêtes', 'Réussies', 'Échecs', 'Réponses vides',
    'Images', 'Tokens en entrée', 'Tokens en sortie', 'Coût ($)', 'Durée (s)', ...CLES_TROUVAILLES.map((k) => NOMS_TROUVAILLES[k])],
  ls.map((l) => [l.id, l.nature === 'rejeu' ? 'Rejeu' : 'Analyse', l.creeLe, nomModele(l.modele), l.modele, l.prompt, l.schema, l.effort, l.etat === 'termine' ? 'Terminée' : 'En cours',
    l.requetes, l.reussies, l.echouees, l.vides, l.images, l.tokensEntree, l.tokensSortie, l.cout, l.dureeS, ...CLES_TROUVAILLES.map((k) => (l.comptes ? l.comptes[k] : null))]));
}

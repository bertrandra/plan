// Comparer les REPONSES de deux analyses d'un meme audit (MD/spec-audit.md 15.5) : le tableau d'Admin › Audits
// compte ce que chaque analyse trouve ; ceci dit ce qu'elle DIT, attribut par attribut, batiment par batiment.
// C'est ce qui mesure un changement de prompt (le brouillon des regles, Admin › Regles) avant la PR : meme
// audit, memes photos, deux textes, et ce qui a bougé dans le vote des trois passes.
//
// Chaque analyse devient un vote par batiment (le meme que l'audit lit : `voterAnalyse`, champs des sujets
// compris), aplati en lignes « attribut : valeur (accord) » ; on garde les batiments des deux analyses.

import { batimentDe } from '../../../export/benchmarkAnalyses.js';
import type { Compte, Vote, VoteAnalyse } from '../../../model/analyseClaude.js';
import type { AnalyseComplete } from '../../../io/analysesAudits.js';
import { DESCRIPTIONS_SUJETS } from '../../../regles/sujets/liste.js';
import { passesLues, voterAnalyse } from '../../regles/sujets/vote.js';

/** Un attribut vote : sa valeur en clair, et la part des passes d'accord (null : pas un vote). */
export interface ValeurVotee { valeur: string; accord: number | null }

export interface LigneComparaison {
  batiment: string;
  /** « Forme du toit », « Façade sud : volets »… */
  attribut: string;
  avant: ValeurVotee | null;
  apres: ValeurVotee | null;
  /** La valeur differe (ou l'attribut n'est que d'un cote). */
  change: boolean;
}

export interface ComparaisonAnalyses {
  /** Les batiments lus dans les deux analyses. */
  batiments: string[];
  /** Les batiments lus d'un seul cote (une passe en echec, un batch partiel). */
  seulementAvant: string[];
  seulementApres: string[];
  lignes: LigneComparaison[];
  changees: number;
}

const texteDe = (v: string | Compte): string => String(v);
const vote = (v: Vote<string | Compte>): ValeurVotee => ({ valeur: texteDe(v.valeur), accord: v.accord });

/** Le vote d'un batiment, en lignes nommees dans l'ordre du prompt. */
export function aplatirVote(v: VoteAnalyse): Map<string, ValeurVotee> {
  const m = new Map<string, ValeurVotee>();
  const poser = (nom: string, x: Vote<string | Compte>) => m.set(nom, vote(x));
  poser('Forme du toit', v.forme);
  poser('Profil', v.profil);
  poser('Sens du faîtage', v.faitage);
  poser('Bout gauche', v.boutGauche);
  poser('Bout droit', v.boutDroit);
  poser('Lucarnes (nombre)', v.lucarnes);
  poser('Lucarnes (pan)', v.panLucarnes);
  poser('Cheminées', v.cheminees);
  poser('Toit-terrasse', v.terrasse);
  poser('Toit-terrasse (type)', v.typeTerrasse);
  poser('Acrotère', v.acrotere);
  poser('Édicules', v.edicules);
  poser('Couverture', v.couverture);
  m.set('Éléments du toit', { valeur: v.elements.map((e) => e.valeur).sort().join(', ') || 'aucun', accord: v.elements.length ? Math.min(...v.elements.map((e) => e.accord)) : null });
  for (const [nom, x] of Object.entries(v.simples)) poser(DESCRIPTIONS_SUJETS.find((d) => nom in d.champs)?.libelle ?? nom, x);
  for (const f of v.facades) {
    const p = 'Façade ' + f.facade + ' : ';
    poser(p + 'matériau', f.materiau);
    poser(p + 'volets', f.volets);
    poser(p + 'coffre', f.coffre);
    poser(p + 'balcon', f.balcon);
    poser(p + 'forme des ouvertures', f.formeOuvertures);
    poser(p + 'silhouette', f.silhouette);
    poser(p + 'bout', f.bout);
    poser(p + 'niveaux', f.niveaux);
    poser(p + 'ouvertures manquées', f.manquees);
    poser(p + 'ouvertures en trop', f.enTrop);
  }
  m.set('Écarts au modèle', { valeur: String(v.ecarts.length + v.facades.reduce((n, f) => n + f.ecarts.length, 0)), accord: null });
  poser('Confiance de Claude', v.confiance);
  return m;
}

/** Les votes d'une analyse, par batiment : les passes reussies de l'analyse des maisons (pas le renfort), lues comme l'audit les lit. */
export function votesDeAnalyse(a: AnalyseComplete): Map<string, VoteAnalyse> {
  const parBatiment = new Map<string, unknown[]>();
  for (const r of a.sortant?.resultats ?? []) {
    if (r.usage === 'renfort' || r.statut !== 'reussi') continue;
    const b = batimentDe(r.id);
    parBatiment.set(b, [...(parBatiment.get(b) ?? []), r.sortie]);
  }
  const out = new Map<string, VoteAnalyse>();
  for (const [b, sorties] of parBatiment) {
    const passes = passesLues(sorties);
    if (passes.length) out.set(b, voterAnalyse(passes));
  }
  return out;
}

export function comparerAnalyses(avant: AnalyseComplete, apres: AnalyseComplete): ComparaisonAnalyses {
  const a = votesDeAnalyse(avant), z = votesDeAnalyse(apres);
  const communs = [...a.keys()].filter((b) => z.has(b));
  const lignes: LigneComparaison[] = [];
  for (const b of communs) {
    const x = aplatirVote(a.get(b) as VoteAnalyse), y = aplatirVote(z.get(b) as VoteAnalyse);
    for (const attribut of new Set([...x.keys(), ...y.keys()])) {
      const av = x.get(attribut) ?? null, ap = y.get(attribut) ?? null;
      lignes.push({ batiment: b, attribut, avant: av, apres: ap, change: av?.valeur !== ap?.valeur });
    }
  }
  return {
    batiments: communs,
    seulementAvant: [...a.keys()].filter((b) => !z.has(b)),
    seulementApres: [...z.keys()].filter((b) => !a.has(b)),
    lignes, changees: lignes.filter((l) => l.change).length,
  };
}

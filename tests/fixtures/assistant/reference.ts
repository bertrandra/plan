// Les dix demandes de reference de l'assistant (lot L6) : la requete que Plan enverrait pour chacune, sur la demonstration, et le
// jugement d'une reponse (la liste est-elle juste ?). Les tests les rejouent hors ligne sur les reponses enregistrees
// (reponses.json) ; scripts/assistant-reference.ts les prepare pour la vraie API et juge ce qu'elle rend.

import { readFileSync } from 'node:fs';
import { construireCatalogue } from '../../../src/app/assistant/catalogue.js';
import { contenuDemande } from '../../../src/app/assistant/service.js';
import { lireReponse, resoudre, type EtapeProposee } from '../../../src/app/assistant/etapes.js';
import type { BlocAnalyse } from '../../../src/io/analyseClaude.js';
import { planDeReference } from './plan.js';

type EtapeAttendue = { commande: string } | { champ: { objet: string; cle: string; valeur: string | number | boolean } };
export interface ListeAdmise { etapes: EtapeAttendue[]; questions?: boolean; grisees?: number[] }
export interface DemandeDeReference { id: string; selection: string; lectureSeule?: boolean; demande: string; attendu: ListeAdmise[]; sansChiffre?: boolean }

const dossier = new URL('./', import.meta.url);
export const DEMANDES: DemandeDeReference[] = (JSON.parse(readFileSync(new URL('demandes.json', dossier), 'utf8')) as { demandes: DemandeDeReference[] }).demandes;

/** Le plan de la demande : la demonstration, l'objet selectionne, la lecture seule. */
export const planDe = (d: DemandeDeReference) => planDeReference({ selection: d.selection, lectureSeule: !!d.lectureSeule });

/** Les blocs de la requete, tels que le service les envoie (catalogue genere, puis demande). */
export function contenuDe(d: DemandeDeReference): BlocAnalyse[] {
  return contenuDemande(construireCatalogue(planDe(d).source()), d.demande);
}

const memeValeur = (a: unknown, b: unknown) => (typeof b === 'number' ? typeof a === 'number' && Math.abs(a - b) < 1e-6 : a === b);

function memeEtape(e: EtapeProposee, a: EtapeAttendue): boolean {
  if ('commande' in a) return e.commande === a.commande && !e.champ;
  return !!e.champ && e.champ.objet === a.champ.objet && e.champ.cle === a.champ.cle && memeValeur(e.champ.valeur, a.champ.valeur);
}

/** Un prix ou un montant ecrit par Claude (la nomenclature chiffre, jamais lui : question ouverte 16). */
const CHIFFRE = /\d[\d\s.,]*\s*(€|euros?\b|\$|HT\b|TTC\b)/i;

/** La reponse rendue pour cette demande est-elle juste ? Sinon, pourquoi. */
export function juger(d: DemandeDeReference, sortie: unknown): { juste: boolean; raison: string; etapes: EtapeProposee[]; questions: string[] } {
  const r = lireReponse(sortie);
  const plan = planDe(d);
  const etapes = resoudre(r, construireCatalogue(plan.source()));
  const decrire = () => etapes.map((e) => (e.commande ?? e.champ?.cle + '=' + String(e.champ?.valeur)) + (e.refus ? ' (grisée)' : '')).join(', ') || 'aucune étape';
  if (d.sansChiffre && [...r.questions, ...r.etapes.map((e) => e.pourquoi)].some((t) => CHIFFRE.test(t))) {
    return { juste: false, raison: 'un montant écrit par Claude : ' + decrire(), etapes, questions: r.questions };
  }
  for (const a of d.attendu) {
    if (a.etapes.length !== etapes.length) continue;
    // L'ordre de deux etapes independantes ne compte pas : chaque etape attendue prend la premiere etape rendue qui lui va.
    const libres = etapes.map((_, i) => i), pour: number[] = [];
    for (const x of a.etapes) {
      const k = libres.findIndex((i) => memeEtape(etapes[i]!, x));
      if (k < 0) break;
      pour.push(libres[k]!);
      libres.splice(k, 1);
    }
    if (pour.length !== a.etapes.length) continue;
    if (a.questions === true && !r.questions.length) continue;
    if (a.questions === false && r.questions.length) continue;
    const grisees = a.grisees ?? [];
    if (!pour.every((i, j) => !!etapes[i]!.refus === grisees.includes(j))) continue;
    return { juste: true, raison: decrire() + (r.questions.length ? ' ; question : ' + r.questions[0] : ''), etapes, questions: r.questions };
  }
  return { juste: false, raison: 'liste inattendue : ' + decrire() + (r.questions.length ? ' ; questions : ' + r.questions.join(' | ') : ''), etapes, questions: r.questions };
}

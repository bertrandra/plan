// Les poids de `regles/reconciliation.json` recales sur ce que les audits recus ont montre (MD/spec-reconciliation.md R7) : pour
// chaque source et chaque attribut, la part des fois ou la valeur de la source est celle que la personne a gardee. Une source
// souvent juste pese plus, une source souvent ecartee pese moins. Une proposition, jamais une ecriture : l'ecran Admin › Regles
// la montre, la personne l'applique (ou non) au brouillon du fichier, qui entre dans le depot par une PR.

import type { FichierAuditParcelle } from '../../../model/fichierAuditParcelle.js';
import type { ArbitrageProposition } from '../../../regles/decisions.js';
import { SOURCES, type ReglesReconciliation, type SourceConstat } from '../../../regles/reconciliation.js';

/** La part de justesse a laquelle un poids reste ce qu'il est : au-dessus il monte, en dessous il baisse. */
export const JUSTESSE_DE_REFERENCE = 0.8;
/** Un poids ne varie jamais de plus de cette part de lui-meme d'un recalage a l'autre. */
export const VARIATION_MAX = 0.5;
/** Le moins de decisions lues pour qu'un poids soit propose : en deca, le taux ne dit rien. */
export const DECISIONS_MIN = 8;
/** Un ecart de moins de cette part du poids n'est pas propose. */
const ECART_MIN = 0.1;

export interface Justesse { attribut: string; source: SourceConstat; decisions: number; justes: number; taux: number }

/**
 * La justesse de chaque source par attribut. Une proposition validee : les sources du groupe retenu avaient raison, celles des autres
 * groupes tort. Refusee : celles du groupe retenu avaient tort, les autres ne sont pas jugees. Une valeur forcee, ou une proposition
 * restee sans reponse, ne juge personne.
 */
export function justessesDesAudits(fichiers: readonly FichierAuditParcelle[]): Justesse[] {
  const m = new Map<string, Justesse>();
  const noter = (attribut: string, source: SourceConstat, juste: boolean) => {
    const k = attribut + '|' + source;
    const l = m.get(k) ?? { attribut, source, decisions: 0, justes: 0, taux: 0 };
    l.decisions++; if (juste) l.justes++;
    m.set(k, l);
  };
  for (const f of fichiers) for (const p of f.propositions) {
    if (p.decision === null) continue;
    for (const a of (p.arbitrages ?? []) as ArbitrageProposition[]) {
      if (a.decision === 'rien' || a.decision === 'forcee') continue;
      for (const g of a.groupes) {
        if (p.decision === 'refusee' && !g.retenu) continue;
        const juste = p.decision === 'validee' && g.retenu;
        for (const s of new Set(g.lignes.map((l) => l.source))) if ((SOURCES as readonly string[]).includes(s)) noter(a.attribut, s as SourceConstat, juste);
      }
    }
  }
  return [...m.values()].map((l) => ({ ...l, taux: l.justes / l.decisions })).sort((x, y) => x.attribut.localeCompare(y.attribut) || x.source.localeCompare(y.source));
}

export interface PoidsPropose { attribut: string; source: SourceConstat; actuel: number; propose: number; taux: number; decisions: number }

const arrondi = (x: number): number => Math.round(x * 10) / 10;

/** Le poids qu'une justesse dit : celui d'aujourd'hui fois (taux / reference), borne a ±50 %, au dixieme. */
export function poidsSelonJustesse(actuel: number, taux: number): number {
  const facteur = Math.min(1 + VARIATION_MAX, Math.max(1 - VARIATION_MAX, taux / JUSTESSE_DE_REFERENCE));
  return arrondi(actuel * facteur);
}

/** Les poids a changer, pour chaque couple (attribut, source) lu au moins `decisionsMin` fois ; ceux qui ne bougent pas de 10 % sont tus. */
export function poidsProposes(justesses: readonly Justesse[], regles: ReglesReconciliation, decisionsMin: number = DECISIONS_MIN): PoidsPropose[] {
  const out: PoidsPropose[] = [];
  for (const j of justesses) {
    const a = regles.attributs[j.attribut as keyof ReglesReconciliation['attributs']];
    // Ce que la personne a vu devant le batiment n'est pas une lecture a recaler : son poids est une regle, pas une mesure.
    if (!a || j.source === 'terrain' || j.decisions < decisionsMin) continue;
    const actuel = a.poids[j.source] ?? regles.sources[j.source].poids;
    const propose = poidsSelonJustesse(actuel, j.taux);
    if (Math.abs(propose - actuel) < ECART_MIN * actuel || propose <= 0) continue;
    out.push({ attribut: j.attribut, source: j.source, actuel, propose, taux: j.taux, decisions: j.decisions });
  }
  return out;
}

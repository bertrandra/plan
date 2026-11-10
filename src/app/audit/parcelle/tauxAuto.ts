// Le taux de decisions automatiques des audits recus (MD/spec-reconciliation.md R7) : de quoi regler les poids et les seuils de
// `regles/reconciliation.json` sur ce que le moteur a vraiment decide, plutot que sur l'intuition.
//
// Deux mesures : combien d'arbitrages le moteur a tranches seul, et parmi ceux-la combien la personne a refuses (le moteur s'est
// trompe, ou la personne a change d'avis) ; combien attendaient la personne, et pourquoi (les sources se contredisent, une source qui
// ne decide pas seule, un score trop bas, une valeur que la personne avait choisie). Une cause qui revient dit quel poids ou quel seuil
// regler : jamais le code.

import type { FichierAuditParcelle } from '../../../model/fichierAuditParcelle.js';
import type { ArbitrageProposition } from '../../../regles/decisions.js';

export type CauseManuelle = 'contradiction' | 'source-seule' | 'score' | 'valeur-choisie' | 'autre';

export interface LigneTaux {
  attribut: string;
  libelle: string;
  auto: number;
  /** Tranches par le moteur, puis refusees par la personne. */
  autoRefusees: number;
  manuelles: number;
  choisies: number;
  forcees: number;
}

export interface TauxDesAudits {
  audits: number;
  /** Les arbitrages portes par des propositions : les « rien a changer » n'y sont pas. */
  arbitrages: number;
  parAttribut: LigneTaux[];
  causes: Record<CauseManuelle, number>;
  /** Part des decisions a prendre que le moteur a tranchees seul. */
  partAuto: number;
  /** Part des decisions automatiques que la personne a gardees (validees). */
  partAutoGardee: number;
}

/** Pourquoi une decision a attendu la personne, d'apres la raison que le moteur a ecrite. */
export function causeManuelle(raison: string): CauseManuelle {
  if (/se contredisent/.test(raison)) return 'contradiction';
  if (/ne décide pas/.test(raison)) return 'source-seule';
  if (/Score insuffisant/.test(raison)) return 'score';
  if (/Remplace une valeur que vous avez choisie/.test(raison)) return 'valeur-choisie';
  return 'autre';
}

const CAUSES_VIDES = (): Record<CauseManuelle, number> => ({ contradiction: 0, 'source-seule': 0, score: 0, 'valeur-choisie': 0, autre: 0 });

export function tauxDesAudits(fichiers: readonly FichierAuditParcelle[]): TauxDesAudits {
  const lignes = new Map<string, LigneTaux>();
  const causes = CAUSES_VIDES();
  let arbitrages = 0;
  for (const f of fichiers) {
    for (const p of f.propositions) {
      for (const a of (p.arbitrages ?? []) as ArbitrageProposition[]) {
        if (a.decision === 'rien') continue;
        arbitrages++;
        const l = lignes.get(a.attribut) ?? { attribut: a.attribut, libelle: a.libelle, auto: 0, autoRefusees: 0, manuelles: 0, choisies: 0, forcees: 0 };
        if (a.decision === 'auto') { l.auto++; if (p.decision === 'refusee') l.autoRefusees++; }
        else if (a.decision === 'manuelle') { l.manuelles++; causes[causeManuelle(a.raison)]++; }
        else if (a.decision === 'choisie') l.choisies++;
        else l.forcees++;
        lignes.set(a.attribut, l);
      }
    }
  }
  const parAttribut = [...lignes.values()].sort((x, y) => x.attribut.localeCompare(y.attribut));
  const somme = (k: 'auto' | 'autoRefusees' | 'manuelles' | 'choisies' | 'forcees') => parAttribut.reduce((n, l) => n + l[k], 0);
  const decides = arbitrages;
  return {
    audits: fichiers.length, arbitrages, parAttribut, causes,
    partAuto: decides ? somme('auto') / decides : 1,
    partAutoGardee: somme('auto') ? 1 - somme('autoRefusees') / somme('auto') : 1,
  };
}

/** Le tableau du taux, en texte : une ligne par attribut, puis le total et les causes. */
export function direTaux(t: TauxDesAudits): string {
  const pct = (x: number) => Math.round(x * 100) + ' %';
  if (!t.arbitrages) return t.audits + ' audit' + (t.audits > 1 ? 's' : '') + ' : aucun arbitrage à compter (les audits d’avant la réconciliation n’en portent pas).';
  const out = [t.audits + ' audit' + (t.audits > 1 ? 's' : '') + ', ' + t.arbitrages + ' décision' + (t.arbitrages > 1 ? 's' : '') + ' : ' + pct(t.partAuto) + ' automatiques, dont ' + pct(t.partAutoGardee) + ' gardées par la personne.'];
  for (const l of t.parAttribut) out.push('  ' + l.libelle.padEnd(26) + ' auto ' + l.auto + ' (refusées ' + l.autoRefusees + ') · à vous ' + l.manuelles + ' · choisies ' + l.choisies + ' · forcées ' + l.forcees);
  const causes = (Object.entries(t.causes) as [CauseManuelle, number][]).filter(([, n]) => n).map(([c, n]) => c + ' ' + n);
  if (causes.length) out.push('  À vous, pourquoi : ' + causes.join(' · ') + '.');
  return out.join('\n');
}

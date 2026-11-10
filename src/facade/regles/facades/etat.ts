// La regle de l'etat du bati (lot L1 de MD/spec-lecture-ia-elargie.md, decision 8) : une fissure, un enduit abime, de l'humidite ou des
// mousses lus sur la photo d'une facade sont un SIGNAL. Ils se disent (« Signalé par Claude, à vérifier »), dates, sur la Facade validee
// (`etat`) ; ils ne proposent rien, ne changent aucun nombre et n'entrent dans aucun export remis a un tiers. Pur.

import type { EtatBati } from '../../../model/types.js';
import type { ConfianceIa, ObservationsFacade } from '../../../regles/facades/observations.js';

const r3 = (v: number) => Math.round(v * 1000) / 1000;

const CONFIANCES: Readonly<Record<Exclude<ConfianceIa, 'indetermine'>, number>> = { forte: 0.9, moyenne: 0.6, faible: 0.3 };

/** L'etat du mur signale (decision 8), date du jour `vuLe` ; un signal sans confiance dite n'est pas garde. */
export function etatDeLIa(obs: ObservationsFacade | null, vuLe: string): EtatBati[] {
  return (obs?.etat ?? []).filter((e) => e.confiance !== 'indetermine')
    .map((e) => ({ nature: e.nature, zone: { u0: r3(e.u0), u1: r3(e.u1), v0: r3(e.v0), v1: r3(e.v1) }, confiance: CONFIANCES[e.confiance as keyof typeof CONFIANCES], vuLe }));
}

const NATURES_ETAT: Readonly<Record<EtatBati['nature'], string>> = { fissure: 'une fissure', 'enduit-abime': 'un enduit abîmé', humidite: 'des traces d’humidité', mousses: 'des mousses', autre: 'un défaut' };

/** Le signal en clair : « Signalé par Claude, à vérifier : une fissure, des traces d’humidité. » ; null sans signal. */
export function direEtat(etat: readonly Pick<EtatBati, 'nature'>[]): string | null {
  if (!etat.length) return null;
  return 'Signalé par Claude, à vérifier : ' + [...new Set(etat.map((e) => NATURES_ETAT[e.nature]))].join(', ') + '.';
}


// L'accord de la lecture de Claude d'une facade, tel que l'audit le garde (AccordFacadeCapture) : celui que l'enchainement de la facade a
// fait a l'E8, la lecture de Claude (decision 4 du proprietaire, 3 novembre 2026 : Claude passe par la meme orchestration dans l'audit et la calibration).
// La mesure de la facade le porte (mesures.ts) ; l'analyse le relit (runsFacades.ts::accordsDesMesures). Pur.

import { texteAccord } from '../../../facade/regles/facades/ia.js';
import type { Enchainement } from '../../../facade/releve/enchainement.js';
import type { AccordFacadeCapture } from '../../../model/auditParcelle.js';

/** La confiance que Claude se donne sur une facade, en part : il dit faible, moyenne ou forte, jamais un nombre. */
const CONFIANCE_DU_RUN = { faible: 0.5, moyenne: 0.75, forte: 0.9 } as const;

/** L'accord de Claude tel que l'audit le garde, d'apres celui que l'enchainement a fait (E8) ; null sans lecture lisible. */
export function accordDeLaLecture(ia: Pick<NonNullable<Enchainement['sorties']['ia']>, 'reponse' | 'accord' | 'descentes'> | null | undefined): AccordFacadeCapture | null {
  const a = ia?.accord, obs = ia?.reponse;
  if (!a || !obs) return null;
  // Des boites toutes retrouvees, sans detail de plus, ne changent rien au releve : il n'y a rien a proposer.
  const change = a.bilan.devineesConfirmees + a.bilan.seules + a.bilan.detailsAjoutes > 0;
  return { ouvertures: a.ouvertures, decochees: a.decochees, bilan: { ...a.bilan }, resume: change ? texteAccord(a.bilan) : null, confiance: CONFIANCE_DU_RUN[obs.confiance], ...(ia.descentes?.length ? { descentes: ia.descentes } : {}) };
}


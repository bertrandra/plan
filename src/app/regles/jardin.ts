// Le sujet « jardin » de l'audit (lot L3 de la lecture IA elargie) : ce que l'audit sait proposer de la lecture du jardin par Claude.
//
// Ce n'est pas un sujet de l'analyse d'une maison (app/regles/sujets/, `SUJETS`) : il ne lit pas un batiment, il lit la parcelle, sur
// son orthophoto, par sa propre requete (usage `jardin`, deploy/prompt-jardin.md). Il suit pourtant la meme discipline : Claude observe
// (src/regles/jardin/observations.ts), les regles decident (facade/regles/jardin.ts, seuils dans regles/jardin/reglages.json), ce module
// en fait des propositions typees (regles/decisions.ts), et la personne confirme dans l'avant/apres de l'audit. **Chaque ligne arrive
// decochee** : un objet lu sur une photo du dessus se confirme toujours, comme une forme de toit lue sur une facade.

import reglagesBruts from '../../../regles/jardin/reglages.json';
import { decisionsDuJardin, type DecisionJardin, type EcartJardin } from '../../facade/regles/jardin.js';
import { lireObservationsJardin, type RunJardin } from '../../regles/jardin/observations.js';
import { lireReglagesJardin, type ReglagesJardin } from '../../regles/jardin/reglages.js';
import { parcelleDuProjet } from '../../model/fonctions.js';
import type { EspeceArbre } from '../../model/especesArbre.js';
import type { ObjetPlan } from '../../model/types.js';
import type { EffetProposition, Proposition } from '../../regles/decisions.js';

/** Les seuils livres (regles/jardin/reglages.json), lus et verifies une fois. */
export const REGLAGES_JARDIN: ReglagesJardin = lireReglagesJardin(reglagesBruts);

/** La phrase de toute ligne du jardin : pourquoi elle arrive decochee. */
export const RESERVE_JARDIN = 'Lu sur la photo aérienne : confirmez-le avant de l’ajouter au plan.';

function effetDe(d: DecisionJardin): EffetProposition {
  switch (d.effet.type) {
    case 'objet': return { type: 'ajoutObjet', objet: d.effet.objet };
    case 'cloture': return { type: 'cloture', cote: d.effet.cote, typeCloture: d.effet.typeCloture, ...(d.effet.hauteurM !== undefined ? { hauteurM: d.effet.hauteurM } : {}) };
    case 'portail': return { type: 'portail', cote: d.effet.cote, nature: 'portail', position: d.effet.position };
  }
}

/** Les cotes de la cloture que d'autres lignes reglent deja (les photos de la rue) : la lecture du jardin ne les redit pas. */
function cotesDejaProposes(autres: readonly Proposition[]): Set<string> {
  return new Set(autres.flatMap((p) => (p.effet.type === 'cloture' || p.effet.type === 'portail' ? [p.effet.type + ':' + p.effet.cote] : [])));
}

/**
 * Les propositions de la lecture du jardin enregistree : celles que le moteur decide, decochees, chacune avec ses indices (ce que Claude
 * a vu, et sur quelle image), sa certitude et ce que la regle a suppose. Une cloture ou un portail qu'une autre ligne regle deja n'y est
 * pas. Rend aussi les observations ecartees, pour l'ecran.
 */
export function propositionsDuJardin(run: RunJardin, objets: readonly ObjetPlan[], especes: readonly EspeceArbre[], autres: readonly Proposition[] = [], reglages: ReglagesJardin = REGLAGES_JARDIN): { propositions: Proposition[]; ecartees: EcartJardin[] } {
  const observations = lireObservationsJardin(run.sortie);
  const parcelle = parcelleDuProjet(objets as ObjetPlan[]);
  if (!observations || !parcelle || parcelle.type !== 'polygon') return { propositions: [], ecartees: [] };
  const { decisions, ecartees } = decisionsDuJardin({ observations, cadrage: run.cadrage, parcelle: parcelle.pts, objets, especes, reglages });
  const pris = cotesDejaProposes(autres);
  const propositions = decisions.filter((d) => d.effet.type === 'objet' || !pris.has(d.effet.type + ':' + d.effet.cote)).map((d): Proposition => ({
    id: d.id, cible: { type: 'parcelle' }, objet: d.objet,
    avant: d.effet.type === 'objet' ? 'absent du plan' : 'côté tel qu’il est',
    apres: d.apres, source: 'claude',
    indices: d.indices.map((i) => ({ texte: i.vu + ' (' + (i.image <= 1 ? 'photo aérienne' : 'photo ' + (i.image - 1) + ' de la clôture') + ')' })),
    confiance: d.confiance, remplaceChoix: null,
    reserve: RESERVE_JARDIN + (d.suppose ? ' Supposé : ' + d.suppose + '.' : ''),
    effet: effetDe(d),
  }));
  return { propositions, ecartees };
}

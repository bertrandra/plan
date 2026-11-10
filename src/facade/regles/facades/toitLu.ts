// Les regles du toit lu sur une facade (lot L2 de MD/spec-lecture-ia-elargie.md §3.2, §4.3, §5.1 point 3) : ce que le moteur decide
// de ce que la troisieme requete de la lecture d'une facade lit du toit au-dessus du mur.
// - La couverture et sa pose deviennent un constat de la photo de facade, que l'arbitrage des sources fait passer devant l'analyse d'une
//   maison et les fichiers fonciers : la plus proche l'emporte (question 8 de la spec, regles/reconciliation.json `prioritaires`).
// - Le debord lu ne change rien : le dessin garde celui du toit (une observation, sinon le defaut du dessin, a defaut de mesure LiDAR),
//   et un ecart de classe se DIT (une alerte), sans case (§3.2 : « le LiDAR l'emporte, la photo signale un ecart »).
// - Le faitage et la gouttiere vont aux bords du corps de ce mur, proposes decoches.
// - Une fenetre de toit ou un champ de panneaux s'adresse au corps par son MUR ; le moteur des toits la pose sur le pan de ce mur
//   (corpsSousContrainte, facade/regles/toits/elementsDesMurs.ts::elementToitPoseSurLeMur). Rien n'est ecrit ici. Pur.

import { couvertureDuMot, libelleMotCouverture, motDeLaCouverture, type MotCouverture } from '../../../model/couvertureLue.js';
import type { Facade } from '../../../geometry/cotesVusDeDehors.js';
import type { BordsToit, CorpsToit } from '../../../model/types.js';
import type { ElementToitDeMurFait } from '../../../regles/toits/faits.js';
import type { ConfianceIa, ObservationsFacade, ToitLuIa } from '../../../regles/facades/observations.js';

/** Le nom de la regle qui fait passer la couverture lue sur une facade devant les autres sources (regles/reconciliation.json). */
export const REGLE_COUVERTURE_FACADE = 'couverture lue sur la façade';

/** La confiance d'un constat, depuis le mot de Claude. */
const CONFIANCE: Readonly<Record<ConfianceIa, number>> = { forte: 0.9, moyenne: 0.7, faible: 0.45, indetermine: 0.6 };

/** La couverture lue sur une facade, en mot d'arbitrage (materiau et pose) ; null sans couverture que le projet range (`gravillons`). */
export function couvertureLueSurLaFacade(obs: ObservationsFacade | null): { mot: MotCouverture; confiance: number } | null {
  const t = obs?.toit;
  const c = t?.couverture ? couvertureDuMot(t.couverture) : null;
  if (!t || !c || t.confiance === 'faible') return null;
  return { mot: motDeLaCouverture(c.couverture, t.pose ?? c.pose), confiance: CONFIANCE[t.confiance] };
}

/**
 * Le debord que dessine un corps sans observation (three/toitCorps3d.ts, « 35 cm a l'egout ») : la reference de l'alerte quand rien ne
 * l'a mesure. Les classes lues se comparent a lui : `aucun` sous DEBORD_FAIBLE_MIN_M, `fort` au-dela de DEBORD_FORT_MIN_M.
 */
export const DEBORD_DESSIN_M = 0.35;
/** Un debord de moins que cela n'en est pas un (un toit qui s'arrete au nu du mur, une rive maconnee). */
export const DEBORD_FAIBLE_MIN_M = 0.1;
/** Un debord de plus que cela est un avant-toit (un chalet, une ferme) : il fait de l'ombre au mur. */
export const DEBORD_FORT_MIN_M = 0.6;

const classeDebord = (m: number): NonNullable<ToitLuIa['debord']> => (m < DEBORD_FAIBLE_MIN_M ? 'aucun' : m > DEBORD_FORT_MIN_M ? 'fort' : 'faible');
const DIT: Readonly<Record<NonNullable<ToitLuIa['debord']>, string>> = { aucun: 'aucun débord', faible: 'un débord faible', fort: 'un fort débord' };
const f2 = (x: number) => String(Math.round(x * 100) / 100).replace('.', ',');

/**
 * L'alerte du debord (jamais une proposition) : quand la classe lue sur la facade n'est pas celle du debord que dessine le corps de ce
 * mur, en mots ; null s'ils s'accordent, ou sans lecture. Le debord du toit ne change pas.
 */
export function alerteDebord(obs: ObservationsFacade | null, corps: CorpsToit | null | undefined): string | null {
  const lu = obs?.toit?.debord;
  if (!lu || !corps || obs?.toit?.confiance === 'faible') return null;
  const m = corps.bords?.debordEgoutM ?? DEBORD_DESSIN_M;
  if (classeDebord(m) === lu) return null;
  return 'Claude voit ' + DIT[lu] + ' sur cette façade ; le toit garde le sien (' + f2(m) + ' m' + (corps.bords?.debordEgoutM === undefined ? ', celui du dessin' : '') + '). Vérifiez-le au Mode Toit si la photo le montre bien.';
}

/** Le faitage et la gouttiere lus, quand ils different de ceux du corps ; null sans rien a proposer. */
export function bordsLus(obs: ObservationsFacade | null, corps: CorpsToit | null | undefined): Pick<BordsToit, 'faitage' | 'gouttiere'> | null {
  const t = obs?.toit;
  if (!t || !corps || t.confiance === 'faible') return null;
  const out: Pick<BordsToit, 'faitage' | 'gouttiere'> = {};
  if (t.faitage && t.faitage !== corps.bords?.faitage) out.faitage = t.faitage;
  if (t.gouttiere && t.gouttiere !== corps.bords?.gouttiere) out.gouttiere = t.gouttiere;
  return Object.keys(out).length ? out : null;
}

const FAITAGES: Readonly<Record<NonNullable<ToitLuIa['faitage']>, string>> = { tuiles: 'faîtage en tuiles faîtières', zinc: 'faîtage en zinc', crete: 'faîtage à crête décorée' };
const GOUTTIERES: Readonly<Record<NonNullable<ToitLuIa['gouttiere']>, string>> = { pendante: 'gouttière pendante', nantaise: 'gouttière nantaise', aucune: 'sans gouttière' };

/** Des bords lus, en clair : « faîtage en zinc, gouttière pendante ». */
export const direBords = (b: Pick<BordsToit, 'faitage' | 'gouttiere'>): string => [b.faitage ? FAITAGES[b.faitage] : null, b.gouttiere ? GOUTTIERES[b.gouttiere] : null].filter(Boolean).join(', ');

/** Un element du pan a poser : sa place sur la facade, et ce que le moteur relira. */
export interface PropositionElementToit { u0: number; u1: number; element: 'fenetre-toit' | 'solaire'; observation: { elementsToitDesMurs: [ElementToitDeMurFait] } }

/**
 * Les fenetres de toit et panneaux vus au-dessus d'une facade de `egoutM` metres, adresses au corps par le mur de la facade : la place
 * le long du mur en metres, la hauteur en metres par le calage du mur (decision 4). Un element de confiance faible n'est pas propose.
 */
export function elementsToitProposes(obs: ObservationsFacade | null, facade: Facade, egoutM: number): PropositionElementToit[] {
  return (obs?.elementsToit ?? []).filter((e) => e.confiance !== 'faible').map((e) => ({
    u0: e.u0, u1: e.u1, element: e.element,
    observation: { elementsToitDesMurs: [{ mur: { gauche: facade.gauche, droite: facade.droite }, element: e.element, de: Math.round(e.u0 * facade.largeur * 100) / 100, a: Math.round(e.u1 * facade.largeur * 100) / 100, hauteurM: Math.round(e.v * egoutM * 100) / 100 }] },
  }));
}

/** Le toit lu, en mots pour l'ecran de la facade : « couverture : ardoise en écaille, faîtage en zinc, gouttière pendante ». */
export function direToitLu(obs: ObservationsFacade | null): string | null {
  const t = obs?.toit;
  if (!t) return null;
  const c = couvertureLueSurLaFacade(obs);
  const morceaux = [c ? 'couverture : ' + libelleMotCouverture(c.mot).toLowerCase() : null, t.faitage ? FAITAGES[t.faitage] : null, t.gouttiere ? GOUTTIERES[t.gouttiere] : null];
  const n = obs?.elementsToit.length ?? 0;
  if (n) morceaux.push(n + (n > 1 ? ' éléments sur le pan (fenêtres de toit, panneaux)' : ' élément sur le pan (fenêtre de toit ou panneau)'));
  const dit = morceaux.filter(Boolean).join(', ');
  return dit || null;
}

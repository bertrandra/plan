// De la silhouette des facades aux bouts du faitage (spec des toits §14) : ce que la ligne au-dessus de
// l'egout de chaque mur dit des deux bouts du toit, dit comme une observation du moteur (ObservationFait).
//
// - Un mur au bout du faitage (sa normale suit l'axe) dit ce qui ferme ce bout : un triangle de mur est
//   un pignon, un pan de toit incline une croupe, une rampe un appentis.
// - Un mur sur le long pan (sa normale croise l'axe) le dit aussi, mais de biais : un trapeze (le haut du
//   toit est plus court que l'egout) est un toit a croupes, un bandeau a hauteur constante un deux-pans
//   (sauf toit plat). Il ne sert qu'a un bout que nul mur de bout ne montre : un mur de bout l'emporte.
//
// Le module ne dessine rien : il rend une observation, que corpsSousContrainte (faits.ts) relit sur la
// mesure LiDAR comme tout fait du batiment ; la mesure donne toujours les hauteurs.

import { azimutDe, azimutFaitage, plusGrand } from './faits.js';
import type { BoutFait, ObservationFait } from '../../../regles/toits/faits.js';
import type { CorpsToit, FormeToitSimple, PtBrut } from '../../../model/types.js';
import { libelleSilhouette, type SilhouetteFacade } from '../../../model/silhouetteFacade.js';
import type { ToitEstime } from '../../toit.js';

/** Un mur dont la normale est a moins de cela de l'axe du faitage ferme un bout ; a plus de 60 degres, c'est un long pan. */
export const TOLERANCE_BOUT_DEG = 30;

/** Ce que l'on sait d'une facade : l'azimut de sa normale sortante (0 = nord, sens horaire), sa silhouette, son nom. */
export interface SilhouetteLue { azimut: number; silhouette: SilhouetteFacade; nom: string }

/** Ce qu'on a lu : l'observation pour le moteur, les murs qui l'ont portee, ce qui se contredit. */
export interface BoutsLus {
  observation: ObservationFait;
  /** Les murs qui ont dit quelque chose, avec ce qu'ils disent (« pignon », « croupe »...). */
  vus: { nom: string; dit: string; role: 'bout' | 'long' }[];
  /** Un bout dit autrement par un mur de bout et par un long pan, ou par deux murs du meme bout. */
  conflits: string[];
}

const ecart180 = (a: number, b: number): number => { const d = Math.abs(a - b) % 180; return Math.min(d, 180 - d); };

/** L'azimut du faitage du corps principal ; sans corps, celui du plus long cote du contour (un toit se pose le long du bati). */
export function axeDuToit(corps: readonly CorpsToit[] | null | undefined, contour: readonly PtBrut[]): number | null {
  if (corps?.length) return azimutFaitage(corps[plusGrand(corps)] as CorpsToit);
  let meilleur: { l: number; a: number } | null = null;
  for (let i = 0; i < contour.length; i++) {
    const p = contour[i] as PtBrut, q = contour[(i + 1) % contour.length] as PtBrut;
    const l = Math.hypot(q.x - p.x, q.y - p.y);
    if (!meilleur || l > meilleur.l) meilleur = { l, a: azimutDe(q.x - p.x, q.y - p.y) };
  }
  return meilleur ? meilleur.a : null;
}

const DIT_BOUT: Partial<Record<SilhouetteFacade, string>> = { pignon: 'pignon', croupe: 'croupe', rampe: 'rampe' };

/** Le bout que dit un mur du long pan : un trapeze, des croupes ; un bandeau droit, des pignons (pas sous un toit plat). */
function ditLePan(s: SilhouetteFacade, plat: boolean): BoutFait | null {
  if (s === 'trapeze') return 'croupe';
  if (s === 'rectangle' && !plat) return 'pignon';
  return null;
}

/** L'accord des valeurs : la valeur commune, null si aucune ou si elles divergent. */
const commune = <T>(xs: readonly T[]): T | null => (xs.length && xs.every((x) => x === xs[0]) ? (xs[0] as T) : null);

/**
 * Les bouts du faitage que disent les silhouettes des facades, ou null quand elles n'en disent pas assez :
 * il faut les deux bouts (un pignon ou une croupe chacun), ou une rampe a chaque bout dit (un appentis).
 * `plat` : le toit lu est plat, un bandeau droit ne dit alors rien.
 */
export function observationDesSilhouettes(axeDeg: number, lues: readonly SilhouetteLue[], plat = false): BoutsLus | null {
  const bout: Record<0 | 1, { nom: string; v: string }[]> = { 0: [], 1: [] };
  const pan: Record<0 | 1, { nom: string; v: BoutFait }[]> = { 0: [], 1: [] };
  const vus: BoutsLus['vus'] = [];
  for (const l of lues) {
    if (l.silhouette === 'indetermine') continue;
    const d = ecart180(l.azimut % 180, axeDeg);
    // Quel bout : celui vers lequel regarde le mur, le long de l'axe (de 0 a 180 degres, sens horaire).
    const cote = Math.cos(((l.azimut - axeDeg) * Math.PI) / 180) >= 0 ? 0 : 1;
    if (d <= TOLERANCE_BOUT_DEG) {
      const dit = DIT_BOUT[l.silhouette];
      if (dit) { bout[cote].push({ nom: l.nom, v: dit }); vus.push({ nom: l.nom, dit, role: 'bout' }); }
    } else if (d >= 90 - TOLERANCE_BOUT_DEG) {
      const dit = ditLePan(l.silhouette, plat);
      if (dit) {
        // Un long pan parle des deux bouts a la fois.
        pan[0].push({ nom: l.nom, v: dit }); pan[1].push({ nom: l.nom, v: dit });
        vus.push({ nom: l.nom, dit, role: 'long' });
      }
    }
  }
  const conflits: string[] = [];
  const valeur: (string | null)[] = [0, 1].map((k) => {
    const b = bout[k as 0 | 1], p = pan[k as 0 | 1];
    const dB = commune(b.map((x) => x.v));
    if (b.length && dB === null) conflits.push('les murs du même bout du toit se contredisent : ' + b.map((x) => x.nom + ' ' + x.v).join(', '));
    const dP = commune(p.map((x) => x.v));
    if (p.length && dP === null) conflits.push('les longs pans se contredisent : ' + p.map((x) => x.nom + ' ' + x.v).join(', '));
    if (dB && dP && dB !== 'rampe' && dB !== dP) conflits.push('un mur de bout dit ' + dB + ', un long pan dit ' + dP);
    return dB ?? dP;
  });
  const [a, b] = valeur as [string | null, string | null];
  const estBout = (x: string | null): x is BoutFait => x === 'pignon' || x === 'croupe';
  if (estBout(a) && estBout(b)) return { observation: { bouts: [a, b] }, vus, conflits };
  const rampes = valeur.filter((x) => x === 'rampe').length;
  if (rampes && valeur.every((x) => x === 'rampe' || x === null)) {
    const forme: FormeToitSimple[] = ['appentis'];
    return { observation: { forme }, vus, conflits };
  }
  return null;
}

/** Les murs lus, en clair : « façade est : pignon ». */
export const direLesMurs = (lues: readonly SilhouetteLue[]): string =>
  lues.filter((l) => l.silhouette !== 'indetermine').map((l) => l.nom + ' : ' + libelleSilhouette(l.silhouette)).join(' ; ');

/**
 * La silhouette que la photo donne a Plan (`classerProfil`, facade/toit.ts). Un triangle est lu « pignon » : vu de face,
 * une croupe donne le meme triangle, c'est Claude qui voit si le haut est du mur ou du toit. Un haut sans rien
 * (toit plat, ou toit hors cadre) ne dit rien.
 */
export function silhouetteDeEstimation(e: ToitEstime | null | undefined): SilhouetteFacade {
  if (!e || e.forme === 'plat') return 'indetermine';
  if (e.forme === 'appentis') return 'rampe';
  if (e.forme === 'quatre-pans') return 'trapeze';
  return e.faitage === 'perpendiculaire' ? 'pignon' : 'rectangle';
}

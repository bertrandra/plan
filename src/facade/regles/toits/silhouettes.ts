// De la silhouette des facades au sens du faitage et aux bouts du toit (spec des toits §14) : ce que la ligne au-dessus
// de l'egout de chaque mur dit du toit, dit comme une observation du moteur (ObservationFait), que corpsSousContrainte
// (faits.ts) relit sur la mesure LiDAR comme tout fait du batiment : le toit se recalcule avec ces parametres, la mesure
// donne toujours les hauteurs. Les mots sont ceux de la reponse de Claude (model/silhouetteFacade.ts).
//
// - Une facade qui ferme un bout du faitage (`bout` : pignon, croupe ; ou, sans `bout`, un triangle ou des marches) a le
//   faitage perpendiculaire a elle ; une rampe unique est le mur d'un appentis, faitage perpendiculaire aussi.
// - Une facade qui est un long pan (`bout` : sans-objet ; ou, sans `bout`, un trapeze ou une ligne droite) a le faitage
//   parallele a elle ; elle dit aussi les bouts, de biais : un trapeze, des croupes ; une ligne droite, des pignons
//   (sauf sous un toit plat). Un mur de bout l'emporte sur elle.
// - Le sens retenu est celui que soutiennent le plus de murs (leur largeur) ; les murs qui en disent un autre ne comptent pas.
// - Un `bout` que le moteur ne sait pas produire (demi-croupe, brisis) donne le sens du faitage, jamais les bouts.
//
// Les seuils et la table de lecture ne sont pas ici : ils sont dans regles/toits/silhouettes.json (src/regles/toits/silhouettes.ts),
// que l'ecran Admin › Regles montre et edite. Ce module les applique.

import { azimutDe, azimutFaitage, plusGrand } from './faits.js';
import type { BoutFait, ObservationFait } from '../../../regles/toits/faits.js';
import type { CorpsToit, FormeToitSimple, PtBrut } from '../../../model/types.js';
import { libelleSilhouette, type BoutVu, type SilhouetteFacade } from '../../../model/silhouetteFacade.js';
import { SILHOUETTES_TOITS, type SilhouettesToits, type ValeurSilhouette } from '../../../regles/toits/silhouettes.js';
import type { ToitEstime } from '../../toits/toit.js';

/** Ce que l'on sait d'une facade : l'azimut de sa normale sortante (0 = nord, sens horaire), sa largeur, sa silhouette, ce qu'elle ferme, son nom. */
export interface SilhouetteLue { azimut: number; largeurM: number; silhouette: SilhouetteFacade; bout?: BoutVu; nom: string }

/** Ce qu'on a lu : l'observation pour le moteur, les murs qui l'ont portee, ce qui se contredit. */
export interface BoutsLus {
  observation: ObservationFait;
  /** Les murs qui ont dit quelque chose : ce qu'ils montrent, le role qu'ils ont pris et ce qu'ils disent. */
  vus: { nom: string; silhouette: SilhouetteFacade; role: 'bout' | 'long'; dit: string }[];
  /** Un bout dit autrement par un mur de bout et par un long pan, ou par deux murs du meme bout ; deux sens de faitage. */
  conflits: string[];
  /**
   * Les murs qui montrent un pignon en travers du sens retenu : des pignons traversants sur le long pan qu'ils sont (decision de
   * l'utilisateur, 19 octobre 2026). Ils ne comptent pas comme un second sens de faitage.
   */
  traversants: SilhouetteLue[];
}

const ecart180 = (a: number, b: number): number => { const d = Math.abs(a - b) % 180; return Math.min(d, 180 - d); };
const mod180 = (a: number): number => ((a % 180) + 180) % 180;
const dixieme = (v: number): number => Math.round(v * 10) / 10;

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

type Valeur = ValeurSilhouette | null;
/** Le role d'un mur et ce qu'il dit. */
interface Lecture { role: 'bout' | 'long'; valeur: Valeur }

/** La premiere ligne de la table dont la condition est tenue (regles/toits/silhouettes.json) : le `bout` de Claude d'abord, la silhouette sinon. */
function lire(l: SilhouetteLue, plat: boolean, regles: SilhouettesToits): Lecture | null {
  const b = l.bout ?? 'indetermine';
  for (const r of regles.lecture) {
    if (r.si.bout !== undefined && r.si.bout !== b) continue;
    if (r.si.silhouette && !(r.si.silhouette as readonly string[]).includes(l.silhouette)) continue;
    if (r.si.toitPlat === false && plat) continue;
    return r.role === null ? null : { role: r.role, valeur: r.valeur ?? null };
  }
  return null;
}

/** L'azimut du faitage que dit un mur, modulo 180 : perpendiculaire a un mur de bout, parallele a un long pan. */
const axeDit = (azimut: number, role: 'bout' | 'long'): number => mod180(role === 'bout' ? azimut : azimut + 90);

/** L'accord des valeurs : la valeur commune, null si aucune ou si elles divergent. */
const commune = <T>(xs: readonly T[]): T | null => (xs.length && xs.every((x) => x === xs[0]) ? (xs[0] as T) : null);

/**
 * Le sens du faitage et les bouts que disent les silhouettes des facades, ou null quand aucun mur ne dit rien.
 * `plat` : le toit lu est plat, une ligne droite ne dit alors rien des bouts. Sans les deux bouts, l'observation ne porte que
 * le sens du faitage : c'est encore un parametre que le moteur sait tenir.
 */
export function observationDesSilhouettes(lues: readonly SilhouetteLue[], plat = false, regles: SilhouettesToits = SILHOUETTES_TOITS): BoutsLus | null {
  const { TOLERANCE_BOUT_DEG, PART_SECOND_SENS } = regles.seuils;
  const dits = lues.flatMap((l) => { const d = lire(l, plat, regles); return d ? [{ l, ...d, axe: axeDit(l.azimut, d.role) }] : []; });
  if (!dits.length) return null;
  // Le sens que soutiennent le plus de murs (leur largeur) ; a poids egal, celui du premier.
  const poids = (a: number) => dits.filter((d) => ecart180(d.axe, a) <= TOLERANCE_BOUT_DEG).reduce((s, d) => s + Math.max(d.l.largeurM, 0.1), 0);
  const axe = dits.map((d) => d.axe).reduce((m, a) => (poids(a) > poids(m) + 1e-9 ? a : m));
  const retenus = dits.filter((d) => ecart180(d.axe, axe) <= TOLERANCE_BOUT_DEG);
  const conflits: string[] = [];
  const enTravers = dits.filter((d) => ecart180(d.axe, axe) > TOLERANCE_BOUT_DEG);
  // Un mur qui ferme un bout en pignon en travers du sens retenu : un pignon traversant, pas un second sens.
  const traversants = enTravers.filter((d) => d.role === 'bout' && d.valeur === 'pignon');
  const autres = enTravers.filter((d) => !traversants.includes(d));
  if (autres.length && autres.reduce((s, d) => s + Math.max(d.l.largeurM, 0.1), 0) >= PART_SECOND_SENS * poids(axe)) {
    conflits.push('les façades disent deux sens de faîtage (' + autres.map((d) => d.l.nom).join(', ') + ' : un autre sens que le principal) : plusieurs corps ?');
  }
  const pareil = (k: 0 | 1, role: 'bout' | 'long') => retenus.filter((d) => d.role === role && (role === 'long' || (Math.cos(((d.l.azimut - axe) * Math.PI) / 180) >= 0 ? 0 : 1) === k));
  const valeur = ([0, 1] as const).map((k) => {
    const b = pareil(k, 'bout'), p = pareil(k, 'long');
    const dB = commune(b.map((x) => x.valeur)), dP = commune(p.map((x) => x.valeur));
    if (b.length && dB === null) conflits.push('les murs du même bout du toit se contredisent : ' + b.map((x) => x.l.nom + ' ' + String(x.valeur)).join(', '));
    if (p.length && dP === null && p.some((x) => x.valeur)) conflits.push('les longs pans se contredisent : ' + p.map((x) => x.l.nom + ' ' + String(x.valeur)).join(', '));
    if (dB && dP && dB !== 'appentis' && dB !== 'hors-moteur' && dB !== dP) conflits.push('un mur de bout dit ' + dB + ', un long pan dit ' + dP);
    return dB ?? dP;
  });
  const estBout = (x: Valeur): x is BoutFait => x === 'pignon' || x === 'croupe';
  const observation: ObservationFait = { faitage: { par: 'azimut', azimutDeg: dixieme(axe) } };
  const [a, b] = valeur as [Valeur, Valeur];
  if (estBout(a) && estBout(b)) observation.bouts = [a, b];
  else if ((a === 'appentis' || b === 'appentis') && valeur.every((x) => x === 'appentis' || x === null)) observation.forme = ['appentis' satisfies FormeToitSimple];
  const vus: BoutsLus['vus'] = retenus.map((d) => ({ nom: d.l.nom, silhouette: d.l.silhouette, role: d.role, dit: d.valeur === null ? 'sans bout' : d.valeur === 'hors-moteur' ? (d.l.bout ?? 'bout') : d.valeur }));
  return { observation, vus, conflits, traversants: traversants.map((d) => d.l) };
}

/** Les murs lus, en clair : « façade est : triangle ». */
export const direLesMurs = (lues: readonly SilhouetteLue[]): string =>
  lues.filter((l) => l.silhouette !== 'indetermine').map((l) => l.nom + ' : ' + libelleSilhouette(l.silhouette)).join(' ; ');

/**
 * La silhouette que la photo donne a Plan (`classerProfil`, facade/toits/toit.ts). Un triangle de photo se lit « triangle » :
 * c'est Claude qui voit si le haut est du mur (pignon) ou du toit (croupe), par son `bout`. Un haut sans rien (toit plat,
 * ou toit hors cadre) ne dit rien.
 */
export function silhouetteDeEstimation(e: ToitEstime | null | undefined): SilhouetteFacade {
  if (!e || e.forme === 'plat') return 'indetermine';
  if (e.forme === 'appentis') return 'rampe';
  if (e.forme === 'quatre-pans') return 'trapeze';
  return e.faitage === 'perpendiculaire' ? 'triangle' : 'ligne-droite';
}

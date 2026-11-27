// Le parcours simple du mode Toit (maquette du 27 novembre 2026, demande du proprietaire : « je veux du simple ») : trois reglages pour
// modifier (la forme, la hauteur du faitage, son sens), six pieces pour ajouter. Tout le reste du mode reste la, range derriere « Plus de
// reglages ».
//
// Rien de neuf dans le calcul : la hauteur par pas est la poignee « Hauteur du faitage » tiree de dix centimetres (poignees.ts::glisser),
// le sens est celui de l'inspecteur (elements.ts, sens.ts). Ce module dit seulement sur quoi ces reglages agissent et ce que l'ecran en
// lit. Pur : pas de DOM, pas de scene.

import { formeDuCorpsNommee } from '../../model/formeToit.js';
import { LIBELLES_FORME_TOIT, angleDuPlusLongCote } from '../toits/toit.js';
import { enPoints } from '../../model/formes.js';
import { rangPrincipal, rangsDeCorps } from './corpsNeufs.js';
import { appliquerAuBatiment, appliquerChoix, type CibleElement } from './elements.js';
import { glisser } from './poignees.js';
import { sensDuCorps, sensDuToit, sensReglable, type Sens } from './sens.js';
import type { CorpsToit, FormeToit, ObjetPlan, PtBrut, Toit } from '../../model/types.js';

/** Le pas des boutons − et + de la hauteur du faitage, en metres. */
export const PAS_FAITAGE_M = 0.1;

/** Les quatre formes du parcours simple, dans l'ordre de la maquette : la piece du catalogue que pose chaque vignette, et son mot. */
export const FORMES_SIMPLES: readonly { piece: string; libelle: string }[] = [
  { piece: 'forme:plat', libelle: 'Plat' }, { piece: 'forme:appentis', libelle: 'Un pan' },
  { piece: 'forme:deux-pans', libelle: 'Deux pans' }, { piece: 'forme:croupes', libelle: 'Quatre pans' }
];

/** Les six pieces du parcours simple : la piece du catalogue, son mot, et le bouton qui la pose (« Poser la lucarne »). */
export const PIECES_SIMPLES: readonly { piece: string; libelle: string; poser: string }[] = [
  { piece: 'sur:jacobine', libelle: 'Lucarne', poser: 'Poser la lucarne' },
  { piece: 'sur:fenetre-toit', libelle: 'Fenêtre de toit', poser: 'Poser la fenêtre de toit' },
  { piece: 'sur:cheminee', libelle: 'Cheminée', poser: 'Poser la cheminée' },
  { piece: 'facade:auvent', libelle: 'Auvent', poser: 'Poser l’auvent' },
  { piece: 'facade:appentis-ferme', libelle: 'Appentis', poser: 'Poser l’appentis' },
  { piece: 'facade:galerie', libelle: 'Galerie', poser: 'Poser la galerie' }
];

const metres = (v: number): string => v.toFixed(1).replace('.', ',') + ' m';

/**
 * Le corps que reglent la hauteur et le sens : le corps choisi ; sans choix, le corps principal (le plus grand). Null quand un element
 * est choisi (une lucarne, un bow-window : ces reglages ne parlent pas de lui) ou qu'aucun corps n'existe encore.
 */
export function rangDesReglages(corps: readonly CorpsToit[], selection: CibleElement | null): number | null {
  if (selection) return selection.type === 'corps' && corps[selection.rang] && !corps[selection.rang]?.saillie ? selection.rang : null;
  const p = rangPrincipal(corps);
  return p >= 0 && corps[p] ? p : null;
}

/** Le faitage du corps `rang` monte (+1) ou descend (−1) d'un pas : la poignee « Hauteur du faitage » tiree d'autant, avec ses bornes. */
export function faitageParPas(corps: readonly CorpsToit[], rang: number, sens: 1 | -1): CorpsToit[] {
  return glisser(corps, { type: 'facade', rang, i: 0, mur: 0 }, 'haut', { vert: sens * PAS_FAITAGE_M }).corps;
}

/** Ce que l'ecran lit de la hauteur du faitage : sa valeur, si chaque bouton a un effet, et pourquoi elle ne se regle pas. */
export interface FaitageSimple { hauteur: number; monte: boolean; descend: boolean; raison: string | null }

export function faitageSimple(corps: readonly CorpsToit[], rang: number | null): FaitageSimple | null {
  const c = rang === null ? undefined : corps[rang];
  if (!c || rang === null) return null;
  // Un toit plat n'a pas de faitage a monter : le tirer en ferait un autre toit, ce que dit le choix de la forme.
  if (formeDuCorpsNommee(c) === 'plat') return { hauteur: c.faitage, monte: false, descend: false, raison: 'Un toit plat n’a pas de faîtage : choisissez d’abord une forme en pente.' };
  const change = (s: 1 | -1) => Math.abs((faitageParPas(corps, rang, s)[rang]?.faitage ?? c.faitage) - c.faitage) > 1e-6;
  return { hauteur: c.faitage, monte: change(1), descend: change(-1), raison: null };
}

/** Ce que l'ecran lit du sens du faitage : le sens en place, et pourquoi il ne tourne pas (null : il tourne). */
export interface SensSimple { valeur: Sens; raison: string | null }

/** Le sens que regle « Tourner » : celui du corps choisi, du seul corps, ou de tout le toit d'un batiment a plusieurs corps. */
export function sensSimple(corps: readonly CorpsToit[], selection: CibleElement | null): SensSimple | null {
  const rangs = rangsDeCorps(corps);
  const seul = selection ? (selection.type === 'corps' ? selection.rang : null) : rangs.length === 1 ? (rangs[0] as number) : null;
  if (selection && seul === null) return null;
  if (seul !== null) {
    const c = corps[seul];
    if (!c || c.saillie) return null;
    if (sensReglable(corps, seul)) return { valeur: sensDuCorps(c), raison: null };
    const sansFaitage = c.speciale || formeDuCorpsNommee(c) === 'plat';
    return { valeur: sensDuCorps(c), raison: sansFaitage ? 'Ce toit n’a pas de faîtage à tourner.' : 'Ce qui est posé sur ce toit (pignon, lucarne, fenêtre de toit, panneau) n’aurait plus sa place : retirez-le d’abord.' };
  }
  const e = sensDuToit(corps);
  return e ? { valeur: e.valeur, raison: e.raison } : null;
}

/** « Tourner » : le faitage passe dans l'autre sens (le corps choisi, le seul corps, ou tout le toit). Une copie quand rien ne tourne. */
export function tournerSimple(corps: readonly CorpsToit[], selection: CibleElement | null): CorpsToit[] {
  const e = sensSimple(corps, selection);
  if (!e || e.raison) return corps.slice();
  const autre: Sens = e.valeur === 'long' ? 'court' : 'long', rangs = rangsDeCorps(corps);
  const seul = selection ? selection.rang : rangs.length === 1 ? (rangs[0] as number) : null;
  return seul !== null ? appliquerChoix(corps, { type: 'corps', rang: seul, i: 0 }, 'sens', autre) : appliquerAuBatiment(corps, 'sens', autre);
}

// ---------------------------------------------------------------------------------------------------------------------------------------
// Un batiment qui n'a encore que son toit simple (une forme, une hauteur, une direction ; pas de corps) : les memes reglages ecrivent ce
// toit-la, comme les champs « Hauteur du toit » et « Direction du faitage » de l'inspecteur du plan (ui/champs/facade.ts).

/** La hauteur d'un toit simple au-dessus de l'egout : jamais sous cela (en dessous, c'est un toit plat, que dit le choix de la forme), ni au-dela du champ de l'inspecteur. */
export const HAUTEUR_TOIT_MIN_M = 0.4, HAUTEUR_TOIT_MAX_M = 20;

/** La hauteur du toit simple un pas plus haut ou plus bas, dans ses bornes. */
export function hauteurParPas(t: Pick<Toit, 'hauteur'>, sens: 1 | -1): number {
  return Math.round(Math.min(HAUTEUR_TOIT_MAX_M, Math.max(HAUTEUR_TOIT_MIN_M, t.hauteur + sens * PAS_FAITAGE_M)) * 100) / 100;
}

export function faitageDuToitSimple(o: ObjetPlan): FaitageSimple | null {
  const t = o.batiment?.toit, egout = o.elevation ?? 3;
  if (!t) return null;
  if (t.forme === 'plat') return { hauteur: egout, monte: false, descend: false, raison: 'Un toit plat n’a pas de faîtage : choisissez d’abord une forme en pente.' };
  return { hauteur: egout + t.hauteur, monte: hauteurParPas(t, 1) > t.hauteur, descend: hauteurParPas(t, -1) < t.hauteur, raison: null };
}

/** Les formes simples dont le faitage suit le contour ou n'existe pas : rien a tourner. */
const SANS_DIRECTION = new Set<FormeToit>(['plat', 'croupes', 'pavillon']);

/** Le sens d'un toit simple : sa direction comparee au plus long cote du contour. */
export function sensDuToitSimple(o: ObjetPlan): SensSimple | null {
  const t = o.batiment?.toit, pts = enPoints(o).pts as PtBrut[] | undefined;
  if (!t || !pts || pts.length < 3) return null;
  const ecart = Math.abs(((((t.angleFaitage - angleDuPlusLongCote(pts)) % 180) + 270) % 180) - 90);
  return { valeur: ecart <= 45 ? 'long' : 'court', raison: SANS_DIRECTION.has(t.forme) ? 'Ce toit n’a pas de faîtage à tourner.' : null };
}

/** La direction du faitage d'un toit simple apres « Tourner » : un quart de tour, modulo 180. */
export const directionTournee = (t: Pick<Toit, 'angleFaitage'>): number => (((t.angleFaitage + 90) % 180) + 180) % 180;

/** Le sens du faitage, dit a la personne. */
export const MOTS_SENS: Record<Sens, string> = { long: 'Dans la longueur', court: 'En travers' };

/** La forme d'un toit dans la phrase d'etat : « Toit à deux pans ». Une forme rare garde son nom du catalogue. */
function nomDeLaForme(f: FormeToit): string {
  if (f === 'plat') return 'Toit plat';
  if (f === 'appentis') return 'Toit à un pan';
  if (f === 'deux-pans') return 'Toit à deux pans';
  if (f === 'croupes' || f === 'quatre-pans') return 'Toit à quatre pans';
  return LIBELLES_FORME_TOIT[f];
}

/**
 * L'etat du toit en une ligne, sous le nom du batiment : « Toit à deux pans · faîtage à 6,8 m ». Plusieurs corps : leur nombre et le
 * faitage le plus haut. Sans corps, le toit simple du batiment (sa forme et sa hauteur au-dessus de l'egout). Null : rien a dire.
 */
export function resumeDuToit(o: ObjetPlan): string | null {
  const corps = (o.batiment?.corpsToit ?? []).filter((c) => !c.saillie);
  if (corps.length > 1) return 'Toit en ' + corps.length + ' corps · faîtage à ' + metres(Math.max(...corps.map((c) => c.faitage)));
  const [c] = corps;
  if (c) { const f = formeDuCorpsNommee(c); return nomDeLaForme(f) + (f === 'plat' ? ' · à ' : ' · faîtage à ') + metres(c.faitage); }
  const t = o.batiment?.toit;
  if (!t) return null;
  const egout = o.elevation ?? 3;
  return t.forme === 'plat' ? 'Toit plat · à ' + metres(egout) : nomDeLaForme(t.forme) + ' · faîtage à ' + metres(egout + (t.hauteur ?? 2.5));
}

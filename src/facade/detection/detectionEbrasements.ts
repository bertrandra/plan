// Les ebrasements d'une baie en retrait (MD/spec-facades-calage-detection.md §9) : dans un mur epais, la menuiserie
// et la vitre sont au fond de la baie, et une prise de biais montre, d'un seul cote, la face de l'ebrasement entre
// le nu du mur et la vitre (et le dessous du linteau, ou le dessus de l'appui, selon la hauteur de l'objectif).
//
// Seuls les cotes se lisent : une ligne le long du linteau ou de l'appui ne traverse qu'une assise, et un grand bloc de
// pierre uni y prend l'aspect d'une face (elevation de la scene 21) ; une colonne traverse plusieurs assises et leurs joints.
//
// Sur l'elevation redressee (le plan du mur), cette face est une bande de largeur constante collee a la vitre :
// de la teinte du mur (c'est la meme pierre, le meme enduit), d'une autre luminosite (elle ne regarde pas le
// meme ciel), et unie (une face lisse, sans le grain ni les joints du parement). Le filtre d'ombre la retire
// donc avec les ombres (meme teinte, autre luminance) et la detection rendait la vitre seule : une baie trop
// etroite de la largeur de l'ebrasement visible (scene 21 du banc : 11,5 cm de cote mediane, 6 corrections).
//
// La baie de maconnerie, celle que le releve doit donner, va jusqu'au nu du mur : la boite s'etend sur la bande.
// Une bande des deux cotes n'est pas un ebrasement (on ne voit jamais les deux faces d'une meme baie a la fois) :
// ce sont des volets, ou le mur ; rien ne bouge alors.

import type { Reduite } from './detectionCartes.js';
import { PX_PAR_M } from './detectionCartes.js';
import type { FondDuMur } from './detectionFond.js';
import type { ValeursDetection } from '../regles/facades/detection.js';

/** Une boite en metres : x depuis la gauche, y depuis le sol. */
export interface BoiteM { x: number; y: number; l: number; h: number }

/** Ce qu'une colonne (ou une ligne) de pixels de travail dit d'elle-meme, le long d'un cote de la baie. */
interface Trace { part: number; uniformite: number }

const lum = (R: Reduite, i: number) => (R.rgb[i * 3] ?? 0) + (R.rgb[i * 3 + 1] ?? 0) + (R.rgb[i * 3 + 2] ?? 0);
const lumFond = (F: FondDuMur, i: number) => (F.fond[i * 3] ?? 0) + (F.fond[i * 3 + 1] ?? 0) + (F.fond[i * 3 + 2] ?? 0);

/**
 * Une rangee de pixels le long d'un cote : la part de ceux qui ressemblent a une face d'ebrasement (teinte du mur,
 * luminosite ecartee du fond d'au moins `contrasteMin`), et l'ecart type relatif de leur luminance (petit : une face unie).
 */
function trace(R: Reduite, F: FondDuMur, indices: readonly number[], contrasteMin: number): Trace {
  let n = 0, oui = 0;
  const l: number[] = [];
  for (const i of indices) {
    if (!R.vu[i]) continue;
    n++;
    const lf = lumFond(F, i), lp = lum(R, i);
    if (lf <= 0) continue;
    if ((F.chroma[i] ?? 0) <= (F.seuilChroma[i] ?? 0) && Math.abs(lp / lf - 1) >= contrasteMin) { oui++; l.push(lp); }
  }
  if (!n || l.length < 2) return { part: n ? oui / n : 0, uniformite: Infinity };
  const m = l.reduce((a, b) => a + b, 0) / l.length;
  const s = Math.sqrt(l.reduce((a, b) => a + (b - m) ** 2, 0) / l.length);
  return { part: oui / n, uniformite: m > 0 ? s / m : Infinity };
}

/**
 * La largeur, en pixels de travail, de la bande d'ebrasement a partir du bord `depart`, en avancant de `pas` ; 0 sans bande.
 * La premiere rangee peut ne pas en avoir l'aspect : c'est l'arete vive entre la vitre et l'ebrasement (le dormant, un
 * liseré clair a 5 cm la rangee). Elle compte dans la largeur quand la face suit.
 */
function bande(R: Reduite, F: FondDuMur, rg: ValeursDetection, depart: number, pas: 1 | -1, max: number, rangee: (k: number) => number[] | null): number {
  const estFace = (k: number): boolean | null => {
    const idx = rangee(k);
    if (!idx) return null;
    const t = trace(R, F, idx, rg['facades.detection.ebrasementContrasteMin']);
    return t.part >= rg['facades.detection.ebrasementPartMin'] && t.uniformite <= rg['facades.detection.ebrasementUniformiteMax'];
  };
  let w = 0, face = 0;
  for (let k = depart; Math.abs(k - depart) < max; k += pas) {
    const f = estFace(k);
    if (f === null) break;
    if (!f) {
      if (w === 0 && k === depart) { w++; continue; }
      break;
    }
    w++;
    face++;
  }
  return face ? w : 0;
}

/**
 * La boite de la baie de maconnerie : celle de la vitre, etendue sur la face d'ebrasement visible d'un cote, quand l'autre
 * cote n'en montre pas. Telle quelle sinon.
 */
export function avecEbrasements<T extends BoiteM>(o: T, R: Reduite, F: FondDuMur, rg: ValeursDetection): T {
  const px = PX_PAR_M;
  const c0 = Math.round(o.x * px), c1 = Math.round((o.x + o.l) * px);
  const r0 = Math.round(R.h - (o.y + o.h) * px), r1 = Math.round(R.h - o.y * px);
  const maxPx = Math.round(rg['facades.detection.ebrasementMaxM'] * px);
  const minPx = Math.max(1, Math.round(rg['facades.detection.ebrasementMinM'] * px));
  // Les colonnes se lisent sur le milieu de la hauteur : loin des coins, ou les faces se croisent.
  const ra = r0 + Math.round(0.15 * (r1 - r0)), rb = r1 - Math.round(0.15 * (r1 - r0));
  const colonne = (c: number) => (c < 0 || c >= R.l ? null : Array.from({ length: Math.max(0, rb - ra) }, (_, k) => (ra + k) * R.l + c));
  const g = bande(R, F, rg, c0 - 1, -1, maxPx, colonne), d = bande(R, F, rg, c1, 1, maxPx, colonne);
  // Un seul cote, et assez large pour n'etre pas un dormant ou une ombre de tableau.
  const eg = g >= minPx && d < minPx ? g : 0, ed = d >= minPx && g < minPx ? d : 0;
  if (!eg && !ed) return o;
  return { ...o, x: o.x - eg / px, l: o.l + (eg + ed) / px };
}

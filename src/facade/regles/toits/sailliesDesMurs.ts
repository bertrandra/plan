// Les saillies vues sur un mur (bow-window, galerie, auvent, appentis), posees par le moteur sur le corps de ce mur (lot L1 de
// MD/spec-lecture-ia-elargie.md §4.2) : le run d'une facade les voit ; l'audit les propose, decochees (app/audit/parcelle/formeFacades.ts) ;
// le moteur des toits les pose (corpsSousContrainte, facade/regles/toits/faits.ts) une fois la proposition cochee, comme une saillie
// posee a la main au Mode Toit (facade/modeToit/saillies.ts : le meme corps, la meme forme). Rien n'est ecrit de la main de l'audit.
//
// - Le corps est celui que designe le mur (murDuCorps), quelle que soit la renumerotation des corps ;
// - la profondeur ne se lit pas sur une vue de face (decision 4) : c'est le reglage de son genre (regles/facades/reglages.json,
//   `saillies`), a defaut celle d'une saillie posee a la main (DEFAUTS_SAILLIE), dite dans la proposition ;
// - une saillie deja posee sur ce mur du meme corps, qui recouvre celle-ci, ne se pose pas une seconde fois et ne bouge pas. Pur.

import { murDuCorps as murPorteur } from './murDuCorps.js';
import { corpsDeSaillie, DEFAUTS_SAILLIE, HAUTEUR_AUVENT_M, murDuCorps } from '../../modeToit/saillies.js';
import { PROFONDEURS_SAILLIES } from '../../../regles/facades/saillies.js';
import type { SaillieDeMurFait } from '../../../regles/toits/faits.js';
import type { CorpsToit, SaillieFacade } from '../../../model/types.js';

/** Une saillie plus etroite que cela n'en est pas une : un pilier, une descente. */
export const LARGEUR_SAILLIE_MIN_M = 0.6;

const cm = (v: number) => Math.round(v * 100) / 100;

/**
 * La profondeur d'une saillie vue, en metres : le reglage de son genre, sinon celle d'une saillie posee a la main au Mode Toit (la valeur
 * d'avant le reglage). `reglees` : pour les tests.
 */
export function profondeurSaillieVue(genre: SaillieDeMurFait['genre'], reglees: Readonly<Partial<Record<SaillieDeMurFait['genre'], number>>> = PROFONDEURS_SAILLIES): number {
  return reglees[genre] ?? DEFAUTS_SAILLIE[genre].profondeurM;
}

/** La saillie que le moteur pose pour une saillie vue : son hote (le corps du mur) et le corps neuf ; null quand il ne la pose pas. */
export function saillieSurLeMur(corps: readonly CorpsToit[], s: SaillieDeMurFait): { hote: number; corps: CorpsToit } | null {
  const m = murPorteur(corps, s.mur.gauche, s.mur.droite);
  const h = m ? corps[m.corps] : undefined;
  const l = Math.hypot(s.mur.droite.x - s.mur.gauche.x, s.mur.droite.y - s.mur.gauche.y);
  if (!m || !h || !(l > 0) || s.a - s.de < LARGEUR_SAILLIE_MIN_M) return null;
  // Les bouts de la saillie vue, ramenes le long du mur de l'hote depuis son sommet `pts[cote]`.
  const w = murDuCorps(h, m.cote);
  const le = (t: number) => { const x = s.mur.gauche.x + ((s.mur.droite.x - s.mur.gauche.x) * t) / l, y = s.mur.gauche.y + ((s.mur.droite.y - s.mur.gauche.y) * t) / l; return (x - w.a.x) * w.u.x + (y - w.a.y) * w.u.y; };
  const [d0, d1] = [le(s.de), le(s.a)].sort((a, b) => a - b) as [number, number];
  const largeurM = cm(Math.min(d1, w.L) - Math.max(0, d0));
  if (largeurM < LARGEUR_SAILLIE_MIN_M) return null;
  const centreM = cm(Math.max(0, d0) + largeurM / 2);
  // Ce qui est deja pose sur ce mur de l'hote (a la main, une observation) et recouvre la saillie vue ne bouge pas : rien de plus.
  if (corps.some((c) => c.saillie && c.saillie.hote === m.corps && c.saillie.mur === m.cote && Math.abs(c.saillie.centreM - centreM) < (c.saillie.largeurM + largeurM) / 2)) return null;
  const hauteurM = s.hauteurM ?? (s.genre === 'auvent' ? HAUTEUR_AUVENT_M : undefined);
  const saillie: SaillieFacade = {
    genre: s.genre, hote: m.corps, mur: m.cote, centreM, largeurM, profondeurM: profondeurSaillieVue(s.genre),
    forme: s.genre === 'bow-window' ? s.forme : 'rectangle', niveau: s.niveau, toit: s.genre === 'auvent' ? 'pan' : s.toit,
    ...(hauteurM !== undefined ? { hauteurM: cm(hauteurM) } : {}),
    ...(s.genre === 'auvent' && s.couverture ? { couverture: s.couverture } : {}),
  };
  return { hote: m.corps, corps: corpsDeSaillie(h, saillie) };
}

/**
 * Les corps avec les saillies que montrent leurs murs (lot L1), chacune posee par saillieSurLeMur et ajoutee apres les autres corps
 * (les rangs des corps d'avant ne bougent pas). Le moteur des toits l'applique comme tout fait (corpsSousContrainte, en dernier). Pur.
 */
export function avecSailliesDesMurs(saillies: readonly SaillieDeMurFait[] | undefined, corps: CorpsToit[] | null): CorpsToit[] | null {
  if (!saillies?.length || !corps?.length) return corps;
  const out = [...corps];
  for (const s of saillies) {
    const p = saillieSurLeMur(out, s);
    if (p) out.push(p.corps);
  }
  return out;
}

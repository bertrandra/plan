// Le releve de facade (zones/Releve.tsx) : les etapes, la serie de photos et ses coins proposes.

import { au } from '../../util/tableaux.js';
import { focalePx } from '../../facade/cadrage.js';
import { coinsProposes } from '../../facade/analyse.js';
import { type Decrochement } from '../../facade/profil.js';
import type { P2 } from '../../facade/homographie.js';
import type { Toit, PartieBasse } from '../../model/types.js';
import { type Prise } from './capteurs.js';

/* ------------------------------------------------------------------------------------------------
 * Le parcours
 * --------------------------------------------------------------------------------------------- */

export type Etape = 'mur' | 'methode' | 'rue' | 'visee' | 'coins' | 'analyse' | 'resultat';

export interface Resultat {
  /** La partie basse d'un mur en L, mesuree ; corrigeable avant de valider. */
  partieBasse: PartieBasse | null;
  texture: string;
  hauteurTexture: number;
  /** La hauteur a-t-elle ete mesuree sur la photo (sinon, c'est celle du cadastre) ? */
  hauteurMesuree: boolean;
  couverture: number;
  toitPropose: Toit | null;
  /** Ce que l'assemblage de plusieurs photos a trouve a redire, s'il y a lieu. */
  avis: string | null;
}

/** Une photo d'un morceau du mur et ses quatre coins. */
export interface Morceau {
  prise: Prise;
  coins: P2[];
  /** Mur a deux hauteurs d'egout : le decrochement pose sur la photo (une seule photo). */
  decrochement?: Decrochement | null;
}

/**
 * Les coins proposes pour une prise : projection d'apres la distance (et la hauteur estimee), ou les
 * reperes poses sur la video, qui disent exactement ou sont les bords et l'emportent. Quand le mur
 * se photographie en plusieurs fois, le rectangle propose est la part de mur que l'image couvre, pas
 * le mur entier.
 */
export function coinsDePrise(p: Prise, largeurMur: number, hauteurEstimee: number, partiel: boolean): P2[] {
  const w = p.photo.image.largeur,
    h = p.photo.image.hauteur;
  const f = p.photo.focalePx ?? focalePx(w, h, p.photo.champ ?? p.champ);
  const d = p.mesure?.distance ?? null;
  const visible = d ? (d * w) / f : largeurMur;
  const c = coinsProposes(w, h, f, d, partiel ? Math.min(largeurMur, 0.8 * visible) : largeurMur, hauteurEstimee);
  if (p.reperes) {
    const [a, b] = [Math.min(p.reperes.a, p.reperes.b), Math.max(p.reperes.a, p.reperes.b)];
    au(c, 0).x = au(c, 3).x = a * w;
    au(c, 1).x = au(c, 2).x = b * w;
  }
  // A courte distance, le mur deborde de l'image : les coins projetes tombent loin hors cadre.
  // On les ramene dans la marge ou le doigt peut les saisir (celle de <Coins>).
  const m = Math.max(w, h) * 0.2;
  return c.map((q) => ({ x: Math.max(-m, Math.min(w + m, q.x)), y: Math.max(-m, Math.min(h + m, q.y)) }));
}

/** La consigne des coins, selon la place de la photo dans la serie. */
export function consigneCoins(numero: number, total: number): string {
  if (total <= 1) return "Placez chaque rond sur un coin du mur : les deux du haut à l'égout, les deux du bas au pied du mur. Un coin caché ou hors cadre se place là où il serait.";
  const bords =
    numero === 0
      ? 'Ceux de gauche sur le coin gauche du mur, ceux de droite sur une verticale du mur près du bord droit de la photo.'
      : numero === total - 1
        ? 'Ceux de droite sur le coin droit du mur, ceux de gauche sur une verticale du mur près du bord gauche de la photo.'
        : 'À gauche et à droite, sur une verticale du mur près du bord de la photo.';
  return `Photo ${numero + 1} sur ${total} : les ronds du haut sur l'égout, ceux du bas au pied du mur. ${bords}`;
}

// Les quatre coins d'une photo de facade, trouves sans geste (admin › calibration : ajouter des photos redresse et fusionne seul).
//
// Une photo importee n'a ni GPS, ni boussole, ni distance : le cadre propose est celui du releve sans capteurs (sept dixiemes de la
// largeur, facade/calage.ts), puis le calage fin cherche les aretes du mur sur la photo (facade/calageFin.ts). Ce qu'il ne trouve
// pas reste predit : l'appelant le signale, la personne corrige au doigt. Sans DOM, testable seul.

import { CHAMP_GRAND_COTE_DEFAUT } from '../../facade/cadrage.js';
import type { SourceCoin } from '../../facade/calageFin.js';
import type { Image, P2 } from '../../facade/homographie.js';
import type { Prise } from './capteurs.js';
import { appliquerResultat, coinsDePrise, entreeRecherche, rechercher, type Morceau } from './serie.js';
import { detecterSegments } from '../../facade/segments.js';
import { redresserParFuites, type RedressementFuites } from '../../facade/redressementFuites.js';
import { coinsSurLesPhotos, mosaiqueDesVues, rectangleDuMur } from '../../facade/mosaiqueFuites.js';

export interface CoinsAuto {
  /** Haut gauche, haut droit, bas droit, bas gauche, en pixels de la photo. */
  coins: P2[];
  sources: SourceCoin[];
  /** Les quatre coins sont-ils trouves sur les aretes de la photo (et non seulement predits) ? */
  trouves: boolean;
  /** La note du calage fin, de 0 a 1 ; 0 sans calage fin. */
  note: number;
}

/** Un quadrilatere convexe, non croise, d'au moins 5 % de la photo. */
export function quadrilatereSain(c: readonly P2[], image: { largeur: number; hauteur: number }): boolean {
  if (c.length !== 4) return false;
  const signes = c.map((p, i) => {
    const q = c[(i + 1) % 4] as P2, r = c[(i + 2) % 4] as P2;
    return Math.sign((q.x - p.x) * (r.y - q.y) - (q.y - p.y) * (r.x - q.x));
  });
  if (!signes.every((x) => x === signes[0] && x !== 0)) return false;
  const aire = Math.abs(c.reduce((s, p, i) => { const q = c[(i + 1) % 4] as P2; return s + p.x * q.y - q.x * p.y; }, 0)) / 2;
  return aire >= 0.05 * image.largeur * image.hauteur;
}

/**
 * Cherche les coins du mur sur une photo seule. `focalePx` : la focale quand la photo la donne, sinon le champ par defaut.
 * Ne rejette jamais : un echec rend les coins predits.
 */
export function coinsAuto(image: Image, largeurM: number, hauteurM: number, focalePx: number | null = null): CoinsAuto {
  const prise: Prise = { photo: { image, url: '', champ: null, focalePx }, mesure: null, reperes: null, champ: CHAMP_GRAND_COTE_DEFAUT, photosPrevues: null };
  const depart: Morceau = { prise, coins: coinsDePrise(prise, largeurM, hauteurM, false), recherche: true };
  const predits = (): CoinsAuto => ({ coins: depart.coins, sources: depart.coins.map(() => 'predit'), trouves: false, note: 0 });
  try {
    const entree = entreeRecherche(prise, largeurM, hauteurM, false);
    if (!entree) return predits();
    // Une photo corrigee de la distorsion changerait de repere : sans son URL, ses coins ne servent pas (appliquerResultat les ignore).
    const m = appliquerResultat(depart, rechercher(entree), null);
    const sources: SourceCoin[] = m.sources ? [...m.sources] : m.coins.map(() => 'predit');
    // Un quadrilatere croise ou ecrase n'est pas un mur (cas Hardencourt, octobre 2026) : ses coins ne sont pas « trouves ».
    return { coins: m.coins, sources, trouves: sources.every((s) => s === 'trouve') && quadrilatereSain(m.coins, image), note: m.fin?.trouve ? m.fin.note : 0 };
  } catch {
    return predits();
  }
}

/** Ce que la serie redressee par ses points de fuite donne : les coins du mur sur chaque photo, et la hauteur qui en garde les proportions. */
export interface CoinsDeSerie {
  /** Par photo : les coins du mur (haut gauche, haut droit, bas droit, bas gauche), null pour une photo restee hors de la mosaique. */
  coins: (P2[] | null)[];
  /** La hauteur du mur, de l'egout au pied, a la largeur donnee : la mosaique est vue de face, ses proportions sont celles du mur. */
  hauteurM: number | null;
  /** Les photos restees a part, et pourquoi. */
  aPart: { vue: number; motif: string }[];
}

/**
 * Les coins du mur sur toutes les photos d'une serie, sans geste : chaque photo est redressee par ses points de fuite
 * (facade/redressementFuites.ts), les vues sont assemblees en mosaique (facade/mosaiqueFuites.ts), le rectangle du mur y est lu,
 * puis reporte dans chaque photo. Les photos n'ont pas besoin de montrer le mur entier, ni ses coins. Null quand aucune photo
 * ne se redresse.
 */
export function coinsAutoDeSerie(images: readonly Image[], largeurM: number): CoinsDeSerie | null {
  const vues = images.map((img) => redresserParFuites(img, detecterSegments(img)));
  const rangs = vues.map((v, i) => (v ? i : -1)).filter((i) => i >= 0);
  if (!rangs.length) return null;
  const m = mosaiqueDesVues(rangs.map((i) => vues[i] as RedressementFuites));
  if (!m) return null;
  const r = rectangleDuMur(m, detecterSegments(m.image));
  const parVue = coinsSurLesPhotos(rangs.map((i) => vues[i] as RedressementFuites), m.places, r);
  const coins: (P2[] | null)[] = images.map(() => null);
  rangs.forEach((i, k) => { coins[i] = parVue[k] ?? null; });
  const aPart = [
    ...images.map((_, i) => i).filter((i) => !vues[i]).map((vue) => ({ vue, motif: 'pas assez de verticales pour redresser la photo' })),
    ...m.groupes.aPart.map((a) => ({ vue: rangs[a.vue] as number, motif: a.motif })),
  ];
  const hauteurM = r.x1 > r.x0 ? Math.round(((largeurM * (r.y1 - r.y0)) / (r.x1 - r.x0)) * 10) / 10 : null;
  return { coins, hauteurM, aPart };
}

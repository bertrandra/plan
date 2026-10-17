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

export interface CoinsAuto {
  /** Haut gauche, haut droit, bas droit, bas gauche, en pixels de la photo. */
  coins: P2[];
  sources: SourceCoin[];
  /** Les quatre coins sont-ils trouves sur les aretes de la photo (et non seulement predits) ? */
  trouves: boolean;
  /** La note du calage fin, de 0 a 1 ; 0 sans calage fin. */
  note: number;
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
    return { coins: m.coins, sources, trouves: sources.every((s) => s === 'trouve'), note: m.fin?.trouve ? m.fin.note : 0 };
  } catch {
    return predits();
  }
}

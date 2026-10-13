// Le releve de facade (zones/Releve.tsx) : les etapes, la serie de photos et ses coins proposes.

import { au } from '../../util/tableaux.js';
import { focalePx } from '../../facade/cadrage.js';
import { coinsProposes } from '../../facade/analyse.js';
import { coinsDuReleve, biaisDepuisCap, ecartSigne, type PriseReleve } from '../../facade/calage.js';
import { calageFinDuReleve, type CalageFin, type SourceCoin } from '../../facade/calageFin.js';
import { corrigerDistorsion, corrigerPoint, focale35DePixels, grandAngleACorriger, type ModeleDistorsion } from '../../facade/distorsion.js';
import { type Decrochement } from '../../facade/profil.js';
import type { Image, P2 } from '../../facade/homographie.js';
import type { Toit, PartieBasse, CalageReleve } from '../../model/types.js';
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
  /** Les coins de chaque photo et leur resolution au mur : la precision annoncee des cotes. */
  calage?: CalageReleve | null;
}

/** Une photo d'un morceau du mur et ses quatre coins. */
export interface Morceau {
  prise: Prise;
  coins: P2[];
  /** Mur a deux hauteurs d'egout : le decrochement pose sur la photo (une seule photo). */
  decrochement?: Decrochement | null;
  /** D'ou vient chacun des quatre coins : trouve sur la photo, predit, ou pose au doigt. */
  sources?: SourceCoin[];
  /** Vrai pendant que le calage fin cherche les coins sur la photo. */
  recherche?: boolean;
  /** Vrai : la recherche ne fait que corriger la distorsion du grand-angle (un morceau d'une serie). */
  distorsionSeule?: boolean;
  /** Ce que le calage fin a rendu (sans le detail), une fois la recherche faite. */
  fin?: ResultatCoins | null;
}

/** Le calage fin d'une photo, sans ce qui ne sert qu'aux images de controle. */
export type ResultatCoins = Omit<CalageFin, 'detail'>;

/** Le calage fin sans son detail (les segments ne traversent pas le worker, ni ne restent en memoire). */
export function sansDetail(c: CalageFin): ResultatCoins {
  const { coins, sources, note, trouve, inclinaisonDeg, roulisDeg, azimutDeg, azimutCorrige, distance, hauteur, contour } = c;
  return { coins, sources, note, trouve, inclinaisonDeg, roulisDeg, azimutDeg, azimutCorrige, distance, hauteur, contour };
}

/** Ce qu'il faut au calage fin pour chercher les coins d'une photo du releve (calculable dans un worker). */
export interface EntreeRecherche {
  image: Image;
  largeur: number;
  hauteur: number;
  prise: PriseReleve;
  distance: { valeur: number; precisionM: number } | null;
  /**
   * La focale equivalente 24 x 36 de la photo, en mm : sous 20 mm (grand-angle), la distorsion est
   * estimee et corrigee avant de chercher les coins (lot L8). `null` : inconnue, rien n'est corrige.
   */
  focale35?: number | null;
  /** Faux : un morceau d'une serie, dont on ne cherche pas les coins ; seule la distorsion est corrigee. */
  chercher?: boolean;
}

/** La photo corrigee de la distorsion du grand-angle, telle que la recherche la rend. */
export interface DistorsionCorrigee {
  image: Image;
  modele: ModeleDistorsion;
}

/** Ce que rend la recherche d'une prise : la photo corrigee s'il y a lieu, et les coins s'ils etaient cherches. */
export interface ResultatRecherche {
  distorsion: DistorsionCorrigee | null;
  coins: ResultatCoins | null;
}

/**
 * La recherche d'une prise, sans DOM (worker ou fil principal) : la preparation de la photo (la
 * distorsion du grand-angle, spec §4), puis le calage fin sur la photo preparee. La focale de l'image
 * corrigee est reduite du meme facteur que l'image.
 */
export function rechercher(e: EntreeRecherche): ResultatRecherche {
  const d = corrigerDistorsion(e.image, e.focale35);
  const image = d?.image ?? e.image;
  const prise = d ? { ...e.prise, focalePx: e.prise.focalePx * d.modele.echelle } : e.prise;
  const coins = e.chercher === false ? null : sansDetail(calageFinDuReleve(image, e.largeur, e.hauteur, prise, e.distance));
  return { distorsion: d ? { image: d.image, modele: d.modele } : null, coins };
}

/**
 * La focale d'une prise, en pixels : exacte quand la photo la donne, sinon d'apres le champ de
 * l'objectif. Une photo corrigee de la distorsion a ete reduite pour garder ses coins : la focale
 * deduite du champ l'est d'autant (une focale donnee l'a deja ete a la correction).
 */
export function focaleDePrise(p: Prise): number {
  const img = p.photo.image;
  if (p.photo.focalePx != null) return p.photo.focalePx;
  return focalePx(img.largeur, img.hauteur, p.photo.champ ?? p.champ) * (p.photo.distorsion?.echelle ?? 1);
}

/** La focale equivalente 24 x 36 d'une prise, en mm (celle que l'on croit, champ par defaut compris). */
export function focale35DePrise(p: Prise): number {
  return focale35DePixels(focaleDePrise(p), p.photo.image.largeur, p.photo.image.hauteur);
}

/**
 * La prise une fois sa photo corrigee de la distorsion : l'image et son URL remplacees, les coins
 * (et le decrochement) ramenes dans l'image corrigee, la focale reduite d'autant. Une recherche deja
 * arretee (l'analyse est partie avec la photo d'origine et ses coins) ne change plus rien.
 */
export function appliquerDistorsion(m: Morceau, d: DistorsionCorrigee, url: string): Morceau {
  if (!m.recherche) return m;
  const { modele } = d;
  const vers = (q: P2) => corrigerPoint(q, modele);
  const photo = m.prise.photo;
  return {
    ...m,
    coins: m.coins.map(vers),
    ...(m.decrochement ? { decrochement: { ...m.decrochement, haut: vers(m.decrochement.haut), bas: vers(m.decrochement.bas) } } : {}),
    prise: {
      ...m.prise,
      photo: { ...photo, image: d.image, url, focalePx: photo.focalePx != null ? photo.focalePx * modele.echelle : null, distorsion: { k1: modele.k1, echelle: modele.echelle } },
    },
  };
}

/**
 * La precision d'une distance mesuree, pour dire si la largeur vue s'accorde avec le plan : seule une
 * mesure independante du plan compte. Les reperes (« cadrage ») tirent la distance de la largeur du
 * plan : ils ne peuvent pas la contredire.
 */
function distanceIndependante(m: Prise['mesure']): EntreeRecherche['distance'] {
  if (!m || !(m.distance > 0)) return null;
  if (m.source === 'lidar' || m.source === 'webxr') return { valeur: m.distance, precisionM: 0.05 + 0.03 * m.distance };
  // Photo de rue : la position vient du GPS de la voiture ou du pieton qui l'a prise.
  if (m.source === 'rue') return { valeur: m.distance, precisionM: 3 };
  return null;
}

/**
 * Ce que le calage fin recoit pour une prise : la photo, le mur, la prise du releve (cap, attitude,
 * focale, distance). `null` pour un morceau d'un mur photographie en plusieurs fois : ses bords ne
 * sont pas ceux du mur, il n'y a pas d'aretes a y chercher.
 */
export function entreeRecherche(p: Prise, largeurMur: number, hauteurEstimee: number, partiel: boolean, azimutFacade: number | null = null): EntreeRecherche | null {
  // Un morceau d'une serie n'a pas d'aretes de mur a chercher ; pris au grand-angle, sa photo reste
  // pourtant a corriger de la distorsion, comme une photo entiere.
  const focale35 = focale35DePrise(p);
  if (partiel && !grandAngleACorriger(focale35)) return null;
  const img = p.photo.image;
  const f = focaleDePrise(p);
  const mesuree = p.mesure?.distance ?? null;
  // Sans distance, on suppose le mur cadre sur les sept dixiemes de la largeur de la photo.
  const distance = mesuree && mesuree > 0 ? mesuree : (largeurMur * f) / (0.7 * img.largeur);
  return {
    image: img,
    largeur: largeurMur,
    hauteur: hauteurEstimee,
    prise: {
      largeurPx: img.largeur,
      hauteurPx: img.hauteur,
      focalePx: f,
      distance,
      biaisDeg: p.cap != null && azimutFacade !== null ? biaisDepuisCap(p.cap, azimutFacade) : null,
      inclinaisonDeg: p.attitude?.inclinaisonDeg ?? null,
      roulisDeg: p.attitude?.roulisDeg ?? null,
      focaleEstimee: p.photo.focalePx == null && p.photo.champ == null,
      distanceEstimee: !(mesuree && mesuree > 0),
    },
    distance: distanceIndependante(p.mesure),
    focale35,
    chercher: !partiel,
  };
}

/**
 * Le morceau une fois le calage fin rendu. Des coins trouves remplacent les coins proposes, ramenes
 * dans la marge ou le doigt peut les saisir ; sinon les coins predits restent. Un coin deja deplace
 * au doigt pendant la recherche n'est jamais repris : la main l'emporte.
 */
export function appliquerRecherche(m: Morceau, r: ResultatCoins): Morceau {
  // Une recherche arretee (l'analyse est lancee avec les coins du moment) ne change plus rien.
  if (!m.recherche) return m;
  const fin = { ...m, recherche: false, fin: r };
  if (!r.trouve || !r.coins || m.sources?.includes('doigt') || m.decrochement) return fin;
  const w = m.prise.photo.image.largeur,
    h = m.prise.photo.image.hauteur;
  const marge = Math.max(w, h) * 0.2;
  return { ...fin, coins: r.coins.map((q) => ({ x: Math.max(-marge, Math.min(w + marge, q.x)), y: Math.max(-marge, Math.min(h + marge, q.y)) })), sources: [...r.sources] };
}

/**
 * Le morceau une fois la recherche rendue : la photo corrigee de la distorsion (et ses coins ramenes
 * dedans), puis les coins trouves. Sans URL pour la photo corrigee (le navigateur n'a pas pu l'encoder),
 * on garde la photo d'origine et l'on ignore les coins trouves sur la corrigee : l'image analysee, celle
 * que l'on montre et les coins doivent rester dans le meme repere.
 */
export function appliquerResultat(m: Morceau, r: ResultatRecherche, url: string | null): Morceau {
  const corrigee = !!(r.distorsion && url);
  let x = r.distorsion && url ? appliquerDistorsion(m, r.distorsion, url) : m;
  if (r.coins && (corrigee || !r.distorsion)) x = appliquerRecherche(x, r.coins);
  return x.recherche ? { ...x, recherche: false } : x;
}

/** Le morceau dont on n'attend plus le calage fin : l'analyse part avec les coins tels qu'ils sont. */
export function arreterRecherche(m: Morceau): Morceau {
  return m.recherche ? { ...m, recherche: false } : m;
}

/** Le cap de la prise lu sur la photo, en degres depuis le nord ; `null` si la boussole n'a pas ete calee. */
export function capCorrige(r: ResultatCoins | null | undefined, azimutFacade: number): number | null {
  if (!r?.trouve || !r.azimutCorrige) return null;
  // La prise du releve vise le milieu du mur sous le biais b (calage.ts) : son azimut vaut -b dans le
  // repere du mur, et le cap vaut l'azimut de la facade moins 180 moins b.
  const cap = azimutFacade - 180 + ecartSigne(r.azimutDeg);
  return Math.round((((cap % 360) + 360) % 360) * 10) / 10;
}

/**
 * Les coins proposes pour une prise : projection d'apres la distance (et la hauteur estimee), ou les
 * reperes poses sur la video, qui disent exactement ou sont les bords et l'emportent. Quand le mur
 * se photographie en plusieurs fois, le rectangle propose est la part de mur que l'image couvre, pas
 * le mur entier.
 *
 * A distance connue, la projection tient compte de l'inclinaison et du roulis du telephone au
 * declenchement, et du biais que donne le cap face a `azimutFacade` (facade/calage.ts) : un tangage
 * de 6 degres a 12 m decalait les coins centres de 1,3 m.
 */
export function coinsDePrise(p: Prise, largeurMur: number, hauteurEstimee: number, partiel: boolean, azimutFacade: number | null = null): P2[] {
  const w = p.photo.image.largeur,
    h = p.photo.image.hauteur;
  const f = focaleDePrise(p);
  const d = p.mesure?.distance ?? null;
  const visible = d ? (d * w) / f : largeurMur;
  const largeur = partiel ? Math.min(largeurMur, 0.8 * visible) : largeurMur;
  const biais = p.cap != null && azimutFacade !== null ? biaisDepuisCap(p.cap, azimutFacade) : null;
  const c =
    d && d > 0
      ? coinsDuReleve(largeur, hauteurEstimee, { largeurPx: w, hauteurPx: h, focalePx: f, distance: d, biaisDeg: biais, inclinaisonDeg: p.attitude?.inclinaisonDeg ?? null, roulisDeg: p.attitude?.roulisDeg ?? null })
      : coinsProposes(w, h, f, d, largeur, hauteurEstimee);
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

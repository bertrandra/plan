// Les facades de pres (MD/roadmap-realisme-3d.md, R2) : les baies en creux et la maconnerie.
//
// Jusqu'ici, une fenetre etait deux rectangles poses a plat sur le mur : un cadre clair, une vitre.
// De pres, c'est ce qui trahissait le plus la maquette. Le mur, lui, est un prisme plein qu'on ne
// perce pas : la baie se creuse donc en avancant ce qui l'entoure. Un encadrement saillant (deux
// tableaux, un linteau), un appui qui deborde dessous, et la menuiserie et la vitre restees au nu du
// mur se lisent comme une fenetre posee en retrait — la lumiere rasante et les ombres portees de
// l'appui et du linteau font le reste.
//
// La maconnerie suit l'epoque du batiment (BD TOPO, `date_d_apparition`) : corniche sous l'egout,
// bandeaux entre les niveaux, chaines d'angle en pierre, petits bois aux fenetres anciennes. Une
// epoque inconnue ne pose rien de plus que les baies en creux.
//
// Rien de ceci n'est un dessin par maison : ce sont des regles, de premier rang, que les profils de
// facades (lot G12) pourront reprendre. Seuls les batiments de la parcelle du projet et de ses
// abords (`RELIEF_FENETRES_M`) en recoivent, et pas en qualite Econome.

import type * as THREE_NS from 'three';
import type { DetailsOuverture } from '../model/types.js';
import { Batisseur, type S3 } from './batisseur.js';

/** Le repere d'une facade : abscisse le long du mur, hauteur, saillie hors du mur (metres). */
export type Point3 = (x: number, y: number, s: number) => S3;

/** Au-dela de cette distance au centre de la scene, les baies restent a plat (le voisinage lointain). */
export const RELIEF_FENETRES_M = 45;

/** L'encadrement : sa largeur de chaque cote de la baie, sa saillie hors du mur. */
export const ENCADREMENT = { largeur: 0.12, saillie: 0.15 } as const;
/** Le linteau, plus haut que les tableaux ne sont larges. */
export const LINTEAU_M = 0.16;
/** L'appui : sa hauteur, ce qu'il deborde de l'encadrement devant et sur les cotes. */
export const APPUI = { hauteur: 0.07, saillie: 0.06, debord: 0.05 } as const;
/** La menuiserie, au nu du mur : la largeur du dormant, son epaisseur. */
export const MENUISERIE = { largeur: 0.06, epaisseur: 0.04 } as const;
/** Les petits bois, plus fins que le dormant. */
export const PETITS_BOIS_M = 0.025;
/** La vitre, juste devant le mur (elle doit gagner le test de profondeur sur lui). */
const S_VITRE = 0.012;

/** Le quadrillage des petits bois d'une baie : colonnes et rangs de carreaux. */
export interface Carreaux {
  colonnes: number;
  rangs: number;
  /** Une traverse au milieu aussi large que le dormant : les deux chassis d'une fenetre a guillotine. */
  traverse?: boolean;
  /** Une imposte a petits bois en haut de la baie : sa part de la hauteur et ses carreaux en largeur ; le bas reste en `colonnes` x `rangs`. */
  imposte?: { part: number; colonnes: number };
}

/** La part de la hauteur d'une imposte a petits bois au-dessus d'un verre plein. */
export const PART_IMPOSTE = 0.3;

/**
 * Les carreaux d'une baie dont le releve dit le vitrage ou l'ouvrant (model/ouverturesVues.ts, vus par Claude) ; sans eux,
 * ceux de l'epoque (`parEpoque`), comme avant. Petits bois : trois carreaux de haut (deux si la baie est basse), quatre sur
 * une guillotine (deux par chassis) ; verre plein : les vantaux seuls (un meneau entre deux battants ou deux coulissants, une
 * traverse sur une guillotine, rien sur un chassis fixe ou a soufflet).
 */
export function carreauxDesDetails(d: DetailsOuverture | undefined, hauteur: number, parEpoque: Carreaux | null): Carreaux | null {
  const vitrage = d?.vitrage, ouvrant = d?.ouvrant;
  if (!vitrage && !ouvrant) return parEpoque;
  const guillotine = ouvrant === 'guillotine', unSeul = ouvrant === 'fixe' || ouvrant === 'soufflet';
  const colonnes = guillotine || unSeul ? 1 : 2;
  const plein: Carreaux | null = guillotine ? { colonnes: 1, rangs: 2, traverse: true } : colonnes > 1 ? { colonnes, rangs: 1 } : null;
  if (vitrage === 'petits-bois') return guillotine ? { colonnes: 2, rangs: 4, traverse: true } : { colonnes: Math.max(colonnes, 2), rangs: hauteur >= 1.1 ? 3 : 2 };
  if (vitrage === 'imposte-petits-bois') return { ...(plein ?? { colonnes: 1, rangs: 1 }), imposte: { part: PART_IMPOSTE, colonnes: 4 } };
  // Verre plein, ou un ouvrant vu sans le vitrage : les vantaux seuls, sans les petits bois de l'epoque.
  return plein;
}

/**
 * Les carreaux selon l'epoque : avant 1950, la fenetre a la francaise a petits bois (deux vantaux,
 * trois carreaux de haut, deux si la baie est basse) ; de 1950 a 1975, deux vantaux sans petits bois ;
 * apres, ou inconnue, un seul vitrage.
 */
export function carreauxSelonEpoque(annee: number | null, hauteur: number): Carreaux | null {
  if (annee === null) return null;
  if (annee < 1950) return { colonnes: 2, rangs: hauteur >= 1.1 ? 3 : 2 };
  if (annee < 1975) return { colonnes: 2, rangs: 1 };
  return null;
}

/** L'annee d'une date BD TOPO (« 1925-01-01 », ou un nombre) ; `null` si elle est illisible ou absurde. */
export function anneeDe(date: unknown): number | null {
  const a = typeof date === 'number' ? date : typeof date === 'string' ? parseInt(date.slice(0, 4), 10) : NaN;
  return Number.isFinite(a) && a >= 1000 && a <= 2100 ? a : null;
}

/** Un pave du mur : la face de devant, le dessus, le dessous et les deux cotes (le dos est contre le mur). */
export function pave(b: Batisseur, pt: Point3, x0: number, x1: number, y0: number, y1: number, s0: number, s1: number): void {
  if (x1 - x0 <= 0 || y1 - y0 <= 0 || s1 - s0 <= 0) return;
  b.quad(pt(x0, y0, s1), pt(x1, y0, s1), pt(x1, y1, s1), pt(x0, y1, s1));
  b.quad(pt(x0, y1, s1), pt(x1, y1, s1), pt(x1, y1, s0), pt(x0, y1, s0));
  b.quad(pt(x0, y0, s0), pt(x1, y0, s0), pt(x1, y0, s1), pt(x0, y0, s1));
  b.quad(pt(x0, y0, s0), pt(x0, y0, s1), pt(x0, y1, s1), pt(x0, y1, s0));
  b.quad(pt(x1, y0, s1), pt(x1, y0, s0), pt(x1, y1, s0), pt(x1, y1, s1));
}

/** Une baie, dans le repere de sa facade. */
export interface BaieRelief {
  x: number;
  y: number;
  l: number;
  h: number;
}

/** Les trois maillages d'un mur de baies en creux : l'encadrement (pierre), la menuiserie, la vitre. */
export interface BatisseursBaies {
  encadrement: Batisseur;
  menuiserie: Batisseur;
  vitre: Batisseur;
  porte: Batisseur;
}

export function batisseursBaies(): BatisseursBaies {
  return { encadrement: new Batisseur(), menuiserie: new Batisseur(), vitre: new Batisseur(), porte: new Batisseur() };
}

/**
 * Une fenetre en creux : encadrement saillant (tableaux et linteau), appui debordant, dormant et
 * petits bois au nu du mur, vitre derriere. `hMur` borne le linteau sous l'egout.
 */
export function poserFenetreEnCreux(b: BatisseursBaies, pt: Point3, o: BaieRelief, carreaux: Carreaux | null, hMur: number): void {
  const L = ENCADREMENT.largeur, S = ENCADREMENT.saillie;
  const haut = Math.min(o.y + o.h + LINTEAU_M, hMur - 0.05);
  // Les tableaux, de l'appui au linteau ; le linteau par-dessus, sur toute la largeur.
  pave(b.encadrement, pt, o.x - L, o.x, o.y, o.y + o.h, 0, S);
  pave(b.encadrement, pt, o.x + o.l, o.x + o.l + L, o.y, o.y + o.h, 0, S);
  pave(b.encadrement, pt, o.x - L, o.x + o.l + L, o.y + o.h, haut, 0, S);
  // L'appui, sous la baie : il deborde devant l'encadrement et sur ses cotes.
  pave(b.encadrement, pt, o.x - L - APPUI.debord, o.x + o.l + L + APPUI.debord, o.y - APPUI.hauteur, o.y, 0, S + APPUI.saillie);
  poserMenuiserie(b, pt, o, carreaux);
}

/** Le dormant, les petits bois et la vitre d'une baie, au nu du mur. */
function poserMenuiserie(b: BatisseursBaies, pt: Point3, o: BaieRelief, carreaux: Carreaux | null): void {
  const m = MENUISERIE.largeur, e = MENUISERIE.epaisseur;
  pave(b.menuiserie, pt, o.x, o.x + m, o.y, o.y + o.h, 0, e);
  pave(b.menuiserie, pt, o.x + o.l - m, o.x + o.l, o.y, o.y + o.h, 0, e);
  pave(b.menuiserie, pt, o.x + m, o.x + o.l - m, o.y + o.h - m, o.y + o.h, 0, e);
  pave(b.menuiserie, pt, o.x + m, o.x + o.l - m, o.y, o.y + m, 0, e);
  if (carreaux) {
    const p = PETITS_BOIS_M, ep = e * 0.7;
    const l = o.l - 2 * m;
    // Une imposte : une traverse aussi large que le dormant, et ses petits bois au-dessus ; le reste de la baie dessous.
    const hImposte = carreaux.imposte ? (o.h - 2 * m) * carreaux.imposte.part : 0;
    const haut = o.y + o.h - m - hImposte;
    if (carreaux.imposte) {
      pave(b.menuiserie, pt, o.x + m, o.x + o.l - m, haut - m / 2, haut + m / 2, 0, e);
      for (let c = 1; c < carreaux.imposte.colonnes; c++) {
        const xc = o.x + m + (l * c) / carreaux.imposte.colonnes;
        pave(b.menuiserie, pt, xc - p / 2, xc + p / 2, haut + m / 2, o.y + o.h - m, 0, ep);
      }
    }
    const h = haut - (carreaux.imposte ? m / 2 : 0) - (o.y + m);
    for (let c = 1; c < carreaux.colonnes; c++) {
      const xc = o.x + m + (l * c) / carreaux.colonnes;
      // Le meneau central des deux vantaux est aussi large que le dormant.
      const w = c * 2 === carreaux.colonnes ? m : p;
      pave(b.menuiserie, pt, xc - w / 2, xc + w / 2, o.y + m, o.y + m + h, 0, e);
    }
    for (let r = 1; r < carreaux.rangs; r++) {
      const yr = o.y + m + (h * r) / carreaux.rangs;
      // La traverse d'une guillotine, entre ses deux chassis, est aussi large que le dormant.
      const w = carreaux.traverse && r * 2 === carreaux.rangs ? m : p;
      pave(b.menuiserie, pt, o.x + m, o.x + o.l - m, yr - w / 2, yr + w / 2, 0, w === m ? e : ep);
    }
  }
  b.vitre.quad(pt(o.x, o.y, S_VITRE), pt(o.x + o.l, o.y, S_VITRE), pt(o.x + o.l, o.y + o.h, S_VITRE), pt(o.x, o.y + o.h, S_VITRE));
}

/**
 * La porte d'entree : encadrement sans appui, un vantail a deux panneaux en relief, une imposte vitree au-dessus d'une porte haute.
 * `remplissage` (vu par Claude) : vitree, la vitre remplace les deux panneaux ; semi-vitree, le panneau du haut.
 */
export function poserPorteEnCreux(b: BatisseursBaies, pt: Point3, o: BaieRelief, hMur: number, remplissage?: DetailsOuverture['remplissage']): void {
  const L = ENCADREMENT.largeur, S = ENCADREMENT.saillie;
  const haut = Math.min(o.y + o.h + LINTEAU_M, hMur - 0.05);
  pave(b.encadrement, pt, o.x - L, o.x, o.y, o.y + o.h, 0, S);
  pave(b.encadrement, pt, o.x + o.l, o.x + o.l + L, o.y, o.y + o.h, 0, S);
  pave(b.encadrement, pt, o.x - L, o.x + o.l + L, o.y + o.h, haut, 0, S);
  const imposte = o.h >= 2.3 ? 0.35 : 0;
  const hv = o.h - imposte;
  b.porte.quad(pt(o.x, o.y, S_VITRE), pt(o.x + o.l, o.y, S_VITRE), pt(o.x + o.l, o.y + hv, S_VITRE), pt(o.x, o.y + hv, S_VITRE));
  // Deux panneaux en relief, l'un sur l'autre.
  const marge = Math.min(0.12, o.l * 0.15);
  const h1 = hv * 0.38, ecart = 0.1;
  // La vitre d'une porte, devant le vantail (elle doit gagner le test de profondeur sur lui).
  const vitre = (y0: number, y1: number) => b.vitre.quad(pt(o.x + marge, y0, S_VITRE + 0.005), pt(o.x + o.l - marge, y0, S_VITRE + 0.005), pt(o.x + o.l - marge, y1, S_VITRE + 0.005), pt(o.x + marge, y1, S_VITRE + 0.005));
  if (remplissage === 'vitree') vitre(o.y + marge, o.y + hv - marge);
  else pave(b.porte, pt, o.x + marge, o.x + o.l - marge, o.y + marge, o.y + marge + h1, S_VITRE, S_VITRE + 0.02);
  if (remplissage === 'semi-vitree') vitre(o.y + marge + h1 + ecart, o.y + hv - marge);
  else if (remplissage !== 'vitree') pave(b.porte, pt, o.x + marge, o.x + o.l - marge, o.y + marge + h1 + ecart, o.y + hv - marge, S_VITRE, S_VITRE + 0.02);
  if (imposte) poserMenuiserie(b, pt, { x: o.x, y: o.y + hv, l: o.l, h: imposte }, null);
}

/**
 * La porte de garage : encadrement, et des lames horizontales qui accrochent la lumiere (sectionnelle, ou inconnue).
 * `garage` (vu par Claude) : basculante, un panneau lisse ; a battants, un joint vertical au milieu ; enroulable, des lames fines.
 */
export function poserGarageEnCreux(b: BatisseursBaies, pt: Point3, o: BaieRelief, hMur: number, garage?: DetailsOuverture['garage']): void {
  const L = ENCADREMENT.largeur * 0.8, S = ENCADREMENT.saillie * 0.6;
  const haut = Math.min(o.y + o.h + LINTEAU_M, hMur - 0.05);
  pave(b.encadrement, pt, o.x - L, o.x, o.y, o.y + o.h, 0, S);
  pave(b.encadrement, pt, o.x + o.l, o.x + o.l + L, o.y, o.y + o.h, 0, S);
  pave(b.encadrement, pt, o.x - L, o.x + o.l + L, o.y + o.h, haut, 0, S);
  b.porte.quad(pt(o.x, o.y, S_VITRE), pt(o.x + o.l, o.y, S_VITRE), pt(o.x + o.l, o.y + o.h, S_VITRE), pt(o.x, o.y + o.h, S_VITRE));
  const joint = 0.03;
  if (garage === 'battants') {
    const xm = o.x + o.l / 2;
    pave(b.porte, pt, xm - joint / 2, xm + joint / 2, o.y, o.y + o.h, S_VITRE, S_VITRE + 0.015);
    return;
  }
  if (garage === 'basculante') return;
  const lame = garage === 'enroulable' ? 0.1 : 0.5;
  for (let y = o.y + lame; y < o.y + o.h - 0.05; y += lame) {
    pave(b.porte, pt, o.x, o.x + o.l, y - joint / 2, y + joint / 2, S_VITRE, S_VITRE + 0.015);
  }
}

// ---- Maconnerie -----------------------------------------------------------------------------------

/** Ce que l'epoque donne aux murs. */
export interface Maconnerie {
  corniche: boolean;
  bandeaux: boolean;
  chaines: boolean;
}

/**
 * Avant 1930, la maison de pierre ou de meuliere : corniche, bandeaux d'etage, chaines d'angle.
 * De 1930 a 1950, la corniche et les bandeaux. De 1950 a 1975, la corniche seule. Apres, ou sans
 * epoque connue, rien : un mur nu ne ment pas.
 */
export function maconnerieSelonEpoque(annee: number | null): Maconnerie {
  if (annee === null || annee >= 1975) return { corniche: false, bandeaux: false, chaines: false };
  return { corniche: true, bandeaux: annee < 1950, chaines: annee < 1930 };
}

export const CORNICHE = { hauteur: 0.22, saillie: 0.1 } as const;
export const BANDEAU = { hauteur: 0.12, saillie: 0.03 } as const;
/** Les pierres d'une chaine d'angle : hauteur d'assise, longueurs alternees, saillie. */
export const CHAINE = { assise: 0.3, long: 0.42, court: 0.26, saillie: 0.02 } as const;

/** Un mur, dans son repere : sa largeur et sa hauteur a l'egout. */
export interface MurRelief {
  largeur: number;
  hauteur: number;
}

/**
 * La corniche sous l'egout, les bandeaux aux planchers (`niveaux` hauteurs d'etage egales), et les
 * chaines d'angle aux deux extremites du mur quand `angles` le dit (un angle vif, pas un mur qui se
 * prolonge). Les bandeaux s'interrompent au droit des baies, qu'ils ne doivent pas barrer.
 */
export function poserMaconnerie(b: Batisseur, pt: Point3, mur: MurRelief, m: Maconnerie, niveaux: { n: number; hauteur: number }, angles: { gauche: boolean; droite: boolean }, baies: readonly BaieRelief[]): void {
  if (m.corniche && mur.hauteur > CORNICHE.hauteur + 1) {
    pave(b, pt, 0, mur.largeur, mur.hauteur - CORNICHE.hauteur, mur.hauteur, 0, CORNICHE.saillie);
  }
  if (m.bandeaux && niveaux.n >= 2) {
    for (let k = 1; k < niveaux.n; k++) {
      const y0 = k * niveaux.hauteur - BANDEAU.hauteur / 2, y1 = y0 + BANDEAU.hauteur;
      if (y1 > mur.hauteur - CORNICHE.hauteur - 0.1) continue;
      // Les troncons du bandeau entre les baies qui le croisent.
      const coupes = baies.filter((o) => o.y - APPUI.hauteur < y1 && o.y + o.h + LINTEAU_M > y0)
        .map((o) => [o.x - ENCADREMENT.largeur - APPUI.debord, o.x + o.l + ENCADREMENT.largeur + APPUI.debord] as const)
        .sort((a, c) => a[0] - c[0]);
      let x = 0;
      for (const [a, c] of coupes) { pave(b, pt, x, Math.max(x, a), y0, y1, 0, BANDEAU.saillie); x = Math.max(x, c); }
      pave(b, pt, x, mur.largeur, y0, y1, 0, BANDEAU.saillie);
    }
  }
  if (m.chaines && mur.largeur > 2 * CHAINE.long) {
    const hautChaine = m.corniche ? mur.hauteur - CORNICHE.hauteur : mur.hauteur;
    let k = 0;
    for (let y = 0; y + 0.05 < hautChaine; y += CHAINE.assise, k++) {
      const y1 = Math.min(y + CHAINE.assise - 0.015, hautChaine);
      // Harpe : la pierre longue d'un mur repond a la courte du mur voisin, une assise sur deux.
      const lg = k % 2 === 0 ? CHAINE.long : CHAINE.court, ld = k % 2 === 0 ? CHAINE.court : CHAINE.long;
      if (angles.gauche) pave(b, pt, 0, lg, y, y1, 0, CHAINE.saillie);
      if (angles.droite) pave(b, pt, mur.largeur - ld, mur.largeur, y, y1, 0, CHAINE.saillie);
    }
  }
}

/** La pierre des encadrements et de la maconnerie : la couleur du mur, eclaircie vers un calcaire clair. */
export function couleurPierre(couleurMur: string | number): THREE_NS.Color {
  return new THREE.Color(couleurMur).lerp(new THREE.Color(0xeee8dc), 0.55);
}

/** La vitre : sombre, lisse, elle reflete le ciel quand la scene l'eclaire (three/rendu.ts). */
export const VITRE = { couleur: 0x4a6278, rugosite: 0.08, metal: 0.5 } as const;

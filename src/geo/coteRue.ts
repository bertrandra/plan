// Le cote sur rue d'une parcelle, devine, et le cote ou poser un acces neuf (MD/spec-cloture.md §2.1).
//
// Une seule regle pour tous les chemins qui creent un portail ou un portillon : la cloture d'un
// import (geo/cadastreObjets.ts), les boutons « Ajouter un portail / un portillon » de l'inspecteur
// (ui/champs/cloture.ts), le portail vu sur place par un audit de la parcelle
// (app/audit/parcelle/propositions.ts) ; le carport neuf s'en approche aussi (model/placement.ts).
//
// Le plan sait plusieurs choses qui disent ou est la rue, de la plus sure a la moins sure :
// - ce que l'utilisateur a dit d'un cote (`limite: 'rue'`, `'separative'`, `mitoyenne`) : jamais
//   contredit ;
// - le point d'adresse de la BAN, pose sur la voirie devant la porte (l'import le range sur la
//   parcelle, `cadastre.adresseLat/Lon`) ;
// - les rues lues a la BD TOPO (`ruesVoisinage`, geo/rues.ts) : l'axe de la voie longe le cote sur rue ;
// - les parcelles voisines : un cote qui partage au moins 1 m de limite avec l'une d'elles est
//   mitoyen (la regle de model/mitoyennete.ts), il ne donne pas sur le domaine public.
// Un cote mitoyen n'est jamais devine sur rue tant qu'il reste un cote libre.

import { projecteurLocal } from './projection.js';
import { pointInPolygon } from '../geometry/basic.js';
import { distancePointContour, longueurFrontiere } from '../geometry/proximite.js';
import { distancePointSegment } from '../geometry/segments.js';
import { sommetDe } from '../geometry/anneau.js';
import { au } from '../util/tableaux.js';
import { aDesSommets } from '../model/formes.js';
import { FRONTIERE_MITOYENNE_M } from '../model/mitoyennete.js';
import { clotureDe, coteDAcces } from '../model/cloture.js';
import type { ObjetPlan, PtBrut } from '../model/types.js';

/** Au-dela, le point d'adresse ne dit plus rien de la parcelle (adresse resolue a la rue, a la commune). */
export const DISTANCE_ADRESSE_MAX_M = 30;
/** Au-dela, l'axe d'une rue ne longe plus le cote : une demi-emprise de boulevard, pas davantage. */
export const DISTANCE_RUE_MAX_M = 20;
/**
 * Les bouts d'un cote ne comptent pas dans sa limite commune : la voisine d'un cote sur rue le touche
 * a chaque coin, sur pres d'un metre a 50 cm de tolerance (mesure sur AE 101). Sans cette marge, le
 * cote sur rue d'une parcelle entre deux voisines passerait pour mitoyen.
 */
const MARGE_COIN_M = 1;
const TOLERANCE_FRONTIERE_M = 0.5;
/** Un cote plus court ne recoit rien : un point double du contour, pas une limite. */
const COTE_MIN_M = 0.05;

/** Ce qui a fait choisir le cote sur rue : le point d'adresse, une rue lue, ou l'absence de voisine. */
export type RaisonCoteRue = 'adresse' | 'rue' | 'sansVoisin';
export interface CoteRueDevine { cote: number; raison: RaisonCoteRue; /** Le nom de la rue, quand c'est elle. */ rue?: string }

/** Le point d'adresse dans le repere du plan, s'il est enregistre et que le plan est cale. */
export function pointAdresse(parcelle: ObjetPlan): PtBrut | null {
  const cad = parcelle.cadastre;
  if (!cad) return null;
  const { origineLat, origineLon, adresseLat, adresseLon } = cad as Record<string, unknown>;
  if (typeof origineLat !== 'number' || typeof origineLon !== 'number' || typeof adresseLat !== 'number' || typeof adresseLon !== 'number') return null;
  // L'origine du plan est le point de calage : le point d'adresse se projette depuis lui.
  return projecteurLocal(origineLat, origineLon).versMetres(adresseLon, adresseLat);
}

const longueur = (a: PtBrut, b: PtBrut) => Math.hypot(b.x - a.x, b.y - a.y);

/** Les contours des parcelles voisines du plan, plus ceux que l'appelant connait sans les avoir poses (l'import). */
function contoursVoisins(parcelle: ObjetPlan, objets: readonly ObjetPlan[], autres: readonly (readonly PtBrut[])[]): (readonly PtBrut[])[] {
  const duPlan = objets.filter((o) => o !== parcelle && o.fonction === 'terrain' && !!o.cadastre?.idu && aDesSommets(o) && o.pts.length >= 3).map((o) => (o as ObjetPlan & { pts: PtBrut[] }).pts);
  return [...duPlan, ...autres.filter((c) => c.length >= 3)];
}

/** La limite commune d'un cote avec un contour, ses bouts retires (MARGE_COIN_M). */
function limiteCommune(a: PtBrut, b: PtBrut, voisin: readonly PtBrut[]): number {
  const L = longueur(a, b);
  const m = Math.min(MARGE_COIN_M, L / 4);
  const ux = (b.x - a.x) / L, uy = (b.y - a.y) / L;
  const a2 = { x: a.x + ux * m, y: a.y + uy * m }, b2 = { x: b.x - ux * m, y: b.y - uy * m };
  // `longueurFrontiere` parcourt les deux sens du segment : la longueur commune compte deux fois.
  return longueurFrontiere([a2, b2], voisin, TOLERANCE_FRONTIERE_M) / 2;
}

/**
 * Pour chaque cote : vrai s'il est mitoyen. Ce que l'utilisateur en a dit l'emporte (« sur rue » :
 * libre ; « separative » ou « mitoyenne » : mitoyen) ; sinon, au moins `FRONTIERE_MITOYENNE_M` de
 * limite commune avec une voisine. `null` quand rien n'est connu : ni voisine, ni cote precise.
 * `autres` : des contours de voisines que le plan n'a pas (l'import les connait sans les poser).
 */
export function cotesMitoyens(parcelle: ObjetPlan, objets: readonly ObjetPlan[], autres: readonly (readonly PtBrut[])[] = []): boolean[] | null {
  if (!aDesSommets(parcelle)) return null;
  const pts = parcelle.pts;
  const voisins = contoursVoisins(parcelle, objets, autres);
  const dits = clotureDe(parcelle).cotes.filter((c) => c.limite || c.mitoyenne);
  if (!voisins.length && !dits.length) return null;
  return pts.map((a, i) => {
    const dit = dits.find((c) => c.cote === i);
    if (dit?.limite === 'rue') return false;
    if (dit?.limite === 'separative' || dit?.mitoyenne) return true;
    const b = sommetDe(pts, i + 1);
    if (longueur(a, b) < COTE_MIN_M) return true;
    return voisins.some((v) => limiteCommune(a, b, v) >= FRONTIERE_MITOYENNE_M);
  });
}

/** Les cotes qui ne longent aucune parcelle voisine : vrai pour chacun, `null` sans rien de connu. */
export function cotesSansMitoyen(parcelle: ObjetPlan, objets: readonly ObjetPlan[], autres: readonly (readonly PtBrut[])[] = []): boolean[] | null {
  return cotesMitoyens(parcelle, objets, autres)?.map((m) => !m) ?? null;
}

/** Un nom de voie comparable : sans accents, sans casse, espaces simples. */
const normaliser = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** Le cote (parmi `candidats`) dont le milieu est le plus pres d'une des rues, s'il est a moins de DISTANCE_RUE_MAX_M. */
function presDUneRue(pts: readonly PtBrut[], candidats: readonly number[], rues: readonly { nom: string; troncons: PtBrut[][] }[]): CoteRueDevine | null {
  let meilleur: CoteRueDevine | null = null, min = DISTANCE_RUE_MAX_M;
  for (const i of candidats) {
    const a = au(pts, i), b = sommetDe(pts, i + 1);
    const milieu = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    for (const r of rues) for (const t of r.troncons) {
      for (let k = 1; k < t.length; k++) {
        const d = distancePointSegment(milieu, au(t, k - 1), au(t, k));
        if (d < min) { min = d; meilleur = { cote: i, raison: 'rue', rue: r.nom }; }
      }
    }
  }
  return meilleur;
}

/**
 * Le cote sur rue devine, et ce qui l'a fait choisir. Parmi les cotes non mitoyens (tous, si aucun
 * ne l'est pas) : le plus pres du point d'adresse, quand celui-ci est hors de la parcelle et a moins
 * de `DISTANCE_ADRESSE_MAX_M` ; sinon celui que longe une rue lue (celle de l'adresse d'abord) ;
 * sinon le plus long des cotes sans voisine ; `null` quand rien ne permet de deviner.
 */
export function devinerCoteRue(parcelle: ObjetPlan, objets: readonly ObjetPlan[], autres: readonly (readonly PtBrut[])[] = []): CoteRueDevine | null {
  if (!aDesSommets(parcelle) || parcelle.pts.length < 3) return null;
  const pts = parcelle.pts;
  const mitoyens = cotesMitoyens(parcelle, objets, autres);
  const valides = pts.map((_, i) => i).filter((i) => longueur(au(pts, i), sommetDe(pts, i + 1)) >= COTE_MIN_M);
  const libres = mitoyens ? valides.filter((i) => !mitoyens[i]) : valides;
  const candidats = libres.length ? libres : valides;

  const adresse = pointAdresse(parcelle);
  if (adresse && !pointInPolygon(adresse, pts)) {
    let meilleur = -1, min = Infinity;
    for (const i of candidats) {
      const d = distancePointContour(adresse, [au(pts, i), sommetDe(pts, i + 1)]);
      // A egalite (un point d'adresse au coin), le premier cote garde la place, comme avant.
      if (d < min - 1e-9) { min = d; meilleur = i; }
    }
    if (meilleur >= 0 && min <= DISTANCE_ADRESSE_MAX_M) return { cote: meilleur, raison: 'adresse' };
  }

  const rues = parcelle.ruesVoisinage?.rues ?? [];
  if (rues.length) {
    // La rue de l'adresse d'abord : au coin de deux rues, le portail donne sur celle du numero.
    const libelle = typeof parcelle.cadastre?.adresse === 'string' ? normaliser(parcelle.cadastre.adresse) : '';
    const deLAdresse = libelle ? rues.filter((r) => { const n = normaliser(r.nom); return !!n && (' ' + libelle + ' ').includes(' ' + n + ' '); }) : [];
    const r = (deLAdresse.length ? presDUneRue(pts, candidats, deLAdresse) : null) ?? presDUneRue(pts, candidats, rues);
    if (r) return r;
  }

  if (!mitoyens || !libres.length) return null;
  let meilleur = -1, max = 0;
  for (const i of libres) {
    const L = longueur(au(pts, i), sommetDe(pts, i + 1));
    if (L > max) { max = L; meilleur = i; }
  }
  return meilleur >= 0 ? { cote: meilleur, raison: 'sansVoisin' } : null;
}

/** Le cote sur rue devine seul, `null` quand rien ne permet de deviner. */
export function coteRueDevine(parcelle: ObjetPlan, objets: readonly ObjetPlan[], autres: readonly (readonly PtBrut[])[] = []): number | null {
  return devinerCoteRue(parcelle, objets, autres)?.cote ?? null;
}

/**
 * Le cote ou poser un acces neuf : celui que l'utilisateur dit sur rue, sinon le cote sur rue devine,
 * sinon le plus long (model/cloture.ts::coteDAcces). La regle de tous les chemins de creation.
 */
export function coteDuNouvelAcces(parcelle: ObjetPlan, objets: readonly ObjetPlan[], autres: readonly (readonly PtBrut[])[] = []): number {
  const pts = aDesSommets(parcelle) ? parcelle.pts : [];
  return coteDAcces(clotureDe(parcelle), pts, coteRueDevine(parcelle, objets, autres));
}

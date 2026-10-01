// Le toit qu'on deduit de la BD TOPO, sans photo (MD/spec-toit-ign.md §4).
//
// La BD TOPO donne, par batiment, l'altitude de l'egout (`altitude_minimale_toit`) et celle du point
// le plus haut du toit (`altitude_maximale_toit`). Leur ecart est la hauteur du toit ; posee sur le
// squelette droit du contour, elle donne un toit a croupes qui vaut pour un rectangle comme pour un
// L. C'est une estimation avouee (`source: 'bdtopo'`) : a un metre pres, et sans pignons. Un releve
// de facade ou une saisie la remplacent.
//
// Ce module est au rang du modele, et non de `geo/`, parce que la migration des plans anterieurs
// (model/migrations.ts) pose ce meme toit sur les batiments importes avant lui.

import { nombreFr } from '../util/format.js';
import { squeletteDroit, demiLargeurApprochee } from '../geometry/squelette.js';
import type { PtBrut, Toit } from './types.js';

/** La couche BD TOPO des batiments ; `geo/apiIgn.ts` l'interroge sous ce nom. */
export const COUCHE_BATIMENT_BDTOPO = 'BDTOPO_V3:batiment';

/** Pente d'un toit dont la BD TOPO ne donne pas la hauteur : celle d'une couverture en tuiles. */
export const PENTE_DEFAUT_DEG = 35;
/** En dessous, le toit est dit plat : un toit-terrasse, ou un ecart que la mesure ne distingue pas. */
export const HAUTEUR_TOIT_MIN_M = 0.5;
export const PENTE_MIN_DEG = 10;
/** Au-dela, la hauteur ne decrit sans doute pas la couverture (cheminee, tourelle) : on ecrete. */
export const PENTE_MAX_DEG = 55;
export const PENTE_ECRETEE_DEG = 45;

const deg = (r: number) => (r * 180) / Math.PI;
const cm = (v: number) => Math.round(v * 100) / 100;

/** Ce que le toit retient des attributs BD TOPO d'un batiment. */
export interface AttributsToit {
  altitudeToitMinM: number | null;
  altitudeToitMaxM: number | null;
  constructionLegere: boolean;
}

/** Les attributs utiles, lus dans les proprietes brutes d'une entite BD TOPO. */
export function attributsToitBdTopo(props: Record<string, unknown>): AttributsToit {
  return {
    altitudeToitMinM: nombreFr(props.altitude_minimale_toit),
    altitudeToitMaxM: nombreFr(props.altitude_maximale_toit),
    constructionLegere: String(props.construction_legere) === 'True',
  };
}

/** Le toit d'un batiment BD TOPO sur son contour, selon les regles de MD/spec-toit-ign.md §4. */
export function toitBdTopo(pts: readonly PtBrut[], a: AttributsToit): Toit {
  const plat: Toit = { forme: 'plat', hauteur: 0, angleFaitage: 0, source: 'bdtopo' };
  // Regle 2 : un abri, une serre, un auvent.
  if (a.constructionLegere) return plat;
  const dmax = squeletteDroit(pts)?.dmax ?? demiLargeurApprochee(pts);
  if (!(dmax > 0)) return plat;
  // Regle 3 : pas d'altitudes, une pente de tuile.
  if (a.altitudeToitMinM === null || a.altitudeToitMaxM === null) {
    return { forme: 'croupes', hauteur: cm(dmax * Math.tan((PENTE_DEFAUT_DEG * Math.PI) / 180)), angleFaitage: 0, source: 'bdtopo', estime: true };
  }
  const H = cm(a.altitudeToitMaxM - a.altitudeToitMinM);
  // Regles 4 et 5 : trop bas ou trop peu pentu pour etre autre chose qu'un toit plat.
  if (H < HAUTEUR_TOIT_MIN_M) return plat;
  const pente = deg(Math.atan(H / dmax));
  if (pente < PENTE_MIN_DEG) return plat;
  // Regle 6 : trop raide, on ecrete.
  if (pente > PENTE_MAX_DEG) return { forme: 'croupes', hauteur: H, angleFaitage: 0, source: 'bdtopo', pente: PENTE_ECRETEE_DEG };
  // Regle 7.
  return { forme: 'croupes', hauteur: H, angleFaitage: 0, source: 'bdtopo' };
}

/**
 * Ce que l'actualisation fait du toit d'un batiment (MD/spec-toit-ign.md §5.3) : un toit lu sur une
 * photo ou saisi est garde ; un toit BD TOPO est recalcule, en gardant la couleur choisie ; un
 * batiment sans toit en recoit un.
 */
export function toitActualise(ancien: Toit | null | undefined, pts: readonly PtBrut[], a: AttributsToit): Toit {
  if (ancien && ancien.source !== 'bdtopo') return ancien;
  const neuf = toitBdTopo(pts, a);
  if (!ancien?.couleur) return neuf;
  // Une couleur posee par Plan (orthophoto ou repli) suit le toit avec son origine : la lecture de
  // l'orthophoto qui suit l'actualisation la revoit. Une couleur choisie n'a pas d'origine et reste.
  return ancien.origineCouleur ? { ...neuf, couleur: ancien.couleur, origineCouleur: ancien.origineCouleur } : { ...neuf, couleur: ancien.couleur };
}

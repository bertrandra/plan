// Le batiment d'un etalon de synthese (facade/banc/etalons.ts), pour en faire un projet de demonstration (decision du proprietaire,
// 4 novembre 2026) : la scene ne decrit qu'un mur, le reste du batiment se pose autour de lui par une regle fixe, toujours la meme.
//
// - Le mur photographie est le cote 0 du contour, de (0, 0) a (L, 0), vu du sud ; le batiment va vers le nord sur PROFONDEUR_M.
// - Un mur gouttereau : un toit a deux pans dont le faitage est parallele au mur, a PENTE_DEG ; l'egout du mur est celui de la scene.
// - Un mur pignon garde son pignon : le faitage est perpendiculaire au mur, a la hauteur et a la place que la scene donne a la pointe
//   (une pointe au bout du mur : un appentis, sa rive haute de ce cote).
// - Les parties basses du mur sont des corps a part, sur toute la profondeur, a leur egout : chacune un appentis adosse a la partie
//   haute (decision du proprietaire, 4 novembre 2026 : a deux pans et 40 degres, le garage montait au-dessus de l'egout de la maison et
//   se lisait comme une seconde maison). Une seule pente, sa rive basse cote rue (le mur photographie, ou la scene peint sa bande de
//   tuiles), sa rive haute au fond, SOUS_EGOUT_M sous l'egout de la partie haute. Le gabarit que la chaine en tire (gabaritDesCorps) a
//   leurs marches, le releve leurs parties basses, et la 3D leurs volumes (facade/profil.ts::volumesEtHautesDuBatiment).
//
// Les nombres sont ceux de la scene : rien n'est mesure ici. Le gabarit que donnent ces corps est celui de la scene (gabaritVrai), teste.

import type { CorpsToit, PtBrut, Toit } from '../../model/types.js';
import { partiesBassesSynthese, type SceneFacade } from './synthese.js';

/** Les etalons qui ont un projet de demonstration : un par sorte de mur (decision du proprietaire, 4 novembre 2026). */
export const ETALONS_AVEC_PROJET: readonly string[] = ['02', '07', '16', '20', '22', '23', '25', '26'];
export const PROFONDEUR_M = 9;
export const PENTE_DEG = 40;
/** La rive haute de l'appentis d'une partie basse, sous l'egout de la partie haute a laquelle il s'adosse. */
export const SOUS_EGOUT_M = 0.3;

/** Cet etalon a-t-il un projet de demonstration ? Par le numero de sa scene. */
export const aUnProjet = (nom: string): boolean => ETALONS_AVEC_PROJET.includes(nom.slice(0, 2));

export interface BatimentEtalon {
  /** Le contour, sens trigonometrique : le cote 0 est le mur photographie. */
  contour: PtBrut[];
  /** L'egout le plus haut du mur, en metres : la hauteur du batiment. */
  hauteur: number;
  corps: CorpsToit[];
  /** Le toit simple qui resume le corps principal (l'inspecteur, un dessin sans corps). */
  toit: Toit;
}

const r3 = (v: number) => Math.round(v * 1000) / 1000;
const montee = (largeur: number) => r3((largeur / 2) * Math.tan((PENTE_DEG * Math.PI) / 180));

/**
 * L'appentis d'une partie basse, de x0 a x1 : sa rive basse sur le mur (cote `pts[0]-pts[1]`, a l'egout `egout`), sa rive haute au fond
 * (`posFaitage` = la profondeur), a `haut`.
 */
function appentisAdosse(x0: number, x1: number, egout: number, haut: number, D: number): CorpsToit {
  const h = r3(Math.max(egout, haut));
  return { pts: [{ x: x0, y: 0 }, { x: x1, y: 0 }, { x: x1, y: D }, { x: x0, y: D }], posFaitage: D, faitage: h, egouts: [egout, h], pignons: [], ecart: 0 };
}

/** Un corps a deux pans dont le faitage suit le mur, de x0 a x1, a l'egout `egout`. */
function corpsParallele(x0: number, x1: number, egout: number, D: number): CorpsToit {
  return { pts: [{ x: x0, y: 0 }, { x: x1, y: 0 }, { x: x1, y: D }, { x: x0, y: D }], posFaitage: D / 2, faitage: r3(egout + montee(D)), egouts: [egout, egout], pignons: [], ecart: 0 };
}

export function batimentDeLEtalon(s: SceneFacade): BatimentEtalon {
  const L = s.verite.largeur, H = s.verite.hauteur, D = PROFONDEUR_M, m = s.synthese.mur;
  const contour = [{ x: 0, y: 0 }, { x: L, y: 0 }, { x: L, y: D }, { x: 0, y: D }];
  const pignon = m.pignon ?? 0;
  if (pignon > 0) {
    // Le faitage perpendiculaire au mur : pts[0] -> pts[1] le long du faitage (vers le nord), pts[0] -> pts[3] le long du mur.
    const sommet = m.pignonSommet ?? 0.5;
    const appentis = sommet >= 0.98 || sommet <= 0.02;
    const pos = appentis ? (sommet >= 0.5 ? L : 0) : r3(sommet * L);
    const faitage = r3(H + pignon);
    const corps: CorpsToit = {
      pts: [{ x: 0, y: 0 }, { x: 0, y: D }, { x: L, y: D }, { x: L, y: 0 }], posFaitage: pos, faitage,
      egouts: appentis ? (pos === 0 ? [faitage, H] : [H, faitage]) : [H, H], pignons: [], ecart: 0,
    };
    return { contour, hauteur: H, corps: [corps], toit: { forme: appentis ? 'appentis' : 'deux-pans', hauteur: r3(pignon), angleFaitage: 90, source: 'saisie' } };
  }
  // Un gouttereau, et ses parties basses : les troncons du mur, chacun a son egout.
  const basses = partiesBassesSynthese(s);
  const troncons: { x0: number; x1: number; egout: number; basse: boolean }[] = [];
  let x = 0;
  for (const b of basses) {
    if (b.debut > x + 1e-6) troncons.push({ x0: x, x1: b.debut, egout: H, basse: false });
    troncons.push({ x0: b.debut, x1: b.fin, egout: b.hauteur, basse: true });
    x = b.fin;
  }
  if (x < L - 1e-6) troncons.push({ x0: x, x1: L, egout: H, basse: false });
  return {
    contour, hauteur: H, toit: { forme: 'deux-pans', hauteur: montee(D), angleFaitage: 0, source: 'saisie' },
    corps: troncons.map((t) => (t.basse ? appentisAdosse(t.x0, t.x1, t.egout, H - SOUS_EGOUT_M, D) : corpsParallele(t.x0, t.x1, t.egout, D))),
  };
}

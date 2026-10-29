// L'assemblage de la facade sud d'AE 101 refait en synthese a partir de son etalon (tests/fixtures/facades-reel/etalons/ae101-sud.json) :
// les photos du cas ne sont pas dans le depot (donnee personnelle), mais son defaut se reproduit (MD/spec-facade-calage-audit.md §2).
// Le mur vrai est la ou l'etalon le dit (x de 140 a 750 sur l'assemblage), aux proportions du plan (l'egout de l'appentis, 2,4 m, sur
// 8,96 m) ; au-dessus de l'appentis, l'etage et ses deux pignons suivent le gabarit de l'etalon, et un pan de bois dessine, dans le
// pignon de droite, un rectangle net aux memes proportions, la ou le calage automatique s'arretait (x de 451 a 752, le constat). Les
// angles vrais sont en partie caches (une haie a droite ; un buisson, ou un arbre entier a gauche) : les aretes y sont plus faibles que celles du pan de
// bois, comme sur la vraie photo. Le ciel et l'enduit ont presque la meme teinte, comme a AE 101.

import type { Image } from '../../../src/facade/vision/homographie.js';
import type { EtalonFacade } from './reel.js';

type RGB = [number, number, number];
const CIEL: RGB = [209, 206, 199], SOL: RGB = [98, 116, 78], VERDURE: RGB = [62, 86, 56], ENDUIT: RGB = [214, 208, 196];
const ARDOISE: RGB = [84, 88, 96], PAN_DE_BOIS: RGB = [58, 96, 66], BAIE: RGB = [112, 114, 120], BUISSON: RGB = [48, 78, 44];
/** Le rez-de-chaussee, sous l'appentis de la galerie, est a l'ombre. */
const OMBRE_GALERIE = 0.74;

/** Ce que la scene rend : l'assemblage (tout vu), le mur vrai et le leurre du pan de bois, en pixels. */
export interface SceneAe101 {
  image: Image;
  vu: Uint8Array;
  vrai: { x0: number; x1: number; y0: number; y1: number };
  leurre: { x0: number; x1: number; y0: number; y1: number };
}

/**
 * L'assemblage d'AE 101 sud en synthese. `angleGauche` : `buisson` cache le bas de l'angle gauche (l'angle se lit encore au-dessus) ;
 * `arbre` le cache en entier, sur toute la hauteur du rez-de-chaussee et au-dela (rien ne dit plus ou finit le mur).
 */
export function sceneAe101(e: EtalonFacade, angleGauche: 'buisson' | 'arbre'): SceneAe101 {
  const L = 1000, H = 640;
  const x0 = e.calageVrai.x0, x1 = e.calageVrai.x1, w = x1 - x0;
  const sol = 560, h = Math.round(w * (e.hauteurM / e.largeurM)), egout = sol - h;
  const yv = (v: number) => sol - v * h;
  // Le haut de l'etage et des pignons : le gabarit de l'etalon, interpole en u.
  const g = e.gabarit, uMin = g[0]?.u ?? 0, uMax = g[g.length - 1]?.u ?? 1;
  const haut = (x: number): number | null => {
    const u = (x - x0) / w;
    if (u < uMin || u > uMax) return null;
    for (let i = 0; i + 1 < g.length; i++) { const a = g[i]!, b = g[i + 1]!; if (u >= a.u && u <= b.u) return yv(a.v + ((b.v - a.v) * (u - a.u)) / Math.max(1e-9, b.u - a.u)); }
    return null;
  };
  const toitAppentis = egout - Math.round(0.35 * (h / e.hauteurM));
  const etage = yv(Math.min(...g.map((p) => p.v)));
  const leurre = { x0: e.constat.murCherche.x0, x1: e.constat.murCherche.x1, y0: Math.round(etage), y1: Math.round(etage + (e.constat.murCherche.x1 - e.constat.murCherche.x0) * (e.hauteurM / e.largeurM)) };
  const donnees = new Uint8ClampedArray(L * H * 4);
  let graine = 101;
  const bruit = () => { graine = (graine * 1103515245 + 12345) & 0x7fffffff; return (graine / 0x7fffffff - 0.5) * 8; };
  const dansEllipse = (x: number, y: number, cx: number, cy: number, rx: number, ry: number) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;
  const bois = 6;
  for (let y = 0; y < H; y++) for (let x = 0; x < L; x++) {
    let c: RGB = y >= sol ? SOL : CIEL;
    if (y < sol && y >= 330 && (x < x0 - 4 || x > x1 + 4)) c = VERDURE;
    const t = haut(x);
    if (t !== null && y >= t && y < toitAppentis) c = ENDUIT;
    if (y >= toitAppentis && y < egout && x >= x0 - 10 && x <= x1 + 10) c = ARDOISE;
    if (y >= egout && y < sol && x >= x0 && x <= x1) {
      const baie = (x >= 250 && x <= 330 || x >= 520 && x <= 600) && y >= egout + 40 && y <= egout + 100;
      c = baie ? BAIE : [ENDUIT[0] * OMBRE_GALERIE, ENDUIT[1] * OMBRE_GALERIE, ENDUIT[2] * OMBRE_GALERIE];
    }
    // Le pan de bois du pignon de droite : un cadre net, aux proportions du plan.
    const surCadre = (Math.abs(x - leurre.x0) < bois / 2 || Math.abs(x - leurre.x1) < bois / 2) && y >= leurre.y0 && y <= leurre.y1
      || (Math.abs(y - leurre.y0) < bois / 2 || Math.abs(y - leurre.y1) < bois / 2) && x >= leurre.x0 && x <= leurre.x1;
    if (surCadre) c = PAN_DE_BOIS;
    if (angleGauche === 'buisson' && dansEllipse(x, y, x0 + 10, sol, 70, 85)) c = BUISSON;
    if (angleGauche === 'arbre' && dansEllipse(x, y, x0 + 10, 400, 90, 170)) c = BUISSON;
    // Une haie basse contre l'angle droit : le bas de son arete est cache.
    if (dansEllipse(x, y, x1 - 10, sol, 60, 70)) c = BUISSON;
    const k = (y * L + x) * 4;
    donnees[k] = c[0] + bruit(); donnees[k + 1] = c[1] + bruit(); donnees[k + 2] = c[2] + bruit(); donnees[k + 3] = 255;
  }
  return { image: { largeur: L, hauteur: H, donnees }, vu: new Uint8Array(L * H).fill(1), vrai: { x0, x1, y0: egout, y1: sol }, leurre };
}

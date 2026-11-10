// Le fond local du mur et son seuil, zone par zone (MD/spec-facades-calage-detection.md §9 A, lot L14).
//
// Avant ce lot, la teinte de reference etait la mediane de toute la facade, et le seuil un seul nombre.
// Un soubassement en pierre, un bandeau clair, une meuliere relevaient ce seuil, ou faisaient de
// fausses baies, et les fenetres du rez-de-chaussee se collaient au soubassement (spec §2.2, L4).
//
// Le fond se lit maintenant en trois temps :
// 1. les objets nets (taches de la taille d'une baie, bien a l'ecart de la teinte globale) sont mis de
//    cote : ils ne doivent pas tirer le fond vers eux ;
// 2. le **fond de rang** : la mediane d'une bande horizontale de toute la largeur. Un soubassement, un
//    bandeau, l'ombre du debord sont des bandes : chacun devient le fond de son rang ;
// 3. le **fond local** : la mediane sur une fenetre glissante de 1,5 m de large, plus grande qu'une baie, des
//    seuls pixels proches du fond de leur rang. Il suit un degrade d'eclairage, un pignon d'une autre
//    couleur, de la brique a cote d'un enduit.
// Le seuil suit la meme regle qu'avant (`max(28, 3 x ecart median)`), mais sur la fenetre glissante :
// la brique a son seuil, l'enduit lisse le sien. L'ecart de teinte seule (chromaticite) a le sien.

import { au } from '../../util/tableaux.js';
import { PX_PAR_M, completer, completerRangs, medianeGlissante, medianeMasquee, morpho, taches, type Reduite } from './detectionCartes.js';
import type { ValeursDetection } from '../regles/facades/detection.js';

export interface FondDuMur {
  /** Le fond local, trois canaux par pixel de travail. */
  fond: Float32Array;
  /** L'ecart de chaque pixel a son fond. */
  ecart: Float32Array;
  /** Le seuil d'ecart de chaque pixel, zone par zone. */
  seuil: Float32Array;
  /** L'ecart de teinte seule (chromaticite) de chaque pixel a son fond, en niveaux. */
  chroma: Float32Array;
  /** Son seuil, zone par zone. */
  seuilChroma: Float32Array;
  /** Les pixels qui ont servi au fond : le mur, sans les objets. */
  mur: Uint8Array;
}

/** Surface minimale d'un objet mis de cote pour le fond : 0,05 m2, une vitre de petit bois. */
const SURFACE_OBJET_M2 = 0.05;
/** Part minimale de pixels de mur dans la fenetre pour que le fond y soit lu (sinon : celui du rang). */
const PART_FOND_MIN = 0.25;
/** Part minimale de pixels de mur dans une bande de rang. */
const PART_RANG_MIN = 0.2;

function distance(a: Float32Array, i: number, b: Float32Array | readonly number[], j: number): number {
  return Math.hypot((a[i * 3] ?? 0) - (b[j * 3] ?? 0), (a[i * 3 + 1] ?? 0) - (b[j * 3 + 1] ?? 0), (a[i * 3 + 2] ?? 0) - (b[j * 3 + 2] ?? 0));
}

/** L'ecart de chaque pixel vu a une carte de fond (ou a une teinte unique). */
function ecarts(R: Reduite, fond: Float32Array | readonly number[], unique: boolean): Float32Array {
  const d = new Float32Array(R.l * R.h);
  for (let i = 0; i < R.l * R.h; i++) if (R.vu[i]) d[i] = distance(R.rgb, i, fond, unique ? 0 : i);
  return d;
}

/**
 * Les objets nets, mis de cote pour le fond : les taches, ecartees de la teinte globale, qui ont la
 * taille d'une baie. Une bande (soubassement, bandeau) n'en est pas une : elle reste dans le fond, dont
 * elle devient la teinte dans son rang.
 */
function objetsNets(R: Reduite, rg: ValeursDetection): Uint8Array {
  const { l, h } = R;
  const teinte = medianeMasquee(R.rgb, 3, R.vu);
  const d0 = ecarts(R, teinte, true);
  const s0 = Math.max(rg['facades.detection.seuilMin'], rg['facades.detection.seuilFacteur'] * au(medianeMasquee(d0, 1, R.vu), 0));
  let b: Uint8Array = new Uint8Array(l * h);
  for (let i = 0; i < l * h; i++) b[i] = R.vu[i] && (d0[i] ?? 0) > s0 ? 1 : 0;
  // Une ouverture seule, sans fermeture : deux objets voisins ne doivent pas se souder en une bande.
  b = morpho(morpho(b, l, h, false), l, h, true);
  const { taches: ts, etiquettes } = taches(b, l, h);
  const garde = new Uint8Array(ts.length + 1);
  const surfaceMin = SURFACE_OBJET_M2 * PX_PAR_M * PX_PAR_M;
  for (const t of ts) {
    const lm = (t.x1 - t.x0 + 1) / PX_PAR_M,
      hm = (t.y1 - t.y0 + 1) / PX_PAR_M;
    const baie = lm <= rg['facades.detection.largeurMaxM'] && hm <= rg['facades.detection.hauteurMaxM'] && lm <= rg['facades.detection.bandeMaxPart'] * (l / PX_PAR_M);
    if (baie && t.n >= surfaceMin) garde[t.id] = 1;
  }
  const objets = new Uint8Array(l * h);
  for (let i = 0; i < l * h; i++) objets[i] = garde[etiquettes[i] ?? 0] ?? 0;
  return morpho(objets, l, h, true);
}

/** Le seuil d'une carte d'ecarts : `max(seuilMin, facteur x mediane)`, applique a une carte de medianes. */
function seuiller(med: Float32Array, rg: ValeursDetection): Float32Array {
  const s = new Float32Array(med.length);
  for (let i = 0; i < med.length; i++) s[i] = Math.max(rg['facades.detection.seuilMin'], rg['facades.detection.seuilFacteur'] * (med[i] ?? 0));
  return s;
}

export function fondDuMur(R: Reduite, rg: ValeursDetection): FondDuMur {
  const { l, h } = R;
  const objets = objetsNets(R, rg);
  const libre = new Uint8Array(l * h);
  for (let i = 0; i < l * h; i++) libre[i] = R.vu[i] && !objets[i] ? 1 : 0;

  // Le fond de rang : une bande horizontale de toute la largeur.
  const ry = Math.max(1, Math.round((rg['facades.detection.bandeRangM'] / 2) * PX_PAR_M));
  const teinte = medianeMasquee(R.rgb, 3, libre);
  const fondRang = completerRangs(medianeGlissante(R.rgb, 3, libre, l, h, l, ry, PART_RANG_MIN), 3, l, h, teinte);
  const dRang = ecarts(R, fondRang, false);
  const medRang = completerRangs(medianeGlissante(dRang, 1, libre, l, h, l, ry, PART_RANG_MIN), 1, l, h, [0]);
  const seuilRang = seuiller(medRang, rg);

  // Le mur : les pixels libres proches du fond de leur rang. Une baie ton sur ton que l'etape des objets
  // n'a pas vue en reste, mais elle n'a pas la majorite d'une fenetre de 1,5 m.
  const mur = new Uint8Array(l * h);
  for (let i = 0; i < l * h; i++) mur[i] = libre[i] && (dRang[i] ?? 0) <= (seuilRang[i] ?? 0) ? 1 : 0;

  // Le fond local : la fenetre glissante de 1,5 m de large, et de la hauteur de la bande de rang. Le rang
  // dit deja ou les zones changent en hauteur ; une fenetre carree, a 20 cm d'un soubassement, en
  // prendrait la teinte pour le fond de l'enduit qui le surmonte (les baies voisines mises de cote, le
  // soubassement y aurait la majorite), et collerait les fenetres du rez-de-chaussee au soubassement.
  // Le seuil, lui, se lit sur la fenetre carree : c'est le grain de la zone.
  const r = Math.max(1, Math.round((rg['facades.detection.fenetreFondM'] / 2) * PX_PAR_M));
  const fond = completer(medianeGlissante(R.rgb, 3, mur, l, h, r, ry, PART_FOND_MIN), 3, fondRang);
  const ecart = ecarts(R, fond, false);
  const med = medianeGlissante(ecart, 1, mur, l, h, r, r, PART_FOND_MIN);
  const seuil = completer({ v: seuiller(med.v, rg), ok: med.ok }, 1, seuilRang);
  // L'ecart de teinte seule (chromaticite), et son seuil. Le grain d'une meuliere ou d'une brique est
  // surtout de la luminance (pierres claires et sombres de meme teinte) : il releve le seuil d'ecart au
  // point de manquer le haut d'un vitrage qui reflete le ciel, bleute sur de la pierre ocre. La teinte,
  // elle, ne bouge presque pas d'une pierre a l'autre.
  const chroma = ecartsChroma(R, fond);
  const medC = medianeGlissante(chroma, 1, mur, l, h, r, r, PART_FOND_MIN);
  const seuilChroma = new Float32Array(l * h);
  // La ou la fenetre n'a pas assez de mur (le milieu d'une grande baie), la teinte seule ne decide de
  // rien : l'ecart de couleur suffit a y voir la baie, et un fond mal lu y ferait de fausses taches.
  for (let i = 0; i < l * h; i++) seuilChroma[i] = medC.ok[i] ? Math.max(rg['facades.detection.seuilChromaMin'], rg['facades.detection.seuilFacteur'] * (medC.v[i] ?? 0)) : 255;
  return { fond, ecart, seuil, chroma, seuilChroma, mur };
}

/**
 * L'ecart de chromaticite de chaque pixel a son fond, en niveaux : la distance des (r, g) / (r + g + b)
 * multipliee par la somme du fond, pour se comparer aux ecarts de couleur.
 */
function ecartsChroma(R: Reduite, fond: Float32Array): Float32Array {
  const d = new Float32Array(R.l * R.h);
  for (let i = 0; i < R.l * R.h; i++) {
    if (!R.vu[i]) continue;
    const s = (R.rgb[i * 3] ?? 0) + (R.rgb[i * 3 + 1] ?? 0) + (R.rgb[i * 3 + 2] ?? 0);
    const fs = (fond[i * 3] ?? 0) + (fond[i * 3 + 1] ?? 0) + (fond[i * 3 + 2] ?? 0);
    // Trop sombre, la teinte n'est que du bruit du capteur : seul l'ecart de couleur compte.
    if (s < 60 || fs <= 0) continue;
    d[i] = Math.hypot((R.rgb[i * 3] ?? 0) / s - (fond[i * 3] ?? 0) / fs, (R.rgb[i * 3 + 1] ?? 0) / s - (fond[i * 3 + 1] ?? 0) / fs) * fs;
  }
  return d;
}

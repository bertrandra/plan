// Detection des ouvertures sur une elevation redressee (MD/spec-releve-facade.md §7,
// MD/spec-facades-calage-detection.md §9).
//
// Sur une facade, un mur est une grande surface a peu pres uniforme par zones ; une fenetre, une porte,
// un volet s'en detachent - plus sombres le plus souvent, d'une autre couleur parfois. La detection
// cherche ce qui s'ecarte nettement du **fond local** du mur (le soubassement, le bandeau, le pignon
// sont le fond de leur zone), retire ce qui n'est qu'une ombre (plus sombre, de meme teinte), en garde
// les taches qui ont la taille et la forme d'une baie, lit leurs aretes (profils de contours), separe
// une baie de ses volets battants, et aligne ce qui devrait l'etre : les linteaux d'un meme niveau
// sont a la meme hauteur sur une maison, pas a 3 cm pres.
//
// C'est une proposition : l'utilisateur la corrige au doigt avant de valider. Elle doit surtout ne
// pas inventer - une detection qui propose trois fausses fenetres coute plus de gestes qu'une
// detection qui en oublie une. Chaque ouverture porte sa confiance (spec §9, fusion des indices).
//
// Les seuils sont des reglages nommes (`reglagesDetection.ts`, `facades.detection.*`).

import { au } from '../util/tableaux.js';
import type { Image } from './homographie.js';
import type { DetailsOuverture, GrilleFacade, SourceOuverture, TypeOuverture } from '../model/types.js';
import { PX_PAR_M, morpho, reduire, taches, type Reduite, type Tache } from './detectionCartes.js';
import { fondDuMur, type FondDuMur } from './detectionFond.js';
import { affiner, baieEntreVolets, carteOmbre, gradients, soutienAretes, versElevation, type BoitePx, type FondPx, type Gradients } from './detectionIndices.js';
import { reglagesDetection, type ValeursDetection } from './regles/facades/detection.js';
import { reglagesStructure, type ValeursStructure } from './regles/facades/structure.js';
import { allege, bandeHaute, classer, classerAvecIndices, estVitree, formeDeTache, lamesHorizontales } from './classement.js';
import { completer, regulariser, structurer, type EvaluerZone } from './structure.js';

export type { TypeOuverture };
export { classer };

/** Une ouverture dans le repere de la facade : x depuis la gauche vue de dehors, y depuis le sol. */
export interface OuvertureDetectee {
  type: TypeOuverture;
  x: number;
  y: number;
  l: number;
  h: number;
  /**
   * De 0 a 1 : remplissage de la boite par la tache, rectangularite, soutien des aretes sur ses quatre
   * cotes et part de la boite vue sur la photo (spec §9). Pleine a 0,7 et plus (spec §12).
   */
  confiance: number;
  /** `detectee`, ou `devinee` par la structure (spec §10.5, en pointille). */
  source?: SourceOuverture;
  /** Rangee et travee dans la grille de la facade (spec §10). */
  niveau?: number;
  travee?: number;
  /** Volets, coffre, balcon, forme (spec §11). */
  details?: DetailsOuverture;
}

/** Ce que la detection rend d'une facade : les ouvertures retenues, les devinees laissees decochees, la grille. */
export interface DetectionFacade {
  /** Les ouvertures detectees, et les devinees assez sures pour etre proposees cochees. */
  ouvertures: OuvertureDetectee[];
  /** Les ouvertures devinees de faible confiance : proposees en pointille, decochees (spec §17 q2). */
  devinees: OuvertureDetectee[];
  /** La structure des ouvertures retenues (spec §10) ; `null` sans ouverture. */
  grille: GrilleFacade | null;
  symetrique: boolean;
}

export interface OptionsDetection {
  /** Surcharges des reglages nommes (banc, profil de facade). */
  reglages?: Partial<ValeursDetection & ValeursStructure>;
}

/** Regroupe des valeurs proches (a `tol` pres) et remplace chacune par la moyenne de son groupe. */
export function aligner(valeurs: number[], tol: number): number[] {
  const ordre = valeurs.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v);
  const res = [...valeurs];
  let debut = 0;
  for (let k = 1; k <= ordre.length; k++) {
    if (k === ordre.length || au(ordre, k).v - au(ordre, k - 1).v > tol) {
      const groupe = ordre.slice(debut, k);
      const moy = groupe.reduce((s, g) => s + g.v, 0) / groupe.length;
      groupe.forEach((g) => (res[g.i] = moy));
      debut = k;
    }
  }
  return res;
}

const cm = (v: number) => Math.round(v * 100) / 100;

/** Ce que l'on sait d'une tache gardee comme candidate. */
interface Candidat {
  tache: Tache;
  remplissage: number;
  rectangularite: number;
  aretes: number[];
  /** Le haut en arc, ou la baie ronde, lu sur la tache (spec §11). */
  forme: 'rect' | 'cintre' | 'rond';
}

/**
 * La carte binaire des candidats : ecart de couleur au fond local au-dessus du seuil de sa zone, hors
 * ombre, ou ecart de teinte seule au-dessus du sien. Puis une ouverture d'un pixel (les joints d'une
 * brique, les points du grain d'une pierre, qui sinon se soudent aux baies et les relient entre
 * elles), une fermeture (recoller les carreaux d'une fenetre separes par leurs petits bois), et une
 * ouverture (effacer les grains isoles).
 */
function carteCandidats(R: Reduite, F: FondDuMur, ombre: Uint8Array, ombresSeules = false): Uint8Array {
  const { l, h } = R;
  let b: Uint8Array = new Uint8Array(l * h);
  for (let i = 0; i < l * h; i++) {
    if (!R.vu[i]) continue;
    const ecarte = (F.ecart[i] ?? 0) > (F.seuil[i] ?? 0);
    const teinte = (F.chroma[i] ?? 0) > (F.seuilChroma[i] ?? 0);
    b[i] = (ombresSeules ? ecarte && !!ombre[i] && !teinte : (ecarte && !ombre[i]) || teinte) ? 1 : 0;
  }
  return nettoyer(b, l, h);
}

/** La morphologie de la carte des candidats (voir `carteCandidats`). */
function nettoyer(carte: Uint8Array, l: number, h: number): Uint8Array {
  let b = morpho(morpho(carte, l, h, false), l, h, true);
  b = morpho(morpho(b, l, h, true), l, h, true);
  b = morpho(morpho(b, l, h, false), l, h, false);
  b = morpho(b, l, h, false);
  return morpho(b, l, h, true);
}

/** Part des lignes et des colonnes de la boite que la tache couvre aux sept dixiemes au moins. */
function rectangularite(t: Tache, etiquettes: Int32Array, l: number): number {
  const w = t.x1 - t.x0 + 1,
    hh = t.y1 - t.y0 + 1;
  const parColonne = new Int32Array(w);
  let lignesPleines = 0;
  for (let y = t.y0; y <= t.y1; y++) {
    let n = 0;
    for (let x = t.x0; x <= t.x1; x++) {
      if (etiquettes[y * l + x] !== t.id) continue;
      n++;
      parColonne[x - t.x0] = (parColonne[x - t.x0] ?? 0) + 1;
    }
    if (n >= 0.7 * w) lignesPleines++;
  }
  let colonnesPleines = 0;
  for (let x = 0; x < w; x++) if ((parColonne[x] ?? 0) >= 0.7 * hh) colonnesPleines++;
  return (lignesPleines / hh + colonnesPleines / w) / 2;
}

/**
 * Rogne une tache a son coeur rectangulaire : les lignes et colonnes de bord que la tache ne couvre
 * qu a moins de 15 % de sa ligne (ou colonne) la plus pleine sont retirees. Le grain d'une brique, une
 * ombre de gouttiere accrochent a une baie des excroissances qui elargissent sa boite. Rend la tache
 * rognee, son nombre de pixels compte dans sa nouvelle boite.
 */
function rogner(t: Tache, etiquettes: Int32Array, l: number): Tache {
  const r = { ...t };
  const compte = (vertical: boolean, k: number): number => {
    let n = 0;
    if (vertical) for (let y = r.y0; y <= r.y1; y++) n += etiquettes[y * l + k] === t.id ? 1 : 0;
    else for (let x = r.x0; x <= r.x1; x++) n += etiquettes[k * l + x] === t.id ? 1 : 0;
    return n;
  };
  for (let passe = 0; passe < 2; passe++) {
    let max = 0;
    for (let y = r.y0; y <= r.y1; y++) max = Math.max(max, compte(false, y));
    while (r.y0 < r.y1 && compte(false, r.y0) < 0.15 * max) r.y0++;
    while (r.y1 > r.y0 && compte(false, r.y1) < 0.15 * max) r.y1--;
    max = 0;
    for (let x = r.x0; x <= r.x1; x++) max = Math.max(max, compte(true, x));
    while (r.x0 < r.x1 && compte(true, r.x0) < 0.15 * max) r.x0++;
    while (r.x1 > r.x0 && compte(true, r.x1) < 0.15 * max) r.x1--;
  }
  r.n = 0;
  for (let y = r.y0; y <= r.y1; y++) r.n += compte(false, y);
  return r;
}

/**
 * Les taches qui ont la taille et la forme d'une baie. Une tache est gardee si elle remplit sa boite
 * (indice A fort), ou si elle la remplit moins mais que ses quatre aretes sont nettes (indices A et B
 * faibles ensemble : une baie ton sur ton, ou percee dans de la brique, se lit par son pourtour).
 */
function candidats(R: Reduite, b: Uint8Array, G: Gradients, rg: ValeursDetection & ValeursStructure, ombres = false): Candidat[] {
  const { l, h } = R;
  const largeurM = l / PX_PAR_M;
  const { taches: ts, etiquettes } = taches(b, l, h);
  const res: Candidat[] = [];
  for (const brute of ts) {
    if (brute.n < 4) continue;
    const t = rogner(brute, etiquettes, l);
    const lp = t.x1 - t.x0 + 1,
      hp = t.y1 - t.y0 + 1;
    const lm = lp / PX_PAR_M,
      hm = hp / PX_PAR_M;
    if (lm < rg['facades.detection.largeurMinM'] || hm < rg['facades.detection.hauteurMinM']) continue;
    if (lm > rg['facades.detection.largeurMaxM'] || hm > rg['facades.detection.hauteurMaxM']) continue;
    // Une bande qui traverse presque toute la facade est un soubassement, une ombre de toiture ou
    // le bas du cadrage, pas une baie.
    if (lm > rg['facades.detection.bandeMaxPart'] * largeurM) continue;
    // Une tache qui colle au haut de l'elevation est le plus souvent l'ombre du debord de toit.
    if (t.y0 === 0 && hm < rg['facades.detection.debordHauteurMaxM']) continue;
    const remplissage = t.n / (lp * hp);
    if (remplissage < rg['facades.detection.remplissageAretesMin']) continue;
    const aretes = soutienAretes(G, l, h, t);
    const nettes = aretes.every((a) => a >= rg['facades.detection.areteNette']);
    if (remplissage < rg['facades.detection.remplissageMin'] && !nettes) continue;
    // Une petite tache est un indice faible a elle seule : un enjoliveur, une touffe de haie, un pot.
    // Un fenestron ou un soupirail a un dormant, donc quatre aretes nettes.
    if (lm * hm < rg['facades.detection.petiteSurfaceM2'] && !nettes) continue;
    // Une tache qui ne differe du fond que par la luminance est une ombre, sauf si ses deux tableaux
    // sont des aretes franches : une porte grise sur un enduit gris, une menuiserie sombre de la
    // teinte du mur (spec §9 C).
    const net = rg['facades.detection.areteNette'];
    if (ombres && (au(aretes, 0) < net || au(aretes, 1) < net)) continue;
    const forme = formeDeTache(lp, hp, (x, y) => etiquettes[(t.y0 + y) * l + t.x0 + x] === t.id, rg);
    res.push({ tache: t, remplissage, rectangularite: rectangularite(t, etiquettes, l), aretes, forme });
  }
  return res;
}

/** Part des pixels de la boite vus sur la photo : la qualite de l'elevation sous la baie. */
function partVue(vu: Uint8Array | null, L: number, b: BoitePx): number {
  if (!vu) return 1;
  let n = 0,
    tot = 0;
  for (let y = b.Y0; y < b.Y1; y++)
    for (let x = b.X0; x < b.X1; x++) {
      tot++;
      n += vu[y * L + x] ?? 0;
    }
  return tot ? n / tot : 0;
}

/** Ce que la mesure garde d'une candidate pour le classement, au-dela de sa boite. */
interface Mesuree extends OuvertureDetectee {
  vitree: boolean;
}

/**
 * Les details d'une baie lus sur l'elevation (spec §11) : le haut (bande de mur ou coffre retires), les
 * lames, l'allege. Rend la boite corrigee et les details.
 */
function lireDetails(img: Image, Fp: FondPx, boite: BoitePx, pxParM: number, rg: ValeursStructure, c: Candidat, battants: boolean): { boite: BoitePx; details: DetailsOuverture; vitree: boolean } {
  const details: DetailsOuverture = {};
  const vitree = estVitree(img, boite, rg);
  if (battants) details.volets = 'battants';
  const haut = c.forme === 'rect' ? bandeHaute(img, Fp, boite, pxParM, rg, vitree && !battants) : null;
  if (haut) {
    boite = { ...boite, Y0: haut.Y0 };
    if (haut.coffre) details.volets = 'roulant';
  }
  const lames = lamesHorizontales(img, boite, pxParM, rg);
  if (lames !== null) {
    details.volets = details.volets === 'roulant' || lames <= 0.06 ? 'roulant' : 'persiennes';
    details.ferme = true;
  }
  const a = allege(img, Fp, boite, pxParM, rg);
  if (a) {
    details.allege = a.allege;
    if (a.Y1 !== undefined) boite = { ...boite, Y1: a.Y1 };
  }
  if (c.forme !== 'rect') details.forme = c.forme;
  return { boite, details, vitree };
}

/**
 * Une candidate devient une ouverture : separee de ses volets battants s'il y en a, ses bords affines
 * au centimetre, ses details lus, sa confiance calculee.
 */
function mesurer(img: Image, pxParM: number, vu: Uint8Array | null, R: Reduite, F: FondDuMur, c: Candidat, rg: ValeursDetection & ValeursStructure, franc: number): Mesuree {
  const f = pxParM / PX_PAR_M;
  let boite = versElevation(c.tache, pxParM, img.hauteur, R.h);
  const entre = baieEntreVolets(img, vu, boite, pxParM, rg);
  if (entre) boite = { ...boite, ...entre };
  const Fp: FondPx = { fond: F.fond, seuil: F.seuil, l: R.l, h: R.h, f, franc };
  const affinee = affiner(img, Fp, boite, entre ? { gauche: true, droite: true } : {});
  const { boite: fin, details, vitree } = lireDetails(img, Fp, affinee, pxParM, rg, c, !!entre);
  const aretes = c.aretes.reduce((s, a) => s + Math.min(1, a), 0) / 4;
  const confiance = 0.3 * Math.min(1, c.remplissage) + 0.2 * c.rectangularite + 0.3 * aretes + 0.2 * partVue(vu, img.largeur, fin);
  const H = img.hauteur;
  return {
    type: 'fenetre',
    x: fin.X0 / pxParM,
    l: (fin.X1 - fin.X0) / pxParM,
    y: (H - fin.Y1) / pxParM,
    h: (fin.Y1 - fin.Y0) / pxParM,
    confiance: Math.round(Math.max(0, Math.min(1, confiance)) * 100) / 100,
    source: 'detectee',
    ...(Object.keys(details).length ? { details } : {}),
    vitree,
  };
}

/** Linteaux et appuis a quelques centimetres pres ramenes a la meme cote, puis le type de chaque baie. */
function finaliser(brutes: Mesuree[], rg: ValeursDetection): OuvertureDetectee[] {
  const tol = rg['facades.detection.alignementM'];
  const hauts = aligner(
    brutes.map((o) => o.y + o.h),
    tol,
  );
  const bas = aligner(
    brutes.map((o) => o.y),
    tol,
  );
  return brutes
    .map(({ vitree, ...o }, i) => {
      const y = Math.max(0, au(bas, i) < 0.1 ? 0 : au(bas, i));
      const hTot = au(hauts, i) - y;
      const res: OuvertureDetectee = { ...o, x: cm(o.x), y: cm(y), l: cm(o.l), h: cm(hTot) };
      res.type = classerAvecIndices(res.y, res.l, res.h, { vitree, ...(o.details ? { details: o.details } : {}) });
      return res;
    })
    // L affinage peut rogner une boite sous les tailles minimales : elle ne passe plus pour une baie.
    .filter((o) => o.h > 0.3 && o.l >= rg["facades.detection.largeurMinM"] - 0.005)
    .sort((a, b) => a.x - b.x || a.y - b.y);
}

/**
 * Ce que l'image dit d'une zone de la facade (en metres) : part cachee (hors du masque des pixels vus),
 * et part vue qui ressemble au fond du mur (ecart et teinte sous leur seuil).
 */
function evaluateurZone(R: Reduite, F: FondDuMur): EvaluerZone {
  return (b) => {
    const x0 = Math.max(0, Math.floor(b.x * PX_PAR_M)),
      x1 = Math.min(R.l, Math.ceil((b.x + b.l) * PX_PAR_M));
    const y0 = Math.max(0, Math.floor(R.h - (b.y + b.h) * PX_PAR_M)),
      y1 = Math.min(R.h, Math.ceil(R.h - b.y * PX_PAR_M));
    let tot = 0,
      caches = 0,
      mur = 0;
    for (let y = y0; y < y1; y++)
      for (let x = x0; x < x1; x++) {
        const i = y * R.l + x;
        tot++;
        if (!R.vu[i]) {
          caches++;
          continue;
        }
        if ((F.ecart[i] ?? 0) <= (F.seuil[i] ?? 0) && (F.chroma[i] ?? 0) <= (F.seuilChroma[i] ?? 0)) mur++;
      }
    const vus = tot - caches;
    return { cache: tot ? caches / tot : 1, mur: vus ? mur / vus : 0 };
  };
}

/** Les ouvertures detectees d'une elevation, avant la structure. */
function detecterBrutes(img: Image, pxParM: number, vu: Uint8Array | null, rg: ValeursDetection & ValeursStructure): { ouvertures: OuvertureDetectee[]; R: Reduite; F: FondDuMur } | null {
  const R = reduire(img, pxParM, vu);
  if (!R.vu.some((v) => v)) return null;
  const F = fondDuMur(R, rg);
  const ombre = carteOmbre(R, F.fond, rg);
  const G = gradients(R, F.mur, rg);
  const b = carteCandidats(R, F, ombre);
  const retenus = candidats(R, b, G, rg);
  const disjoint = (t: Tache) => retenus.every(({ tache: u }) => t.x1 < u.x0 || u.x1 < t.x0 || t.y1 < u.y0 || u.y1 < t.y0);
  retenus.push(...candidats(R, carteCandidats(R, F, ombre, true), G, rg, true).filter((c) => disjoint(c.tache)));
  const brutes = retenus.map((c) => mesurer(img, pxParM, vu, R, F, c, rg, G.franc));
  return { ouvertures: finaliser(brutes, rg), R, F };
}

/**
 * La facade d'une elevation redressee de `largeurM` x `hauteurM` metres a `pxParM` pixels par metre
 * (spec §9 a §11) : les ouvertures detectees, regularisees sur leur structure (niveaux, travees), les
 * devinees aux croisements caches ou peu surs, et la grille. `vu` (facultatif) masque ce que la photo
 * n'a pas couvert.
 */
export function detecterFacade(img: Image, pxParM: number, vu: Uint8Array | null = null, options: OptionsDetection = {}): DetectionFacade {
  const rg = { ...reglagesDetection(options.reglages), ...reglagesStructure(options.reglages) };
  const brutes = detecterBrutes(img, pxParM, vu, rg);
  if (!brutes || !brutes.ouvertures.length) return { ouvertures: [], devinees: [], grille: null, symetrique: false };
  const largeur = img.largeur / pxParM,
    hauteur = img.hauteur / pxParM;
  const s0 = structurer(brutes.ouvertures, largeur, rg);
  const regulieres = regulariser(brutes.ouvertures, s0, rg);
  const devinees = completer(regulieres, s0, largeur, hauteur, evaluateurZone(brutes.R, brutes.F), rg).map((d) => ({
    cochee: d.cochee,
    o: { type: classer(d.y, d.l, d.h), x: d.x, y: d.y, l: d.l, h: d.h, confiance: d.confiance, source: 'devinee' as const },
  }));
  const retenues = [...regulieres, ...devinees.filter((d) => d.cochee).map((d) => d.o)].sort((a, b) => a.x - b.x || a.y - b.y);
  const s = structurer(retenues, largeur, rg);
  const ouvertures = retenues.map((o, i) => ({ ...o, niveau: au(s.niveauDe, i), travee: au(s.traveeDe, i) }));
  return { ouvertures, devinees: devinees.filter((d) => !d.cochee).map((d) => d.o), grille: s.grille, symetrique: s.symetrique };
}

/**
 * Les ouvertures d'une elevation redressee de `largeurM` x `hauteurM` metres a `pxParM` pixels par
 * metre. `vu` (facultatif) masque ce que la photo n'a pas couvert.
 */
export function detecterOuvertures(img: Image, pxParM: number, vu: Uint8Array | null = null, options: OptionsDetection = {}): OuvertureDetectee[] {
  return detecterFacade(img, pxParM, vu, options).ouvertures;
}

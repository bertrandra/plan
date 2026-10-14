// Les details des ouvertures en 3D (MD/spec-facades-calage-detection.md §11, lot G17).
//
// Le releve reconnait, en plus du type, ce qui habille une baie (`OuvertureFacade.details`) : des volets
// battants ouverts contre le mur (ou fermes devant la vitre), un volet roulant (son coffre au-dessus de
// la baie, son tablier baisse s'il est ferme), des persiennes, un balcon (une dalle et son garde-corps)
// ou un garde-corps devant la baie, un haut cintre ou une baie ronde. Ce module les dessine sur le mur
// de la facade, dans le repere de la facade : `x` le long du mur depuis la gauche vue de dehors, `y` en
// hauteur depuis le sol, `s` en saillie vers la rue.
//
// Une ouverture sans details n'apporte rien ici : la scene d'un plan sans releve detaille garde
// exactement ses mailles (empreinte `glb-structure.json`, point de fumee 24). Tous les details d'un mur
// tiennent dans une maille, par groupes de materiau.
//
// Les cotes des details (largeur d'un vantail, hauteur du coffre, portee du balcon) ne sont pas
// mesurees : ce sont les proportions courantes, que le releve ne lit pas encore.

import type * as THREE_NS from 'three';
import type { DetailsOuverture, OuvertureFacade, PtBrut } from '../model/types.js';
import type { Facade } from '../facade/geometrie.js';
import { au } from '../util/tableaux.js';
import { Batisseur, type S3 } from './batisseur.js';
import { poserEnCouche, COUCHES_SOL, type VersLocal } from './primitives.js';

/** Les cotes des details, en metres. */
export const DETAILS_OUVERTURE = {
  /** Saillie d'un volet ouvert contre le mur, et d'un volet ferme devant la vitre. */
  saillieVolet: 0.03,
  saillieVoletFerme: 0.05,
  /** Ecart entre les deux vantaux fermes. */
  jeuVantaux: 0.01,
  /** Pas des lames de persiennes et du tablier d'un volet roulant. */
  pasLames: 0.06,
  pasTablier: 0.05,
  /** Le coffre du volet roulant, au-dessus du linteau : hauteur et saillie. */
  coffre: { hauteur: 0.2, saillie: 0.08 },
  /** La dalle du balcon : debord de chaque cote des tableaux, portee, epaisseur. */
  balcon: { debord: 0.3, portee: 0.9, epaisseur: 0.15 },
  /** Le garde-corps : hauteur au-dessus de la dalle (ou de l'appui), pas des barreaux, section des lisses. */
  gardeCorps: { hauteur: 1.0, pas: 0.12, lisse: 0.05, barreau: 0.02, saillie: 0.08 },
  /** Nombre de segments d'un arc ou d'un cercle. */
  segments: 16,
} as const;

/** Une baie au sol (porte, garage, porte-fenetre de plain-pied) n'a ni balcon ni garde-corps. */
const AU_SOL_M = 0.25;

const COULEUR_VOLET = 0x7f8f84;
const COULEUR_COFFRE = 0xe6e2d8;
const COULEUR_DALLE = 0xcfcac0;
const COULEUR_GARDE_CORPS = 0x3b3d40;

/** Une ouverture habillee : une forme qui n'est pas un rectangle, ou des volets, un balcon, un garde-corps. */
export function aDesDetails(d: DetailsOuverture | undefined): boolean {
  if (!d) return false;
  return (!!d.volets && d.volets !== 'aucun') || d.allege === 'balcon' || d.allege === 'garde-corps' || d.forme === 'cintre' || d.forme === 'rond';
}

/** Une baie dont le contour n'est pas un rectangle : cintree ou ronde. */
export function aUneForme(d: DetailsOuverture | undefined): boolean {
  return d?.forme === 'cintre' || d?.forme === 'rond';
}

/** Les cotes d'une baie dans le repere du mur, sa forme, et ses details. */
type Baie = Pick<OuvertureFacade, 'x' | 'y' | 'l' | 'h' | 'details'>;

/**
 * La fleche du haut cintre : un plein cintre (demi-cercle) quand la baie est assez haute, sinon un arc
 * surbaisse qui garde au moins 60 % de la hauteur en tableaux droits.
 */
export function flecheCintre(l: number, h: number): number {
  return Math.max(0, Math.min(l / 2, 0.4 * h));
}

/**
 * Le contour d'une baie dans le repere du mur, elargi de `marge` (son cadre), de bas en haut et dans
 * le sens trigonometrique vu de dehors. Rectangle : quatre sommets ; cintre : les deux du bas et l'arc ;
 * rond : une ellipse inscrite. Le meme nombre de sommets quelle que soit la marge : un cadre se tend
 * entre deux contours sommet pour sommet. `basSansMarge` : le bas reste sur l'appui (une porte).
 */
export function contourBaie(o: Baie, marge = 0, basSansMarge = false): PtBrut[] {
  const n = DETAILS_OUVERTURE.segments;
  const { x, y, l, h } = o;
  const m = marge;
  const bas = basSansMarge ? y : y - m;
  const forme = o.details?.forme;
  if (forme === 'rond') {
    const cx = x + l / 2,
      cy = y + h / 2;
    return Array.from({ length: 2 * n }, (_, k) => {
      const t = -Math.PI / 2 + (k * Math.PI) / n;
      return { x: cx + (l / 2 + m) * Math.cos(t), y: cy + (h / 2 + m) * Math.sin(t) };
    });
  }
  if (forme === 'cintre') {
    const f = flecheCintre(l, h);
    if (f > 1e-6) {
      const cx = x + l / 2,
        naissance = y + h - f;
      // L'arc de cercle de corde l et de fleche f, puis mis a l'echelle de la marge autour de sa
      // naissance : il passe par les tableaux elargis et par la cle relevee de la marge.
      const R = (f * f + (l / 2) * (l / 2)) / (2 * f);
      const a = Math.asin(Math.min(1, l / 2 / R));
      const arc = Array.from({ length: n + 1 }, (_, k) => {
        const t = Math.PI / 2 - a + (2 * a * k) / n;
        const px = cx + R * Math.cos(t),
          py = y + h - R + R * Math.sin(t);
        return { x: cx + ((px - cx) * (l / 2 + m)) / (l / 2), y: naissance + ((py - naissance) * (f + m)) / f };
      });
      return [{ x: x - m, y: bas }, { x: x + l + m, y: bas }, ...arc];
    }
  }
  return [
    { x: x - m, y: bas },
    { x: x + l + m, y: bas },
    { x: x + l + m, y: y + h + m },
    { x: x - m, y: y + h + m },
  ];
}

/** Le repere d'un mur en coordonnees Three : `pt(x, y, s)`, `x` le long du mur, `y` en hauteur, `s` en saillie. */
export function repereFacade(toLocal: VersLocal, f: Facade): (x: number, y: number, s: number) => S3 {
  const g = toLocal(f.gauche),
    d = toLocal(f.droite);
  const ux = (d.x - g.x) / f.largeur,
    uz = (d.z - g.z) / f.largeur;
  // La normale du plan (nx, ny) devient (nx, -ny) en Three : Y du plan porte sur -Z.
  const nx = f.normale.x,
    nz = -f.normale.y;
  return (x, y, s) => [g.x + ux * x + nx * s, y, g.z + uz * x + nz * s];
}

type Point3 = (x: number, y: number, s: number) => S3;

/** Un pave du mur : la face de devant, le dessus, le dessous et les deux cotes (le dos est contre le mur ou cache). */
function pave(b: Batisseur, pt: Point3, x0: number, x1: number, y0: number, y1: number, s0: number, s1: number): void {
  b.quad(pt(x0, y0, s1), pt(x1, y0, s1), pt(x1, y1, s1), pt(x0, y1, s1));
  b.quad(pt(x0, y1, s1), pt(x1, y1, s1), pt(x1, y1, s0), pt(x0, y1, s0));
  b.quad(pt(x0, y0, s0), pt(x1, y0, s0), pt(x1, y0, s1), pt(x0, y0, s1));
  b.quad(pt(x0, y0, s0), pt(x0, y0, s1), pt(x0, y1, s1), pt(x0, y1, s0));
  b.quad(pt(x1, y0, s1), pt(x1, y0, s0), pt(x1, y1, s0), pt(x1, y1, s1));
}

/** Un panneau plat parallele au mur, a la saillie `s`. */
function panneau(b: Batisseur, pt: Point3, x0: number, x1: number, y0: number, y1: number, s: number): void {
  b.quad(pt(x0, y0, s), pt(x1, y0, s), pt(x1, y1, s), pt(x0, y1, s));
}

/** Des lames inclinees, du bas `y0` au haut `y1` : chacune descend vers la rue, comme une persienne. */
function lames(b: Batisseur, pt: Point3, x0: number, x1: number, y0: number, y1: number, s0: number, s1: number, pas: number): void {
  const n = Math.max(1, Math.round((y1 - y0) / pas));
  const p = (y1 - y0) / n;
  for (let k = 0; k < n; k++) {
    const a = y0 + k * p;
    b.quad(pt(x0, a, s1), pt(x1, a, s1), pt(x1, a + p, s0), pt(x0, a + p, s0));
  }
}

/** Ce que les details d'un mur ajoutent, groupe par materiau. */
interface Pieces {
  volets: (() => void)[];
  coffres: (() => void)[];
  dalles: (() => void)[];
  gardeCorps: (() => void)[];
}

/**
 * Les volets d'une baie. Battants et persiennes ouverts : deux vantaux d'une demi-baie chacun, rabattus
 * contre le mur de part et d'autre du cadre ; fermes : devant la vitre. Volet roulant : le coffre au-dessus
 * du linteau (le releve l'a retire de la hauteur de la baie), et le tablier baisse s'il est ferme.
 */
function volets(b: Batisseur, pt: Point3, o: Baie, cadre: number, hMur: number, f: Facade, p: Pieces): void {
  const v = o.details?.volets;
  if (!v || v === 'aucun') return;
  const D = DETAILS_OUVERTURE;
  const { x, y, l, h } = o;
  const ferme = !!o.details?.ferme;
  if (v === 'roulant') {
    const haut = Math.min(hMur, y + h + cadre + D.coffre.hauteur);
    if (haut - (y + h + cadre) >= 0.08) p.coffres.push(() => pave(b, pt, x - cadre, x + l + cadre, y + h + cadre, haut, 0, D.coffre.saillie));
    if (ferme) p.coffres.push(() => lames(b, pt, x, x + l, y, y + h, D.saillieVolet, D.saillieVolet + 0.01, D.pasTablier));
    return;
  }
  const vantail = (x0: number, x1: number, s: number) =>
    p.volets.push(() => (v === 'persiennes' ? lames(b, pt, x0, x1, y, y + h, s - 0.015, s + 0.015, D.pasLames) : panneau(b, pt, x0, x1, y, y + h, s)));
  if (ferme) {
    const j = D.jeuVantaux / 2;
    vantail(x, x + l / 2 - j, D.saillieVoletFerme);
    vantail(x + l / 2 + j, x + l, D.saillieVoletFerme);
    return;
  }
  // Ouverts : un vantail qui sortirait du mur (baie pres d'un angle) est omis, pas rogne.
  const w = l / 2;
  if (x - cadre - w >= 0) vantail(x - cadre - w, x - cadre, D.saillieVolet);
  if (x + l + cadre + w <= f.largeur + 0.01) vantail(x + l + cadre, x + l + cadre + w, D.saillieVolet);
}

/** Un garde-corps droit, de `x0` a `x1`, de `y0` a `y0 + hauteur`, a la saillie `s` : deux lisses et des barreaux. */
function gardeCorpsDroit(b: Batisseur, pt: Point3, x0: number, x1: number, y0: number, hauteur: number, s: number): void {
  const G = DETAILS_OUVERTURE.gardeCorps;
  pave(b, pt, x0, x1, y0 + hauteur - G.lisse, y0 + hauteur, s - G.lisse / 2, s + G.lisse / 2);
  pave(b, pt, x0, x1, y0 + 0.05, y0 + 0.05 + G.lisse / 2, s - G.lisse / 4, s + G.lisse / 4);
  const n = Math.max(1, Math.round((x1 - x0) / G.pas));
  for (let k = 0; k <= n; k++) {
    const c = x0 + ((x1 - x0) * k) / n;
    panneau(b, pt, c - G.barreau / 2, c + G.barreau / 2, y0, y0 + hauteur - G.lisse, s);
  }
}

/** Un garde-corps perpendiculaire au mur, au droit de `x`, de la saillie `s0` a `s1` : le cote d'un balcon. */
function gardeCorpsCote(b: Batisseur, pt: Point3, x: number, s0: number, s1: number, y0: number, hauteur: number): void {
  const G = DETAILS_OUVERTURE.gardeCorps;
  const e = G.lisse / 2;
  // La lisse haute, vue de dessus et de cote.
  b.quad(pt(x - e, y0 + hauteur, s0), pt(x - e, y0 + hauteur, s1), pt(x + e, y0 + hauteur, s1), pt(x + e, y0 + hauteur, s0));
  b.quad(pt(x, y0 + hauteur - G.lisse, s0), pt(x, y0 + hauteur - G.lisse, s1), pt(x, y0 + hauteur, s1), pt(x, y0 + hauteur, s0));
  const n = Math.max(1, Math.round((s1 - s0) / G.pas));
  for (let k = 0; k < n; k++) {
    const s = s0 + ((s1 - s0) * (k + 0.5)) / n;
    b.quad(pt(x, y0, s - G.barreau / 2), pt(x, y0, s + G.barreau / 2), pt(x, y0 + hauteur - G.lisse, s + G.barreau / 2), pt(x, y0 + hauteur - G.lisse, s - G.barreau / 2));
  }
}

/**
 * Sous une baie d'etage : le balcon (une dalle qui deborde des tableaux, au niveau de l'appui, et son
 * garde-corps sur trois cotes), ou un garde-corps seul devant la baie (balconnet), a hauteur d'appui.
 */
function allege(b: Batisseur, pt: Point3, o: Baie, f: Facade, p: Pieces): void {
  const a = o.details?.allege;
  if ((a !== 'balcon' && a !== 'garde-corps') || o.y < AU_SOL_M) return;
  const D = DETAILS_OUVERTURE;
  const { x, y, l, h } = o;
  if (a === 'garde-corps') {
    const H = Math.min(D.gardeCorps.hauteur, 0.5 * h);
    p.gardeCorps.push(() => gardeCorpsDroit(b, pt, x, x + l, y, H, D.gardeCorps.saillie));
    return;
  }
  const x0 = Math.max(0, x - D.balcon.debord),
    x1 = Math.min(f.largeur, x + l + D.balcon.debord);
  const P = D.balcon.portee,
    e = D.gardeCorps.lisse;
  p.dalles.push(() => pave(b, pt, x0, x1, y - D.balcon.epaisseur, y, 0, P));
  p.gardeCorps.push(() => {
    gardeCorpsDroit(b, pt, x0, x1, y, D.gardeCorps.hauteur, P - e);
    gardeCorpsCote(b, pt, x0 + e, 0, P - e, y, D.gardeCorps.hauteur);
    gardeCorpsCote(b, pt, x1 - e, 0, P - e, y, D.gardeCorps.hauteur);
  });
}

/** Une ouverture posee sur son mur : la facade, l'ouverture (cotes et details), la hauteur du mur la ou elle est. */
export interface PoseOuverture {
  f: Facade;
  o: Baie;
  hMur: number;
  /** La marge du cadre autour de la baie : les volets ouverts et le coffre se posent au-dela. */
  cadre: number;
}

/** Ce que les details demandent a la scene : ou les ajouter, et comment passer du plan au repere Three. */
export interface ContexteDetailsOuvertures {
  scene: THREE_NS.Object3D;
  toLocal: VersLocal;
}

/**
 * Les volets, coffres, balcons et garde-corps d'une liste d'ouvertures, en une maille
 * (`batiment-details-ouvertures`), quatre materiaux. Rien n'est ajoute si aucune n'a de details.
 */
export function poserDetailsOuvertures(ctx: ContexteDetailsOuvertures, poses: readonly PoseOuverture[]): void {
  const habillees = poses.filter((q) => aDesDetails(q.o.details));
  if (!habillees.length) return;
  const b = new Batisseur();
  const p: Pieces = { volets: [], coffres: [], dalles: [], gardeCorps: [] };
  habillees.forEach((q) => {
    const pt = repereFacade(ctx.toLocal, q.f);
    volets(b, pt, q.o, q.cadre, q.hMur, q.f, p);
    allege(b, pt, q.o, q.f, p);
  });
  const groupes = [p.volets, p.coffres, p.dalles, p.gardeCorps];
  if (!groupes.some((g) => g.length)) return;
  groupes.forEach((g, k) => {
    g.forEach((f) => f());
    b.groupe(k);
  });
  const materiaux = [
    new THREE.MeshStandardMaterial({ color: COULEUR_VOLET, roughness: 0.8, side: THREE.DoubleSide }),
    new THREE.MeshStandardMaterial({ color: COULEUR_COFFRE, roughness: 0.6, side: THREE.DoubleSide }),
    new THREE.MeshStandardMaterial({ color: COULEUR_DALLE, roughness: 0.9, side: THREE.DoubleSide }),
    new THREE.MeshStandardMaterial({ color: COULEUR_GARDE_CORPS, roughness: 0.5, metalness: 0.4, side: THREE.DoubleSide }),
  ];
  // Plaques contre le mur (volets ouverts a 3 cm) : de loin, elles doivent gagner le test de profondeur.
  materiaux.forEach((m) => poserEnCouche(m, COUCHES_SOL.surMur));
  ctx.scene.add(b.maillage(materiaux, 'batiment-details-ouvertures'));
}

/**
 * Le cadre et la vitre d'une baie cintree ou ronde, dans un batisseur : le cadre, le polygone elargi de
 * `cadre` a la saillie `sCadre` ; la vitre, le contour de la baie a `sVitre`. `basSansMarge` : une porte,
 * dont le cadre s'arrete au sol.
 */
export function cadreEtVitreFormes(b: Batisseur, pt: Point3, o: Baie, cadre: number, sCadre: number, sVitre: number | null, basSansMarge = false): { cadre: () => void; vitre: (() => void) | null } {
  const ext = contourBaie(o, cadre, basSansMarge).map((q) => pt(q.x, q.y, sCadre));
  const int = sVitre === null ? null : contourBaie(o, 0).map((q) => pt(q.x, q.y, sVitre));
  return { cadre: () => b.polygone(ext), vitre: int ? () => b.polygone(int) : null };
}

/**
 * L'encadrement en relief d'une baie cintree ou ronde (releve photographie, three/releve3d.ts) : une bande
 * entre le contour elargi de `section` et le contour de la baie, a la saillie `saillie`, et la vitre quand
 * le mur n'a pas de photo. Une seule maille (`releve-ouverture-forme`).
 */
export function encadrementForme(ctx: ContexteDetailsOuvertures, f: Facade, o: Baie, section: number, saillie: number, couleurs: { cadre: number; vitre: number | null }, decollement: number): void {
  const pt = repereFacade(ctx.toLocal, f);
  const ext = contourBaie(o, section),
    int = contourBaie(o, 0);
  const b = new Batisseur();
  for (let i = 0; i < ext.length; i++) {
    const j = (i + 1) % ext.length;
    const a = au(ext, i),
      c = au(ext, j),
      d = au(int, j),
      e = au(int, i);
    b.quad(pt(a.x, a.y, saillie), pt(c.x, c.y, saillie), pt(d.x, d.y, saillie), pt(e.x, e.y, saillie));
  }
  b.groupe(0);
  const materiaux: THREE_NS.Material[] = [new THREE.MeshStandardMaterial({ color: couleurs.cadre, roughness: 0.6, side: THREE.DoubleSide })];
  if (couleurs.vitre !== null) {
    b.polygone(int.map((q) => pt(q.x, q.y, decollement)));
    b.groupe(1);
    const vitre = new THREE.MeshStandardMaterial({ color: couleurs.vitre, roughness: 0.15, metalness: 0.3 });
    poserEnCouche(vitre, COUCHES_SOL.surMur);
    materiaux.push(vitre);
  }
  ctx.scene.add(b.maillage(materiaux, 'releve-ouverture-forme'));
}

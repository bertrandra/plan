// Les details d'un batiment en 3D, sans donnee nouvelle (MD/spec-toit-ign.md §6.3).
//
// Un prisme coiffe de ses pans ressemble a un cube avec un chapeau. Ce qui fait « maison » tient a
// peu de choses, toutes deductibles de ce que le plan sait deja : le toit deborde des murs et porte
// une ombre sous l'egout, une gouttiere court le long des egouts, les aretes des murs se
// lisent en trait fin, le pied du mur est plus sombre, des fenetres regulieres se repetent a chaque
// niveau (le nombre d'etages de la BD TOPO, sinon la hauteur), une cheminee sort d'un toit en pente.
//
// Le batiment reste le prisme que pose `scene.ts`, et son releve (releve3d.ts) ses photos et son
// toit : ce module ajoute par-dessus. Un mur photographie garde sa photo : pas de fenetres dessinees
// dessus. De loin (au-dela de `DETAIL_FIN_M` du centre de la scene), seuls le debord et les aretes
// sont poses : un voisinage de deux mille batiments ne supporterait pas six mailles de plus chacun.

import { au } from '../util/tableaux.js';
import { sommetDe } from '../geometry/anneau.js';
import { signedArea, centroid, pointInPolygon } from '../geometry/basic.js';
import type * as THREE_NS from 'three';
import type { ObjetPolygone, PtBrut, Toit } from '../model/types.js';
import { volumesDuBatiment, type Volume } from '../facade/profil.js';
import { facadesDuContour, pointDeFacade, type Facade } from '../facade/geometrie.js';
import { facettesToit, plansDuToit, profondeurToit, hauteurSurPans, angleDuPlusLongCote, uvDuPan, repereFaitage, COULEUR_TOIT_DEFAUT, type P3, type PlanToit } from '../facade/toit.js';
import { materiauCouverture } from '../model/couleurToit.js';
import { textureCouverture } from './couverture.js';
import { poserEnCouche, COUCHES_SOL, type VersLocal } from './primitives.js';
import { HAUTEUR_ETAGE_M } from '../geo/bdtopo.js';

/** Ce que la scene prete a ce module. */
export interface ContexteDetails {
  /** La scene, ou un groupe pose sur le sol en relief. */
  scene: THREE_NS.Object3D;
  toLocal: VersLocal;
  couleurMur: string | number;
  /** `false` quand la case « Texture » de la vue 3D est decochee. */
  textures: boolean;
  /** La distance du batiment au centre de la scene, en metres : de loin, moins de details. */
  distance: number;
}

export interface OptionsDetails {
  /** Le nombre de niveaux (BD TOPO) ; absent, deduit de la hauteur. */
  etages?: number | null;
  /** Les cotes du contour qui portent un releve de facade : leurs fenetres sont deja la. */
  cotesReleves?: readonly number[];
}

/** Le debord du toit au-dela des murs, en metres. */
export const DEBORD_TOIT_M = 0.4;
/** L'epaisseur visible du toit a la rive. */
export const EPAISSEUR_TOIT_M = 0.15;
/** La hauteur du soubassement, plus sombre que le mur. */
export const HAUTEUR_SOUBASSEMENT_M = 0.45;
/** Au-dela de cette distance au centre de la scene, seuls le debord et les aretes sont poses. */
export const DETAIL_FIN_M = 120;
/** Les ouvertures dessinees : une fenetre par entraxe, une porte au milieu du plus long mur. */
export const FENETRE = { l: 1.0, h: 1.2, appui: 0.9 } as const;
export const PORTE = { l: 0.9, h: 2.1 } as const;
export const ENTRAXE_FENETRES_M = 2.4;
const FENETRES_MAX_PAR_MUR = 8;
/** En dessous, un niveau n'a pas de fenetre : un abri, un garage bas. */
const HAUTEUR_NIVEAU_MIN_M = 2.2;
/** La cheminee : un carre, ce qu'elle depasse du toit, ce qu'elle y entre. */
export const CHEMINEE = { cote: 0.5, dessus: 0.8, dessous: 0.3 } as const;
/** Pas de cheminee sur un petit toit : un abri, un garage. */
export const AIRE_CHEMINEE_MIN_M2 = 40;
const GOUTTIERE = { hauteur: 0.1, profondeur: 0.12 } as const;
const SAILLIE_SOUBASSEMENT_M = 0.03;
const DECOLLEMENT = 0.01;
const CADRE_M = 0.08;

// Le cadre se distingue d'un mur blanc : un gris chaud, pas le blanc des menuiseries du releve.
const COULEUR_MENUISERIE = 0xc9c2b4;
// La vitre reflete le ciel : un bleu-gris, qu'un bleu nuit rendait noir sous le soleil de midi.
const COULEUR_VITRE = 0x6f8aa6;
const COULEUR_PORTE = 0x6b4a33;
const COULEUR_ZINC = 0x8e9499;
const COULEUR_SOUS_FACE = 0xd9d4c8;
const COULEUR_ARETE = 0x1f1f1f;
const COULEUR_CHEMINEE_TUILE = 0x8a5a44;
const COULEUR_CHEMINEE_ARDOISE = 0x6b6b6b;

const rad = (d: number) => (d * Math.PI) / 180;
type S3 = [number, number, number];

/** Des quads accumules en une seule maille, par groupes de materiau : une maille par detail, pas par face. */
class Batisseur {
  positions: number[] = [];
  uvs: number[] = [];
  indices: number[] = [];
  groupes: { debut: number; compte: number; materiau: number }[] = [];
  private debutGroupe = 0;

  /** Un quadrilatere `a b c d` (deux triangles), avec ses coordonnees de texture s'il en a. */
  quad(a: S3, b: S3, c: S3, d: S3, uv?: number[]): void {
    const k = this.positions.length / 3;
    this.positions.push(...a, ...b, ...c, ...d);
    this.uvs.push(...(uv ?? [0, 0, 0, 0, 0, 0, 0, 0]));
    this.indices.push(k, k + 1, k + 2, k, k + 2, k + 3);
  }

  /** Clot le groupe en cours : ce qui a ete ajoute depuis le dernier prend ce materiau. */
  groupe(materiau: number): void {
    const compte = this.indices.length - this.debutGroupe;
    if (compte > 0) this.groupes.push({ debut: this.debutGroupe, compte, materiau });
    this.debutGroupe = this.indices.length;
  }

  get vide(): boolean {
    return this.indices.length === 0;
  }

  maillage(materiaux: THREE_NS.Material[], nom: string): THREE_NS.Mesh {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(this.positions, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(this.uvs, 2));
    geo.setIndex(this.indices);
    this.groupes.forEach((g) => geo.addGroup(g.debut, g.compte, g.materiau));
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, materiaux);
    m.name = nom;
    return m;
  }
}

/**
 * Le contour decale de `d` vers l'exterieur, sommet pour sommet (meme nombre, meme ordre) : les
 * coins sont en onglet, borne pour qu'une pointe aigue ne file pas.
 */
export function contourDecale(pts: readonly PtBrut[], d: number): PtBrut[] {
  const n = pts.length;
  const ccw = signedArea(pts) > 0;
  const normale = (i: number): PtBrut => {
    const a = au(pts, i),
      b = sommetDe(pts, i + 1);
    const ex = b.x - a.x,
      ey = b.y - a.y,
      L = Math.hypot(ex, ey) || 1;
    return ccw ? { x: ey / L, y: -ex / L } : { x: -ey / L, y: ex / L };
  };
  return pts.map((p, i) => {
    const n1 = normale((i - 1 + n) % n),
      n2 = normale(i);
    const dot = n1.x * n2.x + n1.y * n2.y;
    if (1 + dot < 0.2) return { x: p.x + n2.x * d, y: p.y + n2.y * d };
    const k = d / (1 + dot);
    return { x: p.x + (n1.x + n2.x) * k, y: p.y + (n1.y + n2.y) * k };
  });
}

/**
 * La hauteur du toit au-dessus de l'egout, prolongee hors des murs pour le cote `i` : negative
 * sous l'egout d'un pan qui descend, celle du profil au droit d'un pignon.
 */
function hauteurProlongee(contour: readonly PtBrut[], toit: Toit): (i: number, q: PtBrut) => number {
  if (toit.forme === 'plat' || toit.hauteur <= 0) return () => 0;
  if (toit.forme === 'croupes') {
    const d = profondeurToit(contour);
    const tan = toit.pente !== undefined ? Math.tan(rad(toit.pente)) : d > 0 ? toit.hauteur / d : 0;
    return (i, q) => {
      const a = au(contour, i),
        b = sommetDe(contour, i + 1);
      const L = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      return (-tan * Math.abs((b.x - a.x) * (q.y - a.y) - (b.y - a.y) * (q.x - a.x))) / L;
    };
  }
  const plans = plansDuToit(contour, toit);
  return (_i, q) => Math.min(...plans.map((p) => p.a * q.x + p.b * q.y + p.c));
}

/** Les cassures du profil le long du cote `(a, b)` : la ou deux plans du toit s'egalent. */
function cassures(contour: readonly PtBrut[], toit: Toit, a: PtBrut, b: PtBrut): number[] {
  const ts = new Set<number>([0, 1]);
  if (toit.forme !== 'plat' && toit.forme !== 'croupes' && toit.hauteur > 0) {
    const plans: PlanToit[] = plansDuToit(contour, toit);
    const z = (p: PlanToit, q: PtBrut) => p.a * q.x + p.b * q.y + p.c;
    for (let j = 0; j < plans.length; j++) {
      for (let k = j + 1; k < plans.length; k++) {
        const g0 = z(au(plans, j), a) - z(au(plans, k), a),
          g1 = z(au(plans, j), b) - z(au(plans, k), b);
        if (Math.abs(g0 - g1) > 1e-12) {
          const t = g0 / (g0 - g1);
          if (t > 1e-6 && t < 1 - 1e-6) ts.add(t);
        }
      }
    }
  }
  return [...ts].sort((x, y) => x - y);
}

function materiauToit(ctx: ContexteDetails, toit: Toit): THREE_NS.MeshStandardMaterial {
  const materiau = materiauCouverture(toit);
  const tex = ctx.textures ? textureCouverture(materiau) : null;
  return new THREE.MeshStandardMaterial({ color: toit.couleur || COULEUR_TOIT_DEFAUT, roughness: materiau === 'ardoise' ? 0.7 : 0.85, side: THREE.DoubleSide, ...(tex ? { map: tex } : {}) });
}

/**
 * Le debord du toit : une bande de `DEBORD_TOIT_M` au-dela de chaque mur, dans le prolongement
 * des pans (elle descend le long d'un egout, suit le profil d'un pignon), avec son epaisseur — la
 * sous-face plus claire et la planche de rive. Et la gouttiere, le long des egouts seulement.
 */
function poserDebord(ctx: ContexteDetails, contour: readonly PtBrut[], toit: Toit, h: number, avecGouttiere: boolean): void {
  if (toit.forme === 'plat' || toit.hauteur <= 0 || contour.length < 3) return;
  const dehors = contourDecale(contour, DEBORD_TOIT_M);
  const z = hauteurProlongee(contour, toit);
  const toit3 = new Batisseur();
  const gouttieres = new Batisseur();
  const local = (p: PtBrut, y: number): S3 => {
    const l = ctx.toLocal(p);
    return [l.x, y, l.z];
  };
  const lerp = (a: PtBrut, b: PtBrut, t: number): PtBrut => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
  contour.forEach((a, i) => {
    const b = sommetDe(contour, i + 1);
    const a2 = au(dehors, i),
      b2 = sommetDe(dehors, i + 1);
    const ts = cassures(contour, toit, a, b);
    for (let k = 0; k + 1 < ts.length; k++) {
      const p0 = lerp(a, b, au(ts, k)),
        p1 = lerp(a, b, au(ts, k + 1)),
        q1 = lerp(a2, b2, au(ts, k + 1)),
        q0 = lerp(a2, b2, au(ts, k));
      const zp0 = z(i, p0),
        zp1 = z(i, p1),
        zq1 = z(i, q1),
        zq0 = z(i, q0);
      const dessus: P3[] = [{ ...p0, z: zp0 }, { ...p1, z: zp1 }, { ...q1, z: zq1 }, { ...q0, z: zq0 }];
      toit3.quad(local(p0, h + zp0), local(p1, h + zp1), local(q1, h + zq1), local(q0, h + zq0), uvDuPan(dessus));
    }
    toit3.groupe(0);
    for (let k = 0; k + 1 < ts.length; k++) {
      const p0 = lerp(a, b, au(ts, k)),
        p1 = lerp(a, b, au(ts, k + 1)),
        q1 = lerp(a2, b2, au(ts, k + 1)),
        q0 = lerp(a2, b2, au(ts, k));
      const e = EPAISSEUR_TOIT_M;
      // La sous-face, puis la planche de rive (verticale, au bord exterieur).
      toit3.quad(local(q0, h + z(i, q0) - e), local(q1, h + z(i, q1) - e), local(p1, h + z(i, p1) - e), local(p0, h + z(i, p0) - e));
      toit3.quad(local(q0, h + z(i, q0)), local(q1, h + z(i, q1)), local(q1, h + z(i, q1) - e), local(q0, h + z(i, q0) - e));
    }
    toit3.groupe(1);
    // Un egout : le profil est plat et nul le long du mur. Un pignon porte une rive, pas de gouttiere.
    const egout = ts.length === 2 && Math.abs(z(i, a)) < 1e-6 && Math.abs(z(i, b)) < 1e-6;
    if (avecGouttiere && egout) {
      const yh = h + (z(i, a2) + z(i, b2)) / 2 - EPAISSEUR_TOIT_M,
        yb = yh - GOUTTIERE.hauteur;
      // Vers l'exterieur, de la planche de rive : la normale sortante du mur.
      const nx = a2.x - a.x,
        ny = a2.y - a.y,
        nl = Math.hypot(nx, ny) || 1;
      const n = { x: (nx / nl) * GOUTTIERE.profondeur, y: (ny / nl) * GOUTTIERE.profondeur };
      const a3 = { x: a2.x + n.x, y: a2.y + n.y },
        b3 = { x: b2.x + n.x, y: b2.y + n.y };
      gouttieres.quad(local(a2, yh), local(b2, yh), local(b3, yh), local(a3, yh)); // dessus (ouvert, mais on ne le voit pas de pres)
      gouttieres.quad(local(a3, yh), local(b3, yh), local(b3, yb), local(a3, yb)); // devant
      gouttieres.quad(local(a3, yb), local(b3, yb), local(b2, yb), local(a2, yb)); // dessous
    }
  });
  if (!toit3.vide) {
    const sousFace = new THREE.MeshStandardMaterial({ color: COULEUR_SOUS_FACE, roughness: 0.9, side: THREE.DoubleSide });
    ctx.scene.add(toit3.maillage([materiauToit(ctx, toit), sousFace], 'batiment-debord'));
  }
  if (!gouttieres.vide) {
    gouttieres.groupe(0);
    ctx.scene.add(gouttieres.maillage([new THREE.MeshStandardMaterial({ color: COULEUR_ZINC, roughness: 0.4, metalness: 0.5, side: THREE.DoubleSide })], 'batiment-gouttiere'));
  }
}

/**
 * Les aretes des murs en trait fin : les angles et l'egout. Poussees d'un centimetre hors de la
 * surface pour ne pas scintiller contre elle. Pas de trait sur le toit : le faitage, les aretiers
 * et les noues se lisent deja par la lumiere sur les pans, et un trait sombre par-dessus la
 * couverture la faisait paraitre dessinee plutot que construite.
 */
function poserAretes(ctx: ContexteDetails, volumes: readonly Volume[], contourHaut: readonly PtBrut[]): void {
  const pos: number[] = [];
  const centre = centroid(volumes.length ? au(volumes, 0).pts : contourHaut);
  const pousse = (p: PtBrut): PtBrut => {
    const dx = p.x - centre.x,
      dy = p.y - centre.y,
      d = Math.hypot(dx, dy) || 1;
    return { x: p.x + (dx / d) * 0.01, y: p.y + (dy / d) * 0.01 };
  };
  const segment = (p: PtBrut, yp: number, q: PtBrut, yq: number) => {
    const a = ctx.toLocal(pousse(p)),
      b = ctx.toLocal(pousse(q));
    pos.push(a.x, yp + 0.01, a.z, b.x, yq + 0.01, b.z);
  };
  volumes.forEach((v) => {
    v.pts.forEach((p, i) => {
      segment(p, 0, p, v.hauteur);
      segment(p, v.hauteur, sommetDe(v.pts, i + 1), v.hauteur);
    });
  });
  if (!pos.length) return;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  const lignes = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: COULEUR_ARETE, transparent: true, opacity: 0.7 }));
  lignes.name = 'batiment-aretes';
  ctx.scene.add(lignes);
}

/** Le pied du mur, plus sombre, en legere saillie : une bande tout autour du contour. */
function poserSoubassement(ctx: ContexteDetails, contour: readonly PtBrut[], h: number): void {
  if (h < HAUTEUR_SOUBASSEMENT_M * 2 || contour.length < 3) return;
  const dehors = contourDecale(contour, SAILLIE_SOUBASSEMENT_M);
  const b = new Batisseur();
  const local = (p: PtBrut, y: number): S3 => {
    const l = ctx.toLocal(p);
    return [l.x, y, l.z];
  };
  contour.forEach((p, i) => {
    const q = sommetDe(contour, i + 1),
      p2 = au(dehors, i),
      q2 = sommetDe(dehors, i + 1);
    const hs = HAUTEUR_SOUBASSEMENT_M;
    b.quad(local(p2, 0), local(q2, 0), local(q2, hs), local(p2, hs));
    b.quad(local(p2, hs), local(q2, hs), local(q, hs), local(p, hs));
  });
  b.groupe(0);
  const couleur = new THREE.Color(ctx.couleurMur).multiplyScalar(0.72);
  ctx.scene.add(b.maillage([new THREE.MeshStandardMaterial({ color: couleur, roughness: 0.95, side: THREE.DoubleSide })], 'batiment-soubassement'));
}

/** La hauteur d'egout d'un mur : celle du volume ou il se trouve (un releve en L abaisse une partie). */
function hauteurDuMur(f: Facade, volumes: readonly Volume[]): number {
  const m = pointDeFacade(f, f.largeur / 2);
  const dedans = { x: m.x - f.normale.x * 0.05, y: m.y - f.normale.y * 0.05 };
  const v = volumes.find((x) => pointInPolygon(dedans, x.pts));
  return v ? v.hauteur : au(volumes, 0).hauteur;
}

/** Combien de niveaux, et leur hauteur : le nombre d'etages s'il est connu, sinon la hauteur du mur. */
export function niveaux(hMur: number, etages: number | null | undefined): { n: number; hauteur: number } {
  let n = etages && etages > 0 ? Math.round(etages) : Math.max(1, Math.round(hMur / HAUTEUR_ETAGE_M));
  if (hMur / n < HAUTEUR_NIVEAU_MIN_M) n = Math.floor(hMur / HAUTEUR_NIVEAU_MIN_M);
  return { n, hauteur: n > 0 ? hMur / n : 0 };
}

/** Les abscisses des fenetres d'un mur de largeur `L`, centrees, a l'entraxe ; aucune sur un mur etroit. */
export function abscissesFenetres(L: number): number[] {
  const n = Math.min(FENETRES_MAX_PAR_MUR, Math.floor((L - 0.8) / ENTRAXE_FENETRES_M));
  if (n < 1) return [];
  const debut = (L - ((n - 1) * ENTRAXE_FENETRES_M + FENETRE.l)) / 2;
  return Array.from({ length: n }, (_, k) => debut + k * ENTRAXE_FENETRES_M);
}

/**
 * Des fenetres regulieres a chaque niveau sur les murs sans releve, et une porte au rez-de-chaussee
 * du plus long d'entre eux. Un cadre clair, une vitre sombre, un vantail bois : trois groupes d'une
 * seule maille.
 */
function poserOuvertures(ctx: ContexteDetails, contour: readonly PtBrut[], volumes: readonly Volume[], h: number, options: OptionsDetails): void {
  const releves = new Set(options.cotesReleves ?? []);
  const facades = facadesDuContour(contour, h).filter((f) => !releves.has(f.cote) && f.largeur >= 2);
  if (!facades.length) return;
  const plusLong = facades.reduce((m, f) => (f.largeur > m.largeur ? f : m), au(facades, 0));
  const b = new Batisseur();
  const rect = (f: Facade, x: number, y: number, l: number, hh: number, saillie: number) => {
    const g = ctx.toLocal(f.gauche),
      d = ctx.toLocal(f.droite);
    const ux = (d.x - g.x) / f.largeur,
      uz = (d.z - g.z) / f.largeur;
    const nx = f.normale.x,
      nz = -f.normale.y;
    const pt = (xx: number, yy: number): S3 => [g.x + ux * xx + nx * saillie, yy, g.z + uz * xx + nz * saillie];
    b.quad(pt(x, y), pt(x + l, y), pt(x + l, y + hh), pt(x, y + hh));
  };
  const cadres: (() => void)[] = [],
    vitres: (() => void)[] = [],
    portes: (() => void)[] = [];
  facades.forEach((f) => {
    const hMur = hauteurDuMur(f, volumes);
    const { n, hauteur: hNiveau } = niveaux(hMur, options.etages);
    if (n < 1) return;
    const xs = abscissesFenetres(f.largeur);
    const hFen = Math.min(FENETRE.h, hNiveau - FENETRE.appui - 0.2);
    const porteIci = f === plusLong && hMur >= PORTE.h + 0.3 && xs.length > 0;
    const iPorte = Math.floor(xs.length / 2);
    for (let k = 0; k < n; k++) {
      xs.forEach((x, j) => {
        if (k === 0 && porteIci && j === iPorte) {
          const xp = x + FENETRE.l / 2 - PORTE.l / 2;
          cadres.push(() => rect(f, xp - CADRE_M, 0, PORTE.l + 2 * CADRE_M, PORTE.h + CADRE_M, DECOLLEMENT));
          portes.push(() => rect(f, xp, 0, PORTE.l, PORTE.h, DECOLLEMENT * 2));
          return;
        }
        const y = k * hNiveau + FENETRE.appui;
        if (y + hFen > hMur - 0.15) return;
        cadres.push(() => rect(f, x - CADRE_M, y - CADRE_M, FENETRE.l + 2 * CADRE_M, hFen + 2 * CADRE_M, DECOLLEMENT));
        vitres.push(() => rect(f, x, y, FENETRE.l, hFen, DECOLLEMENT * 2));
      });
    }
  });
  if (!cadres.length) return;
  cadres.forEach((f) => f());
  b.groupe(0);
  vitres.forEach((f) => f());
  b.groupe(1);
  portes.forEach((f) => f());
  b.groupe(2);
  const materiaux = [
    new THREE.MeshStandardMaterial({ color: COULEUR_MENUISERIE, roughness: 0.6 }),
    new THREE.MeshStandardMaterial({ color: COULEUR_VITRE, roughness: 0.25, metalness: 0.2 }),
    new THREE.MeshStandardMaterial({ color: COULEUR_PORTE, roughness: 0.8 }),
  ];
  // Un centimetre devant le mur ne suffit pas vu de loin : les ouvertures gagnent le test de profondeur.
  materiaux.forEach((m) => poserEnCouche(m, COUCHES_SOL.surMur));
  ctx.scene.add(b.maillage(materiaux, 'batiment-ouvertures'));
}

/** Une cheminee sur un toit en pente assez grand : un carre de brique (ou de pierre grise sous l'ardoise), a cote du faitage. */
function poserCheminee(ctx: ContexteDetails, contour: readonly PtBrut[], toit: Toit, h: number): void {
  if (toit.forme === 'plat' || toit.hauteur <= 0 || Math.abs(signedArea(contour)) < AIRE_CHEMINEE_MIN_M2) return;
  const angle = toit.forme === 'croupes' ? angleDuPlusLongCote(contour) : toit.angleFaitage;
  const r = repereFaitage(contour, angle);
  // A un tiers du faitage, depuis le centre : pas au milieu, ou elle serait au sommet d'un pavillon.
  const u = r.u0 + 0.3 * r.hl,
    v = r.v0;
  let q: PtBrut = { x: u * r.ux + v * r.vx, y: u * r.uy + v * r.vy };
  if (!pointInPolygon(q, contour)) q = centroid(contour);
  if (!pointInPolygon(q, contour)) return;
  const z = hauteurSurPans(facettesToit(contour, toit).pans, q) ?? 0;
  const couleur = materiauCouverture(toit) === 'ardoise' ? COULEUR_CHEMINEE_ARDOISE : COULEUR_CHEMINEE_TUILE;
  const m = new THREE.Mesh(new THREE.BoxGeometry(CHEMINEE.cote, CHEMINEE.dessus + CHEMINEE.dessous, CHEMINEE.cote), new THREE.MeshStandardMaterial({ color: couleur, roughness: 0.9 }));
  const l = ctx.toLocal(q);
  m.position.set(l.x, h + z + (CHEMINEE.dessus - CHEMINEE.dessous) / 2, l.z);
  m.rotation.y = rad(angle);
  m.name = 'batiment-cheminee';
  ctx.scene.add(m);
}

/** Habille un batiment de ses details. Le prisme et le releve sont deja poses. */
export function ajouterDetailsBatiment(ctx: ContexteDetails, o: ObjetPolygone, h: number, options: OptionsDetails = {}): void {
  if (!Array.isArray(o.pts) || o.pts.length < 3 || h <= 0) return;
  const volumes = volumesDuBatiment(o.pts, h, o.facades);
  const contourHaut = au(volumes, 0).pts;
  const toit = o.toit;
  const pres = ctx.distance <= DETAIL_FIN_M;
  if (toit) poserDebord(ctx, contourHaut, toit, h, pres);
  poserAretes(ctx, volumes, contourHaut);
  if (!pres) return;
  poserSoubassement(ctx, o.pts, h);
  poserOuvertures(ctx, o.pts, volumes, h, options);
  if (toit) poserCheminee(ctx, contourHaut, toit, h);
}

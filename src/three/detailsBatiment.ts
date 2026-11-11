// Les details d'un batiment en 3D, sans donnee nouvelle (MD/spec-toit-ign.md §6.3).
//
// Un prisme coiffe de ses pans ressemble a un cube avec un chapeau. Ce qui fait « maison » tient a
// peu de choses, toutes deductibles de ce que le plan sait deja : le toit deborde des murs et porte
// une ombre sous l'egout, une gouttiere court le long des egouts, les aretes des murs se
// lisent en trait fin, le pied du mur est plus sombre, des fenetres regulieres se repetent a chaque
// niveau (le nombre d'etages de la BD TOPO, sinon la hauteur). Pas de cheminee : une souche ne se
// devine pas, elle vient des donnees (three/cheminees3d.ts).
//
// Le batiment reste le prisme que pose `scene.ts`, et son releve (releve3d.ts) ses photos et son
// toit : ce module ajoute par-dessus. Un mur photographie garde sa photo : pas de fenetres dessinees
// dessus. De loin (au-dela de `DETAIL_FIN_M` du centre de la scene), seuls le debord et les aretes
// sont poses : un voisinage de deux mille batiments ne supporterait pas six mailles de plus chacun.

import { au } from '../util/tableaux.js';
import { sommetDe } from '../geometry/anneau.js';
import { signedArea, centroid } from '../geometry/basic.js';
import type * as THREE_NS from 'three';
import type { CorpsToit, ObjetPolygone, PtBrut, Toit } from '../model/types.js';
import { toitDessine } from '../model/formeToit.js';
import { volumesEtHautesDuBatiment, type Volume } from '../facade/profil.js';
import { facadesDuContour, pointDeFacade, type Facade } from '../geometry/cotesVusDeDehors.js';
import { ouverturesAutomatiques, hauteurDuMur, fenetresDesPignons } from '../facade/ouvertures.js';
import { hauteursMursCorps } from '../facade/toits/toitCorps.js';
import { segmentEnFacade } from '../geometry/facadeExterieure.js';
import type { Fenetre3d } from '../model/types.js';
import type { ValeursFacades } from '../regles/facades/reglages.js';
import { plansDuToit, profondeurToit, uvDuPan, COULEUR_TOIT_DEFAUT, type P3, type PlanToit } from '../facade/toits/toit.js';
import { materiauCouverture, type ContexteCouverture } from '../model/couleurToit.js';
import { dessinCouverture, textureCouverture, matiereCouverture } from './couverture.js';
import { poserEnCouche, COUCHES_SOL, type VersLocal } from './primitives.js';
import { Batisseur, type S3 } from './batisseur.js';
import { portionsOuvertesDuMur } from './toitCorps3d.js';
import { contourAvecReculs, cotesDuPiedSurLesCotes } from '../facade/modeToit/travees.js';
import { corpsAuPied, facesDevantLeMur, murDuCorps, type RetraitRdc } from '../facade/modeToit/saillies.js';
import { aDesDetails, aUneForme, cadreEtVitreFormes, poserDetailsOuvertures, repereFacade, type PoseOuverture } from './detailsOuvertures.js';
import { HORS_EXPORT, EXPORT_SEULEMENT } from './primitives.js';
import { batisseursBaies, poserFenetreEnCreux, poserPorteEnCreux, poserGarageEnCreux, poserMaconnerie, carreauxSelonEpoque, carreauxDesDetails, maconnerieSelonEpoque, couleurPierre, VITRE, type BaieRelief, type BatisseursBaies } from './fenetresRelief.js';
import { niveaux } from '../facade/ouvertures.js';
import { poserCoulures, poserSalissure, maillageVoiles, poserDescentes, ECART_DESCENTE_BAIE } from './vieillissement.js';

/** Ce que la scene prete a ce module. */
export interface ContexteDetails {
  /** La scene, ou un groupe pose sur le sol en relief. */
  scene: THREE_NS.Object3D;
  toLocal: VersLocal;
  couleurMur: string | number;
  /** `false` quand la case « Texture » de la vue 3D est decochee. */
  textures: boolean;
  /** Le materiau de toiture des fichiers fonciers et la pente : ils choisissent la texture de la couverture. */
  couverture?: ContexteCouverture | undefined;
  /** La distance du batiment au centre de la scene, en metres : de loin, moins de details. */
  distance: number;
  /**
   * Sur un sol en relief : la hauteur du sol en un point du plan, comptee depuis l'origine du
   * groupe (le sol au centre du batiment). Absent : sol plat, tout part de zero.
   */
  sol?: ((p: PtBrut) => number) | undefined;
  /** Sur un sol en relief : le point le plus bas du sol sous l'emprise, depuis la meme origine (zero ou moins). */
  base?: number | undefined;
  /**
   * Les facades de pres (R2, three/fenetresRelief.ts) : baies en creux et maconnerie, a l'ecran
   * seulement. Pose par la scene pour les batiments proches, hors qualite Econome.
   */
  relief?: boolean | undefined;
  /** L'annee du batiment (BD TOPO) : elle choisit les petits bois et la maconnerie ; inconnue, ni l'un ni l'autre. */
  annee?: number | null | undefined;
  /** La distance du detail fin, selon le niveau de qualite ; absente, `DETAIL_FIN_M`. */
  detailFin?: number | undefined;
}

export interface OptionsDetails {
  /** Le nombre de niveaux (BD TOPO) ; absent, deduit de la hauteur. */
  etages?: number | null;
  /** Les cotes du contour qui portent un releve de facade : leurs fenetres sont deja la. */
  cotesReleves?: readonly number[];
  /** Les fenetres de la disposition automatique : dimensions communes et couleur de la vitre ; absentes, les defauts. */
  fenetres?: { largeur?: number; hauteur?: number; appui?: number; entraxe?: number; couleur?: string };
  /** Des ouvertures reglees une par une : elles remplacent la disposition automatique. */
  ouvertures?: readonly Fenetre3d[];
  /** Un toit par corps de batiment : chaque volume son emprise, son egout, son toit (model/volumesToit.ts). */
  volumes?: readonly (Volume & { toit: Toit })[];
  /** Le toit est la surface mesuree au LiDAR (three/toitMesure3d.ts) : ni debord, qui suit une forme simple. */
  sansToit?: boolean;
  /** `false` : pas de porte dans la disposition automatique. */
  porte?: boolean;
  /** Des fenetres posees au-dessus de l'egout, dans les pignons (facade/ouvertures.ts::fenetresDesPignons). */
  ouverturesHautes?: readonly Fenetre3d[];
  /**
   * Les corps reconstruits (facade/toits/toitCorps.ts) : les fenetres se posent alors sur leurs murs, ceux
   * qui donnent dehors, a la hauteur de chacun, avec celles des pignons ; la porte sur le premier.
   */
  corps?: readonly CorpsToit[];
  /** Les appentis ouverts du batiment (des poteaux, pas de mur) : le soubassement ne court pas sous eux. */
  ouverts?: readonly CorpsToit[];
  /** Le profil de facades retenu (facade/regles/facades/profils.ts) : ses dimensions quand `fenetres` n'en donne pas, et ses seuils. */
  profil?: ValeursFacades;
  /**
   * Les rez-de-chaussee en retrait sous l'etage (schema 16), par corps hote : les ouvertures du bas suivent le mur recule (aucune derriere un
   * bow-window), celles de l'etage restent au nu de la facade ; le soubassement court au pied du mur recule.
   */
  retraitsRdc?: ReadonlyMap<CorpsToit, readonly RetraitRdc[]>;
}

/** Sur un cote du pied d'un corps dont le rez-de-chaussee recule : ce recul, la hauteur de l'etage, et les bow-windows devant le mur. */
interface CoteSousEtage { reculM: number; hauteurM: number; devant: readonly (readonly [PtBrut, PtBrut])[] }

// La disposition automatique vit dans facade/ouvertures.ts ; ses constantes restent lisibles d'ici.
export { FENETRE, PORTE, ENTRAXE_FENETRES_M, niveaux, abscissesFenetres } from '../facade/ouvertures.js';

/** Le debord du toit au-dela des murs, en metres. */
export const DEBORD_TOIT_M = 0.4;
/** L'epaisseur visible du toit a la rive. */
export const EPAISSEUR_TOIT_M = 0.15;
/** La hauteur du soubassement, plus sombre que le mur. */
export const HAUTEUR_SOUBASSEMENT_M = 0.45;
/** Au-dela de cette distance au centre de la scene, seuls le debord et les aretes sont poses. */
export const DETAIL_FIN_M = 120;
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
/**
 * Le trait d'un angle de mur : la couleur du mur, un peu plus sombre. Un trait noir faisait bande
 * dessinee ; dans la gamme du mur, il marque l'angle sans le cerner.
 */
const ASSOMBRI_ARETE = 0.82;
/** En dessous de ce changement de direction, un sommet n'est pas un angle : un contour BD TOPO en a beaucoup de presque alignes. */
const ANGLE_ARETE_MIN_DEG = 25;

const rad = (d: number) => (d * Math.PI) / 180;

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
function hauteurProlongee(contour: readonly PtBrut[], toitLu: Toit): (i: number, q: PtBrut) => number {
  const toit = toitDessine(toitLu);
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
function cassures(contour: readonly PtBrut[], toitLu: Toit, a: PtBrut, b: PtBrut): number[] {
  const toit = toitDessine(toitLu);
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
  const materiau = dessinCouverture(materiauCouverture(toit, ctx.couverture), toit.pose);
  const tex = ctx.textures ? textureCouverture(materiau) : null;
  return new THREE.MeshStandardMaterial({ color: toit.couleur || COULEUR_TOIT_DEFAUT, ...matiereCouverture(materiau), side: THREE.DoubleSide, ...(tex ? { map: tex } : {}) });
}

/**
 * Le debord du toit : une bande de `DEBORD_TOIT_M` au-dela de chaque mur, dans le prolongement
 * des pans (elle descend le long d'un egout, suit le profil d'un pignon), avec son epaisseur — la
 * sous-face plus claire et la planche de rive. Et la gouttiere, le long des egouts seulement.
 */
function poserDebord(ctx: ContexteDetails, contour: readonly PtBrut[], toitLu: Toit, h: number, avecGouttiere: boolean, batiment: readonly PtBrut[] | null = null): void {
  // Une forme du catalogue se dessine en sa forme simple la plus proche (model/formeToit.ts).
  const toit = toitDessine(toitLu);
  if (toit.forme === 'plat' || toit.hauteur <= 0 || contour.length < 3) return;
  // Un corps parmi d'autres : pas de debord sur un mur commun, il traverserait le corps voisin.
  const dedans = centroid(contour);
  const facade = (a: PtBrut, b: PtBrut) => !batiment || segmentEnFacade(a, b, dedans, batiment);
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
    if (!facade(a, b)) return;
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
 * Les angles des murs en trait fin, dans la teinte du mur : des verticales seulement, aux vrais
 * angles. Poussees d'un centimetre hors de la surface pour ne pas scintiller contre elle. Ni trait
 * a l'egout (il se voyait a travers le debord du toit) ni sur le toit (faitage, aretiers et noues se
 * lisent par la lumiere sur les pans) : trop de traits faisaient bande dessinee.
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
  const bas = ctx.base ?? 0;
  volumes.forEach((v) => {
    const n = v.pts.length;
    v.pts.forEach((p, i) => {
      if (tournant(au(v.pts, (i - 1 + n) % n), p, sommetDe(v.pts, i + 1)) < ANGLE_ARETE_MIN_DEG) return;
      // Du point le plus bas du sol sous le batiment : sur un sol en pente, la partie enterree est cachee par le sol.
      segment(p, bas, p, v.hauteur);
    });
  });
  if (!pos.length) return;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  const lignes = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: new THREE.Color(ctx.couleurMur).multiplyScalar(ASSOMBRI_ARETE) }));
  lignes.name = 'batiment-aretes';
  ctx.scene.add(lignes);
}

/** Le changement de direction au sommet `p`, en degres : 0 pour trois points alignes. */
function tournant(a: PtBrut, p: PtBrut, b: PtBrut): number {
  const a1 = Math.atan2(p.y - a.y, p.x - a.x),
    a2 = Math.atan2(b.y - p.y, b.x - p.x);
  let d = Math.abs(a2 - a1) % (2 * Math.PI);
  if (d > Math.PI) d = 2 * Math.PI - d;
  return (d * 180) / Math.PI;
}

/**
 * Le pied du mur, plus sombre, en legere saillie : une bande tout autour du contour. Sur un sol en
 * relief, elle part du point le plus bas du sol sous le batiment (la partie enterree est cachee) et
 * monte a `HAUTEUR_SOUBASSEMENT_M` au-dessus du sol a chaque sommet : elle suit la pente.
 */
/** Un mur dont le rez-de-chaussee recule : sa ligne au nu de la facade (`a`, `b`), sa normale sortante, et son recul. */
interface MurSousEtage { a: PtBrut; b: PtBrut; n: PtBrut; reculM: number }

/** Les murs des corps dont le rez-de-chaussee recule sous l'etage (schema 16). */
function mursSousEtage(retraits: ReadonlyMap<CorpsToit, readonly RetraitRdc[]> | undefined): MurSousEtage[] {
  const l: MurSousEtage[] = [];
  retraits?.forEach((rs, h) => rs.forEach((r) => { const m = murDuCorps(h, r.mur); l.push({ a: m.a, b: m.b, n: m.n, reculM: r.reculM }); }));
  return l;
}

/**
 * Les portions du cote `p -> q` qui passent sous un etage qui avance : dans la bande entre le nu de la facade et le mur recule (le nu
 * lui-meme, et le bout des murs voisins). Le soubassement n'y est pas : il court au pied du mur recule.
 */
function portionsSousEtage(p: PtBrut, q: PtBrut, murs: readonly MurSousEtage[]): [number, number][] {
  const L = Math.hypot(q.x - p.x, q.y - p.y);
  if (!(L > 0)) return [];
  const eps = 0.02, l: [number, number][] = [];
  for (const m of murs) {
    const Lm = Math.hypot(m.b.x - m.a.x, m.b.y - m.a.y) || 1, u = { x: (m.b.x - m.a.x) / Lm, y: (m.b.y - m.a.y) / Lm };
    // Le cote dans le repere du mur : `s` le long du mur, `d` vers l'interieur ; on le coupe a la bande (Liang-Barsky).
    const s0 = (p.x - m.a.x) * u.x + (p.y - m.a.y) * u.y, ds = ((q.x - p.x) * u.x + (q.y - p.y) * u.y);
    const d0 = -((p.x - m.a.x) * m.n.x + (p.y - m.a.y) * m.n.y), dd = -((q.x - p.x) * m.n.x + (q.y - p.y) * m.n.y);
    let t0 = 0, t1 = 1;
    for (const [v0, dv, lo, hi] of [[s0, ds, -eps, Lm + eps], [d0, dd, -eps, m.reculM + eps]] as const) {
      if (Math.abs(dv) < 1e-9) { if (v0 < lo || v0 > hi) { t0 = 1; t1 = 0; } continue; }
      const a = (lo - v0) / dv, b = (hi - v0) / dv;
      t0 = Math.max(t0, Math.min(a, b)); t1 = Math.min(t1, Math.max(a, b));
    }
    if (t1 - t0 > 0.01 / L) l.push([t0 * L, t1 * L]);
  }
  return l;
}

function poserSoubassement(ctx: ContexteDetails, contour: readonly PtBrut[], h: number, ouverts: readonly CorpsToit[] = [], sousEtage: readonly MurSousEtage[] = []): void {
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
    const bas = ctx.base ?? 0;
    const haut = (r: PtBrut) => Math.min(h, (ctx.sol ? ctx.sol(r) : 0) + HAUTEUR_SOUBASSEMENT_M);
    // Sous un appentis ouvert, pas de mur : la bande s'interrompt (les portions fermees du cote seules).
    const L = Math.hypot(q.x - p.x, q.y - p.y);
    // Un rez-de-chaussee en retrait (schema 16) : la bande quitte le nu de la facade, elle court au pied du mur recule (ci-dessous).
    const ouvertes = [...(ouverts.length ? portionsOuvertesDuMur({ gauche: p, droite: q, largeur: L }, ouverts) : []), ...(sousEtage.length ? portionsSousEtage(p, q, sousEtage) : [])]
      .sort((u, v) => u[0] - v[0]);
    const bornes: [number, number][] = [];
    let x = 0;
    for (const [a, c] of ouvertes) { if (a > x + 0.01) bornes.push([x, a]); x = Math.max(x, c); }
    if (L > x + 0.01) bornes.push([x, L]);
    const le = (u: PtBrut, v: PtBrut, t: number): PtBrut => ({ x: u.x + (v.x - u.x) * t, y: u.y + (v.y - u.y) * t });
    for (const [a, c] of ouvertes.length ? bornes : [[0, L] as [number, number]]) {
      const ta = L > 0 ? a / L : 0, tc = L > 0 ? c / L : 1;
      const pa = ta === 0 ? p : le(p, q, ta), qa = tc === 1 ? q : le(p, q, tc), pa2 = ta === 0 ? p2 : le(p2, q2, ta), qa2 = tc === 1 ? q2 : le(p2, q2, tc);
      const hp = haut(pa),
        hq = haut(qa);
      b.quad(local(pa2, bas), local(qa2, bas), local(qa2, hq), local(pa2, hp));
      b.quad(local(pa2, hp), local(qa2, hq), local(qa, hq), local(pa, hp));
    }
  });
  for (const m of sousEtage) {
    // Au pied du mur recule, la meme bande, decollee de lui vers la rue.
    const pa = { x: m.a.x - m.n.x * m.reculM, y: m.a.y - m.n.y * m.reculM }, qa = { x: m.b.x - m.n.x * m.reculM, y: m.b.y - m.n.y * m.reculM };
    const pa2 = { x: pa.x + m.n.x * SAILLIE_SOUBASSEMENT_M, y: pa.y + m.n.y * SAILLIE_SOUBASSEMENT_M }, qa2 = { x: qa.x + m.n.x * SAILLIE_SOUBASSEMENT_M, y: qa.y + m.n.y * SAILLIE_SOUBASSEMENT_M };
    const bas = ctx.base ?? 0, haut = (r: PtBrut) => Math.min(h, (ctx.sol ? ctx.sol(r) : 0) + HAUTEUR_SOUBASSEMENT_M);
    b.quad(local(pa2, bas), local(qa2, bas), local(qa2, haut(qa)), local(pa2, haut(pa)));
    b.quad(local(pa2, haut(pa)), local(qa2, haut(qa)), local(qa, haut(qa)), local(pa, haut(pa)));
  }
  b.groupe(0);
  const couleur = new THREE.Color(ctx.couleurMur).multiplyScalar(0.72);
  ctx.scene.add(b.maillage([new THREE.MeshStandardMaterial({ color: couleur, roughness: 0.95, side: THREE.DoubleSide })], 'batiment-soubassement'));
}

/**
 * Les ouvertures d'un batiment en corps : chaque corps sur ses propres murs (ceux qu'on dessine),
 * sauf ses murs communs avec un autre corps, ou il n'y a pas de dehors ; ses pignons ont leur
 * fenetre ; seul le premier corps (le plus grand) porte la porte d'entree.
 */
function poserOuverturesDesCorps(ctx: ContexteDetails, batiment: readonly PtBrut[], corps: readonly CorpsToit[], options: OptionsDetails): void {
  corps.forEach((c, k) => {
    // Le pied du corps : ses murs recules compris (schema 14), et son rez-de-chaussee en retrait sous l'etage (schema 16) ; sans recul, son
    // rectangle. Les cotes du pied gardent le mur dont ils viennent : c'est lui qui dit s'ils donnent dehors.
    const retraits = options.retraitsRdc?.get(c);
    const pied = contourAvecReculs(corpsAuPied(c, retraits)), pts = pied.pts;
    const piedNu = retraits ? contourAvecReculs(c) : pied;
    const dedans = centroid(c.pts);
    // Un mur recule est en facade quand le mur du corps dont il vient l'est (il est en retrait du contour, pas dedans) ; un retour de
    // recul ne porte pas de fenetre.
    const enFacadeMur = c.pts.map((_: PtBrut, m: number) => segmentEnFacade(au(c.pts, m), sommetDe(c.pts, m + 1), dedans, batiment));
    const interieurs = pts.map((_: PtBrut, i: number) => i).filter((i: number) => {
      const q = pied.cotes[i];
      // Une travee ouverte n'a pas de mur : pas de fenetre.
      if (q && q.nature !== 'mur') return true;
      if (!q || (pts.length === c.pts.length && !retraits)) return !segmentEnFacade(au(pts, i), sommetDe(pts, i + 1), dedans, batiment);
      return q.mur < 0 || !enFacadeMur[q.mur];
    });
    // Les murs releves du batiment se designent par leurs cotes du contour : le corps ecarte les siens
    // qui les doublent. Sans cela, le mur photographie recevait aussi la grille des fenetres automatiques.
    // Le mur recule sous l'etage se reconnait par le mur dont il vient (facade/modeToit/travees.ts::cotesDuPiedSurLesCotes).
    const releves = options.cotesReleves?.length ? cotesDuPiedSurLesCotes(pied, piedNu, batiment, options.cotesReleves) : [];
    // Les cotes du mur recule (pas les retours d'une travee) : ce que leurs ouvertures doivent savoir de l'etage qui avance.
    const sousEtage = new Map<number, CoteSousEtage>();
    if (retraits) pied.cotes.forEach((q, i) => { const r = retraits.find((x) => x.mur === q.mur); if (r && q.recul === 0) sousEtage.set(i, r); });
    // La face d'un corps qui passe devant un mur releve (un appentis, une veranda) montre le bas de sa photo (three/releve3d.ts) : la
    // disposition automatique n'y dessine rien non plus.
    const devant = options.cotesReleves?.length ? facadesDuContour(batiment, 0).filter((f) => options.cotesReleves?.includes(f.cote)).flatMap((f) => facesDevantLeMur(f, [c])) : [];
    const photographies = devant.length ? pts.map((_: PtBrut, i: number) => i).filter((i: number) => {
      const a = au(pts, i), b = sommetDe(pts, i + 1), l = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      return devant.some((d) => { const m = { x: (d.a.x + d.b.x) / 2, y: (d.a.y + d.b.y) / 2 }; return Math.abs((m.x - a.x) * (b.y - a.y) - (m.y - a.y) * (b.x - a.x)) / l < 0.05; });
    }) : [];
    const sansAutomatiques = [...new Set([...interieurs, ...releves, ...photographies])];
    const bas = Math.min(...c.egouts);
    const largeur = options.fenetres?.largeur, hauteur = options.fenetres?.hauteur;
    const h = hauteursMursCorps(c);
    const pignons = fenetresDesPignons(c, largeur ?? options.profil?.FENETRE_LARGEUR_M, hauteur ?? options.profil?.FENETRE_HAUTEUR_M, options.profil?.HAUTEUR_PIGNON_FENETRE_M);
    // Un mur commun se traite comme un mur releve : la disposition automatique ne le touche pas.
    poserOuvertures(ctx, pts, [{ pts, hauteur: bas, hauteursMurs: pied.cotes.map((q) => (q.mur >= 0 ? h[q.mur] ?? bas : bas)) }], bas, {
      ...options, cotesReleves: sansAutomatiques, porte: k === 0, ...(sousEtage.size ? { sousEtage } : {}),
      ouverturesHautes: (pts.length === c.pts.length ? pignons : pignons.map((f) => surLePied(c, pts, pied.cotes, f)).filter((f): f is Fenetre3d => !!f)).filter((f) => !sansAutomatiques.includes(f.cote)),
    });
  });
}

/** Une fenetre de pignon posee sur un mur du rectangle du corps, reportee sur le cote du pied qui le porte la ou il recule. */
function surLePied(c: CorpsToit, pied: readonly PtBrut[], cotes: readonly { mur: number }[], f: Fenetre3d): Fenetre3d | null {
  const g = facadesDuContour(c.pts, 0).find((x) => x.cote === f.cote);
  if (!g) return null;
  const k = (f.x + f.l / 2) / g.largeur, centre = { x: g.gauche.x + (g.droite.x - g.gauche.x) * k, y: g.gauche.y + (g.droite.y - g.gauche.y) * k };
  const faces = facadesDuContour(pied, 0);
  let meilleur: { cote: number; x: number } | null = null, dmin = Infinity;
  cotes.forEach((q, j) => {
    if (q.mur !== f.cote) return;
    const fj = faces.find((x) => x.cote === j);
    if (!fj) return;
    const ux = (fj.droite.x - fj.gauche.x) / fj.largeur, uy = (fj.droite.y - fj.gauche.y) / fj.largeur;
    const x = (centre.x - fj.gauche.x) * ux + (centre.y - fj.gauche.y) * uy;
    if (x < 0 || x > fj.largeur) return;
    const d = Math.abs((centre.x - fj.gauche.x) * uy - (centre.y - fj.gauche.y) * ux);
    if (d < dmin) { dmin = d; meilleur = { cote: j, x: x - f.l / 2 }; }
  });
  const m = meilleur as { cote: number; x: number } | null;
  return m ? { ...f, cote: m.cote, x: m.x } : null;
}

/**
 * Les ouvertures : la disposition automatique (facade/ouvertures.ts) aux dimensions demandees, ou
 * la liste reglee une par une. Un cadre clair, une vitre de la couleur demandee, un vantail bois :
 * trois groupes d'une seule maille.
 */
/**
 * La facade ou se pose une ouverture d'un cote dont le rez-de-chaussee recule sous l'etage : le mur recule pour une ouverture du bas (aucune
 * derriere un bow-window : null), le nu de la facade pour une ouverture de l'etage (null pour une qui serait a cheval sur les deux).
 */
function facadeSousEtage(f: Facade, o: Fenetre3d, y: number, e: CoteSousEtage): Facade | null {
  if (y + o.h <= e.hauteurM + 0.01) {
    const ux = (f.droite.x - f.gauche.x) / f.largeur, uy = (f.droite.y - f.gauche.y) / f.largeur;
    const le = (p: PtBrut) => (p.x - f.gauche.x) * ux + (p.y - f.gauche.y) * uy;
    const derriere = e.devant.some(([a, b]) => o.x < Math.max(le(a), le(b)) && o.x + o.l > Math.min(le(a), le(b)));
    return derriere ? null : f;
  }
  if (y < e.hauteurM - 0.01) return null;
  const d = { x: f.normale.x * e.reculM, y: f.normale.y * e.reculM };
  return { ...f, gauche: { x: f.gauche.x + d.x, y: f.gauche.y + d.y }, droite: { x: f.droite.x + d.x, y: f.droite.y + d.y } };
}

function poserOuvertures(ctx: ContexteDetails, contour: readonly PtBrut[], volumes: readonly Volume[], h: number, options: OptionsDetails & { sousEtage?: ReadonlyMap<number, CoteSousEtage> }): void {
  const facades = facadesDuContour(contour, h);
  // Un mur photographie garde les ouvertures de son releve (releve3d.ts) : la liste reglee a la
  // main n'y dessine rien, pas plus que la disposition automatique.
  const releves = new Set(options.cotesReleves ?? []);
  const liste = (options.ouvertures ?? ouverturesAutomatiques(contour, volumes, h, { ...(options.fenetres ?? {}), ...(options.etages !== undefined ? { etages: options.etages } : {}), ...(options.cotesReleves ? { cotesReleves: options.cotesReleves } : {}), ...(options.porte === false ? { porte: false } : {}), ...(options.profil ? { profil: options.profil } : {}) })).filter((o) => !releves.has(o.cote));
  // Les fenetres des pignons montent au-dessus de l'egout : elles ne passent pas le controle de hauteur du mur.
  const hautes = new Set((options.ouverturesHautes ?? []).filter((o) => !releves.has(o.cote)));
  liste.push(...hautes);
  if (!liste.length) return;
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
  // Les volets, coffres, balcons et garde-corps des ouvertures qui en ont (three/detailsOuvertures.ts).
  const poses: PoseOuverture[] = [];
  // De pres, l'ecran montre les baies en creux (R2) ; le maillage a plat ci-dessus reste pour l'export.
  const relief = ctx.relief ? { b: batisseursBaies(), formes: new Batisseur(), cadresFormes: [] as (() => void)[], vitresFormes: [] as (() => void)[], portesFormes: [] as (() => void)[], parCote: new Map<number, BaieRelief[]>() } : null;
  const carreaux = (o: Fenetre3d) => carreauxDesDetails(o.details, o.h, carreauxSelonEpoque(ctx.annee ?? null, o.h));
  const noterBaie = (f: Facade, o: BaieRelief) => { if (!relief) return; const l = relief.parCote.get(f.cote) ?? []; l.push(o); relief.parCote.set(f.cote, l); };
  // Une baie cintree ou ronde : son cadre et sa vitre suivent son contour (lot G17) ; les autres
  // gardent exactement leurs deux quads d'avant.
  const forme = (f: Facade, o: Fenetre3d, y: number, vers: (() => void)[], porte: boolean) => {
    const pt = repereFacade(ctx.toLocal, f);
    const c = cadreEtVitreFormes(b, pt, { ...o, y }, CADRE_M, DECOLLEMENT, DECOLLEMENT * 2, porte);
    cadres.push(c.cadre);
    if (c.vitre) vers.push(c.vitre);
    // Une baie cintree reste a plat a l'ecran aussi : son contour courbe ne se creuse pas (encore).
    if (relief) {
      const e = cadreEtVitreFormes(relief.formes, pt, { ...o, y }, CADRE_M, DECOLLEMENT, DECOLLEMENT * 2, porte);
      relief.cadresFormes.push(e.cadre);
      if (e.vitre) (porte ? relief.portesFormes : relief.vitresFormes).push(e.vitre);
    }
  };
  liste.forEach((o) => {
    const surLeCote = facades.find((x) => x.cote === o.cote);
    if (!surLeCote || o.x < 0 || o.x + o.l > surLeCote.largeur + 0.01 || o.l <= 0 || o.h <= 0) return;
    const hMur = hauteurDuMur(surLeCote, volumes);
    const e = options.sousEtage?.get(o.cote);
    const porte = o.type === 'porte' || o.type === 'garage';
    const f = e ? facadeSousEtage(surLeCote, o, porte ? 0 : o.y, e) : surLeCote;
    if (!f) return;
    if (porte) {
      // Sur un sol en relief, la porte se pose sur le sol devant elle, pas sur celui du centre.
      const yp = ctx.sol ? Math.max(ctx.base ?? 0, Math.min(hMur - o.h - 0.3, ctx.sol(pointDeFacade(f, o.x + o.l / 2)))) : o.y;
      if (aUneForme(o.details)) forme(f, o, yp, portes, true);
      else {
        cadres.push(() => rect(f, o.x - CADRE_M, yp, o.l + 2 * CADRE_M, o.h + CADRE_M, DECOLLEMENT));
        portes.push(() => rect(f, o.x, yp, o.l, o.h, DECOLLEMENT * 2));
        if (relief) {
          const baie = { x: o.x, y: yp, l: o.l, h: o.h };
          if (o.type === 'garage') poserGarageEnCreux(relief.b, repereFacade(ctx.toLocal, f), baie, hMur, o.details?.garage);
          else poserPorteEnCreux(relief.b, repereFacade(ctx.toLocal, f), baie, hMur, o.details?.remplissage);
          noterBaie(f, baie);
        }
      }
      if (aDesDetails(o.details)) poses.push({ f, o: { ...o, y: yp }, hMur, cadre: CADRE_M });
      return;
    }
    if (!hautes.has(o) && o.y + o.h > hMur - 0.15) return;
    if (aUneForme(o.details)) forme(f, o, o.y, vitres, false);
    else {
      cadres.push(() => rect(f, o.x - CADRE_M, o.y - CADRE_M, o.l + 2 * CADRE_M, o.h + 2 * CADRE_M, DECOLLEMENT));
      vitres.push(() => rect(f, o.x, o.y, o.l, o.h, DECOLLEMENT * 2));
      if (relief) {
        const baie = { x: o.x, y: o.y, l: o.l, h: o.h };
        poserFenetreEnCreux(relief.b, repereFacade(ctx.toLocal, f), baie, carreaux(o), hMur);
        noterBaie(f, baie);
      }
    }
    if (aDesDetails(o.details)) poses.push({ f, o, hMur, cadre: CADRE_M });
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
    new THREE.MeshStandardMaterial({ color: options.fenetres?.couleur ?? COULEUR_VITRE, roughness: 0.25, metalness: 0.2 }),
    new THREE.MeshStandardMaterial({ color: COULEUR_PORTE, roughness: 0.8 }),
  ];
  // Un centimetre devant le mur ne suffit pas vu de loin : les ouvertures gagnent le test de profondeur.
  materiaux.forEach((m) => poserEnCouche(m, COUCHES_SOL.surMur));
  const aPlat = b.maillage(materiaux, 'batiment-ouvertures');
  ctx.scene.add(aPlat);
  if (relief) {
    // A l'ecran, les baies en creux ; au .glb, celles d'avant (EXPORT_SEULEMENT, three/exportGlb.ts).
    aPlat.visible = false;
    aPlat.userData[EXPORT_SEULEMENT] = true;
    poserBaiesEnCreux(ctx, relief.b, materiaux, options.fenetres?.couleur);
    if (relief.cadresFormes.length) {
      relief.cadresFormes.forEach((f) => f()); relief.formes.groupe(0);
      relief.vitresFormes.forEach((f) => f()); relief.formes.groupe(1);
      relief.portesFormes.forEach((f) => f()); relief.formes.groupe(2);
      const m = relief.formes.maillage(materiaux, 'batiment-baies-formes');
      m.userData[HORS_EXPORT] = true;
      ctx.scene.add(m);
    }
    poserMaconnerieDesFacades(ctx, contour, facades, volumes, releves, relief.parCote, options);
    poserVieillissement(ctx, facades, volumes, releves, relief.parCote, options.porte !== false);
  }
  poserDetailsOuvertures(ctx, poses);
}

/**
 * Le vieillissement des murs donnant dehors (R3, three/vieillissement.ts) : coulures sous les appuis,
 * salissure au-dessus du soubassement ; et, sur le corps principal, deux descentes d'eau pluviale aux
 * bouts de son plus long mur.
 */
function poserVieillissement(ctx: ContexteDetails, facades: readonly Facade[], volumes: readonly Volume[], releves: ReadonlySet<number>, baies: ReadonlyMap<number, BaieRelief[]>, principal: boolean): void {
  const coulures = new Batisseur(), salissure = new Batisseur();
  const dehors = facades.filter((f) => !releves.has(f.cote));
  dehors.forEach((f) => {
    const pt = repereFacade(ctx.toLocal, f);
    poserCoulures(coulures, pt, baies.get(f.cote) ?? []);
    poserSalissure(salissure, pt, f.largeur, HAUTEUR_SOUBASSEMENT_M);
  });
  const voiles = maillageVoiles(coulures, salissure);
  if (voiles) ctx.scene.add(voiles);
  const long = principal ? dehors.reduce<Facade | null>((m, f) => (!m || f.largeur > m.largeur ? f : m), null) : null;
  if (long && long.largeur > 3) {
    const g = ctx.toLocal(long.gauche), d = ctx.toLocal(long.droite);
    const ux = (d.x - g.x) / long.largeur, uz = (d.z - g.z) / long.largeur;
    const e = ECART_DESCENTE_BAIE;
    poserDescentes(ctx.scene, [{ x: g.x + ux * e, z: g.z + uz * e }, { x: d.x - ux * e, z: d.z - uz * e }], { x: long.normale.x, z: -long.normale.y }, hauteurDuMur(long, volumes) - 0.05, ctx.base ?? 0);
  }
}

/** Les baies en creux d'un batiment : quatre maillages (pierre, menuiserie, vitre, porte), hors export. */
function poserBaiesEnCreux(ctx: ContexteDetails, b: BatisseursBaies, aPlat: THREE_NS.MeshStandardMaterial[], couleurVitre: string | undefined): void {
  const groupe = new THREE.Group();
  groupe.name = 'batiment-baies-relief';
  groupe.userData[HORS_EXPORT] = true;
  const vitre = new THREE.MeshStandardMaterial({ color: couleurVitre ?? VITRE.couleur, roughness: VITRE.rugosite, metalness: VITRE.metal });
  poserEnCouche(vitre, COUCHES_SOL.surMur);
  const pieces: [Batisseur, THREE_NS.Material, string][] = [
    [b.encadrement, new THREE.MeshStandardMaterial({ color: couleurPierre(ctx.couleurMur), roughness: 0.85 }), 'encadrement'],
    [b.menuiserie, aPlat[0] as THREE_NS.Material, 'menuiserie'],
    [b.vitre, vitre, 'vitre'],
    [b.porte, aPlat[2] as THREE_NS.Material, 'porte'],
  ];
  pieces.forEach(([bat, mat, nom]) => {
    if (bat.vide) return;
    bat.groupe(0);
    groupe.add(bat.maillage([mat], 'baies-' + nom));
  });
  ctx.scene.add(groupe);
}

/**
 * La maconnerie de chaque mur donnant dehors (corniche, bandeaux, chaines d'angle) selon l'epoque du
 * batiment. Un mur photographie garde sa photo ; un mur commun n'en recoit pas.
 */
function poserMaconnerieDesFacades(ctx: ContexteDetails, contour: readonly PtBrut[], facades: readonly Facade[], volumes: readonly Volume[], releves: ReadonlySet<number>, baies: ReadonlyMap<number, BaieRelief[]>, options: OptionsDetails): void {
  const m = maconnerieSelonEpoque(ctx.annee ?? null);
  if (!m.corniche && !m.bandeaux && !m.chaines) return;
  const b = new Batisseur();
  const n = contour.length;
  const angleEn = (i: number) => tournant(au(contour, (i - 1 + n) % n), au(contour, i), au(contour, (i + 1) % n)) >= ANGLE_ARETE_MIN_DEG;
  facades.forEach((f) => {
    if (releves.has(f.cote)) return;
    const hMur = hauteurDuMur(f, volumes);
    const i = f.cote, j = (f.cote + 1) % n;
    // `gauche` est l'extremite vue de dehors : l'un des deux sommets du cote.
    const gaucheEstI = Math.hypot(f.gauche.x - au(contour, i).x, f.gauche.y - au(contour, i).y) < 1e-6;
    const angles = { gauche: angleEn(gaucheEstI ? i : j), droite: angleEn(gaucheEstI ? j : i) };
    poserMaconnerie(b, repereFacade(ctx.toLocal, f), { largeur: f.largeur, hauteur: hMur }, m, niveaux(hMur, options.etages, options.profil), angles, baies.get(f.cote) ?? []);
  });
  if (b.vide) return;
  b.groupe(0);
  const mat = new THREE.MeshStandardMaterial({ color: couleurPierre(ctx.couleurMur), roughness: 0.85 });
  const maillage = b.maillage([mat], 'batiment-maconnerie');
  maillage.userData[HORS_EXPORT] = true;
  ctx.scene.add(maillage);
}

/** Habille un batiment de ses details. Le prisme et le releve sont deja poses. */
export function ajouterDetailsBatiment(ctx: ContexteDetails, o: ObjetPolygone, h: number, options: OptionsDetails = {}): void {
  if (!Array.isArray(o.pts) || o.pts.length < 3 || h <= 0) return;
  const multi = options.volumes;
  const lus = multi ? null : volumesEtHautesDuBatiment(o.pts, h, o.batiment?.facades);
  const volumes = multi ?? lus?.volumes ?? [];
  const contourHaut = au(volumes, 0).pts;
  // Les parties hautes : une, ou deux de part et d'autre d'une partie basse au milieu du mur ; chacune a son debord.
  const hautes = lus ? volumes.slice(0, lus.hautes).map((v) => v.pts) : [contourHaut];
  const toit = options.sansToit ? null : o.batiment?.toit;
  const pres = ctx.distance <= (ctx.detailFin ?? DETAIL_FIN_M);
  // Chaque corps de batiment a son debord a son egout ; sinon le debord suit la partie haute.
  if (multi && !options.sansToit) multi.forEach((v) => poserDebord(ctx, v.pts, v.toit, v.hauteur, pres, o.pts));
  else if (toit) hautes.forEach((pts) => poserDebord(ctx, pts, toit, h, pres));
  poserAretes(ctx, volumes, contourHaut);
  if (!pres) return;
  poserSoubassement(ctx, o.pts, h, options.ouverts, mursSousEtage(options.retraitsRdc));
  if (options.corps?.length) poserOuverturesDesCorps(ctx, o.pts, options.corps, options);
  else poserOuvertures(ctx, o.pts, volumes, h, options);
  // Pas de cheminee ici : une souche ne vient que des donnees (`corps.cheminees` : LiDAR, regles, audit,
  // Mode Toit), dessinee par three/cheminees3d.ts. Celle qu'on posait d'office au tiers du faitage d'un
  // toit simple ou en volumes, personne ne l'avait vue (MD/spec-flux-batiment.md, point 12).
}

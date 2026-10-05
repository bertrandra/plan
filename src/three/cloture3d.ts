// La cloture de la parcelle en 3D, cote par cote, avec ses acces (MD/spec-cloture.md §4).
//
// Remplace la bande unique d'avant : chaque cote est decoupe en troncons entre les acces, chaque
// troncon recoit sa matiere (palissade, grillage, haie, mur, et son soubassement), chaque acces ses
// piliers et ses vantaux, fermes ou ouverts. Les bandes passent par les primitives de la scene
// (`addPrism`, qui connait les textures) ; les vantaux, dont le haut suit une courbe, sont des
// maillages construits ici comme ceux du releve de facade.
//
// Rien n'est ajoute sans cloture active : la scene d'un plan sans cloture garde ses mailles.

import type * as THREE_NS from 'three';
import type { ObjetPlan, PtBrut, Portail, ReglageCloture } from '../model/types.js';
import { aDesSommets } from '../model/formes.js';
import {
  clotureDe, reglageDuCote, tronconsDuCote, empriseAcces, vantauxDe, profilDuVantail,
  epaisseurDe, coteValide, COULEUR_CLOTURE_DEFAUT, DEFAUTS_PAR_TYPE,
} from '../model/cloture.js';
import { facadesDuContour, pointDeFacade, type Facade } from '../facade/geometrie.js';
import { trianguler } from '../facade/toit.js';
import { safeOffset } from '../engine/structure.js';
import { sommetDe } from '../geometry/anneau.js';
import { au } from '../util/tableaux.js';
import type { Primitives } from './primitives.js';

/** Ce que la scene prete a ce module. */
export interface ContexteCloture3d {
  scene: THREE_NS.Scene;
  toLocal: (p: PtBrut) => { x: number; z: number };
  prim: Pick<Primitives, 'addPrism'>;
  /** `false` quand la case « Texture » de la vue 3D est decochee : on garde les formes. */
  textures: boolean;
  chargerTexture: (url: string, repetition?: number) => THREE_NS.Texture;
}

const EPAISSEUR_VANTAIL = 0.04;
const SECTION_POTEAU = 0.09;
const PAS_POTEAUX = { palissade: 2, grillage: 2.5 } as const;
const DEBORD_COUVERTINE = 0.04;
const EPAISSEUR_COUVERTINE = 0.04;
const EPAISSEUR_SOUBASSEMENT = 0.2;
const OPACITE_GRILLAGE = 0.35;
const OPACITE_AJOURE = 0.5;
/** Un coulissant ouvert glisse derriere la cloture, sur son rail. */
const RECUL_RAIL = 0.1;

/** Le cote `i` du contour, dans le repere gauche-droite vu de dehors. */
function facadeDuCote(facades: readonly Facade[], i: number): Facade | undefined {
  return facades.find(f => f.cote === i);
}

/**
 * L'emprise au sol d'un troncon de clôture, de `debut` a `fin` metres le long du cote, sur `ep`
 * metres vers l'interieur ; aux extremites du cote, l'interieur suit l'anneau mitre, comme avant,
 * pour que deux cotes se rejoignent sans entaille a l'angle.
 */
function empriseTroncon(f: Facade, debut: number, fin: number, ep: number, recul: number, interieur: { gauche: PtBrut; droite: PtBrut } | null): PtBrut[] {
  const n = f.normale;
  const dedans = (p: PtBrut, d: number): PtBrut => ({ x: p.x - n.x * d, y: p.y - n.y * d });
  const a = dedans(pointDeFacade(f, debut), recul);
  const b = dedans(pointDeFacade(f, fin), recul);
  const ai = interieur && debut <= 0.001 && recul === 0 ? interieur.gauche : dedans(a, ep);
  const bi = interieur && fin >= f.largeur - 0.001 && recul === 0 ? interieur.droite : dedans(b, ep);
  return [a, b, bi, ai];
}

/** Un carre de `cote` metres centre sur `c`, oriente comme la facade. */
function carre(f: Facade, c: PtBrut, cote: number): PtBrut[] {
  const u = { x: (f.droite.x - f.gauche.x) / f.largeur, y: (f.droite.y - f.gauche.y) / f.largeur };
  const n = f.normale;
  const d = cote / 2;
  return [
    { x: c.x - u.x * d - n.x * d, y: c.y - u.y * d - n.y * d },
    { x: c.x + u.x * d - n.x * d, y: c.y + u.y * d - n.y * d },
    { x: c.x + u.x * d + n.x * d, y: c.y + u.y * d + n.y * d },
    { x: c.x - u.x * d + n.x * d, y: c.y - u.y * d + n.y * d },
  ];
}

function couleurDe(r: ReglageCloture): string {
  return r.couleur || DEFAUTS_PAR_TYPE[r.type].couleur || COULEUR_CLOTURE_DEFAUT;
}

/** Un troncon : son soubassement, sa bande, ses poteaux, sa couvertine. */
function poserTroncon(ctx: ContexteCloture3d, f: Facade, r: ReglageCloture, t: { debut: number; fin: number }, interieur: { gauche: PtBrut; droite: PtBrut } | null): void {
  if (r.type === 'aucune' || t.fin - t.debut < 0.01) return;
  const tex = (ref: unknown) => (ctx.textures && ref ? { vertical: ref } : null);
  let base = 0;
  if (r.soubassement && r.type !== 'mur') {
    const s = r.soubassement;
    ctx.prim.addPrism(empriseTroncon(f, t.debut, t.fin, Math.max(EPAISSEUR_SOUBASSEMENT, epaisseurDe(r)), 0, interieur), 0, Math.max(0.05, s.hauteur), s.couleur || DEFAUTS_PAR_TYPE.mur.couleur || COULEUR_CLOTURE_DEFAUT, false, undefined, tex(s.texture));
    base = Math.max(0.05, s.hauteur);
  }
  const h = Math.max(0.1, r.hauteur);
  const ep = epaisseurDe(r);
  const couleur = couleurDe(r);
  const opacite = r.type === 'grillage' ? (r.occultante ? 0.9 : OPACITE_GRILLAGE) : undefined;
  ctx.prim.addPrism(empriseTroncon(f, t.debut, t.fin, ep, 0, interieur), base, h, couleur, false, opacite, tex(r.texture));
  if (r.type === 'mur' && r.couvertine) {
    const n = f.normale;
    const large = empriseTroncon(f, t.debut, t.fin, ep + DEBORD_COUVERTINE, 0, null).map((p, i) => (i < 2 ? { x: p.x + n.x * DEBORD_COUVERTINE, y: p.y + n.y * DEBORD_COUVERTINE } : p));
    ctx.prim.addPrism(large, base + h, EPAISSEUR_COUVERTINE, couleur, false, undefined, null);
  }
  if (r.type === 'palissade' || r.type === 'grillage') {
    // Un poteau a chaque bout du troncon, puis au pas du type ; le dernier intervalle est raccourci.
    const pas = PAS_POTEAUX[r.type];
    const longueur = t.fin - t.debut;
    const nb = Math.max(1, Math.ceil(longueur / pas - 0.001));
    for (let k = 0; k <= nb; k++) {
      const x = t.debut + Math.min(longueur, (longueur * k) / nb);
      const c = pointDeFacade(f, x);
      const centre = { x: c.x - f.normale.x * (ep / 2), y: c.y - f.normale.y * (ep / 2) };
      ctx.prim.addPrism(carre(f, centre, SECTION_POTEAU), base, h + 0.05, couleur, false, undefined, null);
    }
  }
}

/** Un maillage a partir de sommets 3D et de triangles, normales calculees. */
function maillage(sommets: number[], indices: number[], mat: THREE_NS.Material, uv?: number[]): THREE_NS.Mesh {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(sommets, 3));
  if (uv) geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return new THREE.Mesh(geo, mat);
}

/**
 * Un vantail : son profil (`profilDuVantail`) pose dans l'espace depuis son gond, le long d'une
 * direction — celle de la cloture quand il est ferme, la normale quand il est ouvert — avec une
 * epaisseur, pour qu'on le voie de profil.
 */
function poserVantail(ctx: ContexteCloture3d, profil: PtBrut[], gond: PtBrut, direction: PtBrut, base: number, mat: THREE_NS.Material, nom: string): void {
  const g = ctx.toLocal(gond);
  const d = ctx.toLocal({ x: gond.x + direction.x, y: gond.y + direction.y });
  const ux = d.x - g.x, uz = d.z - g.z;
  // L'epaisseur est perpendiculaire a la direction, dans le plan horizontal.
  const nx = -uz, nz = ux;
  const n = profil.length;
  const sommets: number[] = [];
  const uv: number[] = [];
  const hMax = profil.reduce((m, p) => Math.max(m, p.y), 0) || 1;
  const largeur = profil.reduce((m, p) => Math.max(m, p.x), 0) || 1;
  for (const s of [-EPAISSEUR_VANTAIL / 2, EPAISSEUR_VANTAIL / 2]) {
    for (const p of profil) {
      sommets.push(g.x + ux * p.x + nx * s, base + p.y, g.z + uz * p.x + nz * s);
      uv.push(p.x / largeur, p.y / hMax);
    }
  }
  const tri = trianguler(profil);
  const indices: number[] = [];
  tri.forEach(([i, j, k]) => indices.push(i, j, k, n + i, n + k, n + j));
  // Le chant, entre les deux faces.
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    indices.push(i, j, n + j, i, n + j, n + i);
  }
  const m = maillage(sommets, indices, mat, uv);
  m.name = nom;
  ctx.scene.add(m);
}

function materiauVantail(ctx: ContexteCloture3d, a: Portail, opacite: number): THREE_NS.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({ color: a.couleur, roughness: a.materiau === 'bois' ? 0.8 : 0.45, metalness: a.materiau === 'aluminium' || a.materiau === 'fer' ? 0.4 : 0, side: THREE.DoubleSide });
  if (opacite < 1) { mat.transparent = true; mat.opacity = opacite; }
  const url = ctx.textures && a.texture ? a.texture.url : null;
  if (url) mat.map = ctx.chargerTexture(url, 1);
  return mat;
}

/** Un acces : ses piliers, ses retours de cloture en cas de retrait, ses vantaux. */
function poserAcces(ctx: ContexteCloture3d, f: Facade, r: ReglageCloture, a: Portail): void {
  const n = f.normale;
  const recul = Math.max(0, a.retrait);
  const dedans = (p: PtBrut, d: number): PtBrut => ({ x: p.x - n.x * d, y: p.y - n.y * d });
  const e = empriseAcces(a);
  const x0 = Math.max(0, a.x), x1 = Math.min(f.largeur, a.x + a.largeur);
  if (x1 - x0 < 0.05) return;
  const pl = a.piliers ? a.piliers.largeur : 0;
  if (a.piliers) {
    const p = a.piliers;
    const couleur = p.couleur || DEFAUTS_PAR_TYPE.mur.couleur || COULEUR_CLOTURE_DEFAUT;
    for (const x of [x0 - pl / 2, x1 + pl / 2]) {
      const centre = dedans(pointDeFacade(f, x), recul + pl / 2);
      ctx.prim.addPrism(carre(f, centre, pl), 0, Math.max(0.3, p.hauteur), couleur, false, undefined, null);
      if (p.chapeau) ctx.prim.addPrism(carre(f, centre, pl + 2 * DEBORD_COUVERTINE), Math.max(0.3, p.hauteur), EPAISSEUR_COUVERTINE, couleur, false, undefined, null);
    }
  }
  if (recul > 0 && r.type !== 'aucune') {
    // Les deux retours : de l'alignement aux piliers, dans la matiere du cote.
    const ep = epaisseurDe(r);
    const h = Math.max(0.1, r.hauteur) + (r.soubassement && r.type !== 'mur' ? r.soubassement.hauteur : 0);
    for (const [x, sens] of [[Math.max(0, e.debut), 1], [Math.min(f.largeur, e.fin), -1]] as const) {
      const p0 = pointDeFacade(f, x);
      const u = { x: ((f.droite.x - f.gauche.x) / f.largeur) * sens * ep, y: ((f.droite.y - f.gauche.y) / f.largeur) * sens * ep };
      ctx.prim.addPrism([p0, { x: p0.x + u.x, y: p0.y + u.y }, dedans({ x: p0.x + u.x, y: p0.y + u.y }, recul), dedans(p0, recul)], 0, h, couleurDe(r), false, undefined, null);
    }
  }
  const ouvert = !!a.ouvert;
  const opacite = a.remplissage === 'ajoure' ? OPACITE_AJOURE : 1;
  const mat = materiauVantail(ctx, a, opacite);
  const matPlein = a.remplissage === 'semi' ? materiauVantail(ctx, a, 1) : null;
  const vantaux = vantauxDe(a);
  const u = { x: (f.droite.x - f.gauche.x) / f.largeur, y: (f.droite.y - f.gauche.y) / f.largeur };
  // Le sens d'ouverture : vers l'interieur (-n) ou vers la rue (+n).
  const sens = a.sens === 'exterieur' ? 1 : -1;
  const poser = (profil: PtBrut[], gond: PtBrut, direction: PtBrut, m: THREE_NS.Material) => poserVantail(ctx, profil, gond, direction, 0, m, 'cloture-vantail');
  if (a.ouverture === 'coulissant') {
    const profil = profilDuVantail(a, a.largeur, 0);
    const glisse = ouvert ? (a.refoulement === 'gauche' ? -a.largeur : a.largeur) : 0;
    const gond = dedans(pointDeFacade(f, a.x + glisse), recul + (ouvert ? RECUL_RAIL : 0));
    poser(profil, gond, u, mat);
    if (matPlein) poser(profilDuVantail({ ...a, forme: 'droit', hauteur: a.hauteur / 3 }, a.largeur, 0), { x: gond.x - n.x * 0.005, y: gond.y - n.y * 0.005 }, u, matPlein);
    return;
  }
  let debut = 0;
  vantaux.forEach((largeur, k) => {
    // Un seul battant ou le battant gauche pivote sur le pilier gauche ; le droit sur le droit.
    const gondADroite = a.ouverture === 'battant-2' && k === 1;
    const profil = profilDuVantail(a, largeur, debut);
    const gondX = gondADroite ? debut + largeur : debut;
    const gond = dedans(pointDeFacade(f, a.x + gondX), recul);
    // Ferme : le vantail court le long de la cloture depuis son gond ; ouvert : le long de la normale.
    const direction = ouvert ? { x: n.x * sens, y: n.y * sens } : gondADroite ? { x: -u.x, y: -u.y } : u;
    const profilPose = gondADroite ? profil.map(p => ({ x: largeur - p.x, y: p.y })).reverse() : profil;
    poser(profilPose, gond, direction, mat);
    if (matPlein) {
      const bas = profilDuVantail({ ...a, forme: 'droit', hauteur: a.hauteur / 3 }, largeur, debut);
      poser(gondADroite ? bas.map(p => ({ x: largeur - p.x, y: p.y })).reverse() : bas, { x: gond.x - n.x * 0.005, y: gond.y - n.y * 0.005 }, direction, matPlein);
    }
    debut += largeur;
  });
}

/** Pose toute la cloture de la parcelle, si elle est active. */
export function ajouterCloture3d(ctx: ContexteCloture3d, parcelle: ObjetPlan | null | undefined): void {
  if (!parcelle || !aDesSommets(parcelle) || parcelle.pts.length < 3) return;
  const cl = clotureDe(parcelle);
  if (!cl.active) return;
  const pts = parcelle.pts;
  const facades = facadesDuContour(pts, 0);
  for (let i = 0; i < pts.length; i++) {
    const f = facadeDuCote(facades, i);
    if (!f) continue;
    const r = reglageDuCote(cl, i);
    if (r.type === 'aucune') continue;
    // L'anneau mitre a l'epaisseur de ce cote : ses deux sommets de ce cote bornent les troncons
    // d'extremite, pour que l'angle se ferme comme avant avec la bande unique.
    const ep = epaisseurDe(r);
    const anneau = safeOffset(pts, ep);
    const interieur = anneau.length === pts.length
      ? (() => {
        const a = au(anneau, i), b = sommetDe(anneau, i + 1);
        const gaucheEstA = Math.hypot(f.gauche.x - au(pts, i).x, f.gauche.y - au(pts, i).y) < 1e-9;
        return gaucheEstA ? { gauche: a, droite: b } : { gauche: b, droite: a };
      })()
      : null;
    for (const t of tronconsDuCote(cl, i, f.largeur)) poserTroncon(ctx, f, r, t, interieur);
  }
  for (const a of cl.portails) {
    if (!coteValide(pts, a.cote)) continue;
    const f = facadeDuCote(facades, a.cote);
    if (!f) continue;
    poserAcces(ctx, f, reglageDuCote(cl, a.cote), a);
  }
}

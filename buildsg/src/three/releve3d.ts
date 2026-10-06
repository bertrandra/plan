// Le releve d'un batiment en 3D : facades photographiees, ouvertures, toit (spec-releve-facade §9).
//
// Le batiment reste le prisme que pose `scene.ts` ; ce module l'habille. Chaque facade relevee
// recoit sa photo redressee sur un plan colle au mur (1 cm devant, pour ne pas disputer la face du
// prisme), chaque ouverture un encadrement en relief, et le toit ses pans et ses pignons au-dessus
// de l'egout. Rien n'est ajoute a un batiment sans releve : la scene d'un plan qui n'en a pas garde
// exactement ses mailles (fumee, point 24 : structure du GLB).

import { au } from '../util/tableaux.js';
import { sommetDe } from '../geometry/anneau.js';
import type * as THREE_NS from 'three';
import type { ObjetPolygone, PtBrut, OuvertureFacade, PartieBasse, Toit } from '../model/types.js';
import { facadesDuContour, pointDeFacade, type Facade } from '../facade/geometrie.js';
import { contourDuMur, egoutEn, volumesDuBatiment, type Volume } from '../facade/profil.js';
import { pointInPolygon } from '../geometry/basic.js';
import { poserEnCouche, COUCHES_SOL } from './primitives.js';
import { facettesToit, trianguler, uvDuPan, COULEUR_TOIT_DEFAUT } from '../facade/toit.js';
import { materiauCouverture } from '../model/couleurToit.js';
import { textureCouverture } from './couverture.js';

/** Ce que la scene prete a ce module : ou ajouter, et comment passer du plan au repere Three. */
export interface ContexteReleve3d {
  /** La scene, ou un groupe pose sur le sol en relief (three/relief3d.ts). */
  scene: THREE_NS.Object3D;
  toLocal: (p: PtBrut) => { x: number; z: number };
  /** Couleur des murs, pour les pignons. */
  couleurMur: string | number;
  /** `false` quand la case « Texture » de la vue 3D est decochee : on garde les formes. */
  textures: boolean;
}

const COULEUR_MENUISERIE = 0xf1eee6;
const COULEUR_VITRE = 0x33414d;
const COULEUR_PORTE = 0x6b4a33;

const DECOLLEMENT = 0.01;
const SECTION_CADRE = 0.06;
const SAILLIE_CADRE = 0.05;

/** Un maillage a partir de sommets 3D et de triangles, normales calculees. */
function maillage(sommets: number[], indices: number[], mat: THREE_NS.Material, uv?: number[]): THREE_NS.Mesh {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(sommets, 3));
  if (uv) geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return new THREE.Mesh(geo, mat);
}

/** Le plan d'un mur, en coordonnees Three : origine au pied gauche, axe `u` vers la droite. */
function repereMur(ctx: ContexteReleve3d, f: Facade) {
  const g = ctx.toLocal(f.gauche),
    d = ctx.toLocal(f.droite);
  const ux = (d.x - g.x) / f.largeur,
    uz = (d.z - g.z) / f.largeur;
  // La normale du plan (nx, ny) devient (nx, -ny) en Three : Y du plan porte sur -Z.
  const nx = f.normale.x,
    nz = -f.normale.y;
  /** Un point du mur : `x` le long du mur depuis la gauche, `y` en hauteur, `s` en saillie. */
  const pt = (x: number, y: number, s: number): [number, number, number] => [g.x + ux * x + nx * s, y, g.z + uz * x + nz * s];
  return { pt, ux, uz };
}

/** Une facade photographiee : son mur, sa texture, et la hauteur que la texture couvre. */
interface Habillage {
  f: Facade;
  mat: THREE_NS.MeshStandardMaterial;
  hauteurTexture: number;
}

/**
 * La photo redressee, plaquee sur le mur jusqu'a l'egout ; le reste de la texture ira au pignon. Un mur
 * en L recoit une photo en L : au-dessus de la partie basse, il n'y a pas de mur.
 */
function plaquerTexture(ctx: ContexteReleve3d, hab: Habillage, hauteur: number, partie: PartieBasse | null) {
  const { pt } = repereMur(ctx, hab.f);
  const L = hab.f.largeur;
  const contour = contourDuMur(L, hauteur, partie);
  const sommets = contour.flatMap((q) => pt(q.x, q.y, DECOLLEMENT));
  const uv = contour.flatMap((q) => [q.x / L, Math.min(1, q.y / hab.hauteurTexture)]);
  const m = maillage(sommets, trianguler(contour).flat(), hab.mat, uv);
  m.name = 'releve-facade';
  ctx.scene.add(m);
}

/**
 * La photo d'un mur dont le segment (a, b) fait partie, et l'abscisse d'un point sur ce mur. Le toit
 * se pose sur la partie haute, dont les sommets ne sont pas numerotes comme le contour : on retrouve le
 * mur par alignement, pas par indice.
 */
function habillageDuSegment(habillages: readonly Habillage[], a: PtBrut, b: PtBrut): { hab: Habillage; x: (q: PtBrut) => number } | null {
  for (const hab of habillages) {
    const f = hab.f;
    const ux = (f.droite.x - f.gauche.x) / f.largeur,
      uy = (f.droite.y - f.gauche.y) / f.largeur;
    const x = (q: PtBrut) => (q.x - f.gauche.x) * ux + (q.y - f.gauche.y) * uy;
    const ecart = (q: PtBrut) => Math.abs((q.x - f.gauche.x) * uy - (q.y - f.gauche.y) * ux);
    const dedans = (q: PtBrut) => x(q) > -0.02 && x(q) < f.largeur + 0.02;
    if (ecart(a) < 0.02 && ecart(b) < 0.02 && dedans(a) && dedans(b)) return { hab, x };
  }
  return null;
}

/** L'encadrement d'une ouverture, et sa vitre ou son vantail quand il n'y a pas de photo. */
function poserOuverture(ctx: ContexteReleve3d, f: Facade, o: OuvertureFacade, avecPhoto: boolean) {
  const { ux, uz, pt } = repereMur(ctx, f);
  const angle = Math.atan2(-uz, ux);
  const mat = new THREE.MeshStandardMaterial({ color: COULEUR_MENUISERIE, roughness: 0.6 });
  const piece = (x: number, y: number, l: number, h: number) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(l, h, SAILLIE_CADRE), mat);
    const [cx, cy, cz] = pt(x + l / 2, y + h / 2, SAILLIE_CADRE / 2);
    m.position.set(cx, cy, cz);
    m.rotation.y = angle;
    ctx.scene.add(m);
  };
  const s = SECTION_CADRE;
  piece(o.x - s, o.y + o.h, o.l + 2 * s, s); // linteau
  piece(o.x - s, o.y, s, o.h); // montant gauche
  piece(o.x + o.l, o.y, s, o.h); // montant droit
  if (o.type === 'fenetre') piece(o.x - s, o.y - s, o.l + 2 * s, s); // appui
  if (!avecPhoto) {
    const plein = o.type === 'porte' || o.type === 'garage';
    const sommets = [...pt(o.x, o.y, DECOLLEMENT * 2), ...pt(o.x + o.l, o.y, DECOLLEMENT * 2), ...pt(o.x + o.l, o.y + o.h, DECOLLEMENT * 2), ...pt(o.x, o.y + o.h, DECOLLEMENT * 2)];
    const m = maillage(
      sommets,
      [0, 1, 2, 0, 2, 3],
      new THREE.MeshStandardMaterial({ color: plein ? COULEUR_PORTE : COULEUR_VITRE, roughness: plein ? 0.8 : 0.15, metalness: plein ? 0 : 0.3 }),
    );
    poserEnCouche(m.material as THREE_NS.Material, COUCHES_SOL.surMur);
    ctx.scene.add(m);
  }
}

/** Les pans du toit et les pignons, au-dessus de l'egout `h`, sur l'emprise `contour`. */
function poserToit(ctx: ContexteReleve3d, contour: PtBrut[], toit: Toit, h: number, habillages: readonly Habillage[]) {
  if (toit.forme === 'plat' || toit.hauteur <= 0) return;
  const { pans, pignons } = facettesToit(contour, toit);
  // Tuiles ou ardoises selon la couverture, teintees de sa couleur (MD/spec-toit-ign.md §6.2).
  const materiau = materiauCouverture(toit);
  const tex = ctx.textures ? textureCouverture(materiau) : null;
  const matToit = new THREE.MeshStandardMaterial({
    color: toit.couleur || COULEUR_TOIT_DEFAUT,
    roughness: materiau === 'ardoise' ? 0.7 : 0.85,
    side: THREE.DoubleSide,
    ...(tex ? { map: tex } : {}),
  });
  pans.forEach((pan) => {
    const sommets: number[] = [];
    pan.contour.forEach((q) => {
      const l = ctx.toLocal(q);
      sommets.push(l.x, h + q.z, l.z);
    });
    const m = maillage(sommets, pan.triangles.flat(), matToit, tex ? uvDuPan(pan.contour) : undefined);
    m.name = 'releve-toit';
    ctx.scene.add(m);
  });
  const matMur = new THREE.MeshStandardMaterial({ color: ctx.couleurMur, side: THREE.DoubleSide });
  pignons.forEach((g) => {
    const a = au(contour, g.cote),
      b = sommetDe(contour, g.cote + 1);
    const L = Math.hypot(b.x - a.x, b.y - a.y);
    // Le pignon est le polygone (d, z) : le bas le long de l'egout, le haut suivant le profil.
    const poly = [{ x: 0, y: 0 }, { x: L, y: 0 }, ...[...g.profil].reverse().filter((q) => q.z > 1e-6).map((q) => ({ x: q.d, y: q.z }))];
    if (poly.length < 3) return;
    const sommets: number[] = [];
    poly.forEach((q) => {
      const t = L > 0 ? q.x / L : 0;
      const l = ctx.toLocal({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
      sommets.push(l.x, h + q.y, l.z);
    });
    // Le pignon d'un mur photographie porte la suite de la photo : il est dans le plan du mur, la
    // bande au-dessus de l'egout l'a redresse a la meme echelle. L'abscisse se lit sur le mur.
    const trouve = habillageDuSegment(habillages, a, b);
    let uv: number[] | undefined;
    if (trouve) {
      const { hab, x } = trouve;
      uv = poly.flatMap((q) => {
        const t = L > 0 ? q.x / L : 0;
        return [x({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }) / hab.f.largeur, Math.min(1, (h + q.y) / hab.hauteurTexture)];
      });
    }
    const m = maillage(sommets, trianguler(poly).flat(), trouve ? trouve.hab.mat : matMur, uv);
    m.name = 'releve-pignon';
    ctx.scene.add(m);
  });
}

/**
 * La hauteur d'egout d'un mur : celle du volume ou il se trouve. Apres un releve en L, les murs de la
 * partie basse (son pignon, son mur arriere) sont moins hauts que le batiment.
 */
function hauteurDuMur(f: Facade, volumes: readonly Volume[]): number {
  const m = pointDeFacade(f, f.largeur / 2);
  const dedans = { x: m.x - f.normale.x * 0.05, y: m.y - f.normale.y * 0.05 };
  const v = volumes.find((x) => pointInPolygon(dedans, x.pts));
  return v ? v.hauteur : au(volumes, 0).hauteur;
}

/** Habille un batiment de son releve. Ne fait rien s'il n'en a pas. */
export function ajouterReleve3d(ctx: ContexteReleve3d, o: ObjetPolygone, h: number): void {
  if (!o.facades?.length && !o.toit) return;
  const volumes = volumesDuBatiment(o.pts, h, o.facades);
  const facades = facadesDuContour(o.pts, h);
  const habillages: Habillage[] = [];
  (o.facades || []).forEach((r) => {
    const f = facades.find((x) => x.cote === r.cote);
    if (!f) return;
    const partie = r.partieBasse ?? null;
    const hMur = partie ? h : hauteurDuMur(f, volumes);
    // Le mur a pu changer depuis le releve (sommet deplace) : la photo s'etire sur sa nouvelle
    // largeur, les ouvertures gardent leur cote depuis la gauche et celles qui sortent sont omises.
    const photo = ctx.textures ? r.texture : null;
    const avecPhoto = !!photo;
    if (photo) {
      const tex = new THREE.TextureLoader().load(photo);
      tex.anisotropy = 4;
      const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9, side: THREE.DoubleSide });
      // 1 cm devant le mur ne suffit pas vu de loin : la photo gagne le test de profondeur (COUCHES_SOL).
      poserEnCouche(mat, COUCHES_SOL.surMur);
      const hab = { f, mat, hauteurTexture: r.hauteurTexture || r.hauteur };
      habillages.push(hab);
      plaquerTexture(ctx, hab, hMur, partie);
    }
    r.ouvertures
      .filter((ov) => ov.x + ov.l <= f.largeur + 0.01 && ov.y + ov.h <= egoutEn(ov.x + ov.l / 2, hMur, partie) + 0.01)
      .forEach((ov) => poserOuverture(ctx, f, ov, avecPhoto));
  });
  // Le toit coiffe la partie haute ; la partie basse garde le toit plat de son prisme.
  if (o.toit) poserToit(ctx, au(volumes, 0).pts, o.toit, h, habillages);
}


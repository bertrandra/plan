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
import type { ObjetPolygone, PtBrut, OuvertureFacade } from '../model/types.js';
import { facadesDuContour, type Facade } from '../facade/geometrie.js';
import { facettesToit, trianguler, COULEUR_TOIT_DEFAUT } from '../facade/toit.js';

/** Ce que la scene prete a ce module : ou ajouter, et comment passer du plan au repere Three. */
export interface ContexteReleve3d {
  scene: THREE_NS.Scene;
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

/** La photo redressee, plaquee sur le mur jusqu'a l'egout ; le reste de la texture ira au pignon. */
function plaquerTexture(ctx: ContexteReleve3d, hab: Habillage, hauteur: number) {
  const { pt } = repereMur(ctx, hab.f);
  const L = hab.f.largeur;
  const v = Math.min(1, hauteur / hab.hauteurTexture);
  const m = maillage([...pt(0, 0, DECOLLEMENT), ...pt(L, 0, DECOLLEMENT), ...pt(L, hauteur, DECOLLEMENT), ...pt(0, hauteur, DECOLLEMENT)], [0, 1, 2, 0, 2, 3], hab.mat, [0, 0, 1, 0, 1, v, 0, v]);
  m.name = 'releve-facade';
  ctx.scene.add(m);
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
    ctx.scene.add(m);
  }
}

/** Les pans du toit et les pignons, au-dessus de l'egout `h`. */
function poserToit(ctx: ContexteReleve3d, o: ObjetPolygone, h: number, habillages: Map<number, Habillage>) {
  const toit = o.toit;
  if (!toit || toit.forme === 'plat' || toit.hauteur <= 0) return;
  const { pans, pignons } = facettesToit(o.pts, toit);
  const matToit = new THREE.MeshStandardMaterial({ color: toit.couleur || COULEUR_TOIT_DEFAUT, roughness: 0.85, side: THREE.DoubleSide });
  pans.forEach((pan) => {
    const sommets: number[] = [];
    pan.contour.forEach((q) => {
      const l = ctx.toLocal(q);
      sommets.push(l.x, h + q.z, l.z);
    });
    const m = maillage(sommets, pan.triangles.flat(), matToit);
    m.name = 'releve-toit';
    ctx.scene.add(m);
  });
  const matMur = new THREE.MeshStandardMaterial({ color: ctx.couleurMur, side: THREE.DoubleSide });
  pignons.forEach((g) => {
    const a = au(o.pts, g.cote),
      b = sommetDe(o.pts, g.cote + 1);
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
    // bande au-dessus de l'egout l'a redresse a la meme echelle. Abscisse depuis la gauche vue de
    // dehors, qui est `a` ou `b` selon le sens du contour.
    const hab = habillages.get(g.cote);
    let uv: number[] | undefined;
    if (hab) {
      const depuisA = Math.hypot(hab.f.gauche.x - a.x, hab.f.gauche.y - a.y) < 1e-6;
      uv = poly.flatMap((q) => [(depuisA ? q.x : L - q.x) / L, Math.min(1, (h + q.y) / hab.hauteurTexture)]);
    }
    const m = maillage(sommets, trianguler(poly).flat(), hab ? hab.mat : matMur, uv);
    m.name = 'releve-pignon';
    ctx.scene.add(m);
  });
}

/** Habille un batiment de son releve. Ne fait rien s'il n'en a pas. */
export function ajouterReleve3d(ctx: ContexteReleve3d, o: ObjetPolygone, h: number): void {
  if (!o.facades?.length && !o.toit) return;
  const facades = facadesDuContour(o.pts, h);
  const habillages = new Map<number, Habillage>();
  (o.facades || []).forEach((r) => {
    const f = facades.find((x) => x.cote === r.cote);
    if (!f) return;
    // Le mur a pu changer depuis le releve (sommet deplace) : la photo s'etire sur sa nouvelle
    // largeur, les ouvertures gardent leur cote depuis la gauche et celles qui sortent sont omises.
    const photo = ctx.textures ? r.texture : null;
    const avecPhoto = !!photo;
    if (photo) {
      const tex = new THREE.TextureLoader().load(photo);
      tex.anisotropy = 4;
      const hab = { f, mat: new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9, side: THREE.DoubleSide }), hauteurTexture: r.hauteurTexture || r.hauteur };
      habillages.set(r.cote, hab);
      plaquerTexture(ctx, hab, h);
    }
    r.ouvertures.filter((ov) => ov.x + ov.l <= f.largeur + 0.01 && ov.y + ov.h <= h + 0.01).forEach((ov) => poserOuverture(ctx, f, ov, avecPhoto));
  });
  if (o.toit) poserToit(ctx, o, h, habillages);
}


// Le gazon de la parcelle du projet en 3D.
//
// Une pelouse vue d'en haut n'est pas un aplat vert : des milliers de brins, chacun de sa nuance,
// plus sombres a la base et plus clairs a la pointe, une sous-couche de terre et de feutre la ou ils
// s'ecartent, quelques brins secs. La texture est dessinee, pas telechargee (comme les murs,
// three/textureMur.ts) : la Vue 3D l'a sans reseau et l'export GLB l'emporte. Elle se raccorde a
// elle-meme sur ses quatre bords et couvre TAILLE_GAZON_M metres.
//
// Une texture qui se repete se voit sur trente metres de pelouse : les sommets du maillage portent
// une couleur qui varie lentement (des zones plus jaunes, plus sombres, tous les dix metres environ),
// qui teinte la texture et casse la repetition.
//
// Le maillage suit exactement le contour de la parcelle, coupe en mailles d'un metre : sur un sol
// en relief, chaque sommet prend la hauteur du sol, et la pelouse epouse la pente.
//
// L'herbe s'arrete la ou un objet occupe le sol (`occupeLeSol`, model/fonctions.ts) : le maillage
// est perce de leurs empreintes (`empreintesAuSol`). Avant, elle passait sous tout et ne comptait
// que sur le tampon de gabarit pour s'effacer du bassin d'une piscine ; or la qualite Soignee rend
// la scene dans une cible sans gabarit (l'occlusion, three/rendu.ts), et l'herbe remplissait l'eau.
// Elle se voyait aussi entre les lames d'une terrasse, et percait un chemin pose sur un sol bombe.

import type * as THREE_NS from 'three';
import { clipPolygonByConvex, polygonOffset } from '../geometry/polygon.js';
import { differencePolygones } from '../geometry/difference.js';
import { pointInPolygon, signedArea } from '../geometry/basic.js';
import { occupeLeSol, estPiscine } from '../model/fonctions.js';
import { calculerPiscine } from '../engine/piscine.js';
import type { ObjetPlan, PtBrut } from '../model/types.js';
import { cerclePoly, type VersLocal } from './primitives.js';
import { echantillonnerTrace } from '../geometry/courbe.js';
import { ribbonChemin } from '../geometry/ruban.js';
import { largeurChemin } from '../model/ouvrages/index.js';

/** Le cote de la texture en pixels, et ce qu'elle couvre en metres (1,5 mm par pixel : un brin fait 4 a 10 pixels de long). */
export const COTE_TEXTURE_GAZON = 1024;
export const TAILLE_GAZON_M = 1.5;
/** La maille du gazon : assez fine pour suivre le relief, assez large pour une grande parcelle. */
export const PAS_GAZON_M = 1;
/** La periode des variations de teinte, en metres. */
const PERIODE_TEINTE_M = 9;

/** Un tirage reproductible : la meme pelouse d'une ouverture a l'autre, et dans les captures. */
function tirage(graine: number): () => number {
  let s = graine;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

/** Un bruit de valeur periodique (periode `n` cellules sur le cote), lisse, entre 0 et 1. */
function bruitPeriodique(n: number, graine: number): (x: number, y: number) => number {
  const rnd = tirage(graine);
  const g = Array.from({ length: n * n }, () => rnd());
  const lisse = (t: number) => t * t * (3 - 2 * t);
  return (x, y) => {
    const fx = x * n, fy = y * n, i = Math.floor(fx), j = Math.floor(fy), tx = lisse(fx - i), ty = lisse(fy - j);
    const v = (a: number, b: number) => g[(((b % n) + n) % n) * n + (((a % n) + n) % n)] as number;
    const h0 = v(i, j) + (v(i + 1, j) - v(i, j)) * tx, h1 = v(i, j + 1) + (v(i + 1, j + 1) - v(i, j + 1)) * tx;
    return h0 + (h1 - h0) * ty;
  };
}

/** Une couleur HSL (teinte en degres, saturation et clarte entre 0 et 1) en RGB entre 0 et 1. */
function hsl(h: number, s: number, l: number): [number, number, number] {
  const c = (1 - Math.abs(2 * l - 1)) * s, hp = (((h % 360) + 360) % 360) / 60, x = c * (1 - Math.abs((hp % 2) - 1));
  const [r, g, b] = hp < 1 ? [c, x, 0] : hp < 2 ? [x, c, 0] : hp < 3 ? [0, c, x] : hp < 4 ? [0, x, c] : hp < 5 ? [x, 0, c] : [c, 0, x];
  const m = l - c / 2;
  return [r + m, g + m, b + m];
}

/**
 * Les pixels (RGBA a plat) de la texture du gazon, `cote` pixels de cote. Trois couches : la terre
 * et le feutre, des brins du fond (sombres, dans l'ombre des autres), des brins du dessus (clairs).
 */
export function pixelsGazon(cote = COTE_TEXTURE_GAZON): Uint8ClampedArray {
  const n = cote * cote;
  const R = new Float32Array(n), G = new Float32Array(n), B = new Float32Array(n);
  const echelle = cote / COTE_TEXTURE_GAZON;
  // La sous-couche : une terre brune et un feutre olive, en taches.
  const fond = bruitPeriodique(16, 3), grain = bruitPeriodique(128, 5);
  for (let y = 0; y < cote; y++) for (let x = 0; x < cote; x++) {
    const k = y * cote + x, t = fond(x / cote, y / cote), gr = grain(x / cote, y / cote);
    const [r, g, b] = hsl(55 + 30 * t, 0.35 + 0.15 * gr, 0.13 + 0.06 * gr);
    R[k] = r; G[k] = g; B[k] = b;
  }
  const rnd = tirage(17);
  // Les zones ou l'herbe est plus dense, plus jaune : a l'echelle d'une touffe, dans la texture.
  const touffes = bruitPeriodique(6, 11);
  /** Pose un disque antialiase de rayon `r` au point (x, y), raccorde au bord. */
  const disque = (cx: number, cy: number, r: number, c: [number, number, number], opacite: number) => {
    const x0 = Math.floor(cx - r - 0.5), x1 = Math.ceil(cx + r + 0.5), y0 = Math.floor(cy - r - 0.5), y1 = Math.ceil(cy + r + 0.5);
    // Le raccord au bord (modulo) ne coute que pres des bords.
    const bord = x0 < 0 || y0 < 0 || x1 >= cote || y1 >= cote, lim = (r + 0.5) * (r + 0.5);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const d2 = (x - cx) * (x - cx) + (y - cy) * (y - cy);
      if (d2 >= lim) continue;
      const a = Math.min(1, r + 0.5 - Math.sqrt(d2)) * opacite;
      const k = bord ? (((y % cote) + cote) % cote) * cote + (((x % cote) + cote) % cote) : y * cote + x;
      R[k] = (R[k] as number) * (1 - a) + c[0] * a;
      G[k] = (G[k] as number) * (1 - a) + c[1] * a;
      B[k] = (B[k] as number) * (1 - a) + c[2] * a;
    }
  };
  // Les brins, du fond vers le dessus : la profondeur fixe leur clarte (le fond est a l'ombre).
  const nombre = Math.round(n * 0.11);
  for (let i = 0; i < nombre; i++) {
    const profondeur = i / nombre;
    const x = rnd() * cote, y = rnd() * cote;
    const angle = rnd() * Math.PI * 2;
    const longueur = (4 + 7 * rnd()) * echelle * (0.7 + 0.5 * profondeur);
    const largeur = (1 + 0.9 * rnd()) * echelle;
    const sec = rnd() < 0.05;
    const touffe = touffes(x / cote, y / cote);
    const teinte = sec ? 48 + 10 * rnd() : 82 + 22 * rnd() - 8 * touffe;
    const saturation = sec ? 0.35 + 0.15 * rnd() : 0.38 + 0.25 * rnd();
    const clarte = (sec ? 0.4 : 0.18) + 0.22 * profondeur + 0.06 * (rnd() - 0.5);
    const pas = 0.7, etapes = Math.max(2, Math.ceil(longueur / pas));
    // Plus sombre a la base, plus clair et plus fin a la pointe : deux couleurs, melangees le long du brin.
    const base = hsl(teinte, saturation, clarte * 0.75), pointe = hsl(teinte - 4, saturation * 0.9, Math.min(0.62, clarte * 1.25));
    // Un brin se courbe un peu : la direction tourne le long du brin.
    const courbure = (rnd() - 0.5) * 0.08, ca = Math.cos(courbure), sa = Math.sin(courbure);
    let px = x, py = y, ex = Math.cos(angle), ey = Math.sin(angle);
    for (let e = 0; e <= etapes; e++) {
      const t = e / etapes;
      disque(px, py, (largeur / 2) * (1 - 0.75 * t),
        [base[0] + (pointe[0] - base[0]) * t, base[1] + (pointe[1] - base[1]) * t, base[2] + (pointe[2] - base[2]) * t], 0.9);
      [ex, ey] = [ex * ca - ey * sa, ex * sa + ey * ca];
      px += ex * pas; py += ey * pas;
    }
  }
  const px = new Uint8ClampedArray(n * 4);
  for (let k = 0; k < n; k++) {
    px[4 * k] = Math.round(255 * (R[k] as number));
    px[4 * k + 1] = Math.round(255 * (G[k] as number));
    px[4 * k + 2] = Math.round(255 * (B[k] as number));
    px[4 * k + 3] = 255;
  }
  return px;
}

let cache: THREE_NS.Texture | null = null;

/** La texture du gazon, ou `null` sans canevas (tests, environnement sans DOM). */
export function textureGazon(): THREE_NS.Texture | null {
  if (cache) return cache;
  if (typeof document === 'undefined' || typeof THREE === 'undefined' || !THREE.CanvasTexture) return null;
  const canevas = document.createElement('canvas');
  canevas.width = canevas.height = COTE_TEXTURE_GAZON;
  const c2d = canevas.getContext('2d');
  if (!c2d || typeof c2d.createImageData !== 'function' || typeof c2d.putImageData !== 'function') return null;
  const img = c2d.createImageData(COTE_TEXTURE_GAZON, COTE_TEXTURE_GAZON);
  img.data.set(pixelsGazon());
  c2d.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canevas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  // Les coordonnees du maillage sont en metres : une texture couvre TAILLE_GAZON_M metres.
  tex.repeat.set(1 / TAILLE_GAZON_M, 1 / TAILLE_GAZON_M);
  tex.anisotropy = 8;
  cache = tex;
  return tex;
}

/** Un bruit de valeur sur tout le plan (non periodique), lisse, entre -0,5 et 0,5. */
function bruitMonde(x: number, y: number, graine: number): number {
  const h = (i: number, j: number) => {
    let v = Math.imul(i, 374761393) ^ Math.imul(j, 668265263) ^ Math.imul(graine, 1442695041);
    v = Math.imul(v ^ (v >>> 13), 1274126177);
    return ((v ^ (v >>> 16)) >>> 0) / 4294967295;
  };
  const i = Math.floor(x), j = Math.floor(y), tx = x - i, ty = y - j;
  const lx = tx * tx * (3 - 2 * tx), ly = ty * ty * (3 - 2 * ty);
  const a = h(i, j) + (h(i + 1, j) - h(i, j)) * lx, b = h(i, j + 1) + (h(i + 1, j + 1) - h(i, j + 1)) * lx;
  return a + (b - a) * ly - 0.5;
}

/**
 * La teinte d'un point de la pelouse, qui multiplie la texture : des zones plus claires ou plus
 * sombres, plus jaunes ou plus vertes, a l'echelle d'une dizaine de metres.
 */
export function teinteGazon(p: PtBrut): [number, number, number] {
  const u = p.x / PERIODE_TEINTE_M, v = p.y / PERIODE_TEINTE_M;
  const clair = 0.62 * bruitMonde(u, v, 1) + 0.38 * bruitMonde(u * 2.7, v * 2.7, 2);
  const jaune = bruitMonde(u * 0.8 + 17, v * 0.8 + 5, 3);
  const k = 1 + 0.22 * clair;
  return [k * (1 + 0.16 * jaune), k * (1 + 0.04 * jaune), k * (1 - 0.14 * jaune)];
}

/**
 * Ce dont l'herbe se retire sous chaque objet : l'empreinte est rentree de quelques centimetres,
 * pour que le bord de l'objet recouvre celui de la pelouse plutot que de laisser voir le sol entre
 * les deux — deux maillages qui suivent le relief chacun a sa facon ne se raccordent pas au millimetre.
 */
export const RETRAIT_EMPREINTE_M = 0.03;

/** Un contour rentre de `d` metres, ou tel quel si le retrait le retourne (un objet plus etroit que 2 d). */
function rentrer(pts: readonly PtBrut[], d: number): PtBrut[] {
  const r = polygonOffset(pts as PtBrut[], d);
  const ok = r.length >= 3 && r.every(p => Number.isFinite(p.x) && Number.isFinite(p.y)) && Math.sign(signedArea(r)) === Math.sign(signedArea(pts));
  return ok ? r : pts.slice();
}

/**
 * Les empreintes au sol des objets du plan, en coordonnees du plan, rentrees de `RETRAIT_EMPREINTE_M` :
 * une seule regle pour tous (`occupeLeSol`). Une piscine couvre son bassin, ses margelles et sa
 * plage ; un chemin, son ruban a sa largeur ; un cercle, son disque ; un polygone, son contour.
 * `masque` : un objet masque dans la Vue 3D n'y est pas dessine, l'herbe reste.
 */
export function empreintesAuSol(objets: ObjetPlan[], masque: (o: ObjetPlan) => boolean = (o) => !!o.hidden): PtBrut[][] {
  const out: PtBrut[][] = [];
  objets.forEach((o) => {
    if (!occupeLeSol(o) || masque(o)) return;
    if (estPiscine(o)) {
      const calc = calculerPiscine(o, objets);
      if (calc) out.push(rentrer(calc.plageExt, RETRAIT_EMPREINTE_M));
      return;
    }
    if (o.type === 'path') {
      const ruban = o.pts.length >= 2 ? ribbonChemin(echantillonnerTrace(o.pts, o.curve), Math.max(0.02, largeurChemin(o) - 2 * RETRAIT_EMPREINTE_M)) : null;
      if (ruban) out.push(ruban);
      return;
    }
    if (o.type === 'circle') {
      if (o.r > RETRAIT_EMPREINTE_M) out.push(cerclePoly(o.center, o.r - RETRAIT_EMPREINTE_M));
      return;
    }
    if (o.pts.length >= 3) out.push(rentrer(o.pts, RETRAIT_EMPREINTE_M));
  });
  return out;
}

interface Boite { x0: number; y0: number; x1: number; y1: number }
const boiteDe = (pts: readonly PtBrut[]): Boite => {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  pts.forEach(p => { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); });
  return { x0, y0, x1, y1 };
};
const seCroisent = (a: Boite, b: Boite): boolean => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

/** Les triangles d'un morceau de maille, prive des empreintes qui le touchent. */
function trianglesPerces(morceau: PtBrut[], trous: readonly PtBrut[][]): PtBrut[][] {
  const out: PtBrut[][] = [];
  differencePolygones(morceau, trous as PtBrut[][]).forEach(({ contour, trous: anneaux }) => {
    const points = contour.concat(...anneaux);
    const indices = THREE.ShapeUtils.triangulateShape(contour.map(q => new THREE.Vector2(q.x, q.y)), anneaux.map(a => a.map(q => new THREE.Vector2(q.x, q.y))));
    indices.forEach((tri) => {
      const t = tri.map(k => points[k]);
      if (t.length !== 3 || !t.every((s): s is PtBrut => !!s)) return;
      // Garde-fou : deux empreintes qui se chevauchent dans une meme maille ne sont pas fusionnees
      // (geometry/difference.ts) ; un triangle dont le centre tombe dans l'une d'elles ne reste pas.
      const [p0, p1, p2] = t as [PtBrut, PtBrut, PtBrut];
      const c = { x: (p0.x + p1.x + p2.x) / 3, y: (p0.y + p1.y + p2.y) / 3 };
      if (!trous.some(e => pointInPolygon(c, e))) out.push(t);
    });
  });
  return out;
}

/**
 * Les triangles d'un polygone coupe en mailles carrees de `pas` metres, dans le repere du plan : les
 * mailles entieres en deux triangles, celles du bord coupees au contour. Les lignes passent par
 * `origine` : sur un sol en relief, ce sont celles de sa grille, et les deux triangles d'une maille
 * ont la meme diagonale que ceux du sol (sud-ouest, nord-est) — le gazon le recouvre exactement, sans
 * que le sol perce entre deux sommets. `trous` : les empreintes ou l'herbe ne pousse pas ; seules
 * les mailles qu'elles touchent sont recalculees.
 */
export function maillesDuPolygone(poly: readonly PtBrut[], pas = PAS_GAZON_M, origine: PtBrut = { x: 0, y: 0 }, trous: readonly PtBrut[][] = []): PtBrut[][] {
  const xs = poly.map(p => p.x), ys = poly.map(p => p.y);
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  xs.forEach(x => { x0 = Math.min(x0, x); x1 = Math.max(x1, x); });
  ys.forEach(y => { y0 = Math.min(y0, y); y1 = Math.max(y1, y); });
  const triangles: PtBrut[][] = [];
  const contour = poly as PtBrut[];
  const boitePoly = { x0, y0, x1, y1 };
  const empreintes = trous.filter(t => t.length >= 3).map(t => ({ t, b: boiteDe(t) })).filter(e => seCroisent(e.b, boitePoly));
  for (let i = Math.floor((x0 - origine.x) / pas); origine.x + i * pas < x1; i++) for (let j = Math.floor((y0 - origine.y) / pas); origine.y + j * pas < y1; j++) {
    const a = { x: origine.x + i * pas, y: origine.y + j * pas }, b = { x: a.x + pas, y: a.y }, c = { x: a.x + pas, y: a.y + pas }, d = { x: a.x, y: a.y + pas };
    const coins = [a, b, c, d];
    const dedans = coins.every(q => pointInPolygon(q, contour));
    const traverse = poly.some(q => q.x > a.x && q.x < c.x && q.y > a.y && q.y < c.y);
    const touches = empreintes.filter(e => seCroisent(e.b, { x0: a.x, y0: a.y, x1: c.x, y1: c.y })).map(e => e.t);
    if (dedans && !traverse && !touches.length) { triangles.push([a, b, c], [a, c, d]); continue; }
    const morceau = dedans && !traverse ? coins : clipPolygonByConvex(contour, coins);
    if (morceau.length < 3) continue;
    if (touches.length) { triangles.push(...trianglesPerces(morceau, touches)); continue; }
    const indices = THREE.ShapeUtils.triangulateShape(morceau.map(q => new THREE.Vector2(q.x, q.y)), []);
    indices.forEach((tri) => {
      const t = tri.map(k => morceau[k]);
      if (t.length === 3 && t.every((s): s is PtBrut => !!s)) triangles.push(t);
    });
  }
  return triangles;
}

/**
 * La geometrie du gazon d'une parcelle : ses triangles poses sur le sol (`sol`, absent : a plat),
 * `decalage` au-dessus, les coordonnees de texture en metres, la teinte lente dans les couleurs des
 * sommets. `trous` : les empreintes au sol des objets (`empreintesAuSol`), ou l'herbe s'arrete.
 */
export function geometrieGazon(poly: readonly PtBrut[], versLocal: VersLocal, sol?: (p: PtBrut) => number, decalage = 0.004,
  grille?: { pas: number; x0: number; y0: number }, trous: readonly PtBrut[][] = []): THREE_NS.BufferGeometry {
  const positions: number[] = [], uv: number[] = [], couleurs: number[] = [];
  // Sur un sol en relief, les mailles du gazon sont exactement celles du sol : plus larges, le sol
  // perce entre leurs sommets ; plus fines, elles ne suivraient rien de plus.
  const pas = grille ? grille.pas : PAS_GAZON_M;
  maillesDuPolygone(poly, pas, grille ? { x: grille.x0, y: grille.y0 } : undefined, trous).forEach(t => {
    const [p0, p1, p2] = t as [PtBrut, PtBrut, PtBrut];
    // Vu du ciel, le triangle doit tourner dans le sens qui donne une normale vers le haut : le plan
    // a le nord en +y, la 3D en -z, et le sens trigonometrique du plan reste celui vu d'en haut.
    const aire = (p1.x - p0.x) * (p2.y - p0.y) - (p2.x - p0.x) * (p1.y - p0.y);
    (aire > 0 ? [p0, p1, p2] : [p0, p2, p1]).forEach(p => {
      const l = versLocal(p);
      positions.push(l.x, (sol ? sol(p) : 0) + decalage, l.z);
      uv.push(p.x, p.y);
      couleurs.push(...teinteGazon(p));
    });
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(couleurs, 3));
  geo.computeVertexNormals();
  return geo;
}

/** Le materiau du gazon : la texture, teintee par les sommets, mate, avec le relief de ses brins sous le soleil. */
export function materiauGazon(): THREE_NS.MeshStandardMaterial {
  const tex = textureGazon();
  return new THREE.MeshStandardMaterial({
    color: 0xffffff, vertexColors: true, roughness: 0.95, metalness: 0, side: THREE.DoubleSide,
    ...(tex ? { map: tex, bumpMap: tex, bumpScale: 0.04 } : { color: 0x5f7f3a })
  });
}

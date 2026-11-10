// Le jardin dans la Vue 3D (lot L3) : la vegetation basse d'un massif plante ou d'une plate-bande, son mini-arbre, et les
// equipements du jardin (le regard en plaque au ras du sol, l'eclairage et le robinet sur leur pied).
//
// La vegetation est **dessinee par defaut** sur tout massif qui porte une plantation (model/jardin.ts) : des plantes basses et des
// fleurs semees dans le contour, en instances (une `InstancedMesh` pour le feuillage, une pour les fleurs : deux appels de dessin
// par massif, quel que soit le nombre de plantes). Le semis est **tire de la cle de l'objet** : le meme massif pousse toujours de
// la meme facon, d'une ouverture a l'autre, il ne tremble jamais.
//
// La densite suit le niveau de qualite de l'appareil (three/qualite.ts) a l'ecran seulement : un niveau ne doit pas changer un
// export. La maille de l'ecran est donc hors export, et une maille a la densite de reference (Normale), invisible, part seule dans
// le .glb (EXPORT_SEULEMENT, comme les carreaux et le gazon). Un massif sans sous-objet (une haie de l'IGN, un ancien fichier)
// reste le bloc d'avant : rien de ce module ne s'y pose, et les empreintes ne bougent pas.

import type * as THREE_NS from 'three';
import { pointInPolygon } from '../geometry/basic.js';
import { graineDe, tirage } from '../model/voisinage3d.js';
import { especeParId, especesChargees } from '../model/especesArbre.js';
import { HAUTEUR_MINI_ARBRE_MAX_M } from '../model/jardin.js';
import type { NatureEquipement, ObjetPlan, Plantation, PtBrut, TypePlantation } from '../model/types.js';
import type { Qualite3d } from './qualite.js';
import { ajouterArbre3d } from './arbre3d.js';
import { EXPORT_SEULEMENT, HORS_EXPORT, SANS_OMBRE, type VersLocal } from './primitives.js';

export const NOM_FEUILLAGE_BAS = 'jardin-feuillage';
export const NOM_FLEURS = 'jardin-fleurs';
export const NOM_GROUPE_PLANTES = 'jardin-plantes';
/** Le groupe qui porte le mini-arbre d'un massif, a la hauteur de son dessus. */
export const NOM_MINI_ARBRE = 'jardin-mini-arbre';

/** Le facteur de densite de chaque niveau ; la reference (Normale) est celle de l'export. */
export const DENSITE_QUALITE: Readonly<Record<Qualite3d, number>> = { econome: 0.4, normale: 1, soignee: 1.6 };
/** Au plus autant de plantes, et autant de fleurs, par massif : un grand massif ne fige pas un telephone. */
export const PLANTES_MAX = 600;

/** Ce que pousse chaque contenu, par metre carre a la densite de reference : le feuillage, ses tailles, et les fleurs. */
interface Pousse { feuillage: number; largeur: [number, number]; hauteur: [number, number]; fleurs: number; rangs?: number }
export const POUSSES: Readonly<Record<TypePlantation, Pousse>> = {
  fleurs: { feuillage: 6, largeur: [0.3, 0.45], hauteur: [0.22, 0.38], fleurs: 10 },
  vivaces: { feuillage: 4, largeur: [0.35, 0.55], hauteur: [0.35, 0.6], fleurs: 4 },
  arbustes: { feuillage: 1.3, largeur: [0.6, 1.0], hauteur: [0.55, 1.0], fleurs: 0 },
  mixte: { feuillage: 3, largeur: [0.3, 0.85], hauteur: [0.3, 0.85], fleurs: 5 },
  // Des rangs tous les 50 cm, un plant tous les 35 cm : un potager se reconnait a ses lignes.
  // Une haie ne seme rien (un volume vert) ; ses valeurs ne servent qu'a qui la dessinerait en plantes.
  haie: { feuillage: 1.3, largeur: [0.6, 1.0], hauteur: [0.55, 1.0], fleurs: 0 },
  potager: { feuillage: 0, largeur: [0.22, 0.32], hauteur: [0.15, 0.3], fleurs: 0, rangs: 0.5 },
};

/** Les verts du feuillage et les couleurs des fleurs : un tirage par plante. */
const VERTS = [0x3f6e2f, 0x4f7f36, 0x5c8a3c, 0x365f2a, 0x6b9446];
const FLEURS = [0xd8434f, 0xf2c53d, 0xe58fb6, 0xf4f1ea, 0x8a63c9, 0xef8a3b];

/** Une plante ou une fleur : sa place dans le plan, sa hauteur au-dessus du dessus du massif, sa taille et sa couleur. */
export interface Instance { x: number; y: number; z: number; l: number; h: number; couleur: number }

/** La boite d'un contour. */
function boite(pts: readonly PtBrut[]) {
  const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
  return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
}

/** L'aire d'un contour (formule du lacet), en metres carres. */
function aire(pts: readonly PtBrut[]): number {
  let s = 0;
  for (let i = 0; i < pts.length; i++) { const a = pts[i] as PtBrut, b = pts[(i + 1) % pts.length] as PtBrut; s += a.x * b.y - b.x * a.y; }
  return Math.abs(s) / 2;
}

/**
 * Le semis d'un massif, pur et reproductible : les plantes et les fleurs semees dans `contour` (le plan, en metres), tirees de
 * `cle`, a la densite `densite` (1 : la reference). Une plante reste a une demi-largeur du bord, pour ne pas deborder du massif.
 */
export function semis(cle: string, contour: readonly PtBrut[], contenu: TypePlantation, densite: number): { feuillage: Instance[]; fleurs: Instance[] } {
  const p = POUSSES[contenu];
  const hasard = tirage(graineDe(cle + ':' + contenu));
  const entre = (a: [number, number]) => a[0] + (a[1] - a[0]) * hasard();
  const b = boite(contour);
  const s = aire(contour);
  const feuillage: Instance[] = [], fleurs: Instance[] = [];
  if (contour.length < 3 || !(s > 0)) return { feuillage, fleurs };
  const dedans = (x: number, y: number) => pointInPolygon({ x, y }, contour as PtBrut[]);
  if (p.rangs) {
    // Le potager : des rangs paralleles au grand cote de sa boite, un plant tous les 35 cm (la densite espace les plants).
    const pas = 0.35 / Math.max(0.3, Math.sqrt(densite));
    const enX = b.x1 - b.x0 >= b.y1 - b.y0;
    const [u0, u1, v0, v1] = enX ? [b.x0, b.x1, b.y0, b.y1] : [b.y0, b.y1, b.x0, b.x1];
    for (let v = v0 + p.rangs / 2; v < v1 && feuillage.length < PLANTES_MAX; v += p.rangs) {
      for (let u = u0 + pas / 2; u < u1 && feuillage.length < PLANTES_MAX; u += pas) {
        const [x, y] = enX ? [u, v] : [v, u];
        if (!dedans(x, y)) continue;
        feuillage.push({ x, y, z: 0, l: entre(p.largeur), h: entre(p.hauteur), couleur: VERTS[Math.floor(hasard() * VERTS.length)] ?? 0x4f7f36 });
      }
    }
    return { feuillage, fleurs };
  }
  const tirer = (n: number, f: (x: number, y: number) => boolean) => {
    // Un tirage dans la boite, garde s'il tombe dans le contour : le nombre d'essais est borne, un contour tres creux en garde moins.
    for (let essais = 0, poses = 0; poses < n && essais < n * 12; essais++) {
      const x = b.x0 + (b.x1 - b.x0) * hasard(), y = b.y0 + (b.y1 - b.y0) * hasard();
      if (dedans(x, y) && f(x, y)) poses++;
    }
  };
  tirer(Math.min(PLANTES_MAX, Math.round(s * p.feuillage * densite)), (x, y) => {
    // La plante entiere dans le massif : les quatre bords de son houppier dans le contour (sinon un autre tirage).
    const l = entre(p.largeur), d = l / 2;
    if (![[d, 0], [-d, 0], [0, d], [0, -d]].every(([dx, dy]) => dedans(x + (dx as number), y + (dy as number)))) return false;
    feuillage.push({ x, y, z: 0, l, h: entre(p.hauteur), couleur: VERTS[Math.floor(hasard() * VERTS.length)] ?? 0x4f7f36 });
    return true;
  });
  tirer(Math.min(PLANTES_MAX, Math.round(s * p.fleurs * densite)), (x, y) => {
    const l = 0.09 + 0.05 * hasard();
    fleurs.push({ x, y, z: p.hauteur[0] + (p.hauteur[1] - p.hauteur[0]) * hasard(), l, h: l * 0.7, couleur: FLEURS[Math.floor(hasard() * FLEURS.length)] ?? 0xd8434f });
    return true;
  });
  return { feuillage, fleurs };
}

// Les materiaux sont partages par tous les massifs ; les formes (un buisson a facettes et une fleur, d'un metre, mis a l'echelle
// par instance) sont propres a chaque massif : retirer un objet de la scene libere ses geometries (three/sceneVivante.ts).
let materiaux: { feuillage: THREE_NS.Material; fleurs: THREE_NS.Material } | null = null;
function formes() {
  materiaux ??= {
    feuillage: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, flatShading: true }),
    fleurs: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7 }),
  };
  const buisson = new THREE.IcosahedronGeometry(0.5, 0);
  buisson.translate(0, 0.5, 0);
  return { buisson, fleur: new THREE.OctahedronGeometry(0.5, 0), matFeuillage: materiaux.feuillage, matFleurs: materiaux.fleurs };
}

/** Un lot d'instances : une matrice et une couleur par plante, dans le repere local de la scene, au-dessus de `y0`. */
function lot(nom: string, geo: THREE_NS.BufferGeometry, mat: THREE_NS.Material, liste: readonly Instance[], versLocal: VersLocal, y0: number): THREE_NS.InstancedMesh {
  const m = new THREE.InstancedMesh(geo, mat, liste.length);
  m.name = nom;
  const matrice = new THREE.Matrix4(), q = new THREE.Quaternion(), axe = new THREE.Vector3(0, 1, 0), pos = new THREE.Vector3(), ech = new THREE.Vector3(), c = new THREE.Color();
  liste.forEach((it, i) => {
    const l = versLocal({ x: it.x, y: it.y });
    // Un quart de tour tire de la place : deux plantes voisines ne se presentent pas de la meme face.
    q.setFromAxisAngle(axe, ((it.x * 7.31 + it.y * 3.17) % 6.283));
    matrice.compose(pos.set(l.x, y0 + it.z, l.z), q, ech.set(it.l, it.h, it.l));
    m.setMatrixAt(i, matrice);
    m.setColorAt(i, c.setHex(it.couleur));
  });
  m.instanceMatrix.needsUpdate = true;
  if (m.instanceColor) m.instanceColor.needsUpdate = true;
  m.computeBoundingSphere();
  return m;
}

/** Les deux lots d'un semis (feuillage, fleurs), dans un groupe ; marque hors export ou export seul. */
function groupeDuSemis(s: ReturnType<typeof semis>, versLocal: VersLocal, y0: number, marque: string): THREE_NS.Group {
  const f = formes();
  const g = new THREE.Group();
  g.name = NOM_GROUPE_PLANTES;
  if (s.feuillage.length) g.add(lot(NOM_FEUILLAGE_BAS, f.buisson, f.matFeuillage, s.feuillage, versLocal, y0));
  if (s.fleurs.length) {
    const fl = lot(NOM_FLEURS, f.fleur, f.matFleurs, s.fleurs, versLocal, y0);
    // Des fleurs de quelques centimetres : leur ombre ne se voit pas et coute une passe de plus.
    fl.userData[SANS_OMBRE] = true;
    g.add(fl);
  }
  g.userData[marque] = true;
  return g;
}

export interface ContexteJardin3d {
  scene: THREE_NS.Object3D;
  versLocal: VersLocal;
  qualite: Qualite3d;
  /** La date de l'etude d'ensoleillement : le mini-arbre caduc est nu de novembre a mars. */
  dateStr: string | null;
}

/**
 * La vegetation basse d'un massif plante, posee au-dessus de `y0` (le dessus du massif, dans la scene) : la maille de l'ecran a la
 * densite du niveau de qualite, et celle de l'export a la densite de reference ; puis le mini-arbre, s'il en a un. Rend le nombre de
 * plantes et de fleurs montrees.
 */
export function ajouterVegetationBasse(ctx: ContexteJardin3d, o: ObjetPlan, contour: readonly PtBrut[], m: Plantation, y0: number, vegetation: boolean): number {
  let montrees = 0;
  if (vegetation) {
    const ecran = semis(o.key, contour, m.type, DENSITE_QUALITE[ctx.qualite]);
    const gEcran = groupeDuSemis(ecran, ctx.versLocal, y0, HORS_EXPORT);
    ctx.scene.add(gEcran);
    const gExport = groupeDuSemis(ctx.qualite === 'normale' ? ecran : semis(o.key, contour, m.type, 1), ctx.versLocal, y0, EXPORT_SEULEMENT);
    gExport.visible = false;
    ctx.scene.add(gExport);
    montrees = ecran.feuillage.length + ecran.fleurs.length;
  }
  if (m.miniArbre) ajouterMiniArbre(ctx, o, contour, m.miniArbre, y0);
  return montrees;
}

/** Le centre de masse d'un contour, pour y planter le mini-arbre. */
function centre(pts: readonly PtBrut[]): PtBrut {
  return { x: pts.reduce((s, p) => s + p.x, 0) / pts.length, y: pts.reduce((s, p) => s + p.y, 0) / pts.length };
}

/**
 * Le mini-arbre : un arbre de la bibliotheque (three/arbre3d.ts), ramene a sa hauteur naine, son houppier a l'echelle. C'est un
 * groupe `arbre` comme un autre : les lots d'instances le dessinent (`rafraichirArbres`, appele par qui pose la scene).
 */
function ajouterMiniArbre(ctx: ContexteJardin3d, o: ObjetPlan, contour: readonly PtBrut[], a: NonNullable<Plantation['miniArbre']>, y0: number): void {
  const e = especeParId(a.espece, especesChargees());
  const h = Math.min(HAUTEUR_MINI_ARBRE_MAX_M, a.hauteurM);
  const d = e ? Math.max(0.4, e.diametreM * (h / Math.max(0.1, e.hauteurM))) : h * 0.7;
  const g = new THREE.Group();
  g.name = NOM_MINI_ARBRE;
  g.position.y = y0;
  ctx.scene.add(g);
  const c = centre(contour);
  const arbre = { key: o.key + ':mini-arbre', type: 'circle', center: c, r: d / 2, arbre: { espece: a.espece, diametre: d } } as unknown as ObjetPlan;
  ajouterArbre3d({ scene: g, toLocal: ctx.versLocal, dateStr: ctx.dateStr }, arbre, h);
}

/** Les teintes des equipements du jardin. */
const TEINTES = { fonte: 0x4c5055, cadre: 0x7b7f84, pied: 0x3a3d40, lumiere: 0xf6e7a6, laiton: 0xb08d3c } as const;

/**
 * Un equipement du jardin, pose sur le sol en son centre (`groupe` y est deja) : le regard est une plaque de fonte dans son cadre, au
 * ras du sol (trois centimetres) ; l'eclairage, une borne et son globe ; le robinet, un pied et son col. Rend les mailles posees.
 */
export function ajouterEquipementJardin(groupe: THREE_NS.Object3D, versLocal: VersLocal, nature: NatureEquipement, contour: readonly PtBrut[], hauteur: number): number {
  if (nature === 'perron' || nature === 'unite-exterieure' || nature === 'boite-aux-lettres') return ajouterEquipementDeFacade(groupe, versLocal, nature, contour, hauteur);
  const c = centre(contour);
  const l = versLocal(c);
  const mat = (couleur: number, rugosite = 0.6) => new THREE.MeshStandardMaterial({ color: couleur, roughness: rugosite, metalness: 0.3 });
  if (nature === 'regard') {
    // Le cadre epouse le contour ; la plaque, retrait de 4 cm, depasse d'un demi-centimetre : on la voit, on ne bute pas dessus.
    const forme = (pts: readonly PtBrut[]) => { const s = new THREE.Shape(); pts.forEach((p, i) => { const q = versLocal(p); if (i) s.lineTo(q.x, -q.z); else s.moveTo(q.x, -q.z); }); return s; };
    const plaque = (pts: readonly PtBrut[], epaisseur: number, couleur: number, nom: string) => {
      const geo = new THREE.ExtrudeGeometry(forme(pts), { depth: epaisseur, bevelEnabled: false });
      geo.rotateX(-Math.PI / 2);
      const m = new THREE.Mesh(geo, mat(couleur, 0.8));
      m.name = nom;
      groupe.add(m);
    };
    plaque(contour, 0.03, TEINTES.cadre, 'regard-cadre');
    const retrait = contour.map((p) => { const dx = p.x - c.x, dy = p.y - c.y, n = Math.hypot(dx, dy) || 1, k = Math.max(0, (n - 0.04) / n); return { x: c.x + dx * k, y: c.y + dy * k }; });
    plaque(retrait, 0.035, TEINTES.fonte, 'regard-plaque');
    return 2;
  }
  const h = Math.max(0.2, hauteur);
  const pied = new THREE.Mesh(new THREE.CylinderGeometry(nature === 'eclairage' ? 0.06 : 0.03, nature === 'eclairage' ? 0.07 : 0.035, h, 12), mat(TEINTES.pied));
  pied.position.set(l.x, h / 2, l.z);
  pied.name = nature + '-pied';
  groupe.add(pied);
  if (nature === 'eclairage') {
    // Le globe est clair et un peu emissif : une borne, pas une lampe qui eclaire la scene (aucune lumiere ajoutee).
    const globe = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.12, 12), new THREE.MeshStandardMaterial({ color: TEINTES.lumiere, emissive: TEINTES.lumiere, emissiveIntensity: 0.35, roughness: 0.4 }));
    globe.position.set(l.x, h + 0.06, l.z);
    globe.name = 'eclairage-globe';
    groupe.add(globe);
    return 2;
  }
  const col = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.12, 8), mat(TEINTES.laiton, 0.4));
  col.rotation.z = Math.PI / 2;
  col.position.set(l.x + 0.06, h - 0.05, l.z);
  col.name = 'robinet-col';
  groupe.add(col);
  return 2;
}

/** Les teintes des equipements lus sur une facade (lot L1) : la pierre d'un perron, la tole d'un caisson, sa grille, une boite. */
const TEINTES_FACADE = { perron: 0xc9c2b4, caisson: 0xe4e6e8, grille: 0x4a4e52, boite: 0x5b6a74, pied: 0x3a3d40 } as const;

/** Un prisme de `pts` (le plan), de `y0` a `y1`, dans `groupe`. */
function prisme(groupe: THREE_NS.Object3D, versLocal: VersLocal, pts: readonly PtBrut[], y0: number, y1: number, couleur: number, nom: string): void {
  const s = new THREE.Shape();
  pts.forEach((p, i) => { const q = versLocal(p); if (i) s.lineTo(q.x, -q.z); else s.moveTo(q.x, -q.z); });
  const geo = new THREE.ExtrudeGeometry(s, { depth: Math.max(0.005, y1 - y0), bevelEnabled: false });
  geo.rotateX(-Math.PI / 2);
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: couleur, roughness: 0.8 }));
  m.position.y = y0;
  m.name = nom;
  groupe.add(m);
}

/** Un point entre `a` et `b`, a la part `t`. */
const entre = (a: PtBrut, b: PtBrut, t: number): PtBrut => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });

/**
 * Un equipement lu sur une facade (lot L1), sur son emprise contre le mur (`pts[0]-pts[1]` le long du mur, `pts[3]-pts[2]` vers dehors) :
 * le perron, ses marches (la plus haute contre le mur, chacune moins profonde que celle du dessous) ; l'unite exterieure, un caisson et
 * la grille de son ventilateur ; la boite aux lettres, une boite sur son pied. Rend le nombre de mailles posees.
 */
function ajouterEquipementDeFacade(groupe: THREE_NS.Object3D, versLocal: VersLocal, nature: 'perron' | 'unite-exterieure' | 'boite-aux-lettres', contour: readonly PtBrut[], hauteur: number): number {
  const [a, b, c, d] = contour as [PtBrut, PtBrut, PtBrut, PtBrut];
  if (contour.length < 4) return 0;
  if (nature === 'perron') {
    const marche = 0.17, n = Math.max(1, Math.round(Math.max(marche, hauteur) / marche));
    for (let k = 0; k < n; k++) {
      // La marche k, de son giron au mur : sa profondeur recule a chaque marche.
      const t = (n - k) / n;
      prisme(groupe, versLocal, [a, b, entre(b, c, t), entre(a, d, t)], k * (hauteur / n), (k + 1) * (hauteur / n), TEINTES_FACADE.perron, 'perron-marche');
    }
    return n;
  }
  if (nature === 'unite-exterieure') {
    prisme(groupe, versLocal, contour, 0, hauteur, TEINTES_FACADE.caisson, 'unite-exterieure-caisson');
    // La grille du ventilateur, sur la face qui regarde dehors : un carre sombre a peine en avant.
    const g = [entre(entre(a, b, 0.2), entre(d, c, 0.2), 1.02), entre(entre(a, b, 0.7), entre(d, c, 0.7), 1.02), entre(entre(a, b, 0.7), entre(d, c, 0.7), 1.04), entre(entre(a, b, 0.2), entre(d, c, 0.2), 1.04)];
    prisme(groupe, versLocal, g, hauteur * 0.2, hauteur * 0.8, TEINTES_FACADE.grille, 'unite-exterieure-grille');
    return 2;
  }
  // La boite, au haut de son pied, sur toute l'emprise ; le pied, un carre de 6 cm en son milieu.
  const boite = Math.min(0.35, hauteur / 3);
  prisme(groupe, versLocal, contour, hauteur - boite, hauteur, TEINTES_FACADE.boite, 'boite-aux-lettres');
  const m = centre(contour), e = 0.03;
  prisme(groupe, versLocal, [{ x: m.x - e, y: m.y - e }, { x: m.x + e, y: m.y - e }, { x: m.x + e, y: m.y + e }, { x: m.x - e, y: m.y + e }], 0, hauteur - boite, TEINTES_FACADE.pied, 'boite-aux-lettres-pied');
  return 2;
}

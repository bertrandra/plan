// L'assise et les fondations d'une terrasse en 3D, sol en coupe (three/).
//
// Une dalle sous la terrasse se voit toujours : elle deborde du platelage. Une dalle a couler est
// coulee en fond de fouille, une hauteur de plot sous le terrain (engine/hauteurs.ts) : les plots se
// posent dessus et leur tete arrive au ras du sol. Elle est pleine ; « Platelage translucide » (Vue
// 3D) la rend translucide, avec les lames, pour voir les plots et ce qu'elle recouvre.
//
// Le reste de ce qui porte une terrasse sous le sol fini est d'ordinaire cache par le sol opaque : le
// herisson de concasse, une dalle (existante ou a couler), les dalles stabilisatrices, les massifs
// de beton sous les plots, le fut des vis de fondation. La case « Sol en coupe » de la Vue 3D perce
// le sol sur l'emprise de la terrasse (`gabaritSol`, primitives.ts) et dessine la fouille : ses
// parois de terre, son fond, et chaque couche a sa place. Les bassins et les trous de la terrasse
// sont laisses vides. Les epaisseurs viennent de la construction et d'`engine/constantes.ts`.

import { DALLE_BETON_EP_M, estPlots, MASSIF_COTE_M, supportDe } from '../engine/constantes.js';
import type * as THREE_NS from 'three';
import type { Construction, PtBrut } from '../model/types.js';
import type { CouchesTerrasse } from '../engine/layers.js';
import { empriseDalle } from '../engine/structure.js';
import { gabaritSol, type Primitives, type VersLocal } from './primitives.js';

const TERRE = '#7a5a3a';
const CONCASSE = '#a9a294';
const BETON = '#c8c8c4';
/** Une dalle existante, quand le projet n'en dit pas l'epaisseur. */
const DALLE_EXISTANTE_M = 0.12;
/** Les dalles stabilisatrices sous les plots : 40 x 40 cm, 4 cm. */
const DALLE_STAB = { cote: 0.4, ep: 0.04 };
/** La dalle quand « Platelage translucide » est coche : elle laisse voir ce qu'elle recouvre. */
export const OPACITE_DALLE = 0.5;
/** La fouille descend un peu sous la couche la plus basse, pour qu'on la lise. */
const SOUS_FOUILLE_M = 0.1;

/** `scene` : la scene, ou le groupe d'une terrasse elevee a son point haut sur un sol en pente (three/scene.ts). */
export interface ContexteAssise3d { prim: Primitives; scene: THREE_NS.Object3D; versLocal: VersLocal }

/** Les couches sous le sol fini, de haut en bas, et la profondeur de la fouille. */
export function couchesAssise(c: Construction): { couches: { nom: string; haut: number; bas: number; couleur: string }[]; parAppui: { cote: number; haut: number; bas: number } | null; profondeur: number } {
  const couches: { nom: string; haut: number; bas: number; couleur: string }[] = [];
  let parAppui: { cote: number; haut: number; bas: number } | null = null;
  let bas = 0;
  if (estPlots(c)) {
    const t = supportDe(c.supportType);
    const ep = Math.max(0, c.supportDecaissement || 15) / 100;
    if (t.dalleBeton) {
      couches.push({ nom: 'dalle', haut: 0, bas: -DALLE_BETON_EP_M, couleur: BETON });
      couches.push({ nom: 'herisson', haut: -DALLE_BETON_EP_M, bas: -DALLE_BETON_EP_M - ep, couleur: CONCASSE });
      bas = DALLE_BETON_EP_M + ep;
    } else if (c.supportType === 'dalle') {
      couches.push({ nom: 'dalle', haut: 0, bas: -DALLE_EXISTANTE_M, couleur: BETON });
      bas = DALLE_EXISTANTE_M;
    } else if (t.concasse) {
      couches.push({ nom: 'concasse', haut: 0, bas: -ep, couleur: CONCASSE });
      bas = ep;
      if (t.dalles) parAppui = { cote: DALLE_STAB.cote, haut: 0, bas: -DALLE_STAB.ep };
    }
    if (t.massifs) { parAppui = { cote: MASSIF_COTE_M, haut: 0, bas: -MASSIF_COTE_M }; bas = Math.max(bas, MASSIF_COTE_M); }
  } else {
    // Le fut de la vis est deja dessine sous le sol (scene.ts) : la fouille le montre.
    bas = (c.hauteurVis || 40) / 100;
  }
  return { couches, parAppui, profondeur: bas + SOUS_FOUILLE_M };
}

/**
 * L'assise sous la terrasse, et sa fouille. Une dalle (a couler ou existante) se voit toujours :
 * elle deborde du platelage de `DALLE_DEBORD_M`, et le sol est perce sur son emprise. Une terrasse
 * decaissee (`decaissement`, en m, engine/hauteurs.ts) se voit dans sa fouille : ses parois de terre
 * montent du fond jusqu'au terrain naturel. Le reste — herisson, concasse, massifs, fouille entiere —
 * n'apparait que sol en coupe (`enCoupe`). Tout est abaisse du decaissement.
 *
 * `basesAppuis` : sur un sol en pente (MD/spec-relief.md §6), le sol sous chaque appui de
 * `layers.vis`, compte depuis le niveau de la scene donnee (negatif en aval) : un massif ou une dalle
 * stabilisatrice se pose sous SON plot, a son sol. Les couches pleines (dalle, herisson, fouille),
 * elles, restent de niveau au point haut : une dalle en pente n'existe pas, et la fouille reelle est
 * l'affaire du terrassement, pas de cette vue.
 */
export function ajouterAssise3d({ prim, scene, versLocal }: ContexteAssise3d, contour: PtBrut[], layers: CouchesTerrasse, c: Construction, enCoupe: boolean, decaissement = 0, translucide = false, basesAppuis: readonly number[] = []): void {
  const opaciteDalle = translucide ? OPACITE_DALLE : 1;
  if (contour.length < 3) return;
  const trous = layers.trous ?? [];
  const { couches, parAppui, profondeur } = couchesAssise(c);
  const base = -Math.max(0, decaissement);
  const dalle = couches.find(k => k.nom === 'dalle');
  const emprise = dalle ? empriseDalle(contour) : contour;
  if (!enCoupe) {
    if (!dalle && base > -1e-6) return;
    gabaritSol(scene, versLocal, emprise);
    // Hors coupe, on voit le dessus de ce qui porte la terrasse : la dalle, ou la premiere couche,
    // ou la terre du fond ; et la fouille autour si la terrasse est decaissee.
    const dessus = dalle ?? couches[0];
    const fond = dessus ? base + dessus.bas : base - 0.005;
    plaque(scene, versLocal, emprise, trous, fond, dessus ? dessus.haut - dessus.bas : 0.005, dessus ? dessus.couleur : TERRE, dessus === dalle ? opaciteDalle : 1);
    if (base < -1e-6) parois(scene, versLocal, emprise, fond, 0);
    return;
  }
  gabaritSol(scene, versLocal, emprise);
  parois(scene, versLocal, emprise, base - profondeur, 0);
  // Le fond de la fouille, puis chaque couche, percee la ou la terrasse l'est.
  plaque(scene, versLocal, emprise, trous, base - profondeur, 0.005, TERRE);
  couches.forEach(k => plaque(scene, versLocal, emprise, trous, base + k.bas, k.haut - k.bas, k.couleur, k === dalle ? opaciteDalle : 1));
  if (parAppui) layers.vis.forEach((p, i) => prim.addPrism(carre(p, parAppui.cote), base + (basesAppuis[i] ?? 0) + parAppui.bas, parAppui.haut - parAppui.bas, BETON));
}

/** Les parois de terre de la fouille, de `bas` a `haut`, vues de l'interieur comme de l'exterieur. */
function parois(scene: THREE_NS.Object3D, versLocal: VersLocal, emprise: PtBrut[], bas: number, haut: number): void {
  const matTerre = new THREE.MeshStandardMaterial({ color: TERRE, side: THREE.DoubleSide, roughness: 1 });
  const positions: number[] = [];
  emprise.forEach((a, i) => {
    const b = emprise[(i + 1) % emprise.length];
    if (!b) return;
    const la = versLocal(a), lb = versLocal(b);
    positions.push(la.x, bas, la.z, lb.x, bas, lb.z, lb.x, haut, lb.z, la.x, bas, la.z, lb.x, haut, lb.z, la.x, haut, la.z);
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.computeVertexNormals();
  scene.add(new THREE.Mesh(geo, matTerre));
}

/** Une couche plane sur l'emprise, ses ouvertures retirees, de `bas` a `bas + ep`. */
function plaque(scene: THREE_NS.Object3D, versLocal: VersLocal, contour: PtBrut[], trous: PtBrut[][], bas: number, ep: number, couleur: string, opacite = 1): void {
  if (!(ep > 0)) return;
  const forme = (pts: PtBrut[], s: THREE_NS.Shape | THREE_NS.Path) => {
    pts.forEach((q, i) => { const p = versLocal(q); if (i === 0) s.moveTo(p.x, -p.z); else s.lineTo(p.x, -p.z); });
    s.closePath();
  };
  const shape = new THREE.Shape();
  forme(contour, shape);
  trous.forEach(t => { const h = new THREE.Path(); forme(t, h); shape.holes.push(h); });
  const geo = new THREE.ExtrudeGeometry(shape, { depth: ep, bevelEnabled: false });
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshStandardMaterial({ color: couleur, roughness: 1 });
  if (opacite < 1) { mat.transparent = true; mat.opacity = opacite; mat.depthWrite = false; }
  const m = new THREE.Mesh(geo, mat);
  m.position.y = bas;
  scene.add(m);
}

function carre(c: PtBrut, cote: number): PtBrut[] {
  const d = cote / 2;
  return [{ x: c.x - d, y: c.y - d }, { x: c.x + d, y: c.y - d }, { x: c.x + d, y: c.y + d }, { x: c.x - d, y: c.y + d }];
}

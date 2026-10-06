// L'assise et les fondations d'une terrasse en 3D, sol en coupe (three/).
//
// Tout ce qui porte une terrasse sous le sol fini est d'ordinaire cache par le sol opaque : le
// herisson de concasse, une dalle (existante ou a couler), les dalles stabilisatrices, les massifs
// de beton sous les plots, le fut des vis de fondation. La case « Sol en coupe » de la Vue 3D perce
// le sol sur l'emprise de la terrasse (`gabaritSol`, primitives.ts) et dessine la fouille : ses
// parois de terre, son fond, et chaque couche a sa place. Les bassins et les trous de la terrasse
// sont laisses vides. Les epaisseurs viennent de la construction et d'`engine/constantes.ts`.

import { DALLE_BETON_EP_M, estPlots, MASSIF_COTE_M, supportDe } from '../engine/constantes.js';
import type * as THREE_NS from 'three';
import type { Construction, PtBrut } from '../model/types.js';
import type { CouchesTerrasse } from '../engine/layers.js';
import { gabaritSol, type Primitives, type VersLocal } from './primitives.js';

const TERRE = '#7a5a3a';
const CONCASSE = '#a9a294';
const BETON = '#c8c8c4';
/** Une dalle existante, quand le projet n'en dit pas l'epaisseur. */
const DALLE_EXISTANTE_M = 0.12;
/** Les dalles stabilisatrices sous les plots : 40 x 40 cm, 4 cm. */
const DALLE_STAB = { cote: 0.4, ep: 0.04 };
/** La fouille descend un peu sous la couche la plus basse, pour qu'on la lise. */
const SOUS_FOUILLE_M = 0.1;

export interface ContexteAssise3d { prim: Primitives; scene: THREE_NS.Scene; versLocal: VersLocal }

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

export function ajouterAssise3d({ prim, scene, versLocal }: ContexteAssise3d, contour: PtBrut[], layers: CouchesTerrasse, c: Construction): void {
  if (contour.length < 3) return;
  const trous = layers.trous ?? [];
  const { couches, parAppui, profondeur } = couchesAssise(c);
  gabaritSol(scene, versLocal, contour);
  // Les parois de la fouille, vues de l'interieur comme de l'exterieur.
  const matTerre = new THREE.MeshStandardMaterial({ color: TERRE, side: THREE.DoubleSide, roughness: 1 });
  const positions: number[] = [];
  contour.forEach((a, i) => {
    const b = contour[(i + 1) % contour.length];
    if (!b) return;
    const la = versLocal(a), lb = versLocal(b);
    positions.push(la.x, -profondeur, la.z, lb.x, -profondeur, lb.z, lb.x, 0, lb.z, la.x, -profondeur, la.z, lb.x, 0, lb.z, la.x, 0, la.z);
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.computeVertexNormals();
  scene.add(new THREE.Mesh(geo, matTerre));
  // Le fond de la fouille, puis chaque couche, percee la ou la terrasse l'est.
  plaque(scene, versLocal, contour, trous, -profondeur, 0.005, TERRE);
  couches.forEach(k => plaque(scene, versLocal, contour, trous, k.bas, k.haut - k.bas, k.couleur));
  if (parAppui) layers.vis.forEach(p => prim.addPrism(carre(p, parAppui.cote), parAppui.bas, parAppui.haut - parAppui.bas, BETON));
}

/** Une couche plane sur l'emprise, ses ouvertures retirees, de `bas` a `bas + ep`. */
function plaque(scene: THREE_NS.Scene, versLocal: VersLocal, contour: PtBrut[], trous: PtBrut[][], bas: number, ep: number, couleur: string): void {
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
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: couleur, roughness: 1 }));
  m.position.y = bas;
  scene.add(m);
}

function carre(c: PtBrut, cote: number): PtBrut[] {
  const d = cote / 2;
  return [{ x: c.x - d, y: c.y - d }, { x: c.x + d, y: c.y - d }, { x: c.x + d, y: c.y + d }, { x: c.x - d, y: c.y + d }];
}

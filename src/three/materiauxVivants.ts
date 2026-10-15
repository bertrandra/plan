// Les materiaux vivants (MD/roadmap-realisme-3d.md, R3) : le relief des textures dessinees.
//
// Les textures des murs (three/textureMur.ts) et des couvertures (three/couverture.ts) sont des
// images en niveaux de clair, a plat : sous une lumiere rasante, un mur de brique restait une photo de
// brique. On en tire une carte de relief (normal map) — le joint de mortier en creux, la tuile qui
// recouvre la suivante, le grain de l'enduit — que la lumiere de R1 fait vivre.
//
// **A l'ecran seulement.** La carte est posee sur les materiaux apres la construction de la scene et
// retiree le temps d'un export (`retirerReliefsEcran`, three/exportGlb.ts) : le .glb garde ses
// textures d'avant, et l'empreinte golden ses comptes. Pas en qualite Econome.

import type * as THREE_NS from 'three';

/** Ce qu'il faut pour tirer le relief d'une texture : ses hauteurs (0 a 1), son cote, le sens du relief. */
interface Hauteurs {
  pixels: Uint8ClampedArray;
  cote: number;
  /** `true` quand le clair est en creux (le joint de mortier, plus clair que la brique). */
  clairEnCreux: boolean;
  /** La force du relief : une brique accroche plus la lumiere qu'un enduit. */
  force: number;
}

const hauteurs = new WeakMap<THREE_NS.Texture, Hauteurs>();
const normales = new WeakMap<THREE_NS.Texture, THREE_NS.Texture | null>();

/** Les textures dessinees s'inscrivent ici, avec leurs pixels : elles seules recoivent un relief. */
export function inscrireHauteurs(tex: THREE_NS.Texture, pixels: Uint8ClampedArray, cote: number, clairEnCreux: boolean, force: number): void {
  hauteurs.set(tex, { pixels, cote, clairEnCreux, force });
}

/**
 * Les pixels (RGBA) d'une carte de normales tiree d'une image en gris : le gradient de Sobel, qui se
 * raccorde sur les bords comme la texture elle-meme. `force` regle la pente apparente.
 */
export function pixelsNormales(gris: Uint8ClampedArray, cote: number, clairEnCreux: boolean, force: number): Uint8ClampedArray {
  const h = (x: number, y: number) => {
    const g = (gris[((((y % cote) + cote) % cote) * cote + (((x % cote) + cote) % cote)) * 4] ?? 0) / 255;
    return clairEnCreux ? 1 - g : g;
  };
  const out = new Uint8ClampedArray(cote * cote * 4);
  for (let y = 0; y < cote; y++) for (let x = 0; x < cote; x++) {
    const dx = (h(x + 1, y - 1) + 2 * h(x + 1, y) + h(x + 1, y + 1)) - (h(x - 1, y - 1) + 2 * h(x - 1, y) + h(x - 1, y + 1));
    // Le haut de l'image est le haut du mur : y d'image croissant = v decroissant.
    const dy = (h(x - 1, y - 1) + 2 * h(x, y - 1) + h(x + 1, y - 1)) - (h(x - 1, y + 1) + 2 * h(x, y + 1) + h(x + 1, y + 1));
    let nx = -dx * force, ny = -dy * force, nz = 1;
    const l = Math.hypot(nx, ny, nz);
    nx /= l; ny /= l; nz /= l;
    const k = (y * cote + x) * 4;
    out[k] = Math.round((nx * 0.5 + 0.5) * 255);
    out[k + 1] = Math.round((ny * 0.5 + 0.5) * 255);
    out[k + 2] = Math.round((nz * 0.5 + 0.5) * 255);
    out[k + 3] = 255;
  }
  return out;
}

/** La carte de normales d'une texture inscrite, construite une fois ; `null` pour toute autre. */
export function carteNormales(tex: THREE_NS.Texture): THREE_NS.Texture | null {
  if (normales.has(tex)) return normales.get(tex) ?? null;
  const h = hauteurs.get(tex);
  let carte: THREE_NS.Texture | null = null;
  if (h && typeof document !== 'undefined') {
    const canevas = document.createElement('canvas');
    canevas.width = canevas.height = h.cote;
    const c2d = canevas.getContext('2d');
    if (c2d) {
      const img = c2d.createImageData(h.cote, h.cote);
      img.data.set(pixelsNormales(h.pixels, h.cote, h.clairEnCreux, h.force));
      c2d.putImageData(img, 0, 0);
      carte = new THREE.CanvasTexture(canevas);
      carte.wrapS = carte.wrapT = THREE.RepeatWrapping;
      carte.repeat.copy(tex.repeat);
      carte.anisotropy = tex.anisotropy;
    }
  }
  normales.set(tex, carte);
  return carte;
}

/** La marque d'un materiau qui porte un relief d'ecran : l'export le lui retire. */
export const RELIEF_ECRAN = 'reliefEcran';

type MateriauRelief = THREE_NS.MeshStandardMaterial & { userData: Record<string, unknown> };

const estStandard = (m: unknown): m is MateriauRelief => !!m && (m as { isMeshStandardMaterial?: boolean }).isMeshStandardMaterial === true;

/**
 * Pose le relief sur chaque materiau de la scene dont la texture est dessinee. Sans effet sur un
 * materiau deja servi : la scene peut etre reparcourue (la structure de la terrasse arrive apres).
 */
export function animerMateriaux(scene: THREE_NS.Object3D): number {
  let n = 0;
  scene.traverse((o) => {
    const porteur = o as THREE_NS.Object3D & { material?: unknown };
    const mats = Array.isArray(porteur.material) ? porteur.material : porteur.material ? [porteur.material] : [];
    for (const m of mats) {
      if (!estStandard(m) || !m.map || m.normalMap || m.userData[RELIEF_ECRAN]) continue;
      const carte = carteNormales(m.map);
      if (!carte) continue;
      m.normalMap = carte;
      m.userData[RELIEF_ECRAN] = true;
      m.needsUpdate = true;
      n++;
    }
  });
  return n;
}

/** Retire les reliefs d'ecran le temps d'un export ; rend de quoi les remettre. */
export function retirerReliefsEcran(scene: THREE_NS.Object3D): () => void {
  const retires: [MateriauRelief, THREE_NS.Texture][] = [];
  scene.traverse((o) => {
    const porteur = o as THREE_NS.Object3D & { material?: unknown };
    const mats = Array.isArray(porteur.material) ? porteur.material : porteur.material ? [porteur.material] : [];
    for (const m of mats) {
      if (estStandard(m) && m.userData[RELIEF_ECRAN] && m.normalMap) { retires.push([m, m.normalMap]); m.normalMap = null; }
    }
  });
  return () => retires.forEach(([m, t]) => { m.normalMap = t; });
}

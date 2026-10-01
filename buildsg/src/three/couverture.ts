// Les textures des couvertures en 3D : tuiles ou ardoises (MD/spec-toit-ign.md §6.2).
//
// Elles sont dessinees, pas telechargees : la vue 3D les a sans reseau, et l'export GLB les emporte.
// Chacune est en niveaux de clair, autour de 0,85 : la couleur du toit (lue sur l'orthophoto, de
// repli ou choisie) la teinte par le materiau. Une texture couvre un metre sur un metre ; les
// coordonnees de texture d'un pan sont en metres (`uvDuPan`), les rangs suivent l'egout.

import type * as THREE_NS from 'three';
import type { MateriauCouverture } from '../model/couleurToit.js';

const COTE = 256;

/** Un tirage reproductible : la meme texture d'une ouverture a l'autre, et dans les captures. */
function tirage(graine: number): () => number {
  let s = graine;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

/**
 * Tuiles romanes : 4 tuiles et 3 rangs par metre. Chaque tuile est bombee (plus claire au sommet de
 * sa courbe), chaque rang plus sombre sous le recouvrement du rang du dessus.
 */
function tuiles(px: Uint8ClampedArray): void {
  const rnd = tirage(11);
  const colonnes = 4,
    rangs = 3,
    l = COTE / colonnes,
    h = Math.round(COTE / rangs);
  const nuance = Array.from({ length: colonnes * rangs }, () => 0.92 + 0.1 * rnd());
  for (let y = 0; y < COTE; y++) {
    const r = Math.min(rangs - 1, Math.floor(y / h)),
      t = (y - r * h) / h;
    // En haut du rang (canevas vers le haut = vers le faitage), l'ombre du rang superieur.
    const recouvrement = 0.72 + 0.28 * Math.min(1, t / 0.35);
    const nez = t > 0.95 ? 0.6 : 1;
    for (let x = 0; x < COTE; x++) {
      const c = Math.floor(x / l),
        u = (x - c * l) / l;
      const bombe = 0.7 + 0.3 * Math.sin(Math.PI * u);
      const v = Math.min(1, bombe * recouvrement * nez * (nuance[r * colonnes + c] ?? 1) * (0.96 + 0.06 * rnd()));
      const k = (y * COTE + x) * 4;
      px[k] = px[k + 1] = px[k + 2] = Math.round(255 * v);
      px[k + 3] = 255;
    }
  }
}

/** Ardoises : 4 par metre en largeur, 8 rangs, a joints croises, chacune de sa nuance. */
function ardoises(px: Uint8ClampedArray): void {
  const rnd = tirage(23);
  const colonnes = 4,
    rangs = 8,
    l = COTE / colonnes,
    h = COTE / rangs;
  const nuance = Array.from({ length: (colonnes + 1) * rangs }, () => 0.8 + 0.16 * rnd());
  for (let y = 0; y < COTE; y++) {
    const r = Math.floor(y / h),
      t = (y - r * h) / h;
    const decalage = r % 2 ? l / 2 : 0;
    for (let x = 0; x < COTE; x++) {
      const xs = (x + decalage) % COTE,
        c = Math.floor(xs / l),
        u = (xs - c * l) / l;
      const joint = u < 0.025 || u > 0.975 || t > 0.94;
      const ombre = 0.85 + 0.15 * Math.min(1, t / 0.25);
      const v = joint ? 0.42 : Math.min(1, (nuance[r * (colonnes + 1) + c] ?? 1) * ombre * (0.97 + 0.04 * rnd()) + 0.1);
      const k = (y * COTE + x) * 4;
      px[k] = px[k + 1] = px[k + 2] = Math.round(255 * v);
      px[k + 3] = 255;
    }
  }
}

const cache = new Map<MateriauCouverture, THREE_NS.Texture>();

/** La texture d'une couverture, ou `null` sans canevas (tests, environnement sans DOM). */
export function textureCouverture(materiau: MateriauCouverture): THREE_NS.Texture | null {
  const deja = cache.get(materiau);
  if (deja) return deja;
  if (typeof document === 'undefined' || typeof THREE === 'undefined' || !THREE.CanvasTexture) return null;
  const canevas = document.createElement('canvas');
  canevas.width = canevas.height = COTE;
  const c2d = canevas.getContext('2d');
  if (!c2d) return null;
  const img = c2d.createImageData(COTE, COTE);
  (materiau === 'ardoise' ? ardoises : tuiles)(img.data);
  c2d.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canevas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  cache.set(materiau, tex);
  return tex;
}

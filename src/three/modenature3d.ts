// La modenature lue d'un mur et ce qu'il porte, en 3D (lot L1 de MD/spec-lecture-ia-elargie.md §3.1, decision 14) : la corniche ou la
// genoise sous l'egout, les bandeaux a leur hauteur lue, les chaines d'angle, les encadrements des baies, le soubassement et son
// parement, les descentes d'eau pluviale, le store banne. Sur un mur dont la modenature est lue, c'est elle qui se dessine : la
// maconnerie que l'epoque faisait deduire ne s'y pose pas (three/detailsBatiment.ts ne la pose deja sur aucun mur releve).
//
// Un releve sans `modenature` ni `appendices` n'ajoute rien : la scene d'un fichier qui ne les porte pas garde exactement ses mailles
// (empreinte `glb-structure.json`, decision 14). Tout tient en une maille par mur (`releve-modenature`), un materiau par matiere.

import type * as THREE_NS from 'three';
import { Batisseur } from './batisseur.js';
import { repereFacade, type ContexteDetailsOuvertures } from './detailsOuvertures.js';
import { BANDEAU, CHAINE, CORNICHE, pave } from './fenetresRelief.js';
import type { Facade } from '../geometry/cotesVusDeDehors.js';
import type { ModenatureFacade, OuvertureFacade, ParementFacade, ReleveFacade } from '../model/types.js';

/** Les matieres de la modenature, et leur couleur : pierre claire, brique, enduit, tuile d'une genoise, zinc, toile d'un store. */
const MATIERES = {
  pierre: 0xd9d0bf, brique: 0xa65a3c, enduit: 0xebe6dc, tuile: 0xb3623e, zinc: 0x8d9499, toile: 0xb84c3c, caisson: 0xd8d8d4,
  beton: 0xbdbab2, colombage: 0x6b4a33, 'bardage-bois': 0x9a6b42, 'bardage-metal': 0x7c8288,
} as const;
type Matiere = keyof typeof MATIERES;

/** Les cotes que la photo ne donne pas : un rang de genoise, un encadrement, une descente, un store replie. */
export const MODENATURE_3D = {
  rangGenoise: { hauteur: 0.07, saillie: 0.08 },
  encadrement: { largeur: 0.12, saillie: 0.015 },
  soubassement: { saillie: 0.02 },
  descente: { cote: 0.08, ecart: 0.04 },
  store: { hauteur: 0.25, saillie: 0.25 },
} as const;

/** La matiere du parement d'un soubassement ; un parement sans couleur propre se dessine en pierre. */
const matiereDuParement = (p: ParementFacade | undefined): Matiere => (p && p in MATIERES ? (p as Matiere) : 'pierre');

/**
 * La modenature et les stores d'un releve sur son mur (`f`), de `hMur` metres a l'egout, avec les ouvertures posees (les bandeaux
 * s'interrompent au droit des baies). Rend le nombre de mailles ajoutees (0 ou 1).
 */
export function poserModenature(ctx: ContexteDetailsOuvertures, f: Facade, r: Pick<ReleveFacade, 'modenature' | 'appendices'>, hMur: number, baies: readonly OuvertureFacade[]): number {
  const m = r.modenature, stores = r.appendices ?? [];
  if (!m && !stores.length) return 0;
  const pt = repereFacade(ctx.toLocal, f);
  const b = new Batisseur();
  const parMatiere = new Map<Matiere, (() => void)[]>();
  const ajouter = (k: Matiere, x: () => void) => { const l = parMatiere.get(k) ?? []; l.push(x); parMatiere.set(k, l); };
  if (m) poserLaModenature(m, f.largeur, hMur, baies, (k, x0, x1, y0, y1, s0, s1) => ajouter(k, () => pave(b, pt, x0, x1, y0, y1, s0, s1)));
  for (const s of stores) {
    const x0 = Math.max(0, s.xM), x1 = Math.min(f.largeur, s.xM + s.largeurM), y = Math.min(hMur, s.hauteurM), S = MODENATURE_3D.store;
    // Le caisson et la toile repliee dessous, d'un bout a l'autre du store.
    ajouter('caisson', () => pave(b, pt, x0, x1, y - S.hauteur / 2, y, 0, S.saillie));
    ajouter('toile', () => pave(b, pt, x0 + 0.02, x1 - 0.02, y - S.hauteur, y - S.hauteur / 2, S.saillie - 0.08, S.saillie - 0.02));
  }
  if (!parMatiere.size) return 0;
  const matieres = [...parMatiere.keys()];
  matieres.forEach((k, i) => { for (const x of parMatiere.get(k) ?? []) x(); b.groupe(i); });
  const mats: THREE_NS.Material[] = matieres.map((k) => new THREE.MeshStandardMaterial({ color: MATIERES[k], roughness: k === 'zinc' || k === 'caisson' ? 0.45 : 0.85, ...(k === 'zinc' ? { metalness: 0.5 } : {}) }));
  ctx.scene.add(b.maillage(mats, 'releve-modenature'));
  return 1;
}

type Pave = (k: Matiere, x0: number, x1: number, y0: number, y1: number, s0: number, s1: number) => void;

/** Les paves de la modenature, chacun dans sa matiere : sous l'egout, aux bandeaux, aux angles, autour des baies, au pied, aux descentes. */
function poserLaModenature(m: ModenatureFacade, L: number, H: number, baies: readonly OuvertureFacade[], pave: Pave): void {
  let sousEgout = H;
  if (m.egout === 'corniche' && H > CORNICHE.hauteur + 1) { pave('pierre', 0, L, H - CORNICHE.hauteur, H, 0, CORNICHE.saillie); sousEgout = H - CORNICHE.hauteur; }
  if (m.egout === 'genoise') {
    // Chaque rang deborde du precedent : la genoise s'evase vers l'egout.
    const n = m.rangsGenoise ?? 2, R = MODENATURE_3D.rangGenoise;
    for (let k = 0; k < n; k++) pave('tuile', 0, L, H - (n - k) * R.hauteur, H - (n - k - 1) * R.hauteur, 0, R.saillie * (k + 1));
    sousEgout = H - n * R.hauteur;
  }
  const e = MODENATURE_3D.encadrement;
  for (const y of m.bandeauxM ?? []) {
    const y0 = y - BANDEAU.hauteur / 2, y1 = y + BANDEAU.hauteur / 2;
    if (y1 > sousEgout - 0.05 || y0 < 0.1) continue;
    const coupes = baies.filter((o) => o.y < y1 && o.y + o.h > y0).map((o) => [o.x - e.largeur, o.x + o.l + e.largeur] as const).sort((a, c) => a[0] - c[0]);
    let x = 0;
    for (const [a, c] of coupes) { if (a > x) pave('pierre', x, a, y0, y1, 0, BANDEAU.saillie); x = Math.max(x, c); }
    if (x < L) pave('pierre', x, L, y0, y1, 0, BANDEAU.saillie);
  }
  if ((m.chaines === 'pierre' || m.chaines === 'brique') && L > 2 * CHAINE.long) {
    let k = 0;
    for (let y = 0; y + 0.05 < sousEgout; y += CHAINE.assise, k++) {
      const y1 = Math.min(y + CHAINE.assise - 0.015, sousEgout);
      const lg = k % 2 === 0 ? CHAINE.long : CHAINE.court, ld = k % 2 === 0 ? CHAINE.court : CHAINE.long;
      pave(m.chaines, 0, lg, y, y1, 0, CHAINE.saillie);
      pave(m.chaines, L - ld, L, y, y1, 0, CHAINE.saillie);
    }
  }
  if (m.encadrements === 'pierre' || m.encadrements === 'brique' || m.encadrements === 'enduit') {
    for (const o of baies) {
      const haut = Math.min(sousEgout, o.y + o.h + e.largeur);
      pave(m.encadrements, o.x - e.largeur, o.x, o.y, o.y + o.h, 0, e.saillie);
      pave(m.encadrements, o.x + o.l, o.x + o.l + e.largeur, o.y, o.y + o.h, 0, e.saillie);
      if (haut > o.y + o.h) pave(m.encadrements, o.x - e.largeur, o.x + o.l + e.largeur, o.y + o.h, haut, 0, e.saillie);
    }
  }
  if (m.soubassement) pave(matiereDuParement(m.soubassement.parement), 0, L, 0, Math.min(m.soubassement.hauteurM, sousEgout), 0, MODENATURE_3D.soubassement.saillie);
  const d = MODENATURE_3D.descente;
  for (const x of m.descentesM ?? []) {
    const c = Math.min(L - d.cote / 2, Math.max(d.cote / 2, x));
    pave('zinc', c - d.cote / 2, c + d.cote / 2, 0, sousEgout, d.ecart, d.ecart + d.cote);
  }
}

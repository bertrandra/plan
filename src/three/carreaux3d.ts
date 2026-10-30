// Les carreaux d'une ouverture de la facade objet en 3D (MD/spec-facade-calage-audit.md §3.3, lot F8).
//
// Une ouverture dont la facade validee porte `details.carreaux` (la division du vitrage lue par Claude, ou dite au doigt) recoit
// ses meneaux, sa traverse d'imposte et ses petits bois, dessines d'apres ce vocabulaire et rien d'autre : pas d'epoque, pas de
// regle par defaut. Ce que le vocabulaire ne dit pas ne se dessine pas (un vantail sans grille reste un seul verre). Une ouverture
// sans carreaux ne passe pas ici : la scene d'un fichier qui n'en porte pas garde exactement ses mailles (fumee, point 24).
//
// Une maille par ouverture, des barres a plat (deux triangles chacune) : c'est elle qui part au .glb, quel que soit le niveau de
// qualite (un niveau ne change pas un export, three/qualite.ts). En Normale et en Soignee, l'ecran montre a sa place des barres en
// relief (cinq faces), hors export, comme les baies en creux de three/fenetresRelief.ts.

import type * as THREE_NS from 'three';
import type { CarreauxOuverture } from '../model/types.js';
import { Batisseur } from './batisseur.js';
import { pave, PETITS_BOIS_M, type Point3 } from './fenetresRelief.js';
import { poserEnCouche, COUCHES_SOL, HORS_EXPORT, EXPORT_SEULEMENT } from './primitives.js';

/** Le montant entre deux vantaux, et la traverse sous l'imposte : plus larges que les petits bois. */
export const MENEAU_M = 0.05;
/** Les petits bois selon le mot lu : fins (ceux des fenetres anciennes de three/fenetresRelief.ts) ou epais. */
export const PETITS_BOIS_LUS_M = { fins: PETITS_BOIS_M, epais: 0.045 } as const;
/** Une imposte plus basse que ceci, ou qui laisse moins que ceci dessous, ne se dessine pas : elle ne se lirait pas. */
const IMPOSTE_MIN_M = 0.1;
/** Les barres a plat : devant la vitre (2 cm) et la photo (1 cm), derriere l'encadrement (5 cm). */
const SAILLIE_A_PLAT = 0.03;
/** Les barres en relief : du nu de la photo a leur saillie, le meneau plus epais que les petits bois. */
const RELIEF = { dos: 0.01, petitBois: 0.035, meneau: 0.045 } as const;

/** Une barre de la menuiserie, dans le repere du mur (x depuis la gauche, y en hauteur, metres). */
export interface BarreCarreaux {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  /** `meneau` : entre deux vantaux ; `traverse` : sous l'imposte ; `petitBois` : dans une grille. */
  sorte: 'meneau' | 'traverse' | 'petitBois';
}

/** Une baie, dans le repere de son mur. */
interface Baie { x: number; y: number; l: number; h: number }

/** Les lignes interieures d'une grille de `colonnes` x `rangees` carreaux sur un rectangle, en petits bois de largeur `w`. */
function grille(x0: number, x1: number, y0: number, y1: number, colonnes: number, rangees: number, w: number): BarreCarreaux[] {
  const out: BarreCarreaux[] = [];
  for (let c = 1; c < colonnes; c++) {
    const x = x0 + ((x1 - x0) * c) / colonnes;
    out.push({ x0: x - w / 2, x1: x + w / 2, y0, y1, sorte: 'petitBois' });
  }
  for (let r = 1; r < rangees; r++) {
    const y = y0 + ((y1 - y0) * r) / rangees;
    out.push({ x0, x1, y0: y - w / 2, y1: y + w / 2, sorte: 'petitBois' });
  }
  return out;
}

/**
 * Les barres d'une baie d'apres ses carreaux : la traverse de l'imposte et sa grille sur toute la largeur ; dessous, les meneaux
 * entre les vantaux et la grille de chaque vantail. `petitsBois: 'aucun'` ne garde que les meneaux et la traverse ; un mot absent
 * vaut des petits bois fins. Les barres sont dans la baie, jamais dehors ; une barre vide est omise.
 */
export function barresDesCarreaux(o: Baie, c: CarreauxOuverture): BarreCarreaux[] {
  if (!(o.l > 0) || !(o.h > 0)) return [];
  const w = c.petitsBois === 'aucun' ? 0 : PETITS_BOIS_LUS_M[c.petitsBois ?? 'fins'];
  const m = MENEAU_M;
  const out: BarreCarreaux[] = [];
  let haut = o.y + o.h;
  const hi = c.imposte?.hauteurM ?? 0;
  if (c.imposte && hi >= IMPOSTE_MIN_M && o.h - hi >= IMPOSTE_MIN_M) {
    const yt = o.y + o.h - hi;
    out.push({ x0: o.x, x1: o.x + o.l, y0: yt - m / 2, y1: yt + m / 2, sorte: 'traverse' });
    if (w && c.imposte.grille) out.push(...grille(o.x, o.x + o.l, yt + m / 2, o.y + o.h, c.imposte.grille.colonnes, c.imposte.grille.rangees, w));
    haut = yt - m / 2;
  }
  const n = c.vantaux ?? 1;
  for (let k = 1; k < n; k++) {
    const x = o.x + (o.l * k) / n;
    out.push({ x0: x - m / 2, x1: x + m / 2, y0: o.y, y1: haut, sorte: 'meneau' });
  }
  if (w && c.grille) {
    for (let v = 0; v < n; v++) {
      const x0 = o.x + (o.l * v) / n + (v > 0 ? m / 2 : 0);
      const x1 = o.x + (o.l * (v + 1)) / n - (v < n - 1 ? m / 2 : 0);
      out.push(...grille(x0, x1, o.y, haut, c.grille.colonnes, c.grille.rangees, w));
    }
  }
  return out.filter((b) => b.x1 - b.x0 > 1e-6 && b.y1 - b.y0 > 1e-6);
}

/** La vitre d'une ouverture sans photo, selon le vitrage lu ; absent ou clair : celle d'avant (`clair`). */
export function vitreLue(vitrage: CarreauxOuverture['vitrage'] | undefined, clair: { color: number; roughness: number; metalness: number }): { color: number; roughness: number; metalness: number } {
  if (vitrage === 'depoli') return { color: 0xa3adb4, roughness: 0.7, metalness: 0 };
  if (vitrage === 'teinte') return { color: 0x1c242b, roughness: clair.roughness, metalness: clair.metalness };
  if (vitrage === 'vitrail') return { color: 0x6b5b7e, roughness: 0.3, metalness: 0.1 };
  return clair;
}

/**
 * Pose les carreaux d'une ouverture dans `scene` (son groupe `ouverture:<id>`) : la maille a plat, et en relief quand `relief`
 * (hors Econome) ; celle a plat ne sert alors qu'a l'export. Rien quand le vocabulaire ne dit aucune barre.
 */
export function poserCarreaux(scene: THREE_NS.Object3D, pt: Point3, o: Baie, c: CarreauxOuverture, couleur: number, relief: boolean): number {
  const barres = barresDesCarreaux(o, c);
  if (!barres.length) return 0;
  const mat = new THREE.MeshStandardMaterial({ color: couleur, roughness: 0.6 });
  poserEnCouche(mat, COUCHES_SOL.surMur);
  const plat = new Batisseur();
  barres.forEach((b) => plat.quad(pt(b.x0, b.y0, SAILLIE_A_PLAT), pt(b.x1, b.y0, SAILLIE_A_PLAT), pt(b.x1, b.y1, SAILLIE_A_PLAT), pt(b.x0, b.y1, SAILLIE_A_PLAT)));
  plat.groupe(0);
  const aPlat = plat.maillage([mat], 'releve-carreaux');
  scene.add(aPlat);
  if (!relief) return barres.length;
  aPlat.visible = false;
  aPlat.userData[EXPORT_SEULEMENT] = true;
  const creux = new Batisseur();
  barres.forEach((b) => pave(creux, pt, b.x0, b.x1, b.y0, b.y1, RELIEF.dos, b.sorte === 'petitBois' ? RELIEF.petitBois : RELIEF.meneau));
  creux.groupe(0);
  const enRelief = creux.maillage([mat], 'releve-carreaux-relief');
  enRelief.userData[HORS_EXPORT] = true;
  scene.add(enRelief);
  return barres.length;
}

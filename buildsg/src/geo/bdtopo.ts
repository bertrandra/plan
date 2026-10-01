// Ce que la BD TOPO dit, et ce qu'il faut en deduire (spec §3.2, geo/).
//
// La BD TOPO de l'IGN decrit le bati et la vegetation, mais elle le fait pour toute la France et
// pas pour un plan de jardin : beaucoup de champs manquent, et ceux qui sont la ne sont pas
// toujours ceux dont on a besoin. Ce module regroupe les quelques regles qui comblent ces trous -
// des choix assumes, pas des mesures.

import { nombreFr } from '../util/format.js';
import { pointInPolygon } from '../geometry/basic.js';
import type { PtBrut } from '../model/types.js';

/** Un arbre pour environ 64 m² de couvert : l'ordre de grandeur d'un bois. */
export const ESPACEMENT_ARBRES_M = 8;
/** Au-dela, le plan devient illisible et le calcul d'ombre inutilement lourd. */
export const MAX_ARBRES_ESTIMES = 60;

/** Hauteur par defaut d'une hauteur de batiment absente : un niveau et demi. */
const HAUTEUR_BATIMENT_DEFAUT = 2.5;
/** Hauteur d'etage retenue pour deduire une hauteur d'un nombre de niveaux. */
const HAUTEUR_ETAGE_M = 2.7;

/**
 * Hauteur a retenir pour un batiment, dans l'ordre : celle mesuree, sinon celle deduite du nombre
 * d'etages, sinon 2,5 m.
 *
 * Beaucoup d'annexes - garages, abris - n'ont pas de hauteur mesuree dans la BD TOPO. Poser un
 * batiment de hauteur nulle donnerait une Vue 3D plate et une ombre inexistante : mieux vaut une
 * estimation avouee qu'un zero qui se fait passer pour une mesure.
 */
export function hauteurBatiment(props: Record<string, unknown>): number {
  const h = nombreFr(props.hauteur);
  if (h && h > 0) return h;
  const etages = nombreFr(props.nombre_d_etages);
  if (etages && etages > 0) return Math.round(etages * HAUTEUR_ETAGE_M * 10) / 10;
  return HAUTEUR_BATIMENT_DEFAUT;
}

/** Hauteurs typiques par nature de vegetation, en metres. */
export const HAUTEUR_VEGETATION: Record<string, number> = {
  'Haie': 2, 'Bois': 12, 'Forêt fermée de feuillus': 15, 'Forêt fermée de conifères': 18,
  'Forêt fermée mixte': 16, 'Forêt ouverte': 10, 'Peupleraie': 18, 'Verger': 4,
  'Vigne': 1.5, 'Lande ligneuse': 1.2, 'Zone arborée': 10, 'Bois de conifères': 18
};

/** Hauteur d'une zone de vegetation d'apres sa nature ; 6 m pour une nature inconnue. */
export function hauteurVegetation(nature: string | undefined | null): number {
  const h = HAUTEUR_VEGETATION[nature as string];
  return h !== undefined ? h : 6;
}

/**
 * Repartit des arbres estimes dans un polygone de vegetation.
 *
 * La BD TOPO ne cartographie pas les arbres isoles en zone urbaine : elle donne des *zones*. Pour
 * qu'un bois projette une ombre credible, on y repartit une grille reguliere, decalee d'un bruit,
 * en ne gardant que les points tombant dans le polygone. C'est un ordre de grandeur de couvert,
 * jamais un releve - et le nom `arbresEstimes` le dit.
 *
 * Le bruit est **deterministe** (une fonction de la position dans la grille, pas un tirage) : deux
 * imports de la meme parcelle doivent donner le meme plan, sinon rouvrir un projet deplacerait les
 * arbres et changerait les ombres sans que personne n'ait rien demande.
 */
export function arbresEstimes(pts: readonly PtBrut[], espacement: number, maxArbres: number): PtBrut[] {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  pts.forEach((p) => {
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
  });
  const out: PtBrut[] = [];
  // Bruit de hachage classique : la partie fractionnaire d'un grand sinus, recentree sur zero.
  const bruit = (i: number, j: number) => {
    const s = Math.sin(i * 127.1 + j * 311.7) * 43758.5453;
    return (s - Math.floor(s)) - 0.5;
  };
  for (let i = 0; minX + i * espacement <= maxX && out.length < maxArbres; i++) {
    for (let j = 0; minY + j * espacement <= maxY && out.length < maxArbres; j++) {
      const p = {
        x: minX + (i + 0.5 + bruit(i, j) * 0.6) * espacement,
        y: minY + (j + 0.5 + bruit(j, i) * 0.6) * espacement
      };
      if (pointInPolygon(p, pts as PtBrut[])) out.push({ x: Math.round(p.x * 100) / 100, y: Math.round(p.y * 100) / 100 });
    }
  }
  return out;
}

/**
 * Libelle d'une parcelle cadastrale : « AE 101 ».
 *
 * Le numero arrive zero-remplis dans l'IDU (`0101`) : on le nettoie, mais sans jamais rendre une
 * chaine vide - une parcelle reellement numerotee `0` garderait son zero, et a defaut de section et
 * de numero on retombe sur l'identifiant unique.
 */
export function libelleParcelle(c: { numero?: string | number; section?: string; idu?: string }): string {
  const num = String(c.numero || '').replace(/^0+/, '') || String(c.numero || '');
  return ((c.section || '') + ' ' + num).trim() || (c.idu as string);
}

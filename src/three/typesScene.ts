// Ce que les modules de la scene 3D se passent (three/scene.ts et ses parties) : le contexte que la construction demande au reste
// du programme, et celui que chaque objet pose recoit. Seuls, pour que les parties ne dependent pas de la construction qui les
// assemble.

import type { Sol } from '../engine/sol.js';
import { computeTerrasseLayers } from '../engine/layers.js';
import {
  type Primitives, type VersLocal
} from './primitives.js';
import type * as THREE_NS from 'three';
import type { ObjetPlan, PtBrut, Construction, ReglagesVoisinage3d } from '../model/types.js';
import type { ObjetMesurable } from '../engine/hauteurs.js';
import type { TuileOrtho } from '../render/ortho.js';
import type { SolRelief } from './relief3d.js';

/** Ce que la construction de la scene 3D demande au reste du programme. */
export interface ContexteScene3d {
  /**
   * Un mode de diagnostic (app/diagnostic.ts) : la couleur d'affichage d'un batiment, murs et toit,
   * par-dessus la sienne ; null ou absent : la sienne.
   */
  couleurDiagnostic?: (o: ObjetPlan) => string | null;
  /** La parcelle qui porte la cloture, s'il y en a une. */
  trouverParcelleCloture: () => ObjetPlan | null | undefined;
  /** Hauteur de ce sur quoi la structure repose, en millimetres. */
  hauteurAppuiMm: (c: Construction) => number;
  /** Altitude d'un objet du plan, en metres. */
  elevationOf: (o: ObjetMesurable) => number;
  /** Un objet masque ne se modelise pas. */
  objetMasque: (o: ObjetPlan) => boolean;
  /** Position du mat d'un parasol, en coordonnees du plan. */
  positionMat: (par: ObjetPlan) => PtBrut;
  /** Le fond orthophoto sert aussi de sol a la 3D. */
  orthoActif: () => boolean;
  orthoTuiles: () => TuileOrtho[];
  /** Une texture Poly Haven, partagee par URL et repetition (three/chargeurs.ts). */
  chargerTexturePolyhaven: (url: string, repetition?: number) => THREE_NS.Texture;
  /** Demonte la scene precedente avant d'en construire une nouvelle. */
  disposeThreeScene: () => void;
  /** Repose le soleil une fois la scene batie. */
  appliquerLumiereVue3d: () => void;
  applyMode3D: () => void;
  syncControlesSoleilVue3d: () => void;
}

/** Les couches calculees de la terrasse (engine/layers.ts). */
export type Couches = ReturnType<typeof computeTerrasseLayers>;

/**
 * Ce que chaque objet du plan rendu en contexte recoit. `sol` : le sol en relief dessine, ou `null`
 * (plat) ; `solMoteur` : le meme relief tel que le moteur le lit (engine/sol.ts), pour les hauteurs
 * d'appui, de poteau et de bord de bassin — `null` quand le sol dessine est plat. `objets` : le plan,
 * pour les calculs qui lisent d'autres objets (la plage d'une piscine, son relief).
 */
export interface ContexteObjets {
  prim: Primitives; scene: THREE_NS.Scene; versLocal: VersLocal; ctx: ContexteScene3d; sol: SolRelief | null; solMoteur: Sol | null; objets: ObjetPlan[];
  /** Le centre de la scene : les details d'un batiment s'allegent avec la distance. */
  centre: PtBrut;
  /** L'apparence du voisinage (model/voisinage3d.ts), lue sur la parcelle du projet. */
  voisinage3d: ReglagesVoisinage3d;
  /** La latitude du projet (son calage cadastral) : la tuile canal est celle du Midi. */
  latitude: number | null;
}

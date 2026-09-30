// Isoler la terrasse (2.2.1) : une bascule qui ne montre qu'elle, en 2D comme en 3D.
//
// Une terrasse selectionnee s'isole : les autres objets sont masques A L'AFFICHAGE (leur `hidden`
// n'est pas touche, `affichage.objetMasque`), la terrasse passe en transparence pour laisser voir sa
// structure — ses couches sur le plan, ses lambourdes et solives sous des lames translucides en 3D —,
// et la vue se recadre sur elle, dans la vue ouverte.
//
// **Sortir rend la vue d'avant**, exactement : le cadrage du plan (echelle et origine) et, si la
// Vue 3D etait ouverte, la position de sa camera et ce qu'elle visait. On sort en rebasculant, ou
// en quittant la terrasse : la selection d'autre chose, ou de rien, met fin a l'isolement — il ne
// survit pas a ce qu'il isole.
//
// Rien de tout cela n'entre dans le projet : `etat.isolement` est un etat d'affichage, comme la
// camera ou le zoom, et un plan enregistre pendant l'isolement s'enregistre tel qu'il est.

import { terrasseSelectionnee } from '../core/contexteTerrasse.js';
import type { EtatApp } from '../core/state.js';
import type { ObjetPlan } from '../model/types.js';

/** Une camera 3D, le temps de la rendre : sa position et le point qu'elle vise. */
export interface CameraRetenue { pos: { x: number; y: number; z: number }; cible: { x: number; y: number; z: number } }

export interface DependancesIsolement {
  etat: EtatApp;
  /** Redessine le plan. */
  render: () => void;
  /** Cadre le plan sur un objet, dans ce que les panneaux laissent voir (assemblage/cadrage.ts). */
  cadrer: (obj: ObjetPlan) => void;
  /** Vrai quand la Vue 3D est la vue ouverte. */
  vue3dOuverte: () => boolean;
  /** Reconstruit la Vue 3D ; `recadrer` : sur la scene telle qu'elle est, sans garder la camera. */
  reconstruire3d: (recadrer: boolean) => void;
  /** La camera de la Vue 3D, ou `null` sans scene. */
  lireCamera: () => CameraRetenue | null;
  poserCamera: (c: CameraRetenue) => void;
  /** Previent les zones : le bouton suit l'etat. */
  notifier: () => void;
}

export interface Isolement {
  /** Isole la terrasse selectionnee, ou sort de l'isolement. */
  basculer(): void;
  quitter(): void;
  /** A appeler a chaque changement : la terrasse isolee n'est plus selectionnee → on sort. */
  suivreSelection(): void;
  actif(): boolean;
}

export function creerIsolement(d: DependancesIsolement): Isolement {
  const { etat } = d;
  let avant: { echelle: number; origine: { x: number; y: number }; camera: CameraRetenue | null } | null = null;

  function entrer(t: ObjetPlan): void {
    avant = { echelle: etat.scene.scale, origine: { ...etat.scene.origine }, camera: d.vue3dOuverte() ? d.lireCamera() : null };
    etat.isolement = t.key;
    d.render();
    d.cadrer(t);
    if (d.vue3dOuverte()) d.reconstruire3d(true);
    d.notifier();
  }

  function quitter(): void {
    if (etat.isolement === null) return;
    etat.isolement = null;
    if (avant) etat.scene = { ...etat.scene, scale: avant.echelle, origine: { ...avant.origine } };
    d.render();
    if (d.vue3dOuverte()) {
      d.reconstruire3d(false);
      if (avant?.camera) d.poserCamera(avant.camera);
    }
    avant = null;
    d.notifier();
  }

  return {
    basculer() {
      if (etat.isolement !== null) { quitter(); return; }
      const t = terrasseSelectionnee(etat);
      if (t) entrer(t);
    },
    quitter,
    suivreSelection() {
      if (etat.isolement !== null && etat.selectedKey !== etat.isolement) quitter();
    },
    actif: () => etat.isolement !== null
  };
}

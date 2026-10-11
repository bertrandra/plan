// Les modes de diagnostic du plan : `?mode=devroof` et `?mode=devwall` dans l'adresse.
//
// Ils peignent chaque batiment d'une couleur qui dit d'ou vient son toit, ou ses murs, sur le plan
// et dans la Vue 3D, pour voir d'un coup d'oeil ce que la lecture en tache de fond (app/toitsFond.ts)
// a fait et ce qui reste. Rien n'est modifie dans le projet : c'est une couleur d'affichage, posee
// par-dessus celle de l'objet, et l'export ne la voit pas.
//
// devroof : rouge, pas encore traite (le LiDAR n'a pas ete lu) ; vert, toit lu sur le LiDAR ; orange,
// toit par defaut faute de LiDAR (lu, sans mesure exploitable) ; bleu, tout autre cas (toit saisi,
// lu sur une photo de facade...).
// devwall : rouge, couleur par defaut ; orange, couleur et texture des fichiers fonciers ; vert,
// couleur lue sur une photo de rue Panoramax.

import { toitAAjuster, toitLu, type ObjetAToit } from './toitsLidar.js';
import { couleurMursRetenue } from '../model/couleurMur.js';
import { estBatiment } from '../model/fonctions.js';
import type { ObjetPlan } from '../model/types.js';

export type ModeDiagnostic = 'devroof' | 'devwall';

/** Le mode lu dans l'adresse (`?mode=devroof`), ou null. */
export function modeDiagnostic(recherche: string = typeof location === 'undefined' ? '' : location.search): ModeDiagnostic | null {
  const m = new URLSearchParams(recherche).get('mode');
  return m === 'devroof' || m === 'devwall' ? m : null;
}

/** Des couleurs franches, lisibles sur la photo aerienne comme sur le fond clair ou sombre du plan. */
export const COULEURS_DIAGNOSTIC = { rouge: '#D7263D', vert: '#2E9E44', orange: '#F08A24', bleu: '#2B6CB0' } as const;

export type ClasseDiagnostic = 'rouge' | 'vert' | 'orange' | 'bleu';

/** D'ou vient le toit de ce batiment ; null pour ce qui n'est pas un batiment. */
export function classeToit(o: ObjetPlan): ClasseDiagnostic | null {
  if (!estBatiment(o)) return null;
  const a = o as ObjetAToit;
  if (a.toit?.source === 'lidar' || a.corpsToit?.length || a.toitMesure) return 'vert';
  if (!toitAAjuster(a)) return 'bleu';
  return toitLu(a) ? 'orange' : 'rouge';
}

/** D'ou vient la couleur des murs de ce batiment ; null pour ce qui n'est pas un batiment. */
export function classeMurs(o: ObjetPlan): ClasseDiagnostic | null {
  if (!estBatiment(o)) return null;
  const r = couleurMursRetenue(o);
  return r?.source === 'photo' ? 'vert' : r?.source === 'materiau' ? 'orange' : 'rouge';
}

/** La couleur d'affichage d'un objet dans ce mode ; null : sa couleur a lui. */
export function couleurDiagnostic(o: ObjetPlan, mode: ModeDiagnostic): string | null {
  const c = mode === 'devroof' ? classeToit(o) : classeMurs(o);
  return c ? COULEURS_DIAGNOSTIC[c] : null;
}

/** La legende du mode, dans l'ordre ou elle se lit. */
export const LEGENDES: Record<ModeDiagnostic, { titre: string; classes: { classe: ClasseDiagnostic; libelle: string }[] }> = {
  devroof: {
    titre: 'Toits',
    classes: [
      { classe: 'rouge', libelle: 'non traités' },
      { classe: 'vert', libelle: 'LiDAR' },
      { classe: 'orange', libelle: 'par défaut, sans LiDAR' },
      { classe: 'bleu', libelle: 'autres' },
    ],
  },
  devwall: {
    titre: 'Murs',
    classes: [
      { classe: 'rouge', libelle: 'par défaut' },
      { classe: 'orange', libelle: 'fichiers fonciers' },
      { classe: 'vert', libelle: 'photo Panoramax' },
    ],
  },
};

/** Combien de batiments dans chaque classe du mode. */
export function compterDiagnostic(objets: readonly ObjetPlan[], mode: ModeDiagnostic): Record<ClasseDiagnostic, number> {
  const n: Record<ClasseDiagnostic, number> = { rouge: 0, vert: 0, orange: 0, bleu: 0 };
  for (const o of objets) {
    const c = mode === 'devroof' ? classeToit(o) : classeMurs(o);
    if (c) n[c]++;
  }
  return n;
}

// Ce que la Vue 3D ouverte refait apres une restauration du projet (Ctrl+Z, « Réinitialiser tout », l'audit qui rend le plan) :
// rien, les seuls objets changes, ou toute la scene. Pur : la decision, pas le geste (app/assemblage/vues3d.ts le fait).
//
// La restauration recree tous les objets (core/historique.ts, point 4) ; elle dit lesquels ont change (point 7). La Vue 3D sait
// reposer un objet seul (three/sceneVivante.ts::remplacerObjets3d), comme le font la lecture des toits en tache de fond et la
// validation du Mode Toit : on s'en sert quand ce qui a change ne se lit que dans la pose de ces objets. Le reste de la scene lit
// plusieurs objets a la fois (la terrasse et ses piscines, la cloture, le relief et le centre de la parcelle, le voisinage) : la, on
// rebatit, comme le font les autres ecritures qui touchent ces objets.

import { egalProfond } from '../util/egalite.js';
import { estArbre, estBatiment, occupeLeSol } from '../model/fonctions.js';
import type { ObjetChange } from '../core/historique.js';
import type { ObjetPlan } from '../model/types.js';

/** Ce que la Vue 3D refait : rien, ces objets seuls (par leur cle), ou toute la scene. */
export type Redessin3d = { faire: 'rien' } | { faire: 'remplacer'; cles: string[] } | { faire: 'rebatir' };

/** La scene ouverte, telle que la decision a besoin de la connaitre. */
export interface SceneOuverte {
  /** La cle de la terrasse sur laquelle la scene a ete batie, et celle de la terrasse courante apres la restauration ; null : sans terrasse. */
  terrasseDeLaScene: string | null;
  terrasseCourante: string | null;
  /** « Tous les objets » : sans, la scene ne montre que la terrasse et ses piscines. */
  tousLesObjets: boolean;
  /** Un objet isole : la scene n'a que lui et ses associes, cadres sur eux. */
  isolement: string | null;
  /** La cle de l'objet dont la pelouse est percee par les empreintes des autres (la parcelle du projet), s'il est dans le plan. */
  pelouse: string | null;
}

/** Un objet qui se pose seul : ce qu'il montre ne depend que de lui (un batiment, ses toits, ses facades et leurs photos ; un arbre). */
function sePoseSeul(o: unknown): boolean {
  if (!o) return true;
  const x = o as ObjetPlan;
  return estBatiment(x) || estArbre(x);
}

/** Ce qu'un objet perce dans la pelouse : son empreinte, s'il occupe le sol et se voit. */
function empreinte(o: unknown): unknown {
  if (!o) return null;
  const x = o as ObjetPlan & { center?: unknown; r?: unknown };
  if (!occupeLeSol(x)) return null;
  return { type: x.type, pts: (x as { pts?: unknown }).pts ?? null, center: x.center ?? null, r: x.r ?? null, hidden: !!x.hidden, voisinage: !!x.voisinage };
}

/** Ce que la Vue 3D ouverte refait apres une restauration qui a change `changes`. */
export function redessinApresRestauration(changes: readonly ObjetChange[], scene: SceneOuverte): Redessin3d {
  if (!changes.length) return { faire: 'rien' };
  // La scene est cadree sur un objet isole, ou sur une autre terrasse que celle d'aujourd'hui : son centre et son etendue en dependent.
  if (scene.isolement || scene.terrasseDeLaScene !== scene.terrasseCourante) return { faire: 'rebatir' };
  const seuls = changes.every((c) => sePoseSeul(c.avant) && sePoseSeul(c.apres));
  // La scene ne montre que la terrasse et ses piscines : un batiment ou un arbre n'y est pas.
  if (!scene.tousLesObjets && scene.terrasseCourante !== null) return seuls ? { faire: 'rien' } : { faire: 'rebatir' };
  if (!seuls) return { faire: 'rebatir' };
  const cles = changes.map((c) => c.cle);
  // Un batiment qui bouge, apparait ou disparait perce autrement la pelouse de la parcelle : elle se repose avec lui.
  if (scene.pelouse && !cles.includes(scene.pelouse) && changes.some((c) => !egalProfond(empreinte(c.avant), empreinte(c.apres)))) cles.push(scene.pelouse);
  return { faire: 'remplacer', cles };
}

// A quelle hauteur se trouve le dessus d'un objet, en une seule definition (spec §6.3).
//
// Ces trois fonctions sont lues par le plan de coupe, la Vue 3D, la visionneuse GLB, le dossier PDF
// et le chiffrage. Elles vivaient au milieu du bloc terrasse ; les regrouper ici evite qu'une des
// vues reconstitue le calcul pour son compte et derive des autres.

import { estPlots, supportDe } from './constantes.js';
import { ensureConstruction } from './construction.js';
import { dimsSection, sectionLambourde } from './portees.js';
import { elevationParDefaut } from '../model/defaults.js';
import { solSousEmprise, type Sol } from './sol.js';
import type { Construction, PtBrut } from '../model/types.js';

/**
 * Ce dont la hauteur d'un objet depend : sa fonction, sa forme, ce qu'il porte.
 *
 * Cinq champs, pas un `ObjetPlan` entier — parce qu'aucune de ces trois fonctions ne lit une clef ni
 * un nom. Ce n'est pas une facilite de test : c'est le test qui l'a montre, en refusant d'inventer
 * une clef et un nom pour un objet dont on veut seulement connaitre la hauteur.
 *
 * Ecrit en toutes lettres plutot qu'en `Pick<ObjetPlan, ...>` : `ObjetPlan` est une union et `pts`
 * manque a l'un de ses membres, ce qu'un Pick refuse. Chaque membre de l'union reste assignable ici.
 */
export interface ObjetMesurable {
  fonction?: string;
  type?: string;
  pts?: readonly PtBrut[];
  elevation?: number;
  construction?: Construction;
}

/**
 * Ce que l'appui apporte **au-dessus du sol fini**, en millimetres.
 *
 * La distinction porte tout le reste : une vis de fondation est vissee dans le sol, sa longueur est
 * enterree et ne sureleve rien — seule sa tete reglable, si on la fait depasser, souleve la
 * structure. Un plot, lui, est pose sur le sol : toute sa hauteur de reglage compte. C'est ce qui
 * separe une terrasse sur vis, de plain-pied, d'une terrasse sur plots.
 */
export function hauteurAppuiMm(c: Construction): number {
  return estPlots(c) ? (c.hauteurPlot || 10) * 10 : (c.depassementVis || 0) * 10;
}

/**
 * Hauteur finie d'une terrasse : du sol fini au dessus des lames, en millimetres.
 *
 * C'est le chiffre qui decide d'une marche, d'un seuil de porte ou d'un garde-corps. Il
 * n'apparaissait nulle part explicitement — seulement de maniere implicite dans le plan de coupe.
 *
 * L'empilement depend du mode d'appui : des plots **sans** solives portent directement les
 * lambourdes, il n'y a alors pas de solive dans la hauteur.
 */
export function hauteurFinieMm(obj: ObjetMesurable): number {
  return hauteurStructureMm(obj) - decaissementPoseMm(obj);
}

/** La hauteur que la structure donne posee sur le terrain : appui + solive + lambourde + lame, en mm. */
export function hauteurStructureMm(obj: ObjetMesurable): number {
  const c = ensureConstruction(obj);
  const plotSimple = estPlots(c) && !c.plotAvecSolives;
  const soliveMm = plotSimple ? 0 : dimsSection(c.soliveSection).h;
  const lambMm = (c.avecLambourde || estPlots(c)) ? dimsSection(sectionLambourde(c)).h : 0;
  return hauteurAppuiMm(c) + soliveMm + lambMm + (c.epaisseurLame || 25);
}

/**
 * Une dalle a couler sous des plots est coulee en fond de fouille, son dessus a une hauteur de plot
 * sous le terrain : dalle + plot arrivent au ras du sol, la structure demarre au niveau du terrain
 * et les plots se posent sur la dalle.
 */
export function dalleEnFouille(c: Construction): boolean {
  return estPlots(c) && !!supportDe(c.supportType).dalleBeton;
}

/**
 * Le decaissement de pose, en mm : ce qu'il faut creuser pour que le dessus des lames tombe au
 * niveau fini demande (`niveauFini`). Sans niveau impose : zero, sauf sur une dalle a couler, qui
 * descend d'une hauteur de plot (`dalleEnFouille`). Zero aussi quand la structure arrive deja plus
 * bas — c'est alors la structure qu'il faudrait relever (plots, tete de vis), pas le terrain.
 */
export function decaissementPoseMm(obj: ObjetMesurable): number {
  const c = ensureConstruction(obj);
  if (c.niveauFini === undefined || c.niveauFini === null) return dalleEnFouille(c) ? hauteurAppuiMm(c) : 0;
  return Math.max(0, hauteurStructureMm(obj) - c.niveauFini * 10);
}

/**
 * Hauteur d'un objet, en **metres** au-dessus du sol.
 *
 * Une terrasse ne prend pas le champ manuel : elle a deja sa propre modelisation (appui +
 * structure + lame, ci-dessus), la seule source qui ne puisse pas se desynchroniser du chiffrage.
 * Tout le reste — maison, arbre, mobilier — n'a pas cette modelisation : la valeur est saisie a la
 * main, et a defaut on prend un ordre de grandeur par fonction, pour qu'un champ jamais touche
 * affiche quand meme quelque chose de plausible au premier essai (une maison n'est pas un massif).
 */
export function elevationOf(o: ObjetMesurable): number {
  if (o.fonction === 'terrasse' && o.type === 'polygon' && o.pts && o.pts.length >= 3) {
    return hauteurFinieMm(o) / 1000;
  }
  return (o.elevation !== undefined && o.elevation !== null) ? o.elevation : elevationParDefaut(o.fonction ?? '');
}

// ---- Le sol en pente (MD/spec-relief.md §6) ---------------------------------------------------

/** Un appui du moteur, tel que `buildVisGrid` le rend : un point et son role. */
export interface AppuiPose extends PtBrut { role: string }

/** Un appui avec sa hauteur propre : ce que le sol lui demande en plus de la hauteur reglee. */
export interface AppuiEnHauteur extends AppuiPose {
  /** Le sol sous l'appui, au-dessus du zero du plan. */
  zSol: number;
  /** La hauteur de l'appui au-dessus de son sol, en millimetres : la hauteur reglee, plus ce que le sol descend. */
  hauteurMm: number;
}

export interface AppuisEnHauteur {
  /** Le sol au point le plus haut sous la terrasse : la ou l'appui a la hauteur reglee. */
  zHaut: number;
  zBas: number;
  appuis: AppuiEnHauteur[];
  minMm: number;
  maxMm: number;
}

/**
 * La hauteur de chaque appui d'une terrasse sur un sol en pente : la hauteur reglee (`hauteurAppuiMm`)
 * au point le plus haut du sol sous la terrasse, et davantage partout ou le sol descend, pour que le
 * platelage soit de niveau. `null` sans sol : le terrain est plat, tous les appuis ont la hauteur reglee.
 * Un appui hors de la grille prend le sol du point le plus haut (donc la hauteur reglee).
 */
export function appuisEnHauteur(obj: ObjetMesurable, appuis: readonly AppuiPose[], sol: Sol | null | undefined): AppuisEnHauteur | null {
  if (!sol || !obj.pts || obj.pts.length < 3) return null;
  const s = solSousEmprise(sol, obj.pts);
  if (!s) return null;
  const base = hauteurAppuiMm(ensureConstruction(obj));
  const liste = appuis.map(a => {
    const zSol = sol.z(a) ?? s.zHaut;
    return { ...a, zSol, hauteurMm: Math.round(base + (s.zHaut - zSol) * 1000) };
  });
  const hauteurs = liste.map(a => a.hauteurMm);
  return { zHaut: s.zHaut, zBas: s.zBas, appuis: liste, minMm: hauteurs.length ? Math.min(...hauteurs) : base, maxMm: hauteurs.length ? Math.max(...hauteurs) : base };
}

/**
 * Le dessus d'une terrasse au-dessus du zero du plan, en metres : sa hauteur finie au-dessus du
 * sol, posee sur le point le plus haut du sol sous elle. Sans sol, la hauteur finie seule.
 */
export function dessusTerrasseM(obj: ObjetMesurable, sol: Sol | null | undefined): number {
  const z = obj.pts && obj.pts.length >= 3 ? (solSousEmprise(sol, obj.pts)?.zHaut ?? 0) : 0;
  return z + hauteurFinieMm(obj) / 1000;
}

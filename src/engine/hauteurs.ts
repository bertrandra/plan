// A quelle hauteur se trouve le dessus d'un objet, en une seule definition (spec §6.3).
//
// Ces trois fonctions sont lues par le plan de coupe, la Vue 3D, la visionneuse GLB, le dossier PDF
// et le chiffrage. Elles vivaient au milieu du bloc terrasse ; les regrouper ici evite qu'une des
// vues reconstitue le calcul pour son compte et derive des autres.

import { estPlots } from './constantes.js';
import { ensureConstruction } from './construction.js';
import { dimsSection, sectionLambourde } from './structure.js';
import { elevationParDefaut } from '../model/defaults.js';

/**
 * Ce que l'appui apporte **au-dessus du sol fini**, en millimetres.
 *
 * La distinction porte tout le reste : une vis de fondation est vissee dans le sol, sa longueur est
 * enterree et ne sureleve rien — seule sa tete reglable, si on la fait depasser, souleve la
 * structure. Un plot, lui, est pose sur le sol : toute sa hauteur de reglage compte. C'est ce qui
 * separe une terrasse sur vis, de plain-pied, d'une terrasse sur plots.
 */
export function hauteurAppuiMm(c): number {
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
export function hauteurFinieMm(obj): number {
  const c = ensureConstruction(obj);
  const plotSimple = estPlots(c) && !c.plotAvecSolives;
  const soliveMm = plotSimple ? 0 : dimsSection(c.soliveSection).h;
  const lambMm = (c.avecLambourde || estPlots(c)) ? dimsSection(sectionLambourde(c)).h : 0;
  return hauteurAppuiMm(c) + soliveMm + lambMm + (c.epaisseurLame || 25);
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
export function elevationOf(o): number {
  if (o.fonction === 'terrasse' && o.type === 'polygon' && o.pts && o.pts.length >= 3) {
    return hauteurFinieMm(o) / 1000;
  }
  return (o.elevation !== undefined && o.elevation !== null) ? o.elevation : elevationParDefaut(o.fonction);
}

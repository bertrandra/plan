// Ce que chaque calcul et chaque dessin lit des objets du plan (MD/spec-ouvrages.md, « Le controleur suit ces fleches » ; etape 6.5).
//
// Une ecriture faisait refaire tout ce qui lit le plan : la version de l'ensemble (core/controleurObjets.ts) change a chaque objet
// touche. Ce qui ne lit que certains objets se garde maintenant sur leur seule version (`cleDesLus`), d'apres ces lecteurs : un arbre
// qu'on glisse ne refait ni la terrasse, ni son chiffrage, ni le calque des parasols. Chaque lecteur est large (il prend une famille
// entiere plutot que l'objet exact) : un objet de trop refait un calcul pour rien, un objet oublie le laisserait faux. Le garde-fou
// `[cle de version]` des zones, des calques et du plan verifie en developpement qu'aucun ne manque.
//
// Un lecteur est une fonction gardee (une constante de module) : `cleDesLus` reprend sa cle tant que rien n'a ete ecrit.

import { estOuvrage, EQUIPEMENT } from '../model/ouvrages/index.js';
import { estAbri, estBatiment, estBati, estParasol, estPiscine, estTerrain, estTerrasse, estTrou } from '../model/fonctions.js';
import type { ObjetPlan } from '../model/types.js';

/** Ce qui perce une terrasse et que son dessin decoupe : les bassins et les trous (engine/ouvrages/liens.ts). */
export const percentUneTerrasse = (o: ObjetPlan): boolean => estPiscine(o) || estTrou(o);

/**
 * Ce que lit le calcul d'une terrasse (structure, appuis, couches, nomenclature, surface nette) : les terrasses, ce qui les perce,
 * les equipements qui resserrent les appuis (engine/structure.ts), et les terrains (le relief, le sol sous l'emprise).
 */
export const litUneTerrasse = (o: ObjetPlan): boolean =>
  estTerrasse(o) || estPiscine(o) || estTrou(o) || estOuvrage(o, EQUIPEMENT) || estTerrain(o);

/** Les terrasses et ce qui les perce : leur surface nette (l'explorateur la montre). */
export const lesTerrassesPercees = (o: ObjetPlan): boolean => estTerrasse(o) || estPiscine(o) || estTrou(o);

/** Les terrains : la parcelle du projet (son relief, sa cloture, le calque de la photo) et les parcelles voisines. */
export const lesTerrains = (o: ObjetPlan): boolean => estTerrain(o);

/** Le calque des parasols : leurs ombres et leurs mats, sur la terrasse qui les porte. */
export const litLesParasols = (o: ObjetPlan): boolean => estParasol(o) || estTerrasse(o);

/** Le calque des piscines : leurs abords, et la terrasse qui leur sert de plage (ou qu'on isole avec elles). */
export const litLesPiscines = (o: ObjetPlan): boolean => estPiscine(o) || estTerrasse(o);

/** Le calque des pergolas et carports : leur charpente, posee sur le sol du terrain. */
export const litLesAbris = (o: ObjetPlan): boolean => estAbri(o) || estTerrain(o);

/** Le calque des releves et de la cloture : les batiments et leurs facades relevees, la parcelle et sa cloture. */
export const litLesReleves = (o: ObjetPlan): boolean => estBatiment(o) || estBati(o) || !!o.batiment?.facades?.length || estTerrain(o);

/** Aucun objet : ce qui ne lit que la vue (la fleche du nord, l'echelle). */
export const rien = (): boolean => false;

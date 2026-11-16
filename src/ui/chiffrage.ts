// Le resume du chiffrage d'une terrasse (spec-ihm-mobile §6.4 et §6.5).
//
// Sur telephone, le tiroir des resultats n'est pas visible en meme temps que l'inspecteur : la
// boucle reglage → chiffrage de la spec des zones (§7.1) se perdrait. La feuille de selection et le
// bandeau de l'inspecteur rendent donc un resume — le meme calcul que la table du BOM
// (zones/resultats/Nomenclature.tsx), sans rien ecrire : ni `construction.bom`, ni le DOM.
//
// Le calcul refait les couches de la terrasse ; il est donc mis en cache sur ce qui le determine
// (l'objet et ses voisins), pour qu'un glisser qui redessine a chaque image ne le relance pas.

import { computeBOM } from '../engine/bom.js';
import { solDuProjet } from '../engine/sol.js';
import { computeTerrasseLayers } from '../engine/layers.js';
import { ensureConstruction } from '../engine/construction.js';
import { estPlots } from '../engine/constantes.js';
import type { ObjetPlan, LigneBom } from '../model/types.js';
import { estTerrasse } from '../model/fonctions.js';
import { cleDuPlanLu } from './clePlan.js';
import { litUneTerrasse } from '../core/lectures.js';

export interface ResumeChiffrage {
  /** Fourchette estimee, en euros, comme « Estime : X € – Y € » sous la table du BOM. */
  bas: number;
  haut: number;
  /** Somme des prix reels saisis, ou `null` quand aucun ne l'est. */
  reel: number | null;
  /** Le nombre d'appuis et leur nature. */
  appuis: number;
  natureAppuis: 'plots' | 'vis';
  /** Les lames achetees, en metres lineaires. */
  lamesMl: number;
  /** Le bois porteur achete (solives, lambourdes, cadre), en metres lineaires. */
  porteurMl: number;
  /** La surface couverte, en m² (le poste de visserie est compte au m²). */
  surface: number;
}

/** Les totaux d'une nomenclature : fourchette estimee, et somme des prix reels saisis. */
export interface TotauxBom {
  bas: number;
  haut: number;
  /** Somme des prix reels saisis, ou `null` quand aucun ne l'est. */
  reel: number | null;
}

/**
 * Les totaux des lignes du BOM : le prix bas et le prix haut de chaque ligne fois sa quantite, et les
 * prix reels (deja des totaux de ligne) quand il y en a. Une seule somme, lue par la table de la
 * Nomenclature (sa ligne de total), les tuiles, la barre d'estimation et le pied du telephone : ils ne
 * peuvent pas dire deux nombres pour une terrasse. Rien de ce total ne part dans un export.
 */
export function totauxBom(lignes: readonly LigneBom[]): TotauxBom {
  let bas = 0, haut = 0, reel = 0, auMoinsUnReel = false;
  for (const l of lignes) {
    bas += (l.prixBas || 0) * l.qte;
    haut += (l.prixHaut || 0) * l.qte;
    if (l.prixReel !== null && l.prixReel !== undefined) { reel += l.prixReel; auMoinsUnReel = true; }
  }
  return { bas, haut, reel: auMoinsUnReel ? reel : null };
}

let cache: { cle: string; resume: ResumeChiffrage } | null = null;

// La cle : la version de ce que lit une terrasse, que tient le controleur des objets (ui/clePlan.ts, core/lectures.ts).

export function resumerChiffrage(obj: ObjetPlan, objets: ObjetPlan[]): ResumeChiffrage | null {
  if (!estTerrasse(obj)) return null;
  const cle = cleDuPlanLu(objets, litUneTerrasse);
  if (cache && cache.cle === cle + obj.key) return cache.resume;
  const c = ensureConstruction(obj);
  const couches = computeTerrasseLayers(obj, objets);
  const lignes: LigneBom[] = computeBOM(obj, couches, solDuProjet(objets));
  const resume: ResumeChiffrage = {
    ...totauxBom(lignes),
    appuis: couches.vis.length,
    natureAppuis: estPlots(c) ? 'plots' : 'vis',
    lamesMl: lignes.find(l => l.poste === 'lames')?.qte ?? 0,
    porteurMl: lignes.filter(l => l.unite === 'ml' && l.poste !== 'lames' && l.poste !== 'lameRive').reduce((s, l) => s + l.qte, 0),
    surface: lignes.find(l => l.poste === 'visserie')?.qte ?? 0
  };
  cache = { cle: cle + obj.key, resume };
  return resume;
}

/** « 1 842 € », a la francaise. */
export const euros = (v: number) => Math.round(v).toLocaleString('fr-FR') + ' €';

/** « 1 842,50 € », au centime : un prix reel saisi se relit tel qu'il a ete tape. */
export const eurosCentimes = (v: number) => v.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';

/** « 269,4 », a la francaise, sans decimale superflue. */
export const nombre = (v: number, decimales = 1) => v.toLocaleString('fr-FR', { maximumFractionDigits: decimales });

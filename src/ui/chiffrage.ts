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
import { chiffreFrGroupe } from '../util/format.js';

export interface ResumeChiffrage extends TotauxBom {
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

/** Les totaux d'une nomenclature : fourchette estimee, somme des prix reels, et le total retenu. */
export interface TotauxBom {
  bas: number;
  haut: number;
  /** Somme des prix reels (saisis ou calcules sur le debit), ou `null` quand aucun ne l'est. */
  reel: number | null;
  /**
   * Le total retenu (audit UX de la 5.45.0, constat 5) : chaque ligne a son prix saisi, sinon son prix calcule sur le debit,
   * sinon le milieu de sa fourchette. Un seul nombre a l'ecran, la fourchette en second.
   */
  retenu: number;
  /** Combien de lignes portent un prix saisi, un prix calcule, ou le milieu de leur fourchette. */
  saisis: number;
  calcules: number;
  auMilieu: number;
}

/**
 * Les totaux des lignes du BOM : le prix bas et le prix haut de chaque ligne fois sa quantite, et les
 * prix reels (deja des totaux de ligne) quand il y en a. Une seule somme, lue par la table de la
 * Nomenclature (sa ligne de total), les tuiles, la barre d'estimation et le pied du telephone : ils ne
 * peuvent pas dire deux nombres pour une terrasse. Rien de ce total ne part dans un export.
 */
export function totauxBom(lignes: readonly LigneBom[]): TotauxBom {
  let bas = 0, haut = 0, reel = 0, auMoinsUnReel = false, retenu = 0, saisis = 0, calcules = 0, auMilieu = 0;
  for (const l of lignes) {
    const b = (l.prixBas || 0) * l.qte, h = (l.prixHaut || 0) * l.qte;
    bas += b;
    haut += h;
    const prix = l.prixReel !== null && l.prixReel !== undefined ? l.prixReel : null;
    if (prix !== null) { reel += prix; auMoinsUnReel = true; }
    if (prix !== null) { retenu += prix; if (l.calcule) calcules++; else saisis++; }
    else { retenu += (b + h) / 2; if (b || h) auMilieu++; }
  }
  return { bas, haut, reel: auMoinsUnReel ? reel : null, retenu, saisis, calcules, auMilieu };
}

/** D'ou vient le total retenu, en mots : « 2 prix saisis, 4 calculés, 1 au milieu de la fourchette ». */
export function origineDuRetenu(t: Pick<TotauxBom, 'saisis' | 'calcules' | 'auMilieu'>): string {
  const parts: string[] = [];
  if (t.saisis) parts.push(t.saisis + (t.saisis > 1 ? ' prix saisis' : ' prix saisi'));
  if (t.calcules) parts.push(t.calcules + (t.calcules > 1 ? ' calculés' : ' calculé') + ' sur le débit');
  if (t.auMilieu) parts.push(t.auMilieu + ' au milieu de la fourchette');
  return parts.join(', ');
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

/**
 * Un seul format de nombre a l'ecran (audit UX de la 5.45.0, constat 5) : les milliers separes partout, par l'utilitaire des
 * exports (`chiffreFrGroupe`), avec des espaces insecables pour qu'un montant ne se coupe pas en fin de ligne.
 */
const insecable = (t: string) => t.replace(/ /g, '\u00a0');

/** « 1 842 € », a la francaise. */
export const euros = (v: number) => insecable(chiffreFrGroupe(v, 0) + ' €');

/** « 1 842,50 € », au centime : un prix reel saisi se relit tel qu'il a ete tape. */
export const eurosCentimes = (v: number) => insecable(chiffreFrGroupe(v, 2) + ' €');

/** « 269,4 », a la francaise, sans decimale superflue. */
export const nombre = (v: number, decimales = 1) => v.toLocaleString('fr-FR', { maximumFractionDigits: decimales });

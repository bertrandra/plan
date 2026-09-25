// Le resume du chiffrage d'une terrasse (spec-ihm-mobile §6.4 et §6.5).
//
// Sur telephone, le tiroir des resultats n'est pas visible en meme temps que l'inspecteur : la
// boucle reglage → chiffrage de la spec des zones (§7.1) se perdrait. La feuille de selection et le
// bandeau de l'inspecteur rendent donc un resume — le meme calcul que la table du BOM
// (tables.ts, `renderBOMTable`), sans rien ecrire : ni `construction.bom`, ni le DOM.
//
// Le calcul refait les couches de la terrasse ; il est donc mis en cache sur ce qui le determine
// (l'objet et ses voisins), pour qu'un glisser qui redessine a chaque image ne le relance pas.

import { computeBOM } from '../engine/bom.js';
import { computeTerrasseLayers } from '../engine/layers.js';
import { ensureConstruction } from '../engine/construction.js';
import { estPlots } from '../engine/constantes.js';
import type { ObjetPlan, LigneBom } from '../model/types.js';

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
}

let cache: { cle: string; resume: ResumeChiffrage } | null = null;

export function resumerChiffrage(obj: ObjetPlan, objets: ObjetPlan[]): ResumeChiffrage | null {
  if (obj.fonction !== 'terrasse' || obj.type !== 'polygon') return null;
  const cle = JSON.stringify(objets);
  if (cache && cache.cle === cle + obj.key) return cache.resume;
  const c = ensureConstruction(obj);
  const couches = computeTerrasseLayers(obj, objets);
  const lignes: LigneBom[] = computeBOM(obj, couches);
  let bas = 0, haut = 0, reel = 0, auMoinsUnReel = false;
  for (const l of lignes) {
    bas += (l.prixBas || 0) * l.qte;
    haut += (l.prixHaut || 0) * l.qte;
    if (l.prixReel !== null && l.prixReel !== undefined) { reel += l.prixReel; auMoinsUnReel = true; }
  }
  const resume: ResumeChiffrage = {
    bas, haut, reel: auMoinsUnReel ? reel : null,
    appuis: couches.vis.length,
    natureAppuis: estPlots(c) ? 'plots' : 'vis',
    lamesMl: lignes.find(l => l.poste === 'lames')?.qte ?? 0
  };
  cache = { cle: cle + obj.key, resume };
  return resume;
}

/** « 1 842 € », a la francaise. */
export const euros = (v: number) => Math.round(v).toLocaleString('fr-FR') + ' €';

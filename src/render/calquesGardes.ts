// Les calques du plan qui ne se redessinent que si ce qu'ils lisent a change (MD/roadmap-architecture.md, etape 6.5).
//
// Les calques poses au-dessus des objets (ombres et mats des parasols, piscines, pergolas, releves et cloture, cotes, echelle,
// fleche du nord, couches de la terrasse) etaient vides et refaits a chaque rendu du plan, meme quand rien n'avait bouge. A 600
// objets au telephone, ces noeuds recrees coutaient au navigateur (style et mise en page de l'image suivante) presque autant que
// le dessin lui-meme. Chacun garde maintenant la cle de son dernier dessin ; une cle inchangee laisse le calque tel quel.
//
// La cle de chaque calque : les objets qu'il lit (leur version, core/controleurObjets.ts `cleDesLus`, d'apres les lecteurs de
// core/lectures.ts : le calque des parasols lit les parasols et les terrasses, pas l'arbre qu'on glisse), le repere du dessin (son
// echelle et sa taille, render/repere.ts : un deplacement de la vue n'y change rien), la selection et l'etat d'interface du plan,
// les cotes et leur brouillon, les encres du theme. Un calque ne se refait donc que quand ce qu'il montre bouge.
//
// Le garde-fou, comme celui des objets (render/pipeline.ts) et des zones (zones/composants/abonnement.ts) : en developpement, le
// calque est quand meme redessine et compare a ce qu'il montrait ; un ecart (une donnee lue que la cle oublie) s'ecrit
// `[cle de version]` dans la console, ce que la fumee fait echouer. Le banc du rendu l'eteint (`__sansVerifierCles`).

import { cleDesLus } from '../core/controleurObjets.js';
import { soleilDuProjet } from '../core/soleil.js';
import { mesure } from '../interaction/outilMesure.js';
import { ortho } from './ortho.js';
import { terrasseLayerVisible } from './terrasseCouches.js';
import { SVG_INK, SVG_GRID_MAJOR, SVG_LABEL_HALO, SVG_MEASURE_LINE, SVG_MEASURE_TEXT, SVG_POIGNEE, SVG_POIGNEE_FOND, SVG_PASTILLE,
  SVG_PASTILLE_TEXTE, SVG_RELIEF } from './theme.js';
import type { EtatApp } from '../core/state.js';

const cles = new WeakMap<Element, string>();

const verifier = (): boolean => import.meta.env.DEV && !(globalThis as { __sansVerifierCles?: boolean }).__sansVerifierCles;

/**
 * Ce que lit un calque du dessus : les objets que `lit` retient (core/lectures.ts), la scene du dessin et l'etat d'interface ; la
 * meme cle tant que rien de cela n'a change. `etat` porte la scene du dessin (le repere), pas la vue.
 */
export function cleDesCalques(etat: EtatApp, lit: (o: EtatApp['objects'][number]) => boolean, ...autres: unknown[]): string {
  const s = etat.scene, p = etat.parasol, soleil = soleilDuProjet.lire();
  return JSON.stringify([cleDesLus(etat.objects, lit), s.scale, s.origine.x, s.origine.y, s.W, s.H, etat.selectedKey, etat.terrasseSelectedKey,
    etat.isolement, etat.voisinageVisible, etat.calquesVisibles, etat.showNorth, p.ombreAffichee, p.carteAffichee, soleil.dateStr, soleil.minutes,
    etat.measures, mesure.pointage, mesure.ref, mesure.startEnd, mesure.cibles, terrasseLayerVisible, ortho.actif, ortho.parcelleOpacite,
    SVG_INK, SVG_GRID_MAJOR, SVG_LABEL_HALO, SVG_MEASURE_LINE, SVG_MEASURE_TEXT, SVG_POIGNEE, SVG_POIGNEE_FOND, SVG_PASTILLE,
    SVG_PASTILLE_TEXTE, SVG_RELIEF, ...autres]);
}

/**
 * Redessine ces calques (`dessiner` les vide et les refait) si leur cle a change depuis leur dernier dessin. Plusieurs calques
 * dessines ensemble (les ombres et les mats des parasols) partagent une cle, gardee sur le premier.
 */
export function redessinerSiChange(calques: Element | readonly Element[], nom: string, cle: string, dessiner: () => void): void {
  const liste = Array.isArray(calques) ? calques as readonly Element[] : [calques as Element];
  const premier = liste[0];
  if (!premier) { dessiner(); return; }
  if (cles.get(premier) !== cle) { dessiner(); cles.set(premier, cle); return; }
  if (!verifier()) return;
  const avant = liste.map((c) => c.innerHTML);
  dessiner();
  if (liste.some((c, i) => c.innerHTML !== avant[i])) {
    console.error(`[cle de version] calque « ${nom} » : son dessin a change sans que sa cle change ; il serait reste tel quel dans le paquet livre`);
  }
}

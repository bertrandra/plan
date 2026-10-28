// Ce que la piscine publie : ce que les autres ouvrages et les autres couches ont le droit d'en lire (MD/spec-ouvrages.md,
// etape 6.6). Le reste du moteur de la piscine (engine/piscine/) lui est interne.
//
// La creation d'une plage passe par ici : la piscine pose autour d'elle une terrasse du plan, dont elle demande a la terrasse ce
// qu'est une terrasse neuve et la hauteur de sa structure (engine/ouvrages/terrasse.ts), puis la lie par sa cle
// (engine/ouvrages/liens.ts).

import type { Construction, ObjetPlan, PtBrut } from '../../model/types.js';
import { PLOT_HAUTEUR_MAX_CM } from '../bois/platelage.js';
import { calculerPiscine } from '../piscine/calcul.js';
import { elargir } from '../piscine/geometrie.js';
import { EPAISSEUR_MARGELLE_M } from '../piscine/reglages.js';
import { constructionTerrasseNeuve, hauteurStructureMm } from './terrasse.js';

export { bordDuBassin } from '../piscine/geometrie.js';

/**
 * La construction de la terrasse posee autour d'un bassin (plage « terrasse du plan ») : une
 * terrasse neuve sur plots, le dessus des lames au ras des margelles (ou du haut des parois sans
 * margelle). Plus bas que la structure, la terrasse se pose dans un decaissement ; plus haut (bassin
 * semi-enterre ou hors-sol), les plots montent de l'ecart, dans leur domaine (`PLOT_HAUTEUR_MAX_CM`).
 * Une ancienne plage en bois calculee garde son essence.
 */
export function constructionDeLaPlage(piscine: ObjetPlan): Construction {
  const construction = constructionTerrasseNeuve();
  const essence = piscine.piscine?.essencePlage;
  if (essence) construction.essenceBois = essence;
  const calc = calculerPiscine(piscine);
  if (!calc) return construction;
  construction.niveauFini = Math.round((calc.hauteurHorsSol + (calc.reglages.margelle ? EPAISSEUR_MARGELLE_M : 0)) * 1000) / 10;
  // Au centimetre superieur : le peu qui depasse se reprend dans le decaissement.
  const manque = construction.niveauFini * 10 - hauteurStructureMm({ construction });
  if (manque > 0) construction.hauteurPlot = Math.min(PLOT_HAUTEUR_MAX_CM, Math.ceil((construction.hauteurPlot || 10) + manque / 10));
  return construction;
}

/**
 * Le contour d'une terrasse a poser autour du bassin : l'exterieur des margelles elargi de la
 * largeur de plage. Un bassin polygonal donne le meme nombre de coins ; un bassin rond, le carre qui
 * l'entoure — quatre coins faciles a tirer plutot que quarante-huit. `null` si le bassin n'est pas
 * calculable.
 */
export function contourTerrasseAutour(o: ObjetPlan): PtBrut[] | null {
  const calc = calculerPiscine(o);
  if (!calc) return null;
  const ext = elargir(calc.margelleExt, calc.reglages.largeurPlage);
  if (o.type !== 'circle') return ext;
  const xs = ext.map(p => p.x), ys = ext.map(p => p.y);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  return [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];
}

// Ce qu'une ligne de proposition vise, a surligner dans la Vue 3D avant / apres (demande de l'utilisateur, 18 octobre 2026 :
// « a la selection de la ligne, la forme est surlignee dans la 3D ») : le mur d'une facade, le corps de toit qu'une ligne
// relit seul, ou le contour du batiment (de la parcelle). Les formes se lisent sur le plan d'avant : elles sont les memes dans
// les deux vues. Pur.

import { facadesDuContour } from '../../../facade/geometrie.js';
import { hauteurDe, type Proposition } from '../../../regles/decisions.js';
import { hauteurMurSousToit } from './liste.js';
import type { ObjetPlan, PtBrut } from '../../../model/types.js';

/** Une forme a surligner : une ligne de points du plan, tracee a deux hauteurs (au-dessus du sol) et reliee par des verticales. */
export interface FormeSurlignee { pts: PtBrut[]; bas: number; haut: number; ferme: boolean }

/** Les formes d'une ligne, et d'ou la regarder : devant un mur (sa normale sortante), sinon d'ou l'on est. */
export interface Surbrillance { formes: FormeSurlignee[]; centre: PtBrut; hautM: number; normale: PtBrut | null }

const centreDe = (pts: readonly PtBrut[]): PtBrut => ({ x: pts.reduce((s, p) => s + p.x, 0) / pts.length, y: pts.reduce((s, p) => s + p.y, 0) / pts.length });
const sommets = (o: ObjetPlan | undefined): PtBrut[] | null => (o && 'pts' in o && Array.isArray(o.pts) && o.pts.length >= 3 ? (o.pts as PtBrut[]) : null);

/** La surbrillance d'une ligne de proposition ; null quand ce qu'elle vise n'est plus dans le plan. */
export function surbrillanceDe(p: Proposition, objets: readonly ObjetPlan[]): Surbrillance | null {
  if (p.cible.type === 'parcelle') {
    const pts = sommets(objets.find((o) => o.key === 'parcelle'));
    return pts ? { formes: [{ pts, bas: 0, haut: 0.3, ferme: true }], centre: centreDe(pts), hautM: 0.3, normale: null } : null;
  }
  const { cle } = p.cible;
  const o = objets.find((x) => x.key === cle);
  const pts = sommets(o);
  if (!o || !pts) return null;
  const faite = Math.max(hauteurDe(o), ...(o.corpsToit ?? []).map((c) => c.faitage));
  if (p.cible.type === 'facade') {
    const cote = p.cible.cote;
    const f = facadesDuContour(pts, hauteurDe(o)).find((x) => x.cote === cote);
    if (!f) return null;
    const haut = hauteurMurSousToit(o, f);
    return { formes: [{ pts: [f.gauche, f.droite], bas: 0, haut, ferme: false }], centre: centreDe([f.gauche, f.droite]), hautM: haut, normale: f.normale };
  }
  // Une ligne qui relit un seul corps du toit : ce corps, du sol au faitage.
  if (p.effet.type === 'corpsDuToit') {
    const c = o.corpsToit?.[p.effet.corps];
    if (c) return { formes: [{ pts: c.pts, bas: 0, haut: c.faitage, ferme: true }], centre: centreDe(c.pts), hautM: c.faitage, normale: null };
  }
  return { formes: [{ pts, bas: 0, haut: faite, ferme: true }], centre: centreDe(pts), hautM: faite, normale: null };
}

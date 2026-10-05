// La piscine en 3D (three/).
//
// Le sol de la scene est un plan opaque : on ne creuse pas dedans. Un bassin enterre se voit donc
// par son plan d'eau, pose juste au-dessus du sol, et par ses margelles ; un bassin semi-enterre
// ou hors-sol dresse ses parois, l'eau a la revanche sous leur haut, les margelles dessus. La plage
// en bois est posee a sa hauteur, sur ses poutres et ses poteaux quand elle est en l'air ; un
// dallage est une bande au sol. Tout est tire d'`engine/piscine.ts` : rien n'est recalcule ici.

import { calculerPiscine, elargir, EPAISSEUR_MARGELLE_M, REVANCHE_M } from '../engine/piscine.js';
import type { ObjetPlan, PtBrut } from '../model/types.js';
import type { Primitives } from './primitives.js';

/** Epaisseur minimale d'une paroi dessinee : une coque d'un centimetre disparaitrait. */
const PAROI_MIN_M = 0.06;
const COULEUR_PAROI = { coque: '#e8eef0', maconnerie: '#b8b4ac', kit: '#8d6b4a' } as const;
const LAME_M = 0.027;
const SOLIVE_M = 0.175;
const POUTRE_M = 0.2;

export function ajouterPiscine3d(prim: Primitives, o: ObjetPlan): void {
  const calc = calculerPiscine(o);
  if (!calc) return;
  const r = calc.reglages;
  const H = calc.hauteurHorsSol;
  const parois = elargir(calc.contour, Math.max(PAROI_MIN_M, calc.parois === calc.contour ? 0 : 0.01));
  if (H > 0.01) {
    prim.addBande({ ext: parois, int: calc.contour }, 0, H, COULEUR_PAROI[r.structure]);
    prim.addRibbonFlat(calc.contour, r.couleurEau, Math.max(0.012, H - REVANCHE_M), 0.85);
  } else {
    prim.addRibbonFlat(calc.contour, r.couleurEau, 0.012, 0.9);
  }
  if (r.margelle) prim.addBande({ ext: calc.margelleExt, int: calc.contour }, H, EPAISSEUR_MARGELLE_M, r.couleurMargelle);
  if (r.plage === 'dallage') prim.addBande({ ext: calc.plageExt, int: calc.margelleExt }, H, EPAISSEUR_MARGELLE_M, r.couleurPlage);
  const pb = calc.plageBois;
  if (!pb) return;
  // Les lames, affleurant les margelles ; dessous, en l'air, les poutres et leurs poteaux.
  prim.addBande({ ext: calc.plageExt, int: calc.margelleExt }, pb.dessus - LAME_M, LAME_M, r.couleurPlage);
  if (pb.mode === 'poteaux') {
    const basPoutre = pb.dessus - LAME_M - SOLIVE_M - POUTRE_M;
    pb.anneauxPoutres.forEach(anneau => prim.addBande({ ext: elargir(anneau, 0.0375), int: elargir(anneau, -0.0375) }, basPoutre, POUTRE_M, '#6b4a2a'));
    pb.poteauxPositions.forEach(p => prim.addPrism(carre(p, 0.12), 0, basPoutre, '#6b4a2a'));
  } else {
    // Au ras du sol : une bande de structure sous les lames, pour que la plage ait son epaisseur.
    prim.addBande({ ext: calc.plageExt, int: calc.margelleExt }, Math.max(0, pb.dessus - LAME_M - 0.07), 0.07, '#6b4a2a');
  }
}

function carre(c: PtBrut, cote: number): PtBrut[] {
  const d = cote / 2;
  return [{ x: c.x - d, y: c.y - d }, { x: c.x + d, y: c.y - d }, { x: c.x + d, y: c.y + d }, { x: c.x - d, y: c.y + d }];
}

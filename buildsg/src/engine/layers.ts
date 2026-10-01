// Calques d une terrasse : lames, lambourdes, solives, cadre
//
// Deplace depuis legacy.ts sans retouche : l ordre des operations est conserve tel quel, y compris
// la ou il produit des artefacts de flottants. Ce sont eux qui prouvent que l arithmetique n a pas
// bouge (spec-migration-typescript.md §10.2) - les "nettoyer" serait un changement de comportement.

import { ringSegments } from '../geometry/polygon.js';
import { ensureConstruction } from './construction.js';
import { enPoints } from '../model/formes.js';
import { generateParallelLines } from './lames.js';
import { buildVisGrid, computeStructure, safeOffset } from './structure.js';
import type { ObjetPlan } from '../model/types.js';

export function computeTerrasseLayers(obj: ObjetPlan, objets: ObjetPlan[]){
  const c = ensureConstruction(obj);
  const pts = enPoints(obj).pts;
  // `const n = obj.pts.length` : variable morte dans le fichier d origine, retiree - son
  // initialisation ne fait que lire une longueur, donc aucun effet de bord perdu.
  const S = computeStructure(enPoints(obj), objets);
  const lamesAngle = S.lamesAngle;

  const vis = buildVisGrid(enPoints(obj), S, objets);
  const cadre = S.cadre;
  // The spa reinforcement beams are solives like any other once they exist: same section, same
  // price, drawn on the same layer.
  const solives = S.solives.concat(S.solivesSpa);
  const lambourdes = S.lambourdes;
  const largeurLameM = (c.largeurLame||140)/1000;
  const riveEp = (c.epaisseurLameRive||22)/1000;
  const boardSpacing = largeurLameM + (c.jeuLames!==undefined ? c.jeuLames : 6)/1000;

  // Avec "lame a plat" active, le champ de lames s'arrete a une largeur de lame du bord
  // (au lieu de courir jusqu'au contour) pour laisser la place a la bordure - le contour
  // retreci garde la meme forme/angles que la terrasse, donc les extremites des lames
  // suivent toujours le bon angle, juste plus court.
  const lamesFieldPoly = c.avecLamePlat ? safeOffset(pts, largeurLameM) : pts;
  const lames = generateParallelLines(lamesFieldPoly, lamesAngle, boardSpacing);

  // Lame de rive : habillage suspendu qui fait le tour de la terrasse, decale vers
  // l'exterieur d'une demi-epaisseur pour que sa face interieure soit a l'aplomb du
  // contour reel. Anneau a onglets : decaler chaque cote separement laisserait un coin
  // ouvert a chaque angle saillant et un croisement a chaque angle rentrant.
  const lameRive = c.avecLameRive
    ? ringSegments(safeOffset(pts, -riveEp/2))
    : [];
  // Lame a plat : meme contour, posee a plat au niveau des lames (bordure/cadre de
  // finition), decalee vers l'interieur d'une demi-largeur pour occuper exactement la
  // bande laissee libre par le retrecissement du champ de lames ci-dessus, bord exterieur
  // a l'aplomb du contour reel.
  const lamePlat = c.avecLamePlat
    ? ringSegments(safeOffset(pts, largeurLameM/2))
    : [];

  // Ring pieces are given as the pair of rings that bound them, not just a centreline. A ring
  // drawn as a chain of boxes leaves every corner uncut - the mitre only exists if the corner
  // points of both the outer and the inner ring are used, which is exactly what these carry.
  const bandes = {
    cadre: { ext: safeOffset(pts, S.cadreOff - S.soliveW/2),
             int: safeOffset(pts, S.cadreOff + S.soliveW/2) },
    lamePlat: c.avecLamePlat
      ? { ext: pts.map(p=>({...p})), int: safeOffset(pts, largeurLameM) } : null,
    lameRive: c.avecLameRive
      ? { ext: safeOffset(pts, -riveEp), int: pts.map(p=>({...p})) } : null
  };
  return { vis, cadre, solives, lambourdes, lames, lameRive, lamePlat, bandes, lamesFieldPoly };
}


/**
 * Les calques d'une terrasse, tels que computeTerrasseLayers les produit.
 *
 * Le type est **derive de la fonction** et non ecrit a la main : c'est un resultat de calcul, pas
 * une donnee enregistree, et une description separee finirait par diverger de ce qui est reellement
 * rendu — exactement ce que geometry/rings.ts a montre.
 */
export type CouchesTerrasse = ReturnType<typeof computeTerrasseLayers>;

// Le repere du dessin du plan (MD/roadmap-architecture.md, etapes 2.3 et 6.5).
//
// Le plan se dessine en pixels d'ecran : un deplacement de la vue reecrivait chaque attribut de chaque objet et de chaque calque,
// comme un zoom. Le dessin se fait maintenant dans un repere, la vue a son echelle et a sa taille, mais a l'origine qu'elle avait
// quand cette echelle a ete posee. La vue courante n'en differe que d'une translation (`dx`, `dy`) : le `viewBox` de la racine SVG
// la porte (app/assemblage/surface.ts, `poserDecalage`). Un deplacement ne change donc que le `viewBox` ; les objets et les calques
// poses dans le repere restent tels quels, et leurs cles (render/pipeline.ts, render/calquesGardes.ts) ne lisent que le repere.
// Un zoom, ou une scene qui change de taille, pose un nouveau repere : ce qui depend de l'echelle se redessine. Depuis l'etape 2.3,
// c'est peu de chose : les objets (render/objects.ts) et les calques sans texte (les releves et la cloture, plus bas) se dessinent
// en metres, et leur groupe porte la transformation du repere ; un zoom ne change qu'elle, et ne replace que ce qui se mesure en
// pixels (le nom d'un objet, le trace d'un chemin, ce que montre l'objet selectionne, les calques du dessus avec leurs textes).
//
// Les calques qui suivent l'ecran et pas le plan (la grille, qui couvre la vue ; la fleche du nord et l'echelle, a un coin ; la
// photo aerienne et le nom des rues, decoupes a la vue) se dessinent toujours dans la vue courante, dans un groupe que la meme
// translation, inversee, ramene a l'ecran.

import type { EtatScene } from '../geometry/vue.js';
import type { PtBrut, PtEcran } from '../model/types.js';

/** Le repere du dessin, et ce qui separe la vue courante de lui. */
export interface Repere {
  /** La scene du dessin : l'echelle et la taille de la vue, l'origine de quand cette echelle a ete posee. */
  scene: EtatScene;
  /** La vue courante moins le repere, en pixels : ce que le `viewBox` decale. */
  dx: number;
  dy: number;
}

export interface SuiviRepere {
  /** Suit la vue : le meme repere tant que l'echelle et la taille n'ont pas change, un nouveau sinon. */
  suivre(vue: EtatScene): Repere;
  /** Le repere en cours, ou la vue elle-meme avant le premier rendu. */
  scene(vue: EtatScene): EtatScene;
}

export function creerRepere(): SuiviRepere {
  let dessin: EtatScene | null = null;
  const valable = (vue: EtatScene): boolean => !!dessin && dessin.scale === vue.scale && dessin.W === vue.W && dessin.H === vue.H;
  return {
    suivre(vue) {
      if (!dessin || !valable(vue)) dessin = { ...vue, origine: { ...vue.origine } };
      return { scene: dessin, dx: vue.origine.x - dessin.origine.x, dy: vue.origine.y - dessin.origine.y };
    },
    scene: (vue) => (dessin && valable(vue) ? dessin : vue)
  };
}

// Les calques poses sur le plan qui n'ont ni texte ni rien qui se mesure en pixels sauf leurs traits (les ouvertures relevees et la
// cloture : MD/roadmap-architecture.md, etape 2.3) se dessinent en metres, comme les objets (render/objects.ts) : un zoom ne change
// que la transformation de leur groupe. Leur dessin garde l'axe des y de l'ecran (vers le bas), ou il compte le sens de ses arcs :
// un point du plan y est (x, -y), et la transformation n'a qu'a mettre a l'echelle et a l'origine du repere.

/** Un point du plan dans un calque en metres : l'axe des y vers le bas, comme a l'ecran. */
export const versMetres = (p: PtBrut): PtEcran => ({ x: p.x, y: -p.y });

/** La transformation d'un calque en metres : l'echelle et l'origine du repere du dessin. */
export function matriceDesCalques(scene: Pick<EtatScene, 'scale' | 'origine'>): string {
  return `matrix(${scene.scale},0,0,${scene.scale},${scene.origine.x},${scene.origine.y})`;
}

/** Les traits d'un calque en metres gardent leur epaisseur et leurs tirets a l'ecran. */
export function traitsALEcran(groupe: Element): void {
  for (const e of groupe.querySelectorAll('line, path, polygon, polyline, rect, circle, ellipse')) e.setAttribute('vector-effect', 'non-scaling-stroke');
}

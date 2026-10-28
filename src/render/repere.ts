// Le repere du dessin du plan (MD/roadmap-architecture.md, etapes 2.3 et 6.5).
//
// Le plan se dessine en pixels d'ecran : un deplacement de la vue reecrivait chaque attribut de chaque objet et de chaque calque,
// comme un zoom. Le dessin se fait maintenant dans un repere, la vue a son echelle et a sa taille, mais a l'origine qu'elle avait
// quand cette echelle a ete posee. La vue courante n'en differe que d'une translation (`dx`, `dy`) : le `viewBox` de la racine SVG
// la porte (app/assemblage/surface.ts, `poserDecalage`). Un deplacement ne change donc que le `viewBox` ; les objets et les calques
// poses dans le repere restent tels quels, et leurs cles (render/pipeline.ts, render/calquesGardes.ts) ne lisent que le repere.
// Un zoom, ou une scene qui change de taille, pose un nouveau repere : ce qui depend de l'echelle se redessine.
//
// Les calques qui suivent l'ecran et pas le plan (la grille, qui couvre la vue ; la fleche du nord et l'echelle, a un coin ; la
// photo aerienne et le nom des rues, decoupes a la vue) se dessinent toujours dans la vue courante, dans un groupe que la meme
// translation, inversee, ramene a l'ecran.

import type { EtatScene } from '../geometry/vue.js';

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

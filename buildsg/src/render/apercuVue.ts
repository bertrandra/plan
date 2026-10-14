// L'apercu d'un geste de vue (molette, pincement, deplacement) sur un grand plan (render/).
//
// Le plan se dessine en coordonnees d'ecran : changer d'echelle ou se deplacer reecrit chaque element.
// Sur un voisinage d'un kilometre (9 000 objets), un cran de molette coutait environ 4 s (profil
// d'octobre 2026). Pendant le geste, on deplace et on agrandit donc d'un coup ce qui est deja dessine,
// par une seule transformation de la racine SVG ; le plan se redessine net une fois le geste pose
// (DELAI_APERCU_MS sans mouvement). Les traits et les textes grossissent un instant, puis reprennent
// leur taille : c'est ce que font les cartes en ligne.

import type { EtatScene } from '../geometry/vue.js';

/** Le plan se redessine net apres ce delai sans mouvement. */
export const DELAI_APERCU_MS = 150;

export interface ApercuVue {
  /** La vue passe de `avant` a `apres` : montrer tout de suite, redessiner au repos. */
  changer(avant: Pick<EtatScene, 'scale' | 'origine'>, apres: Pick<EtatScene, 'scale' | 'origine'>): void;
  /** Un rendu complet commence : la transformation n'a plus lieu d'etre. */
  annuler(): void;
  /** Un apercu est affiche : le dessin ne correspond pas encore a la scene. */
  enCours(): boolean;
}

export interface ContexteApercu {
  /** La racine du dessin, que l'on transforme. */
  element: { style: { transform: string; transformOrigin: string } };
  /** Le rendu complet, une fois le geste pose. */
  rendre: () => void;
  planifier?: (f: () => void, ms: number) => unknown;
  annulerPlan?: (id: unknown) => void;
}

/**
 * La transformation qui mene un dessin fait pour la scene `rendue` a la scene `courante` : un point
 * d'ecran p devient o' + k (p - o), avec k le rapport des echelles - la meme pour x et y, l'axe des
 * y du plan etant deja retourne dans p et o.
 */
export function transformation(rendue: Pick<EtatScene, 'scale' | 'origine'>, courante: Pick<EtatScene, 'scale' | 'origine'>): string {
  const k = courante.scale / rendue.scale;
  const tx = courante.origine.x - k * rendue.origine.x, ty = courante.origine.y - k * rendue.origine.y;
  return `matrix(${k},0,0,${k},${tx},${ty})`;
}

export function creerApercuVue(ctx: ContexteApercu): ApercuVue {
  const planifier = ctx.planifier ?? ((f: () => void, ms: number) => setTimeout(f, ms));
  const annulerPlan = ctx.annulerPlan ?? ((id: unknown) => clearTimeout(id as ReturnType<typeof setTimeout>));
  // La scene pour laquelle le dessin a ete fait ; null quand il correspond a la scene courante.
  let rendue: Pick<EtatScene, 'scale' | 'origine'> | null = null;
  let minuterie: unknown = null;
  const arreterMinuterie = () => { if (minuterie !== null) annulerPlan(minuterie); minuterie = null; };
  return {
    changer(avant, apres) {
      if (!rendue) rendue = { scale: avant.scale, origine: { ...avant.origine } };
      ctx.element.style.transformOrigin = '0 0';
      ctx.element.style.transform = transformation(rendue, apres);
      arreterMinuterie();
      minuterie = planifier(() => { minuterie = null; ctx.rendre(); }, DELAI_APERCU_MS);
    },
    annuler() {
      arreterMinuterie();
      if (rendue) { ctx.element.style.transform = ''; rendue = null; }
    },
    enCours: () => rendue !== null,
  };
}

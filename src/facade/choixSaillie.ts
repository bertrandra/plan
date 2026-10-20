// L'element de facade dont la personne veut choisir le mur dans la Vue 3D (meme role que facade/choix.ts).
//
// Deux temps : le bouton de l'inspecteur dit quel element il vise (`viserSaillie`), puis execute
// `toit.murSur3d`, qui le reprend et l'arme ; le prochain toucher sur un mur du batiment, dans la 3D,
// le replace la (app/ecouteurs/toitCatalogue.ts). Un geste de la palette arme de meme l'element qu'il vient de poser.

let visee: number | null = null;
let armee: { cle: string; rang: number } | null = null;

export function viserSaillie(rang: number | null): void {
  visee = rang;
}

/** L'element vise, une seule fois : la lecture l'efface. */
export function reprendreSaillieVisee(): number | null {
  const r = visee;
  visee = null;
  return r;
}

export function armerSaillie(cle: string, rang: number): void {
  armee = { cle, rang };
}

export function saillieArmee(): { cle: string; rang: number } | null {
  return armee;
}

export function desarmerSaillie(): void {
  armee = null;
}

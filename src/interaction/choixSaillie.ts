// L'element de facade dont la personne veut choisir le mur dans la Vue 3D (meme role que interaction/choixFacade.ts).
//
// Le bouton « Choisir le mur dans la 3D » du panneau du mode Toit (`toit.murSur3d`) arme l'element choisi ; le prochain toucher sur un
// mur du batiment, dans la 3D, le replace la (app/ecouteurs/toitCatalogue.ts). Echap le desarme.

let armee: { cle: string; rang: number } | null = null;

export function armerSaillie(cle: string, rang: number): void {
  armee = { cle, rang };
}

export function saillieArmee(): { cle: string; rang: number } | null {
  return armee;
}

export function desarmerSaillie(): void {
  armee = null;
}

// L'etat du photomontage (core/photomontage.ts) : un etat de SESSION. La photo et son calage ne s'enregistrent pas dans le projet
// (le schema du projet ne change pas), ne s'annulent pas (Ctrl+Z), ne marquent pas le projet « modifie » et restent permis en lecture
// seule, comme « Filaire ». La photo ne quitte pas le navigateur : rien d'ici ne part au serveur ni a Claude.
//
// Ce module est charge au demarrage et ne pese rien : le panneau de la Vue 3D y lit si le mode est ouvert. Ce qui lit la photo,
// cale la camera et rend l'image (app/photomontage/session.ts) se charge a la demande, avec la 3D.

import { signaler3d } from '../../three/etat3d.js';
import type { Calage, PosePhoto, Taille } from '../../core/photomontage.js';

export type FormatPhotomontage = 'jpeg' | 'png';

export interface EtatPhotomontage {
  /** Le mode est ouvert dans la Vue 3D. */
  actif: boolean;
  /** Une photo est en cours de lecture. */
  lecture: boolean;
  /** La photo choisie : son nom et sa taille ramenee ; null tant qu'aucune n'est choisie. */
  photo: (Taille & { nom: string }) | null;
  /** Ce que la photo a dit de sa prise de vue, et ce qu'elle n'a pas dit. */
  calage: Calage | null;
  /** La camera, apres les ajustements a la main. */
  pose: PosePhoto | null;
  /** L'opacite de la scene sur la photo, de 0 a 1. */
  opacite: number;
  /** Les batiments en transparence, le temps du calage. */
  maison: boolean;
  /** Les garder dans l'image enregistree : un choix explicite, jamais le defaut. */
  maisonDansImage: boolean;
  format: FormatPhotomontage;
}

export const photomontage: EtatPhotomontage = {
  actif: false, lecture: false, photo: null, calage: null, pose: null, opacite: 1, maison: false, maisonDansImage: false, format: 'jpeg',
};

/** Change l'etat et le dit a la Vue 3D, qui se redessine (zones/vue3d/Vue3d.tsx). */
export function reglerPhotomontage(r: Partial<EtatPhotomontage>): void {
  Object.assign(photomontage, r);
  signaler3d();
}

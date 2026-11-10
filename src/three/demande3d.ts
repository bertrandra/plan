// L'acces au moteur de la 3D (three/moteur3d.ts), charge au premier besoin (AD-10) : ouvrir la Vue 3D, la visionneuse, exporter.
//
// Tant qu'il n'est pas charge, aucune scene n'existe : ce qui agit sur la scene ouverte (la rebatir, l'epurer, viser un objet) n'a
// rien a faire, et le lit par `moteur3d()`, null. Ce qui doit la faire exister passe par `avecMoteur3d`, qui charge d'abord.

import { showErrBanner } from '../shell/dialogs.js';

export type Moteur3d = typeof import('./moteur3d.js');

let chargement: Promise<Moteur3d> | null = null;
let charge: Moteur3d | null = null;

/** Charge le moteur une fois ; un echec (morceau introuvable, reseau coupe) laisse la porte ouverte a un nouvel essai. */
export function chargerMoteur3d(): Promise<Moteur3d> {
  chargement ??= import('./moteur3d.js').then((m) => (charge = m), (e: unknown) => { chargement = null; throw e; });
  return chargement;
}

/** Le moteur s'il est deja la, sinon null : sans lui, aucune scene 3D n'existe. */
export function moteur3d(): Moteur3d | null {
  return charge;
}

/** Fait `f` avec le moteur : tout de suite s'il est la, sinon une fois charge. Un echec de chargement s'affiche. */
export function avecMoteur3d(f: (m: Moteur3d) => void): void {
  if (charge) { f(charge); return; }
  chargerMoteur3d().then(f, (e: unknown) => { showErrBanner('la 3D n’a pas pu se charger (' + (e instanceof Error ? e.message : String(e)) + ').'); });
}

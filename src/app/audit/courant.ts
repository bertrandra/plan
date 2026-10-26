// Le controleur de la promenade en cours, s'il y en a un (mode `?mode=audit`, app/audit/branchement.ts). A part du branchement
// (26 octobre 2026, AD-10) : la Vue 3D le lit des son assemblage pour peindre les batiments marques, alors que l'audit ne se
// charge qu'en mode audit.

import type { ControleurAudit } from './controleur.js';

let courant: ControleurAudit | null = null;

/** Le controleur courant : la Vue 3D lui demande la couleur d'un batiment marque. */
export const controleurAudit = (): ControleurAudit | null => courant;

export function poserControleurAudit(c: ControleurAudit | null): void {
  courant = c;
}

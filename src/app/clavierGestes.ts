// Ctrl+Z et Ctrl+Y sur les gestes d'une facade avant sa validation (V4) : les reperes, le mur tire, l'echelle, la confirmation du mur
// (decision du proprietaire, 3 novembre 2026). Le meme branchement dans l'audit (app/audit/parcelle/commande.ts) et dans l'ecran de
// calibration (app/administration/ecranCalibration.ts) : tant que l'ecran de la facade est ouvert et qu'un geste reste a defaire (la
// commande `facade.annulerGeste` est utilisable), Ctrl+Z le defait ; sinon la touche va a l'historique du projet, comme ailleurs.

import type { RegistreCommandes } from './commandes.js';

import { COMMANDE_ANNULER_GESTE, COMMANDE_RETABLIR_GESTE } from '../zones/composants/BarreProgressionFacade.js';

export { COMMANDE_ANNULER_GESTE, COMMANDE_RETABLIR_GESTE };

/** Branche les touches sur `doc` (phase de capture : avant le raccourci du projet). `ouvert` : l'ecran de la facade est-il la ? */
export function brancherGestesFacade(doc: Pick<Document, 'addEventListener'> | null, ouvert: () => boolean, cmd: Pick<RegistreCommandes, 'etat' | 'executer'>): void {
  doc?.addEventListener('keydown', (ev) => {
    const e = ev as KeyboardEvent;
    if (!(e.ctrlKey || e.metaKey) || e.altKey || !ouvert()) return;
    const t = e.key.toLowerCase();
    const id = t === 'z' && !e.shiftKey ? COMMANDE_ANNULER_GESTE : (t === 'y' || (t === 'z' && e.shiftKey)) ? COMMANDE_RETABLIR_GESTE : null;
    if (!id) return;
    // Une saisie dans un champ garde son propre Ctrl+Z (la largeur du mur tapee).
    const cible = e.target as HTMLElement | null;
    if (cible && (cible.tagName === 'INPUT' || cible.tagName === 'TEXTAREA' || cible.tagName === 'SELECT')) return;
    if (!cmd.etat(id).utilisable) return;
    e.preventDefault();
    e.stopPropagation();
    cmd.executer(id);
  }, true);
}

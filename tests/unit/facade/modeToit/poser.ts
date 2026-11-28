// Poser une piece comme l'atelier du toit la pose : par le controleur (facade/modeToit/controleurToit.ts), la seule porte d'ecriture d'un
// toit. Les tests des gestes s'en servent pour regler un batiment avant de verifier ce qu'ils verifient.
//
// `rang` : le corps choisi (une cible `corps`) ; `facade` : la facade regardee ; `entier` : « Bâtiment entier » choisi. Un toit encore
// d'un seul tenant se decoupe d'abord (« Découper ce toit ») quand la piece en a besoin, comme la personne le fait dans l'atelier.

import { creerControleurToit, type ControleurToit } from '../../../../src/facade/modeToit/controleurToit.js';
import { piece } from '../../../../src/facade/modeToit/pieces.js';
import type { FacadeChoisie } from '../../../../src/facade/modeToit/gestes.js';
import type { ObjetPlan } from '../../../../src/model/types.js';

export interface Options { facade?: FacadeChoisie | null; rang?: number | null; entier?: boolean; sansDecouper?: boolean }

/** Le controleur ouvert sur `o`, dans l'intention de la piece, avec la cible et la facade dites. */
export function controleurPour(o: ObjetPlan, id: string, opts: Options = {}): ControleurToit {
  const forme = piece(id)?.famille === 'toit';
  const c = creerControleurToit(o, forme ? 'modifier' : 'ajouter');
  if (opts.facade) c.regarder(opts.facade);
  // Un rang qui designe un element de facade le choisit lui (la portee renvoie a son corps porteur).
  if (opts.rang !== undefined && opts.rang !== null) c.selectionner({ type: o.batiment?.corpsToit?.[opts.rang]?.saillie ? 'saillie' : 'corps', rang: opts.rang, i: 0 });
  if (opts.entier) c.choisirBatimentEntier();
  return c;
}

/** Pose la piece `id` sur `o` et valide la session : vrai si le toit a change. */
export function poser(o: ObjetPlan, id: string, opts: Options = {}): boolean {
  const sansCorps = () => !(o.batiment?.corpsToit ?? []).some((k) => !k.saillie);
  const forme = piece(id)?.famille === 'toit';
  if (forme && sansCorps() && !opts.sansDecouper) {
    // Une forme sur un toit simple le decoupe en corps de cette forme.
    const c = controleurPour(o, id, opts);
    const r = c.choisirForme(id);
    c.valider();
    return r.fait;
  }
  if (!forme && !opts.sansDecouper && sansCorps()) {
    const d = creerControleurToit(o);
    d.decouper();
    d.valider();
  }
  const c = controleurPour(o, id, opts);
  const issue = forme ? c.choisirForme(id) : c.poserPiece(id);
  c.valider();
  return issue.fait;
}

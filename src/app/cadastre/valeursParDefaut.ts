// Les valeurs par defaut d'un objet importe, pour « Fichier › Actualiser le projet »
// (app/cadastre/actualiserProjet.ts) : a part, parce que l'actualisation IGN (app/cadastre/actualisationIgn.ts) les
// applique et que la commande l'appelle.

import { apparenceIgnParDefaut } from '../../geo/cadastreObjets.js';
import type { ObjetBrut, ObjetPlan, Toit } from '../../model/types.js';

/** Un objet que l'import a pose (et que cette commande peut ramener a ses valeurs par defaut). */
export function estImporte(o: { key?: string; fonction?: string; cadastre?: unknown; bdtopo?: unknown; voisinage?: boolean }): boolean {
  return apparenceIgnParDefaut(o) !== null || !!o.voisinage;
}

/**
 * Un objet importe ramene a ce qu'un import d'aujourd'hui lui donnerait, avant d'etre relu : son
 * apparence d'import, ni texture ni reglage d'apparence, et un toit a relire (sa couleur comprise).
 * Un objet dessine a la main rend tel quel.
 */
export function valeursParDefaut(o: ObjetBrut): ObjetBrut {
  if (!estImporte(o)) return o;
  const copie: ObjetBrut = { ...o, ...(apparenceIgnParDefaut(o) ?? {}), textureVerticale: null, textureHorizontale: null, textureArbre: null };
  for (const cle of ['couleurMurs', 'fenetres3d', 'profilFacades', 'modeToit', 'gazon3d', 'voisinage3d'] as const) delete (copie as Partial<ObjetPlan>)[cle];
  if (o.fonction === 'batiment' && o.toit) {
    // Un toit « bdtopo » sans couleur : l'actualisation le recalcule sur le contour relu, le LiDAR
    // le reprend corps par corps, l'orthophoto lui redonne sa couleur.
    const toit: Toit = { ...o.toit, source: 'bdtopo' };
    delete toit.couleur;
    delete toit.origineCouleur;
    delete toit.couverture;
    copie.toit = toit;
    copie.toitMesure = null;
    copie.corpsToit = null;
    copie.toitLidarLu = null;
  }
  return copie;
}


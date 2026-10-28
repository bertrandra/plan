// Les valeurs par defaut d'un objet importe, pour « Fichier › Actualiser le projet »
// (app/cadastre/actualiserProjet.ts) : a part, parce que l'actualisation IGN (app/cadastre/actualisationIgn.ts) les
// applique et que la commande l'appelle.

import { estOuvrage, BATIMENT } from '../../model/ouvrages/index.js';
import { apparenceIgnParDefaut } from '../../geo/cadastreObjets.js';
import type { ObjetBrut, ObjetPlan, Toit } from '../../model/types.js';
import { champsBatiment } from '../../model/champsFonction.js';

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
  const copie: ObjetBrut = { ...o, ...(apparenceIgnParDefaut(o) ?? {}), textureVerticale: null, textureHorizontale: null };
  // Les sous-objets sont copies avant d'etre touches : l'objet d'origine ne bouge pas.
  if (o.arbre) copie.arbre = { ...o.arbre, texture: null };
  for (const cle of ['gazon3d', 'voisinage3d'] as const) delete (copie as Partial<ObjetPlan>)[cle];
  if (o.batiment) {
    const b = { ...o.batiment };
    for (const cle of ['couleurMurs', 'fenetres3d', 'profilFacades', 'modeToit'] as const) delete b[cle];
    copie.batiment = b;
  }
  if (estOuvrage(o, BATIMENT) && o.batiment?.toit) {
    // Un toit « bdtopo » sans couleur : l'actualisation le recalcule sur le contour relu, le LiDAR
    // le reprend corps par corps, l'orthophoto lui redonne sa couleur.
    const toit: Toit = { ...o.batiment?.toit, source: 'bdtopo' };
    delete toit.couleur;
    delete toit.origineCouleur;
    delete toit.couverture;
    champsBatiment(copie).toit = toit;
    champsBatiment(copie).toitMesure = null;
    champsBatiment(copie).corpsToit = null;
    champsBatiment(copie).toitLidarLu = null;
  }
  return copie;
}


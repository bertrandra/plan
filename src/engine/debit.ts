// Debit : optimisation des coupes dans les longueurs disponibles
//
// Deplace depuis legacy.ts sans retouche : l ordre des operations est conserve tel quel, y compris
// la ou il produit des artefacts de flottants. Ce sont eux qui prouvent que l arithmetique n a pas
// bouge (spec-migration-typescript.md §10.2) - les "nettoyer" serait un changement de comportement.

import { dist } from '../geometry/basic.js';
import { longueursBois, longueursDispo, longueursLambourde } from './prix.js';
import { ensureConstruction } from './construction.js';
import { longueurLameReelle } from './lames.js';
import { dimsSection, porteeVisM, sectionLambourde } from './bois/portees.js';
import { enPoints } from '../model/formes.js';
import type { CouchesTerrasse } from './layers.js';
import type { ProduitBarre } from './prix.js';
import type { ObjetPlan, Segment } from '../model/types.js';
import { optimiserDebitLames, type Debit } from './bois/debit.js';

export type { Debit, RolesLongueur } from './bois/debit.js';


// Runs to cut: the deck boards themselves plus the flat border, which is the same product
// bought at the same time.
// Every load-bearing piece, cut out of stock lengths. A splice in a beam has to sit over a
// screw, so the same joint rule applies with the screw spacing standing in for the support
// spacing. Reported with the metre breakdown by role, since one cut-list covers all three.
// Returns one cut-list group per product actually bought. Lambourdes share the solives' group
// while they share their section - same piece, same order - and split into their own group with
// their own stock lengths and prices as soon as the section differs, because then they are a
// different product and mixing the two would price and cut them wrong.
/** Un groupe de debit : un produit reellement achete, avec ses longueurs de stock et son prix. */
export interface GroupeDebit {
  /** Le produit achete — c'est lui qui designe le carnet de prix a lire. */
  cle: ProduitBarre;
  section: string;
  titre: string;
  /** Le champ de Construction qui porte les longueurs achetables de ce produit. */
  champLongueurs: string;
  /** Metres lineaires par famille de piece, pour dire d'ou vient le total. */
  parts: Record<string, number>;
  debit: Debit;
}

export function computeDebitsBois(obj: ObjetPlan, layers: CouchesTerrasse): GroupeDebit[] {
  const c = ensureConstruction(obj);
  const ml = (a: Segment[]) => a.reduce((s,l)=>s+dist(l.a,l.b),0);
  // `ensureConstruction` pose toujours la section de solive ; le repli est sa valeur par defaut.
  const secS = c.soliveSection ?? '45x70', secL = sectionLambourde(c);
  const wS = dimsSection(secS).b/1000, wL = dimsSection(secL).b/1000;
  const separe = secL !== secS && layers.lambourdes.length > 0;
  // Tuple et non tableau : ces trois valeurs sont etalees dans optimiserDebitLames, dont la
  // signature attend trois parametres distincts.
  const opt = [ (c.chuteMinReutilisable!==undefined ? c.chuteMinReutilisable : 50)/100,
                porteeVisM(c), c.jointsBoisSurAppui !== false ] as [number, number, boolean];
  // Same rule as the lames: a beam ending on an oblique edge is cut to its longest side. The
  // cadre follows the outline and is already mitred, so its own centreline is the right measure.
  const runsLamb = layers.lambourdes.map(s=>longueurLameReelle(s.a, s.b, wL, enPoints(obj).pts));
  const runsPorteur = ([] as number[]).concat(
    layers.cadre.map(s=>dist(s.a,s.b)),
    layers.solives.map(s=>longueurLameReelle(s.a, s.b, wS, enPoints(obj).pts)),
    separe ? [] : runsLamb
  );
  const avecLamb = layers.lambourdes.length > 0 && !separe;
  const roles = ['Cadre'];
  if(layers.solives.length) roles.push('solives');
  if(avecLamb) roles.push('lambourdes');
  const groupes: GroupeDebit[] = [{
    cle:'bois', section:secS,
    titre: roles.join(', ') + ' (' + secS + ')',
    champLongueurs:'longueursBois',
    parts: Object.assign({ cadre:ml(layers.cadre) } as Record<string, number>,
             layers.solives.length ? { solives:ml(layers.solives) } : {},
             avecLamb ? { lambourdes:ml(layers.lambourdes) } : {}),
    debit: optimiserDebitLames(runsPorteur.filter(L=>L>0.05), longueursBois(c), ...opt)
  }];
  if(separe){
    groupes.push({
      cle:'lambourde', section:secL, titre:'Lambourdes (' + secL + ')',
      champLongueurs:'longueursLambourde',
      parts:{ lambourdes: ml(layers.lambourdes) } as Record<string, number>,
      debit: optimiserDebitLames(runsLamb.filter(L=>L>0.05), longueursLambourde(c), ...opt)
    });
  }
  return groupes;
}
export function computeDebitLames(obj: ObjetPlan, layers: CouchesTerrasse): Debit {
  const c = ensureConstruction(obj);
  const largeurLameM = (c.largeurLame||140)/1000;
  // Measured on the longest side of each board, so an angled end orders the piece that actually
  // has to be cut rather than the shorter centreline.
  const runs = layers.lames.map(s=>longueurLameReelle(s.a, s.b, largeurLameM, layers.lamesFieldPoly))
    .concat(layers.lamePlat.map(s=>dist(s.a,s.b)))
    .filter(L=>L > 0.05);
  // Supports under the lames: the lambourdes when there are any, otherwise the solives.
  const entraxeAppui = (c.avecLambourde ? (c.lambourdeEntraxe||40) : (c.soliveEntraxe||40))/100;
  return optimiserDebitLames(runs, longueursDispo(c),
    (c.chuteMinReutilisable!==undefined ? c.chuteMinReutilisable : 50)/100,
    entraxeAppui, c.jointsSurAppui !== false);
}

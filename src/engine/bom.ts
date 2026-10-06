// Quantitatif et prix (BOM) - ce qui part chez un fournisseur
//
// Deplace depuis legacy.ts sans retouche : l ordre des operations est conserve tel quel, y compris
// la ou il produit des artefacts de flottants. Ce sont eux qui prouvent que l arithmetique n a pas
// bouge (spec-migration-typescript.md §10.2) - les "nettoyer" serait un changement de comportement.

import { dist, shoelace } from '../geometry/basic.js';
import { BETON_PRICE, COFFRAGE_PRICE, DALLE_BETON_EP_M, MASSIF_COTE_M, MASSIF_PRICE, TREILLIS_PRICE, CONCASSE_PRICE, DALLE_STAB_PRICE, essenceDe, GEOTEXTILE_PRICE, LAME_RIVE_PRICE, SOLIVE_PRICE, VISSERIE_PRICE, VIS_PRICE, estPlots } from './constantes.js';
import { ensureConstruction } from './construction.js';
import { enPoints } from '../model/formes.js';
import { computeDebitLames, computeDebitsBois } from './debit.js';
import { aireCommune, surfaceDalle } from './structure.js';
import { achatPlots, achatVis, computeAssise, coutDebit, prixPlotUnite, prixVisUnite } from './prix.js';
import type { CouchesTerrasse } from './layers.js';
import type { ObjetPlan, LigneBom } from '../model/types.js';


export function computeBOM(obj: ObjetPlan, layers: CouchesTerrasse): LigneBom[] {
  const c = ensureConstruction(obj);
  // Un bassin ou un trou qui perce la terrasse n'a ni lames ni fixations : sa part est retiree.
  const contour = enPoints(obj).pts;
  const surf = shoelace(contour) - (layers.trous ?? []).reduce((s, t) => s + aireCommune(t, contour), 0);
  const lameRiveMl = layers.lameRive.reduce((s,l)=>s+dist(l.a,l.b),0);
  const essence = essenceDe(c.essenceBois);
  // Essence prices are per m2 (like the main lames); convert to a per-ml price for the
  // perimeter board using its width, rather than reusing the m2 figure directly.
  const lameWidthM = (c.largeurLame||140)/1000;
  // Lames are quoted on what actually gets bought - whole boards in stock lengths, offcuts
  // reused - rather than on the surface plus a flat waste percentage. The cut-list covers the
  // deck boards and the flat border together, so the border is not billed a second time below.
  const debit = computeDebitLames(obj, layers);

  const prevReel: Record<string, number | null | undefined> = {};
  (c.bom||[]).forEach(l=>{ prevReel[l.poste] = l.prixReel; });

  const groupesBois = computeDebitsBois(obj, layers);
  const nAppuis = layers.vis.length;
  const vis = achatVis(c, nAppuis);
  const plots = achatPlots(c, nAppuis);
  // Le tour du cadre ne sert qu'au coffrage d'une dalle a couler : la rive, et le bord des ouvertures.
  // La dalle a couler deborde du platelage (engine/structure.ts, empriseDalle).
  const assise = computeAssise(c, surf, nAppuis, layers.cadre.reduce((s, l) => s + dist(l.a, l.b), 0), surfaceDalle(contour, layers.trous ?? []));
  const lines: LigneBom[] = [];
  if(estPlots(c)){
    lines.push({ poste:'vis', label:'Plots — ' + plots.modele.label, qte:plots.unites, unite:'u',
                 prixBas:plots.modele.prix*0.7, prixHaut:plots.modele.prix*1.4 });
    // L'assise n'existe pas en mode vis : ces postes n'apparaissent que sur plots.
    if(assise.geotextileM2 > 0) lines.push({ poste:'geotextile', label:'Geotextile (assise)', qte:assise.geotextileM2, unite:'m²', prixBas:GEOTEXTILE_PRICE.bas, prixHaut:GEOTEXTILE_PRICE.haut });
    if(assise.concasseM3 > 0)   lines.push({ poste:'concasse',   label:'Concasse 10/20 compacte (' + (c.supportDecaissement||15) + ' cm)', qte:assise.concasseM3, unite:'m³', prixBas:CONCASSE_PRICE.bas, prixHaut:CONCASSE_PRICE.haut });
    if(assise.dallesU > 0)      lines.push({ poste:'dallesStab', label:'Dalles stabilisatrices sous plots', qte:assise.dallesU, unite:'u', prixBas:DALLE_STAB_PRICE.bas, prixHaut:DALLE_STAB_PRICE.haut });
    if(assise.massifsU > 0)     lines.push({ poste:'massifs',    label:'Massifs béton ' + Math.round(MASSIF_COTE_M*100) + ' × ' + Math.round(MASSIF_COTE_M*100) + ' × ' + Math.round(MASSIF_COTE_M*100) + ' cm sous plots (' + assise.betonM3.toFixed(2) + ' m³)', qte:assise.massifsU, unite:'u', prixBas:MASSIF_PRICE.bas, prixHaut:MASSIF_PRICE.haut });
    if(assise.treillisM2 > 0) {
      lines.push({ poste:'betonDalle', label:'Dalle béton armé ' + Math.round(DALLE_BETON_EP_M*100) + ' cm (C25/30)', qte:assise.betonM3, unite:'m³', prixBas:BETON_PRICE.bas, prixHaut:BETON_PRICE.haut });
      lines.push({ poste:'treillis',   label:'Treillis soudé ST25C (recouvrements compris)', qte:assise.treillisM2, unite:'m²', prixBas:TREILLIS_PRICE.bas, prixHaut:TREILLIS_PRICE.haut });
      lines.push({ poste:'coffrage',   label:'Coffrage de rive de la dalle', qte:assise.coffrageMl, unite:'ml', prixBas:COFFRAGE_PRICE.bas, prixHaut:COFFRAGE_PRICE.haut });
    }
  } else {
    lines.push({ poste:'vis', label:'Vis de fondation' + (vis.parBoite>1 ? ' ('+vis.boites+' × '+vis.parBoite+')' : ''), qte:vis.unites, unite:'u',  prixBas:VIS_PRICE.bas, prixHaut:VIS_PRICE.haut });
  }
  // One BOM line per timber product: merged while the sections match, split as soon as the
  // lambourdes have a section of their own.
  groupesBois.forEach(g=>lines.push({
    poste: g.cle, label: g.titre + ' — barres achetees', qte: g.debit.achatMl, unite:'ml',
    prixBas: SOLIVE_PRICE.bas, prixHaut: SOLIVE_PRICE.haut
  }));
  lines.push(
    { poste:'lames',      label:'Lames ('+essence.label+')' + (c.avecLamePlat?' + bordure a plat':'') + ' — barres achetees', qte:debit.achatMl, unite:'ml', prixBas:essence.bas*lameWidthM, prixHaut:essence.haut*lameWidthM },
    { poste:'visserie',   label:'Visserie / fixations',             qte:surf,              unite:'m²', prixBas:VISSERIE_PRICE.bas, prixHaut:VISSERIE_PRICE.haut },
    { poste:'lameRive',   label:'Lame de rive (finition)',          qte:lameRiveMl,        unite:'ml', prixBas:c.avecLameRive?LAME_RIVE_PRICE.bas:0, prixHaut:c.avecLameRive?LAME_RIVE_PRICE.haut:0 }
  );
  // La garde exclut `undefined` ; le compilateur ne suit pas une clef lue par propriete.
  lines.forEach(l=>{ l.prixReel = (prevReel[l.poste]!==undefined) ? prevReel[l.poste] as number | null : null; });
  // These lines are priced from their cut-list rather than by hand: the prices live per stock
  // length, where the merchant actually quotes them, and one source of truth beats two that can
  // disagree. `calcule` tells renderBOMTable to show it read-only.
  // Le dictionnaire s'etend avec un poste par groupe de debit ; son type le dit.
  const calcules: Record<string, { cout: number; note: string }> = { lames:{ cout:coutDebit(c, debit, 'lames'), note:'calcule — prix par longueur, debit des lames' },
                     vis: estPlots(c)
                       ? { cout:plots.cout, note:'calcule — ' + prixPlotUnite(c).toFixed(2) + ' € x ' + plots.unites }
                       : { cout:vis.cout,   note:'calcule — ' + prixVisUnite(c).toFixed(2) + ' € x ' + vis.unites } };
  groupesBois.forEach(g=>{
    calcules[g.cle] = { cout: coutDebit(c, g.debit, g.cle),
                        note: 'calcule — prix par longueur, debit ' + g.section };
  });
  Object.entries(calcules).forEach(([poste, calcul])=>{
    const l = lines.find(x=>x.poste===poste);
    if(l){
      l.prixReel = Math.round(calcul.cout*100)/100;
      l.calcule = calcul.note;
    }
  });
  return lines;
}

// Cuts the drawn runs out of boards bought in standard lengths.
//
// Two rules from the trade shape the answer. Offcuts are reused before anything new is opened -
// that is where the saving actually comes from. And a butt joint between two boards has to land
// on a support, so a piece that does not finish its run is cut to a whole number of support
// spacings; a board too short to reach even one support cannot serve in a jointed run at all.
//
// Done in two passes. Each run is first solved exactly - the cheapest set of stock lengths that
// covers it - by dynamic programming over the remaining length; a greedy choice cannot do this,
// because covering the most metres now regularly forces a whole extra board for the tail. Then
// the resulting cut-list is served from the offcut pool wherever a saved piece is long enough,
// so only what the pool cannot cover is actually bought.
//
// Cutting stock over all runs at once is NP-hard, but per run it is a small, exactly solvable
// problem, and cross-run reuse is what the pool pass buys back.

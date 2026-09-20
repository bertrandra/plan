// Quantitatif et prix (BOM) - ce qui part chez un fournisseur
//
// Deplace depuis legacy.ts sans retouche : l ordre des operations est conserve tel quel, y compris
// la ou il produit des artefacts de flottants. Ce sont eux qui prouvent que l arithmetique n a pas
// bouge (spec-migration-typescript.md §10.2) - les "nettoyer" serait un changement de comportement.

import { dist, shoelace } from '../geometry/basic.js';
import { CONCASSE_PRICE, DALLE_STAB_PRICE, ESSENCE_PRICES, GEOTEXTILE_PRICE, LAME_RIVE_PRICE, PLOT_ASSISE_MIN_CM2, SOLIVE_PRICE, SUPPORT_TYPES, VISSERIE_PRICE, VIS_PRICE, estPlots, plotModele } from './constantes.js';
import { ensureConstruction } from './construction.js';
import { computeDebitLames, computeDebitsBois } from './debit.js';
import { CHARGE_NORMALE_DEFAUT, dimsSection, sectionLambourde } from './structure.js';
import { valeurEnregistree } from '../model/dictionnaire.js';
import type { CouchesTerrasse } from './layers.js';
import type { Debit } from './debit.js';
import type { ObjetPlan, Construction, LigneBom } from '../model/types.js';

/** Les trois produits achetes a la barre, chacun avec son propre carnet de prix. */
export type ProduitBarre = 'lames' | 'bois' | 'lambourde';

export function computeBOM(obj: ObjetPlan, layers: CouchesTerrasse): LigneBom[] {
  const c = ensureConstruction(obj);
  const surf = shoelace(obj.pts!);
  const lameRiveMl = layers.lameRive.reduce((s,l)=>s+dist(l.a,l.b),0);
  const essence = ESSENCE_PRICES[c.essenceBois!] || ESSENCE_PRICES.autre!;
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
  const assise = computeAssise(c, surf, nAppuis);
  const lines: LigneBom[] = [];
  if(estPlots(c)){
    lines.push({ poste:'vis', label:'Plots — ' + plots.modele.label, qte:plots.unites, unite:'u',
                 prixBas:plots.modele.prix*0.7, prixHaut:plots.modele.prix*1.4 });
    // L'assise n'existe pas en mode vis : ces postes n'apparaissent que sur plots.
    if(assise.geotextileM2 > 0) lines.push({ poste:'geotextile', label:'Geotextile (assise)', qte:assise.geotextileM2, unite:'m²', prixBas:GEOTEXTILE_PRICE.bas, prixHaut:GEOTEXTILE_PRICE.haut });
    if(assise.concasseM3 > 0)   lines.push({ poste:'concasse',   label:'Concasse 10/20 compacte (' + (c.supportDecaissement||15) + ' cm)', qte:assise.concasseM3, unite:'m³', prixBas:CONCASSE_PRICE.bas, prixHaut:CONCASSE_PRICE.haut });
    if(assise.dallesU > 0)      lines.push({ poste:'dallesStab', label:'Dalles stabilisatrices sous plots', qte:assise.dallesU, unite:'u', prixBas:DALLE_STAB_PRICE.bas, prixHaut:DALLE_STAB_PRICE.haut });
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
  Object.keys(calcules).forEach(poste=>{
    const l = lines.find(x=>x.poste===poste);
    if(l){
      l.prixReel = Math.round(calcules[poste]!.cout*100)/100;
      l.calcule = calcules[poste]!.note;
    }
  });
  return lines;
}

// ---- debit des lames -------------------------------------------------------------------
export const LONGUEURS_LAMES_DEFAUT = [3, 2.5, 2, 1.7, 1.5];
// Boards are quoted by the piece, and the rate per metre is not the same from one length to the
// next - short lengths are usually dearer per metre, and one length in a range is often on
// offer. Until the user types the merchant's actual figures, each length falls back to the
// essence's mid-range rate times its width and length.
// One price store per product, so a length that exists in two of them keeps two prices - a 3 m
// deck board and a 3 m solive are not the same purchase.
export const PRIX_STORE: Record<ProduitBarre, 'prixLongueurs' | 'prixLongueursBois' | 'prixLongueursLambourde'> =
  { lames:'prixLongueurs', bois:'prixLongueursBois', lambourde:'prixLongueursLambourde' };
// Width a board of this product covers, used for the per-m² view. Only the lames are sold by
// surface in practice, so the others report per metre instead.
export function largeurProduit(c: Construction, cle: ProduitBarre): number {
  if(cle === 'lames') return (c.largeurLame||140)/1000;
  if(cle === 'lambourde') return dimsSection(sectionLambourde(c)).b/1000;
  return dimsSection(c.soliveSection).b/1000;
}
export function prixBarreDefaut(c: Construction, cle: ProduitBarre, L: number): number {
  if(cle === 'lames'){
    const essence = ESSENCE_PRICES[c.essenceBois!] || ESSENCE_PRICES.autre!;
    return Math.round(((essence.bas+essence.haut)/2) * largeurProduit(c,'lames') * L * 100)/100;
  }
  return Math.round(((SOLIVE_PRICE.bas+SOLIVE_PRICE.haut)/2) * L * 100)/100;
}
export function prixBarre(c: Construction, cle: ProduitBarre, L: number): number {
  const p = valeurEnregistree(c[PRIX_STORE[cle]], String(L));
  return (p !== undefined && p !== null && isFinite(p) && p >= 0) ? p : prixBarreDefaut(c, cle, L);
}
export function prixPersonnalise(c: Construction, cle: ProduitBarre, L: number): boolean {
  const p = valeurEnregistree(c[PRIX_STORE[cle]], String(L));
  return p !== undefined && p !== null && isFinite(p) && p >= 0;
}
export function setPrixBarre(c: Construction, cle: ProduitBarre, L: number, valeur: number | null | undefined): void {
  const k = PRIX_STORE[cle];
  if(!c[k] || typeof c[k] !== 'object') c[k] = {};
  // Meme raison que `valeurEnregistree` : le carnet peut etre un tableau, et une ecriture par clef
  // non numerique y pose une propriete ordinaire. La conversion decrit ce que fait deja le code.
  const carnet = c[k] as Record<string, number>;
  if(valeur === null || valeur === undefined || !isFinite(valeur) || valeur < 0) delete carnet[String(L)];
  else carnet[String(L)] = valeur;
}
// The two ways a merchant quotes the same board. Each derives from the other through the board's
// own footprint, so entering either one fills the other in.
export function prixM2De(c: Construction, cle: ProduitBarre, L: number): number {
  const surf = L * largeurProduit(c, cle);
  return surf > 0 ? prixBarre(c, cle, L)/surf : 0;
}
export function setPrixM2(c: Construction, cle: ProduitBarre, L: number, prixM2: number): void {
  const surf = L * largeurProduit(c, cle);
  setPrixBarre(c, cle, L, (isFinite(prixM2) && prixM2 >= 0 && surf > 0) ? prixM2*surf : null);
}
// Screws are sold by the piece, often in boxes: a part box still has to be bought whole.
export function prixVisUnite(c: Construction): number {
  const p = c.prixVisUnite;
  return (p !== undefined && p !== null && isFinite(p) && p >= 0) ? p : (VIS_PRICE.bas+VIS_PRICE.haut)/2;
}
export function achatVis(c: Construction, n: number){
  const parBoite = Math.max(1, Math.round(c.visParBoite||1));
  const boites = Math.ceil(n/parBoite);
  const unites = boites*parBoite;
  return { parBoite, boites, unites, cout: unites*prixVisUnite(c) };
}
// Prix d'un plot : celui saisi pour le modele, sinon le tarif indicatif de la gamme.
export function prixPlotUnite(c: Construction): number {
  const m = plotModele(c);
  const p = valeurEnregistree(c.prixPlots, m.cle);
  return (p !== undefined && p !== null && isFinite(p) && p >= 0) ? p : m.prix;
}
export function achatPlots(c: Construction, n: number){
  const m = plotModele(c);
  return { modele:m, unites:n, cout:n*prixPlotUnite(c) };
}
// Ce qu'il faut sous les plots. Une vis fait sa propre fondation ; un plot repose sur une assise
// qu'il faut preparer, et ce poste pese lourd dans un devis de terrasse sur plots.
export function computeAssise(c: Construction, surfM2: number, nbPlots: number){
  // Une vis fait sa propre fondation : pas d'assise, donc aucun de ces postes. Le garde est ici
  // plutot que chez chaque appelant, sinon il finit par manquer quelque part.
  if(!estPlots(c)) return { type:SUPPORT_TYPES.dalle, geotextileM2:0, concasseM3:0, dallesU:0 };
  const t = SUPPORT_TYPES[c.supportType!] || SUPPORT_TYPES.concasse!;
  const ep = Math.max(0, c.supportDecaissement||15)/100;
  return {
    type:t,
    geotextileM2: t.geotextile ? surfM2*1.1 : 0,        // +10% de recouvrement des les
    concasseM3:   t.concasse   ? surfM2*ep  : 0,
    dallesU:      t.dalles     ? nbPlots    : 0
  };
}
// Charge reprise par un plot et pression sur son assise - le poinconnement n'existe pas en mode
// vis, qui reporte en profondeur, mais decide de la tenue d'un plot pose sur du concasse.
export function chargePlot(c: Construction, nbPlots: number, surfM2: number){
  const q = Math.max(50, c.chargeNormale || CHARGE_NORMALE_DEFAUT);
  const tributaire = nbPlots > 0 ? surfM2/nbPlots : 0;
  const charge = q*tributaire;                                  // kg par plot
  const assise = Math.max(50, c.plotSurfaceAssise || PLOT_ASSISE_MIN_CM2);
  return { tributaire, charge, assise, pression: assise>0 ? charge/assise : 0 };
}
// What a cut-list actually costs, at the per-length prices in force.
export function coutDebit(c: Construction, debit: Debit, cle: ProduitBarre): number {
  return Object.keys(debit.achats)
    .reduce((s,L)=>s + debit.achats[L]!*prixBarre(c, cle, parseFloat(L)), 0);
}
export const LONGUEURS_BOIS_DEFAUT = [5, 4, 3, 2.5, 2];
// "3, 2.5, 2" -> [3, 2.5, 2], longest first. Tolerates commas, semicolons, spaces and the
// French decimal comma, because that is how the figure gets pasted off a merchant's page.
export function parseLongueurs(raw: unknown, defauts: number[]): number[] {
  const list: number[] = (raw || "").toString().split(/[;\s]+|,(?![0-9])/)
    .map(s=>parseFloat(s.replace(',','.')))
    .filter(v=>isFinite(v) && v>0.2);
  const uniq = [...new Set(list)].sort((a,b)=>b-a);
  return uniq.length ? uniq : defauts.slice();
}
export function longueursDispo(c: Construction): number[] { return parseLongueurs(c.longueursLames, LONGUEURS_LAMES_DEFAUT); }
export function longueursBois(c: Construction): number[] { return parseLongueurs(c.longueursBois, LONGUEURS_BOIS_DEFAUT); }
export function longueursLambourde(c: Construction): number[] { return parseLongueurs(c.longueursLambourde, LONGUEURS_BOIS_DEFAUT); }
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

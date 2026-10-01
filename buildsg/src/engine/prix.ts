// Prix a la barre, a l'unite et longueurs de stock : ce que coute ce qu'on achete.
//
// Extrait de bom.ts sans retouche (architecture.md §9, FF-1) : debit et structure lisaient ces prix
// chez bom, qui les lisait en retour, et les modules tournaient en rond. Ce module ne depend que des
// constantes et des portees.

import { essenceDe, PLOT_ASSISE_MIN_CM2, SOLIVE_PRICE, SUPPORT_TYPES, supportDe, VIS_PRICE, estPlots, plotModele } from './constantes.js';
import { CHARGE_NORMALE_DEFAUT, dimsSection, sectionLambourde } from './portees.js';
import { valeurEnregistree } from '../model/dictionnaire.js';
import type { Debit } from './debit.js';
import type { Construction } from '../model/types.js';

/** Les trois produits achetes a la barre, chacun avec son propre carnet de prix. */
export type ProduitBarre = 'lames' | 'bois' | 'lambourde';

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
    const essence = essenceDe(c.essenceBois);
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
  const t = supportDe(c.supportType);
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
  return Object.entries(debit.achats)
    .reduce((s,[L, n])=>s + n*prixBarre(c, cle, parseFloat(L)), 0);
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

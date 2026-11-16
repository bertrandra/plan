// Le devis d'une page (export/), a envoyer a un particulier pour qu'il decide.
//
// Ce n'est ni une facture ni un bon de commande : une estimation datee, chiffree par le moteur. Les
// lignes sont celles de la Nomenclature (engine/postes.ts relit le BOM, rien n'est recompte ici) ;
// un prix saisi s'imprime tel quel, un prix qui ne l'est pas s'imprime en fourchette et le document
// le dit. La TVA ne s'ecrit que si la personne en donne le taux : le plan ne sait pas quel regime
// s'applique a son emetteur, il ne le devine pas. Aucune mention legale n'est inventee.
//
// Mise en page : A4 portrait, l'emetteur et le numero en tete, le client et le chantier, une vignette
// du plan (vectorielle, comme le dossier : une image de la Vue 3D demanderait un rendu, et le fichier ne
// se reproduirait plus d'un export a l'autre), le tableau des postes, les totaux, la mention de validite.
// Le texte est en WinAnsi (export/pdf/winAnsi.ts) : accents et signe euro, pour un particulier.

import { au } from '../util/tableaux.js';
import { centroid, dist, pointInPolygon } from '../geometry/basic.js';
import { A4_H, A4_L, MARGE_PDF, assemblerPDF, hexToRgb01, pdfCercle, pdfFlecheNord, pdfPolygone, type PagePdf, type Rgb01 } from './pdf/writer.js';
import { cadrePdf, couperWinAnsi, rectanglePdf, texteWinAnsi, traitPdf, type StyleTexte } from './pdf/winAnsi.js';
import { avecTva, chiffrerProjet, libelleRayon, type ChiffrageTerrasse, type Fourchette, type Poste } from '../engine/postes.js';
import { ensureConstruction } from '../engine/construction.js';
import { essenceDe, estPlots } from '../engine/constantes.js';
import { estBati, parcelleDuProjet } from '../model/fonctions.js';
import { sommetsDe } from '../model/formes.js';
import { decouperAdresse, referencesDuTerrain } from './cerfa13703.js';
import { dateFr, slugFichier } from '../util/format.js';
import type { ObjetPlan, PtBrut } from '../model/types.js';

/** Qui etablit le devis : ce que la personne a donne une fois (app/devis.ts), complete de son compte. */
export interface EmetteurDevis {
  nom?: string;
  adresse?: string;
  telephone?: string;
  email?: string;
  /** Une ligne libre : SIRET, assurance, ce que l'emetteur veut lire sous son nom. Rien n'y est ajoute. */
  mentions?: string;
}

export interface OptionsDevis {
  appVersion: string;
  /** Le build du programme (dictionnaire /Info) ; celui en cours par defaut. */
  buildAt?: string;
  /** Le jour du devis (date ecrite, /CreationDate) ; l'horloge par defaut. */
  maintenant?: Date;
  nomProjet?: string | null | undefined;
  /** Le numero choisi par la personne ; vide, celui que le projet donne (`numeroDevis`). */
  numero?: string | null | undefined;
  emetteur?: EmetteurDevis;
  /** Le taux de TVA, en % ; `null` : non connu, le devis dit « TVA non comprise ». */
  tauxTva?: number | null;
}

const p2 = (n: number) => String(n).padStart(2, '0');

/**
 * Le numero d'un devis tire du projet : son nom et le jour, `PARCELLE-AE-101-20261116`. Une reference
 * que l'on retrouve, pas un compteur : un numero en sequence ressemblerait a celui d'une facture, que le
 * plan n'emet pas.
 */
export function numeroDevis(nomProjet: string | null | undefined, jour: Date): string {
  return slugFichier(nomProjet || 'plan').toUpperCase() + '-' + jour.getFullYear() + p2(jour.getMonth() + 1) + p2(jour.getDate());
}

/** Le nom du fichier du devis : `devis-parcelle-ae-101-20261116.pdf`. */
export const nomFichierDevis = (numero: string): string => 'devis-' + slugFichier(numero) + '.pdf';

// ---- nombres a la francaise, sans dependre de la machine ----------------------------------------
// `toLocaleString` ecrit une espace fine insecable sous un navigateur et une espace insecable sous un
// autre : le meme devis aurait deux empreintes. Le format est donc ecrit ici.

const milliers = (entier: string) => entier.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
/** `1 234,56` (deux decimales) ou `1 235` (aucune). */
export function nombreFr(v: number, decimales: number): string {
  const s = Math.abs(v).toFixed(decimales);
  const [e = '0', d] = s.split('.');
  return (v < 0 && Number(s) !== 0 ? '-' : '') + milliers(e) + (d ? ',' + d : '');
}
/** Une quantite, sans decimale superflue : `37`, `92,5`, `34,72`. */
const quantite = (v: number, unite: string) => (unite === 'u' ? nombreFr(Math.round(v), 0) : nombreFr(v, 2).replace(/,?0+$/, ''));
const euros = (v: number) => nombreFr(v, 2) + ' €';
const eurosRonds = (v: number) => nombreFr(Math.round(v), 0) + ' €';
/** Une fourchette : `1 840 € – 2 960 €` ; un nombre quand ses bornes sont egales. */
const fourchette = (f: Fourchette) => Math.abs(f.haut - f.bas) < 0.005 ? euros(f.bas) : eurosRonds(f.bas) + ' – ' + eurosRonds(f.haut);
const tauxFr = (t: number) => nombreFr(t, 2).replace(/,?0+$/, '') + ' %';

// ---- ce que le projet sait du client et du chantier --------------------------------------------

/** Le client : le declarant de la declaration prealable, s'il est rempli (range sur la parcelle du projet). */
export function clientDuProjet(objets: ObjetPlan[]): string[] {
  const d = parcelleDuProjet(objets)?.declaration ?? {};
  const nom = [d.prenom, d.nom].filter(Boolean).join(' ');
  const rue = [d.numero, d.voie].filter(Boolean).join(' ');
  const ville = [d.codePostal, d.localite].filter(Boolean).join(' ');
  return [nom, rue, d.lieuDit ?? '', ville, d.telephone ?? '', d.email ?? ''].filter((l) => l.trim());
}

/** Le chantier : l'adresse du terrain (saisie, sinon lue a l'import) et ses references cadastrales. */
export function chantierDuProjet(objets: ObjetPlan[]): string[] {
  const parcelle = parcelleDuProjet(objets);
  if (!parcelle) return [];
  const cad = (parcelle.cadastre || {}) as Record<string, unknown>;
  const d = parcelle.declaration ?? {};
  const lue = decouperAdresse(String(cad.adresse || ''));
  const rue = [d.terrainNumero || lue.numero, d.terrainVoie || lue.voie].filter(Boolean).join(' ');
  const ville = [d.terrainCodePostal || lue.codePostal, d.terrainLocalite || lue.localite || String(cad.commune || parcelle.nomLieu || '')].filter(Boolean).join(' ');
  const refs = referencesDuTerrain(parcelle).map((r) => r.section + ' ' + r.numero).join(', ');
  return [rue, ville, refs ? 'Parcelle cadastrale ' + refs : ''].filter((l) => l.trim());
}

// ---- mise en page ------------------------------------------------------------------------------

const ENCRE: Rgb01 = [0.15, 0.12, 0.08];
const DOUX: Rgb01 = [0.42, 0.38, 0.33];
const FILET: Rgb01 = [0.78, 0.74, 0.68];
const FOND: Rgb01 = [0.955, 0.94, 0.915];
const ACCENT: Rgb01 = [0.55, 0.42, 0.24];
const L_UTILE = A4_L - 2 * MARGE_PDF;
const BAS_UTILE = MARGE_PDF + 22;

// Les colonnes du tableau : rayon, designation, quantite, prix unitaire, total (les trois derniers alignes a droite).
const COL = { rayon: MARGE_PDF + 4, designation: MARGE_PDF + 86, qte: MARGE_PDF + 330, pu: MARGE_PDF + 425, total: A4_L - MARGE_PDF - 4 };
const L_DESIGNATION = COL.qte - 46 - COL.designation;

/** Une page en construction : son contenu et la hauteur ou l'on ecrit. */
class Feuille {
  readonly pages: PagePdf[] = [];
  contenu = '';
  y = A4_H - MARGE_PDF;
  constructor(private readonly enTeteSuite: (f: Feuille) => void) {}
  texte(x: number, y: number, taille: number, t: string, style?: StyleTexte): void { this.contenu += texteWinAnsi(x, y, taille, t, style); }
  /** Assez de place pour `h` points, sinon une page de plus, qui reprend l'en-tete du tableau. */
  place(h: number): void {
    if (this.y - h >= BAS_UTILE) return;
    this.finir();
    this.enTeteSuite(this);
  }
  finir(): void {
    this.pages.push({ l: A4_L, h: A4_H, contenu: this.contenu });
    this.contenu = '';
    this.y = A4_H - MARGE_PDF;
  }
}

/** Le pied de chaque page, pose une fois le nombre de pages connu. */
function piedDePage(page: PagePdf, n: number, total: number, numero: string, appVersion: string): void {
  page.contenu += traitPdf(MARGE_PDF, MARGE_PDF - 2, A4_L - MARGE_PDF, MARGE_PDF - 2, 0.4, FILET)
    + texteWinAnsi(MARGE_PDF, MARGE_PDF - 13, 7, 'Devis ' + numero + ' — établi avec Plan interactif ' + appVersion, { couleur: DOUX })
    + texteWinAnsi(A4_L - MARGE_PDF, MARGE_PDF - 13, 7, 'Page ' + n + ' / ' + total, { couleur: DOUX, aligne: 'droite' });
}

/** Un bloc de lignes sous un titre en petites capitales (le client, le chantier). */
function bloc(f: Feuille, x: number, y: number, largeur: number, titre: string, lignes: string[], vide: string, premiereEnGras: boolean): number {
  f.texte(x, y, 7, titre.toUpperCase(), { gras: true, couleur: ACCENT });
  let yy = y - 13;
  const contenu = lignes.length ? lignes : [vide];
  contenu.forEach((l, i) => {
    const gras = premiereEnGras && i === 0 && !!lignes.length;
    for (const morceau of couperWinAnsi(l, largeur, 9, gras)) {
      f.texte(x, yy, 9, morceau, lignes.length ? (gras ? { gras: true } : {}) : { couleur: DOUX });
      yy -= 11.5;
    }
  });
  return yy;
}

/** La vignette du plan : la parcelle, le bati de la propriete et les terrasses du devis, reperees T1, T2… */
function vignette(f: Feuille, objets: ObjetPlan[], terrasses: ChiffrageTerrasse[], x: number, y: number, l: number, h: number): void {
  f.contenu += rectanglePdf(x, y, l, h, [1, 1, 1]) + cadrePdf(x, y, l, h, 0.5, FILET);
  const parcelle = parcelleDuProjet(objets);
  const surPropriete = (o: ObjetPlan) => !o.voisinage && (!parcelle || pointInPolygon(o.type === 'circle' ? o.center : centroid(o.pts || []), sommetsDe(parcelle)));
  const dessinees = objets.filter((o) => terrasses.some((t) => t.cle === o.key));
  const bati = objets.filter((o) => estBati(o) && !o.hidden && o.type === 'polygon' && surPropriete(o));
  const cadre = [...(parcelle ? [parcelle] : []), ...bati, ...dessinees];
  const pts: PtBrut[] = cadre.flatMap((o) => sommetsDe(o));
  if (!pts.length) return;
  const minx = Math.min(...pts.map((p) => p.x)), maxx = Math.max(...pts.map((p) => p.x));
  const miny = Math.min(...pts.map((p) => p.y)), maxy = Math.max(...pts.map((p) => p.y));
  const marge = 12;
  const k = Math.min((l - 2 * marge) / Math.max(maxx - minx, 0.1), (h - 2 * marge) / Math.max(maxy - miny, 0.1));
  const dx = x + (l - (maxx - minx) * k) / 2, dy = y + (h - (maxy - miny) * k) / 2;
  const P = (p: PtBrut) => ({ x: dx + (p.x - minx) * k, y: dy + (p.y - miny) * k });
  if (parcelle) f.contenu += pdfPolygone(sommetsDe(parcelle).map(P), null, [0.35, 0.3, 0.24], 0.9, 1);
  bati.forEach((b) => { f.contenu += pdfPolygone(sommetsDe(b).map(P), [0.86, 0.84, 0.8], [0.45, 0.4, 0.34], 0.6, 1); });
  dessinees.forEach((t) => { f.contenu += pdfPolygone(sommetsDe(t).map(P), hexToRgb01(t.fill), hexToRgb01(t.stroke), 0.8, 0.9); });
  dessinees.forEach((t) => {
    const i = terrasses.findIndex((c) => c.cle === t.key);
    const q = P(centroid(sommetsDe(t)));
    f.contenu += pdfCercle(q.x, q.y, 7, [1, 1, 1], ENCRE, 1);
    f.texte(q.x, q.y - 2.6, 7, 'T' + (i + 1), { gras: true, aligne: 'centre' });
  });
  f.contenu += pdfFlecheNord(x + l - 16, y + h - 30);
}

/** Les dimensions cles d'une terrasse, sur une ligne : surface, perimetre, emprise, lames, appuis. */
function dimensionsCles(t: ChiffrageTerrasse, objets: ObjetPlan[]): string {
  const o = objets.find((x) => x.key === t.cle);
  if (!o || o.type !== 'polygon') return '';
  const pts = o.pts;
  const perimetre = pts.reduce((s, p, i) => s + dist(p, au(pts, (i + 1) % pts.length)), 0);
  const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
  const a = Math.max(...xs) - Math.min(...xs), b = Math.max(...ys) - Math.min(...ys);
  const c = ensureConstruction(o);
  const appuis = t.postes.find((p) => p.poste === 'vis');
  return nombreFr(t.surface, 2) + ' m² · périmètre ' + nombreFr(perimetre, 2) + ' m · emprise ' + nombreFr(Math.max(a, b), 2) + ' × ' + nombreFr(Math.min(a, b), 2) + ' m'
    + ' · lames ' + essenceDe(c.essenceBois).label + ', ' + (c.largeurLame || 140) + ' mm'
    + (appuis ? ' · ' + quantite(appuis.qte, 'u') + (estPlots(c) ? ' plots' : ' vis de fondation') : '');
}

/** Le prix unitaire et le total d'une ligne, tels qu'ils s'impriment. */
function prixImprimes(p: Poste): { pu: string; total: string } {
  const unite = p.unite === 'u' ? 'u' : p.unite;
  if (p.prix.saisi) return { pu: euros(p.prix.unitaire) + '/' + unite, total: euros(p.prix.total) };
  const u = p.prix.unitaire;
  return { pu: nombreFr(u.bas, 2) + ' – ' + nombreFr(u.haut, 2) + ' €/' + unite, total: fourchette(p.prix.total) };
}

function enTeteTableau(f: Feuille): void {
  f.y -= 4;
  f.contenu += rectanglePdf(MARGE_PDF, f.y - 6, L_UTILE, 17, FOND);
  const st: StyleTexte = { gras: true, couleur: DOUX };
  f.texte(COL.rayon, f.y, 7.5, 'POSTE', st);
  f.texte(COL.designation, f.y, 7.5, 'DÉSIGNATION', st);
  f.texte(COL.qte, f.y, 7.5, 'QTÉ', { ...st, aligne: 'droite' });
  f.texte(COL.pu, f.y, 7.5, 'PRIX UNITAIRE HT', { ...st, aligne: 'droite' });
  f.texte(COL.total, f.y, 7.5, 'TOTAL HT', { ...st, aligne: 'droite' });
  f.y -= 19;
}

/** Le devis, en PDF (une page, deux quand les postes ne tiennent pas) ; `null` sans terrasse a chiffrer. */
export function construireDevisPDF(objets: ObjetPlan[], cles: readonly string[], opts: OptionsDevis): { pdf: string; pages: number; numero: string; nomFichier: string } | null {
  const chiffrage = chiffrerProjet(objets, cles);
  if (!chiffrage.terrasses.length) return null;
  const jour = opts.maintenant ?? new Date();
  const numero = (opts.numero || '').trim() || numeroDevis(opts.nomProjet, jour);
  const e = opts.emetteur ?? {};
  const f = new Feuille((g) => {
    g.texte(MARGE_PDF, g.y - 10, 9, 'Devis ' + numero + ' (suite)', { gras: true });
    g.y -= 24;
    enTeteTableau(g);
  });

  // ---- en-tete : l'emetteur a gauche, le devis a droite ----
  let y = f.y - 12;
  const lEmetteur = 290;
  if (e.nom?.trim()) { f.texte(MARGE_PDF, y, 12, e.nom.trim(), { gras: true }); y -= 14; }
  else { f.texte(MARGE_PDF, y, 9, 'Émetteur non renseigné', { couleur: DOUX }); y -= 13; }
  for (const l of [e.adresse, e.telephone, e.email, e.mentions].map((v) => (v || '').trim()).filter(Boolean)) {
    for (const morceau of couperWinAnsi(l, lEmetteur, 8.5)) { f.texte(MARGE_PDF, y, 8.5, morceau, { couleur: DOUX }); y -= 10.5; }
  }
  const droite = A4_L - MARGE_PDF;
  f.texte(droite, f.y - 16, 20, 'DEVIS', { gras: true, aligne: 'droite' });
  f.texte(droite, f.y - 32, 9, 'N° ' + numero, { aligne: 'droite' });
  f.texte(droite, f.y - 44, 9, 'Établi le ' + dateFr(jour), { aligne: 'droite' });
  f.texte(droite, f.y - 56, 8, 'Estimation : prix indicatifs à confirmer', { couleur: DOUX, aligne: 'droite' });
  f.y = Math.min(y, f.y - 62) - 6;
  f.contenu += traitPdf(MARGE_PDF, f.y, droite, f.y, 0.8, ACCENT);
  f.y -= 18;

  // ---- client et chantier a gauche, vignette du plan a droite ----
  const hautBande = 150, lVignette = 215;
  const lBloc = L_UTILE - lVignette - 16;
  const yBande = f.y;
  let yb = bloc(f, MARGE_PDF, yBande, lBloc, 'Client', clientDuProjet(objets), 'À compléter (Exporter › Devis : le client)', true);
  yb -= 8;
  const chantier = chantierDuProjet(objets);
  if (opts.nomProjet) chantier.push('Projet : ' + opts.nomProjet);
  yb = bloc(f, MARGE_PDF, yb, lBloc, 'Chantier', chantier, 'Adresse du chantier à compléter', false);
  vignette(f, objets, chiffrage.terrasses, droite - lVignette, yBande - hautBande + 8, lVignette, hautBande);
  f.y = Math.min(yb, yBande - hautBande) - 10;

  // ---- le tableau des postes, terrasse par terrasse ----
  enTeteTableau(f);
  chiffrage.terrasses.forEach((t, i) => {
    const dims = couperWinAnsi(dimensionsCles(t, objets), L_UTILE - 12, 7.5);
    f.place(32 + dims.length * 9);
    f.texte(COL.rayon, f.y, 9.5, 'T' + (i + 1) + ' — ' + t.nom, { gras: true });
    f.y -= 11;
    dims.forEach((d) => { f.texte(COL.rayon, f.y, 7.5, d, { couleur: DOUX }); f.y -= 9; });
    f.y -= 4;
    let rayonPrecedent = '';
    t.postes.forEach((p) => {
      const lignes = couperWinAnsi(p.libelle, L_DESIGNATION, 8.5);
      const h = 4 + lignes.length * 10.5;
      f.place(h);
      const { pu, total } = prixImprimes(p);
      const style: StyleTexte = p.prix.saisi ? {} : { couleur: DOUX };
      if (p.rayon !== rayonPrecedent) f.texte(COL.rayon, f.y, 7.5, libelleRayon(p.rayon), { couleur: ACCENT });
      rayonPrecedent = p.rayon;
      lignes.forEach((l, j) => f.texte(COL.designation, f.y - j * 10.5, 8.5, l));
      f.texte(COL.qte, f.y, 8.5, quantite(p.qte, p.unite) + ' ' + p.unite, { aligne: 'droite' });
      f.texte(COL.pu, f.y, 8.5, pu, { ...style, aligne: 'droite' });
      f.texte(COL.total, f.y, 8.5, total, { ...style, aligne: 'droite' });
      f.y -= h;
      f.contenu += traitPdf(COL.designation, f.y + 10, droite, f.y + 10, 0.3, FILET);
    });
    f.place(16);
    f.texte(COL.pu, f.y - 2, 8.5, 'Sous-total T' + (i + 1), { gras: true, aligne: 'droite' });
    f.texte(COL.total, f.y - 2, 8.5, fourchette(t.total), { gras: true, aligne: 'droite' });
    f.y -= 20;
  });

  // ---- les totaux ----
  const taux = opts.tauxTva !== null && opts.tauxTva !== undefined && isFinite(opts.tauxTva) && opts.tauxTva >= 0 ? opts.tauxTva : null;
  const lignesTotal: [string, string, boolean][] = [[chiffrage.toutSaisi ? 'Total HT' : 'Total HT estimé', fourchette(chiffrage.total), true]];
  if (taux !== null) {
    const t = avecTva(chiffrage.total, taux);
    lignesTotal.push(['TVA ' + tauxFr(taux), fourchette(t.tva), false], [chiffrage.toutSaisi ? 'Total TTC' : 'Total TTC estimé', fourchette(t.ttc), true]);
  } else lignesTotal.push(['TVA', 'non comprise', false]);
  f.place(lignesTotal.length * 16 + 10);
  const xTotaux = COL.qte - 40;
  f.contenu += traitPdf(xTotaux, f.y + 8, droite, f.y + 8, 0.8, ACCENT);
  f.y -= 6;
  lignesTotal.forEach(([libelle, valeur, fort]) => {
    f.texte(xTotaux, f.y, fort ? 10 : 9, libelle, fort ? { gras: true } : { couleur: DOUX });
    f.texte(COL.total, f.y, fort ? 10 : 9, valeur, fort ? { gras: true, aligne: 'droite' } : { couleur: DOUX, aligne: 'droite' });
    f.y -= 16;
  });

  // ---- la mention de validite, ce qui est compte et ce qui ne l'est pas ----
  const mentions = [
    'Estimation établie le ' + dateFr(jour) + ' ; prix indicatifs à confirmer.',
    chiffrage.toutSaisi
      ? 'Chaque ligne porte un prix saisi.'
      : 'Les montants « de – à », en gris, n’ont pas encore de prix saisi : ce sont des fourchettes du marché français (ordre de grandeur), pas des prix de fournisseur.',
    'Quantités calculées par Plan sur le plan dessiné : fournitures et préparation du sol ; la main-d’œuvre de pose n’est pas comprise.'
  ];
  const texteMentions = mentions.flatMap((m) => couperWinAnsi(m, L_UTILE, 7.5));
  f.place(texteMentions.length * 9.5 + 10);
  f.y -= 6;
  texteMentions.forEach((m) => { f.texte(MARGE_PDF, f.y, 7.5, m, { couleur: DOUX }); f.y -= 9.5; });
  f.finir();

  f.pages.forEach((p, i) => piedDePage(p, i + 1, f.pages.length, numero, opts.appVersion));
  const pdf = assemblerPDF(f.pages, { appVersion: opts.appVersion, ...(opts.buildAt ? { buildAt: opts.buildAt } : {}), maintenant: jour }, { winAnsi: true });
  return { pdf, pages: f.pages.length, numero, nomFichier: nomFichierDevis(numero) };
}

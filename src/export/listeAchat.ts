// La liste d'achat (export/) : ce qu'on emporte au magasin, rayon par rayon.
//
// Les lignes sont celles de la Nomenclature, une a une (engine/postes.ts relit le BOM) : meme
// designation, meme quantite, memes prix bas et haut par unite, meme prix reel du total de ligne, aux
// memes arrondis que la table affichee. S'y ajoutent ce que la Nomenclature montre plus bas, dans ses
// tables de debit : la section et le nombre de barres par longueur du commerce. Rien n'est recompte.
//
// Deux formats. Le CSV, pour un tableur francais : UTF-8 avec BOM, point-virgule, virgule decimale,
// CRLF (le meme ecrivain que l'export de la consommation, export/csvConsommation.ts) — pas de XLSX :
// il demanderait une archive ZIP ecrite a la main ou une bibliotheque de plus dans un paquet borne a
// 5 Mo, pour un tableau qu'Excel et LibreOffice ouvrent tels quels en CSV. Le PDF, imprimable : une case
// a cocher par ligne et par longueur de barre, a cocher dans les allees.

import { A4_H, A4_L, MARGE_PDF, assemblerPDF, type PagePdf, type Rgb01 } from './pdf/writer.js';
import { cadrePdf, couperWinAnsi, rectanglePdf, texteWinAnsi, traitPdf, type StyleTexte } from './pdf/winAnsi.js';
import { chiffrerProjet, RAYONS, type Poste } from '../engine/postes.js';
import { csv } from './csvConsommation.js';
import { nombreFr } from './devisPdf.js';
import { dateFr, slugFichier } from '../util/format.js';
import type { ObjetPlan } from '../model/types.js';

/** Une ligne de la liste : un poste de la Nomenclature et la terrasse ou il sert. */
export interface LigneAchat { rayon: string; terrasse: string; poste: Poste }

/** Les postes des terrasses retenues, rayon par rayon, puis dans l'ordre des terrasses et de la Nomenclature. */
export function lignesAchat(objets: ObjetPlan[], cles: readonly string[]): { rayon: string; libelle: string; lignes: LigneAchat[] }[] {
  const { terrasses } = chiffrerProjet(objets, cles);
  return RAYONS.map((r) => ({
    rayon: r.id, libelle: r.libelle,
    lignes: terrasses.flatMap((t) => t.postes.filter((p) => p.rayon === r.id).map((p) => ({ rayon: r.id, terrasse: t.nom, poste: p })))
  })).filter((g) => g.lignes.length > 0);
}

// Les arrondis de la Nomenclature (zones/resultats/Nomenclature.tsx) : une quantite a l'unite sans decimale, le reste a deux ;
// les prix a deux decimales. La virgule, pour un tableur francais.
const deux = (v: number) => v.toFixed(2).replace('.', ',');
export const quantiteNomenclature = (qte: number, unite: string) => qte.toFixed(unite === 'u' ? 0 : 2).replace('.', ',');
const metres = (L: number) => L.toFixed(2).replace(/\.?0+$/, '').replace('.', ',') + ' m';
/** `20 × 3 m ; 12 × 2,5 m`. */
export const barresEnTexte = (p: Poste) => (p.barres ?? []).map((b) => b.nombre + ' × ' + metres(b.longueur)).join(' ; ');

export const ENTETES_CSV = ['Rayon', 'Terrasse', 'Désignation', 'Section', 'Barres achetées', 'Quantité', 'Unité',
  'Prix bas (€/unité)', 'Prix haut (€/unité)', 'Prix réel (total ligne, €)', 'Prix réel'];

/** La liste d'achat en CSV. */
export function construireListeAchatCSV(objets: ObjetPlan[], cles: readonly string[]): string {
  const lignes = lignesAchat(objets, cles).flatMap((g) => g.lignes.map(({ terrasse, poste: p }) => [
    g.libelle, terrasse, p.libelle, p.section ?? '', barresEnTexte(p), quantiteNomenclature(p.qte, p.unite), p.unite,
    p.bom.prixBas ? deux(p.bom.prixBas) : '', p.bom.prixHaut ? deux(p.bom.prixHaut) : '',
    p.bom.prixReel !== null ? deux(p.bom.prixReel) : '', p.prix.saisi ? 'saisi' : p.bom.prixReel !== null ? 'estimé (prix par défaut)' : 'non saisi'
  ]));
  return csv(ENTETES_CSV, lignes);
}

/** Le nom des fichiers : `liste-achat-parcelle-ae-101-20261116.csv` (ou `.pdf`). */
export function nomFichierListeAchat(nomProjet: string | null | undefined, jour: Date, extension: 'csv' | 'pdf'): string {
  const p2 = (n: number) => String(n).padStart(2, '0');
  return 'liste-achat-' + slugFichier(nomProjet || 'plan') + '-' + jour.getFullYear() + p2(jour.getMonth() + 1) + p2(jour.getDate()) + '.' + extension;
}

// ---- le PDF imprimable ---------------------------------------------------------------------------

const ENCRE: Rgb01 = [0.15, 0.12, 0.08];
const DOUX: Rgb01 = [0.42, 0.38, 0.33];
const FILET: Rgb01 = [0.78, 0.74, 0.68];
const FOND: Rgb01 = [0.955, 0.94, 0.915];
const ACCENT: Rgb01 = [0.55, 0.42, 0.24];
const BAS = MARGE_PDF + 22;
const COL = { caseX: MARGE_PDF + 2, designation: MARGE_PDF + 22, section: MARGE_PDF + 290, qte: MARGE_PDF + 395, prix: A4_L - MARGE_PDF - 4 };
const L_DESIGNATION = COL.section - 10 - COL.designation;

/** Le prix qu'on lit au magasin : le prix reel de la ligne s'il est saisi, sinon la fourchette, comme le devis. */
function prixLu(p: Poste): string {
  const e = (v: number) => nombreFr(v, 2) + ' €';
  if (p.prix.saisi) return e(p.prix.total);
  return nombreFr(Math.round(p.prix.total.bas), 0) + ' – ' + nombreFr(Math.round(p.prix.total.haut), 0) + ' €';
}

export interface OptionsListeAchat { appVersion: string; buildAt?: string; maintenant?: Date; nomProjet?: string | null | undefined }

/** La liste d'achat en PDF : une case par ligne et par longueur de barre ; `null` sans rien a acheter. */
export function construireListeAchatPDF(objets: ObjetPlan[], cles: readonly string[], opts: OptionsListeAchat): { pdf: string; pages: number } | null {
  const groupes = lignesAchat(objets, cles);
  if (!groupes.length) return null;
  const jour = opts.maintenant ?? new Date();
  const pages: PagePdf[] = [];
  let contenu = '', y = A4_H - MARGE_PDF;
  const texte = (x: number, yy: number, taille: number, t: string, style?: StyleTexte) => { contenu += texteWinAnsi(x, yy, taille, t, style); };
  const caseACocher = (yy: number, cote = 8) => { contenu += cadrePdf(COL.caseX, yy - 1.5, cote, cote, 0.7, ENCRE); };
  const enTete = () => {
    contenu += rectanglePdf(MARGE_PDF, y - 6, A4_L - 2 * MARGE_PDF, 17, FOND);
    const st: StyleTexte = { gras: true, couleur: DOUX };
    texte(COL.designation, y, 7.5, 'DÉSIGNATION', st);
    texte(COL.section, y, 7.5, 'SECTION', st);
    texte(COL.qte, y, 7.5, 'QUANTITÉ', { ...st, aligne: 'droite' });
    texte(COL.prix, y, 7.5, 'PRIX HT', { ...st, aligne: 'droite' });
    y -= 20;
  };
  const finirPage = () => { pages.push({ l: A4_L, h: A4_H, contenu }); contenu = ''; y = A4_H - MARGE_PDF; };
  const place = (h: number) => {
    if (y - h >= BAS) return;
    finirPage();
    texte(MARGE_PDF, y - 10, 9, 'Liste d’achat (suite)', { gras: true });
    y -= 26;
    enTete();
  };

  texte(MARGE_PDF, y - 16, 18, 'Liste d’achat', { gras: true });
  texte(A4_L - MARGE_PDF, y - 16, 9, 'Établie le ' + dateFr(jour), { aligne: 'droite' });
  if (opts.nomProjet) texte(MARGE_PDF, y - 32, 9.5, 'Projet : ' + opts.nomProjet, { couleur: DOUX });
  const terrasses = [...new Set(groupes.flatMap((g) => g.lignes.map((l) => l.terrasse)))];
  texte(MARGE_PDF, y - 45, 8.5, 'Terrasses : ' + terrasses.join(', ') + ' — les quantités de la Nomenclature, barres du commerce comprises.', { couleur: DOUX });
  y -= 56;
  contenu += traitPdf(MARGE_PDF, y, A4_L - MARGE_PDF, y, 0.8, ACCENT);
  y -= 16;
  enTete();

  for (const g of groupes) {
    place(40);
    texte(MARGE_PDF, y, 10, g.libelle, { gras: true, couleur: ACCENT });
    y -= 15;
    for (const { terrasse, poste: p } of g.lignes) {
      const lignes = couperWinAnsi(p.libelle, L_DESIGNATION, 8.5);
      const barres = p.barres ?? [];
      place(lignes.length * 10.5 + 12 + barres.length * 11);
      caseACocher(y);
      lignes.forEach((l, j) => texte(COL.designation, y - j * 10.5, 8.5, l));
      texte(COL.section, y, 8.5, p.section ?? '');
      texte(COL.qte, y, 8.5, quantiteNomenclature(p.qte, p.unite) + ' ' + p.unite, { aligne: 'droite' });
      texte(COL.prix, y, 8.5, prixLu(p), p.prix.saisi ? { aligne: 'droite' } : { aligne: 'droite', couleur: DOUX });
      y -= lignes.length * 10.5;
      if (terrasses.length > 1) { texte(COL.designation, y + 1, 7, terrasse, { couleur: DOUX }); y -= 9; }
      // Une case par longueur de barre : on les prend au rack l'une apres l'autre.
      for (const b of barres) {
        contenu += cadrePdf(COL.designation + 2, y - 0.5, 6.5, 6.5, 0.6, DOUX);
        texte(COL.designation + 14, y, 8, b.nombre + ' barre' + (b.nombre > 1 ? 's' : '') + ' de ' + metres(b.longueur), { couleur: DOUX });
        texte(COL.qte, y, 8, metres(b.nombre * b.longueur).replace(' m', ' ml'), { aligne: 'droite', couleur: DOUX });
        texte(COL.prix, y, 8, nombreFr(b.prixBarre, 2) + ' € la barre' + (b.saisi ? '' : ' (estimé)'), { aligne: 'droite', couleur: DOUX });
        y -= 11;
      }
      y -= 3;
      contenu += traitPdf(COL.designation, y + 7, A4_L - MARGE_PDF, y + 7, 0.3, FILET);
      y -= 6;
    }
    y -= 4;
  }
  place(30);
  y -= 4;
  for (const m of couperWinAnsi('Prix en gris : fourchette estimée ou prix par défaut, à remplacer par le prix du magasin dans la Nomenclature. '
    + 'La main-d’œuvre de pose n’est pas comptée.', A4_L - 2 * MARGE_PDF, 7.5)) { texte(MARGE_PDF, y, 7.5, m, { couleur: DOUX }); y -= 9.5; }
  finirPage();
  pages.forEach((p, i) => {
    p.contenu += traitPdf(MARGE_PDF, MARGE_PDF - 2, A4_L - MARGE_PDF, MARGE_PDF - 2, 0.4, FILET)
      + texteWinAnsi(MARGE_PDF, MARGE_PDF - 13, 7, 'Liste d’achat — établie avec Plan interactif ' + opts.appVersion, { couleur: DOUX })
      + texteWinAnsi(A4_L - MARGE_PDF, MARGE_PDF - 13, 7, 'Page ' + (i + 1) + ' / ' + pages.length, { couleur: DOUX, aligne: 'droite' });
  });
  const pdf = assemblerPDF(pages, { appVersion: opts.appVersion, ...(opts.buildAt ? { buildAt: opts.buildAt } : {}), maintenant: jour }, { winAnsi: true });
  return { pdf, pages: pages.length };
}

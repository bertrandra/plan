// Le dossier de declaration prealable a deposer en mairie (export/).
//
// Le cerfa officiel 13703*12, rempli (export/cerfa13703.ts), suivi de ses pieces : DP1 (carte IGN et
// extrait cadastral), DP2 (plan de masse), DP3 (coupe du terrain, quand le projet porte un relief),
// DP4 (facades et toitures de chaque abri), DP6 (insertion,
// la Vue 3D telle qu'on l'a cadree), DP7 et DP8 (les photographies choisies, lot L5), puis la notice
// descriptive quand la personne en a valide le texte (lot L5 ; sans texte valide, pas de page). Le
// formulaire reste modifiable : ce que le plan ne sait pas se complete dans un lecteur PDF avant de signer.
//
// pdf-lib est recue en parametre : l'application la charge a la demande depuis un CDN, comme
// three.js, et les tests passent celle du paquet npm.

import { assemblerPDF } from './pdf/writer.js';
import { remplirCerfa13703, type Piece, type RemplissageCerfa } from './cerfa13703.js';
import { pageFacades, pagePlanDeMasse, pageProfil, pageSituationCadastre, type MetaPieces } from './piecesDP.js';
import { solDuProjet } from '../engine/sol.js';
import { estAbri, parcelleDuProjet } from '../model/fonctions.js';
import { relireDossier, type PointRelecture } from './relecture.js';
import { LIBELLES_PIECES_PHOTO, photoDe, texteValide, type PiecePhoto } from '../regles/textes/dossier.js';
import type * as PdfLib from 'pdf-lib';
import type { ObjetPlan } from '../model/types.js';

export type BibliothequePdf = typeof PdfLib;

export interface OptionsDossier {
  date: Date;
  meta: MetaPieces;
  /** La carte IGN qui situe le terrain dans la commune, en PNG ; absente, l'extrait cadastral seul. */
  carte?: Uint8Array | null;
  /** La Vue 3D, en PNG, pour la piece DP6 ; absente, la piece reste a joindre. */
  vue3d?: Uint8Array | null;
}

/** `relecture` : la relecture du dossier tel qu'il est parti (export/relecture.ts), que le message de l'export resume. */
export interface DossierMairie { pdf: Uint8Array; remplissage: RemplissageCerfa; pieces: Piece[]; relecture: PointRelecture[] }

/**
 * Les pieces que le dossier joindra, dans l'ordre du bordereau : celles que le plan sait dessiner, la carte et la Vue 3D quand elles
 * sont la, et les photographies choisies qui sont sur cet appareil. La relecture d'avant l'export et l'export lui-meme les lisent ici.
 */
export function piecesDuDossier(objets: ObjetPlan[], o: { carte: boolean; vue3d: boolean }): Piece[] {
  const pieces: Piece[] = [];
  if (pageSituationCadastre(objets, META_VIDE) || o.carte) pieces.push('DP1');
  if (pagePlanDeMasse(objets, META_VIDE)) pieces.push('DP2');
  if (pageProfil(objets, META_VIDE)) pieces.push('DP3');
  if (objets.some(a => estAbri(a) && pageFacades(a, META_VIDE, solDuProjet(objets)) !== null)) pieces.push('DP4');
  if (o.vue3d) pieces.push('DP6');
  const dossier = parcelleDuProjet(objets)?.dossier;
  (['DP7', 'DP8'] as const).forEach(p => { if (photoDe(dossier, p)?.image) pieces.push(p); });
  return pieces;
}
/** La relecture du dossier tel qu'il partirait avec la carte et cette Vue 3D (le dialogue de la declaration, avant l'export). */
export const relireAvantExport = (objets: ObjetPlan[], o: { carte: boolean; vue3d: boolean }): PointRelecture[] => relireDossier(objets, piecesDuDossier(objets, o));
const META_VIDE: MetaPieces = { nomProjet: null, adresse: '', references: '' };

/** La police standard du formulaire ecrit en WinAnsi : les symboles hors de ce jeu sont transcrits. */
export function pourWinAnsi(t: string): string {
  const car = String.fromCharCode;
  const table: Record<string, string> = {
    [car(0x2264)]: '<=', [car(0x2265)]: '>=', [car(0x3c6)]: 'phi', [car(0x2212)]: '-', [car(0x3bc)]: 'mu',
    [car(0x202f)]: ' ', [car(0xa0)]: ' ', [car(0x2026)]: '...'
  };
  // Hors de l'ASCII et du Latin-1, les seuls caracteres que WinAnsi sait ecrire.
  const winAnsi = [0x2018, 0x2019, 0x201c, 0x201d, 0x2013, 0x2014, 0x2022, 0x20ac, 0x152, 0x153];
  return [...t].map(c => table[c] ?? c).map(c => {
    const n = c.codePointAt(0) ?? 63;
    return (n >= 0x20 && n <= 0x7e) || (n >= 0xa1 && n <= 0xff) || winAnsi.includes(n) ? c : '?';
  }).join('');
}

const enOctets = (s: string): Uint8Array => Uint8Array.from(s, c => c.charCodeAt(0) & 0xff);

/** Une page d'image, a la largeur de la feuille, avec son numero de piece et son titre (PNG, ou JPEG pour une photographie). */
async function pageImage(lib: BibliothequePdf, doc: PdfLib.PDFDocument, png: Uint8Array, numero: string, titre: string, legende: string, repere: boolean): Promise<void> {
  const page = doc.addPage([841.89, 595.28]);
  const police = await doc.embedFont(lib.StandardFonts.Helvetica);
  const image = png[0] === 0xff && png[1] === 0xd8 ? await doc.embedJpg(png) : await doc.embedPng(png);
  const m = 36, hautTitre = 40;
  const l = page.getWidth() - 2 * m, h = page.getHeight() - 2 * m - hautTitre - 16;
  const k = Math.min(l / image.width, h / image.height);
  const w = image.width * k, hh = image.height * k;
  const x = m + (l - w) / 2, y = m + 16 + (h - hh) / 2;
  page.drawText(numero, { x: m, y: page.getHeight() - m - 20, size: 16, font: police, color: lib.rgb(0.78, 0.25, 0.18) });
  page.drawText(pourWinAnsi(titre), { x: m + 60, y: page.getHeight() - m - 20, size: 13, font: police });
  page.drawImage(image, { x, y, width: w, height: hh });
  page.drawRectangle({ x, y, width: w, height: hh, borderColor: lib.rgb(0.23, 0.18, 0.12), borderWidth: 0.8 });
  // Le terrain, au centre de la carte.
  if (repere) page.drawCircle({ x: x + w / 2, y: y + hh / 2, size: 9, borderColor: lib.rgb(0.85, 0.1, 0.1), borderWidth: 2.5 });
  page.drawText(pourWinAnsi(legende), { x: m, y: m, size: 8, font: police, color: lib.rgb(0.45, 0.42, 0.38) });
}

/** Les octets d'une image `data:…;base64,` (une photographie du dossier). */
function octetsDataUrl(url: string): Uint8Array {
  const b = atob(url.slice(url.indexOf(',') + 1));
  return Uint8Array.from(b, c => c.charCodeAt(0));
}

/** Les lignes d'un paragraphe a cette largeur, coupees aux espaces (un mot plus long que la ligne y reste seul). */
export function couperEnLignes(texte: string, largeur: number, mesure: (t: string) => number): string[] {
  const lignes: string[] = [];
  for (const paragraphe of texte.replace(/\r\n?/g, '\n').split('\n')) {
    let ligne = '';
    for (const mot of paragraphe.split(/\s+/).filter(Boolean)) {
      const essai = ligne ? ligne + ' ' + mot : mot;
      if (ligne && mesure(essai) > largeur) { lignes.push(ligne); ligne = mot; } else ligne = essai;
    }
    lignes.push(ligne);
  }
  return lignes;
}

/**
 * La notice descriptive : les textes valides de la notice et de l'insertion paysagere, tels quels (lot L5). Sans texte valide, pas de
 * page. Une page A4 en portrait, et autant de suites que le texte en demande ; ni date ni heure : le meme texte s'imprime a l'identique.
 */
async function pagesNotice(lib: BibliothequePdf, doc: PdfLib.PDFDocument, parties: { titre: string; texte: string }[]): Promise<void> {
  const police = await doc.embedFont(lib.StandardFonts.Helvetica), gras = await doc.embedFont(lib.StandardFonts.HelveticaBold);
  const L = 595.28, H = 841.89, m = 56, corps = 10, interligne = 14;
  let page = doc.addPage([L, H]), y = H - m;
  const suite = () => { page = doc.addPage([L, H]); y = H - m; };
  page.drawText('Notice descriptive du projet', { x: m, y: y - 16, size: 16, font: police, color: lib.rgb(0.78, 0.25, 0.18) });
  y -= 44;
  for (const p of parties) {
    if (y < m + 3 * interligne) suite();
    page.drawText(pourWinAnsi(p.titre), { x: m, y, size: 12, font: gras });
    y -= interligne * 1.6;
    for (const ligne of couperEnLignes(pourWinAnsi(p.texte), L - 2 * m, t => police.widthOfTextAtSize(t, corps))) {
      if (y < m) suite();
      if (ligne) page.drawText(ligne, { x: m, y, size: corps, font: police });
      y -= interligne;
    }
    y -= interligne;
  }
}

/** Le dossier complet : le cerfa rempli, puis ses pieces numerotees. */
export async function assemblerDossierMairie(lib: BibliothequePdf, cerfa: Uint8Array, objets: ObjetPlan[], o: OptionsDossier): Promise<DossierMairie> {
  const situation = pageSituationCadastre(objets, o.meta);
  const masse = pagePlanDeMasse(objets, o.meta);
  const profil = pageProfil(objets, o.meta);
  const facades = objets.filter(estAbri).map(a => pageFacades(a, o.meta, solDuProjet(objets))).filter(p => p !== null);
  const pieces = piecesDuDossier(objets, { carte: !!o.carte, vue3d: !!o.vue3d });
  const dossier = parcelleDuProjet(objets)?.dossier;
  const remplissage = remplirCerfa13703(objets, o.date, pieces);

  const doc = await lib.PDFDocument.load(cerfa);
  const form = doc.getForm();
  Object.entries(remplissage.textes).forEach(([nom, valeur]) => {
    try {
      const champ = form.getTextField(nom);
      const max = champ.getMaxLength();
      champ.setText(pourWinAnsi(valeur).slice(0, max ?? 2000));
    } catch { /* un champ absent de cette version du cerfa : rien a ecrire */ }
  });
  remplissage.cases.forEach(nom => { try { form.getCheckBox(nom).check(); } catch { /* idem */ } });

  if (o.carte) await pageImage(lib, doc, o.carte, 'DP1', 'Plan de situation du terrain', 'Carte : Plan IGN (Geoplateforme). Le cercle rouge marque le terrain.', true);
  const vectorielles = [situation, masse, profil, ...facades].filter(p => p !== null);
  if (vectorielles.length) {
    const source = await lib.PDFDocument.load(enOctets(assemblerPDF(vectorielles)));
    const copies = await doc.copyPages(source, source.getPageIndices());
    copies.forEach(p => doc.addPage(p));
  }
  if (o.vue3d) await pageImage(lib, doc, o.vue3d, 'DP6', 'Insertion du projet dans son environnement', 'Vue 3D du projet, etablie avec Plan interactif.', false);
  for (const p of ['DP7', 'DP8'] as PiecePhoto[]) {
    const image = photoDe(dossier, p)?.image;
    if (image && pieces.includes(p)) await pageImage(lib, doc, octetsDataUrl(image), p, LIBELLES_PIECES_PHOTO[p], 'Photographie jointe par le déclarant.', false);
  }
  const notice = texteValide(dossier, 'notice'), insertion = texteValide(dossier, 'insertion');
  const parties = [...(notice ? [{ titre: 'Description du projet', texte: notice }] : []), ...(insertion ? [{ titre: 'Insertion paysagère', texte: insertion }] : [])];
  if (parties.length) await pagesNotice(lib, doc, parties);
  doc.setTitle('Declaration prealable - cerfa 13703*12');
  doc.setProducer('Plan interactif');
  return { pdf: await doc.save(), remplissage, pieces, relecture: relireDossier(objets, pieces) };
}

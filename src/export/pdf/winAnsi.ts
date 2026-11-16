// Le texte d'un PDF en WinAnsi : accents, signe euro et typographie francaise (export/pdf/).
//
// L'ecrivain du projet (writer.ts) ecrit en ASCII : ses premiers exports transcrivent les accents
// (« Genere le »), et leurs empreintes le figent. Les exports qui s'adressent a un particulier — le
// devis, la liste d'achat — s'ecrivent en francais : la police Helvetica des quatorze polices de base,
// encodee WinAnsi (`assemblerPDF(…, { winAnsi: true })`), en a tous les signes. Les chasses des deux
// graisses viennent des metriques Adobe (AFM) de la police, pour aligner les nombres a droite et couper
// une ligne a la largeur de sa colonne : l'approximation d'une demi-taille par caractere des autres
// exports decalait une colonne de prix de plusieurs points.

import type { Rgb01 } from './writer.js';

/** Chasses, en milliemes de corps, des codes 32 a 255 : Helvetica puis Helvetica-Bold (AFM d'Adobe). */
const CHASSES = [
  278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,
  584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,
  667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,
  278,556,500,722,500,500,500,334,260,334,584,0,556,0,222,556,333,1000,556,556,333,1000,667,333,1000,0,611,0,
  0,222,222,333,333,350,556,1000,333,1000,500,333,944,0,500,500,278,333,556,556,556,556,260,556,333,737,370,556,
  584,333,737,333,400,584,333,333,333,556,537,278,333,333,365,556,834,834,834,611,667,667,667,667,667,667,1000,722,
  667,667,667,667,278,278,278,278,722,722,778,778,778,778,778,584,778,722,722,722,722,667,667,611,556,556,556,556,
  556,556,889,500,556,556,556,556,278,278,278,278,556,556,556,556,556,556,556,584,611,556,556,556,556,500,556,500
];
const CHASSES_GRAS = [
  278,333,474,556,556,889,722,238,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,333,333,
  584,584,584,611,975,722,722,722,722,667,611,778,722,278,556,722,611,833,722,778,667,778,722,667,611,722,667,944,
  667,667,611,333,278,333,584,556,333,556,611,556,611,556,333,611,611,278,278,556,278,889,611,611,611,611,389,556,
  333,611,556,778,556,556,500,389,280,389,584,0,556,0,278,556,500,1000,556,556,333,1000,667,333,1000,0,611,0,
  0,278,278,500,500,350,556,1000,333,1000,556,333,944,0,500,556,278,333,556,556,556,556,280,556,333,737,370,556,
  584,333,737,333,400,584,333,333,333,611,556,278,333,333,365,556,834,834,834,611,722,722,722,722,722,722,1000,722,
  667,667,667,667,278,278,278,278,722,722,778,778,778,778,778,584,778,722,722,722,722,667,667,611,556,556,556,556,
  556,556,889,556,556,556,556,556,278,278,278,278,611,611,611,611,611,611,611,584,611,611,611,611,611,556,611,556
];

/** Les signes de la plage 0x80–0x9F de WinAnsi, la ou il differe du latin-1. */
const PLAGE_80: Record<string, number> = {
  '€': 0x80, '‚': 0x82, 'ƒ': 0x83, '„': 0x84, '…': 0x85, '†': 0x86, '‡': 0x87, 'ˆ': 0x88, '‰': 0x89, 'Š': 0x8a, '‹': 0x8b, 'Œ': 0x8c,
  'Ž': 0x8e, '‘': 0x91, '’': 0x92, '“': 0x93, '”': 0x94, '•': 0x95, '–': 0x96, '—': 0x97, '˜': 0x98, '™': 0x99, 'š': 0x9a, '›': 0x9b,
  'œ': 0x9c, 'ž': 0x9e, 'Ÿ': 0x9f
};
/** Ce que WinAnsi n'a pas, et qui s'ecrit pourtant : les espaces fines et insecables deviennent une espace, le moins un tiret. */
const EQUIVALENTS: Record<string, string> = { ' ': ' ', ' ': ' ', ' ': ' ', '−': '-', '≤': '<=', '≥': '>=', '→': '->', '≈': '~' };

/** Un texte en codes WinAnsi, un caractere par octet ; ce qui n'a pas de code devient « ? ». */
export function enWinAnsi(t: string): string {
  let out = '';
  for (const c of String(t)) {
    const eq = EQUIVALENTS[c];
    if (eq !== undefined) { out += eq; continue; }
    const code = c.codePointAt(0) ?? 63;
    if (code >= 0x20 && code < 0x7f) out += c;
    else if (code >= 0xa0 && code <= 0xff) out += c;
    else if (PLAGE_80[c] !== undefined) out += String.fromCharCode(PLAGE_80[c]);
    else {
      // Une lettre accentuee hors latin-1 (ă, ł…) garde au moins sa lettre de base.
      const base = c.normalize('NFD').replace(/[̀-ͯ]/g, '');
      out += base.length === 1 && base.charCodeAt(0) < 0x7f && base.charCodeAt(0) >= 0x20 ? base : '?';
    }
  }
  return out;
}

/** La largeur d'un texte, en points, a ce corps. */
export function largeurWinAnsi(t: string, taille: number, gras = false): number {
  const table = gras ? CHASSES_GRAS : CHASSES;
  let l = 0;
  for (const c of enWinAnsi(t)) l += table[c.charCodeAt(0) - 32] ?? 556;
  return l * taille / 1000;
}

/** Ce que le texte d'un `Tj` doit echapper : la barre oblique inverse et les parentheses. */
const echapper = (t: string) => t.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');

export interface StyleTexte {
  gras?: boolean;
  couleur?: Rgb01;
  /** `droite` : `x` est le bord droit du texte (une colonne de nombres) ; `centre` : son milieu. */
  aligne?: 'gauche' | 'droite' | 'centre';
}

/** Un texte sur la page, en WinAnsi. */
export function texteWinAnsi(x: number, y: number, taille: number, t: string, style: StyleTexte = {}): string {
  const c = style.couleur ?? [0.15, 0.12, 0.08];
  const l = style.aligne && style.aligne !== 'gauche' ? largeurWinAnsi(t, taille, style.gras) : 0;
  const x0 = style.aligne === 'droite' ? x - l : style.aligne === 'centre' ? x - l / 2 : x;
  return 'BT /' + (style.gras ? 'F2' : 'F1') + ' ' + taille + ' Tf ' + c[0].toFixed(3) + ' ' + c[1].toFixed(3) + ' ' + c[2].toFixed(3) + ' rg '
    + x0.toFixed(2) + ' ' + y.toFixed(2) + ' Td (' + echapper(enWinAnsi(t)) + ') Tj ET\n';
}

/** Un texte coupe en lignes qui tiennent dans `largeur` points ; un mot plus long que la ligne reste entier. */
export function couperWinAnsi(t: string, largeur: number, taille: number, gras = false): string[] {
  const lignes: string[] = [];
  let ligne = '';
  for (const mot of String(t).split(/\s+/).filter(Boolean)) {
    const essai = ligne ? ligne + ' ' + mot : mot;
    if (ligne && largeurWinAnsi(essai, taille, gras) > largeur) { lignes.push(ligne); ligne = mot; }
    else ligne = essai;
  }
  if (ligne) lignes.push(ligne);
  return lignes;
}

/** Un trait droit, de cette epaisseur et de cette couleur. */
export function traitPdf(x1: number, y1: number, x2: number, y2: number, epaisseur: number, couleur: Rgb01): string {
  return couleur[0].toFixed(3) + ' ' + couleur[1].toFixed(3) + ' ' + couleur[2].toFixed(3) + ' RG ' + epaisseur.toFixed(2) + ' w [] 0 d '
    + x1.toFixed(2) + ' ' + y1.toFixed(2) + ' m ' + x2.toFixed(2) + ' ' + y2.toFixed(2) + ' l S\n';
}

/** Un rectangle plein (fond d'une ligne, d'un cartouche). */
export function rectanglePdf(x: number, y: number, l: number, h: number, fond: Rgb01): string {
  return fond[0].toFixed(3) + ' ' + fond[1].toFixed(3) + ' ' + fond[2].toFixed(3) + ' rg ' + x.toFixed(2) + ' ' + y.toFixed(2) + ' ' + l.toFixed(2) + ' ' + h.toFixed(2) + ' re f\n';
}

/** Un cadre (le contour d'un rectangle), de cette epaisseur. */
export function cadrePdf(x: number, y: number, l: number, h: number, epaisseur: number, couleur: Rgb01): string {
  return couleur[0].toFixed(3) + ' ' + couleur[1].toFixed(3) + ' ' + couleur[2].toFixed(3) + ' RG ' + epaisseur.toFixed(2) + ' w [] 0 d '
    + x.toFixed(2) + ' ' + y.toFixed(2) + ' ' + l.toFixed(2) + ' ' + h.toFixed(2) + ' re S\n';
}

/** Le PDF ecrit (un caractere par octet) en octets, pour le telecharger tel quel : un `Blob` de la chaine l'ecrirait en UTF-8. */
export function octetsPdf(pdf: string): Uint8Array {
  const o = new Uint8Array(pdf.length);
  for (let i = 0; i < pdf.length; i++) o[i] = pdf.charCodeAt(i) & 0xff;
  return o;
}

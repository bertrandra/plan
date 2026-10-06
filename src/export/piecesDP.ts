// Les pieces graphiques d'une declaration prealable, tirees du plan (export/).
//
//   DP1  plan de situation : l'extrait cadastral (la parcelle, ses voisines, le bati) ; la carte IGN
//        qui situe le terrain dans la commune s'ajoute a l'assemblage (export/dossierMairie.ts) ;
//   DP2  plan de masse cote dans les trois dimensions : l'existant, le projet, ses cotes, sa distance
//        aux limites, ses hauteurs ;
//   DP3  plan en coupe du terrain et de la construction : le profil du sol lu dans le relief IGN,
//        la terrasse et les abris que la coupe traverse ; seulement quand un relief existe ;
//   DP4  plan des facades et des toitures : deux elevations et la vue de dessus de chaque abri.
//
// Chaque piece porte son numero, comme le demande le bordereau du cerfa. Pages en vectoriel, avec
// l'ecrivain PDF du projet ; l'assemblage les ajoute derriere le formulaire.

import { au } from '../util/tableaux.js';
import { dist, centroid, shoelace, signedArea } from '../geometry/basic.js';
import { clipLineToPolygon } from '../geometry/polygon.js';
import { calculerPergola, dimsPergola, libelleAbri, type PergolaCalculee, type Pt3 } from '../engine/pergola.js';
import { hauteurFinieMm } from '../engine/hauteurs.js';
import { estAbri, estBatiment, estTerrain, estTerrasse, parcelleDuProjet } from '../model/fonctions.js';
import { elevationParDefaut } from '../model/defaults.js';
import { empriseRelief, libelleSource, ligneDePlusGrandePente, pointDeReference, profilRelief, reliefDe, resumeRelief, type Emprise } from '../model/relief.js';
import { courbesDeNiveau, etiquetteNiveau, longueurPolyligne, milieuPolyligne } from '../render/relief.js';
import { A4_H, A4_L, MARGE_PDF, PT_PAR_METRE, echelleQuiTient, pdfEchelleGraphique, pdfFlecheNord, pdfPolygone, pdfTexte, type PagePdf, type Rgb01 } from './pdf/writer.js';
import { enAscii } from './noteCalculPdf.js';
import type { ObjetPlan, PtBrut, Relief } from '../model/types.js';

export interface MetaPieces { nomProjet?: string | null | undefined; adresse?: string; references?: string }

const ENCRE: Rgb01 = [0.23, 0.18, 0.12];
const GRIS: Rgb01 = [0.55, 0.52, 0.48];
const PROJET: Rgb01 = [0.78, 0.25, 0.18];
const PROJET_FOND: Rgb01 = [0.97, 0.86, 0.82];
const BATI: Rgb01 = [0.82, 0.8, 0.77];
const BOIS: Rgb01 = [0.82, 0.68, 0.5];
const SOL: Rgb01 = [0.93, 0.9, 0.85];
const fr = (v: number, d = 2): string => v.toFixed(d).replace('.', ',');
/** « 0,25 », « 0,5 », « 1 » : une equidistance sans zeros inutiles. */
const frCourt = (v: number): string => fr(v, 2).replace(/,?0+$/, '');

/** Un trait, plein ou en tirets. */
function trait(a: { x: number; y: number }, b: { x: number; y: number }, couleur: Rgb01, epaisseur = 0.8, tirets = false): string {
  return couleur.map(c => c.toFixed(3)).join(' ') + ' RG ' + epaisseur.toFixed(2) + ' w ' + (tirets ? '[4 3] 0 d ' : '[] 0 d ')
    + a.x.toFixed(2) + ' ' + a.y.toFixed(2) + ' m ' + b.x.toFixed(2) + ' ' + b.y.toFixed(2) + ' l S [] 0 d\n';
}

/** Une polyligne ouverte, en points de page. */
function polyligne(pts: { x: number; y: number }[], couleur: Rgb01, epaisseur = 0.8): string {
  if (pts.length < 2) return '';
  return couleur.map(c => c.toFixed(3)).join(' ') + ' RG ' + epaisseur.toFixed(2) + ' w [] 0 d 1 j\n'
    + pts.map((p, i) => p.x.toFixed(2) + ' ' + p.y.toFixed(2) + (i === 0 ? ' m' : ' l')).join(' ') + ' S 0 j\n';
}

/**
 * Une polyligne coupee a un rectangle du plan : les morceaux qui restent dedans (Liang-Barsky
 * segment par segment, recousus quand ils se suivent). Les courbes de niveau debordent la parcelle
 * de dix metres : sur la feuille, elles s'arretent au cadre.
 */
export function decouperPolyligne(pts: readonly PtBrut[], e: Emprise): PtBrut[][] {
  const out: PtBrut[][] = [];
  let courant: PtBrut[] = [];
  const meme = (a: PtBrut, b: PtBrut) => Math.abs(a.x - b.x) < 1e-9 && Math.abs(a.y - b.y) < 1e-9;
  for (let i = 1; i < pts.length; i++) {
    const a = au(pts, i - 1), b = au(pts, i);
    const dx = b.x - a.x, dy = b.y - a.y;
    let t0 = 0, t1 = 1, dehors = false;
    for (const [p, q] of [[-dx, a.x - e.xMin], [dx, e.xMax - a.x], [-dy, a.y - e.yMin], [dy, e.yMax - a.y]] as [number, number][]) {
      if (Math.abs(p) < 1e-12) { if (q < 0) { dehors = true; break; } continue; }
      const t = q / p;
      if (p < 0) { if (t > t1) { dehors = true; break; } if (t > t0) t0 = t; }
      else { if (t < t0) { dehors = true; break; } if (t < t1) t1 = t; }
    }
    if (dehors) { if (courant.length >= 2) out.push(courant); courant = []; continue; }
    const pa = { x: a.x + dx * t0, y: a.y + dy * t0 }, pb = { x: a.x + dx * t1, y: a.y + dy * t1 };
    if (courant.length && !meme(au(courant, courant.length - 1), pa)) { if (courant.length >= 2) out.push(courant); courant = []; }
    if (!courant.length) courant.push(pa);
    courant.push(pb);
  }
  if (courant.length >= 2) out.push(courant);
  return out;
}

/**
 * Les courbes de niveau sur une feuille : trait fin gris, maitresses plus fortes et etiquetees,
 * coupees a l'emprise `e` du plan. Le dessin partage son calcul avec l'ecran (render/relief.ts).
 */
function courbesSurFeuille(r: Relief, parcelle: readonly PtBrut[], e: Emprise, P: (p: PtBrut) => { x: number; y: number }): { s: string; equidistance: number } {
  const { equidistance, courbes } = courbesDeNiveau(r, parcelle);
  let s = '';
  courbes.forEach(c => decouperPolyligne(c.pts, e).forEach(morceau => {
    const feuille = morceau.map(P);
    s += polyligne(feuille, GRIS, c.maitresse ? 0.7 : 0.35);
    if (c.maitresse && longueurPolyligne(feuille) >= 40) {
      const m = milieuPolyligne(feuille);
      s += pdfTexte(m.x - 8, m.y + 1.5, 5.5, etiquetteNiveau(c.niveau), GRIS);
    }
  }));
  return { s, equidistance };
}

/**
 * Une ligne de cote entre deux points de la page, avec sa valeur a cote du trait. `cote` dit de quel
 * cote du trait ecrire : 1 a gauche du sens a -> b, -1 a droite.
 */
function cote(a: { x: number; y: number }, b: { x: number; y: number }, texte: string, couleur: Rgb01 = ENCRE, sens = 1): string {
  const L = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const nx = -(b.y - a.y) / L, ny = (b.x - a.x) / L;
  let s = trait(a, b, couleur, 0.5);
  s += trait({ x: a.x - nx * 3, y: a.y - ny * 3 }, { x: a.x + nx * 3, y: a.y + ny * 3 }, couleur, 0.5);
  s += trait({ x: b.x - nx * 3, y: b.y - ny * 3 }, { x: b.x + nx * 3, y: b.y + ny * 3 }, couleur, 0.5);
  // Le texte se pose a 5 pt du trait, du cote demande, sans le chevaucher quel que soit l'angle.
  const largeur = texte.length * 3.5, mx = (a.x + b.x) / 2 + nx * sens * 5, my = (a.y + b.y) / 2 + ny * sens * 5;
  const x = nx * sens > 0.3 ? mx : nx * sens < -0.3 ? mx - largeur : mx - largeur / 2;
  const y = ny * sens > 0.3 ? my : ny * sens < -0.3 ? my - 7 : my - 2;
  return s + pdfTexte(x, y, 7, enAscii(texte), couleur);
}

/** L'en-tete d'une piece : son numero, son titre, et ce qui l'identifie. La feuille est en portrait, sauf dit autrement. */
function cartouche(numero: string, titre: string, meta: MetaPieces, echelle?: number, feuille: { l: number; h: number } = { l: A4_L, h: A4_H }): string {
  const { l, h } = feuille;
  let s = pdfPolygone([{ x: MARGE_PDF, y: h - MARGE_PDF - 44 }, { x: l - MARGE_PDF, y: h - MARGE_PDF - 44 }, { x: l - MARGE_PDF, y: h - MARGE_PDF }, { x: MARGE_PDF, y: h - MARGE_PDF }], null, ENCRE, 0.8);
  s += pdfTexte(MARGE_PDF + 8, h - MARGE_PDF - 20, 14, enAscii(numero), PROJET);
  s += pdfTexte(MARGE_PDF + 70, h - MARGE_PDF - 20, 12, enAscii(titre));
  s += pdfTexte(MARGE_PDF + 70, h - MARGE_PDF - 36, 8, enAscii([meta.adresse, meta.references, meta.nomProjet ? 'projet ' + meta.nomProjet : ''].filter(Boolean).join(' - ')), GRIS);
  if (echelle) s += pdfTexte(l - MARGE_PDF - 70, h - MARGE_PDF - 20, 10, 'Ech. 1/' + echelle);
  return s;
}

/** Projection d'une emprise du plan dans un cadre de la page, a une echelle du commerce. */
function cadrer(pts: PtBrut[], cadre: { x: number; y: number; l: number; h: number }) {
  const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const denom = echelleQuiTient(Math.max(1, x1 - x0), Math.max(1, y1 - y0), cadre.l, cadre.h);
  const k = PT_PAR_METRE / denom;
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  const P = (p: PtBrut) => ({ x: cadre.x + cadre.l / 2 + (p.x - cx) * k, y: cadre.y + cadre.h / 2 + (p.y - cy) * k });
  return { P, k, denom };
}

/** `Pergola 1` plutot que `Pergola Pergola 1` : le type n'est ajoute que si le nom ne le dit pas. */
function nomOuvrage(o: ObjetPlan): string {
  const type = estAbri(o) ? libelleAbri(o) : 'Terrasse';
  return o.name.toLowerCase().startsWith(type.toLowerCase()) ? o.name : type + ' ' + o.name;
}

const contour = (o: ObjetPlan): PtBrut[] => o.type === 'polygon' ? o.pts : o.type === 'circle' ? Array.from({ length: 24 }, (_, i) => ({ x: o.center.x + o.r * Math.cos(i * Math.PI / 12), y: o.center.y + o.r * Math.sin(i * Math.PI / 12) })) : [];

/** DP1 : l'extrait cadastral — la parcelle du projet en evidence, ses voisines et le bati. */
export function pageSituationCadastre(objets: ObjetPlan[], meta: MetaPieces): PagePdf | null {
  const parcelle = parcelleDuProjet(objets);
  if (!parcelle || parcelle.type !== 'polygon') return null;
  const terrains = objets.filter(o => estTerrain(o) && o.type === 'polygon');
  const tout = terrains.flatMap(contour);
  const cadre = { x: MARGE_PDF, y: MARGE_PDF + 40, l: A4_L - 2 * MARGE_PDF, h: A4_H - 2 * MARGE_PDF - 100 };
  const { P, k, denom } = cadrer(tout.length ? tout : parcelle.pts, cadre);
  let s = cartouche('DP1', 'Plan de situation - extrait cadastral', meta, denom);
  terrains.forEach(o => { s += pdfPolygone(contour(o).map(P), o === parcelle ? PROJET_FOND : null, o === parcelle ? PROJET : GRIS, o === parcelle ? 1.6 : 0.6); });
  objets.filter(estBatiment).forEach(o => { s += pdfPolygone(contour(o).map(P), BATI, GRIS, 0.5); });
  const c = P(centroid(parcelle.pts));
  s += pdfTexte(c.x - 30, c.y, 9, enAscii(meta.references || 'Terrain du projet'), PROJET);
  s += pdfFlecheNord(A4_L - MARGE_PDF - 30, MARGE_PDF + 10);
  s += pdfEchelleGraphique(MARGE_PDF, MARGE_PDF + 14, k, denom);
  return { l: A4_L, h: A4_H, contenu: s };
}

/** La distance d'une emprise a la limite la plus proche du terrain : les deux points qui la realisent. */
function plusProcheLimite(emprise: PtBrut[], limite: PtBrut[]): { a: PtBrut; b: PtBrut; d: number } | null {
  let best: { a: PtBrut; b: PtBrut; d: number } | null = null;
  emprise.forEach(p => limite.forEach((q, i) => {
    const r = au(limite, (i + 1) % limite.length);
    const dx = r.x - q.x, dy = r.y - q.y, L2 = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((p.x - q.x) * dx + (p.y - q.y) * dy) / L2));
    const h = { x: q.x + t * dx, y: q.y + t * dy };
    const d = dist(p, h);
    if (!best || d < best.d) best = { a: p, b: h, d };
  }));
  return best;
}

/** DP2 : le plan de masse cote dans les trois dimensions. */
export function pagePlanDeMasse(objets: ObjetPlan[], meta: MetaPieces): PagePdf | null {
  const parcelle = parcelleDuProjet(objets);
  if (!parcelle || parcelle.type !== 'polygon') return null;
  const cadre = { x: MARGE_PDF, y: MARGE_PDF + 70, l: A4_L - 2 * MARGE_PDF, h: A4_H - 2 * MARGE_PDF - 140 };
  const { P, k, denom } = cadrer(parcelle.pts, cadre);
  let s = cartouche('DP2', 'Plan de masse cote dans les 3 dimensions', meta, denom);
  // Le relief, quand il existe : un plan de masse montre le terrain, quelle que soit la preference
  // d'affichage de l'ecran. Les courbes passent sous tout le reste, coupees au cadre de la feuille.
  const relief = reliefDe(objets);
  let legendeRelief = '';
  if (relief) {
    const o = P({ x: 0, y: 0 });
    const inv = (q: { x: number; y: number }) => ({ x: (q.x - o.x) / k, y: (q.y - o.y) / k });
    const hg = inv({ x: cadre.x, y: cadre.y }), bd = inv({ x: cadre.x + cadre.l, y: cadre.y + cadre.h });
    const r = courbesSurFeuille(relief, parcelle.pts, { xMin: hg.x, xMax: bd.x, yMin: hg.y, yMax: bd.y }, P);
    s += r.s;
    legendeRelief = 'Courbes de niveau tous les ' + frCourt(r.equidistance) + ' m (IGN, ' + libelleSource(relief) + ')';
  }
  s += pdfPolygone(parcelle.pts.map(P), null, ENCRE, 1.4);
  // Les cotes de la parcelle, au milieu de chaque limite.
  parcelle.pts.forEach((p, i) => {
    const q = au(parcelle.pts, (i + 1) % parcelle.pts.length), m = P({ x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 });
    if (dist(p, q) * k > 40) s += pdfTexte(m.x - 10, m.y + 3, 6.5, fr(dist(p, q)) + ' m', GRIS);
  });
  // L'existant : le bati, avec sa hauteur.
  objets.filter(estBatiment).forEach(o => {
    const pts = contour(o);
    s += pdfPolygone(pts.map(P), BATI, GRIS, 0.6);
    const c = P(centroid(pts));
    s += pdfTexte(c.x - 25, c.y - 3, 7, enAscii('Existant H ' + fr(o.elevation ?? elevationParDefaut(o.fonction || '')) + ' m'), GRIS);
  });
  // Le projet : chaque ouvrage, ses cotes, sa hauteur et sa distance a la limite la plus proche.
  const projet = objets.filter(o => estAbri(o) || estTerrasse(o));
  projet.forEach(o => {
    const calc = estAbri(o) ? calculerPergola(o) : null;
    const pts = contour(o);
    if (calc && calc.reglages.debord > 0) s += pdfPolygone(calc.emprise.map(P), null, PROJET, 0.6, 0.8);
    s += pdfPolygone(pts.map(P), PROJET_FOND, PROJET, 1.2);
    // Les cotes des cotes, reportees a l'exterieur du contour (normale sortante, d'apres le sens
    // de parcours) : dedans, elles chevaucheraient le nom de l'ouvrage.
    const sens = signedArea(pts) > 0 ? 1 : -1;
    pts.forEach((p, i) => {
      const q = au(pts, (i + 1) % pts.length);
      if (dist(p, q) * k <= 30 || pts.length > 8) return;
      const a = P(p), b = P(q), L = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      const nx = sens * (b.y - a.y) / L * 9, ny = -sens * (b.x - a.x) / L * 9;
      s += cote({ x: a.x + nx, y: a.y + ny }, { x: b.x + nx, y: b.y + ny }, fr(dist(p, q)) + ' m', PROJET, -sens);
    });
    const ys = pts.map(P).map(p => p.y), xs = pts.map(P).map(p => p.x);
    const bas = Math.min(...ys) - 34, gauche = Math.min(...xs);
    const hauteur = calc ? Math.max(...calc.pieces.map(x => Math.max(x.a.z, x.b.z))) : 0;
    s += pdfTexte(gauche, bas, 8, enAscii(nomOuvrage(o) + ' (projet)'), PROJET);
    s += pdfTexte(gauche, bas - 10, 7, enAscii('emprise ' + fr(calc ? shoelace(calc.emprise) : shoelace(pts), 1) + ' m2' + (calc ? ' - H max ' + fr(hauteur) + ' m' : '')), PROJET);
    const limite = plusProcheLimite(calc ? calc.emprise : pts, parcelle.pts);
    if (limite && limite.d > 0.05) s += cote(P(limite.a), P(limite.b), fr(limite.d) + ' m', ENCRE);
  });
  // Legende.
  const ly = MARGE_PDF + 40;
  s += pdfPolygone([{ x: MARGE_PDF, y: ly }, { x: MARGE_PDF + 14, y: ly }, { x: MARGE_PDF + 14, y: ly + 9 }, { x: MARGE_PDF, y: ly + 9 }], BATI, GRIS, 0.5);
  s += pdfTexte(MARGE_PDF + 20, ly + 1, 8, 'Construction existante');
  s += pdfPolygone([{ x: MARGE_PDF + 140, y: ly }, { x: MARGE_PDF + 154, y: ly }, { x: MARGE_PDF + 154, y: ly + 9 }, { x: MARGE_PDF + 140, y: ly + 9 }], PROJET_FOND, PROJET, 1);
  s += pdfTexte(MARGE_PDF + 160, ly + 1, 8, 'Projet (pointille : debord du toit)');
  s += pdfTexte(MARGE_PDF + 330, ly + 1, 8, 'Cotes en metres ; H : hauteur au point le plus haut');
  if (legendeRelief) {
    s += polyligne([{ x: MARGE_PDF, y: ly + 17 }, { x: MARGE_PDF + 14, y: ly + 17 }], GRIS, 0.7);
    s += pdfTexte(MARGE_PDF + 20, ly + 14, 8, enAscii(legendeRelief));
  }
  s += pdfFlecheNord(A4_L - MARGE_PDF - 30, MARGE_PDF + 6);
  s += pdfEchelleGraphique(MARGE_PDF, MARGE_PDF + 14, k, denom);
  return { l: A4_L, h: A4_H, contenu: s };
}

/**
 * Le facteur d'exageration des hauteurs d'un profil : 1 quand le denivele se voit (10 % de la
 * longueur ou plus), 2 jusqu'a 4 %, 5 en deca. Le cartouche le dit.
 */
export function exagerationProfil(deniveleM: number, longueurM: number): number {
  if (deniveleM >= longueurM / 10) return 1;
  return deniveleM >= longueurM / 25 ? 2 : 5;
}

/**
 * DP3 : le plan en coupe du terrain et de la construction, quand le projet porte un relief. La
 * coupe suit la ligne de plus grande pente par le point de reference de la terrasse ; le sol est
 * lu dans la grille enregistree (reproductible, sans reseau) ; la terrasse et les abris traverses
 * sont poses a leur hauteur au-dessus du zero du plan (`zRef`). `null` sans relief.
 */
export function pageProfil(objets: ObjetPlan[], meta: MetaPieces): PagePdf | null {
  const relief = reliefDe(objets);
  const parcelle = parcelleDuProjet(objets);
  if (!relief || !parcelle || parcelle.type !== 'polygon') return null;
  const pRef = pointDeReference(objets) ?? centroid(parcelle.pts);
  // La ligne proposee court sur toute la grille (dix metres d'abords) ; la coupe se limite a la
  // parcelle et trois metres de part et d'autre, ce qui compte pour l'instructeur.
  const entiere = ligneDePlusGrandePente(relief, parcelle.pts, pRef);
  const bornee = decouperPolyligne([entiere.a, entiere.b], empriseRelief(parcelle.pts, 3))[0];
  const a = bornee ? au(bornee, 0) : entiere.a, b = bornee ? au(bornee, bornee.length - 1) : entiere.b;
  const profil = profilRelief(relief, a, b).filter((p): p is typeof p & { z: number } => p.z !== null);
  if (profil.length < 2) return null;
  const L = dist(a, b) || 1;
  const dir = { x: (b.x - a.x) / L, y: (b.y - a.y) / L };
  const sDe = (p: PtBrut) => (p.x - a.x) * dir.x + (p.y - a.y) * dir.y;
  const zRef = relief.zRef;

  // Les ouvrages que la coupe traverse : un rectangle de `zRef` a leur hauteur, entre les deux
  // points ou la ligne entre et sort de leur contour.
  const ouvrages: { s0: number; s1: number; h: number; terrasse: boolean; nom: string }[] = [];
  objets.forEach(o => {
    if (o.type !== 'polygon' || !(estTerrasse(o) || estAbri(o))) return;
    const calc = estAbri(o) ? calculerPergola(o) : null;
    const h = calc ? Math.max(...calc.pieces.map(x => Math.max(x.a.z, x.b.z))) : hauteurFinieMm(o) / 1000;
    clipLineToPolygon(a, dir, o.pts).forEach(seg => {
      const s0 = Math.min(sDe(seg.a), sDe(seg.b)), s1 = Math.max(sDe(seg.a), sDe(seg.b));
      if (s1 - s0 > 0.05) ouvrages.push({ s0, s1, h, terrasse: !calc, nom: nomOuvrage(o) });
    });
  });

  const zs = profil.map(p => p.z);
  const zMin = Math.min(...zs, zRef), zMax = Math.max(...zs, zRef, ...ouvrages.map(o => zRef + o.h));
  const denivele = Math.max(...zs) - Math.min(...zs);
  const f = exagerationProfil(zMax - zMin, L);
  const zBas = zMin - 0.5, zHaut = zMax + 0.6;
  // Une coupe est plus longue que haute : la feuille se tourne en paysage.
  const feuille = { l: A4_H, h: A4_L };
  const cadre = { x: MARGE_PDF, y: MARGE_PDF + 70, l: feuille.l - 2 * MARGE_PDF, h: feuille.h - 2 * MARGE_PDF - 140 };
  const denom = echelleQuiTient(L + 1, (zHaut - zBas) * f, cadre.l - 60, cadre.h - 40);
  const k = PT_PAR_METRE / denom;
  const ox = cadre.x + 30 + (cadre.l - 60 - L * k) / 2;
  const oy = cadre.y + 20 + (cadre.h - 40 - (zHaut - zBas) * f * k) / 2;
  const V = (sM: number, z: number) => ({ x: ox + sM * k, y: oy + (z - zBas) * f * k });

  let s = cartouche('DP3', 'Plan en coupe du terrain et de la construction' + (f > 1 ? ' (hauteurs x ' + f + ')' : ''), meta, denom, feuille);
  // Le sol : la terre sous le profil, puis le trait fort du terrain naturel.
  const sol = profil.map(p => V(p.s, p.z));
  s += pdfPolygone([V(au(profil, 0).s, zBas), ...sol, V(au(profil, profil.length - 1).s, zBas)], SOL, null, 0.5);
  // Les ouvrages, a leur hauteur au-dessus du zero du plan.
  ouvrages.forEach(o => {
    s += pdfPolygone([V(o.s0, zRef), V(o.s1, zRef), V(o.s1, zRef + o.h), V(o.s0, zRef + o.h)], o.terrasse ? PROJET_FOND : null, PROJET, o.terrasse ? 1 : 0.8, o.terrasse ? 1 : 0.9);
    const haut = V((o.s0 + o.s1) / 2, zRef + o.h);
    s += pdfTexte(haut.x - 20, haut.y + 4, 7, enAscii(o.nom + ' - H ' + fr(o.h) + ' m'), PROJET);
  });
  s += polyligne(sol, ENCRE, 1.4);
  // Le zero du plan : une ligne de reference en tirets, et l'altitude NGF aux deux bouts et au point de reference.
  s += trait(V(0, zRef), V(L, zRef), GRIS, 0.5, true);
  const debut = au(profil, 0), fin = au(profil, profil.length - 1);
  s += pdfTexte(V(debut.s, debut.z).x - 4, V(debut.s, debut.z).y + (debut.z >= zRef ? 6 : -10), 7, enAscii('NGF ' + fr(debut.z) + ' m'));
  s += pdfTexte(V(fin.s, fin.z).x - 30, V(fin.s, fin.z).y + (fin.z >= zRef ? 6 : -10), 7, enAscii('NGF ' + fr(fin.z) + ' m'));
  const sRef = Math.max(0, Math.min(L, sDe(pRef)));
  s += trait(V(sRef, zBas), V(sRef, zHaut), GRIS, 0.4, true);
  s += pdfTexte(V(sRef, zHaut).x - 40, V(sRef, zHaut).y - 8, 7, enAscii('Reference (zero du plan) : NGF ' + fr(zRef) + ' m'));
  // La longueur de la coupe.
  s += cote(V(0, zBas), V(L, zBas), fr(L) + ' m', ENCRE, -1);
  // Les notes.
  const ly = MARGE_PDF + 40;
  s += pdfTexte(MARGE_PDF, ly + 25, 8, enAscii('Coupe dans le sens de la plus grande pente, par le point de reference de la terrasse ; denivele du terrain ' + fr(denivele) + ' m sur ' + fr(L) + ' m.'));
  s += pdfTexte(MARGE_PDF, ly + 13, 8, enAscii('Terrain naturel : IGN, ' + resumeRelief(relief) + '.'));
  s += pdfTexte(MARGE_PDF, ly + 1, 8, enAscii('Terrasse et abris a leur hauteur au-dessus du zero du plan ; ' + (f > 1 ? 'hauteurs x ' + f + ' ; ' : '') + 'cotes en metres.'));
  s += pdfEchelleGraphique(MARGE_PDF, MARGE_PDF + 14, k, denom);
  return { l: feuille.l, h: feuille.h, contenu: s };
}

/** Une elevation : les pieces projetees sur un plan vertical, x le long de `axe`, y la hauteur. */
function elevation(calc: PergolaCalculee, axe: PtBrut, origine: PtBrut, cadre: { x: number; y: number; l: number; h: number }, titre: string): string {
  const abs = (p: PtBrut) => (p.x - origine.x) * axe.x + (p.y - origine.y) * axe.y;
  const pts3 = calc.pieces.flatMap(p => [p.a, p.b]);
  const xs = pts3.map(abs), zs = pts3.map(p => p.z);
  const x0 = Math.min(...xs) - 0.5, x1 = Math.max(...xs) + 0.5, zMax = Math.max(...zs);
  const denom = echelleQuiTient(x1 - x0, zMax + 0.6, cadre.l, cadre.h - 20);
  const k = PT_PAR_METRE / denom;
  const ox = cadre.x + (cadre.l - (x1 - x0) * k) / 2;
  const V = (p: Pt3) => ({ x: ox + (abs(p) - x0) * k, y: cadre.y + 14 + p.z * k });
  let s = pdfTexte(cadre.x, cadre.y + cadre.h - 8, 9, enAscii(titre + ' - 1/' + denom));
  // La couverture, derriere la charpente.
  calc.pans.forEach(pan => { s += pdfPolygone(pan.map(V), [0.9, 0.88, 0.84], GRIS, 0.4, 0.75); });
  calc.pieces.forEach(p => {
    const a = V(p.a), b = V(p.b);
    const dims = dimsPergola(p.section);
    const L = Math.hypot(b.x - a.x, b.y - a.y);
    if (L < 1) {
      // Vue en bout : la section elle-meme.
      const w = dims.b * k / 2, h = dims.h * k / 2;
      s += pdfPolygone([{ x: a.x - w, y: a.y - h }, { x: a.x + w, y: a.y - h }, { x: a.x + w, y: a.y + h }, { x: a.x - w, y: a.y + h }], BOIS, ENCRE, 0.4);
      return;
    }
    const verticale = Math.abs(p.a.x - p.b.x) + Math.abs(p.a.y - p.b.y) < 1e-6;
    const t = (verticale ? dims.b : dims.h) * k / 2;
    const nx = -(b.y - a.y) / L * t, ny = (b.x - a.x) / L * t;
    s += pdfPolygone([{ x: a.x + nx, y: a.y + ny }, { x: b.x + nx, y: b.y + ny }, { x: b.x - nx, y: b.y - ny }, { x: a.x - nx, y: a.y - ny }], BOIS, ENCRE, 0.4);
  });
  // Le sol, et les hauteurs.
  s += trait({ x: cadre.x, y: cadre.y + 14 }, { x: cadre.x + cadre.l, y: cadre.y + 14 }, ENCRE, 1.2);
  const xc = ox + (x1 - x0) * k + 12;
  s += cote({ x: xc, y: cadre.y + 14 }, { x: xc, y: cadre.y + 14 + zMax * k }, 'H ' + fr(zMax) + ' m', ENCRE, -1);
  s += cote({ x: ox - 12, y: cadre.y + 14 }, { x: ox - 12, y: cadre.y + 14 + calc.reglages.hauteur * k }, fr(calc.reglages.hauteur) + ' m');
  return s;
}

/** DP4 : les facades et la toiture d'un abri. */
export function pageFacades(o: ObjetPlan, meta: MetaPieces): PagePdf | null {
  const calc = calculerPergola(o);
  if (!calc || o.type !== 'polygon') return null;
  const r = calc.reglages;
  const a = au(o.pts, r.coteReference), b = au(o.pts, (r.coteReference + 1) % o.pts.length);
  const L = dist(a, b) || 1;
  const u = { x: (b.x - a.x) / L, y: (b.y - a.y) / L }, v = { x: -u.y, y: u.x };
  const haut = A4_H - MARGE_PDF - 56, tiers = (haut - MARGE_PDF) / 3;
  let s = cartouche('DP4', 'Plan des facades et de la toiture - ' + nomOuvrage(o), meta);
  s += elevation(calc, u, a, { x: MARGE_PDF, y: haut - tiers, l: A4_L - 2 * MARGE_PDF, h: tiers - 6 }, 'Facade principale (' + (o.segmentNames?.[r.coteReference] || ('cote ' + (r.coteReference + 1))) + ')');
  s += elevation(calc, v, a, { x: MARGE_PDF, y: haut - 2 * tiers, l: A4_L - 2 * MARGE_PDF, h: tiers - 6 }, 'Facade laterale');
  // La toiture, vue de dessus.
  const cadre = { x: MARGE_PDF, y: MARGE_PDF, l: A4_L - 2 * MARGE_PDF, h: tiers - 26 };
  const { P, denom } = cadrer(calc.emprise, cadre);
  s += pdfTexte(MARGE_PDF, MARGE_PDF + tiers - 14, 9, enAscii('Toiture (vue de dessus) - ' + (r.toit === 'toile' ? 'toile tendue' : 'couverture') + ' - 1/' + denom));
  s += pdfPolygone(calc.emprise.map(P), [0.93, 0.91, 0.87], ENCRE, 0.8);
  calc.pieces.filter(p => p.role !== 'poteau' && p.role !== 'contrefiche').forEach(p => { s += trait(P(p.a), P(p.b), GRIS, 0.5); });
  return { l: A4_L, h: A4_H, contenu: s };
}

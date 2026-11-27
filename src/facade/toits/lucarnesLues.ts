// Les lucarnes lues sur le LiDAR (MD/spec-toit-ign.md §13.11). Une bosse etroite sur un pan, que la mesure montre nettement
// au-dessus du toit ajuste, est une lucarne posee sur ce pan — plus un « pignon » monte au faitage (LARGEUR_PIGNON_LU_MIN_M),
// et plus rien du tout comme depuis le 27 novembre 2026 (le proprietaire, Hardencourt 6501004 : « sur la grande facade, sur le
// lidar je vois bien les 2 chiens assis, pourquoi ont-ils disparu ? »).
//
// La lecture se fait sur la grille brute, une fois le corps ajuste : la surface nettoyee (saillies ecretees, mediane 3 x 3)
// efface une lucarne d'un metre et demi. Pan par pan :
//   1. le surplus de chaque cellule au-dessus du pan, ramene au surplus median de sa rangee (a meme distance du mur) : un toit
//      trace a cote de son contour, ou un egout lu trop bas, decale tout un pan sans y poser de lucarne ;
//   2. le long du faitage, les troncons ou ce surplus passe SURPLUS_LUCARNE_M : larges de LARGEUR_LUCARNE_MIN_M a
//      LARGEUR_LUCARNE_MAX_M (plus etroit : une souche de cheminee ; plus large : un pignon, un autre toit), profonds d'au moins
//      PROFONDEUR_LUCARNE_MIN_M, a plus de BOUT_SANS_LUCARNE_M des bouts du corps, et dont le haut ne passe pas le faitage de plus
//      de DEPASSEMENT_LUCARNE_M (au-dela : un arbre, une souche) ;
//      la bosse part du bas du pan (FACE_LUCARNE_MAX_M du mur), d'un seul tenant, le pan retombe de chaque cote, et le reste du
//      pan est plan (BRUIT_PAN_LUCARNE_M) : un toit mal ajuste fait des bosses partout ;
//      seule sur son pan, elle doit depasser de SURPLUS_LUCARNE_SEULE_M ;
//   3. jamais la ou un autre toit entre dans le pan : un autre corps, un autre batiment accole au mur de ce pan (l'aile d'une
//      maison en L fait la meme bosse qu'une lucarne, en plus large), ni sous un pignon deja lu.
// Rien sur un toit plat, un toit de revolution, un appentis ouvert, un element de facade (bow-window, galerie).
//
// Le type se lit sur le dessus de la bosse (typeLu) : une ligne de faitage en travers, perpendiculaire a celui du toit, est celle
// d'une jacobine (CRETE_JACOBINE_M) ; un dessus plat, un chien-assis (TYPE_LUCARNE_LUE) ; un dessus qui monte vers l'interieur
// du toit comme le pan, une rampante (PENTE_RAMPANTE_MIN). Une photo ou un fait qui dit mieux l'emporte (source « observation »).

import { pointInPolygon } from '../../geometry/basic.js';
import { SEUILS_TOITS as S } from '../../regles/toits/reglages.js';
import { cm, point, repere, type Grille, type Repere } from './toitCorps/ajustement.js';
import type { CorpsToit, Lucarne, PtBrut, TypeLucarne } from '../../model/types.js';

/** Le type d'une lucarne que la mesure ne sait pas nommer. */
export const TYPE_LUCARNE_LUE: TypeLucarne = 'chien-assis';

const mediane = (v: readonly number[]): number => { const t = [...v].sort((a, b) => a - b); return t.length ? (t[Math.floor(t.length / 2)] as number) : 0; };
const haut = (v: readonly number[]): number => { const t = [...v].sort((a, b) => a - b); return t[Math.min(t.length - 1, Math.floor(0.8 * t.length))] ?? 0; };

/** Le corps porte-t-il des lucarnes lisibles : un toit a deux pans en pente, ni special, ni ouvert, ni pose sur un mur. */
function lisible(c: CorpsToit, r: Repere): boolean {
  if (c.speciale || c.saillie || c.baie || c.ouvert || c.terrasse || c.profil) return false;
  return r.L >= 2 * S.BOUT_SANS_LUCARNE_M + S.LARGEUR_LUCARNE_MIN_M && c.faitage - Math.max(...c.egouts) >= S.MONTEE_PAN_LUCARNE_M;
}

interface Surplus { R: (number | null)[][]; Z: (number | null)[][]; nk: number; nj: number; largeur: number }

/** Les cellules de la grille sous un pan, par case (k le long du faitage, j depuis le mur) : le plus haut surplus au-dessus du pan. */
function surplusDuPan(g: Grille, c: CorpsToit, r: Repere, pan: 0 | 1, contour: readonly PtBrut[], exclure: readonly PtBrut[][]): Surplus {
  const largeur = pan === 0 ? c.posFaitage : r.W - c.posFaitage, e = c.egouts[pan];
  const nk = Math.max(1, Math.round(r.L / g.pas)), nj = Math.max(1, Math.round(largeur / g.pas));
  const R: (number | null)[][] = Array.from({ length: nk }, () => Array.from({ length: nj }, () => null));
  const Z: (number | null)[][] = Array.from({ length: nk }, () => Array.from({ length: nj }, () => null));
  const coins = [0, 1, 2, 3].map((i) => c.pts[i] as PtBrut), xs = coins.map((p) => p.x), ys = coins.map((p) => p.y);
  const i0 = Math.max(0, Math.floor((Math.min(...xs) - g.x0) / g.pas)), i1 = Math.min(g.nx - 1, Math.ceil((Math.max(...xs) - g.x0) / g.pas));
  const j0 = Math.max(0, Math.floor((g.y0 - Math.max(...ys)) / g.pas)), j1 = Math.min(g.ny - 1, Math.ceil((g.y0 - Math.min(...ys)) / g.pas));
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
    const z = g.z[j * g.nx + i];
    if (z === null || z === undefined) continue;
    const p = { x: g.x0 + i * g.pas, y: g.y0 - j * g.pas };
    const dx = p.x - r.p0.x, dy = p.y - r.p0.y, s = dx * r.u.x + dy * r.u.y, t = dx * r.v.x + dy * r.v.y;
    const d = pan === 0 ? t : r.W - t;
    if (s < 0 || s >= r.L || d < 0 || d >= largeur) continue;
    if (!pointInPolygon(p, contour as PtBrut[]) || exclure.some((q) => pointInPolygon(p, q as PtBrut[]))) continue;
    const k = Math.min(nk - 1, Math.floor(s / g.pas)), q = Math.min(nj - 1, Math.floor(d / g.pas));
    const surplus = z - (e + ((c.faitage - e) * d) / largeur);
    const ligne = R[k] as (number | null)[], lz = Z[k] as (number | null)[];
    if (ligne[q] === null || surplus > (ligne[q] as number)) { ligne[q] = surplus; lz[q] = z; }
  }
  return { R, Z, nk, nj, largeur };
}

/** Un autre toit est-il devant le mur de ce pan, sur ce troncon : la bosse est alors la sienne. */
function autreToitDevant(r: Repere, pan: 0 | 1, s0: number, s1: number, autres: readonly PtBrut[][]): boolean {
  if (!autres.length) return false;
  const t = pan === 0 ? -S.ACCOLE_M : r.W + S.ACCOLE_M;
  let dedans = 0, n = 0;
  for (let s = s0 + 0.1; s < s1; s += 0.25) { n++; const p = point(r, s, t); if (autres.some((q) => pointInPolygon(p, q as PtBrut[]))) dedans++; }
  return n > 0 && dedans * 2 >= n;
}

/**
 * Le type que la mesure montre. Une jacobine a son propre faitage, perpendiculaire a celui du toit : en travers de la bosse (le long
 * du faitage du corps), le dessus monte vers une ligne et retombe sur les cotes (le proprietaire, Hardencourt, 27 novembre 2026 :
 * « vu la ligne perpendiculaire au faitage sur le lidar il s'agit de lucarne jacobine »). On le lit sur le dessus median de chaque
 * tranche de la bosse : le plus haut passe le plus bas de ses deux bords d'au moins CRETE_JACOBINE_M. Un dessus plat est celui
 * d'un chien-assis (TYPE_LUCARNE_LUE), sauf s'il monte vers l'interieur du toit comme le pan (PENTE_RAMPANTE_MIN : une rampante).
 */
function typeLu(zs: readonly number[], ds: readonly number[], ks: readonly number[]): TypeLucarne {
  const n = zs.length;
  if (n < 4) return TYPE_LUCARNE_LUE;
  const tranches = [...new Set(ks)].sort((a, b) => a - b).map((k) => mediane(zs.filter((_, i) => ks[i] === k)));
  if (tranches.length >= 3) {
    const bords = Math.min(tranches[0] as number, tranches[tranches.length - 1] as number);
    if (Math.max(...tranches) - bords >= S.CRETE_JACOBINE_M) return 'jacobine';
  }
  const md = ds.reduce((a, b) => a + b, 0) / n, mz = zs.reduce((a, b) => a + b, 0) / n;
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) { num += ((ds[i] as number) - md) * ((zs[i] as number) - mz); den += ((ds[i] as number) - md) ** 2; }
  return den > 0.5 && num / den >= S.PENTE_RAMPANTE_MIN ? 'rampante' : TYPE_LUCARNE_LUE;
}

/** La bosse du troncon `k0..fin` du pan : ses rangees touchees (du mur vers le faitage), ses hauteurs et leurs distances au mur. */
function bosse(su: Surplus, rel: (k: number, j: number) => number | null, pas: number, k0: number, fin: number, jMax: number): { rangees: number[]; zs: number[]; ds: number[]; ks: number[] } {
  const rangees: number[] = [], zs: number[] = [], ds: number[] = [], ks: number[] = [];
  for (let j = 0; j < jMax; j++) {
    let touche = false;
    for (let q = k0; q <= fin; q++) {
      const v = rel(q, j), z = su.Z[q]?.[j];
      if (v !== null && v >= S.SURPLUS_LUCARNE_M && z !== null && z !== undefined) { touche = true; zs.push(z); ds.push((j + 0.5) * pas); ks.push(q); }
    }
    if (touche) rangees.push(j);
  }
  return { rangees, zs, ds, ks };
}

/**
 * Les lucarnes d'un meme pan qui ont la meme taille a MEME_LUCARNE_M pres (largeur et hauteur) sont le meme modele : une grille a
 * 50 cm ne separe pas 1,5 m de 2 m, l'ecart est du bruit (le proprietaire, Hardencourt, 27 novembre 2026 : « la quantite est bien 3,
 * et elles font la meme taille »). Elles prennent une seule largeur (chacune autour de son milieu), une seule hauteur et une seule
 * profondeur, les medianes, donc une face a la meme distance de l'egout, et le type que le plus grand nombre montre (a egalite, la
 * jacobine : une crete lue est un fait, un dessus plat peut etre une crete que la grille a manquee). Une lucarne nettement
 * differente garde ses cotes.
 */
function memeModele(lues: Lucarne[]): Lucarne[] {
  if (lues.length < 2) return lues;
  const large = mediane(lues.map((l) => l.finM - l.debutM)), hautM = mediane(lues.map((l) => l.faitageM));
  const pareil = (l: Lucarne): boolean => Math.abs(l.finM - l.debutM - large) <= S.MEME_LUCARNE_M + 1e-6 && Math.abs(l.faitageM - hautM) <= S.MEME_LUCARNE_M + 1e-6;
  const memes = lues.filter(pareil);
  if (memes.length < 2) return lues;
  const l0 = mediane(memes.map((l) => l.finM - l.debutM)), h0 = cm(mediane(memes.map((l) => l.faitageM))), p0 = cm(mediane(memes.map((l) => l.profondeurM)));
  const compte = (t: TypeLucarne): number => memes.filter((l) => l.type === t).length;
  const type = memes.map((l) => l.type).reduce((a, b) => (compte(b) > compte(a) || (compte(b) === compte(a) && b === 'jacobine') ? b : a));
  return lues.map((l) => (pareil(l) ? { ...l, type, debutM: cm((l.debutM + l.finM) / 2 - l0 / 2), finM: cm((l.debutM + l.finM) / 2 + l0 / 2), faitageM: h0, profondeurM: p0 } : l));
}

/** Les lucarnes que la grille montre sur un pan du corps. */
function lucarnesDuPan(g: Grille, c: CorpsToit, r: Repere, pan: 0 | 1, contour: readonly PtBrut[], exclure: readonly PtBrut[][], autres: readonly PtBrut[][]): Lucarne[] {
  const su = surplusDuPan(g, c, r, pan, contour, exclure), { R, nk, nj, largeur } = su;
  const e = c.egouts[pan], out: Lucarne[] = [], surplus: number[] = [];
  // Pas contre le faitage (la crete, une faitiere, le pan d'en face a 50 cm pres) ni sur un pan trop court pour une lucarne.
  const jMax = nj - Math.max(1, Math.round(S.RETRAIT_FAITAGE_LUCARNE_M / g.pas));
  if (largeur < S.PAN_LUCARNE_MIN_M || jMax < 2) return out;
  // Le surplus de chaque rangee, a meme distance du mur : ce que le pan entier a de trop ou de trop peu a cet endroit.
  const base = Array.from({ length: nj }, (_, j) => mediane(R.map((l) => l[j]).filter((v): v is number => v !== null && v !== undefined)));
  const rel = (k: number, j: number): number | null => { const v = R[k]?.[j]; return v === null || v === undefined ? null : v - (base[j] as number); };
  const dessus = (k: number): number => { let m = -Infinity; for (let j = 0; j < jMax; j++) { const v = rel(k, j); if (v !== null && v > m) m = v; } return m; };
  // La crete que la mesure montre, le long du faitage : la mediane des plus hautes cellules de la bande du faitage.
  const hautsCrete = su.Z.map((l) => Math.max(...l.slice(jMax).filter((v): v is number => v !== null && v !== undefined), -Infinity)).filter((v) => Number.isFinite(v));
  const crete = Math.max(c.faitage, hautsCrete.length ? mediane(hautsCrete) : c.faitage);
  // Un pan que le toit ajuste n'explique pas (une croupe lue en deux pans, deux toits sous un seul corps) fait des bosses partout :
  // hors de ce qui depasse, le pan doit etre plan a BRUIT_PAN_LUCARNE_M pres.
  const calmes: number[] = [];
  for (let q = 0; q < nk; q++) for (let j = 0; j < jMax; j++) { const v = rel(q, j); if (v !== null && v < S.SURPLUS_LUCARNE_M) calmes.push(Math.abs(v)); }
  if (calmes.length < 12 || mediane(calmes) > S.BRUIT_PAN_LUCARNE_M) return out;
  const bout = Math.round(S.BOUT_SANS_LUCARNE_M / g.pas);
  const croupe0 = Math.ceil((c.croupes?.[0] ?? 0) / g.pas), croupe1 = Math.ceil((c.croupes?.[1] ?? 0) / g.pas);
  let k = 0;
  while (k < nk) {
    if (dessus(k) < S.SURPLUS_LUCARNE_M) { k++; continue; }
    let fin = k;
    while (fin + 1 < nk && dessus(fin + 1) >= S.SURPLUS_LUCARNE_M) fin++;
    const debutM = k * g.pas, finM = (fin + 1) * g.pas, large = finM - debutM, k0 = k;
    k = fin + 1;
    if (large < S.LARGEUR_LUCARNE_MIN_M - 1e-6 || large > S.LARGEUR_LUCARNE_MAX_M + 1e-6) continue;
    if (k0 < Math.max(bout, croupe0) || fin >= nk - Math.max(bout, croupe1)) continue;
    // Une bosse, pas une marche : de chaque cote, a un metre au plus, le pan retombe nettement (la moitie du surplus) ; sinon
    // c'est un toit mal ajuste. Le plus haut surplus d'une tranche est toujours un peu positif : on regarde deux tranches.
    const retombe = (a: number, b: number): boolean => Math.min(dessus(a), dessus(b)) < S.SURPLUS_LUCARNE_M / 2;
    if (!retombe(k0 - 1, k0 - 2) || !retombe(fin + 1, fin + 2)) continue;
    const { rangees, zs, ds, ks } = bosse(su, rel, g.pas, k0, fin, jMax);
    if (rangees.length * g.pas < S.PROFONDEUR_LUCARNE_MIN_M - 1e-6) continue;
    // Une lucarne part du bas du pan, pres du mur, et s'avance d'un seul tenant : une bosse en haut du pan est le faitage d'un toit
    // lu dans le mauvais sens, une souche, le toit d'a cote.
    if ((rangees[0] as number) * g.pas > S.FACE_LUCARNE_MAX_M + 1e-6 || rangees.some((j, i) => i > 0 && j !== (rangees[i - 1] as number) + 1)) continue;
    const sommet = Math.max(...zs), faitageM = cm(haut(zs));
    // Pas plus haut que le faitage : ce qui le depasse est un arbre ou une souche. Le faitage est celui que la mesure montre, quand
    // l'ajuste est en dessous (Hardencourt 6501004 : 6,4 m ajustes, 6,7 m mesures, des chiens-assis a 6,2 et 6,4 m).
    if (sommet > crete + S.DEPASSEMENT_LUCARNE_M || faitageM < e + S.HAUTEUR_LUCARNE_MIN_M) continue;
    // Ni sous un pignon deja lu, sur un pan ou l'autre : un pignon depuis le faitage se voit des deux cotes.
    if ((c.pignons ?? []).some((p) => p.debut < finM && p.fin > debutM)) continue;
    if (autreToitDevant(r, pan, debutM, finM, autres)) continue;
    // Sa face est a `profondeurM` en deca du point ou son faitage rejoint le pan (facade/toits/toitFormes.ts).
    const front = (rangees[0] as number) * g.pas, rejoint = (largeur * (Math.min(faitageM, c.faitage - 0.1) - e)) / (c.faitage - e);
    surplus.push(Math.max(...Array.from({ length: fin - k0 + 1 }, (_, i) => dessus(k0 + i))));
    out.push({ type: typeLu(zs, ds, ks), pan, debutM: cm(debutM), finM: cm(finM), faitageM, profondeurM: cm(Math.max(S.PROFONDEUR_LUCARNE_MIN_M, rejoint - front)), source: 'lidar' });
  }
  // Seule sur son pan, une bosse doit depasser plus nettement : des lucarnes en serie se confirment l'une l'autre, une bosse isolee
  // est aussi souvent le toit d'a cote ou un toit mal ajuste.
  if (out.length === 1 && (surplus[0] as number) < S.SURPLUS_LUCARNE_SEULE_M) return [];
  return memeModele(out);
}

/**
 * Les lucarnes que la grille brute montre sur les pans d'un corps. `exclure` : ce qui couvre une part du corps (les autres corps du
 * batiment) ; `autres` : les toits qui peuvent entrer dans ses pans (autres corps, contours des batiments voisins).
 */
export function lucarnesDuCorps(g: Grille, c: CorpsToit, contour: readonly PtBrut[], exclure: readonly PtBrut[][] = [], autres: readonly PtBrut[][] = []): Lucarne[] {
  const r = repere(c.pts);
  if (!lisible(c, r)) return [];
  return ([0, 1] as const).flatMap((pan) => lucarnesDuPan(g, c, r, pan, contour, exclure, autres));
}

/**
 * Les corps d'un batiment avec les lucarnes que la grille montre. Un corps qui porte deja une lucarne observee (un fait, une photo,
 * la main) les garde telles quelles : la mesure n'y ajoute rien. `voisins` : les contours des batiments qui le touchent.
 */
export function avecLucarnesLues(corps: readonly CorpsToit[], g: Grille | null | undefined, contour: readonly PtBrut[], voisins: readonly PtBrut[][] = []): CorpsToit[] {
  if (!g) return [...corps];
  return corps.map((c, i) => {
    if (c.lucarnes?.some((l) => l.source !== 'lidar')) return c;
    const autresCorps = corps.filter((_, j) => j !== i).map((x) => x.pts);
    const lues = lucarnesDuCorps(g, c, contour, autresCorps, [...autresCorps, ...voisins]);
    if (lues.length) return { ...c, lucarnes: lues };
    if (!c.lucarnes) return c;
    const sans: CorpsToit = { ...c };
    delete sans.lucarnes;
    return sans;
  });
}

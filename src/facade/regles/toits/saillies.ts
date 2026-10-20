// Les elements poses sur une facade qui touchent au toit : bow-window, galerie, appentis (palette, groupe « Toit »,
// onglet « Facade »).
//
// Un element est un corps du toit (`CorpsToit`) qui porte sa `saillie` : sur quel mur de quel corps, ou, de quelle
// taille et de quelle forme. Le rectangle `pts` du corps en est toujours deduit ici : changer un reglage de la
// saillie, c'est la replacer (`placerSaillie`), jamais deplacer des points a la main. Le dessin 3D d'un bow-window
// (three/saillie3d.ts) lit l'emprise de ce module ; une galerie ou un appentis, eux, sont des appentis adosses
// que le dessin des corps sait deja faire (three/toitCorps3d.ts).
//
// Pur : pas de reseau, pas de DOM.

import { repere, point } from '../../toitCorps.js';
import type { CorpsToit, FormeSaillie, GenreSaillie, PtBrut, SaillieFacade } from '../../../model/types.js';

/** Un point du dessin, `z` etant la hauteur au-dessus du sol du batiment. */
export interface Pt3 { x: number; y: number; z: number }

/** La hauteur d'un rez-de-chaussee : ce que monte un bow-window « sous le premier etage ». */
export const HAUTEUR_RDC_M = 2.7;
/** Le debord du toit d'un bow-window au-dela de ses murs, sur les cotes et en facade (celui d'une maison est de 35 cm). */
export const DEBORD_BOW_M = 0.2;
/** Un etage de plus haut que ce que la personne choisit n'est pas plausible : la borne de la hauteur propre. */
export const HAUTEUR_BOW_MAX_M = 12;
/** Le recul des poteaux d'une galerie neuve : l'egout deborde de cela au-dessus d'eux. */
export const RETRAIT_GALERIE_M = 0.5;

const dixieme = (v: number) => Math.round(v * 10) / 10;
const centimetre = (v: number) => Math.round(v * 100) / 100;

/** Les mesures d'un genre, a la pose : largeur, saillie, forme, toit et hauteur d'egout cherchee. */
export const DEFAUTS_SAILLIE: Record<GenreSaillie, { largeurM: number; profondeurM: number; forme: FormeSaillie; niveau: 'rdc' | 'toit'; toit: 'pan' | 'pavillon' | 'plat' }> = {
  'bow-window': { largeurM: 2.4, profondeurM: 0.8, forme: 'rectangle', niveau: 'rdc', toit: 'pan' },
  galerie: { largeurM: 5, profondeurM: 1.5, forme: 'rectangle', niveau: 'rdc', toit: 'pan' },
  appentis: { largeurM: 4, profondeurM: 3, forme: 'rectangle', niveau: 'rdc', toit: 'pan' }
};

/** Le mur `i` d'un corps : ses deux bouts, sa longueur, son vecteur unitaire et la normale qui sort du corps. */
export function murDuCorps(h: CorpsToit, i: number): { a: PtBrut; b: PtBrut; L: number; u: PtBrut; n: PtBrut } {
  const n4 = h.pts.length;
  const a = h.pts[((i % n4) + n4) % n4] as PtBrut, b = h.pts[(((i + 1) % n4) + n4) % n4] as PtBrut;
  const L = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const u = { x: (b.x - a.x) / L, y: (b.y - a.y) / L };
  const cx = h.pts.reduce((t, q) => t + q.x, 0) / n4, cy = h.pts.reduce((t, q) => t + q.y, 0) / n4;
  let n = { x: u.y, y: -u.x };
  // La normale sort du corps : elle s'eloigne du centre.
  if ((a.x - cx) * n.x + (a.y - cy) * n.y < 0) n = { x: -n.x, y: -n.y };
  return { a, b, L, u, n };
}

/** Les reglages bornes : la saillie tient sur son mur, sans depasser ses bouts. */
export function bornerSaillie(h: CorpsToit, s: SaillieFacade): SaillieFacade {
  const { L } = murDuCorps(h, s.mur);
  const largeurM = centimetre(Math.min(Math.max(s.largeurM, 0.6), Math.max(0.6, L - 0.2)));
  const centreM = centimetre(Math.min(Math.max(s.centreM, largeurM / 2), Math.max(largeurM / 2, L - largeurM / 2)));
  return { ...s, largeurM, centreM, profondeurM: centimetre(Math.min(Math.max(s.profondeurM, 0.3), 6)) };
}

/** Le rectangle d'une saillie sur son mur : `pts[0]-pts[1]` le long du mur, `pts[0]-pts[3]` vers l'exterieur. */
export function rectangleDeSaillie(h: CorpsToit, s: SaillieFacade): PtBrut[] {
  const { a, u, n } = murDuCorps(h, s.mur);
  const p0 = { x: a.x + u.x * (s.centreM - s.largeurM / 2), y: a.y + u.y * (s.centreM - s.largeurM / 2) };
  const p1 = { x: p0.x + u.x * s.largeurM, y: p0.y + u.y * s.largeurM };
  const d = s.profondeurM;
  return [p0, p1, { x: p1.x + n.x * d, y: p1.y + n.y * d }, { x: p0.x + n.x * d, y: p0.y + n.y * d }].map((q) => ({ x: centimetre(q.x), y: centimetre(q.y) }));
}

/** L'egout le plus bas du corps qui porte la saillie : la hauteur ou monte un bow-window « jusqu'au toit ». */
const egoutBas = (h: CorpsToit) => Math.min(...h.egouts);

/**
 * Le corps d'une saillie pour son hote : le rectangle, le toit propre et les hauteurs. Une galerie est ouverte
 * (des poteaux, sans mur), un appentis ferme ; un bow-window n'a ni l'un ni l'autre, son dessin est a part.
 */
export function corpsDeSaillie(h: CorpsToit, brute: SaillieFacade): CorpsToit {
  const s = bornerSaillie(h, brute);
  const pts = rectangleDeSaillie(h, s);
  const d = s.profondeurM, L = s.largeurM;
  const haut = egoutBas(h);
  // La hauteur propre l'emporte ; sinon un etage (sans depasser l'egout de la maison) ou l'egout de la maison.
  const egout = s.hauteurM ?? (s.genre === 'galerie' ? Math.min(2.4, haut) : s.niveau === 'toit' ? haut : Math.min(HAUTEUR_RDC_M, haut));
  let faitage = egout, posFaitage = 0, croupes: [number, number] | undefined;
  if (s.toit === 'pan') {
    // Le pan monte contre le mur ; sous la pente d'une galerie ou d'un appentis (une vingtaine de degres), pas sous celle d'un bow-window.
    const montee = s.genre === 'bow-window' ? Math.min(1.2, d * 0.6) : Math.min(Math.max(haut - egout, 0.4), d * 0.4);
    faitage = dixieme(egout + montee);
  } else if (s.toit === 'pavillon') {
    faitage = dixieme(egout + Math.min(1.5, Math.min(L, d) * 0.5));
    posFaitage = centimetre(d / 2);
    const c = centimetre(Math.min(d / 2, L / 2 - 0.05));
    croupes = [c, c];
  }
  const corps: CorpsToit = { pts, posFaitage, faitage, egouts: [centimetre(egout), centimetre(egout)], pignons: [], ecart: 0, saillie: s };
  if (croupes) corps.croupes = croupes;
  if (s.genre === 'galerie') { corps.ouvert = true; corps.retraitM = RETRAIT_GALERIE_M; }
  if (s.genre === 'appentis') corps.ouvert = false;
  return corps;
}

/** Les corps du batiment dont la saillie est celle d'un bow-window : ceux que dessine three/saillie3d.ts. */
export const estBowWindow = (c: CorpsToit): boolean => c.saillie?.genre === 'bow-window';

/** La saillie `rang` replacee sur son hote, ce qui la reecrit en entier ; les autres corps sont intacts. */
export function replacerSaillie(corps: readonly CorpsToit[], rang: number, changement: Partial<SaillieFacade>): CorpsToit[] {
  const c = corps[rang];
  if (!c?.saillie) return [...corps];
  const s: SaillieFacade = { ...c.saillie, ...changement };
  // Un reglage mis a `undefined` est retire : la hauteur propre qui redevient celle du niveau.
  if (s.hauteurM === undefined) delete s.hauteurM;
  const hote = corps[s.hote];
  if (!hote || s.hote === rang) return [...corps];
  const neuf = corpsDeSaillie(hote, s);
  // Ce que la personne a regle sur le corps et que le placement ne dit pas (lucarnes, cheminees) reste.
  const reste: CorpsToit = { ...neuf };
  if (c.lucarnes) reste.lucarnes = c.lucarnes;
  if (c.cheminees) reste.cheminees = c.cheminees;
  if (c.retraitM !== undefined) reste.retraitM = c.retraitM;
  return corps.map((k, i) => (i === rang ? reste : k));
}

/** Un mur libre pour une saillie neuve : le plus long mur de l'hote qui n'en porte pas deja, sinon le plus long. */
export function murLibre(corps: readonly CorpsToit[], hote: number): number {
  const h = corps[hote] as CorpsToit;
  const pris = new Set(corps.filter((c) => c.saillie && c.saillie.hote === hote).map((c) => c.saillie?.mur));
  const murs = h.pts.map((_, i) => ({ i, L: murDuCorps(h, i).L })).sort((x, y) => y.L - x.L);
  return (murs.find((m) => !pris.has(m.i)) ?? murs[0] as { i: number }).i;
}

/** L'emprise au sol d'une saillie, dans le plan : le rectangle, un demi-ellipse (arc) ou un rectangle aux angles exterieurs arrondis (conge). */
export function empriseDeSaillie(c: CorpsToit): PtBrut[] {
  const r = repere(c.pts);
  const forme = c.saillie?.forme ?? 'rectangle';
  const L = r.L, d = r.W;
  const P = (s: number, t: number) => point(r, s, t);
  if (forme === 'pans') {
    // Des pans coupes : le fond plat est la moitie de la largeur, les cotes partent du mur en biais.
    return [P(0, 0), P(L * 0.25, d), P(L * 0.75, d), P(L, 0)];
  }
  if (forme === 'arc') {
    const N = 12;
    return Array.from({ length: N + 1 }, (_, k) => { const th = (Math.PI * k) / N; return P((L / 2) * (1 - Math.cos(th)), d * Math.sin(th)); });
  }
  if (forme === 'conge') {
    const rayon = Math.min(L, d) * 0.4, N = 4;
    // Chaque coin exterieur : un quart de cercle, du cote vers le fond (l'angle decroit).
    const arc = (cx: number, cy: number, a0: number) => Array.from({ length: N + 1 }, (_, k) => { const a = a0 - (Math.PI / 2) * (k / N); return P(cx + rayon * Math.cos(a), cy + rayon * Math.sin(a)); });
    return [P(0, 0), ...arc(rayon, d - rayon, Math.PI), ...arc(L - rayon, d - rayon, Math.PI / 2), P(L, 0)];
  }
  // Du mur, par un cote, le fond, l'autre cote : le dernier cote (celui du mur de la maison) reste a fermer.
  return [P(0, 0), P(0, d), P(L, d), P(L, 0)];
}

/**
 * Les facettes d'un bow-window : ses murs du sol a l'egout (sans celui qui est contre la maison) et son toit propre.
 * `emprise` va de `pts[0]` a `pts[1]` en passant par l'exterieur ; son dernier cote ferme le mur de la maison.
 */
export function facettesBowWindow(c: CorpsToit): { pans: Pt3[][]; murs: Pt3[][] } {
  const pans: Pt3[][] = [], murs: Pt3[][] = [];
  const e = empriseDeSaillie(c);
  const r = repere(c.pts);
  const top = Math.min(...c.egouts), F = c.faitage, d = r.W, L = r.L;
  const ST = (q: PtBrut) => ({ s: (q.x - r.p0.x) * r.u.x + (q.y - r.p0.y) * r.u.y, t: Math.max(0, (q.x - r.p0.x) * r.v.x + (q.y - r.p0.y) * r.v.y) });
  const T = (q: PtBrut) => ST(q).t;
  const Z = (q: PtBrut, z: number): Pt3 => ({ x: q.x, y: q.y, z });
  for (let i = 0; i < e.length - 1; i++) { const a = e[i] as PtBrut, b = e[i + 1] as PtBrut; murs.push([Z(a, 0), Z(b, 0), Z(b, top), Z(a, top)]); }
  // Le toit deborde de ses murs : l'emprise est agrandie autour du milieu du mur de la maison, sans quitter ce mur.
  const deb = DEBORD_BOW_M;
  const large = (q: PtBrut): PtBrut => { const { s, t } = ST(q); return point(r, L / 2 + (s - L / 2) * ((L + 2 * deb) / L), t * ((d + deb) / d)); };
  const eT = e.map(large);
  const toit = c.saillie?.toit ?? 'pan';
  if (toit === 'plat') pans.push(eT.map((q) => Z(q, top)));
  else if (toit === 'pan') pans.push(eT.map((q) => Z(q, top + (F - top) * (1 - T(q) / d))));
  else if (c.saillie?.forme && c.saillie.forme !== 'rectangle') {
    const apex = { x: eT.reduce((t, q) => t + q.x, 0) / eT.length, y: eT.reduce((t, q) => t + q.y, 0) / eT.length };
    const sommet = { x: apex.x, y: apex.y, z: F };
    for (let i = 0; i < eT.length - 1; i++) pans.push([Z(eT[i] as PtBrut, top), Z(eT[i + 1] as PtBrut, top), sommet]);
  } else {
    const m = Math.min(d / 2, L / 2);
    const R = (s: number, t: number, z: number): Pt3 => ({ ...point(r, L / 2 + (s - L / 2) * ((L + 2 * deb) / L), t * ((d + deb) / d)), z });
    pans.push([R(0, d, top), R(L, d, top), R(L - m, d / 2, F), R(m, d / 2, F)]);
    pans.push([R(0, 0, top), R(0, d, top), R(m, d / 2, F)]);
    pans.push([R(L, d, top), R(L, 0, top), R(L - m, d / 2, F)]);
  }
  return { pans, murs };
}

/** Les corps sans la saillie `rang` ; les saillies posees sur un corps place apres elle gardent leur hote (son rang descend d'un). */
export function retirerSaillie(corps: readonly CorpsToit[], rang: number): CorpsToit[] {
  return corps.flatMap((c, i) => {
    if (i === rang) return [];
    if (!c.saillie || c.saillie.hote < rang) return [c];
    return [{ ...c, saillie: { ...c.saillie, hote: c.saillie.hote - 1 } }];
  });
}

/** Le nom d'une saillie dans l'inspecteur. */
export const NOM_SAILLIE: Record<GenreSaillie, string> = { 'bow-window': 'Bow-window', galerie: 'Galerie', appentis: 'Appentis' };

/** Les corps sans leurs bow-windows (null s'il n'en reste aucun), et les bow-windows : ce que le prisme du batiment et ses fenetres lisent, et ce qui se dessine a part. */
export function separerBowWindows(corps: readonly CorpsToit[] | null): { hotes: CorpsToit[] | null; bows: CorpsToit[] } {
  if (!corps) return { hotes: null, bows: [] };
  const bows = corps.filter(estBowWindow), hotes = corps.filter((c) => !estBowWindow(c));
  return { hotes: bows.length ? (hotes.length ? hotes : null) : corps.slice(), bows };
}

/** Un angle de plus de cela entre deux cotes de l'emprise les separe : un arc (15° par cote) reste une seule facade, un angle droit en fait deux. */
const ANGLE_FACADE_RAD = (20 * Math.PI) / 180;
/** Une fenetre : sa largeur propre, l'espace voulu entre deux et la hauteur de son appui. */
const FENETRE_LARGEUR_M = 1.1, FENETRE_ENTRAXE_M = 1.6, FENETRE_MIN_M = 0.5, APPUI_M = 0.9, LINTEAU_MIN_M = 0.3, FENETRE_HAUT_MAX_M = 1.4, RELIEF_VITRE_M = 0.012;

/**
 * Les vitres d'un bow-window : une ou plusieurs fenetres par facade (suite de cotes presque alignes, ou un arc entier),
 * posees contre le mur, a hauteur d'appui. Une facade trop courte n'en recoit pas ; l'arc en recoit plusieurs, qui suivent sa courbe.
 */
export function vitresBowWindow(c: CorpsToit): Pt3[][] {
  const top = Math.min(...c.egouts);
  const bas = APPUI_M, haut = Math.min(top - LINTEAU_MIN_M, bas + FENETRE_HAUT_MAX_M);
  if (haut - bas < 0.4) return [];
  const e = empriseDeSaillie(c);
  // Les facades : des suites de cotes dont la direction change peu.
  const dir = (i: number) => Math.atan2((e[i + 1] as PtBrut).y - (e[i] as PtBrut).y, (e[i + 1] as PtBrut).x - (e[i] as PtBrut).x);
  const suites: number[][] = [];
  for (let i = 0; i < e.length - 1; i++) {
    const ecart = i > 0 ? Math.abs(Math.atan2(Math.sin(dir(i) - dir(i - 1)), Math.cos(dir(i) - dir(i - 1)))) : Infinity;
    if (ecart > ANGLE_FACADE_RAD) suites.push([i]); else (suites[suites.length - 1] as number[]).push(i);
  }
  const vitres: Pt3[][] = [];
  const r = repere(c.pts);
  for (const suite of suites) {
    const pts = [e[suite[0] as number] as PtBrut, ...suite.map((i) => e[i + 1] as PtBrut)];
    const cum = [0];
    for (let k = 1; k < pts.length; k++) cum.push((cum[k - 1] as number) + Math.hypot((pts[k] as PtBrut).x - (pts[k - 1] as PtBrut).x, (pts[k] as PtBrut).y - (pts[k - 1] as PtBrut).y));
    const total = cum[cum.length - 1] as number;
    if (total < FENETRE_MIN_M + 0.2) continue;
    const n = Math.max(1, Math.round(total / FENETRE_ENTRAXE_M));
    const largeur = Math.min(FENETRE_LARGEUR_M, (total / n) * 0.7);
    // Le point a l'abscisse `a` de la suite, et la normale sortante du cote qui le porte.
    const en = (a: number): { p: PtBrut; n: PtBrut; k: number } => {
      let k = 1; while (k < cum.length - 1 && (cum[k] as number) < a) k++;
      const A = pts[k - 1] as PtBrut, B = pts[k] as PtBrut, l = (cum[k] as number) - (cum[k - 1] as number) || 1, f = (a - (cum[k - 1] as number)) / l;
      const ux = (B.x - A.x) / l, uy = (B.y - A.y) / l;
      // La normale s'eloigne du milieu du mur de la maison.
      const mid = point(r, r.L / 2, 0);
      let nx = uy, ny = -ux;
      if ((A.x - mid.x) * nx + (A.y - mid.y) * ny < 0) { nx = -nx; ny = -ny; }
      return { p: { x: A.x + (B.x - A.x) * f, y: A.y + (B.y - A.y) * f }, n: { x: nx, y: ny }, k };
    };
    for (let w = 0; w < n; w++) {
      const centre = ((w + 0.5) * total) / n, a0 = centre - largeur / 2, a1 = centre + largeur / 2;
      // Les sommets de la fenetre : ses deux bouts et les coins de la suite qui tombent entre les deux.
      const jalons = [a0, ...cum.filter((x) => x > a0 + 1e-6 && x < a1 - 1e-6), a1];
      const bord = jalons.map((a) => { const q = en(Math.min(Math.max(a, 0), total)); return { x: q.p.x + q.n.x * RELIEF_VITRE_M, y: q.p.y + q.n.y * RELIEF_VITRE_M }; });
      // Un quadrilatere par cote : une vitre qui suit un arc n'est pas plane, chaque morceau l'est.
      for (let k = 0; k < bord.length - 1; k++) {
        const [A, B] = [bord[k] as PtBrut, bord[k + 1] as PtBrut];
        vitres.push([{ ...A, z: bas }, { ...B, z: bas }, { ...B, z: haut }, { ...A, z: haut }]);
      }
    }
  }
  return vitres;
}

/** Le mur de l'hote le plus proche d'un point, et l'abscisse de ce point sur lui : ce que donne un toucher sur la facade. */
export function murLePlusProche(h: CorpsToit, p: PtBrut): { mur: number; centreM: number } {
  let meilleur = { mur: 0, centreM: murDuCorps(h, 0).L / 2 }, dmin = Infinity;
  for (let i = 0; i < h.pts.length; i++) {
    const { a, L, u } = murDuCorps(h, i);
    const s = Math.min(Math.max((p.x - a.x) * u.x + (p.y - a.y) * u.y, 0), L);
    const d = Math.hypot(a.x + u.x * s - p.x, a.y + u.y * s - p.y);
    if (d < dmin) { dmin = d; meilleur = { mur: i, centreM: s }; }
  }
  return meilleur;
}

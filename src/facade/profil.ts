// Un mur a deux hauteurs d'egout (MD/spec-releve-facade.md §6.2).
//
// Une partie a etage prolongee, dans le meme alignement, par une partie basse (garage, extension) :
// vu de face, le mur est un L. Le releve le traite comme un rectangle englobant - du sol a l'egout
// le plus haut - dont on mesure le decrochement.
//
// Sur la photo, on pose les quatre coins visibles du L (le pied aux deux bouts, l'egout haut au bout
// haut, l'egout bas au bout bas) et deux points au decrochement : l'egout haut et l'egout bas la ou
// la hauteur change. Le coin englobant cache - au-dessus de la partie basse, dans le vide - n'a pas a
// etre devine : c'est l'intersection de la ligne d'egout haute prolongee et de l'arete verticale du
// bout bas, et une perspective conserve les droites et leurs intersections. Le rectangle englobant se
// redresse alors comme d'habitude, et les deux points du decrochement, ramenes dans le plan du mur,
// donnent sa position et la hauteur d'egout de la partie basse.

import { au } from '../util/tableaux.js';
import { homographie, appliquer, type P2 } from './homographie.js';
import { facadesDuContour, pointDeFacade } from './geometrie.js';
import { sommetDe } from '../geometry/anneau.js';
import type { OuvertureFacade, PartieBasse, PtBrut, ReleveFacade } from '../model/types.js';

export type { PartieBasse };

/** Le cote ou se trouve la partie basse, vu de dehors. */
export type CoteBas = 'gauche' | 'droite';

/** Ce que l'utilisateur pose sur la photo en plus des quatre coins. */
export interface Decrochement {
  cote: CoteBas;
  /** Sur la photo : l'egout haut a l'aplomb du decrochement. */
  haut: P2;
  /** Sur la photo : l'egout bas a l'aplomb du decrochement. */
  bas: P2;
}

/** Intersection des droites (a1, a2) et (b1, b2) ; \`null\` si elles sont paralleles. */
export function intersection(a1: P2, a2: P2, b1: P2, b2: P2): P2 | null {
  const d = (a1.x - a2.x) * (b1.y - b2.y) - (a1.y - a2.y) * (b1.x - b2.x);
  if (Math.abs(d) < 1e-9) return null;
  const t = ((a1.x - b1.x) * (b1.y - b2.y) - (a1.y - b1.y) * (b1.x - b2.x)) / d;
  return { x: a1.x + t * (a2.x - a1.x), y: a1.y + t * (a2.y - a1.y) };
}

/**
 * Les quatre coins du rectangle englobant sur la photo, depuis les quatre coins du L (haut gauche,
 * haut droit, bas droit, bas gauche - le haut du bout bas etant son egout) et le decrochement.
 */
export function coinsEnglobants(coins: readonly P2[], d: Decrochement): P2[] | null {
  const [hg, hd, bd, bg] = [au(coins, 0), au(coins, 1), au(coins, 2), au(coins, 3)];
  if (d.cote === 'droite') {
    // Egout haut : de hg au decrochement ; arete du bout bas : de bd a hd. Le coin cache est la.
    const cache = intersection(hg, d.haut, bd, hd);
    return cache ? [hg, cache, bd, bg] : null;
  }
  const cache = intersection(hd, d.haut, bg, hg);
  return cache ? [cache, hd, bd, bg] : null;
}

/**
 * La partie basse dans le repere du mur, une fois le rectangle englobant (\`englobants\`, qui couvre
 * \`largeur\` x \`hauteur\` metres) connu sur la photo : ou commence-t-elle, jusqu'ou va-t-elle, et a
 * quelle hauteur est son egout.
 */
export function mesurerPartieBasse(englobants: readonly P2[], d: Decrochement, largeur: number, hauteur: number): PartieBasse | null {
  // Photo -> mur, en metres : x depuis la gauche, y depuis l'egout le plus haut vers le bas.
  const H = homographie(englobants, [
    { x: 0, y: 0 },
    { x: largeur, y: 0 },
    { x: largeur, y: hauteur },
    { x: 0, y: hauteur },
  ]);
  if (!H) return null;
  const h = appliquer(H, d.haut),
    b = appliquer(H, d.bas);
  const x = Math.max(0, Math.min(largeur, (h.x + b.x) / 2));
  const egout = Math.max(0, Math.min(hauteur, hauteur - b.y));
  const cm = (v: number) => Math.round(v * 100) / 100;
  return d.cote === 'droite' ? { debut: cm(x), fin: cm(largeur), hauteur: cm(egout) } : { debut: 0, fin: cm(x), hauteur: cm(egout) };
}

/** Hauteur d'egout du mur a l'abscisse \`x\`. */
export function egoutEn(x: number, hauteur: number, p: PartieBasse | null | undefined): number {
  return p && x >= p.debut && x <= p.fin ? p.hauteur : hauteur;
}

/**
 * Les ouvertures qui tiennent dans le mur en L : sur la partie basse, une tache qui monte au-dessus de
 * son egout est sa toiture ou le ciel vu au-dessus, pas une baie.
 */
export function ouverturesDansLeMur<T extends Pick<OuvertureFacade, 'x' | 'y' | 'l' | 'h'>>(ouvertures: readonly T[], hauteur: number, p: PartieBasse | null | undefined): T[] {
  if (!p) return [...ouvertures];
  return ouvertures.filter((o) => {
    const milieu = o.x + o.l / 2;
    return o.y + o.h <= egoutEn(milieu, hauteur, p) + 0.1;
  });
}

/** Le contour du mur en L, dans le repere du mur (x depuis la gauche, y depuis le sol). */
export function contourDuMur(largeur: number, hauteur: number, p: PartieBasse | null | undefined): P2[] {
  if (!p) return [
    { x: 0, y: 0 },
    { x: largeur, y: 0 },
    { x: largeur, y: hauteur },
    { x: 0, y: hauteur },
  ];
  return p.debut > 0
    ? [
        { x: 0, y: 0 },
        { x: largeur, y: 0 },
        { x: largeur, y: p.hauteur },
        { x: p.debut, y: p.hauteur },
        { x: p.debut, y: hauteur },
        { x: 0, y: hauteur },
      ]
    : [
        { x: 0, y: 0 },
        { x: largeur, y: 0 },
        { x: largeur, y: hauteur },
        { x: p.fin, y: hauteur },
        { x: p.fin, y: p.hauteur },
        { x: 0, y: p.hauteur },
      ];
}

/** Un volume du batiment : son emprise et sa hauteur d'egout. */
export interface Volume {
  pts: PtBrut[];
  hauteur: number;
  /** La hauteur de chaque mur (de `pts[i]` a `pts[i + 1]`) quand elle est mesuree ; absente, `hauteur` partout. */
  hauteursMurs?: number[];
}

/**
 * Les volumes d'un batiment dont un mur a ete releve en L. La partie basse va du decrochement au
 * bout bas du mur, et sa profondeur est celle du pignon adjacent : le mur du contour qui part du coin
 * C du bout bas vers le sommet suivant E. Avec S le decrochement sur la facade, la partie basse est le
 * parallelogramme S, C, E, S' ou S' = E + (S - C) ; la partie haute est le contour ou C est remplace
 * par S puis S' - l'encoche. Un contour qui porte deja l'encoche (garage moins profond que la maison)
 * retombe sur ses propres murs : son pignon adjacent est le mur lateral du garage.
 */
export function volumesDuBatiment(pts: readonly PtBrut[], hauteur: number, releves: readonly ReleveFacade[] | null | undefined): Volume[] {
  const entier = [{ pts: pts.map((q) => ({ ...q })), hauteur }];
  const r = (releves || []).find((x) => x.partieBasse);
  const pb = r?.partieBasse;
  if (!r || !pb) return entier;
  const n = pts.length;
  const f = facadesDuContour(pts, hauteur).find((x) => x.cote === r.cote);
  if (!f || n < 3) return entier;
  const basseADroite = pb.debut > 0;
  // Abscisse du decrochement, mise a l'echelle si le mur a change de longueur depuis le releve.
  const k = r.largeur > 0 ? f.largeur / r.largeur : 1;
  const S = pointDeFacade(f, (basseADroite ? pb.debut : pb.fin) * k);
  const C = basseADroite ? f.droite : f.gauche;
  // Indice de C dans le contour, et le sommet E du pignon adjacent : celui qui n'est pas l'autre
  // bout de la facade.
  const iA = r.cote,
    iB = (r.cote + 1) % n;
  const proche = (a: PtBrut, b: PtBrut) => Math.hypot(a.x - b.x, a.y - b.y) < 1e-9;
  const iC = proche(sommetDe(pts, iA), C) ? iA : iB;
  const iE = iC === iB ? (iB + 1) % n : (iA - 1 + n) % n;
  const E = sommetDe(pts, iE);
  const S2 = { x: E.x + S.x - C.x, y: E.y + S.y - C.y };
  const haute: PtBrut[] = [];
  // C et E quittent la partie haute : ce sont les coins de la partie basse, remplaces par S et S'.
  pts.forEach((q, i) => {
    if (i === iE) return;
    if (i !== iC) haute.push({ ...q });
    // Dans le sens du contour : de la facade vers le pignon, S puis S' ; en sens inverse, S' puis S.
    else if (iC === iB) haute.push({ ...S }, S2);
    else haute.push(S2, { ...S });
  });
  const nettoye = haute.filter((q, i) => !proche(q, sommetDe(haute, i + 1)));
  if (nettoye.length < 3) return entier;
  return [
    { pts: nettoye, hauteur },
    { pts: [{ ...S }, { ...C }, { ...E }, S2], hauteur: Math.min(hauteur, pb.hauteur) },
  ];
}

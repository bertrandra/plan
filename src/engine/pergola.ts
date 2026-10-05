// Pergola et carport : les pieces de l'ouvrage et leur metrage par section (engine/).
//
// Un seul code pour les deux : un carport est une pergola faite pour abriter une voiture. Il ne s'en
// distingue que par ses valeurs par defaut (`NATURES` : appentis couvert, pente faible, passage
// libre de 2,20 m) ; tout reglage de l'un existe pour l'autre.
//
// Une pergola est un polygone du plan de fonction `pergola`. Le contour est le nu exterieur des
// poteaux : les poteaux d'angle s'y logent a fleur, les poutres du cadre courent sur leur axe, et le
// toit couvre le contour, plus son debord. Ce module rend les pieces comme des axes en trois
// dimensions (plan + hauteur) avec leur section ; la 3D les habille, le plan 2D en dessine les
// poteaux et les chevrons, et l'inspecteur en tire le metrage par section, debite dans les longueurs
// achetables comme les lames d'une terrasse, puis son chiffrage.
//
// Deux matieres : bois (poteaux, poutres, contrefiches a 45°) et aluminium (profiles thermolaques,
// sans contrefiches : les assemblages sont rigides). Trois toits :
//   - `toile` : des chevrons poses a plat sur le cadre, une toile tendue dessus ;
//   - `appentis` : un seul pan, bas sur le cote de reference ; tout le cadre suit la pente, les
//     poteaux du cote haut sont donc plus longs ;
//   - `quatre-pans` : faitage, quatre aretiers et chevrons (les empannons s'arretent sur les
//     aretiers), calcules sur le rectangle qui englobe le cadre dans le repere du cote de reference.
// Une toile ou un appentis peut etre adosse a un mur : pas de poteaux le long du mur, une lisse
// murale y porte le cadre, et le toit ne deborde pas de ce cote.
//
// C'est un outil d'avant-projet : il ne verifie ni les portees ni les assemblages.

import { au } from '../util/tableaux.js';
import { dist, shoelace, signedArea } from '../geometry/basic.js';
import { clipLineToPolygon, polygonOffset } from '../geometry/polygon.js';
import { lineLineIntersect } from '../geometry/segments.js';
import { optimiserDebitLames, type Debit } from './debit.js';
import { parseLongueurs } from './prix.js';
import type { MateriauPergola, ObjetPlan, Pergola, PtBrut, ToitPergola } from '../model/types.js';
import type { NatureAbri } from '../model/creation.js';

/** Ce qui change avec la matiere : sections proposees, valeurs par defaut, longueurs vendues. */
interface ProfilMateriau {
  poteaux: string[];
  poutres: string[];
  chevrons: string[];
  defaut: { poteau: string; poutre: string; chevron: string };
  longueurs: number[];
  couleur: string;
}

export const MATERIAUX: Record<MateriauPergola, ProfilMateriau> = {
  bois: {
    poteaux: ['90x90', '120x120', '145x145', '150x150'],
    poutres: ['70x150', '75x200', '90x225', '120x240'],
    chevrons: ['45x120', '45x145', '60x160', '75x200'],
    defaut: { poteau: '120x120', poutre: '75x200', chevron: '45x145' },
    longueurs: [6, 5, 4, 3, 2.5],
    couleur: '#8a6a48'
  },
  // Profiles du commerce : barres de 6 m, recoupees a 4 et 3 m chez la plupart des fournisseurs.
  aluminium: {
    poteaux: ['100x100', '120x120', '150x150'],
    poutres: ['80x150', '100x200', '120x250'],
    chevrons: ['40x100', '50x150', '60x200'],
    defaut: { poteau: '100x100', poutre: '100x200', chevron: '50x150' },
    longueurs: [6, 4, 3],
    couleur: '#383e42'
  }
};

export const LIBELLE_MATERIAU: Record<MateriauPergola, string> = { bois: 'Bois', aluminium: 'Aluminium' };
export const SECTIONS_CONTREFICHE = ['70x70', '90x90', '120x120'];

export const LIBELLE_TOIT_PERGOLA: Record<ToitPergola, string> = {
  toile: 'Chevrons et toile',
  'quatre-pans': 'Quatre pans',
  appentis: 'Appentis'
};

/** Pente par defaut : faible pour un appentis (ecoulement), franche pour quatre pans. */
const PENTE_DEFAUT: Record<ToitPergola, number> = { toile: 0, appentis: 10, 'quatre-pans': 30 };

/** Ce qui distingue un carport d'une pergola : ses valeurs par defaut, rien d'autre. */
const NATURES: Record<NatureAbri, { libelle: string; toit: ToitPergola; hauteur: number; pente: Partial<Record<ToitPergola, number>>; couverture: string }> = {
  pergola: { libelle: 'Pergola', toit: 'toile', hauteur: 2.4, pente: {}, couverture: '#9a4b32' },
  // Un bac acier gris sur un appentis a 5° : l'abri de voiture le plus courant.
  carport: { libelle: 'Carport', toit: 'appentis', hauteur: 2.3, pente: { appentis: 5 }, couverture: '#6f7478' }
};

/** Passage libre conseille sous les poutres d'un carport, en metres. */
export const PASSAGE_CARPORT_M = 2.2;

export const natureAbri = (o: ObjetPlan): NatureAbri => o.fonction === 'carport' ? 'carport' : 'pergola';
export const libelleAbri = (o: ObjetPlan): string => NATURES[natureAbri(o)].libelle;

/** Une chute plus courte ne repart pas au pot (comme les 50 cm de la terrasse, en plus court : charpente). */
const CHUTE_REUTILISABLE_M = 0.3;

export type ReglagesPergola = Required<Omit<Pergola, 'coteReference' | 'coteMur'>> & { coteReference: number; coteMur: number };

/** Le plus long cote : celui que les chevrons croisent le moins souvent, donc le moins de pieces. */
function plusLongCote(pts: PtBrut[]): number {
  let best = 0, L = -1;
  pts.forEach((p, i) => { const d = dist(p, au(pts, (i + 1) % pts.length)); if (d > L + 1e-9) { L = d; best = i; } });
  return best;
}

/** Le cote qui fait face au cote de reference : celui dont le milieu en est le plus loin. */
function coteEnFace(pts: PtBrut[], ref: number): number {
  const a = au(pts, ref), b = au(pts, (ref + 1) % pts.length);
  const L = dist(a, b) || 1;
  const loin = (p: PtBrut) => Math.abs((p.x - a.x) * (b.y - a.y) - (p.y - a.y) * (b.x - a.x)) / L;
  let best = ref, D = -1;
  pts.forEach((p, i) => {
    const q = au(pts, (i + 1) % pts.length);
    const d = loin({ x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 });
    if (d > D + 1e-9) { D = d; best = i; }
  });
  return best;
}

const indiceValide = (i: number | undefined, n: number): i is number => i !== undefined && Number.isInteger(i) && i >= 0 && i < n;

/** Les reglages complets d'une pergola : ce que l'objet porte, et les valeurs par defaut pour le reste. */
export function pergolaDe(o: ObjetPlan): ReglagesPergola {
  const p = o.pergola || {};
  const nature = NATURES[natureAbri(o)];
  const toit: ToitPergola = p.toit && p.toit in LIBELLE_TOIT_PERGOLA ? p.toit : nature.toit;
  const materiau: MateriauPergola = p.materiau === 'aluminium' ? 'aluminium' : 'bois';
  const m = MATERIAUX[materiau];
  const pts = o.type === 'polygon' ? o.pts : [];
  const n = pts.length;
  const coteReference = indiceValide(p.coteReference, n) ? p.coteReference : (n ? plusLongCote(pts) : 0);
  return {
    toit, materiau,
    hauteur: p.hauteur && p.hauteur > 0 ? p.hauteur : nature.hauteur,
    sectionPoteau: p.sectionPoteau || m.defaut.poteau,
    entraxePoteaux: p.entraxePoteaux && p.entraxePoteaux > 0.5 ? p.entraxePoteaux : 4,
    sectionPoutre: p.sectionPoutre || m.defaut.poutre,
    // L'aluminium n'en porte pas : le reglage du bois reste range pour un retour au bois.
    avecContrefiches: materiau === 'bois' && p.avecContrefiches !== false,
    longueurContrefiche: p.longueurContrefiche && p.longueurContrefiche > 0 ? p.longueurContrefiche : 0.7,
    sectionContrefiche: p.sectionContrefiche || '90x90',
    sectionChevron: p.sectionChevron || m.defaut.chevron,
    entraxeChevrons: p.entraxeChevrons && p.entraxeChevrons > 0.1 ? p.entraxeChevrons : 0.6,
    pente: p.pente !== undefined && p.pente >= 0 && p.pente < 60 ? p.pente : nature.pente[toit] ?? PENTE_DEFAUT[toit],
    coteReference,
    // Un toit a quatre pans tourne autour de son faitage : il ne s'adosse pas.
    adossee: !!p.adossee && toit !== 'quatre-pans' && n >= 3,
    coteMur: indiceValide(p.coteMur, n) ? p.coteMur : (n ? coteEnFace(pts, coteReference) : 0),
    debord: p.debord !== undefined && p.debord >= 0 && p.debord <= 1.5 ? p.debord : 0,
    prixMl: p.prixMl || {},
    prixToile: p.prixToile !== undefined && p.prixToile >= 0 ? p.prixToile : PRIX_TOILE_DEFAUT,
    prixCouverture: p.prixCouverture !== undefined && p.prixCouverture >= 0 ? p.prixCouverture : PRIX_COUVERTURE_DEFAUT,
    couleurBois: p.couleurBois || m.couleur,
    couleurToile: p.couleurToile || '#efe6d2',
    couleurCouverture: p.couleurCouverture || nature.couverture,
    longueursBois: p.longueursBois || m.longueurs.join(', ')
  };
}

/** Une section `'75x200'` en metres : `b` la largeur, `h` la hauteur. */
export function dimsPergola(sec: string): { b: number; h: number } {
  const m = /^(\d+(?:[.,]\d+)?)\s*x\s*(\d+(?:[.,]\d+)?)$/i.exec(sec.trim());
  if (!m) return { b: 0.1, h: 0.1 };
  return { b: parseFloat((m[1] ?? '100').replace(',', '.')) / 1000, h: parseFloat((m[2] ?? '100').replace(',', '.')) / 1000 };
}

/** `'75x200'` -> `'75 × 200 mm'`. */
export const libelleSection = (sec: string): string => sec.replace('x', ' × ') + ' mm';

export type RolePiece = 'poteau' | 'poutre' | 'lisse' | 'contrefiche' | 'chevron' | 'faitage' | 'aretier';

export const LIBELLE_ROLE: Record<RolePiece, [string, string]> = {
  poteau: ['poteau', 'poteaux'],
  poutre: ['poutre', 'poutres'],
  lisse: ['lisse murale', 'lisses murales'],
  contrefiche: ['contrefiche', 'contrefiches'],
  chevron: ['chevron', 'chevrons'],
  faitage: ['faîtage', 'faîtages'],
  aretier: ['arêtier', 'arêtiers']
};

/** Un point du plan a une hauteur : `x`, `y` en metres du plan, `z` au-dessus du sol. */
export interface Pt3 { x: number; y: number; z: number }

/** Une piece : son axe, sa section, son role, et la longueur a commander. */
export interface PiecePergola {
  role: RolePiece;
  section: string;
  a: Pt3;
  b: Pt3;
  /** Longueur a debiter, en metres : celle de l'axe, qui porte deja les debords. */
  longueur: number;
}

export interface PergolaCalculee {
  reglages: ReglagesPergola;
  pieces: PiecePergola[];
  /** Les pans de la couverture (toile ou couverture), en 3D. */
  pans: Pt3[][];
  /** L'emprise du toit au sol : le contour et son debord. */
  emprise: PtBrut[];
  /** Surface de la toile ou de la couverture, en m², pente comprise. */
  surfaceCouverture: number;
  avertissements: string[];
}

const long3 = (a: Pt3, b: Pt3): number => Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
const piece = (role: RolePiece, section: string, a: Pt3, b: Pt3): PiecePergola =>
  ({ role, section, a, b, longueur: long3(a, b) });

/**
 * Decale chaque cote d'un polygone vers l'exterieur de sa propre distance, et recoupe les coins a
 * l'intersection des cotes voisins : un debord nul du cote du mur, et le meme partout ailleurs.
 */
function decalerCotes(pts: PtBrut[], ccw: boolean, distances: number[]): PtBrut[] {
  const n = pts.length;
  const lignes = pts.map((a, i) => {
    const b = au(pts, (i + 1) % n), L = dist(a, b) || 1;
    const ux = (b.x - a.x) / L, uy = (b.y - a.y) / L;
    // Normale exterieure : a droite du sens de parcours pour un polygone trigonometrique.
    const nx = ccw ? uy : -uy, ny = ccw ? -ux : ux, d = au(distances, i);
    return { origin: { x: a.x + nx * d, y: a.y + ny * d }, dir: { x: ux, y: uy } };
  });
  return pts.map((p, i) => {
    const prev = au(lignes, (i - 1 + n) % n), cur = au(lignes, i);
    return lineLineIntersect(prev.origin, prev.dir, cur.origin, cur.dir) || { ...p };
  });
}

/**
 * Calcule les pieces d'une pergola. `null` si l'objet n'est pas un polygone utilisable (moins de
 * trois sommets, surface nulle).
 */
export function calculerPergola(o: ObjetPlan): PergolaCalculee | null {
  if (o.type !== 'polygon' || o.pts.length < 3 || shoelace(o.pts) < 0.01) return null;
  const r = pergolaDe(o);
  // Sens trigonometrique : les decalages vers l'interieur et la normale du cote de reference en
  // dependent. On garde l'indice des cotes en retournant la liste a la main.
  const ccw = signedArea(o.pts) > 0;
  const contour = o.pts.map(p => ({ x: p.x, y: p.y }));
  const n = contour.length;
  const poteau = dimsPergola(r.sectionPoteau), poutre = dimsPergola(r.sectionPoutre), chevron = dimsPergola(r.sectionChevron);
  const avertissements: string[] = [];
  const mur = r.adossee ? r.coteMur : -1;
  /** Le sommet `i` touche-t-il le mur ? Ni poteau ni debord de ce cote. */
  const auMur = (i: number) => mur >= 0 && (i === mur || i === (mur + 1) % n);

  // Le cote de reference et sa normale interieure : la pente d'un appentis monte le long de cette normale.
  const ra = au(contour, r.coteReference), rb = au(contour, (r.coteReference + 1) % n);
  const Lr = dist(ra, rb) || 1;
  const u = { x: (rb.x - ra.x) / Lr, y: (rb.y - ra.y) / Lr };
  const v = ccw ? { x: -u.y, y: u.x } : { x: u.y, y: -u.x };
  const tan = Math.tan((r.toit === 'appentis' ? r.pente : 0) * Math.PI / 180);
  /** Le dessous des poutres au droit d'un point : constant, sauf en appentis ou il suit la pente (le debord bas descend). */
  const sousPoutre = (p: PtBrut): number => r.hauteur + ((p.x - ra.x) * v.x + (p.y - ra.y) * v.y) * tan;
  if (natureAbri(o) === 'carport' && r.hauteur < PASSAGE_CARPORT_M - 1e-9) {
    avertissements.push('Passage libre de ' + r.hauteur.toFixed(2).replace('.', ',') + ' m sous les poutres : 2,20 m sont conseillés pour une voiture.');
  }
  if (r.adossee && r.toit === 'appentis' && r.coteMur === r.coteReference) {
    avertissements.push('La pente descend vers le mur : choisissez pour côté de référence celui qui fait face au mur.');
  }

  // Poteaux : leur axe est rentre d'une demi-section, pour que leur nu affleure le contour.
  const axes = polygonOffset(contour, poteau.b / 2);
  const poteaux: PtBrut[] = [];
  const pieces: PiecePergola[] = [];
  const plusLongue = Math.max(...longueursPergola(r));
  for (let i = 0; i < n; i++) {
    const a = au(axes, i), b = au(axes, (i + 1) % n);
    const L = dist(a, b) || 1;
    const ux = (b.x - a.x) / L, uy = (b.y - a.y) / L;
    if (!auMur(i)) poteaux.push(a);
    const travees = Math.max(1, Math.ceil(L / r.entraxePoteaux - 1e-6));
    if (i !== mur) for (let k = 1; k < travees; k++) poteaux.push({ x: a.x + (b.x - a.x) * k / travees, y: a.y + (b.y - a.y) * k / travees });
    // La poutre couvre les poteaux d'angle (une demi-section de chaque cote de l'axe) et deborde
    // avec le toit ; contre le mur, elle s'arrete au mur. La lisse murale ne deborde pas.
    const ext = (sommet: number) => poteau.b / 2 + (i === mur || auMur(sommet) ? 0 : r.debord);
    const pa = { x: a.x - ux * ext(i), y: a.y - uy * ext(i) }, pb = { x: b.x + ux * ext((i + 1) % n), y: b.y + uy * ext((i + 1) % n) };
    const pc = piece(i === mur ? 'lisse' : 'poutre', r.sectionPoutre,
      { ...pa, z: sousPoutre(pa) + poutre.h / 2 }, { ...pb, z: sousPoutre(pb) + poutre.h / 2 });
    pieces.push(pc);
    if (pc.longueur > plusLongue) avertissements.push('Une poutre de ' + pc.longueur.toFixed(2).replace('.', ',') + ' m dépasse la plus grande longueur achetable : elle sera aboutée sur un poteau.');
  }
  poteaux.forEach(p => pieces.push(piece('poteau', r.sectionPoteau, { ...p, z: 0 }, { ...p, z: sousPoutre(p) })));

  if (r.avecContrefiches) ajouterContrefiches(r, axes, poteaux, sousPoutre, pieces, avertissements);

  const dessusCadre = (p: PtBrut): number => sousPoutre(p) + poutre.h;
  let pans: Pt3[][];
  let emprise: PtBrut[];
  let surfaceCouverture: number;
  if (r.toit === 'quatre-pans') {
    ({ pans, emprise, surfaceCouverture } = toitQuatrePans(r, axes, contour, u, v, poutre.h, chevron.h, pieces));
    const rectangle = contour.length === 4 && contour.every((_, i) => Math.abs(angleEntre(contour, i) - 90) < 1);
    if (!rectangle) avertissements.push('Le toit à quatre pans est calculé sur le rectangle qui englobe la pergola.');
  } else {
    emprise = r.debord > 0 ? decalerCotes(contour, ccw, contour.map((_, i) => i === mur ? 0 : r.debord)) : contour;
    // Chevrons a plat (toile) ou dans la pente (appentis), perpendiculaires au cote de reference,
    // sur toute l'emprise du toit : ceux du debord portent sur le bout des poutres.
    const proj = emprise.map(p => (p.x - ra.x) * u.x + (p.y - ra.y) * u.y);
    const s0 = Math.min(...proj) + chevron.b / 2, s1 = Math.max(...proj) - chevron.b / 2;
    const nb = Math.max(1, Math.ceil((s1 - s0) / r.entraxeChevrons - 1e-6));
    for (let k = 0; k <= nb; k++) {
      const s = s0 + (s1 - s0) * k / nb;
      const origine = { x: ra.x + u.x * s, y: ra.y + u.y * s };
      clipLineToPolygon(origine, v, emprise).forEach(seg => {
        if (dist(seg.a, seg.b) < 0.05) return;
        const z = (p: PtBrut) => dessusCadre(p) + chevron.h / 2;
        pieces.push(piece('chevron', r.sectionChevron, { ...seg.a, z: z(seg.a) }, { ...seg.b, z: z(seg.b) }));
      });
    }
    pans = [emprise.map(p => ({ ...p, z: dessusCadre(p) + chevron.h + 0.005 }))];
    surfaceCouverture = shoelace(emprise) / Math.cos(Math.atan(tan));
  }
  return { reglages: r, pieces, pans, emprise, surfaceCouverture, avertissements };
}

/** Angle interieur au sommet `i`, en degres, sans orientation (0 a 180). */
function angleEntre(pts: PtBrut[], i: number): number {
  const n = pts.length, p = au(pts, i), a = au(pts, (i - 1 + n) % n), b = au(pts, (i + 1) % n);
  const ux = a.x - p.x, uy = a.y - p.y, wx = b.x - p.x, wy = b.y - p.y;
  const c = (ux * wx + uy * wy) / ((Math.hypot(ux, uy) * Math.hypot(wx, wy)) || 1);
  return Math.acos(Math.max(-1, Math.min(1, c))) * 180 / Math.PI;
}

/**
 * Les contrefiches, a 45°, de chaque poteau vers chaque poutre qu'il porte : deux par poteau (un
 * poteau d'angle porte deux poutres, un poteau intermediaire la meme poutre des deux cotes).
 */
function ajouterContrefiches(r: ReglagesPergola, axes: PtBrut[], poteaux: PtBrut[], sousPoutre: (p: PtBrut) => number,
  pieces: PiecePergola[], avertissements: string[]): void {
  const d = r.longueurContrefiche * Math.SQRT1_2;
  if (r.hauteur - d < 0.8) { avertissements.push('Contrefiches trop longues pour la hauteur des poteaux : elles ne sont pas posées.'); return; }
  const n = axes.length;
  poteaux.forEach(p => {
    for (let i = 0; i < n; i++) {
      const a = au(axes, i), b = au(axes, (i + 1) % n);
      const L = dist(a, b);
      if (L < 2 * d + 0.05) continue;
      const ux = (b.x - a.x) / L, uy = (b.y - a.y) / L;
      // Le poteau est-il sur ce cote, et ou ? t = 0 au debut, L a la fin.
      const t = (p.x - a.x) * ux + (p.y - a.y) * uy;
      const ecart = Math.abs((p.x - a.x) * uy - (p.y - a.y) * ux);
      if (ecart > 1e-6 || t < -1e-6 || t > L + 1e-6) continue;
      const sens: number[] = [];
      if (t + d <= L + 1e-6) sens.push(1);
      if (t - d >= -1e-6) sens.push(-1);
      sens.forEach(s => {
        const haut = { x: p.x + ux * d * s, y: p.y + uy * d * s };
        pieces.push(piece('contrefiche', r.sectionContrefiche, { ...p, z: sousPoutre(p) - d }, { ...haut, z: sousPoutre(haut) }));
      });
    }
  });
}

/**
 * Le toit a quatre pans sur le rectangle qui englobe le cadre (debord compris), dans le repere du
 * cote de reference : faitage dans la grande longueur, quatre aretiers, chevrons et empannons a
 * l'entraxe. Le debord prolonge la pente : l'egout descend d'autant sous le dessus du cadre.
 */
function toitQuatrePans(r: ReglagesPergola, axes: PtBrut[], contour: PtBrut[], u: PtBrut, v: PtBrut, hPoutre: number, hChevron: number,
  pieces: PiecePergola[]): { pans: Pt3[][]; emprise: PtBrut[]; surfaceCouverture: number } {
  const o = au(axes, 0);
  const us = contour.map(p => (p.x - o.x) * u.x + (p.y - o.y) * u.y), vs = contour.map(p => (p.x - o.x) * v.x + (p.y - o.y) * v.y);
  const d = r.debord;
  const u0 = Math.min(...us) - d, u1 = Math.max(...us) + d, v0 = Math.min(...vs) - d, v1 = Math.max(...vs) + d;
  // Repere local : x dans la grande longueur, y en travers.
  const selonU = u1 - u0 >= v1 - v0;
  const Lg = selonU ? u1 - u0 : v1 - v0, W = selonU ? v1 - v0 : u1 - u0;
  const tan = Math.tan(r.pente * Math.PI / 180);
  const base = r.hauteur + hPoutre - d * tan;
  const vers = (x: number, y: number, z: number): Pt3 => {
    const pu = selonU ? u0 + x : u0 + y, pv = selonU ? v0 + y : v0 + x;
    return { x: o.x + u.x * pu + v.x * pv, y: o.y + u.y * pu + v.y * pv, z };
  };
  const demi = W / 2, H = demi * tan;
  const zChev = (run: number) => base + run * tan + hChevron / 2;
  const f0 = vers(demi, demi, base + H), f1 = vers(Lg - demi, demi, base + H);
  if (Lg - W > 0.01) pieces.push(piece('faitage', r.sectionPoutre, f0, f1));
  const coins: [number, number][] = [[0, 0], [Lg, 0], [Lg, W], [0, W]];
  coins.forEach(([x, y]) => pieces.push(piece('aretier', r.sectionPoutre, vers(x, y, base), x < Lg / 2 ? f0 : f1)));
  const e = r.entraxeChevrons;
  // Long pans : chevrons pleins sous le faitage, empannons vers les aretiers.
  for (let x = e; x < Lg - 0.05; x += e) {
    const run = Math.min(x, Lg - x, demi);
    if (run < 0.05) continue;
    pieces.push(piece('chevron', r.sectionChevron, vers(x, 0, zChev(0)), vers(x, run, zChev(run))));
    pieces.push(piece('chevron', r.sectionChevron, vers(x, W, zChev(0)), vers(x, W - run, zChev(run))));
  }
  // Croupes : les empannons des petits cotes.
  for (let y = e; y < W - 0.05; y += e) {
    const run = Math.min(y, W - y);
    if (run < 0.05) continue;
    pieces.push(piece('chevron', r.sectionChevron, vers(0, y, zChev(0)), vers(run, y, zChev(run))));
    pieces.push(piece('chevron', r.sectionChevron, vers(Lg, y, zChev(0)), vers(Lg - run, y, zChev(run))));
  }
  const z0 = base + hChevron + 0.005, zf = z0 + H;
  const a = vers(0, 0, z0), b = vers(Lg, 0, z0), c = vers(Lg, W, z0), dd = vers(0, W, z0);
  const g0 = { ...f0, z: zf }, g1 = { ...f1, z: zf };
  const pans = [[a, b, g1, g0], [b, c, g1], [c, dd, g0, g1], [dd, a, g0]];
  const plat = (p: Pt3): PtBrut => ({ x: p.x, y: p.y });
  return { pans, emprise: [a, b, c, dd].map(plat), surfaceCouverture: Lg * W / Math.cos(Math.atan(tan)) };
}

export function longueursPergola(r: ReglagesPergola): number[] {
  return parseLongueurs(r.longueursBois, MATERIAUX[r.materiau].longueurs);
}

/** Une ligne du metrage : un produit (une section), les pieces qu'on y taille, et ce qu'il faut acheter. */
export interface MetrageSection {
  section: string;
  /** Nombre de pieces par role, dans l'ordre de la structure. */
  roles: Partial<Record<RolePiece, number>>;
  pieces: number;
  /** Metres lineaires poses. */
  ml: number;
  debit: Debit;
}

const ORDRE_ROLES: RolePiece[] = ['poteau', 'poutre', 'lisse', 'contrefiche', 'faitage', 'aretier', 'chevron'];

/**
 * Le metrage par section : les pieces regroupees par section (un poteau et une contrefiche de meme
 * section sont le meme produit), debitees dans les longueurs achetables comme les lames d'une
 * terrasse. Sans joint : une piece de charpente ne s'aboute pas n'importe ou.
 */
export function metrageParSection(calc: PergolaCalculee): MetrageSection[] {
  const dispo = longueursPergola(calc.reglages);
  const groupes = new Map<string, PiecePergola[]>();
  [...calc.pieces].sort((p, q) => ORDRE_ROLES.indexOf(p.role) - ORDRE_ROLES.indexOf(q.role)).forEach(p => {
    const g = groupes.get(p.section) || [];
    g.push(p);
    groupes.set(p.section, g);
  });
  return [...groupes.entries()].map(([section, ps]) => {
    const roles: Partial<Record<RolePiece, number>> = {};
    ps.forEach(p => { roles[p.role] = (roles[p.role] || 0) + 1; });
    const longueurs = ps.map(p => Math.round(p.longueur * 1000) / 1000);
    return {
      section, roles, pieces: ps.length,
      ml: longueurs.reduce((s, l) => s + l, 0),
      debit: optimiserDebitLames(longueurs.filter(l => l > 0.05), dispo, CHUTE_REUTILISABLE_M, 0, false)
    };
  });
}

// ---- Chiffrage --------------------------------------------------------------------------------

/**
 * Prix de fourniture par defaut, en euros TTC le metre lineaire : des ordres de grandeur de negoce
 * (bois de charpente classe 3-4, profiles aluminium thermolaques), a remplacer par le devis du
 * fournisseur — chaque prix se regle dans l'inspecteur.
 */
const PRIX_ML_DEFAUT: Record<MateriauPergola, Record<string, number>> = {
  bois: {
    '90x90': 9, '120x120': 16, '145x145': 26, '150x150': 28,
    '70x150': 12, '75x200': 18, '90x225': 26, '120x240': 40,
    '70x70': 6,
    '45x120': 5, '45x145': 6, '60x160': 10
  },
  aluminium: {
    '100x100': 35, '120x120': 45, '150x150': 60,
    '80x150': 40, '100x200': 55, '120x250': 75,
    '40x100': 15, '50x150': 22, '60x200': 30
  }
};
/** Au-dela de la liste : un prix proportionnel a la section (euros par mm² de section et par metre). */
const PRIX_PAR_MM2: Record<MateriauPergola, number> = { bois: 0.0011, aluminium: 0.0035 };
const PRIX_TOILE_DEFAUT = 25;
const PRIX_COUVERTURE_DEFAUT = 45;

const clePrix = (r: ReglagesPergola, section: string): string => r.materiau + ':' + section;

/** Le prix au metre lineaire d'une section : celui saisi, sinon celui du negoce. */
export function prixMlDe(r: ReglagesPergola, section: string): number {
  const saisi = r.prixMl[clePrix(r, section)];
  if (saisi !== undefined && saisi >= 0) return saisi;
  const liste = PRIX_ML_DEFAUT[r.materiau][section];
  if (liste !== undefined) return liste;
  const d = dimsPergola(section);
  return Math.round(d.b * d.h * 1e6 * PRIX_PAR_MM2[r.materiau]);
}

/** Le prix saisi pour une section a-t-il remplace celui du negoce ? */
export const prixMlSaisi = (r: ReglagesPergola, section: string): boolean => r.prixMl[clePrix(r, section)] !== undefined;
export { clePrix as clePrixPergola };

export interface ChiffragePergola {
  sections: { section: string; achatMl: number; prixMl: number; montant: number }[];
  couverture: { surface: number; prixM2: number; montant: number };
  total: number;
}

/** Le cout de fourniture : les barres achetees (chutes comprises) et la toile ou la couverture. */
export function chiffrerPergola(calc: PergolaCalculee, metrage: MetrageSection[] = metrageParSection(calc)): ChiffragePergola {
  const r = calc.reglages;
  const sections = metrage.map(m => {
    const prixMl = prixMlDe(r, m.section);
    return { section: m.section, achatMl: m.debit.achatMl, prixMl, montant: m.debit.achatMl * prixMl };
  });
  const prixM2 = r.toit === 'toile' ? r.prixToile : r.prixCouverture;
  const couverture = { surface: calc.surfaceCouverture, prixM2, montant: calc.surfaceCouverture * prixM2 };
  return { sections, couverture, total: sections.reduce((s, l) => s + l.montant, 0) + couverture.montant };
}

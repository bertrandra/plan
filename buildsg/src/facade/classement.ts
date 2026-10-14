// Le classement des ouvertures (MD/spec-facades-calage-detection.md §11, lot L15).
//
// Les quatre types restent (`fenetre`, `porte-fenetre`, `porte`, `garage`) et leurs regles de taille
// aussi. S'y ajoutent des **details**, lus sur l'elevation redressee, qui changent deja les cotes ou le
// type :
// - le haut de la boite : une bande de mur (un rang de brique accroche a la baie) ou le coffre d'un
//   volet roulant (une bande unie, d'une autre teinte, sans meneau) est retire de la hauteur ;
// - des lames horizontales regulieres dans la baie : des persiennes fermees (ou un tablier baisse) ;
// - sous l'appui, une dalle qui deborde des tableaux, ou des barreaux de part et d'autre : un balcon,
//   un garde-corps ; une grande baie d'etage au-dessus d'un balcon est une porte-fenetre ;
// - une grande baie au sol vitree (aretes verticales : meneau, dormant) est une porte-fenetre, pas
//   un garage (rainures horizontales) ;
// - le haut en arc (cintre), ou la baie ronde (oeil-de-boeuf), sur la forme de la tache.
//
// Chaque lecture est prudente : dans le doute, elle ne dit rien, et la baie garde ce que la taille
// en dit.

import type { Image } from './homographie.js';
import type { BoitePx, FondPx } from './detectionIndices.js';
import type { DetailsOuverture, TypeOuverture } from '../model/types.js';
import type { ValeursStructure } from './reglagesStructure.js';

/** Le type d'une baie, d'apres sa taille et sa hauteur d'appui (spec §11, regles d'avant le lot). */
export function classer(y: number, l: number, h: number): TypeOuverture {
  const auSol = y < 0.25;
  if (auSol && l >= 2.1 && h >= 1.8) return 'garage';
  if (auSol && h >= 1.8) return l >= 1.1 ? 'porte-fenetre' : 'porte';
  if (y < 0.45 && h >= 1.9) return 'porte-fenetre';
  return 'fenetre';
}

/** Ce que l'image dit d'une baie, au-dela de sa taille. */
export interface IndicesClassement {
  /** Aretes verticales franches (meneau, dormant) plus nombreuses que les horizontales. */
  vitree?: boolean;
  details?: DetailsOuverture;
}

/**
 * Le type d'une baie avec ce que l'image en dit (spec §11) : une grande baie au sol vitree est une
 * porte-fenetre, pas un garage ; une baie d'etage de 1,9 m ou plus au-dessus d'un balcon ou derriere un
 * garde-corps est une porte-fenetre (elle descend au plancher), meme si son appui est haut.
 */
export function classerAvecIndices(y: number, l: number, h: number, ind: IndicesClassement = {}): TypeOuverture {
  const t = classer(y, l, h);
  if (t === 'garage' && ind.vitree) return 'porte-fenetre';
  const allege = ind.details?.allege;
  if (t === 'fenetre' && h >= 1.9 && (allege === 'balcon' || allege === 'garde-corps')) return 'porte-fenetre';
  return t;
}

/* ------------------------------------------------------------------------------------------------
 * Lecture de l'image
 * --------------------------------------------------------------------------------------------- */

type RGB = [number, number, number];

function pixel(img: Image, X: number, Y: number): RGB {
  const k = (Y * img.largeur + X) * 4,
    d = img.donnees;
  return [d[k] ?? 0, d[k + 1] ?? 0, d[k + 2] ?? 0];
}

const ecart = (a: readonly number[], b: readonly number[]) => Math.hypot((a[0] ?? 0) - (b[0] ?? 0), (a[1] ?? 0) - (b[1] ?? 0), (a[2] ?? 0) - (b[2] ?? 0));

/** Le pixel (X, Y) de l'elevation ressemble-t-il au fond du mur (ecart sous le seuil de sa zone) ? */
function estMur(img: Image, F: FondPx, X: number, Y: number): boolean {
  const j = Math.min(F.h - 1, Math.floor(Y / F.f)) * F.l + Math.min(F.l - 1, Math.floor(X / F.f));
  const p = pixel(img, X, Y);
  return ecart(p, [F.fond[j * 3] ?? 0, F.fond[j * 3 + 1] ?? 0, F.fond[j * 3 + 2] ?? 0]) <= (F.seuil[j] ?? 0);
}

/** Moyenne de couleur de la ligne Y, colonnes [xa, xz[. */
function ligne(img: Image, Y: number, xa: number, xz: number): RGB {
  const s: RGB = [0, 0, 0];
  for (let X = xa; X < xz; X++) {
    const p = pixel(img, X, Y);
    s[0] += p[0];
    s[1] += p[1];
    s[2] += p[2];
  }
  const n = Math.max(1, xz - xa);
  return [s[0] / n, s[1] / n, s[2] / n];
}

/** Energie des aretes verticales de la ligne Y (ecart entre voisins de gauche et de droite), par pixel. */
function aretesVerticales(img: Image, Y: number, xa: number, xz: number): number {
  let s = 0;
  for (let X = Math.max(1, xa); X < Math.min(img.largeur - 1, xz); X++) s += ecart(pixel(img, X - 1, Y), pixel(img, X + 1, Y));
  return s / Math.max(1, xz - xa);
}

/**
 * Le haut de la boite (spec §11, volet roulant) : on cherche, entre 12 et 32 cm sous le haut, une
 * coupure franche (deux lignes d'une teinte, deux lignes d'une autre). Au-dessus d'elle :
 * - la bande ressemble au mur : un rang de brique, une ombre de linteau accroches a la baie ; on la
 *   retire, sans rien dire de plus ;
 * - la bande est unie dans sa largeur (pas de meneau ni de dormant) et d'une autre teinte que la baie,
 *   sur une baie vitree : c'est le coffre d'un volet roulant ; on le retire, `volets: 'roulant'`.
 * Rend la nouvelle ligne du haut, ou `null` si le haut tient.
 */
export function bandeHaute(img: Image, F: FondPx, b: BoitePx, pxParM: number, rg: ValeursStructure, coffrePossible: boolean): { Y0: number; coffre: boolean } | null {
  const w = b.X1 - b.X0,
    hh = b.Y1 - b.Y0;
  const cMin = Math.round(rg['facades.classement.coffreMinM'] * pxParM),
    cMax = Math.min(Math.round(rg['facades.classement.coffreMaxM'] * pxParM), Math.floor(hh * 0.4));
  if (w < 6 || cMax < cMin || b.Y0 < 0 || b.Y1 > img.hauteur) return null;
  const xa = b.X0 + Math.round(w * 0.12),
    xz = b.X1 - Math.round(w * 0.12);
  const lignes: RGB[] = [],
    aretes: number[] = [],
    mur: number[] = [];
  for (let Y = b.Y0; Y < b.Y1; Y++) {
    lignes.push(ligne(img, Y, xa, xz));
    aretes.push(aretesVerticales(img, Y, xa, xz));
    let n = 0;
    for (let X = xa; X < xz; X++) if (estMur(img, F, X, Y)) n++;
    mur.push(n / Math.max(1, xz - xa));
  }
  const moy = (t: number[], a: number, z: number) => t.slice(a, z).reduce((s, v) => s + v, 0) / Math.max(1, z - a);
  const moyRGB = (a: number, z: number): RGB => [0, 1, 2].map((c) => lignes.slice(a, z).reduce((s, p) => s + (p[c] ?? 0), 0) / Math.max(1, z - a)) as RGB;
  const aretesBas = moy(aretes, cMax + 2, Math.max(cMax + 3, hh - Math.round(hh * 0.1)));
  let meilleur: { c: number; coupure: number; coffre: boolean } | null = null;
  for (let c = cMin; c <= cMax; c++) {
    if (c < 2 || c + 2 > hh) continue;
    const coupure = ecart(moyRGB(c - 2, c), moyRGB(c, c + 2));
    if (coupure < rg['facades.classement.coupureMin'] || (meilleur && coupure <= meilleur.coupure)) continue;
    const bande = moyRGB(0, c);
    if (moy(mur, 0, c) >= 0.7) meilleur = { c, coupure, coffre: false };
    else if (coffrePossible) {
      // Un coffre est uni : peu d'aretes verticales, une teinte qui ne varie guere d'une ligne a l'autre.
      const uni = moy(aretes, 0, c) <= rg['facades.classement.coffreUniMax'] * aretesBas;
      const dispersion = Math.max(...lignes.slice(0, c).map((p) => ecart(p, bande)));
      if (uni && dispersion < rg['facades.classement.coupureMin'] && ecart(bande, moyRGB(c, Math.min(hh, 2 * c))) >= rg['facades.classement.coupureMin']) meilleur = { c, coupure, coffre: true };
    }
  }
  return meilleur ? { Y0: b.Y0 + meilleur.c, coffre: meilleur.coffre } : null;
}

/**
 * Les lames horizontales d'une baie (spec §11, persiennes fermees) : le profil des lignes (luminance
 * moyenne, tendance retiree) est periodique, d'un pas de 3 a 12 cm, sur toute la hauteur. Rend le
 * pas en metres, ou `null`.
 */
export function lamesHorizontales(img: Image, b: BoitePx, pxParM: number, rg: ValeursStructure): number | null {
  const w = b.X1 - b.X0,
    hh = b.Y1 - b.Y0;
  const xa = b.X0 + Math.round(w * 0.12),
    xz = b.X1 - Math.round(w * 0.12);
  const ya = b.Y0 + Math.round(hh * 0.08),
    yz = b.Y1 - Math.round(hh * 0.08);
  const n = yz - ya;
  const pMin = Math.max(2, Math.round(0.03 * pxParM)),
    pMax = Math.round(0.12 * pxParM);
  if (w < 6 || n < 4 * pMax) return null;
  const lum = Array.from({ length: n }, (_, k) => {
    const p = ligne(img, ya + k, xa, xz);
    return 0.3 * p[0] + 0.59 * p[1] + 0.11 * p[2];
  });
  // La tendance (le reflet du ciel sur un vitrage, un degrade d'ombre) sur une fenetre de 15 cm.
  const r = Math.max(pMax, Math.round(0.075 * pxParM));
  const d = lum.map((v, k) => {
    let s = 0,
      m = 0;
    for (let j = Math.max(0, k - r); j <= Math.min(n - 1, k + r); j++) {
      s += lum[j] ?? 0;
      m++;
    }
    return v - s / m;
  });
  const energie = d.reduce((s, v) => s + v * v, 0);
  if (energie / n < 4) return null;
  let meilleur: { p: number; r: number } | null = null;
  for (let p = pMin; p <= pMax; p++) {
    let s = 0;
    for (let k = 0; k + p < n; k++) s += (d[k] ?? 0) * (d[k + p] ?? 0);
    const rp = s / energie;
    if (!meilleur || rp > meilleur.r) meilleur = { p, r: rp };
  }
  if (!meilleur || meilleur.r < 0.5 || n / meilleur.p < rg['facades.classement.persiennesLamesMin']) return null;
  // Un maximum au plus petit pas cherche n'est pas un pas, c'est du bruit fin (grain, moire) ; et des
  // lames regulieres se retrouvent au double de leur pas.
  if (meilleur.p <= pMin) return null;
  let s2 = 0;
  for (let k = 0; k + 2 * meilleur.p < n; k++) s2 += (d[k] ?? 0) * (d[k + 2 * meilleur.p] ?? 0);
  if (s2 / energie < 0.3) return null;
  return Math.round((meilleur.p / pxParM) * 1000) / 1000;
}

/**
 * Les barreaux d'un cote de la baie (spec §11, garde-corps) : sur la bande `[ya, yz[`, les colonnes
 * `[xa, xz[` qui s'ecartent du mur sur presque toute la hauteur, et minces (4 cm au plus). Rend leur
 * nombre.
 */
function barreaux(img: Image, F: FondPx, xa: number, xz: number, ya: number, yz: number, pxParM: number): number {
  const mince = Math.max(2, Math.round(0.04 * pxParM));
  let n = 0,
    run = 0;
  for (let X = Math.max(0, xa); X <= Math.min(img.largeur, xz); X++) {
    let hors = 0;
    if (X < Math.min(img.largeur, xz)) for (let Y = ya; Y < yz; Y++) if (!estMur(img, F, X, Y)) hors++;
    const plein = X < Math.min(img.largeur, xz) && hors >= 0.7 * (yz - ya);
    if (plein) run++;
    else {
      if (run > 0 && run <= mince) n++;
      run = 0;
    }
  }
  return n;
}

/** Ce qui se lit sous une baie (spec §11). */
export interface LectureAllege {
  allege: 'balcon' | 'garde-corps';
  /** La dalle etait prise dans le bas de la boite : la ligne ou la baie s'arrete vraiment. */
  Y1?: number;
}

/**
 * Sous l'appui d'une baie (spec §11) : une dalle qui deborde de ses tableaux d'au moins 15 cm de chaque
 * cote (`balcon`), ou des barreaux de part et d'autre de la baie sans dalle (`garde-corps`). Un appui de
 * fenetre ne deborde que de quelques centimetres. La dalle peut etre collee a la baie, et la tache les
 * avoir prises ensemble : elle est alors retiree du bas de la boite. Rend `null` si rien ne se lit.
 */
export function allege(img: Image, F: FondPx, b: BoitePx, pxParM: number, rg: ValeursStructure): LectureAllege | null {
  const H = img.hauteur,
    L = img.largeur;
  const deb = Math.round(rg['facades.classement.balconDebordMinM'] * pxParM);
  if (b.X0 - deb < 0 || b.X1 + deb > L) return null;
  // Une baie au sol n'a ni balcon ni garde-corps sous elle : ce qui la borde est le sol.
  if (b.Y1 >= H - Math.round(0.25 * pxParM)) return null;
  const part = rg['facades.classement.balconPartMin'];
  const horsMur = (xa: number, xz: number, Y: number) => {
    let n = 0;
    for (let X = xa; X < xz; X++) if (!estMur(img, F, X, Y)) n++;
    return n / Math.max(1, xz - xa);
  };
  // Le mur de part et d'autre de la baie, a mi-hauteur, doit se lire comme du mur : sur une brique ou
  // une pierre dont les joints s'ecartent du fond, une dalle ou des barreaux ne se distinguent pas du
  // parement, et l'on ne dit rien.
  const mi = Math.round((b.Y0 + b.Y1) / 2);
  let parement = 0;
  for (let Y = mi - 2; Y <= mi + 2; Y++) parement += (horsMur(b.X0 - deb, b.X0 - 1, Y) + horsMur(b.X1 + 1, b.X1 + deb, Y)) / 2;
  if (parement / 5 > rg['facades.classement.parementBruitMax']) return null;
  const deborde = (Y: number) => horsMur(b.X0 - deb, b.X0 - 1, Y) >= part && horsMur(b.X1 + 1, b.X1 + deb, Y) >= part;
  // Une dalle qui court sur toute la facade est un bandeau (ou le haut d'un soubassement), pas un balcon.
  const bandeau = (Y: number) => horsMur(0, L, Y) >= 0.85;
  const epaisseur = Math.max(2, Math.round(0.04 * pxParM)),
    portee = Math.round(0.3 * pxParM);
  // La dalle collee : les dernieres lignes de la boite debordent de ses tableaux.
  // C'est une bande nette : au-dessus d'elle, le long des tableaux, le mur revient sur deux epaisseurs
  // (un garde-corps, une haie, une ombre debordent sur toute la hauteur, une dalle non).
  let haut = b.Y1;
  const plafond = Math.max(b.Y0, b.Y1 - portee);
  while (haut > plafond && deborde(haut - 1)) haut--;
  // Et la tache l'a avalee entiere : sous la boite, le mur revient aussi. Sinon la boite s'arrete sur
  // autre chose (la lisse basse d'un garde-corps posee sur la dalle), et on n'y touche pas.
  const nette =
    haut > plafond &&
    Array.from({ length: 2 * epaisseur }, (_, k) => haut - 1 - k).every((Y) => Y <= b.Y0 || !deborde(Y)) &&
    Array.from({ length: epaisseur }, (_, k) => b.Y1 + k).every((Y) => Y >= H || !deborde(Y));
  // Une dalle a 12 a 20 cm d'epaisseur : on en exige 8 dans la boite, pour ne pas rogner une baie sur
  // l'ombre ou le nez d'une dalle qui l'effleure.
  if (b.Y1 - haut >= 2 * epaisseur && nette) return bandeau(b.Y1 - 1) ? null : { allege: 'balcon', Y1: haut };
  // La dalle sous l'appui : au moins 4 cm de lignes de suite, dans les 30 cm sous la baie, hors du mur
  // de part et d'autre des tableaux et sous la baie.
  let suite = 0;
  for (let Y = b.Y1; Y < Math.min(H, b.Y1 + portee); Y++) {
    suite = deborde(Y) && horsMur(b.X0, b.X1, Y) >= part ? suite + 1 : 0;
    if (suite >= epaisseur) return bandeau(Y) ? null : { allege: 'balcon' };
  }
  // Les barreaux, de part et d'autre de la baie, dans le bas de sa hauteur.
  const ya = Math.max(0, b.Y1 - Math.round(0.8 * pxParM)),
    yz = b.Y1 - Math.round(0.1 * pxParM);
  if (yz - ya < 4) return null;
  const cote = Math.round(0.6 * pxParM);
  const g = barreaux(img, F, Math.max(0, b.X0 - cote), b.X0 - 1, ya, yz, pxParM),
    d = barreaux(img, F, b.X1 + 1, Math.min(L, b.X1 + cote), ya, yz, pxParM);
  if (g >= 2 && d >= 2 && g + d >= rg['facades.classement.barreauxMin']) return { allege: 'garde-corps' };
  return null;
}

/**
 * Une grande baie vitree se lit a ses aretes verticales franches (meneau, dormant, vantaux) ; une porte
 * de garage a ses rainures horizontales. Compte les pixels d'arete franche de chaque sens dans le
 * milieu de la boite.
 */
export function estVitree(img: Image, b: BoitePx, rg: ValeursStructure, franc = 40): boolean {
  const w = b.X1 - b.X0,
    hh = b.Y1 - b.Y0;
  const xa = Math.max(1, b.X0 + Math.round(w * 0.12)),
    xz = Math.min(img.largeur - 1, b.X1 - Math.round(w * 0.12));
  const ya = Math.max(1, b.Y0 + Math.round(hh * 0.12)),
    yz = Math.min(img.hauteur - 1, b.Y1 - Math.round(hh * 0.12));
  let nx = 0,
    ny = 0;
  for (let Y = ya; Y < yz; Y++)
    for (let X = xa; X < xz; X++) {
      if (ecart(pixel(img, X - 1, Y), pixel(img, X + 1, Y)) >= franc) nx++;
      if (ecart(pixel(img, X, Y - 1), pixel(img, X, Y + 1)) >= franc) ny++;
    }
  return (nx + 1) / (ny + 1) >= rg['facades.classement.vitreeRapportMin'];
}

/**
 * Une marche dans le haut d'une tache (lot G17) : loin des tableaux (au-dela de `cintreBordPart` de la
 * largeur), deux colonnes voisines dont le haut differe de plus de `cintreMarcheMaxPart` de la hauteur
 * (deux pixels au moins). `haut(x)` est la premiere ligne pleine de la colonne x, depuis le haut.
 */
function marcheDansArc(l: number, h: number, haut: (x: number) => number, rg: ValeursStructure): boolean {
  const bord = Math.max(1, Math.ceil(rg['facades.classement.cintreBordPart'] * l));
  const marche = Math.max(2, rg['facades.classement.cintreMarcheMaxPart'] * h);
  for (let x = bord; x < l - bord; x++) if (Math.abs(haut(x) - haut(x - 1)) > marche) return true;
  return false;
}

/**
 * La forme d'une tache dans sa boite (spec §11) : `cintre` si les deux coins du haut sont vides et le
 * haut du milieu plein, `rond` si ses quatre coins sont vides et sa boite presque carree. `remplis`
 * dit si le pixel (x, y) de la boite (y vers le bas) appartient a la tache.
 */
export function formeDeTache(l: number, h: number, remplis: (x: number, y: number) => boolean, rg: ValeursStructure): 'rect' | 'cintre' | 'rond' {
  const c = Math.max(1, Math.round(Math.min(l, h) * 0.22));
  if (c < 2) return 'rect';
  const part = (x0: number, y0: number, w: number, hh: number) => {
    let n = 0;
    for (let y = y0; y < y0 + hh; y++) for (let x = x0; x < x0 + w; x++) if (remplis(x, y)) n++;
    return n / Math.max(1, w * hh);
  };
  const hg = part(0, 0, c, c),
    hd = part(l - c, 0, c, c),
    bg = part(0, h - c, c, c),
    bd = part(l - c, h - c, c, c);
  const milieu = part(Math.floor(l / 2 - c / 2), 0, c, c);
  const max = rg['facades.classement.cintrePartMax'];
  if (hg > max || hd > max || milieu < 0.8) return 'rect';
  // Un arc est symetrique, et ses deux tableaux sont pleins a mi-hauteur : une tache rongee d'un cote
  // (une haie, une ombre devant elle) n'est pas un cintre.
  const tableaux = Math.min(part(0, Math.floor(h / 2 - c / 2), c, c), part(l - c, Math.floor(h / 2 - c / 2), c, c));
  if (tableaux < 0.8 || Math.abs(hg - hd) > 0.2) return 'rect';
  const haut = (x: number) => {
    let y = 0;
    while (y < h && !remplis(x, y)) y++;
    return y;
  };
  const g = haut(Math.floor(c / 2)),
    d = haut(l - 1 - Math.floor(c / 2));
  if (Math.abs(g - d) > Math.max(2, 0.25 * Math.max(g, d))) return 'rect';
  // L'arc descend regulierement du milieu vers chaque tableau : le haut d'une haie ou d'un houppier,
  // dentele, monte et descend.
  for (let x = 1; x < Math.floor(l / 2); x++) if (haut(x) > haut(x - 1) + 1 || haut(l - 1 - x) > haut(l - x) + 1) return 'rect';
  // Et il descend sans marche : la pente d'un arc n'est raide que tout pres des tableaux (un plein
  // cintre est vertical a sa naissance, et ne monte plus que de deux pixels par colonne a 5 % de la
  // largeur du tableau). Une baie posee sur une haie plus large qu'elle (scenes 07 et 17 du banc) forme
  // un T : le haut de la haie, plat, puis une marche franche jusqu'au linteau de la baie.
  if (marcheDansArc(l, h, haut, rg)) return 'rect';
  if (bg <= max && bd <= max && Math.abs(l - h) <= 0.2 * Math.max(l, h)) return 'rond';
  return bg >= 0.8 && bd >= 0.8 ? 'cintre' : 'rect';
}

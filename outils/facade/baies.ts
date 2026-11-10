// Les baies (fenetres, portes) sur la facade redressee de facade.html : le vote.
//
// Aucun indice ne suffit seul a reconnaitre une baie sur une photo de facade : une vitre est sombre
// ou reflete le ciel, un rideau a la clarte de l'enduit, un porche met tout a l'ombre, un panneau
// d'enduit entre deux colombages a tout d'un rectangle encadre. Trois detecteurs independants
// cherchent donc les baies chacun a sa facon, et se trompent rarement au meme endroit :
//
//   - `baies/propositions.ts` : des dizaines de milliers de rectangles d'aretes, une note par
//     rectangle (une vingtaine d'indices ponderes), une selection globale ; le plus regulier
//     d'une facade a l'autre ;
//   - `baies/mailles.ts` : la menuiserie d'abord - les mailles fermees par des aretes, elargies au
//     cadre, reunies en vantaux et impostes ; le meilleur sur une maison ;
//   - `baies/travees.ts` : l'alignement et la repetition - travees entre montants, bandes entre
//     lignes, baies retrouvees par leurs semblables.
//
// Le vote ne regarde pas l'image : il ne juge que les boites des trois detecteurs, par leur
// geometrie et par leur accord. Le resultat (boites, types, cotes) ne depend pas de l'ordre dans
// lequel elles arrivent : elles sont triees par leur position, chaque choix se fait du plus net au
// moins net, et l'echelle de repli est une mediane. Les boites sont rognees a l'image, une boite
// rendue deux fois par un detecteur ne compte qu'une fois, et au-dela de 400 boites par detecteur
// seules les plus grandes sont lues (le vote compare les boites deux a deux : son temps est borne).
//
//   1. Les grappes. Deux boites de detecteurs differents s'accordent si elles se recouvrent assez
//      (IoU >= 0,5 : accord fort) ou si l'une contient presque toute l'autre sans etre plus de
//      quatre fois plus grande (accord faible : un vantail et sa fenetre). Les paires sont prises
//      du meilleur recouvrement au moins bon ; une grappe a au plus une boite par detecteur.
//   2. La boite d'une grappe. A trois voix, la mediane de chaque bord (deux detecteurs contre un).
//      A deux voix en accord fort, le hors-tout des deux boites : ce qui manque a l'une est le plus
//      souvent cache (un bas de porte derriere un buisson, une lisse). A deux voix en accord faible,
//      on regarde ce que le detecteur de la petite voit d'autre dans la grande : une boite separee
//      de la petite par du mur, et la grande reunit deux baies (une porte et la fenetre d'a cote) -
//      la petite donne l'etendue le long de cet axe, le hors-tout sur l'autre ; des boites accolees
//      a la petite, et ce sont les parties d'un tout (deux vantaux) - le hors-tout ; rien d'autre,
//      et rien ne dit laquelle a raison - la grande si elle seule a la taille d'une baie sure de
//      la meme facade (jamais la petite sur cet indice : un vantail a souvent la taille d'une
//      fenetre etroite voisine), a defaut la moyenne des bords.
//   3. Le tout et ses parties. Une boite qu'un detecteur voit d'un seul tenant et que les autres
//      couvrent de plusieurs morceaux, sans mur entre eux, remplace la ou les baies retenues
//      qu'elle contient (les pans d'une baie vitree, ou le seul pan qui ait ete vote) ; jamais deux
//      baies separees par un trumeau. Puis une ouverture, une boite : une baie retenue dans une
//      baie plus grande que plus de detecteurs voient en est une partie, elle est ecartee.
//   4. Les baies vues par un seul detecteur ne sont gardees que si la facade les confirme : memes
//      tableaux et meme taille qu'une baie votee de leur colonne ; pour le premier detecteur (celui
//      qui se trompe le moins quand il est seul), les memes tableaux, ou la meme taille dans le meme
//      rang. Une porte vue par un seul des deux autres detecteurs est gardee si elle en a la forme
//      et la place : debout, son linteau au niveau de celui d'une baie votee, descendant sous
//      l'appui de cette baie (jamais du premier : ses boites debout sans accord sont des morceaux).
//   5. Le sol : le bas de la plus basse des portes. Avec une echelle, une porte fait 1,80 m de haut
//      au moins ; sans echelle, c'est une baie qui descend sous l'appui d'une baie de son rang. Une
//      porte a une voix ne situe pas le sol au-dessus d'une baie votee. Et le sol n'est pas annonce
//      si le resultat le contredit (une baie a deux voix tout entiere dessous) : les types restent
//      alors « fenetre » et l'echelle vient des detecteurs.
//   6. Au niveau du sol, une baie est une porte : ce qui est pose au sol sans en avoir la hauteur
//      (un vide entre les barreaux d'une balustrade, une poubelle, un pot) est ecarte. Sont
//      epargnees une baie qui est elle-meme une porte (regle 5), et une baie que les trois
//      detecteurs voient si elle n'est pas debout (une vitrine, un soupirail) : un vide entre deux
//      barreaux, debout, a trois voix comme une baie.
//   7. Les morceaux laisses au-dessus ou au-dessous d'une baie retenue, dans son etendue et a
//      moins d'une traverse d'elle, la prolongent (une imposte, le bas d'une porte sous une lisse).
//
// Mesure (note de 0 a 1). Une image seule bouge de 0,05 d'un cadrage a l'autre : la mesure est
// « large », huit familles de variantes (le jeu d'entrainement, ses miroirs, demi-resolutions,
// images assombries, rognees, reduites, 40 autres facades), 221 images - 39 de la maison, 168
// d'immeubles, 14 synthetiques -, 0,55 x maison + 0,35 x immeubles + 0,10 x synthetiques. Le vote
// d'origine avec ses detecteurs : 0,815 ; celui-ci avec les detecteurs corriges : 0,867 - maison
// 0,922 (289 ouvertures justes, 18 fausses, 12 manquees sur 301, contre 275 / 66 / 26), immeubles
// 0,742 (2517 / 734 / 1163, contre 2568 / 1086 / 1112), synthetiques 1,00 (cotes a 2 cm). Sur
// deux jeux tenus a l'ecart de la mise au point (47 et 46 images) : 0,80 -> 0,83 et 0,76 -> 0,85.
// Sur l'elevation que la page produit a partir de trois photos (13 variantes) : 0,84 -> 0,94.
//
// Une regle de plus a ete essayee et retiree : a trois voix, donner raison a la seule boite qui a
// la taille d'une baie sure du meme rang, contre la mediane. Elle gagnait 0,007 sur les familles de
// mise au point (cinq rognages de la meme maison faisaient presque tout le gain) et perdait 0,015
// sur un jeu tenu a l'ecart : une regle se juge sur des images qu'elle n'a pas vues.
//
// Les seuils ne sont ajustes a aucune image. En les faisant varier d'un quart, la mesure large
// bouge de moins de 0,005 (les seuils de l'accord sont les plus sensibles). En deplacant au hasard
// chaque bord de chaque boite de 4 % et en retirant une boite sur dix, elle tombe a 0,83 : la
// boite n'est jamais plus juste que celles qu'on lui donne.
//
// Ce qui reste fragile :
//   - deux detecteurs qui laissent la meme imposte dehors, ou prennent le meme encadrement,
//     l'emportent sur le troisieme (la mediane a trois voix) : c'est la premiere cause de mauvais
//     cadrage ;
//   - une baie qu'un seul detecteur trouve, sans semblable dans sa colonne ni dans son rang, est
//     perdue (200 ouvertures justes sur les 3680 des immeubles) ;
//   - la regle 3 sert la maison (la baie vitree) et coute aux immeubles plus de justes qu'elle
//     n'y retire de fausses (une quinzaine sur 2500) ; a voix egales, deux baies retenues l'une
//     dans l'autre restent toutes les deux (une soixantaine de paires sur 168 immeubles) ;
//   - les regles 5 a 7 tiennent a la porte. Sur la maison le sol est juste (39 images sur 39).
//     Sur les immeubles, sans echelle, il est incertain : situe sur 45 images sur 168 - juste 28
//     fois, faux 13, sans porte annotee 4 -, et 72 facades a porte restent sans sol ; une
//     fenetre y est rarement typee porte (11 sur 2440) mais deux portes sur trois y sortent
//     « fenetre ». Sans porte trouvee, tout est « fenetre » et rien n'ecarte ce qui est pose au sol ;
//   - au sol, la regle 6 ecarte aussi a deux voix un soupirail, une fenetre d'allege tres basse
//     (moins de 12 % de la hauteur de la porte), une vitrine moins haute que 70 % de la porte ;
//   - une baie a une voix rendue sous le sol annonce a sa hauteur ramenee a 0 (2 sur 168 immeubles).
//
// La boite rendue est le hors-tout de la menuiserie (cadre compris). Le type suit la regle de Plan
// (`classer`) une fois le sol situe. Sans echelle fournie, les cotes en metres sont indicatives :
// l'echelle vient de la porte qui situe le sol (2,10 m de haut), a defaut de ce que les detecteurs
// ont estime (la mediane de leurs baies). C'est une proposition : la page permet d'ajouter,
// recadrer, retirer une baie et d'en changer le type.

import type { Image } from './auto.js';
import { classer } from '../../src/facade/detection/classement.js';
import type { TypeOuverture } from '../../src/model/typesReleve.js';
import { detecterBaies as parPropositions } from './baies/propositions.js';
import { detecterBaies as parMailles } from './baies/mailles.js';
import { detecterBaies as parTravees } from './baies/travees.js';

export interface Baie {
  type: TypeOuverture;
  /** En metres : depuis le bord gauche de l'image, et au-dessus du sol (ou du bas de l'image). */
  x: number;
  y: number;
  l: number;
  h: number;
  /** Nombre de detecteurs qui voient cette baie (1 a 3). */
  carreaux: number;
  /** En pixels de l'image, pour la dessiner : le hors-tout de la menuiserie. */
  px: { x: number; y: number; l: number; h: number };
}

export interface ResultatBaies {
  /** Rang par rang en partant du bas, de gauche a droite dans chaque rang. */
  baies: Baie[];
  /** Le sol a-t-il ete situe (une porte trouvee) ? Sinon, les hauteurs partent du bas de l'image. */
  solTrouve: boolean;
  /** Le sol, en pixels de l'image (y), s'il a ete situe. */
  solPx: number | null;
  /** L'echelle etait-elle fournie ? Sinon elle est estimee (une porte de 2,10 m, ou les detecteurs). */
  echelleConnue: boolean;
}

type Boite = Baie['px'];
/** La boite d'un detecteur (k : son rang dans le vote). */
type Vue = Boite & { k: number };
/** Une baie retenue : sa boite, le nombre de detecteurs qui la voient. */
interface Retenue {
  px: Boite;
  voix: number;
  /** Admise comme porte alors qu'un seul detecteur la voit. */
  porte: boolean;
}

/** Deux boites s'accordent a partir de ce recouvrement (intersection sur union) : accord fort. */
const ACCORD = 0.5;
/** ... ou quand l'une contient cette part de l'autre (un vantail et sa fenetre), sans etre minuscule devant elle : accord faible. La note ne bouge pas entre 0,70 et 0,85 et tombe a 0,90 : le milieu du palier, pour que des boites qui bougent un peu ne changent pas le vote. */
const CONTENANCE = 0.8,
  ACCORD_CONTENU = 0.25;
/** Une boite a une voix (regles 4 et 7) ou un tout (regle 3) est ecarte s'il mord a ce point sur une baie retenue. Deux baies votees ne sont comparees que par la regle « une ouverture, une boite ». */
const CHEVAUCHEMENT = 0.3;
/** Deux boites voisines sont deux baies, et non deux morceaux d'une seule, quand le vide entre elles depasse cette part de la plus petite (un trumeau ; un meneau, un poteau sont plus fins : 7 % entre deux pans ; 99 % des paires de fenetres voisines annotees du banc sont a plus de 12 %). */
const TRUMEAU = 0.1;
/** Une boite « reunit » une autre baie quand elle en recouvre cette part. */
const MORD = 0.7;
/** Meme taille : largeur et hauteur a 20 % pres. Alignes : bords a 10 % de la taille pres. */
const SEMBLABLE = 0.2,
  ALIGNE = 0.1;
/** Le tout et ses parties : part du tout que ses morceaux doivent couvrir (la note ne bouge pas de 0,25 a 0,40 et baisse a 0,45) ; vide admis entre deux baies qu'il reunit. */
const COUVERT = 0.35,
  ENTRE_PANS = 0.15;
/** Un morceau prolonge une baie s'il en est separe par moins que cette part de sa hauteur (une traverse, une lisse). */
const LISSE = 0.08;
/** Une porte a une voix : debout (1,5 fois plus haute que large au moins) sans etre une fente (3,5 fois au plus : une porte de service de 63 cm fait 3,4 ; la note ne bouge pas de 2,75 a 3,5). */
const DEBOUT = 1.5,
  FENTE = 3.5;
/** Le vote compare les boites deux a deux : au-dela de ce nombre par detecteur (sept fois ce qu'une facade du banc en donne), seules les plus grandes sont lues. */
const MAX_BOITES = 400;
/** Hauteur d'une porte, en metres : le seuil de `classer`, et la porte courante qui donne l'echelle. */
const H_PORTE_MIN = 1.8,
  H_PORTE = 2.1;
/** Au sol : une baie plus basse que cette part de la porte n'en est pas une (une porte coupee d'un quart par un buisson en reste une) ; « au sol » = le bas entre 12 % de la porte au-dessus du seuil et 50 % en dessous (un perron, un terrain en contrebas). Chacun au milieu de son palier : la note ne bouge pas de 0,60 a 0,75 pour le premier, de 0,40 a 0,60 pour le dernier. */
const PAS_UNE_PORTE = 0.7,
  SEUIL_HAUT = 0.12,
  SEUIL_BAS = 0.5;

const aire = (b: Boite) => Math.max(0, b.l) * Math.max(0, b.h);
const droite = (b: Boite) => b.x + b.l;
const bas = (b: Boite) => b.y + b.h;
const boite = (x0: number, y0: number, x1: number, y1: number): Boite => ({ x: x0, y: y0, l: x1 - x0, h: y1 - y0 });
const horsTout = (a: Boite, b: Boite) => boite(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.max(droite(a), droite(b)), Math.max(bas(a), bas(b)));
function intersection(a: Boite, b: Boite): number {
  const x0 = Math.max(a.x, b.x),
    y0 = Math.max(a.y, b.y),
    x1 = Math.min(droite(a), droite(b)),
    y1 = Math.min(bas(a), bas(b));
  return x1 > x0 && y1 > y0 ? (x1 - x0) * (y1 - y0) : 0;
}
const iou = (a: Boite, b: Boite) => {
  const i = intersection(a, b);
  return i / (aire(a) + aire(b) - i || 1);
};
/** Part de la plus petite des deux boites qui est dans l'autre. */
const contenue = (a: Boite, b: Boite) => intersection(a, b) / (Math.min(aire(a), aire(b)) || 1);
/** Part de `a` qui est dans `b`. */
const dans = (a: Boite, b: Boite) => intersection(a, b) / (aire(a) || 1);
const sAccordent = (a: Boite, b: Boite) => {
  const v = iou(a, b);
  return v >= ACCORD || (v >= ACCORD_CONTENU && contenue(a, b) >= CONTENANCE);
};
/** Hauteur du recouvrement de deux boites (negative : l'ecart vertical qui les separe). */
const recouvreY = (a: Boite, b: Boite) => Math.min(bas(a), bas(b)) - Math.max(a.y, b.y);
const memeTaille = (a: Boite, b: Boite) => Math.abs(a.l - b.l) <= SEMBLABLE * Math.max(a.l, b.l) && Math.abs(a.h - b.h) <= SEMBLABLE * Math.max(a.h, b.h);
/** Memes tableaux (la meme colonne), memes linteau et appui (le meme rang), a la tolerance d'alignement pres. */
const memeColonne = (a: Boite, b: Boite) => Math.abs(a.x - b.x) <= ALIGNE * a.l && Math.abs(droite(a) - droite(b)) <= ALIGNE * a.l;
const memeRang = (a: Boite, b: Boite) => Math.abs(a.y - b.y) <= ALIGNE * a.h && Math.abs(bas(a) - bas(b)) <= ALIGNE * a.h;
/** Un ordre total qui ne tient qu'a la geometrie (jamais a l'ordre d'arrivee) : de haut en bas, puis de gauche a droite. */
const parPosition = (a: Boite, b: Boite) => a.y - b.y || a.x - b.x || a.h - b.h || a.l - b.l;

function mediane(t: number[]): number {
  const u = [...t].sort((a, b) => a - b);
  const m = u.length >> 1;
  return u.length % 2 ? u[m]! : (u[m - 1]! + u[m]!) / 2;
}

/** Du mur entre des boites le long d'un axe : un vide plus large que `part` fois la plus petite de ses deux voisines. */
function mur(bs: Boite[], axe: 'x' | 'y', part: number): boolean {
  const iv = bs.map((b) => (axe === 'x' ? { a: b.x, b: droite(b) } : { a: b.y, b: bas(b) })).sort((p, q) => p.a - q.a || p.b - q.b);
  let fin = Infinity,
    taille = 0;
  for (const v of iv) {
    if (v.a - fin > part * Math.min(taille, v.b - v.a)) return true;
    // La boite qui va le plus loin est la voisine du vide suivant (la premiere, au depart).
    if (fin === Infinity || v.b > fin) {
      fin = v.b;
      taille = v.b - v.a;
    }
  }
  return false;
}

/** Au-dela de ce nombre de cases par cote, la couverture se mesure sur une grille reguliere (le temps reste borne). */
const GRILLE = 64;
/** Dans un tableau trie : le nombre de valeurs avant `v` (`v` compris si `incluse`). */
function rangDe(t: number[], v: number, incluse: boolean): number {
  let a = 0,
    b = t.length;
  while (a < b) {
    const m = (a + b) >> 1;
    if (t[m]! < v || (incluse && t[m]! === v)) a = m + 1;
    else b = m;
  }
  return a;
}

/**
 * Part de `g` que des boites couvrent (l'aire de leur union dans `g`). Exacte tant que les bords
 * des boites decoupent `g` en peu de cases ; au-dela, sur une grille de GRILLE x GRILLE cases
 * (1 / 64 de `g` : bien plus fin que le seuil qu'on lui compare). Un passage par boite puis un par
 * case : le temps ne depend plus du produit des deux.
 */
function couverture(g: Boite, bs: Boite[]): number {
  const borne = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
  const x1 = droite(g),
    y1 = bas(g);
  const coupes = (a: number, b: number, vs: number[]) => {
    const u = [...new Set([a, b, ...vs.map((v) => borne(v, a, b))])].sort((p, q) => p - q);
    return u.length - 1 <= GRILLE ? u : Array.from({ length: GRILLE + 1 }, (_, i) => a + ((b - a) * i) / GRILLE);
  };
  const xs = coupes(g.x, x1, bs.flatMap((b) => [b.x, droite(b)])),
    ys = coupes(g.y, y1, bs.flatMap((b) => [b.y, bas(b)]));
  const nx = xs.length - 1,
    ny = ys.length - 1;
  if (nx < 1 || ny < 1) return 0;
  const cx = Array.from({ length: nx }, (_, i) => (xs[i]! + xs[i + 1]!) / 2),
    cy = Array.from({ length: ny }, (_, j) => (ys[j]! + ys[j + 1]!) / 2);
  // Une case est couverte si son centre est dans une boite : les differences, puis leur cumul.
  const d = new Int32Array((nx + 1) * (ny + 1));
  const plus = (i: number, j: number, v: number) => {
    d[j * (nx + 1) + i] = d[j * (nx + 1) + i]! + v;
  };
  for (const b of bs) {
    const i0 = rangDe(cx, b.x, false),
      i1 = rangDe(cx, droite(b), true),
      j0 = rangDe(cy, b.y, false),
      j1 = rangDe(cy, bas(b), true);
    if (i1 <= i0 || j1 <= j0) continue;
    plus(i0, j0, 1);
    plus(i1, j0, -1);
    plus(i0, j1, -1);
    plus(i1, j1, 1);
  }
  let s = 0;
  for (let j = 0; j < ny; j++)
    for (let i = 0; i < nx; i++) {
      const k = j * (nx + 1) + i;
      d[k] = d[k]! + (i ? d[k - 1]! : 0) + (j ? d[k - nx - 1]! : 0) - (i && j ? d[k - nx - 2]! : 0);
      if (d[k]! > 0) s += (xs[i + 1]! - xs[i]!) * (ys[j + 1]! - ys[j]!);
    }
  return s / (aire(g) || 1);
}

/** Les boites d'un detecteur que le vote peut lire : une liste mal formee, une boite sans cotes finies et positives ne levent pas. */
const valide = (b: Boite) => [b.x, b.y, b.l, b.h].every(Number.isFinite) && b.l > 0 && b.h > 0;
function lisibles(r: ResultatBaies | null): Baie[] {
  const liste: unknown = r?.baies;
  return Array.isArray(liste) ? (liste as (Baie | null | undefined)[]).filter((b): b is Baie => !!b && typeof b === 'object' && !!b.px && valide(b.px)) : [];
}

/** Un detecteur qui echoue s'abstient : le vote se fait entre les autres. */
function essayer(f: () => ResultatBaies): ResultatBaies | null {
  try {
    return f();
  } catch {
    return null;
  }
}

/**
 * Les grappes : les paires de boites en accord (detecteurs differents), du meilleur recouvrement au
 * moins bon ; deux grappes fusionnent si elles n'ont pas de detecteur en commun et si chaque boite
 * de l'une s'accorde avec chaque boite de l'autre, ou la contient (un vantail dans sa fenetre dans
 * son encadrement). Une grappe a donc une boite par detecteur au plus.
 */
function grapper(vues: Vue[]): Vue[][] {
  const paires: { v: number; i: number; j: number }[] = [];
  for (let i = 0; i < vues.length; i++) {
    const a = vues[i]!;
    for (let j = i + 1; j < vues.length; j++) {
      const b = vues[j]!;
      // Les vues sont triees de haut en bas : plus bas que `a`, plus rien ne la touche.
      if (b.y >= bas(a)) break;
      if (a.k !== b.k && sAccordent(a, b)) paires.push({ v: iou(a, b), i, j });
    }
  }
  // A recouvrement egal, le rang geometrique des boites tranche.
  paires.sort((p, q) => q.v - p.v || p.i - q.i || p.j - q.j);
  const de = vues.map((_, i) => i);
  const membres = vues.map((_, i) => [i]);
  const compatibles = (a: Vue, b: Vue) => a.k !== b.k && (sAccordent(a, b) || contenue(a, b) >= CONTENANCE);
  for (const p of paires) {
    const ga = de[p.i]!,
      gb = de[p.j]!;
    if (ga === gb) continue;
    const ma = membres[ga]!,
      mb = membres[gb]!;
    if (!ma.every((i) => mb.every((j) => compatibles(vues[i]!, vues[j]!)))) continue;
    for (const j of mb) de[j] = ga;
    ma.push(...mb);
    membres[gb] = [];
  }
  return membres.filter((m) => m.length).map((m) => m.sort((a, b) => a - b).map((i) => vues[i]!));
}

export function detecterBaies(img: Image, vu: Uint8Array | null, pxParM: number | null): ResultatBaies {
  const W = img.largeur,
    H = img.hauteur;
  // Une echelle nulle, negative ou infinie n'en est pas une, ni pour le vote ni pour les detecteurs.
  const echelle = pxParM !== null && Number.isFinite(pxParM) && pxParM > 0 ? pxParM : null;
  // L'ordre compte : le premier detecteur est celui dont les baies trouvees seul sont le mieux admises.
  const resultats = [essayer(() => parPropositions(img, vu, echelle)), essayer(() => parMailles(img, vu, echelle)), essayer(() => parTravees(img, vu, echelle))];
  const vues: Vue[] = [];
  resultats.forEach((r, k) => {
    // Rognees a l'image (une boite n'en sort pas) ; une boite rendue deux fois ne compte qu'une fois.
    let siennes: Vue[] = [];
    for (const b of lisibles(r)) {
      const p = b.px;
      const dedans = !(W > 0 && H > 0) || (p.x >= 0 && p.y >= 0 && droite(p) <= W && bas(p) <= H);
      const v = dedans ? { x: p.x, y: p.y, l: p.l, h: p.h, k } : { ...boite(Math.max(0, p.x), Math.max(0, p.y), Math.min(W, droite(p)), Math.min(H, bas(p))), k };
      if (v.l > 0 && v.h > 0) siennes.push(v);
    }
    siennes.sort(parPosition);
    siennes = siennes.filter((v, i) => i === 0 || parPosition(siennes[i - 1]!, v) !== 0);
    // Le temps du vote croit comme le carre du nombre de boites : au-dela, les plus grandes seulement.
    if (siennes.length > MAX_BOITES) siennes = siennes.sort((a, b) => aire(b) - aire(a) || parPosition(a, b)).slice(0, MAX_BOITES);
    vues.push(...siennes);
  });
  vues.sort((a, b) => parPosition(a, b) || a.k - b.k);

  // 1. Les grappes.
  const grappes = grapper(vues);
  const forte = (g: Vue[]) => g.some((p) => g.some((q) => p !== q && iou(p, q) >= ACCORD));
  const medianeDe = (g: Vue[]) => boite(mediane(g.map((q) => q.x)), mediane(g.map((q) => q.y)), mediane(g.map(droite)), mediane(g.map(bas)));
  /** Les baies sures de la facade : deux detecteurs au moins en accord fort. Elles donnent la taille des baies qui se repetent. */
  const sures = grappes.filter(forte).map((g) => (g.length === 2 ? horsTout(g[0]!, g[1]!) : medianeDe(g)));

  // 2. La boite de chaque grappe de deux voix au moins.
  let retenues: Retenue[] = [];
  // A trois voix, la mediane : deux detecteurs qui se trompent ensemble (le meme encadrement, la
  // meme imposte laissee dehors) l'emportent. Faire arbitrer par les baies semblables du rang a ete
  // essaye et retire (voir l'en-tete) : le gain ne tenait pas sur des images tenues a l'ecart.
  grappes.forEach((g) => {
    if (g.length < 2) return;
    let b = medianeDe(g);
    if (g.length === 2) {
      const [p, q] = [g[0]!, g[1]!];
      const grande = aire(p) >= aire(q) ? p : q,
        petite = grande === p ? q : p;
      const tout = horsTout(p, q);
      if (iou(p, q) >= ACCORD) b = tout;
      else {
        // Ce que le detecteur de la petite voit d'autre dans la grande. Une boite que du mur separe
        // de la petite : la grande reunit deux baies. Des boites accolees a la petite : ce sont
        // les parties d'un tout (deux vantaux et leur fenetre).
        const voisines = vues.filter((c) => c !== petite && c.k === petite.k && dans(c, grande) >= MORD);
        const separee = voisines.find((c) => mur([c, petite], recouvreY(c, petite) > 0 ? 'x' : 'y', TRUMEAU));
        if (separee) b = recouvreY(separee, petite) > 0 ? boite(petite.x, tout.y, droite(petite), bas(tout)) : boite(tout.x, petite.y, droite(tout), bas(petite));
        else if (voisines.length) b = tout;
        else {
          // La facade se repete : la grande a raison si elle seule a la taille d'une baie sure.
          // L'inverse ne prouve rien (un vantail a souvent la taille d'une fenetre etroite de la
          // meme facade) : la petite n'est jamais preferee sur cet indice ; sinon, a mi-chemin.
          if (sures.some((s) => memeTaille(grande, s)) && !sures.some((s) => memeTaille(petite, s))) b = grande;
        }
      }
    }
    if (b.l >= 2 && b.h >= 2) retenues.push({ px: boite(b.x, b.y, droite(b), bas(b)), voix: g.length, porte: false });
  });

  // 3. Le tout et ses parties, du plus grand au plus petit.
  for (const g of [...vues].sort((a, b) => aire(b) - aire(a) || parPosition(a, b) || a.k - b.k)) {
    if (retenues.some((r) => iou(r.px, g) >= ACCORD)) continue; // elle est deja retenue
    const reunies = retenues.filter((r) => dans(r.px, g) >= CONTENANCE);
    if (!reunies.length) continue;
    if (retenues.some((r) => !reunies.includes(r) && contenue(r.px, g) > CHEVAUCHEMENT)) continue; // elle mord sur une autre baie
    const morceaux = vues.filter((c) => c.k !== g.k && dans(c, g) >= CONTENANCE);
    // Plusieurs parties vues par un meme detecteur (sinon ce n'est qu'un desaccord de cadrage, regle en 2).
    if (![0, 1, 2].some((k) => morceaux.filter((c) => c.k === k).length >= 2)) continue;
    // Du mur entre les morceaux, ou entre les baies a reunir : ce sont des baies voisines, pas un tout.
    if (mur(morceaux, 'x', TRUMEAU) || mur(morceaux, 'y', TRUMEAU)) continue;
    const px = reunies.map((r) => r.px);
    if (reunies.length >= 2 && (mur(px, 'x', ENTRE_PANS) || mur(px, 'y', ENTRE_PANS))) continue;
    if (couverture(g, morceaux) < COUVERT) continue;
    retenues = retenues.filter((r) => !reunies.includes(r));
    retenues.push({ px: boite(g.x, g.y, droite(g), bas(g)), voix: new Set([g.k, ...morceaux.map((c) => c.k)]).size, porte: false });
  }
  // Une ouverture, une boite : une baie retenue dans une baie retenue plus grande que plus de
  // detecteurs voient en est une partie (un vantail, une imposte). A voix egales rien ne dit
  // laquelle a raison (la plus grande reunit aussi souvent deux fenetres) : les deux restent.
  const entieres = retenues;
  retenues = entieres.filter((r) => !entieres.some((t) => t !== r && t.voix > r.voix && aire(t.px) > aire(r.px) && dans(r.px, t.px) >= CONTENANCE));

  // 4. Les baies a une voix que la facade confirme.
  const votees = retenues.map((r) => r.px);
  const libre = (s: Boite) => !retenues.some((r) => contenue(r.px, s) > CHEVAUCHEMENT);
  const seules = grappes.filter((g) => g.length === 1).map((g) => g[0]!).filter(libre);
  for (const s of seules) {
    if (!libre(s)) continue;
    const repete = votees.some((t) => memeColonne(s, t) && memeTaille(s, t));
    const premier = s.k === 0 && votees.some((t) => memeColonne(s, t) || (memeRang(s, t) && memeTaille(s, t)));
    if (repete || premier) retenues.push({ px: boite(s.x, s.y, droite(s), bas(s)), voix: 1, porte: false });
  }

  // Les portes. Echelle connue : 1,80 m de haut au moins. Sinon, la structure : une baie qui
  // descend sous l'appui d'une baie de son rang (plus basse d'un quart de sa hauteur, plus haute
  // d'un quart), au rang le plus bas (aucune baie a trois voix entierement en dessous).
  const sousAppui = (b: Boite, autour: Retenue[]) =>
    autour.some((t) => t.px !== b && recouvreY(t.px, b) >= 0.5 * t.px.h && bas(b) - bas(t.px) >= 0.25 * b.h && b.h >= 1.25 * t.px.h) &&
    !autour.some((t) => t.px !== b && t.voix >= 3 && t.px.y >= bas(b) - 0.1 * b.h);
  // Une porte vue par un seul detecteur : debout sans etre une fente, son linteau au niveau de
  // celui d'une baie votee de son rang, sous l'appui de cette baie ; a l'echelle, une taille de porte.
  const voteesAvant = retenues.filter((r) => r.voix >= 2);
  for (const s of seules) {
    // Jamais du premier detecteur : ses boites debout sans accord sont des morceaux sous une fenetre.
    if (s.k === 0 || !libre(s) || s.h < DEBOUT * s.l || s.h > FENTE * s.l) continue;
    if (echelle && (s.h < H_PORTE_MIN * echelle || s.h > 2.8 * echelle || s.l < 0.6 * echelle)) continue;
    const linteau = voteesAvant.some((t) => recouvreY(t.px, s) >= 0.5 * t.px.h && Math.abs(s.y - t.px.y) <= ALIGNE * s.h && bas(s) - bas(t.px) >= 0.25 * s.h && s.h >= 1.25 * t.px.h);
    if (linteau && sousAppui(s, voteesAvant)) retenues.push({ px: boite(s.x, s.y, droite(s), bas(s)), voix: 1, porte: true });
  }

  // 5. Le sol : le bas de la plus basse des portes (les baies confirmees par la seule structure n'en decident pas).
  const lesPortes = (): Retenue[] => {
    const fiables = retenues.filter((r) => r.voix >= 2 || r.porte);
    const portes = fiables.filter((r) => (echelle ? r.px.h >= H_PORTE_MIN * echelle : sousAppui(r.px, fiables)));
    // Une porte a une voix ne situe pas le sol au-dessus d'une baie votee : rien ne s'ouvre sous le sol.
    return portes.filter((p) => !(p.porte && retenues.some((t) => t.voix >= 2 && t.px.y >= bas(p.px))));
  };
  const laPlusBasse = (portes: Retenue[]) => portes.reduce<Retenue | null>((a, p) => (a && bas(a.px) >= bas(p.px) ? a : p), null);
  const portes = lesPortes();
  let seuil = laPlusBasse(portes);

  // 6. Au niveau du sol, une baie est une porte.
  let fond = Infinity;
  if (seuil) {
    const sol = bas(seuil.px),
      hp = seuil.px.h;
    // Trois voix epargnent une baie basse (une vitrine, un soupirail, une fenetre d'allege basse :
    // couchees ou carrees), pas une baie debout : au sol, ce qui est debout sans la hauteur d'une
    // porte est un vide entre deux barreaux, que les trois detecteurs voient pareil. Une baie qui
    // est elle-meme une porte (regle 5) n'est jamais ecartee, si haute que soit celle du sol.
    const epargnee = (r: Retenue) => (r.voix >= 3 && r.px.h < DEBOUT * r.px.l) || portes.includes(r);
    retenues = retenues.filter((r) => epargnee(r) || r.px.h >= PAS_UNE_PORTE * hp || bas(r.px) < sol - SEUIL_HAUT * hp || bas(r.px) > sol + SEUIL_BAS * hp);
    fond = sol + SEUIL_HAUT * hp;
  }

  // 7. Les morceaux au-dessus ou au-dessous d'une baie retenue ; pas plus bas que le sol (a la
  // tolerance du seuil pres), ni sur une autre baie.
  const restes = vues.filter(libre);
  for (const r of [...retenues].sort((a, b) => parPosition(a.px, b.px))) {
    for (const s of restes) {
      const R = r.px;
      if (s.h > R.h || s.l < 0.3 * R.l || s.x < R.x - ALIGNE * R.l || droite(s) > droite(R) + ALIGNE * R.l) continue;
      const ecart = -recouvreY(s, R);
      if (ecart > LISSE * R.h || ecart < -0.15 * s.h) continue;
      const prolongee = boite(R.x, Math.min(R.y, s.y), droite(R), Math.max(bas(R), bas(s)));
      if (bas(prolongee) > bas(R) && bas(prolongee) > fond) continue;
      if (retenues.some((t) => t !== r && intersection(t.px, prolongee) > 0.1 * aire(t.px))) continue;
      r.px = prolongee;
    }
  }
  seuil = laPlusBasse(lesPortes()); // une porte a pu etre prolongee, une baie prolongee en devenir une
  // Un sol que le resultat contredit n'est pas annonce : une baie a deux voix tout entiere dessous,
  // et la « porte » n'en etait pas une (ni son bas le sol, ni sa hauteur 2,10 m).
  if (seuil) {
    const y = bas(seuil.px);
    if (retenues.some((r) => r.voix >= 2 && r.px.y >= y)) seuil = null;
  }
  const sol = seuil ? bas(seuil.px) : null;

  // L'echelle : celle de l'utilisateur ; sinon la porte qui situe le sol fait 2,10 m ; sinon la
  // mediane de ce que les detecteurs ont estime ; sinon 12 m dans la largeur de l'image.
  let s0 = echelle ?? 0;
  if (!s0 && seuil) s0 = seuil.px.h / H_PORTE;
  if (!s0) {
    // La mediane sur toutes ses baies, pas la premiere venue : chaque cote est arrondie au centimetre.
    const estimees: number[] = [];
    for (const r of resultats) {
      const e = lisibles(r)
        .filter((q) => Number.isFinite(q.l) && q.l > 0)
        .map((q) => q.px.l / q.l);
      if (e.length) estimees.push(mediane(e));
    }
    if (estimees.length) s0 = mediane(estimees);
  }
  if (!(s0 > 0) || !Number.isFinite(s0)) s0 = W / 12;

  // L'ordre : rang par rang en partant du bas, de gauche a droite. Un rang : les baies qui
  // recouvrent en hauteur la premiere du rang (la plus basse) sur la moitie de la plus petite des deux.
  const rangs: Retenue[][] = [];
  for (const r of [...retenues].sort((a, b) => b.px.y + b.px.h / 2 - (a.px.y + a.px.h / 2) || parPosition(a.px, b.px))) {
    const rang = rangs.find((q) => recouvreY(q[0]!.px, r.px) > 0.5 * Math.min(q[0]!.px.h, r.px.h));
    if (rang) rang.push(r);
    else rangs.push([r]);
  }
  const r2 = (v: number) => Math.round(v * 100) / 100;
  const baies: Baie[] = rangs
    .flatMap((q) => q.sort((a, b) => a.px.x - b.px.x || parPosition(a.px, b.px)))
    .map((r) => {
      const y = Math.max(0, ((sol ?? H) - bas(r.px)) / s0),
        l = r.px.l / s0,
        h = r.px.h / s0;
      return { type: sol !== null ? classer(y, l, h) : 'fenetre', x: r2(r.px.x / s0), y: r2(y), l: r2(l), h: r2(h), carreaux: r.voix, px: r.px } satisfies Baie;
    });
  return { baies, solTrouve: sol !== null, solPx: sol, echelleConnue: echelle !== null };
}

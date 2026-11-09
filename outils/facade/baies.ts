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
// Le vote : deux boites s'accordent si elles se recouvrent assez (IoU >= 0,5), ou si l'une contient
// presque toute l'autre (un vantail et sa fenetre). Une baie est retenue quand deux detecteurs au
// moins s'accordent ; sa boite est alors la mediane de leurs bords. S'y ajoutent les baies que le
// premier detecteur trouve seul, la ou rien d'autre n'a ete retenu : c'est lui qui se trompe le
// moins quand il est seul.
//
// Mesure sur le banc (outils/facade/banc/, note de 0 a 1) : le detecteur d'avant 0,34 ; chacun des
// trois seul 0,76 a 0,78 ; le vote 0,86. Sur un jeu tenu a l'ecart pendant la mise au point (autres
// facades, miroir, demi-resolution, image assombrie) : 0,36, puis 0,71 a 0,73, puis 0,80.
//
// La boite rendue est le hors-tout de la menuiserie (cadre compris). Le type suit la regle de Plan
// (`classer`) une fois le sol situe : le bas de la plus basse des portes. C'est une proposition : la
// page permet d'ajouter, recadrer, retirer une baie et d'en changer le type.

import type { Image } from './auto.js';
import { classer, type TypeOuverture } from '../../src/facade/detection.js';
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
  /** Nombre de detecteurs d'accord sur cette baie (1 a 3). */
  carreaux: number;
  /** En pixels de l'image, pour la dessiner : le hors-tout de la menuiserie. */
  px: { x: number; y: number; l: number; h: number };
}

export interface ResultatBaies {
  baies: Baie[];
  /** Le sol a-t-il ete situe (une porte trouvee) ? Sinon, les hauteurs partent du bas de l'image. */
  solTrouve: boolean;
  /** Le sol, en pixels de l'image (y), s'il a ete situe. */
  solPx: number | null;
  /** L'echelle etait-elle connue ? Sinon, elle est estimee par les detecteurs (ou 12 m dans la largeur). */
  echelleConnue: boolean;
}

type Boite = Baie['px'];

/** Deux boites s'accordent a partir de ce recouvrement (intersection sur union). */
const ACCORD = 0.5;
/** ... ou quand l'une contient cette part de l'autre (un vantail et sa fenetre), sans etre minuscule devant elle. */
const CONTENANCE = 0.85,
  ACCORD_CONTENU = 0.25;
/** Une baie trouvee par un seul detecteur est ecartee si elle mord a ce point sur une baie retenue. */
const CHEVAUCHEMENT = 0.3;

const aire = (b: Boite) => Math.max(0, b.l) * Math.max(0, b.h);
function intersection(a: Boite, b: Boite): number {
  const x0 = Math.max(a.x, b.x),
    y0 = Math.max(a.y, b.y),
    x1 = Math.min(a.x + a.l, b.x + b.l),
    y1 = Math.min(a.y + a.h, b.y + b.h);
  return x1 > x0 && y1 > y0 ? (x1 - x0) * (y1 - y0) : 0;
}
const iou = (a: Boite, b: Boite) => {
  const i = intersection(a, b);
  return i / (aire(a) + aire(b) - i || 1);
};
/** Part de la plus petite des deux boites qui est dans l'autre. */
const contenue = (a: Boite, b: Boite) => intersection(a, b) / (Math.min(aire(a), aire(b)) || 1);
const sAccordent = (a: Boite, b: Boite) => {
  const v = iou(a, b);
  return v >= ACCORD || (v >= ACCORD_CONTENU && contenue(a, b) >= CONTENANCE);
};

function mediane(t: number[]): number {
  const u = [...t].sort((a, b) => a - b);
  const m = u.length >> 1;
  return u.length % 2 ? u[m]! : (u[m - 1]! + u[m]!) / 2;
}

/** Un detecteur qui echoue s'abstient : le vote se fait entre les autres. */
function essayer(f: () => ResultatBaies): ResultatBaies | null {
  try {
    return f();
  } catch {
    return null;
  }
}

export function detecterBaies(img: Image, vu: Uint8Array | null, pxParM: number | null): ResultatBaies {
  const W = img.largeur,
    H = img.hauteur;
  // L'ordre compte : le premier detecteur est celui dont les baies trouvees seul sont gardees.
  const resultats = [essayer(() => parPropositions(img, vu, pxParM)), essayer(() => parMailles(img, vu, pxParM)), essayer(() => parTravees(img, vu, pxParM))];
  const valide = (b: Boite) => [b.x, b.y, b.l, b.h].every(Number.isFinite) && b.l > 0 && b.h > 0;

  // Les grappes : chaque boite rejoint la premiere grappe avec laquelle elle s'accorde.
  const grappes: { tete: Boite; membres: Boite[]; voix: Set<number> }[] = [];
  resultats.forEach((r, k) => {
    for (const b of r?.baies ?? []) {
      if (!valide(b.px)) continue;
      const g = grappes.find((q) => sAccordent(q.tete, b.px));
      if (g) {
        g.membres.push(b.px);
        g.voix.add(k);
      } else grappes.push({ tete: b.px, membres: [b.px], voix: new Set([k]) });
    }
  });

  const retenues: { px: Boite; voix: number }[] = [];
  for (const g of grappes) {
    if (g.voix.size < 2) continue;
    const x0 = mediane(g.membres.map((m) => m.x)),
      y0 = mediane(g.membres.map((m) => m.y)),
      x1 = mediane(g.membres.map((m) => m.x + m.l)),
      y1 = mediane(g.membres.map((m) => m.y + m.h));
    if (x1 - x0 >= 2 && y1 - y0 >= 2) retenues.push({ px: { x: x0, y: y0, l: x1 - x0, h: y1 - y0 }, voix: g.voix.size });
  }
  for (const g of grappes) {
    if (g.voix.size !== 1 || !g.voix.has(0)) continue;
    if (!retenues.some((r) => contenue(r.px, g.tete) > CHEVAUCHEMENT)) retenues.push({ px: g.tete, voix: 1 });
  }

  // L'echelle : celle de l'utilisateur ; sinon celle que les detecteurs ont estimee sur la
  // structure (mediane de leurs pixels par metre) ; sinon 12 m dans la largeur de l'image.
  let s0 = pxParM && pxParM > 0 ? pxParM : 0;
  if (!s0) {
    const estimees: number[] = [];
    for (const r of resultats) for (const b of r?.baies ?? []) if (b.l > 0 && valide(b.px)) estimees.push(b.px.l / b.l);
    s0 = estimees.length ? mediane(estimees) : W / 12;
    if (!(s0 > 0) || !Number.isFinite(s0)) s0 = W / 12;
  }

  // Le sol : le bas de la plus basse des baies, si c'est une porte (1,80 m de haut au moins).
  const bas = (r: { px: Boite }) => r.px.y + r.px.h;
  const portes = retenues.filter((r) => r.px.h / s0 >= 1.8);
  const plusBas = retenues.length ? Math.max(...retenues.map(bas)) : null;
  const solTrouve = plusBas !== null && portes.some((p) => Math.abs(bas(p) - plusBas) < 0.25 * s0);
  const sol = solTrouve ? plusBas! : H;
  const r2 = (v: number) => Math.round(v * 100) / 100;
  const baies: Baie[] = retenues
    .map((r) => {
      const y = Math.max(0, (sol - bas(r)) / s0),
        l = r.px.l / s0,
        h = r.px.h / s0;
      return { type: solTrouve ? classer(y, l, h) : 'fenetre', x: r2(r.px.x / s0), y: r2(y), l: r2(l), h: r2(h), carreaux: r.voix, px: r.px } satisfies Baie;
    })
    // Etage par etage en partant du bas, de gauche a droite.
    .sort((a, b) => Math.round(a.y * 2) - Math.round(b.y * 2) || a.x - b.x);
  return { baies, solTrouve, solPx: solTrouve ? sol : null, echelleConnue: !!(pxParM && pxParM > 0) };
}

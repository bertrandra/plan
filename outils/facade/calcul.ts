// Calcul de facade.html : la chaine de calibration du releve de facade de Plan (src/facade/),
// rejouee hors de l'application, puis un rendu a la resolution de la photo.
//
// La chaine elle-meme n'est pas recopiee : elle est importee de src/facade/ et embarquee au build
// (outils/facade/construire.mjs). Ce qui est propre a l'outil :
//   - le calage (hauteur du mur, largeur et place de chaque morceau) se fait sur des apercus,
//     comme dans Plan, a une centaine de pixels par metre : c'est assez pour la correlation et
//     rapide sur un telephone ;
//   - le rendu final, lui, va chercher chaque pixel sur la photo d'origine, a la resolution
//     native : Plan borne sa texture a 1 024 px parce que le projet la porte, l'outil non.
//
// Pas de DOM ici : tout se teste sous Node (outils/facade/verifier.ts).

import { homographie, appliquer, redresser, rapportRectangle, type Image, type P2, type Homographie } from '../../src/facade/homographie.js';
import { decalage } from '../../src/facade/mosaique.js';
import { mesurerHauteur, hauteurBande, HAUTEUR_MIN, HAUTEUR_MAX } from '../../src/facade/analyse.js';

export { hauteurBande };
export type { Image, P2 };

/** Un morceau du mur sur l'apercu d'une photo : coins haut gauche, haut droit, bas droit, bas gauche. */
export interface Morceau {
  apercu: Image;
  coins: P2[];
  /** Focale de l'apercu, en pixels. */
  focale: number;
}

export interface EntreeCalage {
  morceaux: Morceau[];
  /** Largeur du mur, connue (mesuree au metre) : c'est elle qui met tout a l'echelle. */
  largeur: number;
  /** Hauteur du mur a l'egout si on la connait : elle n'est alors plus mesuree. */
  hauteurConnue: number | null;
}

export interface Calage {
  /** Hauteur du mur, du pied a l'egout, en metres. */
  hauteur: number;
  /** D'ou vient la hauteur. */
  sourceHauteur: 'mesuree' | 'saisie' | 'apparente';
  /** Largeur de chaque morceau et sa place depuis la gauche, en metres, avant recalage. */
  largeurs: number[];
  positions: number[];
  /** Etirement horizontal qui ramene l'assemblage a la largeur connue (1 pour une photo). */
  etirement: number;
  /** Ressemblance de chaque jointure, de -1 a 1. */
  jointures: number[];
}

const d2 = (a: P2, b: P2) => Math.hypot(b.x - a.x, b.y - a.y);
const c = (t: readonly P2[], i: number): P2 => {
  const p = t[i];
  if (!p) throw new RangeError('coin ' + i);
  return p;
};

/** Rapport largeur / hauteur apparent : le repli sans focale (le meme que src/facade/mosaique.ts). */
function rapportApparent(k: readonly P2[]): number {
  const larg = (d2(c(k, 0), c(k, 1)) + d2(c(k, 3), c(k, 2))) / 2;
  const haut = (d2(c(k, 0), c(k, 3)) + d2(c(k, 1), c(k, 2))) / 2;
  return haut > 0 ? larg / haut : 1;
}

/** Rapport largeur / hauteur reel d'un morceau, par la perspective quand la focale le permet. */
export function rapportMorceau(m: Morceau): number {
  return rapportRectangle(m.coins, m.focale, m.apercu.largeur / 2, m.apercu.hauteur / 2) ?? rapportApparent(m.coins);
}

/** Homographie du rectangle du morceau (metres, origine en haut a gauche) vers ses coins. */
function versPhoto(largeur: number, hauteur: number, coins: readonly P2[]): Homographie | null {
  return homographie(
    [
      { x: 0, y: 0 },
      { x: largeur, y: 0 },
      { x: largeur, y: hauteur },
      { x: 0, y: hauteur },
    ],
    coins,
  );
}

/** Place de chaque morceau pour une hauteur supposee : redresse a basse resolution et correle. */
function placer(morceaux: Morceau[], hauteur: number): { largeurs: number[]; positions: number[]; jointures: number[] } | null {
  const largeurs = morceaux.map((m) => hauteur * rapportMorceau(m));
  // Assez fin pour la correlation (decalage affine au pixel), assez leger pour un telephone.
  const px = Math.min(100, 1600 / Math.max(hauteur, ...largeurs));
  const bandes: { image: Image; vu: Uint8Array }[] = [];
  for (let k = 0; k < morceaux.length; k++) {
    const m = morceaux[k]!;
    const r = redresser(m.apercu, m.coins, largeurs[k]!, hauteur, px);
    if (!r) return null;
    bandes.push({ image: r.image, vu: r.vu });
  }
  const positions = [0];
  const jointures: number[] = [];
  for (let k = 1; k < bandes.length; k++) {
    const { dx, score } = decalage(bandes[k - 1]!, bandes[k]!, 0, px);
    positions.push(positions[k - 1]! + dx / px);
    jointures.push(score);
  }
  return { largeurs, positions, jointures };
}

/**
 * Le calage : la hauteur du mur et la place de chaque morceau. Une photo : la perspective de ses
 * quatre coins donne la hauteur (`mesurerHauteur`). Plusieurs : une premiere passe a une hauteur
 * supposee donne la largeur de l'assemblage, proportionnelle a cette hauteur ; le rapport a la
 * largeur connue donne la hauteur, et une seconde passe s'y recale (spec-releve-facade §6.1).
 */
export function caler(e: EntreeCalage): Calage | null {
  const { morceaux, largeur } = e;
  if (!morceaux.length || !(largeur > 0)) return null;
  if (morceaux.length === 1) {
    const m = morceaux[0]!;
    let hauteur = e.hauteurConnue;
    let sourceHauteur: Calage['sourceHauteur'] = 'saisie';
    if (!hauteur) {
      const h = mesurerHauteur(m.coins, largeur, m.focale, m.apercu.largeur, m.apercu.hauteur);
      if (h) {
        hauteur = h;
        sourceHauteur = 'mesuree';
      } else {
        hauteur = largeur / rapportApparent(m.coins);
        sourceHauteur = 'apparente';
      }
    }
    return { hauteur, sourceHauteur, largeurs: [largeur], positions: [0], etirement: 1, jointures: [] };
  }
  const total = (p: { largeurs: number[]; positions: number[] }) => p.positions[p.positions.length - 1]! + p.largeurs[p.largeurs.length - 1]!;
  let hauteur = e.hauteurConnue ?? 3;
  let sourceHauteur: Calage['sourceHauteur'] = e.hauteurConnue ? 'saisie' : 'mesuree';
  let passe = placer(morceaux, hauteur);
  if (!passe) return null;
  if (!e.hauteurConnue) {
    const mesuree = (hauteur * largeur) / total(passe);
    if (mesuree >= HAUTEUR_MIN && mesuree <= HAUTEUR_MAX) {
      hauteur = Math.round(mesuree * 100) / 100;
      passe = placer(morceaux, hauteur) ?? passe;
    } else sourceHauteur = 'apparente';
  }
  return { hauteur, sourceHauteur, ...passe, etirement: largeur / total(passe) };
}

/** Resolution native : les pixels de la photo d'origine par metre de mur, au mieux des morceaux. */
export function resolutionNative(cal: Calage, coinsPleins: P2[][]): number {
  let best = 0;
  coinsPleins.forEach((k, i) => {
    const w = cal.largeurs[i]! * cal.etirement;
    const vertical = (d2(c(k, 0), c(k, 3)) + d2(c(k, 1), c(k, 2))) / 2 / cal.hauteur;
    const horizontal = (d2(c(k, 0), c(k, 1)) + d2(c(k, 3), c(k, 2))) / 2 / w;
    best = Math.max(best, Math.sqrt(vertical * horizontal));
  });
  return best;
}

/** Marges autour du mur, en metres : au-dessus de l'egout (pignon, toit), sur les cotes, sous le pied. */
export interface Marges {
  haut: number;
  cotes: number;
  bas: number;
}

/** Une source pleine resolution : les pixels d'une region de la photo, et ou elle commence. */
export interface Source {
  image: Image;
  /** Coin haut gauche de la region dans la photo d'origine, et facteur photo -> source. */
  ox: number;
  oy: number;
  k: number;
}

/** Taille de l'image produite, en pixels. */
export function tailleSortie(largeur: number, cal: Calage, marges: Marges, px: number): { l: number; h: number } {
  return { l: Math.max(1, Math.round((largeur + 2 * marges.cotes) * px)), h: Math.max(1, Math.round((marges.haut + cal.hauteur + marges.bas) * px)) };
}

/**
 * Ce que chaque morceau couvre de la sortie, en metres de mur non etire : de quoi ne decoder que
 * la region utile de chaque photo. Coins dans le repere de la photo d'origine.
 */
export function regionUtile(cal: Calage, marges: Marges, i: number, coinsPleins: P2[], largeurPhoto: number, hauteurPhoto: number) {
  const n = cal.largeurs.length;
  const w = cal.largeurs[i]!;
  const H = versPhoto(w, cal.hauteur, coinsPleins);
  if (!H) return null;
  const g = i === 0 ? -marges.cotes / cal.etirement : 0;
  const dr = i === n - 1 ? w + marges.cotes / cal.etirement : w;
  const pts = [
    { x: g, y: -marges.haut },
    { x: dr, y: -marges.haut },
    { x: dr, y: cal.hauteur + marges.bas },
    { x: g, y: cal.hauteur + marges.bas },
  ].map((q) => appliquer(H, q));
  // Un point derriere l'appareil (marge trop grande) se projette n'importe ou : on prend la photo.
  if (pts.some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.y))) return { x0: 0, y0: 0, x1: largeurPhoto, y1: hauteurPhoto };
  const x0 = Math.max(0, Math.floor(Math.min(...pts.map((p) => p.x)) - 2));
  const y0 = Math.max(0, Math.floor(Math.min(...pts.map((p) => p.y)) - 2));
  const x1 = Math.min(largeurPhoto, Math.ceil(Math.max(...pts.map((p) => p.x)) + 2));
  const y1 = Math.min(hauteurPhoto, Math.ceil(Math.max(...pts.map((p) => p.y)) + 2));
  if (x1 <= x0 || y1 <= y0) return null;
  return { x0, y0, x1, y1 };
}

/**
 * Le rendu : chaque pixel de la sortie va chercher son point sur chaque photo qui le voit
 * (bilineaire), et les recouvrements se fondent - chaque morceau pese d'autant plus qu'on
 * s'eloigne de son bord, comme dans Plan. Ce qu'aucune photo n'a vu reste transparent.
 *
 * `lignes` permet de rendre par tranches (et de rendre la main au navigateur entre deux).
 */
export function preparerRendu(largeur: number, cal: Calage, marges: Marges, px: number, coinsPleins: P2[][], sources: Source[]) {
  const { l: L, h: Hh } = tailleSortie(largeur, cal, marges, px);
  const n = cal.largeurs.length;
  const H = cal.largeurs.map((w, i) => versPhoto(w, cal.hauteur, coinsPleins[i]!));
  const sortie = new Uint8ClampedArray(L * Hh * 4);
  const acc = [0, 0, 0];

  function echantillon(s: Source, X: number, Y: number): boolean {
    const x = (X - s.ox) * s.k - 0.5,
      y = (Y - s.oy) * s.k - 0.5;
    const im = s.image;
    if (x < -0.5 || y < -0.5 || x > im.largeur - 0.5 || y > im.hauteur - 0.5) return false;
    const x0 = Math.max(0, Math.min(im.largeur - 1, Math.floor(x)));
    const y0 = Math.max(0, Math.min(im.hauteur - 1, Math.floor(y)));
    const x1 = Math.min(im.largeur - 1, x0 + 1),
      y1 = Math.min(im.hauteur - 1, y0 + 1);
    const fx = Math.max(0, Math.min(1, x - x0)),
      fy = Math.max(0, Math.min(1, y - y0));
    const d = im.donnees,
      W = im.largeur;
    const a = (y0 * W + x0) * 4,
      b = (y0 * W + x1) * 4,
      e = (y1 * W + x0) * 4,
      f = (y1 * W + x1) * 4;
    for (let q = 0; q < 3; q++) {
      const haut = d[a + q]! * (1 - fx) + d[b + q]! * fx;
      const bas = d[e + q]! * (1 - fx) + d[f + q]! * fx;
      acc[q] = haut * (1 - fy) + bas * fy;
    }
    return true;
  }

  function lignes(y0: number, y1: number) {
    for (let Y = y0; Y < Math.min(y1, Hh); Y++) {
      const v = (Y + 0.5) / px - marges.haut;
      for (let X = 0; X < L; X++) {
        // Metres le long du mur, puis dans le repere non etire de l'assemblage.
        const u = ((X + 0.5) / px - marges.cotes) / cal.etirement;
        let sr = 0,
          sg = 0,
          sb = 0,
          sw = 0;
        for (let i = 0; i < n; i++) {
          const Hi = H[i];
          if (!Hi) continue;
          const w = cal.largeurs[i]!;
          const xl = u - cal.positions[i]!;
          const premier = i === 0,
            dernier = i === n - 1;
          if ((!premier && xl < 0) || (!dernier && xl > w)) continue;
          const p = appliquer(Hi, { x: xl, y: v });
          if (!(Number.isFinite(p.x) && Number.isFinite(p.y))) continue;
          // Le point doit etre devant l'appareil : le denominateur de l'homographie garde son signe.
          const den = Hi[6] * xl + Hi[7] * v + Hi[8];
          const den0 = Hi[6] * (w / 2) + Hi[7] * (cal.hauteur / 2) + Hi[8];
          if (den * den0 <= 0) continue;
          if (!echantillon(sources[i]!, p.x, p.y)) continue;
          const poids = n === 1 ? 1 : Math.max(1e-3, Math.min(premier ? Infinity : xl, dernier ? Infinity : w - xl));
          sr += acc[0]! * poids;
          sg += acc[1]! * poids;
          sb += acc[2]! * poids;
          sw += poids;
        }
        if (sw <= 0) continue;
        const o = (Y * L + X) * 4;
        sortie[o] = sr / sw;
        sortie[o + 1] = sg / sw;
        sortie[o + 2] = sb / sw;
        sortie[o + 3] = 255;
      }
    }
  }
  return { largeur: L, hauteur: Hh, sortie, lignes };
}

// L'analyse d'un mur depuis ses photos calees : la seule entree des trois chaines (une photo, des morceaux cote a cote, des vues
// du mur entier). Le releve de facade (zones/releve/analyse.ts), l'audit de la parcelle (app/audit/parcelle/mesures.ts) et la
// calibration (facade/corpusReel.ts) passent tous par elle : ce que l'un redresse, fusionne et cote, les autres le redressent,
// le fusionnent et le cotent de meme.

import { analyserReleve, finaliserReleve, hauteurBande, mesurerHauteur, silhouetteEnPartsDuMur, type EntreeAnalyse, type ResultatAnalyse } from './analyse.js';
import { mosaiqueDesVues, vuesDeFace } from './mosaiqueFuites.js';
import { inverser, redresserParReperes } from './redressementFuites.js';
import { appliquerSimilitude } from './ransac.js';
import { appliquer, homographie, redresser, resolutionTexture } from './homographie.js';
import type { GabaritMur } from './gabaritMur.js';
import { analyserMosaique, type ResultatMosaique } from './mosaique.js';
import { analyserVues, type ResultatFusion } from './fusion.js';
import { CHAMP_GRAND_COTE_DEFAUT, focalePx } from './cadrage.js';
import type { Decrochement } from './profil.js';
import type { Image, P2 } from './homographie.js';

/** Comment plusieurs photos d'un mur se combinent : des morceaux cote a cote, ou des vues du mur entier a fondre. */
export type AssemblageMur = 'morceaux' | 'vues';

/** Une photo calee : l'image, les quatre coins du mur (hg, hd, bd, bg) et la focale quand on la connait. */
export interface PhotoDuMur {
  photo: Image;
  coins: P2[];
  focalePx: number | null;
  /** Mur a deux hauteurs d'egout : le decrochement pose sur la photo (une photo seule). */
  decrochement?: Decrochement | null;
  /** La silhouette du haut du mur sur la photo (ajustee a la main, ou lue entre ses coins) : elle dit le toit quand elle a une forme. */
  silhouette?: P2[] | null;
  /** Quatre reperes poses a la main (un rectangle du mur) : ils redressent la photo entiere avant l'assemblage. */
  reperes?: P2[] | null;
}

/** Ce que le mur donne a toutes les photos : sa largeur (le plan), sa hauteur estimee, le batiment et la distance. */
export type MurAnalyse = Pick<EntreeAnalyse, 'largeur' | 'hauteur' | 'contour' | 'cote' | 'distance'>;

/** L'analyse, et selon l'assemblage, ce que la fusion ou la mosaique en disent. */
export interface AnalyseMur {
  r: ResultatAnalyse;
  /** L'assemblage d'ou vient l'analyse (une photo seule, ou des vues du mur entier) ; absent : la fusion, les morceaux. */
  assemblage?: AssemblageDuMur;
  fusion?: ResultatFusion;
  mosaique?: ResultatMosaique;
}

/**
 * Analyse un mur : une photo, c'est le mur entier entre ses coins ; plusieurs, des vues a fondre (`vues`) ou des morceaux a
 * assembler (`morceaux`). Null quand rien ne se redresse.
 */
export function analyserLeMur(murSeul: MurAnalyse, photos: readonly PhotoDuMur[], assemblage: AssemblageMur = 'morceaux'): AnalyseMur | null {
  const p0 = photos[0];
  if (!p0) return null;
  // La silhouette du haut du mur, en parts du mur, depuis la premiere photo qui en a une : chaque photo ramene le meme mur au meme
  // rectangle, la silhouette vaut pour la fusion comme pour la photo seule.
  const avec = photos.find((p) => p.silhouette && p.silhouette.length >= 2);
  const mur = { ...murSeul, silhouette: avec ? silhouetteEnPartsDuMur(avec.coins, avec.silhouette) : null };
  // Une photo seule, ou des vues du mur entier : l'assemblage des photos redressees entieres est l'image prise pour la suite
  // (decision de l'utilisateur, 21 octobre 2026). Un mur a deux hauteurs d'egout garde son analyse a lui.
  if ((photos.length === 1 || assemblage === 'vues') && !p0.decrochement) {
    const a = assemblerLeMur(photos);
    // La hauteur se mesure sur la premiere photo dont la focale le permet ; l'estimation du plan sert de repli.
    const mesuree = photos.map((p) => (p.focalePx ? mesurerHauteur(p.coins, mur.largeur, p.focalePx, p.photo.largeur, p.photo.hauteur) : null)).find((h) => h !== null) ?? null;
    // Une photo seule : son assemblage et la photo elle-meme sont le meme plan, le mur pose par les memes coins. L'analyse la
    // redresse en une passe depuis la photo d'origine, plutot que depuis l'assemblage deja reechantillonne (une de moins, la
    // nettete des baies vues de biais) ; l'assemblage reste ce qui est montre et rendu.
    const source = a && photos.length === 1 ? photoCommeAssemblage(p0) : a;
    const r = source ? analyserLAssemblage({ ...mur, hauteur: mesuree ?? mur.hauteur }, source, mur.silhouette, mesuree !== null) : null;
    if (r && a) {
      const fusion = fondreLesVues(mur, photos, a, mur.silhouette);
      return fusion ? { r: fusion, assemblage: a, fusion } : { r, assemblage: a };
    }
  }
  if (photos.length > 1 && assemblage === 'vues') {
    const r = analyserVues({ ...mur, vues: photos.map((p) => ({ photo: p.photo, coins: p.coins, focalePx: p.focalePx })) });
    return r ? { r, fusion: r } : null;
  }
  if (photos.length === 1) {
    const r = analyserReleve({ ...mur, photo: p0.photo, coins: p0.coins, focalePx: p0.focalePx, decrochement: p0.decrochement ?? null });
    return r ? { r } : null;
  }
  // Des morceaux se mettent a l'echelle par leur focale : inconnue, celle du champ d'un telephone.
  const r = analyserMosaique({ ...mur, morceaux: photos.map((p) => ({ photo: p.photo, coins: p.coins, focalePx: p.focalePx ?? focalePx(p.photo.largeur, p.photo.hauteur, CHAMP_GRAND_COTE_DEFAUT) })) });
  return r ? { r, mosaique: r } : null;
}

/** L'assemblage des photos d'un mur, redressees entieres, et le mur pose dessus (ses coins, en pixels de l'assemblage). */
export interface AssemblageDuMur {
  image: Image;
  /** Les pixels que montre au moins une photo (1), le reste hors champ (0). */
  vu: Uint8Array;
  /** Les coins du mur sur l'assemblage : haut gauche, haut droit, bas droit, bas gauche (l'egout en haut). */
  coins: P2[];
  /** Par photo : est-elle dans l'assemblage, et sinon pourquoi. */
  vues: { assemblee: boolean; motif: string | null }[];
}

/**
 * L'assemblage d'un mur (decision de l'utilisateur, 21 octobre 2026 : c'est l'image prise pour la suite) : chaque photo redressee
 * entiere (ses reperes, sinon ses points de fuite), les vues assemblees en une seule (facade/mosaiqueFuites.ts), et le mur porte de
 * la premiere photo assemblee qui en a les coins. Null quand aucune photo ne s'assemble avec ses coins.
 */
export function assemblerLeMur(photos: readonly { photo: Image; coins: readonly P2[]; reperes?: readonly P2[] | null }[]): AssemblageDuMur | null {
  // Une photo sans reperes qui ne se redresse pas par ses points de fuite se redresse par ses coins : un rectangle du mur, eux aussi.
  const vues = vuesDeFace(photos.map((p) => p.photo), photos.map((p) => p.reperes ?? null))
    .map((v, i) => v ?? (photos[i]?.coins.length === 4 ? redresserParReperes((photos[i] as { photo: Image }).photo, (photos[i] as { coins: readonly P2[] }).coins) : null));
  const rangs = vues.map((v, i) => (v ? i : -1)).filter((i) => i >= 0);
  const m = rangs.length ? mosaiqueDesVues(rangs.map((i) => vues[i] as NonNullable<(typeof vues)[number]>)) : null;
  if (!m) return null;
  let coins: P2[] | null = null;
  for (const [k, i] of rangs.entries()) {
    const v = vues[i], place = m.places[k], c = photos[i]?.coins, inv = v ? inverser(v.versPhoto) : null;
    if (!place || !inv || c?.length !== 4) continue;
    coins = c.map((q) => appliquerSimilitude(place, appliquer(inv, q)));
    break;
  }
  if (!coins) return null;
  const aPart = new Map(m.groupes.aPart.map((a) => [rangs[a.vue] as number, a.motif]));
  return {
    image: m.image, vu: m.vu, coins,
    vues: photos.map((_, i) => (!vues[i] ? { assemblee: false, motif: 'pas assez de verticales pour redresser la photo' } : aPart.has(i) ? { assemblee: false, motif: aPart.get(i) ?? null } : { assemblee: true, motif: null })),
  };
}

/**
 * Le releve tire de l'assemblage : le mur entre ses coins, et la bande au-dessus de l'egout, redresses a l'echelle du plan dans le
 * meme plan (un pignon y est entier), ce que l'assemblage ne montre pas laisse hors champ. Le gabarit du mur dit le toit quand il a
 * une forme. Null quand les coins ne forment pas un mur.
 */
export function analyserLAssemblage(mur: MurAnalyse, a: AssemblageDuMur, gabarit: GabaritMur | null = null, hauteurMesuree = false): ResultatAnalyse | null {
  const { largeur: L, hauteur: H } = mur;
  const versAssemblage = homographie([{ x: 0, y: 0 }, { x: L, y: 0 }, { x: L, y: H }, { x: 0, y: H }], a.coins);
  if (!versAssemblage) return null;
  const E = hauteurBande(L);
  const etendus = [{ x: 0, y: -E }, { x: L, y: -E }, { x: L, y: H }, { x: 0, y: H }].map((q) => appliquer(versAssemblage, q));
  const pxParM = resolutionTexture(L, H + E);
  const r = redresser(a.image, etendus, L, H + E, pxParM);
  // Ce que l'assemblage n'a pas vu reste hors champ : son masque, redresse de meme.
  const masque = { largeur: a.image.largeur, hauteur: a.image.hauteur, donnees: new Uint8ClampedArray(a.vu.length * 4) };
  a.vu.forEach((v, i) => { masque.donnees[i * 4] = v ? 255 : 0; });
  const vuR = redresser(masque, etendus, L, H + E, pxParM);
  if (!r || !vuR) return null;
  const vu = r.vu.map((v, i) => (v && (vuR.image.donnees[i * 4] ?? 0) > 127 ? 1 : 0));
  return finaliserReleve(r.image, vu, E, pxParM, { ...mur, silhouette: gabarit ? gabarit.map((p) => ({ u: p.u, v: p.v })) : null }, null, hauteurMesuree);
}

/** Une photo prise pour son propre assemblage : toute vue, le mur entre ses coins. */
function photoCommeAssemblage(p: PhotoDuMur): AssemblageDuMur {
  return { image: p.photo, vu: new Uint8Array(p.photo.largeur * p.photo.hauteur).fill(1), coins: p.coins, vues: [{ assemblee: true, motif: null }] };
}

/**
 * Plusieurs vues du mur entier dans l'assemblage : l'assemblage pose le mur (ses coins, reportes sur chaque photo par la chaine), et
 * l'image du mur se compose par la fusion de ces memes photos (facade/fusion.ts) : la vue la mieux vue pixel par pixel, la mediane
 * a trois vues, ce qui est devant le mur ecarte par la parallaxe et masque quand il cache le mur sur toutes, les baies votees entre
 * les vues. Le cadre est celui de l'assemblage : le mur et la bande au-dessus de l'egout, a l'echelle du plan. Null avec moins de deux
 * vues assemblees, ou quand elles ne se recalent pas entre elles : l'assemblage seul fait alors l'image.
 */
export function fondreLesVues(mur: MurAnalyse, photos: readonly PhotoDuMur[], a: AssemblageDuMur, gabarit: GabaritMur | null = null): ResultatFusion | null {
  if (photos.length < 2 || a.vues.filter((v) => v.assemblee).length < 2) return null;
  const f = analyserVues({ ...mur, silhouette: gabarit ? gabarit.map((p) => ({ u: p.u, v: p.v })) : null, vues: photos.map((p) => ({ photo: p.photo, coins: p.coins, focalePx: p.focalePx })) });
  return f && (f.statut === 'fusionnee' || f.statut === 'partielle') ? f : null;
}

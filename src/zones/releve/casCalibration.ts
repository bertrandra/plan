// Admin › Calibrer la detection : ce que l'editeur d'un cas calcule, sans React (zones/EditeurCasCalibration.tsx le montre). Les
// coins du mur sur la serie de photos par la chaine de l'audit et du releve, l'assemblage de l'etape 3 pris tel quel pour la suite,
// la facade complete posee dessus, le calage ramene sur chaque photo, et les images des neuf etapes.

import { preparerCas, type CasPrepare, type CasStocke } from '../../facade/corpusReel.js';
import { avisFusion } from './analyse.js';
import { priseSansCapteurs, redresserEtFusionner } from './chaine.js';
import { rechercher } from './serie.js';
import { coinsAutoDeSerie, type CoinsDeSerie } from './coinsAuto.js';
import { GABARIT_RECTANGLE, gabaritSurLaPhoto, type GabaritMur } from '../../facade/gabaritMur.js';
import { inverser } from '../../facade/redressementFuites.js';
import type { MurLu } from '../../facade/mosaiqueFuites.js';
import type { Facade } from '../../facade/geometrie.js';
import type { BilanPhotoRedressement, CorrectionRedressement } from '../../model/auditParcelle.js';
import type { OuvertureDetectee } from '../../facade/detection.js';
import { sansOmbres } from '../../facade/sansOmbres.js';
import { appliquer, homographie, type Image, type P2 } from '../../facade/homographie.js';
import { appliquerSimilitude, inverse } from '../../facade/ransac.js';
import type { AssemblageDuMur } from '../../facade/analyseMur.js';

/** Ce que l'editeur demande au navigateur : reduire une photo, la decoder, montrer une elevation. */
export interface OutilsPhotos {
  reduirePhoto: (f: File) => Promise<string>;
  decoder: (url: string) => Promise<Image>;
  elevationEnUrl: (img: Image) => string;
}

/**
 * D'ou viennent les coins d'une photo : trouves (sur ses aretes, ou sur l'assemblage des photos), devines (a verifier), poses a la main
 * (un ancien cas), ou cherches sur l'assemblage apres un redressement par les reperes de la personne.
 */
export type OrigineCoins = 'trouves' | 'devines' | 'main' | 'reperes';
/** Ce que la personne avait pose sur les photos d'un cas (un cas tire d'un audit, ou enregistre) : son mur ajuste a la main, ses reperes. */
export const originesDuCas = (cas: CasStocke): Record<number, OrigineCoins> =>
  Object.fromEntries(cas.photos.flatMap((p, k): [number, OrigineCoins][] => (p.murALaMain ? [[k, 'main']] : reperesDe(p) ? [[k, 'reperes']] : [])));

/** Les reperes d'une photo, s'ils sont quatre. */
export const reperesDe = (p: CasStocke['photos'][number] | undefined): P2[] | null => (p?.reperes?.length === 4 ? p.reperes : null);

/**
 * Les coins du mur sur toutes les photos, par la chaine de l'audit et du releve (releve/chaine.ts) : coins poses a la main
 * gardes, les autres trouves sur les aretes (distorsion du grand-angle corrigee), reportes de la photo posee a la main ou lus sur
 * l'assemblage des vues, sinon predits ; des verticales qui penchent font essayer d'autres coins. Une photo n'a ni GPS ni
 * boussole : son champ vient de l'EXIF, sinon de ses points de fuite. `message` : les photos qui doutent, a reprendre au doigt.
 */
export async function coinsDeSerie(depart: CasStocke, images: readonly Image[], origines: Readonly<Record<number, OrigineCoins>>, dimsDuPlan = false): Promise<{ cas: CasStocke; origines: Record<number, OrigineCoins>; message: string | null; bilans: BilanPhotoRedressement[] }> {
  const L = depart.largeurM, H = depart.hauteurM;
  const f: Facade = { cote: 0, gauche: { x: 0, y: 0 }, droite: { x: L, y: 0 }, largeur: L, hauteur: H, normale: { x: 0, y: -1 }, azimut: 180, orientation: 'Sud' };
  const entrees = images.map((image, k) => { const fp = depart.photos[k]?.focalePx ?? null; return { rang: k, image, prise: priseSansCapteurs(image, fp), champConnu: fp != null }; });
  // Les reperes redressent la photo, puis le mur se cherche sur l'assemblage ; des coins poses a la main (ancien cas) restent tels quels.
  const corrections: Record<string, CorrectionRedressement> = {};
  // Le mur ajuste a la main (sur la photo redressee, ou un ancien cas aux coins poses) l'emporte : il se reporte sur les autres photos.
  depart.photos.forEach((p, k) => { const r = reperesDe(p), main = origines[k] === 'main'; if (r || main) corrections[String(k)] = { ...(r ? { reperes: r } : {}), ...(main ? { coins: p.coins } : {}) }; });
  const c = await redresserEtFusionner(entrees, f, { pts: [{ x: 0, y: 0 }, { x: L, y: 0 }, { x: L, y: 6 }, { x: 0, y: 6 }] }, { chercherCoins: async (e) => rechercher(e), hauteurDuPlan: dimsDuPlan, lireSurLAssemblage: true, coinsSeuls: true, gabarit: depart.gabarit ?? GABARIT_RECTANGLE }, corrections);
  const parRang = new Map(c.redressement.photos.map((b) => [b.rang, b]));
  // Des coins retrouves : la silhouette d'avant (posee sur d'autres coins) ne vaut plus, les etapes reposent le gabarit.
  const cas: CasStocke = { ...depart, photos: depart.photos.map((p, k) => { const px = parRang.get(k)?.coinsPx; if (!(px?.length === 4 && origines[k] !== 'main')) return p; const q = { ...p, coins: px }; delete q.silhouette; return q; }) };
  const nouvelles: Record<number, OrigineCoins> = {};
  for (const b of c.redressement.photos) nouvelles[b.rang] = b.coins === 'main' ? 'main' : reperesDe(depart.photos[b.rang]) ? 'reperes' : b.coins === 'trouve' && b.statut !== 'echec' ? 'trouves' : 'devines';
  const doutes = c.redressement.photos.filter((b) => b.statut === 'echec' && b.motif);
  return { cas, origines: nouvelles, message: doutes.length ? doutes.map((b) => 'Photo ' + (b.rang + 1) + ' : ' + b.motif + '.').join(' ') : null, bilans: c.redressement.photos };
}

/** Ce que chaque etape a donne, en images : de quoi voir ou la chaine a doute avant d'annoter. */
export interface Etapes {
  /** Par photo : la photo entiere redressee (par ses reperes, sinon ses points de fuite), sans coupe ; null si elle ne se redresse pas. */
  entieres: ({ url: string; l: number; h: number; silhouette: P2[] | null } | null)[];
  /** La silhouette sur l'image posee sur la facade (la photo redressee et fusionnee), en metres depuis son coin haut gauche. */
  silhouetteTexture: P2[];
  /** La taille de cette image, en metres. */
  textureM: { l: number; h: number };
  /** L'assemblage des photos redressees, et le mur qui y a ete cherche (en pixels de l'assemblage) ; null sans assemblage. */
  assemblage: { url: string; largeur: number; hauteur: number; mur: MurLu } | null;
  /**
   * La facade complete : l'assemblage de l'etape 3, entier et tel quel (l'image prise pour la suite), en pixels de l'assemblage ; le
   * contour du mur (le sol, puis la silhouette a l'echelle de la facade), et les ouvertures proposees ramenees sur lui. Null quand
   * aucune photo ne s'assemble.
   */
  facade: { url: string; largeur: number; hauteur: number; contour: P2[]; propositions: P2[][]; devinees: P2[][] } | null;
  /** Le calage (etapes 5 et 6) : les coins du mur sur l'assemblage, et de quoi les ramener sur chaque photo ; null sans assemblage. */
  calage: { coins: P2[]; versPhotos: (coins: readonly P2[]) => (P2[] | null)[] } | null;
  /** Par photo : est-elle dans l'assemblage, et sinon pourquoi. */
  vuesAssemblage: { assemblee: boolean; motif: string | null }[];
  propositions: readonly OuvertureDetectee[];
  devinees: readonly OuvertureDetectee[];
  /** La texture posee sur la facade en 3D, telle quelle et sans les ombres de la photo (case « Facades sans ombres »). */
  surFacade: string;
  sansOmbres: string;
}

/** Ce que le redressement a a redire : une photo restee hors de l'assemblage (ou, sans assemblage, ce que dit la fusion). */
export function avisDuCas(p: CasPrepare): string | null {
  if (p.fusion) return avisFusion(p.fusion);
  const k = p.assemblage?.vues.findIndex((v) => !v.assemblee) ?? -1;
  return k >= 0 ? `La photo ${k + 1} reste hors de l’assemblage : ${p.assemblage?.vues[k]?.motif ?? 'elle ne se recale sur aucune autre'}. Prenez-en une autre en gardant un tiers de mur en commun.` : null;
}

/**
 * L'assemblage de l'etape 3 (`sr`), pris tel quel pour la suite : son image, ce qu'il montre, et le mur pose dessus. Les coins du mur
 * sont ceux de la premiere photo assemblee (poses ou ajustes a la main, ou trouves), ramenes sur l'assemblage ; sinon le mur cherche
 * dessus.
 */
export function assemblageDeLaSerie(sr: CoinsDeSerie, cas: CasStocke): AssemblageDuMur {
  const { image, vu, places, mur } = sr.assemblage;
  let coins: P2[] | null = null;
  for (let i = 0; i < sr.vues.length && !coins; i++) {
    const v = sr.vues[i], place = places[i], c = cas.photos[i]?.coins, inv = v ? inverser(v.versPhoto) : null;
    if (v && place && inv && c?.length === 4) coins = c.map((q) => appliquerSimilitude(place, appliquer(inv, q)));
  }
  const motif = new Map(sr.aPart.map((x) => [x.vue, x.motif]));
  return {
    image, vu, coins: coins ?? [{ x: mur.x0, y: mur.y0 }, { x: mur.x1, y: mur.y0 }, { x: mur.x1, y: mur.y1 }, { x: mur.x0, y: mur.y1 }],
    vues: sr.vues.map((_, i) => (motif.has(i) ? { assemblee: false, motif: motif.get(i) ?? null } : { assemblee: true, motif: null })),
  };
}

/**
 * La facade complete sur l'assemblage : le contour du mur (le sol, puis la silhouette mise a l'echelle de la facade par ses coins) et
 * les ouvertures proposees, ramenees du mur (metres, y depuis le sol) sur l'assemblage par les memes coins.
 */
export function facadeSurLAssemblage(a: AssemblageDuMur, gabarit: GabaritMur, L: number, H: number, p: CasPrepare, url: string): NonNullable<Etapes['facade']> {
  const [, , bd, bg] = a.coins as [P2, P2, P2, P2];
  const versA = homographie([{ x: 0, y: H }, { x: L, y: H }, { x: L, y: 0 }, { x: 0, y: 0 }], a.coins);
  const quad = (o: OuvertureDetectee): P2[] => (versA ? [{ x: o.x, y: o.y + o.h }, { x: o.x + o.l, y: o.y + o.h }, { x: o.x + o.l, y: o.y }, { x: o.x, y: o.y }].map((q) => appliquer(versA, q)) : []);
  return {
    url, largeur: a.image.largeur, hauteur: a.image.hauteur,
    contour: [bg, ...(gabaritSurLaPhoto(gabarit, a.coins) ?? []), bd],
    propositions: p.ouvertures.map(quad), devinees: p.devinees.map(quad),
  };
}

/** Des coins du mur sur l'assemblage, ramenes sur chaque photo assemblee (assemblage -> vue de face -> photo) ; null hors assemblage. */
export function versLesPhotos(sr: CoinsDeSerie, coins: readonly P2[]): (P2[] | null)[] {
  return sr.vues.map((v, i) => {
    const place = sr.assemblage.places[i], inv = place ? inverse(place) : null;
    return v && inv ? coins.map((q) => { const p = appliquer(v.versPhoto, appliquerSimilitude(inv, q)); return { x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10 }; }) : null;
  });
}

/** Le cas apres le calage de la silhouette : les coins de chaque photo assemblee, poses a la main. */
export function casCale(cas: CasStocke, parPhoto: readonly (P2[] | null)[]): CasStocke {
  return { ...cas, photos: cas.photos.map((p, i) => { const c = parPhoto[i]; return c ? { ...p, coins: c, murALaMain: true } : p; }) };
}

/** L'assemblage de l'etape 3, fait une fois : il est montre, et c'est l'image prise pour la suite (mur, detection, texture). */
export function preparerSurLAssemblage(cas: CasStocke, images: readonly Image[]): { sr: CoinsDeSerie | null; p: CasPrepare | null } {
  const sr = coinsAutoDeSerie(images, cas.largeurM, cas.hauteurM, cas.photos.map(reperesDe), cas.gabarit ?? GABARIT_RECTANGLE);
  return { sr, p: preparerCas(cas, images, true, sr ? assemblageDeLaSerie(sr, cas) : null) };
}

/** Les images des etapes d'un cas redresse. */
export function etapesDe(p: CasPrepare, images: readonly Image[], depart: CasStocke, outils: OutilsPhotos, sr: CoinsDeSerie | null): Etapes {
  const enUrl = (im: Image | null) => (im ? outils.elevationEnUrl(im) : null);
  const gabarit = depart.gabarit ?? GABARIT_RECTANGLE;
  // Le gabarit pose sur chaque photo par ses coins, puis sur chaque vue redressee et sur l'image fusionnee : trace en surimpression.
  const silhouettes = images.map((_, k) => { const q = depart.photos[k]; return q?.coins.length === 4 ? gabaritSurLaPhoto(gabarit, q.coins) : null; });
  const L = depart.largeurM, H = depart.hauteurM;
  const a = p.assemblage;
  // L'assemblage montre a l'etape 3 est l'image prise pour la suite : un seul JPEG pour les deux.
  const urlAssemblage = sr ? outils.elevationEnUrl(sr.assemblage.image) : null;
  const urlFacade = a ? (urlAssemblage && sr?.assemblage.image === a.image ? urlAssemblage : outils.elevationEnUrl(a.image)) : null;
  return {
    // Le contour du mur sur la texture (metres depuis son coin haut gauche) : le sol, puis le gabarit d'un angle a l'autre.
    silhouetteTexture: [{ x: 0, y: p.hauteurTexture }, ...gabarit.map((q) => ({ x: q.u * L, y: p.hauteurTexture - q.v * H })), { x: L, y: p.hauteurTexture }],
    textureM: { l: p.texture.largeur / p.pxParM, h: p.hauteurTexture },
    entieres: images.map((_, k) => {
      const v = sr?.vues[k], u = v ? enUrl(v.image) : null;
      if (!v || !u) return null;
      const versVue = inverser(v.versPhoto), sil = silhouettes[k];
      return { url: u, l: v.image.largeur, h: v.image.hauteur, silhouette: sil && versVue ? sil.map((q) => appliquer(versVue, q)) : null };
    }),
    assemblage: sr && urlAssemblage ? { url: urlAssemblage, largeur: sr.assemblage.image.largeur, hauteur: sr.assemblage.image.hauteur, mur: sr.assemblage.mur } : null,
    facade: a && urlFacade ? facadeSurLAssemblage(a, gabarit, L, H, p, urlFacade) : null,
    calage: a && sr ? { coins: a.coins, versPhotos: (c) => versLesPhotos(sr, c) } : null,
    vuesAssemblage: a?.vues ?? [],
    propositions: p.ouvertures, devinees: p.devinees,
    surFacade: outils.elevationEnUrl(p.texture),
    // Les baies de la detection tiennent lieu de celles du releve, que la 3D met de cote pour lire l'eclairage du mur.
    sansOmbres: outils.elevationEnUrl(sansOmbres(p.texture, p.pxParM, p.ouvertures, depart.hauteurM)),
  };
}

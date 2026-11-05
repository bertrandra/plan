// Les images de chaque etape de l'enchainement d'une facade (MD/spec-facade-calage-audit.md §7.3), tirees des sorties de
// l'orchestrateur (enchainement.ts) : la geometrie de ce qui se superpose (le gabarit sur chaque vue, le mur sur l'assemblage, les
// ouvertures, le contour sur la texture). Pur, sans React : l'ecran ne fait que changer les images en adresses et dessiner.

import { contourDuGabarit, gabaritSurLaPhoto, type GabaritMur } from '../gabaritMur.js';
import { inverser } from '../vision/redressementFuites.js';
import { appliquer, homographie, type Image, type P2 } from '../vision/homographie.js';
import type { OuvertureDetectee } from '../detection/detection.js';
import type { Etendue } from '../../regles/facades/observations.js';
import type { BoiteAccordee, RectIa } from '../regles/facades/ia.js';
import type { EntreesFacade, Enchainement } from './enchainement.js';

export interface ImagesEtapes {
  /** E3 : par photo, la vue redressee entiere et le gabarit pose par ses coins (en pixels de la vue) ; null : elle ne se redresse pas. */
  vues: ({ image: Image; silhouette: P2[] | null } | null)[];
  /** E4 : l'image prise pour la suite, l'assemblage des vues (une photo seule : sa vue de face), celle de l'audit. */
  assemblage: { image: Image } | null;
  /**
   * E5, E6, E9 : l'image prise pour la suite et le mur retenu dessus ; le contour du mur (le sol, puis le gabarit a l'echelle de la
   * facade entre ses coins), le haut lu sur l'image, et les ouvertures ramenees du mur sur elle.
   */
  pose: { image: Image; coins: P2[]; contour: P2[]; silhouette: P2[] | null; proposees: P2[][]; devinees: P2[][] } | null;
  /**
   * E9 : la facade que lit la detection, en metres depuis son coin haut gauche (le sol en bas) : l'image redressee entiere, fusionnee
   * quand plusieurs vues se fondent, dans son cadre (la boite de la silhouette entiere et sa marge, la bande au-dessus de l'egout), sans
   * coupe a l'egout ; la silhouette du mur (le gabarit, pignons compris), seule zone ou la detection cherche ; les ouvertures trouvees et
   * devinees. `x0` : la place du bout gauche du mur dans le cadre (les cotes des ouvertures se comptent depuis lui).
   */
  facade: { image: Image; l: number; h: number; x0: number; contour: P2[]; proposees: P2[][]; devinees: P2[][] } | null;
  /** E8 : le contour du mur sur la texture, en metres depuis son coin haut gauche, et la taille de la texture. */
  texture: { image: Image; sansOmbres: Image | null; contour: P2[]; l: number; h: number } | null;
  /**
   * Le mode « IA » (lot F2). E5, sur l'assemblage : la pose des deux angles de Claude (le calque bleu), ses pointes, et ses appentis,
   * corps et caches en bandes sous le mur, portes par sa pose. E9, sur l'image prise pour la suite : ses boites (cochees, ou seules).
   */
  /**
   * E7 (lot F4), sur l'image prise pour la suite : les troncons de corps (en pixels le long du haut du mur, avec leur corps) et,
   * pour chaque proposition de toit, le gabarit modifie pose entre les memes coins, avec son corps et son gain.
   */
  forme: {
    troncons: { x0: number; x1: number; y: number; corps: number; cote: number }[];
    propositions: { contour: P2[]; corps: number; gain: number | null }[];
  } | null;
  ia: {
    pose: RectIa | null;
    pointes: P2[];
    etendues: { quoi: 'appentis' | 'corps' | 'cache'; x0: number; x1: number; y: number }[];
    boites: (BoiteAccordee & { quad: P2[] })[];
  } | null;
}

/** Le mur pose (haut gauche, haut droit, bas droit, bas gauche) ramene a ses bouts, son egout et son sol. */
function rectDeLaPose(coins: readonly P2[]): { x0: number; x1: number; y0: number; y1: number } {
  const [hg, hd, bd, bg] = coins as [P2, P2, P2, P2];
  return { x0: (hg.x + bg.x) / 2, x1: (hd.x + bd.x) / 2, y0: (hg.y + hd.y) / 2, y1: (bd.y + bg.y) / 2 };
}

/** Les ouvertures d'un mur (metres, y depuis le sol) ramenees sur une image par les coins du mur. */
function versLImage(coins: readonly P2[], L: number, H: number, ouvertures: readonly OuvertureDetectee[]): P2[][] {
  const h = homographie([{ x: 0, y: H }, { x: L, y: H }, { x: L, y: 0 }, { x: 0, y: 0 }], coins);
  return h ? ouvertures.map((o) => [{ x: o.x, y: o.y + o.h }, { x: o.x + o.l, y: o.y + o.h }, { x: o.x + o.l, y: o.y }, { x: o.x, y: o.y }].map((q) => appliquer(h, q))) : [];
}

/**
 * Le cadre de la facade lue par la detection (metres, y vers le bas depuis le haut du cadre) : sa taille, la place du bout gauche du mur
 * (`x0`), la largeur et la hauteur du mur.
 */
interface CadreFacade { l: number; h: number; x0: number; lMur: number; hMur: number }

/** Le cadre de la facade d'une analyse : l'image, le bout gauche du mur dedans, le mur (l'elevation, du sol a l'egout). */
function cadreDe(a: { facade: { image: Image; x0Px: number }; elevation: Image; pxParM: number }): CadreFacade {
  return { l: a.facade.image.largeur / a.pxParM, h: a.facade.image.hauteur / a.pxParM, x0: a.facade.x0Px / a.pxParM, lMur: a.elevation.largeur / a.pxParM, hMur: a.elevation.hauteur / a.pxParM };
}

/** Une ouverture du mur (metres, y depuis le sol) dans le cadre de la facade : haut gauche, haut droit, bas droit, bas gauche. */
function dansLeCadre(c: CadreFacade, o: Pick<OuvertureDetectee, 'x' | 'y' | 'l' | 'h'>): P2[] {
  const haut = c.h - (o.y + o.h), bas = c.h - o.y, x = c.x0 + o.x;
  return [{ x, y: haut }, { x: x + o.l, y: haut }, { x: x + o.l, y: bas }, { x, y: bas }];
}

/**
 * La pose du gabarit sur le mur retenu (enchainement.ts, E5) : son bas sur le sol, a l'echelle de la largeur, en hauteurs du mur
 * trouve (gabaritMur.ts::echelleDuGabarit). 1 sans mur pose.
 */
const echelleDe = (r: Enchainement): number => r.sorties.calage?.echelleGabarit ?? 1;

/** Le gabarit pose sur chaque photo par les coins que la chaine a retenus, ramene sur sa vue redressee (par rang de photo). */
function vuesAvecGabarit(r: Enchainement, g: GabaritMur): ImagesEtapes['vues'] {
  const vues = r.sorties.vues ?? [];
  const coins = r.sorties.calage?.photos ?? [];
  return vues.map((v, k) => {
    if (!v) return null;
    const c = coins[k]?.coins, sil = c?.length === 4 ? gabaritSurLaPhoto(g, c, echelleDe(r)) : null, versVue = inverser(v.versPhoto);
    return { image: v.image, silhouette: sil && versVue ? sil.map((q) => appliquer(versVue, q)) : null };
  });
}

/** Ce que les images lisent des entrees du rejeu : les dimensions et le gabarit du mur. */
type Mur = Pick<EntreesFacade, 'largeurM' | 'hauteurM' | 'gabarit'>;

/** Le calque de Claude : ses points sur l'image prise pour la suite (portes par sa pose, sinon par le mur retenu), ses boites sur la facade. */
function calqueIa(r: Enchainement, e: Mur, pose: NonNullable<Enchainement['sorties']['calage']>['pose']): ImagesEtapes['ia'] {
  const ia = r.sorties.ia;
  if (!ia?.reponse) return ia ? { pose: ia.pose, pointes: [], etendues: [], boites: [] } : null;
  const cadre = ia.pose ?? (pose?.coins.length === 4 ? rectDeLaPose(pose.coins) : null);
  const w = cadre ? cadre.x1 - cadre.x0 : 0, h = cadre ? cadre.y1 - cadre.y0 : 0;
  const enU = (u: number) => (cadre ? cadre.x0 + u * w : 0);
  const bande = (quoi: 'appentis' | 'corps' | 'cache', l: readonly Etendue[], k: number) => l.map((x) => ({ quoi, x0: enU(x.debut), x1: enU(x.fin), y: (cadre?.y1 ?? 0) + (0.02 + 0.02 * k) * w }));
  const c = ia.reponse.calage;
  // Les boites se posent sur la facade que lit la detection (l'E9 la montre), sinon sur l'image de la pose.
  const a = r.sorties.analyse, cadre_ = a ? cadreDe(a) : null;
  const boites = ia.accord && (cadre_ || pose) ? ia.accord.boites : [];
  const quads = cadre_ ? boites.map((b) => dansLeCadre(cadre_, b.ouverture)) : pose ? versLImage(pose.coins, e.largeurM, e.hauteurM, boites.map((b) => ({ ...b.ouverture, confiance: 1 }))) : [];
  return {
    pose: ia.pose,
    pointes: cadre ? c.pointes.map((p) => ({ x: enU(p.u), y: cadre.y1 - p.v * h })) : [],
    etendues: cadre ? [...bande('appentis', c.appentis, 0), ...bande('corps', c.corps, 1), ...bande('cache', c.cache, 2)] : [],
    boites: boites.map((b, k) => ({ ...b, quad: quads[k] ?? [] })),
  };
}

/** Le calque du diagnostic de forme : les troncons sous le haut du mur, chaque gabarit propose pose entre les coins du mur. */
function calqueForme(r: Enchainement, pose: NonNullable<Enchainement['sorties']['calage']>['pose']): ImagesEtapes['forme'] {
  const d = r.sorties.forme?.diagnostic;
  const [hg, hd, bd, bg] = (pose?.coins ?? []) as P2[];
  if (!d || !pose || !hg || !hd || !bd || !bg) return null;
  const x = (u: number) => bg.x + (bd.x - bg.x) * u, w = Math.abs(bd.x - bg.x);
  return {
    troncons: d.troncons.map((t, k) => ({ x0: x(t.u0), x1: x(t.u1), y: Math.max(bd.y, bg.y) + (0.02 + 0.015 * (k % 2)) * w, corps: t.corps, cote: t.cote })),
    propositions: d.propositions.map((p) => ({ contour: gabaritSurLaPhoto(contourDuGabarit(p.gabarit), pose.coins, echelleDe(r)) ?? [], corps: p.corps, gain: p.gain })),
  };
}

/** Les images des etapes d'un rejeu. */
export function imagesEtapes(r: Enchainement, e: Mur): ImagesEtapes {
  const s = r.sorties, g = e.gabarit, L = e.largeurM, H = e.hauteurM, k = echelleDe(r);
  const pose = s.calage?.pose ?? null;
  const a = s.analyse;
  const [, , bd, bg] = (pose?.coins ?? []) as P2[];
  return {
    vues: vuesAvecGabarit(r, g),
    assemblage: pose ? { image: pose.image } : null,
    pose: pose && bd && bg ? {
      image: pose.image, coins: pose.coins, contour: gabaritSurLaPhoto(contourDuGabarit(g), pose.coins, k) ?? [bg, bd], silhouette: s.silhouette?.points ?? null,
      proposees: a ? versLImage(pose.coins, L, H, a.ouvertures) : [], devinees: a ? versLImage(pose.coins, L, H, a.devinees) : [],
    } : null,
    facade: a ? (() => {
      const c = cadreDe(a);
      return { image: a.facade.image, l: c.l, h: c.h, x0: c.x0, contour: contourDuGabarit(g).map((q) => ({ x: c.x0 + q.u * c.lMur, y: c.h - q.v * k * c.hMur })), proposees: a.ouvertures.map((o) => dansLeCadre(c, o)), devinees: a.devinees.map((o) => dansLeCadre(c, o)) };
    })() : null,
    texture: a ? { image: a.texture, sansOmbres: s.sansOmbres, contour: contourDuGabarit(g).map((q) => ({ x: q.u * L, y: a.hauteurTexture - q.v * k * a.elevation.hauteur / a.pxParM })), l: a.texture.largeur / a.pxParM, h: a.hauteurTexture } : null,
    forme: calqueForme(r, pose),
    ia: calqueIa(r, e, pose),
  };
}

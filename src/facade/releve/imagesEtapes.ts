// Les images de chaque etape de l'enchainement d'une facade (MD/spec-facade-calage-audit.md §7.3), tirees des sorties de
// l'orchestrateur (enchainement.ts) : la geometrie de ce qui se superpose (le gabarit sur chaque vue, le mur sur l'assemblage, les
// ouvertures, le contour sur la texture). Pur, sans React : l'ecran ne fait que changer les images en adresses et dessiner.

import { contourDuGabarit, gabaritSurLaPhoto, type GabaritMur } from '../gabaritMur.js';
import { inverser } from '../vision/redressementFuites.js';
import { appliquer, homographie, type Image, type P2 } from '../vision/homographie.js';
import type { MurCale } from './calageAncres.js';
import type { OuvertureDetectee } from '../detection/detection.js';
import type { EntreesFacade, Enchainement } from './enchainement.js';

export interface ImagesEtapes {
  /** E2 : par photo, la vue redressee entiere et le gabarit pose par ses coins (en pixels de la vue) ; null : elle ne se redresse pas. */
  vues: ({ image: Image; silhouette: P2[] | null } | null)[];
  /**
   * E3, E4 : l'assemblage des vues et le mur qui y a ete cherche (en pixels de l'assemblage), avec le calage qui l'a retenu : la pose
   * des aretes quand une autre l'a remplacee, et le score de chacune.
   */
  assemblage: { image: Image; mur: MurCale } | null;
  /**
   * E4, E5, E7 : l'image prise pour la suite et le mur retenu dessus ; le contour du mur (le sol, puis le gabarit a l'echelle de la
   * facade entre ses coins), le haut lu sur l'image, et les ouvertures ramenees du mur sur elle.
   */
  pose: { image: Image; coins: P2[]; contour: P2[]; silhouette: P2[] | null; proposees: P2[][]; devinees: P2[][] } | null;
  /** E6 : le contour du mur sur la texture, en metres depuis son coin haut gauche, et la taille de la texture. */
  texture: { image: Image; sansOmbres: Image | null; contour: P2[]; l: number; h: number } | null;
}

/** Les ouvertures d'un mur (metres, y depuis le sol) ramenees sur une image par les coins du mur. */
function versLImage(coins: readonly P2[], L: number, H: number, ouvertures: readonly OuvertureDetectee[]): P2[][] {
  const h = homographie([{ x: 0, y: H }, { x: L, y: H }, { x: L, y: 0 }, { x: 0, y: 0 }], coins);
  return h ? ouvertures.map((o) => [{ x: o.x, y: o.y + o.h }, { x: o.x + o.l, y: o.y + o.h }, { x: o.x + o.l, y: o.y }, { x: o.x, y: o.y }].map((q) => appliquer(h, q))) : [];
}

/** Le gabarit pose sur chaque photo par ses coins, ramene sur sa vue redressee. */
function vuesAvecGabarit(r: Enchainement, e: Mur, g: GabaritMur): ImagesEtapes['vues'] {
  const vues = r.sorties.serie?.vues ?? r.sorties.vues ?? [];
  const coins = r.sorties.calage?.photos ?? e.photos;
  return e.photos.map((_, k) => {
    const v = vues[k];
    if (!v) return null;
    const c = coins[k]?.coins, sil = c?.length === 4 ? gabaritSurLaPhoto(g, c) : null, versVue = inverser(v.versPhoto);
    return { image: v.image, silhouette: sil && versVue ? sil.map((q) => appliquer(versVue, q)) : null };
  });
}

/** Ce que les images lisent des entrees du rejeu : les dimensions et le gabarit du mur, les coins de depart de chaque photo. */
type Mur = Pick<EntreesFacade, 'largeurM' | 'hauteurM' | 'gabarit'> & { photos: readonly { coins: readonly P2[] }[] };

/** Les images des etapes d'un rejeu. */
export function imagesEtapes(r: Enchainement, e: Mur): ImagesEtapes {
  const s = r.sorties, g = e.gabarit, L = e.largeurM, H = e.hauteurM;
  const pose = s.calage?.pose ?? null;
  const a = s.analyse;
  const [, , bd, bg] = (pose?.coins ?? []) as P2[];
  return {
    vues: vuesAvecGabarit(r, e, g),
    assemblage: s.serie ? { image: s.serie.assemblage.image, mur: s.serie.assemblage.mur } : null,
    pose: pose && bd && bg ? {
      image: pose.image, coins: pose.coins, contour: gabaritSurLaPhoto(contourDuGabarit(g), pose.coins) ?? [bg, bd], silhouette: s.silhouette?.points ?? null,
      proposees: a ? versLImage(pose.coins, L, H, a.ouvertures) : [], devinees: a ? versLImage(pose.coins, L, H, a.devinees) : [],
    } : null,
    texture: a ? { image: a.texture, sansOmbres: s.sansOmbres, contour: contourDuGabarit(g).map((q) => ({ x: q.u * L, y: a.hauteurTexture - q.v * H })), l: a.texture.largeur / a.pxParM, h: a.hauteurTexture } : null,
  };
}

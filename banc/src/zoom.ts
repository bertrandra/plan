// Le zoom d'une photo en SVG (editeur du marquage, redressement a la main), sans DOM : la molette, les boutons et le pincement a deux
// doigts changent la fenetre affichee (le viewBox), en gardant fixe le point sous le curseur ou sous les doigts.

export interface P { x: number; y: number }
export interface Vue { x: number; y: number; w: number; h: number }
export interface Cadre { left: number; top: number; width: number; height: number }

/** La vue entiere d'une photo. */
export const vueEntiere = (L: number, H: number): Vue => ({ x: 0, y: 0, w: L, h: H });

/** La largeur bornee : de la photo entiere (deux fois, pour respirer) a un quarantieme (un pixel de photo en fait vingt a l'ecran). */
const borner = (w: number, L: number) => Math.min(L * 2, Math.max(L / 40, w));

/** Zoome d'un facteur `k` (plus petit que 1 : on s'approche) en gardant `centre` (coordonnees de la photo) au meme endroit. */
export function zoomerAutour(v: Vue, centre: P, k: number, L: number): Vue {
  const w = borner(v.w * k, L), r = w / v.w, h = v.h * r;
  return { x: centre.x - (centre.x - v.x) * r, y: centre.y - (centre.y - v.y) * r, w, h };
}

/** L'echelle et le decalage d'un SVG en « meet » (la vue entiere tient dans le cadre, centree). */
function placement(c: Cadre, v: Vue): { s: number; ox: number; oy: number } {
  const s = Math.min(c.width / v.w, c.height / v.h);
  return { s, ox: c.left + (c.width - v.w * s) / 2, oy: c.top + (c.height - v.h * s) / 2 };
}

/** Le point de la photo sous un point de l'ecran. */
export function versPhoto(ecran: P, c: Cadre, v: Vue): P {
  const { s, ox, oy } = placement(c, v);
  return { x: v.x + (ecran.x - ox) / s, y: v.y + (ecran.y - oy) / s };
}

/**
 * Le pincement : les doigts partis de `milieu0` a `ecart0` sont en `milieu` a `ecart`. La vue de depart `v0` est zoomee du rapport des
 * ecarts, et le point de la photo qui etait sous les doigts y reste (ce qui deplace aussi la vue quand les doigts glissent ensemble).
 */
export function pincer(v0: Vue, c: Cadre, milieu0: P, ecart0: number, milieu: P, ecart: number, L: number): Vue {
  const sous = versPhoto(milieu0, c, v0);
  const w = borner(v0.w * (ecart0 / Math.max(1, ecart)), L), h = v0.h * (w / v0.w);
  const { s, ox, oy } = placement(c, { x: 0, y: 0, w, h });
  return { x: sous.x - (milieu.x - ox) / s, y: sous.y - (milieu.y - oy) / s, w, h };
}

/**
 * La vue qui cadre une boite (l'objet choisi), avec une marge d'un quart de sa taille de chaque cote, au plus pres a la limite du zoom.
 * La vue garde la forme de la boite : le SVG la fait tenir entiere dans le cadre.
 */
export function cadrer(b: { x0: number; y0: number; x1: number; y1: number }, L: number): Vue {
  const cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2;
  const w = Math.max(L / 40, (b.x1 - b.x0) * 1.5), h = Math.max(L / 40, (b.y1 - b.y0) * 1.5);
  return { x: cx - w / 2, y: cy - h / 2, w, h };
}

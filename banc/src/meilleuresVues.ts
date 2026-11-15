// Un batiment, ses meilleures vues (demande du proprietaire, 15 novembre 2026). Vu sur le vrai reseau : la meme maison revient dans cinq
// a dix 360 consecutifs, et les importer toutes n'apprend rien de plus au modele. Les vues gardees par le tri (facadesVues.ts) se
// regroupent par batiment vise (son identifiant de la BD TOPO) ; seules les mieux notees de chaque batiment se proposent, les autres
// restent visibles, marquees « doublon ». Les vues choisies a la main et celles qui regardent la parcelle visee ne sont jamais des
// doublons. Sans DOM, testable seul (banc/tests/meilleuresVues.test.ts).

import { distanceM, type PhotoRue, type VueAExtraire } from './panoramax.js';

/** Combien de vues garder par batiment. */
export type VuesParBatiment = 1 | 2 | 3 | 'toutes';
export const VUES_PAR_BATIMENT: readonly VuesParBatiment[] = [1, 2, 3, 'toutes'];
export const VUES_PAR_BATIMENT_DEFAUT: VuesParBatiment = 2;
/**
 * La deuxieme vue d'un batiment se prend d'ailleurs que la premiere quand c'est possible : deux 360 pris a deux metres l'un de l'autre
 * montrent la meme image. En deca de cet ecart entre deux prises de vue, la suivante attend qu'il n'y ait pas mieux place.
 */
export const ECART_ENTRE_VUES_M = 6;
/**
 * Un doublon est une vue du meme batiment prise du meme endroit. Vu rue de Rivoli (15 novembre 2026) : un immeuble de la BD TOPO y
 * tient tout un ilot, et deux vues pour 150 m de facade jetaient presque tout. Les `n` meilleures se comptent donc parmi les vues prises
 * a moins de cette distance les unes des autres : une maison garde ses deux vues (on ne la voit pas de plus loin), un long immeuble deux vues par troncon de facade.
 */
export const MEME_ENDROIT_M = 40;

export interface VuesDUnePhoto {
  photo: Pick<PhotoRue, 'id' | 'lat' | 'lon'>;
  vues: readonly VueAExtraire[];
  /** Ses vues ne se regroupent pas : choisies a la main (jamais decochees ni deplacees). */
  libre?: boolean;
}

export const cleDeVue = (photo: string, rang: number): string => photo + '|' + rang;

/**
 * Les vues en trop : pour chaque batiment, celles au-dela des `n` meilleures prises du meme endroit (MEME_ENDROIT_M). La meilleure
 * d'abord, puis la mieux notee parmi celles prises a ECART_ENTRE_VUES_M au moins des vues deja retenues ; s'il reste de la place, les autres. `exemptes` : les batiments
 * de la parcelle visee, dont toutes les vues restent (le comportement de la parcelle visee ne change pas). Rend les cles des doublons.
 */
export function doublons(photos: readonly VuesDUnePhoto[], n: VuesParBatiment, exemptes: ReadonlySet<string> = new Set()): Set<string> {
  const out = new Set<string>();
  if (n === 'toutes') return out;
  const par = new Map<string, { cle: string; note: number; pos: { lat: number; lon: number } }[]>();
  for (const p of photos) {
    if (p.libre) continue;
    p.vues.forEach((v, k) => {
      if (!v.batiment || exemptes.has(v.batiment)) return;
      const l = par.get(v.batiment) ?? [];
      l.push({ cle: cleDeVue(p.photo.id, k), note: v.note ?? 0, pos: p.photo });
      par.set(v.batiment, l);
    });
  }
  for (const l of par.values()) {
    // A note egale, l'ordre des cles : le choix ne depend pas de l'ordre d'arrivee des photos.
    const ordre = [...l].sort((a, b) => b.note - a.note || (a.cle < b.cle ? -1 : 1)), retenues: typeof l = [];
    const autour = (c: (typeof l)[number], rayon: number) => retenues.filter((r) => distanceM(r.pos, c.pos) < rayon).length;
    // D'abord les vues prises a l'ecart de celles deja retenues, puis, s'il reste de la place, les autres.
    for (const passe of [ECART_ENTRE_VUES_M, 0]) {
      for (const c of ordre) if (!retenues.includes(c) && autour(c, MEME_ENDROIT_M) < n && autour(c, passe) === 0) retenues.push(c);
    }
    for (const c of ordre) if (!retenues.includes(c)) out.add(c.cle);
  }
  return out;
}

/** Les vues d'une photo, celles en trop marquees « doublon ». */
export function marquer(photo: string, vues: readonly VueAExtraire[], enTrop: ReadonlySet<string>): VueAExtraire[] {
  return vues.map((v, k) => (enTrop.has(cleDeVue(photo, k)) ? { ...v, doublon: true } : v));
}

/** Une photo dont toutes les vues sont des doublons : visible, mais pas proposee cochee. */
export const estDoublon = (vues: readonly VueAExtraire[]): boolean => vues.length > 0 && vues.every((v) => v.doublon);

/**
 * Les vues qui seront importees : celles qui ne sont pas des doublons. D'une photo toute en doublons que l'on coche quand meme, toutes
 * ses vues : on l'a demandee.
 */
export function aImporter(vues: readonly VueAExtraire[]): VueAExtraire[] {
  const gardees = vues.filter((v) => !v.doublon);
  return gardees.length ? gardees : [...vues];
}

/** La note d'une photo : la meilleure de ses vues a importer ; null quand aucune n'est notee (pas de tri, ou vues choisies a la main). */
export function noteDePhoto(vues: readonly VueAExtraire[]): number | null {
  const notes = aImporter(vues).flatMap((v) => (typeof v.note === 'number' ? [v.note] : []));
  return notes.length ? Math.max(...notes) : null;
}

export type Ordre = 'note' | 'distance' | 'date';
export const ORDRES: readonly { valeur: Ordre; libelle: string }[] = [{ valeur: 'note', libelle: 'meilleures d’abord' }, { valeur: 'distance', libelle: 'plus proches' }, { valeur: 'date', libelle: 'plus récentes' }];

/**
 * La liste dans l'ordre voulu, les photos toutes en doublons a la fin (elles restent visibles, sans passer devant ce qui se propose).
 * « plus proches » : de la parcelle visee quand il y en a une (`visant`), sinon de la facade regardee. Une photo sans note (pas de tri)
 * garde sa place d'arrivee, apres les notees.
 */
export function ordonner<T extends Pick<PhotoRue, 'id' | 'distance' | 'date'>>(photos: readonly T[], vuesDe: (p: T) => readonly VueAExtraire[], ordre: Ordre, visant: boolean): T[] {
  const cle = (p: T): number => {
    const vues = vuesDe(p);
    if (ordre === 'note') return -(noteDePhoto(vues) ?? -1);
    if (ordre === 'date') { const t = p.date ? Date.parse(p.date) : NaN; return Number.isNaN(t) ? Infinity : -t; }
    if (visant) return p.distance;
    const d = aImporter(vues).flatMap((v) => (typeof v.distanceFacade === 'number' ? [v.distanceFacade] : []));
    return d.length ? Math.min(...d) : Infinity;
  };
  return photos.map((p, rang) => ({ p, rang, doublon: estDoublon(vuesDe(p)), cle: cle(p) }))
    .sort((a, b) => Number(a.doublon) - Number(b.doublon) || a.cle - b.cle || a.rang - b.rang).map((x) => x.p);
}

export interface Comptes { photos: number; facades: number; batiments: number; doublons: number; ecartees: number }

/** Les comptes de ce qui est propose : photos, vues a importer (facades), batiments regardes, vues en doublon. */
export function compter(vuesParPhoto: readonly (readonly VueAExtraire[])[], ecartees: number): Comptes {
  const batiments = new Set<string>();
  let facades = 0, enTrop = 0;
  for (const vues of vuesParPhoto) for (const v of vues) { if (v.batiment) batiments.add(v.batiment); if (v.doublon) enTrop++; else facades++; }
  return { photos: vuesParPhoto.length, facades, batiments: batiments.size, doublons: enTrop, ecartees };
}

/** Ce que l'etat dit du tri : « 42 photos, 61 façades de 23 bâtiments, 30 doublons ; 118 écartées : route, campagne ou pas une maison ». */
export function texteDesComptes(c: Comptes): string {
  const s = (n: number) => (n > 1 ? 's' : '');
  return `${c.photos} photo${s(c.photos)}, ${c.facades} façade${s(c.facades)} de ${c.batiments} bâtiment${s(c.batiments)}, ${c.doublons} doublon${s(c.doublons)} ; ${c.ecartees} écartée${s(c.ecartees)} : route, campagne ou pas une maison`;
}

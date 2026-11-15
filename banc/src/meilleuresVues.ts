// Un batiment, une fois (demande du proprietaire, 15 novembre 2026 : « Avoid having 2 times the same building »). Vu sur le vrai
// reseau : la meme maison revient dans cinq a dix 360 consecutifs, et les importer toutes n'apprend rien de plus au modele. Les vues
// gardees par le tri (facadesVues.ts) se regroupent par facade visee : le batiment (son identifiant de la BD TOPO) et le cote par
// lequel on le voit (les quatre faces d'une maison sont quatre facades, pas des doublons). Par defaut une seule vue par facade se
// propose, la mieux notee ; les autres restent visibles, decochees, marquees « doublon », dans une meme photo comme d'une photo a
// l'autre, avec ou sans parcelle visee. Une vue sans batiment (tri decoche, rien de vu) n'est jamais un doublon. Les vues choisies a
// la main ne sont jamais decochees : l'ecran dit seulement, avant l'import, combien de facades sont cochees deux fois. Sans DOM,
// testable seul (banc/tests/meilleuresVues.test.ts).

import { anneeEtMois, sansFeuilles } from './equilibre.js';
import { distanceM, type PhotoRue, type VueAExtraire } from './panoramax.js';

/** Combien de vues garder par facade (un batiment vu par un cote). */
export type VuesParBatiment = 1 | 2 | 3 | 'toutes';
export const VUES_PAR_BATIMENT: readonly VuesParBatiment[] = [1, 2, 3, 'toutes'];
export const VUES_PAR_BATIMENT_DEFAUT: VuesParBatiment = 1;
/**
 * Quand on garde plusieurs vues d'une facade, la suivante se prend d'ailleurs que les precedentes si c'est possible : deux 360 pris a
 * deux metres l'un de l'autre montrent la meme image.
 */
export const ECART_ENTRE_VUES_M = 6;

export interface VuesDUnePhoto {
  photo: Pick<PhotoRue, 'id' | 'lat' | 'lon'>;
  vues: readonly VueAExtraire[];
  /** Ses vues ne se regroupent pas : choisies a la main (jamais decochees ni deplacees). */
  libre?: boolean;
}

export const cleDeVue = (photo: string, rang: number): string => photo + '|' + rang;

/** La facade qu'une vue regarde : son batiment et le cote par lequel elle le voit ; null sans batiment (jamais un doublon). */
export const facadeDe = (v: Pick<VueAExtraire, 'batiment' | 'cote'>): string | null => (v.batiment ? v.batiment + '/' + (v.cote ?? 0) : null);

/**
 * Les vues en trop : pour chaque facade, celles au-dela des `n` meilleures. La mieux notee d'abord, puis (pour n > 1) la mieux notee
 * parmi celles prises a ECART_ENTRE_VUES_M au moins des vues deja retenues, puis les autres s'il reste de la place. Rend les cles des
 * doublons.
 */
export function doublons(photos: readonly VuesDUnePhoto[], n: VuesParBatiment): Set<string> {
  const out = new Set<string>();
  if (n === 'toutes') return out;
  const par = new Map<string, { cle: string; note: number; pos: { lat: number; lon: number } }[]>();
  for (const p of photos) {
    if (p.libre) continue;
    p.vues.forEach((v, k) => {
      const f = facadeDe(v);
      if (!f) return;
      const l = par.get(f) ?? [];
      l.push({ cle: cleDeVue(p.photo.id, k), note: v.note ?? 0, pos: p.photo });
      par.set(f, l);
    });
  }
  for (const l of par.values()) {
    // A note egale, l'ordre des cles : le choix ne depend pas de l'ordre d'arrivee des photos.
    const ordre = [...l].sort((a, b) => b.note - a.note || (a.cle < b.cle ? -1 : 1)), retenues: typeof l = [];
    for (const ecart of [ECART_ENTRE_VUES_M, 0]) {
      for (const c of ordre) if (retenues.length < n && !retenues.includes(c) && retenues.every((r) => distanceM(r.pos, c.pos) >= ecart)) retenues.push(c);
    }
    for (const c of ordre) if (!retenues.includes(c)) out.add(c.cle);
  }
  return out;
}

/**
 * Les facades cochees plus d'une fois, parmi les vues qui seront importees : un doublon coche a la main, deux vues choisies a la main
 * vers la meme maison. L'ecran le dit avant l'import, sans rien empecher.
 */
export function facadesEnDouble(vues: readonly Pick<VueAExtraire, 'batiment' | 'cote'>[]): number {
  const n = new Map<string, number>();
  for (const v of vues) { const f = facadeDe(v); if (f) n.set(f, (n.get(f) ?? 0) + 1); }
  return [...n.values()].filter((k) => k > 1).length;
}

/** Ce que le bouton d'import annonce : « Importer 12 façades de 9 bâtiments » ; sans batiment connu (tri decoche), les vues et les photos. */
export function texteDeLImport(vues: readonly Pick<VueAExtraire, 'batiment'>[], nPhotos: number): string {
  const batiments = new Set(vues.flatMap((v) => (v.batiment ? [v.batiment] : []))).size, s = (k: number) => (k > 1 ? 's' : '');
  if (!batiments) return `Importer ${vues.length} vue(s) de ${nPhotos} photo(s)`;
  return `Importer ${vues.length} façade${s(vues.length)} de ${batiments} bâtiment${s(batiments)}`;
}

/** Les vues d'une photo, celles en trop marquees « doublon ». */
export function marquer(photo: string, vues: readonly VueAExtraire[], enTrop: ReadonlySet<string>): VueAExtraire[] {
  return vues.map((v, k) => (enTrop.has(cleDeVue(photo, k)) ? { ...v, doublon: true } : v));
}

/**
 * Les vues d'une facade que le banc a deja (demande du proprietaire, 15 novembre 2026 : « Avoid having 2 times the same building ») :
 * marquees « deja dans le banc » et, comme un doublon, visibles mais pas proposees cochees. `murs` : les facades du banc (murs.ts).
 */
export function marquerDejaLa(vues: readonly VueAExtraire[], murs: ReadonlySet<string>): VueAExtraire[] {
  if (!murs.size) return [...vues];
  return vues.map((v) => { const f = facadeDe(v); return f && murs.has(f) ? { ...v, doublon: true, dejaLa: true } : v; });
}

/**
 * « Preferer l'hiver » (demande du proprietaire, 15 novembre 2026) : de novembre a mars (hemisphere nord) les arbres sont nus et la
 * facade se voit mieux. Quand un meme mur a des photos de plusieurs dates, celle d'hiver passe devant a qualite voisine : sa note gagne
 * quelques points, sans qu'aucune autre soit ecartee. Une photo sans date ne gagne ni ne perd rien.
 */
export const BONUS_HIVER = 8;
export function noteAvecSaison(note: number, date: string | null | undefined, preferer: boolean): number {
  const d = preferer ? anneeEtMois(date) : null;
  return d && sansFeuilles(d.mois) ? Math.min(100, note + BONUS_HIVER) : note;
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

export interface Comptes { photos: number; facades: number; batiments: number; doublons: number; /** Parmi les doublons, les vues d'une facade deja dans le banc. */ dejaLa?: number; ecartees: number; cachees?: number; cacheesEcartees?: boolean }

/** Les comptes de ce qui est propose : photos, vues a importer (facades), batiments regardes, vues en doublon. */
export function compter(vuesParPhoto: readonly (readonly VueAExtraire[])[], ecartees: number): Comptes {
  const batiments = new Set<string>();
  let facades = 0, enTrop = 0, dejaLa = 0;
  for (const vues of vuesParPhoto) for (const v of vues) { if (v.batiment) batiments.add(v.batiment); if (v.dejaLa) dejaLa++; if (v.doublon) enTrop++; else facades++; }
  return { photos: vuesParPhoto.length, facades, batiments: batiments.size, doublons: enTrop, ...(dejaLa ? { dejaLa } : {}), ecartees };
}

/** Ce que l'etat dit du tri : « 42 photos, 61 façades de 23 bâtiments, 30 doublons ; 118 écartées : route, campagne ou pas une maison ». */
export function texteDesComptes(c: Comptes): string {
  const s = (n: number) => (n > 1 ? 's' : '');
  // Les facades cachees (vueDegagee.ts) ne se disent que lorsqu'il y en a : comptees parmi les vues proposees, ou, leur case cochee,
  // dites parmi les raisons d'ecarter (les photos qui n'avaient qu'elles sont alors dans les ecartees).
  const cachees = c.cachees && !c.cacheesEcartees ? `, ${c.cachees} façade${s(c.cachees)} cachée${s(c.cachees)}` : '';
  const raisons = c.cachees && c.cacheesEcartees ? 'route, campagne, pas une maison ou façade cachée' : 'route, campagne ou pas une maison';
  return `${c.photos} photo${s(c.photos)}, ${c.facades} façade${s(c.facades)} de ${c.batiments} bâtiment${s(c.batiments)}, ${c.doublons} doublon${s(c.doublons)}${c.dejaLa ? ` dont ${c.dejaLa} déjà dans le banc` : ''}${cachees} ; ${c.ecartees} écartée${s(c.ecartees)} : ${raisons}`;
}

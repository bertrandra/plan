// Ce que l'import Panoramax propose (15 novembre 2026) : les vues de chaque photo apres le tri des facades (useFacades.ts), les doublons
// d'un meme batiment marques (meilleuresVues.ts), la liste dans l'ordre voulu, et ce que l'etat en dit. Les vues choisies a la main
// ne sont jamais deplacees, triees ni marquees : elles disent seulement leur batiment, pour que l'ecran signale une facade cochee deux
// fois. Avec ou sans parcelle visee, une facade (un batiment vu par un cote) ne se propose qu'une fois.

import { useCallback, useEffect, useMemo } from 'react';
import { cadreDeLaVue, type Retouche } from '../../cadrage.js';
import { aImporter, compter, doublons, estDoublon, marquer, marquerDejaLa, noteAvecSaison, ordonner, texteDesComptes, type Ordre, type VuesParBatiment } from '../../meilleuresVues.js';
import { vuesDesCaps, type PhotoRue, type VueAExtraire, type Visee } from '../../panoramax.js';
import type { Parcelle } from '../../parcelles.js';
import { noteAvecLecture } from '../../vueDegagee.js';
import { demanderLesLectures, lectureAttendue, lectureDe, useVersionDesLectures, type PhotoALire } from './lecturesVues.js';
import { useFacades, type Facades } from './useFacades.js';

export interface Reglages { visee: Visee; seulementFacades: boolean; parBatiment: VuesParBatiment; ordre: Ordre; ecarterCachees: boolean;
  /** Les facades que le banc a deja (murs.ts::mursDuBanc) : leurs vues ne se proposent plus cochees ; vide : le reglage est decoche. */
  dejaDansLeBanc: ReadonlySet<string>;
  /** Le cadre de chaque vue d'un 360 (cadrage.ts) : sur sa facade, face au mur, les retouches de la main ; et la preference pour l'hiver. */
  cadrer: boolean; surLeMur: boolean; hiver: boolean; retouches: ReadonlyMap<string, Retouche> }

export interface VuesTriees {
  /** Toutes les vues d'une photo, les doublons marques : ce que la liste et l'apercu montrent. */
  vuesDe: (p: PhotoRue) => VueAExtraire[];
  /** Les vues qui seront importees si la photo est cochee : ce que la carte dessine. */
  aImporterDe: (p: PhotoRue) => VueAExtraire[];
  /** Les photos proposees, dans l'ordre choisi (les doublons a la fin). */
  proposees: PhotoRue[];
  /** Les photos proposees dont toutes les vues sont des doublons. */
  enDoublon: ReadonlySet<string>;
  compte: string | null;
  tri: Facades;
}

const RIEN: VueAExtraire[] = [];

/**
 * Les vues d'une photo apres « la maison se voit-elle ? » (vueDegagee.ts) : une vue lue cachee le dit et perd la moitie de sa note,
 * ou part si l'on ecarte les facades cachees. Une vue pas encore lue (ou illisible) garde sa note. `cachees` : combien l'ont ete.
 */
function appliquerLesLectures(photo: PhotoRue, vuesGeometrie: readonly VueAExtraire[], ecarter: boolean, hiver: boolean): { vues: VueAExtraire[]; cachees: number } {
  let cachees = 0;
  // La preference pour l'hiver d'abord (une note de la geometrie), la lecture de l'image ensuite, sur les memes vues.
  const vues = vuesGeometrie.map((v) => (typeof v.note === 'number' ? { ...v, note: noteAvecSaison(v.note, photo.date, hiver) } : v));
  const out = vues.flatMap((v): VueAExtraire[] => {
    const l = v.zone ? lectureDe({ photo, vues: vuesGeometrie }, v.cap) : undefined;
    if (!l) return [v];
    if (l.cachee) cachees++;
    return l.cachee && ecarter ? [] : [{ ...v, cachee: l.cachee, note: noteAvecLecture(v.note ?? 0, l.cachee) }];
  });
  return { vues: out, cachees };
}

/**
 * Seules les premieres photos de la liste se lisent (celles qu'on a sous les yeux, les mieux notees) : chaque lecture telecharge la
 * version reduite d'un panoramique (300 a 500 ko), et une rue de Paris en propose des centaines.
 */
export const PHOTOS_LUES_MAX = 60;

/** Les photos dont une vue a importer attend sa lecture, dans l'ordre de la liste : la file ne lit que ce qui se propose. */
function useLecturesDemandees(proposees: readonly PhotoRue[], geometrie: ReadonlyMap<string, VueAExtraire[]>, aImporterDe: (p: PhotoRue) => VueAExtraire[], libres: ReadonlyMap<string, number[]>): void {
  useEffect(() => {
    const aLire: PhotoALire[] = [];
    for (const p of proposees.slice(0, PHOTOS_LUES_MAX)) {
      const vues = geometrie.get(p.id) ?? RIEN;
      if (!p.panoramique || !p.sd || libres.has(p.id) || !lectureAttendue({ photo: p, vues })) continue;
      if (aImporterDe(p).some((v) => v.zone)) aLire.push({ photo: p, vues });
    }
    demanderLesLectures(aLire);
  }, [proposees, geometrie, aImporterDe, libres]);
  useEffect(() => () => demanderLesLectures([]), []);
}

export function useVuesTriees(photos: readonly PhotoRue[], caps: ReadonlyMap<string, number[]>, parcelle: Parcelle | null, r: Reglages): VuesTriees {
  const tri = useFacades(photos, r.seulementFacades);
  const { vues: trier, etat } = tri, { visee, parBatiment, ordre } = r;
  // Les vues de chaque photo : choisies a la main (jamais triees), sinon celles qui montrent une facade.
  const geometrie = useMemo(() => new Map(photos.map((p) => { const m = caps.get(p.id), l = vuesDesCaps(p, m, visee); return [p.id, m ? tri.annoter(p, l) : trier(p, l, visee)]; })), [photos, caps, visee, trier, tri.annoter]);
  // Puis ce que l'image en dit, a mesure que les apercus sont lus (les vues choisies a la main n'ont pas de zone : jamais lues).
  const lectures = useVersionDesLectures(), ecarter = r.ecarterCachees;
  const { brutes, cachees } = useMemo(() => {
    const brutes = new Map<string, VueAExtraire[]>();
    let cachees = 0;
    for (const p of photos) { const a = appliquerLesLectures(p, geometrie.get(p.id) ?? RIEN, ecarter, r.hiver); brutes.set(p.id, a.vues); cachees += a.cachees; }
    return { brutes, cachees };
    // `lectures` : la version de la file, qui change a chaque apercu lu.
  }, [photos, geometrie, ecarter, lectures, r.hiver]);
  const tries = useMemo(() => {
    let attente = 0, triees = 0;
    const gardees = photos.filter((p) => {
      const e = caps.has(p.id) ? 'libre' : etat(p);
      if (e === 'attente') { attente++; return false; }
      if (e === 'triee') triees++;
      return e === 'libre' || (brutes.get(p.id) ?? RIEN).length > 0;
    });
    return { gardees, attente, triees };
  }, [photos, caps, etat, brutes]);
  const batiment = tri.batiment, { cadrer, surLeMur, retouches } = r;
  const cadrage = useMemo(() => ({ cadrer, surLeMur, retouches }), [cadrer, surLeMur, retouches]);
  const marquees = useMemo(() => {
    const enTrop = doublons(tries.gardees.map((p) => ({ photo: p, vues: brutes.get(p.id) ?? RIEN, libre: caps.has(p.id) })), parBatiment);
    const toutes = new Map<string, VueAExtraire[]>(), utiles = new Map<string, VueAExtraire[]>();
    // Une facade deja dans le banc ne se propose plus (les vues choisies a la main ne sont jamais decochees : elles restent).
    for (const p of tries.gardees) {
      const m = marquer(p.id, brutes.get(p.id) ?? RIEN, enTrop), deja = caps.has(p.id) ? m : marquerDejaLa(m, r.dejaDansLeBanc);
      // Le cadre de chaque vue d'un 360 : le meme pour l'apercu, le secteur de la carte et l'import.
      const l = p.panoramique ? deja.map((v) => ({ ...v, cadre: cadreDeLaVue(v.batiment ? batiment(v.batiment) : null, p, v, cadrage) })) : deja;
      toutes.set(p.id, l); utiles.set(p.id, aImporter(l));
    }
    return { toutes, utiles };
  }, [tries, brutes, caps, parBatiment, r.dejaDansLeBanc, batiment, cadrage]);
  const vuesDe = useCallback((p: PhotoRue) => marquees.toutes.get(p.id) ?? brutes.get(p.id) ?? RIEN, [marquees, brutes]);
  const aImporterDe = useCallback((p: PhotoRue) => marquees.utiles.get(p.id) ?? brutes.get(p.id) ?? RIEN, [marquees, brutes]);
  const visant = !!parcelle;
  const proposees = useMemo(() => ordonner(tries.gardees, vuesDe, ordre, visant), [tries, vuesDe, ordre, visant]);
  const enDoublon = useMemo(() => new Set(proposees.filter((p) => estDoublon(vuesDe(p))).map((p) => p.id)), [proposees, vuesDe]);
  useLecturesDemandees(proposees, geometrie, aImporterDe, caps);
  const compte = tries.attente ? 'Lecture des bâtiments (BD TOPO de l’IGN)…' : !tries.triees ? null : texteDesComptes({ ...compter(proposees.map(vuesDe), photos.length - proposees.length), cachees, cacheesEcartees: ecarter }) + '.';
  return { vuesDe, aImporterDe, proposees, enDoublon, compte, tri };
}

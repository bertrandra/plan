// Ce que l'import Panoramax propose (15 novembre 2026) : les vues de chaque photo apres le tri des facades (useFacades.ts), les doublons
// d'un meme batiment marques (meilleuresVues.ts), la liste dans l'ordre voulu, et ce que l'etat en dit. Les vues choisies a la main
// ne sont jamais deplacees, triees ni marquees ; celles qui regardent un batiment de la parcelle visee ne sont jamais des doublons.

import { useCallback, useMemo } from 'react';
import { aImporter, compter, doublons, estDoublon, marquer, ordonner, texteDesComptes, type Ordre, type VuesParBatiment } from '../../meilleuresVues.js';
import { vuesDesCaps, type PhotoRue, type VueAExtraire, type Visee } from '../../panoramax.js';
import { centre, distanceAParcelle, type Parcelle } from '../../parcelles.js';
import { useFacades, type Facades } from './useFacades.js';

export interface Reglages { visee: Visee; seulementFacades: boolean; parBatiment: VuesParBatiment; ordre: Ordre }

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

/** Les batiments (parmi ceux que des vues regardent) dont le milieu est sur la parcelle visee : leurs vues restent toutes. */
function batimentsDeLaParcelle(parcelle: Parcelle | null, vues: Iterable<readonly VueAExtraire[]>, tri: Facades): Set<string> {
  const out = new Set<string>();
  if (!parcelle) return out;
  for (const l of vues) for (const v of l) {
    if (!v.batiment || out.has(v.batiment)) continue;
    const c = tri.contour(v.batiment);
    if (c && distanceAParcelle(centre({ contour: c }), parcelle) === 0) out.add(v.batiment);
  }
  return out;
}

export function useVuesTriees(photos: readonly PhotoRue[], caps: ReadonlyMap<string, number[]>, parcelle: Parcelle | null, r: Reglages): VuesTriees {
  const tri = useFacades(photos, r.seulementFacades);
  const { vues: trier, etat } = tri, { visee, parBatiment, ordre } = r;
  // Les vues de chaque photo : choisies a la main (jamais triees), sinon celles qui montrent une facade.
  const brutes = useMemo(() => new Map(photos.map((p) => { const m = caps.get(p.id), l = vuesDesCaps(p, m, visee); return [p.id, m ? l : trier(p, l, visee)]; })), [photos, caps, visee, trier]);
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
  const marquees = useMemo(() => {
    const exemptes = batimentsDeLaParcelle(parcelle, brutes.values(), tri);
    const enTrop = doublons(tries.gardees.map((p) => ({ photo: p, vues: brutes.get(p.id) ?? RIEN, libre: caps.has(p.id) })), parBatiment, exemptes);
    const toutes = new Map<string, VueAExtraire[]>(), utiles = new Map<string, VueAExtraire[]>();
    for (const p of tries.gardees) { const l = marquer(p.id, brutes.get(p.id) ?? RIEN, enTrop); toutes.set(p.id, l); utiles.set(p.id, aImporter(l)); }
    return { toutes, utiles };
    // `tri` est un objet neuf a chaque rendu : sa version dit quand les contours des batiments ont change.
  }, [tries, brutes, caps, parBatiment, parcelle, tri.version]);
  const vuesDe = useCallback((p: PhotoRue) => marquees.toutes.get(p.id) ?? brutes.get(p.id) ?? RIEN, [marquees, brutes]);
  const aImporterDe = useCallback((p: PhotoRue) => marquees.utiles.get(p.id) ?? brutes.get(p.id) ?? RIEN, [marquees, brutes]);
  const visant = !!parcelle;
  const proposees = useMemo(() => ordonner(tries.gardees, vuesDe, ordre, visant), [tries, vuesDe, ordre, visant]);
  const enDoublon = useMemo(() => new Set(proposees.filter((p) => estDoublon(vuesDe(p))).map((p) => p.id)), [proposees, vuesDe]);
  const compte = tries.attente ? 'Lecture des bâtiments (BD TOPO de l’IGN)…' : !tries.triees ? null : texteDesComptes(compter(proposees.map(vuesDe), photos.length - proposees.length)) + '.';
  return { vuesDe, aImporterDe, proposees, enDoublon, compte, tri };
}

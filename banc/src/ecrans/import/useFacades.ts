// « Seulement les facades » (demande du proprietaire, 15 novembre 2026 : des facades de maison ou d'immeuble, pas la route ou la
// campagne) : les batiments de la BD TOPO lus la ou des photos sont montrees, et ce que chaque vue en voit (facadesVues.ts). Tant que les
// batiments d'une photo ne sont pas lus en entier, elle n'est pas triee : si la BD TOPO ne repond pas ou est tronquee, tout est propose
// et la carte le dit, jamais un tri silencieux sur des donnees partielles. Les batiments se lisent par cases, partagees avec la
// couverture grise de la carte (batimentsLus.ts).

import { useCallback, useEffect, useMemo } from 'react';
import { empriseAutour } from '../../carte.js';
import { casesDeLEmprise, cleDeCase, type Case } from '../../couvertureFacades.js';
import { annoter as annoterLesVues, DISTANCE_MAX_M, vuesDeFacade } from '../../facadesVues.js';
import type { PhotoRue, VueAExtraire } from '../../panoramax.js';
import type { Ll } from '../../parcelles.js';
import { BATIMENTS, useVersionDesBatiments } from './batimentsLus.js';

export const AVIS_BATIMENTS = 'Bâtiments indisponibles : toutes les photos sont proposées.';
export const AVIS_BATIMENTS_TRONQUES = 'Bâtiments tronqués (trop nombreux dans cette vue) : toutes les photos sont proposées. Rapprochez-vous pour ne garder que les façades.';

export interface Facades {
  /** Les vues d'une photo : celles de la visee quand le tri ne s'applique pas (case decochee, batiments pas lus), sinon celles qui montrent une facade. */
  vues: (p: PhotoRue, visee: VueAExtraire[], cle: string) => VueAExtraire[];
  /** « triee » : ses batiments sont lus ; « attente » : en cours de lecture ; « libre » : pas de tri (case decochee, ou batiments indisponibles). */
  etat: (p: PhotoRue) => 'triee' | 'attente' | 'libre';
  /** Ce que la carte doit dire quand le tri n'a pas pu se faire ; null quand il se fait. */
  avis: string | null;
  contour: (id: string) => Ll[] | null;
  /** Les vues choisies a la main, telles quelles, avec le batiment qu'elles regardent quand il est connu (jamais triees ni deplacees). */
  annoter: (p: PhotoRue, vues: VueAExtraire[]) => VueAExtraire[];
  /** Change quand les batiments lus changent : de quoi refaire ce qui depend du tri. */
  version: number;
}

export function useFacades(photos: readonly PhotoRue[], actif: boolean): Facades {
  const version = useVersionDesBatiments();
  // Les cases que touche la portee de chaque photo (ses batiments peuvent etre dans la case voisine).
  const parPhoto = useMemo(() => new Map(photos.map((p) => [p.id, casesDeLEmprise(empriseAutour(p, DISTANCE_MAX_M + 10))])), [photos]);
  const cases = useMemo(() => { const m = new Map<string, Case>(); if (actif) for (const l of parPhoto.values()) for (const c of l) m.set(cleDeCase(c), c); return m; }, [parPhoto, actif]);
  useEffect(() => {
    // Un court repos : la carte qui glisse change les photos plusieurs fois de suite.
    const t = setTimeout(() => BATIMENTS.vouloir('photos', [...cases.values()]), 150);
    return () => clearTimeout(t);
  }, [cases]);
  useEffect(() => () => BATIMENTS.vouloir('photos', []), []);

  const cles = useMemo(() => [...cases.keys()], [cases]);
  // La scene change avec la version du lecteur.
  const scene = useMemo(() => BATIMENTS.scene(cles), [cles, version]);
  // Le tri d'une photo se calcule une fois par jeu de batiments : la carte redessine ses secteurs a chaque image d'un glisser.
  const memoire = useMemo(() => new Map<string, VueAExtraire[]>(), [scene]);
  const parId = useMemo(() => new Map(scene.batiments.map((b) => [b.id, b.contour])), [scene]);
  const etat = useCallback((p: PhotoRue): 'triee' | 'attente' | 'libre' => {
    if (!actif) return 'libre';
    const etats = (parPhoto.get(p.id) ?? []).map((c) => BATIMENTS.etat(cleDeCase(c)));
    if (etats.every((e) => e === 'lue')) return 'triee';
    return etats.some((e) => e === 'panne' || e === 'tronquee') ? 'libre' : 'attente';
  // L'etat des cases change avec la version du lecteur.
  }, [actif, parPhoto, version]);
  const vues = useCallback((p: PhotoRue, visee: VueAExtraire[], cle: string): VueAExtraire[] => {
    if (etat(p) !== 'triee') return visee;
    const k = p.id + '|' + cle, garde = memoire.get(k);
    if (garde) return garde;
    const l = vuesDeFacade(scene, p, visee);
    memoire.set(k, l);
    return l;
  }, [etat, memoire, scene]);
  const annoter = useCallback((p: PhotoRue, l: VueAExtraire[]): VueAExtraire[] => (etat(p) === 'triee' ? annoterLesVues(scene, p, l) : l), [etat, scene]);
  const contour = useCallback((id: string) => parId.get(id) ?? null, [parId]);
  const avis = useMemo(() => {
    const etats = cles.map((c) => BATIMENTS.etat(c));
    return etats.includes('panne') ? AVIS_BATIMENTS : etats.includes('tronquee') ? AVIS_BATIMENTS_TRONQUES : null;
  // L'etat des cases change avec la version du lecteur.
  }, [cles, version]);
  return { vues, etat, avis, contour, annoter, version };
}

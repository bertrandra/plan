// « Seulement les facades » (demande du proprietaire, 15 novembre 2026 : des facades de maison ou d'immeuble, pas la route ou la
// campagne) : les batiments de la BD TOPO lus la ou des photos sont montrees, et ce que chaque vue en voit (facadesVues.ts). Tant que les
// batiments d'une photo ne sont pas lus en entier, elle n'est pas triee : si la BD TOPO ne repond pas ou est tronquee, tout est propose
// et la carte le dit, jamais un tri silencieux sur des donnees partielles.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Emprise } from '../../carte.js';
import { DISTANCE_MAX_M, lireLesBatiments, ranger, vuesDeFacade, type Batiment } from '../../facadesVues.js';
import type { PhotoRue, VueAExtraire } from '../../panoramax.js';
import type { Ll } from '../../parcelles.js';

/** Les batiments gardes en memoire en se promenant : au-dela, on ne garde que ceux de la derniere lecture. */
const BATIMENTS_MAX = 12000;
export const AVIS_BATIMENTS = 'Bâtiments indisponibles : toutes les photos sont proposées.';
export const AVIS_BATIMENTS_TRONQUES = 'Bâtiments tronqués (trop nombreux dans cette vue) : toutes les photos sont proposées. Rapprochez-vous pour ne garder que les façades.';

async function lireJson(url: string): Promise<unknown> {
  const r = await fetch(url);
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.json();
}

const dans = (e: Emprise, p: Ll) => p.lat >= e.sud && p.lat <= e.nord && p.lon >= e.ouest && p.lon <= e.est;

/** L'emprise des photos, et la meme agrandie de la portee d'une vue (les batiments qu'elles peuvent regarder). */
function emprises(photos: readonly Ll[]): { couverte: Emprise; lue: Emprise } {
  const couverte = { sud: Math.min(...photos.map((p) => p.lat)), nord: Math.max(...photos.map((p) => p.lat)), ouest: Math.min(...photos.map((p) => p.lon)), est: Math.max(...photos.map((p) => p.lon)) };
  const marge = (DISTANCE_MAX_M + 10) / 111320, lat = (couverte.sud + couverte.nord) / 2, mLon = marge / Math.cos((lat * Math.PI) / 180);
  return { couverte, lue: { sud: couverte.sud - marge, nord: couverte.nord + marge, ouest: couverte.ouest - mLon, est: couverte.est + mLon } };
}

export interface Facades {
  /** Les vues d'une photo : celles de la visee quand le tri ne s'applique pas (case decochee, batiments pas lus), sinon celles qui montrent une facade. */
  vues: (p: PhotoRue, visee: VueAExtraire[], cle: string) => VueAExtraire[];
  /** « triee » : ses batiments sont lus ; « attente » : en cours de lecture ; « libre » : pas de tri (case decochee, ou batiments indisponibles). */
  etat: (p: PhotoRue) => 'triee' | 'attente' | 'libre';
  /** Ce que la carte doit dire quand le tri n'a pas pu se faire ; null sinon. */
  avis: string | null;
  contour: (id: string) => Ll[] | null;
}

export function useFacades(photos: readonly PhotoRue[], actif: boolean): Facades {
  const [batiments, setBatiments] = useState<Batiment[]>([]);
  // Les emprises dont tous les batiments sont lus : une photo qui s'y trouve peut etre triee.
  const [lues, setLues] = useState<Emprise[]>([]);
  const [lecture, setLecture] = useState<'repos' | 'lecture' | 'panne' | 'tronque'>('repos');
  const tour = useRef(0);
  const gardes = useRef<Batiment[]>([]);
  const aLire = useMemo(() => (actif ? photos.filter((p) => !lues.some((e) => dans(e, p))) : []), [photos, lues, actif]);
  useEffect(() => {
    if (!aLire.length) { tour.current++; setLecture('repos'); return; }
    const moi = ++tour.current, { couverte, lue } = emprises(aLire);
    setLecture('lecture');
    // Un court repos : la carte qui glisse change les photos plusieurs fois de suite.
    const t = setTimeout(() => {
      lireLesBatiments(lue, lireJson).then((r) => {
        if (moi !== tour.current) return;
        if (r.tronque) { setLecture('tronque'); return; }
        const vus = new Set(gardes.current.map((b) => b.id)), neufs = r.batiments.filter((b) => !vus.has(b.id));
        if (gardes.current.length + neufs.length <= BATIMENTS_MAX) { gardes.current = [...gardes.current, ...neufs]; setLues((e) => [...e, couverte]); }
        else { gardes.current = r.batiments; setLues([couverte]); }
        setBatiments(gardes.current);
        setLecture('repos');
      }).catch(() => { if (moi === tour.current) setLecture('panne'); });
    }, 150);
    return () => clearTimeout(t);
  }, [aLire]);

  const scene = useMemo(() => ranger(batiments), [batiments]);
  // Le tri d'une photo se calcule une fois par jeu de batiments : la carte redessine ses secteurs a chaque image d'un glisser.
  const memoire = useMemo(() => new Map<string, VueAExtraire[]>(), [scene]);
  const parId = useMemo(() => new Map(batiments.map((b) => [b.id, b.contour])), [batiments]);
  const etat = useCallback((p: PhotoRue): 'triee' | 'attente' | 'libre' => {
    if (!actif) return 'libre';
    if (lues.some((e) => dans(e, p))) return 'triee';
    return lecture === 'lecture' || lecture === 'repos' ? 'attente' : 'libre';
  }, [actif, lues, lecture]);
  const vues = useCallback((p: PhotoRue, visee: VueAExtraire[], cle: string): VueAExtraire[] => {
    if (etat(p) !== 'triee') return visee;
    const k = p.id + '|' + cle, garde = memoire.get(k);
    if (garde) return garde;
    const l = vuesDeFacade(scene, p, visee);
    memoire.set(k, l);
    return l;
  }, [etat, memoire, scene]);
  const contour = useCallback((id: string) => parId.get(id) ?? null, [parId]);
  const avis = !actif || !aLire.length ? null : lecture === 'panne' ? AVIS_BATIMENTS : lecture === 'tronque' ? AVIS_BATIMENTS_TRONQUES : null;
  return { vues, etat, avis, contour };
}

/** Ce que l'etat dit du tri : « 42 photos, 61 façades ; 118 écartées : route ou campagne ». */
export function compteDesFacades(nPhotos: number, nFacades: number, nEcartees: number): string {
  const s = (n: number) => (n > 1 ? 's' : '');
  return `${nPhotos} photo${s(nPhotos)}, ${nFacades} façade${s(nFacades)} ; ${nEcartees} écartée${s(nEcartees)} : route ou campagne`;
}

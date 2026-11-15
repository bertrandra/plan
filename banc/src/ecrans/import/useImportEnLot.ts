// Le controleur de l'import d'une zone en lot (demande du proprietaire, 15 novembre 2026, « niveau suivant » n° 6) : la zone (dessinee,
// ou une commune, ou autour d'un point), la cible, le parcours a debit borne (lot.ts) et son avancement, le recapitulatif et sa planche
// d'apercus, puis l'import en tache de fond avec sa jauge. Rien de ce qui est trouve ou importe ne se perd a un arret ou une panne :
// le parcours reprend a son pave, et l'import ne refait que ce que le banc n'a pas.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Banc } from '../../App.js';
import { api, ErreurApi } from '../../api.js';
import { tirerLaVue } from '../../cadrage.js';
import { liberer, versCanevas } from '../../images.js';
import { batimentsDuBanc, CIBLE_DEFAUT, CIBLE_MAX, ErreurHttp, lireCommune, Parcours, recapituler, SURFACE_MAX_KM2, surfaceKm2, urlCommune, urlContourDeCommune, zoneAutour, zoneDuContour, type Avance, type Candidat, type Zone } from '../../lot.js';
import { mursDuBanc } from '../../murs.js';
import { coordonneesTapees, ecartAngle, type PhotoRue, type VueAExtraire } from '../../panoramax.js';
import { importerVues } from './importerVues.js';
import { lirePano } from './panoramiques.js';

/** Les apercus de la planche du recapitulatif, au plus : chacun telecharge la version reduite d'un panoramique (300 a 500 ko). */
export const APERCUS_DE_LA_PLANCHE = 12;
/** La pause entre deux apercus de la planche, en millisecondes : pas de rafale sur les serveurs d'images. */
const PAUSE_APERCU_MS = 500;

async function lireJson(url: string): Promise<unknown> {
  const r = await fetch(url);
  if (!r.ok) throw new ErreurHttp(r.status);
  return r.json();
}
const attendre = (ms: number) => new Promise<void>((ok) => setTimeout(ok, ms));
const cleDe = (c: Candidat) => c.photo.id + '|' + Math.round(c.vue.cap);

export type OutilDeZone = 'main' | 'rectangle' | 'polygone';

export function useImportEnLot(banc: Banc) {
  const [zone, setZoneBrute] = useState<Zone | null>(null);
  const [cible, setCibleBrute] = useState(CIBLE_DEFAUT);
  const [outil, setOutil] = useState<OutilDeZone>('main');
  const [avance, setAvance] = useState<Avance | null>(null);
  const [retenues, setRetenues] = useState<Candidat[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);
  // Personne ne regarde un lot vue par vue : une facade lue cachee (haie, arbres) n'est pas importee, et l'ecran dit combien.
  const [ecarterCachees, setEcarterCachees] = useState(true);
  const [ecartees, setEcartees] = useState<Set<string>>(new Set());
  const [planche, setPlanche] = useState<Map<string, string>>(new Map());
  const [import_, setImport] = useState<{ fait: number; total: number } | null>(null);
  const parcours = useRef<Parcours | null>(null);
  const arretImport = useRef(false), arretPlanche = useRef(0);

  const setZone = useCallback((z: Zone | null) => { parcours.current?.arreter(); parcours.current = null; arretPlanche.current++; setZoneBrute(z); setAvance(null); setRetenues([]); setEcartees(new Set()); setPlanche(new Map()); setMessage(null); }, []);
  // Une autre cible : un autre lot (le parcours repart, ce qui etait trouve est oublie).
  const setCible = (n: number) => { if (enCours) return; parcours.current = null; setAvance(null); setRetenues([]); setCibleBrute(Math.max(1, Math.min(CIBLE_MAX, Math.round(n) || CIBLE_DEFAUT))); };
  // Une zone demandee d'ailleurs (« Ou importer ensuite », ecran d'equilibre) : elle se pose ici, une fois.
  const demandee = banc.zoneDemandee, oublier = banc.demanderZone;
  useEffect(() => { if (demandee) { setZone(demandee); oublier(null); } }, [demandee, oublier, setZone]);

  /** Des coordonnees : un pave autour du point ; sinon le nom d'une commune : son contour (geocodage puis WFS de la Geoplateforme). */
  const viser = async (texte: string) => {
    const ici = coordonneesTapees(texte);
    if (ici) { setZone(zoneAutour(ici)); return; }
    if (!texte.trim()) { setMessage('Tapez le nom d’une commune, ou des coordonnées (48.90507, 2.13254), ou dessinez la zone sur la carte.'); return; }
    setMessage('Recherche de la commune…');
    try {
      const c = lireCommune(await lireJson(urlCommune(texte)));
      if (!c) { setMessage('Commune introuvable.'); return; }
      const z = zoneDuContour(await lireJson(urlContourDeCommune(c.code)), c.nom);
      if (z) setZone(z); else setMessage(`Le contour de ${c.nom} n’a pas pu être lu.`);
    } catch (e) { setMessage('Recherche impossible : ' + (e as Error).message); }
  };

  const occupe = enCours || !!import_;
  /** Lance le parcours, ou le reprend ou il en etait. Les batiments que le banc a deja sont ecartes d'entree. */
  const parcourir = async () => {
    if (!zone) return;
    if (surfaceKm2(zone) > SURFACE_MAX_KM2) { setMessage(`Zone trop grande pour un lot (${Math.round(surfaceKm2(zone))} km², ${SURFACE_MAX_KM2} au plus) : rapprochez-vous et dessinez-la plus petite, ou visez une commune.`); return; }
    arretPlanche.current++;
    const p = parcours.current ??= new Parcours(zone, cible, batimentsDuBanc(mursDuBanc(banc.images).keys()), { lire: lireJson, attendre, relais: api.relais }, (a) => { setAvance(a); });
    setEnCours(true); setMessage(null);
    try { setAvance(await p.lancer()); } catch (e) { setMessage('Parcours interrompu : ' + (e as Error).message); } finally { setEnCours(false); }
    setRetenues(p.selection.retenues());
  };

  // Ce qui reste a importer : les facades retenues que le banc n'a pas encore (la meme photo au meme cap, a 5 degres pres).
  const restantes = useMemo(() => {
    const faites = banc.images.flatMap((m) => (m.panoramax?.id ? [{ id: m.panoramax.id, cap: m.panoramax.cap ?? m.azimut ?? null }] : []));
    return retenues.filter((c) => !ecartees.has(cleDe(c)) && !faites.some((f) => f.id === c.photo.id && (f.cap === null || Math.abs(ecartAngle(f.cap, c.vue.cap)) < 5)));
  }, [retenues, banc.images, ecartees]);

  /** La planche : les premieres facades retenues, telles qu'elles seront importees, lues une a une sur les versions reduites. */
  const voirLaPlanche = async () => {
    const tour = ++arretPlanche.current, arret = new AbortController();
    for (const c of retenues.filter((x) => x.photo.panoramique && x.photo.sd).slice(0, APERCUS_DE_LA_PLANCHE)) {
      if (tour !== arretPlanche.current) break;
      if (planche.has(cleDe(c))) continue;
      try {
        const pano = await lirePano(c.photo.sd as string, arret.signal), canevas = versCanevas(tirerLaVue(pano, c.photo.azimut ?? 0, c.vue.cap, c.vue.cadre, 320, 240));
        const url = canevas.toDataURL('image/jpeg', 0.8);
        liberer(canevas);
        if (tour === arretPlanche.current) setPlanche((m) => new Map(m).set(cleDe(c), url));
      } catch { /* un apercu manquant ne gene pas l'import : sa case reste vide */ }
      await attendre(PAUSE_APERCU_MS);
    }
  };

  /** L'import des facades qui restent, photo apres photo ; une photo en erreur est dite, les autres continuent, et l'on peut reprendre. */
  const importer = async () => {
    const l = restantes;
    if (!l.length || import_) return;
    const photos: PhotoRue[] = [], vues = new Map<string, VueAExtraire[]>(), batiments = new Map(l.map((c) => [c.batiment.id, c.batiment]));
    for (const c of l) { if (!vues.has(c.photo.id)) { photos.push(c.photo); vues.set(c.photo.id, []); } vues.get(c.photo.id)?.push(c.vue); }
    arretImport.current = false;
    const cachees = new Set<string>();
    setImport({ fait: 0, total: photos.length });
    try {
      const ok = await importerVues(banc, photos, (p) => vues.get(p.id) ?? [], { adresse: null, parcelle: null, batiment: (id) => batiments.get(id) ?? null, marquage: null, ecarterCachees }, () => {},
        { avance: (fait, total) => setImport({ fait, total }), arret: () => arretImport.current, cachee: (photo, cap) => { cachees.add(photo + '|' + Math.round(cap)); } });
      // Une facade lue cachee n'est plus a importer : elle sort du lot, pour ne pas etre reproposee a la reprise.
      if (cachees.size) setEcartees((e) => new Set([...e, ...cachees]));
      setMessage(`${ok} façade(s) importée(s)${cachees.size ? ` ; ${cachees.size} écartée(s) : façade cachée (haie, arbres, lue dans l’image)` : ''}${arretImport.current ? ', import arrêté' : ''}${zone?.nom ? ` (${zone.nom})` : ''}.`);
    } catch (e) {
      setMessage(e instanceof ErreurApi && e.statut === 401 ? 'Session expirée : reconnectez-vous, puis reprenez l’import (ce qui est importé est gardé).' : 'Import interrompu : ' + (e as Error).message + ' Ce qui est importé est gardé.');
    } finally { setImport(null); await banc.relire(); }
  };

  return {
    zone, setZone, cible, setCible, outil, setOutil, viser, avance, enCours, occupe, parcourir, arreter: () => parcours.current?.arreter(), parcours: parcours.current,
    ecarterCachees, setEcarterCachees, ecartees: ecartees.size, retenues, restantes, recap: useMemo(() => recapituler(retenues), [retenues]), planche, voirLaPlanche, cleDe, message,
    import: import_, importer, arreterLImport: () => { arretImport.current = true; },
  };
}

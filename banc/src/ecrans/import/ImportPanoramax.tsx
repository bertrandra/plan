// Etape 1b : les photos de rue Panoramax, depuis la carte. On part de la France entiere et l'on zoome jusqu'a la rue, ou l'on tape une
// adresse et la carte y va (demande du proprietaire, 15 novembre 2026). L'adresse (le geocodage de la Geoplateforme, plusieurs propositions), puis
// sa parcelle au cadastre de l'IGN (le Parcellaire Express, par le WFS de la Geoplateforme : on peut en choisir une autre sur la carte, CarteImport.tsx),
// puis les photos prises autour de la parcelle et qui la regardent. Un panoramique 360 donne une vue de chaque cote de la rue (a 90 degres
// du sens de la prise de vue, la ou sont les facades), le seul cote de la parcelle, ou la vue droit vers elle.

import { useCallback, useMemo, useRef, useState } from 'react';
import type { Banc } from '../../App.js';
import { api, ErreurApi, lireImage } from '../../api.js';
import { bitmap, COTE_SOURCE, jpeg, liberer, pixels, reduire, versCanevas, vignette } from '../../images.js';
import { contient, elargir, empriseAutour, largeurM, milieuEmprise, type Emprise } from '../../carte.js';
import { VUES_PAR_BATIMENT_DEFAUT, type Ordre, type VuesParBatiment } from '../../meilleuresVues.js';
import { CHAMP_VUE, distanceM, lirePhotos, trouverAdresses, urlRecherche, urlRechercheEmprise, type Adresse, type PhotoRue, type VueAExtraire, type Visee } from '../../panoramax.js';
import { centre, lireLesParcelles, parcelleDuPoint, rapporterALaParcelle, type Parcelle } from '../../parcelles.js';
import { vueDuPanoramique } from '../../equirect.js';
import type { Batiment } from '../../facadesVues.js';
import { murDeVue } from '../../murVise.js';
import { mursDuBanc } from '../../murs.js';
import type { MetaImage, MurDeVue } from '../../types.js';
import { ApercuPhoto } from './ApercuPhoto.js';
import { CarteImport } from './CarteImport.js';
import { FenetreDesVues, ListePhotos } from './ListePhotos.js';
import { TANGAGE } from './panoramiques.js';
import { useRelais } from './useRelais.js';
import { useVuesTriees } from './useVuesTriees.js';
import { nomDuLot } from './useImport.js';

/** Lit un JSON, en erreur sur une reponse qui n'est pas 2xx (un 504 du geocodage passe au repli). `signal` : pour l'abandonner. */
async function lireJson(url: string, signal?: AbortSignal): Promise<unknown> {
  const r = await fetch(url, signal ? { signal } : undefined);
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.json();
}

/** Les parcelles lues d'abord autour de l'adresse : le rayon de recherche et de quoi voir la rue et les voisines ; la carte lit ensuite ce qu'elle montre. */
const portee = (rayon: number) => Math.max(150, rayon + 80);
/**
 * Ce qui se lit selon le zoom, pour ne pas inonder les serveurs (demande du proprietaire, 15 novembre 2026 : on part de la carte de
 * France) : les rues viennent du fond a tous les niveaux ; le cadastre a partir d'une vue de rue, les photos d'une vue de quartier.
 */
const LARGEUR_CADASTRE_MAX_M = 1600;
const LARGEUR_PHOTOS_MAX_M = 600;
/** Les photos d'une vue, au plus : au-dela, la carte le dit et l'on se rapproche. */
const LIMITE_PHOTOS_VUE = 500;
/** Les parcelles gardees en memoire en se promenant : au-dela, on ne garde que celles de la vue. */
const PARCELLES_MAX = 5000;
/** Sans parcelle visee, une photo garde le libelle de l'adresse cherchee si elle en est proche ; plus loin, il ne dirait rien d'elle. */
const PROCHE_DE_L_ADRESSE_M = 300;
const AVIS_TRONQUE = 'Cadastre tronqué : toutes les parcelles de cette vue n’ont pas pu être lues. Rapprochez-vous pour voir les autres.';
const AVIS_PANNE = 'Cadastre de l’IGN indisponible : la carte ne montre pas toutes les parcelles.';

const RIEN_DEJA: ReadonlySet<string> = new Set();

interface Contexte { adresse: Adresse | null; parcelle: Parcelle | null; /** Le batiment lu d'une vue (BD TOPO), pour ecrire son mur dans les metadonnees. */ batiment: (id: string) => Batiment | null }

/** Le mur d'une vue, pour ses metadonnees : rien quand le tri n'a pas dit son batiment (case decochee, BD TOPO en panne). */
function murDeLaVue(ctx: Contexte, p: PhotoRue, v: VueAExtraire): { mur?: MurDeVue } {
  const b = v.batiment ? ctx.batiment(v.batiment) : null;
  return b && typeof v.cote === 'number' ? { mur: murDeVue(b, p, { cap: v.cap, cote: v.cote, note: v.note, distanceFacade: v.distanceFacade }, p.panoramique ? CHAMP_VUE : Math.min(120, p.champ)) } : {};
}

/** Importe les vues des photos choisies (une ou deux par panoramique) ; rend le nombre de vues importees. */
async function importerVues(banc: Banc, photos: readonly PhotoRue[], vuesDe: (p: PhotoRue) => VueAExtraire[], ctx: Contexte, dire: (t: string) => void): Promise<number> {
  const lot = nomDuLot('panoramax');
  let ok = 0, n = 0;
  for (const p of photos) {
    dire(`Import ${++n} sur ${photos.length}…`);
    // L'adresse et la parcelle d'aujourd'hui quand on les connait ; sans parcelle visee, l'adresse ne vaut que pour les photos prises pres d'elle.
    const adresse = ctx.adresse && (ctx.parcelle || distanceM(p, ctx.adresse) <= PROCHE_DE_L_ADRESSE_M) ? ctx.adresse.libelle : null;
    try {
      // En direct pour un hote liste, par le relais du serveur sinon : en erreur, la raison que le serveur donne.
      const b = await bitmap(await lireImage(p.hd));
      // Le panoramique se lit une fois pour toutes ses vues ; 75 degres de champ, un peu vers le haut, comme on vise une facade.
      // 6000 px de large au plus, et PIXELS_MAX au plus (Safari laisse vide un canevas plus grand : 5650 x 2825).
      let pano: ReturnType<typeof pixels> | null = null;
      if (p.panoramique) { const cp = reduire(b, 6000); try { pano = pixels(cp); } finally { liberer(cp); } }
      for (const v of vuesDe(p)) {
        const c = pano ? versCanevas(vueDuPanoramique(pano, { capCentre: p.azimut ?? 0, cap: v.cap, tangage: TANGAGE, champ: CHAMP_VUE, largeur: 1600, hauteur: 1200 })) : reduire(b, COTE_SOURCE);
        try {
          await api.importer(await jpeg(c, 0.92), await vignette(c), {
            source: 'panoramax', nom: 'panoramax-' + p.id.slice(0, 8) + (v.vue === 'gauche' || v.vue === 'droite' ? '-' + v.vue : v.vue === 'choisie' ? '-' + Math.round(v.cap) : ''), date: p.date, lat: p.lat, lon: p.lon, azimut: v.cap,
            panoramax: { id: p.id, collection: p.collection, panoramique: p.panoramique, cap: v.cap, vue: v.vue }, auteur: p.auteur, licence: p.licence,
            adresse, parcelle: ctx.parcelle?.idu ?? null, lot,
            // Le mur que la vue montre (demande du proprietaire, 15 novembre 2026) : de quoi ne pas le reimporter et le regrouper ensuite.
            ...murDeLaVue(ctx, p, v),
          });
          ok++;
        } catch (e) {
          if (!(e instanceof ErreurApi && e.statut === 409)) throw e;
        } finally { liberer(c); }
      }
      b.close();
    } catch (e) {
      banc.dire(`Photo ${p.id.slice(0, 8)} : ${(e as Error).message}`, 'erreur');
    }
  }
  dire(`${ok} vue(s) importée(s), lot ${lot}.`);
  return ok;
}

/**
 * Le cadastre de ce que la carte montre : les parcelles lues, ce qu'on en a deja lu (pour ne pas relire), et ce qu'il faut en dire.
 * `lire` lit une emprise et ajoute ses parcelles ; `repartir` oublie tout pour une nouvelle adresse.
 */
function useCadastre() {
  const [parcelles, setParcelles] = useState<Parcelle[]>([]);
  const [avis, setAvis] = useState<string | null>(null);
  const lues = useRef<{ e: Emprise; tronque: boolean }[]>([]);
  const tour = useRef(0);
  const lire = useCallback(async (e: Emprise, garder?: string | null): Promise<Parcelle[]> => {
    const connue = lues.current.find((x) => contient(x.e, e));
    if (connue) { setAvis(connue.tronque ? AVIS_TRONQUE : null); return []; }
    const moi = ++tour.current;
    try {
      const r = await lireLesParcelles(e, lireJson);
      if (moi !== tour.current) return [];
      setParcelles((l) => {
        const vues = new Set(l.map((p) => p.idu)), neuves = r.parcelles.filter((p) => !vues.has(p.idu));
        if (l.length + neuves.length <= PARCELLES_MAX) { lues.current.push({ e, tronque: r.tronque }); return [...l, ...neuves]; }
        // Trop de parcelles gardees en se promenant : celles de cette vue, et la parcelle visee.
        lues.current = [{ e, tronque: r.tronque }];
        const ici = new Set(r.parcelles.map((p) => p.idu));
        return [...l.filter((p) => p.idu === garder && !ici.has(p.idu)), ...r.parcelles];
      });
      setAvis(r.tronque ? AVIS_TRONQUE : null);
      return r.parcelles;
    } catch {
      if (moi === tour.current) setAvis(AVIS_PANNE);
      return [];
    }
  }, []);
  const repartir = useCallback(() => { tour.current++; lues.current = []; setParcelles([]); setAvis(null); }, []);
  return { parcelles, avis, lire, repartir, taire: useCallback(() => setAvis(null), []) };
}

/** La photo montree dans l'apercu : celle qu'on survole, sinon celle qu'on a epinglee en la touchant. */
function useApercu() {
  const [survol, setSurvol] = useState<string | null>(null);
  const [epingle, setEpingle] = useState<string | null>(null);
  // Le survol passe d'un point a l'autre ; quitter un point garde son apercu tant qu'aucune photo n'est epinglee (sinon on revient a elle).
  const survoler = useCallback((id: string | null) => setSurvol((s) => id ?? (epingle ? null : s)), [epingle]);
  return { survol, epingle, setSurvol, setEpingle, survoler };
}

/**
 * Les photos cochees. `choix` : toutes, d'office (celles qui regardent la parcelle visee) ou par un geste ; `forcees` : celles cochees
 * par un geste (touchee, « Avec les doublons »). Une photo toute en doublons n'est cochee que si on l'a demandee : la cocher d'office
 * importerait ce que le regroupement par batiment vient d'ecarter.
 */
function useChoix() {
  const [choix, setChoix] = useState<Set<string>>(new Set());
  const [forcees, setForcees] = useState<Set<string>>(new Set());
  const choix$ = useRef(choix); choix$.current = choix;
  const poser = useCallback((ids: Iterable<string>, geste = false) => { const s = new Set(ids); setChoix(s); setForcees(geste ? s : new Set()); }, []);
  const mettre = useCallback((id: string, oui: boolean) => {
    const avec = (c: Set<string>) => { const t = new Set(c); if (oui) t.add(id); else t.delete(id); return t; };
    setChoix(avec); setForcees(avec);
  }, []);
  return { choix, forcees, choix$, poser, mettre };
}

const CLE_CACHEES = 'banc.import.ecarterCachees';

/**
 * « Écarter les façades cachées » : decochee par defaut. La lecture de l'image (vueDegagee.ts) dit juste 65 fois sur 76 sur ses
 * temoins : assez pour declasser une vue et le dire, pas assez pour en ecarter une sur huit a tort sans qu'on l'ait demande. Qui la
 * coche la retrouve cochee.
 */
function useEcarterCachees(): [boolean, (v: boolean) => void] {
  const [v, setV] = useState(() => { try { return localStorage.getItem(CLE_CACHEES) === 'oui'; } catch { return false; } });
  return [v, (n) => { setV(n); try { localStorage.setItem(CLE_CACHEES, n ? 'oui' : 'non'); } catch { /* preference non gardee, sans gravite */ } }];
}

/**
 * Un mur deja dans le banc ne se propose plus coche (demande du proprietaire, 15 novembre 2026 : « Avoid having 2 times the same
 * building ») : c'est la regle par defaut, que la case de la liste leve. `dejaDansLeBanc` : les murs a ecarter (aucun, case decochee).
 */
function useMursDejaLa(images: readonly MetaImage[]) {
  const [ecarterDejaLa, setEcarterDejaLa] = useState(true);
  const mursDeja = useMemo(() => new Set(mursDuBanc(images).keys()), [images]);
  const dejaDansLeBanc = useMemo(() => (ecarterDejaLa ? mursDeja : RIEN_DEJA), [ecarterDejaLa, mursDeja]);
  return { ecarterDejaLa, setEcarterDejaLa, mursDeja, dejaDansLeBanc };
}

/** L'aide, le champ d'adresse et ses reglages, et les adresses que le geocodage propose. */
function Recherche({ texte, setTexte, rayon, setRayon, visees, setVisees, facades, setFacades, cachees, setCachees, visee, setVisee, propositions, adresse, onChercher, onAdresse }: {
  texte: string; setTexte: (t: string) => void; rayon: number; setRayon: (r: number) => void; visees: boolean; setVisees: (v: boolean) => void; facades: boolean; setFacades: (v: boolean) => void; cachees: boolean; setCachees: (v: boolean) => void;
  visee: Visee; setVisee: (v: Visee) => void; propositions: Adresse[]; adresse: Adresse | null; onChercher: () => void; onAdresse: (a: Adresse) => void;
}) {
  return (
    <>
      <p className="aide">Partez de la carte de France et zoomez jusqu’à la rue, ou tapez une adresse : la carte y va. À l’échelle d’un quartier, les photos de rue libres de la vue s’affichent ; touchez une parcelle du cadastre pour la viser (les photos prises autour d’elle et qui la regardent), touchez-la encore pour la lâcher. « Seulement les façades » ne propose que les vues où une maison ou un immeuble est dans le cadre (ni garage, ni hangar, ni local technique), tourne chaque vue d’un 360 vers sa façade et lui donne une note ; un même bâtiment n’est proposé qu’une fois, par sa meilleure vue. L’aperçu de chaque vue proposée est ensuite lu : une façade derrière une haie, des arbres ou une clôture est dite « façade cachée » et passe après les autres.</p>
      <form className="rang" onSubmit={(e) => { e.preventDefault(); onChercher(); }}>
        <input className="large" aria-label="Adresse ou coordonnées" placeholder="2 allée des Limites, Le Vésinet — ou 48.90507, 2.13254" value={texte} onChange={(e) => setTexte(e.target.value)} />
        <label>Rayon <input type="number" min={5} max={300} value={rayon} onChange={(e) => setRayon(Number(e.target.value))} /> m</label>
        <label className="case"><input type="checkbox" checked={visees} onChange={(e) => setVisees(e.target.checked)} /> Qui regardent la parcelle</label>
        <label className="case" title="Ne proposer que les vues où une maison ou un immeuble (BD TOPO de l’IGN) est dans le cadre, à portée : ni la route, ni la campagne, ni un garage ou un local technique."><input type="checkbox" checked={facades} onChange={(e) => setFacades(e.target.checked)} /> Seulement les façades</label>
        <label className="case" title="La façade est lue dans l’aperçu de chaque vue proposée : une haie, des arbres ou une clôture devant elle la disent « façade cachée », et sa note baisse de moitié. Cochée, ces vues ne sont plus proposées. La lecture se trompe environ une fois sur sept."><input type="checkbox" checked={cachees} disabled={!facades} onChange={(e) => setCachees(e.target.checked)} /> Écarter les façades cachées</label>
        <label>Panoramiques 360
          <select value={visee} onChange={(e) => setVisee(e.target.value as Visee)}>
            <option value="cotes">Les deux côtés de la rue (90°)</option>
            <option value="cote-adresse">Le côté de la parcelle (90°)</option>
            <option value="adresse">Droit vers la parcelle</option>
          </select>
        </label>
        <button type="submit" className="principal">Chercher</button>
      </form>
      {propositions.length > 1 && (
        <div className="rang" role="group" aria-label="Adresses proposées">
          {propositions.map((a) => <button key={a.libelle + a.lat} type="button" className={a === adresse ? 'onglet actif' : 'onglet'} onClick={() => onAdresse(a)}>{a.libelle}</button>)}
        </div>
      )}
    </>
  );
}

/** La parcelle visee, dite en clair sous la carte, et le geste pour la lacher (le meme que la toucher encore sur la carte). */
function ParcelleVisee({ parcelle, onLacher }: { parcelle: Parcelle; onLacher: () => void }) {
  return (
    <p className="aide parcelle-visee">Parcelle visée : <b>{parcelle.section} {parcelle.numero}</b> ({parcelle.commune}{parcelle.contenance ? `, ${parcelle.contenance} m²` : ''}) — <code>{parcelle.idu}</code>
      <button type="button" onClick={onLacher}>Ne plus la viser</button></p>
  );
}

/**
 * Ce que la carte dit a l'echelle du quartier quand elle n'a rien a proposer, pour ne pas chercher pour rien (demande du proprietaire,
 * 15 novembre 2026) : aucune photo ici, des photos que le banc ne peut pas lire, ou des photos sans facade (le tri).
 */
function indiceDeLaVue(trouvees: { recues: number; lisibles: number } | null, nPhotos: number, nProposees: number, compte: string | null, panneRelais: boolean): string | null {
  if (!trouvees || nProposees > 0 || compte?.startsWith('Lecture')) return null;
  if (!trouvees.recues) return 'Aucune photo de rue Panoramax ici';
  // Toute instance passe par le relais du serveur : ce message ne reste que s'il echoue (l'avis de la carte dit pourquoi).
  if (!trouvees.lisibles || (panneRelais && !nPhotos)) return 'Des photos de rue ici, mais servies par un hôte que le banc ne lit pas';
  return nPhotos > 0 ? 'Des photos de rue ici, mais aucune façade (route, campagne, ou pas une maison) : décochez « Seulement les façades » pour les voir' : null;
}

export function ImportPanoramax({ banc }: { banc: Banc }) {
  const [texte, setTexte] = useState(''), [rayon, setRayon] = useState(40);
  const [visees, setVisees] = useState(true), [visee, setVisee] = useState<Visee>('cotes');
  // Cochee par defaut (demande du proprietaire, 15 novembre 2026) : des facades de maison ou d'immeuble, pas la route ou la campagne.
  const [seulementFacades, setSeulementFacades] = useState(true), [ecarterCachees, setEcarterCachees] = useEcarterCachees();
  const [propositions, setPropositions] = useState<Adresse[]>([]), [adresse, setAdresse] = useState<Adresse | null>(null);
  const cadastre = useCadastre();
  const [parcelle, setParcelle] = useState<Parcelle | null>(null);
  const [photos, setPhotos] = useState<PhotoRue[]>([]);
  const { choix, forcees, choix$, poser: poserChoix, mettre: mettreChoix } = useChoix();
  // Les caps choisis a la main dans un 360 (par photo) ; une photo absente suit la visee.
  const [caps, setCaps] = useState<Map<string, number[]>>(new Map());
  // La liste : combien de vues garder par batiment, son ordre, les murs deja dans le banc, et le 360 dont on choisit les vues.
  const [parBatiment, setParBatiment] = useState<VuesParBatiment>(VUES_PAR_BATIMENT_DEFAUT), [ordre, setOrdre] = useState<Ordre>('note'), { ecarterDejaLa, setEcarterDejaLa, mursDeja, dejaDansLeBanc } = useMursDejaLa(banc.images);
  const [ouverte, setOuverte] = useState<string | null>(null), [etat, setEtat] = useState<string | null>(null);
  // La carte : le rayon de la derniere recherche (celui qu'elle dessine, pas celui qu'on est en train de taper), la photo survolee et
  // la photo epinglee (touchee), et ce qu'elle dit quand on est trop loin pour chercher des photos.
  const [rayonCherche, setRayonCherche] = useState(rayon);
  const [cadrage, setCadrage] = useState(0);
  const { survol, epingle, setSurvol, setEpingle, survoler } = useApercu();
  // Trop loin pour chercher les photos (la carte dit alors ou zoomer), et ce que la derniere recherche de la vue a rendu.
  const [loin, setLoin] = useState(true), [trouvees, setTrouvees] = useState<{ recues: number; lisibles: number } | null>(null);
  // Ce que la carte montre, et ce que ses recherches (lancees apres coup, au repos de la vue) doivent lire a jour.
  const emprise = useRef<Emprise | null>(null);
  const visee$ = useRef(parcelle); visee$.current = parcelle;
  const images$ = useRef(banc.images); images$.current = banc.images;
  const rechercheVue = useRef<AbortController | null>(null);
  // Sans parcelle visee, rien ne dit de quel cote est l'adresse : les deux cotes de la rue.
  const relais = useRelais(photos), { vuesDe, aImporterDe, proposees, enDoublon, compte, tri } = useVuesTriees(relais.lisibles, caps, parcelle, { visee: parcelle ? visee : 'cotes', seulementFacades, parBatiment, ordre, ecarterCachees, dejaDansLeBanc });
  const cochees = useMemo(() => new Set(proposees.filter((p) => choix.has(p.id) && (!enDoublon.has(p.id) || forcees.has(p.id))).map((p) => p.id)), [proposees, choix, enDoublon, forcees]);
  const dejaLa = () => new Set(images$.current.map((m) => m.panoramax?.id).filter(Boolean));

  /** Les photos autour de la parcelle visee, dans le rayon autour de ses bords. */
  const chercherAutour = async (p: Parcelle) => {
    rechercheVue.current?.abort();
    setEtat('Recherche des photos…'); setLoin(false);
    setRayonCherche(rayon);
    try {
      const o = centre(p);
      const l = rapporterALaParcelle(lirePhotos(await lireJson(urlRecherche(o.lat, o.lon, rayon + 40)), o, rayon + 40, api.relais), p, rayon);
      const deja = dejaLa(), gardees = l.filter((x) => !deja.has(x.id));
      setPhotos(gardees); setCaps(new Map()); setOuverte(null); setSurvol(null); setEpingle(null);
      poserChoix(gardees.filter((x) => !visees || x.vise).map((x) => x.id));
      setEtat(`${l.length} photo(s) à ${rayon} m de la parcelle ${p.section} ${p.numero} ; ${l.length - gardees.length} déjà dans le banc.`);
    } catch (e) { setEtat('Recherche impossible : ' + (e as Error).message); }
  };

  /**
   * Les photos de ce que la carte montre, quand aucune parcelle n'est visee : a partir d'une vue de quartier, la recherche precedente
   * abandonnee. Les photos deja cochees restent, meme sorties de la vue : on se promene et on en choisit.
   */
  const chercherDansLaVue = useCallback((e: Emprise) => {
    rechercheVue.current?.abort();
    const cochees = (l: PhotoRue[]) => l.filter((x) => choix$.current.has(x.id));
    if (largeurM(e) > LARGEUR_PHOTOS_MAX_M) { setLoin(true); setTrouvees(null); setEtat(null); setPhotos(cochees); return; }
    setLoin(false);
    const arret = new AbortController();
    rechercheVue.current = arret;
    lireJson(urlRechercheEmprise(e, LIMITE_PHOTOS_VUE), arret.signal).then((json) => {
      if (arret.signal.aborted || visee$.current) return;
      const recues = ((json as { features?: unknown[] })?.features ?? []).length;
      const l = lirePhotos(json, milieuEmprise(e), Infinity, api.relais), deja = dejaLa(), neuves = l.filter((x) => !deja.has(x.id));
      setTrouvees({ recues, lisibles: l.length });
      setPhotos((avant) => { const g = cochees(avant), ids = new Set(g.map((x) => x.id)); return [...g, ...neuves.filter((x) => !ids.has(x.id))]; });
      setEtat(`${l.length} photo(s) dans la vue${recues >= LIMITE_PHOTOS_VUE ? ` (les ${LIMITE_PHOTOS_VUE} premières : rapprochez-vous pour voir les autres)` : ''} ; ${l.length - neuves.length} déjà dans le banc. Touchez une parcelle pour la viser.`);
    }).catch((err: Error) => { if (!arret.signal.aborted) setEtat('Recherche des photos impossible : ' + err.message); });
  }, []);

  /** La carte au repos sur une vue : son cadastre a partir d'une vue de rue, ses photos a partir d'une vue de quartier. */
  const lireCadastre = cadastre.lire, taireCadastre = cadastre.taire;
  const voirEmprise = useCallback((e: Emprise) => {
    emprise.current = e;
    if (largeurM(e) <= LARGEUR_CADASTRE_MAX_M) void lireCadastre(elargir(e, 0.15), visee$.current?.idu);
    else taireCadastre();
    if (!visee$.current) chercherDansLaVue(e);
  }, [lireCadastre, taireCadastre, chercherDansLaVue]);

  const viser = (p: Parcelle | null) => { setParcelle(p); visee$.current = p; };
  const chercherAdresse = async () => {
    // Sans adresse tapee : le rayon ou les reglages ont change, on refait la recherche autour de la parcelle visee.
    if (!texte.trim()) {
      if (parcelle) await chercherAutour(parcelle);
      else setEtat('Tapez une adresse (ou des coordonnées), ou zoomez sur la carte jusqu’à la rue.');
      return;
    }
    setEtat('Recherche de l’adresse…');
    setPropositions([]);
    try {
      const l = await trouverAdresses(texte, lireJson);
      if (!l.length) { setEtat('Adresse introuvable.'); return; }
      setPropositions(l);
      await choisirAdresse(l[0] as Adresse);
    } catch (e) { setEtat('Recherche impossible : ' + (e as Error).message); }
  };
  const choisirAdresse = async (a: Adresse) => {
    setAdresse(a);
    setEtat('Recherche des parcelles (cadastre IGN)…');
    rechercheVue.current?.abort();
    cadastre.repartir();
    const l = await cadastre.lire(empriseAutour(a, portee(rayon)));
    const p = parcelleDuPoint(l, a);
    viser(p);
    if (p) await chercherAutour(p);
    else { setPhotos([]); poserChoix([]); setEtat('Aucune parcelle du cadastre lue à cette adresse : la carte y va et montre les photos de la vue.'); }
    // Apres la recherche : la carte vole vers la parcelle trouvee (ou l'adresse) et le rayon qu'on vient de chercher.
    setCadrage((n) => n + 1);
  };
  // Toucher une parcelle la vise (les photos autour d'elle) ; toucher la parcelle visee la lache : on revient aux photos de la vue.
  const toucherParcelle = (p: Parcelle) => {
    if (p.idu !== parcelle?.idu) { viser(p); void chercherAutour(p); return; }
    viser(null);
    setPhotos([]); poserChoix([]); setCaps(new Map()); setSurvol(null); setEpingle(null); setEtat(null);
    if (emprise.current) chercherDansLaVue(emprise.current);
  };
  const importer = async () => {
    const lot = proposees.filter((x) => cochees.has(x.id)), faites = new Set(lot.map((x) => x.id));
    await importerVues(banc, lot, aImporterDe, { adresse, parcelle, batiment: tri.batiment }, setEtat);
    setPhotos((l) => l.filter((x) => !faites.has(x.id)));
    poserChoix([]);
    await banc.relire();
  };
  const basculer = (id: string) => mettreChoix(id, !cochees.has(id));
  const cocher = (qui: 'facades' | 'doublons' | 'aucune') => poserChoix(qui === 'aucune' ? [] : proposees.filter((p) => qui === 'doublons' || !enDoublon.has(p.id)).map((p) => p.id), qui === 'doublons');
  // Toucher un point l'epingle ; le toucher encore coche ou decoche sa photo.
  const toucher = (id: string) => { if (epingle === id) basculer(id); else { setEpingle(id); setSurvol(null); } };
  const montree = proposees.find((x) => x.id === (survol ?? epingle)) ?? null;
  const visant = !!parcelle;
  return (
    <div className="import-panoramax">
      <Recherche texte={texte} setTexte={setTexte} rayon={rayon} setRayon={setRayon} visees={visees} setVisees={setVisees} facades={seulementFacades} setFacades={setSeulementFacades} cachees={ecarterCachees} setCachees={setEcarterCachees} visee={visee} setVisee={setVisee}
        propositions={propositions} adresse={adresse} onChercher={() => { void chercherAdresse(); }} onAdresse={(a) => { void choisirAdresse(a); }} />
      {etat && <p className="etat">{etat}</p>}
      {compte && <p className="etat compte-facades" role="status">{compte}</p>}
      <div className="carte-et-apercu">
        <CarteImport adresse={adresse} parcelles={cadastre.parcelles} parcelle={parcelle} photos={proposees} choix={cochees} vuesDe={aImporterDe} rayon={rayonCherche}
          montree={montree?.id ?? null} epinglee={epingle} cadrage={cadrage} avisCadastre={cadastre.avis} avisFacades={tri.avis} avisRelais={relais.avis} batimentsVus={montree ? aImporterDe(montree).flatMap((v) => { const c = v.batiment ? tri.contour(v.batiment) : null; return c ? [c] : []; }) : []} tropLoin={!visant && loin} indice={visant || loin ? null : indiceDeLaVue(trouvees, relais.lisibles.length, proposees.length, compte, !!relais.avis)}
          onParcelle={toucherParcelle} onSurvol={survoler} onPhoto={toucher} onBasculer={basculer} onEmprise={voirEmprise} />
        <ApercuPhoto p={montree} vues={montree ? vuesDe(montree) : []} choisie={!!montree && cochees.has(montree.id)} epinglee={!!montree && montree.id === epingle} visant={visant}
          onBasculer={() => { if (montree) basculer(montree.id); }} onChoisirVues={() => { if (montree) { setEpingle(montree.id); setOuverte(montree.id); } }}
          onFermer={() => { setEpingle(null); setSurvol(null); }} />
      </div>
      {parcelle && <ParcelleVisee parcelle={parcelle} onLacher={() => toucherParcelle(parcelle)} />}
      {proposees.length > 0 && <ListePhotos photos={proposees} cochees={cochees} enDoublon={enDoublon} vuesDe={vuesDe} ouverte={ouverte} setOuverte={setOuverte} montree={montree?.id ?? null} onSurvol={survoler} visant={visant}
        ordre={ordre} setOrdre={setOrdre} parBatiment={parBatiment} setParBatiment={setParBatiment} ecarterDejaLa={ecarterDejaLa} setEcarterDejaLa={setEcarterDejaLa} mursDuBanc={mursDeja.size} groupees={!!compte && !compte.startsWith('Lecture')}
        onBasculer={basculer} onCocher={cocher} onImporter={() => { void importer(); }} />}
      <FenetreDesVues p={proposees.find((x) => x.id === ouverte) ?? null} panoramiques={proposees.filter((x) => x.panoramique)} vuesDe={vuesDe} visant={visant} setCaps={setCaps}
        onCocher={(id) => mettreChoix(id, true)} setOuverte={setOuverte} />
    </div>
  );
}

// Etape 1b : les photos de rue Panoramax, depuis la carte. On part de la France entiere et l'on zoome jusqu'a la rue, ou l'on tape une
// adresse et la carte y va (demande du proprietaire, 15 novembre 2026). L'adresse (le geocodage de la Geoplateforme, plusieurs propositions), puis
// sa parcelle au cadastre de l'IGN (le Parcellaire Express, par le WFS de la Geoplateforme : on peut en choisir une autre sur la carte, CarteImport.tsx),
// puis les photos prises autour de la parcelle et qui la regardent. Un panoramique 360 donne une vue de chaque cote de la rue (a 90 degres
// du sens de la prise de vue, la ou sont les facades), le seul cote de la parcelle, ou la vue droit vers elle.

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Banc } from '../../App.js';
import { api, ErreurApi } from '../../api.js';
import { bitmap, COTE_SOURCE, jpeg, liberer, pixels, reduire, versCanevas, vignette } from '../../images.js';
import { contient, elargir, empriseAutour, largeurM, milieuEmprise, type Emprise } from '../../carte.js';
import { basculerCap, capDuX, CHAMP_VUE, distanceM, lirePhotos, trouverAdresses, urlRecherche, urlRechercheEmprise, vuesDesCaps, xDuCap, type Adresse, type PhotoRue, type VueAExtraire, type Visee } from '../../panoramax.js';
import { centre, lireLesParcelles, parcelleDuPoint, rapporterALaParcelle, type Parcelle } from '../../parcelles.js';
import { vueDuPanoramique } from '../../equirect.js';
import { Icone } from '../../ui/Icones.js';
import { ApercuPhoto } from './ApercuPhoto.js';
import { CarteImport } from './CarteImport.js';
import { Apercu, NOM_VUE, TANGAGE, usePano } from './panoramiques.js';
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
const INDICE_ZOOM = 'Zoomez pour voir les photos de rue';

interface Contexte { adresse: Adresse | null; parcelle: Parcelle | null }

/** Importe les vues des photos choisies (une ou deux par panoramique) ; rend le nombre de vues importees. */
async function importerVues(banc: Banc, photos: readonly PhotoRue[], vuesDe: (p: PhotoRue) => VueAExtraire[], ctx: Contexte, dire: (t: string) => void): Promise<number> {
  const lot = nomDuLot('panoramax');
  let ok = 0, n = 0;
  for (const p of photos) {
    dire(`Import ${++n} sur ${photos.length}…`);
    // L'adresse et la parcelle d'aujourd'hui quand on les connait ; sans parcelle visee, l'adresse ne vaut que pour les photos prises pres d'elle.
    const adresse = ctx.adresse && (ctx.parcelle || distanceM(p, ctx.adresse) <= PROCHE_DE_L_ADRESSE_M) ? ctx.adresse.libelle : null;
    try {
      const b = await bitmap(await (await fetch(p.hd)).blob());
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

/** L'aide, le champ d'adresse et ses reglages, et les adresses que le geocodage propose. */
function Recherche({ texte, setTexte, rayon, setRayon, visees, setVisees, visee, setVisee, propositions, adresse, onChercher, onAdresse }: {
  texte: string; setTexte: (t: string) => void; rayon: number; setRayon: (r: number) => void; visees: boolean; setVisees: (v: boolean) => void;
  visee: Visee; setVisee: (v: Visee) => void; propositions: Adresse[]; adresse: Adresse | null; onChercher: () => void; onAdresse: (a: Adresse) => void;
}) {
  return (
    <>
      <p className="aide">Partez de la carte de France et zoomez jusqu’à la rue, ou tapez une adresse : la carte y va. À l’échelle d’un quartier, les photos de rue libres de la vue s’affichent ; touchez une parcelle du cadastre pour la viser (les photos prises autour d’elle et qui la regardent), touchez-la encore pour la lâcher.</p>
      <form className="rang" onSubmit={(e) => { e.preventDefault(); onChercher(); }}>
        <input className="large" aria-label="Adresse ou coordonnées" placeholder="2 allée des Limites, Le Vésinet — ou 48.90507, 2.13254" value={texte} onChange={(e) => setTexte(e.target.value)} />
        <label>Rayon <input type="number" min={5} max={300} value={rayon} onChange={(e) => setRayon(Number(e.target.value))} /> m</label>
        <label className="case"><input type="checkbox" checked={visees} onChange={(e) => setVisees(e.target.checked)} /> Qui regardent la parcelle</label>
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

export function ImportPanoramax({ banc }: { banc: Banc }) {
  const [texte, setTexte] = useState('');
  const [rayon, setRayon] = useState(40);
  const [visees, setVisees] = useState(true);
  const [visee, setVisee] = useState<Visee>('cotes');
  const [propositions, setPropositions] = useState<Adresse[]>([]);
  const [adresse, setAdresse] = useState<Adresse | null>(null);
  const cadastre = useCadastre();
  const [parcelle, setParcelle] = useState<Parcelle | null>(null);
  const [photos, setPhotos] = useState<PhotoRue[]>([]);
  const [choix, setChoix] = useState<Set<string>>(new Set());
  // Les caps choisis a la main dans un 360 (par photo) ; une photo absente suit la visee.
  const [caps, setCaps] = useState<Map<string, number[]>>(new Map());
  const [ouverte, setOuverte] = useState<string | null>(null);
  const [etat, setEtat] = useState<string | null>(null);
  // La carte : le rayon de la derniere recherche (celui qu'elle dessine, pas celui qu'on est en train de taper), la photo survolee et
  // la photo epinglee (touchee), et ce qu'elle dit quand on est trop loin pour chercher des photos.
  const [rayonCherche, setRayonCherche] = useState(rayon);
  const [cadrage, setCadrage] = useState(0);
  const { survol, epingle, setSurvol, setEpingle, survoler } = useApercu();
  const [indice, setIndice] = useState<string | null>(INDICE_ZOOM);
  // Ce que la carte montre, et ce que ses recherches (lancees apres coup, au repos de la vue) doivent lire a jour.
  const emprise = useRef<Emprise | null>(null);
  const visee$ = useRef(parcelle); visee$.current = parcelle;
  const choix$ = useRef(choix); choix$.current = choix;
  const images$ = useRef(banc.images); images$.current = banc.images;
  const rechercheVue = useRef<AbortController | null>(null);
  // Sans parcelle visee, rien ne dit de quel cote est l'adresse : les deux cotes de la rue.
  const vuesDe = (p: PhotoRue) => vuesDesCaps(p, caps.get(p.id), parcelle ? visee : 'cotes');
  const dejaLa = () => new Set(images$.current.map((m) => m.panoramax?.id).filter(Boolean));

  /** Les photos autour de la parcelle visee, dans le rayon autour de ses bords. */
  const chercherAutour = async (p: Parcelle) => {
    rechercheVue.current?.abort();
    setEtat('Recherche des photos…'); setIndice(null);
    setRayonCherche(rayon);
    try {
      const o = centre(p);
      const l = rapporterALaParcelle(lirePhotos(await lireJson(urlRecherche(o.lat, o.lon, rayon + 40)), o, rayon + 40), p, rayon);
      const deja = dejaLa(), gardees = l.filter((x) => !deja.has(x.id));
      setPhotos(gardees); setCaps(new Map()); setOuverte(null); setSurvol(null); setEpingle(null);
      setChoix(new Set(gardees.filter((x) => !visees || x.vise).map((x) => x.id)));
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
    if (largeurM(e) > LARGEUR_PHOTOS_MAX_M) { setIndice(INDICE_ZOOM); setPhotos(cochees); return; }
    setIndice(null);
    const arret = new AbortController();
    rechercheVue.current = arret;
    lireJson(urlRechercheEmprise(e, LIMITE_PHOTOS_VUE), arret.signal).then((json) => {
      if (arret.signal.aborted || visee$.current) return;
      const recues = ((json as { features?: unknown[] })?.features ?? []).length;
      const l = lirePhotos(json, milieuEmprise(e), Infinity), deja = dejaLa(), neuves = l.filter((x) => !deja.has(x.id));
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
    else { setPhotos([]); setChoix(new Set()); setEtat('Aucune parcelle du cadastre lue à cette adresse : la carte y va et montre les photos de la vue.'); }
    // Apres la recherche : la carte vole vers la parcelle trouvee (ou l'adresse) et le rayon qu'on vient de chercher.
    setCadrage((n) => n + 1);
  };
  // Toucher une parcelle la vise (les photos autour d'elle) ; toucher la parcelle visee la lache : on revient aux photos de la vue.
  const toucherParcelle = (p: Parcelle) => {
    if (p.idu !== parcelle?.idu) { viser(p); void chercherAutour(p); return; }
    viser(null);
    setPhotos([]); setChoix(new Set()); setCaps(new Map()); setSurvol(null); setEpingle(null); setEtat(null);
    if (emprise.current) chercherDansLaVue(emprise.current);
  };
  const importer = async () => {
    await importerVues(banc, photos.filter((x) => choix.has(x.id)), vuesDe, { adresse, parcelle }, setEtat);
    setPhotos((l) => l.filter((x) => !choix.has(x.id)));
    setChoix(new Set());
    await banc.relire();
  };
  const basculer = (id: string) => setChoix((c) => { const t = new Set(c); if (t.has(id)) t.delete(id); else t.add(id); return t; });
  // Toucher un point l'epingle ; le toucher encore coche ou decoche sa photo.
  const toucher = (id: string) => { if (epingle === id) basculer(id); else { setEpingle(id); setSurvol(null); } };
  const panoramiques = photos.filter((x) => x.panoramique);
  const montree = photos.find((x) => x.id === (survol ?? epingle)) ?? null;
  const visant = !!parcelle;
  return (
    <div className="import-panoramax">
      <Recherche texte={texte} setTexte={setTexte} rayon={rayon} setRayon={setRayon} visees={visees} setVisees={setVisees} visee={visee} setVisee={setVisee}
        propositions={propositions} adresse={adresse} onChercher={() => { void chercherAdresse(); }} onAdresse={(a) => { void choisirAdresse(a); }} />
      {etat && <p className="etat">{etat}</p>}
      <div className="carte-et-apercu">
        <CarteImport adresse={adresse} parcelles={cadastre.parcelles} parcelle={parcelle} photos={photos} choix={choix} vuesDe={vuesDe} rayon={rayonCherche}
          montree={montree?.id ?? null} epinglee={epingle} cadrage={cadrage} avisCadastre={cadastre.avis} indice={visant ? null : indice}
          onParcelle={toucherParcelle} onSurvol={survoler} onPhoto={toucher} onBasculer={basculer} onEmprise={voirEmprise} />
        <ApercuPhoto p={montree} vues={montree ? vuesDe(montree) : []} choisie={!!montree && choix.has(montree.id)} epinglee={!!montree && montree.id === epingle} visant={visant}
          onBasculer={() => { if (montree) basculer(montree.id); }} onChoisirVues={() => { if (montree) { setEpingle(montree.id); setOuverte(montree.id); } }}
          onFermer={() => { setEpingle(null); setSurvol(null); }} />
      </div>
      {parcelle && <ParcelleVisee parcelle={parcelle} onLacher={() => toucherParcelle(parcelle)} />}
      {photos.length > 0 && <ListePhotos photos={photos} choix={choix} setChoix={setChoix} vuesDe={vuesDe} ouverte={ouverte} setOuverte={setOuverte} montree={montree?.id ?? null} onSurvol={survoler} visant={visant}
        onImporter={() => { void importer(); }} />}
      {(() => { const p = photos.find((x) => x.id === ouverte); return p ? (
        <ChoixDesVues p={p} vues={vuesDe(p)} visant={visant} onCaps={(l) => { setCaps((m) => new Map(m).set(p.id, l)); setChoix((c) => new Set(c).add(p.id)); }}
          onVisee={() => setCaps((m) => { const t = new Map(m); t.delete(p.id); return t; })} onFermer={() => setOuverte(null)}
          rang={panoramiques.findIndex((x) => x.id === p.id)} total={panoramiques.length}
          onAutre={(k) => { const q = panoramiques[k]; if (q) setOuverte(q.id); }} />
      ) : null; })()}
    </div>
  );
}

function ListePhotos({ photos, choix, setChoix, vuesDe, ouverte, setOuverte, montree, onSurvol, visant, onImporter }: {
  photos: PhotoRue[]; choix: Set<string>; setChoix: (s: Set<string>) => void; vuesDe: (p: PhotoRue) => VueAExtraire[];
  ouverte: string | null; setOuverte: (id: string | null) => void; montree: string | null; onSurvol: (id: string | null) => void; visant: boolean; onImporter: () => void;
}) {
  const basculer = (id: string) => { const t = new Set(choix); if (t.has(id)) t.delete(id); else t.add(id); setChoix(t); };
  const nVues = photos.filter((p) => choix.has(p.id)).reduce((n, p) => n + vuesDe(p).length, 0);
  return (
    <>
      <div className="barre-choix">
        <button type="button" onClick={() => setChoix(new Set(photos.map((p) => p.id)))}>Tout cocher</button>
        <button type="button" onClick={() => setChoix(new Set())}>Tout décocher</button>
        <button type="button" className="principal" disabled={!nVues} onClick={onImporter}>Importer {nVues} vue(s) de {choix.size} photo(s)</button>
      </div>
      <p className="aide">Un panoramique 360 se montre en entier, la rue au milieu : les cadres orange sont les vues qui seront importées. « Choisir les vues » pour regarder ailleurs (à gauche, à droite, vers une maison).</p>
      <ul className="mosaique grande">
        {photos.map((p) => {
          const vues = vuesDe(p);
          return (
            <li key={p.id} className={'carte' + (choix.has(p.id) ? ' choisie' : '') + (p.id === montree ? ' montree' : '')}
              onPointerEnter={(e) => { if (e.pointerType === 'mouse') onSurvol(p.id); }} onPointerLeave={(e) => { if (e.pointerType === 'mouse') onSurvol(null); }}>
              <label>
                <input type="checkbox" checked={choix.has(p.id)} onChange={() => basculer(p.id)} />
                {p.panoramique && p.sd ? <Panorama p={p} vues={vues} visant={visant} /> : p.vignette ? <img src={p.vignette} alt="" loading="lazy" /> : <div className="sans-image" />}
                <span>{visant ? `${p.distance} m · ` : ''}{p.panoramique ? `360° · ${vues.length} vue(s)` : !visant ? 'photo' : (p.vise ? 'vers la parcelle' : 'de côté')} · {p.date?.slice(0, 10) ?? '—'}</span>
              </label>
              {p.panoramique && <button type="button" className={ouverte === p.id ? 'onglet actif' : 'onglet'} onClick={() => setOuverte(ouverte === p.id ? null : p.id)}>Choisir les vues</button>}
            </li>
          );
        })}
      </ul>
    </>
  );
}

/** Les bandes d'une vue dans le panoramique (en fractions de la largeur) : deux quand elle passe le bord. */
function bandes(cap: number, azimut: number): { g: number; l: number }[] {
  const l = CHAMP_VUE / 360, g = xDuCap(cap, azimut) - l / 2;
  if (g < 0) return [{ g: 0, l: l + g }, { g: 1 + g, l: -g }];
  if (g + l > 1) return [{ g, l: 1 - g }, { g: 0, l: g + l - 1 }];
  return [{ g, l }];
}

/** Le panoramique entier (sa version reduite), la rue au milieu, avec les vues a importer et la direction de la parcelle. */
function Panorama({ p, vues, visant, onClic }: { p: PhotoRue; vues: VueAExtraire[]; visant: boolean; onClic?: (cap: number) => void }) {
  const az = p.azimut ?? 0;
  return (
    <div className={onClic ? 'pano actif' : 'pano'} onClick={onClic ? (e) => { const r = e.currentTarget.getBoundingClientRect(); onClic(capDuX((e.clientX - r.left) / r.width, az)); } : undefined}>
      {/* En CORS : l'apercu relit la meme image par fetch, et une copie en cache sans en-tete CORS le ferait echouer. */}
      <img src={p.sd ?? ''} alt="" loading="lazy" draggable={false} crossOrigin="anonymous" />
      {vues.flatMap((v, i) => bandes(v.cap, az).map((b, k) => <span key={i + '-' + k} className="pano-vue" style={{ left: `${b.g * 100}%`, width: `${b.l * 100}%` }} />))}
      {visant && <span className="pano-cible" style={{ left: `${xDuCap(p.cap, az) * 100}%` }} title="Vers la parcelle" />}
      <span className="pano-rue" title="Axe de la rue (sens de la prise de vue)" />
    </div>
  );
}

/**
 * Le choix des vues d'un 360 (demande du proprietaire, 12 novembre 2026) : toucher le panoramique ajoute une vue a ce cap, ou retire
 * celle qui y est ; chaque vue s'ajuste de 5 degres et se montre telle qu'elle sera importee.
 */
function ChoixDesVues({ p, vues, visant, onCaps, onVisee, onFermer, rang, total, onAutre }: { p: PhotoRue; vues: VueAExtraire[]; visant: boolean; onCaps: (caps: number[]) => void; onVisee: () => void; onFermer: () => void; rang: number; total: number; onAutre: (k: number) => void }) {
  // Le meme panoramique reduit que l'apercu de la carte : deja lu au survol, il s'ouvre sans attendre.
  const { pano, erreur } = usePano(p);
  const caps = vues.map((v) => v.cap);
  const az = p.azimut ?? 0;
  const regler = (k: number, d: number) => onCaps(caps.map((c, i) => (i === k ? ((c + d) % 360 + 360) % 360 : c)));
  // Une fenetre au-dessus de la liste (demande du proprietaire : il fallait descendre tout en bas pour voir le resultat) ; Echap ferme,
  // les fleches passent d'un 360 a l'autre.
  useEffect(() => {
    const t = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onFermer();
      else if (e.key === 'ArrowRight' && rang < total - 1) onAutre(rang + 1);
      else if (e.key === 'ArrowLeft' && rang > 0) onAutre(rang - 1);
      else return;
      e.preventDefault();
    };
    document.addEventListener('keydown', t);
    return () => document.removeEventListener('keydown', t);
  }, [onFermer, onAutre, rang, total]);
  return (
    <div className="voile-dialogue" onClick={onFermer}>
    <div className="panneau choix-vues dialogue" role="dialog" aria-modal="true" aria-label="Vues du panoramique" onClick={(e) => e.stopPropagation()}>
      <header className="tete-dialogue">
        <button type="button" className="discret" disabled={rang <= 0} onClick={() => onAutre(rang - 1)} aria-label="360 précédent (←)" title="360 précédent (←)"><Icone nom="precedent" /></button>
        <strong>360 {rang + 1} / {total}</strong>
        <button type="button" className="discret" disabled={rang >= total - 1} onClick={() => onAutre(rang + 1)} aria-label="360 suivant (→)" title="360 suivant (→)"><Icone nom="suivant" /></button>
        <small>{visant ? `${p.distance} m · ` : ''}{p.date?.slice(0, 10) ?? '—'} · {vues.length} vue(s)</small>
        <span className="espace" />
        <button type="button" className="principal" onClick={onFermer}><Icone nom="valider" /> Terminé</button>
      </header>
      <div className="rang">
        <button type="button" onClick={() => onCaps([((az - 90) % 360 + 360) % 360, (az + 90) % 360])}>Gauche et droite</button>
        {visant && <button type="button" onClick={() => onCaps([Math.round(p.cap)])}>Vers la parcelle</button>}
        <button type="button" onClick={onVisee}>Comme la visée</button>
        <button type="button" onClick={() => onCaps([])}>Aucune</button>
      </div>
      <p className="aide">Touchez le panoramique pour ajouter une vue à cet endroit (75° de champ), touchez une vue pour la retirer. La rue est au milieu (trait blanc){visant ? ', la parcelle sous le trait rouge' : ''}.</p>
      <Panorama p={p} vues={vues} visant={visant} onClic={(cap) => onCaps(basculerCap(caps, cap))} />
      {erreur && <p className="etat">Aperçu impossible : {erreur}</p>}
      <ul className="apercus">
        {vues.map((v, k) => (
          <li key={k}>
            <Apercu pano={pano} azimut={az} cap={v.cap} />
            <div className="rang">
              <button type="button" aria-label="Tourner à gauche de 5°" onClick={() => regler(k, -5)}>◀</button>
              <span>{NOM_VUE[v.vue]} · {Math.round(v.cap)}°</span>
              <button type="button" aria-label="Tourner à droite de 5°" onClick={() => regler(k, 5)}>▶</button>
              <button type="button" className="discret" aria-label="Retirer cette vue" onClick={() => onCaps(caps.filter((_, i) => i !== k))}>✕</button>
            </div>
          </li>
        ))}
      </ul>
    </div>
    </div>
  );
}

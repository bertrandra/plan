// Admin › Calibrer la detection : un cas = une facade photographiee et annotee (facade/corpusReel.ts).
//
// On prend (ou choisit) une a huit photos du meme mur. Le cas se rejoue par l'orchestrateur de la facade
// (facade/releve/enchainement.ts), etape par etape : chaque photo redressee entiere (par quatre reperes poses au doigt, sinon par ses
// points de fuite), les vues assemblees, le mur cherche sur l'assemblage et reporte dans chaque photo, le haut du mur lu, la texture,
// les ouvertures. La barre de progression (zones/composants/BarreProgressionFacade.tsx) et la frise des etapes
// (FriseEtapesCalibration.tsx) lisent ses etats ; la calibration montre toutes les etapes. On annote ensuite les ouvertures sur le
// mur redresse : la detection en propose, on retire les fausses et on trace les manquees. Rien n'est ecrit avant « Enregistrer » ;
// un cas ne compte dans la calibration qu'une fois marque « relu sur la photo » (valide).

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { type MurAjuste } from './releve/AjusterMur.js';
import { PoserReperes } from './releve/PoserReperes.js';
import { coinsParDefaut, LIBELLES_OUVERTURE, pointSvg } from './releve/commun.js';
import type { CasStocke, OuvertureVraie } from '../facade/corpusReel.js';
import { GABARIT_RECTANGLE, type GabaritMur } from '../facade/gabaritMur.js';
import type { Image, P2 } from '../facade/vision/homographie.js';
import { casApresRejeu, casCaleALaMain, derouler, entreesDuCas, originesDuCas, reperesDe, veriteDuCas, type Enchainement, type OrigineCoins } from '../facade/releve/enchainement.js';
import { imagesEtapes } from '../facade/releve/imagesEtapes.js';
import { rechercher } from '../facade/releve/serie.js';
import { ETAPES_FACADE, type EtatAffiche, type IdEtape } from '../model/etapeFacade.js';
import { BarreProgressionFacade, type EtapeAffichee } from './composants/BarreProgressionFacade.js';
import { EtapeOuverte, FriseEtapes } from './FriseEtapesCalibration.js';
import type { RegistreCommandes } from '../app/commandes.js';
import type { ResultatRun } from '../app/releve/runFacade.js';
import { texteRunFacade, type RunEnregistre } from '../regles/facades/observations.js';
import { enteteDuRun } from '../facade/releve/enchainement.js';
import type { Photo } from '../ui/releve/camera.js';
import type { TypeOuverture } from '../model/types.js';

/** Ce que l'editeur demande au navigateur : reduire une photo, la decoder, montrer une elevation ; et l'ecran, ses commandes. */
export interface OutilsPhotos {
  reduirePhoto: (f: File) => Promise<string>;
  decoder: (url: string) => Promise<Image>;
  elevationEnUrl: (img: Image) => string;
  /** Le registre de l'ecran : la commande `facade.etape` ouvre une etape (la barre, la frise). Absent : rien ne s'ouvre. */
  commandes?: Pick<RegistreCommandes, 'etat' | 'executer' | 'effacee'>;
  /** S'abonner a l'ouverture d'une etape par la commande ; rend de quoi se desabonner. */
  ecouterEtape?: (ouvrir: (id: IdEtape) => void) => () => void;
  /**
   * « Rappeler Claude » (lot F2) : le run d'une facade sur l'assemblage du cas, une passe ou trois, par le serveur de l'analyse (session
   * de l'administrateur). Absent : seul le rejeu des reponses enregistrees est propose.
   */
  appelerClaude?: (d: { image: Image; cache: Uint8Array | null; texte: string; passes: 1 | 3 }) => Promise<ResultatRun>;
}

export const PHOTOS_CAS_MAX = 8;
const TYPES: readonly TypeOuverture[] = ['fenetre', 'porte-fenetre', 'porte', 'garage'];

const LIBELLE_ORIGINE: Record<OrigineCoins, string> = { trouves: 'coins trouvés', devines: 'coins devinés, à vérifier', main: 'mur posé à la main', reperes: 'redressée par vos repères' };
interface Elevation { url: string; largeurM: number; hauteurM: number; propositions: OuvertureVraie[] }

/** Le mur redresse, avec les ouvertures annotees : tracer un rectangle en ajoute une, toucher un rectangle le choisit. */
function ToileAnnotation({ elevation, ouvertures, choisie, choisir, ajouter, trace: tracer }: { trace: boolean; elevation: Elevation; ouvertures: readonly OuvertureVraie[]; choisie: number | null; choisir: (k: number | null) => void; ajouter: (o: OuvertureVraie) => void }) {
  const svg = useRef<SVGSVGElement>(null);
  const [trace, setTrace] = useState<{ a: P2; b: P2 } | null>(null);
  const { largeurM: L, hauteurM: H } = elevation;
  const sensible = Math.max(L, H) * 0.01;
  const sur = (e: React.PointerEvent): P2 => { const p = svg.current ? pointSvg(svg.current, e) : { x: 0, y: 0 }; return { x: Math.max(0, Math.min(L, p.x)), y: Math.max(0, Math.min(H, p.y)) }; };
  const finir = () => {
    if (!trace) return;
    const x = Math.min(trace.a.x, trace.b.x), l = Math.abs(trace.a.x - trace.b.x), haut = Math.min(trace.a.y, trace.b.y), h = Math.abs(trace.a.y - trace.b.y);
    setTrace(null);
    if (l < sensible || h < sensible) return;
    const arrondi = (v: number) => Math.round(v * 100) / 100;
    ajouter({ type: 'fenetre', x: arrondi(x), l: arrondi(l), y: arrondi(H - (haut + h)), h: arrondi(h) });
  };
  return (
    <svg ref={svg} className={'calToile' + (tracer ? ' trace' : '')} viewBox={`0 0 ${L} ${H}`} role="img" aria-label="Mur redressé : en mode tracé, glissez un rectangle autour d’une ouverture pour l’ajouter"
      onPointerDown={(e) => { if (tracer && (e.target === svg.current || (e.target as Element).tagName === 'image')) { choisir(null); const p = sur(e); setTrace({ a: p, b: p }); (e.currentTarget as Element).setPointerCapture(e.pointerId); } }}
      onPointerMove={(e) => { if (trace) setTrace({ ...trace, b: sur(e) }); }} onPointerUp={finir} onPointerCancel={() => setTrace(null)}>
      <image href={elevation.url} x={0} y={0} width={L} height={H} preserveAspectRatio="none" />
      {ouvertures.map((o, k) => (
        <rect key={k} className={'calBaie' + (k === choisie ? ' choisie' : '')} x={o.x} y={H - o.y - o.h} width={o.l} height={o.h} vectorEffect="non-scaling-stroke"
          role="button" tabIndex={0} aria-label={`Ouverture ${k + 1} : ${LIBELLES_OUVERTURE[o.type]}`} onPointerDown={(e) => { e.stopPropagation(); choisir(k); }} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') choisir(k); }} />
      ))}
      {trace && <rect className="calTrace" x={Math.min(trace.a.x, trace.b.x)} y={Math.min(trace.a.y, trace.b.y)} width={Math.abs(trace.a.x - trace.b.x)} height={Math.abs(trace.a.y - trace.b.y)} vectorEffect="non-scaling-stroke" />}
    </svg>
  );
}

/** L'ouverture choisie : son type et ses cotes, a la main, ou a retirer. */
function FicheOuverture({ o, modifier, retirer }: { o: OuvertureVraie; modifier: (o: OuvertureVraie) => void; retirer: () => void }) {
  const nombre = (cle: 'x' | 'y' | 'l' | 'h', libelle: string) => (
    <label className="calChamp">{libelle}
      <input type="number" step="0.05" min="0" value={o[cle]} onChange={(e) => { const v = parseFloat(e.target.value); if (Number.isFinite(v) && v >= 0) modifier({ ...o, [cle]: Math.round(v * 100) / 100 }); }} />
    </label>
  );
  return (
    <div className="calFiche" role="group" aria-label="Ouverture choisie">
      <label className="calChamp">Type
        <select value={o.type} onChange={(e) => modifier({ ...o, type: e.target.value as TypeOuverture })}>{TYPES.map((t) => <option key={t} value={t}>{LIBELLES_OUVERTURE[t]}</option>)}</select>
      </label>
      {nombre('x', 'À gauche (m)')}{nombre('y', 'Du sol (m)')}{nombre('l', 'Largeur (m)')}{nombre('h', 'Hauteur (m)')}
      <button type="button" className="secondary small danger" data-controle="calibration.retirerBaie" onClick={retirer}>Retirer cette ouverture</button>
    </div>
  );
}

/**
 * Les quatre reperes de la photo courante (ceux poses, sinon les coins du mur retenus : un rectangle du mur, eux aussi), et la reprise
 * a la main de l'egout, du sol et des bouts sur la photo redressee entiere : le geste partage avec l'audit (PoserReperes).
 */
function PlacerReperes({ photo, rang, p, gabarit, poser, retirer, charger, ajusterMur }: { photo: Photo; rang: number; p: CasStocke['photos'][number] | undefined; gabarit: GabaritMur; poser: (c: P2[]) => void; retirer: () => void; charger: () => Promise<Image | null>; ajusterMur: (m: MurAjuste) => void }) {
  const r = reperesDe(p);
  return (
    <PoserReperes photo={photo} rang={rang} reperes={r ?? p?.coins ?? coinsParDefaut(photo.image.largeur, photo.image.hauteur)} changer={poser}
      mur={p?.coins ?? null} gabarit={gabarit} charger={charger} ajusterMur={ajusterMur} suite="« Retrouver le mur sur toutes les photos », ou « Rejouer » après un mur ajusté">
      {r && <button type="button" className="secondary small" data-controle="calibration.retirerReperes" onClick={retirer}>Retirer les repères de cette photo</button>}
    </PoserReperes>
  );
}

/** Les photos du cas, en vignettes : la courante, l'origine de ses coins, et de quoi la retirer. */
function VignettesDuCas({ images, courante, origines, choisir, retirer }: { images: readonly string[]; courante: number; origines: Readonly<Record<number, OrigineCoins>>; choisir: (k: number) => void; retirer: (k: number) => void }) {
  if (!images.length) return null;
  return (
    <ul className="calVignettes" aria-label="Photos du cas">
          {images.map((u, k) => (
            <li key={k} className={k === courante ? 'actif' : ''}>
              <button type="button" className="calVignette" data-controle="calibration.choisirPhoto" aria-pressed={k === courante} aria-label={'Photo ' + (k + 1)} onClick={() => choisir(k)}><img src={u} alt={'Photo ' + (k + 1)} /></button>
              {origines[k] && <small className="calNote" data-controle="calibration.originePhoto">{LIBELLE_ORIGINE[origines[k] as OrigineCoins]}</small>}
              <button type="button" className="secondary small" data-controle="calibration.retirerPhoto" aria-label={'Retirer la photo ' + (k + 1)} onClick={() => retirer(k)}>Retirer</button>
            </li>
          ))}
        </ul>
  );
}

interface Props {
  cas: CasStocke;
  /** L'identifiant du cas sur le serveur ; null tant qu'il n'est pas enregistre. */
  id: string | null;
  outils: OutilsPhotos;
  enregistrer: (cas: CasStocke) => Promise<string | null>;
  supprimer: (() => Promise<string | null>) | null;
  fermer: () => void;
  /**
   * Le cas vient d'un audit : ses dimensions sont celles du plan (cadastre, LiDAR) et restent ; les coins se cherchent des
   * l'ouverture, aux proportions du plan.
   */
  chercherCoins?: boolean;
}

/** Une dimension du mur en metres ; une valeur nulle ou illisible ne s'ecrit pas. */
function NombreM({ libelle, controle, valeur, changer }: { libelle: string; controle: string; valeur: number; changer: (v: number) => void }) {
  return (
    <label className="calChamp">{libelle}
      <input type="number" step="0.1" min="0.5" value={valeur} data-controle={controle} onChange={(e) => { const v = parseFloat(e.target.value); if (Number.isFinite(v) && v > 0) changer(v); }} />
    </label>
  );
}

/**
 * L'annotation du mur redresse : partir de la detection, tracer, choisir, retirer. Le choix et le trace repartent a zero avec chaque
 * nouveau redressement (la cle de l'elevation).
 */
function AnnotationDuCas({ elevation, ouvertures, modifier }: { elevation: Elevation; ouvertures: readonly OuvertureVraie[]; modifier: (f: (c: CasStocke) => CasStocke) => void }) {
  const [choisie, setChoisie] = useState<number | null>(null);
  const [tracer, setTracer] = useState(false);
  return <>
      <p className="calNote">Mur redressé. Les rectangles sont les ouvertures de la vérité : partez de la détection, retirez les fausses, tracez les manquées (« Tracer une ouverture », puis glissez sur le mur ; le doigt défile la page quand le tracé est coupé), ajustez les cotes.</p>
      <div className="calLigne">
        <button type="button" className="secondary" data-controle="calibration.proposer" onClick={() => { modifier((c) => ({ ...c, ouvertures: elevation.propositions.map((o) => ({ ...o })) })); setChoisie(null); }}>Partir de la détection ({elevation.propositions.length})</button>
        <button type="button" className={tracer ? '' : 'secondary'} aria-pressed={tracer} data-controle="calibration.tracer" onClick={() => setTracer((t) => !t)}>{tracer ? 'Tracé en cours : toucher pour défiler' : 'Tracer une ouverture'}</button>
        <button type="button" className="secondary" data-controle="calibration.viderBaies" onClick={() => { modifier((c) => ({ ...c, ouvertures: [] })); setChoisie(null); }} disabled={!ouvertures.length}>Tout effacer</button>
      </div>
      <ToileAnnotation trace={tracer} elevation={elevation} ouvertures={ouvertures} choisie={choisie} choisir={setChoisie} ajouter={(o) => { modifier((c) => ({ ...c, ouvertures: [...c.ouvertures, o] })); setChoisie(ouvertures.length); }} />
      {choisie !== null && ouvertures[choisie] && <FicheOuverture o={ouvertures[choisie] as OuvertureVraie} modifier={(o) => modifier((c) => ({ ...c, ouvertures: c.ouvertures.map((x, i) => (i === choisie ? o : x)) }))} retirer={() => { modifier((c) => ({ ...c, ouvertures: c.ouvertures.filter((_, i) => i !== choisie) })); setChoisie(null); }} />}
      <p className="calNote">{ouvertures.length} ouverture{ouvertures.length > 1 ? 's' : ''} annotée{ouvertures.length > 1 ? 's' : ''}.</p>
  </>;
}

const pause = (ms: number) => new Promise<void>((ok) => setTimeout(ok, ms));

/** L'index d'une etape dans l'ordre de l'enchainement. */
const rang = (id: IdEtape) => ETAPES_FACADE.findIndex((e) => e.id === id);

/**
 * Le rejeu d'un cas par l'orchestrateur, et ce que la barre en montre pendant le calcul. Par defaut le cas tel qu'il est enregistre (les
 * coins de ses photos) : un rejeu reproductible. `chercher` : les coins de chaque photo se cherchent de nouveau (un mur pose a la main
 * reste), a l'ajout d'une photo, a l'ouverture d'un cas tire d'un audit, ou a la demande. Rejouer depuis une etape reprend les sorties
 * des precedentes.
 */
function useRejeu(outils: OutilsPhotos, hauteurDuPlan: boolean) {
  const [rejeu, setRejeu] = useState<Enchainement | null>(null);
  const [progression, setProgression] = useState<EtapeAffichee[]>([]);
  const [enCours, setEnCours] = useState<IdEtape | null>(null);
  const arret = useRef(false);
  const lancer = async (depart: CasStocke, depuis: IdEtape | null, mode?: 'chercher' | 'garder', ia: RunEnregistre | null = null): Promise<{ cas: CasStocke; r: Enchainement; images: Image[]; cherche: boolean }> => {
    arret.current = false;
    // Rendre la main un instant : la barre doit s'afficher avant que le redressement, long sur un telephone, occupe le fil.
    await pause(30);
    const images = await Promise.all(depart.images.map((u) => outils.decoder(u)));
    const coins = mode ?? 'garder';
    const precedent = depuis && rejeu ? { depuis, precedent: rejeu } : {};
    setProgression(precedent.precedent ? precedent.precedent.etapes.filter((e) => rang(e.id) < rang(depuis as IdEtape)) : []);
    const r = await derouler(entreesDuCas(depart, images), {
      coins, image: 'assemblage', chercherCoins: async (e) => rechercher(e), hauteurDuPlan, illustrer: true, verite: veriteDuCas(depart), ia, ...precedent,
      surEtape: (id, etat: EtatAffiche, resume = '') => {
        setEnCours(etat === 'en-cours' ? id : null);
        if (etat !== 'en-cours') setProgression((p) => [...p.filter((x) => x.id !== id), { id, etat, resume }]);
      },
      rendreLaMain: () => pause(0), arrete: () => arret.current,
    });
    setRejeu(r); setProgression(r.etapes); setEnCours(null);
    return { cas: coins === 'chercher' ? casApresRejeu(depart, r) : depart, r, images, cherche: coins === 'chercher' };
  };
  return { rejeu, setRejeu, progression, enCours, lancer, arreter: () => { arret.current = true; } };
}

/** Une image en adresse, une seule fois par image : la frise et l'etape ouverte montrent souvent la meme. */
function useAdresses(outils: OutilsPhotos): (img: Image) => string {
  const cache = useMemo(() => new WeakMap<Image, string>(), [outils]);
  return useCallback((img: Image) => { let u = cache.get(img); if (!u) { u = outils.elevationEnUrl(img); cache.set(img, u); } return u; }, [cache, outils]);
}

/**
 * Le mode « IA » du rejeu et « Rappeler Claude » (MD/spec-facade-calage-audit.md §7.2, lot F2) : les reponses enregistrees du cas, celle
 * que l'on rejoue (la plus recente par defaut), et l'appel qui en ajoute une, sans jamais ecraser les autres.
 */
function useClaude(cas: CasStocke) {
  const [modeIa, setModeIa] = useState(false);
  const [choisi, setChoisi] = useState<number | null>(null);
  const runs = cas.ia ?? [];
  const k = choisi !== null && choisi < runs.length ? choisi : runs.length - 1;
  return { modeIa, setModeIa, choisi: k, setChoisi, runs, run: modeIa ? (runs[k] ?? null) : null };
}

/** Le panneau de Claude : le mode du rejeu, la reponse rejouee (sa date, ses versions, son cout), et les appels. */
function PanneauClaude({ c, peutAppeler, occupe, rejouer, appeler }: { c: ReturnType<typeof useClaude>; peutAppeler: boolean; occupe: boolean; rejouer: (run: RunEnregistre | null) => void; appeler: (passes: 1 | 3) => void }) {
  return (
    <section className="calClaude" aria-label="Claude : le run de la façade">
      <h3 className="calTitre3">Claude : le run de la façade</h3>
      <div className="calLigne" role="group" aria-label="Mode du rejeu">
        <button type="button" className={c.modeIa ? 'secondary small' : 'small'} aria-pressed={!c.modeIa} data-controle="calibration.modeDeterministe" disabled={occupe} onClick={() => { c.setModeIa(false); rejouer(null); }}>Déterministe</button>
        <button type="button" className={c.modeIa ? 'small' : 'secondary small'} aria-pressed={c.modeIa} data-controle="calibration.modeIa" disabled={occupe || !c.runs.length} onClick={() => { c.setModeIa(true); rejouer(c.runs[c.choisi] ?? null); }}>IA (réponse enregistrée)</button>
      </div>
      {c.runs.length
        ? <label className="calChamp">Réponse rejouée, sans réseau ni coût
          <select value={c.choisi} data-controle="calibration.choisirRun" disabled={occupe} onChange={(e) => { const k = Number(e.target.value); c.setChoisi(k); if (c.modeIa) rejouer(c.runs[k] ?? null); }}>
            {c.runs.map((r, k) => <option key={k} value={k}>{enteteDuRun(r)}</option>)}
          </select>
        </label>
        : <p className="calNote">Aucune réponse de Claude enregistrée pour ce cas : rappelez-le pour en avoir une.</p>}
      {peutAppeler && <div className="calLigne">
        <button type="button" className="secondary" data-controle="calibration.rappelerClaude" disabled={occupe} onClick={() => appeler(1)}>Rappeler Claude</button>
        <button type="button" className="secondary" data-controle="calibration.rappelerClaude3" disabled={occupe} onClick={() => appeler(3)}>Rappeler Claude ×3 (vote, pour mesurer)</button>
        <span className="calNote">Un appel coûte quelques dixièmes de centime (×3 : trois fois plus) ; la réponse s’ajoute aux précédentes, enregistrée avec le cas.</span>
      </div>}
    </section>
  );
}

export function EditeurCasCalibration({ cas: depart, id, outils, enregistrer, supprimer, fermer, chercherCoins = false }: Props) {
  const [cas, setCas] = useState<CasStocke>(depart);
  const [courante, setCourante] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [occupe, setOccupe] = useState(false);
  const [dims, setDims] = useState<Record<number, { l: number; h: number }>>({});
  const [origines, setOrigines] = useState<Record<number, OrigineCoins>>(() => originesDuCas(depart));
  const [ouverte, setOuverte] = useState<IdEtape | null>(null);
  // Par defaut tout est automatique : coins, redressement, fusion, et ouvertures proposees par la detection (a relire).
  const [auto, setAuto] = useState(true);
  const { rejeu, setRejeu, progression, enCours, lancer, arreter } = useRejeu(outils, chercherCoins);
  const claude = useClaude(cas);
  const url = useAdresses(outils);
  const modifier = (f: (c: CasStocke) => CasStocke) => setCas((c) => f(c));
  // Un geste sur les photos rend le rejeu caduc : ses sorties ne valent plus pour ce cas.
  const oublier = () => setRejeu(null);
  useEffect(() => outils.ecouterEtape?.(setOuverte), [outils]);

  const rejouer = async (depart: CasStocke = cas, depuis: IdEtape | null = null, mode?: 'chercher' | 'garder', ia: RunEnregistre | null = claude.run) => {
    setOccupe(true); setMessage(null);
    try {
      const { cas: suite, r, images, cherche } = await lancer(depart, depuis, mode, ia);
      setCas(suite); setDims(Object.fromEntries(images.map((im, k) => [k, { l: im.largeur, h: im.hauteur }])));
      const calees = r.sorties.calage?.photos;
      if (calees && cherche) setOrigines(Object.fromEntries(calees.flatMap((p, k) => (p.origine ? [[k, p.origine]] : []))));
      const a = r.sorties.analyse;
      if (!a) setMessage('Le mur ne se redresse pas : posez quatre repères sur la photo, puis « Retrouver le mur sur toutes les photos ».');
      // Un cas sans annotation part de la detection ; une annotation deja faite n'est jamais ecrasee.
      else if (auto) modifier((c) => (c.ouvertures.length ? c : { ...c, ouvertures: a.ouvertures.map(({ type, x, y, l, h }) => ({ type, x, y, l, h })) }));
    } catch (e) { setMessage('Rejeu impossible : ' + ((e as Error).message || String(e))); } finally { setOccupe(false); }
  };
  const ajouterPhotos = async (fichiers: FileList | null) => {
    if (!fichiers?.length) return;
    setOccupe(true); setMessage(null);
    try {
      let suite = cas;
      for (const f of Array.from(fichiers).slice(0, PHOTOS_CAS_MAX - cas.photos.length)) {
        const u = await outils.reduirePhoto(f);
        const img = await outils.decoder(u);
        // Les coins se cherchent au rejeu, sur toute la serie ; ce qui reste devine est dit, la personne le corrige au doigt.
        const k = suite.photos.length;
        suite = { ...suite, images: [...suite.images, u], photos: [...suite.photos, { fichier: 'photo-' + (k + 1), coins: coinsParDefaut(img.largeur, img.hauteur) }] };
        setDims((d) => ({ ...d, [k]: { l: img.largeur, h: img.hauteur } }));
      }
      setCas(suite); oublier();
      if (auto) await rejouer(suite, null, 'chercher');
    } catch (e) { setMessage('Photo illisible : ' + ((e as Error).message || String(e))); } finally { setOccupe(false); }
  };
  // Les rangs des photos suivantes reculent d'un cran : leurs dimensions et l'origine de leurs coins les suivent.
  const decaler = <T,>(r: Record<number, T>, k: number): Record<number, T> => Object.fromEntries(Object.entries(r).filter(([i]) => Number(i) !== k).map(([i, v]) => [Number(i) > k ? Number(i) - 1 : Number(i), v]));
  const retirerPhoto = (k: number) => { modifier((c) => ({ ...c, images: c.images.filter((_, i) => i !== k), photos: c.photos.filter((_, i) => i !== k) })); setDims((d) => decaler(d, k)); setOrigines((o) => decaler(o, k)); setCourante(0); oublier(); };
  // Le mur ajuste a la main sur la photo courante redressee : ses coins seuls (le gabarit s'y pose) ; il se reporte sur les autres photos.
  const murCourant = ({ coins }: MurAjuste) => {
    modifier((c) => ({ ...c, photos: c.photos.map((p, i) => { if (i !== courante) return p; const q = { ...p, coins, murALaMain: true }; delete q.silhouette; return q; }) }));
    setOrigines((o) => ({ ...o, [courante]: 'main' })); oublier();
  };
  // L'option manuelle de l'E4 : le mur cale sur l'assemblage, pose sur chaque photo assemblee, puis rejoue depuis le calage.
  const caler = (coins: P2[]) => { if (!rejeu) return; const c = casCaleALaMain(cas, rejeu, coins); setCas(c); setOrigines((o) => ({ ...o, ...Object.fromEntries(c.photos.flatMap((p, i) => (p.murALaMain ? [[i, 'main' as const]] : []))) })); void rejouer(c, 'calage'); };
  // « Rappeler Claude » : le run sur l'assemblage du rejeu (ce qu'il ne montre pas en gris), enregistre avec le cas, puis rejoue en IA.
  const appeler = async (passes: 1 | 3) => {
    const m = rejeu?.sorties.mosaique;
    if (!outils.appelerClaude || !m) { setMessage('Rejouez d’abord le cas : Claude lit l’assemblage des photos.'); return; }
    setOccupe(true); setMessage(null);
    const texte = texteRunFacade({ etiquette: cas.nom, image: 'assemblage', pointes: rejeu.sorties.preparation?.pointes ?? [], parement: cas.parement ?? null });
    const r = await outils.appelerClaude({ image: m.image, cache: m.vu.map((v) => (v ? 0 : 1)), texte, passes });
    setOccupe(false);
    if ('erreur' in r) { setMessage(r.erreur); return; }
    const suite = { ...cas, ia: [...(cas.ia ?? []), r.run] };
    setCas(suite); claude.setChoisi(suite.ia.length - 1); claude.setModeIa(true);
    await rejouer(suite, 'calage', undefined, r.run);
    setMessage((m) => 'Réponse enregistrée : ' + enteteDuRun(r.run) + '. Enregistrez le cas pour la garder.' + (m ? ' ' + m : ''));
  };
  const chargerCourante = useCallback(async () => (cas.images[courante] ? outils.decoder(cas.images[courante] as string) : null), [cas.images, courante, outils]);
  // Les reperes de la photo courante : ils la redressent au prochain rejeu ; null les retire.
  const reperesCourants = (reperes: P2[] | null) => {
    modifier((c) => ({ ...c, photos: c.photos.map((p, i) => { if (i !== courante) return p; const q = { ...p }; if (reperes) q.reperes = reperes; else delete q.reperes; return q; }) }));
    // Un mur deja ajuste a la main le reste : les reperes ne font que redresser la photo.
    setOrigines((o) => { const q = { ...o }; if (reperes) q[courante] = q[courante] === 'main' ? 'main' : 'reperes'; else if (q[courante] !== 'main') delete q[courante]; return q; });
    oublier();
  };
  // Un cas tire d'un audit se rejoue des l'ouverture, ses coins cherches : il n'y a rien a placer avant.
  useEffect(() => { if (chercherCoins) void rejouer(cas, null, 'chercher'); }, []);
  const sauver = async () => {
    if (!cas.nom.trim()) { setMessage('Donnez un nom au cas (la maison, le côté).'); return; }
    if (!cas.photos.length) { setMessage('Ajoutez au moins une photo.'); return; }
    setOccupe(true);
    const erreur = await enregistrer({ ...cas, nom: cas.nom.trim() });
    setOccupe(false);
    if (erreur) setMessage(erreur); else fermer();
  };
  const images = useMemo(() => (rejeu ? imagesEtapes(rejeu, { largeurM: cas.largeurM, hauteurM: cas.hauteurM, gabarit: cas.gabarit ?? GABARIT_RECTANGLE, photos: cas.photos }) : null), [rejeu, cas.largeurM, cas.hauteurM, cas.gabarit, cas.photos]);
  const a = rejeu?.sorties.analyse;
  const elevation = useMemo<Elevation | null>(() => (a ? { url: url(a.elevation), largeurM: a.elevation.largeur / a.pxParM, hauteurM: a.elevation.hauteur / a.pxParM, propositions: a.ouvertures.map(({ type, x, y, l, h }) => ({ type, x, y, l, h })) } : null), [a, url]);
  const photo: Photo | null = cas.images[courante] && dims[courante] ? { image: { largeur: dims[courante].l, hauteur: dims[courante].h, donnees: new Uint8ClampedArray(0) }, url: cas.images[courante] as string, champ: null, focalePx: null } : null;
  return (
    <section className="calEditeur" aria-label={id ? 'Cas ' + cas.nom : 'Nouveau cas'}>
      <BarreProgressionFacade etapes={enCours || occupe ? progression : (rejeu?.etapes ?? [])} enCours={enCours} ouverte={ouverte} ouvrable={() => true} commandes={outils.commandes ?? null} arreter={arreter} />
      <h2 className="calTitre2">{id ? 'Cas : ' + cas.nom : 'Nouveau cas'}</h2>
      <div className="calLigne">
        <label className="calChamp">Nom<input type="text" value={cas.nom} data-controle="calibration.nomCas" onChange={(e) => modifier((c) => ({ ...c, nom: e.target.value }))} placeholder="Maison de la rue X, façade sud" /></label>
        <NombreM libelle="Largeur du mur (m)" controle="calibration.largeurM" valeur={cas.largeurM} changer={(v) => { modifier((c) => ({ ...c, largeurM: v })); oublier(); }} />
        <NombreM libelle="Hauteur à l’égout (m)" controle="calibration.hauteurM" valeur={cas.hauteurM} changer={(v) => { modifier((c) => ({ ...c, hauteurM: v })); oublier(); }} />
      </div>

      <label className="calCase"><input type="checkbox" checked={auto} data-controle="calibration.auto" onChange={(e) => setAuto(e.target.checked)} /> Automatique : rejouer le cas et proposer les ouvertures dès l’ajout d’une photo</label>
      <div className="calLigne">
        <label className={'boutonFichier' + (cas.photos.length >= PHOTOS_CAS_MAX || occupe ? ' desactive' : '')}>
          <input type="file" accept="image/*" capture="environment" multiple disabled={cas.photos.length >= PHOTOS_CAS_MAX || occupe} data-controle="calibration.photo" onChange={(e) => { const f = e.target.files; void ajouterPhotos(f).then(() => { e.target.value = ''; }); }} />
          <span>{cas.photos.length ? 'Ajouter une photo du même mur' : 'Prendre ou choisir une photo'}</span>
        </label>
        <span className="calNote">{cas.photos.length} / {PHOTOS_CAS_MAX} photos. {auto ? 'Tout se rejoue seul à l’ajout ; corrigez au doigt ce que la barre signale et relisez les ouvertures.' : 'Placez les repères, puis retrouvez le mur.'}</span>
      </div>
      <VignettesDuCas images={cas.images} courante={courante} origines={origines} choisir={setCourante} retirer={retirerPhoto} />

      {photo && <PlacerReperes key={courante} photo={photo} rang={courante} p={cas.photos[courante]} gabarit={cas.gabarit ?? GABARIT_RECTANGLE} poser={reperesCourants} retirer={() => reperesCourants(null)} charger={chargerCourante} ajusterMur={murCourant} />}
      <div className="calLigne">
        <button type="button" data-controle="calibration.rejouer" disabled={!cas.photos.length || occupe} onClick={() => { void rejouer(); }}>{occupe ? 'Calcul…' : 'Rejouer'}</button>
        <button type="button" className="secondary" data-controle="calibration.coinsSerie" disabled={!cas.photos.length || occupe} onClick={() => { void rejouer(cas, null, 'chercher'); }}>Retrouver le mur sur toutes les photos</button>
      </div>
      <PanneauClaude c={claude} peutAppeler={!!outils.appelerClaude && !!rejeu?.sorties.mosaique} occupe={occupe} rejouer={(run) => { if (rejeu) void rejouer(cas, 'calage', undefined, run); }} appeler={(n) => { void appeler(n); }} />
      {rejeu && <FriseEtapes rejeu={rejeu} images={images} ouverte={ouverte} url={url} commandes={outils.commandes ?? null} />}
      {rejeu && images && ouverte && <EtapeOuverte id={ouverte} rejeu={rejeu} images={images} cas={cas} dims={dims} url={url} occupe={occupe} rejouerDepuis={(e) => { void rejouer(cas, e); }} caler={caler} />}

      {elevation && <AnnotationDuCas key={elevation.url} elevation={elevation} ouvertures={cas.ouvertures} modifier={modifier} />}

      <label className="calCase"><input type="checkbox" checked={cas.statut === 'valide'} data-controle="calibration.valide" onChange={(e) => modifier((c) => ({ ...c, statut: e.target.checked ? 'valide' : 'brouillon' }))} /> J’ai relu les ouvertures sur la photo : ce cas compte dans la calibration</label>
      {message && <p className="arbMessage" role="alert">{message}</p>}
      <div className="calLigne">
        <button type="button" data-controle="calibration.enregistrerCas" disabled={occupe} onClick={() => { void sauver(); }}>Enregistrer le cas</button>
        <button type="button" className="secondary" data-controle="calibration.fermerCas" onClick={fermer}>Fermer</button>
        {supprimer && <button type="button" className="secondary danger" data-controle="calibration.supprimerCas" disabled={occupe} onClick={() => { if (window.confirm('Supprimer ce cas ? Le fichier est mis de côté sur le serveur.')) void supprimer().then((e) => { if (e) setMessage(e); else fermer(); }); }}>Supprimer</button>}
      </div>
    </section>
  );
}

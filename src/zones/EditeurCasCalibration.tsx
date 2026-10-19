// Admin › Calibrer la detection : un cas = une facade photographiee et annotee (facade/corpusReel.ts).
//
// On prend (ou choisit) une a huit photos du meme mur, on place les quatre coins sur chacune (ou on les laisse trouver, par la
// chaine de l'audit et du releve, zones/releve/chaine.ts), on donne
// la largeur et la hauteur reelles, on redresse, puis on annote les ouvertures sur le mur redresse : la detection en propose, on retire les
// fausses et on trace les manquees. Rien n'est ecrit avant « Enregistrer » ; un cas ne compte dans la calibration qu'une fois
// marque « relu sur la photo » (valide).

import { useEffect, useRef, useState } from 'react';
import { Coins } from './releve/Coins.js';
import { pointSvg } from './releve/commun.js';
import { LIBELLES_OUVERTURE } from './releve/commun.js';
import { preparerCas, type CasPrepare, type CasStocke, type OuvertureVraie } from '../facade/corpusReel.js';
import { avisFusion } from './releve/analyse.js';
import { priseSansCapteurs, redresserEtFusionner } from './releve/chaine.js';
import { rechercher } from './releve/serie.js';
import type { Facade } from '../facade/geometrie.js';
import type { BilanPhotoRedressement } from '../model/auditParcelle.js';
import type { OuvertureDetectee } from '../facade/detection.js';
import { elevationAvecMasque, photoRedressee } from './etapesCalibration.js';
import type { Image, P2 } from '../facade/homographie.js';
import type { Photo } from '../ui/releve/camera.js';
import type { TypeOuverture } from '../model/types.js';

export const PHOTOS_CAS_MAX = 8;
const TYPES: readonly TypeOuverture[] = ['fenetre', 'porte-fenetre', 'porte', 'garage'];

/** Ce que l'editeur demande au navigateur : reduire une photo, la decoder, montrer une elevation. */
export interface OutilsPhotos {
  reduirePhoto: (f: File) => Promise<string>;
  decoder: (url: string) => Promise<Image>;
  elevationEnUrl: (img: Image) => string;
}

/** Quatre coins par defaut, dans les trois quarts centraux de la photo. */
export const coinsParDefaut = (l: number, h: number): P2[] => [{ x: l * 0.12, y: h * 0.12 }, { x: l * 0.88, y: h * 0.12 }, { x: l * 0.88, y: h * 0.88 }, { x: l * 0.12, y: h * 0.88 }];

/** D'ou viennent les coins d'une photo : trouves (sur ses aretes, ou sur l'assemblage des photos), devines (a verifier), ou poses a la main. */
type OrigineCoins = 'trouves' | 'devines' | 'main';
const LIBELLE_ORIGINE: Record<OrigineCoins, string> = { trouves: 'coins trouvés', devines: 'coins devinés, à vérifier', main: 'coins posés à la main' };

/**
 * Les coins du mur sur toutes les photos, par la chaine de l'audit et du releve (releve/chaine.ts) : coins poses a la main
 * gardes, les autres trouves sur les aretes (distorsion du grand-angle corrigee), reportes de la photo posee a la main ou lus sur
 * l'assemblage des vues, sinon predits ; des verticales qui penchent font essayer d'autres coins. Une photo n'a ni GPS ni
 * boussole : son champ vient de l'EXIF, sinon de ses points de fuite. `message` : les photos qui doutent, a reprendre au doigt.
 */
export async function coinsDeSerie(depart: CasStocke, images: readonly Image[], origines: Readonly<Record<number, OrigineCoins>>, dimsDuPlan = false): Promise<{ cas: CasStocke; origines: Record<number, OrigineCoins>; message: string | null; bilans: BilanPhotoRedressement[] }> {
  const L = depart.largeurM, H = depart.hauteurM;
  const f: Facade = { cote: 0, gauche: { x: 0, y: 0 }, droite: { x: L, y: 0 }, largeur: L, hauteur: H, normale: { x: 0, y: -1 }, azimut: 180, orientation: 'Sud' };
  const entrees = images.map((image, k) => { const fp = depart.photos[k]?.focalePx ?? null; return { rang: k, image, prise: priseSansCapteurs(image, fp), champConnu: fp != null }; });
  const corrections = Object.fromEntries(depart.photos.flatMap((p, k) => (origines[k] === 'main' ? [[String(k), { coins: p.coins }]] : [])));
  const c = await redresserEtFusionner(entrees, f, { pts: [{ x: 0, y: 0 }, { x: L, y: 0 }, { x: L, y: 6 }, { x: 0, y: 6 }] }, { chercherCoins: async (e) => rechercher(e), hauteurDuPlan: dimsDuPlan, lireSurLAssemblage: true, coinsSeuls: true }, corrections);
  const parRang = new Map(c.redressement.photos.map((b) => [b.rang, b]));
  const cas: CasStocke = { ...depart, photos: depart.photos.map((p, k) => { const px = parRang.get(k)?.coinsPx; return px?.length === 4 && origines[k] !== 'main' ? { ...p, coins: px } : p; }) };
  const nouvelles: Record<number, OrigineCoins> = {};
  for (const b of c.redressement.photos) nouvelles[b.rang] = b.coins === 'main' ? 'main' : b.coins === 'trouve' && b.statut !== 'echec' ? 'trouves' : 'devines';
  const doutes = c.redressement.photos.filter((b) => b.statut === 'echec' && b.motif);
  return { cas, origines: nouvelles, message: doutes.length ? doutes.map((b) => 'Photo ' + (b.rang + 1) + ' : ' + b.motif + '.').join(' ') : null, bilans: c.redressement.photos };
}

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

/** Ce que chaque etape a donne, en images : de quoi voir ou la chaine a doute avant d'annoter. */
interface Etapes {
  /** Par photo : sa vignette redressee seule (null : ses coins ne forment pas un mur). */
  redressees: (string | null)[];
  /** L'elevation, la part cachee sur toutes les vues hachuree. */
  masque: string;
  largeurM: number;
  hauteurM: number;
  fusion: CasPrepare['fusion'];
  propositions: readonly OuvertureDetectee[];
  devinees: readonly OuvertureDetectee[];
}

/** Les images des etapes d'un cas redresse. */
function etapesDe(p: CasPrepare, images: readonly Image[], depart: CasStocke, outils: OutilsPhotos): Etapes {
  const enUrl = (im: Image | null) => (im ? outils.elevationEnUrl(im) : null);
  return {
    redressees: images.map((im, k) => enUrl(photoRedressee(im, depart.photos[k]?.coins ?? [], depart.largeurM, depart.hauteurM))),
    masque: outils.elevationEnUrl(elevationAvecMasque(p.elevation, p.fusion?.occlusion ?? null)),
    largeurM: p.elevation.largeur / p.pxParM, hauteurM: p.elevation.hauteur / p.pxParM, fusion: p.fusion, propositions: p.ouvertures, devinees: p.devinees,
  };
}

const metres = (v: number) => String(Math.round(v * 100) / 100).replace('.', ',');
const pourcent = (v: number) => Math.round(v * 100) + ' %';
const degres = (v: number | null) => (v === null ? '' : ', verticales à ' + String(v).replace('.', ',') + '°');

/** Les quatre etapes du cas, chacune en image : coins, redressement de chaque photo, fusion, detection. */
function EtapesDuCas({ cas, dims, bilans, origines, etapes }: { cas: CasStocke; dims: Readonly<Record<number, { l: number; h: number }>>; bilans: Readonly<Record<number, BilanPhotoRedressement>>; origines: Readonly<Record<number, OrigineCoins>>; etapes: Etapes }) {
  const { largeurM: L, hauteurM: H } = etapes;
  const vue = (k: number) => etapes.fusion?.vues[k];
  return (
    <details className="calEtapes" open data-controle="calibration.etapes">
      <summary>Les étapes, en images</summary>
      <h4 className="calTitre3">1. Coins du mur sur chaque photo</h4>
      <ul className="calGrille" aria-label="Coins sur chaque photo">
        {cas.images.map((u, k) => {
          const d = dims[k], c = cas.photos[k]?.coins ?? [], b = bilans[k];
          return (
            <li key={k}><figure>
              {d ? <svg className="calEtape" viewBox={`0 0 ${d.l} ${d.h}`} role="img" aria-label={'Photo ' + (k + 1) + ' et ses coins'}>
                <image href={u} x={0} y={0} width={d.l} height={d.h} />
                <polygon className="calQuad" points={c.map((p) => p.x + ',' + p.y).join(' ')} vectorEffect="non-scaling-stroke" />
              </svg> : <img className="calEtape" src={u} alt={'Photo ' + (k + 1)} />}
              <figcaption>Photo {k + 1} : {origines[k] ? LIBELLE_ORIGINE[origines[k] as OrigineCoins] : cas.source === 'releve' ? 'mur déjà redressé au relevé' : 'coins à placer'}{b ? ' · ' + (b.statut === 'echec' ? 'à reprendre' : b.statut === 'manuelle' ? 'posés à la main' : 'redressée seule') + degres(b.verticaliteDeg) : ''}{b?.motif ? ' — ' + b.motif : ''}</figcaption>
            </figure></li>
          );
        })}
      </ul>
      <h4 className="calTitre3">2. Chaque photo redressée seule</h4>
      <ul className="calGrille" aria-label="Photos redressées">
        {etapes.redressees.map((u, k) => (
          <li key={k}><figure>
            {u ? <img className="calEtape" src={u} alt={'Photo ' + (k + 1) + ' redressée'} /> : <p className="calNote">Ses coins ne forment pas un mur.</p>}
            <figcaption>Photo {k + 1}, {metres(cas.largeurM)} × {metres(cas.hauteurM)} m</figcaption>
          </figure></li>
        ))}
      </ul>
      <h4 className="calTitre3">3. Fusion des vues</h4>
      {etapes.fusion ? <>
        <ul className="calListe" aria-label="Vues de la fusion">
          {cas.images.map((_, k) => {
            const v = vue(k);
            return <li key={k}>Photo {k + 1} : {!v ? '—' : v.fusionnee ? (k === etapes.fusion?.reference ? 'référence' : 'fusionnée') + ', ' + pourcent(v.part) + ' du mur pris sur elle' : 'à part — ' + (v.motif ?? 'elle ne se recale sur aucune autre')}</li>;
          })}
        </ul>
        <figure>
          <img className="calEtape large" src={etapes.masque} alt="Mur fusionné, la part cachée sur toutes les vues hachurée" />
          <figcaption>{etapes.fusion.masque > 0.005 ? 'Hachuré : ' + pourcent(etapes.fusion.masque) + ' du mur caché sur toutes les vues, où rien n’est cherché.' : 'Aucune part du mur n’est cachée sur toutes les vues.'}</figcaption>
        </figure>
      </> : <p className="calNote">Une seule photo : rien à fusionner.</p>}
      <h4 className="calTitre3">4. Ouvertures proposées par la détection</h4>
      <figure>
        <svg className="calEtape large" viewBox={`0 0 ${L} ${H}`} role="img" aria-label="Mur redressé et ouvertures proposées">
          <image href={etapes.masque} x={0} y={0} width={L} height={H} preserveAspectRatio="none" />
          {etapes.propositions.map((o, k) => <rect key={'p' + k} className="calPropose" x={o.x} y={H - o.y - o.h} width={o.l} height={o.h} vectorEffect="non-scaling-stroke" />)}
          {etapes.devinees.map((o, k) => <rect key={'d' + k} className="calDevinee" x={o.x} y={H - o.y - o.h} width={o.l} height={o.h} vectorEffect="non-scaling-stroke" />)}
        </svg>
        <figcaption>{etapes.propositions.length} ouverture{etapes.propositions.length > 1 ? 's' : ''} proposée{etapes.propositions.length > 1 ? 's' : ''} (trait plein){etapes.devinees.length ? ', ' + etapes.devinees.length + ' devinée' + (etapes.devinees.length > 1 ? 's' : '') + ' par la structure (pointillé)' : ''}.</figcaption>
      </figure>
    </details>
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

export function EditeurCasCalibration({ cas: depart, id, outils, enregistrer, supprimer, fermer, chercherCoins = false }: Props) {
  const [cas, setCas] = useState<CasStocke>(depart);
  const [courante, setCourante] = useState(0);
  const [elevation, setElevation] = useState<Elevation | null>(null);
  const [choisie, setChoisie] = useState<number | null>(null);
  const [tracer, setTracer] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [occupe, setOccupe] = useState(false);
  const [dims, setDims] = useState<Record<number, { l: number; h: number }>>({});
  const [origines, setOrigines] = useState<Record<number, OrigineCoins>>({});
  // Ce que la chaine a dit de chaque photo (coins, verticales, motif), et les images de chaque etape apres « Redresser ».
  const [bilans, setBilans] = useState<Record<number, BilanPhotoRedressement>>({});
  const [etapes, setEtapes] = useState<Etapes | null>(null);
  // Ce que le redressement et la fusion automatiques ont a redire (une vue non fusionnee, une part du mur cachee).
  const [avis, setAvis] = useState<string | null>(null);
  // Par defaut tout est automatique : coins, redressement, fusion, et ouvertures proposees par la detection (a relire).
  const [auto, setAuto] = useState(true);
  const modifier = (f: (c: CasStocke) => CasStocke) => setCas((c) => f(c));

  const ajouterPhotos = async (fichiers: FileList | null) => {
    if (!fichiers?.length) return;
    setOccupe(true); setMessage(null); setAvis(null);
    try {
      let suite = cas;
      for (const f of Array.from(fichiers).slice(0, PHOTOS_CAS_MAX - cas.photos.length)) {
        const url = await outils.reduirePhoto(f);
        const img = await outils.decoder(url);
        // Les coins se cherchent ensuite sur toute la serie (coinsDeSerie) ; ce qui reste devine est dit, la personne le corrige au doigt.
        const k = suite.photos.length;
        suite = { ...suite, images: [...suite.images, url], photos: [...suite.photos, { fichier: 'photo-' + (k + 1), coins: coinsParDefaut(img.largeur, img.hauteur) }] };
        setDims((d) => ({ ...d, [k]: { l: img.largeur, h: img.hauteur } }));
      }
      setCas(suite); setElevation(null);
      // Les coins de toute la serie, lus ensemble sur l'assemblage des photos redressees, puis le redressement et la fusion : la
      // photo reste dans le cas meme quand ils doutent.
      if (auto) await redresser(await coinsDeLaSerie(suite));
    } catch (e) { setMessage('Photo illisible : ' + ((e as Error).message || String(e))); } finally { setOccupe(false); }
  };
  // Les rangs des photos suivantes reculent d'un cran : leurs dimensions et l'origine de leurs coins les suivent.
  const decaler = <T,>(r: Record<number, T>, k: number): Record<number, T> => Object.fromEntries(Object.entries(r).filter(([i]) => Number(i) !== k).map(([i, v]) => [Number(i) > k ? Number(i) - 1 : Number(i), v]));
  const retirerPhoto = (k: number) => { modifier((c) => ({ ...c, images: c.images.filter((_, i) => i !== k), photos: c.photos.filter((_, i) => i !== k) })); setDims((d) => decaler(d, k)); setOrigines((o) => decaler(o, k)); setBilans((b) => decaler(b, k)); setCourante(0); setElevation(null); setEtapes(null); setAvis(null); };
  const poserCoins = (coins: P2[]) => { modifier((c) => ({ ...c, photos: c.photos.map((p, i) => (i === courante ? { ...p, coins } : p)) })); setOrigines((o) => ({ ...o, [courante]: 'main' })); };

  const coinsDeLaSerie = async (depart: CasStocke): Promise<CasStocke> => {
    await new Promise((ok) => setTimeout(ok, 30));
    const r = await coinsDeSerie(depart, await Promise.all(depart.images.map((u) => outils.decoder(u))), origines, chercherCoins);
    setOrigines(r.origines);
    setBilans(Object.fromEntries(r.bilans.map((b) => [b.rang, b])));
    setCas(r.cas);
    setMessage(r.message);
    return r.cas;
  };
  const recalculerCoins = async () => {
    setOccupe(true); setMessage(null); setAvis(null);
    try { await redresser(await coinsDeLaSerie(cas)); } catch (e) { setMessage('Coins introuvables : ' + ((e as Error).message || String(e))); } finally { setOccupe(false); }
  };
  // Un cas tire d'un audit cherche ses coins des l'ouverture : il n'y a rien a placer avant.
  useEffect(() => { if (chercherCoins) void recalculerCoins(); }, []);
  const redresser = async (depart: CasStocke = cas) => {
    setOccupe(true); setMessage(null); setAvis(null);
    try {
      // Rendre la main un instant : « Calcul… » doit s'afficher avant que le redressement, long sur un telephone, occupe le fil.
      await new Promise((ok) => setTimeout(ok, 30));
      const images = await Promise.all(depart.images.map((u) => outils.decoder(u)));
      const p: CasPrepare | null = preparerCas(depart, images);
      if (!p) { setMessage('Le mur ne se redresse pas avec ces coins : replacez-les sur les quatre angles du mur.'); setElevation(null); setEtapes(null); return; }
      setElevation({ url: outils.elevationEnUrl(p.elevation), largeurM: p.elevation.largeur / p.pxParM, hauteurM: p.elevation.hauteur / p.pxParM, propositions: p.ouvertures.map(({ type, x, y, l, h }) => ({ type, x, y, l, h })) });
      setAvis(p.fusion ? avisFusion(p.fusion) : null);
      setDims(Object.fromEntries(images.map((im, k) => [k, { l: im.largeur, h: im.hauteur }])));
      setEtapes(etapesDe(p, images, depart, outils));
      // Un cas sans annotation part de la detection ; une annotation deja faite n'est jamais ecrasee.
      if (auto) { const propositions = p.ouvertures.map(({ type, x, y, l, h }) => ({ type, x, y, l, h })); modifier((c) => (c.ouvertures.length ? c : { ...c, ouvertures: propositions })); setChoisie(null); }
    } catch (e) { setMessage('Redressement impossible : ' + ((e as Error).message || String(e))); } finally { setOccupe(false); }
  };
  const sauver = async () => {
    if (!cas.nom.trim()) { setMessage('Donnez un nom au cas (la maison, le côté).'); return; }
    if (!cas.photos.length) { setMessage('Ajoutez au moins une photo.'); return; }
    setOccupe(true);
    const erreur = await enregistrer({ ...cas, nom: cas.nom.trim() });
    setOccupe(false);
    if (erreur) setMessage(erreur); else fermer();
  };

  const photo: Photo | null = cas.images[courante] && dims[courante] ? { image: { largeur: dims[courante].l, hauteur: dims[courante].h, donnees: new Uint8ClampedArray(0) }, url: cas.images[courante] as string, champ: null, focalePx: null } : null;
  const nombreM = (cle: 'largeurM' | 'hauteurM', libelle: string) => (
    <label className="calChamp">{libelle}
      <input type="number" step="0.1" min="0.5" value={cas[cle]} data-controle={'calibration.' + cle} onChange={(e) => { const v = parseFloat(e.target.value); if (Number.isFinite(v) && v > 0) { modifier((c) => ({ ...c, [cle]: v })); setElevation(null); } }} />
    </label>
  );
  return (
    <section className="calEditeur" aria-label={id ? 'Cas ' + cas.nom : 'Nouveau cas'}>
      <h2 className="calTitre2">{id ? 'Cas : ' + cas.nom : 'Nouveau cas'}</h2>
      <div className="calLigne">
        <label className="calChamp">Nom<input type="text" value={cas.nom} data-controle="calibration.nomCas" onChange={(e) => modifier((c) => ({ ...c, nom: e.target.value }))} placeholder="Maison de la rue X, façade sud" /></label>
        {nombreM('largeurM', 'Largeur du mur (m)')}{nombreM('hauteurM', 'Hauteur à l’égout (m)')}
      </div>

      <label className="calCase"><input type="checkbox" checked={auto} data-controle="calibration.auto" onChange={(e) => setAuto(e.target.checked)} /> Automatique : chercher les coins, redresser, fusionner et proposer les ouvertures dès l’ajout d’une photo</label>
      <div className="calLigne">
        <label className={'boutonFichier' + (cas.photos.length >= PHOTOS_CAS_MAX || occupe ? ' desactive' : '')}>
          <input type="file" accept="image/*" capture="environment" multiple disabled={cas.photos.length >= PHOTOS_CAS_MAX || occupe} data-controle="calibration.photo" onChange={(e) => { const f = e.target.files; void ajouterPhotos(f).then(() => { e.target.value = ''; }); }} />
          <span>{cas.photos.length ? 'Ajouter une photo du même mur' : 'Prendre ou choisir une photo'}</span>
        </label>
        <span className="calNote">{cas.photos.length} / {PHOTOS_CAS_MAX} photos. {auto ? 'Tout se fait seul à l’ajout ; corrigez au doigt ce qui est signalé et relisez les ouvertures.' : 'Placez les coins, puis redressez.'}</span>
      </div>
      {cas.photos.length > 0 && (
        <ul className="calVignettes" aria-label="Photos du cas">
          {cas.images.map((u, k) => (
            <li key={k} className={k === courante ? 'actif' : ''}>
              <button type="button" className="calVignette" aria-pressed={k === courante} aria-label={'Photo ' + (k + 1)} onClick={() => setCourante(k)}><img src={u} alt={'Photo ' + (k + 1)} /></button>
              {origines[k] && <small className="calNote" data-controle="calibration.originePhoto">{LIBELLE_ORIGINE[origines[k] as OrigineCoins]}</small>}
              <button type="button" className="secondary small" data-controle="calibration.retirerPhoto" aria-label={'Retirer la photo ' + (k + 1)} onClick={() => retirerPhoto(k)}>Retirer</button>
            </li>
          ))}
        </ul>
      )}

      {photo && <>
        <p className="calNote">Photo {courante + 1} : placez les quatre coins du mur (égout à gauche, égout à droite, pied à droite, pied à gauche).</p>
        <Coins photo={photo} coins={cas.photos[courante]?.coins ?? coinsParDefaut(photo.image.largeur, photo.image.hauteur)} setCoins={(c) => { poserCoins(c); setElevation(null); setEtapes(null); }} sources={['doigt', 'doigt', 'doigt', 'doigt']} />
      </>}
      <div className="calLigne">
        <button type="button" data-controle="calibration.redresser" disabled={!cas.photos.length || occupe} onClick={() => { void redresser(); }}>{occupe ? 'Calcul…' : 'Redresser le mur'}</button>
        <button type="button" className="secondary" data-controle="calibration.coinsSerie" disabled={!cas.photos.length || occupe} onClick={() => { void recalculerCoins(); }}>Retrouver les coins sur toutes les photos</button>
      </div>
      {avis && <p className="calNote" role="status" data-controle="calibration.avisFusion">{avis}</p>}
      {etapes && <EtapesDuCas cas={cas} dims={dims} bilans={bilans} origines={origines} etapes={etapes} />}

      {elevation && <>
        <p className="calNote">Mur redressé. Les rectangles sont les ouvertures de la vérité : partez de la détection, retirez les fausses, tracez les manquées (« Tracer une ouverture », puis glissez sur le mur ; le doigt défile la page quand le tracé est coupé), ajustez les cotes.</p>
        <div className="calLigne">
          <button type="button" className="secondary" data-controle="calibration.proposer" onClick={() => { modifier((c) => ({ ...c, ouvertures: elevation.propositions.map((o) => ({ ...o })) })); setChoisie(null); }}>Partir de la détection ({elevation.propositions.length})</button>
          <button type="button" className={tracer ? '' : 'secondary'} aria-pressed={tracer} data-controle="calibration.tracer" onClick={() => setTracer((t) => !t)}>{tracer ? 'Tracé en cours : toucher pour défiler' : 'Tracer une ouverture'}</button>
          <button type="button" className="secondary" data-controle="calibration.viderBaies" onClick={() => { modifier((c) => ({ ...c, ouvertures: [] })); setChoisie(null); }} disabled={!cas.ouvertures.length}>Tout effacer</button>
        </div>
        <ToileAnnotation trace={tracer} elevation={elevation} ouvertures={cas.ouvertures} choisie={choisie} choisir={setChoisie} ajouter={(o) => { modifier((c) => ({ ...c, ouvertures: [...c.ouvertures, o] })); setChoisie(cas.ouvertures.length); }} />
        {choisie !== null && cas.ouvertures[choisie] && <FicheOuverture o={cas.ouvertures[choisie] as OuvertureVraie} modifier={(o) => modifier((c) => ({ ...c, ouvertures: c.ouvertures.map((x, i) => (i === choisie ? o : x)) }))} retirer={() => { modifier((c) => ({ ...c, ouvertures: c.ouvertures.filter((_, i) => i !== choisie) })); setChoisie(null); }} />}
        <p className="calNote">{cas.ouvertures.length} ouverture{cas.ouvertures.length > 1 ? 's' : ''} annotée{cas.ouvertures.length > 1 ? 's' : ''}.</p>
      </>}

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

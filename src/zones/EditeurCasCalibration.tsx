// Admin › Calibrer la detection : un cas = une facade photographiee et annotee (facade/corpusReel.ts).
//
// On prend (ou choisit) une a huit photos du meme mur. Chacune se redresse entiere, sans coupe : par quatre reperes poses au doigt
// (un rectangle du mur, n'importe lequel), sinon par ses points de fuite ; les vues s'assemblent, l'egout, le sol et les bouts du
// mur se cherchent sur l'assemblage, puis se reportent dans chaque photo (la chaine de l'audit et du releve, zones/releve/chaine.ts).
// On donne la largeur et la hauteur reelles, on redresse, puis on annote les ouvertures sur le mur redresse : la detection en propose, on retire les
// fausses et on trace les manquees. Rien n'est ecrit avant « Enregistrer » ; un cas ne compte dans la calibration qu'une fois
// marque « relu sur la photo » (valide).

import { useCallback, useEffect, useRef, useState } from 'react';
import { Coins } from './releve/Coins.js';
import { AjusterMur, type MurAjuste } from './releve/AjusterMur.js';
import { coinsParDefaut, LIBELLES_OUVERTURE, NOMS_REPERES, pointSvg } from './releve/commun.js';
import { preparerCas, type CasPrepare, type CasStocke, type OuvertureVraie } from '../facade/corpusReel.js';
import { avisFusion } from './releve/analyse.js';
import { priseSansCapteurs, redresserEtFusionner } from './releve/chaine.js';
import { rechercher } from './releve/serie.js';
import { coinsAutoDeSerie, type CoinsDeSerie } from './releve/coinsAuto.js';
import { GABARIT_RECTANGLE, gabaritSurLaPhoto, type GabaritMur } from '../facade/gabaritMur.js';
import { inverser } from '../facade/redressementFuites.js';
import type { MurLu } from '../facade/mosaiqueFuites.js';
import type { Facade } from '../facade/geometrie.js';
import type { BilanPhotoRedressement, CorrectionRedressement } from '../model/auditParcelle.js';
import type { OuvertureDetectee } from '../facade/detection.js';
import { sansOmbres } from '../facade/sansOmbres.js';
import { appliquer, homographie, type Image, type P2 } from '../facade/homographie.js';
import { appliquerSimilitude, inverse } from '../facade/ransac.js';
import { CalageSilhouette } from './CalageSilhouette.js';
import { VueFacade3d } from './VueFacade3d.js';
import type { AssemblageDuMur } from '../facade/analyseMur.js';
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

/**
 * D'ou viennent les coins d'une photo : trouves (sur ses aretes, ou sur l'assemblage des photos), devines (a verifier), poses a la main
 * (un ancien cas), ou cherches sur l'assemblage apres un redressement par les reperes de la personne.
 */
type OrigineCoins = 'trouves' | 'devines' | 'main' | 'reperes';
const LIBELLE_ORIGINE: Record<OrigineCoins, string> = { trouves: 'coins trouvés', devines: 'coins devinés, à vérifier', main: 'mur posé à la main', reperes: 'redressée par vos repères' };
/** Ce que la personne avait pose sur les photos d'un cas (un cas tire d'un audit, ou enregistre) : son mur ajuste a la main, ses reperes. */
const originesDuCas = (cas: CasStocke): Record<number, OrigineCoins> =>
  Object.fromEntries(cas.photos.flatMap((p, k): [number, OrigineCoins][] => (p.murALaMain ? [[k, 'main']] : reperesDe(p) ? [[k, 'reperes']] : [])));

/** Les reperes d'une photo, s'ils sont quatre. */
const reperesDe = (p: CasStocke['photos'][number] | undefined): P2[] | null => (p?.reperes?.length === 4 ? p.reperes : null);

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
  // Les reperes redressent la photo, puis le mur se cherche sur l'assemblage ; des coins poses a la main (ancien cas) restent tels quels.
  const corrections: Record<string, CorrectionRedressement> = {};
  // Le mur ajuste a la main (sur la photo redressee, ou un ancien cas aux coins poses) l'emporte : il se reporte sur les autres photos.
  depart.photos.forEach((p, k) => { const r = reperesDe(p), main = origines[k] === 'main'; if (r || main) corrections[String(k)] = { ...(r ? { reperes: r } : {}), ...(main ? { coins: p.coins } : {}) }; });
  const c = await redresserEtFusionner(entrees, f, { pts: [{ x: 0, y: 0 }, { x: L, y: 0 }, { x: L, y: 6 }, { x: 0, y: 6 }] }, { chercherCoins: async (e) => rechercher(e), hauteurDuPlan: dimsDuPlan, lireSurLAssemblage: true, coinsSeuls: true, gabarit: depart.gabarit ?? GABARIT_RECTANGLE }, corrections);
  const parRang = new Map(c.redressement.photos.map((b) => [b.rang, b]));
  // Des coins retrouves : la silhouette d'avant (posee sur d'autres coins) ne vaut plus, les etapes reposent le gabarit.
  const cas: CasStocke = { ...depart, photos: depart.photos.map((p, k) => { const px = parRang.get(k)?.coinsPx; if (!(px?.length === 4 && origines[k] !== 'main')) return p; const q = { ...p, coins: px }; delete q.silhouette; return q; }) };
  const nouvelles: Record<number, OrigineCoins> = {};
  for (const b of c.redressement.photos) nouvelles[b.rang] = b.coins === 'main' ? 'main' : reperesDe(depart.photos[b.rang]) ? 'reperes' : b.coins === 'trouve' && b.statut !== 'echec' ? 'trouves' : 'devines';
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
  /** Par photo : la photo entiere redressee (par ses reperes, sinon ses points de fuite), sans coupe ; null si elle ne se redresse pas. */
  entieres: ({ url: string; l: number; h: number; silhouette: P2[] | null } | null)[];
  /** La silhouette sur l'image posee sur la facade (la photo redressee et fusionnee), en metres depuis son coin haut gauche. */
  silhouetteTexture: P2[];
  /** La taille de cette image, en metres. */
  textureM: { l: number; h: number };
  /** L'assemblage des photos redressees, et le mur qui y a ete cherche (en pixels de l'assemblage) ; null sans assemblage. */
  assemblage: { url: string; largeur: number; hauteur: number; mur: MurLu } | null;
  /**
   * La facade complete : l'assemblage de l'etape 3, entier et tel quel (l'image prise pour la suite), en pixels de l'assemblage ; le
   * contour du mur (le sol, puis la silhouette a l'echelle de la facade), et les ouvertures proposees ramenees sur lui. Null quand
   * aucune photo ne s'assemble.
   */
  facade: { url: string; largeur: number; hauteur: number; contour: P2[]; propositions: P2[][]; devinees: P2[][] } | null;
  /** Le calage (etapes 5 et 6) : les coins du mur sur l'assemblage, et de quoi les ramener sur chaque photo ; null sans assemblage. */
  calage: { coins: P2[]; versPhotos: (coins: readonly P2[]) => (P2[] | null)[] } | null;
  /** Par photo : est-elle dans l'assemblage, et sinon pourquoi. */
  vuesAssemblage: { assemblee: boolean; motif: string | null }[];
  propositions: readonly OuvertureDetectee[];
  devinees: readonly OuvertureDetectee[];
  /** La texture posee sur la facade en 3D, telle quelle et sans les ombres de la photo (case « Facades sans ombres »). */
  surFacade: string;
  sansOmbres: string;
}

/** Ce que le redressement a a redire : une photo restee hors de l'assemblage (ou, sans assemblage, ce que dit la fusion). */
function avisDuCas(p: CasPrepare): string | null {
  if (p.fusion) return avisFusion(p.fusion);
  const k = p.assemblage?.vues.findIndex((v) => !v.assemblee) ?? -1;
  return k >= 0 ? `La photo ${k + 1} reste hors de l’assemblage : ${p.assemblage?.vues[k]?.motif ?? 'elle ne se recale sur aucune autre'}. Prenez-en une autre en gardant un tiers de mur en commun.` : null;
}

/**
 * L'assemblage de l'etape 3 (`sr`), pris tel quel pour la suite : son image, ce qu'il montre, et le mur pose dessus. Les coins du mur
 * sont ceux de la premiere photo assemblee (poses ou ajustes a la main, ou trouves), ramenes sur l'assemblage ; sinon le mur cherche
 * dessus.
 */
function assemblageDeLaSerie(sr: CoinsDeSerie, cas: CasStocke): AssemblageDuMur {
  const { image, vu, places, mur } = sr.assemblage;
  let coins: P2[] | null = null;
  for (let i = 0; i < sr.vues.length && !coins; i++) {
    const v = sr.vues[i], place = places[i], c = cas.photos[i]?.coins, inv = v ? inverser(v.versPhoto) : null;
    if (v && place && inv && c?.length === 4) coins = c.map((q) => appliquerSimilitude(place, appliquer(inv, q)));
  }
  const motif = new Map(sr.aPart.map((x) => [x.vue, x.motif]));
  return {
    image, vu, coins: coins ?? [{ x: mur.x0, y: mur.y0 }, { x: mur.x1, y: mur.y0 }, { x: mur.x1, y: mur.y1 }, { x: mur.x0, y: mur.y1 }],
    vues: sr.vues.map((_, i) => (motif.has(i) ? { assemblee: false, motif: motif.get(i) ?? null } : { assemblee: true, motif: null })),
  };
}

/**
 * La facade complete sur l'assemblage : le contour du mur (le sol, puis la silhouette mise a l'echelle de la facade par ses coins) et
 * les ouvertures proposees, ramenees du mur (metres, y depuis le sol) sur l'assemblage par les memes coins.
 */
function facadeSurLAssemblage(a: AssemblageDuMur, gabarit: GabaritMur, L: number, H: number, p: CasPrepare, url: string): NonNullable<Etapes['facade']> {
  const [, , bd, bg] = a.coins as [P2, P2, P2, P2];
  const versA = homographie([{ x: 0, y: H }, { x: L, y: H }, { x: L, y: 0 }, { x: 0, y: 0 }], a.coins);
  const quad = (o: OuvertureDetectee): P2[] => (versA ? [{ x: o.x, y: o.y + o.h }, { x: o.x + o.l, y: o.y + o.h }, { x: o.x + o.l, y: o.y }, { x: o.x, y: o.y }].map((q) => appliquer(versA, q)) : []);
  return {
    url, largeur: a.image.largeur, hauteur: a.image.hauteur,
    contour: [bg, ...(gabaritSurLaPhoto(gabarit, a.coins) ?? []), bd],
    propositions: p.ouvertures.map(quad), devinees: p.devinees.map(quad),
  };
}

/** Des coins du mur sur l'assemblage, ramenes sur chaque photo assemblee (assemblage -> vue de face -> photo) ; null hors assemblage. */
function versLesPhotos(sr: CoinsDeSerie, coins: readonly P2[]): (P2[] | null)[] {
  return sr.vues.map((v, i) => {
    const place = sr.assemblage.places[i], inv = place ? inverse(place) : null;
    return v && inv ? coins.map((q) => { const p = appliquer(v.versPhoto, appliquerSimilitude(inv, q)); return { x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10 }; }) : null;
  });
}

/** Le cas apres le calage de la silhouette : les coins de chaque photo assemblee, poses a la main. */
function casCale(cas: CasStocke, parPhoto: readonly (P2[] | null)[]): CasStocke {
  return { ...cas, photos: cas.photos.map((p, i) => { const c = parPhoto[i]; return c ? { ...p, coins: c, murALaMain: true } : p; }) };
}

/** L'assemblage de l'etape 3, fait une fois : il est montre, et c'est l'image prise pour la suite (mur, detection, texture). */
function preparerSurLAssemblage(cas: CasStocke, images: readonly Image[]): { sr: CoinsDeSerie | null; p: CasPrepare | null } {
  const sr = coinsAutoDeSerie(images, cas.largeurM, cas.hauteurM, cas.photos.map(reperesDe), cas.gabarit ?? GABARIT_RECTANGLE);
  return { sr, p: preparerCas(cas, images, true, sr ? assemblageDeLaSerie(sr, cas) : null) };
}

/** Les images des etapes d'un cas redresse. */
function etapesDe(p: CasPrepare, images: readonly Image[], depart: CasStocke, outils: OutilsPhotos, sr: CoinsDeSerie | null): Etapes {
  const enUrl = (im: Image | null) => (im ? outils.elevationEnUrl(im) : null);
  const gabarit = depart.gabarit ?? GABARIT_RECTANGLE;
  // Le gabarit pose sur chaque photo par ses coins, puis sur chaque vue redressee et sur l'image fusionnee : trace en surimpression.
  const silhouettes = images.map((_, k) => { const q = depart.photos[k]; return q?.coins.length === 4 ? gabaritSurLaPhoto(gabarit, q.coins) : null; });
  const L = depart.largeurM, H = depart.hauteurM;
  const a = p.assemblage;
  return {
    // Le contour du mur sur la texture (metres depuis son coin haut gauche) : le sol, puis le gabarit d'un angle a l'autre.
    silhouetteTexture: [{ x: 0, y: p.hauteurTexture }, ...gabarit.map((q) => ({ x: q.u * L, y: p.hauteurTexture - q.v * H })), { x: L, y: p.hauteurTexture }],
    textureM: { l: p.texture.largeur / p.pxParM, h: p.hauteurTexture },
    entieres: images.map((_, k) => {
      const v = sr?.vues[k], u = v ? enUrl(v.image) : null;
      if (!v || !u) return null;
      const versVue = inverser(v.versPhoto), sil = silhouettes[k];
      return { url: u, l: v.image.largeur, h: v.image.hauteur, silhouette: sil && versVue ? sil.map((q) => appliquer(versVue, q)) : null };
    }),
    assemblage: sr ? { url: outils.elevationEnUrl(sr.assemblage.image), largeur: sr.assemblage.image.largeur, hauteur: sr.assemblage.image.hauteur, mur: sr.assemblage.mur } : null,
    facade: a ? facadeSurLAssemblage(a, gabarit, L, H, p, outils.elevationEnUrl(a.image)) : null,
    calage: a && sr ? { coins: a.coins, versPhotos: (c) => versLesPhotos(sr, c) } : null,
    vuesAssemblage: a?.vues ?? [],
    propositions: p.ouvertures, devinees: p.devinees,
    surFacade: outils.elevationEnUrl(p.texture),
    // Les baies de la detection tiennent lieu de celles du releve, que la 3D met de cote pour lire l'eclairage du mur.
    sansOmbres: outils.elevationEnUrl(sansOmbres(p.texture, p.pxParM, p.ouvertures, depart.hauteurM)),
  };
}

/** La silhouette du haut du mur en surimpression sur une image (en unites de son cadre). */
function TraitSilhouette({ pts }: { pts: readonly P2[] }) {
  return <polyline className="calMurLigne silhouette" points={pts.map((p) => p.x + ',' + p.y).join(' ')} vectorEffect="non-scaling-stroke" />;
}

const metres = (v: number) => String(Math.round(v * 100) / 100).replace('.', ',');

/** La texture de la facade collee sur sa silhouette : ce qui tombe hors du contour du mur n'est pas pose en 3D. */
function SurLaSilhouette({ url, etapes, id, libelle }: { url: string; etapes: Etapes; id: string; libelle: string }) {
  const { l, h } = etapes.textureM, contour = etapes.silhouetteTexture.map((p) => p.x + ',' + p.y).join(' ');
  return (
    <svg className="calEtape large" viewBox={`0 0 ${l} ${h}`} role="img" aria-label={libelle}>
      <defs><clipPath id={id}><polygon points={contour} /></clipPath></defs>
      <image href={url} x={0} y={0} width={l} height={h} preserveAspectRatio="none" clipPath={`url(#${id})`} />
      <polygon className="calMurLigne silhouette" points={contour} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/** La facade complete : l'assemblage de l'etape 3 entier, le contour du mur (la silhouette a l'echelle de la facade) en surimpression. */
function SurLAssemblage({ f, libelle, ouvertures = false }: { f: NonNullable<Etapes['facade']>; libelle: string; ouvertures?: boolean }) {
  const pts = (l: readonly P2[]) => l.map((p) => p.x + ',' + p.y).join(' ');
  return (
    <svg className="calEtape large" viewBox={`0 0 ${f.largeur} ${f.hauteur}`} role="img" aria-label={libelle}>
      <image href={f.url} x={0} y={0} width={f.largeur} height={f.hauteur} />
      <polygon className="calMurLigne silhouette" points={pts(f.contour)} vectorEffect="non-scaling-stroke" />
      {ouvertures && f.propositions.map((q, k) => <polygon key={'p' + k} className="calPropose" points={pts(q)} vectorEffect="non-scaling-stroke" />)}
      {ouvertures && f.devinees.map((q, k) => <polygon key={'d' + k} className="calDevinee" points={pts(q)} vectorEffect="non-scaling-stroke" />)}
    </svg>
  );
}

/** Les neuf etapes du cas, chacune en image : reperes, photos redressees, assemblage, facade, calage, hauteur, ouvertures, image posee, 3D. */
function EtapesDuCas({ cas, dims, etapes, caler }: { cas: CasStocke; dims: Readonly<Record<number, { l: number; h: number }>>; etapes: Etapes; caler: (parPhoto: (P2[] | null)[]) => void }) {
  return (
    <details className="calEtapes" open data-controle="calibration.etapes">
      <summary>Les étapes, en images</summary>
      <h4 className="calTitre3">1. Les repères sur chaque photo</h4>
      <ul className="calGrille" aria-label="Repères sur chaque photo">
        {cas.images.map((u, k) => {
          const d = dims[k], r = reperesDe(cas.photos[k]);
          return (
            <li key={k}><figure>
              {d ? <svg className="calEtape" viewBox={`0 0 ${d.l} ${d.h}`} role="img" aria-label={'Photo ' + (k + 1) + (r ? ' et ses repères' : '')}>
                <image href={u} x={0} y={0} width={d.l} height={d.h} />
                {r && <polygon className="calReperes" points={r.map((p) => p.x + ',' + p.y).join(' ')} vectorEffect="non-scaling-stroke" />}
              </svg> : <img className="calEtape" src={u} alt={'Photo ' + (k + 1)} />}
              <figcaption>Photo {k + 1} : {r ? 'quatre repères posés, ils donnent ses verticales et ses horizontales' : 'sans repère : ses verticales et ses horizontales sont lues sur la photo (points de fuite)'}</figcaption>
            </figure></li>
          );
        })}
      </ul>
      <h4 className="calTitre3">2. Chaque photo redressée entière</h4>
      <ul className="calGrille" aria-label="Photos redressées entières">
        {etapes.entieres.map((u, k) => (
          <li key={k}><figure>
            {u ? <svg className="calEtape" viewBox={`0 0 ${u.l} ${u.h}`} role="img" aria-label={'Photo ' + (k + 1) + ' redressée entière, et la silhouette du haut du mur'}>
              <image href={u.url} x={0} y={0} width={u.l} height={u.h} />
              {u.silhouette && <TraitSilhouette pts={u.silhouette} />}
            </svg> : <p className="calNote">Elle ne se redresse pas : posez quatre repères.</p>}
            <figcaption>Photo {k + 1}, de face, sans coupe ni échelle</figcaption>
          </figure></li>
        ))}
      </ul>
      <h4 className="calTitre3">3. L’assemblage, l’égout et le sol cherchés</h4>
      {etapes.assemblage ? <figure>
        <svg className="calEtape large" viewBox={`0 0 ${etapes.assemblage.largeur} ${etapes.assemblage.hauteur}`} role="img" aria-label="Assemblage des photos redressées, et le mur cherché dessus">
          <image href={etapes.assemblage.url} x={0} y={0} width={etapes.assemblage.largeur} height={etapes.assemblage.hauteur} />
          <line className="calMurLigne" x1={etapes.assemblage.mur.x0} x2={etapes.assemblage.mur.x1} y1={etapes.assemblage.mur.y0} y2={etapes.assemblage.mur.y0} vectorEffect="non-scaling-stroke" />
          <line className="calMurLigne" x1={etapes.assemblage.mur.x0} x2={etapes.assemblage.mur.x1} y1={etapes.assemblage.mur.y1} y2={etapes.assemblage.mur.y1} vectorEffect="non-scaling-stroke" />
          <line className="calMurBout" x1={etapes.assemblage.mur.x0} x2={etapes.assemblage.mur.x0} y1={etapes.assemblage.mur.y0} y2={etapes.assemblage.mur.y1} vectorEffect="non-scaling-stroke" />
          <line className="calMurBout" x1={etapes.assemblage.mur.x1} x2={etapes.assemblage.mur.x1} y1={etapes.assemblage.mur.y0} y2={etapes.assemblage.mur.y1} vectorEffect="non-scaling-stroke" />
          {etapes.assemblage.mur.silhouette && <polyline className="calMurLigne silhouette" points={etapes.assemblage.mur.silhouette.map((p) => p.x + ',' + p.y).join(' ')} vectorEffect="non-scaling-stroke" />}
        </svg>
        <figcaption>{(etapes.assemblage.mur.silhouette ? 'Silhouette du mur (le plan et le LiDAR) posée sans changer de forme, ' : '') + 'Égout ' + (etapes.assemblage.mur.egout ? 'trouvé' : 'supposé') + ', sol (en bas) ' + (etapes.assemblage.mur.pied ? 'trouvé' : 'supposé') + ', bouts du mur (tirets) ' + (etapes.assemblage.mur.cotes ? 'trouvés' : 'supposés') + ', aux proportions ' + metres(cas.largeurM) + ' × ' + metres(cas.hauteurM) + ' m.'}</figcaption>
      </figure> : <p className="calNote">Aucune photo ne se redresse : rien à assembler.</p>}
      {etapes.vuesAssemblage.some((v) => !v.assemblee) && <ul className="calListe" aria-label="Photos restées hors de l’assemblage">
        {etapes.vuesAssemblage.map((v, k) => (v.assemblee ? null : <li key={k}>Photo {k + 1} : à part — {v.motif ?? 'elle ne se recale sur aucune autre'}</li>))}
      </ul>}
      <h4 className="calTitre3">4. La façade complète, redressée et fusionnée</h4>
      {etapes.facade ? <figure>
        <SurLAssemblage f={etapes.facade} libelle="La façade complète : l’assemblage de l’étape 3 entier, et la silhouette du mur à l’échelle de la façade" />
        <figcaption>L’assemblage de l’étape 3, entier : c’est l’image prise pour la suite. La silhouette du mur ({metres(cas.largeurM)} × {metres(cas.hauteurM)} m à l’égout) y est remise à l’échelle de la façade, entre ses coins.</figcaption>
      </figure> : <p className="calNote">Aucune photo ne s’assemble : posez quatre repères.</p>}
      {etapes.facade && etapes.calage && <CalageSilhouette key={etapes.facade.url} url={etapes.facade.url} largeur={etapes.facade.largeur} hauteur={etapes.facade.hauteur}
        coins={etapes.calage.coins} gabarit={cas.gabarit ?? GABARIT_RECTANGLE} largeurM={cas.largeurM} hauteurM={cas.hauteurM} appliquer={(c) => caler((etapes.calage as NonNullable<Etapes['calage']>).versPhotos(c))} />}
      <h4 className="calTitre3">7. Ouvertures proposées par la détection</h4>
      <figure>
        {etapes.facade && <SurLAssemblage f={etapes.facade} libelle="La façade complète et les ouvertures proposées" ouvertures />}
        <figcaption>{etapes.propositions.length} ouverture{etapes.propositions.length > 1 ? 's' : ''} trouvée{etapes.propositions.length > 1 ? 's' : ''} (trait plein) ; {etapes.devinees.length ? etapes.devinees.length + ' devinée' + (etapes.devinees.length > 1 ? 's' : '') + ' par la structure (pointillé)' : 'aucune devinée par la structure'}.</figcaption>
      </figure>
      <h4 className="calTitre3">8. L’image posée sur la façade en 3D</h4>
      <ul className="calGrille deux" aria-label="Image de la façade en 3D">
        <li><figure>
          <SurLaSilhouette url={etapes.surFacade} etapes={etapes} id="calSurFacade" libelle="La façade complète collée sur sa silhouette, telle que photographiée" />
          <figcaption>La façade redressée et fusionnée, collée sur sa silhouette (le plan et le LiDAR) : ce que la 3D pose sur le mur.</figcaption>
        </figure></li>
        <li><figure>
          <SurLaSilhouette url={etapes.sansOmbres} etapes={etapes} id="calSansOmbres" libelle="La façade complète collée sur sa silhouette, sans les ombres de la photo" />
          <figcaption>Sans les ombres de la photo (case « Façades sans ombres » de la Vue 3D) : la 3D pose les siennes, à l’heure choisie.</figcaption>
        </figure></li>
      </ul>
      <h4 className="calTitre3">9. La vue 3D face à la façade</h4>
      <figure>
        <VueFacade3d texture={etapes.surFacade} largeurM={cas.largeurM} hauteurM={cas.hauteurM} hauteurTextureM={etapes.textureM.h} gabarit={cas.gabarit ?? GABARIT_RECTANGLE} />
        <figcaption>Le mur en 3D, à la forme de sa silhouette, la photo posée sur sa face : la caméra est devant lui, perpendiculaire, à mi-hauteur.</figcaption>
      </figure>
    </details>
  );
}

/**
 * Les quatre reperes de la photo courante (ceux poses, sinon les coins du mur retenus : un rectangle du mur, eux aussi), et la reprise
 * a la main de l'egout, du sol et des bouts sur la photo redressee entiere.
 */
function PlacerReperes({ photo, rang, p, gabarit, poser, retirer, charger, ajusterMur }: { photo: Photo; rang: number; p: CasStocke['photos'][number] | undefined; gabarit: GabaritMur; poser: (c: P2[]) => void; retirer: () => void; charger: () => Promise<Image | null>; ajusterMur: (m: MurAjuste) => void }) {
  const r = reperesDe(p);
  const [ajuster, setAjuster] = useState(false);
  return <>
    <p className="calNote">Photo {rang + 1} : si elle ne se redresse pas seule, placez quatre repères aux coins d’un rectangle du mur (une fenêtre, une porte, le mur entier) : deux en haut sur une même horizontale, deux en bas. Ils redressent la photo entière ; l’égout et le sol sont cherchés ensuite.</p>
    <Coins photo={photo} coins={r ?? p?.coins ?? coinsParDefaut(photo.image.largeur, photo.image.hauteur)} setCoins={poser}
      sources={['doigt', 'doigt', 'doigt', 'doigt']} noms={NOMS_REPERES} etiquettes={false} libelle="Photo : placez quatre repères" />
    <div className="calLigne">
      {r && <button type="button" className="secondary small" data-controle="calibration.retirerReperes" onClick={retirer}>Retirer les repères de cette photo</button>}
      <button type="button" className="secondary small" aria-pressed={ajuster} data-controle="calibration.ajusterMur" onClick={() => setAjuster((a) => !a)}>{ajuster ? 'Masquer l’égout et le sol' : 'Ajuster l’égout et le sol'}</button>
    </div>
    {ajuster && <>
      <p className="calNote">Sur la photo redressée, tirez l’égout, le sol et les deux bouts s’ils sont mal placés : la silhouette du mur les suit sans changer de forme. Puis « Redresser le mur ».</p>
      <AjusterMur charger={charger} reperes={r ?? p?.coins ?? coinsParDefaut(photo.image.largeur, photo.image.hauteur)} mur={p?.coins ?? null} gabarit={gabarit} changer={ajusterMur} />
    </>}
  </>;
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

export function EditeurCasCalibration({ cas: depart, id, outils, enregistrer, supprimer, fermer, chercherCoins = false }: Props) {
  const [cas, setCas] = useState<CasStocke>(depart);
  const [courante, setCourante] = useState(0);
  const [elevation, setElevation] = useState<Elevation | null>(null);
  const [choisie, setChoisie] = useState<number | null>(null);
  const [tracer, setTracer] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [occupe, setOccupe] = useState(false);
  const [dims, setDims] = useState<Record<number, { l: number; h: number }>>({});
  const [origines, setOrigines] = useState<Record<number, OrigineCoins>>(() => originesDuCas(depart));
  // Les images de chaque etape apres « Redresser ».
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
  const retirerPhoto = (k: number) => { modifier((c) => ({ ...c, images: c.images.filter((_, i) => i !== k), photos: c.photos.filter((_, i) => i !== k) })); setDims((d) => decaler(d, k)); setOrigines((o) => decaler(o, k)); setCourante(0); setElevation(null); setEtapes(null); setAvis(null); };
  // Le mur ajuste a la main sur la photo courante redressee : ses coins seuls (le gabarit s'y pose) ; il se reporte sur les autres photos.
  const murCourant = ({ coins }: MurAjuste) => {
    modifier((c) => ({ ...c, photos: c.photos.map((p, i) => { if (i !== courante) return p; const q = { ...p, coins, murALaMain: true }; delete q.silhouette; return q; }) }));
    setOrigines((o) => ({ ...o, [courante]: 'main' }));
    setElevation(null); setEtapes(null);
  };
  // Le calage de la silhouette (etapes 5 et 6) : un mur pose a la main sur chaque photo, puis le cas redresse de nouveau.
  const caler = (parPhoto: (P2[] | null)[]) => { const c = casCale(cas, parPhoto); modifier(() => c); setOrigines((o) => ({ ...o, ...Object.fromEntries(parPhoto.flatMap((q, i) => (q ? [[i, 'main' as const]] : []))) })); void redresser(c); };
  const chargerCourante = useCallback(async () => (cas.images[courante] ? outils.decoder(cas.images[courante] as string) : null), [cas.images, courante, outils]);
  // Les reperes de la photo courante : ils la redressent, le mur se cherche ensuite (« Retrouver le mur ») ; null les retire.
  const reperesCourants = (reperes: P2[] | null) => {
    modifier((c) => ({ ...c, photos: c.photos.map((p, i) => { if (i !== courante) return p; const q = { ...p }; if (reperes) q.reperes = reperes; else delete q.reperes; return q; }) }));
    // Un mur deja ajuste a la main le reste : les reperes ne font que redresser la photo.
    setOrigines((o) => { const q = { ...o }; if (reperes) q[courante] = q[courante] === 'main' ? 'main' : 'reperes'; else if (q[courante] !== 'main') delete q[courante]; return q; });
    setElevation(null); setEtapes(null);
  };

  const coinsDeLaSerie = async (depart: CasStocke): Promise<CasStocke> => {
    await new Promise((ok) => setTimeout(ok, 30));
    const r = await coinsDeSerie(depart, await Promise.all(depart.images.map((u) => outils.decoder(u))), origines, chercherCoins);
    setOrigines(r.origines);
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
      const { sr, p } = preparerSurLAssemblage(depart, images);
      if (!p) { setMessage('Le mur ne se redresse pas : posez quatre repères sur la photo, puis « Retrouver le mur ».'); setElevation(null); setEtapes(null); return; }
      setElevation({ url: outils.elevationEnUrl(p.elevation), largeurM: p.elevation.largeur / p.pxParM, hauteurM: p.elevation.hauteur / p.pxParM, propositions: p.ouvertures.map(({ type, x, y, l, h }) => ({ type, x, y, l, h })) });
      setAvis(avisDuCas(p)); setDims(Object.fromEntries(images.map((im, k) => [k, { l: im.largeur, h: im.hauteur }]))); setEtapes(etapesDe(p, images, depart, outils, sr));
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
  return (
    <section className="calEditeur" aria-label={id ? 'Cas ' + cas.nom : 'Nouveau cas'}>
      <h2 className="calTitre2">{id ? 'Cas : ' + cas.nom : 'Nouveau cas'}</h2>
      <div className="calLigne">
        <label className="calChamp">Nom<input type="text" value={cas.nom} data-controle="calibration.nomCas" onChange={(e) => modifier((c) => ({ ...c, nom: e.target.value }))} placeholder="Maison de la rue X, façade sud" /></label>
        <NombreM libelle="Largeur du mur (m)" controle="calibration.largeurM" valeur={cas.largeurM} changer={(v) => { modifier((c) => ({ ...c, largeurM: v })); setElevation(null); }} />
        <NombreM libelle="Hauteur à l’égout (m)" controle="calibration.hauteurM" valeur={cas.hauteurM} changer={(v) => { modifier((c) => ({ ...c, hauteurM: v })); setElevation(null); }} />
      </div>

      <label className="calCase"><input type="checkbox" checked={auto} data-controle="calibration.auto" onChange={(e) => setAuto(e.target.checked)} /> Automatique : chercher les coins, redresser, fusionner et proposer les ouvertures dès l’ajout d’une photo</label>
      <div className="calLigne">
        <label className={'boutonFichier' + (cas.photos.length >= PHOTOS_CAS_MAX || occupe ? ' desactive' : '')}>
          <input type="file" accept="image/*" capture="environment" multiple disabled={cas.photos.length >= PHOTOS_CAS_MAX || occupe} data-controle="calibration.photo" onChange={(e) => { const f = e.target.files; void ajouterPhotos(f).then(() => { e.target.value = ''; }); }} />
          <span>{cas.photos.length ? 'Ajouter une photo du même mur' : 'Prendre ou choisir une photo'}</span>
        </label>
        <span className="calNote">{cas.photos.length} / {PHOTOS_CAS_MAX} photos. {auto ? 'Tout se fait seul à l’ajout ; corrigez au doigt ce qui est signalé et relisez les ouvertures.' : 'Placez les coins, puis redressez.'}</span>
      </div>
      <VignettesDuCas images={cas.images} courante={courante} origines={origines} choisir={setCourante} retirer={retirerPhoto} />

      {photo && <PlacerReperes key={courante} photo={photo} rang={courante} p={cas.photos[courante]} gabarit={cas.gabarit ?? GABARIT_RECTANGLE} poser={reperesCourants} retirer={() => reperesCourants(null)} charger={chargerCourante} ajusterMur={murCourant} />}
      <div className="calLigne">
        <button type="button" data-controle="calibration.redresser" disabled={!cas.photos.length || occupe} onClick={() => { void redresser(); }}>{occupe ? 'Calcul…' : 'Redresser le mur'}</button>
        <button type="button" className="secondary" data-controle="calibration.coinsSerie" disabled={!cas.photos.length || occupe} onClick={() => { void recalculerCoins(); }}>Retrouver le mur sur toutes les photos</button>
      </div>
      {avis && <p className="calNote" role="status" data-controle="calibration.avisFusion">{avis}</p>}
      {etapes && <EtapesDuCas cas={cas} dims={dims} etapes={etapes} caler={caler} />}

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

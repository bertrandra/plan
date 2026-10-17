// Admin › Calibrer la detection : un cas = une facade photographiee et annotee (facade/corpusReel.ts).
//
// On prend (ou choisit) une a quatre photos du meme mur, on place les quatre coins sur chacune, on donne la largeur et la
// hauteur reelles, on redresse, puis on annote les ouvertures sur le mur redresse : la detection en propose, on retire les
// fausses et on trace les manquees. Rien n'est ecrit avant « Enregistrer » ; un cas ne compte dans la calibration qu'une fois
// marque « relu sur la photo » (valide).

import { useRef, useState } from 'react';
import { Coins } from './releve/Coins.js';
import { pointSvg } from './releve/commun.js';
import { LIBELLES_OUVERTURE } from './releve/commun.js';
import { preparerCas, type CasPrepare, type CasStocke, type OuvertureVraie } from '../facade/corpusReel.js';
import type { Image, P2 } from '../facade/homographie.js';
import type { Photo } from '../ui/releve/camera.js';
import type { TypeOuverture } from '../model/types.js';

export const PHOTOS_CAS_MAX = 4;
const TYPES: readonly TypeOuverture[] = ['fenetre', 'porte-fenetre', 'porte', 'garage'];

/** Ce que l'editeur demande au navigateur : reduire une photo, la decoder, montrer une elevation. */
export interface OutilsPhotos {
  reduirePhoto: (f: File) => Promise<string>;
  decoder: (url: string) => Promise<Image>;
  elevationEnUrl: (img: Image) => string;
}

/** Quatre coins par defaut, dans les trois quarts centraux de la photo. */
export const coinsParDefaut = (l: number, h: number): P2[] => [{ x: l * 0.12, y: h * 0.12 }, { x: l * 0.88, y: h * 0.12 }, { x: l * 0.88, y: h * 0.88 }, { x: l * 0.12, y: h * 0.88 }];

interface Elevation { url: string; largeurM: number; hauteurM: number; propositions: OuvertureVraie[] }

/** Le mur redresse, avec les ouvertures annotees : tracer un rectangle en ajoute une, toucher un rectangle le choisit. */
function ToileAnnotation({ elevation, ouvertures, choisie, choisir, ajouter }: { elevation: Elevation; ouvertures: readonly OuvertureVraie[]; choisie: number | null; choisir: (k: number | null) => void; ajouter: (o: OuvertureVraie) => void }) {
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
    <svg ref={svg} className="calToile" viewBox={`0 0 ${L} ${H}`} role="img" aria-label="Mur redressé : tracez un rectangle autour d’une ouverture pour l’ajouter"
      onPointerDown={(e) => { if (e.target === svg.current || (e.target as Element).tagName === 'image') { choisir(null); const p = sur(e); setTrace({ a: p, b: p }); (e.currentTarget as Element).setPointerCapture(e.pointerId); } }}
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

interface Props {
  cas: CasStocke;
  /** L'identifiant du cas sur le serveur ; null tant qu'il n'est pas enregistre. */
  id: string | null;
  outils: OutilsPhotos;
  enregistrer: (cas: CasStocke) => Promise<string | null>;
  supprimer: (() => Promise<string | null>) | null;
  fermer: () => void;
}

export function EditeurCasCalibration({ cas: depart, id, outils, enregistrer, supprimer, fermer }: Props) {
  const [cas, setCas] = useState<CasStocke>(depart);
  const [courante, setCourante] = useState(0);
  const [elevation, setElevation] = useState<Elevation | null>(null);
  const [choisie, setChoisie] = useState<number | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [occupe, setOccupe] = useState(false);
  const [dims, setDims] = useState<Record<number, { l: number; h: number }>>({});
  const modifier = (f: (c: CasStocke) => CasStocke) => setCas((c) => f(c));

  const ajouterPhotos = async (fichiers: FileList | null) => {
    if (!fichiers?.length) return;
    setOccupe(true); setMessage(null);
    try {
      let suite = cas;
      for (const f of Array.from(fichiers).slice(0, PHOTOS_CAS_MAX - cas.photos.length)) {
        const url = await outils.reduirePhoto(f);
        const img = await outils.decoder(url);
        suite = { ...suite, images: [...suite.images, url], photos: [...suite.photos, { fichier: 'photo-' + (suite.photos.length + 1), coins: coinsParDefaut(img.largeur, img.hauteur) }] };
        setDims((d) => ({ ...d, [suite.photos.length - 1]: { l: img.largeur, h: img.hauteur } }));
      }
      setCas(suite); setElevation(null);
    } catch (e) { setMessage('Photo illisible : ' + ((e as Error).message || String(e))); } finally { setOccupe(false); }
  };
  const retirerPhoto = (k: number) => { modifier((c) => ({ ...c, images: c.images.filter((_, i) => i !== k), photos: c.photos.filter((_, i) => i !== k) })); setCourante(0); setElevation(null); };
  const poserCoins = (coins: P2[]) => modifier((c) => ({ ...c, photos: c.photos.map((p, i) => (i === courante ? { ...p, coins } : p)) }));

  const redresser = async () => {
    setOccupe(true); setMessage(null);
    try {
      const images = await Promise.all(cas.images.map((u) => outils.decoder(u)));
      const p: CasPrepare | null = preparerCas(cas, images);
      if (!p) { setMessage('Le mur ne se redresse pas avec ces coins : replacez-les sur les quatre angles du mur.'); setElevation(null); return; }
      setElevation({ url: outils.elevationEnUrl(p.elevation), largeurM: p.elevation.largeur / p.pxParM, hauteurM: p.elevation.hauteur / p.pxParM, propositions: p.ouvertures.map(({ type, x, y, l, h }) => ({ type, x, y, l, h })) });
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

      <div className="calLigne">
        <label className={'boutonFichier' + (cas.photos.length >= PHOTOS_CAS_MAX || occupe ? ' desactive' : '')}>
          <input type="file" accept="image/*" capture="environment" multiple disabled={cas.photos.length >= PHOTOS_CAS_MAX || occupe} data-controle="calibration.photo" onChange={(e) => { const f = e.target.files; void ajouterPhotos(f).then(() => { e.target.value = ''; }); }} />
          <span>{cas.photos.length ? 'Ajouter une photo du même mur' : 'Prendre ou choisir une photo'}</span>
        </label>
        <span className="calNote">{cas.photos.length} / {PHOTOS_CAS_MAX} photos. Plusieurs photos du même mur permettent de juger la fusion.</span>
      </div>
      {cas.photos.length > 0 && (
        <ul className="calVignettes" aria-label="Photos du cas">
          {cas.images.map((u, k) => (
            <li key={k} className={k === courante ? 'actif' : ''}>
              <button type="button" className="calVignette" aria-pressed={k === courante} aria-label={'Photo ' + (k + 1)} onClick={() => setCourante(k)}><img src={u} alt={'Photo ' + (k + 1)} /></button>
              <button type="button" className="secondary small" data-controle="calibration.retirerPhoto" aria-label={'Retirer la photo ' + (k + 1)} onClick={() => retirerPhoto(k)}>Retirer</button>
            </li>
          ))}
        </ul>
      )}

      {photo && <>
        <p className="calNote">Photo {courante + 1} : placez les quatre coins du mur (égout à gauche, égout à droite, pied à droite, pied à gauche).</p>
        <Coins photo={photo} coins={cas.photos[courante]?.coins ?? coinsParDefaut(photo.image.largeur, photo.image.hauteur)} setCoins={(c) => { poserCoins(c); setElevation(null); }} sources={['doigt', 'doigt', 'doigt', 'doigt']} />
      </>}
      <div className="calLigne">
        <button type="button" data-controle="calibration.redresser" disabled={!cas.photos.length || occupe} onClick={() => { void redresser(); }}>{occupe ? 'Calcul…' : 'Redresser le mur'}</button>
      </div>

      {elevation && <>
        <p className="calNote">Mur redressé. Les rectangles sont les ouvertures de la vérité : partez de la détection, retirez les fausses, tracez les manquées (glisser sur le mur), ajustez les cotes.</p>
        <div className="calLigne">
          <button type="button" className="secondary" data-controle="calibration.proposer" onClick={() => { modifier((c) => ({ ...c, ouvertures: elevation.propositions.map((o) => ({ ...o })) })); setChoisie(null); }}>Partir de la détection ({elevation.propositions.length})</button>
          <button type="button" className="secondary" data-controle="calibration.viderBaies" onClick={() => { modifier((c) => ({ ...c, ouvertures: [] })); setChoisie(null); }} disabled={!cas.ouvertures.length}>Tout effacer</button>
        </div>
        <ToileAnnotation elevation={elevation} ouvertures={cas.ouvertures} choisie={choisie} choisir={setChoisie} ajouter={(o) => { modifier((c) => ({ ...c, ouvertures: [...c.ouvertures, o] })); setChoisie(cas.ouvertures.length); }} />
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

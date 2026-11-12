// Etape 1b : les photos de rue Panoramax autour d'une adresse. L'adresse (le geocodage de la Geoplateforme, plusieurs propositions), puis
// sa parcelle au cadastre de l'IGN (le Parcellaire Express, par le WFS de la Geoplateforme : on peut en choisir une autre sur la carte),
// puis les photos prises autour de la parcelle et qui la regardent. Un panoramique 360 donne une vue de chaque cote de la rue (a 90 degres
// du sens de la prise de vue, la ou sont les facades), le seul cote de la parcelle, ou la vue droit vers elle.

import { useEffect, useState } from 'react';
import type { Banc } from '../App.js';
import { api, ErreurApi } from '../api.js';
import { bitmap, COTE_SOURCE, jpeg, liberer, pixels, reduire, versCanevas, vignette } from '../images.js';
import { basculerCap, capDuX, CHAMP_VUE, lirePhotos, trouverAdresses, urlRecherche, vuesDesCaps, xDuCap, type Adresse, type PhotoRue, type VueAExtraire, type Visee } from '../panoramax.js';
import { centre, enMetres, lireParcelles, parcelleDuPoint, rapporterALaParcelle, urlParcelles, type Parcelle } from '../parcelles.js';
import { vueDuPanoramique } from '../equirect.js';
import { nomDuLot } from './Import.js';

/** Lit un JSON, en erreur sur une reponse qui n'est pas 2xx (un 504 du geocodage passe au repli). */
async function lireJson(url: string): Promise<unknown> {
  const r = await fetch(url);
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.json();
}

/** Une vue de facade regarde un peu vers le haut (le mur monte, la rue descend). */
const TANGAGE = 8;

/** Les parcelles lues autour de l'adresse : assez pour voir la rue et les voisines. */
const RAYON_PARCELLES_M = 70;

interface Contexte { adresse: Adresse; parcelle: Parcelle | null }

/** Importe les vues des photos choisies (une ou deux par panoramique) ; rend le nombre de vues importees. */
async function importerVues(banc: Banc, photos: readonly PhotoRue[], vuesDe: (p: PhotoRue) => VueAExtraire[], ctx: Contexte, dire: (t: string) => void): Promise<number> {
  const lot = nomDuLot('panoramax');
  let ok = 0, n = 0;
  for (const p of photos) {
    dire(`Import ${++n} sur ${photos.length}…`);
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
            adresse: ctx.adresse.libelle, parcelle: ctx.parcelle?.idu ?? null, lot,
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

export function ImportPanoramax({ banc }: { banc: Banc }) {
  const [texte, setTexte] = useState('');
  const [rayon, setRayon] = useState(40);
  const [visees, setVisees] = useState(true);
  const [visee, setVisee] = useState<Visee>('cotes');
  const [propositions, setPropositions] = useState<Adresse[]>([]);
  const [adresse, setAdresse] = useState<Adresse | null>(null);
  const [parcelles, setParcelles] = useState<Parcelle[]>([]);
  const [parcelle, setParcelle] = useState<Parcelle | null>(null);
  const [photos, setPhotos] = useState<PhotoRue[]>([]);
  const [choix, setChoix] = useState<Set<string>>(new Set());
  // Les caps choisis a la main dans un 360 (par photo) ; une photo absente suit la visee.
  const [caps, setCaps] = useState<Map<string, number[]>>(new Map());
  const [ouverte, setOuverte] = useState<string | null>(null);
  const [etat, setEtat] = useState<string | null>(null);
  const vuesDe = (p: PhotoRue) => vuesDesCaps(p, caps.get(p.id), visee);

  const chercherAdresse = async () => {
    setEtat('Recherche de l’adresse…');
    setPropositions([]); setAdresse(null); setParcelles([]); setParcelle(null); setPhotos([]);
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
    let l: Parcelle[] = [];
    try { l = lireParcelles(await lireJson(urlParcelles(a.lat, a.lon, RAYON_PARCELLES_M))); } catch (e) { banc.dire('Cadastre IGN indisponible : ' + (e as Error).message, 'erreur'); }
    setParcelles(l);
    const p = parcelleDuPoint(l, a);
    setParcelle(p);
    await chercherPhotos(a, p);
  };
  const chercherPhotos = async (a: Adresse, p: Parcelle | null) => {
    setEtat('Recherche des photos…');
    try {
      // Autour de la parcelle quand on la connait (son milieu, et le rayon autour de ses bords), sinon autour de l'adresse.
      const o = p ? centre(p) : a;
      const brutes = lirePhotos(await lireJson(urlRecherche(o.lat, o.lon, rayon + 40)), o, rayon + 40);
      const l = p ? rapporterALaParcelle(brutes, p, rayon) : brutes.filter((x) => x.distance <= rayon);
      const deja = new Set(banc.images.map((m) => m.panoramax?.id).filter(Boolean));
      const gardees = l.filter((x) => !deja.has(x.id));
      setPhotos(gardees); setCaps(new Map()); setOuverte(null);
      setChoix(new Set(gardees.filter((x) => !visees || x.vise).map((x) => x.id)));
      setEtat(`${l.length} photo(s) à ${rayon} m de ${p ? `la parcelle ${p.section} ${p.numero}` : `« ${a.libelle} »`} ; ${l.length - gardees.length} déjà dans le banc.`);
    } catch (e) { setEtat('Recherche impossible : ' + (e as Error).message); }
  };
  const importer = async () => {
    if (!adresse) return;
    await importerVues(banc, photos.filter((x) => choix.has(x.id)), vuesDe, { adresse, parcelle }, setEtat);
    setPhotos((l) => l.filter((x) => !choix.has(x.id)));
    setChoix(new Set());
    await banc.relire();
  };
  return (
    <div className="panneau">
      <h2>1b · Panoramax autour d’une adresse</h2>
      <p className="aide">L’adresse, puis sa parcelle au cadastre de l’IGN (touchez une autre parcelle sur la carte pour la changer), puis les photos de rue libres prises autour et qui la regardent (licence de chaque photo gardée). Un panoramique 360 donne une vue de chaque côté de la rue (à 90° du sens de la prise de vue, là où sont les façades), le seul côté de la parcelle, ou la vue droit vers elle.</p>
      <form className="rang" onSubmit={(e) => { e.preventDefault(); void chercherAdresse(); }}>
        <input className="large" placeholder="2 allée des Limites, Le Vésinet — ou 48.90507, 2.13254" value={texte} onChange={(e) => setTexte(e.target.value)} required />
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
          {propositions.map((a) => <button key={a.libelle + a.lat} type="button" className={a === adresse ? 'onglet actif' : 'onglet'} onClick={() => { void choisirAdresse(a); }}>{a.libelle}</button>)}
        </div>
      )}
      {etat && <p className="etat">{etat}</p>}
      {adresse && parcelles.length > 0 && (
        <div className="carte-et-liste">
          <MiniCarte adresse={adresse} parcelles={parcelles} parcelle={parcelle} photos={photos} choix={choix}
            onParcelle={(p) => { setParcelle(p); void chercherPhotos(adresse, p); }} />
          {parcelle && <p className="aide">Parcelle <b>{parcelle.section} {parcelle.numero}</b> ({parcelle.commune}{parcelle.contenance ? `, ${parcelle.contenance} m²` : ''}) — <code>{parcelle.idu}</code></p>}
        </div>
      )}
      {photos.length > 0 && <ListePhotos photos={photos} choix={choix} setChoix={setChoix} vuesDe={vuesDe} ouverte={ouverte} setOuverte={setOuverte}
        onImporter={() => { void importer(); }} />}
      {(() => { const p = photos.find((x) => x.id === ouverte); return p ? (
        <ChoixDesVues p={p} vues={vuesDe(p)} onCaps={(l) => { setCaps((m) => new Map(m).set(p.id, l)); setChoix((c) => new Set(c).add(p.id)); }}
          onVisee={() => setCaps((m) => { const t = new Map(m); t.delete(p.id); return t; })} onFermer={() => setOuverte(null)} />
      ) : null; })()}
    </div>
  );
}

function ListePhotos({ photos, choix, setChoix, vuesDe, ouverte, setOuverte, onImporter }: {
  photos: PhotoRue[]; choix: Set<string>; setChoix: (s: Set<string>) => void; vuesDe: (p: PhotoRue) => VueAExtraire[];
  ouverte: string | null; setOuverte: (id: string | null) => void; onImporter: () => void;
}) {
  const basculer = (id: string) => { const t = new Set(choix); if (t.has(id)) t.delete(id); else t.add(id); setChoix(t); };
  const nVues = photos.filter((p) => choix.has(p.id)).reduce((n, p) => n + vuesDe(p).length, 0);
  return (
    <>
      <div className="rang">
        <button type="button" onClick={() => setChoix(new Set(photos.map((p) => p.id)))}>Tout cocher</button>
        <button type="button" onClick={() => setChoix(new Set())}>Tout décocher</button>
        <button type="button" className="principal" disabled={!nVues} onClick={onImporter}>Importer {nVues} vue(s) de {choix.size} photo(s)</button>
      </div>
      <p className="aide">Un panoramique 360 se montre en entier, la rue au milieu : les cadres orange sont les vues qui seront importées. « Choisir les vues » pour regarder ailleurs (à gauche, à droite, vers une maison).</p>
      <ul className="mosaique grande">
        {photos.map((p) => {
          const vues = vuesDe(p);
          return (
            <li key={p.id} className={choix.has(p.id) ? 'carte choisie' : 'carte'}>
              <label>
                <input type="checkbox" checked={choix.has(p.id)} onChange={() => basculer(p.id)} />
                {p.panoramique && p.sd ? <Panorama p={p} vues={vues} /> : p.vignette ? <img src={p.vignette} alt="" loading="lazy" /> : <div className="sans-image" />}
                <span>{p.distance} m · {p.panoramique ? `360° · ${vues.length} vue(s)` : (p.vise ? 'vers la parcelle' : 'de côté')} · {p.date?.slice(0, 10) ?? '—'}</span>
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
function Panorama({ p, vues, onClic }: { p: PhotoRue; vues: VueAExtraire[]; onClic?: (cap: number) => void }) {
  const az = p.azimut ?? 0;
  return (
    <div className={onClic ? 'pano actif' : 'pano'} onClick={onClic ? (e) => { const r = e.currentTarget.getBoundingClientRect(); onClic(capDuX((e.clientX - r.left) / r.width, az)); } : undefined}>
      {/* En CORS : l'apercu relit la meme image par fetch, et une copie en cache sans en-tete CORS le ferait echouer. */}
      <img src={p.sd ?? ''} alt="" loading="lazy" draggable={false} crossOrigin="anonymous" />
      {vues.flatMap((v, i) => bandes(v.cap, az).map((b, k) => <span key={i + '-' + k} className="pano-vue" style={{ left: `${b.g * 100}%`, width: `${b.l * 100}%` }} />))}
      <span className="pano-cible" style={{ left: `${xDuCap(p.cap, az) * 100}%` }} title="Vers la parcelle" />
      <span className="pano-rue" title="Axe de la rue (sens de la prise de vue)" />
    </div>
  );
}

const NOM_VUE: Record<VueAExtraire['vue'], string> = { gauche: 'À gauche', droite: 'À droite', adresse: 'Vers la parcelle', photo: 'Photo', choisie: 'Choisie' };

/**
 * Le choix des vues d'un 360 (demande du proprietaire, 12 novembre 2026) : toucher le panoramique ajoute une vue a ce cap, ou retire
 * celle qui y est ; chaque vue s'ajuste de 5 degres et se montre telle qu'elle sera importee.
 */
function ChoixDesVues({ p, vues, onCaps, onVisee, onFermer }: { p: PhotoRue; vues: VueAExtraire[]; onCaps: (caps: number[]) => void; onVisee: () => void; onFermer: () => void }) {
  const [pano, setPano] = useState<ReturnType<typeof pixels> | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  useEffect(() => {
    let fini = false;
    setPano(null); setErreur(null);
    (async () => {
      const r = await fetch(p.sd ?? p.hd, { mode: 'cors', cache: 'no-cache' });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const b = await bitmap(await r.blob());
      const c = reduire(b, 2048);
      try { if (!fini) setPano(pixels(c)); } finally { liberer(c); b.close(); }
    })().catch((e: Error) => { if (!fini) setErreur(e.message); });
    return () => { fini = true; };
  }, [p.sd, p.hd]);
  const caps = vues.map((v) => v.cap);
  const az = p.azimut ?? 0;
  const regler = (k: number, d: number) => onCaps(caps.map((c, i) => (i === k ? ((c + d) % 360 + 360) % 360 : c)));
  return (
    <div className="panneau choix-vues">
      <div className="rang">
        <strong>Vues du panoramique {p.id.slice(0, 8)}</strong>
        <button type="button" onClick={() => onCaps([((az - 90) % 360 + 360) % 360, (az + 90) % 360])}>Gauche et droite</button>
        <button type="button" onClick={() => onCaps([Math.round(p.cap)])}>Vers la parcelle</button>
        <button type="button" onClick={onVisee}>Comme la visée</button>
        <button type="button" onClick={() => onCaps([])}>Aucune</button>
        <button type="button" onClick={onFermer}>Fermer</button>
      </div>
      <p className="aide">Touchez le panoramique pour ajouter une vue à cet endroit (75° de champ), touchez une vue pour la retirer. La rue est au milieu (trait blanc), la parcelle sous le trait rouge.</p>
      <Panorama p={p} vues={vues} onClic={(cap) => onCaps(basculerCap(caps, cap))} />
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
  );
}

/** Une vue telle qu'elle sera importee, calculee sur la version reduite du panoramique. */
function Apercu({ pano, azimut, cap }: { pano: ReturnType<typeof pixels> | null; azimut: number; cap: number }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!pano) { setUrl(null); return; }
    const c = versCanevas(vueDuPanoramique(pano, { capCentre: azimut, cap, tangage: TANGAGE, champ: CHAMP_VUE, largeur: 320, hauteur: 240 }));
    setUrl(c.toDataURL('image/jpeg', 0.8));
    liberer(c);
  }, [pano, azimut, cap]);
  return url ? <img src={url} alt={`Vue à ${Math.round(cap)}°`} /> : <div className="sans-image" />;
}

/** La carte des parcelles autour de l'adresse (metres, nord en haut) : la parcelle choisie, les photos et le sens ou elles regardent. */
function MiniCarte({ adresse, parcelles, parcelle, photos, choix, onParcelle }: { adresse: Adresse; parcelles: Parcelle[]; parcelle: Parcelle | null; photos: PhotoRue[]; choix: Set<string>; onParcelle: (p: Parcelle) => void }) {
  const R = RAYON_PARCELLES_M;
  const pt = (l: { lat: number; lon: number }) => { const q = enMetres([l], adresse)[0] ?? { x: 0, y: 0 }; return { x: q.x, y: -q.y }; };
  const fleche = (p: PhotoRue) => {
    const a = pt(p), cap = ((p.azimut ?? p.cap) * Math.PI) / 180, l = p.panoramique ? 0 : 8;
    return { a, b: { x: a.x + l * Math.sin(cap), y: a.y - l * Math.cos(cap) } };
  };
  return (
    <svg className="mini-carte" viewBox={`${-R} ${-R} ${2 * R} ${2 * R}`} role="img" aria-label="Parcelles autour de l’adresse">
      {parcelles.map((p) => (
        <polygon key={p.idu} points={enMetres(p.contour, adresse).map((q) => `${q.x},${-q.y}`).join(' ')} className={p.idu === parcelle?.idu ? 'parcelle choisie' : 'parcelle'} onClick={() => onParcelle(p)}>
          <title>{`${p.section} ${p.numero}${p.contenance ? ` · ${p.contenance} m²` : ''}`}</title>
        </polygon>
      ))}
      {photos.map((p) => { const f = fleche(p); return (
        <g key={p.id} className={choix.has(p.id) ? 'photo-carte choisie' : 'photo-carte'}>
          <circle cx={f.a.x} cy={f.a.y} r={p.panoramique ? 2 : 1.4} />
          {!p.panoramique && <line x1={f.a.x} y1={f.a.y} x2={f.b.x} y2={f.b.y} />}
        </g>
      ); })}
      <circle cx={0} cy={0} r={1.6} className="adresse-carte" />
    </svg>
  );
}

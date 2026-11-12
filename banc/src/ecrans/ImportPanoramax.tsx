// Etape 1b : les photos de rue Panoramax autour d'une adresse. L'adresse (le geocodage de la Geoplateforme, plusieurs propositions), puis
// sa parcelle au cadastre de l'IGN (le Parcellaire Express, par le WFS de la Geoplateforme : on peut en choisir une autre sur la carte),
// puis les photos prises autour de la parcelle et qui la regardent. Un panoramique 360 donne une vue de chaque cote de la rue (a 90 degres
// du sens de la prise de vue, la ou sont les facades), le seul cote de la parcelle, ou la vue droit vers elle.

import { useState } from 'react';
import type { Banc } from '../App.js';
import { api, ErreurApi } from '../api.js';
import { bitmap, COTE_SOURCE, jpeg, pixels, reduire, versCanevas, vignette } from '../images.js';
import { lirePhotos, trouverAdresses, urlRecherche, vuesAExtraire, type Adresse, type PhotoRue, type Visee } from '../panoramax.js';
import { centre, enMetres, lireParcelles, parcelleDuPoint, rapporterALaParcelle, urlParcelles, type Parcelle } from '../parcelles.js';
import { vueDuPanoramique } from '../equirect.js';
import { nomDuLot } from './Import.js';

/** Lit un JSON, en erreur sur une reponse qui n'est pas 2xx (un 504 du geocodage passe au repli). */
async function lireJson(url: string): Promise<unknown> {
  const r = await fetch(url);
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.json();
}

/** Les parcelles lues autour de l'adresse : assez pour voir la rue et les voisines. */
const RAYON_PARCELLES_M = 70;

interface Contexte { adresse: Adresse; parcelle: Parcelle | null }

/** Importe les vues des photos choisies (une ou deux par panoramique) ; rend le nombre de vues importees. */
async function importerVues(banc: Banc, photos: readonly PhotoRue[], visee: Visee, ctx: Contexte, dire: (t: string) => void): Promise<number> {
  const lot = nomDuLot('panoramax');
  let ok = 0, n = 0;
  for (const p of photos) {
    dire(`Import ${++n} sur ${photos.length}…`);
    try {
      const b = await bitmap(await (await fetch(p.hd)).blob());
      // Le panoramique se lit une fois pour toutes ses vues ; 75 degres de champ, un peu vers le haut, comme on vise une facade.
      const pano = p.panoramique ? pixels(reduire(b, 6000)) : null;
      for (const v of vuesAExtraire(p, visee)) {
        const c = pano ? versCanevas(vueDuPanoramique(pano, { capCentre: p.azimut ?? 0, cap: v.cap, tangage: 8, champ: 75, largeur: 1600, hauteur: 1200 })) : reduire(b, COTE_SOURCE);
        try {
          await api.importer(await jpeg(c, 0.92), await vignette(c), {
            source: 'panoramax', nom: 'panoramax-' + p.id.slice(0, 8) + (v.vue === 'gauche' || v.vue === 'droite' ? '-' + v.vue : ''), date: p.date, lat: p.lat, lon: p.lon, azimut: v.cap,
            panoramax: { id: p.id, collection: p.collection, panoramique: p.panoramique, cap: v.cap, vue: v.vue }, auteur: p.auteur, licence: p.licence,
            adresse: ctx.adresse.libelle, parcelle: ctx.parcelle?.idu ?? null, lot,
          });
          ok++;
        } catch (e) {
          if (!(e instanceof ErreurApi && e.statut === 409)) throw e;
        }
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
  const [etat, setEtat] = useState<string | null>(null);

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
      setPhotos(gardees);
      setChoix(new Set(gardees.filter((x) => !visees || x.vise).map((x) => x.id)));
      setEtat(`${l.length} photo(s) à ${rayon} m de ${p ? `la parcelle ${p.section} ${p.numero}` : `« ${a.libelle} »`} ; ${l.length - gardees.length} déjà dans le banc.`);
    } catch (e) { setEtat('Recherche impossible : ' + (e as Error).message); }
  };
  const importer = async () => {
    if (!adresse) return;
    await importerVues(banc, photos.filter((x) => choix.has(x.id)), visee, { adresse, parcelle }, setEtat);
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
      {photos.length > 0 && <ListePhotos photos={photos} choix={choix} setChoix={setChoix} onImporter={() => { void importer(); }} />}
    </div>
  );
}

function ListePhotos({ photos, choix, setChoix, onImporter }: { photos: PhotoRue[]; choix: Set<string>; setChoix: (s: Set<string>) => void; onImporter: () => void }) {
  const basculer = (id: string) => { const t = new Set(choix); if (t.has(id)) t.delete(id); else t.add(id); setChoix(t); };
  return (
    <>
      <div className="rang">
        <button type="button" onClick={() => setChoix(new Set(photos.map((p) => p.id)))}>Tout cocher</button>
        <button type="button" onClick={() => setChoix(new Set())}>Tout décocher</button>
        <button type="button" className="principal" disabled={!choix.size} onClick={onImporter}>Importer {choix.size} photo(s)</button>
      </div>
      <ul className="mosaique">
        {photos.map((p) => (
          <li key={p.id} className={choix.has(p.id) ? 'carte choisie' : 'carte'}>
            <label>
              <input type="checkbox" checked={choix.has(p.id)} onChange={() => basculer(p.id)} />
              {p.vignette ? <img src={p.vignette} alt="" loading="lazy" /> : <div className="sans-image" />}
              <span>{p.distance} m · {p.panoramique ? '360°' : (p.vise ? 'vers la parcelle' : 'de côté')} · {p.date?.slice(0, 10) ?? '—'}</span>
            </label>
          </li>
        ))}
      </ul>
    </>
  );
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

// Etape 1 : capturer des images. 1a, les photos de l'iPhone (ou de tout appareil), leur EXIF garde ; 1b, les photos de rue Panoramax
// prises autour d'une adresse, par lot, un panoramique 360 ramene a la vue tournee vers l'adresse.

import { useState } from 'react';
import type { Banc } from '../App.js';
import { api, ErreurApi } from '../api.js';
import { lireExif } from '../exif.js';
import { bitmap, COTE_SOURCE, jpeg, pixels, reduire, versCanevas, vignette } from '../images.js';
import { lirePhotos, trouverAdresse, urlRecherche, vuesAExtraire, type Adresse, type PhotoRue, type Visee } from '../panoramax.js';

/** Lit un JSON, en erreur sur une reponse qui n'est pas 2xx (un 504 du geocodage passe au repli). */
async function lireJson(url: string): Promise<unknown> {
  const r = await fetch(url);
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.json();
}
import { vueDuPanoramique } from '../equirect.js';

/** Le nom du lot : la date et l'heure de l'import, pour retrouver ce qui est arrive ensemble. */
const nomDuLot = (prefixe: string) => prefixe + '-' + new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');

export function EcranImport({ banc }: { banc: Banc }) {
  return (
    <section className="pile-large">
      <ImportFichiers banc={banc} />
      <ImportPanoramax banc={banc} />
    </section>
  );
}

function ImportFichiers({ banc }: { banc: Banc }) {
  const [journal, setJournal] = useState<string[]>([]);
  const [enCours, setEnCours] = useState(false);
  const importer = async (fichiers: FileList | null) => {
    if (!fichiers?.length) return;
    setEnCours(true);
    const lot = nomDuLot('iphone');
    const lignes: string[] = [];
    const ajouter = (l: string) => { lignes.unshift(l); setJournal([...lignes]); };
    for (const f of Array.from(fichiers)) {
      try {
        const exif = lireExif(await f.arrayBuffer());
        const b = await bitmap(f);
        const c = reduire(b, COTE_SOURCE);
        const source = /apple|iphone/i.test(exif.appareil ?? '') ? 'iphone' : 'fichier';
        await api.importer(await jpeg(c, 0.92), await vignette(c), { source, nom: f.name, date: exif.date, lat: exif.lat, lon: exif.lon, azimut: exif.azimut, appareil: exif.appareil, focale35: exif.focale35, lot });
        b.close();
        ajouter(`✓ ${f.name}${exif.lat !== null ? ' (position)' : ''}`);
      } catch (e) {
        ajouter(`✕ ${f.name} : ${(e as Error).message}`);
      }
    }
    setEnCours(false);
    banc.dire(`${lignes.filter((l) => l.startsWith('✓')).length} photo(s) importée(s), lot ${lot}.`);
    await banc.relire();
  };
  return (
    <div className="panneau">
      <h2>1a · Photos de l’iPhone</h2>
      <p className="aide">Choisissez des photos dans la photothèque (l’iPhone les envoie en JPEG). La position, la date, le cap et la focale de l’EXIF sont gardés ; le grand côté est ramené à {COTE_SOURCE} px.</p>
      <label className="bouton principal">
        {enCours ? 'Import en cours…' : 'Choisir des photos'}
        <input type="file" accept="image/*" multiple hidden disabled={enCours} onChange={(e) => { void importer(e.target.files); e.target.value = ''; }} />
      </label>
      {journal.length > 0 && <ul className="journal">{journal.map((l, i) => <li key={i}>{l}</li>)}</ul>}
    </div>
  );
}

function ImportPanoramax({ banc }: { banc: Banc }) {
  const [texte, setTexte] = useState('');
  const [rayon, setRayon] = useState(40);
  const [visees, setVisees] = useState(true);
  const [visee, setVisee] = useState<Visee>('cotes');
  const [adresse, setAdresse] = useState<Adresse | null>(null);
  const [photos, setPhotos] = useState<PhotoRue[]>([]);
  const [choix, setChoix] = useState<Set<string>>(new Set());
  const [etat, setEtat] = useState<string | null>(null);
  const chercher = async () => {
    setEtat('Recherche de l’adresse…');
    setPhotos([]);
    try {
      const a = await trouverAdresse(texte, lireJson);
      if (!a) { setEtat('Adresse introuvable.'); return; }
      setAdresse(a);
      setEtat('Recherche des photos…');
      const l = lirePhotos(await lireJson(urlRecherche(a.lat, a.lon, rayon)), a, rayon);
      const deja = new Set(banc.images.map((m) => m.panoramax?.id).filter(Boolean));
      const gardees = l.filter((p) => !deja.has(p.id));
      setPhotos(gardees);
      setChoix(new Set(gardees.filter((p) => !visees || p.vise).map((p) => p.id)));
      setEtat(`${l.length} photo(s) à ${rayon} m de « ${a.libelle} » ; ${l.length - gardees.length} déjà dans le banc.`);
    } catch (e) {
      setEtat('Recherche impossible : ' + (e as Error).message);
    }
  };
  const importer = async () => {
    if (!adresse) return;
    const lot = nomDuLot('panoramax');
    let ok = 0, n = 0;
    for (const p of photos.filter((x) => choix.has(x.id))) {
      setEtat(`Import ${++n} sur ${choix.size}…`);
      try {
        const b = await bitmap(await (await fetch(p.hd)).blob());
        // Un panoramique : les vues plates a 90 degres de la rue (les facades), ou tournee vers l'adresse ; 75 degres de champ, un peu
        // vers le haut, comme on vise une facade. Le panoramique se lit une fois pour toutes ses vues.
        const pano = p.panoramique ? pixels(reduire(b, 6000)) : null;
        for (const v of vuesAExtraire(p, visee)) {
          const c = pano ? versCanevas(vueDuPanoramique(pano, { capCentre: p.azimut ?? 0, cap: v.cap, tangage: 8, champ: 75, largeur: 1600, hauteur: 1200 })) : reduire(b, COTE_SOURCE);
          try {
            await api.importer(await jpeg(c, 0.92), await vignette(c), {
              source: 'panoramax', nom: 'panoramax-' + p.id.slice(0, 8) + (v.vue === 'gauche' || v.vue === 'droite' ? '-' + v.vue : ''), date: p.date, lat: p.lat, lon: p.lon, azimut: v.cap,
              panoramax: { id: p.id, collection: p.collection, panoramique: p.panoramique, cap: v.cap, vue: v.vue }, auteur: p.auteur, licence: p.licence, adresse: adresse.libelle, lot,
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
    setEtat(`${ok} vue(s) importée(s), lot ${lot}.`);
    setPhotos((l) => l.filter((p) => !choix.has(p.id)));
    setChoix(new Set());
    await banc.relire();
  };
  const basculer = (id: string) => setChoix((s) => { const t = new Set(s); if (t.has(id)) t.delete(id); else t.add(id); return t; });
  return (
    <div className="panneau">
      <h2>1b · Panoramax autour d’une adresse</h2>
      <p className="aide">Les photos de rue libres (licence de chaque photo gardée) prises à moins du rayon de l’adresse. Un panoramique 360 donne, au choix, une vue de chaque côté de la rue (à 90° du sens de la prise de vue, là où sont les façades), le seul côté de l’adresse, ou la vue droit vers l’adresse.</p>
      <form className="rang" onSubmit={(e) => { e.preventDefault(); void chercher(); }}>
        <input className="large" placeholder="2 allée des Limites, Le Vésinet — ou 48.8957, 2.1456" value={texte} onChange={(e) => setTexte(e.target.value)} required />
        <label>Rayon <input type="number" min={5} max={300} value={rayon} onChange={(e) => setRayon(Number(e.target.value))} /> m</label>
        <label className="case"><input type="checkbox" checked={visees} onChange={(e) => setVisees(e.target.checked)} /> Tournées vers l’adresse</label>
        <label>Panoramiques 360
          <select value={visee} onChange={(e) => setVisee(e.target.value as Visee)}>
            <option value="cotes">Les deux côtés de la rue (90°)</option>
            <option value="cote-adresse">Le côté de l’adresse (90°)</option>
            <option value="adresse">Droit vers l’adresse</option>
          </select>
        </label>
        <button type="submit" className="principal">Chercher</button>
      </form>
      {etat && <p className="etat">{etat}</p>}
      {photos.length > 0 && (
        <>
          <div className="rang">
            <button type="button" onClick={() => setChoix(new Set(photos.map((p) => p.id)))}>Tout cocher</button>
            <button type="button" onClick={() => setChoix(new Set())}>Tout décocher</button>
            <button type="button" className="principal" disabled={!choix.size} onClick={() => { void importer(); }}>Importer {choix.size} photo(s)</button>
          </div>
          <ul className="mosaique">
            {photos.map((p) => (
              <li key={p.id} className={choix.has(p.id) ? 'carte choisie' : 'carte'}>
                <label>
                  <input type="checkbox" checked={choix.has(p.id)} onChange={() => basculer(p.id)} />
                  {p.vignette ? <img src={p.vignette} alt="" loading="lazy" /> : <div className="sans-image" />}
                  <span>{p.distance} m · {p.panoramique ? '360°' : (p.vise ? 'vers l’adresse' : 'de côté')} · {p.date?.slice(0, 10) ?? '—'}</span>
                </label>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

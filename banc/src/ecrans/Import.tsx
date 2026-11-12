// Etape 1 : capturer des images. 1a, les photos de l'iPhone (ou de tout appareil), leur EXIF garde ; 1b, les photos de rue Panoramax
// prises autour d'une adresse, par lot, un panoramique 360 ramene a la vue tournee vers l'adresse.

import { useState } from 'react';
import type { Banc } from '../App.js';
import { api } from '../api.js';
import { lireExif } from '../exif.js';
import { bitmap, COTE_SOURCE, jpeg, liberer, reduire, vignette } from '../images.js';
import { ImportPanoramax } from './ImportPanoramax.js';


/** Le nom du lot : la date et l'heure de l'import, pour retrouver ce qui est arrive ensemble. */
export const nomDuLot = (prefixe: string) => prefixe + '-' + new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');

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
        try {
          await api.importer(await jpeg(c, 0.92), await vignette(c), { source, nom: f.name, date: exif.date, lat: exif.lat, lon: exif.lon, azimut: exif.azimut, appareil: exif.appareil, focale35: exif.focale35, lot });
        } finally { liberer(c); b.close(); }
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

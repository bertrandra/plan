// Le controleur de l'import de fichiers (etape 1a) : chaque photo lue (EXIF), ramenee a COTE_SOURCE, envoyee avec sa vignette, dans un
// lot date ; l'avancement et le journal de ce qui est arrive.

import { useState } from 'react';
import type { Banc } from '../../App.js';
import { api } from '../../api.js';
import { lireExif } from '../../exif.js';
import { bitmap, COTE_SOURCE, jpeg, liberer, reduire, vignette } from '../../images.js';

/** Le nom du lot : la date et l'heure de l'import, pour retrouver ce qui est arrive ensemble. */
export const nomDuLot = (prefixe: string) => prefixe + '-' + new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');

export interface LigneJournal { nom: string; ok: boolean; detail: string }

export function useImport(banc: Banc) {
  const [journal, setJournal] = useState<LigneJournal[]>([]);
  const [avance, setAvance] = useState<{ fait: number; total: number } | null>(null);
  const importer = async (fichiers: readonly File[]) => {
    const images = fichiers.filter((f) => f.type.startsWith('image/') || /\.(jpe?g|png|heic|webp)$/i.test(f.name));
    if (!images.length) { if (fichiers.length) banc.dire('Aucune image dans ce dépôt.', 'erreur'); return; }
    const lot = nomDuLot('iphone');
    const lignes: LigneJournal[] = [];
    const ajouter = (l: LigneJournal) => { lignes.unshift(l); setJournal([...lignes]); };
    for (const [k, f] of images.entries()) {
      setAvance({ fait: k, total: images.length });
      try {
        const exif = lireExif(await f.arrayBuffer());
        const b = await bitmap(f);
        const c = reduire(b, COTE_SOURCE);
        const source = /apple|iphone/i.test(exif.appareil ?? '') ? 'iphone' : 'fichier';
        try {
          await api.importer(await jpeg(c, 0.92), await vignette(c), { source, nom: f.name, date: exif.date, lat: exif.lat, lon: exif.lon, azimut: exif.azimut, appareil: exif.appareil, focale35: exif.focale35, lot });
        } finally { liberer(c); b.close(); }
        ajouter({ nom: f.name, ok: true, detail: [exif.appareil, exif.lat !== null ? 'position' : null, exif.focale35 ? `${exif.focale35} mm` : null].filter(Boolean).join(' · ') });
      } catch (e) {
        ajouter({ nom: f.name, ok: false, detail: (e as Error).message });
      }
    }
    setAvance(null);
    banc.dire(`${lignes.filter((l) => l.ok).length} photo(s) importée(s), lot ${lot}.`);
    await banc.relire();
  };
  return { journal, avance, importer, effacerJournal: () => setJournal([]) };
}

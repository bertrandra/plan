// Le controleur du redressement (etape 2) : le filtre, le lot automatique (par les points de fuite) avec son avancement, les echecs a
// reprendre a la main, et « deja de face ». L'ecran ne fait que montrer.

import { useMemo, useState } from 'react';
import type { Banc } from '../../App.js';
import { api } from '../../api.js';
import { bitmap, COTE_SOURCE, COTE_TRAVAIL, jpeg, pixels, reduire, versCanevas, vignette } from '../../images.js';
import { redresserAuto, type Redressee } from '../../redressement.js';
import type { MetaImage } from '../../types.js';

export async function enregistrer(m: MetaImage, r: Redressee, extra: Record<string, unknown> = {}): Promise<MetaImage> {
  const c = versCanevas(r.image);
  return api.redressee(m.id, await jpeg(c, 0.92), await vignette(c), { methode: r.methode, horizontale: r.horizontale, focale: r.focale, ...extra });
}

export type FiltreRedressement = 'a-redresser' | 'echecs' | 'toutes';

export function useRedressement(banc: Banc) {
  const [filtre, setFiltre] = useState<FiltreRedressement>('a-redresser');
  const [avance, setAvance] = useState<{ fait: number; total: number } | null>(null);
  const [echecs, setEchecs] = useState<Set<string>>(new Set());
  const [main, setMain] = useState<MetaImage | null>(null);
  const nouvelles = useMemo(() => banc.images.filter((m) => m.statut === 'importee'), [banc.images]);
  const liste = useMemo(() => (filtre === 'toutes' ? banc.images.filter((m) => m.statut !== 'rejetee') : filtre === 'echecs' ? nouvelles.filter((m) => echecs.has(m.id)) : nouvelles), [banc.images, nouvelles, filtre, echecs]);

  const auto = async (l: readonly MetaImage[]) => {
    const rates = new Set(echecs);
    let ok = 0;
    for (const [k, m] of l.entries()) {
      setAvance({ fait: k, total: l.length });
      try {
        const b = await bitmap(api.fichier(m.id, 'source'));
        const r = redresserAuto(pixels(reduire(b, COTE_TRAVAIL)), m.focale35 ?? null);
        b.close();
        if (!r) { rates.add(m.id); continue; }
        banc.remplacer(await enregistrer(m, r));
        rates.delete(m.id);
        ok++;
      } catch (e) {
        rates.add(m.id);
        banc.dire(`${m.nom ?? m.id} : ${(e as Error).message}`, 'erreur');
      }
    }
    setEchecs(rates);
    setAvance(null);
    banc.dire(l.length - ok ? `${ok} photo(s) redressée(s) ; ${l.length - ok} à faire à la main.` : `${ok} photo(s) redressée(s).`);
    if (l.length - ok && filtre === 'a-redresser') setFiltre('echecs');
  };
  const garder = async (m: MetaImage) => {
    try {
      const b = await bitmap(api.fichier(m.id, 'source'));
      banc.remplacer(await enregistrer(m, { image: pixels(reduire(b, COTE_SOURCE)), methode: 'aucun' }));
      b.close();
      oublierEchec(m.id);
    } catch (e) { banc.dire((e as Error).message, 'erreur'); }
  };
  const oublierEchec = (id: string) => setEchecs((s) => { const t = new Set(s); t.delete(id); return t; });
  const finMain = (maj: MetaImage | null) => { if (maj) { banc.remplacer(maj); oublierEchec(maj.id); } setMain(null); };
  return { filtre, setFiltre, liste, nouvelles, echecs, avance, auto, garder, main, setMain, finMain };
}

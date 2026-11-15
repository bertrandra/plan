// Le controleur du redressement (etape 2) : le filtre, le lot automatique (par les points de fuite) avec son avancement, les echecs a
// reprendre a la main, et « deja de face ». L'ecran ne fait que montrer.

import { useMemo, useState } from 'react';
import type { Banc } from '../../App.js';
import { api } from '../../api.js';
import { bitmap, COTE_SOURCE, COTE_TRAVAIL, jpeg, liberer, pixels, reduire, versCanevas, vignette } from '../../images.js';
import { fusionner as fusionnerImages } from '../../fusion.js';
import { nomDuLot } from '../import/useImport.js';
import { memesMurs, rangerParMur, type GroupeDeMur } from '../../murs.js';
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
  // Les photos choisies, dans l'ordre des clics : c'est l'ordre de la fusion (de gauche a droite sur le mur).
  const [choix, setChoix] = useState<string[]>([]);
  const [ecarter, setEcarter] = useState(true);
  const nouvelles = useMemo(() => banc.images.filter((m) => m.statut === 'importee'), [banc.images]);
  // Les photos d'un meme mur a la suite, de gauche a droite (demande du proprietaire, 15 novembre 2026 : regrouper les images du meme
  // mur la ou se fait la fusion) : le mur vient des metadonnees de l'import (murs.ts), l'algorithme de fusion ne change pas.
  const [parMur, setParMur] = useState(true);
  const filtrees = useMemo(() => (filtre === 'toutes' ? banc.images.filter((m) => m.statut !== 'rejetee') : filtre === 'echecs' ? nouvelles.filter((m) => echecs.has(m.id)) : nouvelles), [banc.images, nouvelles, filtre, echecs]);
  const groupes = useMemo(() => memesMurs(filtrees), [filtrees]);
  const liste = useMemo(() => (parMur && groupes.length ? rangerParMur(filtrees) : filtrees), [filtrees, parMur, groupes]);
  const groupeDe = useMemo(() => new Map(groupes.flatMap((g, k) => g.images.map((m) => [m.id, k + 1] as const))), [groupes]);
  /** Choisit les photos d'un mur dans l'ordre de la fusion (de gauche a droite) ; le choisir encore les lache. */
  const choisirLeMur = (g: GroupeDeMur) => setChoix((l) => { const ids = g.images.map((m) => m.id); return l.length === ids.length && ids.every((id, k) => l[k] === id) ? [] : ids; });

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
    setChoix([]);
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
  // Les vues que l'import a deja rendues face au mur (demande du proprietaire, 15 novembre 2026) : le redressement le sait par leurs
  // metadonnees (`cadrage.plan`) et propose de les passer telles quelles ; il ne le fait pas de lui-meme.
  const faceAuMur = useMemo(() => nouvelles.filter((m) => !!m.cadrage?.plan), [nouvelles]);
  const basculer = (id: string) => setChoix((l) => (l.includes(id) ? l.filter((x) => x !== id) : [...l, id]));
  const choisies = choix.map((id) => banc.images.find((m) => m.id === id)).filter((m): m is MetaImage => !!m);
  /** « Deja de face » en lot : les photos passent telles quelles a la mosaique. */
  const garderLes = async (l: readonly MetaImage[]) => {
    for (const [k, m] of l.entries()) { setAvance({ fait: k, total: l.length }); await garder(m); }
    setAvance(null);
    setChoix([]);
    banc.dire(`${l.length} photo(s) passée(s) à la mosaïque telles quelles.`);
  };
  /**
   * Fusionne les photos choisies (dans l'ordre des clics, de gauche a droite) en une seule, deja de face : une nouvelle photo, prete pour
   * la mosaique. Les photos d'origine sont rejetees si on le veut (le meme mur deux fois fausserait les blocs).
   */
  const fusionner = async () => {
    const l = choisies;
    if (l.length < 2) return;
    setAvance({ fait: 0, total: l.length });
    const canevas: HTMLCanvasElement[] = [];
    try {
      for (const m of l) {
        const b = await bitmap(api.fichier(m.id, m.redressee ? 'redressee' : 'source', m.redressement?.le ?? ''));
        canevas.push(reduire(b, 2400));
        b.close();
      }
      // Laisser l'ecran dire « Fusion… » avant le calcul, qui tient le fil quelques secondes.
      await new Promise((r) => setTimeout(r, 30));
      const f = fusionnerImages(canevas.map(pixels));
      if (!f) throw new Error('Il faut au moins deux photos.');
      const faibles = f.jointures.filter((j) => j.score < 0.5).length;
      const c = versCanevas(f.image);
      const image = await jpeg(c, 0.92), vig = await vignette(c);
      const nom = `fusion-${(l[0]?.nom ?? l[0]?.id ?? '').replace(/\.[a-z]+$/i, '')}-${l.length}`;
      const nouvelle = await api.importer(image, vig, { source: 'fichier', nom, largeur: f.image.largeur, hauteur: f.image.hauteur, lot: nomDuLot('fusion') });
      banc.remplacer(await api.redressee(nouvelle.id, image, vig, { methode: 'fusion', note: 'Fusion de ' + l.map((m) => m.nom ?? m.id).join(', ') }));
      liberer(c);
      if (ecarter) for (const m of l) await api.modifier(m.id, { statut: 'rejetee' });
      setChoix([]);
      banc.dire(`${l.length} photos fusionnées en « ${nom} »${faibles ? ` : ${faibles} jointure(s) douteuse(s), vérifiez-la dans la mosaïque` : ''}.`, faibles ? 'erreur' : 'ok');
      await banc.relire();
    } catch (e) {
      banc.dire((e as Error).message, 'erreur');
    } finally { liberer(...canevas); setAvance(null); }
  };
  const oublierEchec = (id: string) => setEchecs((s) => { const t = new Set(s); t.delete(id); return t; });
  const finMain = (maj: MetaImage | null) => { if (maj) { banc.remplacer(maj); oublierEchec(maj.id); } setMain(null); };
  return { filtre, setFiltre, liste, nouvelles, echecs, avance, auto, garder, main, setMain, finMain, choix, choisies, basculer, viderChoix: () => setChoix([]), garderLes, fusionner, ecarter, setEcarter, parMur, setParMur, groupes, groupeDe, choisirLeMur, faceAuMur };
}

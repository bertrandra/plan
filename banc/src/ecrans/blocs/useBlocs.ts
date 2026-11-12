// Le controleur des blocs (etape 7) : les reglages en cours d'edition (graine, parts, echantillon), la repartition stratifiee, le tirage
// de l'echantillon, et les bilans (par bloc, par nom appris). L'ecran ne fait que montrer.

import { useEffect, useMemo, useState } from 'react';
import type { Banc } from '../../App.js';
import { api } from '../../api.js';
import { bilanDesBlocs, comptesParNom, dansLEchantillon, partsValables, repartirStratifie, type BilanBloc, type CompteNom } from '../../blocs.js';
import type { Reglages } from '../../types.js';

export function useBlocs(banc: Banc, onReglages: (r: Reglages) => void) {
  const [r, setR] = useState<Reglages>(banc.reglages);
  const [bilan, setBilan] = useState<Record<string, BilanBloc> | null>(null);
  const [parNom, setParNom] = useState<Map<string, Record<'train' | 'val' | 'test', CompteNom>> | null>(null);
  const [etat, setEtat] = useState<string | null>(null);
  useEffect(() => setR(banc.reglages), [banc.reglages]);
  useEffect(() => { bilanDesBlocs(banc.reglages, banc.images).then(setBilan).catch(() => setBilan(null)); }, [banc.reglages, banc.images]);
  useEffect(() => { comptesParNom(banc.reglages, banc.images).then(setParNom).catch(() => setParNom(null)); }, [banc.reglages, banc.images]);
  const corrigees = useMemo(() => banc.images.filter((m) => m.statut === 'corrigee'), [banc.images]);
  const aVerifier = corrigees.filter((m) => m.echantillon && !m.verifiee);
  const sansBloc = corrigees.filter((m) => !m.bloc).length;
  const modifie = JSON.stringify(r) !== JSON.stringify(banc.reglages);

  const enregistrer = async () => {
    if (!partsValables(r.parts)) { banc.dire('Les parts doivent faire 100 % en tout, val et test non nulles.', 'erreur'); return; }
    try { onReglages(await api.ecrireReglages(r)); banc.dire('Blocs enregistrés.'); } catch (e) { banc.dire((e as Error).message, 'erreur'); }
  };
  // La repartition stratifiee : les photos corrigees sans bloc (ou toutes, hors reserve, si on repart de zero) rangees pour que chaque
  // nom YOLO ait sa part dans train, val et test.
  const repartir = async (deZero: boolean) => {
    if (deZero && !confirm('Répartir de nouveau toutes les photos corrigées (hors réserve) ? Les blocs posés à la main sont remplacés.')) return;
    const l = corrigees.map((m) => (deZero && m.bloc !== 'reserve' ? { ...m, bloc: '' as const } : m));
    try {
      const blocs = await repartirStratifie(banc.reglages, l);
      let n = 0;
      for (const [id, bloc] of blocs) {
        const m = corrigees.find((x) => x.id === id);
        if (!m || m.bloc === bloc) continue;
        setEtat(`Bloc ${++n}…`);
        banc.remplacer(await api.modifier(id, { bloc }));
      }
      banc.dire(`${blocs.size} photo(s) réparties, ${n} changée(s).`);
    } catch (e) { banc.dire((e as Error).message, 'erreur'); } finally { setEtat(null); }
  };
  const tirer = async () => {
    let n = 0, dedans = 0;
    try {
      for (const m of corrigees) {
        const e = await dansLEchantillon(banc.reglages, m.id);
        if (e) dedans++;
        if (!!m.echantillon !== e) { setEtat(`Échantillon ${++n}…`); banc.remplacer(await api.modifier(m.id, { echantillon: e })); }
      }
      banc.dire(`Échantillon : ${dedans} photo(s) sur ${corrigees.length} à vérifier.`);
    } catch (e) { banc.dire((e as Error).message, 'erreur'); } finally { setEtat(null); }
  };
  const part = (k: keyof Reglages['parts'], v: string) => setR({ ...r, parts: { ...r.parts, [k]: Number(v) / 100 } });
  return { r, setR, part, modifie, enregistrer, annuler: () => setR(banc.reglages), bilan, parNom, etat, corrigees, aVerifier, sansBloc, repartir, tirer };
}

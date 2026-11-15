// Les reglages de la liste de l'import Panoramax, tenus ensemble : son ordre, combien de vues garder par batiment, les murs deja dans
// le banc, et ce que l'import fait de chaque vue (demande du proprietaire, 15 novembre 2026) : la cadrer sur sa facade, la rendre face
// au mur, preferer les photos d'hiver, et les retouches de la main (« Choisir les vues »).

import { useCallback, useMemo, useState } from 'react';
import { cleDeRetouche, type Retouche } from '../../cadrage.js';
import { VUES_PAR_BATIMENT_DEFAUT, type Ordre, type VuesParBatiment } from '../../meilleuresVues.js';
import { mursDuBanc } from '../../murs.js';
import type { MetaImage } from '../../types.js';

const RIEN_DEJA: ReadonlySet<string> = new Set();

export interface ReglagesListe {
  ordre: Ordre; setOrdre: (o: Ordre) => void;
  parBatiment: VuesParBatiment; setParBatiment: (n: VuesParBatiment) => void;
  /**
   * Un mur deja dans le banc ne se propose plus coche (« Avoid having 2 times the same building ») : la regle par defaut, que la case
   * leve. `dejaDansLeBanc` : les murs a ecarter (aucun, case decochee) ; `mursConnus` : combien le banc en connait.
   */
  ecarterDejaLa: boolean; setEcarterDejaLa: (v: boolean) => void; dejaDansLeBanc: ReadonlySet<string>; mursConnus: number;
  /** Cadrer chaque vue d'un 360 sur sa facade (cochee) ; la rendre face au mur (decochee : voir le verdict dans LISEZMOI) ; preferer l'hiver (cochee). */
  cadrer: boolean; setCadrer: (v: boolean) => void;
  surLeMur: boolean; setSurLeMur: (v: boolean) => void;
  hiver: boolean; setHiver: (v: boolean) => void;
  /** Les retouches de la main, par vue (sa photo et son cap) ; `retoucherVue` en ajoute une, `suivreLaVue` la garde quand la vue tourne. */
  retouches: ReadonlyMap<string, Retouche>;
  retoucherVue: (photo: string, cap: number, dChamp: number, dTangage: number) => void;
  suivreLaVue: (photo: string, capAvant: number, capApres: number) => void;
}

export function useReglagesListe(images: readonly MetaImage[]): ReglagesListe {
  const [ordre, setOrdre] = useState<Ordre>('note'), [parBatiment, setParBatiment] = useState<VuesParBatiment>(VUES_PAR_BATIMENT_DEFAUT);
  const [ecarterDejaLa, setEcarterDejaLa] = useState(true);
  const [cadrer, setCadrer] = useState(true), [surLeMur, setSurLeMur] = useState(false), [hiver, setHiver] = useState(true);
  const [retouches, setRetouches] = useState<Map<string, Retouche>>(new Map());
  const mursDeja = useMemo(() => new Set(mursDuBanc(images).keys()), [images]);
  const dejaDansLeBanc = useMemo(() => (ecarterDejaLa ? mursDeja : RIEN_DEJA), [ecarterDejaLa, mursDeja]);
  const retoucherVue = useCallback((photo: string, cap: number, dChamp: number, dTangage: number) => setRetouches((m) => {
    const k = cleDeRetouche(photo, cap), a = m.get(k) ?? { dChamp: 0, dTangage: 0 };
    return new Map(m).set(k, { dChamp: a.dChamp + dChamp, dTangage: a.dTangage + dTangage });
  }), []);
  const suivreLaVue = useCallback((photo: string, capAvant: number, capApres: number) => setRetouches((m) => {
    const k = cleDeRetouche(photo, capAvant), a = m.get(k);
    if (!a) return m;
    const t = new Map(m); t.delete(k); t.set(cleDeRetouche(photo, capApres), a);
    return t;
  }), []);
  return { ordre, setOrdre, parBatiment, setParBatiment, ecarterDejaLa, setEcarterDejaLa, dejaDansLeBanc, mursConnus: mursDeja.size, cadrer, setCadrer, surLeMur, setSurLeMur, hiver, setHiver, retouches, retoucherVue, suivreLaVue };
}

// Le calage fin hors du fil principal (MD/plan-mise-en-oeuvre-audit.md, lot L7 ; risque « calculs
// lourds sur telephone »). Segments, points de fuite et hypotheses prennent une fraction de seconde
// sur un ordinateur, plusieurs sur un telephone modeste : l'ecran des coins reste vivant pendant ce
// temps, et la loupe repond au doigt.
//
// Le worker recoit une `EntreeRecherche` (zones/releve/serie.ts) et rend le calage sans son detail.

import { calageFinDuReleve } from '../../facade/calageFin.js';
import { sansDetail, type EntreeRecherche, type ResultatCoins } from './serie.js';

self.onmessage = (ev: MessageEvent<{ id: number; entree: EntreeRecherche }>) => {
  const { id, entree: e } = ev.data;
  try {
    const reponse: { id: number; resultat: ResultatCoins } = { id, resultat: sansDetail(calageFinDuReleve(e.image, e.largeur, e.hauteur, e.prise, e.distance)) };
    self.postMessage(reponse);
  } catch (err) {
    self.postMessage({ id, erreur: String(err) });
  }
};

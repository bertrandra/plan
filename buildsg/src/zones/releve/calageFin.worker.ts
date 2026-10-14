// Le calage fin hors du fil principal (MD/plan-mise-en-oeuvre-audit.md, lot L7 ; risque « calculs
// lourds sur telephone »). Segments, points de fuite et hypotheses prennent une fraction de seconde
// sur un ordinateur, plusieurs sur un telephone modeste : l'ecran des coins reste vivant pendant ce
// temps, et la loupe repond au doigt. La correction de la distorsion du grand-angle (lot L8) s'y fait
// aussi, juste avant : elle relit chaque pixel de la photo.
//
// Le worker recoit une `EntreeRecherche` (zones/releve/serie.ts) et rend la photo corrigee s'il y a
// lieu, et le calage sans son detail.

import { rechercher, type EntreeRecherche, type ResultatRecherche } from './serie.js';

self.onmessage = (ev: MessageEvent<{ id: number; entree: EntreeRecherche }>) => {
  const { id, entree: e } = ev.data;
  try {
    const resultat: ResultatRecherche = rechercher(e);
    const reponse: { id: number; resultat: ResultatRecherche } = { id, resultat };
    // L'image corrigee part sans copie : le worker n'en a plus besoin.
    const tampon = resultat.distorsion?.image.donnees.buffer;
    self.postMessage(reponse, tampon ? { transfer: [tampon] } : undefined);
  } catch (err) {
    self.postMessage({ id, erreur: String(err) });
  }
};

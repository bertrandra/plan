// Les gestes d'un cas de calibration (reperes, mur tire a la main, mur confirme) : ce qu'un geste y change, et sa remise, pour Ctrl+Z
// et Ctrl+Y avant V4 (decision du proprietaire, 3 novembre 2026). Le pendant, dans l'audit, de app/audit/parcelle/capture.ts::geste.
// Pur, sans DOM.

import type { CasStocke } from './corpusReel.js';

/**
 * Ce qu'un geste change dans un cas : les reperes, le mur tire a la main, ses coins, le mur confirme, les ouvertures relues, et les choix
 * de source et les forcages de Claude (lot C2) ; pas les photos elles-memes.
 */
export interface GestesCas { photos: Pick<CasStocke['photos'][number], 'coins' | 'reperes' | 'murALaMain' | 'silhouette'>[]; murConfirme?: CasStocke['murConfirme']; ouverturesRelues?: CasStocke['ouverturesRelues']; choix?: CasStocke['choix']; forcages?: CasStocke['forcages'] }

export const gestesDuCas = (c: CasStocke): GestesCas => JSON.parse(JSON.stringify({
  photos: c.photos.map((p) => ({ coins: p.coins, ...(p.reperes ? { reperes: p.reperes } : {}), ...(p.murALaMain ? { murALaMain: true } : {}), ...(p.silhouette ? { silhouette: p.silhouette } : {}) })),
  ...(c.murConfirme ? { murConfirme: c.murConfirme } : {}),
  ...(c.ouverturesRelues ? { ouverturesRelues: c.ouverturesRelues } : {}),
  ...(c.choix?.length ? { choix: c.choix } : {}),
  ...(c.forcages?.length ? { forcages: c.forcages } : {}),
})) as GestesCas;

/** Le cas avec ces gestes remis (les photos gardent le reste : fichier, prise, focale). */
export function avecLesGestes(c: CasStocke, g: GestesCas): CasStocke {
  const photos = c.photos.map((p, k) => {
    const q = { ...p }, x = g.photos[k];
    delete q.reperes; delete q.murALaMain; delete q.silhouette;
    return x ? { ...q, ...x } : q;
  });
  const suite: CasStocke = { ...c, photos };
  if (g.murConfirme) suite.murConfirme = g.murConfirme; else delete suite.murConfirme;
  if (g.ouverturesRelues) suite.ouverturesRelues = g.ouverturesRelues; else delete suite.ouverturesRelues;
  if (g.choix?.length) suite.choix = g.choix; else delete suite.choix;
  if (g.forcages?.length) suite.forcages = g.forcages; else delete suite.forcages;
  return suite;
}

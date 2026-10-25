// Monte l'ecran des arbres (`?admin&ecran=arbres`, zones/EcranArbres.tsx).
//
// Un ecran de l'admin, comme la consommation et les controleurs : main.ts ne l'ouvre qu'une fois la
// porte de l'admin franchie. Il prend toute la page ; Plan ne demarre pas dessous. Il lit la
// bibliotheque d'essences du serveur (`admin/arbres`), la fait regler avec EZ-tree et l'y enregistre.

import { createRoot } from 'react-dom/client';
import { createElement } from 'react';
import { EcranArbres } from '../zones/EcranArbres.js';
import { enregistrerArbres, lireArbres } from '../io/depotDemos.js';
import { lireDocumentArbres, poserEspeces } from '../model/especesArbre.js';
import { chargerEzTreeAdmin, libererModeles, presetsEz, reglagesParDefaut } from '../three/ezTree.js';
import { monterApercuArbre } from '../three/apercuArbre.js';
import { showErrBanner } from '../shell/dialogs.js';
import { hoteDeZone } from '../shell/dom.js';

/** L'adresse demande-t-elle l'ecran des arbres ? */
export function demandeEcranArbres(recherche: string): boolean {
  return new URLSearchParams(recherche).get('ecran') === 'arbres';
}

/** EZ-tree, ses reglages par defaut et ses presets : une seule fois, l'ecran les reutilise. */
async function preparer(): Promise<{ defaut: ReturnType<typeof reglagesParDefaut>; presets: ReturnType<typeof presetsEz> }> {
  await chargerEzTreeAdmin();
  return { defaut: reglagesParDefaut(), presets: presetsEz() };
}

export async function ouvrirEcranArbres(): Promise<void> {
  const f = (entree: string, init?: RequestInit) => fetch(entree, init);
  let enregistrees: ReturnType<typeof lireDocumentArbres> = null;
  try {
    const d = await lireArbres(f);
    enregistrees = d === null ? null : lireDocumentArbres(d);
    if (d !== null && !enregistrees) showErrBanner('La bibliothèque d’arbres du serveur n’a pas la forme attendue : elle est montrée vide. Un enregistrement la remplacera.');
  } catch (e) {
    showErrBanner('Bibliothèque d’arbres illisible : ' + ((e as Error).message || e) + '. Elle est montrée vide.');
  }
  const hote = hoteDeZone('zoneEcranArbres');
  document.title = 'Admin — arbres';
  createRoot(hote).render(createElement(EcranArbres, {
    enregistrees: enregistrees?.especes ?? null,
    preparer,
    monterApercu: monterApercuArbre,
    enregistrer: async (document) => {
      try {
        await enregistrerArbres(f, document);
        // La page elle-meme prend la nouvelle bibliotheque : les modeles generes sont ceux d'avant.
        const lue = lireDocumentArbres(document);
        if (lue) { libererModeles(); poserEspeces(lue.especes); }
        return null;
      } catch (e) {
        return (e as Error).message || String(e);
      }
    }
  }));
}

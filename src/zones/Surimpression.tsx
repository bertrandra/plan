// Les commandes de navigation posees sur le canevas lui-meme (spec-ihm-zones §4.4).
//
// Deux boutons qu'on actionne en regardant le plan, pas en fouillant un panneau : la grille, et le
// cadrage sur la selection. Ils gardent leurs identifiants et leur feuille de style d'origine ; ce
// qui change, c'est que leur etat — grille visible, cadrage possible — se lit dans le magasin au
// lieu d'etre ecrit dans le DOM par le rendu et par le pilotage des vues.

import { useStore } from 'zustand';
import type { Magasin } from '../app/magasin.js';
import type { RegistreCommandes } from '../app/commandes.js';

export function Surimpression({ magasin, commandes }: { magasin: Magasin; commandes: RegistreCommandes }) {
  useStore(magasin.store, (s) => s.version);
  const etat = magasin.store.getState().etat;
  const grille = etat.grilleVisible;
  // Le cadrage a un sens des qu'un objet est selectionne — ou, en mode Terrasse, la terrasse courante.
  const cadrable = !!etat.selectedKey;
  return (
    <>
      <button type="button" id="gridBtn" className={grille ? '' : 'off'} aria-pressed={grille}
        title={(grille ? 'Masquer' : 'Afficher') + ' la grille du plan'}
        onClick={() => { commandes.executer('affichage.grille'); }}>▦</button>
      {cadrable && (
        <button type="button" id="fitBtn" title="Ajuster la vue à l'objet sélectionné"
          onClick={() => { commandes.executer('vue.ajuster'); }}>⤢ Ajuster à la sélection</button>
      )}
    </>
  );
}

// La barre de navigation du telephone (MD/spec-ihm-mobile.md §6, annexe A).
//
// Cinq boutons sous le pouce : Objets, Coter, Creer, Proprietes, Resultats. Quatre ouvrent une
// feuille qui porte une zone existante (explorateur, palette, inspecteur, tiroir) ; Coter execute la
// commande de la palette. La barre n'ajoute aucune commande : elle ouvre des zones. Elle n'existe
// que sur telephone ; ailleurs, les zones sont a l'ecran.

import { useStore } from 'zustand';
import { Icone, type NomIcone } from './icones.js';
import type { Feuille, Magasin } from '../app/magasin.js';
import type { RegistreCommandes } from '../app/commandes.js';

export interface PropsBarreNavigation { magasin: Magasin; commandes: RegistreCommandes }

function Onglet({ feuille, libelle, icone, controle, magasin }: { feuille: Feuille; libelle: string; icone: NomIcone; controle: string; magasin: Magasin }) {
  const ouverte = useStore(magasin.store, (s) => s.feuille) === feuille;
  return (
    <button type="button" className={'ongletNavigation' + (ouverte ? ' actif' : '')} data-controle={controle} aria-expanded={ouverte}
      onClick={() => magasin.definirFeuille(ouverte ? null : feuille)}>
      <Icone nom={icone} />
      <span>{libelle}</span>
    </button>
  );
}

export function BarreNavigation({ magasin, commandes }: PropsBarreNavigation) {
  const classe = useStore(magasin.store, (s) => s.classe);
  const vue = useStore(magasin.store, (s) => s.vue);
  const feuille = useStore(magasin.store, (s) => s.feuille);
  useStore(magasin.store, (s) => s.version);
  if (classe !== 'compact' || vue !== 'plan') return null;
  const coter = commandes.etat('mesure.nouvelle');
  const refusCoter = !coter.utilisable && 'message' in coter ? coter.message : undefined;
  return (
    <nav className="barreNavigation" aria-label="Navigation principale">
      <Onglet feuille="objets" libelle="Objets" icone="objets" controle="navigation.objets" magasin={magasin} />
      {!commandes.effacee('mesure.nouvelle') && (
        <button type="button" className="ongletNavigation" data-commande="mesure.nouvelle" disabled={!coter.utilisable}
          title={refusCoter} onClick={() => { magasin.definirFeuille(null); commandes.executer('mesure.nouvelle'); }}>
          <Icone nom="cote" />
          <span>Coter</span>
        </button>
      )}
      <button type="button" className={'boutonCreer' + (feuille === 'outils' ? ' actif' : '')} data-controle="navigation.creer" aria-label="Créer et éditer" aria-expanded={feuille === 'outils'}
        onClick={() => magasin.definirFeuille(feuille === 'outils' ? null : 'outils')}>
        <Icone nom="plus" taille={26} />
      </button>
      <Onglet feuille="proprietes" libelle="Propriétés" icone="reglages" controle="navigation.proprietes" magasin={magasin} />
      <Onglet feuille="resultats" libelle="Résultats" icone="resultats" controle="navigation.resultats" magasin={magasin} />
    </nav>
  );
}

// Z6, le tiroir des resultats (spec-ihm-zones §4.6) : sa barre d'onglets et sa hauteur.
//
// Etape 5 de la reconstruction : les onglets du panneau du bas deviennent un tiroir sous le plan,
// repliable en trois hauteurs. Cette zone ne rend que la barre — les panneaux restent du balisage
// que `ui/` remplit — et demande tout au tiroir (app/tiroir.ts) : quel onglet montrer, quelle
// hauteur prendre. L'onglet actif se lit dans l'etat du plan, la hauteur dans le magasin.
//
// Tactile : onglets de 36 px, boutons de hauteur de 36 px.

import { useStore } from 'zustand';
import { HAUTEURS, type HauteurTiroir, type Tiroir as ServiceTiroir } from '../app/tiroir.js';
import type { Magasin } from '../app/magasin.js';

export interface PropsResultats { magasin: Magasin; tiroir: ServiceTiroir }

const LIBELLE_HAUTEUR: Record<HauteurTiroir, [string, string]> = {
  replie: ['▁', 'Replier le tiroir : la barre seule'],
  mi: ['▄', 'Tiroir à mi-hauteur'],
  plein: ['█', 'Tiroir en pleine hauteur']
};

export function Resultats({ magasin, tiroir }: PropsResultats) {
  useStore(magasin.store, (s) => s.version);
  const hauteur = useStore(magasin.store, (s) => s.tiroir);
  const actif = magasin.store.getState().etat.panelTab;
  const onglets = tiroir.onglets();
  let groupePrecedent = onglets[0]?.groupe;
  return (
    <div className="resultatsBarre" role="tablist" aria-label="Résultats">
      {onglets.map(o => {
        const separateur = o.groupe !== groupePrecedent;
        groupePrecedent = o.groupe;
        return (
          <button key={o.id} type="button" role="tab" data-onglet={o.id} aria-selected={o.id === actif}
            className={'ongletResultats' + (o.id === actif ? ' active' : '') + (separateur ? ' debutGroupe' : '')}
            onClick={() => tiroir.activer(o.id)}>
            {o.libelle}
          </button>
        );
      })}
      <span className="resultatsHauteurs" role="group" aria-label="Hauteur du tiroir">
        {HAUTEURS.map(h => (
          <button key={h} type="button" className={'hauteurTiroir' + (h === hauteur ? ' active' : '')} aria-pressed={h === hauteur} title={LIBELLE_HAUTEUR[h][1]} onClick={() => tiroir.definirHauteur(h)}>
            <span aria-hidden="true">{LIBELLE_HAUTEUR[h][0]}</span>
          </button>
        ))}
      </span>
    </div>
  );
}

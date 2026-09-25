// Z6, le tiroir des resultats (spec-ihm-zones §4.6) : sa barre d'onglets et sa hauteur.
//
// Etape 5 de la reconstruction : les onglets du panneau du bas deviennent un tiroir sous le plan,
// repliable en trois hauteurs. Cette zone ne rend que la barre — les panneaux restent du balisage
// que `ui/` remplit — et demande tout au tiroir (app/tiroir.ts) : quel onglet montrer, quelle
// hauteur prendre. L'onglet actif se lit dans l'etat du plan, la hauteur dans le magasin.
//
// Sur telephone (spec-ihm-mobile §6.6), le tiroir est la feuille Resultats : un entete avec la
// terrasse et son selecteur, les onglets en pastilles defilantes, et les tableaux en cartes
// (ui/tableau.ts). Les trois hauteurs n'y ont pas cours — la feuille glisse — et la hauteur
// memorisee du tiroir n'est pas touchee.
//
// Tactile : onglets de 36 px, boutons de hauteur de 36 px.

import { useEffect } from 'react';
import { useStore } from 'zustand';
import { HAUTEURS, type HauteurTiroir, type Tiroir as ServiceTiroir } from '../app/tiroir.js';
import { suivreTableaux } from '../ui/tableau.js';
import { terrasseSelectionnee } from '../core/contexteTerrasse.js';
import { EnteteFeuille } from './composants/Feuille.js';
import { Icone } from './icones.js';
import type { Magasin } from '../app/magasin.js';
import type { Explorateur } from '../app/explorateur.js';

export interface PropsResultats { magasin: Magasin; tiroir: ServiceTiroir; explorateur?: Explorateur }

const LIBELLE_HAUTEUR: Record<HauteurTiroir, [string, string]> = {
  replie: ['▁', 'Replier le tiroir : la barre seule'],
  mi: ['▄', 'Tiroir à mi-hauteur'],
  plein: ['█', 'Tiroir en pleine hauteur']
};

export function Resultats({ magasin, tiroir, explorateur }: PropsResultats) {
  useStore(magasin.store, (s) => s.version);
  const hauteur = useStore(magasin.store, (s) => s.tiroir);
  const classe = useStore(magasin.store, (s) => s.classe);
  const etat = magasin.store.getState().etat;
  const actif = etat.panelTab;
  const onglets = tiroir.onglets();
  let groupePrecedent = onglets[0]?.groupe;

  // Les tableaux des panneaux portent le nom de leurs colonnes : sur telephone, chaque ligne devient
  // une carte (ui/tableau.ts).
  useEffect(() => {
    const panneaux = document.getElementById('tiroirPanneaux');
    return panneaux ? suivreTableaux(panneaux) : undefined;
  }, []);

  const barre = (
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
      {classe !== 'compact' && (
        <span className="resultatsHauteurs" role="group" aria-label="Hauteur du tiroir">
          {HAUTEURS.map(h => (
            <button key={h} type="button" className={'hauteurTiroir' + (h === hauteur ? ' active' : '')} aria-pressed={h === hauteur} title={LIBELLE_HAUTEUR[h][1]} aria-label={LIBELLE_HAUTEUR[h][1]} onClick={() => tiroir.definirHauteur(h)}>
              <span aria-hidden="true">{LIBELLE_HAUTEUR[h][0]}</span>
            </button>
          ))}
        </span>
      )}
    </div>
  );
  if (classe !== 'compact') return barre;

  // Le selecteur de terrasse (§6.6) : il selectionne la suivante, comme l'explorateur.
  const terrasse = terrasseSelectionnee(etat);
  const terrasses = etat.objects.filter(o => o.fonction === 'terrasse' && o.type === 'polygon');
  const rang = terrasse ? terrasses.indexOf(terrasse) : -1;
  const suivante = () => {
    const t = terrasses[(rang + 1) % terrasses.length];
    if (t && explorateur) explorateur.selectionner(t.key);
  };
  const selecteur = terrasse && terrasses.length > 1 && explorateur ? (
    <button type="button" className="secondary selecteurTerrasse" onClick={suivante} aria-label={'Terrasse ' + (rang + 1) + ' sur ' + terrasses.length + ' : passer à la suivante'}>
      {rang + 1} sur {terrasses.length} <Icone nom="chevronDroite" taille={16} />
    </button>
  ) : null;
  return (
    <>
      <EnteteFeuille magasin={magasin} titre={terrasse ? 'Chiffrage' : 'Résultats'} sousTitre={terrasse ? terrasse.name : 'Cotes, PLU et résumé du plan'} actions={selecteur} />
      {barre}
    </>
  );
}

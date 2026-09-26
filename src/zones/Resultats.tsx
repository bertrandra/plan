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
import { createPortal } from 'react-dom';
import { useStore } from 'zustand';
import { HAUTEURS, type HauteurTiroir, type Tiroir as ServiceTiroir } from '../app/tiroir.js';
import { suivreTableaux } from '../ui/tableau.js';
import { terrasseSelectionnee } from '../core/contexteTerrasse.js';
import { EnteteFeuille } from './composants/Feuille.js';
import { Icone } from './icones.js';
import type { Magasin } from '../app/magasin.js';
import type { Explorateur } from '../app/explorateur.js';
import type { RegistreCommandes } from '../app/commandes.js';
import type { ObjetPlan } from '../model/types.js';
import { resumerChiffrage, euros, nombre } from '../ui/chiffrage.js';

export interface PropsResultats { magasin: Magasin; tiroir: ServiceTiroir; explorateur?: Explorateur; commandes?: RegistreCommandes }

/**
 * Les chiffres cles d'une terrasse, en tuiles au-dessus de la nomenclature (maquette Resultats,
 * 2.1.1). Le meme resume que la feuille de selection et le bandeau de l'inspecteur : rien n'est
 * recalcule ici, rien n'est ecrit.
 */
function Tuiles({ terrasse, objets }: { terrasse: ObjetPlan; objets: ObjetPlan[] }) {
  const r = resumerChiffrage(terrasse, objets);
  if (!r) return null;
  const tuiles: [string, string][] = [
    [r.natureAppuis === 'plots' ? 'Plots' : 'Vis de fondation', String(r.appuis)],
    ['Lames', nombre(r.lamesMl, 0) + ' ml'],
    ['Bois porteur', nombre(r.porteurMl, 0) + ' ml'],
    ['Surface', nombre(r.surface, 1) + ' m²']
  ];
  return (
    <div className="tuilesChiffrage">
      {tuiles.map(([libelle, valeur]) => (
        <div key={libelle} className="tuileChiffrage"><span className="tuileLibelle">{libelle}</span><span className="tuileValeur">{valeur}</span></div>
      ))}
    </div>
  );
}

/** Les chiffres cles et l'estimation, sur une ligne, sous les onglets du tiroir replie. */
function ResumeTiroir({ terrasse, objets }: { terrasse: ObjetPlan; objets: ObjetPlan[] }) {
  const r = resumerChiffrage(terrasse, objets);
  if (!r) return null;
  const tuiles: [string, string][] = [
    [r.natureAppuis === 'plots' ? 'Plots' : 'Vis', String(r.appuis)],
    ['Lames', nombre(r.lamesMl, 0) + ' ml'],
    ['Bois porteur', nombre(r.porteurMl, 0) + ' ml'],
    ['Surface', nombre(r.surface, 1) + ' m²']
  ];
  return (
    <div className="resumeTiroir">
      {tuiles.map(([l, v]) => <div key={l} className="tuileChiffrage"><span className="tuileLibelle">{l}</span><span className="tuileValeur">{v}</span></div>)}
      <div className="tuileChiffrage resumeTiroirTotal"><span className="tuileLibelle">Estimation HT</span><span className="tuileValeur">{euros(r.bas)} – {euros(r.haut)}</span></div>
    </div>
  );
}

/**
 * Le pied de la feuille Chiffrage : l'estimation et les deux gestes qui suivent un chiffrage —
 * copier le resume, sortir le dossier. L'estimation reste une fourchette : la somme des prix reels
 * ne couvre que les lignes ou un prix existe, et la montrer seule ferait croire a un total.
 */
function PiedChiffrage({ terrasse, objets, commandes }: { terrasse: ObjetPlan; objets: ObjetPlan[]; commandes: RegistreCommandes | undefined }) {
  const r = resumerChiffrage(terrasse, objets);
  if (!r) return null;
  const dossier = commandes?.etat('export.dossier');
  const dossierEfface = !commandes || commandes.effacee('export.dossier');
  return (
    <div className="piedChiffrage">
      <div className="piedChiffrageTotal">
        <span className="piedChiffrageLibelle">Estimation HT</span>
        <span className="piedChiffrageValeur">{euros(r.bas)} – {euros(r.haut)}</span>
      </div>
      <div className="piedChiffrageActions">
        <button type="button" className="secondary" onClick={() => document.getElementById('copierResumeBtn')?.click()}>Copier le résumé</button>
        {!dossierEfface && commandes && (
          <button type="button" className="boutonAccent" disabled={!dossier?.utilisable} title={dossier && 'message' in dossier ? dossier.message : undefined}
            onClick={(e) => { commandes.executer('export.dossier', e.currentTarget); }}>
            <Icone nom="exporter" taille={18} />Dossier PDF
          </button>
        )}
      </div>
    </div>
  );
}

const LIBELLE_HAUTEUR: Record<HauteurTiroir, [string, string]> = {
  replie: ['▁', 'Replier le tiroir : la barre seule'],
  mi: ['▄', 'Tiroir à mi-hauteur'],
  plein: ['█', 'Tiroir en pleine hauteur']
};

export function Resultats({ magasin, tiroir, explorateur, commandes }: PropsResultats) {
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
  if (classe !== 'compact') {
    // Sur tablette, le tiroir replie garde les chiffres cles de la terrasse (maquette Tablette).
    const t = classe === 'moyen' && hauteur === 'replie' ? terrasseSelectionnee(etat) : undefined;
    return t ? <>{barre}<ResumeTiroir terrasse={t} objets={etat.objects} /></> : barre;
  }

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
  const surOngletTerrasse = !!terrasse && tiroir.onglets().some(o => o.id === actif && o.groupe === 'terrasse');
  const pied = document.getElementById('zoneResultatsPied');
  return (
    <>
      <EnteteFeuille magasin={magasin} titre={terrasse ? 'Chiffrage' : 'Résultats'} sousTitre={terrasse ? terrasse.name : 'Cotes, PLU et résumé du plan'} actions={selecteur} />
      {barre}
      {terrasse && actif === 'bom' ? <Tuiles terrasse={terrasse} objets={etat.objects} /> : null}
      {pied && terrasse && surOngletTerrasse ? createPortal(<PiedChiffrage terrasse={terrasse} objets={etat.objects} commandes={commandes} />, pied) : null}
    </>
  );
}

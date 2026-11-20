// Z6, le tiroir des resultats (spec-ihm-zones §4.6) : sa barre d'onglets et sa hauteur.
//
// Etape 5 de la reconstruction : les onglets du panneau du bas deviennent un tiroir sous le plan,
// repliable en trois hauteurs. Cette zone ne rend que la barre — les panneaux restent du balisage
// rendus par zones/resultats/Panneaux.tsx — et demande tout au tiroir (app/tiroir.ts) : quel onglet montrer, quelle
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
import { useCle, cleEtatEtObjets } from './composants/abonnement.js';
import type { Magasin } from '../app/magasin.js';
import type { Explorateur } from '../app/explorateur.js';
import type { RegistreCommandes } from '../app/commandes.js';
import type { ObjetPlan } from '../model/types.js';
import { resumerChiffrage, euros, nombre } from '../ui/chiffrage.js';
import { estTerrasse, terrasseOuPremiere } from '../model/fonctions.js';

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

/**
 * Les chiffres cles et l'estimation, sur une ligne : sous les onglets du tiroir replie (tablette), et
 * en barre fixe au bas de la fenetre au bureau (`bande`), ou le tiroir commence sous le pli. Au bureau,
 * elle nomme la terrasse, mene a sa Nomenclature et porte les gestes du pied du telephone (resume, devis, dossier).
 */
function ResumeTiroir({ terrasse, objets, bande }: { terrasse: ObjetPlan; objets: ObjetPlan[]; bande?: { voir: () => void; commandes: RegistreCommandes | undefined } }) {
  const r = resumerChiffrage(terrasse, objets);
  if (!r) return null;
  const tuiles: [string, string][] = [
    [r.natureAppuis === 'plots' ? 'Plots' : 'Vis', String(r.appuis)],
    ['Lames', nombre(r.lamesMl, 0) + ' ml'],
    ['Bois porteur', nombre(r.porteurMl, 0) + ' ml'],
    ['Surface', nombre(r.surface, 1) + ' m²']
  ];
  return (
    <div className={'resumeTiroir' + (bande ? ' bandeEstimation' : '')} role={bande ? 'region' : undefined} aria-label={bande ? 'Estimation de ' + terrasse.name : undefined}>
      {bande && <div className="tuileChiffrage bandeEstimationNom"><span className="tuileLibelle">Terrasse</span><span className="tuileValeur">{terrasse.name}</span></div>}
      {tuiles.map(([l, v]) => <div key={l} className="tuileChiffrage"><span className="tuileLibelle">{l}</span><span className="tuileValeur">{v}</span></div>)}
      <div className="tuileChiffrage resumeTiroirTotal"><span className="tuileLibelle">Estimation HT</span><span className="tuileValeur">{euros(r.bas)} – {euros(r.haut)}</span></div>
      {bande && (
        <div className="bandeEstimationActions" role="group" aria-label="Après le chiffrage">
          <button type="button" data-controle="tiroir.voirNomenclature" className="secondary" onClick={bande.voir}>Voir la nomenclature</button>
          <ActionsChiffrage commandes={bande.commandes} taille={16} />
        </div>
      )}
    </div>
  );
}

/**
 * Les gestes qui suivent un chiffrage : copier le resume, ouvrir le devis, sortir le dossier. Les memes commandes du
 * registre au pied de la feuille Chiffrage (telephone) et dans la barre d'estimation du bureau : aucun ecouteur a part.
 */
function ActionsChiffrage({ commandes, taille = 18, auDoigt = false }: { commandes: RegistreCommandes | undefined; taille?: number; auDoigt?: boolean }) {
  if (!commandes) return null;
  const dossier = commandes.etat('export.dossier');
  const dossierEfface = commandes.effacee('export.dossier');
  const devis = commandes.etat('export.ouvrirDevis');
  // Le partage par un lien (lot 6) : seulement branche a la plateforme, et efface sans la fonction `project_sharing`.
  const partage = commandes.etat('projet.partager');
  const partageOffert = !!commandes.obtenir('projet.partager') && !commandes.effacee('projet.partager');
  return (
    <>
      <button data-commande="export.copierResume" type="button" className="secondary" onClick={(e) => { commandes.executer('export.copierResume', e.currentTarget); }}>Copier le résumé</button>
      {!commandes.effacee('export.ouvrirDevis') && (
        <button data-commande="export.ouvrirDevis" type="button" className="secondary" disabled={!devis.utilisable} title={'message' in devis ? devis.message : undefined}
          onClick={(e) => { commandes.executer('export.ouvrirDevis', e.currentTarget); }}>Devis</button>
      )}
      {partageOffert && (
        <button data-commande="projet.partager" type="button" className="secondary" disabled={!partage.utilisable} title={'message' in partage ? partage.message : undefined}
          onClick={(e) => { commandes.executer('projet.partager', e.currentTarget); }}>Partager</button>
      )}
      {!dossierEfface && (
        <button data-commande="export.dossier" type="button" className="boutonAccent" disabled={!dossier.utilisable} title={'message' in dossier ? dossier.message : undefined}
          onClick={(e) => { commandes.executer('export.dossier', e.currentTarget); }}>
          <Icone nom="exporter" taille={taille} />Dossier PDF
        </button>
      )}
      {/* Au doigt, l'infobulle n'existe pas : la raison d'un partage grise s'ecrit sous les gestes. */}
      {auDoigt && partageOffert && !partage.utilisable && 'message' in partage && <p className="refusActions" role="note">{partage.message}</p>}
    </>
  );
}

/**
 * Le pied de la feuille Chiffrage : l'estimation et les gestes qui suivent un chiffrage. L'estimation reste une fourchette :
 * la somme des prix reels ne couvre que les lignes ou un prix existe, et la montrer seule ferait croire a un total.
 */
function PiedChiffrage({ terrasse, objets, commandes }: { terrasse: ObjetPlan; objets: ObjetPlan[]; commandes: RegistreCommandes | undefined }) {
  const r = resumerChiffrage(terrasse, objets);
  if (!r) return null;
  return (
    <div className="piedChiffrage">
      <div className="piedChiffrageTotal">
        <span className="piedChiffrageLibelle">Estimation HT</span>
        <span className="piedChiffrageValeur">{euros(r.bas)} – {euros(r.haut)}</span>
      </div>
      <div className="piedChiffrageActions"><ActionsChiffrage commandes={commandes} auDoigt /></div>
    </div>
  );
}

const LIBELLE_HAUTEUR: Record<HauteurTiroir, [string, string]> = {
  replie: ['▁', 'Replier le tiroir : la barre seule'],
  mi: ['▄', 'Tiroir à mi-hauteur'],
  plein: ['█', 'Tiroir en pleine hauteur']
};

export function Resultats({ magasin, tiroir, explorateur, commandes }: PropsResultats) {
  // Le plan (terrasse courante, chiffrage, onglet actif), les onglets offerts, et la commande du dossier. La forme des objets
  // compte : le resume du tiroir replie (tablette), les tuiles et le pied (telephone) chiffrent la terrasse, et un sommet tire
  // change sa surface et ses quantites sans toucher a ses attributs.
  useCle(magasin, 'barre des résultats', (s) => cleEtatEtObjets(s) + JSON.stringify([tiroir.onglets().map((o) => o.id + o.libelle + (o.pastille?.nombre ?? '')),
    commandes ? [commandes.effacee('export.dossier'), commandes.etat('export.dossier'), commandes.etat('export.ouvrirDevis'), commandes.etat('projet.partager')] : null]));
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
          <button key={o.id} type="button" role="tab" data-controle="tiroir.onglet" data-onglet={o.id} aria-selected={o.id === actif}
            className={'ongletResultats' + (o.id === actif ? ' active' : '') + (separateur ? ' debutGroupe' : '')}
            aria-label={o.pastille ? o.libelle + ' : ' + o.pastille.dit : undefined} title={o.pastille?.dit}
            onClick={() => tiroir.activer(o.id)}>
            {o.libelle}{o.pastille && <span className="pastilleOnglet" aria-hidden="true">{o.pastille.nombre}</span>}
          </button>
        );
      })}
      {classe !== 'compact' && (
        <span className="resultatsHauteurs" role="group" aria-label="Hauteur du tiroir">
          {HAUTEURS.map(h => (
            <button key={h} type="button" data-controle="tiroir.hauteur" className={'hauteurTiroir' + (h === hauteur ? ' active' : '')} aria-pressed={h === hauteur} title={LIBELLE_HAUTEUR[h][1]} aria-label={LIBELLE_HAUTEUR[h][1]} onClick={() => tiroir.definirHauteur(h)}>
              <span aria-hidden="true">{LIBELLE_HAUTEUR[h][0]}</span>
            </button>
          ))}
        </span>
      )}
    </div>
  );
  if (classe === 'large') {
    // Au bureau, le tiroir commence sous le pli (l'atelier fait la hauteur de la palette) : l'estimation de la terrasse
    // choisie, ou de la premiere, tient dans une barre fixe au bas de la fenetre. Le meme resume que la tablette et le
    // telephone, rien de recalcule ici ; « Voir la nomenclature » choisit la terrasse et ouvre son onglet.
    const t = terrasseOuPremiere(etat.objects, etat.selectedKey);
    const voir = () => {
      if (!t) return;
      if (etat.selectedKey !== t.key) explorateur?.selectionner(t.key);
      tiroir.activer('bom');
      document.getElementById('zoneResultats')?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    };
    return t ? <>{barre}<ResumeTiroir terrasse={t} objets={etat.objects} bande={{ voir, commandes }} /></> : barre;
  }
  if (classe !== 'compact') {
    // Sur tablette, le tiroir replie garde les chiffres cles de la terrasse (maquette Tablette).
    const t = classe === 'moyen' && hauteur === 'replie' ? terrasseSelectionnee(etat) : undefined;
    return t ? <>{barre}<ResumeTiroir terrasse={t} objets={etat.objects} /></> : barre;
  }

  // Le selecteur de terrasse (§6.6) : il selectionne la suivante, comme l'explorateur.
  const terrasse = terrasseSelectionnee(etat);
  const terrasses = etat.objects.filter(estTerrasse);
  const rang = terrasse ? terrasses.indexOf(terrasse) : -1;
  const suivante = () => {
    const t = terrasses[(rang + 1) % terrasses.length];
    if (t && explorateur) explorateur.selectionner(t.key);
  };
  const selecteur = terrasse && terrasses.length > 1 && explorateur ? (
    <button type="button" data-controle="tiroir.terrasseSuivante" className="secondary selecteurTerrasse" onClick={suivante} aria-label={'Terrasse ' + (rang + 1) + ' sur ' + terrasses.length + ' : passer à la suivante'}>
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

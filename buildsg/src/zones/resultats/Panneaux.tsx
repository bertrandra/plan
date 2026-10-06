// Z6, le corps du tiroir des resultats : le panneau de l'onglet actif (spec-ihm-zones §4.6).
//
// La barre d'onglets est `zones/Resultats.tsx` ; ce composant rend le panneau choisi, et lui seul —
// un onglet ferme ne calcule rien. Les panneaux gardent les identifiants de l'ancien balisage
// (`panelBom`, `terrasseBomTable`…) : la feuille de style, la liste de fumee et
// `tests/unit/zones/identifiants.test.ts` les retrouvent par eux.

import { useStore } from 'zustand';
import { ONGLETS } from '../../app/tiroir.js';
import { Nomenclature } from './Nomenclature.js';
import { Coupe } from './Coupe.js';
import { Implantation } from './Implantation.js';
import { Chantier } from './Chantier.js';
import { Methode } from './Methode.js';
import { Cotes } from './Cotes.js';
import { Plu } from './Plu.js';
import { Resume } from './Resume.js';
import { NoteCalcul } from './NoteCalcul.js';
import { Profil } from './Profil.js';
import type { Magasin } from '../../app/magasin.js';
import type { Resultats } from '../../app/resultats.js';
import type { RegistreCommandes } from '../../app/commandes.js';

export interface PropsPanneaux { magasin: Magasin; resultats: Resultats; commandes: RegistreCommandes }

export function PanneauxResultats({ magasin, resultats, commandes }: PropsPanneaux) {
  useStore(magasin.store, (s) => s.version);
  const actif = magasin.store.getState().etat.panelTab;
  const onglet = ONGLETS.find(o => o.id === actif);
  if (!onglet) return null;
  const terrasse = onglet.groupe === 'terrasse' ? resultats.terrasse() : undefined;
  if (onglet.groupe === 'terrasse' && !terrasse) return null;

  // Les onglets de terrasse ne s'ouvrent que sur une terrasse selectionnee (verifie juste au-dessus).
  const pourTerrasse = (rendre: (t: NonNullable<typeof terrasse>) => React.ReactNode) => terrasse ? rendre(terrasse) : null;
  let contenu: React.ReactNode;
  switch (onglet.id) {
    case 'bom': contenu = pourTerrasse(t => <Nomenclature obj={t} resultats={resultats} />); break;
    case 'coupe': contenu = pourTerrasse(t => <Coupe obj={t} objets={resultats.etat.objects} />); break;
    case 'implantation': contenu = pourTerrasse(t => <Implantation obj={t} resultats={resultats} />); break;
    case 'chantier': contenu = pourTerrasse(t => <Chantier obj={t} resultats={resultats} />); break;
    case 'methode': contenu = pourTerrasse(t => <Methode obj={t} resultats={resultats} />); break;
    case 'mesure': contenu = <Cotes resultats={resultats} commandes={commandes} />; break;
    case 'plu': contenu = <Plu resultats={resultats} commandes={commandes} />; break;
    case 'resume': contenu = <Resume resultats={resultats} commandes={commandes} />; break;
    case 'noteCalcul': contenu = <NoteCalcul resultats={resultats} commandes={commandes} />; break;
    case 'profil': contenu = <Profil resultats={resultats} />; break;
  }
  return <div id={onglet.panneau} role="tabpanel" aria-label={onglet.libelle}>{contenu}</div>;
}

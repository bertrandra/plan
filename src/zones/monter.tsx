// Monte les zones React dans leurs conteneurs d'index.html (spec-ihm-zones §6).
//
// Une racine par zone : elles n'ont rien a partager entre elles, tout passe par le magasin et le
// registre. Un conteneur absent est une erreur de balisage, pas un cas a tolerer.

import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { BarreApplication } from './BarreApplication.js';
import { BarreEtat } from './BarreEtat.js';
import { Palette } from './Palette.js';
import { Explorateur } from './Explorateur.js';
import { Inspecteur } from './Inspecteur.js';
import { Resultats } from './Resultats.js';
import { Dialogues } from './Dialogues.js';
import { Parcours } from './Parcours.js';
import { Notifications } from './Notifications.js';
import { Surimpression, type ServicePointage } from './Surimpression.js';
import { BarreNavigation } from './BarreNavigation.js';
import { FeuilleSelection } from './FeuilleSelection.js';
import { Voile } from './composants/Feuille.js';
import { PanneauxResultats } from './resultats/Panneaux.js';
import { Vue3d } from './vue3d/Vue3d.js';
import { Visionneuse } from './vue3d/Visionneuse.js';
import type { ServiceVues3d } from './vue3d/communs.js';
import type { Magasin } from '../app/magasin.js';
import type { RegistreCommandes } from '../app/commandes.js';
import type { Projet } from '../app/projet.js';
import type { Explorateur as ServiceExplorateur } from '../app/explorateur.js';
import type { Inspecteur as ServiceInspecteur } from '../app/inspecteur.js';
import type { Tiroir } from '../app/tiroir.js';
import type { Resultats as ServiceResultats } from '../app/resultats.js';

export interface DependancesZones {
  magasin: Magasin;
  commandes: RegistreCommandes;
  projet: Projet;
  explorateur: ServiceExplorateur;
  inspecteur: ServiceInspecteur;
  tiroir: Tiroir;
  pointage: ServicePointage;
  resultats: ServiceResultats;
  vues3d: ServiceVues3d;
}

function conteneur(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error('Conteneur de zone introuvable : #' + id);
  return el;
}

export function monterZones({ magasin, commandes, projet, explorateur, inspecteur, tiroir, pointage, resultats, vues3d }: DependancesZones): void {
  // Rendu force synchrone : le code qui suit dans boot() lit des champs des menus par leur
  // identifiant (curseurs du fond orthophoto), qui doivent donc exister au retour.
  flushSync(() => {
  createRoot(conteneur('zoneBarre')).render(<BarreApplication magasin={magasin} commandes={commandes} projet={projet} tiroir={tiroir} />);
  createRoot(conteneur('zonePalette')).render(<Palette magasin={magasin} commandes={commandes} />);
  createRoot(conteneur('zoneExplorateur')).render(<Explorateur magasin={magasin} commandes={commandes} explorateur={explorateur} />);
  createRoot(conteneur('zoneSurimpression')).render(<Surimpression magasin={magasin} commandes={commandes} pointage={pointage} />);
  createRoot(conteneur('zoneInspecteur')).render(<Inspecteur magasin={magasin} commandes={commandes} inspecteur={inspecteur} tiroir={tiroir} />);
  createRoot(conteneur('zoneResultatsBarre')).render(<Resultats magasin={magasin} tiroir={tiroir} explorateur={explorateur} commandes={commandes} />);
  createRoot(conteneur('tiroirPanneaux')).render(<PanneauxResultats magasin={magasin} resultats={resultats} commandes={commandes} />);
  // Les deux vues 3D : leurs panneaux, et l'hote ou three/ pose chaque canvas.
  createRoot(conteneur('zoneVues3d')).render(<><Vue3d magasin={magasin} commandes={commandes} vues={vues3d} /><Visionneuse magasin={magasin} commandes={commandes} vues={vues3d} /></>);
  createRoot(conteneur('zoneEtat')).render(<BarreEtat magasin={magasin} />);
  createRoot(conteneur('zoneDialogues')).render(<><Dialogues /><Parcours /></>);
  createRoot(conteneur('zoneNotifications')).render(<Notifications />);
  // Le telephone et la tablette (spec-ihm-mobile §6) : la barre de navigation, la feuille de
  // selection, et le voile des feuilles. Rien a l'ecran sur bureau.
  createRoot(conteneur('zoneNavigation')).render(<BarreNavigation magasin={magasin} commandes={commandes} />);
  createRoot(conteneur('zoneSelection')).render(<FeuilleSelection magasin={magasin} commandes={commandes} explorateur={explorateur} tiroir={tiroir} />);
  createRoot(conteneur('zoneFeuilles')).render(<Voile magasin={magasin} />);
  });
}

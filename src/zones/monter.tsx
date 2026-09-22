// Monte les zones React dans leurs conteneurs d'index.html (spec-ihm-zones §6).
//
// Une racine par zone : elles n'ont rien a partager entre elles, tout passe par le magasin et le
// registre. Un conteneur absent est une erreur de balisage, pas un cas a tolerer.

import { createRoot } from 'react-dom/client';
import { BarreApplication } from './BarreApplication.js';
import { BarreEtat } from './BarreEtat.js';
import { Palette } from './Palette.js';
import { Explorateur } from './Explorateur.js';
import { Inspecteur } from './Inspecteur.js';
import { Surimpression } from './Surimpression.js';
import type { Magasin } from '../app/magasin.js';
import type { RegistreCommandes } from '../app/commandes.js';
import type { Projet } from '../app/projet.js';
import type { Explorateur as ServiceExplorateur } from '../app/explorateur.js';
import type { Inspecteur as ServiceInspecteur } from '../app/inspecteur.js';

export interface DependancesZones {
  magasin: Magasin;
  commandes: RegistreCommandes;
  projet: Projet;
  explorateur: ServiceExplorateur;
  inspecteur: ServiceInspecteur;
}

function conteneur(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error('Conteneur de zone introuvable : #' + id);
  return el;
}

export function monterZones({ magasin, commandes, projet, explorateur, inspecteur }: DependancesZones): void {
  createRoot(conteneur('zoneBarre')).render(<BarreApplication magasin={magasin} commandes={commandes} projet={projet} />);
  createRoot(conteneur('zonePalette')).render(<Palette magasin={magasin} commandes={commandes} />);
  createRoot(conteneur('zoneExplorateur')).render(<Explorateur magasin={magasin} commandes={commandes} explorateur={explorateur} />);
  createRoot(conteneur('zoneSurimpression')).render(<Surimpression magasin={magasin} commandes={commandes} />);
  createRoot(conteneur('zoneInspecteur')).render(<Inspecteur magasin={magasin} commandes={commandes} inspecteur={inspecteur} />);
  createRoot(conteneur('zoneEtat')).render(<BarreEtat magasin={magasin} />);
}

// Z9, l'attente (shell/attente.ts) : une roue au centre de l'ecran et le texte de l'etape, pendant
// la creation d'un plan depuis une adresse ou une actualisation IGN ; la roue seule, sans texte,
// pendant l'ouverture d'un fichier lourd. Elle ne bloque rien (le
// pointeur la traverse) : c'est une information, pas un dialogue.

import { useSyncExternalStore } from 'react';
import { attente } from '../shell/attente.js';

const abonner = (cb: () => void) => attente.abonner(cb);
const lire = () => attente.etat();

export function Attente() {
  const { message } = useSyncExternalStore(abonner, lire, lire);
  if (message === null) return null;
  // Un message vide : la roue seule, sans carte ni texte (l'ouverture d'un fichier lourd).
  if (message === '') {
    return (
      <div className="attente" role="status" aria-label="Chargement">
        <span className="attenteRoue" aria-hidden="true" />
      </div>
    );
  }
  return (
    <div className="attente" role="status" aria-live="polite">
      <div className="attenteCarte">
        <span className="attenteRoue" aria-hidden="true" />
        <span className="attenteTexte">{message}</span>
      </div>
    </div>
  );
}

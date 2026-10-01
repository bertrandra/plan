// Les champs de saisie du tiroir des resultats (Z6) : un brouillon local pendant la frappe, ecrit a
// la validation — sortie du champ ou Entree —, jamais a chaque touche.
//
// C'est le meme contrat que les nombres de l'inspecteur (zones/Inspecteur.tsx) : une frappe n'est
// pas une ecriture. Ecrire a chaque touche empilerait un instantane d'annulation par chiffre tape,
// et referait le chiffrage de la terrasse entre « 1 » et « 12 ». Echap abandonne le brouillon.

import { useState } from 'react';

interface PropsSaisie {
  valeur: string;
  onValider: (texte: string) => void;
  titre?: string | undefined;
  largeur?: number | undefined;
  /** Grise le champ pour dire qu'il montre une estimation, pas une valeur saisie. */
  estime?: boolean | undefined;
  placeholder?: string | undefined;
  libelle?: string | undefined;
}

function useBrouillon(valeur: string, onValider: (texte: string) => void) {
  const [brouillon, setBrouillon] = useState<string | null>(null);
  const valider = () => {
    if (brouillon === null) return;
    setBrouillon(null);
    if (brouillon !== valeur) onValider(brouillon);
  };
  const touches = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // Entree quitte le champ, et c'est la sortie qui valide : une seule ecriture, un seul instantane.
    if (e.key === 'Enter') e.currentTarget.blur();
    if (e.key === 'Escape') { setBrouillon(null); e.preventDefault(); }
  };
  return { texte: brouillon ?? valeur, changer: (t: string) => setBrouillon(t), valider, touches };
}

export function SaisieNombre({ valeur, onValider, titre, largeur = 85, estime, placeholder, libelle, pas = '0.01', min = '0' }: PropsSaisie & { pas?: string; min?: string }) {
  const b = useBrouillon(valeur, onValider);
  return (
    <input type="number" step={pas} min={min} value={b.texte} title={titre} placeholder={placeholder} aria-label={libelle ?? titre}
      className={estime ? 'saisieEstimee' : undefined} style={{ width: largeur }}
      onChange={(e) => b.changer(e.target.value)} onBlur={b.valider} onKeyDown={b.touches} />
  );
}

export function SaisieTexte({ valeur, onValider, titre, largeur = 190, libelle }: PropsSaisie) {
  const b = useBrouillon(valeur, onValider);
  return (
    <input type="text" value={b.texte} title={titre} aria-label={libelle ?? titre} style={{ minWidth: largeur }}
      onChange={(e) => b.changer(e.target.value)} onBlur={b.valider} onKeyDown={b.touches} />
  );
}

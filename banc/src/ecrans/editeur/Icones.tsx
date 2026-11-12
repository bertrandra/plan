// Les icones de l'editeur, dessinees ici (la page n'en charge aucune d'ailleurs : sa politique de contenu ne l'admet pas) : un trait de
// 1,8 a la couleur du texte, sur une grille de 24, pour qu'elles suivent le theme clair ou sombre.

import type { ReactElement } from 'react';

const TRACES: Record<string, ReactElement> = {
  choisir: <path d="M5 3l14 7-6 2-2 6z" />,
  vue: <><path d="M8 13V5.5a1.5 1.5 0 013 0V12" /><path d="M11 11.5V4.5a1.5 1.5 0 013 0V12" /><path d="M14 11.5V6.5a1.5 1.5 0 013 0V15a6 6 0 01-6 6h-1a6 6 0 01-5-2.7L3.6 15a1.5 1.5 0 012.5-1.7L8 15" /></>,
  zoom: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="M20 20l-4.8-4.8M8 10.5h5M10.5 8v5" /></>,
  boite: <path d="M4 4h4M12 4h2M18 4h2v2M20 10v2M20 16v4h-4M12 20h-2M6 20H4v-2M4 14v-2M4 8V6" />,
  lasso: <><path d="M7 18c-2.5-1.3-4-3.4-4-5.8C3 7.7 7 4 12 4s9 3.7 9 8.2-4 7.8-9 7.8c-1 0-2-.1-2.9-.4" /><circle cx="7.5" cy="18.5" r="1.8" /><path d="M7 20.2c-.2 1 .2 1.8 1 1.8" /></>,
  rectangle: <rect x="4" y="6" width="16" height="12" rx="1" />,
  polygone: <path d="M12 3l8.5 6.2-3.3 10H6.8L3.5 9.2z" />,
  ligne: <><path d="M5 19L19 5" /><circle cx="5" cy="19" r="1.6" /><circle cx="19" cy="5" r="1.6" /></>,
  point: <><circle cx="12" cy="12" r="4" /><path d="M12 3v4M12 17v4M3 12h4M17 12h4" /></>,
  etiquettes: <><path d="M3 12V4h8l10 10-8 8z" /><circle cx="7.5" cy="8.5" r="1.3" /></>,
  loupe: <><circle cx="11" cy="11" r="7" /><circle cx="11" cy="11" r="2.5" /><path d="M20 20l-3.9-3.9" /></>,
  aide: <><circle cx="12" cy="12" r="9" /><path d="M9.5 9.5a2.5 2.5 0 114 2c-.9.6-1.5 1.1-1.5 2.2" /><circle cx="12" cy="17" r=".6" /></>,
  precedent: <path d="M15 5l-7 7 7 7" />,
  suivant: <path d="M9 5l7 7-7 7" />,
  retour: <path d="M10 5L3 12l7 7M3 12h18" />,
  valider: <path d="M4 12.5l5 5L20 6.5" />,
  enregistrer: <><path d="M5 4h11l3 3v13H5z" /><path d="M8 4v5h7V4M8 20v-6h8v6" /></>,
  rejeter: <><circle cx="12" cy="12" r="9" /><path d="M5.6 5.6l12.8 12.8" /></>,
};

export type NomIcone = keyof typeof TRACES;

export function Icone({ nom, taille = 20 }: { nom: NomIcone; taille?: number }) {
  return (
    <svg className="icone" width={taille} height={taille} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {TRACES[nom]}
    </svg>
  );
}

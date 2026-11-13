// Les icones du banc, dessinees ici (la page n'en charge aucune d'ailleurs : sa politique de contenu ne l'admet pas) : un trait de
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
  sortir: <><path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4" /><path d="M9 16l-4-4 4-4M5 12h11" /></>,
  enregistrer: <><path d="M5 4h11l3 3v13H5z" /><path d="M8 4v5h7V4M8 20v-6h8v6" /></>,
  rejeter: <><circle cx="12" cy="12" r="9" /><path d="M5.6 5.6l12.8 12.8" /></>,
  classes: <><rect x="3" y="4" width="7" height="6" rx="1" /><path d="M6.5 10v4h7M6.5 14v4h7" /><rect x="14" y="11" width="7" height="5" rx="1" /><rect x="14" y="17" width="7" height="4" rx="1" /></>,
  importer: <><path d="M12 3v12M7 10l5 5 5-5" /><path d="M4 17v3h16v-3" /></>,
  redresser: <><path d="M5 19L8 5h8l3 14z" /><path d="M9 19V5M15 19V5" strokeDasharray="2 2" /></>,
  mosaique: <><rect x="3" y="3" width="8" height="8" rx="1.5" /><rect x="13" y="3" width="8" height="8" rx="1.5" /><rect x="3" y="13" width="8" height="8" rx="1.5" /><rect x="13" y="13" width="8" height="8" rx="1.5" /></>,
  brouillon: <><path d="M4 20l4-1L19 8l-3-3L5 16z" /><path d="M14 7l3 3" /><path d="M14 20h6" /></>,
  marquage: <><rect x="3" y="5" width="18" height="14" rx="2" /><rect x="7" y="9" width="5" height="6" strokeDasharray="2 1.5" /><path d="M15 9h3M15 12h3" /></>,
  exporter: <><path d="M12 15V3M7 8l5-5 5 5" /><path d="M4 14v6h16v-6" /></>,
  blocs: <><rect x="3" y="4" width="18" height="4" rx="1" /><rect x="3" y="10" width="12" height="4" rx="1" /><rect x="3" y="16" width="6" height="4" rx="1" /></>,
  auto: <><path d="M12 3l1.8 4.6L18.5 9l-4.7 1.5L12 15l-1.8-4.5L5.5 9l4.7-1.4z" /><path d="M18 15l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z" /></>,
  main: <><path d="M8 13V5.5a1.5 1.5 0 013 0V12" /><path d="M11 11.5V4.5a1.5 1.5 0 013 0V12" /><path d="M14 11.5V6.5a1.5 1.5 0 013 0V15a6 6 0 01-6 6h-1a6 6 0 01-5-2.7L3.6 15a1.5 1.5 0 012.5-1.7L8 15" /></>,
  face: <><rect x="4" y="4" width="16" height="16" rx="2" /><path d="M9 9h6v6H9z" /></>,
  refaire: <><path d="M4 12a8 8 0 1 0 2.3-5.6" /><path d="M4 4v4h4" /></>,
  poubelle: <><path d="M4 7h16M10 11v6M14 11v6" /><path d="M6 7l1 13h10l1-13M9 7V4h6v3" /></>,
  plein: <><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" /></>,
  fermer: <path d="M6 6l12 12M18 6L6 18" />,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v6" /><circle cx="12" cy="7.5" r=".6" /></>,
  semblables: <><rect x="3" y="5" width="7" height="10" rx="1" /><rect x="14" y="5" width="7" height="10" rx="1" strokeDasharray="2 1.6" /><path d="M10.5 10h3M12.5 8.5l1.5 1.5-1.5 1.5" /><path d="M5 19h14" strokeDasharray="2 2" /></>,
  aimant: <><path d="M6 4v8a6 6 0 0012 0V4" /><path d="M6 4h3v8a3 3 0 006 0V4h3" /><path d="M6 8h3M15 8h3" /></>,
  caler: <><rect x="6" y="6" width="12" height="12" /><path d="M2 9V2h7M22 9V2h-7M2 15v7h7M22 15v7h-7" /></>,
  stylet: <><path d="M15.5 4.5l4 4L9 19l-5 1 1-5z" /><path d="M13.5 6.5l4 4" /><path d="M18 2.5l3.5 3.5" /></>,
  ouvrir: <><path d="M14 4h6v6M20 4l-9 9" /><path d="M18 14v6H4V6h6" /></>,
};

export type NomIcone = keyof typeof TRACES;

export function Icone({ nom, taille = 20 }: { nom: NomIcone; taille?: number }) {
  return (
    <svg className="icone" width={taille} height={taille} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {TRACES[nom]}
    </svg>
  );
}

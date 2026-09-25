// Le jeu d'icones de l'interface (MD/spec-ihm-mobile.md §5.4).
//
// Un seul jeu, en trait, sur une grille de 24 : il remplace les glyphes Unicode et les emojis, dont
// le rendu change d'un systeme a l'autre (le parasol est un emoji en couleur sur un telephone, un
// glyphe noir sur un autre) et qui ne suivent pas la couleur du texte. Une icone prend
// `currentColor` : elle suit le theme, l'etat actif, le grise. Elle est toujours decorative
// (`aria-hidden`) : le bouton qui la porte a son libelle.
//
// Pas de bibliotheque : une trentaine de traces, c'est moins que le code pour en charger une.

export type NomIcone =
  | 'annuler' | 'polygone' | 'rectangle' | 'chemin' | 'cercle' | 'parasol' | 'pointDeVue'
  | 'dupliquer' | 'supprimer' | 'reculer' | 'positionInitiale' | 'cote' | 'aligner'
  | 'grille' | 'ajuster' | 'nord' | 'oeil' | 'oeilBarre' | 'menu' | 'exporter' | 'fermer'
  | 'chevronBas' | 'chevronHaut' | 'chevronGauche' | 'chevronDroite' | 'objets' | 'reglages' | 'resultats'
  | 'plus' | 'moins' | 'cadenas' | 'info' | 'cube' | 'orbite' | 'deplacer' | 'loupe' | 'image'
  | 'personne' | 'pleinEcran' | 'soleil' | 'engrenage' | 'camera' | 'coche' | 'etiquette';

/** Les traces, chacun dans un repere de 24 × 24. */
const TRACES: Record<NomIcone, React.ReactNode> = {
  annuler: <><path d="M9 14L4 9l5-5" /><path d="M4 9h10.5a5.5 5.5 0 010 11H11" /></>,
  polygone: <path d="M12 3l8.5 6-3.2 11H6.7L3.5 9z" />,
  rectangle: <rect x="3.5" y="6.5" width="17" height="11" rx="1" />,
  chemin: <path d="M4 20c3-7 7-2 9-8s4-7 7-8" />,
  cercle: <circle cx="12" cy="12" r="8.5" />,
  parasol: <><path d="M3 12a9 9 0 0118 0z" /><path d="M12 12v7.5a2 2 0 01-4 0" /></>,
  pointDeVue: <><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" /><circle cx="12" cy="12" r="3" /></>,
  dupliquer: <><rect x="8.5" y="8.5" width="12" height="12" rx="2" /><path d="M15.5 8.5V5.5a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2h3" /></>,
  supprimer: <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />,
  reculer: <><rect x="4" y="4" width="11" height="11" rx="1" /><path d="M9 20h11V9" /></>,
  positionInitiale: <><path d="M4 12a8 8 0 108-8" /><path d="M4 4v5h5" /></>,
  cote: <><path d="M3 17L17 3l4 4L7 21z" /><path d="M7.5 12.5l2 2M10.5 9.5l2 2M13.5 6.5l2 2" /></>,
  aligner: <><rect x="5" y="10" width="10" height="10" rx="1" /><path d="M9 4h10v10" /></>,
  grille: <><rect x="3.5" y="3.5" width="17" height="17" rx="2" /><path d="M3.5 9.5h17M3.5 14.5h17M9.5 3.5v17M14.5 3.5v17" /></>,
  ajuster: <path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5" />,
  nord: <><circle cx="12" cy="12" r="8.5" /><path d="M12 5.5l3 8h-6z" fill="currentColor" /></>,
  oeil: <><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" /><circle cx="12" cy="12" r="3" /></>,
  oeilBarre: <path d="M3 3l18 18M10.6 5.6A10 10 0 0112 5.5c6 0 9.5 6.5 9.5 6.5a17 17 0 01-2.7 3.4M6.2 7.2C3.9 8.9 2.5 12 2.5 12s3.5 6.5 9.5 6.5a9 9 0 004.3-1.1" />,
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  exporter: <path d="M12 4v11M7 10l5 5 5-5M5 20h14" />,
  fermer: <path d="M6 6l12 12M18 6L6 18" />,
  chevronBas: <path d="M6 9l6 6 6-6" />,
  chevronHaut: <path d="M6 15l6-6 6 6" />,
  chevronGauche: <path d="M15 6l-6 6 6 6" />,
  chevronDroite: <path d="M9 6l6 6-6 6" />,
  objets: <><path d="M12 3l9 5-9 5-9-5z" /><path d="M3 13l9 5 9-5" /></>,
  reglages: <><path d="M4 7h9M17 7h3M4 17h3M11 17h9" /><circle cx="15" cy="7" r="2" /><circle cx="9" cy="17" r="2" /></>,
  resultats: <><path d="M9 6h11M9 12h11M9 18h11" /><path d="M4.5 6h.01M4.5 12h.01M4.5 18h.01" strokeWidth="2.5" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  moins: <path d="M5 12h14" />,
  cadenas: <><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 018 0v3" /></>,
  info: <><circle cx="12" cy="12" r="8.5" /><path d="M12 11v5M12 8h.01" /></>,
  cube: <><path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z" /><path d="M12 12l8-4.5M12 12v9M12 12L4 7.5" /></>,
  orbite: <><path d="M20 12a8 8 0 11-2.3-5.7" /><path d="M20 4v4h-4" /></>,
  deplacer: <path d="M12 3v18M3 12h18M12 3l-3 3M12 3l3 3M12 21l-3-3M12 21l3-3M3 12l3-3M3 12l3 3M21 12l-3-3M21 12l-3 3" />,
  loupe: <><circle cx="10.5" cy="10.5" r="6" /><path d="M15 15l5.5 5.5" /></>,
  image: <><rect x="3.5" y="5" width="17" height="14" rx="2" /><circle cx="9" cy="10" r="1.6" /><path d="M20.5 16l-5-5-8.5 8" /></>,
  personne: <><circle cx="12" cy="5" r="2.2" /><path d="M12 8v7M8.5 21l3.5-6 3.5 6M8 11h8" /></>,
  pleinEcran: <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />,
  soleil: <><circle cx="12" cy="12" r="4" /><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" /></>,
  engrenage: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z" /></>,
  camera: <><path d="M4 8h3l2-2.5h6L17 8h3a1 1 0 011 1v9a1 1 0 01-1 1H4a1 1 0 01-1-1V9a1 1 0 011-1z" /><circle cx="12" cy="13" r="3.5" /></>,
  coche: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  etiquette: <><path d="M3.5 12.5V4.5a1 1 0 011-1h8l8 8-9 9z" /><circle cx="8" cy="8" r="1.4" /></>
};

export function Icone({ nom, taille = 22 }: { nom: NomIcone; taille?: number }) {
  return (
    <svg className="icone" width={taille} height={taille} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {TRACES[nom]}
    </svg>
  );
}

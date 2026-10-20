// Les images des choix du mode Toit (inspecteur contextuel) : un trace par valeur, en plan ou en coupe, dans un repere de 24 x 24.
//
// Une image dit la valeur sans mot : la forme d'un bow-window vue de dessus, son niveau vu de face, son toit vu de profil, des poteaux ou un mur,
// un pignon qui monte ou non au faitage. Les retraits se lisent en chiffres (0, ½, 1 m).

import type { ReactNode } from 'react';

const TRACES: Record<string, ReactNode> = {
  // Un bow-window vu de dessus : le mur de la maison en haut, l'element qui avance.
  'forme:pans': <path d="M3 5h18M6 5l3 11h6l3-11" />,
  'forme:rectangle': <path d="M3 5h18M7 5v11h10V5" />,
  'forme:arc': <path d="M3 5h18M6 5v2a6 9 0 0012 0V5" />,
  'forme:conge': <path d="M3 5h18M7 5v7a4 4 0 004 4h2a4 4 0 004-4V5" />,
  // Le niveau, vu de face : une maison de deux etages, la partie du bow-window pleine.
  'niveau:rdc': <><path d="M5 4h14v16H5zM5 12h14" /><path d="M5 12h14v8H5z" fill="currentColor" opacity=".35" /></>,
  'niveau:toit': <><path d="M5 4h14v16H5zM5 12h14" /><path d="M5 4h14v16H5z" fill="currentColor" opacity=".35" /></>,
  // Le toit propre, vu de profil : le mur de la maison a gauche.
  'toit:pan': <path d="M4 20V6M4 6l14 8v6H4" />,
  'toit:plat': <path d="M4 20V6M4 12h14v8H4" />,
  'toit:pavillon': <path d="M4 20V6M4 12l7-6 7 6v8H4" />,
  // Une galerie sur poteaux, ou fermee.
  'ouvert:poteaux': <path d="M3 8h18M6 8v12M12 8v12M18 8v12" />,
  'ouvert:mur': <path d="M3 8h18v12H3z" />,
  // Le pignon : monte au faitage, ou plus bas.
  'hauteur:faitage': <path d="M3 20l9-15 9 15zM12 5v15" />,
  'hauteur:bas': <path d="M3 20l9-9 9 9zM3 5h18" strokeDasharray="2 2" />
};

/** L'image d'un choix, ou son texte quand il n'a pas de trace (les retraits : « 0 », « ½ », « 1 »). */
export function ImageChoix({ groupe, valeur }: { groupe: string; valeur: string }) {
  const trace = TRACES[groupe + ':' + valeur];
  if (!trace) return <span aria-hidden="true">{valeur === '0.5' ? '½' : valeur}</span>;
  return <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{trace}</svg>;
}

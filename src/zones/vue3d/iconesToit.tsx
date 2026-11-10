// Les images des choix du mode Toit (inspecteur contextuel) : un trace par valeur, en plan ou en coupe, dans un repere de 24 x 24.
//
// Une image dit la valeur sans mot : la forme d'un bow-window vue de dessus, son niveau vu de face, son toit vu de profil, des poteaux ou un mur,
// un pignon qui monte ou non au faitage, le pan qui porte un element. Les retraits se lisent en chiffres (0, ½, 1 m).

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
  // Le rez-de-chaussee, vu en coupe (la rue a droite) : la facade droite et le bow-window devant elle, ou le rez-de-chaussee recule sous
  // l'etage qui avance, le bow-window glisse dessous.
  'rdc:0': <><path d="M14 3v18M4 12h10" /><path d="M14 13h5v7h-5z" fill="currentColor" opacity=".35" /></>,
  'rdc:aligne': <><path d="M19 3v9h-5v9M4 12h10" /><path d="M14 13h5v7h-5z" fill="currentColor" opacity=".35" /></>,
  // Le toit propre, vu de profil : le mur de la maison a gauche.
  'toit:pan': <path d="M4 20V6M4 6l14 8v6H4" />,
  'toit:plat': <path d="M4 20V6M4 12h14v8H4" />,
  'toit:pavillon': <path d="M4 20V6M4 12l7-6 7 6v8H4" />,
  // Sans toit propre : la boite sous le pan d'un auvent, dessine en pointille.
  'toit:aucun': <><path d="M4 20V6M4 13h12v7H4" /><path d="M4 9l16 4" strokeDasharray="2 2" /></>,
  // Une galerie sur poteaux, ou fermee.
  'ouvert:poteaux': <path d="M3 8h18M6 8v12M12 8v12M18 8v12" />,
  'ouvert:mur': <path d="M3 8h18v12H3z" />,
  // Le pignon : monte au faitage, ou plus bas.
  'hauteur:faitage': <path d="M3 20l9-15 9 15zM12 5v15" />,
  'hauteur:bas': <path d="M3 20l9-9 9 9zM3 5h18" strokeDasharray="2 2" />,
  // Le pan qui porte l'element, vu en travers du faitage : celui du cote 0 a gauche, l'oppose a droite (le nom dit son orientation).
  'pan:0': <><path d="M3 19l9-13 9 13" /><path d="M3 19l9-13v13z" fill="currentColor" opacity=".35" /></>,
  'pan:1': <><path d="M3 19l9-13 9 13" /><path d="M21 19l-9-13v13z" fill="currentColor" opacity=".35" /></>,
  // Le sens du faitage, vu de dessus : le rectangle du corps et son faitage, dans la longueur ou dans la largeur.
  'sens:long': <><rect x="3" y="7" width="18" height="10" rx="1" /><path d="M5 12h14" strokeWidth="2.4" /></>,
  'sens:court': <><rect x="3" y="7" width="18" height="10" rx="1" /><path d="M12 8.5v7" strokeWidth="2.4" /></>,
  // Le mur haut d'un appentis, vu en travers du faitage : le mur 0 a gauche, l'oppose a droite (le nom dit son orientation).
  'murHaut:0': <path d="M4 20V5l16 8v7z" />,
  'murHaut:2': <path d="M20 20V5L4 13v7z" />,
  // Un bout du faitage, vu de face : le pignon en triangle, la croupe (un pan qui descend jusqu'a l'egout, le mur s'arrete a l'egout),
  // le cul de geai (le pignon dont la pointe est coupee par un petit pan, plein).
  'bout:pignon': <path d="M3 20V13l9-8 9 8v7z" />,
  'bout:croupe': <><path d="M3 20v-7h18v7z" /><path d="M3 13l9-8 9 8z" fill="currentColor" opacity=".35" /></>,
  'bout:demi-croupe': <><path d="M3 20v-7l5.4-4.8h7.2L21 13v7z" /><path d="M8.4 8.2L12 5l3.6 3.2z" fill="currentColor" opacity=".35" /></>,
  'pointe:triangle': <path d="M3 20V13l9-8 9 8v7z" />,
  'pointe:demi-croupe': <><path d="M3 20v-7l5.4-4.8h7.2L21 13v7z" /><path d="M8.4 8.2L12 5l3.6 3.2z" fill="currentColor" opacity=".35" /></>,
  // L'egout d'un pan, vu en coupe : droit, sans queue de vache.
  'qdv:0': <path d="M4 20V9M2 10l11-6 9 5" />
};

/** Le groupe d'une image : sans le rang du bout ou du pan qu'il regle (`bout0`, `qdv1`...). */
const sansRang = (groupe: string): string => groupe.replace(/[01]$/, '');

/** Les valeurs dites en chiffres : la part coupee d'un cul de geai, les debords en metres, les pentes en degres. */
function texteDuChoix(groupe: string, valeur: string): string {
  if (groupe === 'pente' || groupe === 'penteCoyau') return valeur + '°';
  if (groupe === 'coupe') return valeur === '0.25' ? '¼' : valeur === '0.33' ? '⅓' : '½';
  return valeur === '0.5' ? '½' : valeur.replace('.', ',');
}

/** L'image d'un choix, ou son texte quand il n'a pas de trace (les retraits : « 0 », « ½ », « 1 »). */
export function ImageChoix({ groupe, valeur }: { groupe: string; valeur: string }) {
  const g = sansRang(groupe), trace = TRACES[g + ':' + valeur];
  // Les pentes se lisent en degres, les debords en metres.
  if (!trace) return <span aria-hidden="true">{texteDuChoix(g, valeur)}</span>;
  return <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{trace}</svg>;
}

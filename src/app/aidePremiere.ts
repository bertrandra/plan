// L'aide de premiere utilisation (lot 2 de la simplification de l'IHM, 16 novembre 2026) : trois bulles, une fois par appareil.
//
// Qui ouvre Plan pour la premiere fois ne sait pas que la terrasse se touche, que ses reglages sont dans Proprietes, ni ou se lit le
// prix. Trois bulles le disent, l'une apres l'autre, en bas de l'ecran (zones/AidePremiere.tsx, Z9 : de l'information, pas une
// question). « Passer » les ferme toutes. Elles ne reviennent pas sur cet appareil : l'avoir vue est retenu dans le navigateur des la
// premiere bulle (une preference de l'appareil, comme l'enregistrement automatique), et rien n'est ecrit dans le projet.
//
// Elles attendent que rien ne soit ouvert par-dessus le plan (un parcours, une question) : l'import par adresse, « Mettre a jour le
// modele ? ». Jamais dans la vitrine, l'audit, un projet partage, l'admin des demos, ni en lecture seule (app/boot.ts ne les demarre pas).

import { notifications } from '../shell/notifications.js';
import { parcours } from './parcours.js';
import { dialogues } from '../shell/dialogues.js';

/** La cle du navigateur : `vue` une fois les bulles montrees. */
export const CLE_AIDE_PREMIERE = 'plan.aide.premiersPas';
/** Le temps laisse au plan pour s'afficher avant la premiere bulle. */
const DELAI_MS = 1200;

export interface Bulle { titre: string; souris: string; doigt: string }

export const BULLES: readonly Bulle[] = [
  { titre: 'Votre terrasse',
    souris: 'Cliquez la terrasse pour la choisir, puis tirez ses coins pour lui donner sa forme. Le bouton Terrasse de la palette en ajoute une autre.',
    doigt: 'Touchez la terrasse pour la choisir, puis tirez ses coins pour lui donner sa forme. Outils › Terrasse en ajoute une autre.' },
  { titre: 'Ses réglages',
    souris: 'L’inspecteur, à droite, règle la terrasse étape par étape : la lame, la fondation, la structure. Le chiffrage suit chaque réglage.',
    doigt: 'Propriétés règle la terrasse étape par étape : la lame, la fondation, la structure. Le chiffrage suit chaque réglage.' },
  { titre: 'Le prix et la 3D',
    souris: 'L’estimation se lit en bas de l’écran, avec la nomenclature et le devis ; Vue 3D montre la terrasse posée, au soleil.',
    doigt: 'Chiffrage donne l’estimation, la nomenclature et le devis ; 3D montre la terrasse posée, au soleil.' }
];

let etape: number | null = null;
const abonnes = new Set<() => void>();
const publier = () => abonnes.forEach((f) => f());

function dejaVue(): boolean {
  // Sans stockage (navigation privee stricte), on ne sait pas : on ne montre rien plutot que de reposer les bulles a chaque page.
  try { return localStorage.getItem(CLE_AIDE_PREMIERE) !== null; } catch { return true; }
}
function retenir(): void {
  try { localStorage.setItem(CLE_AIDE_PREMIERE, 'vue'); } catch { /* sans stockage : elles ne reviennent pas dans cette page */ }
}

export const aidePremiere = {
  /** La bulle montree (0, 1, 2), ou `null`. */
  etape: (): number | null => etape,
  abonner(f: () => void): () => void { abonnes.add(f); return () => { abonnes.delete(f); }; },
  suivante(): void { if (etape === null) return; etape = etape + 1 < BULLES.length ? etape + 1 : null; publier(); },
  passer(): void { if (etape === null) return; etape = null; publier(); }
};

/**
 * Montre les bulles a la premiere utilisation de cet appareil, une fois le plan a l'ecran et rien d'ouvert par-dessus.
 * `horloge` : le minuteur, remplacable dans les tests.
 */
export function demarrerAidePremiere(horloge: (f: () => void, ms: number) => unknown = setTimeout): void {
  if (dejaVue()) return;
  const essayer = (): boolean => {
    if (etape !== null || dejaVue()) return true;
    // Une seule couche a la fois (audit UX de la 5.45.0, polissages) : la bulle attend qu'aucun dialogue ni message ne soit ouvert.
    if (parcours.courant() || dialogues.courant() || notifications.liste().some((n) => n.type === 'toast')) return false;
    retenir();
    etape = 0;
    publier();
    return true;
  };
  horloge(() => {
    if (essayer()) return;
    // Quelque chose est ouvert : on attend qu'il se ferme, sans minuteur qui tourne.
    const fins: (() => void)[] = [];
    const surChangement = () => { if (essayer()) fins.forEach((f) => f()); };
    fins.push(parcours.abonner(surChangement), dialogues.abonner(surChangement), notifications.abonner(surChangement));
  }, DELAI_MS);
}

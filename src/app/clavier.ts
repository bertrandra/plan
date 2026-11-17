// Les raccourcis clavier, par le registre des commandes (spec-ihm-mobile §2.3, D2 et D6).
//
// Ctrl+Z appelait l'historique directement, a cote du registre : il annulait donc meme quand la
// commande `objet.annuler` n'etait pas disponible, et le registre ne savait pas qu'on l'avait
// invoquee. Ctrl+S, lui, etait affiche dans le menu Fichier sans que rien ne l'ecoute : le
// navigateur ouvrait « Enregistrer la page ». Les deux passent maintenant par la commande, avec
// ses droits et ses conditions, comme un clic sur le bouton.
//
// Cette table est la seule liste des raccourcis (lot 4 de la simplification de l'IHM) : le clavier
// l'ecoute, l'infobulle d'un outil la cite (`raccourcisDe`) et le menu Aide la montre
// (`raccourcisAffiches`), libelles tires du registre. Une liste ecrite a la main ailleurs deriverait.

import type { RegistreCommandes } from './commandes.js';
import { dialogues } from '../shell/dialogues.js';
import { parcours } from './parcours.js';
import { sessionToit } from './toits/modeToit.js';

/** Un raccourci : ses touches, telles qu'elles s'ecrivent a l'ecran (« Ctrl+Maj+Z »), et la commande qu'elles executent. */
export interface Raccourci { touches: readonly string[]; commande: string }

/** Les raccourcis, dans l'ordre ou le menu Aide les montre. Le premier jeu de touches est celui que l'infobulle cite. */
export const RACCOURCIS: readonly Raccourci[] = [
  { touches: ['Ctrl+Z'], commande: 'objet.annuler' },
  { touches: ['Ctrl+Y', 'Ctrl+Maj+Z'], commande: 'objet.retablir' },
  { touches: ['Suppr'], commande: 'objet.supprimer' },
  { touches: ['Ctrl+S'], commande: 'projet.enregistrer' }
];

/** Les touches d'une commande, ou rien. */
export function raccourcisDe(commande: string): readonly string[] {
  return RACCOURCIS.find((r) => r.commande === commande)?.touches ?? [];
}

/** Ce que le menu Aide montre : les raccourcis des commandes declarees et offertes a cette personne, avec leur libelle du registre. */
export function raccourcisAffiches(commandes: RegistreCommandes): { commande: string; libelle: string; touches: readonly string[] }[] {
  return RACCOURCIS.flatMap((r) => {
    const c = commandes.obtenir(r.commande);
    return c && !commandes.effacee(r.commande) ? [{ commande: r.commande, libelle: c.libelle, touches: r.touches }] : [];
  });
}

/** Les touches lues d'un jeu ecrit (« Ctrl+Maj+Z ») : Ctrl vaut aussi Cmd. */
interface Combinaison { ctrl: boolean; maj: boolean; touche: string }
const NOMS_DE_TOUCHES: Record<string, string> = { suppr: 'delete' };
function lire(touches: string): Combinaison {
  const parts = touches.split('+').map((p) => p.trim().toLowerCase());
  const touche = parts[parts.length - 1] ?? '';
  return { ctrl: parts.includes('ctrl'), maj: parts.includes('maj'), touche: NOMS_DE_TOUCHES[touche] ?? touche };
}

/**
 * Une touche sans Ctrl (Suppr) ne vaut que sur le plan : pas dans un champ, ou elle efface du texte, ni sous un dialogue ou une
 * feuille modale, qui ont leurs propres touches. Les raccourcis avec Ctrl, eux, sont pris partout (Ctrl+Z dans un champ annule le
 * plan, comme avant).
 */
function surLePlan(e: KeyboardEvent): boolean {
  const cible = e.target as HTMLElement | null;
  if (cible && typeof cible.closest === 'function' && cible.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"]')) return false;
  if (dialogues.courant() || parcours.courant()) return false;
  return typeof document === 'undefined' || !document.querySelector('[aria-modal="true"]');
}

/**
 * `ailleurs` : un ecran qui prend le plan pour lui (une session du mode Toit, ou Suppr vise l'element du toit et jamais le
 * batiment entier) ; les touches sans Ctrl s'y taisent.
 */
export function brancherClavier(commandes: RegistreCommandes, cible: Pick<Window, 'addEventListener'> = window, ailleurs: () => boolean = () => !!sessionToit()): void {
  const lus = RACCOURCIS.flatMap((r) => r.touches.map((t) => ({ ...lire(t), commande: r.commande })));
  cible.addEventListener('keydown', (ev: Event) => {
    const k = ev as KeyboardEvent;
    if (k.altKey) return;
    const ctrl = k.ctrlKey || k.metaKey;
    const touche = k.key.toLowerCase();
    const r = lus.find((l) => l.touche === touche && l.ctrl === ctrl && l.maj === k.shiftKey);
    if (!r) return;
    // Une touche deja prise ailleurs (le mode Toit prend Suppr pour son element) ne va pas plus loin.
    if (!ctrl && (k.defaultPrevented || ailleurs() || !surLePlan(k))) return;
    // Un raccourci avec Ctrl est pris meme quand la commande est indisponible : Ctrl+S ne doit jamais ouvrir
    // l'enregistrement de la page, Ctrl+Z jamais annuler autre chose que le plan, Ctrl+Y jamais ouvrir l'historique.
    k.preventDefault();
    commandes.executer(r.commande);
  });
}

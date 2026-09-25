// Les raccourcis clavier, par le registre des commandes (spec-ihm-mobile §2.3, D2 et D6).
//
// Ctrl+Z appelait l'historique directement, a cote du registre : il annulait donc meme quand la
// commande `objet.annuler` n'etait pas disponible, et le registre ne savait pas qu'on l'avait
// invoquee. Ctrl+S, lui, etait affiche dans le menu Fichier sans que rien ne l'ecoute : le
// navigateur ouvrait « Enregistrer la page ». Les deux passent maintenant par la commande, avec
// ses droits et ses conditions, comme un clic sur le bouton.

import type { RegistreCommandes } from './commandes.js';

/** Les raccourcis : touche (avec Ctrl ou Cmd) → commande. */
export const RACCOURCIS: Record<string, string> = {
  z: 'objet.annuler',
  s: 'projet.enregistrer'
};

export function brancherClavier(commandes: RegistreCommandes, cible: Pick<Window, 'addEventListener'> = window): void {
  cible.addEventListener('keydown', (e: Event) => {
    const k = e as KeyboardEvent;
    if (!(k.ctrlKey || k.metaKey) || k.altKey || k.shiftKey) return;
    const id = RACCOURCIS[k.key.toLowerCase()];
    if (!id) return;
    // Le raccourci est pris meme quand la commande est indisponible : Ctrl+S ne doit jamais ouvrir
    // l'enregistrement de la page, Ctrl+Z jamais annuler autre chose que le plan.
    k.preventDefault();
    commandes.executer(id);
  });
}

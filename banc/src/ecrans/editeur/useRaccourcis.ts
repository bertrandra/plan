// Le controleur du clavier de l'editeur : une touche donne une action (raccourcis.ts::actionDe, la meme table que l'aide), et l'action son
// geste. Les champs de saisie gardent leurs touches (sauf Ctrl+S) ; une touche que la scene a deja prise (Entree d'un trace) est laissee.

import { useEffect, useRef } from 'react';
import { actionDe, type IdAction } from '../../raccourcis.js';

export type Gestes = Partial<Record<IdAction, (o: { chiffre?: number | undefined; maj: boolean }) => void>>;

export function useRaccourcis(gestes: Gestes): void {
  const courants = useRef(gestes);
  courants.current = gestes;
  useEffect(() => {
    const touche = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      const r = actionDe(e);
      if (!r) return;
      // Un champ ou l'on ecrit garde ses touches ; un curseur ou une case (le seuil, « Verifiee ») ne doivent pas couper le clavier.
      const dansUnChamp = !!(e.target as HTMLElement | null)?.closest?.('input:not([type="range"]):not([type="checkbox"]), select, textarea, [contenteditable="true"]');
      if (dansUnChamp && r.action !== 'enregistrer') return;
      const geste = courants.current[r.action];
      if (!geste) return;
      e.preventDefault();
      geste({ chiffre: r.chiffre, maj: e.shiftKey });
    };
    window.addEventListener('keydown', touche);
    return () => window.removeEventListener('keydown', touche);
  }, []);
}

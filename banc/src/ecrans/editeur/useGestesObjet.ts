// Les gestes sur les objets choisis qui ne sont pas du trace : trouver les semblables (F), coller au bord (C), et le menu d'un objet
// (clic droit, appui long). L'editeur les branche sur le clavier, les boutons de la photo et la scene.

import { useState } from 'react';
import type { Objet } from '../../types.js';
import type { useAides } from './useAides.js';
import type { useMarquage } from './useMarquage.js';
import type { useSelection } from './Selection.js';

export function useGestesObjet({ objets, sel, marquage, aides, dire }: {
  objets: Objet[]; sel: ReturnType<typeof useSelection>; marquage: ReturnType<typeof useMarquage>; aides: ReturnType<typeof useAides>; dire: (t: string) => void;
}) {
  /** F : les semblables de l'objet choisi, ajoutes au brouillon et choisis (Tab et A pour les relire, X pour ceux qui n'en sont pas). */
  const trouverSemblables = () => {
    const modele = objets.find((o) => o.id === sel.choisi);
    if (!modele) { dire('Choisissez d’abord une fenêtre (ou un autre rectangle) : F cherche celles qui lui ressemblent.'); return; }
    const r = aides.trouver(objets, modele);
    if (!r) return;
    const avant = new Set(objets.map((o) => o.id)), nouveaux = r.filter((o) => !avant.has(o.id)).map((o) => o.id);
    if (!nouveaux.length) { dire('Aucun semblable trouvé sur cette photo.'); return; }
    marquage.changer(() => r);
    sel.selectionner(nouveaux, false);
    dire(`${nouveaux.length} semblable(s) proposé(s), choisis : relisez-les (Tab, A), X retire ceux qui n’en sont pas.`);
  };
  /** C : les rectangles choisis cales sur le bord de la menuiserie. */
  const calerPris = () => { if (sel.cibles.size) marquage.changer((l) => aides.calerObjets(l, sel.cibles)); };
  // Le menu d'un objet : il vaut pour la selection quand l'objet en fait partie ; sinon l'objet devient le choisi.
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const ouvrirMenu = (id: string, x: number, y: number) => { if (!sel.selection.has(id)) sel.choisir(id); setMenu({ x, y }); };
  return { trouverSemblables, calerPris, menu, setMenu, ouvrirMenu };
}

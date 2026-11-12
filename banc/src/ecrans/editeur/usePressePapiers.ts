// Le controleur du presse-papiers (Ctrl+C, Ctrl+X, Ctrl+V) : hors des composants, il survit au changement de photo (copier une fenetre,
// la coller sur la photo suivante) ; un collage sur la meme photo se decale, et ce qui vient d'etre colle reste selectionne.

import { useState } from 'react';
import { avecDescendants, coller } from '../../edition.js';
import { rangerLesParents } from '../../geometrie.js';
import type { Classe, Objet } from '../../types.js';
import type { Marquage } from './useMarquage.js';

let pressePapiers: { objets: Objet[]; photo: string } | null = null;

export function usePressePapiers({ id, marquage, cibles, classes, L, H, choisir, selectionner, dire }: {
  id: string; marquage: Marquage; cibles: ReadonlySet<string>; classes: readonly Classe[]; L: number; H: number;
  choisir: (id: string | null) => void; selectionner: (ids: string[], ajouter: boolean) => void; dire: (t: string) => void;
}) {
  const [, setVersion] = useState(0);
  const { objets, changer } = marquage;
  const copier = (couper: boolean) => {
    if (!objets || !cibles.size) return;
    // Chaque objet pris part avec ses details ; un detail deja pris ne part qu'une fois.
    const pris = new Set([...cibles].flatMap((c) => avecDescendants(objets, c).map((o) => o.id)));
    const groupe = objets.filter((o) => pris.has(o.id));
    pressePapiers = { objets: groupe, photo: id };
    setVersion((v) => v + 1);
    if (couper) { changer((l) => l.filter((o) => !pris.has(o.id)).map((o) => (o.parent && pris.has(o.parent) ? { ...o, parent: null } : o))); choisir(null); }
    dire(`${groupe.length} objet(s) ${couper ? 'coupé(s)' : 'copié(s)'}.`);
  };
  const collerIci = () => {
    if (!objets || !pressePapiers) return;
    // Sur la meme photo, un peu decale (sinon il cacherait l'original) ; sur une autre, a la meme place.
    const r = coller(objets, pressePapiers.objets, L, H, pressePapiers.photo === id ? Math.max(10, Math.round(L * 0.02)) : 0);
    const colles = r.objets.slice(objets.length);
    changer(() => rangerLesParents(r.objets, classes));
    // Ce qui vient d'etre colle reste pris (tout le groupe, details compris) : on le tire aussitot a sa place.
    if (colles.length > 1) selectionner(colles.map((o) => o.id), false); else choisir(r.premier);
    // Coller de nouveau decale encore : le presse-papiers devient ce qu'on vient de coller.
    pressePapiers = { objets: colles, photo: id };
  };
  const contenu = pressePapiers ? { nombre: pressePapiers.objets.length, autrePhoto: pressePapiers.photo !== id } : null;
  return { copier, coller: collerIci, contenu };
}

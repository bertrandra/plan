// La selection de plusieurs objets dans l'editeur (demande du proprietaire, 12 novembre 2026) : une boite ou un lasso (outil Selection),
// Maj + clic ; l'objet choisi est la reference. Les actions s'appliquent a toute la selection : aligner sur un bord de la reference,
// donner sa largeur, sa hauteur ou sa taille ; et, dans l'editeur, supprimer, copier, couper, deplacer.

import { useState } from 'react';
import type { Cote } from '../edition.js';
import type { ModeSelection } from './Scene.js';

/** Le choisi (la reference) et la selection : choisir un objet hors de la selection la remplace ; dedans, il en devient la reference. */
export function useSelection() {
  const [choisi, setChoisi] = useState<string | null>(null);
  const [selection, setSelection] = useState<ReadonlySet<string>>(new Set());
  const choisir = (id: string | null) => {
    setChoisi(id);
    if (id === null) setSelection(new Set());
    else if (!selection.has(id)) setSelection(new Set([id]));
  };
  const selectionner = (ids: string[], ajouter: boolean) => {
    const t = new Set(ajouter ? [...selection, ...ids] : ids);
    setSelection(t);
    setChoisi(choisi && t.has(choisi) ? choisi : ids[0] ?? [...t][0] ?? null);
  };
  const basculer = (id: string) => {
    const t = new Set(selection);
    if (t.has(id)) t.delete(id); else t.add(id);
    setSelection(t);
    setChoisi(choisi === id && !t.has(id) ? [...t][0] ?? null : choisi ?? id);
  };
  /** Les objets sur lesquels agir : la selection, ou le choisi seul. */
  const cibles: ReadonlySet<string> = selection.size ? selection : choisi ? new Set([choisi]) : new Set();
  return { choisi, selection, cibles, choisir, selectionner, basculer };
}

/** La barre posee en haut de la photo : la forme de la zone (outil Selection), et les actions quand plusieurs objets sont pris. */
export function BarreSelection({ outilSelection, mode, setMode, nombre, reference, onAligner, onTaille }: {
  outilSelection: boolean; mode: ModeSelection; setMode: (m: ModeSelection) => void; nombre: number; reference: string | null;
  onAligner: (c: Cote) => void; onTaille: (s: 'largeur' | 'hauteur' | 'les-deux') => void;
}) {
  if (!outilSelection && nombre < 2) return null;
  return (
    <div className="barre-selection" role="toolbar" aria-label="Sélection">
      {outilSelection && (
        <span className="outils" role="group" aria-label="Forme de la zone">
          <button type="button" className={mode === 'boite' ? 'onglet actif' : 'onglet'} aria-pressed={mode === 'boite'} onClick={() => setMode('boite')}>⬚ Boîte</button>
          <button type="button" className={mode === 'lasso' ? 'onglet actif' : 'onglet'} aria-pressed={mode === 'lasso'} onClick={() => setMode('lasso')}>➰ Lasso</button>
        </span>
      )}
      {nombre >= 2 ? (
        <>
          <span className="aide">{nombre} objets · référence : <b>{reference ?? '—'}</b></span>
          <span className="outils" role="group" aria-label="Aligner sur la référence">
            <button type="button" title="Aligner les hauts sur la référence" onClick={() => onAligner('haut')}>⤒ Haut</button>
            <button type="button" title="Aligner les bas sur la référence" onClick={() => onAligner('bas')}>⤓ Bas</button>
            <button type="button" title="Aligner les bords gauches sur la référence" onClick={() => onAligner('gauche')}>⇤ Gauche</button>
            <button type="button" title="Aligner les bords droits sur la référence" onClick={() => onAligner('droite')}>⇥ Droite</button>
          </span>
          <span className="outils" role="group" aria-label="Taille de la référence">
            <button type="button" title="La largeur de la référence" onClick={() => onTaille('largeur')}>↔ Largeur</button>
            <button type="button" title="La hauteur de la référence" onClick={() => onTaille('hauteur')}>↕ Hauteur</button>
            <button type="button" title="La largeur et la hauteur de la référence" onClick={() => onTaille('les-deux')}>⬚ Même taille</button>
          </span>
        </>
      ) : <span className="aide">Tirez une {mode === 'boite' ? 'boîte' : 'boucle'} autour des objets ; Maj pour en ajouter. Touchez ensuite l’objet de référence.</span>}
    </div>
  );
}

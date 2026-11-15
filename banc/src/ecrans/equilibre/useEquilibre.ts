// Le controleur de l'ecran d'equilibre : le perimetre compte (toutes les photos, ou seulement celles du jeu) et les comptes qui en
// sortent (equilibre.ts). L'ecran ne fait que montrer.

import { useMemo, useState } from 'react';
import type { Banc } from '../../App.js';
import { duPerimetre, equilibre, type Perimetre } from '../../equilibre.js';

export function useEquilibre(banc: Banc) {
  const [perimetre, setPerimetre] = useState<Perimetre>('toutes');
  const images = useMemo(() => duPerimetre(banc.images, perimetre), [banc.images, perimetre]);
  const e = useMemo(() => equilibre(images), [images]);
  const dansLeJeu = useMemo(() => duPerimetre(banc.images, 'jeu').length, [banc.images]);
  const rejetees = useMemo(() => banc.images.filter((m) => m.statut === 'rejetee').length, [banc.images]);
  return { perimetre, setPerimetre, e, dansLeJeu, rejetees };
}

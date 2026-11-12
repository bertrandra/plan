// Le controleur de la relecture : le seuil de score (les detections plus faibles sont masquees), ce qui reste a relire, et les gestes
// au clavier (Tab : suivant ; A : accepter et passer au suivant ; Maj+A : tout accepter au-dessus du seuil).

import { useMemo, useState } from 'react';
import type { Classe, Objet } from '../../types.js';
import { accepter, auDessusDuSeuil, estARelire, prochainARelire, sousLeSeuil } from '../../relecture.js';
import type { Marquage } from './useMarquage.js';

export function useRelecture({ marquage, classes, choisi, cibles, choisir, H }: {
  marquage: Marquage; classes: readonly Classe[]; choisi: string | null; cibles: ReadonlySet<string>; choisir: (id: string | null) => void; H: number;
}) {
  const [seuil, setSeuil] = useState(0);
  const objets = useMemo(() => marquage.objets ?? [], [marquage.objets]);
  const visibles = useMemo(() => objets.filter((o) => !sousLeSeuil(o, seuil)), [objets, seuil]);
  const aRelire = useMemo(() => visibles.filter((o) => estARelire(o, classes)).length, [visibles, classes]);
  const masques = objets.length - visibles.length;
  const aAccepter = useMemo(() => auDessusDuSeuil(visibles, seuil).length, [visibles, seuil]);

  /** Va a l'objet a relire suivant (ou precedent), et le montre seul dans la selection. */
  const aller = (sens: 1 | -1, apres: readonly Objet[] = objets, depuis: string | null = choisi) => {
    const id = prochainARelire(apres, classes, depuis, sens, seuil, H);
    choisir(id);
    return id;
  };
  /** Accepte la selection telle quelle, puis passe a l'objet a relire suivant. */
  const accepterPris = () => {
    if (!cibles.size) { aller(1); return; }
    const apres = accepter(objets, cibles);
    marquage.changer(() => apres);
    aller(1, apres, choisi);
  };
  const accepterAuDessus = () => {
    const ids = new Set(auDessusDuSeuil(visibles, seuil));
    if (ids.size) marquage.changer((l) => accepter(l, ids));
    return ids.size;
  };
  return { seuil, setSeuil, visibles, aRelire, masques, aAccepter, aller, accepterPris, accepterAuDessus };
}

export type Relecture = ReturnType<typeof useRelecture>;

// La palette des classes et des types, en pastilles plutot qu'en liste deroulante : un clic (ou son chiffre, 1 a 9) qualifie la
// selection d'un coup ; sans selection, il choisit ce que l'on trace. Les derniers employes viennent en tete.

import type { Classe } from '../../types.js';
import { choixDeCreation } from '../../classes.js';

export function PaletteTypes({ classes, actif, recents, avecSelection, onChoisir }: {
  classes: Classe[]; actif: string; recents: readonly string[]; avecSelection: boolean; onChoisir: (valeur: string) => void;
}) {
  const choix = choixDeCreation(classes);
  const couleur = (v: string) => classes.find((c) => c.id === v.split(':')[0])?.couleur ?? '#999';
  const derniers = recents.map((v) => choix.find((c) => c.valeur === v)).filter((c): c is (typeof choix)[number] => !!c);
  const pastille = (c: (typeof choix)[number], k: number | null) => (
    <button key={c.valeur + (k === null ? '-r' : '')} type="button" className={c.valeur === actif ? 'type-pastille active' : 'type-pastille'} style={{ borderColor: couleur(c.valeur) }}
      title={avecSelection ? `Donner « ${c.nom} » à la sélection` : `Tracer « ${c.nom} »`} onClick={() => onChoisir(c.valeur)}>
      <span className="pastille" style={{ background: couleur(c.valeur) }} />{c.nom}{k !== null && k < 9 && <kbd>{k + 1}</kbd>}
    </button>
  );
  return (
    // Repliable : ouverte sur un grand ecran, fermee au telephone (la liste des types y prendrait tout l'ecran).
    <details className="palette-types" open={typeof window === 'undefined' || window.innerWidth > 900}>
      <summary><h4>{avecSelection ? 'Donner à la sélection' : 'Tracer'} <small>{choix.find((c) => c.valeur === actif)?.nom ?? ''}</small></h4></summary>
      {derniers.length > 0 && <div className="pastilles recents" aria-label="Derniers employés">{derniers.map((c) => pastille(c, null))}</div>}
      <div className="pastilles">{choix.map((c, k) => pastille(c, k))}</div>
    </details>
  );
}

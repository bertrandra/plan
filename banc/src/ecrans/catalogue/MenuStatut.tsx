// Le statut d'une photo, choisi sur sa pastille dans le catalogue (demande du proprietaire, 13 novembre 2026) : un toucher ouvre la liste
// des statuts (catalogue.ts::statutsPossibles), l'actuel coche ; ceux qui demandent un marquage sont fermes a une photo qui n'en a pas.

import { useEffect, useRef, useState } from 'react';
import { statutActuel, statutsPossibles, type ChoixStatut } from '../../catalogue.js';
import type { MetaImage } from '../../types.js';
import { Icone } from '../../ui/Icones.js';

export function PastilleStatut({ m, libelle, ton, onChoisir }: { m: MetaImage; libelle: string; ton: string; onChoisir: (c: ChoixStatut) => void }) {
  const [ouvert, setOuvert] = useState(false);
  const boite = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!ouvert) return;
    const dehors = (e: PointerEvent) => { if (!boite.current?.contains(e.target as Node)) setOuvert(false); };
    const touche = (e: KeyboardEvent) => { if (e.key === 'Escape') setOuvert(false); };
    document.addEventListener('pointerdown', dehors, true);
    document.addEventListener('keydown', touche);
    return () => { document.removeEventListener('pointerdown', dehors, true); document.removeEventListener('keydown', touche); };
  }, [ouvert]);
  const actuel = statutActuel(m);
  return (
    <span ref={boite} className="pastille-statut">
      <button type="button" className={'etiquette-photo ' + ton} aria-haspopup="menu" aria-expanded={ouvert} title="Changer le statut"
        onClick={(e) => { e.stopPropagation(); setOuvert((x) => !x); }}>{libelle} <span aria-hidden="true">▾</span></button>
      {ouvert && (
        <div className="menu-objet menu-statut" role="menu" aria-label={`Statut de ${m.nom ?? m.id}`}>
          {statutsPossibles(m).map((c) => (
            <button key={c.id} type="button" role="menuitemradio" aria-checked={c.id === actuel} disabled={!c.possible} title={c.raison}
              className={(c.id === actuel ? 'coche' : '') + (c.id === 'rejetee' ? ' danger' : '')}
              onClick={(e) => { e.stopPropagation(); setOuvert(false); if (c.id !== actuel) onChoisir(c); }}>
              <span className="marque">{c.id === actuel ? <Icone nom="valider" taille={14} /> : null}</span>{c.libelle}{c.raison ? <small> · {c.raison}</small> : null}
            </button>
          ))}
        </div>
      )}
    </span>
  );
}

// L'aide du clavier (touche ?), lue dans la meme table que les raccourcis eux-memes (raccourcis.ts) : elle ne peut pas mentir.

import { useEffect } from 'react';
import { AIDE } from '../../raccourcis.js';

export function AideRaccourcis({ onFermer }: { onFermer: () => void }) {
  useEffect(() => {
    const f = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); onFermer(); } };
    document.addEventListener('keydown', f);
    return () => document.removeEventListener('keydown', f);
  }, [onFermer]);
  const groupes = [...new Set(AIDE.map((r) => r.groupe))];
  return (
    <div className="voile" role="dialog" aria-modal="true" aria-label="Raccourcis du clavier" onClick={onFermer}>
      <div className="aide-raccourcis" onClick={(e) => e.stopPropagation()}>
        <header><h2>Raccourcis du clavier</h2><button type="button" className="discret" onClick={onFermer} aria-label="Fermer">✕</button></header>
        <div className="colonnes-aide">
          {groupes.map((g) => (
            <section key={g}>
              <h3>{g}</h3>
              <dl>{AIDE.filter((r) => r.groupe === g).map((r) => <div key={r.touches}><dt><kbd>{r.touches}</kbd></dt><dd>{r.libelle}</dd></div>)}</dl>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}

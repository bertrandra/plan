// L'inspecteur, a droite de la photo, en deux onglets : « Objet » (la relecture du brouillon, l'objet ou la selection, la palette des
// types) et « Liste » (tous les objets de la photo, ranges en arbre, avec les classes a montrer ou cacher).

import { useState } from 'react';
import type { Classe, Objet } from '../../types.js';
import { PanneauObjet, PanneauSelection, ListeObjets } from './PanneauObjet.js';
import { PaletteTypes } from './PaletteTypes.js';
import type { Relecture } from './useRelecture.js';

export function Inspecteur({ objets, classes, choisi, selection, relecture, aPoser, recents, caches, pressePapiers, onChoisir, onCacher, onChanger, onSupprimer, onCopier, onCouper, onColler, onPalette }: {
  objets: Objet[]; classes: Classe[]; choisi: string | null; selection: ReadonlySet<string>; relecture: Relecture; aPoser: string; recents: readonly string[];
  caches: Set<string>; pressePapiers: { nombre: number; autrePhoto: boolean } | null;
  onChoisir: (id: string) => void; onCacher: (classe: string) => void; onChanger: (os: Objet[]) => void; onSupprimer: () => void;
  onCopier: () => void; onCouper: () => void; onColler: () => void; onPalette: (valeur: string) => void;
}) {
  const [onglet, setOnglet] = useState<'objet' | 'liste'>('objet');
  const objet = objets.find((o) => o.id === choisi) ?? null;
  const pris = objets.filter((o) => selection.has(o.id));
  return (
    // Un choix fait dans une liste rend le clavier aux raccourcis (sinon la liste garderait le focus, et Tab ou A ne feraient plus rien).
    <aside className="inspecteur" onChange={(e) => { const t = e.target as HTMLElement; if (t.tagName === 'SELECT' || (t as HTMLInputElement).type === 'checkbox') t.blur(); }}>
      <div className="onglets-inspecteur" role="tablist">
        <button type="button" role="tab" aria-selected={onglet === 'objet'} className={onglet === 'objet' ? 'actif' : ''} onClick={() => setOnglet('objet')}>{pris.length > 1 ? `Sélection (${pris.length})` : 'Objet'}</button>
        <button type="button" role="tab" aria-selected={onglet === 'liste'} className={onglet === 'liste' ? 'actif' : ''} onClick={() => setOnglet('liste')}>Liste ({objets.length})</button>
      </div>
      <div className="contenu-inspecteur">
        {onglet === 'liste' ? (
          <ListeObjets objets={objets} classes={classes} choisi={choisi} caches={caches} onChoisir={onChoisir} onCacher={onCacher} />
        ) : (
          <>
            <CarteRelecture relecture={relecture} />
            {pressePapiers && <div className="rang"><button type="button" onClick={onColler}>Coller (Ctrl+V)</button><span className="aide">{pressePapiers.nombre} objet(s){pressePapiers.autrePhoto ? ', d’une autre photo' : ''}</span></div>}
            {pris.length > 1 ? <PanneauSelection objets={pris} classes={classes} onChanger={onChanger} onSupprimer={onSupprimer} onCopier={onCopier} onCouper={onCouper} />
              : objet ? <PanneauObjet o={objet} objets={objets} classes={classes} onChanger={(o) => onChanger([o])} onSupprimer={onSupprimer} onCopier={onCopier} onCouper={onCouper} />
              : <p className="aide">Touchez un objet pour le corriger, ou Tab pour aller au premier à relire. La touche ? montre tous les raccourcis.</p>}
            <PaletteTypes classes={classes} actif={aPoser} recents={recents} avecSelection={pris.length > 0 || !!objet} onChoisir={onPalette} />
          </>
        )}
      </div>
    </aside>
  );
}

/** La relecture du brouillon : ce qui reste, le seuil de score (les plus faibles masques), et les gestes pour aller vite. */
function CarteRelecture({ relecture: r }: { relecture: Relecture }) {
  return (
    <section className="carte-relecture">
      <div className="rang">
        <strong>{r.aRelire ? `${r.aRelire} à relire` : 'Tout est relu'}</strong>
        <span className="espace" />
        <button type="button" onClick={() => r.aller(-1)} disabled={!r.aRelire} title="Précédent à relire (Maj+Tab)">◀</button>
        <button type="button" className="principal" onClick={() => r.aller(1)} disabled={!r.aRelire} title="Suivant à relire (Tab)">Suivant <kbd>Tab</kbd></button>
      </div>
      <label className="seuil">Masquer le brouillon sous <input type="range" min={0} max={0.95} step={0.05} value={r.seuil} onChange={(e) => r.setSeuil(Number(e.target.value))} /> <b>{Math.round(r.seuil * 100)} %</b>
        {r.masques > 0 && <small> ({r.masques} masqué{r.masques > 1 ? 's' : ''})</small>}</label>
      <div className="rang">
        <button type="button" className="ok" disabled={!r.aAccepter} onClick={() => r.accepterAuDessus()} title="Accepter tel quel tout le brouillon au-dessus du seuil (Maj+A)">Accepter les {r.aAccepter} au-dessus <kbd>⇧A</kbd></button>
      </div>
    </section>
  );
}

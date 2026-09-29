// Z8, les parcours en plusieurs etapes (spec-ihm-zones §4.8) : import cadastral, actualisation IGN,
// choix d'une texture. Un seul a la fois, modal, fermable par Echap ou par un clic sur le voile.
//
// Le parcours ouvert vient d'app/parcours.ts ; chacun porte sa logique a part, cette zone ne fait que
// le cadre et l'aiguillage.

import { useEffect, useSyncExternalStore } from 'react';
import { parcours } from '../app/parcours.js';
import { ImportCadastre } from './parcours/ImportCadastre.js';
import { Actualisation } from './parcours/Actualisation.js';
import { ChoixTexture } from './parcours/ChoixTexture.js';

export function Parcours() {
  const p = useSyncExternalStore(parcours.abonner, parcours.courant, parcours.courant);
  const fermer = () => parcours.fermer();
  useEffect(() => {
    if (!p) return;
    const surTouche = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); parcours.fermer(); } };
    window.addEventListener('keydown', surTouche);
    return () => window.removeEventListener('keydown', surTouche);
  }, [p]);
  if (!p) return null;
  return (
    <div className="dialogueVoile" key={parcours.numero()} onClick={(e) => { if (e.target === e.currentTarget) fermer(); }}>
      {p.type === 'cadastre' && <ImportCadastre importe={p.importe} />}
      {p.type === 'actualisation' && <Actualisation infos={p.infos} lancer={p.lancer} fermer={fermer} />}
      {p.type === 'texture' && <ChoixTexture titre={p.titre} caseLibelle={p.caseLibelle} choisir={p.choisir} fermer={fermer} />}
    </div>
  );
}

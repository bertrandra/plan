// Z8, les parcours en plusieurs etapes (spec-ihm-zones §4.8) : import cadastral, actualisation IGN,
// choix d'une texture, fiches du mode audit, audit de la parcelle et catalogue des audits recus (admin).
// Un seul a la fois, modal, fermable par Echap ou par un clic sur le voile.
//
// Le parcours ouvert vient d'app/parcours.ts ; chacun porte sa logique a part, cette zone ne fait que
// le cadre et l'aiguillage.

import { useEffect, useSyncExternalStore } from 'react';
import { parcours } from '../app/parcours.js';
import { ImportCadastre } from './parcours/ImportCadastre.js';
import { Actualisation } from './parcours/Actualisation.js';
import { ChoixTexture } from './parcours/ChoixTexture.js';
import { AuditCas } from './parcours/AuditCas.js';
import { AuditFin } from './parcours/AuditFin.js';
import { AuditParcelle } from './parcours/AuditParcelle.js';
import { AuditsParcelle } from './parcours/AuditsParcelle.js';
import type { RegistreCommandes } from '../app/commandes.js';

/** `commandes` : le registre, pour les boutons d'un parcours qui sont des commandes (« Envoyer l'audit au serveur »). */
export function Parcours({ commandes }: { commandes: RegistreCommandes }) {
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
      {p.type === 'auditCas' && <AuditCas promenade={p.promenade} cle={p.cle} retirer={p.retirer} prise={p.prise} {...(p.couleurs ? { couleurs: p.couleurs } : {})} fermer={p.retour ?? fermer} />}
      {p.type === 'auditFin' && <AuditFin promenade={p.promenade} modifier={p.modifier} retirer={p.retirer} partager={p.partager} fermer={fermer} />}
      {p.type === 'auditParcelle' && <AuditParcelle session={p.session} commandes={commandes} fermer={fermer} {...(p.retour ? { retour: p.retour } : {})} />}
      {p.type === 'auditsParcelle' && <AuditsParcelle catalogue={p.catalogue} fermer={fermer} />}
    </div>
  );
}

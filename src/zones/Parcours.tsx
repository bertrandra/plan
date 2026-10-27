// Z8, les parcours en plusieurs etapes (spec-ihm-zones §4.8) : import cadastral, actualisation IGN,
// choix d'une texture, fiches du mode audit, audit de la parcelle, catalogue des audits recus (admin)
// et declaration prealable.
// Un seul a la fois, modal, fermable par Echap ou par un clic sur le voile.
//
// Le parcours ouvert vient d'app/parcours.ts ; chacun porte sa logique a part, cette zone ne fait que
// le cadre et l'aiguillage.

import { lazy, Suspense, useEffect, useSyncExternalStore } from 'react';
import { parcours } from '../app/parcours.js';
import { ImportCadastre } from './parcours/ImportCadastre.js';
import { Actualisation } from './parcours/Actualisation.js';
import { ChoixTexture } from './parcours/ChoixTexture.js';
import { Declaration } from './parcours/Declaration.js';

// Les ecrans de l'audit ne se chargent qu'a leur ouverture (26 octobre 2026, AD-10) : seul l'audit les montre, et ils tirent avec
// eux l'analyse des facades. Le temps de les recevoir, le voile est deja pose ; rien d'autre ne s'affiche.
const AuditCas = lazy(() => import('./parcours/AuditCas.js').then((m) => ({ default: m.AuditCas })));
const AuditFin = lazy(() => import('./parcours/AuditFin.js').then((m) => ({ default: m.AuditFin })));
const AuditParcelle = lazy(() => import('./parcours/AuditParcelle.js').then((m) => ({ default: m.AuditParcelle })));
const AuditsParcelle = lazy(() => import('./parcours/AuditsParcelle.js').then((m) => ({ default: m.AuditsParcelle })));
import type { RegistreCommandes } from '../app/commandes.js';
import type { Magasin } from '../app/magasin.js';

/**
 * `commandes` : le registre, pour les boutons d'un parcours qui sont des commandes (« Envoyer l'audit au serveur ») ;
 * `magasin` : la classe d'ecran, pour la forme tactile des champs d'un parcours (la declaration prealable).
 */
export function Parcours({ commandes, magasin }: { commandes: RegistreCommandes; magasin: Magasin }) {
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
      {p.type === 'declaration' && <Declaration inspecteur={p.service} magasin={magasin} fermer={fermer} />}
      <Suspense fallback={null}>
      {p.type === 'auditCas' && <AuditCas promenade={p.promenade} cle={p.cle} retirer={p.retirer} prise={p.prise} {...(p.couleurs ? { couleurs: p.couleurs } : {})} fermer={p.retour ?? fermer} />}
      {p.type === 'auditFin' && <AuditFin promenade={p.promenade} modifier={p.modifier} retirer={p.retirer} partager={p.partager} fermer={fermer} />}
      {p.type === 'auditParcelle' && <AuditParcelle session={p.session} commandes={commandes} fermer={fermer} {...(p.retour ? { retour: p.retour } : {})} />}
      {p.type === 'auditsParcelle' && <AuditsParcelle catalogue={p.catalogue} fermer={fermer} />}
      </Suspense>
    </div>
  );
}

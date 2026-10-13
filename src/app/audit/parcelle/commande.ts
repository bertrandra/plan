// La commande « Auditer la parcelle… » (MD/spec-audit.md §11) : dans un projet, groupe `audit`, droit
// d'ecrire le projet (grisee avec sa raison en lecture seule), et une parcelle cadastrale (grisee
// sinon : « Importez d'abord la parcelle depuis son adresse. »).
//
// Elle ouvre la session de la parcelle (app/audit/parcelle/controleur.ts), une par parcelle tant que
// la page vit : refermer l'ecran ne perd rien, rouvrir la commande y revient. Les capteurs ne
// tournent que pendant que l'ecran est ouvert.

import { PERMISSION_ECRITURE } from '../../acces.js';
import { parcours } from '../../parcours.js';
import { parcelleDuProjet } from '../../../model/fonctions.js';
import { creerSessionAuditParcelle, type ContexteAuditParcelle, type SessionAuditParcelle } from './controleur.js';
import type { RegistreCommandes } from '../../commandes.js';
import type { ObjetPlan } from '../../../model/types.js';

export const RAISON_SANS_PARCELLE = 'Importez d’abord la parcelle depuis son adresse.';

/**
 * L'identifiant de la parcelle cadastrale du projet : son IDU, sinon son point de calage. Null pour
 * un plan dessine a la main, que rien ne situe : ni le GPS ni le brouillon n'auraient de repere.
 */
export function parcelleCadastrale(objets: readonly ObjetPlan[]): string | null {
  const cad = parcelleDuProjet(objets as ObjetPlan[])?.cadastre as { idu?: unknown; origineLat?: unknown; origineLon?: unknown } | null | undefined;
  if (typeof cad?.origineLat !== 'number' || typeof cad.origineLon !== 'number') return null;
  return typeof cad.idu === 'string' && cad.idu ? cad.idu : cad.origineLat.toFixed(6) + ',' + cad.origineLon.toFixed(6);
}

export type AtelierAuditParcelle = Omit<ContexteAuditParcelle, 'idu'>;

export function brancherAuditParcelle(a: AtelierAuditParcelle, cmd: RegistreCommandes): { session: () => SessionAuditParcelle | null } {
  let session: SessionAuditParcelle | null = null;
  let iduSession: string | null = null;

  // L'ecran ferme (Echap, Fermer, un autre parcours) : les capteurs s'arretent et le brouillon s'ecrit.
  parcours.abonner(() => {
    const p = parcours.courant();
    if (session && !(p?.type === 'auditParcelle' && p.session === session)) { session.suspendre(); void session.ecrireBrouillon(); }
  });
  // L'ecran qui se verrouille, l'onglet mis en arriere-plan : le brouillon s'ecrit sans attendre.
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') void session?.ecrireBrouillon(); });
    window.addEventListener('pagehide', () => { void session?.ecrireBrouillon(); });
  }

  cmd.declarer({
    id: 'audit.parcelle',
    libelle: 'Auditer la parcelle…',
    groupe: 'audit',
    permission: PERMISSION_ECRITURE,
    actif: () => parcelleCadastrale(a.etat.objects) !== null,
    raisonInactive: () => (parcelleCadastrale(a.etat.objects) === null ? RAISON_SANS_PARCELLE : null),
    executer: () => {
      const idu = parcelleCadastrale(a.etat.objects);
      if (!idu) return;
      // Une autre parcelle (un autre projet ouvert) : une autre session.
      if (!session || iduSession !== idu) { session?.suspendre(); session = creerSessionAuditParcelle({ ...a, idu }); iduSession = idu; }
      const s = session;
      // Dans le geste meme : la reprise du brouillon attend, Safari refuserait ensuite la boussole.
      s.autoriserBoussole();
      void s.proposerReprise(() => {
        s.reprendre();
        // On revient toujours sur la liste : c'est elle qui dit ce qui reste.
        s.montrer('liste');
        parcours.ouvrir({ type: 'auditParcelle', session: s });
      });
    },
  });
  return { session: () => session };
}

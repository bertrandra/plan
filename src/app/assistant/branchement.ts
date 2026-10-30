// L'assistant branche sur Plan en marche (lot L6) : ses trois commandes, et ce que le service lit et fait.
//
//   - `assistant.demander` (menu Aide, feuille du projet au doigt) ouvre le dialogue de l'assistant (Z8, zones/parcours/Assistant.tsx) ;
//   - `assistant.envoyer` envoie la demande et le catalogue ; grisee, avec sa raison, hors plateforme et hors admin ;
//   - `assistant.appliquer` execute la liste, en une etape d'historique ; grisee tant qu'aucune etape ne s'applique, et sans le droit
//     d'ecrire le projet (question 24).
//
// Le catalogue se lit dans le registre, la carte d'exposition et l'inspecteur tels qu'ils sont a l'instant ; une etape s'execute par
// le registre (`commandes.executer`) ou par le service de l'inspecteur (`inspecteur.appliquer`) : l'assistant n'ecrit rien lui-meme.

import { enAdmin, PERMISSION_ECRITURE, sessionCourante } from '../acces.js';
import { creerClientAnalyse } from '../../io/analyseClaude.js';
import { parcelleDuProjet } from '../../model/fonctions.js';
import { showToast } from '../../shell/dialogs.js';
import { parcours } from '../parcours.js';
import { libelleTypeObjet } from '../assemblage/gestes.js';
import { champsDuCatalogue, type SourceCatalogue } from './catalogue.js';
import { creerServiceAssistant, type ServiceAssistant } from './service.js';
import type { ValeurChamp } from './etapes.js';
import type { RegistreCommandes } from '../commandes.js';
import type { Inspecteur } from '../inspecteur.js';
import type { Magasin } from '../magasin.js';
import type { EtatApp } from '../../core/state.js';

export interface ContexteBranchementAssistant {
  etat: EtatApp;
  magasin: Magasin;
  commandes: RegistreCommandes;
  inspecteur: Inspecteur;
  transaction: (f: () => boolean) => boolean;
}

/** Le champ d'un objet que l'assistant peut ecrire, et son contexte ; null s'il ne l'est pas (ou plus). */
function champDe(ctx: ContexteBranchementAssistant, objet: string, cle: string) {
  const obj = ctx.etat.objects.find((o) => o.key === objet);
  if (!obj) return null;
  const c = ctx.inspecteur.contexte(obj);
  const ch = champsDuCatalogue(c, ctx.inspecteur.sections(c)).find((x) => x.cle === cle);
  return ch ? { c, ch } : null;
}

export function brancherAssistant(ctx: ContexteBranchementAssistant): ServiceAssistant {
  const { etat, magasin, commandes, inspecteur } = ctx;
  const jeton = () => sessionCourante()?.jeton()?.valeur ?? null;
  const client = creerClientAnalyse((entree, init) => fetch(entree, init), jeton);
  const source = (): SourceCatalogue => ({
    classe: magasin.store.getState().classe, lectureSeule: !!etat.lectureSeule,
    commandes: commandes.lister(), etat: (id) => commandes.etat(id),
    objets: etat.objects, selection: etat.objects.find((o) => o.key === etat.selectedKey),
    contexte: (o) => inspecteur.contexte(o), sections: (c) => inspecteur.sections(c), libelleType: libelleTypeObjet
  });
  const service = creerServiceAssistant({
    client: () => (enAdmin() || jeton() ? client : null),
    identite: () => {
      const cad = (parcelleDuProjet(etat.objects)?.cadastre ?? null) as { idu?: unknown; adresse?: unknown } | null;
      return { projet: magasin.store.getState().projet.courant?.id ?? null, idu: typeof cad?.idu === 'string' ? cad.idu : null, adresse: typeof cad?.adresse === 'string' ? cad.adresse.slice(0, 300) : null };
    },
    source,
    application: {
      lectureSeule: () => !!etat.lectureSeule,
      etat: (id) => commandes.etat(id),
      executer: (id) => commandes.executer(id),
      lireChamp: (objet, cle) => {
        const x = champDe(ctx, objet, cle);
        if (!x) return undefined;
        const d = x.ch.descripteur;
        return d.type === 'texte' || d.type === 'nombre' || d.type === 'case' || d.type === 'choix' || d.type === 'couleur' || d.type === 'curseur' ? d.lire(x.c) as ValeurChamp : undefined;
      },
      ecrireChamp: (objet, cle, valeur) => {
        const x = champDe(ctx, objet, cle);
        if (!x || !x.ch.actif) return false;
        const d = x.ch.descripteur;
        const ecrire = (): void | boolean => {
          switch (d.type) {
            case 'nombre': case 'curseur': return typeof valeur === 'number' ? d.ecrire(x.c, valeur) : false;
            case 'case': return typeof valeur === 'boolean' ? d.ecrire(x.c, valeur) : false;
            case 'texte': case 'choix': case 'couleur': return typeof valeur === 'string' ? d.ecrire(x.c, valeur) : false;
            default: return false;
          }
        };
        return inspecteur.appliquer(d, x.c, ecrire);
      },
      transaction: ctx.transaction
    }
  });
  // Les boutons suivent le service (statut, liste, demande vide ou non) par le magasin ; une frappe qui ne change rien de cela ne
  // redessine pas les zones (le dialogue suit sa saisie par le service lui-meme).
  let vu = '';
  service.abonner(() => {
    const e = service.etat(), k = [e.statut, !e.demande.trim(), e.erreur, e.reponse ? 1 : 0].join('|');
    if (k !== vu) { vu = k; magasin.notifier(); }
  });

  declarerCommandesAssistant(commandes, service);
  return service;
}

/** Les trois commandes de l'assistant, sur ce service (le dialogue les lit par le registre, comme tout bouton). */
export function declarerCommandesAssistant(commandes: RegistreCommandes, service: ServiceAssistant): void {
  commandes.declarer({
    id: 'assistant.demander', libelle: 'Demander à l’assistant…', groupe: 'assistant',
    description: 'Écrire une demande en français : Claude la traduit en une liste d’étapes de Plan, que vous validez d’un geste',
    executer: () => parcours.ouvrir({ type: 'assistant', service, commandes })
  });
  commandes.declarer({
    id: 'assistant.envoyer', libelle: 'Envoyer la demande', groupe: 'assistant',
    description: 'Envoie la demande et le catalogue de Plan à Claude (un appel facturé de quelques millièmes de dollar)',
    actif: () => service.envoiPossible().ok,
    raisonInactive: () => { const p = service.envoiPossible(); return p.ok ? null : p.raison; },
    executer: () => { void service.envoyer(); }
  });
  commandes.declarer({
    // Le droit d'ecrire le projet (decision du proprietaire du 30 octobre 2026, question 24 de la spec) : un compte en lecture seule
    // n'applique rien, pas meme les preferences d'affichage d'une liste ; le registre grise la commande avec sa raison, et le
    // classement des ecritures (Admin > Controleurs) la range parmi les ecritures gardees.
    id: 'assistant.appliquer', libelle: 'Appliquer la liste', groupe: 'assistant', permission: PERMISSION_ECRITURE,
    description: 'Exécute les étapes utilisables de la liste, en une seule étape d’annulation (Ctrl+Z la défait d’un coup)',
    actif: () => service.etat().statut === 'liste' && service.etapes().some((e) => !e.refus),
    raisonInactive: () => (service.etat().statut === 'liste' ? 'Aucune étape de la liste ne s’applique : chacune dit sa raison.' : null),
    executer: () => {
      const projet = service.etapes().some((e) => !e.refus && e.ecrit === 'projet');
      const r = service.appliquer();
      if (!r.ok) return;
      parcours.fermer();
      showToast('Liste appliquée : ' + r.faites + ' étape' + (r.faites > 1 ? 's' : '') + (r.ignorees ? ' (' + r.ignorees + ' grisée' + (r.ignorees > 1 ? 's' : '') + ', laissée' + (r.ignorees > 1 ? 's' : '') + ')' : '') + '.'
        + (projet ? ' Ctrl+Z la défait d’un coup.' : ''));
    }
  });
}

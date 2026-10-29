// Les commandes de l'audit de la parcelle (MD/spec-audit.md §11, §15) : dans un projet, groupe
// `audit`, droit d'ecrire le projet (grisees avec leur raison en lecture seule), et une parcelle
// cadastrale (grisees sinon : « Importez d'abord la parcelle depuis son adresse. »).
//
// - « Auditer la parcelle… » ouvre la session de la parcelle (app/audit/parcelle/controleur.ts), une
//   par parcelle tant que la page vit : refermer l'ecran ne perd rien, rouvrir la commande y revient.
//   Les capteurs ne tournent que pendant que l'ecran est ouvert.
// - « Importer un audit de parcelle… » (§15) reprend un fichier `plan-audit-parcelle` de la meme
//   parcelle (meme IDU) a la phase 3, sur ses propositions : un audit fait par l'administrateur pour
//   un client. Rien n'entre dans le projet avant « Valider » ; Ctrl+Z le defait alors en un pas.
//   Un fichier dont la capture n'etait pas terminee (une sauvegarde) reprend sur la liste de controle.
// - « Envoyer l'audit au serveur » (§15) : la sauvegarde sur le serveur de Plan, tout de suite ; elle
//   part aussi d'elle-meme apres les photos (sauvegarde.ts). Elle n'ecrit rien dans le projet.
// - Admin › « Audits » (§15, 15.4, 15.5) : le catalogue des audits recus (catalogue.ts), parcelles et
//   promenades, admin des demos seulement, comme la Conformite ; « Ouvrir dans ce projet » passe par
//   le meme import ; « Rejouer l'analyse » renvoie l'analyse d'un audit stocke avec le modele choisi.

import { PERMISSION_ECRITURE, enAdmin } from '../../acces.js';
import { parcours } from '../../parcours.js';
import type { ContexteAuditParcelle, SessionAuditParcelle } from './controleur.js';
import type { FichierAuditParcelle } from '../../../model/fichierAuditParcelle.js';
import { brancherDoigtAudit } from '../doigt.js';
import type { CatalogueAudits } from './catalogue.js';
import { autoriserBoussole } from '../../../shell/boussole.js';
import { creerClientAnalysesAudits } from '../../../io/analysesAudits.js';
import { telechargerTexte } from '../../../shell/download.js';
import { abonnerSceneBatie, hotes3d } from '../../../three/etat3d.js';
import type { RegistreCommandes } from '../../commandes.js';
import type { FicheAudit } from '../../../io/auditsServeur.js';
import { ETAPES_FACADE } from '../../../model/etapeFacade.js';

export const RAISON_SANS_PARCELLE = 'Importez d’abord la parcelle depuis son adresse.';
/** Dix facades a trois photos font environ 14 Mo (§15) : au-dela de ceci, ce n'est pas un audit. */
export const IMPORT_AUDIT_TAILLE_MAX = 64 * 1024 * 1024;

export { parcelleCadastrale } from './parcelleCadastrale.js';
import { parcelleCadastrale } from './parcelleCadastrale.js';

export type AtelierAuditParcelle = Omit<ContexteAuditParcelle, 'idu'> & {
  /** Demande un fichier au poste et rend son texte ; par defaut, le selecteur du navigateur. */
  choisirFichier?: (surTexte: (texte: string) => void) => void;
};

/** Le selecteur du navigateur : un input neuf a chaque fois, pour que rechoisir le meme fichier le relise. */
function choisirFichierNavigateur(signaler: (m: string) => void): (surTexte: (texte: string) => void) => void {
  return (surTexte) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.addEventListener('change', () => {
      const f = input.files?.[0];
      if (!f) return;
      if (f.size > IMPORT_AUDIT_TAILLE_MAX) { signaler('Ce fichier est trop gros pour un audit de parcelle (64 Mo au plus).'); return; }
      const lecteur = new FileReader();
      lecteur.onload = () => surTexte(String(lecteur.result ?? ''));
      lecteur.onerror = () => signaler('Le fichier n’a pas pu être lu.');
      lecteur.readAsText(f);
    });
    input.click();
  };
}

/**
 * La session, la lecture d'un fichier, le catalogue et le rejeu : charges au premier geste qui en a besoin (moteur.ts, AD-10),
 * une fois pour toutes. Les commandes, elles, sont declarees des le demarrage.
 */
let chargement: Promise<typeof import('./moteur.js')> | null = null;
const moteur = (): Promise<typeof import('./moteur.js')> => (chargement ??= import('./moteur.js'));

const pluriel = (n: number, mot: string) => n + ' ' + mot + (n > 1 ? 's' : '');
/** Les photos de facade d'un fichier d'audit : celles que les mesures reprennent. */
const photosFacades = (f: FichierAuditParcelle): number => f.batiments.reduce((n, b) => n + b.facades.reduce((m, x) => m + x.photos.length, 0), 0);

/** Ce que le catalogue admin demande a la session de la parcelle : reprendre un fichier, ou le consulter. */
interface ActionsCatalogue {
  importer: (texte: string, fiche: FicheAudit, remesurer?: boolean) => void;
  consulter: (texte: string, catalogue: CatalogueAudits) => void;
}

function declarerAuditsAdmin(a: AtelierAuditParcelle, cmd: RegistreCommandes, actions: ActionsCatalogue): void {
  // Admin › « Audits » : le catalogue, ouvert sur le projet en cours. Les analyses gardees se lisent
  // par la session admin (cookie) ; le rejeu passe par le client de l'analyse, sous ses plafonds.
  const analysesAudits = creerClientAnalysesAudits((entree, init) => fetch(entree, init));
  cmd.declarer({
    id: 'admin.auditsParcelle',
    libelle: 'Audits',
    description: 'Les audits reçus sur le serveur, de parcelle et de promenade : leurs données, leur conclusion et ce qui en a été fait, leurs analyses par Claude et leurs rejeux par modèle ; les ouvrir dans ce projet, les télécharger, les retirer (administrateur seulement)',
    groupe: 'admin',
    actif: () => enAdmin(),
    executer: () => { void moteur().then(({ creerCatalogue, preparerRejeu, fabriqueImagesNavigateur }) => {
      const catalogue: CatalogueAudits = creerCatalogue({
        client: () => a.audits?.() ?? null,
        iduProjet: () => parcelleCadastrale(a.etat.objects),
        refusEcriture: () => { const e = cmd.etat('audit.importerParcelle'); return e.utilisable ? null : 'message' in e ? e.message : 'Ce projet ne peut pas recevoir d’audit.'; },
        ouvrir: (texte, fiche, remesurer) => actions.importer(texte, fiche, remesurer),
        consulter: (texte) => actions.consulter(texte, catalogue),
        telecharger: (nom, texte, type) => telechargerTexte(nom, texte, type ?? 'application/json'),
        signaler: a.signaler,
        choisirFichier: a.choisirFichier ?? choisirFichierNavigateur(a.signaler),
        rejeu: {
          analyses: () => (enAdmin() ? analysesAudits : null),
          analyse: () => (enAdmin() ? a.analyse?.client ?? null : null),
          preparer: (texte, fiche, modele) => preparerRejeu({
            texte, depot: fiche.id, modele, objets: a.etat.objects, iduProjet: parcelleCadastrale(a.etat.objects), projet: a.analyse?.identite?.().projet ?? null,
          }, a.analyse?.images ?? fabriqueImagesNavigateur()),
        },
      });
      parcours.ouvrir({ type: 'auditsParcelle', catalogue });
      void catalogue.relire();
    }); },
  });
}

/**
 * Le doigt sur la Vue 3D pendant la prise (vuePrise.ts) : toucher une facade la choisit, faire tourner la vue suspend un moment le
 * suivi. Pose une fois sur l'hote de la scene, qui survit aux reconstructions ; hors de l'ecran de prise, la session ne fait rien de
 * ces gestes. Chaque scene batie est annoncee a la session et a la consultation.
 */
function brancherLeDoigt(session: () => SessionAuditParcelle | null, consultation: () => SessionAuditParcelle | null): void {
  let hote: HTMLElement | null = null;
  const brancherHote = () => {
    if (hote || !hotes3d.vue3d) return;
    hote = hotes3d.vue3d;
    brancherDoigtAudit({
      tapoter: (ndc) => session()?.toucher(ndc), appuiLong: (ndc) => session()?.toucher(ndc), lacherSuivi: () => session()?.lacherVue(),
    }, hote);
  };
  abonnerSceneBatie(() => { brancherHote(); session()?.sceneBatie(); consultation()?.sceneBatie(); });
}

export function brancherAuditParcelle(a: AtelierAuditParcelle, cmd: RegistreCommandes): { session: () => SessionAuditParcelle | null } {
  let session: SessionAuditParcelle | null = null;
  let iduSession: string | null = null;
  /** La consultation d'un audit recu (Admin › Audits) : une session a part, en lecture seule, jetee a sa fermeture. */
  let consultation: SessionAuditParcelle | null = null;

  // L'ecran ferme (Echap, Fermer, un autre parcours) : les capteurs s'arretent et le brouillon s'ecrit.
  parcours.abonner(() => {
    const p = parcours.courant();
    if (session && !(p?.type === 'auditParcelle' && p.session === session)) { session.suspendre(); void session.ecrireBrouillon(); }
    // La consultation ne garde rien : fermee, ou remplacee par un autre ecran, la Vue 3D revient au plan.
    if (consultation && !(p?.type === 'auditParcelle' && p.session === consultation)) { consultation.suspendre(); consultation = null; }
  });
  // L'ecran qui se verrouille, l'onglet mis en arriere-plan : le brouillon s'ecrit sans attendre.
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') void session?.ecrireBrouillon(); });
    window.addEventListener('pagehide', () => { void session?.ecrireBrouillon(); });
  }

  brancherLeDoigt(() => session, () => consultation);

  /** La session de cette parcelle ; une autre parcelle (un autre projet ouvert) en ouvre une autre. */
  async function sessionDe(idu: string): Promise<SessionAuditParcelle> {
    const { creerSessionAuditParcelle } = await moteur();
    if (!session || iduSession !== idu) { session?.suspendre(); session = creerSessionAuditParcelle({ ...a, idu }); iduSession = idu; }
    return session;
  }

  const condition = {
    groupe: 'audit',
    permission: PERMISSION_ECRITURE,
    actif: () => parcelleCadastrale(a.etat.objects) !== null,
    raisonInactive: () => (parcelleCadastrale(a.etat.objects) === null ? RAISON_SANS_PARCELLE : null),
  } as const;

  cmd.declarer({
    id: 'audit.parcelle',
    libelle: 'Auditer la parcelle…',
    ...condition,
    executer: () => {
      const idu = parcelleCadastrale(a.etat.objects);
      if (!idu) return;
      // Dans le geste meme, avant de charger la session : Safari refuserait ensuite la boussole. Une fois accordee, la page la garde,
      // et la session la redemande sans rien montrer.
      void (a.boussole?.autoriser ?? autoriserBoussole)().catch(() => false);
      void sessionDe(idu).then((s) => {
        s.autoriserBoussole();
        return s.proposerReprise(() => {
          s.reprendre();
          // On revient toujours sur la liste : c'est elle qui dit ce qui reste.
          s.montrer('liste');
          parcours.ouvrir({ type: 'auditParcelle', session: s });
        });
      });
    },
  });

  /**
   * Le texte d'un fichier (choisi sur le poste, ou ouvert depuis le catalogue) : refuse avec sa
   * raison, ou repris la ou il en etait, a la phase 3 ou sur la liste de controle. Depuis le
   * catalogue, une sauvegarde rouverte reste la meme : les envois suivants la remplacent.
   */
  async function importer(texte: string, depot?: FicheAudit, remesurer = false): Promise<void> {
    const idu = parcelleCadastrale(a.etat.objects);
    const { preparerImport } = await moteur();
    const r = preparerImport(texte, a.etat.objects, idu);
    if ('refus' in r) { a.signaler('Import refusé : ' + r.refus); return; }
    if (!idu) return;
    const s = await sessionDe(idu);
    const enCapture = !r.fichier.finCapture;
    const absents = r.batimentsAbsents ? ' ; ' + pluriel(r.batimentsAbsents, 'bâtiment') + ' du fichier absent' + (r.batimentsAbsents > 1 ? 's' : '') + ' de ce projet' : '';
    // La question du remplacement (Z8) ne doit pas s'ouvrir sous le catalogue.
    if (parcours.courant()?.type === 'auditsParcelle') parcours.fermer();
    const sauvegarde = depot?.marque === 'sauvegarde' ? { id: depot.id, retrait: '', t: depot.recuLe } : undefined;
    void s.importer(r.fichier, () => {
      s.montrer(enCapture ? 'liste' : 'propositions');
      if (remesurer && !enCapture) { a.signaler('Photos de l’audit remises à l’analyse des façades : ' + pluriel(photosFacades(r.fichier), 'photo') + '. Les mesures se refont, puis les façades se relèvent.'); return; }
      parcours.ouvrir({ type: 'auditParcelle', session: s });
      if (enCapture) {
        const photos = r.fichier.batiments.reduce((n, b) => n + b.photos.length + b.facades.reduce((m, f) => m + f.photos.length, 0), 0) + r.fichier.cloture.photos.length + r.fichier.portail.photos.length;
        a.signaler('Audit de la parcelle repris en capture' + (photos ? ' : ' + pluriel(photos, 'photo') : '') + absents + '. Complétez la liste, puis « Lancer l’analyse ».');
        return;
      }
      const validees = r.fichier.propositions.filter((p) => p.decision === 'validee').length;
      a.signaler('Audit de la parcelle importé' + (validees ? ' : ' + pluriel(validees, 'proposition') + ' validée' + (validees > 1 ? 's' : '') + ' dans le fichier' : '')
        + absents + '. Vérifiez les cases, puis « Valider ».');
    }, sauvegarde, remesurer);
  }

  /**
   * L'avant et l'apres d'un audit recu, sur l'ecran des propositions de l'audit (une seule source) :
   * une session a part, sans capteurs, brouillon ni partage, dont les propositions et les decisions
   * sont celles du fichier. L'audit en cours de l'administrateur n'est pas touche.
   */
  async function consulter(texte: string, catalogue: CatalogueAudits): Promise<void> {
    const idu = parcelleCadastrale(a.etat.objects);
    const { preparerImport, creerSessionAuditParcelle } = await moteur();
    const r = preparerImport(texte, a.etat.objects, idu);
    if ('refus' in r) { a.signaler('Consultation refusée : ' + r.refus); return; }
    if (!idu) return;
    // Un autre ecran du meme parcours : la session de l'audit en cours se suspend, comme a toute fermeture.
    consultation?.suspendre();
    // Sans analyse par Claude ni envoi : elle ne fait que montrer.
    const base: AtelierAuditParcelle = { ...a, stockage: null, audits: () => null, admin: () => false };
    delete base.analyse;
    const s = creerSessionAuditParcelle({ ...base, idu });
    consultation = s;
    s.consulter(r.fichier, () => {
      s.montrer('propositions');
      parcours.ouvrir({ type: 'auditParcelle', session: s, retour: () => parcours.ouvrir({ type: 'auditsParcelle', catalogue }) });
    });
  }

  cmd.declarer({
    id: 'audit.importerParcelle',
    libelle: 'Importer un audit de parcelle…',
    description: 'Reprend le fichier d’un audit de cette parcelle (même IDU), fait sur un autre appareil, à l’étape des propositions',
    ...condition,
    executer: () => (a.choisirFichier ?? choisirFichierNavigateur(a.signaler))((texte) => { void importer(texte); }),
  });

  // « Envoyer l'audit au serveur » : la ligne de la liste de controle ; elle n'existe que si quelqu'un
  // peut envoyer (session admin ou jeton de la plateforme). Rien n'ecrit dans le projet.
  const etatEnvoi = () => session?.sauvegarde.etat() ?? null;
  cmd.declarer({
    id: 'audit.envoyerParcelle',
    libelle: 'Envoyer l’audit au serveur',
    description: 'Met l’audit de la parcelle à l’abri sur le serveur de Plan, photos comprises, pour le reprendre ailleurs ; il part aussi de lui-même après chaque photo',
    groupe: 'audit',
    actif: () => { const e = etatEnvoi(); return !!e?.disponible && e.etat !== 'envoi'; },
    raisonInactive: () => {
      const e = etatEnvoi();
      if (!e) return null;
      if (!e.disponible) return 'Connectez-vous à la plateforme pour envoyer l’audit au serveur de Plan.';
      return e.etat === 'envoi' ? 'Un envoi est en cours.' : null;
    },
    executer: () => { void session?.sauvegarde.envoyer(); },
  });

  // Un segment de la barre de progression d'une facade (zones/parcours/FacadeAudit.tsx, MD/spec-facade-calage-audit.md §4 ter.5) :
  // l'etape vient de `data-etape` du bouton, la facade de `data-facade` de la barre qui le porte. L'audit n'ouvre que ses points de
  // validation et ce qui doute ; toucher de nouveau l'etape ouverte la referme. Rien n'ecrit dans le projet.
  cmd.declarer({
    id: 'facade.etape',
    libelle: 'Ouvrir une étape de la façade',
    groupe: 'facade',
    executer: (source) => {
      const c = parcours.courant();
      const etape = ETAPES_FACADE.find((e) => e.id === source?.dataset.etape)?.id;
      const facade = source?.closest<HTMLElement>('[data-facade]')?.dataset.facade;
      if (c?.type !== 'auditParcelle' || !etape || !facade) return;
      const deja = c.session.etapeOuverte();
      c.session.ouvrirEtape(facade, deja?.facade === facade && deja.etape === etape ? null : etape);
    },
  });

  declarerAuditsAdmin(a, cmd, { importer, consulter });
  return { session: () => session };
}

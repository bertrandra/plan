// L'audit de la parcelle du projet, phase 1 : la capture (MD/spec-audit.md §11, §12).
//
// Une session par parcelle tant que la page vit : la liste de controle (Z8 plein ecran) et l'ecran
// de prise, pose sur la Vue 3D. Pendant la prise, le GPS et la boussole reconnaissent la facade que
// vous avez devant vous (facade/calage/priseDeVue.ts, lot L2) parmi celles de la liste ; elle passe en rouge
// en 3D (three/facadeDevant3d.ts) et elle est nommee, et la photo prise (app/audit/photo.ts, lot L1)
// s'y range d'elle-meme. « Ce n'est pas cette façade » propose la suivante ; la facade se choisit aussi
// en la touchant dans la 3D, ou dans la liste. La Vue 3D est alors a hauteur d'homme et suit votre
// position et votre cap (vuePrise.ts) ; tant que rien n'est vise depuis votre position, elle montre
// tout le batiment en grand angle, pour le choix au doigt. Pendant tout l'audit, elle ne montre que
// le batiment audite et le sol (vue epuree : ni arbres, ni voisins, ni clotures).
//
// L'en-cours vit dans le brouillon local (io/brouillonAudit.ts, lot L4) : rien n'entre dans le
// projet a cette phase. « Lancer l'analyse » termine la capture ; l'analyse (§13) la reprendra.

import { partageDe } from '../../../model/auditParcelle.js';
import { creerCapture, type CaptureEnCours } from './capture.js';
import { listeDeControle, type ListeDeControle } from './liste.js';
import type { Validation } from './validation.js';
import { creerCorpus, type Corpus } from './corpus.js';
import { creerSauvegarde, signaturePhotos, type Sauvegarde } from './sauvegarde.js';
import { captureDuFichier, derniereDecision, mesuresDuFichier } from '../../../model/fichierAuditParcelle.js';
import type { AnalyseClaude } from './analyseClaude.js';
import type { ContexteAuditParcelle, EcranAudit, SessionAuditParcelle } from './typesSession.js';
import { capteurs, priseDe } from './capteursPrise.js';
import { brouillonDe } from './brouillonCapture.js';
import { validationDe, analyseDe, fichierDe, fusionAPriseDe } from './etapesSession.js';
import { viseeDe } from './viseeFacade.js';
import { vueDe } from './vueAudit.js';
export type { ContexteAuditParcelle, EcranAudit, EtatPosition, CibleFacade, SessionAuditParcelle } from './typesSession.js';
export { questionRemplacement } from './brouillonCapture.js';
export { MESSAGES_GPS_PARCELLE, textePlanDePrise, questionRepriseParcelle } from './textesSession.js';
import { pluriel } from './textesSession.js';
import type { PtBrut } from '../../../model/types.js';
import { parcelleCadastrale } from './parcelleCadastrale.js';
import { estBatiment } from '../../../model/fonctions.js';
export { DELAI_ENSEMBLE_MS, type EcranVue } from './vueAudit.js';

/**
 * Les facades notees suivent leur mur : le plan a pu changer pendant que l'ecran etait ferme (un sommet ajoute ou retire, une
 * annulation). Releve aussi le contour des facades notees pendant la visite, a la fermeture de l'ecran (model/cotesAudit.ts).
 * Rend vrai si la capture a change.
 */
function facadesSurLesMurs(ctx: ContexteAuditParcelle, capture: CaptureEnCours): boolean {
  // Un autre projet ouvert (une autre parcelle) n'a pas les murs de cette capture.
  if (parcelleCadastrale(ctx.etat.objects) !== ctx.idu) return false;
  const contours = new Map<string, PtBrut[]>();
  for (const o of ctx.etat.objects) if (estBatiment(o) && 'pts' in o && Array.isArray(o.pts)) contours.set(o.key, o.pts);
  return capture.suivreLesContours(contours);
}

export function creerSessionAuditParcelle(ctx: ContexteAuditParcelle): SessionAuditParcelle {
  const maintenant = ctx.maintenant ?? (() => new Date());
  const capture = creerCapture(ctx.idu, maintenant);
  const abonnes = new Set<() => void>();
  // Sur l'ecran des propositions, tout changement (mesures, reponses de Claude, cases) peut changer
  // l'apercu de la Vue 3D : il s'y repose, s'il a change, avant que l'ecran ne se redessine.
  const publier = () => { if (ecran === 'propositions') validation.synchroniser(); abonnes.forEach((f) => f()); };
  let ecran: EcranAudit = 'liste';
  let dernier: string | null = null;
  const fusionAPrise = fusionAPriseDe(() => validation, () => publier());
  /** La liste ne se recalcule que si la capture ou les objets du plan ont change. */
  let memo: { version: number; objets: unknown; liste: ListeDeControle } | null = null;
  const liste = (): ListeDeControle => {
    if (memo && memo.version === capture.version() && memo.objets === ctx.etat.objects) return memo.liste;
    memo = { version: capture.version(), objets: ctx.etat.objects, liste: listeDeControle(ctx.etat.objects, capture.lire()) };
    return memo.liste;
  };
  const suivreLesContours = (): void => { if (facadesSurLesMurs(ctx, capture)) memo = null; };
  const visee = viseeDe(ctx, liste, publier);
  const sens = capteurs(ctx, (quoi) => { visee.capteurs(sens, quoi); vue.faites(); vue.suivre(); });
  const vue = vueDe(ctx, sens, visee, liste);
  // Un brouillon repris avec un batch en cours : son suivi repart ; la sauvegarde le remet a jour.
  const brouillon = brouillonDe(ctx, capture, () => { analyse.reprendre(); sauvegarde.planifier(); });
  // L'analyse lit les mesures de la validation, la validation lit les reponses de l'analyse : chacune
  // recoit l'autre par une fonction, posee apres les deux creations. Le partage part apres chaque
  // validation ; il lit le fichier, qui lit la validation : lie de meme.
  let validation: Validation, analyse: AnalyseClaude, corpus: Corpus | null = null, sauvegarde: Sauvegarde;
  analyse = analyseDe(ctx, capture, () => validation, maintenant);
  // Apres « Valider », l'audit repart au serveur avec ses decisions : le partage, et la sauvegarde
  // quand elle part d'elle-meme (administrateur, ou accord du partage) ; le catalogue lit ainsi ce qui
  // a ete valide ou refuse.
  validation = validationDe(ctx, capture, liste, maintenant, () => analyse, () => { void corpus?.envoyer(); sauvegarde.planifier(); });
  const fichier = fichierDe(ctx, capture, liste, validation, maintenant);
  const admin = () => ctx.admin?.() ?? false;
  sauvegarde = creerSauvegarde({
    capture, client: ctx.audits ?? (() => null), fichier: fichier.ecrire, maintenant, ...ctx.sauvegarde,
    // L'administrateur, ou l'accord du partage (D7) : sans lui, rien ne part sans le bouton.
    automatique: () => admin() || partageDe(capture.lire()).accord,
  });
  corpus = creerCorpus({
    capture, client: ctx.audits ?? (() => null), fichier: fichier.ecrire, signaler: ctx.signaler, maintenant,
    // Un utilisateur qui decoche reprend son accord : sa sauvegarde quitte le serveur avec le partage.
    apresRevocation: () => { if (!admin()) void sauvegarde.retirer(); },
  });
  // Une photo de plus ou de moins : la sauvegarde part quelques secondes apres. Une capture remplacee
  // (brouillon repris, fichier importe : un autre debut) n'est pas un geste de la visite.
  let photos = { debut: capture.lire().debut, signature: signaturePhotos(capture.lire()) };
  capture.abonner(() => {
    const c = capture.lire(), signature = signaturePhotos(c);
    if (signature !== photos.signature && c.debut === photos.debut) sauvegarde.planifier();
    photos = { debut: c.debut, signature };
  });
  capture.abonner(() => { visee.reconnaitre(sens); vue.faites(); publier(); });
  validation.abonner(publier);
  analyse.abonner(publier);
  corpus.abonner(publier);
  sauvegarde.abonner(publier);

  return {
    capture,
    validation,
    analyse,
    corpus,
    sauvegarde,
    fichier: fichier.ecrire,
    fichierDisponible: () => ctx.admin?.() ?? false,
    partagerLeFichier: fichier.partager,
    async importer(f, pret, depot, remesurer) {
      const nouvelle = captureDuFichier(f);
      await brouillon.remplacer(depot ? { ...nouvelle, sauvegarde: { ...depot } } : nouvelle, () => {
        if (!remesurer) {
          validation.poserMesures(mesuresDuFichier(f));
          const d = derniereDecision(f);
          if (d) validation.preregler(d);
        }
        pret();
      });
    },
    consulter(f, pret) {
      capture.remplacer(captureDuFichier(f));
      validation.figer(f.propositions);
      pret();
    },
    lectureSeule: () => validation.lectureSeule(),
    liste,
    ecran: () => ecran,
    montrer(e) {
      // Les capteurs demarrent ici aussi : un audit importe (§15) s'ouvre sans eux, sur les propositions.
      if (e === 'prise') { sens.autoriser(); sens.demarrer(); ctx.ouvrir3d(); }
      // La vue s'epure des que l'audit s'ouvre, quel que soit l'ecran : elle le reste jusqu'a sa fermeture.
      vue.epurer(true);
      vue.activer(e === 'liste' ? null : e);
      // Les propositions se montrent sur la Vue 3D, et les mesures commencent des que l'ecran s'ouvre.
      if (e === 'propositions') { ctx.ouvrir3d(); void validation.lancer(); } else validation.oublierApercu();
      ecran = e;
      publier();
    },
    cible: () => visee.cible(capture),
    position: () => ({ etat: sens.etat(), precisionM: sens.precision(), boussole: sens.capBoussole() !== null }),
    prise: () => priseDe(sens, maintenant()),
    photographier(cle, cote) { fusionAPrise.effacer(); sens.autoriser(); sens.demarrer(); visee.choisir(cle, cote); ecran = 'prise'; ctx.ouvrir3d(); vue.epurer(true); vue.activer('prise'); publier(); },
    suivreLaPosition() { visee.choisir(null, null); visee.reconnaitre(sens); vue.faites(); vue.suivre(true); publier(); },
    verrou: () => visee.verrou(),
    verrouiller(cle) {
      // Un verrou sur un batiment qui n'est pas de la liste n'a pas de sens : il est refuse.
      if (cle !== null && !liste().batiments.some((b) => b.cle === cle)) return;
      visee.verrouiller(cle, sens);
      vue.faites(); vue.suivre(true); publier();
    },
    pasCetteFacade() { const m = visee.ecarter(sens); if (m) ctx.signaler(m); vue.faites(); vue.suivre(true); publier(); },
    toucher(ndc) {
      if (ecran !== 'prise') return;
      const r = vue.toucher(ndc);
      if (r && r !== 'choisie') ctx.signaler(r);
      if (r === 'choisie') publier();
    },
    lacherVue: () => vue.lacher(),
    // La camera se repose sur la scene neuve, puis les copies de « Apres » y reviennent (deux vues).
    sceneBatie() { if (ecran !== 'liste') vue.suivre(true); if (ecran === 'propositions') validation.reposer(); },
    cadrerVue: (cache) => vue.cadrer(cache),
    rangerPhoto(photo) {
      const c = visee.cible(capture);
      if (!c) return null;
      if (!capture.ajouterPhotoFacade(c.cle, c.cote, photo)) { ctx.signaler('Cette façade a déjà toutes ses photos : retirez-en une depuis la liste.'); return null; }
      dernier = 'Photo rangée sur ' + c.nom + ' (' + pluriel(c.photos + 1, 'photo') + ').';
      fusionAPrise.verifier(c.cle, c.cote, c.photos + 1);
      publier();
      return { cle: c.cle, cote: c.cote };
    },
    dernierRangement: () => dernier,
    avertissementPrise: () => fusionAPrise.lire(),
    lancerAnalyse() {
      capture.terminer();
      void brouillon.vider();
      ctx.signaler('Capture terminée : elle est gardée sur cet appareil, et vos mesures deviennent des propositions.');
      // La capture finie part au serveur tout de suite : c'est elle que l'analyse reprendra.
      if (sauvegarde.etat().automatique) void sauvegarde.envoyer();
      // Avec l'accord deja donne, les photos partent (et le toast le rappelle) ; sinon l'ecran pose la question.
      void analyse.lancer();
    },
    // L'ecran ferme rend la Vue 3D telle qu'elle etait : tous les objets, et la camera libre.
    suspendre() { sens.arreter(); visee.oublier(); vue.activer(null); vue.epurer(false); validation.oublierApercu(); if (!validation.lectureSeule()) suivreLesContours(); },
    // Le plan a pu changer pendant que l'ecran etait ferme (un batiment modifie) : les facades suivent leur mur, la liste se recalcule.
    reprendre() { memo = null; suivreLesContours(); sens.demarrer(); visee.reconnaitre(sens); vue.epurer(true); if (ecran !== 'liste') vue.activer(ecran); if (ecran === 'propositions') validation.synchroniser(); },
    autoriserBoussole: () => sens.autoriser(),
    ecrireBrouillon: () => brouillon.vider(),
    proposerReprise: (pret) => brouillon.proposer(pret),
    abonner(f) { abonnes.add(f); return () => { abonnes.delete(f); }; },
  };
}

// Les etapes de l'audit de la parcelle apres la capture (controleur.ts) : la validation, l'analyse par Claude, le fichier de
// l'audit, et la fusion des photos d'une facade verifiee a la prise de vue.

import type { CaptureEnCours } from './capture.js';
import type { ListeDeControle } from './liste.js';
import { creerValidation, type ProjetAudit, type Validation } from './validation.js';
import { lireGrilleSous } from '../../../geo/mnh.js';
import { ecrireFichierAudit, type EntreesEcriture } from './fichier.js';
import { nomFichierAuditParcelle } from '../../../model/fichierAuditParcelle.js';
import { partagerFichier } from '../../../shell/partage.js';
import { creerAnalyseClaude, decoderImageNavigateur, fabriqueImagesNavigateur, idAuditAnalyse, type AnalyseClaude } from './analyseClaude.js';
import { renforcerFacades } from './entreesRenfort.js';
import { chercherCoins } from '../../releve/rechercheCoins.js';
import { versJpeg } from '../../../ui/releve/camera.js';
import { limitesDesParcelles } from '../../../render/couleurMurPhoto.js';
import { cleMesure } from './mesures.js';
import { avertissementPrise } from './redressement.js';
import type { GrilleRelief } from '../../../model/relief.js';
import type { ContexteAuditParcelle } from './typesSession.js';

/** Sans projet branche (tests de la capture), rien ne s'ecrit : l'apercu et la validation restent muets. */
const PROJET_MUET: ProjetAudit = { pushHistory: () => {}, render: () => {}, refaire3d: () => {}, remplacer3d: () => false };

/**
 * La validation de la session, avec les dependances du navigateur par defaut ; l'analyse y ajoute ses
 * reponses, et le partage pour le corpus part apres chaque validation.
 */
export function validationDe(ctx: ContexteAuditParcelle, capture: CaptureEnCours, liste: () => ListeDeControle, maintenant: () => Date, analyse: () => AnalyseClaude, apresValidation: () => void): Validation {
  return creerValidation({
    etat: ctx.etat, capture, liste, signaler: ctx.signaler, maintenant, apresValidation,
    projet: ctx.projet ?? PROJET_MUET,
    mesures: ctx.mesures ?? { chercherCoins, jpeg: (img) => versJpeg(img), limites: () => limitesDesParcelles(ctx.etat.objects) },
    analyse: { reponses: () => analyse().reponses(), version: () => analyse().version(), renfort: () => analyse().renfort() },
  });
}

/** L'analyse par Claude de la session : indisponible sans client (tests de la capture, hors plateforme). */
export function analyseDe(ctx: ContexteAuditParcelle, capture: CaptureEnCours, validation: () => Validation, maintenant: () => Date): AnalyseClaude {
  const a = ctx.analyse;
  return creerAnalyseClaude({
    capture, signaler: ctx.signaler, maintenant,
    entrees: () => validation().entrees(),
    mesuresPretes: () => validation().lancer(),
    client: a?.client ?? null,
    // L'audit du journal : la parcelle et l'heure du debut, pour distinguer deux audits du meme jour.
    // Le depot de la sauvegarde (ou du partage) sur le serveur : l'analyse y est gardee, entree et
    // sortie (spec-audit 15.5), pour que l'administrateur la relise et la compare a ses rejeux.
    identite: () => ({
      ...(a?.identite?.() ?? { projet: null, idu: ctx.idu, adresse: null }), audit: idAuditAnalyse(capture.lire()),
      depot: capture.lire().sauvegarde?.id ?? capture.lire().partage?.envoi?.id ?? null,
    }),
    images: a?.images ?? fabriqueImagesNavigateur(),
    // Le renfort des facades (lot L18) : ses graines recalees sur l'elevation de chaque facade mesuree.
    renforcer: a?.renforcer ?? ((par) => renforcerFacades(par, validation().entrees().mesures, decoderImageNavigateur)),
    ...(a?.notifier ? { notifier: a.notifier } : {}),
    ...(a?.preparerNotification ? { preparerNotification: a.preparerNotification } : {}),
    ...(a?.memoire ? { memoire: a.memoire } : {}),
    ...(a?.delaiSuiviMs !== undefined ? { delaiSuiviMs: a.delaiSuiviMs } : {}),
    ...(a?.essai ? { essai: a.essai } : {}),
    ...(a?.planifier ? { planifier: a.planifier } : {}),
  });
}

/** Le fichier de l'audit (§15) : l'ecrire d'apres la session, et le partager par le telephone. */
export function fichierDe(ctx: ContexteAuditParcelle, capture: CaptureEnCours, liste: () => ListeDeControle, validation: Validation, maintenant: () => Date) {
  // La sauvegarde ecrit le fichier apres chaque rafale de photos : la grille LiDAR d'un batiment ne
  // se relit pas a chaque fois (contour inchange, meme grille). Un echec n'est pas garde : le
  // prochain fichier la redemande.
  const grilles = new Map<string, Promise<GrilleRelief | null>>();
  const lire = ctx.lireGrille ?? lireGrilleSous;
  const lireGrille: NonNullable<EntreesEcriture['lireGrille']> = (pts, proj) => {
    const cle = JSON.stringify(pts);
    let g = grilles.get(cle);
    if (!g) {
      g = lire(pts, proj).catch(() => null).then((r) => { if (!r) grilles.delete(cle); return r; });
      grilles.set(cle, g);
    }
    return g;
  };
  const ecrire = () => ecrireFichierAudit({
    objets: ctx.etat.objects, capture: capture.lire(), liste: liste(), mesures: validation.mesuresFaites(),
    propositions: validation.propositions(), maintenant: maintenant(), lireGrille,
  });
  return {
    ecrire,
    async partager(): Promise<void> {
      const f = await ecrire();
      const nom = nomFichierAuditParcelle(maintenant(), f.parcelle.idu);
      const issue = await (ctx.partager ?? partagerFichier)(nom, JSON.stringify(f), 'Audit de la parcelle ' + f.parcelle.idu);
      if (issue === 'partage') ctx.signaler('Fichier de l’audit partagé : ' + nom + '.');
      else if (issue === 'telecharge') ctx.signaler('Fichier de l’audit téléchargé : ' + nom + '.');
    },
  };
}

/**
 * La fusion des photos d'une facade, verifiee a la prise de vue : des la deuxieme photo la facade se redresse et se fusionne ;
 * si elle ne le peut pas, on le dit sur place, pendant qu'on peut encore la reprendre avec des chevauchements.
 */
export function fusionAPriseDe(validation: () => Validation, publier: () => void) {
  let avertissement: string | null = null;
  let suivi = 0;
  return {
    lire: () => avertissement,
    effacer() { suivi++; avertissement = null; },
    verifier(cle: string, cote: number, photos: number): void {
      avertissement = null;
      const n = ++suivi;
      if (photos < 2) return;
      void validation().rejouerRedressement(cle, cote).catch(() => 0).then(() => {
        if (n !== suivi) return;
        const bilan = validation().mesuresFaites().get(cleMesure(cle, cote))?.redressement;
        const dit = bilan ? avertissementPrise(bilan) : null;
        if (dit !== avertissement) { avertissement = dit; publier(); }
      });
    },
  };
}

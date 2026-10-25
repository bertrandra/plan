// Le brouillon local de la capture de l'audit de la parcelle (controleur.ts, io/brouillonAudit.ts) : ecrit apres chaque geste, et
// la question posee avant qu'un fichier importe le remplace.

import { dialogues, type DialogueChoix } from '../../../shell/dialogues.js';
import { creerBrouillonParcelle, stockageNavigateur } from '../../../io/brouillonAudit.js';
import { photosDeLaCapture, type CaptureParcelle } from '../../../model/auditParcelle.js';
import { jourDe } from '../reprise.js';
import type { CaptureEnCours } from './capture.js';
import type { ContexteAuditParcelle } from './typesSession.js';
import { MESSAGES_BROUILLON, questionRepriseParcelle, pluriel } from './textesSession.js';

/** Le brouillon de la capture : ecrit un peu apres chaque geste, une note tapee ne fait qu'une ecriture. */
export function brouillonDe(ctx: ContexteAuditParcelle, capture: CaptureEnCours, apresReprise: () => void = () => {}) {
  const stockage = ctx.stockage === undefined ? stockageNavigateur() : ctx.stockage;
  const brouillon = creerBrouillonParcelle(stockage, { surEchec: (r) => ctx.signaler(MESSAGES_BROUILLON[r]) });
  let minuteur: ReturnType<typeof setTimeout> | null = null;
  /** Rien n'est ecrit avant que la question de la reprise ait sa reponse : on ecraserait le brouillon. */
  let pret = false;
  const vider = async () => { if (minuteur !== null) clearTimeout(minuteur); minuteur = null; return pret ? brouillon.ecrire(capture.lire()) : false; };
  capture.abonner(() => {
    if (!pret || !brouillon.disponible) return;
    if (minuteur !== null) clearTimeout(minuteur);
    minuteur = setTimeout(() => { void vider(); }, ctx.delaiBrouillonMs ?? 800);
  });
  return {
    vider,
    async proposer(pretAOuvrir: () => void): Promise<void> {
      if (pret) { pretAOuvrir(); return; }
      const lu = await brouillon.lire(capture.lire().id).catch(() => null);
      const fin = () => { pret = true; pretAOuvrir(); };
      if (!lu || !photosDeLaCapture(lu.capture).length && !Object.keys(lu.capture.batiments).length) { fin(); return; }
      (ctx.questionner ?? ((d) => dialogues.ouvrir(d)))(questionRepriseParcelle(lu.capture, () => {
        capture.remplacer(lu.capture);
        const perdues = lu.photosManquantes;
        ctx.signaler('Audit du ' + jourDe(new Date(lu.capture.debut)) + ' repris' + (perdues ? ' (' + pluriel(perdues, 'photo') + ' introuvable' + (perdues > 1 ? 's' : '') + ')' : '') + '.');
        fin();
        apresReprise();
      }, () => { void brouillon.jeter(lu.capture.id); fin(); }, fin));
    },
    /**
     * Un fichier importe remplace la capture : celle de la page et celle du brouillon. S'il y avait
     * quelque chose, la question est posee d'abord ; rien n'est perdu sans un geste.
     */
    async remplacer(nouvelle: CaptureParcelle, fait: () => void): Promise<void> {
      const lu = pret ? null : await brouillon.lire(capture.lire().id).catch(() => null);
      const appliquer = () => { pret = true; capture.remplacer(nouvelle); void vider(); fait(); };
      const deja = [capture.lire(), lu?.capture].find((c) => c && (photosDeLaCapture(c).length || Object.keys(c.batiments).length || c.decisions?.length));
      if (!deja) { appliquer(); return; }
      (ctx.questionner ?? ((q) => dialogues.ouvrir(q)))(questionRemplacement(deja, appliquer));
    },
  };
}

/** La question posee avant qu'un fichier importe remplace un audit garde sur l'appareil. */
export function questionRemplacement(c: CaptureParcelle, remplacer: () => void): DialogueChoix {
  const photos = photosDeLaCapture(c).length;
  return {
    type: 'choix',
    titre: 'Remplacer l’audit en cours ?',
    texte: 'L’audit commencé le ' + jourDe(new Date(c.debut)) + (photos ? ' (' + pluriel(photos, 'photo') + ')' : '')
      + ' est gardé sur cet appareil. Le fichier importé le remplace.',
    principal: { libelle: 'Remplacer par le fichier', executer: remplacer },
    secondaire: { libelle: 'Garder l’audit en cours', executer: () => {} },
    abandonner: () => {},
  };
}

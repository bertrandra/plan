// Ce que l'audit de la parcelle dit en clair (controleur.ts) : les messages du brouillon et du GPS, le plan de prise d'un mur, la
// question de reprise d'une capture restee sur l'appareil.

import type { SansPosition } from '../../../shell/geolocalisation.js';
import type { DialogueChoix } from '../../../shell/dialogues.js';
import type { RaisonEchec } from '../../../io/brouillonAudit.js';
import { photosDeLaCapture, type CaptureParcelle } from '../../../model/auditParcelle.js';
import { focalePx, planDePrise } from '../../../facade/vision/cadrage.js';
import { jourDe } from '../reprise.js';
import type { Facade } from '../../../geometry/cotesVusDeDehors.js';

/** Une photo de 4:3 en paysage, pour le plan de prise : le nombre de photos ne depend que des proportions. */
const PHOTO_TYPE = { l: 4000, h: 3000 };

export const MESSAGES_BROUILLON: Record<RaisonEchec, string> = {
  indisponible: 'Cet appareil ne garde pas le brouillon de l’audit (navigation privée ou stockage bloqué) : terminez la capture avant de fermer l’onglet.',
  plein: 'Plus de place sur l’appareil pour le brouillon de l’audit : libérez de la place pour garder vos photos.',
};

export const MESSAGES_GPS_PARCELLE: Record<SansPosition['raison'], string> = {
  refusee: 'Position refusée : autorisez la localisation pour ce site, ou choisissez la façade dans la liste.',
  indisponible: 'Position momentanément indisponible : elle reviendra dès que le GPS captera.',
  delai: 'La position tarde à venir : elle s’affichera dès que le GPS répondra.',
};

export const pluriel = (n: number, mot: string) => n + ' ' + mot + (n > 1 ? 's' : '');

/** « Une photo suffit, plus un gros plan du parement » : le plan de prise d'un mur, a cette distance (§7). */
export function textePlanDePrise(f: Facade, distance: number): string {
  const p = planDePrise(f.largeur, f.hauteur, distance, PHOTO_TYPE.l, PHOTO_TYPE.h, focalePx(PHOTO_TYPE.l, PHOTO_TYPE.h));
  const combien = p.photos <= 1 ? 'Une photo suffit' : p.photos + ' photos, de gauche à droite';
  const recul = p.hauteurTient ? '' : ' ; reculez pour cadrer la hauteur';
  return combien + ', plus un gros plan du parement' + recul + '.';
}

/** La question posee quand une capture de cette parcelle est restee sur l'appareil. */
export function questionRepriseParcelle(c: CaptureParcelle, reprendre: () => void, jeter: () => void, abandonner: () => void): DialogueChoix {
  const debut = new Date(c.debut);
  const photos = photosDeLaCapture(c).length;
  return {
    type: 'choix',
    titre: 'Un audit de la parcelle est resté en cours',
    texte: 'L’audit commencé le ' + jourDe(debut) + ' est gardé sur cet appareil'
      + (photos ? ' : ' + pluriel(photos, 'photo') : '') + (c.phase === 'analyse' ? ', capture terminée' : '') + '.',
    principal: { libelle: 'Reprendre l’audit du ' + jourDe(debut), executer: reprendre },
    secondaire: { libelle: 'Le jeter', executer: jeter },
    abandonner,
  };
}

// Ce que l'audit dit du redressement et de la fusion des photos d'une facade (MesureFacade.redressement) : des phrases
// pour la liste de controle, et le total du bouton « Rejouer redressement + fusion ». Rien ne se calcule ici.

import type { BilanPhotoRedressement, BilanRedressement } from '../../../model/auditParcelle.js';

export const LIBELLE_REJOUER = 'Rejouer redressement + fusion';

const num = (v: number) => String(v).replace('.', ',');

/** « Photo 2 : redressée automatiquement (verticales à 0,2°) », ou son motif d'echec. */
export function textePhoto(p: BilanPhotoRedressement): string {
  const nom = 'Photo ' + (p.rang + 1) + ' : ';
  if (p.statut === 'echec') return nom + 'échec, ' + (p.motif ?? 'redressement impossible') + ' (la photo est gardée)';
  const verticales = p.verticaliteDeg === null ? '' : ' (verticales à ' + num(p.verticaliteDeg) + '°)';
  if (p.statut === 'manuelle') return nom + 'redressée avec vos points' + verticales;
  return nom + 'redressée automatiquement' + (p.coins === 'predit' ? ', coins calculés' : '') + verticales;
}

/** Le statut de la facade en une phrase : fusionnee, partielle ou photos independantes ; rien a dire pour une photo seule. */
export function texteFusion(b: BilanRedressement): string {
  const rangs = (l: readonly number[]) => l.map((r) => r + 1).join(', ');
  if (b.fusion === 'fusionnee') return 'Fusionnée : ' + b.fusionnees.length + ' photos assemblées en une image';
  if (b.fusion === 'partielle') {
    const seules = b.photos.filter((p) => !b.fusionnees.includes(p.rang)).map((p) => p.rang);
    return 'Fusion partielle : photos ' + rangs(b.fusionnees) + ' assemblées, ' + (seules.length > 1 ? 'photos ' : 'photo ') + rangs(seules) + ' indépendante' + (seules.length > 1 ? 's' : '') + (b.motifFusion ? ' (' + b.motifFusion + ')' : '');
  }
  if (b.fusion === 'independantes') return 'Photos indépendantes : aucune fusion' + (b.motifFusion ? ' (' + b.motifFusion + ')' : '');
  if (b.photos.length > 1) return 'Photos redressées seules' + (b.motifFusion ? ' (' + b.motifFusion + ')' : '');
  return 'Photo seule, redressée : pas de fusion';
}

/**
 * Ce que la personne doit savoir tout de suite, a la prise de vue, quand ses photos d'une facade ne se fusionnent pas
 * (ou pas toutes) : reprendre la facade avec des chevauchements. Null : rien a dire (fusionnee, ou une seule photo).
 */
export function avertissementPrise(b: BilanRedressement): string | null {
  if (b.photos.length < 2 || b.fusion === 'fusionnee') return null;
  const conseil = 'reprenez la façade avec des chevauchements entre les photos.';
  if (b.fusion === 'partielle') {
    const seules = b.photos.filter((p) => !b.fusionnees.includes(p.rang)).map((p) => p.rang + 1);
    return 'Fusion des photos impossible pour la photo ' + seules.join(', ') + ' : ' + conseil;
  }
  return 'Fusion des photos impossible : ' + conseil;
}

/** Le compte rendu d'un rejeu, pour l'annonce a l'ecran. */
export function texteRejeu(facades: number): string {
  if (!facades) return 'Aucune façade photographiée à rejouer.';
  return 'Redressement et fusion rejoués sur ' + facades + (facades > 1 ? ' façades' : ' façade') + '. Vos photos et vos corrections n’ont pas changé.';
}

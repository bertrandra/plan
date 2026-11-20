// L'aller-retour avec Colab (etape 6 « Entrainer dans Colab », etape 3 pour le modele depose) : ce que l'ecran dit d'une cle
// d'entrainement et d'un modele depose par un carnet. Sans DOM ; le serveur (api.php) fait tout le reste.

import type { DepotModele, JetonEntrainement } from './types.js';

/** Un nombre a la francaise, a deux decimales : 0,62. */
export const decimal = (v: number): string => v.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Une date du serveur (ISO) dite a l'ecran : « 20/11/2026 14:32 » ; `fuseau` ne sert qu'aux tests. */
export function dateCourte(iso: string, fuseau?: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', ...(fuseau ? { timeZone: fuseau } : {}) }).replace(',', '');
}

/** Les photos d'un jeu, tous blocs confondus. */
export const photosDuJeu = (jeu: { images: { train: number; val: number; test: number } }): number => jeu.images.train + jeu.images.val + jeu.images.test;

/** Ce qu'il reste a vivre a une cle : « 23 h », « 40 min », ou « expirée ». */
export function resteDuJeton(j: Pick<JetonEntrainement, 'expireLe'>, maintenant: number): string {
  const s = Math.floor((new Date(j.expireLe).getTime() - maintenant) / 1000);
  if (!(s > 0)) return 'expirée';
  return s >= 3600 ? `${Math.floor(s / 3600)} h` : `${Math.max(1, Math.floor(s / 60))} min`;
}

/** Ou en est une cle : le carnet ne l'a pas encore utilisee, il a lu le jeu (il entraine), ou il a depose son modele. */
export function etatDuJeton(j: Pick<JetonEntrainement, 'lectures' | 'depose'>): { etat: 'attente' | 'entrainement' | 'depose'; libelle: string } {
  if (j.depose) return { etat: 'depose', libelle: 'Modèle déposé : activez-le à l’étape 3' };
  if (j.lectures > 0) return { etat: 'entrainement', libelle: 'Jeu lu par le carnet : entraînement en cours' };
  return { etat: 'attente', libelle: 'En attente du carnet' };
}

/** D'ou vient un modele depose par un carnet : sa date, son jeu, son mAP. Une ligne, pour la carte du modele (etape 3). */
export function origineDuModele(d: DepotModele, fuseau?: string): string {
  const n = photosDuJeu(d.jeu);
  const morceaux = [`Déposé par Colab le ${dateCourte(d.le, fuseau)}`, `jeu du ${dateCourte(d.jeu.le, fuseau)} (${n} photo${n > 1 ? 's' : ''}${d.jeu.verifieesSeulement ? (n > 1 ? ' vérifiées' : ' vérifiée') : ''})`];
  if (d.depart === 'zero') morceaux.push('de zéro');
  morceaux.push(typeof d.bilan.map === 'number' ? `mAP ${decimal(d.bilan.map)}` : 'mAP non mesuré');
  return morceaux.join(' · ');
}

/** Le mAP de chaque type, du meilleur au moins bon (a egalite, par nom). */
export function bilanParType(d: DepotModele): { nom: string; map: number }[] {
  return Object.entries(d.bilan.parType ?? {}).map(([nom, map]) => ({ nom, map })).sort((a, b) => b.map - a.map || a.nom.localeCompare(b.nom));
}

/** Le carnet telecharge est-il un .ipynb lisible qui parle a ce banc : de quoi ne pas proposer un fichier casse. */
export function carnetValable(carnet: string): boolean {
  try {
    const c = JSON.parse(carnet) as { nbformat?: unknown; cells?: unknown };
    return c.nbformat === 4 && Array.isArray(c.cells) && c.cells.length > 0;
  } catch { return false; }
}

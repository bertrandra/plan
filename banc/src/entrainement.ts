// L'entrainement sur le Mac (etape 6 « Entrainer sur mon Mac », etape 3 pour le modele depose) : ce que l'ecran dit d'une cle
// d'entrainement, du script qui la porte et du modele qu'il depose. Sans DOM ; le serveur (api.php) fait tout le reste.

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

/** Ou en est une cle : le script ne l'a pas encore utilisee, il a lu le jeu (il entraine), ou il a depose son modele. */
export function etatDuJeton(j: Pick<JetonEntrainement, 'lectures' | 'depose'>): { etat: 'attente' | 'entrainement' | 'depose'; libelle: string } {
  if (j.depose) return { etat: 'depose', libelle: 'Modèle déposé : activez-le à l’étape 3' };
  if (j.lectures > 0) return { etat: 'entrainement', libelle: 'Jeu lu par le script : entraînement en cours sur le Mac' };
  return { etat: 'attente', libelle: 'En attente du script' };
}

/** D'ou vient un modele depose par un script d'entrainement : sa date, son jeu, son mAP. Une ligne, pour la carte du modele (etape 3). */
export function origineDuModele(d: DepotModele, fuseau?: string): string {
  const n = photosDuJeu(d.jeu);
  const morceaux = [`Déposé par le script d’entraînement le ${dateCourte(d.le, fuseau)}`, `jeu du ${dateCourte(d.jeu.le, fuseau)} (${n} photo${n > 1 ? 's' : ''}${d.jeu.verifieesSeulement ? (n > 1 ? ' vérifiées' : ' vérifiée') : ''})`];
  if (d.depart === 'zero') morceaux.push('de zéro');
  morceaux.push(typeof d.bilan.map === 'number' ? `mAP ${decimal(d.bilan.map)}` : 'mAP non mesuré');
  return morceaux.join(' · ');
}

/** Le mAP de chaque type, du meilleur au moins bon (a egalite, par nom). */
export function bilanParType(d: DepotModele): { nom: string; map: number }[] {
  return Object.entries(d.bilan.parType ?? {}).map(([nom, map]) => ({ nom, map })).sort((a, b) => b.map - a.map || a.nom.localeCompare(b.nom));
}

/** La premiere et la derniere ligne du script que le serveur rend : de quoi reconnaitre un fichier entier. */
export const DEBUT_DU_SCRIPT = '#!/bin/bash\n';
export const FIN_DU_SCRIPT = '# fin du script du banc';

/** Le script telecharge est-il entier, et parle-t-il a ce banc avec une cle : de quoi ne pas proposer un fichier casse. */
export function scriptValable(script: string): boolean {
  return script.startsWith(DEBUT_DU_SCRIPT) && script.trimEnd().endsWith(FIN_DU_SCRIPT) && /^BANC_CLE='bj_[0-9a-f]{16}_[0-9a-f]{64}'$/m.test(script) && /^BANC_ADRESSE='https?:\/\/[^']+\/api\.php'$/m.test(script);
}

/** La commande a coller dans le Terminal du Mac pour lancer le script telecharge (Safari et les autres le rangent dans Téléchargements). */
export function commandeDuScript(fichier: string): string {
  return /^[A-Za-z0-9._-]+$/.test(fichier) ? `bash ~/Downloads/${fichier}` : '';
}

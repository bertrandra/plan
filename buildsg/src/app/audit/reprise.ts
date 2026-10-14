// Le brouillon de la promenade, cote controleur (MD/spec-audit.md §10) : l'ecrire au fil de l'eau,
// proposer a la reouverture « Reprendre l'audit du … » ou « Le jeter » (Z8), et l'effacer apres le
// partage si la personne le confirme. Le stockage lui-meme est dans io/brouillonAudit.ts.
//
// Tant que la question attend sa reponse, le depart attend aussi (`apresReponse`) : reprendre repart
// de la parcelle du brouillon, pour que les contours deja figes dans les cas restent dans le meme
// repere que le plan relu autour de vous.

import { creerBrouillonAudit, creerEcrivainBrouillon, idPromenade, type BrouillonAudit, type RaisonEchec, type StockageBrouillon } from '../../io/brouillonAudit.js';
import type { DialogueChoix } from '../../shell/dialogues.js';
import type { Promenade } from './promenade.js';

const MESSAGES_BROUILLON: Record<RaisonEchec, string> = {
  indisponible: 'Cet appareil ne garde pas le brouillon de l’audit (navigation privée ou stockage bloqué) : partagez le fichier avant de fermer l’onglet.',
  plein: 'Plus de place sur l’appareil pour le brouillon de l’audit : partagez le fichier sans attendre, ou libérez de la place.',
};

const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
/** « 13 octobre », dans l'heure de l'appareil : le jour que « Reprendre l'audit du … » nomme. */
export const jourDe = (d: Date): string => d.getDate() + (d.getDate() === 1 ? 'er' : '') + ' ' + MOIS[d.getMonth()];
/** « 09:12 », l'heure locale. */
const heureDe = (d: Date): string => String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
const pluriel = (n: number, mot: string) => n + ' ' + mot + (n > 1 ? 's' : '');

/** La question posee a la reouverture quand un audit est reste en cours sur l'appareil. */
export function questionReprise(b: BrouillonAudit, reprendre: () => void, jeter: () => void, abandonner: () => void): DialogueChoix {
  const debut = new Date(b.debut);
  const photos = b.cas.reduce((n, c) => n + c.constat.photos.length, 0);
  return {
    type: 'choix',
    titre: 'Un audit est resté en cours',
    texte: 'L’audit commencé le ' + jourDe(debut) + ' à ' + heureDe(debut) + (b.commune ? ' (' + b.commune + ')' : '')
      + ' est gardé sur cet appareil : ' + pluriel(b.cas.length, 'cas noté') + (photos ? ', ' + pluriel(photos, 'photo') : '') + '.',
    principal: { libelle: 'Reprendre l’audit du ' + jourDe(debut), executer: reprendre },
    secondaire: { libelle: 'Le jeter', executer: jeter },
    abandonner,
  };
}

export interface DependancesReprise {
  promenade: Promenade;
  /** `null` : rien ne se garde sur cet appareil. */
  stockage: StockageBrouillon | null;
  delaiMs?: number | undefined;
  questionner: (d: DialogueChoix) => void;
  signaler: (message: string) => void;
  /** La ligne d'etat du mode audit. */
  dire: (statut: string) => void;
  commune: () => string | null;
  /** Un batiment de ce nom est-il dans le plan : un cas repris s'y repeint, sa grille s'y relit. */
  present: (cle: string) => boolean;
  repeindre: (cles: string[]) => void;
  /** Repart de ce point (degres) : celui du brouillon repris. */
  partir: (lon: number, lat: number) => Promise<void>;
}

export interface RepriseAudit {
  /** Fait `f` une fois la question repondue (tout de suite s'il n'y a rien a demander). */
  apresReponse(f: () => void): void;
  repondu(): boolean;
  /** Cherche un audit reste en cours et pose la question. */
  proposer(): Promise<void>;
  /** Le point de depart de la promenade (degres), garde avec elle. */
  poserDepart(lon: number, lat: number): void;
  /** Le fichier est parti : proposer d'effacer le brouillon. */
  apresPartage(nom: string): void;
  /** Ecrit le brouillon tout de suite. */
  ecrire(): Promise<boolean>;
}

export function creerReprise(d: DependancesReprise): RepriseAudit {
  const { promenade } = d;
  const brouillon = creerBrouillonAudit(d.stockage, { surEchec: (r) => d.signaler(MESSAGES_BROUILLON[r]) });
  let depart: { lon: number; lat: number } | null = null;
  const ecrivain = creerEcrivainBrouillon(brouillon, () => ({ debut: promenade.debut, depart, commune: d.commune(), cas: promenade.liste() }), d.delaiMs);
  let sansBrouillonDit = false;
  promenade.abonner(() => {
    ecrivain.programmer();
    if (!brouillon.disponible && !sansBrouillonDit && promenade.liste().length) { sansBrouillonDit = true; d.signaler(MESSAGES_BROUILLON.indisponible); }
  });

  let repondu = !brouillon.disponible;
  const attentes: (() => void)[] = [];
  const repondre = () => { if (repondu) return; repondu = true; attentes.splice(0).forEach((f) => f()); };

  /** Reprend un audit du brouillon : ses cas, son debut, et son point de depart (le meme repere). */
  async function reprendre(b: BrouillonAudit): Promise<void> {
    const ancien = idPromenade(promenade.debut);
    const r = await brouillon.rouvrir(b);
    promenade.reprendre(r.debut, r.cas);
    if (ancien !== b.id) void brouillon.jeter(ancien);
    const perdues = r.photosManquantes;
    d.signaler('Audit du ' + jourDe(r.debut) + ' repris : ' + pluriel(r.cas.length, 'cas noté')
      + (perdues ? ' (' + pluriel(perdues, 'photo') + ' introuvable' + (perdues > 1 ? 's' : '') + ')' : '') + '.');
    const presents = r.cas.map((c) => c.cle).filter(d.present);
    if (presents.length) { d.repeindre(presents); promenade.relireManquants(d.present); }
    if (b.depart) await d.partir(b.depart.lon, b.depart.lat);
    repondre();
  }

  return {
    apresReponse(f) { if (repondu) f(); else attentes.push(f); },
    repondu: () => repondu,
    async proposer() {
      if (repondu) return;
      const b = await brouillon.chercher(idPromenade(promenade.debut));
      if (!b) { repondre(); return; }
      d.dire('Un audit en cours attend votre réponse.');
      d.questionner(questionReprise(b, () => { void reprendre(b); }, () => {
        void brouillon.jeter(b.id).then(() => d.signaler('Brouillon de l’audit du ' + jourDe(new Date(b.debut)) + ' jeté.'));
        repondre();
      }, repondre));
    },
    poserDepart(lon, lat) { depart = { lon: Math.round(lon * 1e7) / 1e7, lat: Math.round(lat * 1e7) / 1e7 }; },
    apresPartage(nom) {
      if (!brouillon.disponible) return;
      const id = idPromenade(promenade.debut);
      d.questionner({
        type: 'choix', titre: 'Effacer le brouillon ?',
        texte: 'Le fichier ' + nom + ' est parti. La promenade reste gardée sur cet appareil tant que vous n’effacez pas son brouillon.',
        principal: { libelle: 'Effacer le brouillon', executer: () => { ecrivain.annuler(); void brouillon.jeter(id).then(() => d.signaler('Brouillon de la promenade effacé.')); } },
        secondaire: { libelle: 'Le garder', executer: () => {} },
      });
    },
    ecrire: () => ecrivain.vider(),
  };
}

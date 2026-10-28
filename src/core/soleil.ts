// Le soleil du projet, l'exemplaire vivant (MD/spec-ouvrages.md, etape 6.7 ; sa description :
// model/soleilProjet.ts).
//
// Un seul soleil pour le plan (ombre des parasols), la Vue 3D (lumiere, ombres, feuillage, horloge)
// et la visionneuse GLB. Il vit ici, sous les trois, parce que three/ n'a pas l'etat du plan
// (`EtatApp`) et tient le sien au niveau du module (three/etat3d.ts) : le meme choix que
// core/lectureRelief.ts. L'intensite et la lumiere d'appoint restent a chaque vue : ce ne sont pas le
// soleil, mais la facon de le montrer.
//
// Le changer reste un reglage d'affichage : ni pas d'annulation, ni « projet modifie » de son fait,
// permis en lecture seule. L'ecouteur de l'application (app/soleil.ts) le range sur la parcelle et
// marque le projet a enregistrer, comme « Relief » et « Courbes de niveau » : on le retrouve a la
// reouverture.

import { soleilEnregistre, soleilParDefaut, minutesDuJour, type SoleilProjet } from '../model/soleilProjet.js';
import { lireDate } from '../util/date.js';
import { parcelleDuProjet } from '../model/fonctions.js';
import { toucher } from './controleurObjets.js';
import type { ObjetPlan } from '../model/types.js';

let courant: SoleilProjet = soleilParDefaut();
// Vrai des qu'il vient d'un fichier ou d'un reglage : il s'ecrit alors sur la parcelle. Faux, le
// projet n'a pas de soleil a lui et le fichier n'en gagne pas.
let choisi = false;
const abonnes = new Set<() => void>();

const memes = (a: SoleilProjet, b: SoleilProjet): boolean => a.dateStr === b.dateStr && a.minutes === b.minutes;

export const soleilDuProjet = {
  /** La date et l'heure en cours ; une copie, qu'aucun lecteur ne peut changer derriere les autres. */
  lire: (): SoleilProjet => ({ ...courant }),
  choisi: (): boolean => choisi,
  /**
   * Regle la date ou l'heure. Une date illisible (champ vide) ou des minutes qui ne sont pas un
   * nombre sont ignorees ; rien ne change, rien n'est dit. Vrai si le soleil a bouge.
   */
  regler(r: Partial<SoleilProjet>): boolean {
    const suivant = { ...courant };
    if (r.dateStr !== undefined && lireDate(r.dateStr)) suivant.dateStr = r.dateStr.trim();
    if (r.minutes !== undefined) { const m = minutesDuJour(r.minutes); if (m !== null) suivant.minutes = m; }
    if (memes(suivant, courant)) return false;
    courant = suivant;
    choisi = true;
    abonnes.forEach(f => f());
    return true;
  },
  /**
   * Reprend le soleil enregistre sur la parcelle d'un projet qu'on ouvre ou qu'on importe ; sans
   * lui, celui du jour (`soleilParDefaut`). Sans prevenir les abonnes : ouvrir un projet ne le
   * marque pas a enregistrer, et qui l'ouvre redessine tout.
   */
  restaurer(objets: ObjetPlan[], maintenant?: Date): void {
    const enregistre = soleilEnregistre(parcelleDuProjet(objets)?.soleil);
    courant = enregistre ?? soleilParDefaut(maintenant);
    choisi = !!enregistre;
  },
  /**
   * Range le soleil choisi sur la parcelle. Apres une annulation aussi : l'instantane restaure porte
   * le soleil d'avant, et le changer n'est pas un pas d'annulation ; sans cela, l'ecran et le fichier
   * enregistre ne diraient plus la meme heure.
   */
  ranger(objets: ObjetPlan[]): void {
    if (!choisi) return;
    const p = parcelleDuProjet(objets);
    if (!p || (p.soleil && memes(p.soleil, courant))) return;
    p.soleil = { ...courant };
    toucher(p);
  },
  abonner(f: () => void): () => void { abonnes.add(f); return () => { abonnes.delete(f); }; }
};

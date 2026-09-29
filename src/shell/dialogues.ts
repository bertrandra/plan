// Les dialogues (spec-ihm-zones §4.8, Z8) : une question a la fois, fermable par Echap.
//
// Une confirmation, une invite a saisir un texte, l'ecran de reprise quand le projet ne se charge
// pas : trois formes d'une meme chose, un dialogue modal qui attend une reponse. Ce module tient
// le dialogue en cours et previent la zone React (zones/Dialogues.tsx) qui le dessine. Comme les
// notifications, il est au niveau zero : sans abonne — avant que l'application n'ait demarre —
// `shell/dialogs.ts` retombe sur un dialogue en DOM brut.
//
// Les trois parcours en plusieurs etapes (import cadastre, actualisation IGN, textures) restent
// des dialogues DOM a part : ils portent leur propre logique et se contentent des memes styles.

export interface DialogueConfirmation {
  type: 'confirmation';
  texte: string;
  confirmer: () => void;
}

export interface DialogueInvite {
  type: 'invite';
  texte: string;
  valeur: string;
  valider: (valeur: string) => void;
}

export interface DialogueErreurChargement {
  type: 'erreurChargement';
  titre: string;
  texte: string;
  /** Le libelle du bouton, et ce qu'il fait — recharger la page. */
  action: string;
  executer: () => void;
}

/**
 * Deux issues, aucune destructive : ni « Confirmer » ni bouton rouge. La mise a jour du modele a
 * l'ouverture en est un : « Mettre a jour » et « Garder tel quel » sont deux reponses legitimes, et
 * Echap n'en choisit aucune — la question reviendra a la prochaine ouverture.
 */
export interface DialogueChoix {
  type: 'choix';
  titre: string;
  texte: string;
  /** Une liste courte sous le texte (ce qu'apporte une version, par exemple). */
  points?: string[];
  principal: { libelle: string; executer: () => void };
  secondaire: { libelle: string; executer: () => void };
}

export type Dialogue = DialogueConfirmation | DialogueInvite | DialogueErreurChargement | DialogueChoix;

type Abonne = (courant: Dialogue | null) => void;

let courant: Dialogue | null = null;
const abonnes = new Set<Abonne>();

function publier(): void { abonnes.forEach(a => a(courant)); }

export const dialogues = {
  aUnAbonne: (): boolean => abonnes.size > 0,
  courant: (): Dialogue | null => courant,
  abonner(a: Abonne): () => void {
    abonnes.add(a);
    a(courant);
    return () => { abonnes.delete(a); };
  },
  /** Ouvre un dialogue ; s'il y en avait un, il est remplace — une question a la fois. */
  ouvrir(d: Dialogue): void {
    courant = d;
    publier();
  },
  /** Ferme sans repondre : Echap, le voile, Annuler. */
  fermer(): void {
    if (!courant) return;
    courant = null;
    publier();
  },
  /** Repond au dialogue courant, puis le ferme. Une invite vide ne repond pas ; un choix prend le principal. */
  repondre(valeur?: string): void {
    const d = courant;
    if (!d) return;
    courant = null;
    publier();
    if (d.type === 'confirmation') d.confirmer();
    else if (d.type === 'invite') { const v = (valeur ?? '').trim(); if (v) d.valider(v); }
    else if (d.type === 'choix') d.principal.executer();
    else d.executer();
  },
  /** Prend l'issue secondaire d'un choix, puis le ferme. Sans choix ouvert, ne fait rien. */
  repondreSecondaire(): void {
    const d = courant;
    if (d?.type !== 'choix') return;
    courant = null;
    publier();
    d.secondaire.executer();
  }
};

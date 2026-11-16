// Les notifications (spec-ihm-zones §4.8, Z9) : ce qui vient d'arriver, sans bloquer.
//
// Un toast disparait de lui-meme ; un bandeau d'erreur reste jusqu'a ce qu'on le ferme. Ce module
// ne sait pas les dessiner : il tient la liste et previent qui s'y abonne — la zone React
// (zones/Notifications.tsx) — a chaque changement. Il vit dans shell/, au niveau zero, parce que
// tout le programme emet des notifications, jusqu'au point d'entree qui n'a pas encore charge le
// reste : sans abonne, `shell/dialogs.ts` retombe sur un bandeau en DOM brut.

export type TypeNotification = 'toast' | 'erreur';

export interface Notification {
  id: number;
  type: TypeNotification;
  texte: string;
  /**
   * Une erreur dite en phrase (shell/dialogs.ts::showErreur) : le detail technique, a copier pour qui
   * aide la personne (le message du navigateur, la reference de la requete). Absent : le bandeau de
   * developpeur (`showErrBanner`), dont le texte est deja le detail.
   */
  detail?: string;
}

type Abonne = (liste: readonly Notification[]) => void;

let liste: Notification[] = [];
let suivant = 1;
const abonnes = new Set<Abonne>();
const minuteries = new Map<number, ReturnType<typeof setTimeout>>();

function publier(): void {
  const instantane = liste.slice();
  abonnes.forEach(a => a(instantane));
}

/** La duree d'affichage d'un toast : le temps de le lire, entre 3,2 et 9 secondes. */
export function dureeToast(texte: string): number {
  return Math.min(9000, Math.max(3200, texte.length * 60));
}

export const notifications = {
  /** `true` quand une zone affiche les notifications : sinon l'appelant se debrouille en DOM. */
  aUnAbonne: (): boolean => abonnes.size > 0,
  liste: (): readonly Notification[] => liste,
  abonner(a: Abonne): () => void {
    abonnes.add(a);
    a(liste.slice());
    return () => { abonnes.delete(a); };
  },
  emettre(type: TypeNotification, texte: string, detail?: string): number {
    const n: Notification = { id: suivant++, type, texte, ...(detail !== undefined ? { detail } : {}) };
    liste = [...liste, n];
    if (type === 'toast') minuteries.set(n.id, setTimeout(() => notifications.fermer(n.id), dureeToast(texte)));
    publier();
    return n.id;
  },
  fermer(id: number): void {
    const m = minuteries.get(id);
    if (m) { clearTimeout(m); minuteries.delete(id); }
    if (!liste.some(n => n.id === id)) return;
    liste = liste.filter(n => n.id !== id);
    publier();
  },
  /** Pour les tests : repart de zero. */
  vider(): void {
    minuteries.forEach(clearTimeout); minuteries.clear();
    liste = [];
    publier();
  }
};

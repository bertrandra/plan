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
  /** Un toast qui laisse revenir sur un geste avant qu'il ne parte (« Annuler ») : son libelle. */
  action?: string;
}

type Abonne = (liste: readonly Notification[]) => void;

let liste: Notification[] = [];
let suivant = 1;
const abonnes = new Set<Abonne>();
const minuteries = new Map<number, ReturnType<typeof setTimeout>>();
/**
 * Un toast a action : ce qui se fait quand il se ferme sans qu'on ait choisi l'action (le geste part),
 * et ce que fait l'action (le geste est abandonne). L'un ou l'autre, une seule fois.
 */
const suites = new Map<number, { apres: () => void; action: () => void }>();

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
  /**
   * Un toast qui annonce un geste qui ne part qu'a sa fermeture : `action` le retient (« Annuler »),
   * `apres` le fait — quand le toast s'efface de lui-meme, ou qu'on le ferme d'un toucher. Pour un geste
   * definitif (retirer un lien de partage) sans double confirmation : le temps de lire est le temps de
   * se raviser.
   */
  emettreAvecAction(texte: string, libelle: string, action: () => void, apres: () => void, dureeMs = 6000): number {
    const n: Notification = { id: suivant++, type: 'toast', texte, action: libelle };
    liste = [...liste, n];
    suites.set(n.id, { apres, action });
    minuteries.set(n.id, setTimeout(() => notifications.fermer(n.id), dureeMs));
    publier();
    return n.id;
  },
  /** L'action d'un toast : le geste annonce n'aura pas lieu. */
  agir(id: number): void {
    const s = suites.get(id);
    suites.delete(id);
    notifications.fermer(id);
    s?.action();
  },
  fermer(id: number): void {
    const m = minuteries.get(id);
    if (m) { clearTimeout(m); minuteries.delete(id); }
    // Ferme sans son action : le geste annonce part maintenant.
    const s = suites.get(id);
    suites.delete(id);
    if (!liste.some(n => n.id === id)) { s?.apres(); return; }
    liste = liste.filter(n => n.id !== id);
    publier();
    s?.apres();
  },
  /** Pour les tests : repart de zero. */
  vider(): void {
    minuteries.forEach(clearTimeout); minuteries.clear();
    suites.clear();
    liste = [];
    publier();
  }
};

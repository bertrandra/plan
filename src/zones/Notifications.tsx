// Z9, les notifications (spec-ihm-zones §4.8) : ce qui vient d'arriver.
//
// Etape 6 de la reconstruction : les toasts et le bandeau d'erreur que `shell/dialogs.ts`
// fabriquait en DOM sont rendus ici, empiles en bas de l'ecran, d'apres la liste que
// `shell/notifications.ts` tient. Un toast s'efface seul ; une erreur reste, avec son bouton de
// fermeture, parce qu'un message qu'on n'a pas eu le temps de lire ne sert a rien.

import { useSyncExternalStore } from 'react';
import { notifications, type Notification } from '../shell/notifications.js';

const abonner = (cb: () => void) => notifications.abonner(cb);
const lire = () => notifications.liste();

export function Notifications() {
  const liste = useSyncExternalStore(abonner, lire, lire);
  if (!liste.length) return null;
  const erreurs = liste.filter(n => n.type === 'erreur');
  const toasts = liste.filter(n => n.type === 'toast');
  return (
    <>
      {toasts.length > 0 && (
        <div className="notificationsToasts" role="status" aria-live="polite">
          {toasts.map(n => <div key={n.id} className="toast" onClick={() => notifications.fermer(n.id)}>{n.texte}</div>)}
        </div>
      )}
      {erreurs.map((n: Notification) => (
        <div key={n.id} className="bandeauErreur" role="alert">
          <span className="texte">{n.texte}</span>
          <button type="button" data-controle="notification.fermer" className="fermer" title="Fermer" aria-label="Fermer cette erreur" onClick={() => notifications.fermer(n.id)}>✕</button>
        </div>
      ))}
    </>
  );
}

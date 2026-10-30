// Z8, l'assistant en langue naturelle (lot L6 de MD/spec-lecture-ia-elargie.md §5.5) : un champ « Demander », la liste d'etapes que
// Claude en tire, « Appliquer ».
//
// La zone ne fait que montrer : la demande et la liste vivent dans le service (app/assistant/service.ts), chaque etape est relue contre
// le registre a chaque rendu (une etape refusee se grise et dit sa raison, ecrite sous elle : au doigt, l'infobulle n'existe pas), et
// les deux boutons sont des commandes du registre (`assistant.envoyer`, `assistant.appliquer`).

import { useSyncExternalStore } from 'react';
import { BoutonCommande } from '../composants/BoutonCommande.js';
import { useCle, useMagasinZone } from '../composants/abonnement.js';
import type { ServiceAssistant } from '../../app/assistant/service.js';
import type { RegistreCommandes } from '../../app/commandes.js';

const dollars = (v: number) => v.toLocaleString('fr-FR', { maximumFractionDigits: 4 }) + ' $';

export function Assistant({ service, commandes, fermer }: { service: ServiceAssistant; commandes: RegistreCommandes; fermer: () => void }) {
  const e = useSyncExternalStore(service.abonner, service.etat, service.etat);
  // La liste se relit contre le registre a chaque rendu du plan : la cle dit ce qu'elle montre, l'etat de chaque etape compris.
  useCle(useMagasinZone(), 'assistant', () => JSON.stringify(service.etapes().map((x) => [x.libelle, x.refus])));
  const etapes = service.etapes();
  const refusEnvoi = service.envoiPossible();
  const refusAppliquer = commandes.etat('assistant.appliquer');
  return (
    <div className="dialogueImperatif dialogueAssistant" role="dialog" aria-modal="true" aria-label="Assistant">
      <div className="titreParcours">Assistant</div>
      <div className="sousTitreParcours">Écrivez ce que vous voulez faire : Claude le traduit en étapes de Plan. Rien ne change avant «&nbsp;Appliquer&nbsp;», et Ctrl+Z défait la liste d’un coup.</div>
      <label className="assistantDemande">
        <span>Demander</span>
        <textarea data-controle="assistant.demande" rows={3} maxLength={1000} value={e.demande} disabled={e.statut === 'envoi'}
          placeholder="Par exemple : passez les lames de la terrasse en pin, et affichez la grille."
          onChange={(ev) => service.saisir(ev.target.value)}
          onKeyDown={(ev) => { if (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey)) { ev.preventDefault(); commandes.executer('assistant.envoyer'); } }} />
      </label>
      <div className="actionsAssistant">
        <BoutonCommande commandes={commandes} id="assistant.envoyer" className="secondary" enCours={e.statut === 'envoi' ? 'Envoi…' : false}>Envoyer la demande</BoutonCommande>
        {!refusEnvoi.ok && refusEnvoi.raison && <p className="refusAssistant" role="note">{refusEnvoi.raison}</p>}
      </div>
      {e.erreur && <p className="erreurAssistant" role="alert">{e.erreur}</p>}
      {e.reponse && (
        <div className="reponseAssistant">
          {e.reponse.questions.length > 0 && (
            <ul className="questionsAssistant" aria-label="Questions de l’assistant">
              {e.reponse.questions.map((q, i) => <li key={i}>{q}</li>)}
            </ul>
          )}
          {etapes.length > 0
            ? (
              <ol className="etapesAssistant" aria-label="Étapes proposées">
                {etapes.map((x, i) => (
                  <li key={i} className={x.refus ? 'refusee' : undefined} aria-disabled={x.refus ? true : undefined} data-etape={i}>
                    <span className="libelleEtape">{x.libelle}</span>
                    {x.pourquoi && <span className="pourquoiEtape">{x.pourquoi}</span>}
                    {x.refus && <span className="raisonEtape" role="note">{x.refus}</span>}
                  </li>
                ))}
              </ol>
            )
            : <p className="hint">Aucune étape : {e.reponse.questions.length ? 'répondez à la question en reformulant votre demande.' : 'la demande ne correspond à rien que Plan sache faire ici.'}</p>}
          <p className="sourceAssistant">{e.synthetique ? 'Réponse synthétique (pas Claude)' : 'Proposé par Claude'}{e.cout !== null ? ', ' + dollars(e.cout) : ''}.</p>
        </div>
      )}
      <div className="piedDialogue">
        <button type="button" data-controle="assistant.fermer" className="secondary" onClick={fermer}>Fermer</button>
        {e.reponse && <BoutonCommande commandes={commandes} id="assistant.appliquer">Appliquer</BoutonCommande>}
        {e.reponse && !refusAppliquer.utilisable && 'message' in refusAppliquer && <p className="refusAssistant" role="note">{refusAppliquer.message}</p>}
      </div>
    </div>
  );
}

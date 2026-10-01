// Z8, les dialogues (spec-ihm-zones §4.8) : une question, une reponse.
//
// Etape 6 de la reconstruction : confirmations, invites et ecran de reprise que `shell/dialogs.ts`
// fabriquait en DOM sont rendus ici, d'apres le dialogue courant que `shell/dialogues.ts` tient.
// Un seul a la fois, modal, fermable par Echap ou par un clic sur le voile ; l'ecran de reprise,
// lui, ne se ferme pas — il n'y a rien derriere.

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { dialogues, type Dialogue } from '../shell/dialogues.js';

const abonner = (cb: () => void) => dialogues.abonner(cb);
const lire = () => dialogues.courant();

function Invite({ d }: { d: Extract<Dialogue, { type: 'invite' }> }) {
  const [valeur, setValeur] = useState(d.valeur);
  const champ = useRef<HTMLInputElement>(null);
  useEffect(() => { champ.current?.focus(); champ.current?.select(); }, []);
  return (
    <>
      <p className="dialogueTexte">{d.texte}</p>
      <input ref={champ} type="text" className="promptInput" value={valeur} onChange={e => setValeur(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') dialogues.repondre(valeur); }} />
      <div className="dialogueBoutons">
        <button type="button" className="secondary" onClick={() => dialogues.fermer()}>Annuler</button>
        <button type="button" onClick={() => dialogues.repondre(valeur)}>Valider</button>
      </div>
    </>
  );
}

export function Dialogues() {
  const d = useSyncExternalStore(abonner, lire, lire);
  const fermable = !!d && d.type !== 'erreurChargement';
  useEffect(() => {
    if (!fermable) return;
    const surTouche = (e: KeyboardEvent) => { if (e.key === 'Escape') dialogues.fermer(); };
    window.addEventListener('keydown', surTouche);
    return () => window.removeEventListener('keydown', surTouche);
  }, [fermable]);
  if (!d) return null;
  return (
    <div className="dialogueVoile" onClick={e => { if (fermable && e.target === e.currentTarget) dialogues.fermer(); }}>
      <div className={'dialogueBoite' + (d.type === 'erreurChargement' ? ' erreur' : '')} role={d.type === 'erreurChargement' ? 'alertdialog' : 'dialog'} aria-modal="true">
        {d.type === 'confirmation' && (
          <>
            <p className="dialogueTexte">{d.texte}</p>
            <div className="dialogueBoutons">
              <button type="button" className="secondary" onClick={() => dialogues.fermer()}>Annuler</button>
              <button type="button" className="danger" onClick={() => dialogues.repondre()}>Confirmer</button>
            </div>
          </>
        )}
        {d.type === 'invite' && <Invite key={d.texte + d.valeur} d={d} />}
        {d.type === 'choix' && (
          <>
            <div className="dialogueTitre">{d.titre}</div>
            <p className="dialogueTexte">{d.texte}</p>
            {d.points && d.points.length > 0 && (
              <ul className="dialoguePoints">{d.points.map((p) => <li key={p}>{p}</li>)}</ul>
            )}
            <div className="dialogueBoutons">
              <button type="button" className="secondary" onClick={() => dialogues.repondreSecondaire()}>{d.secondaire.libelle}</button>
              <button type="button" onClick={() => dialogues.repondre()}>{d.principal.libelle}</button>
            </div>
          </>
        )}
        {d.type === 'erreurChargement' && (
          <>
            <div className="dialogueTitre">{d.titre}</div>
            <p className="dialogueTexte">{d.texte}</p>
            <div className="dialogueBoutons centre">
              <button type="button" onClick={() => dialogues.repondre()}>{d.action}</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

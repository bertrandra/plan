import { useState, type FormEvent } from 'react';
import { api } from '../api.js';

export function Connexion({ onConnecte }: { onConnecte: () => void }) {
  const [mdp, setMdp] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const envoyer = (e: FormEvent) => {
    e.preventDefault();
    setEnvoi(true);
    setErreur(null);
    api.connexion(mdp).then(onConnecte).catch((x: Error) => setErreur(x.message)).finally(() => setEnvoi(false));
  };
  return (
    <main className="seul">
      <h1>Banc d’apprentissage des façades</h1>
      <form onSubmit={envoyer} className="pile">
        <label>Mot de passe
          <input type="password" autoComplete="current-password" value={mdp} onChange={(e) => setMdp(e.target.value)} autoFocus required />
        </label>
        <button type="submit" className="principal" disabled={envoi || !mdp}>Entrer</button>
        {erreur && <p className="erreur" role="alert">{erreur}</p>}
      </form>
    </main>
  );
}

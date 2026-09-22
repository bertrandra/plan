// La porte : ce qui s'affiche tant que la plateforme n'a pas dit qui vous etes (spec §3.2, §5).
//
// Trois ecrans et pas un de plus. Le formulaire, quand personne n'est connecte. La page « ce
// compte ne tient pas Plan », quand la plateforme repond mais refuse le produit. Le bandeau de
// panne, quand elle repond autre chose — avec son `request_id`, qui est la seule chose qu'une
// personne puisse citer a l'operateur.
//
// Ce que cette zone ne fait pas : le mot de passe oublie, la confirmation d'adresse, la creation de
// compte, le choix de la langue. Ce sont les ecrans de la plateforme, atteints par un lien
// ordinaire. Les reimplementer ferait de Plan une seconde autorite (spec §10).

import { useState } from 'react';
import type { Fermeture } from '../plateforme/contexte.js';

export interface PropsPorte {
  fermeture: Fermeture;
  /** Tente l'ouverture. Rend le message a afficher en cas de refus, ou rien en cas de succes. */
  ouvrir: (email: string, motDePasse: string) => Promise<string | null>;
  /** L'origine de la plateforme, pour les liens qui lui appartiennent. */
  plateforme: string;
}

export function Porte({ fermeture, ouvrir, plateforme }: PropsPorte) {
  if (fermeture.raison === 'sansPlan') return <SansPlan fermeture={fermeture} plateforme={plateforme} />;
  if (fermeture.raison === 'panne') return <Panne fermeture={fermeture} />;
  return <Formulaire ouvrir={ouvrir} plateforme={plateforme} />;
}

function Formulaire({ ouvrir, plateforme }: { ouvrir: PropsPorte['ouvrir']; plateforme: string }) {
  const [email, setEmail] = useState('');
  const [motDePasse, setMotDePasse] = useState('');
  const [refus, setRefus] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  async function soumettre(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setEnCours(true);
    setRefus(null);
    const message = await ouvrir(email, motDePasse);
    setEnCours(false);
    if (message) {
      setRefus(message);
      // Le mot de passe ne reste pas dans le champ apres un refus : ce qui est efface ne fuit pas.
      setMotDePasse('');
    }
  }

  return (
    <div className="porteVoile">
      <form className="porteBoite" onSubmit={(e) => { void soumettre(e); }}>
        <h2 className="porteTitre">Plan interactif</h2>
        <p className="porteSous">Votre compte est celui de la plateforme.</p>
        {refus && <p className="porteRefus" role="alert">{refus}</p>}
        <label className="porteChamp">
          <span>Adresse</span>
          <input type="email" value={email} autoComplete="username" required autoFocus
            onChange={(e) => { setEmail(e.target.value); }} />
        </label>
        <label className="porteChamp">
          <span>Mot de passe</span>
          <input type="password" value={motDePasse} autoComplete="current-password" required
            onChange={(e) => { setMotDePasse(e.target.value); }} />
        </label>
        <button type="submit" className="porteBouton" disabled={enCours}>
          {enCours ? 'Connexion…' : 'Se connecter'}
        </button>
        <p className="porteLiens">
          <a href={plateforme.replace(/\/api\/v1$/, '') + '/forgot-password'}>Mot de passe oublié</a>
        </p>
      </form>
    </div>
  );
}

function SansPlan({ fermeture, plateforme }: { fermeture: Extract<Fermeture, { raison: 'sansPlan' }>; plateforme: string }) {
  return (
    <div className="porteVoile">
      <div className="porteBoite">
        <h2 className="porteTitre">Ce compte ne tient pas Plan</h2>
        <p className="porteSous">
          Votre organisation n’a pas souscrit à Plan, ou ce compte n’y a pas accès. Un administrateur
          de l’organisation peut l’ajouter depuis la plateforme.
        </p>
        <p className="porteLiens">
          <a href={plateforme.replace(/\/api\/v1$/, '')}>Aller à la plateforme</a>
        </p>
        <p className="porteRef">{fermeture.code}{fermeture.requestId && ' · ' + fermeture.requestId}</p>
      </div>
    </div>
  );
}

function Panne({ fermeture }: { fermeture: Extract<Fermeture, { raison: 'panne' }> }) {
  return (
    <div className="porteVoile">
      <div className="porteBoite">
        <h2 className="porteTitre">La plateforme n’a pas répondu</h2>
        <p className="porteSous">{fermeture.message}</p>
        <p className="porteSous">
          Réessayez dans un moment. Si cela dure, donnez cette référence à l’exploitant : c’est elle
          qui permet de retrouver la requête.
        </p>
        <p className="porteRef">{fermeture.code}{fermeture.requestId && ' · ' + fermeture.requestId}</p>
      </div>
    </div>
  );
}

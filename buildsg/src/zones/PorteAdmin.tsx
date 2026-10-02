// La porte de l'admin des demos (MD/spec-demos-admin.md) : un mot de passe, rien d'autre.
//
// Elle reprend la boite de la porte de la plateforme (zones/Porte.tsx) et ses classes : meme voile,
// memes champs. Le mot de passe part au serveur qui sert la page, qui seul le verifie ; il ne
// reste pas dans le champ apres un refus.

import { useState } from 'react';

export interface PropsPorteAdmin {
  /** Rend le message de refus, ou `null` une fois la session ouverte. */
  ouvrir: (motDePasse: string) => Promise<string | null>;
  /** Le serveur n'a pas d'admin : pas d'`app.js`, ou pas d'`ADMIN_PASSWORD`. */
  indisponible: boolean;
}

export function PorteAdmin({ ouvrir, indisponible }: PropsPorteAdmin) {
  const [motDePasse, setMotDePasse] = useState('');
  const [refus, setRefus] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  if (indisponible) {
    return (
      <div className="porteVoile">
        <div className="porteBoite">
          <h2 className="porteTitre">Admin des démos</h2>
          <p className="porteRefus" role="alert">
            Ce serveur ne propose pas l’admin des démos. Il faut le serveur <code>app.js</code> avec la variable
            {' '}<code>ADMIN_PASSWORD</code> renseignée.
          </p>
          <p className="porteLiens"><a href="./">Ouvrir Plan sans l’admin</a></p>
        </div>
      </div>
    );
  }

  async function soumettre(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setEnCours(true);
    setRefus(null);
    const message = await ouvrir(motDePasse);
    setEnCours(false);
    if (message) {
      setRefus(message);
      setMotDePasse('');
    }
  }

  return (
    <div className="porteVoile">
      <form className="porteBoite" onSubmit={(e) => { void soumettre(e); }}>
        <h2 className="porteTitre">Admin des démos</h2>
        <p className="porteSous">Vous allez modifier les fichiers de démonstration du serveur.</p>
        {refus && <p className="porteRefus" role="alert">{refus}</p>}
        <label className="porteChamp">
          <span>Mot de passe admin</span>
          <input type="password" value={motDePasse} autoComplete="current-password" required autoFocus
            onChange={(e) => { setMotDePasse(e.target.value); }} />
        </label>
        <button type="submit" className="porteBouton" disabled={enCours}>
          {enCours ? 'Vérification…' : 'Entrer'}
        </button>
        <p className="porteLiens"><a href="./">Ouvrir Plan sans l’admin</a></p>
      </form>
    </div>
  );
}

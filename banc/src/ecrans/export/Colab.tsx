// « Entrainer dans Colab » (etape 6 ; demande du proprietaire, 20 novembre 2026 : moins de gestes entre l'export et le depot du
// modele). Un bouton : le serveur fige le jeu et cree une cle d'entrainement, la page telecharge un carnet deja rempli. Dans Colab,
// « Tout executer » : le carnet lit le jeu, entraine et depose le modele a l'etape 3. Le zip a telecharger reste la, pour le faire a
// la main. Les cles vivantes se voient et se revoquent ici.

import type { Banc } from '../../App.js';
import { dateCourte, etatDuJeton, photosDuJeu, resteDuJeton } from '../../colab.js';
import { Icone } from '../../ui/Icones.js';
import { Section } from '../../ui/Page.js';
import type { useColab } from './useColab.js';

export function Colab({ banc, c, nomFormat, licence }: { banc: Banc; c: ReturnType<typeof useColab>; nomFormat: string; licence: 'apache' | 'agpl' }) {
  return (
    <Section titre="Entraîner dans Colab">
      <div className="pile-export colab">
        <button type="button" className="bouton principal grand" disabled={c.attente} onClick={() => { void c.entrainer(); }}>
          <Icone nom="exporter" /> {c.attente ? 'Préparation du jeu…' : <>Entraîner dans Colab · {nomFormat} <small>(carnet .ipynb)</small></>}
        </button>
        <p className="aide">Le banc fige ce jeu et télécharge un carnet déjà rempli. Ouvrez-le dans <a href="https://colab.research.google.com/" target="_blank" rel="noopener noreferrer">Google Colab</a> (Fichier › Importer le notebook), puis <b>Exécution › Tout exécuter</b> : il lit le jeu ici, entraîne, mesure le test et dépose le modèle à l’étape 3, où il ne reste qu’à l’activer.</p>
        {licence === 'agpl' && <p className="note avis-colab">YOLO d’Ultralytics, sous AGPL-3.0 : un modèle entraîné avec eux, servi dans une application, impose d’en publier le code ou d’acheter leur licence. Pour comparer.</p>}
        <p className="note avis-colab cle-colab"><b>Ce carnet contient une clé valable {c.heures} h : ne le partagez pas.</b> Elle ne permet que de lire ce jeu et de déposer un modèle ; révoquez-la ci-dessous si le carnet s’égare.</p>
        {c.carnet && <p className="note carnet-pret" role="status"><Icone nom="exporter" /> <code>{c.carnet}</code> est téléchargé : importez-le dans Colab et lancez « Tout exécuter ».</p>}
      </div>
      {c.jetons.length > 0 && <>
        <h4 className="titre-cles">Clés d’entraînement en cours <span className="compte-section">{c.jetons.length}</span></h4>
        <ul className="cles-colab">
          {c.jetons.map((j) => { const e = etatDuJeton(j); return (
            <li key={j.id} className={'cle-colab-ligne ' + e.etat}>
              <div className="titres-modele">
                <strong>{j.architecture.nom}{j.architecture.depart === 'zero' ? ' · de zéro' : ''} · {photosDuJeu(j.jeu)} photo(s)</strong>
                <small>Créée le {dateCourte(j.creeLe)} · {j.depose ? 'a servi' : `valable encore ${resteDuJeton(j, c.maintenant)}`}</small>
                <small className="etat-cle">{e.libelle}{e.etat === 'depose' && <> (<button type="button" className="lien" onClick={() => banc.aller('brouillon')}>étape 3</button>)</>}</small>
              </div>
              <span className="espace" />
              <button type="button" className="bouton" onClick={() => { void c.revoquer(j.id); }}>{j.depose ? 'Retirer' : 'Révoquer'}</button>
            </li>
          ); })}
        </ul>
      </>}
    </Section>
  );
}

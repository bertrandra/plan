// « Entrainer sur mon Mac » (etape 6 ; demande du proprietaire, 20 novembre 2026 : moins de gestes entre l'export et le depot du
// modele ; 21 novembre : l'entrainement se fait sur son Mac). Un bouton : le serveur fige le jeu et cree une cle d'entrainement, la
// page telecharge un script deja rempli. Dans le Terminal du Mac, une commande : le script installe ce qu'il faut dans un dossier a
// lui, lit le jeu, entraine et depose le modele a l'etape 3. Le zip a telecharger reste la, pour le faire a la main. Les cles
// vivantes se voient et se revoquent ici.

import type { Banc } from '../../App.js';
import { dateCourte, etatDuJeton, photosDuJeu, resteDuJeton } from '../../entrainement.js';
import { Icone } from '../../ui/Icones.js';
import { Section } from '../../ui/Page.js';
import type { useEntrainement } from './useEntrainement.js';

export function Entrainement({ banc, c, nomFormat, licence }: { banc: Banc; c: ReturnType<typeof useEntrainement>; nomFormat: string; licence: 'apache' | 'agpl' }) {
  return (
    <Section titre="Entraîner sur mon Mac">
      <div className="pile-export entrainement">
        <button type="button" className="bouton principal grand" disabled={c.attente} onClick={() => { void c.entrainer(); }}>
          <Icone nom="exporter" /> {c.attente ? 'Préparation du jeu…' : <>Entraîner sur mon Mac · {nomFormat} <small>(script .sh)</small></>}
        </button>
        <p className="aide">Le banc fige ce jeu et télécharge un script déjà rempli. Sur votre Mac, ouvrez <b>Terminal</b> et collez la commande affichée ci-dessous : le script installe ce qu’il lui faut dans un dossier à lui (<code>~/banc-entrainement</code>), lit le jeu ici, entraîne, mesure le test et dépose le modèle à l’étape 3, où il ne reste qu’à l’activer. Il lui faut Python 3.10 ou plus récent ; il dit comment l’installer s’il manque.</p>
        {licence === 'agpl' && <p className="note avis-entrainement">YOLO d’Ultralytics, sous AGPL-3.0 : un modèle entraîné avec eux, servi dans une application, impose d’en publier le code ou d’acheter leur licence. Pour comparer.</p>}
        <p className="note avis-entrainement avis-cle"><b>Ce script contient une clé valable {c.heures} h : ne le partagez pas.</b> Elle ne permet que de lire ce jeu et de déposer un modèle ; révoquez-la ci-dessous si le script s’égare. Un entraînement qui dure plus longtemps que la clé garde son modèle sur le Mac : il se dépose alors à la main, à l’étape 3.</p>
        {c.script && <div className="script-pret" role="status">
          <p className="note"><Icone nom="exporter" /> <code>{c.script.fichier}</code> est téléchargé. Dans Terminal, sur le Mac :</p>
          <div className="commande-script">
            <code>{c.script.commande}</code>
            <button type="button" className="bouton" onClick={() => { void c.copier(); }}>{c.copiee ? 'Copiée' : 'Copier la commande'}</button>
          </div>
          <p className="aide">Si le fichier n’est pas dans Téléchargements, remplacez <code>~/Downloads/</code> par son dossier. Relancer la même commande reprend où le script s’était arrêté.</p>
        </div>}
      </div>
      {c.jetons.length > 0 && <>
        <h4 className="titre-cles">Clés d’entraînement en cours <span className="compte-section">{c.jetons.length}</span></h4>
        <ul className="cles-entrainement">
          {c.jetons.map((j) => { const e = etatDuJeton(j); return (
            <li key={j.id} className={'cle-ligne ' + e.etat}>
              <div className="titres-modele">
                <strong>{j.architecture.nom}{j.architecture.depart === 'zero' ? ' · de zéro' : ''} · {photosDuJeu(j.jeu)} photo(s)</strong>
                <small>Clé <code>bj_{j.id.slice(0, 8)}…</code> · créée le {dateCourte(j.creeLe)} · {j.depose ? 'a servi' : `valable encore ${resteDuJeton(j, c.maintenant)}`}</small>
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

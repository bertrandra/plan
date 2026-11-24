// L'entree du mode Toit, posee sur la scene (MD/spec-mode-toit-3d.md, « Modifier ou ajouter ») : deux gestes dits en mots, jamais une
// icone seule. « Modifier » ouvre la session sur ce qui existe ; « Ajouter » l'ouvre sur le catalogue des pieces a poser. Les deux
// portent chacun sa couleur et son mot, les memes que dans le panneau du mode (app/toits/intention.ts).
//
// Elle remplace le bouton « Modifier la toiture » de la colonne des commandes de camera (retour du proprietaire, 24 novembre 2026 :
// « on ne sait pas ce qui modifie et ce qui cree ») : un geste n'existe qu'a un endroit (design-ui, §1).

import { useEffect, useRef } from 'react';
import { Icone } from '../icones.js';
import { showToast } from '../../shell/dialogs.js';
import { batimentVise, batimentsRetouchables, estRetouchable, prendreFocusDeSortie } from '../../app/toits/modeToit.js';
import type { RegistreCommandes } from '../../app/commandes.js';
import type { Magasin } from '../../app/magasin.js';

/** Au-dela, les noms ne tiennent plus sur une ligne : l'entree invite a toucher le batiment dans la scene. */
const NOMS_MAX = 3;

/**
 * Trois formes, selon ce que la parcelle porte :
 * - un batiment vise (le choisi, ou la seule maison du projet) : « Modifier <son nom> » et « Ajouter » ;
 * - plusieurs batiments, aucun choisi : un bouton par batiment, un toucher ouvre le mode sur lui (au-dela de trois, l'invitation a
 *   toucher le batiment dans la scene, qui le choisit) ;
 * - refusee pour une raison (un batiment voisin, la lecture seule) : grisee, avec sa raison dans l'infobulle et, au doigt (pas
 *   d'infobulle), dans un message au toucher.
 * Pendant une session (rien a dire), elle s'efface ; a la sortie du mode, « Modifier » reprend le focus.
 */
export function EntreeMaison({ commandes, magasin }: { commandes: RegistreCommandes; magasin: Magasin }) {
  const e = commandes.etat('toit.modifier'), ajout = commandes.etat('toit.ajouter'), ce = commandes.etat('toit.modifierCe');
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (ref.current && prendreFocusDeSortie()) ref.current.focus(); });
  const etat = magasin.store.getState().etat;
  const vise = batimentVise(etat.objects, etat.selectedKey);
  if (e.utilisable && estRetouchable(vise)) {
    const nom = vise.name || 'le bâtiment';
    return (
      <div className="entreeMaison" role="group" aria-label={nom}>
        <button ref={ref} id="terrasse3dModifierToit" data-commande="toit.modifier" data-intention="modifier" type="button" className="boutonEntreeMaison"
          aria-label={'Modifier ' + nom}
          title={'Modifier ' + nom + ' : son toit, ses murs, ce qui est posé dessus. Rien n’est créé, et rien ne change avant « Valider ».'}
          onClick={(ev) => { commandes.executer('toit.modifier', ev.currentTarget); }}>
          <Icone nom="crayon" taille={20} /><span>Modifier</span><span className="nomEntreeMaison">{nom}</span>
        </button>
        {ajout.utilisable && (
          <button id="terrasse3dAjouterMaison" data-commande="toit.ajouter" data-intention="ajouter" type="button" className="boutonEntreeMaison"
            aria-label={'Ajouter à ' + nom}
            title={'Ajouter à ' + nom + ' : une lucarne, une cheminée, une aile, un bow-window… Rien d’existant n’est touché.'}
            onClick={(ev) => { commandes.executer('toit.ajouter', ev.currentTarget); }}>
            <Icone nom="plus" taille={20} /><span>Ajouter</span>
          </button>
        )}
      </div>
    );
  }
  // Un batiment voisin choisi, la lecture seule : la raison se dit.
  if (vise && !e.utilisable && e.raison !== 'capacite' && 'message' in e) {
    const message = e.message;
    return (
      <div className="entreeMaison" role="group" aria-label="Modifier le bâtiment">
        <button ref={ref} id="terrasse3dModifierToit" data-commande="toit.modifier" data-intention="modifier" type="button" className="boutonEntreeMaison"
          aria-label={'Modifier — ' + message} aria-disabled="true" title={message} onClick={() => { showToast(message); }}>
          <Icone nom="crayon" taille={20} /><span>Modifier</span>
        </button>
      </div>
    );
  }
  // Plusieurs batiments, aucun choisi : on les nomme.
  const batiments = ce.utilisable ? batimentsRetouchables(etat.objects) : [];
  if (!batiments.length) return null;
  if (batiments.length > NOMS_MAX) return <p className="entreeMaison inviteEntreeMaison" role="note"><Icone nom="crayon" taille={18} />Touchez un bâtiment de votre parcelle pour le modifier.</p>;
  return (
    <div className="entreeMaison" role="group" aria-label="Que voulez-vous modifier ?">
      <span className="titreEntreeMaison"><Icone nom="crayon" taille={18} />Modifier</span>
      {batiments.map((b, i) => (
        <button key={b.key} ref={i === 0 ? ref : undefined} type="button" className="boutonEntreeMaison" data-commande="toit.modifierCe" data-intention="modifier" data-cle={b.key}
          title={'Modifier ' + (b.name || 'ce bâtiment') + ' : rien n’est créé, et rien ne change avant « Valider ».'}
          onClick={(ev) => { commandes.executer('toit.modifierCe', ev.currentTarget); }}>{b.name || 'Bâtiment ' + (i + 1)}</button>
      ))}
    </div>
  );
}

// L'entree du mode Toit, posee sur la scene (MD/spec-mode-toit-3d.md, « Modifier ou ajouter ») : deux gestes dits en mots, jamais une
// icone seule. « Modifier » ouvre la session sur ce qui existe ; « Ajouter » l'ouvre sur le catalogue des pieces a poser. Les deux
// portent chacun sa couleur et son mot, les memes que dans l'atelier du toit (facade/modeToit/controleurToit.ts::MOTS_INTENTION).
//
// Elle remplace le bouton « Modifier la toiture » de la colonne des commandes de camera (retour du proprietaire, 24 novembre 2026 :
// « on ne sait pas ce qui modifie et ce qui cree ») : un geste n'existe qu'a un endroit (design-ui, §1).

import { useEffect, useRef } from 'react';
import { Icone } from '../icones.js';
import { showToast } from '../../shell/dialogs.js';
import { resumeDuToit } from '../../facade/modeToit/gestes.js';
import { batimentVise, batimentsRetouchables, estRetouchable, prendreFocusDeSortie } from '../../app/toits/modeToit.js';
import type { RegistreCommandes } from '../../app/commandes.js';
import type { Magasin } from '../../app/magasin.js';

/** Au-dela, les noms ne tiennent plus sur une ligne : l'entree invite a toucher le batiment dans la scene. */
const NOMS_MAX = 3;

/**
 * Trois formes, selon ce que la parcelle porte :
 * - un batiment vise (le choisi, ou la seule maison du projet) : une carte (au telephone, une feuille basse) avec son nom, l'etat de son
 *   toit en une ligne, et deux gros boutons a sous-titre, « Modifier le toit » et « Ajouter au toit » (maquette du 27 novembre 2026) ;
 * - plusieurs batiments, aucun choisi : un bouton par batiment, un toucher ouvre le mode sur lui (au-dela de trois, l'invitation a
 *   toucher le batiment dans la scene, qui le choisit) ;
 * - refusee pour une raison (un batiment voisin, la lecture seule) : grisee, avec sa raison dans l'infobulle et, au doigt (pas
 *   d'infobulle), dans un message au toucher.
 * Pendant une session (rien a dire), elle s'efface ; a la sortie du mode, « Modifier » reprend le focus.
 */
export function EntreeMaison({ commandes, magasin }: { commandes: RegistreCommandes; magasin: Magasin }) {
  const e = commandes.etat('toit.modifier'), ajout = commandes.etat('toit.ajouter'), ce = commandes.etat('toit.modifierCe');
  const ref = useRef<HTMLButtonElement>(null);
  // Le focus se rend apres le rendu de l'atelier du toit (Z10, une autre racine) : tant qu'il n'a pas retire `data-mode-toit`, la feuille de
  // style cache encore cette entree, et un focus pose maintenant serait perdu.
  useEffect(() => { if (ref.current && prendreFocusDeSortie()) { const b = ref.current; setTimeout(() => { b.focus(); }, 0); } });
  const etat = magasin.store.getState().etat;
  const vise = batimentVise(etat.objects, etat.selectedKey);
  if (e.utilisable && estRetouchable(vise)) {
    const nom = vise.name || 'le bâtiment';
    const resume = resumeDuToit(vise);
    return (
      <div className="entreeMaison carteMaison" role="group" aria-label={nom}>
        <div className="enteteCarteMaison">
          <span className="nomCarteMaison">{vise.name || 'Bâtiment'}</span>
          {resume && <span className="etatCarteMaison">{resume}</span>}
        </div>
        <div className="boutonsCarteMaison">
          <button ref={ref} id="terrasse3dModifierToit" data-commande="toit.modifier" data-intention="modifier" type="button" className="boutonEntreeMaison"
            title={'Modifier le toit de ' + nom + ' : rien n’est créé, et rien ne change avant « Valider ».'}
            onClick={(ev) => { commandes.executer('toit.modifier', ev.currentTarget); }}>
            <Icone nom="crayon" taille={24} />
            <span className="textesEntree"><span className="titreEntree">Modifier le toit</span><span className="sousTitreEntree">Sa forme, sa hauteur, son sens</span></span>
          </button>
          {ajout.utilisable && (
            <button id="terrasse3dAjouterMaison" data-commande="toit.ajouter" data-intention="ajouter" type="button" className="boutonEntreeMaison"
              title={'Ajouter au toit de ' + nom + ' : rien d’existant n’est touché.'}
              onClick={(ev) => { commandes.executer('toit.ajouter', ev.currentTarget); }}>
              <Icone nom="plus" taille={24} />
              <span className="textesEntree"><span className="titreEntree">Ajouter au toit</span><span className="sousTitreEntree">Lucarne, cheminée, auvent…</span></span>
            </button>
          )}
        </div>
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

// « Photographier une facade » depuis la Vue 3D (decision du proprietaire, 14 novembre 2026 : dans la 3D de la maison, choisir une
// facade, prendre une ou plusieurs photos, et la photo se pose sur la facade) : la commande de l'inspecteur (`facade.photographier`),
// la meme, sur la scene ; l'inspecteur n'y est pas. Sans mur designe, elle ouvre l'ecran de prise de l'audit sur la Vue 3D, ou la
// facade se choisit en la touchant ; la photo s'y pose d'elle-meme a la fin du calcul (validation.ts::poserLaPrise).

import { Icone } from '../icones.js';
import { showToast } from '../../shell/dialogs.js';
import { sessionToit } from '../../app/toits/modeToit.js';
import type { RegistreCommandes } from '../../app/commandes.js';

const ID = 'facade.photographier';

/**
 * Le bouton des commandes de la scene. Comme « Modifier la toiture » : sans batiment choisi il n'a rien a dire et s'efface ; refuse
 * pour une raison (un batiment hors de la parcelle, un projet sans parcelle, la lecture seule), il reste grise avec elle, dans
 * l'infobulle et, au doigt, dans un message au toucher.
 */
export function BoutonPhotographierFacade({ commandes }: { commandes: RegistreCommandes }) {
  // Le mode Toit a ses propres touchers sur la scene : l'audit ne s'ouvre pas par-dessus.
  if (commandes.effacee(ID) || sessionToit()) return null;
  const e = commandes.etat(ID);
  if (!e.utilisable) {
    if (!('message' in e)) return null;
    const message = e.message;
    return (
      <button id="terrasse3dPhotographier" data-commande={ID} type="button" className="bouton3d" aria-label={'Photographier une façade — ' + message}
        aria-disabled="true" title={message} onClick={() => { showToast(message); }}>
        <Icone nom="camera" taille={20} />
      </button>
    );
  }
  return (
    <button id="terrasse3dPhotographier" data-commande={ID} type="button" className="bouton3d" aria-label="Photographier une façade"
      title="Photographier une façade : touchez-la dans la 3D, prenez une ou plusieurs photos ; elles se posent sur la façade (Ctrl+Z pour annuler)"
      onClick={(ev) => { commandes.executer(ID, ev.currentTarget); }}>
      <Icone nom="camera" taille={20} />
    </button>
  );
}

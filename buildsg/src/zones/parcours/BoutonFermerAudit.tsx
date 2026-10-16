// Z8, l'audit de la parcelle : le bouton qui en sort, partage par la prise et les propositions. La
// liste avait « Fermer » dans son pied ; la prise et les propositions, posees sur la Vue 3D, n'avaient
// que la touche Echap (demande de l'utilisateur du 16 octobre). Rien n'est perdu a la fermeture : la
// capture reste dans le brouillon de l'appareil.

import { Icone } from '../icones.js';

export function BoutonFermerAudit({ fermer }: { fermer: () => void }) {
  return (
    <button type="button" className="secondary small boutonFermerAudit" data-controle="auditParcelle.fermer" aria-label="Fermer l’audit de la parcelle" onClick={fermer}>
      <Icone nom="fermer" taille={16} /><span>Fermer</span>
    </button>
  );
}

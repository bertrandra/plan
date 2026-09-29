// Un bouton lie a une commande du registre (app/commandes.ts) : il disparait quand la capacite manque,
// se grise avec son motif en infobulle pour une permission ou un quota, se grise sans message quand
// le contexte ne s'y prete pas. Les trois refus de la palette, pour un bouton de panneau.

import type { RegistreCommandes } from '../../app/commandes.js';

interface Props {
  commandes: RegistreCommandes;
  id: string;
  className?: string;
  children: React.ReactNode;
  /** Remplace le libelle pendant un traitement, et grise le bouton. */
  enCours?: string | false | undefined;
  domId?: string;
}

export function BoutonCommande({ commandes, id, className, children, enCours, domId }: Props) {
  if (commandes.effacee(id)) return null;
  const etat = commandes.etat(id);
  const message = 'message' in etat ? etat.message : undefined;
  return (
    <button type="button" id={domId} className={className} disabled={!etat.utilisable || !!enCours} title={message}
      onClick={(e) => { commandes.executer(id, e.currentTarget); }}>
      {enCours || children}
    </button>
  );
}

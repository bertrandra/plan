// Les commandes du dossier de declaration prealable (lot L5) : rediger, valider et retirer le texte d'une piece, choisir et retirer
// une photographie. Elles vivent dans le dialogue de la declaration (zones/parcours/TextesDossier.tsx), dans les trois classes ; leur
// valeur dit la piece. Toutes ecrivent le projet : le droit d'ecriture les porte, et la lecture seule les grise avec sa raison.

import { PERMISSION_ECRITURE } from '../acces.js';
import { piecePhoto, pieceTexte, type ServiceDossier } from './serviceDossier.js';
import type { RegistreCommandes } from '../commandes.js';

export function brancherDossier(cmd: RegistreCommandes, dossier: ServiceDossier): void {
  const parcelle = () => !!dossier.parcelle();
  const sansParcelle = () => (parcelle() ? null : 'Créez d’abord le plan depuis une adresse : le dossier se range sur la parcelle du projet.');
  cmd.declarer({
    id: 'export.redigerTexte', libelle: 'Rédiger avec Claude', groupe: 'export', permission: PERMISSION_ECRITURE,
    actif: () => parcelle() && dossier.redactionPossible() && !dossier.enCours(),
    raisonInactive: () => sansParcelle() ?? (dossier.redactionPossible() ? null : 'La rédaction par Claude passe par le serveur de Plan : connectez-vous à votre organisation.'),
    executer: (_s, cible) => { const p = pieceTexte(cible?.valeur); if (p) void dossier.rediger(p); },
  });
  cmd.declarer({
    id: 'export.validerTexte', libelle: 'Valider le texte', groupe: 'export', permission: PERMISSION_ECRITURE,
    actif: parcelle, raisonInactive: sansParcelle,
    executer: (_s, cible) => { const p = pieceTexte(cible?.valeur); if (p) dossier.valider(p); },
  });
  cmd.declarer({
    id: 'export.retirerTexte', libelle: 'Retirer le texte', groupe: 'export', permission: PERMISSION_ECRITURE,
    actif: parcelle, raisonInactive: sansParcelle,
    executer: (_s, cible) => { const p = pieceTexte(cible?.valeur); if (p) dossier.retirer(p); },
  });
  cmd.declarer({
    id: 'export.choisirPhoto', libelle: 'Choisir la photographie', groupe: 'export', permission: PERMISSION_ECRITURE,
    actif: parcelle, raisonInactive: sansParcelle,
    executer: (_s, cible) => { if (cible?.valeur && piecePhoto(cible.valeur)) void dossier.choisirPhoto(cible.valeur); },
  });
  cmd.declarer({
    id: 'export.retirerPhoto', libelle: 'Retirer la photographie', groupe: 'export', permission: PERMISSION_ECRITURE,
    actif: parcelle, raisonInactive: sansParcelle,
    executer: (_s, cible) => { const p = piecePhoto(cible?.valeur); if (p) dossier.retirerPhoto(p); },
  });
}

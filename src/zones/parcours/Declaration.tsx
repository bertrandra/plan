// Z8, la declaration prealable (menu Exporter) : qui declare, son adresse, celle du terrain, puis le
// dossier (cerfa 13703 et ses pieces).
//
// Ce n'est pas une propriete d'un objet mais un dossier du projet : il s'ouvre la ou le dossier se
// genere, pas dans l'inspecteur de la parcelle. Ses champs restent ceux de ui/champs/declaration.ts,
// rendus par le meme composant que l'inspecteur et ecrits par le meme service, sur la parcelle du
// projet (`declaration`) : rien n'est reecrit ici, et un fichier ancien se relit tel quel.

import { useStore } from 'zustand';
import { sectionDeclaration } from '../../ui/champs/declaration.js';
import { ListeChamps, Tactile, useServiceLocal } from '../composants/Champs.js';
import type { ServiceChampsParcours } from '../../app/parcours.js';
import type { Magasin } from '../../app/magasin.js';
import type { RegistreCommandes } from '../../app/commandes.js';
import type { ServiceDossier } from '../../app/declaration/serviceDossier.js';
import { TextesDossier } from './TextesDossier.js';

/** `dossier` : les textes, les photographies et la relecture du dossier (lot L5), sous les champs du declarant. */
export function Declaration({ inspecteur, magasin, fermer, commandes, dossier }: {
  inspecteur: ServiceChampsParcours; magasin: Magasin; fermer: () => void; commandes: RegistreCommandes; dossier?: ServiceDossier | undefined;
}) {
  const tactile = useStore(magasin.store, (s) => s.classe) !== 'large';
  const service = useServiceLocal(inspecteur);
  const parcelle = inspecteur.parcelle();
  const c = parcelle ? inspecteur.contexte(parcelle) : null;
  const section = c ? sectionDeclaration(c) : null;
  return (
    <div className="dialogueImperatif dialogueDeclaration" role="dialog" aria-modal="true" aria-label="Déclaration préalable">
      <div className="titreParcours">Déclaration préalable</div>
      {section && c
        ? <>
            <div className="sousTitreParcours">{section.explication}</div>
            <Tactile.Provider value={tactile}>
              <div className="hoteChamps" data-section={section.id}>
                <div className="champs"><ListeChamps champs={section.champs} c={c} inspecteur={service} /></div>
              </div>
            </Tactile.Provider>
            {dossier && <TextesDossier dossier={dossier} commandes={commandes} magasin={magasin} fermer={fermer} />}
          </>
        : <div className="sousTitreParcours">Le plan n’a pas de parcelle : créez-le depuis une adresse (Fichier › Nouveau plan depuis une adresse) pour remplir la déclaration.</div>}
      <div className="piedDialogue">
        <button type="button" data-controle="declaration.fermer" className="secondary" onClick={fermer}>Fermer</button>
      </div>
    </div>
  );
}

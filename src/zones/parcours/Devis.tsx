// Z8, le devis (menu Exporter) : qui l'etablit, le client, le numero, puis le PDF.
//
// Comme la declaration prealable : un dialogue du projet, pas une propriete d'un objet. Ses champs sont
// ceux de ui/champs/devis.ts, rendus par le meme composant que l'inspecteur et ecrits par le meme
// service ; le client sur la parcelle du projet (`declaration`), l'emetteur dans ce navigateur.

import { useStore } from 'zustand';
import { sectionDevis, estChampClient, type PreferencesDevis } from '../../ui/champs/devis.js';
import type { RegistreCommandes } from '../../app/commandes.js';
import { terrassesDuDevis } from '../../app/devis.js';
import { estTerrasse } from '../../model/fonctions.js';
import { ListeChamps, Tactile, useServiceLocal } from '../composants/Champs.js';
import type { ServiceChampsParcours } from '../../app/parcours.js';
import type { Magasin } from '../../app/magasin.js';

export function Devis({ inspecteur, preferences, magasin, commandes, fermer }: {
  inspecteur: ServiceChampsParcours; preferences: PreferencesDevis; magasin: Magasin; commandes: RegistreCommandes; fermer: () => void;
}) {
  const tactile = useStore(magasin.store, (s) => s.classe) !== 'large';
  const service = useServiceLocal(inspecteur);
  const objets = magasin.store.getState().etat.objects;
  // Sans parcelle, les champs se lisent sur la premiere terrasse : seuls ceux de l'emetteur s'y montrent.
  const hote = inspecteur.parcelle() ?? objets.find(estTerrasse);
  const c = hote ? inspecteur.contexte(hote) : null;
  const terrasses = terrassesDuDevis(objets);
  const section = c ? sectionDevis(preferences, terrasses) : null;
  const etatDevis = commandes.etat('export.devis');
  return (
    <div className="dialogueImperatif dialogueDevis" role="dialog" aria-modal="true" aria-label="Devis">
      <div className="titreParcours">Devis</div>
      {section && c
        ? <>
            <div className="sousTitreParcours">{section.explication}</div>
            {!c.parcelle && <div className="sousTitreParcours">Le plan n’a pas de parcelle : le client et l’adresse du chantier restent à compléter sur le devis.</div>}
            {/* L'emetteur d'abord ; le client, facultatif, replie a part (audit UX de la 5.45.0, constat 10). */}
            <Tactile.Provider value={tactile}>
              <div className="hoteChamps" data-section={section.id}>
                <div className="champs"><ListeChamps champs={section.champs.filter((ch) => !estChampClient(ch))} c={c} inspecteur={service} /></div>
                {c.parcelle && (
                  <details className="clientDevis">
                    <summary data-controle="devis.client">Client <span className="facultatif">(facultatif)</span></summary>
                    <div className="champs"><ListeChamps champs={section.champs.filter(estChampClient)} c={c} inspecteur={service} /></div>
                  </details>
                )}
              </div>
            </Tactile.Provider>
          </>
        : <div className="sousTitreParcours">Le plan n’a pas de terrasse : dessinez-en une (outil « Terrasse » de la palette) pour en faire le devis.</div>}
      {/* Le geste du dialogue, plein, au pied ; « Fermer » en secondaire (constat 10). La meme commande que le menu Exporter. */}
      <div className="piedDialogue">
        <button type="button" data-controle="devis.fermer" className="secondary" onClick={fermer}>Fermer</button>
        {!commandes.effacee('export.devis') && (
          <button type="button" data-commande="export.devis" disabled={!section || !terrasses.length || !etatDevis.utilisable}
            title={!etatDevis.utilisable && 'message' in etatDevis ? etatDevis.message : undefined}
            onClick={(e) => { commandes.executer('export.devis', e.currentTarget); }}>Télécharger le devis</button>
        )}
      </div>
    </div>
  );
}

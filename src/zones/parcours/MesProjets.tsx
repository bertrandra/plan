// Z8, « Mes projets » (lot 2 de la simplification de l'IHM, 16 novembre 2026 ; app/mesProjets.ts).
//
// Les projets de la personne, dans Plan, au lieu d'un lien vers la plateforme : chacun s'ouvre d'un toucher, celui qui est ouvert le
// dit, et l'on part d'une adresse sans quitter la liste. Le compte et la limite de l'abonnement s'y lisent ; limite atteinte, la phrase
// dit quoi faire et « Voir les offres » mene a la vitrine de la plateforme (`<BACKPROD_API_URL>/?product=plan`). La plateforme reste a
// un lien, pour ce que Plan ne fait pas (renommer, gerer les membres).
//
// La zone n'ouvre rien elle-meme : « Ouvrir » passe par `projet.ouvrir` (qui demande avant de perdre des modifications), « Depuis une
// adresse » par la commande du registre, qui porte capacite, permission et quota.

import { useStore } from 'zustand';
import { phraseLimiteAtteinte } from '../../plateforme/quotaProjets.js';
import type { RegistreCommandes } from '../../app/commandes.js';
import type { Magasin } from '../../app/magasin.js';
import type { ServiceMesProjets } from '../../app/parcours.js';

/** « le 16 novembre 2026 » : la date d'une modification, en clair. */
function dateCourte(iso: string | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
}

export function MesProjets({ service, commandes, magasin, fermer }: { service: ServiceMesProjets; commandes: RegistreCommandes; magasin: Magasin; fermer: () => void }) {
  const p = useStore(magasin.store, (s) => s.projet);
  const doigt = useStore(magasin.store, (s) => s.classe) !== 'large';
  const q = p.quota;
  const plein = !!q && q.limite !== null && q.utilise >= q.limite;
  const compte = q ? q.utilise + ' projet' + (q.utilise > 1 ? 's' : '') + (q.limite !== null ? ' sur ' + q.limite + ' autorisé' + (q.limite > 1 ? 's' : '') + ' par l’abonnement' : '') : '';
  const adresse = commandes.etat('projet.depuisAdresse');
  const tries = [...p.liste].sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''));
  return (
    <div className="dialogueImperatif dialogueMesProjets" role="dialog" aria-modal="true" aria-label="Mes projets">
      <div className="titreParcours">Mes projets</div>
      {compte && <div className="sousTitreParcours">{compte}{plein ? ' · limite atteinte' : ''}</div>}
      {plein && (
        <div className="avertissementPartage limiteProjets" role="note">
          <p>{phraseLimiteAtteinte()}</p>
          <a className="lienOffres" data-controle="mesProjets.offres" href={service.offres()} target="_blank" rel="noopener">Voir les offres<span aria-hidden="true"> ↗</span></a>
        </div>
      )}
      {tries.length ? (
        <ul className="listeMesProjets" aria-label="Projets">
          {tries.map((m) => {
            const ouvert = p.courant?.id === m.id;
            const date = dateCourte(m.updatedAt);
            return (
              <li key={m.id}>
                <button type="button" data-controle="mesProjets.ouvrir" className={'ligneProjet' + (ouvert ? ' ouvert' : '')} disabled={ouvert} aria-current={ouvert ? 'true' : undefined}
                  onClick={() => { fermer(); service.ouvrir(m.id); }}>
                  <span className="nomLigneProjet">{m.name}</span>
                  <span className="noteLigneProjet">{ouvert ? 'ouvert' : date ? 'modifié le ' + date : ''}</span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : <p className="sousTitreParcours">Aucun projet enregistré pour l’instant.</p>}
      <div className="piedDialogue">
        {!commandes.effacee('projet.depuisAdresse') && (
          <button type="button" data-commande="projet.depuisAdresse" className="secondary" disabled={!adresse.utilisable}
            title={!adresse.utilisable && 'message' in adresse ? adresse.message : undefined}
            onClick={(e) => { fermer(); commandes.executer('projet.depuisAdresse', e.currentTarget); }}>
            Nouveau depuis une adresse
          </button>
        )}
        <a className="compteLien" data-controle="mesProjets.plateforme" href={service.plateforme()} target="_blank" rel="noopener">Gérer sur la plateforme<span aria-hidden="true"> ↗</span></a>
        <button type="button" data-controle="mesProjets.fermer" onClick={fermer}>Fermer</button>
      </div>
      {/* Au doigt, la raison d'un refus s'ecrit sous le groupe ; celle de la limite est deja dite en tete du dialogue. */}
      {doigt && !commandes.effacee('projet.depuisAdresse') && !adresse.utilisable && 'message' in adresse && adresse.raison !== 'quota' && adresse.message && <p className="refusAuDoigt">{adresse.message}</p>}
    </div>
  );
}

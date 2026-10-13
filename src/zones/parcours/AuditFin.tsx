// Z8, la fin de la promenade en mode audit (MD/spec-audit.md §18.5) : la liste des batiments marques,
// a revoir ou a retirer, puis un seul fichier partage par le telephone (app/audit/controleur.ts).

import { useState } from 'react';
import { CATEGORIES_AUDIT, PROBLEMES_AUDIT } from '../../model/audit.js';
import { titreCas, useSuivrePromenade } from './AuditCas.js';
import type { Promenade } from '../../app/audit/promenade.js';

interface Props {
  promenade: Promenade;
  modifier: (cle: string) => void;
  retirer: (cle: string) => void;
  partager: () => Promise<void>;
  fermer: () => void;
}

const libelleCategorie = (code: string) => CATEGORIES_AUDIT.find((k) => k.code === code)?.libelle ?? code;
const libelleProbleme = (code: string) => PROBLEMES_AUDIT.find((p) => p.code === code)?.libelle ?? code;

export function AuditFin({ promenade, modifier, retirer, partager, fermer }: Props) {
  useSuivrePromenade(promenade);
  const [envoi, setEnvoi] = useState(false);
  const cas = promenade.liste();
  const n = cas.length;
  return (
    <div className="dialogueImperatif dialogueAudit" role="dialog" aria-modal="true" aria-label="Bâtiments notés">
      <div className="titreParcours">{n ? n + ' bâtiment' + (n > 1 ? 's' : '') + ' noté' + (n > 1 ? 's' : '') : 'Aucun bâtiment noté'}</div>
      <div className="sousTitreParcours">
        {n ? 'Revoyez-les, puis partagez le fichier de la promenade : un seul fichier pour tous les cas, photos comprises.'
          : 'Touchez un bâtiment dans la Vue 3D pour le marquer ; un appui long ouvre sa fiche.'}
      </div>
      {n > 0 && <ul className="listeCas">
        {cas.map((c) => (
          <li key={c.id}>
            <div className="texteCas">
              <div>{titreCas(c)}</div>
              <div className="detailCas">{libelleCategorie(c.constat.categorie)
                + (c.constat.problemes.length ? ' : ' + c.constat.problemes.map(libelleProbleme).join(', ') : '')
                + (c.constat.photo ? ' · photo' : '') + (c.constat.note ? ' · note' : '')}</div>
            </div>
            <button type="button" className="secondary small" data-controle="audit.modifier" aria-label={'Modifier la fiche de ' + titreCas(c)} onClick={() => modifier(c.cle)}>Modifier</button>
            <button type="button" className="secondary small" data-controle="audit.retirer" aria-label={'Retirer ' + titreCas(c)} onClick={() => retirer(c.cle)}>Retirer</button>
          </li>
        ))}
      </ul>}
      <div className="piedDialogue">
        <button type="button" className="secondary" data-controle="audit.continuer" onClick={fermer}>Continuer la promenade</button>
        <button type="button" data-controle="audit.partager" disabled={!n || envoi}
          onClick={() => { setEnvoi(true); void partager().finally(() => setEnvoi(false)); }}>{envoi ? 'Préparation du fichier…' : 'Partager le fichier'}</button>
      </div>
    </div>
  );
}

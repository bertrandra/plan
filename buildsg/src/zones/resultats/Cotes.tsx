// Z6, onglet Cotes : le brouillon de l'outil de cotation, puis la liste des cotes posees.
//
// Le brouillon — le cote de reference choisi, les coins designes — vit dans
// `interaction/outilMesure.ts` : une cote n'entre dans le plan qu'au moment ou on la valide, et
// « Annuler » la fait disparaitre sans trace. Les cotes posees, elles, sont des donnees du projet :
// toute modification passe par le service, s'annule et marque le projet modifie.

import { mesure } from '../../interaction/outilMesure.js';
import { BoutonCommande } from '../composants/BoutonCommande.js';
import type { Resultats } from '../../app/resultats.js';
import type { RegistreCommandes } from '../../app/commandes.js';

function Brouillon({ resultats }: { resultats: Resultats }) {
  const choixRef = mesure.pointage && mesure.pointage.mode === 'ref';
  const choixCibles = mesure.pointage && mesure.pointage.mode === 'target';
  return (
    <div id="measureControls">
      <div className="hint" style={{ marginBottom: 8 }}>Choisis un segment de référence et l'extrémité d'origine, puis sélectionne un ou plusieurs
        coins sur le plan : pour chacun, la mesure est la distance entre son point projeté (perpendiculaire au segment) et l'origine choisie.</div>
      <button type="button" className="secondary small" disabled={!!choixRef} onClick={() => resultats.pointer('ref', false)}>
        {choixRef ? 'Clique sur un côté du plan…' : 'Choisir le segment de référence'}
      </button>
      <div className="infoCote">{'Référence : ' + resultats.refLabel(mesure.ref)}</div>
      <label className="origineCote">Origine (extrémité du segment) :{' '}
        <select value={mesure.startEnd} onChange={(e) => resultats.choisirOrigine(e.target.value)}>
          {['A', 'B'].map(v => <option key={v} value={v}>{'Extrémité ' + v}</option>)}
        </select>
      </label>
      <button type="button" className="secondary small" disabled={!mesure.ref} title={!mesure.ref ? 'Choisis d\'abord le segment de reference' : ''}
        onClick={() => {
          // Pendant le pointage, le meme bouton termine.
          if (choixCibles) { resultats.arreterPointage(); return; }
          mesure.cibles = [];
          resultats.pointer('target', true);
        }}>
        {choixCibles ? 'Clique des coins sur le plan… (reclique pour finir)' : 'Sélectionner des coins'}
      </button>
      <div className="infoCote">{'Points sélectionnés : ' + (mesure.cibles.length ? mesure.cibles.map(resultats.targetLabel).join(', ') : '(aucun)')}</div>
      <br />
      <button type="button" disabled={!mesure.ref || mesure.cibles.length === 0} onClick={() => resultats.ajouterCotes()}>Ajouter les mesures</button>
    </div>
  );
}

export function Cotes({ resultats, commandes }: { resultats: Resultats; commandes: RegistreCommandes }) {
  const cotes = resultats.etat.measures;
  return (
    <>
      <div className="sectionTitle">Mesure</div>
      <Brouillon resultats={resultats} />
      <table className="attrTable" id="measureResultsTable"><tbody>
        <tr><th>Référence</th><th>Point</th><th>Origine</th><th>Perpendiculaire</th><th>Le long (depuis origine)</th><th>Affichage</th><th>Afficher</th><th></th></tr>
        {cotes.map(m => {
          const g = resultats.geometrieCote(m);
          const mode = m.displayMode || 'along';
          return (
            <tr key={m.id}>
              <td>{resultats.refLabel({ objKey: m.refObjKey, segIndex: m.refSegIndex })}</td>
              <td>{resultats.targetLabel({ objKey: m.targetObjKey, ptIndex: m.targetPtIndex })}</td>
              <td><button type="button" className="secondary small" title="Changer l'extremite d'origine de cette mesure (A <-> B)"
                onClick={() => resultats.modifierCote(m.id, x => { x.startEnd = x.startEnd === 'A' ? 'B' : 'A'; })}>{'Extrémité ' + m.startEnd + ' ⇄'}</button></td>
              <td style={{ fontWeight: mode === 'perp' ? 700 : 400 }}>{g ? g.perp.toFixed(2) + ' m' : '—'}</td>
              <td style={{ fontWeight: mode === 'along' ? 700 : 400 }}>{g ? g.along.toFixed(2) + ' m' : '—'}</td>
              <td><button type="button" className="secondary small" title="Choisir quelle valeur est affichee sur le plan pour cette mesure"
                onClick={() => resultats.modifierCote(m.id, x => { x.displayMode = (x.displayMode || 'along') === 'along' ? 'perp' : 'along'; })}>
                {(mode === 'along' ? 'Le long' : 'Perpendiculaire') + ' ⇄'}</button></td>
              <td><input type="checkbox" checked={!!m.show} aria-label="Afficher sur le plan"
                onChange={(e) => { const v = e.target.checked; resultats.modifierCote(m.id, x => { x.show = v; }); }} /></td>
              <td><button type="button" className="secondary small" onClick={() => resultats.supprimerCote(m.id)}>Supprimer</button></td>
            </tr>
          );
        })}
      </tbody></table>
      <div className="controls">
        <BoutonCommande commandes={commandes} id="mesure.recalculer" className="secondary small">Recalculer les mesures</BoutonCommande>
        <BoutonCommande commandes={commandes} id="mesure.effacer" className="secondary small">Effacer les mesures</BoutonCommande>
      </div>
      <div className="hint">Les mesures se recalculent automatiquement à chaque modification du plan ; ce bouton force un rafraîchissement immédiat du tableau si besoin.</div>
      <div className="hint">Mesure perpendiculaire à un segment de référence (souvent un côté de la parcelle). Les traits fins gris et les cotes s'affichent sur le plan, à l'extérieur de la parcelle.</div>
    </>
  );
}

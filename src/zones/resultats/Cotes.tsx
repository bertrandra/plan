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

/**
 * Le brouillon d'une cote : reference, origine, coins, puis l'ajout. Chaque geste est une commande
 * (app/ecouteurs/cibles.ts) : grisee sans le droit d'ecrire, comme « Nouvelle cote ».
 */
function Brouillon({ resultats, commandes }: { resultats: Resultats; commandes: RegistreCommandes }) {
  const utilisable = (id: string) => commandes.etat(id).utilisable;
  const choixRef = mesure.pointage && mesure.pointage.mode === 'ref';
  const choixCibles = mesure.pointage && mesure.pointage.mode === 'target';
  return (
    <div id="measureControls">
      <div className="hint" style={{ marginBottom: 8 }}>Choisis un segment de référence et l'extrémité d'origine, puis sélectionne un ou plusieurs
        coins sur le plan : pour chacun, la mesure est la distance entre son point projeté (perpendiculaire au segment) et l'origine choisie.</div>
      <button type="button" data-commande="mesure.choisirReference" className="secondary small" disabled={!utilisable('mesure.choisirReference')} onClick={() => commandes.executer('mesure.choisirReference')}>
        {choixRef ? 'Clique sur un côté du plan…' : 'Choisir le segment de référence'}
      </button>
      <div className="infoCote">{'Référence : ' + resultats.refLabel(mesure.ref)}</div>
      <label className="origineCote">Origine (extrémité du segment) :{' '}
        <select data-commande="mesure.origine" disabled={!utilisable('mesure.origine')} value={mesure.startEnd} onChange={(e) => commandes.executer('mesure.origine', e.currentTarget, { valeur: e.target.value })}>
          {['A', 'B'].map(v => <option key={v} value={v}>{'Extrémité ' + v}</option>)}
        </select>
      </label>
      <button type="button" data-commande="mesure.selectionnerCoins" className="secondary small" disabled={!utilisable('mesure.selectionnerCoins')}
        title={!mesure.ref ? 'Choisis d\'abord le segment de reference' : ''} onClick={() => commandes.executer('mesure.selectionnerCoins')}>
        {choixCibles ? 'Clique des coins sur le plan… (reclique pour finir)' : 'Sélectionner des coins'}
      </button>
      <div className="infoCote">{'Points sélectionnés : ' + (mesure.cibles.length ? mesure.cibles.map(resultats.targetLabel).join(', ') : '(aucun)')}</div>
      <br />
      <button type="button" data-commande="mesure.ajouter" disabled={!utilisable('mesure.ajouter')} onClick={() => commandes.executer('mesure.ajouter')}>Ajouter les mesures</button>
    </div>
  );
}

export function Cotes({ resultats, commandes }: { resultats: Resultats; commandes: RegistreCommandes }) {
  const cotes = resultats.etat.measures;
  // Les gestes sur une cote existante modifient le projet : grises sans le droit d'ecrire.
  const ecrire = commandes.etat('mesure.supprimer').utilisable;
  return (
    <>
      <div className="sectionTitle">Mesure</div>
      <Brouillon resultats={resultats} commandes={commandes} />
      <table className="attrTable" id="measureResultsTable"><tbody>
        <tr><th>Référence</th><th>Point</th><th>Origine</th><th>Perpendiculaire</th><th>Le long (depuis origine)</th><th>Affichage</th><th>Afficher</th><th></th></tr>
        {cotes.map(m => {
          const g = resultats.geometrieCote(m);
          const mode = m.displayMode || 'along';
          return (
            <tr key={m.id} data-instance={m.id}>
              <td>{resultats.refLabel({ objKey: m.refObjKey, segIndex: m.refSegIndex })}</td>
              <td>{resultats.targetLabel({ objKey: m.targetObjKey, ptIndex: m.targetPtIndex })}</td>
              <td><button type="button" data-commande="mesure.inverserOrigine" disabled={!ecrire} className="secondary small" data-nom="Inverser l’origine" title="Changer l'extremite d'origine de cette mesure (A <-> B)"
                onClick={() => commandes.executer('mesure.inverserOrigine', undefined, { cote: m.id })}>{'Extrémité ' + m.startEnd + ' ⇄'}</button></td>
              <td style={{ fontWeight: mode === 'perp' ? 700 : 400 }}>{g ? g.perp.toFixed(2) + ' m' : '—'}</td>
              <td style={{ fontWeight: mode === 'along' ? 700 : 400 }}>{g ? g.along.toFixed(2) + ' m' : '—'}</td>
              <td><button type="button" data-commande="mesure.valeurAffichee" disabled={!ecrire} className="secondary small" data-nom="Valeur affichée (le long ou perpendiculaire)" title="Choisir quelle valeur est affichee sur le plan pour cette mesure"
                onClick={() => commandes.executer('mesure.valeurAffichee', undefined, { cote: m.id })}>
                {(mode === 'along' ? 'Le long' : 'Perpendiculaire') + ' ⇄'}</button></td>
              <td><input type="checkbox" data-commande="mesure.afficher" disabled={!ecrire} checked={!!m.show} aria-label="Afficher sur le plan"
                onChange={() => commandes.executer('mesure.afficher', undefined, { cote: m.id })} /></td>
              <td><button type="button" data-commande="mesure.supprimer" disabled={!ecrire} className="secondary small" onClick={() => commandes.executer('mesure.supprimer', undefined, { cote: m.id })}>Supprimer</button></td>
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

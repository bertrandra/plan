// La vue « Sources et arbitrage » de Admin › Regles (MD/spec-reconciliation.md) : les sources d'un batiment, les attributs qu'elles
// renseignent, comment elles s'arbitrent, et la lecture du LiDAR etape par etape avec les seuils qui la reglent. Les regles du
// LiDAR font surface ici : leurs seuils (regles/toits/reglages.json) a cote des poids des sources. Lecture seule : les valeurs
// se changent dans « Reglages et faits », ou dans le fichier du depot par une PR.

import { SOURCES, type Accord, type ReglesReconciliation } from '../../regles/reconciliation.js';
import type { Seuil } from '../../regles/donnees/edition.js';

export interface PropsSources {
  regles: ReglesReconciliation;
  /** Les seuils de la lecture des toits (regles/toits/reglages.json), avec le module qui les lit. */
  seuilsLidar: readonly Seuil[];
  /** Les seuils de la lecture des formes du catalogue (regles/toits/formes.json) : le Mansart, le papillon, le coyau, le berceau, la demi-croupe, les toits de revolution. */
  seuilsFormes?: readonly Seuil[];
}

const fr = (v: number): string => String(v).replace('.', ',');

/** Quand deux valeurs s'accordent, en clair. */
function direAccord(a: Accord): string {
  if (a.type === 'nombre') return 'à ' + fr(a.tolerance) + ' ' + a.unite + ' près';
  if (a.type === 'angle') return 'à ' + fr(a.tolerance) + ' ' + (a.unite === 'degres' ? '°' : a.unite) + ' près (modulo 180)';
  return a.type === 'ensemble' ? 'mêmes éléments, dans n’importe quel ordre' : 'exactement';
}

/** Les seuils qu'une etape lit : ceux dont le module (`ou`) est un des siens, `(NOM)` des constantes comprises. */
const seuilsDeLEtape = (modules: readonly string[], seuils: readonly Seuil[]): Seuil[] => seuils.filter((s) => modules.some((m) => s.ou === m || s.ou.startsWith(m + ' ')));

export function Sources({ regles, seuilsLidar, seuilsFormes = [] }: PropsSources) {
  const attributs = Object.entries(regles.attributs);
  return (
    <div className="reglSources">
      <p className="consNote">
        Chaque source dit une valeur d’un attribut ; les valeurs qui s’accordent forment un groupe, qui pèse la somme de (poids de la source × sa confiance).
        La décision est <strong>automatique</strong> quand le groupe pèse au moins <code>SCORE_AUTO_MIN</code> ({fr(regles.seuils.SCORE_AUTO_MIN)}), l’emporte de <code>MARGE_AUTO_MIN</code> fois
        ({fr(regles.seuils.MARGE_AUTO_MIN)}) sur le second, qu’aucune valeur choisie à la main ne s’y oppose, et qu’il n’a pas pour seule source une source qui ne décide pas seule.
        Sinon c’est <strong>à vous</strong> : la ligne arrive décochée avec toutes les sources. Une confiance absente vaut {fr(regles.seuils.CONFIANCE_ABSENTE)}.
        Les valeurs se changent dans « Réglages et faits » (Réconciliation des sources).
      </p>

      <h2 className="consSousTitre">Les sources</h2>
      <div className="defileAudit">
        <table className="attrTable tableAudit" aria-label="Sources">
          <thead><tr><th>Source</th><th>Poids</th><th>Décide seule</th><th>Ce qu’elle voit</th></tr></thead>
          <tbody>{SOURCES.map((id) => (
            <tr key={id} data-source={id}><td>{regles.sources[id].libelle}</td><td>{fr(regles.sources[id].poids)}</td><td>{regles.sources[id].seule ? 'Oui' : 'Non'}</td><td>{regles.sources[id].voit}</td></tr>
          ))}</tbody>
        </table>
      </div>

      <h2 className="consSousTitre">Les attributs</h2>
      <div className="defileAudit">
        <table className="attrTable tableAudit" aria-label="Attributs">
          <thead><tr><th>Attribut</th><th>Objet</th><th>Accord</th>{SOURCES.map((s) => <th key={s}>{regles.sources[s].libelle}</th>)}</tr></thead>
          <tbody>{attributs.map(([id, a]) => (
            <tr key={id} data-attribut={id}>
              <td>{a.libelle}</td><td>{a.cible === 'batiment' ? 'Bâtiment' : a.cible === 'facade' ? 'Façade' : 'Parcelle'}</td><td>{direAccord(a.accord)}</td>
              {SOURCES.map((s) => <td key={s}>{a.poids[s] === undefined ? <span title="Le poids par défaut de la source">({fr(regles.sources[s].poids)})</span> : fr(a.poids[s] as number)}</td>)}
            </tr>
          ))}</tbody>
        </table>
      </div>

      <h2 className="consSousTitre">La lecture du LiDAR, étape par étape</h2>
      <p className="consNote">
        Le LiDAR ne s’écrit pas dans le projet sans le dire : chaque étape de sa lecture est réglée par des seuils, et un constat du LiDAR cite celui qui l’a produit
        (<code>RETRAIT_EGOUT_M = 0,5 m</code>…). Plan lit donc le LiDAR comme les autres sources : avec un poids, une confiance et des règles que l’on voit.
      </p>
      <ol className="reglEtapes">{regles.lecturesLidar.map((e) => {
        const seuils = seuilsDeLEtape(e.modules, seuilsLidar);
        return (
          <li key={e.ordre} className="reglEtape" data-etape={e.ordre}>
            <strong>{e.ordre}. {e.etape}</strong> <span className="consNote">{e.modules.join(', ')}</span>
            <p>{e.dit}</p>
            <details>
              <summary>{seuils.length} seuil{seuils.length > 1 ? 's' : ''}</summary>
              <div className="defileAudit">
                <table className="attrTable tableAudit" aria-label={'Seuils : ' + e.etape}>
                  <thead><tr><th>Seuil</th><th>Valeur</th><th>Unité</th><th>Pourquoi</th></tr></thead>
                  <tbody>{seuils.map((s) => <tr key={s.nom}><td><code>{s.nom}</code></td><td>{fr(s.valeur)}</td><td>{s.unite}</td><td>{s.pourquoi}</td></tr>)}</tbody>
                </table>
              </div>
            </details>
          </li>
        );
      })}</ol>

      {seuilsFormes.length > 0 && <>
        <h2 className="consSousTitre">La lecture des formes du catalogue</h2>
        <p className="consNote">
          Le moteur des corps lit des toits à pentes droites. Plan cherche ensuite si la mesure dit mieux : un pan qui se brise (Mansart, gambrel), s’adoucit (coyau) ou se courbe (berceau),
          un milieu plus bas que les bords (papillon), un faîtage qui baisse à un bout (demi-croupe), un cône ou un dôme sur un plan carré. Chaque forme est dessinée par le code de la 3D et
          n’est retenue que si elle colle à la mesure bien mieux que le corps de départ. Ce fichier ne change aucune toiture déjà lue : il règle les constats de l’audit.
        </p>
        <div className="defileAudit">
          <table className="attrTable tableAudit" aria-label="Seuils : lecture des formes">
            <thead><tr><th>Seuil</th><th>Valeur</th><th>Unité</th><th>Pourquoi</th></tr></thead>
            <tbody>{seuilsFormes.map((s) => <tr key={s.nom}><td><code>{s.nom}</code></td><td>{fr(s.valeur)}</td><td>{s.unite}</td><td>{s.pourquoi}</td></tr>)}</tbody>
          </table>
        </div>
      </>}
    </div>
  );
}

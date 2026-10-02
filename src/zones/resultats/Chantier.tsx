// Z6, onglet Chantier : les activites de la terrasse dans l'ordre du chantier, leurs durees, et la
// duree totale pour l'equipe choisie. Les quantites viennent du projet (engine/chantier.ts) ; les
// cadences, la taille de l'equipe et les heures par jour se reglent ici, et s'annulent.

import { ensureConstruction } from '../../engine/construction.js';
import { estPlots } from '../../engine/constantes.js';
import { CADENCES, CHANTIER_PHASES, computeChantier } from '../../engine/chantier.js';
import { computeTerrasseLayers } from '../../engine/layers.js';
import { aDesSommets } from '../../model/formes.js';
import { SaisieNombre } from '../composants/Saisie.js';
import type { Resultats } from '../../app/resultats.js';
import type { ObjetPlan } from '../../model/types.js';

export function Chantier({ obj, resultats }: { obj: ObjetPlan; resultats: Resultats }) {
  const titre = <div className="sectionTitle">Chantier — activités et durées</div>;
  if (!aDesSommets(obj) || obj.pts.length < 3) return <>{titre}<div id="terrasseChantierWrap"><div className="hint">Terrasse invalide.</div></div></>;
  const c = ensureConstruction(obj);
  const ch = computeChantier(obj, computeTerrasseLayers(obj, resultats.etat.objects));
  const equipe = Math.max(1, Math.round(c.equipe || 2));
  const hJour = Math.max(1, c.heuresJour || 7);
  const jours = ch.total / (equipe * hJour);
  const part = (h: number) => (100 * h / (ch.total || 1)).toFixed(0) + ' %';
  const reglage = (libelle: string, valeur: number, pas: string, ecrire: (v: number) => void) => (
    <span className="reglageChantier">
      <label style={{ marginRight: 5 }}>{libelle + ' : '}</label>
      <SaisieNombre controle="chantier.reglage" valeur={String(valeur)} pas={pas} min="1" largeur={70} libelle={libelle}
        onValider={(t) => { const v = parseFloat(t); resultats.saisir(() => ecrire(v)); }} />
    </span>
  );
  const saisirCadence = (cle: string, t: string) => {
    const v = parseFloat(t);
    resultats.saisir(() => {
      // `cadences` accepte les deux formes historiques (objet ou tableau, voir model/dictionnaire.ts) :
      // ecriture indexee, comme la lecture.
      if (!c.cadences) c.cadences = {};
      const dict = c.cadences as Record<string, number | undefined>;
      if (isNaN(v) || v < 0) delete dict[cle]; else dict[cle] = v;
    });
  };

  return (
    <>
      {titre}
      <div id="terrasseChantierWrap">
        <div className="hint">
          Toutes les activites necessaires a cette terrasse, dans l'ordre du chantier. Les quantites viennent du projet — nombre d'appuis, metres
          de bois, barres a debiter, m³ de concasse — et les cadences sont reglables ligne par ligne. Main-d'oeuvre seule : ni livraison, ni prise
          de rendez-vous, ni sechage.
        </div>
        <div className="controls">
          {reglage('Equipe (personnes)', equipe, '1', v => { c.equipe = (isNaN(v) || v < 1) ? 2 : Math.round(v); })}
          {reglage('Heures par jour', hJour, '0.5', v => { c.heuresJour = (isNaN(v) || v < 1) ? 7 : v; })}
        </div>
        <table className="attrTable"><tbody>
          <tr><th>Activite</th><th>Quantite</th><th>Cadence</th><th>Duree</th><th>Part</th></tr>
          {CHANTIER_PHASES.map((phase: string) => {
            const lignes = ch.lignes.filter(l => l.phase === phase);
            if (!lignes.length) return null;
            const hPhase = lignes.reduce((s, l) => s + l.heures, 0);
            return [
              <tr key={phase} className="lignePhase"><td>{phase}</td><td></td><td></td><td>{hPhase.toFixed(1) + ' h'}</td><td>{part(hPhase)}</td></tr>,
              ...lignes.map(l => (
                <tr key={l.cle}>
                  <td style={ch.dominant && l.cle === ch.dominant.cle ? { fontWeight: 600 } : undefined}>{'　' + l.label}</td>
                  <td>{l.qte.toFixed(l.unite === 'u' ? 0 : 2) + ' ' + l.unite}</td>
                  <td>
                    <SaisieNombre controle="chantier.cadence" valeur={l.cadence.toFixed(2)} largeur={80} titre={'Heures par ' + l.unite} onValider={(t) => saisirCadence(l.cle, t)} />
                    <span className="unite">{' h/' + l.unite}</span>
                  </td>
                  <td className="nombre">{l.heures.toFixed(1) + ' h'}</td>
                  <td>{part(l.heures)}</td>
                </tr>
              ))
            ];
          })}
          <tr style={{ fontWeight: 700 }}><td>Total main-d'oeuvre</td><td>{ch.surf.toFixed(2) + ' m²'}</td><td></td><td>{ch.total.toFixed(1) + ' h'}</td><td>100 %</td></tr>
        </tbody></table>
        <div className="hint">
          <b>{ch.total.toFixed(0) + ' heures'}</b>{' au total, soit '}<b>{jours.toFixed(1) + ' jours'}</b>
          {' a ' + equipe + ' personne' + (equipe > 1 ? 's' : '') + ' sur ' + hJour + ' h — et ' + (ch.total / ch.surf).toFixed(1) + ' h/m².'}
          {ch.dominant && <>{' Le poste le plus lourd est '}<b>{ch.dominant.label.toLowerCase()}</b>
            {' (' + ch.dominant.heures.toFixed(1) + ' h, ' + (100 * ch.dominant.heures / ch.total).toFixed(0) + ' % du chantier) : c\'est lui qu\'il faut attaquer pour raccourcir.'}</>}
        </div>
        {!estPlots(c) && ch.nbAppuis > 0 && (
          <div className="hint">
            {'A titre de comparaison, poser un plot prend environ ' + CADENCES.posePlots.h.toFixed(2) + ' h contre ' + CADENCES.vissage.h.toFixed(2) +
              ' h pour visser une vis de fondation — mais il en faut trois a quatre fois plus, et il faut prealablement realiser l\'assise. Le mode de pose se decide sur le sol et le budget, pas sur la duree seule.'}
          </div>
        )}
      </div>
    </>
  );
}

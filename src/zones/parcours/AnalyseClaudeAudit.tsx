// Z8, l'audit de la parcelle, phase 2 : l'analyse par Claude dans l'ecran des propositions
// (MD/spec-audit.md §13.2, lot L17). Un bloc en tete de la liste : la question de l'accord (decision
// D2 : une fois par projet, revocable ; la case « partager » de la decision D7, cochee par defaut),
// puis l'etat de l'analyse (preparation, en cours, prete, a relancer, erreur) et « Retirer l'accord ».
//
// Aucune photo ne part sans « Envoyer » ; « Seulement les mesures » laisse les mesures seules. Le
// bloc ne dit que ce qui se passe : les propositions de Claude, elles, sont des lignes de la liste
// comme les autres, avec leur origine.

import { useState } from 'react';
import type { AnalyseClaude } from '../../app/audit/parcelle/analyseClaude.js';

/** La question de l'accord : ce que Claude recevra, la case « partager », Envoyer ou Seulement les mesures. */
function Accord({ analyse }: { analyse: AnalyseClaude }) {
  const [partage, setPartage] = useState(true);
  return (
    <div className="accordAnalyse" role="group" aria-label="Analyse par Claude">
      <div className="titreAnalyse">Analyse par Claude</div>
      <div className="detailPhoto">{analyse.detail()}</div>
      <label className="casePartage">
        <input type="checkbox" data-controle="auditParcelle.partagerAudit" checked={partage} onChange={(e) => setPartage(e.target.checked)} />
        <span>Partager cet audit pour améliorer Plan</span>
      </label>
      <div className="actionsAnalyse">
        <button type="button" className="secondary small" data-controle="auditParcelle.sansAnalyse" onClick={() => analyse.refuser()}>Seulement les mesures</button>
        <button type="button" className="small" data-controle="auditParcelle.accordAnalyse" onClick={() => { void analyse.accorder(partage); }}>Envoyer mes photos à l’analyse</button>
      </div>
    </div>
  );
}

export function AnalyseClaudeAudit({ analyse }: { analyse: AnalyseClaude }) {
  const etat = analyse.etat();
  if (etat === 'attente') return null;
  if (etat === 'sansAccord') return <Accord analyse={analyse} />;
  const detail = analyse.detail();
  const peutRelancer = etat === 'aRelancer' || etat === 'erreur';
  const peutRetirer = analyse.accord() !== null;
  const peutDemander = etat === 'refusee';
  return (
    <div className={'etatAnalyse etat-' + etat} role="status" aria-label="Analyse par Claude">
      <span className="titreAnalyse">{'Claude : '}</span>
      <span className="detailPhoto">{detail}</span>
      {(peutRelancer || peutRetirer || peutDemander) && <div className="actionsAnalyse">
        {peutDemander && <button type="button" className="secondary small" data-controle="auditParcelle.accordAnalyse" onClick={() => { void analyse.accorder(true); }}>Demander l’analyse</button>}
        {peutRelancer && <button type="button" className="secondary small" data-controle="auditParcelle.relancerAnalyse" onClick={() => { void analyse.lancer(); }}>Relancer l’analyse</button>}
        {peutRetirer && <button type="button" className="secondary small" data-controle="auditParcelle.retirerAccord" onClick={() => analyse.retirerAccord()}>Retirer l’accord</button>}
      </div>}
    </div>
  );
}

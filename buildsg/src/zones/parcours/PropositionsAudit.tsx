// Z8, l'audit de la parcelle, phase 3 : les propositions et leur validation (MD/spec-audit.md §14).
//
// Pose en bas de la Vue 3D comme l'ecran de prise : la scene reste visible et manipulable. La bascule
// « Avant / Après » y montre le projet tel qu'il est, ou tel qu'il sera avec les propositions
// cochees ; la liste dit, ligne par ligne, l'avant, l'apres et l'origine. Une valeur choisie a la
// main n'est jamais remplacee en silence : sa ligne arrive decochee et le dit. « Valider » ecrit ce
// qui est coche en un seul pas d'historique (app/audit/parcelle/validation.ts).

import { texteDuPartage } from '../../app/audit/parcelle/corpus.js';
import { AnalyseClaudeAudit } from './AnalyseClaudeAudit.js';
import type { SessionAuditParcelle } from '../../app/audit/parcelle/controleur.js';
import type { Proposition } from '../../model/propositions.js';

const ORIGINES: Record<Proposition['source'], string> = { mesure: 'Mesure de Plan', claude: 'Claude' };

/** Une ligne : la case, l'objet, l'avant et l'apres, l'origine, et ce qui la fait arriver decochee. */
function LigneProposition({ p, cochee, basculer }: { p: Proposition; cochee: boolean; basculer: () => void }) {
  const id = 'proposition-' + p.id.replace(/[^a-zA-Z0-9_-]/g, '_');
  return (
    <li className={'ligneProposition source-' + p.source + (cochee ? ' cochee' : '')}>
      <input type="checkbox" id={id} data-controle="auditParcelle.cocher" checked={cochee} onChange={basculer} />
      <label htmlFor={id} className="texteProposition">
        <span className="objetProposition">{p.objet}</span>
        <span className="avantApres"><span className="avantProposition">{p.avant}</span><span aria-hidden="true"> → </span><span className="texteMasque">, devient </span><span>{p.apres}</span></span>
        <span className="origineProposition">{ORIGINES[p.source] + (p.confiance !== null ? (p.source === 'claude' ? ' · passes d’accord ' : ' · confiance ') + Math.round(p.confiance * 100) + ' %' : '')}{p.indices[0] ? ' · ' + p.indices[0].texte : ''}</span>
        {p.remplaceChoix && <span className="reserveProposition">{'Remplace votre choix : ' + p.remplaceChoix}</span>}
        {p.reserve && <span className="reserveProposition">{p.reserve}</span>}
      </label>
    </li>
  );
}

/**
 * « Partager cet audit pour améliorer Plan » (§15, decision D7) : cochee par defaut, revocable. Absente
 * quand personne ne peut envoyer (ni session admin ni jeton de la plateforme) : rien ne part alors.
 */
function PartageAudit({ session }: { session: SessionAuditParcelle }) {
  const e = session.corpus.etat();
  // La question de l'accord de l'analyse pose deja la meme case (AnalyseClaudeAudit) : une seule a la fois.
  if (!e.disponible || session.analyse.etat() === 'sansAccord') return null;
  return (
    <div className="partageAudit">
      <label>
        <input type="checkbox" data-controle="auditParcelle.partagerCorpus" checked={e.accord} disabled={e.enCours} onChange={() => session.corpus.basculer()} />
        Partager cet audit pour améliorer Plan
      </label>
      <p className="notePartage" aria-live="polite">{texteDuPartage(e)}</p>
    </div>
  );
}

/** Ce que dit l'ecran des mesures en cours. */
function texteMesures(session: SessionAuditParcelle): string | null {
  const m = session.validation.mesures();
  if (m.etat === 'mesure') return 'Mesure des façades sur vos photos : ' + m.faites + ' sur ' + m.total + '…';
  if (m.etat === 'attente') return 'Mesure des façades sur vos photos…';
  return null;
}

export function PropositionsAudit({ session, fermer }: { session: SessionAuditParcelle; fermer: () => void }) {
  const v = session.validation;
  const propositions = v.propositions();
  const cochees = propositions.filter((p) => v.cochee(p.id)).length;
  const verifs = v.verifications();
  const verifies = verifs.filter((x) => x.verifie).length;
  const enCours = texteMesures(session);
  const apercu = v.apercu();
  return (
    <div className="auditPrise auditPropositions" role="dialog" aria-modal="false" aria-label="Propositions de l’audit">
      <div className="titreParcours">Propositions de l’audit</div>
      <div className="detailPhoto" aria-live="polite">{enCours ?? (propositions.length ? cochees + ' sur ' + propositions.length + ' cochée' + (cochees > 1 ? 's' : '') + '. Rien n’est écrit avant « Valider ».' : 'Aucune proposition : photographiez une façade ou notez ce que vous voyez dans la liste.')}</div>
      <AnalyseClaudeAudit analyse={session.analyse} />
      <div className="segmente avantApresAudit" role="group" aria-label="Vue 3D : avant ou après les propositions">
        {(['avant', 'apres'] as const).map((a) => <button key={a} type="button" className={apercu === a ? 'actif' : ''} data-controle="auditParcelle.avantApres" aria-pressed={apercu === a} onClick={() => v.montrer(a)}>{a === 'avant' ? 'Avant' : 'Après'}</button>)}
      </div>
      {propositions.length > 0 && <ul className="listePropositions" aria-label="Propositions">
        {propositions.map((p) => <LigneProposition key={p.id} p={p} cochee={v.cochee(p.id)} basculer={() => v.basculer(p.id)} />)}
      </ul>}
      {verifs.length > 0 && <ul className="verificationsAudit" aria-label="Vérifié sur place">
        {verifs.map((x) => <li key={x.cle} className={x.verifie ? 'verifie' : ''}>{x.verifie ? x.nom + ' sera marqué « vérifié sur place ».' : x.nom + ' : pas encore vérifié sur place (' + x.raison + ').'}</li>)}
      </ul>}
      <PartageAudit session={session} />
      <div className="piedDialogue">
        <button type="button" className="secondary" data-controle="auditParcelle.liste" onClick={() => session.montrer('liste')}>Liste</button>
        {session.fichierDisponible() && <button type="button" className="secondary" data-controle="auditParcelle.fichier" onClick={() => { void session.partagerLeFichier(); }}>Fichier de l’audit</button>}
        <button type="button" data-controle="auditParcelle.valider" disabled={enCours !== null || (!cochees && !verifies)}
          onClick={() => { if (v.valider()) fermer(); }}>{'Valider' + (cochees ? ' (' + cochees + ')' : '')}</button>
      </div>
    </div>
  );
}

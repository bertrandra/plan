// Z8, l'audit de la parcelle, phase 3 : les propositions et leur validation (MD/spec-audit.md §14).
//
// Pose sur la Vue 3D comme l'ecran de prise : en bas au doigt, a droite sur un ecran en largeur. Sa
// hauteur est bornee et sa liste se replie (« Replier ») : la parcelle reste visible au-dessus ou a
// cote, et la scene reste manipulable. Le premier essai sur le terrain (AE 101, 15 octobre) : l'ecran
// couvrait la parcelle. Par defaut, la Vue 3D montre deux vues qui tournent ensemble, « Avant » (le
// projet tel qu'il est) et « Après » (avec les propositions cochees), dans la part du canevas que cet
// ecran laisse libre (three/comparaison3d.ts) ; « Avant » ou « Après » seul la rendent a une vue, que
// la camera cadre dans ce que l'ecran laisse voir (cadrageVue.ts). La liste dit, ligne par ligne,
// l'avant, l'apres et l'origine. Une valeur choisie a la main n'est jamais remplacee en silence : sa
// ligne arrive decochee et le dit. « Valider » ecrit ce qui est coche en un seul pas d'historique
// (app/audit/parcelle/validation.ts).

import { useLayoutEffect, useRef, useState } from 'react';
import { texteDuPartage } from '../../app/audit/parcelle/corpus.js';
import type { Apercu } from '../../app/audit/parcelle/validation.js';
import { AnalyseClaudeAudit } from './AnalyseClaudeAudit.js';
import { Icone } from '../icones.js';
import { BoutonFermerAudit } from './BoutonFermerAudit.js';
import type { SessionAuditParcelle } from '../../app/audit/parcelle/controleur.js';
import { nombreObservations, type ObservationsBatiment } from '../../app/audit/parcelle/observationsClaude.js';
import type { Proposition } from '../../regles/decisions.js';
import type { DecisionProposition } from '../../model/fichierAuditParcelle.js';

const ORIGINES: Record<Proposition['source'], string> = { mesure: 'Mesure de Plan', claude: 'Claude' };
const DECISIONS_FICHIER = { validee: 'Validée', refusee: 'Refusée' } as const;

/** Ce que l'audit recu a fait d'une proposition (consultation) : la case ne dit que oui ou non. */
const texteDecision = (d: DecisionProposition) => (d ? DECISIONS_FICHIER[d] : 'En attente');

/** Une ligne : la case, l'objet, l'avant et l'apres, l'origine, et ce qui la fait arriver decochee. */
function LigneProposition({ p, cochee, basculer, lecture }: { p: Proposition; cochee: boolean; basculer: () => void; lecture?: { decision: DecisionProposition } }) {
  const id = 'proposition-' + p.id.replace(/[^a-zA-Z0-9_-]/g, '_');
  return (
    <li className={'ligneProposition source-' + p.source + (cochee ? ' cochee' : '')}>
      <input type="checkbox" id={id} data-controle="auditParcelle.cocher" checked={cochee} disabled={!!lecture} onChange={basculer} />
      <label htmlFor={id} className="texteProposition">
        <span className="objetProposition">{p.objet}</span>
        <span className="avantApres"><span className="avantProposition">{p.avant}</span><span aria-hidden="true"> → </span><span className="texteMasque">, devient </span><span>{p.apres}</span></span>
        <span className="origineProposition">{ORIGINES[p.source] + (p.confiance !== null ? (p.source === 'claude' ? ' · passes d’accord ' : ' · confiance ') + Math.round(p.confiance * 100) + ' %' : '')}{p.indices[0] ? ' · ' + p.indices[0].texte : ''}</span>
        {lecture && <span className="decisionProposition">{'Décision de l’audit : ' + texteDecision(lecture.decision)}</span>}
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
      <p className="notePartage" aria-live="polite">{texteDuPartage(e, session.fichierDisponible() && !!session.capture.lire().sauvegarde)}</p>
    </div>
  );
}

/**
 * Ce que Claude a vu sans que le projet sache l'ecrire (app/audit/parcelle/observationsClaude.ts) :
 * des lignes a lire, batiment par batiment, sans case. Une case laisserait croire que l'on peut
 * l'ecrire dans le projet ; rien ne l'est.
 */
function ObservationsClaude({ batiments }: { batiments: readonly ObservationsBatiment[] }) {
  if (!batiments.length) return null;
  return (
    <section className="observationsClaude" aria-label="Vu par Claude">
      <div className="titreObservations">Vu par Claude, à vérifier sur place</div>
      <p className="noteObservations">Ces observations ne changent rien au projet.</p>
      {batiments.map((b) => (
        <div key={b.cle} className="observationsBatiment">
          <div className="nomObservations">{b.nom}</div>
          <ul className="listeObservations">
            {b.observations.map((o) => (
              <li key={o.id} className="ligneObservation">
                <span>{o.texte}</span>
                {(o.ou.length > 0 || o.accord !== null) && <span className="origineProposition">{[o.ou.length ? 'vu sur : ' + o.ou.join(', ') : null, o.accord !== null ? 'passes d’accord ' + Math.round(o.accord * 100) + ' %' : null].filter(Boolean).join(' · ')}</span>}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}

/** Ce que dit l'ecran des mesures en cours. */
function texteMesures(session: SessionAuditParcelle): string | null {
  const m = session.validation.mesures();
  if (m.etat === 'mesure') return 'Mesure des façades sur vos photos : ' + m.faites + ' sur ' + m.total + '…';
  if (m.etat === 'attente') return 'Mesure des façades sur vos photos…';
  return null;
}

/** Les trois apercus de la Vue 3D, dans l'ordre de l'ecran : « Les deux » au milieu, ce qui s'ouvre. */
const APERCUS: readonly { a: Apercu; libelle: string }[] = [
  { a: 'avant', libelle: 'Avant' }, { a: 'deux', libelle: 'Les deux' }, { a: 'apres', libelle: 'Après' },
];

/**
 * `retour` : la consultation d'un audit recu (Admin › Audits) a ouvert cet ecran en lecture seule, sur
 * une session a part : la meme Vue 3D avant / apres, les memes lignes, mais ni case a cocher, ni mesure,
 * ni partage, ni « Valider », et « Retour aux audits » a la place de la liste.
 */
export function PropositionsAudit({ session, fermer, retour }: { session: SessionAuditParcelle; fermer: () => void; retour?: () => void }) {
  const v = session.validation;
  const lecture = session.lectureSeule();
  const apercu = v.apercu();
  // L'ecran dit ou il est a chaque changement de taille (une ligne de plus, la liste repliee, l'ecran
  // qui tourne), et plus rien quand il se ferme. Deux vues : elles evitent l'ecran elles-memes (zone
  // libre, comparaison3d.ts), et la camera cadre une de leurs formes, sans se decaler en plus ; elles
  // se posent donc AVANT la camera. Une seule vue : la camera cadre ce que l'ecran laisse voir.
  const cadre = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = cadre.current;
    if (!el) return;
    const dire = () => {
      const r = el.getBoundingClientRect();
      v.cadrer(r);
      session.cadrerVue(apercu === 'deux' ? null : { haut: r.top, gauche: r.left });
    };
    dire();
    const obs = typeof ResizeObserver === 'function' ? new ResizeObserver(dire) : null;
    obs?.observe(el);
    window.addEventListener('resize', dire);
    return () => { obs?.disconnect(); window.removeEventListener('resize', dire); v.cadrer(null); session.cadrerVue(null); };
  }, [v, session, apercu]);
  const propositions = v.propositions();
  const cochees = propositions.filter((p) => v.cochee(p.id)).length;
  const verifs = v.verifications();
  const verifies = verifs.filter((x) => x.verifie).length;
  const enCours = texteMesures(session);
  const observations = v.observations();
  const comptes = { propositions: propositions.filter((p) => p.source === 'claude').length, observations: nombreObservations(observations) };
  // Replier ne garde que le titre, le compte, Avant / Après et les boutons : la parcelle se voit en grand.
  const [replie, setReplie] = useState(false);
  return (
    <div ref={cadre} className={'auditPrise auditPropositions' + (apercu === 'deux' ? ' deuxVues' : '') + (replie ? ' replie' : '')} role="dialog" aria-modal="false" aria-label="Propositions de l’audit">
      <div className="entetePropositions">
        <div className="titreParcours">{lecture ? 'Avant et après : l’audit reçu' : 'Propositions de l’audit'}</div>
        <div className="actionsEntete">
          <button type="button" className="secondary small boutonReplier" data-controle="auditParcelle.replier" aria-expanded={!replie} aria-controls="corpsPropositions"
            onClick={() => setReplie(!replie)}><Icone nom={replie ? 'chevronHaut' : 'chevronBas'} taille={16} /><span>{replie ? 'Déplier' : 'Replier'}</span></button>
          <BoutonFermerAudit fermer={fermer} />
        </div>
      </div>
      <div className="detailPhoto" aria-live="polite">{lecture ? 'Consultation : ' + (propositions.length ? 'les cases sont les propositions que cet audit a validées ; rien n’est écrit dans ce projet.' : 'cet audit n’a aucune proposition.') : enCours ?? (propositions.length ? cochees + ' sur ' + propositions.length + ' cochée' + (cochees > 1 ? 's' : '') + '. Rien n’est écrit avant « Valider ».' : comptes.observations ? 'Aucune proposition à cocher : lisez plus bas ce que Claude a vu.' : 'Aucune proposition : photographiez une façade ou notez ce que vous voyez dans la liste.')}</div>
      {/* L'apercu d'abord : c'est lui que l'on regarde en cochant ; l'accord de Claude vient ensuite. */}
      <div className="segmente avantApresAudit" role="group" aria-label="Vue 3D : avant, les deux ensemble, ou après les propositions">
        {APERCUS.map(({ a, libelle }) => <button key={a} type="button" className={apercu === a ? 'actif' : ''} data-controle="auditParcelle.avantApres" aria-pressed={apercu === a} onClick={() => v.montrer(a)}>{libelle}</button>)}
      </div>
      <div id="corpsPropositions" className="corpsPropositions" hidden={replie}>
        {apercu === 'deux' && <p className="noteAvantApres">Les deux vues tournent ensemble ; « Après » montre les propositions cochées.</p>}
        {!lecture && <AnalyseClaudeAudit analyse={session.analyse} comptes={comptes} />}
        {propositions.length > 0 && <ul className="listePropositions" aria-label="Propositions">
          {propositions.map((p) => <LigneProposition key={p.id} p={p} cochee={v.cochee(p.id)} basculer={() => v.basculer(p.id)} {...(lecture ? { lecture: { decision: v.decision(p.id) } } : {})} />)}
        </ul>}
        <ObservationsClaude batiments={observations} />
        {!lecture && verifs.length > 0 && <ul className="verificationsAudit" aria-label="Vérifié sur place">
          {verifs.map((x) => <li key={x.cle} className={x.verifie ? 'verifie' : ''}>{x.verifie ? x.nom + ' sera marqué « vérifié sur place ».' : x.nom + ' : pas encore vérifié sur place (' + x.raison + ').'}</li>)}
        </ul>}
        {!lecture && <PartageAudit session={session} />}
      </div>
      <div className="piedDialogue">
        {lecture
          ? retour && <button type="button" className="secondary" data-controle="auditsParcelle.retour" onClick={retour}>Retour aux audits</button>
          : <>
              <button type="button" className="secondary" data-controle="auditParcelle.liste" onClick={() => session.montrer('liste')}>Liste</button>
              {session.fichierDisponible() && <button type="button" className="secondary" data-controle="auditParcelle.fichier" onClick={() => { void session.partagerLeFichier(); }}>Fichier de l’audit</button>}
              <button type="button" data-controle="auditParcelle.valider" disabled={enCours !== null || (!cochees && !verifies)}
                onClick={() => { if (v.valider()) fermer(); }}>{'Valider' + (cochees ? ' (' + cochees + ')' : '')}</button>
            </>}
      </div>
    </div>
  );
}

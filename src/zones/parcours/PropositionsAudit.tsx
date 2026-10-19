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
import type { CeQueJeVois } from '../../model/ceQueJeVois.js';
import { nombreObservations, type ObservationsBatiment } from '../../app/audit/parcelle/observationsClaude.js';
import { tauxAutomatique, type TauxAutomatique } from '../../app/audit/parcelle/arbitrages.js';
import type { Validation } from '../../app/audit/parcelle/validation.js';
import type { ArbitrageProposition, Proposition } from '../../regles/decisions.js';
import type { DecisionProposition } from '../../model/fichierAuditParcelle.js';

const ORIGINES: Record<Proposition['source'], string> = { mesure: 'Mesure de Plan', claude: 'Claude', arbitrage: 'Sources arbitrées' };
const DECISIONS_FICHIER = { validee: 'Validée', refusee: 'Refusée' } as const;

/** Ce que l'audit recu a fait d'une proposition (consultation) : la case ne dit que oui ou non. */
const texteDecision = (d: DecisionProposition) => (d ? DECISIONS_FICHIER[d] : 'En attente');

/**
 * Les sources d'un attribut arbitre (MD/spec-reconciliation.md) : la decision du moteur et sa raison, puis chaque constat, groupe
 * retenu en tete : ce que chaque source dit, sa confiance, ce qu'elle pese, et la regle qui l'a lu. Un mot dit le groupe
 * retenu : la couleur ne porte pas seule.
 */
/** Une phrase : ce que le moteur a tranche seul, ce qui attend la personne, ce qu'elle a decide. */
function texteTaux(t: TauxAutomatique): string {
  if (!t.decides) return 'Rien à arbitrer : le projet a déjà ce que disent les sources.';
  return t.decides + ' décision' + (t.decides > 1 ? 's' : '') + ' : ' + t.auto + ' automatique' + (t.auto > 1 ? 's' : '') + ', ' + t.manuelles + ' à vous' + (t.main ? ', ' + t.main + ' déjà prise' + (t.main > 1 ? 's' : '') + ' par vous' : '') + '.';
}

export interface MainArbitrage { retenir(index: number): void; forcer(valeur: string): void; reprendre(): void }

const MOTS_DECISION = { auto: 'Décision automatique', manuelle: 'À arbitrer', rien: 'Rien à changer', choisie: 'Choisi par vous', forcee: 'Forcé par vous' } as const;

export function Arbitrage({ a, main }: { a: ArbitrageProposition; main?: MainArbitrage }) {
  const pct = (c: number | null) => (c === null ? '—' : Math.round(c * 100) + ' %');
  const [force, setForce] = useState('');
  const delaMain = a.decision === 'choisie' || a.decision === 'forcee';
  return (
    <details className="arbitrageProposition" open={a.decision === 'manuelle' && !!main ? true : undefined}>
      <summary><span className="decisionArbitrage">{MOTS_DECISION[a.decision as keyof typeof MOTS_DECISION] ?? 'À arbitrer'}</span>{' · ' + a.libelle + ' (aujourd’hui : ' + a.avant + ')'}</summary>
      <p className="raisonArbitrage">{a.raison}</p>
      <div className="defileAudit">
        <table className="attrTable tableArbitrage" aria-label={'Sources : ' + a.libelle}>
          <thead><tr><th>Source</th><th>Dit</th><th>Confiance</th><th>Score</th><th>Règle</th><th>Groupe</th></tr></thead>
          <tbody>{a.groupes.flatMap((g) => g.lignes.map((l, i) => (
            <tr key={g.valeur + l.source}><td>{l.libelle}</td><td>{l.valeur}</td><td>{pct(l.confiance)}</td><td>{String(l.score).replace('.', ',')}</td><td>{l.regle ?? '—'}</td><td>{i === 0 ? (g.retenu ? 'Retenu' : 'Écarté') + ' (' + String(g.score).replace('.', ',') + ')' : ''}</td></tr>
          )))}</tbody>
        </table>
      </div>
      {main && (
        <div className="mainArbitrage" role="group" aria-label={'Décider : ' + a.libelle}>
          {a.groupes.map((g, i) => !g.retenu || a.decision === 'manuelle'
            ? <button key={g.valeur} type="button" className="secondary small" data-controle="auditParcelle.retenirSource" onClick={() => main.retenir(i)}>{'Retenir « ' + g.valeur + ' »'}</button> : null)}
          {a.options
            ? <select aria-label={'Forcer : ' + a.libelle} data-controle="auditParcelle.forcerValeur" value={force} onChange={(e) => { setForce(''); if (e.target.value) main.forcer(e.target.value); }}>
                <option value="">Forcer une valeur…</option>
                {a.options.map((o) => <option key={o.valeur} value={o.valeur}>{o.libelle}</option>)}
              </select>
            : (a.accord === 'nombre' || a.accord === 'angle') && (
              <span className="forcerNombre">
                <input type="number" step="any" aria-label={'Forcer : ' + a.libelle + (a.unite ? ' (' + a.unite + ')' : '')} value={force} onChange={(e) => setForce(e.target.value)} />
                <button type="button" className="secondary small" data-controle="auditParcelle.forcerValeur" disabled={force === '' || !Number.isFinite(Number(force))} onClick={() => { main.forcer(force); setForce(''); }}>Forcer</button>
              </span>)}
          {delaMain && <button type="button" className="secondary small" data-controle="auditParcelle.reprendreChoix" onClick={main.reprendre}>Reprendre le choix du moteur</button>}
        </div>
      )}
    </details>
  );
}

/**
 * Toutes les sources d'un batiment, attribut par attribut (y compris ceux qui ne proposent rien) : c'est ici que l'on
 * retient une source ou que l'on force une valeur quand l'audit ne propose rien ou propose la mauvaise.
 */
function SourcesDesBatiments({ v }: { v: Validation }) {
  const batiments = v.arbitrages().filter((b) => b.arbitrages.length);
  if (!batiments.length) return null;
  const lectureSeule = v.lectureSeule();
  return (
    <section className="sourcesBatiments" aria-label="Sources des bâtiments">
      <div className="titreObservations">Sources, bâtiment par bâtiment</div>
      <p className="noteObservations tauxAutomatique">{texteTaux(tauxAutomatique(batiments.flatMap((b) => b.arbitrages)))}</p>
      {batiments.map((b) => (
        <details key={b.cle} className="sourcesBatiment">
          <summary className="nomObservations">{b.nom}</summary>
          {b.arbitrages.map((a) => <Arbitrage key={a.cible + a.attribut} a={a} {...(lectureSeule ? {} : { main: {
            retenir: (i: number) => v.decider(a.cible, a.attribut, { type: 'groupe', index: i }),
            forcer: (t: string) => v.decider(a.cible, a.attribut, { type: 'force', valeur: JSON.parse(t) as never }),
            reprendre: () => v.decider(a.cible, a.attribut, null),
          } })} />)}
        </details>
      ))}
    </section>
  );
}

/** Une ligne : la case, l'objet, l'avant et l'apres, l'origine, et ce qui la fait arriver decochee. */
function LigneProposition({ p, cochee, basculer, lecture, choisie, choisir }: { p: Proposition; cochee: boolean; basculer: () => void; lecture?: { decision: DecisionProposition }; choisie: boolean; choisir: () => void }) {
  const id = 'proposition-' + p.id.replace(/[^a-zA-Z0-9_-]/g, '_');
  return (
    <li className={'ligneProposition source-' + p.source + (cochee ? ' cochee' : '') + (choisie ? ' choisie' : '')}>
      <input type="checkbox" id={id} data-controle="auditParcelle.cocher" checked={cochee} disabled={!!lecture} onChange={basculer} />
      <div className="corpsProposition">
      <label htmlFor={id} className="texteProposition">
        <span className="objetProposition">{p.objet}</span>
        <span className="avantApres"><span className="avantProposition">{p.avant}</span><span aria-hidden="true"> → </span><span className="texteMasque">, devient </span><span>{p.apres}</span></span>
        <span className="origineProposition">{ORIGINES[p.source] + (p.confiance !== null ? (p.source === 'claude' ? ' · passes d’accord ' : ' · confiance ') + Math.round(p.confiance * 100) + ' %' : '')}{p.indices[0] ? ' · ' + p.indices[0].texte : ''}</span>
        {lecture && <span className="decisionProposition">{'Décision de l’audit : ' + texteDecision(lecture.decision)}</span>}
        {p.remplaceChoix && <span className="reserveProposition">{'Remplace votre choix : ' + p.remplaceChoix}</span>}
        {p.reserve && <span className="reserveProposition">{p.reserve}</span>}
      </label>
      {p.arbitrages?.map((a) => <Arbitrage key={a.attribut} a={a} />)}
      </div>
      {/* Voir dans la 3D : ce que la ligne vise est surligne dans les deux vues, et « Après » la montre meme decochee. */}
      <button type="button" className="secondary small voirProposition" data-controle="auditParcelle.voirLigne" aria-pressed={choisie}
        aria-label={(choisie ? 'Ne plus surligner : ' : 'Voir dans la 3D : ') + p.objet} title={choisie ? 'Ne plus surligner' : 'Voir dans la 3D'} onClick={choisir}>
        <Icone nom="oeil" taille={16} />
      </button>
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

/** La capture porte-t-elle deja ce que « Je confirme » noterait ? */
const dejaConfirme = (vu: CeQueJeVois, c: Partial<CeQueJeVois>): boolean => Object.entries(c).every(([k, x]) => JSON.stringify(vu[k as keyof CeQueJeVois]) === JSON.stringify(x));

/** Le type d'objet d'une observation, d'apres son sujet (`cle:obs:sujet`) : memes niveaux que l'arbre des propositions. */
const NIVEAUX_VUS = [{ id: 'facades', libelle: 'Façades' }, { id: 'toit', libelle: 'Toit' }, { id: 'murs', libelle: 'Murs' }, { id: 'autres', libelle: 'Autres' }] as const;
function typeVu(id: string): (typeof NIVEAUX_VUS)[number]['id'] {
  const sujet = id.split(':obs:')[1] ?? '';
  if (/^(silhouettes|renfort|elements|ouvertures|facade)/i.test(sujet)) return 'facades';
  if (/^(forme|bouts|faitage|lucarne|cheminee|couverture|terrasse|appentis|toit|hauteurToit)/i.test(sujet)) return 'toit';
  if (/^(decor|mur|couleur|materiau|hauteur)/i.test(sujet)) return 'murs';
  return 'autres';
}

/**
 * Ce que Claude a vu, batiment par batiment. Une ligne qui porte une observation sur le toit (forme, bouts, silhouettes des facades)
 * se confirme : « Je confirme » la note dans « Ce que je vois », l'observation de la personne, qui l'emporte sur Claude ; le moteur
 * des toits la relit alors sur la mesure LiDAR et, s'il sait la dessiner, une proposition arrive a cocher. Rien n'est ecrit dans le
 * projet avant « Valider ». En consultation (lecture seule), on lit sans confirmer.
 */
function ObservationsClaude({ batiments, session, lecture }: { batiments: readonly ObservationsBatiment[]; session: SessionAuditParcelle; lecture: boolean }) {
  if (!batiments.length) return null;
  return (
    <section className="observationsClaude" aria-label="Vu par Claude">
      <div className="titreObservations">Vu par Claude, à vérifier sur place</div>
      <p className="noteObservations">{lecture ? 'Ces observations ne changent rien au projet.' : 'Ces observations ne changent rien au projet tant que vous ne les confirmez pas : « Je confirme » les note comme ce que vous avez vu sur place, et le moteur des toits les relit sur la mesure.'}</p>
      {batiments.map((b) => {
        const vu = session.capture.lire().batiments[b.cle]?.vu ?? {};
        // Meme arbre que les propositions : batiment > type (facades, toit, murs...) > lignes.
        const niveaux = NIVEAUX_VUS.map((n) => ({ ...n, os: b.observations.filter((o) => typeVu(o.id) === n.id) })).filter((n) => n.os.length);
        return (
          <Niveau key={b.cle} chemin={'vu:' + b.cle} titre={b.nom} compte={b.observations.length}>
            {niveaux.map((n) => (
            <Niveau key={n.id} chemin={'vu:' + b.cle + '/' + n.id} titre={n.libelle} compte={n.os.length} profond>
            <ul className="listeObservations">
              {n.os.map((o) => {
                const fait = o.confirmer ? dejaConfirme(vu, o.confirmer) : false;
                return (
                  <li key={o.id} className="ligneObservation">
                    <span>{o.texte}</span>
                    {(o.ou.length > 0 || o.accord !== null) && <span className="origineProposition">{[o.ou.length ? 'vu sur : ' + o.ou.join(', ') : null, o.accord !== null ? 'passes d’accord ' + Math.round(o.accord * 100) + ' %' : null].filter(Boolean).join(' · ')}</span>}
                    {o.confirmer && !lecture && (fait
                      ? <span className="origineProposition" role="status">Confirmé par vous : noté dans « Ce que je vois ».</span>
                      : <button type="button" className="secondary small" data-controle="auditParcelle.confirmerObservation" aria-label={'Je confirme : ' + o.texte} onClick={() => session.capture.noterVu(b.cle, { ...vu, ...o.confirmer })}>Je confirme</button>)}
                    {o.confirmer && !lecture && !fait && o.raison && <span className="origineProposition">{o.raison}</span>}
                  </li>
                );
              })}
            </ul>
            </Niveau>
            ))}
          </Niveau>
        );
      })}
    </section>
  );
}

/** Le niveau d'objet d'une proposition dans l'arbre : un par type (facades, toit, murs, cloture...), comme pour un batiment. */
const NIVEAUX: readonly { id: string; libelle: string; de: (p: Proposition) => boolean }[] = [
  { id: 'facades', libelle: 'Façades', de: (p) => p.cible.type === 'facade' },
  { id: 'toit', libelle: 'Toit', de: (p) => ['corpsToit', 'corpsDuToit', 'hauteurToit', 'couverture', 'cheminees', 'lucarnes', 'appentis', 'terrasse'].includes(p.effet.type) },
  { id: 'murs', libelle: 'Murs', de: (p) => ['hauteur', 'couleurMurs', 'materiauMurs'].includes(p.effet.type) },
  { id: 'cloture', libelle: 'Clôture et portail', de: (p) => p.effet.type === 'cloture' || p.effet.type === 'portail' },
];
const NIVEAU_AUTRE = { id: 'autres', libelle: 'Autres' };

/** Les niveaux ouverts survivent aux rendus : chacun s'ouvre et se ferme seul, sans refermer les autres. */
const ouverts = new Set<string>();

function Niveau({ chemin, titre, compte, profond, children }: { chemin: string; titre: string; compte: number; profond?: boolean; children: React.ReactNode }) {
  const [ouvert, setOuvert] = useState(() => !ouverts.has('ferme:' + chemin));
  return (
    <details className={'niveauPropositions' + (profond ? ' sousNiveau' : '')} open={ouvert} onToggle={(e) => {
      const o = (e.currentTarget as HTMLDetailsElement).open;
      if (o) ouverts.delete('ferme:' + chemin); else ouverts.add('ferme:' + chemin);
      setOuvert(o);
    }}>
      <summary className="nomObservations">{titre + ' (' + compte + ')'}</summary>
      {children}
    </details>
  );
}

/** L'arbre des lignes : objet (batiment, parcelle) > type (facades, toit, murs...) > lignes. */
function ArbrePropositions({ propositions, noms, ligne }: { propositions: readonly Proposition[]; noms: ReadonlyMap<string, string>; ligne: (p: Proposition) => React.ReactNode }) {
  const parObjet = new Map<string, Proposition[]>();
  for (const p of propositions) {
    const k = p.cible.type === 'parcelle' ? 'parcelle' : p.cible.cle;
    parObjet.set(k, [...(parObjet.get(k) ?? []), p]);
  }
  return (
    <>
      {[...parObjet].map(([k, ps]) => {
        const nom = k === 'parcelle' ? 'Parcelle' : noms.get(k) ?? ps[0]?.objet.split(' de ').pop() ?? k;
        const niveaux = [...NIVEAUX.map((n) => ({ id: n.id, libelle: n.libelle, ps: ps.filter(n.de) })), { ...NIVEAU_AUTRE, ps: ps.filter((p) => !NIVEAUX.some((m) => m.de(p))) }].filter((n) => n.ps.length);
        return (
          <Niveau key={k} chemin={k} titre={nom} compte={ps.length}>
            {niveaux.map((n) => (
              <Niveau key={n.id} chemin={k + '/' + n.id} titre={n.libelle} compte={n.ps.length} profond>
                <ul className="listePropositions" aria-label={n.libelle + ' de ' + nom}>{n.ps.map(ligne)}</ul>
              </Niveau>
            ))}
          </Niveau>
        );
      })}
    </>
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
        {apercu === 'deux' && <p className="noteAvantApres">Les deux vues tournent ensemble ; « Après » montre les propositions cochées{v.selection() ? ', et la ligne surlignée' : ''}.</p>}
        {!lecture && <AnalyseClaudeAudit analyse={session.analyse} comptes={comptes} />}
        {propositions.length > 0 && <ArbrePropositions propositions={propositions} noms={new Map(v.arbitrages().map((b) => [b.cle, b.nom]))} ligne={(p) => (
          <LigneProposition key={p.id} p={p} cochee={v.cochee(p.id)} basculer={() => v.basculer(p.id)} choisie={v.selection() === p.id}
            choisir={() => v.selectionner(v.selection() === p.id ? null : p.id)} {...(lecture ? { lecture: { decision: v.decision(p.id) } } : {})} />
        )} />}
        <SourcesDesBatiments v={v} />
        <ObservationsClaude batiments={observations} session={session} lecture={lecture} />
        {!lecture && verifs.length > 0 && <ul className="verificationsAudit" aria-label="Vérifié sur place">
          {verifs.map((x) => <li key={x.cle} className={x.verifie ? 'verifie' : ''}>{x.verifie ? x.nom + ' sera marqué « vérifié sur place ».' : x.nom + ' : pas encore vérifié sur place (' + x.raison + ').'}</li>)}
        </ul>}
        {!lecture && <PartageAudit session={session} />}
      </div>
      <div className="piedDialogue">
        {lecture
          ? retour && <button type="button" className="secondary" data-controle="auditsParcelle.retour" onClick={retour}>Retour aux audits</button>
          : <>
              <button type="button" className="secondary" data-controle="auditParcelle.reinitialiser" disabled={!v.aDesDecisions()}
                title="Défait vos cases et vos choix de sources : tout revient à ce que le moteur propose" onClick={() => v.reinitialiser()}>Réinitialiser mes décisions</button>
              <button type="button" className="secondary" data-controle="auditParcelle.liste" onClick={() => session.montrer('liste')}>Liste</button>
              {session.fichierDisponible() && <button type="button" className="secondary" data-controle="auditParcelle.fichier" onClick={() => { void session.partagerLeFichier(); }}>Fichier de l’audit</button>}
              <button type="button" data-controle="auditParcelle.valider" disabled={enCours !== null || (!cochees && !verifies)}
                onClick={() => { if (v.valider()) fermer(); }}>{'Valider' + (cochees ? ' (' + cochees + ')' : '')}</button>
            </>}
      </div>
    </div>
  );
}

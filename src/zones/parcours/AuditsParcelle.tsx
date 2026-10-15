// Z8, Admin › « Audits » (MD/spec-audit.md §15, 15.4 et 15.5) : les audits recus sur le serveur de
// Plan, les plus recents d'abord, en deux sections : audits de parcelle et promenades des toits. Une
// carte par audit : quand il est arrive, la parcelle (IDU et adresse) ou la commune, ses photos, sa
// phase, pourquoi il a ete depose, et sa conclusion en bref (propositions validees, refusees, en
// attente ; cas par statut) ; puis « Ouvrir dans ce projet », « Détails » (DetailAudit.tsx : donnees,
// conclusion, analyses et rejeux), « Télécharger » et « Retirer ». Le retrait se confirme sur la carte
// meme : une question de Z8 s'ouvrirait sous ce parcours. La logique vit dans
// app/audit/parcelle/catalogue.ts.

import { useEffect, useReducer } from 'react';
import { jourDe } from '../../app/audit/reprise.js';
import { heureDe } from '../../app/audit/parcelle/sauvegarde.js';
import { STATUTS_CAS } from '../../app/audit/parcelle/donneesAudit.js';
import { DetailAudit } from './DetailAudit.js';
import type { CatalogueAudits } from '../../app/audit/parcelle/catalogue.js';
import type { FicheAudit } from '../../io/auditsServeur.js';
import type { StatutCas } from '../../model/audit.js';

interface Props { catalogue: CatalogueAudits; fermer: () => void }

const pluriel = (n: number, mot: string) => n + ' ' + mot + (n > 1 ? 's' : '');
const quand = (iso: string) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? iso || 'date inconnue' : jourDe(d) + ' ' + d.getFullYear() + ' à ' + heureDe(iso); };
const taille = (o: number) => (o < 1024 * 1024 ? Math.max(1, Math.round(o / 1024)) + ' Ko' : (Math.round(o / (1024 * 1024) * 10) / 10).toString().replace('.', ',') + ' Mo');

/** Ce que dit la carte, au-dela de la date : la parcelle, les photos, la taille, l'organisation. */
function details(a: FicheAudit): string {
  return [
    a.adresse,
    a.photos !== null ? pluriel(a.photos, 'photo') : null,
    a.cas !== null ? a.cas + ' cas' : null,
    a.taille !== null ? taille(a.taille) : null,
    a.organisation && a.organisation !== 'admin' ? 'organisation ' + a.organisation : a.organisation === 'admin' ? 'administrateur' : null,
  ].filter(Boolean).join(' · ');
}

/** La conclusion en une ligne : ce qui a ete propose, et ce qui en a ete fait. */
function conclusion(a: FicheAudit): string | null {
  if (a.propositions && a.propositions.total) {
    const p = a.propositions;
    return pluriel(p.total, 'proposition') + ' (Claude ' + p.claude + ', mesures ' + p.mesures + ') : ' + p.validees + ' validée' + (p.validees > 1 ? 's' : '')
      + ', ' + p.refusees + ' refusée' + (p.refusees > 1 ? 's' : '') + ', ' + p.enAttente + ' en attente';
  }
  if (a.statuts) return Object.entries(a.statuts).map(([s, n]) => (STATUTS_CAS[s as StatutCas] ?? s) + ' ' + n).join(', ');
  return null;
}

function CarteAudit({ catalogue, a }: { catalogue: CatalogueAudits; a: FicheAudit }) {
  const e = catalogue.etat();
  const raison = a.nature === 'parcelle' ? catalogue.raisonOuvrir(a) : null;
  const raisonAvantApres = a.nature === 'parcelle' ? catalogue.raisonConsulter(a) : null;
  const occupe = e.enCours === a.id;
  const confirmer = e.aConfirmer === a.id;
  const ouverte = e.detail?.id === a.id;
  const nom = 'l’audit du ' + quand(a.recuLe) + ' (' + (a.nature === 'promenade' ? a.commune ?? 'promenade' : a.idu) + ')';
  const resume = conclusion(a);
  return (
    <li className={'carteAuditRecu marque-' + a.marque + (occupe ? ' occupe' : '') + (ouverte ? ' ouverte' : '')}>
      <div className="enteteAuditRecu">
        <span className="dateAuditRecu">{quand(a.recuLe)}</span>
        <span className="pastilleAudit">{a.marque === 'sauvegarde' ? 'Sauvegarde' : a.nature === 'promenade' ? 'Promenade' : 'Partagé pour améliorer Plan'}</span>
        {a.phase && a.nature === 'parcelle' && <span className="pastilleAudit">{a.phase === 'capture' ? 'Capture en cours' : 'Capture terminée'}</span>}
      </div>
      <div className="parcelleAuditRecu">{a.nature === 'promenade' ? 'Commune ' + (a.commune ?? 'inconnue') : 'Parcelle ' + a.idu}</div>
      {details(a) && <div className="detailPhoto">{details(a)}</div>}
      {resume && <div className="detailPhoto conclusionAuditRecu">{resume}</div>}
      {confirmer
        ? <div className="confirmationAuditRecu" role="group" aria-label={'Retirer ' + nom}>
            <p className="detailPhoto">Retirer cet audit du serveur de Plan ? Il ne pourra plus être rouvert, téléchargé ni rejoué, et ses analyses partent avec lui.</p>
            <div className="actionsAuditRecu">
              <button type="button" className="danger small" data-controle="auditsParcelle.confirmerRetrait" onClick={() => { void catalogue.confirmerRetrait(); }}>Retirer définitivement</button>
              <button type="button" className="secondary small" data-controle="auditsParcelle.garder" onClick={() => catalogue.garder()}>Garder</button>
            </div>
          </div>
        : <>
            <div className="actionsAuditRecu" role="group" aria-label={'Actions sur ' + nom}>
              {a.nature === 'parcelle' && <button type="button" className="small" data-controle="auditsParcelle.ouvrir" disabled={raison !== null || e.enCours !== null} title={raison ?? undefined}
                aria-label={'Ouvrir dans ce projet : ' + nom} onClick={() => { void catalogue.ouvrir(a); }}>Ouvrir dans ce projet</button>}
              {a.nature === 'parcelle' && <button type="button" className="secondary small" data-controle="auditsParcelle.avantApres" disabled={raisonAvantApres !== null || e.enCours !== null} title={raisonAvantApres ?? undefined}
                aria-label={'Voir l’avant et l’après : ' + nom} onClick={() => { void catalogue.consulter(a); }}>Avant / Après</button>}
              <button type="button" className="secondary small" data-controle="auditsParcelle.details" aria-pressed={ouverte} disabled={e.enCours !== null && !ouverte}
                aria-label={(ouverte ? 'Refermer ' : 'Détails de ') + nom} onClick={() => { void catalogue.basculerDetail(a); }}>{ouverte ? 'Refermer' : 'Détails'}</button>
              <button type="button" className="secondary small" data-controle="auditsParcelle.telecharger" disabled={e.enCours !== null}
                aria-label={'Télécharger ' + nom} onClick={() => { void catalogue.telecharger(a); }}>Télécharger</button>
              <button type="button" className="secondary small" data-controle="auditsParcelle.retirer" disabled={e.enCours !== null}
                aria-label={'Retirer ' + nom} onClick={() => catalogue.demanderRetrait(a)}>Retirer</button>
            </div>
            {/* Au doigt, l'infobulle n'existe pas : la raison du refus s'ecrit sous les boutons. */}
            {(raison || raisonAvantApres) && <p className="raisonAuditRecu">{raison ?? raisonAvantApres}</p>}
          </>}
      {occupe && <p className="detailPhoto" role="status">Lecture de l’audit sur le serveur…</p>}
      {ouverte && <DetailAudit catalogue={catalogue} a={a} />}
    </li>
  );
}

function Section({ catalogue, titre, audits, vide }: { catalogue: CatalogueAudits; titre: string; audits: FicheAudit[]; vide: string }) {
  return (
    <section className="sectionAuditsRecus" aria-label={titre}>
      <h3 className="titreSectionAudits">{titre} ({audits.length})</h3>
      {audits.length ? <ul className="listeAuditsRecus" aria-label={titre}>{audits.map((a) => <CarteAudit key={a.id} catalogue={catalogue} a={a} />)}</ul>
        : <p className="detailPhoto">{vide}</p>}
    </section>
  );
}

export function AuditsParcelle({ catalogue, fermer }: Props) {
  const [, maj] = useReducer((x: number) => x + 1, 0);
  useEffect(() => catalogue.abonner(maj), [catalogue]);
  const e = catalogue.etat();
  const audits = e.audits ?? [];
  const parcelles = audits.filter((a) => a.nature === 'parcelle');
  const promenades = audits.filter((a) => a.nature === 'promenade');
  const sauvegardes = parcelles.filter((a) => a.marque === 'sauvegarde').length;
  const partages = parcelles.length - sauvegardes;
  const resume = e.chargement && !e.audits ? 'Lecture des audits reçus…'
    : e.audits ? (audits.length ? pluriel(audits.length, 'audit') + ' reçu' + (audits.length > 1 ? 's' : '') + ' : ' + pluriel(sauvegardes, 'sauvegarde') + ', ' + partages + ' partagé' + (partages > 1 ? 's' : '') + ' pour améliorer Plan'
      + (promenades.length ? ', ' + pluriel(promenades.length, 'promenade') : '') + '.' : 'Aucun audit reçu sur le serveur de Plan.')
    : '';
  return (
    <div className="dialogueImperatif dialogueAudit dialogueAuditsParcelle" role="dialog" aria-modal="true" aria-label="Audits">
      <div className="titreParcours">Audits</div>
      <div className="sousTitreParcours">Reçus sur le serveur de Plan : les audits de parcelle (sauvegardes prises pendant la capture, partages pour améliorer Plan) et les promenades des toits. Pour chacun, ses données, sa conclusion et ce qui en a été fait ; pour un audit de parcelle, ses analyses par Claude et leurs rejeux, à comparer par modèle. Rien n’est jeté.</div>
      <div className="detailPhoto" role="status" aria-live="polite">{resume}</div>
      {e.erreur && <div className="erreurParcours" role="alert">{e.erreur}</div>}
      {e.audits && <>
        <Section catalogue={catalogue} titre="Audits de parcelle" audits={parcelles} vide="Aucun audit de parcelle reçu." />
        <Section catalogue={catalogue} titre="Promenades des toits" audits={promenades} vide="Aucune promenade reçue : « Ajouter un fichier d’audit… » en dépose une." />
      </>}
      <div className="piedDialogue">
        {catalogue.deposerDisponible() && <button type="button" className="secondary" data-controle="auditsParcelle.deposer" onClick={() => catalogue.deposer()}>Ajouter un fichier d’audit…</button>}
        <button type="button" className="secondary" data-controle="auditsParcelle.relire" disabled={e.chargement} onClick={() => { void catalogue.relire(); }}>Relire</button>
        <button type="button" className="secondary" data-controle="auditsParcelle.fermer" onClick={fermer}>Fermer</button>
      </div>
    </div>
  );
}

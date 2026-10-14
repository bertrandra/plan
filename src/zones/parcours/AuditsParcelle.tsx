// Z8, Admin › « Audits de parcelle » (MD/spec-audit.md §15) : les audits recus sur le serveur de
// Plan, les plus recents d'abord. Une carte par audit : quand il est arrive, la parcelle (IDU et
// adresse), ses photos, sa phase (capture en cours ou terminee) et pourquoi il a ete depose
// (sauvegarde de la capture, ou partage pour améliorer Plan) ; puis « Ouvrir dans ce projet »,
// « Télécharger » et « Retirer ». Le retrait se confirme sur la carte meme : une question de Z8
// s'ouvrirait sous ce parcours. La logique vit dans app/audit/parcelle/catalogue.ts.

import { useEffect, useReducer } from 'react';
import { jourDe } from '../../app/audit/reprise.js';
import { heureDe } from '../../app/audit/parcelle/sauvegarde.js';
import type { CatalogueAudits } from '../../app/audit/parcelle/catalogue.js';
import type { FicheAudit } from '../../io/auditsServeur.js';

interface Props { catalogue: CatalogueAudits; fermer: () => void }

const pluriel = (n: number, mot: string) => n + ' ' + mot + (n > 1 ? 's' : '');
const quand = (iso: string) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? iso || 'date inconnue' : jourDe(d) + ' ' + d.getFullYear() + ' à ' + heureDe(iso); };
const taille = (o: number) => (o < 1024 * 1024 ? Math.max(1, Math.round(o / 1024)) + ' Ko' : (Math.round(o / (1024 * 1024) * 10) / 10).toString().replace('.', ',') + ' Mo');

/** Ce que dit la carte, au-dela de la date : la parcelle, les photos, la taille, l'organisation. */
function details(a: FicheAudit): string {
  return [
    a.adresse,
    a.photos !== null ? pluriel(a.photos, 'photo') : null,
    a.taille !== null ? taille(a.taille) : null,
    a.organisation && a.organisation !== 'admin' ? 'organisation ' + a.organisation : a.organisation === 'admin' ? 'administrateur' : null,
  ].filter(Boolean).join(' · ');
}

function CarteAudit({ catalogue, a }: { catalogue: CatalogueAudits; a: FicheAudit }) {
  const e = catalogue.etat();
  const raison = catalogue.raisonOuvrir(a);
  const occupe = e.enCours === a.id;
  const confirmer = e.aConfirmer === a.id;
  const nom = 'l’audit du ' + quand(a.recuLe) + ' (' + a.idu + ')';
  return (
    <li className={'carteAuditRecu marque-' + a.marque + (occupe ? ' occupe' : '')}>
      <div className="enteteAuditRecu">
        <span className="dateAuditRecu">{quand(a.recuLe)}</span>
        <span className="pastilleAudit">{a.marque === 'sauvegarde' ? 'Sauvegarde' : 'Partagé pour améliorer Plan'}</span>
        {a.phase && <span className="pastilleAudit">{a.phase === 'capture' ? 'Capture en cours' : 'Capture terminée'}</span>}
      </div>
      <div className="parcelleAuditRecu">Parcelle {a.idu}</div>
      {details(a) && <div className="detailPhoto">{details(a)}</div>}
      {confirmer
        ? <div className="confirmationAuditRecu" role="group" aria-label={'Retirer ' + nom}>
            <p className="detailPhoto">Retirer cet audit du serveur de Plan ? Il ne pourra plus être rouvert, téléchargé ni rejoué.</p>
            <div className="actionsAuditRecu">
              <button type="button" className="danger small" data-controle="auditsParcelle.confirmerRetrait" onClick={() => { void catalogue.confirmerRetrait(); }}>Retirer définitivement</button>
              <button type="button" className="secondary small" data-controle="auditsParcelle.garder" onClick={() => catalogue.garder()}>Garder</button>
            </div>
          </div>
        : <>
            <div className="actionsAuditRecu" role="group" aria-label={'Actions sur ' + nom}>
              <button type="button" className="small" data-controle="auditsParcelle.ouvrir" disabled={raison !== null || e.enCours !== null} title={raison ?? undefined}
                aria-label={'Ouvrir dans ce projet : ' + nom} onClick={() => { void catalogue.ouvrir(a); }}>Ouvrir dans ce projet</button>
              <button type="button" className="secondary small" data-controle="auditsParcelle.telecharger" disabled={e.enCours !== null}
                aria-label={'Télécharger ' + nom} onClick={() => { void catalogue.telecharger(a); }}>Télécharger</button>
              <button type="button" className="secondary small" data-controle="auditsParcelle.retirer" disabled={e.enCours !== null}
                aria-label={'Retirer ' + nom} onClick={() => catalogue.demanderRetrait(a)}>Retirer</button>
            </div>
            {/* Au doigt, l'infobulle n'existe pas : la raison du refus s'ecrit sous les boutons. */}
            {raison && <p className="raisonAuditRecu">{raison}</p>}
          </>}
      {occupe && <p className="detailPhoto" role="status">Lecture de l’audit sur le serveur…</p>}
    </li>
  );
}

export function AuditsParcelle({ catalogue, fermer }: Props) {
  const [, maj] = useReducer((x: number) => x + 1, 0);
  useEffect(() => catalogue.abonner(maj), [catalogue]);
  const e = catalogue.etat();
  const audits = e.audits ?? [];
  const sauvegardes = audits.filter((a) => a.marque === 'sauvegarde').length;
  const resume = e.chargement && !e.audits ? 'Lecture des audits reçus…'
    : e.audits ? (audits.length ? pluriel(audits.length, 'audit') + ' reçu' + (audits.length > 1 ? 's' : '') + ' : ' + pluriel(sauvegardes, 'sauvegarde') + ', ' + (audits.length - sauvegardes) + ' partagé' + (audits.length - sauvegardes > 1 ? 's' : '') + ' pour améliorer Plan.' : 'Aucun audit reçu sur le serveur de Plan.')
    : '';
  return (
    <div className="dialogueImperatif dialogueAudit dialogueAuditsParcelle" role="dialog" aria-modal="true" aria-label="Audits de parcelle">
      <div className="titreParcours">Audits de parcelle</div>
      <div className="sousTitreParcours">Reçus sur le serveur de Plan : les sauvegardes prises pendant la capture, et les audits partagés pour améliorer Plan. Un audit s’ouvre dans le projet de sa parcelle, à la phase où il en était.</div>
      <div className="detailPhoto" role="status" aria-live="polite">{resume}</div>
      {e.erreur && <div className="erreurParcours" role="alert">{e.erreur}</div>}
      {audits.length > 0 && <ul className="listeAuditsRecus" aria-label="Audits reçus">
        {audits.map((a) => <CarteAudit key={a.id} catalogue={catalogue} a={a} />)}
      </ul>}
      <div className="piedDialogue">
        <button type="button" className="secondary" data-controle="auditsParcelle.relire" disabled={e.chargement} onClick={() => { void catalogue.relire(); }}>Relire</button>
        <button type="button" className="secondary" data-controle="auditsParcelle.fermer" onClick={fermer}>Fermer</button>
      </div>
    </div>
  );
}

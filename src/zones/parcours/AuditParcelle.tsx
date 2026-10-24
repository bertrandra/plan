// Z8, l'audit de la parcelle du projet, phase 1 : la capture (MD/spec-audit.md §12).
//
// Trois ecrans, une session (app/audit/parcelle/controleur.ts) :
// - la liste de controle, plein ecran : par batiment de la parcelle, les facades, le toit, les
//   cheminees, la toiture-terrasse et les materiaux ; puis la cloture cote rue et le portail ; le
//   compteur de ce qui reste, et « Lancer l'analyse » (les maisons voisines n'y sont plus) ;
// - l'ecran de prise, pose en bas de la Vue 3D (le voile s'efface, la scene reste visible) : la
//   facade devant vous, surlignee dans la scene et nommee ici, et la photo qui s'y range d'elle-meme ;
// - les propositions (phase 3, zones/parcours/PropositionsAudit.tsx), posees elles aussi sur la Vue 3D.
//
// Tout s'ecrit dans la capture a chaque geste, gardee dans le brouillon de l'appareil : fermer ne perd
// rien, et rien n'entre dans le projet avant la validation des propositions. Quand quelqu'un peut
// envoyer, la liste dit aussi ou en est la sauvegarde sur le serveur de Plan (« Envoyer l'audit au
// serveur », une commande du registre).

import { useEffect, useReducer, useState } from 'react';
import { preparerPhoto } from '../../app/audit/photo.js';
import { texteStatutFacade, type LigneBatiment, type LigneFacade, type LignePartie } from '../../app/audit/parcelle/liste.js';
import { jourDe } from '../../app/audit/reprise.js';
import { LIBELLE_REJOUER, texteFusion, textePhoto, texteRejeu } from '../../app/audit/parcelle/redressement.js';
import { cleMesure } from '../../app/audit/parcelle/mesures.js';
import { NATURES_PORTAIL, POSITIONS_PORTAIL, TYPES_CLOTURE } from '../../model/auditParcelle.js';
import { texteDeLaSauvegarde } from '../../app/audit/parcelle/sauvegarde.js';
import { BoutonCommande } from '../composants/BoutonCommande.js';
import { BoutonFermerAudit } from './BoutonFermerAudit.js';
import { CeQueJeVois } from './CeQueJeVois.js';
import { CoinsPhotoAudit } from './CoinsPhotoAudit.js';
import { PropositionsAudit } from './PropositionsAudit.js';
import { useCadrerVue } from './cadrageVue.js';
import type { SessionAuditParcelle } from '../../app/audit/parcelle/controleur.js';
import type { RegistreCommandes } from '../../app/commandes.js';
import type { PhotoCas } from '../../model/audit.js';
import type { CorrectionRedressement } from '../../model/auditParcelle.js';
import type { PartieVue } from '../../model/ceQueJeVois.js';

interface Props { session: SessionAuditParcelle; commandes: RegistreCommandes; fermer: () => void; retour?: () => void }

/** La session change (un geste, une position, la boussole) : l'ecran se redessine. */
function useSuivreSession(session: SessionAuditParcelle): void {
  const [, maj] = useReducer((x: number) => x + 1, 0);
  useEffect(() => session.abonner(maj), [session]);
}

const NOMS_PARTIES: Record<PartieVue, string> = { toit: 'Toit', cheminees: 'Cheminées', terrasse: 'Toiture-terrasse', materiaux: 'Matériaux' };

/** Un bouton « Prendre une photo » : le champ fichier natif, couvert d'un bouton lisible. */
function BoutonPhoto({ controle, libelle, desactive, prendre }: { controle: 'auditParcelle.photo' | 'auditParcelle.photoToit' | 'auditParcelle.photoCloture' | 'auditParcelle.photoPortail'; libelle: string; desactive?: boolean; prendre: (f: File) => void }) {
  const champ = (onChange: (e: React.ChangeEvent<HTMLInputElement>) => void) => {
    const commun = { type: 'file', accept: 'image/*', capture: 'environment' as const, disabled: !!desactive, onChange };
    if (controle === 'auditParcelle.photo') return <input {...commun} data-controle="auditParcelle.photo" />;
    if (controle === 'auditParcelle.photoToit') return <input {...commun} data-controle="auditParcelle.photoToit" />;
    if (controle === 'auditParcelle.photoCloture') return <input {...commun} data-controle="auditParcelle.photoCloture" />;
    return <input {...commun} data-controle="auditParcelle.photoPortail" />;
  };
  return (
    <label className={'boutonFichier' + (desactive ? ' desactive' : '')}>
      {champ((e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) prendre(f); })}
      <span>{libelle}</span>
    </label>
  );
}

/** Les vignettes d'une ligne, chacune avec « Retirer ». */
function Vignettes({ photos, nom, retirer }: { photos: readonly PhotoCas[]; nom: string; retirer: (rang: number) => void }) {
  if (!photos.length) return null;
  return (
    <ul className="photosAudit" aria-label={'Photos : ' + nom}>
      {photos.map((ph, i) => (
        <li key={i + ':' + ph.base64.length}>
          <img src={'data:image/jpeg;base64,' + ph.base64} alt={'Photo ' + (i + 1) + ' : ' + nom} />
          <button type="button" className="secondary small" data-controle="auditParcelle.retirerPhoto" aria-label={'Retirer la photo ' + (i + 1) + ' : ' + nom} onClick={() => retirer(i)}>Retirer</button>
        </li>
      ))}
    </ul>
  );
}

/**
 * Le redressement et la fusion des photos d'une facade : le statut de chacune (automatique, a la main, echec et son motif),
 * celui de l'ensemble, et « Rejouer redressement + fusion ». Un rejeu ne remplace que les images derivees.
 */
function Redressement({ session, cle, cote, nom, largeurPlanM }: { session: SessionAuditParcelle; cle: string; cote: number; nom: string; largeurPlanM: number }) {
  const [enCours, setEnCours] = useState(false);
  const [coinsRang, setCoinsRang] = useState<number | null>(null);
  const mesure = session.validation.mesuresFaites().get(cleMesure(cle, cote));
  const bilan = mesure?.redressement;
  const saisie = session.capture.lire().batiments[cle]?.facades[String(cote)];
  const rejouer = () => { setEnCours(true); void session.validation.rejouerRedressement(cle, cote).finally(() => setEnCours(false)); };
  // Une correction ecrite dans la capture, puis la facade rejouee : le calcul reprend les points de la personne.
  const corriger = (rang: number, c: CorrectionRedressement | null) => {
    const avant = saisie?.corrections?.[String(rang)];
    session.capture.corrigerRedressement(cle, cote, rang, c ? { ...avant, ...c } : null);
    rejouer();
  };
  const photo = coinsRang !== null ? saisie?.photos[coinsRang] : undefined;
  return (
    <div className="redressementAudit" aria-label={'Redressement et fusion : ' + nom}>
      {bilan
        ? <>
          <div className="detailPhoto" data-controle="auditParcelle.statutFusion" role="status">{texteFusion(bilan)}</div>
          <ul className="detailPhoto">{bilan.photos.map((p) => <li key={p.rang} className={'statut-' + p.statut}>
            {textePhoto(p)}{' '}
            <button type="button" className={p.statut === 'echec' ? 'small' : 'secondary small'} data-controle="auditParcelle.placerCoins" aria-label={'Placer quatre repères sur la photo ' + (p.rang + 1) + ' : ' + nom} onClick={() => setCoinsRang(p.rang)}>Placer 4 repères</button>
          </li>)}</ul>
        </>
        : <div className="detailPhoto">Pas encore redressée : lancez l’analyse.</div>}
      {photo && coinsRang !== null && <CoinsPhotoAudit photo={photo} rang={coinsRang} nom={nom} largeurPlanM={largeurPlanM}
        depart={saisie?.corrections?.[String(coinsRang)]?.reperes ?? saisie?.corrections?.[String(coinsRang)]?.coins ?? bilan?.photos.find((p) => p.rang === coinsRang)?.coinsPx}
        mur={saisie?.corrections?.[String(coinsRang)]?.coins ?? bilan?.photos.find((p) => p.rang === coinsRang)?.coinsPx}
        gabarit={mesure?.gabarit}
        echelleDepart={saisie?.corrections?.[String(coinsRang)]?.echelleLargeurM}
        appliquer={(c) => corriger(coinsRang, c)} retablir={() => corriger(coinsRang, null)} fermer={() => setCoinsRang(null)} />}
      <button type="button" className="secondary small" data-controle="auditParcelle.rejouerRedressement" disabled={enCours} aria-label={LIBELLE_REJOUER + ' : ' + nom} onClick={rejouer}>{enCours ? 'Rejeu en cours…' : LIBELLE_REJOUER}</button>
    </div>
  );
}

/** « Rejouer redressement + fusion » pour tout l'audit : chaque facade photographiee refait ses images derivees. */
function RejouerTout({ session }: { session: SessionAuditParcelle }) {
  const [etat, setEtat] = useState<{ enCours: boolean; texte: string }>({ enCours: false, texte: '' });
  const rejouer = () => {
    setEtat({ enCours: true, texte: '' });
    void session.validation.rejouerRedressement().then((n) => setEtat({ enCours: false, texte: texteRejeu(n) }), () => setEtat({ enCours: false, texte: 'Le rejeu a échoué : vos photos sont intactes.' }));
  };
  return (
    <div className="actionsAudit">
      <button type="button" className="secondary" data-controle="auditParcelle.rejouerRedressement" disabled={etat.enCours} onClick={rejouer}>{etat.enCours ? 'Rejeu en cours…' : LIBELLE_REJOUER}</button>
      <span className="detailPhoto" role="status">{etat.texte || 'Refait le redressement de chaque photo et leur fusion, sans toucher aux photos ni à vos corrections.'}</span>
    </div>
  );
}

/** Une facade : son statut, « Photographier », « Inaccessible » ; ses photos en la depliant. */
function LigneFacadeVue({ session, b, f, ouverte, basculer, prendre }: { session: SessionAuditParcelle; b: LigneBatiment; f: LigneFacade; ouverte: boolean; basculer: () => void; prendre: (cle: string, cote: number) => void }) {
  const photos = session.capture.lire().batiments[b.cle]?.facades[String(f.cote)]?.photos ?? [];
  const nom = f.libelle + ' de ' + b.nom;
  const mitoyenne = f.statut === 'mitoyenne';
  return (
    <li className={'ligneAudit statut-' + f.statut}>
      <div className="enteteLigneAudit">
        <button type="button" className="texteLigneAudit" data-controle="auditParcelle.voirFacade" aria-expanded={ouverte} disabled={!photos.length} onClick={basculer}>
          <span>{f.libelle}</span>
          <span className="statutLigneAudit">{texteStatutFacade(f)}</span>
        </button>
        {!mitoyenne && <button type="button" className="secondary small" data-controle="auditParcelle.photographierFacade" aria-label={'Photographier : ' + nom} onClick={() => prendre(b.cle, f.cote)}>Photographier</button>}
        {!mitoyenne && f.statut !== 'photographiee' && <button type="button" className="secondary small" data-controle="auditParcelle.inaccessible" aria-pressed={f.statut === 'inaccessible'}
          aria-label={(f.statut === 'inaccessible' ? 'Rendre accessible : ' : 'Marquer inaccessible : ') + nom}
          onClick={() => session.capture.basculerInaccessible(b.cle, f.cote, f.statut === 'inaccessible')}>Inaccessible</button>}
      </div>
      {ouverte && <Vignettes photos={photos} nom={nom} retirer={(r) => session.capture.retirerPhotoFacade(b.cle, f.cote, r)} />}
      {ouverte && photos.length > 0 && <Redressement session={session} cle={b.cle} cote={f.cote} nom={nom} largeurPlanM={f.facade.largeur} />}
    </li>
  );
}

/** Une partie de « Ce que je vois » : son statut et son resume ; depliee, le composant partage. */
function LignePartieVue({ session, b, p, ouverte, basculer, photo }: { session: SessionAuditParcelle; b: LigneBatiment; p: LignePartie; ouverte: boolean; basculer: () => void; photo: (f: File) => void }) {
  const capture = session.capture.lire().batiments[b.cle];
  const nom = NOMS_PARTIES[p.partie] + ' de ' + b.nom;
  return (
    <li className={'ligneAudit' + (p.vu ? ' statut-vu' : '')}>
      <div className="enteteLigneAudit">
        <button type="button" className="texteLigneAudit" data-controle="auditParcelle.noter" aria-expanded={ouverte} aria-label={(ouverte ? 'Replier : ' : 'Noter : ') + nom} onClick={basculer}>
          <span>{NOMS_PARTIES[p.partie]}</span>
          <span className="statutLigneAudit">{p.statut + (p.resume ? ' · ' + p.resume : '')}</span>
        </button>
      </div>
      {ouverte && <div className="corpsLigneAudit">
        <CeQueJeVois vu={capture?.vu ?? {}} parties={[p.partie]} changer={(vu) => session.capture.noterVu(b.cle, vu)} />
        {p.partie === 'toit' && <>
          <Vignettes photos={capture?.photos ?? []} nom={'toit de ' + b.nom} retirer={(r) => session.capture.retirerPhotoBatiment(b.cle, r)} />
          <BoutonPhoto controle="auditParcelle.photoToit" libelle="Photo du toit" prendre={photo} />
        </>}
      </div>}
    </li>
  );
}

function SectionBatiment({ session, b, ouverte, basculer, prendre, photo }: {
  session: SessionAuditParcelle; b: LigneBatiment; ouverte: string | null; basculer: (cle: string) => void;
  prendre: (cle: string, cote: number) => void; photo: (cle: string, f: File) => void;
}) {
  return (
    <section className="batimentAudit" aria-label={b.nom}>
      <h3 className="titreBatimentAudit">{b.nom}</h3>
      <ul className="lignesAudit" aria-label={'Façades de ' + b.nom}>
        {b.facades.map((f) => <LigneFacadeVue key={f.cote} session={session} b={b} f={f} ouverte={ouverte === b.cle + '#' + f.cote} basculer={() => basculer(b.cle + '#' + f.cote)} prendre={prendre} />)}
      </ul>
      <ul className="lignesAudit" aria-label={'Toit et matériaux de ' + b.nom}>
        {b.parties.map((p) => <LignePartieVue key={p.partie} session={session} b={b} p={p} ouverte={ouverte === b.cle + ':' + p.partie} basculer={() => basculer(b.cle + ':' + p.partie)} photo={(f) => photo(b.cle, f)} />)}
      </ul>
    </section>
  );
}

/** Une mesure a vue, en metres : le nombre tape s'ecrit tel quel, vide il est retire. */
function ChampMetres({ controle, libelle, valeur, poser }: { controle: 'auditParcelle.hauteurCloture' | 'auditParcelle.largeurPortail'; libelle: string; valeur: number | undefined; poser: (v: number | undefined) => void }) {
  const surSaisie = (e: React.ChangeEvent<HTMLInputElement>) => { const v = parseFloat(e.target.value.replace(',', '.')); poser(Number.isFinite(v) && v > 0 ? Math.round(v * 100) / 100 : undefined); };
  const commun = { type: 'number', inputMode: 'decimal' as const, min: 0, step: 0.1, defaultValue: valeur ?? '', 'aria-label': libelle + ', en mètres', onChange: surSaisie };
  return (
    <label className="champMetresAudit">
      <span className="libelleChamp">{libelle}</span>
      {controle === 'auditParcelle.hauteurCloture' ? <input {...commun} data-controle="auditParcelle.hauteurCloture" /> : <input {...commun} data-controle="auditParcelle.largeurPortail" />}
      <span className="unite">m</span>
    </label>
  );
}

/** La cloture cote rue et le portail (§12.1, « pour la parcelle »). */
function SectionParcelle({ session, ouverte, basculer, photo }: { session: SessionAuditParcelle; ouverte: string | null; basculer: (cle: string) => void; photo: (quoi: 'cloture' | 'portail', f: File) => void }) {
  const l = session.liste();
  const { cloture: c, portail: p } = session.capture.lire();
  return (
    <section className="batimentAudit" aria-label="La parcelle">
      <h3 className="titreBatimentAudit">La parcelle</h3>
      <ul className="lignesAudit">
        <li className={'ligneAudit' + (l.cloture.faite ? ' statut-vu' : '')}>
          <div className="enteteLigneAudit">
            <button type="button" className="texteLigneAudit" data-controle="auditParcelle.noter" aria-expanded={ouverte === 'cloture'} onClick={() => basculer('cloture')}>
              <span>Clôture côté rue</span><span className="statutLigneAudit">{l.cloture.faite ? 'Notée · ' + l.cloture.resume : 'À faire'}</span>
            </button>
          </div>
          {ouverte === 'cloture' && <div className="corpsLigneAudit">
            <div className="puces" role="group" aria-label="Type de clôture">
              {TYPES_CLOTURE.map((t) => <button key={t.code} type="button" data-controle="auditParcelle.typeCloture" aria-pressed={c.type === t.code} onClick={() => session.capture.noterCloture({ type: c.type === t.code ? undefined : t.code })}>{t.libelle}</button>)}
            </div>
            <ChampMetres controle="auditParcelle.hauteurCloture" libelle="Hauteur" valeur={c.hauteurM} poser={(v) => session.capture.noterCloture({ hauteurM: v })} />
            <div className="libelleChamp">Soubassement</div>
            <div className="puces" role="group" aria-label="Soubassement">
              {([['oui', true], ['non', false]] as const).map(([lib, v]) => <button key={lib} type="button" data-controle="auditParcelle.soubassement" aria-pressed={c.soubassement === v}
                onClick={() => session.capture.noterCloture({ soubassement: c.soubassement === v ? undefined : v })}>{lib === 'oui' ? 'Oui' : 'Non'}</button>)}
            </div>
            <Vignettes photos={c.photos} nom="clôture côté rue" retirer={(r) => session.capture.retirerPhotoCloture(r)} />
            <BoutonPhoto controle="auditParcelle.photoCloture" libelle="Photo de la clôture" prendre={(f) => photo('cloture', f)} />
          </div>}
        </li>
        <li className={'ligneAudit' + (l.portail.faite ? ' statut-vu' : '')}>
          <div className="enteteLigneAudit">
            <button type="button" className="texteLigneAudit" data-controle="auditParcelle.noter" aria-expanded={ouverte === 'portail'} onClick={() => basculer('portail')}>
              <span>Portail</span><span className="statutLigneAudit">{l.portail.faite ? 'Noté · ' + l.portail.resume : 'À faire'}</span>
            </button>
          </div>
          {ouverte === 'portail' && <div className="corpsLigneAudit">
            <div className="puces" role="group" aria-label="Portail ou portillon">
              {NATURES_PORTAIL.map((n) => <button key={n.code} type="button" data-controle="auditParcelle.naturePortail" aria-pressed={p.nature === n.code} onClick={() => session.capture.noterPortail({ nature: p.nature === n.code ? undefined : n.code })}>{n.libelle}</button>)}
            </div>
            {p.nature !== 'aucun' && <>
              <div className="puces" role="group" aria-label="Position le long de la limite, vue de la rue">
                {POSITIONS_PORTAIL.map((x) => <button key={x.code} type="button" data-controle="auditParcelle.positionPortail" aria-pressed={p.position === x.code} onClick={() => session.capture.noterPortail({ position: p.position === x.code ? undefined : x.code })}>{x.libelle}</button>)}
              </div>
              <ChampMetres controle="auditParcelle.largeurPortail" libelle="Largeur" valeur={p.largeurM} poser={(v) => session.capture.noterPortail({ largeurM: v })} />
              <Vignettes photos={p.photos} nom="portail" retirer={(r) => session.capture.retirerPhotoPortail(r)} />
              <BoutonPhoto controle="auditParcelle.photoPortail" libelle="Photo du portail" prendre={(f) => photo('portail', f)} />
            </>}
          </div>}
        </li>
      </ul>
    </section>
  );
}

/**
 * La sauvegarde sur le serveur de Plan (§15) : le bouton et ce qui est parti, ce qui va partir, ou
 * pourquoi rien ne part (hors ligne, trop gros, refus du serveur). Absente quand personne ne peut envoyer.
 */
function SauvegardeAudit({ session, commandes }: { session: SessionAuditParcelle; commandes: RegistreCommandes }) {
  const e = session.sauvegarde.etat();
  if (!e.disponible) return null;
  const alerte = e.etat === 'erreur' || e.etat === 'tropGros';
  return (
    <div className={'sauvegardeAudit etat-' + e.etat}>
      <BoutonCommande commandes={commandes} id="audit.envoyerParcelle" className="secondary small" enCours={e.etat === 'envoi' ? 'Envoi…' : false}>Envoyer l’audit au serveur</BoutonCommande>
      <p className={'noteSauvegarde' + (alerte ? ' alerte' : '')} role={alerte ? 'alert' : 'status'}>{texteDeLaSauvegarde(e)}</p>
    </div>
  );
}

/** La photo prise, reduite, avec la prise de vue relevee au retour de l'appareil. */
function usePhoto(session: SessionAuditParcelle): { enCours: boolean; erreur: string; prendre: (f: File, ranger: (p: PhotoCas) => boolean | void) => void } {
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState('');
  const prendre = (f: File, ranger: (p: PhotoCas) => boolean | void) => {
    const prise = session.prise();
    setEnCours(true); setErreur('');
    // Faux : la ligne a deja toutes ses photos.
    void preparerPhoto(f, prise).then((p) => { if (ranger(p) === false) setErreur('Cette ligne a déjà toutes ses photos : retirez-en une pour en prendre une autre.'); })
      .catch(() => setErreur('Cette image n’a pas pu être lue. Réessayez avec une autre photo.'))
      .finally(() => setEnCours(false));
  };
  return { enCours, erreur, prendre };
}

function Liste({ session, commandes, fermer }: Props) {
  const [ouverte, setOuverte] = useState<string | null>(null);
  const photo = usePhoto(session);
  const l = session.liste();
  const c = session.capture.lire();
  const basculer = (cle: string) => setOuverte(ouverte === cle ? null : cle);
  const terminee = c.phase === 'analyse';
  const section = (b: LigneBatiment) => <SectionBatiment key={b.cle} session={session} b={b} ouverte={ouverte} basculer={basculer}
    prendre={(cle, cote) => session.photographier(cle, cote)}
    photo={(cle, f) => photo.prendre(f, (p) => session.capture.ajouterPhotoBatiment(cle, p))} />;
  return (
    <div className="dialogueImperatif dialogueAudit dialogueAuditParcelle" role="dialog" aria-modal="true" aria-label="Audit de la parcelle">
      <div className="titreParcours">Audit de la parcelle</div>
      <div className="sousTitreParcours compteurAudit" aria-live="polite">{l.compteur}</div>
      {terminee && <div className="bandeauAudit" role="status">
        <span>{'Capture terminée le ' + jourDe(new Date(c.finCapture ?? c.debut)) + '. Elle est gardée sur cet appareil ; vos mesures deviennent des propositions, à valider.'}</span>
        <button type="button" className="small" data-controle="auditParcelle.propositions" onClick={() => session.montrer('propositions')}>Voir les propositions</button>
        <button type="button" className="secondary small" data-controle="auditParcelle.completer" onClick={() => session.capture.rouvrir()}>Compléter la capture</button>
      </div>}
      <div className="actionsAudit">
        <button type="button" data-controle="auditParcelle.prise" onClick={() => session.montrer('prise')}>Photographier en marchant</button>
        <span className="detailPhoto">La Vue 3D ne montre que le bâtiment. Devant une façade, elle vous suit à hauteur d’homme : la façade passe en rouge et la photo s’y range d’elle-même. Sinon, elle montre tout le bâtiment : touchez la façade à photographier.</span>
      </div>
      {photo.erreur && <div className="erreurParcours" role="alert">{photo.erreur}</div>}
      {l.peutLancer && <RejouerTout session={session} />}
      {l.batiments.map(section)}
      <SectionParcelle session={session} ouverte={ouverte} basculer={basculer}
        photo={(quoi, f) => photo.prendre(f, (p) => (quoi === 'cloture' ? session.capture.ajouterPhotoCloture(p) : session.capture.ajouterPhotoPortail(p)))} />
      {l.peutLancer && l.manques.length > 0 && <details className="manquesAudit">
        <summary>{'Ce qui manque (' + l.manques.length + ')'}</summary>
        <ul>{l.manques.map((m) => <li key={m.cle}>{m.texte}</li>)}</ul>
      </details>}
      <SauvegardeAudit session={session} commandes={commandes} />
      <div className="piedDialogue">
        {!terminee && !l.peutLancer && <span className="detailPhoto">Photographiez au moins une façade pour lancer l’analyse.</span>}
        <button type="button" className="secondary" data-controle="auditParcelle.fermer" onClick={fermer}>Fermer</button>
        {!terminee && <button type="button" data-controle="auditParcelle.lancer" disabled={!l.peutLancer} onClick={() => { session.lancerAnalyse(); session.montrer('propositions'); }}>Lancer l’analyse</button>}
      </div>
    </div>
  );
}

const metres = (v: number) => (Math.round(v * 10) / 10).toFixed(1).replace('.', ',') + ' m';

/** Ce que l'ecran de prise dit de la facade visee, ou pourquoi il n'y en a pas. */
function texteVisee(session: SessionAuditParcelle): { titre: string; detail: string | null } {
  const c = session.cible();
  const pos = session.position();
  const photos = (n: number) => n + ' photo' + (n > 1 ? 's' : '');
  if (c) {
    const titre = c.choisie
      ? 'Photo pour ' + c.nom + ' (choisie) — ' + photos(c.photos)
      : 'Vous êtes devant ' + c.nom + (c.distance !== null ? ', ' + metres(c.distance) : '') + ' — ' + photos(c.photos);
    return { titre: titre.charAt(0).toUpperCase() + titre.slice(1), detail: c.plan };
  }
  if (pos.etat === 'refusee') return { titre: 'Position refusée.', detail: 'Touchez la façade dans la 3D, ou choisissez-la dans la liste : « Photographier » sur sa ligne.' };
  if (pos.etat === 'attente') return { titre: 'En attente de votre position…', detail: 'Sans position, touchez la façade dans la 3D ou choisissez-la dans la liste.' };
  return { titre: 'Aucune façade de la parcelle devant vous.', detail: 'Placez-vous face à un mur, du côté extérieur, entre 3 et 40 m, ou touchez la façade dans la 3D.' };
}

/**
 * Le batiment verrouille pour la prise (action volontaire) : la parcelle porte une annexe a cote de
 * la maison, et la reconnaissance passait de l'une a l'autre. Un bouton par batiment ; toucher celui
 * qui est verrouille rend la main. Absent quand la parcelle n'a qu'un batiment.
 */
function VerrouBatiment({ session }: { session: SessionAuditParcelle }) {
  const batiments = session.liste().batiments;
  const verrou = session.verrou();
  if (batiments.length < 2) return null;
  return (
    <div className="verrouBatiment" role="group" aria-label="Bâtiment photographié">
      <span className="detailPhoto">{verrou === null ? 'Plusieurs bâtiments sur la parcelle. Verrouiller :' : 'Verrouillé, seul ce bâtiment est visé :'}</span>
      {batiments.map((b) => (
        <button key={b.cle} type="button" className="secondary small" data-controle="auditParcelle.verrouiller" aria-pressed={verrou === b.cle}
          onClick={() => session.verrouiller(verrou === b.cle ? null : b.cle)}>{b.nom}</button>
      ))}
    </div>
  );
}

function Prise({ session, fermer }: { session: SessionAuditParcelle; fermer: () => void }) {
  const photo = usePhoto(session);
  // La Vue 3D cadre la partie que l'ecran de prise laisse voir.
  const cadre = useCadrerVue(session);
  const c = session.cible();
  const pos = session.position();
  const { titre, detail } = texteVisee(session);
  const etatGps = pos.etat === 'ok' ? 'GPS ± ' + Math.round(pos.precisionM ?? 0) + ' m' + (pos.boussole ? ' · boussole' : ' · sans boussole : la façade la plus proche') : null;
  return (
    <div ref={cadre} className="auditPrise" role="dialog" aria-modal="false" aria-label="Photographier les façades">
      <div className="enteteCarteAudit">
        <div className="titreParcours" aria-live="polite">{titre}</div>
        <BoutonFermerAudit fermer={fermer} />
      </div>
      {detail && <div className="detailPhoto">{detail}</div>}
      {etatGps && <div className="detailPhoto">{etatGps}</div>}
      {session.dernierRangement() && <div className="detailPhoto rangementAudit" role="status">{session.dernierRangement()}</div>}
      {photo.erreur && <div className="erreurParcours" role="alert">{photo.erreur}</div>}
      {session.avertissementPrise() && <div className="erreurParcours" role="alert" data-controle="auditParcelle.avertissementFusion">{session.avertissementPrise()}</div>}
      <VerrouBatiment session={session} />
      <div className="piedDialogue">
        <button type="button" className="secondary" data-controle="auditParcelle.liste" onClick={() => session.montrer('liste')}>Liste</button>
        {c?.choisie && pos.etat === 'ok'
          ? <button type="button" className="secondary" data-controle="auditParcelle.suivrePosition" onClick={() => session.suivreLaPosition()}>Suivre ma position</button>
          : <button type="button" className="secondary" data-controle="auditParcelle.pasCetteFacade" disabled={!c} onClick={() => session.pasCetteFacade()}>Ce n’est pas cette façade</button>}
        <BoutonPhoto controle="auditParcelle.photo" libelle={photo.enCours ? 'Réduction de la photo…' : 'Prendre une photo'} desactive={!c || photo.enCours}
          prendre={(f) => photo.prendre(f, (p) => { session.rangerPhoto(p); })} />
      </div>
    </div>
  );
}

export function AuditParcelle({ session, commandes, fermer, retour }: Props) {
  useSuivreSession(session);
  const e = session.ecran();
  if (e === 'propositions') return <PropositionsAudit session={session} fermer={fermer} {...(retour ? { retour } : {})} />;
  return e === 'prise' ? <Prise session={session} fermer={fermer} /> : <Liste session={session} commandes={commandes} fermer={fermer} />;
}

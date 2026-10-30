// L'ecran Admin › Calibrer la detection (`?admin&ecran=calibration`).
//
// L'administrateur y tire des cas des facades photographiees dans l'audit (« Créer un cas depuis cette façade » sous la barre d'une
// facade de l'audit, ou un audit recu ; lot F6 : la calibration ne prend plus de photos pour elle), annote leurs ouvertures
// (EditeurCasCalibration), puis mesure la detection
// sur ces cas (precision, rappel, fiabilite de la confiance) et lui fait chercher de meilleurs reglages
// (facade/corpusReel.ts::calibrer). « Appliquer » ecrit les reglages sur le serveur (`admin/calibration`, data/admin/) ; chaque
// page les applique au demarrage (io/calibrationServeur.ts). Rien ne change pour l'utilisateur final, sinon ce que la
// detection propose. Les valeurs livrees avec Plan restent la base : on peut toujours y revenir.
//
// L'ecran ne parle ni au serveur ni au navigateur : tout lui vient de app/administration/ecranCalibration.ts, par `DepsCalibration`.

import { useEffect, useState } from 'react';
import { EditeurCasCalibration, type OutilsPhotos } from './EditeurCasCalibration.js';
import {
  CAS_MIN_CALIBRATION, FORMAT_CALIBRATION, PARAMETRES, bilan, calibrer, evaluerPrepare, fiabilite, lireCasStocke,
  type Bilan, type CasPrepare, type CasStocke, type DocumentCalibration, type ResultatCalibration,
} from '../facade/corpusReel.js';
import { preparerPourLaMesure } from '../facade/releve/enchainement.js';
import type { ResumeCasCalibration } from '../io/depotDemos.js';

export interface DepsCalibration extends OutilsPhotos {
  lireCalibration: () => Promise<DocumentCalibration | null>;
  enregistrerCalibration: (d: DocumentCalibration) => Promise<string | null>;
  lister: () => Promise<ResumeCasCalibration[]>;
  lireCas: (id: string) => Promise<unknown>;
  enregistrerCas: (id: string, cas: CasStocke) => Promise<string | null>;
  supprimerCas: (id: string) => Promise<string | null>;
  maintenant: () => Date;
  /** Les audits de parcelle recus, pour en tirer des cas (facultatif : sans eux, le bouton n'est pas propose). */
  audits?: () => Promise<{ id: string; libelle: string }[]>;
  /** Les facades photographiees d'un audit, chacune deja en cas : photos, largeur du cadastre, hauteur du LiDAR. */
  facadesDAudit?: (id: string) => Promise<{ libelle: string; cas: CasStocke }[]>;
}

/**
 * Creer un cas depuis une facade d'un audit de parcelle : ses photos, et les dimensions du mur que donne le plan (largeur du
 * cadastre, hauteur du LiDAR), sans rien mesurer sur place.
 */
function DepuisUnAudit({ deps, choisir }: { deps: DepsCalibration; choisir: (cas: CasStocke) => void }) {
  const [audits, setAudits] = useState<{ id: string; libelle: string }[] | null>(null);
  const [facades, setFacades] = useState<{ libelle: string; cas: CasStocke }[] | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  if (!deps.audits || !deps.facadesDAudit) return null;
  const lister = async () => { try { setAudits(await (deps.audits as NonNullable<DepsCalibration['audits']>)()); setFacades(null); setMessage(null); } catch (e) { setMessage('Audits illisibles : ' + ((e as Error).message || String(e))); } };
  const lire = async (id: string) => { try { setFacades(await (deps.facadesDAudit as NonNullable<DepsCalibration['facadesDAudit']>)(id)); setMessage(null); } catch (e) { setMessage('Audit illisible : ' + ((e as Error).message || String(e))); } };
  return (
    <div className="calDepuisAudit">
      <button type="button" className="secondary" data-controle="calibration.depuisAudit" onClick={() => { void lister(); }}>Créer un cas depuis un audit</button>
      {message && <p className="arbMessage" role="alert">{message}</p>}
      {audits && !facades && (audits.length
        ? <ul className="calListe" aria-label="Audits reçus">{audits.map((a) => <li key={a.id}><button type="button" className="secondary small" data-controle="calibration.choisirAudit" onClick={() => { void lire(a.id); }}>{a.libelle}</button></li>)}</ul>
        : <p className="calNote">Aucun audit de parcelle reçu.</p>)}
      {facades && (facades.length
        ? <><p className="calNote">Largeur du mur d’après le cadastre, hauteur d’après le LiDAR : rien à mesurer.</p>
          <ul className="calListe" aria-label="Façades photographiées">{facades.map((f, k) => (
            <li key={k} className="calFacadeAudit">
              <button type="button" className="secondary small" data-controle="calibration.choisirFacade" onClick={() => choisir(f.cas)}>{f.libelle}</button>
              {/* Les photos de la facade, en vignettes au bout de la ligne : de quoi reconnaitre le mur avant de le choisir. */}
              <span className="calVignettesFacade">{f.cas.images.map((u, i) => <img key={i} src={u} alt={'Photo ' + (i + 1) + ' : ' + f.libelle} loading="lazy" />)}</span>
            </li>
          ))}</ul></>
        : <p className="calNote">Cet audit n’a pas de façade photographiée.</p>)}
    </div>
  );
}

/** Les reglages proposes par defaut a la calibration : ceux qui decident le plus de ce qu'est une ouverture. */
export const PARAMETRES_PAR_DEFAUT: readonly string[] = ['areteNette', 'remplissageMin', 'remplissageAretesMin', 'petiteSurfaceM2', 'seuilMin', 'seuilFacteur', 'seuilChromaMin', 'bandeMaxPart'].map((n) => 'facades.detection.' + n);

const pc = (x: number | null) => (x === null ? '—' : Math.round(x * 100) + ' %');
const dec = (x: number | null, n = 2) => (x === null ? '—' : x.toFixed(n).replace('.', ','));
const nombre = (v: number) => String(Math.round(v * 10000) / 10000).replace('.', ',');

function LigneBilan({ nom, b }: { nom: string; b: Bilan }) {
  return <tr><th scope="row">{nom}</th><td>{b.vraies}</td><td>{b.trouvees}</td><td>{pc(b.precision)}</td><td>{pc(b.rappel)}</td><td>{pc(b.f1)}</td><td>{dec(b.cotesMedianesCm, 1)}</td><td>{dec(b.ece)}</td><td>{dec(b.brier, 3)}</td></tr>;
}

function TableauBilans({ lignes }: { lignes: { nom: string; b: Bilan }[] }) {
  return (
    <table className="attrTable calTable">
      <thead><tr><th scope="col">Réglages</th><th scope="col">Vraies</th><th scope="col">Trouvées</th><th scope="col">Précision</th><th scope="col">Rappel</th><th scope="col">F1</th><th scope="col">Cote méd. (cm)</th><th scope="col">Écart calibration</th><th scope="col">Brier</th></tr></thead>
      <tbody>{lignes.map((l) => <LigneBilan key={l.nom} {...l} />)}</tbody>
    </table>
  );
}

/** La courbe de fiabilite : ce que vaut une confiance de 0,8. */
function Fiabilite({ prepares, reglages }: { prepares: readonly CasPrepare[]; reglages: Readonly<Record<string, number>> }) {
  const f = fiabilite(prepares.flatMap((p) => evaluerPrepare(p, reglages).jugees));
  return (
    <table className="attrTable calTable" aria-label="Fiabilité de la confiance">
      <thead><tr><th scope="col">Confiance</th><th scope="col">Baies</th><th scope="col">Justes</th><th scope="col">Taux de justes</th><th scope="col">Confiance moyenne</th></tr></thead>
      <tbody>{f.cases.map((c) => <tr key={c.de}><th scope="row">{dec(c.de, 1)} – {dec(c.a, 1)}</th><td>{c.n}</td><td>{c.justes}</td><td>{pc(c.taux)}</td><td>{pc(c.confianceMoyenne)}</td></tr>)}</tbody>
    </table>
  );
}

interface PropsPanneau { deps: DepsCalibration; resumes: readonly ResumeCasCalibration[]; doc: DocumentCalibration; appliquer: (parametres: Record<string, number>, r: ResultatCalibration | null) => Promise<void> }

/** Charger les cas valides, mesurer, calibrer, appliquer. */
function PanneauCalibration({ deps, resumes, doc, appliquer }: PropsPanneau) {
  const valides = resumes.filter((r) => r.statut === 'valide');
  const [prepares, setPrepares] = useState<CasPrepare[] | null>(null);
  const [ignores, setIgnores] = useState<string[]>([]);
  const [occupe, setOccupe] = useState<string | null>(null);
  const [choix, setChoix] = useState<ReadonlySet<string>>(new Set(PARAMETRES_PAR_DEFAUT));
  const [proposition, setProposition] = useState<ResultatCalibration | null>(null);
  const [avance, setAvance] = useState('');

  const charger = async () => {
    setOccupe('Chargement des cas…'); setProposition(null);
    const ok: CasPrepare[] = [], ko: string[] = [];
    for (const r of valides) {
      try {
        const cas = lireCasStocke(await deps.lireCas(r.id));
        const { prepare } = await preparerPourLaMesure(cas, await Promise.all(cas.images.map((u) => deps.decoder(u))));
        if (prepare) ok.push(prepare); else ko.push(r.nom + ' (ne se redresse pas)');
      } catch (e) { ko.push(r.nom + ' (' + ((e as Error).message || 'illisible') + ')'); }
    }
    setPrepares(ok); setIgnores(ko); setOccupe(null);
  };
  const lancer = async () => {
    if (!prepares?.length) return;
    setOccupe('Calibration…'); setAvance('');
    const r = await calibrer(prepares, PARAMETRES.filter((p) => choix.has(p.nom)).map((p) => p.nom), doc.parametres, {
      progression: (fait, total, nom) => setAvance(nom ? `${fait + 1} / ${total} : ${nom.replace('facades.', '')}` : ''),
      rendreLaMain: () => new Promise((ok) => setTimeout(ok, 0)),
    });
    setProposition(r); setOccupe(null); setAvance('');
  };
  const bascule = (nom: string) => setChoix((c) => { const n = new Set(c); if (n.has(nom)) n.delete(nom); else n.add(nom); return n; });

  return (
    <section className="calPanneau" aria-label="Mesure et calibration">
      <h2 className="calTitre2">Mesurer et calibrer</h2>
      <p className="calNote">{valides.length} cas validé{valides.length > 1 ? 's' : ''} sur {resumes.length}. {valides.length < CAS_MIN_CALIBRATION && `Sous ${CAS_MIN_CALIBRATION} cas validés, les propositions sont indicatives : un réglage ajusté sur si peu de façades surapprend.`}</p>
      <div className="calLigne">
        <button type="button" data-controle="calibration.charger" disabled={!valides.length || !!occupe} onClick={() => { void charger(); }}>{prepares ? 'Recharger les cas validés' : 'Charger les cas validés'}</button>
        {occupe && <span className="calNote" role="status">{occupe} {avance}</span>}
      </div>
      {ignores.length > 0 && <p className="arbMessage" role="alert">Cas ignorés : {ignores.join(' ; ')}.</p>}
      {prepares && prepares.length > 0 && <>
        <TableauBilans lignes={[
          { nom: 'Valeurs livrées', b: bilan(prepares.map((p) => evaluerPrepare(p, {}))) },
          { nom: 'Valeurs en usage (serveur)', b: bilan(prepares.map((p) => evaluerPrepare(p, doc.parametres))) },
          ...(proposition ? [{ nom: 'Proposition', b: proposition.apres }] : []),
        ]} />
        <details className="calParams"><summary>Réglages à calibrer ({choix.size})</summary>
          <ul>{PARAMETRES.map((p) => <li key={p.nom}><label title={p.pourquoi}><input type="checkbox" checked={choix.has(p.nom)} data-controle="calibration.reglageCalibre" onChange={() => bascule(p.nom)} /> {p.nom.replace('facades.', '')} <small>({nombre(p.defaut)} {p.unite})</small></label></li>)}</ul>
        </details>
        <div className="calLigne">
          <button type="button" data-controle="calibration.calibrer" disabled={!!occupe || !choix.size} onClick={() => { void lancer(); }}>Chercher de meilleurs réglages</button>
        </div>
        {proposition && (
          <div role="region" aria-label="Proposition de calibration">
            {proposition.modifications.length === 0
              ? <p className="calNote">Aucun changement ne fait gagner {'0,01'} de score sur ces cas : les réglages actuels tiennent. ({proposition.evaluations} essais)</p>
              : <table className="attrTable calTable"><thead><tr><th scope="col">Réglage</th><th scope="col">Avant</th><th scope="col">Après</th><th scope="col">Gain de score</th></tr></thead>
                <tbody>{proposition.modifications.map((m) => <tr key={m.nom}><th scope="row">{m.nom.replace('facades.', '')}</th><td>{nombre(m.avant)}</td><td>{nombre(m.apres)}</td><td>+{dec(m.gain, 3)}</td></tr>)}</tbody></table>}
            <div className="calLigne">
              <button type="button" data-controle="calibration.appliquer" disabled={!proposition.modifications.length || !!occupe} onClick={() => { void appliquer(proposition.reglages, proposition).then(() => setProposition(null)); }}>Appliquer sur le serveur</button>
              <button type="button" className="secondary" data-controle="calibration.ecarter" onClick={() => setProposition(null)}>Écarter</button>
            </div>
          </div>
        )}
        <h3 className="calTitre3">Fiabilité de la confiance (réglages en usage)</h3>
        <Fiabilite prepares={prepares} reglages={doc.parametres} />
      </>}
    </section>
  );
}

export function EcranCalibration({ deps, retour = '?admin' }: { deps: DepsCalibration; retour?: string }) {
  const [doc, setDoc] = useState<DocumentCalibration>({ format: FORMAT_CALIBRATION, version: 1, modifieLe: '', parametres: {}, historique: [] });
  const [resumes, setResumes] = useState<ResumeCasCalibration[]>([]);
  const [edition, setEdition] = useState<{ id: string | null; cas: CasStocke; chercher?: boolean } | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const rafraichir = async () => {
    try { setResumes(await deps.lister()); } catch (e) { setMessage('Liste des cas illisible : ' + ((e as Error).message || String(e))); }
  };
  useEffect(() => {
    void deps.lireCalibration().then((d) => { if (d) setDoc(d); }, (e) => setMessage('Calibration illisible : ' + ((e as Error).message || String(e))));
    void rafraichir();
  }, []);

  const ouvrir = async (id: string) => {
    try { setEdition({ id, cas: lireCasStocke(await deps.lireCas(id)) }); setMessage(null); } catch (e) { setMessage('Cas illisible : ' + ((e as Error).message || String(e))); }
  };
  const appliquer = async (parametres: Record<string, number>, r: ResultatCalibration | null) => {
    const maintenant = deps.maintenant().toISOString();
    const reduit = (b: Bilan) => ({ precision: b.precision, rappel: b.rappel, f1: b.f1, brier: b.brier });
    const suivant: DocumentCalibration = {
      ...doc, modifieLe: maintenant, parametres,
      historique: r ? [...doc.historique, { t: maintenant, casValides: resumes.filter((x) => x.statut === 'valide').length, modifications: r.modifications, avant: reduit(r.avant), apres: reduit(r.apres) }] : doc.historique,
    };
    const erreur = await deps.enregistrerCalibration(suivant);
    if (erreur) setMessage(erreur); else { setDoc(suivant); setMessage(null); }
  };
  const nbCalibres = Object.keys(doc.parametres).length;

  return (
    <main className="palEcran calEcran">
      <header className="palEntete">
        <div>
          <h1 className="palTitre">Calibrer la détection</h1>
          <p className="palSous">Tirez des cas des façades photographiées dans l’audit, annotez leurs ouvertures, puis laissez Plan chercher les réglages qui font le mieux sur vos photos. Les réglages calibrés sont enregistrés sur le serveur (data/admin/calibration.json) et appliqués à chaque page ; les valeurs livrées avec Plan restent disponibles.</p>
        </div>
        <div className="palActions"><a className="palLien" href={retour}>← Retour à l’admin</a></div>
      </header>
      <div className="palBarre" role="status">
        <p className="palEtatPalette">{nbCalibres ? `${nbCalibres} réglage${nbCalibres > 1 ? 's' : ''} calibré${nbCalibres > 1 ? 's' : ''} en usage` : 'Valeurs livrées en usage'}{doc.modifieLe && ` · calibré le ${doc.modifieLe.slice(0, 10)}`}</p>
        <div className="palBarreActions">
          <button type="button" className="secondary" data-controle="calibration.revenir" disabled={!nbCalibres} onClick={() => { if (window.confirm('Revenir aux valeurs livrées avec Plan ? L’historique est gardé.')) void appliquer({}, null); }}>Revenir aux valeurs livrées</button>
        </div>
      </div>
      {message && <p className="arbMessage" role="alert">{message}</p>}

      {edition
        ? <EditeurCasCalibration key={edition.id ?? 'nouveau'} cas={edition.cas} id={edition.id} outils={deps} chercherCoins={!!edition.chercher}
          enregistrer={async (cas) => {
            const id = edition.id ?? 'cas-' + deps.maintenant().getTime().toString(36);
            const e = await deps.enregistrerCas(id, cas);
            if (!e) await rafraichir();
            return e;
          }}
          supprimer={edition.id ? async () => { const e = await deps.supprimerCas(edition.id as string); if (!e) await rafraichir(); return e; } : null}
          fermer={() => setEdition(null)} />
        : <section className="calCas" aria-label="Cas de calibration">
          <h2 className="calTitre2">Cas de calibration</h2>
          <DepuisUnAudit deps={deps} choisir={(cas) => setEdition({ id: null, cas, chercher: true })} />
          {resumes.length === 0
            ? <p className="calNote">Aucun cas. Photographiez des façades variées dans l’audit (brique, enduit, pierre, volets, haie ou voiture devant, ton sur ton), puis « Créer un cas depuis cette façade » sous leur barre. Une vingtaine de cas validés donnent des réglages fiables.</p>
            : <table className="attrTable calTable"><thead><tr><th scope="col">Cas</th><th scope="col">Statut</th><th scope="col">Photos</th><th scope="col">Ouvertures</th><th scope="col"><span className="texteMasque">Ouvrir</span></th></tr></thead>
              <tbody>{resumes.map((r) => <tr key={r.id}><th scope="row">{r.nom}</th><td>{r.statut === 'valide' ? 'Validé' : 'Brouillon'}</td><td>{r.photos}</td><td>{r.ouvertures}</td><td><button type="button" className="secondary small" data-controle="calibration.ouvrirCas" aria-label={'Ouvrir le cas ' + r.nom} onClick={() => { void ouvrir(r.id); }}>Ouvrir</button></td></tr>)}</tbody></table>}
        </section>}

      <PanneauCalibration deps={deps} resumes={resumes} doc={doc} appliquer={appliquer} />

      {doc.historique.length > 0 && (
        <section className="calHistorique" aria-label="Historique des calibrations">
          <h2 className="calTitre2">Historique</h2>
          <ul>{[...doc.historique].reverse().map((h) => <li key={h.t}>{h.t.slice(0, 16).replace('T', ' ')} · {h.casValides} cas · {h.modifications.length} réglage{h.modifications.length > 1 ? 's' : ''} · F1 {pc(h.avant.f1)} → {pc(h.apres.f1)}</li>)}</ul>
        </section>
      )}
    </main>
  );
}


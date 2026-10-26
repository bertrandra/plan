// L'ecran Admin › Conformité (`?admin&ecran=conformite`, MD/spec-regles-toits.md 13.5, lot G3).
//
// Un ecran de l'admin, sur toute la page, comme la consommation de Claude : Plan ne demarre pas
// dessous. Il montre la part des cas observes que le calcul d'aujourd'hui satisfait, sur deux
// sources : le corpus du depot (deja juge, regles/conformite.json) et les audits de parcelle
// partages, recus sur le serveur et rejoues ici. De haut en bas :
//   - la source, « Relire les audits », « Enregistrer la mesure » et l'etat de la lecture ;
//   - les chiffres cles (le taux, le critere de la phase 1, les colonnes a venir) ;
//   - sept onglets : par forme, par region, par probleme, les cas, les facades (lot G13), l'accord de Claude, l'historique.
// « Enregistrer la mesure » range sur le serveur ce que l'ecran montre, toutes sources comprises
// (`admin/conformite`) ; l'historique dit si le taux monte, phase apres phase.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { lireMesuresConformite, mesureConformite, resumer, resumerFacades, tauxFacadesParRegion, tauxPar, type MesureConformite, type MesureLue, type VerdictCas, type VerdictFacade } from '../regles/conformite.js';
import { TableAxe, TableCas, TableFacades, TuilesConformite, VueClaude, VueHistorique } from './conformite/vues.js';

/** Les audits recus, juges : ce que app/admin/ecranConformite.ts rend. */
export interface AuditsJuges { verdicts: VerdictCas[]; /** Les facades relevees, jugees (lot G13). */ facades?: VerdictFacade[]; lus: number; illisibles: string[] }

export interface PropsEcranConformite {
  corpus: VerdictCas[];
  versions: Pick<MesureConformite, 'code' | 'lecture'>;
  chargerAudits: (progres: (fait: number, total: number) => void) => Promise<AuditsJuges>;
  lireHistorique: () => Promise<unknown>;
  enregistrer: (m: MesureConformite) => Promise<unknown>;
  maintenant: () => Date;
  retour?: string;
}

type Onglet = 'forme' | 'region' | 'probleme' | 'cas' | 'facades' | 'claude' | 'historique';
const ONGLETS: { id: Onglet; titre: string }[] = [
  { id: 'forme', titre: 'Par forme' },
  { id: 'region', titre: 'Par région' },
  { id: 'probleme', titre: 'Par problème' },
  { id: 'cas', titre: 'Cas' },
  { id: 'facades', titre: 'Façades' },
  { id: 'claude', titre: 'Accord de Claude' },
  { id: 'historique', titre: 'Historique' }
];
type Source = 'tous' | 'corpus' | 'audit';

/** L'onglet lu dans l'adresse (`#region`…), ecrit dedans sans entree d'historique. */
function useOnglet(): [Onglet, (o: Onglet) => void] {
  const lu = () => { const h = typeof location !== 'undefined' ? location.hash.slice(1) : ''; return (ONGLETS.some((o) => o.id === h) ? h : 'forme') as Onglet; };
  const [onglet, setOnglet] = useState<Onglet>(lu);
  const choisir = (o: Onglet) => {
    setOnglet(o);
    try { history.replaceState(null, '', location.pathname + location.search + (o === 'forme' ? '' : '#' + o)); } catch { /* sans historique : l'onglet change quand meme */ }
  };
  return [onglet, choisir];
}

interface EtatAudits { lecture: boolean; progres: [number, number] | null; juges: AuditsJuges | null; erreur: string | null }

/** Les audits recus, relus a la demande ; pendant la lecture, l'ecran garde les precedents. */
function useAudits(charger: PropsEcranConformite['chargerAudits']) {
  const [etat, setEtat] = useState<EtatAudits>({ lecture: true, progres: null, juges: null, erreur: null });
  const relire = useCallback(() => {
    setEtat((e) => ({ ...e, lecture: true, progres: null, erreur: null }));
    charger((fait, total) => setEtat((e) => ({ ...e, progres: [fait, total] }))).then(
      (juges) => setEtat({ lecture: false, progres: null, juges, erreur: null }),
      (err: unknown) => setEtat((e) => ({ ...e, lecture: false, progres: null, erreur: (err as Error).message || String(err) }))
    );
  }, [charger]);
  useEffect(() => { relire(); }, [relire]);
  return { ...etat, relire };
}

/** L'historique du serveur, relu apres chaque mesure enregistree. */
function useHistorique(lire: PropsEcranConformite['lireHistorique']) {
  const [mesures, setMesures] = useState<MesureLue[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const relire = useCallback(() => {
    lire().then((d) => {
      const lu = lireMesuresConformite(d);
      if (!lu) { setErreur('La réponse du serveur n’a pas la forme attendue.'); return; }
      setMesures(lu);
      setErreur(null);
    }, (e: unknown) => setErreur((e as Error).message || String(e)));
  }, [lire]);
  useEffect(() => { relire(); }, [relire]);
  return { mesures, erreur, relire };
}

function texteEtat(a: EtatAudits, corpus: number): string {
  if (a.lecture) return a.progres && a.progres[1] ? 'Rejeu des audits reçus : ' + a.progres[0] + ' / ' + a.progres[1] + ' bâtiments…' : 'Lecture des audits reçus…';
  const audits = a.juges ? a.juges.lus + ' audit' + (a.juges.lus > 1 ? 's' : '') + ' reçu' + (a.juges.lus > 1 ? 's' : '') + ' (' + a.juges.verdicts.length + ' bâtiment' + (a.juges.verdicts.length > 1 ? 's' : '') + ')' : 'audits reçus non lus';
  return corpus + ' cas du corpus · ' + audits;
}

export function EcranConformite(props: PropsEcranConformite) {
  const { corpus, versions, enregistrer, maintenant, retour = '?admin' } = props;
  const [onglet, choisirOnglet] = useOnglet();
  const [source, setSource] = useState<Source>('tous');
  const [message, setMessage] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const audits = useAudits(props.chargerAudits);
  const historique = useHistorique(props.lireHistorique);

  const auditsJuges = audits.juges?.verdicts;
  const montres = useMemo(() => {
    const a = auditsJuges ?? [];
    return source === 'corpus' ? corpus : source === 'audit' ? a : [...corpus, ...a];
  }, [corpus, auditsJuges, source]);
  // Les facades relevees ne viennent que des audits recus : le corpus des promenades n'en a pas.
  const facadesAudits = audits.juges?.facades;
  const facadesMontrees = useMemo<VerdictFacade[]>(() => (source === 'corpus' ? [] : facadesAudits ?? []), [facadesAudits, source]);
  const calc = useMemo(() => ({
    resume: resumer(montres), forme: tauxPar(montres, 'forme'), region: tauxPar(montres, 'region'), probleme: tauxPar(montres, 'probleme'),
    facades: resumerFacades(facadesMontrees), facadesParRegion: tauxFacadesParRegion(facadesMontrees)
  }), [montres, facadesMontrees]);

  const enregistrerMesure = () => {
    setEnvoi(true);
    setMessage(null);
    const m = mesureConformite({ t: maintenant(), ...versions, corpus, audits: auditsJuges ?? [], facades: facadesAudits ?? [], auditsLus: audits.juges?.lus ?? 0 });
    enregistrer(m).then(() => { setMessage('Mesure enregistrée sur le serveur.'); historique.relire(); }, (e: unknown) => setMessage((e as Error).message || String(e)))
      .finally(() => setEnvoi(false));
  };
  const raisonEnregistrer = audits.lecture ? 'Attendez la fin du rejeu des audits reçus.' : envoi ? 'Enregistrement en cours.' : null;

  return (
    <div className="consEcran confEcran">
      <header className="consEntete">
        <a className="ecranRetour" href={retour}><span aria-hidden="true">←</span> Retour au plan</a>
        <h1 className="palTitre">Conformité</h1>
        <p className="palSous">
          Part des cas observés que le calcul d’aujourd’hui satisfait : l’attendu validé et « Ce que je vois » (forme, bouts, lucarnes,
          cheminées, toit-terrasse), sur le corpus du dépôt et les audits partagés reçus ; et, sur les façades relevées de ces audits, la part où la disposition automatique des fenêtres tient le relevé (baies à ± 1, part vitrée à ± 20 %, hauteur des niveaux). Calcul {versions.code.version}, lecture des toits {versions.lecture.toits},
          réglages {versions.lecture.reglages}, faits {versions.lecture.faits}. Visible de l’administrateur seulement.
        </p>
      </header>

      <div className="consFiltres" role="group" aria-label="Source et mesure">
        <label>Source
          <select value={source} onChange={(e) => setSource(e.target.value as Source)} name="source">
            <option value="tous">Toutes les sources</option>
            <option value="corpus">Corpus du dépôt</option>
            <option value="audit">Audits partagés</option>
          </select>
        </label>
        <button type="button" className="secondary consExporter" disabled={audits.lecture} title={audits.lecture ? 'Lecture en cours.' : 'Relit et rejoue les audits reçus sur le serveur'} onClick={audits.relire}>
          Relire les audits
        </button>
        <button type="button" className="consExporter" disabled={raisonEnregistrer !== null} title={raisonEnregistrer ?? 'Range la mesure affichée sur le serveur, toutes sources comprises'} onClick={enregistrerMesure}>
          Enregistrer la mesure
        </button>
        <span className="consEtat" role="status">{texteEtat(audits, corpus.length)}</span>
      </div>
      {raisonEnregistrer && <p className="consNote confRaison">{raisonEnregistrer}</p>}

      {audits.erreur && <p className="consErreur" role="alert">Audits reçus : {audits.erreur}</p>}
      {audits.juges && audits.juges.illisibles.length > 0 && (
        <ul className="consAlertes" aria-label="Audits illisibles">
          {audits.juges.illisibles.map((t) => <li key={t}><strong>Illisible</strong> {t}</li>)}
        </ul>
      )}
      {message && <p className="consNote confMessage" role="status">{message}</p>}

      <div className={'consCorps' + (audits.lecture && audits.juges ? ' consRecharge' : '')}>
        <TuilesConformite r={calc.resume} facades={calc.facades} />

        <div className="palOnglets consOnglets" role="tablist" aria-label="Vues">
          {ONGLETS.map((o) => (
            <button key={o.id} type="button" role="tab" id={'confOnglet-' + o.id} aria-selected={onglet === o.id} aria-controls="confVue"
              className={'palOnglet' + (onglet === o.id ? ' actif' : '')} onClick={() => choisirOnglet(o.id)}>{o.titre}</button>
          ))}
        </div>

        <section id="confVue" className="consVue" role="tabpanel" aria-labelledby={'confOnglet-' + onglet}>
          {onglet === 'forme' ? <TableAxe titre="Forme" lignes={calc.forme} />
            : onglet === 'region' ? <TableAxe titre="Région" lignes={calc.region} facadesParRegion={calc.facadesParRegion} />
            : onglet === 'probleme' ? <TableAxe titre="Problème noté" lignes={calc.probleme} />
            : onglet === 'cas' ? <TableCas verdicts={montres} />
            : onglet === 'facades' ? <TableFacades verdicts={facadesMontrees} />
            : onglet === 'claude' ? <VueClaude />
            : <VueHistorique mesures={historique.mesures} erreur={historique.erreur} />}
        </section>
      </div>
    </div>
  );
}

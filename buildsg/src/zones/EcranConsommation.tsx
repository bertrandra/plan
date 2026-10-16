// L'ecran Admin › Consommation de Claude (`?admin&ecran=consommation`, MD/spec-audit.md 13.3).
//
// Un ecran de l'admin, sur toute la page, comme la palette et les controleurs : Plan ne demarre pas
// dessous. Il lit `GET admin/consommation` (le journal d'analyse.php, filtre par le serveur) et
// calcule le reste dans model/consommation.ts. De haut en bas :
//   - les filtres, sur une ligne : periode d'abord, puis organisation, modele, usage, parcelle ;
//   - les alertes (plafond a 80 %, derive du cout moyen, echecs), sur les sept derniers jours ;
//   - les chiffres cles ;
//   - six onglets : dans le temps, par parcelle, par usage, par modele, par organisation, reglages.
// « Exporter en CSV » rend la vue affichee. « Par modele » compare les modeles sur ce qu'ils coutent
// et sur ce que leurs reponses contiennent (champ `trouve` du journal). Le modele de chaque usage,
// les tarifs et les plafonds se reglent dans le dernier onglet (`admin/claude/modeles`,
// `admin/claude/tarifs`, `admin/claude/plafonds`) : un tarif passe ne se reecrit pas.

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  NOMS_USAGES, PERIODES, alertes as calculerAlertes, bornesPeriode, chiffresCles, lireReponseConsommation, nomModele, ordonnerSeries,
  parModele, parOrganisation, parParcelle, parUsage, pasParDefaut, serieDuModele, serieTemps,
  type Mesure, type Pas, type Periode, type ReponseConsommation
} from '../model/consommation.js';
import { csvModeles, csvOrganisations, csvParcelles, csvTemps, csvUsages } from '../export/csvConsommation.js';
import type { FiltresConsommation } from '../io/depotDemos.js';
import type { Plafonds, ReglageModeles, Tarifs } from '../model/tarifsClaude.js';
import { Reglages } from './consommation/reglages.js';
import { TableParcelles, Tuiles, VueModeles, VueOrganisations, VueTemps, VueUsages, type MesureTrouve } from './consommation/vues.js';
import * as fmt from './consommation/format.js';

export interface PropsEcranConsommation {
  /** Le jour (UTC) qui borne les periodes. */
  aujourdhui: string;
  charger: (f: FiltresConsommation) => Promise<unknown>;
  lireTarifs: () => Promise<unknown>;
  enregistrerTarifs: (t: Tarifs) => Promise<unknown>;
  lirePlafonds: () => Promise<unknown>;
  enregistrerPlafonds: (p: Plafonds) => Promise<unknown>;
  lireModeles: () => Promise<unknown>;
  enregistrerModeles: (r: ReglageModeles) => Promise<unknown>;
  telecharger: (nom: string, texte: string) => void;
  retour?: string;
}

type Onglet = 'temps' | 'parcelles' | 'usages' | 'modeles' | 'organisations' | 'reglages';
const ONGLETS: { id: Onglet; titre: string }[] = [
  { id: 'temps', titre: 'Dans le temps' },
  { id: 'parcelles', titre: 'Par parcelle' },
  { id: 'usages', titre: 'Par usage' },
  { id: 'modeles', titre: 'Par modèle' },
  { id: 'organisations', titre: 'Par organisation' },
  // Le modele de chaque usage, les tarifs et les plafonds : les reglages ensemble, apres les vues.
  { id: 'reglages', titre: 'Réglages' }
];

/** L'onglet lu dans l'adresse (`#parcelles`…), ecrit dedans sans entree d'historique. */
function useOnglet(): [Onglet, (o: Onglet) => void] {
  const lu = () => { const h = typeof location !== 'undefined' ? location.hash.slice(1) : ''; return (ONGLETS.some((o) => o.id === h) ? h : 'temps') as Onglet; };
  const [onglet, setOnglet] = useState<Onglet>(lu);
  const choisir = (o: Onglet) => {
    setOnglet(o);
    try { history.replaceState(null, '', location.pathname + location.search + (o === 'temps' ? '' : '#' + o)); } catch { /* sans historique : l'onglet change quand meme */ }
  };
  return [onglet, choisir];
}

interface Filtres { periode: Periode; organisation: string; modele: string; usage: string; parcelle: string }

/**
 * Le journal filtre, relu a chaque changement de filtre. Une reponse arrivee apres une plus recente
 * est jetee ; pendant la lecture, l'ecran garde l'ancienne (attenuee), sans saut ni squelette.
 */
function useJournal(charger: PropsEcranConsommation['charger'], f: FiltresConsommation) {
  const [donnees, setDonnees] = useState<ReponseConsommation | null>(null);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const demande = useRef(0);
  const cle = JSON.stringify(f);
  useEffect(() => {
    const n = ++demande.current;
    setChargement(true);
    charger(JSON.parse(cle) as FiltresConsommation).then((d) => {
      if (n !== demande.current) return;
      const lu = lireReponseConsommation(d);
      if (!lu) { setErreur('La réponse du serveur n’a pas la forme attendue.'); return; }
      setDonnees(lu);
      setErreur(null);
    }, (e: unknown) => {
      if (n === demande.current) setErreur((e as Error).message || String(e));
    }).finally(() => { if (n === demande.current) setChargement(false); });
  }, [charger, cle]);
  return { donnees, chargement, erreur };
}

function BarreFiltres({ filtres, changer, choix }: { filtres: Filtres; changer: (cle: keyof Filtres, v: string) => void; choix: ReponseConsommation['choix'] | undefined }) {
  const liste = (cle: keyof Filtres, libelle: string, tous: string, options: [string, string][]) => (
    <label>{libelle}
      <select value={filtres[cle]} onChange={(e) => changer(cle, e.target.value)} name={cle}>
        <option value="">{tous}</option>
        {options.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
      </select>
    </label>
  );
  return (
    <>
      <label>Période
        <select value={filtres.periode} onChange={(e) => changer('periode', e.target.value)} name="periode">
          {PERIODES.map((p) => <option key={p.id} value={p.id}>{p.libelle}</option>)}
        </select>
      </label>
      {liste('organisation', 'Organisation', 'Toutes', (choix?.organisations ?? []).map((o) => [o, o]))}
      {liste('modele', 'Modèle', 'Tous', (choix?.modeles ?? []).map((m) => [m, nomModele(m)]))}
      {liste('usage', 'Usage', 'Tous', (choix?.usages ?? []).map((u) => [u, NOMS_USAGES[u] ?? u]))}
      {liste('parcelle', 'Parcelle', 'Toutes', (choix?.parcelles ?? []).map((p) => [p.idu, p.adresse ? p.adresse + ' — ' + p.idu : p.idu]))}
    </>
  );
}

export function EcranConsommation(props: PropsEcranConsommation) {
  const { aujourdhui, charger, telecharger, retour = '?admin' } = props;
  const [filtres, setFiltres] = useState<Filtres>({ periode: '30j', organisation: '', modele: '', usage: '', parcelle: '' });
  const [onglet, choisirOnglet] = useOnglet();
  const [mesure, setMesure] = useState<Mesure>('cout');
  const [pasChoisi, setPasChoisi] = useState<Pas | null>(null);
  const [mesureTrouve, setMesureTrouve] = useState<MesureTrouve>('total');

  const { du, au } = bornesPeriode(filtres.periode, aujourdhui);
  const demande: FiltresConsommation = { du, au };
  for (const k of ['organisation', 'modele', 'usage', 'parcelle'] as const) if (filtres[k]) demande[k] = filtres[k];
  const { donnees, chargement, erreur } = useJournal(charger, demande);

  const pas = pasChoisi ?? pasParDefaut(du, au);
  const calc = useMemo(() => {
    if (!donnees) return null;
    const ls = donnees.lignes;
    return {
      temps: serieTemps(ls, donnees.du, donnees.au, pas, mesure),
      parcelles: parParcelle(ls),
      usages: parUsage(ls, donnees.choix.usages.length ? donnees.choix.usages : undefined),
      modeles: parModele(ls),
      organisations: parOrganisation(ls, donnees.organisations),
      cles: chiffresCles(ls),
      alertes: calculerAlertes(donnees.organisations, donnees.recents),
      series: ordonnerSeries(ls.filter((l) => l.statut !== 'plafond').map((l) => serieDuModele(l.modele)))
    };
  }, [donnees, pas, mesure]);

  const exporter = () => {
    if (!calc || !donnees) return;
    const nom = (vue: string) => 'consommation-claude-' + vue + '-' + donnees.du + '-' + donnees.au + '.csv';
    if (onglet === 'temps') telecharger(nom('temps-' + (mesure === 'tokens' ? 'tokens' : 'dollars')), csvTemps(calc.temps, mesure));
    else if (onglet === 'parcelles') telecharger(nom('parcelles'), csvParcelles(calc.parcelles, calc.series));
    else if (onglet === 'usages') telecharger(nom('usages'), csvUsages(calc.usages));
    else if (onglet === 'modeles') telecharger(nom('modeles'), csvModeles(calc.modeles));
    else if (onglet === 'organisations') telecharger(nom('organisations'), csvOrganisations(calc.organisations));
  };
  const changer = (cle: keyof Filtres, v: string) => {
    if (cle === 'periode') setPasChoisi(null);
    setFiltres((f) => ({ ...f, [cle]: v }));
  };
  const etat = chargement ? 'Lecture du journal…' : donnees ? fmt.date(donnees.du) + ' – ' + fmt.date(donnees.au) + ' · ' + donnees.lignes.length + ' ligne' + (donnees.lignes.length > 1 ? 's' : '') : '';

  return (
    <div className="consEcran">
      <header className="consEntete">
        <a className="ecranRetour" href={retour}><span aria-hidden="true">←</span> Retour au plan</a>
        <h1 className="palTitre">Consommation de Claude</h1>
        <p className="palSous">
          Tokens et coût de l’analyse par Claude, lus dans le journal du serveur (une ligne par appel, compteurs renvoyés par l’API,
          coût selon le tarif du jour de l’appel). Visible de l’administrateur seulement.
        </p>
      </header>

      <div className="consFiltres" role="group" aria-label="Filtres">
        <BarreFiltres filtres={filtres} changer={changer} choix={donnees?.choix} />
        <button type="button" className="secondary consExporter" disabled={!calc || onglet === 'reglages'}
          title={onglet === 'reglages' ? 'Les réglages ne s’exportent pas : choisissez une autre vue.' : 'Télécharge la vue affichée, avec les filtres choisis'} onClick={exporter}>
          Exporter en CSV
        </button>
        <span className="consEtat" role="status">{etat}</span>
      </div>

      {erreur && <p className="consErreur" role="alert">{erreur}</p>}

      {calc && calc.alertes.length > 0 && (
        <ul className="consAlertes" aria-label="Alertes">
          {calc.alertes.map((a) => <li key={a.code + a.message}><strong>Alerte</strong> {a.message}</li>)}
        </ul>
      )}

      <div className={'consCorps' + (chargement && donnees ? ' consRecharge' : '')}>
        {calc && <Tuiles cles={calc.cles} />}

        <div className="palOnglets consOnglets" role="tablist" aria-label="Vues">
          {ONGLETS.map((o) => (
            <button key={o.id} type="button" role="tab" id={'consOnglet-' + o.id} aria-selected={onglet === o.id} aria-controls="consVue"
              className={'palOnglet' + (onglet === o.id ? ' actif' : '')} onClick={() => choisirOnglet(o.id)}>{o.titre}</button>
          ))}
        </div>

        <section id="consVue" className="consVue" role="tabpanel" aria-labelledby={'consOnglet-' + onglet}>
          {onglet === 'reglages' ? <Reglages {...props} />
            : !calc ? (!erreur && <p className="hint">Lecture du journal…</p>)
            : onglet === 'temps' ? <VueTemps serie={calc.temps} mesure={mesure} pas={pas} choisirMesure={setMesure} choisirPas={setPasChoisi} />
            : onglet === 'parcelles' ? <TableParcelles lignes={calc.parcelles} series={calc.series} />
            : onglet === 'usages' ? <VueUsages usages={calc.usages} />
            : onglet === 'modeles' ? <VueModeles modeles={calc.modeles} mesure={mesureTrouve} choisirMesure={setMesureTrouve} />
            : <VueOrganisations organisations={calc.organisations} />}
        </section>
      </div>
    </div>
  );
}

// Les vues du tableau de bord de la consommation (MD/spec-audit.md 13.3) : chiffres cles, dans le
// temps, par parcelle, par usage, par organisation. Elles ne calculent rien : model/consommation.ts
// l'a fait, elles mettent en page. Chaque graphique a son tableau, pour lire sans survol.

import { useState } from 'react';
import {
  CLES_TROUVAILLES, ESTIMATION_PAR_PARCELLE, NOMS_TROUVAILLES, NOMS_USAGES, nomModele, trier, valeurA,
  type ChiffresCles, type LigneModele, type LigneOrganisation, type LigneParcelle, type LigneUsage, type Mesure, type Pas, type SerieTemps
} from '../../model/consommation.js';
import { AiresEmpilees, Barres, Jauge } from './graphiques.js';
import * as fmt from './format.js';

const valeur = (x: number, mesure: Mesure) => (mesure === 'tokens' ? fmt.tokens(x) : fmt.dollars(x));
const pluriel = (n: number, mot: string) => n + ' ' + mot + (n > 1 ? 's' : '');

function Tuile({ titre, valeur: v, note }: { titre: string; valeur: string; note: string }) {
  return (
    <div className="consTuile">
      <span className="consTuileTitre">{titre}</span>
      <span className="consTuileValeur">{v}</span>
      <span className="consTuileNote">{note}</span>
    </div>
  );
}

export function Tuiles({ cles }: { cles: ChiffresCles }) {
  return (
    <section className="consTuiles" aria-label="Chiffres clés">
      <Tuile titre="Coût" valeur={fmt.dollars(cles.cout)} note={pluriel(cles.appels, 'appel') + (cles.refusPlafond ? ' · ' + pluriel(cles.refusPlafond, 'refusé') + ' par le plafond' : '')} />
      <Tuile titre="Tokens" valeur={fmt.compact(cles.tokens, 'tokens')} note={fmt.tokens(cles.tokens) + ' au total'} />
      <Tuile titre="Coût moyen par parcelle" valeur={cles.coutMoyenParAudit === null ? '—' : fmt.dollars(cles.coutMoyenParAudit)}
        note={'Estimation : ' + fmt.dollars(ESTIMATION_PAR_PARCELLE.min) + ' à ' + fmt.dollars(ESTIMATION_PAR_PARCELLE.max) + ' · ' + pluriel(cles.audits, 'audit')} />
      <Tuile titre="Part de l’escalade" valeur={fmt.part(cles.partEscalade)} note="du coût" />
      <Tuile titre="Lu en cache" valeur={fmt.part(cles.partCacheLu)} note="des tokens d’entrée" />
      <Tuile titre="Échecs" valeur={fmt.part(cles.tauxEchec)} note="des appels (alerte au-delà de 5 %)" />
    </section>
  );
}

/** Un groupe de choix exclusifs (commande segmentee), en boutons radio. */
function Segmente<T extends string>({ libelle, choix, valeur: v, choisir }: { libelle: string; choix: [T, string][]; valeur: T; choisir: (t: T) => void }) {
  return (
    <div className="segmente" role="radiogroup" aria-label={libelle}>
      {choix.map(([id, texte]) => (
        <button key={id} type="button" role="radio" aria-checked={v === id} className={v === id ? 'actif' : ''} onClick={() => choisir(id)}>{texte}</button>
      ))}
    </div>
  );
}

export function VueTemps({ serie, mesure, pas, choisirMesure, choisirPas }: { serie: SerieTemps; mesure: Mesure; pas: Pas; choisirMesure: (m: Mesure) => void; choisirPas: (p: Pas) => void }) {
  return (
    <>
      <div className="consCommandes">
        <Segmente libelle="Mesure" choix={[['cout', 'Dollars'], ['tokens', 'Tokens']]} valeur={mesure} choisir={choisirMesure} />
        <Segmente libelle="Pas" choix={[['jour', 'Jour'], ['semaine', 'Semaine'], ['mois', 'Mois']]} valeur={pas} choisir={choisirPas} />
      </div>
      <AiresEmpilees serie={serie} mesure={mesure} pas={pas} />
      <details className="consDetails">
        <summary>Voir les valeurs</summary>
        <div className="consTableau">
          <table className="attrTable consTable">
            <thead><tr><th scope="col">Période</th>{serie.series.map((s) => <th key={s} scope="col" className="num">{nomModele(s)}</th>)}<th scope="col" className="num">Total</th></tr></thead>
            <tbody>
              {serie.cles.map((c, i) => (
                <tr key={c}><td>{fmt.intervalle(c, pas)}</td>{serie.series.map((s) => <td key={s} className="num">{valeur(valeurA(serie, s, i), mesure)}</td>)}<td className="num">{valeur(serie.totaux[i] ?? 0, mesure)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </>
  );
}

export function VueUsages({ usages }: { usages: LigneUsage[] }) {
  const nom = (u: string) => NOMS_USAGES[u] ?? u;
  return (
    <>
      <h2 className="palSectionTitre">Part du coût par usage</h2>
      <Barres lignes={usages.map((u) => ({ nom: nom(u.usage), valeur: u.cout, texte: fmt.dollars(u.cout) + ' · ' + fmt.part(u.partCout) }))} />
      <div className="consTableau">
        <table className="attrTable consTable">
          <thead><tr><th scope="col">Usage</th><th scope="col" className="num">Appels</th><th scope="col" className="num">Tokens</th><th scope="col" className="num">Coût</th><th scope="col" className="num">Part du coût</th><th scope="col" className="num">Part du Batch</th></tr></thead>
          <tbody>
            {usages.map((u) => (
              <tr key={u.usage}><td>{nom(u.usage)}</td><td className="num">{fmt.tokens(u.appels)}</td><td className="num">{fmt.tokens(u.tokens)}</td><td className="num">{fmt.dollars(u.cout)}</td><td className="num">{fmt.part(u.partCout)}</td><td className="num">{u.appels ? fmt.part(u.partBatch) : '—'}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

export type MesureTrouve = 'total' | 'moyenne';

/**
 * Les modeles compares sur la periode et les filtres : ce qu'ils coutent, puis ce que leurs reponses
 * contiennent. La part des reponses vides d'abord : c'est elle qui a fait changer le modele par
 * defaut. Les comptes se lisent en total ou par reponse lue (un modele peu employe n'a pas de
 * petits totaux parce qu'il trouve moins).
 */
export function VueModeles({ modeles, mesure, choisirMesure }: { modeles: LigneModele[]; mesure: MesureTrouve; choisirMesure: (m: MesureTrouve) => void }) {
  if (!modeles.length) return <p className="consVide">Aucun appel sur cette période et ces filtres.</p>;
  const lus = modeles.filter((m) => m.partVide !== null);
  const sansComptes = modeles.reduce((n, m) => n + m.sansComptes, 0);
  const compte = (m: LigneModele, n: number) => (mesure === 'total' ? fmt.tokens(n) : m.lues ? fmt.decimal(n / m.lues) : '—');
  return (
    <>
      <h2 className="palSectionTitre">Réponses vides</h2>
      {lus.length
        ? <Barres libelle="Part des réponses vides par modèle" lignes={lus.map((m) => ({ nom: nomModele(m.modele).replace(/^Claude /, ''), valeur: m.partVide ?? 0, texte: fmt.part(m.partVide ?? 0) + ' · ' + m.vides + ' sur ' + m.lues }))} />
        : <p className="hint">Aucune réponse comptée sur cette période : les comptes sont tenus depuis la version qui les a ajoutés au journal.</p>}

      <h2 className="palSectionTitre">Volume et coût</h2>
      <div className="consTableau">
        <table className="attrTable consTable">
          <thead><tr><th scope="col">Modèle</th><th scope="col" className="num">Requêtes</th><th scope="col" className="num">Batchs</th><th scope="col" className="num">Immédiats</th><th scope="col" className="num">Images</th><th scope="col" className="num">Tokens</th><th scope="col" className="num">Coût</th><th scope="col" className="num">Façades</th><th scope="col" className="num">Coût par façade</th><th scope="col" className="num">Échecs</th></tr></thead>
          <tbody>
            {modeles.map((m) => (
              <tr key={m.modele}>
                <td>{nomModele(m.modele)}</td><td className="num">{fmt.tokens(m.requetes)}</td><td className="num">{fmt.tokens(m.batchs)}</td><td className="num">{fmt.tokens(m.immediats)}</td>
                <td className="num">{fmt.tokens(m.images)}</td><td className="num">{fmt.tokens(m.tokens)}</td><td className="num">{fmt.dollars(m.cout)}</td>
                <td className="num">{fmt.tokens(m.facades)}</td><td className="num">{m.coutParFacade === null ? '—' : fmt.dollars(m.coutParFacade)}</td><td className="num">{fmt.tokens(m.echecs)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="palSectionTitre">Ce que les réponses contiennent</h2>
      <div className="consCommandes">
        <Segmente libelle="Comptes" choix={[['total', 'Total'], ['moyenne', 'Par réponse lue']]} valeur={mesure} choisir={choisirMesure} />
      </div>
      <div className="consTableau">
        <table className="attrTable consTable">
          <thead><tr><th scope="col">Modèle</th><th scope="col" className="num">Réponses lues</th><th scope="col" className="num">Vides</th>{CLES_TROUVAILLES.map((k) => <th key={k} scope="col" className="num">{NOMS_TROUVAILLES[k]}</th>)}</tr></thead>
          <tbody>
            {modeles.map((m) => (
              <tr key={m.modele}>
                <td>{nomModele(m.modele)}</td><td className="num">{fmt.tokens(m.lues)}</td><td className="num">{m.partVide === null ? '—' : fmt.part(m.partVide)}</td>
                {CLES_TROUVAILLES.map((k) => <td key={k} className="num">{compte(m, m.trouve[k])}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="hint">
        Une réponse est vide quand tout y est indéterminé ou absent. Les ouvertures sont celles que l’analyse compte niveau par niveau, ou que le
        renfort garde ; « En trop », celles qu’elle juge fausses ou que le renfort retire. Les façades sont comptées sur la première passe de chaque requête.
        {sansComptes > 0 && ' ' + sansComptes + ' réponse' + (sansComptes > 1 ? 's' : '') + ' sans comptes (journal antérieur, ou sortie coupée ou illisible) ne ' + (sansComptes > 1 ? 'sont' : 'est') + ' pas comptée' + (sansComptes > 1 ? 's' : '') + '.'}
      </p>
    </>
  );
}

export function VueOrganisations({ organisations }: { organisations: LigneOrganisation[] }) {
  const jauge = (depense: number, plafond: number, p: number) => fmt.dollars(depense) + ' sur ' + fmt.dollars(plafond) + ' (' + fmt.part(p) + ')';
  return (
    <div className="consTableau">
      <table className="attrTable consTable">
        <thead><tr><th scope="col">Organisation</th><th scope="col" className="num">Sur la période</th><th scope="col">Aujourd’hui</th><th scope="col">Ce mois</th></tr></thead>
        <tbody>
          {organisations.map((o) => (
            <tr key={o.id}>
              <td>{o.id}</td>
              <td className="num">{fmt.dollars(o.coutPeriode)}</td>
              <td><Jauge part={o.partJour} libelle={jauge(o.jour, o.plafondJour, o.partJour)} /></td>
              <td><Jauge part={o.partMois} libelle={jauge(o.mois, o.plafondMois, o.partMois)} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="hint">« Aujourd’hui » et « Ce mois » suivent les plafonds, quelle que soit la période choisie ; les plafonds se règlent dans l’onglet « Réglages ».</p>
    </div>
  );
}

type ColonneParcelle = { cle: string; titre: string; num?: boolean; valeur: (l: LigneParcelle) => string | number | null; texte: (l: LigneParcelle) => string };

/** Le tableau par parcelle, trie sur la colonne choisie (un second clic inverse l'ordre). */
export function TableParcelles({ lignes, series }: { lignes: LigneParcelle[]; series: string[] }) {
  const [tri, setTri] = useState<{ cle: string; sens: 'asc' | 'desc' }>({ cle: 'cout', sens: 'desc' });
  const cout: ColonneParcelle = { cle: 'cout', titre: 'Coût', num: true, valeur: (l) => l.cout, texte: (l) => fmt.dollars(l.cout) };
  const colonnes: ColonneParcelle[] = [
    { cle: 'adresse', titre: 'Adresse', valeur: (l) => l.adresse, texte: (l) => l.adresse ?? '—' },
    { cle: 'idu', titre: 'IDU', valeur: (l) => l.idu, texte: (l) => l.idu ?? '—' },
    { cle: 'audits', titre: 'Audits', num: true, valeur: (l) => l.audits, texte: (l) => fmt.tokens(l.audits) },
    ...series.map((s): ColonneParcelle => ({ cle: 'tokens:' + s, titre: 'Tokens ' + nomModele(s).replace(/^Claude /, ''), num: true, valeur: (l) => l.tokensParModele[s] ?? 0, texte: (l) => fmt.tokens(l.tokensParModele[s] ?? 0) })),
    { cle: 'partCache', titre: 'Part du cache', num: true, valeur: (l) => l.partCache, texte: (l) => fmt.part(l.partCache) },
    cout,
    // Le cout par facade (spec-audit §13.3) : les facades sont comptees par le journal depuis le lot
    // L17 ; une parcelle d'avant n'en a pas, et le dit par un tiret plutot que par un zero.
    { cle: 'coutParFacade', titre: 'Coût par façade', num: true, valeur: (l) => l.coutParFacade, texte: (l) => (l.coutParFacade === null ? '—' : fmt.dollars(l.coutParFacade)) },
    { cle: 'dernier', titre: 'Dernier audit', valeur: (l) => l.dernier, texte: (l) => fmt.date(l.dernier) }
  ];
  const col = colonnes.find((c) => c.cle === tri.cle) ?? cout;
  if (!lignes.length) return <p className="consVide">Aucune parcelle sur cette période et ces filtres.</p>;
  // Un premier clic trie les nombres du plus grand au plus petit, les textes de A a Z ; le suivant inverse.
  const basculer = (c: ColonneParcelle) => setTri((t) => ({ cle: c.cle, sens: t.cle === c.cle ? (t.sens === 'desc' ? 'asc' : 'desc') : c.num ? 'desc' : 'asc' }));
  return (
    <>
      <div className="consTableau">
        <table className="attrTable consTable">
          <thead>
            <tr>
              {colonnes.map((c) => (
                <th key={c.cle} scope="col" className={c.num ? 'num' : undefined} aria-sort={tri.cle === c.cle ? (tri.sens === 'asc' ? 'ascending' : 'descending') : 'none'}>
                  <button type="button" className="consTri" onClick={() => basculer(c)}>
                    {c.titre}<span aria-hidden="true">{tri.cle === c.cle ? (tri.sens === 'asc' ? ' ▲' : ' ▼') : ''}</span>
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {trier(lignes, col.valeur, tri.sens).map((l) => <tr key={l.cle}>{colonnes.map((c) => <td key={c.cle} className={c.num ? 'num' : undefined}>{c.texte(l)}</td>)}</tr>)}
          </tbody>
        </table>
      </div>
    </>
  );
}

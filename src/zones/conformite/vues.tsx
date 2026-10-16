// Les vues de l'ecran des indicateurs de conformite (MD/spec-regles-toits.md 13.5, lot G3) : chiffres
// cles, tableaux par axe, cas un a un, accord de Claude, historique. Elles ne calculent rien :
// regles/conformite.ts l'a fait, elles mettent en page. Un taux s'ecrit toujours en chiffres et en
// mots ; aucune couleur ne porte seule une information.

import {
  ATTRIBUTS_CLAUDE, PHASE1_CAS_OBSERVES, PHASE1_HORS_CALCUL, libelleRegion, pourCent,
  type CritereFacade, type EtatCas, type LigneTaux, type MesureLue, type ResumeConformite, type ResumeFacades, type VerdictCas, type VerdictFacade
} from '../../regles/conformite.js';
import { AUTRES_FORMES, FORMES_COURANTES, libelleDe } from '../../model/ceQueJeVois.js';

const pluriel = (n: number, mot: string) => n + ' ' + mot + (n > 1 ? 's' : '');
/** Ce que l'on ecrit quand une colonne attend son lot : un mot, pas un zero trompeur. */
export const A_VENIR = 'À venir';

export const LIBELLES_ETAT: Record<EtatCas, string> = {
  conforme: 'Conforme', 'non-conforme': 'Non conforme', 'a-revoir': 'À revoir', 'sans-observation': 'Sans observation', ecarte: 'Écarté',
};

function Tuile({ titre, valeur, note }: { titre: string; valeur: string; note: string }) {
  return (
    <div className="consTuile">
      <span className="consTuileTitre">{titre}</span>
      <span className="consTuileValeur">{valeur}</span>
      <span className="consTuileNote">{note}</span>
    </div>
  );
}

export function TuilesConformite({ r, facades }: { r: ResumeConformite; facades?: ResumeFacades }) {
  return (
    <section className="consTuiles" aria-label="Chiffres clés">
      <Tuile titre="Conformité des toits" valeur={pourCent(r.taux)} note={r.conformes + ' conforme' + (r.conformes > 1 ? 's' : '') + ' sur ' + pluriel(r.conformes + r.nonConformes, 'cas jugé')} />
      <Tuile titre="Cas observés" valeur={r.observes + ' / ' + PHASE1_CAS_OBSERVES} note={'Phase 1 : ' + PHASE1_CAS_OBSERVES + ' cas observés · ' + r.total + ' cas lus'} />
      <Tuile titre="Formes hors calcul" valeur={r.horsCalcul + ' / ' + PHASE1_HORS_CALCUL} note="Cas sur ce que Plan ne calcule pas encore" />
      <Tuile titre="À revoir" valeur={String(r.aRevoir)} note="Le calcul a changé depuis le terrain" />
      <Tuile titre="Conformité des façades" valeur={facades && facades.total ? pourCent(facades.taux) : A_VENIR}
        note={facades && facades.total ? facades.conformes + ' conforme' + (facades.conformes > 1 ? 's' : '') + ' sur ' + pluriel(facades.total, 'façade') + ' relevée' + (facades.total > 1 ? 's' : '') : 'Disposition automatique comparée aux relevés des audits reçus'} />
      <Tuile titre="Accord de Claude" valeur={A_VENIR} note="Par attribut, sur les validations réelles" />
    </section>
  );
}

/** Un tableau par axe (forme, region ou probleme) ; la colonne des facades n'a de taux que par region (le departement de la parcelle). */
export function TableAxe({ titre, lignes, facadesParRegion }: { titre: string; lignes: LigneTaux[]; facadesParRegion?: Record<string, number | null> }) {
  if (!lignes.length) return <p className="consVide">Aucun cas à montrer pour cette source.</p>;
  return (
    <div className="consTableau">
      <table className="attrTable consTable">
        <thead>
          <tr>
            <th scope="col">{titre}</th><th scope="col" className="num">Cas</th><th scope="col" className="num">Conformes</th>
            <th scope="col" className="num">Non conformes</th><th scope="col" className="num">À revoir</th><th scope="col" className="num">Sans observation</th>
            <th scope="col" className="num">Toits</th><th scope="col" className="num">Façades</th>
          </tr>
        </thead>
        <tbody>
          {lignes.map((l) => (
            <tr key={l.cle}>
              <td>{l.libelle}</td><td className="num">{l.cas}</td><td className="num">{l.conformes}</td><td className="num">{l.nonConformes}</td>
              <td className="num">{l.aRevoir}</td><td className="num">{l.sansObservation}</td>
              <td className="num"><strong>{pourCent(l.taux)}</strong></td>{cellFacades(l.cle, facadesParRegion)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** La cellule « Facades » d'une ligne : le taux de la region si on le connait, un tiret sur les axes qui n'en ont pas. */
function cellFacades(cle: string, parRegion?: Record<string, number | null>) {
  if (!parRegion) return <td className="num consNote" title="Le taux des façades se lit par région">—</td>;
  return <td className="num"><strong>{cle in parRegion ? pourCent(parRegion[cle] ?? null) : '—'}</strong></td>;
}

const libelleForme = (f: VerdictCas['forme']) => (f === 'non-notee' ? '—' : libelleDe([...FORMES_COURANTES, ...AUTRES_FORMES], f));
const STATUTS: Record<string, string> = { a_corriger: 'À corriger', corrige: 'Corrigé', valide: 'Validé', sans_suite: 'Sans suite' };

/** Ce qui ne tient pas, en mots courts ; ce qui tient ne se repete pas. */
function ecarts(v: VerdictCas): string {
  const non = v.assertions.filter((a) => !a.tenue).map((a) => a.motif ?? a.assertion);
  if (non.length) return non.join(' ; ');
  return v.etat === 'conforme' ? v.assertions.map((a) => a.assertion).join(', ') + ' : tenu' : '';
}

export function TableCas({ verdicts }: { verdicts: VerdictCas[] }) {
  if (!verdicts.length) return <p className="consVide">Aucun cas à montrer pour cette source.</p>;
  return (
    <div className="consTableau">
      <table className="attrTable consTable confCas">
        <thead>
          <tr>
            <th scope="col">État</th><th scope="col">Source</th><th scope="col">Bâtiment</th><th scope="col">Statut</th>
            <th scope="col">Forme</th><th scope="col">Région</th><th scope="col">Ce qui ne tient pas</th>
          </tr>
        </thead>
        <tbody>
          {verdicts.map((v) => (
            <tr key={v.source + v.fichier + v.id} data-etat={v.etat}>
              <td><strong>{LIBELLES_ETAT[v.etat]}</strong></td>
              <td>{v.source === 'corpus' ? 'Corpus' : 'Audit'} <span className="consNote">{v.fichier} · {v.id}</span></td>
              <td>{v.cle}</td><td>{v.statut ? STATUTS[v.statut] ?? v.statut : '—'}</td>
              <td>{libelleForme(v.forme)}</td><td>{libelleRegion(v.region)}</td>
              <td className="confEcarts">{ecarts(v)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const CRITERES: { cle: 'baies' | 'partVitree' | 'hauteurNiveau'; titre: string }[] = [
  { cle: 'baies', titre: 'Baies' }, { cle: 'partVitree', titre: 'Part vitrée' }, { cle: 'hauteurNiveau', titre: 'Hauteur des niveaux' },
];
const valeurCritere = (c: CritereFacade, cle: string) => (c.releve === null ? '—' : cle === 'baies' ? String(c.releve) + ' / ' + String(c.auto) : cle === 'partVitree' ? Math.round(c.releve * 100) + ' % / ' + Math.round((c.auto ?? 0) * 100) + ' %' : c.releve.toFixed(2).replace('.', ',') + ' m / ' + (c.auto === null ? '—' : c.auto.toFixed(2).replace('.', ',') + ' m'));
const motCritere = (c: CritereFacade) => (c.tenu === null ? 'non jugé' : c.tenu ? 'tenu' : 'écart');

/** Les facades relevees des audits reçus, une par ligne : le relevé d'un côté, la disposition automatique de l'autre. */
export function TableFacades({ verdicts }: { verdicts: VerdictFacade[] }) {
  if (!verdicts.length) return <p className="consVide">Aucune façade relevée dans les audits reçus : le corpus des promenades n’en a pas.</p>;
  return (
    <div className="consTableau">
      <p className="hint">Chaque critère montre le relevé puis la disposition automatique (« relevé / auto ») et dit s’il tient. Une façade est conforme quand tous les critères jugés tiennent.</p>
      <table className="attrTable consTable confCas">
        <thead>
          <tr>
            <th scope="col">État</th><th scope="col">Audit</th><th scope="col">Bâtiment</th><th scope="col">Façade</th><th scope="col">Région</th>
            {CRITERES.map((c) => <th key={c.cle} scope="col">{c.titre}</th>)}
          </tr>
        </thead>
        <tbody>
          {verdicts.map((v) => (
            <tr key={v.fichier + v.batiment + v.cote} data-etat={v.conforme ? 'conforme' : 'non-conforme'}>
              <td><strong>{v.conforme ? 'Conforme' : 'Non conforme'}</strong></td>
              <td><span className="consNote">{v.fichier}</span></td><td>{v.batiment}</td><td>{v.orientation ?? 'côté ' + v.cote}</td><td>{libelleRegion(v.region)}</td>
              {CRITERES.map((c) => <td key={c.cle}>{valeurCritere(v[c.cle], c.cle)} <span className="consNote">{motCritere(v[c.cle])}</span></td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function VueClaude() {
  return (
    <>
      <p className="hint">
        Le taux d’accord de Claude se mesurera sur les propositions validées ou refusées des audits réels. Un attribut ne sera
        pré-accepté qu’au-dessus de 95 % d’accord sur au moins 30 cas.
      </p>
      <div className="consTableau">
        <table className="attrTable consTable">
          <thead><tr><th scope="col">Attribut</th><th scope="col" className="num">Cas</th><th scope="col" className="num">Taux d’accord</th></tr></thead>
          <tbody>
            {ATTRIBUTS_CLAUDE.map((a) => <tr key={a.code}><td>{a.libelle}</td><td className="num">—</td><td className="num consNote">{A_VENIR}</td></tr>)}
          </tbody>
        </table>
      </div>
    </>
  );
}

const date = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' });
};

export function VueHistorique({ mesures, erreur }: { mesures: MesureLue[] | null; erreur: string | null }) {
  if (erreur) return <p className="consErreur" role="alert">{erreur}</p>;
  if (!mesures) return <p className="hint">Lecture de l’historique…</p>;
  if (!mesures.length) return <p className="consVide">Aucune mesure enregistrée : « Enregistrer la mesure » range celle affichée sur le serveur.</p>;
  return (
    <div className="consTableau">
      <table className="attrTable consTable">
        <thead>
          <tr>
            <th scope="col">Mesure</th><th scope="col">Version</th><th scope="col" className="num">Corpus</th><th scope="col" className="num">Audits</th>
            <th scope="col" className="num">Toits</th><th scope="col" className="num">Façades</th><th scope="col" className="num">Jugés</th><th scope="col" className="num">À revoir</th><th scope="col" className="num">Hors calcul</th>
          </tr>
        </thead>
        <tbody>
          {[...mesures].reverse().map((m) => (
            <tr key={m.t + (m.recuLe ?? '')}>
              <td>{date(m.t)}</td><td>{m.code.version}{m.code.commit ? ' · ' + m.code.commit : ''}</td>
              <td className="num">{m.sources.corpus}</td><td className="num">{m.sources.audits}</td>
              <td className="num"><strong>{pourCent(m.toits.taux)}</strong></td><td className="num">{pourCent(m.facades)}</td><td className="num">{m.toits.conformes + ' / ' + (m.toits.conformes + m.toits.nonConformes)}</td>
              <td className="num">{m.toits.aRevoir}</td><td className="num">{m.toits.horsCalcul}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

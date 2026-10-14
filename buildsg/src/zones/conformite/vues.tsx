// Les vues de l'ecran des indicateurs de conformite (MD/spec-regles-toits.md 13.5, lot G3) : chiffres
// cles, tableaux par axe, cas un a un, accord de Claude, historique. Elles ne calculent rien :
// model/conformite.ts l'a fait, elles mettent en page. Un taux s'ecrit toujours en chiffres et en
// mots ; aucune couleur ne porte seule une information.

import {
  ATTRIBUTS_CLAUDE, PHASE1_CAS_OBSERVES, PHASE1_HORS_CALCUL, libelleRegion, pourCent,
  type EtatCas, type LigneTaux, type MesureLue, type ResumeConformite, type VerdictCas
} from '../../model/conformite.js';
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

export function TuilesConformite({ r }: { r: ResumeConformite }) {
  return (
    <section className="consTuiles" aria-label="Chiffres clés">
      <Tuile titre="Conformité des toits" valeur={pourCent(r.taux)} note={r.conformes + ' conforme' + (r.conformes > 1 ? 's' : '') + ' sur ' + pluriel(r.conformes + r.nonConformes, 'cas jugé')} />
      <Tuile titre="Cas observés" valeur={r.observes + ' / ' + PHASE1_CAS_OBSERVES} note={'Phase 1 : ' + PHASE1_CAS_OBSERVES + ' cas observés · ' + r.total + ' cas lus'} />
      <Tuile titre="Formes hors calcul" valeur={r.horsCalcul + ' / ' + PHASE1_HORS_CALCUL} note="Cas sur ce que Plan ne calcule pas encore" />
      <Tuile titre="À revoir" valeur={String(r.aRevoir)} note="Le calcul a changé depuis le terrain" />
      <Tuile titre="Conformité des façades" valeur={A_VENIR} note="Disposition automatique comparée aux relevés" />
      <Tuile titre="Accord de Claude" valeur={A_VENIR} note="Par attribut, sur les validations réelles" />
    </section>
  );
}

/** Un tableau par axe (forme, region ou probleme) ; la colonne des facades attend son lot. */
export function TableAxe({ titre, lignes }: { titre: string; lignes: LigneTaux[] }) {
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
              <td className="num"><strong>{pourCent(l.taux)}</strong></td><td className="num consNote">{A_VENIR}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
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
            <th scope="col" className="num">Toits</th><th scope="col" className="num">Jugés</th><th scope="col" className="num">À revoir</th><th scope="col" className="num">Hors calcul</th>
          </tr>
        </thead>
        <tbody>
          {[...mesures].reverse().map((m) => (
            <tr key={m.t + (m.recuLe ?? '')}>
              <td>{date(m.t)}</td><td>{m.code.version}{m.code.commit ? ' · ' + m.code.commit : ''}</td>
              <td className="num">{m.sources.corpus}</td><td className="num">{m.sources.audits}</td>
              <td className="num"><strong>{pourCent(m.toits.taux)}</strong></td><td className="num">{m.toits.conformes + ' / ' + (m.toits.conformes + m.toits.nonConformes)}</td>
              <td className="num">{m.toits.aRevoir}</td><td className="num">{m.toits.horsCalcul}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// L'ecran Admin › Principes (`?admin&ecran=principes`) : les principes de Plan, chacun lu sous trois angles — le processus (ce qui
// s'enchaine), les actions (qui fait quoi, et ce que cela declenche) et les coulisses (ce qui se passe derriere, avec le fichier).
// Un sommaire par famille, une recherche, un choix de l'angle a montrer ; tout vient de la liste a plat de model/principes.ts.

import { useMemo, useState } from 'react';
import { FAMILLES, PRINCIPES, chercherPrincipes, type Acteur, type FamillePrincipe, type Principe } from '../model/principes.js';

const ACTEURS: Record<Acteur, string> = { vous: 'Vous', plan: 'Plan', claude: 'Claude', admin: 'Admin' };
type Angle = 'tout' | 'processus' | 'actions' | 'coulisses';
const ANGLES: readonly { id: Angle; libelle: string }[] = [
  { id: 'tout', libelle: 'Tout' }, { id: 'processus', libelle: 'Processus' }, { id: 'actions', libelle: 'Actions' }, { id: 'coulisses', libelle: 'Coulisses' },
];

function Fiche({ p, angle, titres }: { p: Principe; angle: Angle; titres: Map<string, string> }) {
  const montre = (a: Exclude<Angle, 'tout'>) => angle === 'tout' || angle === a;
  return (
    <article className="princFiche" id={'principe-' + p.id} aria-labelledby={'principe-titre-' + p.id} data-famille={p.famille}>
      <h3 id={'principe-titre-' + p.id} className="princTitre">{p.titre}</h3>
      <p className="princResume">{p.resume}</p>
      <p className="princPourquoi"><strong>Pourquoi.</strong> {p.pourquoi}</p>
      {montre('processus') && (
        <section className="princBloc" aria-label={'Processus : ' + p.titre} data-angle="processus">
          <h4 className="princAngle">Processus</h4>
          <ol className="princEtapes">
            {p.processus.map((e, i) => (
              <li key={e.titre} className="princEtape">
                <span className="princNum" aria-hidden="true">{i + 1}</span>
                <div><strong>{e.titre}</strong><p>{e.detail}</p></div>
              </li>
            ))}
          </ol>
        </section>
      )}
      {montre('actions') && (
        <section className="princBloc" aria-label={'Actions : ' + p.titre} data-angle="actions">
          <h4 className="princAngle">Actions</h4>
          <ul className="princActions">
            {p.actions.map((a) => (
              <li key={a.faire} className="princAction">
                <span className="princActeur" data-acteur={a.qui}>{ACTEURS[a.qui]}</span>
                <div>
                  <strong>{a.faire}</strong>
                  <p><span aria-hidden="true">→ </span>{a.effet}</p>
                  {a.ecran && <a className="princEcran" href={a.ecran}>Ouvrir l’écran</a>}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
      {montre('coulisses') && (
        <section className="princBloc" aria-label={'Coulisses : ' + p.titre} data-angle="coulisses">
          <h4 className="princAngle">Ce qui se passe derrière</h4>
          <ul className="princCoulisses">
            {p.coulisses.map((c) => <li key={c.ou}><span>{c.quoi}</span> <code>{c.ou}</code></li>)}
          </ul>
        </section>
      )}
      {p.voir && p.voir.length > 0 && (
        <p className="princVoir">À lire avec : {p.voir.map((v, i) => <span key={v}>{i > 0 && ', '}<a href={'#principe-' + v}>{titres.get(v) ?? v}</a></span>)}</p>
      )}
    </article>
  );
}

export function EcranPrincipes({ principes = PRINCIPES, retour = '?admin' }: { principes?: readonly Principe[]; retour?: string }) {
  const [angle, setAngle] = useState<Angle>('tout');
  const [recherche, setRecherche] = useState('');
  const titres = useMemo(() => new Map(principes.map((p) => [p.id, p.titre])), [principes]);
  const trouves = useMemo(() => chercherPrincipes(principes, recherche), [principes, recherche]);
  const familles = (Object.keys(FAMILLES) as FamillePrincipe[]).filter((f) => trouves.some((p) => p.famille === f));
  return (
    <div className="consEcran princPage">
      <header className="consEntete">
        <a className="ecranRetour" href={retour}><span aria-hidden="true">←</span> Retour au plan</a>
        <h1 className="palTitre">Les principes de Plan</h1>
        <p className="palSous">
          Chaque principe se lit sous trois angles : le processus (ce qui s’enchaîne), les actions (qui fait quoi, et ce que cela déclenche) et ce qui se
          passe derrière (le fichier du dépôt, la donnée, la règle). Pour le trajet d’un bâtiment, de l’IGN à votre maison, voir <a href="?admin&ecran=chaine">De l’IGN à ma maison</a>.
        </p>
      </header>
      <div className="princOutils">
        <label className="reglChamp">
          <span className="reglChampNom">Chercher un principe (mot, fichier, seuil)</span>
          <input type="search" value={recherche} onChange={(e) => setRecherche(e.target.value)} aria-label="Chercher un principe" />
        </label>
        <div className="segmente" role="group" aria-label="Angle à montrer">
          {ANGLES.map((a) => <button key={a.id} type="button" className={angle === a.id ? 'actif' : ''} aria-pressed={angle === a.id} onClick={() => setAngle(a.id)}>{a.libelle}</button>)}
        </div>
      </div>
      <div className="princCorps">
        <nav className="princSommaire" aria-label="Sommaire des principes">
          {familles.map((f) => (
            <div key={f} className="princFamille">
              <strong>{FAMILLES[f].titre}</strong>
              <ul>{trouves.filter((p) => p.famille === f).map((p) => <li key={p.id}><a href={'#principe-' + p.id}>{p.titre}</a></li>)}</ul>
            </div>
          ))}
        </nav>
        <div className="princContenu" aria-live="polite">
          {!trouves.length && <p className="consNote" role="status">Aucun principe ne contient « {recherche} ».</p>}
          {familles.map((f) => (
            <section key={f} className="princSection" aria-labelledby={'famille-' + f}>
              <h2 id={'famille-' + f} className="princFamilleTitre">{FAMILLES[f].titre}</h2>
              <p className="princFamilleDit">{FAMILLES[f].dit}</p>
              {trouves.filter((p) => p.famille === f).map((p) => <Fiche key={p.id} p={p} angle={angle} titres={titres} />)}
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}

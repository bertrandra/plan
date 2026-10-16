// Z8, Admin › « Audits » : la carte ouverte d'un audit (MD/spec-audit.md 15.4 et 15.5). Trois
// parties repliables : les donnees (les photos, batiment par batiment), la conclusion (chaque
// proposition, de Claude ou des mesures, et ce qui en a ete fait ; les cas d'une promenade et leur
// statut), et pour un audit de parcelle les analyses par Claude et leurs rejeux, cote a cote, avec
// « Rejouer l'analyse » et le modele choisi. Une analyse s'ouvre en entier : ce qui est parti
// (prompt, schema, modele, effort, chaque requete et ses images) et ce qui est revenu (le texte brut
// de Claude, la sortie remise en forme, l'erreur, les tokens, le cout). La logique vit dans
// app/audit/parcelle/catalogue.ts ; ici on affiche.

import { lignesBenchmark, comptesAnalyse, batimentDe, type LigneBenchmark } from '../../export/benchmarkAnalyses.js';
import { nomModele } from '../../model/consommation.js';
import type { CatalogueAudits } from '../../app/audit/parcelle/catalogue.js';
import type { DonneesAudit, PhotoVue } from '../../app/audit/parcelle/donneesAudit.js';
import type { FicheAudit } from '../../io/auditsServeur.js';
import type { AnalyseComplete, ResultatSortant } from '../../io/analysesAudits.js';
import { comparerAnalyses, type ValeurVotee } from '../../app/audit/parcelle/comparaisonAnalyses.js';

const pluriel = (n: number, mot: string) => n + ' ' + mot + (n > 1 ? 's' : '');
const dollars = (v: number | null) => (v === null ? '—' : v.toFixed(4).replace('.', ',') + ' $');
const duree = (s: number | null) => (s === null ? '—' : s < 600 ? s + ' s' : Math.round(s / 60) + ' min');
const nombre = (v: number | undefined) => (v === undefined ? '—' : (Math.round(v * 10) / 10).toString().replace('.', ','));
const DECISIONS = { validee: 'Validée', refusee: 'Refusée' } as const;

/** Les photos en vignettes, dans l'ordre : l'image entiere s'ouvre dans un nouvel onglet du navigateur. */
function Vignettes({ photos, max = 12 }: { photos: PhotoVue[]; max?: number }) {
  if (!photos.length) return null;
  return (
    <div className="vignettesAudit">
      {photos.slice(0, max).map((p, i) => <img key={i} src={'data:image/jpeg;base64,' + p.base64} alt={p.legende} title={p.legende} loading="lazy" />)}
      {photos.length > max && <span className="detailPhoto">et {photos.length - max} de plus</span>}
    </div>
  );
}

function Donnees({ d }: { d: DonneesAudit }) {
  if (d.nature === 'promenade') {
    return (
      <ul className="listeDetailAudit">
        {d.cas.map((c, i) => (
          <li key={i}>
            <div className="ligneDetailAudit"><strong>{c.titre}</strong> · {c.categorie}{c.problemes.length ? ' : ' + c.problemes.join(', ') : ''}</div>
            {c.note && <div className="detailPhoto">« {c.note} »</div>}
            <Vignettes photos={c.photos} max={6} />
          </li>
        ))}
      </ul>
    );
  }
  return (
    <ul className="listeDetailAudit">
      {d.batiments.map((b, i) => (
        <li key={i}>
          <div className="ligneDetailAudit"><strong>{b.nom}</strong></div>
          {b.facades.map((f, j) => (
            <div key={j} className="facadeDetailAudit">
              <div className="detailPhoto">{f.nom} : {pluriel(f.photos.length, 'photo')}{f.mesure ? ' ; mesures : ' + f.mesure : ''}</div>
              <Vignettes photos={f.photos} max={8} />
            </div>
          ))}
          {b.toit.length > 0 && <div className="facadeDetailAudit"><div className="detailPhoto">Toit : {pluriel(b.toit.length, 'photo')}</div><Vignettes photos={b.toit} max={8} /></div>}
        </li>
      ))}
      {(d.cloture.length > 0 || d.portail.length > 0) && <li><div className="ligneDetailAudit"><strong>Clôture et portail</strong></div><Vignettes photos={[...d.cloture, ...d.portail]} /></li>}
    </ul>
  );
}

function Conclusion({ d }: { d: DonneesAudit }) {
  if (d.nature === 'promenade') {
    return (
      <table className="attrTable tableAudit">
        <thead><tr><th>Cas</th><th>Statut</th><th>Fait écrit</th></tr></thead>
        <tbody>{d.cas.map((c, i) => <tr key={i}><td>{c.titre}</td><td>{c.statut}</td><td>{c.fait ? 'Oui' : 'Non'}</td></tr>)}</tbody>
      </table>
    );
  }
  if (!d.propositions.length) return <p className="detailPhoto">Aucune proposition dans ce fichier (capture en cours, ou analyse pas encore faite).</p>;
  return (
    <>
      <p className="detailPhoto">{pluriel(d.validations, 'validation')} dans le fichier.</p>
      <table className="attrTable tableAudit">
        <thead><tr><th>Objet</th><th>Avant</th><th>Après</th><th>Source</th><th>Décision</th></tr></thead>
        <tbody>{d.propositions.map((p, i) => (
          <tr key={i}><td>{p.objet}</td><td>{p.avant}</td><td>{p.apres}</td><td>{p.source === 'claude' ? 'Claude' : 'Mesure'}</td><td>{p.decision ? DECISIONS[p.decision] : 'En attente'}</td></tr>
        ))}</tbody>
      </table>
    </>
  );
}

/** Les analyses cote a cote : une ligne par analyse ou rejeu, les comptes en colonnes. */
function Comparaison({ catalogue, a, lignes }: { catalogue: CatalogueAudits; a: FicheAudit; lignes: LigneBenchmark[] }) {
  const e = catalogue.etat();
  return (
    <div className="defileAudit">
      <table className="attrTable tableAudit tableComparaison">
        <thead><tr>
          <th>Envoyée le</th><th>Nature</th><th>Modèle</th><th>Prompt · schéma</th><th>Réussies</th><th>Vides</th>
          <th>Ouvertures</th><th>Pignons</th><th>Lucarnes</th><th>Écarts</th><th>Déterminés</th><th>Coût</th><th>Durée</th><th />
        </tr></thead>
        <tbody>{lignes.map((l) => (
          <tr key={l.id} className={e.trace?.id === l.id ? 'choisie' : undefined}>
            <td>{l.creeLe.slice(0, 16).replace('T', ' ')}</td>
            <td>{l.nature === 'rejeu' ? 'Rejeu' : 'Analyse'}</td>
            <td>{nomModele(l.modele)}</td>
            <td>{l.essai ? 'brouillon ' : ''}{l.prompt} · {l.schema}</td>
            <td>{l.etat === 'termine' ? l.reussies + ' / ' + l.requetes : 'En cours'}</td>
            <td>{l.etat === 'termine' ? l.vides : '—'}</td>
            <td>{nombre(l.comptes?.ouvertures)}</td><td>{nombre(l.comptes?.bouts)}</td><td>{nombre(l.comptes?.lucarnes)}</td>
            <td>{nombre(l.comptes?.ecarts)}</td><td>{nombre(l.comptes?.determines)}</td>
            <td>{dollars(l.cout)}</td><td>{duree(l.dureeS)}</td>
            <td><button type="button" className="secondary small" data-controle="auditsParcelle.voirAnalyse" aria-label={'Voir l’analyse du ' + l.creeLe.slice(0, 16).replace('T', ' ')}
              onClick={() => { void catalogue.voirTrace(a.id, l.id); }}>Voir</button></td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}

function Sortie({ r }: { r: ResultatSortant }) {
  return (
    <div className="blocTrace">
      <div className="ligneDetailAudit"><strong>{r.id}</strong> · {r.statut === 'reussi' ? 'réussie' : r.statut}{r.arret ? ' (arrêt : ' + r.arret + ')' : ''} · {nomModele(r.modele)}
        {' · '}{r.tokens.entree + r.tokens.ecritureCache + r.tokens.ecritureCache1h + r.tokens.lectureCache} tokens en entrée, {r.tokens.sortie} en sortie · {dollars(r.cout)}</div>
      {r.erreur && <p className="erreurParcours">{r.erreur.type} : {r.erreur.message}</p>}
      {r.trouve && <div className="detailPhoto">Trouvé : {r.trouve.vide ? 'rien' : ['ouvertures ' + r.trouve.ouvertures, 'pignons ' + r.trouve.bouts, 'lucarnes ' + r.trouve.lucarnes, 'éléments ' + r.trouve.elements, 'écarts ' + r.trouve.ecarts, 'déterminés ' + r.trouve.determines].join(', ')}</div>}
      <details><summary>Réponse brute de Claude</summary><pre className="texteTrace">{r.texte ?? '(aucun texte)'}</pre></details>
      <details><summary>Sortie remise en forme (selon le schéma)</summary><pre className="texteTrace">{JSON.stringify(r.sortie, null, 2)}</pre></details>
    </div>
  );
}

const valeurVotee = (v: ValeurVotee | null) => (v === null ? '—' : v.valeur + (v.accord === null ? '' : ' (' + Math.round(v.accord * 100) + ' %)'));

/** Ce que les reponses de l'analyse ouverte disent differemment d'une autre du meme audit (le vote des passes, batiment par batiment). */
function DifferencesAnalyses({ catalogue, ouverte, autres }: { catalogue: CatalogueAudits; ouverte: AnalyseComplete; autres: { id: string; libelle: string }[] }) {
  const c = catalogue.etat().comparaison;
  const lue = c?.complete && c.audit === ouverte.audit ? c.complete : null;
  const cmp = lue ? comparerAnalyses(lue, ouverte) : null;
  const lignes = cmp ? cmp.lignes.filter((l) => l.change) : [];
  return (
    <details open={!!c}>
      <summary>Comparer les réponses à celles d’une autre analyse</summary>
      <div className="actionsAuditRecu" role="group" aria-label="Comparer les réponses">
        <label className="choixModeleRejeu">Avant
          <select data-controle="auditsParcelle.comparerAvec" value={c?.avec ?? ''} onChange={(ev) => { const v = ev.currentTarget.value; if (v) void catalogue.comparer(ouverte.audit, v); else catalogue.fermerComparaison(); }}>
            <option value="">—</option>
            {autres.map((a) => <option key={a.id} value={a.id}>{a.libelle}</option>)}
          </select>
        </label>
      </div>
      {c && !lue && <p className={c.erreur ? 'erreurParcours' : 'detailPhoto'} role="status">{c.erreur ?? 'Lecture de l’analyse à comparer…'}</p>}
      {cmp && <>
        <p className="detailPhoto">
          {pluriel(cmp.batiments.length, 'bâtiment')} lu{cmp.batiments.length > 1 ? 's' : ''} dans les deux · {pluriel(cmp.changees, 'attribut')} {cmp.changees > 1 ? 'changent' : 'change'} sur {cmp.lignes.length}.
          {cmp.seulementAvant.length > 0 && ' Seulement dans l’autre : ' + cmp.seulementAvant.join(', ') + '.'}
          {cmp.seulementApres.length > 0 && ' Seulement dans celle-ci : ' + cmp.seulementApres.join(', ') + '.'}
        </p>
        {lignes.length > 0 && <div className="defileAudit"><table className="attrTable tableAudit tableComparaison">
          <thead><tr><th>Bâtiment</th><th>Attribut</th><th>Avant</th><th>Après (cette analyse)</th></tr></thead>
          <tbody>{lignes.map((l, i) => <tr key={i}><td>{l.batiment}</td><td>{l.attribut}</td><td>{valeurVotee(l.avant)}</td><td>{valeurVotee(l.apres)}</td></tr>)}</tbody>
        </table></div>}
        {lignes.length === 0 && <p className="detailPhoto">Les deux analyses disent la même chose sur tous leurs attributs.</p>}
      </>}
    </details>
  );
}

/** Une analyse en entier : l'entrant, le sortant, et le vote par batiment. */
function Trace({ catalogue, complete, autres }: { catalogue: CatalogueAudits; complete: AnalyseComplete; autres: { id: string; libelle: string }[] }) {
  const { resume, entrant, sortant } = complete;
  const comptes = sortant ? comptesAnalyse(sortant.resultats) : null;
  const batiments = sortant ? [...new Set(sortant.resultats.map((r) => batimentDe(r.id)))] : [];
  return (
    <div className="traceAudit" role="region" aria-label="Détail de l’analyse">
      <div className="enteteAuditRecu">
        <span className="dateAuditRecu">{resume.nature === 'rejeu' ? 'Rejeu' : 'Analyse'} du {resume.creeLe.slice(0, 16).replace('T', ' ')}</span>
        <span className="pastilleAudit">{nomModele(resume.modele)}</span>
        <span className="pastilleAudit">{resume.etat === 'termine' ? 'Terminée' : 'En cours'}</span>
        {resume.essai && <span className="pastilleAudit" title="Parti avec le brouillon des règles du serveur, pas avec le prompt livré">Brouillon des règles</span>}
      </div>
      <p className="detailPhoto">Batch {resume.idBatch} · prompt {resume.prompt}, schéma {resume.schema} · effort {resume.effort ?? '—'} · {pluriel(resume.requetes, 'requête')}, {pluriel(resume.images, 'image')} · {dollars(resume.cout)}</p>
      <details open>
        <summary>Entrant : ce qui est parti chez Claude</summary>
        {entrant ? <>
          <p className="detailPhoto">max_tokens {entrant.max_tokens} · effort {entrant.effort}</p>
          {Object.entries(entrant.usages).map(([u, x]) => (
            <details key={u}><summary>Prompt « {u} » (version {x.prompt}, schéma {x.schema}), texte envoyé en system</summary><pre className="texteTrace">{x.systeme}</pre></details>
          ))}
          {entrant.requetes.map((q) => (
            <details key={q.id} className="blocTrace">
              <summary>Requête {q.id} · passe {q.passe ?? '—'} · {q.usage} · {nomModele(q.modele)} · {pluriel(q.images, 'image')}</summary>
              {q.contenu.map((b, i) => b.type === 'text'
                ? <pre key={i} className="texteTrace">{b.text}</pre>
                : <img key={i} className="imageTrace" src={catalogue.urlImage(complete.audit, b.image) ?? ''} alt={'Image envoyée ' + b.image} loading="lazy" />)}
            </details>
          ))}
        </> : <p className="detailPhoto">L’entrée n’a pas été gardée.</p>}
      </details>
      <details open>
        <summary>Sortant : ce que Claude a rendu</summary>
        {sortant ? sortant.resultats.map((r) => <Sortie key={r.id} r={r} />) : <p className="detailPhoto">Le batch n’est pas encore lu : « Relire les analyses » le suit jusqu’à sa fin.</p>}
      </details>
      {sortant && <DifferencesAnalyses catalogue={catalogue} ouverte={complete} autres={autres} />}
      {comptes && <details>
        <summary>Vote : la médiane des passes de chaque bâtiment</summary>
        <p className="detailPhoto">{pluriel(batiments.length, 'bâtiment')} · ouvertures {nombre(comptes.ouvertures)}, pignons {nombre(comptes.bouts)}, lucarnes {nombre(comptes.lucarnes)}, éléments {nombre(comptes.elements)}, écarts {nombre(comptes.ecarts)}, déterminés {nombre(comptes.determines)}. Les propositions qui en découlent et leur décision sont celles de la conclusion de l’audit, pour son analyse ; un rejeu ne modifie pas l’audit.</p>
      </details>}
      <div className="actionsAuditRecu">
        <button type="button" className="secondary small" data-controle="auditsParcelle.exporterAnalyse" onClick={() => catalogue.exporterTrace()}>Exporter (JSON)</button>
        <button type="button" className="secondary small" data-controle="auditsParcelle.fermerAnalyse" onClick={() => catalogue.fermerTrace()}>Fermer l’analyse</button>
      </div>
    </div>
  );
}

export function DetailAudit({ catalogue, a }: { catalogue: CatalogueAudits; a: FicheAudit }) {
  const e = catalogue.etat();
  const d = e.detail;
  if (!d || d.id !== a.id) return null;
  const lignes = d.analyses ? lignesBenchmark(d.analyses) : [];
  const raisonRejeu = catalogue.raisonRejouer(a);
  const raisonOuvrir = catalogue.raisonOuvrir(a);
  return (
    <div className="detailAuditRecu">
      {d.erreur && <div className="erreurParcours" role="alert">{d.erreur}</div>}
      {!d.donnees && !d.erreur && <p className="detailPhoto" role="status">Lecture de l’audit sur le serveur…</p>}
      {d.donnees && <>
        <details className="sectionDetailAudit"><summary>Données</summary><Donnees d={d.donnees} /></details>
        <details className="sectionDetailAudit" open><summary>Conclusion et décisions</summary><Conclusion d={d.donnees} /></details>
      </>}
      {a.nature === 'parcelle' && catalogue.rejeuDisponible() && (
        <details className="sectionDetailAudit" open>
          <summary>Analyses par Claude et rejeux</summary>
          {d.analyses === null ? <p className="detailPhoto" role="status">Lecture des analyses…</p>
            : lignes.length ? <Comparaison catalogue={catalogue} a={a} lignes={lignes} />
            : <p className="detailPhoto">Aucune analyse gardée pour cet audit : rejouez-la pour en garder une.</p>}
          <div className="actionsAuditRecu" role="group" aria-label="Rejouer l’analyse">
            <label className="choixModeleRejeu">Modèle
              <select data-controle="auditsParcelle.modeleRejeu" value={e.modele ?? ''} onChange={(ev) => catalogue.choisirModele(ev.currentTarget.value)} disabled={!e.modeles.length}>
                {e.modeles.map((m) => <option key={m} value={m}>{nomModele(m)}</option>)}
              </select>
            </label>
            <label className="choixModeleRejeu" title={e.brouillon ? 'Prompt version ' + e.brouillon.prompt + ', enregistré dans Admin › Règles' : 'Aucun brouillon enregistré sur le serveur (Admin › Règles)'}>
              <input type="checkbox" data-controle="auditsParcelle.essaiRejeu" checked={e.essai} disabled={!e.brouillon} onChange={(ev) => catalogue.choisirEssai(ev.currentTarget.checked)} />
              {' '}Avec le brouillon des règles{e.brouillon ? ' (v' + e.brouillon.prompt + ')' : ''}
            </label>
            <button type="button" className="small" data-controle="auditsParcelle.rejouer" disabled={raisonRejeu !== null || e.enCours !== null} title={raisonRejeu ?? undefined}
              onClick={() => { void catalogue.rejouer(a); }}>Rejouer l’analyse</button>
            <button type="button" className="secondary small" data-controle="auditsParcelle.remesurer" disabled={raisonOuvrir !== null || e.enCours !== null} title={raisonOuvrir ?? 'Remet les photos de l’audit à l’analyse des façades : mesures, silhouettes, relevé des façades du projet'}
              onClick={() => { void catalogue.remesurer(a); }}>Relancer l’analyse des photos</button>
            <button type="button" className="secondary small" data-controle="auditsParcelle.relireAnalyses" onClick={() => { void catalogue.relireAnalyses(); }}>Relire les analyses</button>
            <button type="button" className="secondary small" data-controle="auditsParcelle.exporterAnalyses" disabled={!lignes.length} onClick={() => catalogue.exporterAnalyses(a)}>Exporter en CSV</button>
          </div>
          {raisonRejeu && <p className="raisonAuditRecu">{raisonRejeu}</p>}
          {e.trace?.audit === a.id && (e.trace.complete ? <Trace catalogue={catalogue} complete={e.trace.complete} autres={lignes.filter((l) => l.id !== e.trace?.id && l.etat === 'termine').map((l) => ({ id: l.id, libelle: (l.nature === 'rejeu' ? 'Rejeu' : 'Analyse') + ' du ' + l.creeLe.slice(0, 16).replace('T', ' ') + ' · ' + nomModele(l.modele) + ' · ' + (l.essai ? 'brouillon ' : 'prompt ') + l.prompt }))} />
            : <p className={e.trace.erreur ? 'erreurParcours' : 'detailPhoto'} role="status">{e.trace.erreur ?? 'Lecture de l’analyse…'}</p>)}
        </details>
      )}
    </div>
  );
}

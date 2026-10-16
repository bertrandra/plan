// Les fichiers de donnees du moteur dans Admin › Regles : les reglages des toits et des facades (un seuil, sa valeur,
// sa raison) et les faits des toits. Meme principe que les sujets : on edite, l'ecran controle avec le lecteur
// du code, dit ce qui change et ce que le changement declenche, et le fichier se telecharge pour entrer dans le depot
// par une PR. Une valeur changee dans un seuil ne reformate pas le fichier : le diff montre sa ligne, pas tout.

import { useEffect, useMemo, useState } from 'react';
import { FICHIERS_DONNEES, type FichierDonnees, type IdDonnees } from '../../regles/donnees/fichiers.js';
import { bilanDonnees, changerSeuil, lireDonnees, seuilsDuTexte } from '../../regles/donnees/edition.js';
import type { BrouillonRegles } from '../EcranRegles.js';

type Textes = Record<IdDonnees, string>;

export interface PropsDonnees {
  /** Les fichiers edites ; par defaut tous ceux du moteur. */
  fichiers?: readonly FichierDonnees[];
  /** La derniere ligne des versions de lecture : `toits` (LECTURES_TOITS) et `facades` (LECTURES_FACADES). */
  versions: { toits: number; facades: number };
  brouillon?: BrouillonRegles | undefined;
  telecharger: (nom: string, contenu: string, type: string) => void;
}

const pluriel = (n: number, mot: string) => n + ' ' + mot + (n > 1 ? 's' : '');
const nomFichier = (chemin: string) => chemin.split('/').slice(-1)[0] as string;

/** Les textes d'un brouillon relu : seulement ceux d'un fichier connu ; le reste revient au livre. */
function lireTextes(texte: string | null, fichiers: readonly FichierDonnees[]): Textes {
  const neuf = Object.fromEntries(fichiers.map((f) => [f.id, f.livre])) as Textes;
  if (!texte) return neuf;
  try {
    const d = JSON.parse(texte) as Record<string, unknown>;
    for (const f of fichiers) if (typeof d[f.id] === 'string') neuf[f.id] = d[f.id] as string;
  } catch { /* brouillon abime : on repart du livre */ }
  return neuf;
}

function Seuils({ f, texte, surTexte, cle }: { f: FichierDonnees; texte: string; surTexte: (t: string) => void; cle: number }) {
  const [filtre, setFiltre] = useState('');
  const [avertissement, setAvertissement] = useState<string | null>(null);
  const livres = useMemo(() => new Map(seuilsDuTexte(f.livre).map((s) => [s.nom, s])), [f]);
  const seuils = seuilsDuTexte(texte).filter((s) => !filtre.trim() || (s.nom + ' ' + s.pourquoi + ' ' + s.ou).toLowerCase().includes(filtre.trim().toLowerCase()));
  const changer = (nom: string, champ: 'valeur' | 'pourquoi', v: number | string) => {
    const neuf = changerSeuil(texte, nom, champ, v);
    if (neuf === null) { setAvertissement('« ' + nom + ' » ne tient pas sur une ligne du fichier : modifiez-le dans le texte du fichier, plus bas.'); return; }
    setAvertissement(null);
    surTexte(neuf);
  };
  return (
    <div className="reglSeuils">
      <label className="reglChamp">
        <span className="reglChampNom">Chercher un seuil (nom, raison, module)</span>
        <input type="search" value={filtre} onChange={(e) => setFiltre(e.target.value)} />
      </label>
      {avertissement && <p className="reglErreur" role="alert">{avertissement}</p>}
      <div className="defileAudit">
        <table className="attrTable tableAudit" aria-label={'Seuils : ' + f.libelle}>
          <thead><tr><th>Seuil</th><th>Valeur</th><th>Unité</th><th>Pourquoi</th></tr></thead>
          <tbody>{seuils.map((s) => {
            const l = livres.get(s.nom);
            const modifie = l !== undefined && (l.valeur !== s.valeur || l.pourquoi !== s.pourquoi);
            return (
              <tr key={s.nom + ':' + cle} data-seuil={s.nom} data-modifie={modifie ? 'oui' : undefined}>
                <td><code>{s.nom}</code>{modifie && <span className="reglBadge reglModifie"> Modifié</span>}<div className="detailPhoto">{s.ou}</div></td>
                <td><input type="number" step="any" defaultValue={s.valeur} aria-label={'Valeur de ' + s.nom} className="reglValeur"
                  onChange={(e) => { const v = e.target.value.trim() === '' ? NaN : Number(e.target.value); if (Number.isFinite(v)) changer(s.nom, 'valeur', v); }} /></td>
                <td>{s.unite}</td>
                <td><textarea className="reglTexte" rows={2} defaultValue={s.pourquoi} aria-label={'Pourquoi ' + s.nom} onChange={(e) => changer(s.nom, 'pourquoi', e.target.value)} />
                  {s.cas.length > 0 && <div className="detailPhoto">Cas : {s.cas.join(', ')}</div>}</td>
              </tr>
            );
          })}</tbody>
        </table>
      </div>
    </div>
  );
}

/** Les faits d'un fichier de faits, lus pour la liste (la cle, l'adresse, l'application) ; rien si le texte n'est pas du JSON. */
function ListeFaits({ texte }: { texte: string }) {
  const l = lireDonnees(texte);
  const faits = (l.json as { faits?: Record<string, { adresse?: unknown; application?: unknown }> } | null)?.faits;
  if (!faits || typeof faits !== 'object') return null;
  const cles = Object.keys(faits);
  return (
    <ul className="listeDetailAudit" aria-label="Faits du fichier">
      {cles.map((k) => <li key={k}><code>{k}</code> · {String(faits[k]?.application ?? 'contrainte')}{faits[k]?.adresse ? ' · ' + String(faits[k]?.adresse) : ''}</li>)}
      {!cles.length && <li>Aucun fait.</li>}
    </ul>
  );
}

/** `remonter` : le texte change ailleurs que dans le champ d'un seuil, qui doit alors se relire. */
function Fichier({ f, texte, surTexte, telecharger, cle }: { f: FichierDonnees; texte: string; surTexte: (t: string, remonter: boolean) => void; telecharger: PropsDonnees['telecharger']; cle: number }) {
  const bilan = useMemo(() => bilanDonnees(f, texte), [f, texte]);
  const changees = bilan.diff.filter((l) => l.type !== '=');
  return (
    <section className="reglSujet" data-fichier={f.id} aria-label={f.libelle}>
      <div className="reglSujetEntete">
        <strong>{f.libelle}</strong> <code>{f.chemin}</code>
        <span className="reglBadges">
          {bilan.lignes > 0 && <span className="reglBadge reglModifie">{pluriel(bilan.lignes, 'ligne')} {bilan.lignes > 1 ? 'changent' : 'change'}</span>}
          {!bilan.controle.valide && <span className="reglBadge reglModifie">Refusé</span>}
        </span>
      </div>
      {bilan.controle.erreur && <p className="reglErreur" role="alert">Le moteur refuserait ce fichier : {bilan.controle.erreur}</p>}
      {bilan.controle.valide && <p className="consNote" role="status">Le moteur l’accepte.{bilan.empreinteChange ? ' L’empreinte passe de ' + bilan.empreinteLivree + ' à ' + bilan.controle.empreinte + ' : ' + f.consequence.effet + '. Ajoutez la ligne de version dans ' + f.consequence.ou + '.' : bilan.lignes > 0 ? ' L’empreinte ne change pas (les raisons, les cas et l’historique n’entrent pas dans un calcul) : aucun toit n’est relu.' : ''}</p>}
      {f.seuils ? <Seuils f={f} texte={texte} surTexte={(t) => surTexte(t, false)} cle={cle} /> : <ListeFaits texte={texte} />}
      <details>
        <summary>Texte du fichier</summary>
        <textarea className="reglTexte reglMono" spellCheck={false} rows={18} value={texte} aria-label={'Texte de ' + f.chemin} aria-invalid={!bilan.controle.valide} onChange={(e) => surTexte(e.target.value, true)} />
      </details>
      {changees.length > 0 && <details>
        <summary>Écarts avec le livré ({changees.length})</summary>
        <pre className="reglSortie" tabIndex={0} aria-label={'Écarts de ' + f.chemin}>
          {changees.map((l, i) => <span key={i} className={'reglLigne ' + (l.type === '+' ? 'reglAjout' : 'reglRetrait')} data-diff={l.type === '+' ? 'ajoute' : 'retire'}>
            <span className="reglSigne" aria-hidden="true">{l.type === '+' ? '+' : '−'}</span>{l.texte + '\n'}</span>)}
        </pre>
      </details>}
      <div className="reglActionsSujet">
        <button type="button" className="secondary small" disabled={!bilan.controle.valide || bilan.lignes === 0} title={bilan.controle.erreur ?? 'À poser à ' + f.chemin + ' dans le dépôt'}
          onClick={() => telecharger(nomFichier(f.chemin), texte.endsWith('\n') ? texte : texte + '\n', 'application/json')}>Télécharger {nomFichier(f.chemin)}</button>
        <button type="button" className="secondary small" disabled={bilan.lignes === 0} onClick={() => surTexte(f.livre, true)}>Revenir au livré</button>
      </div>
    </section>
  );
}

export function Donnees({ fichiers = FICHIERS_DONNEES, versions, brouillon, telecharger }: PropsDonnees) {
  const [textes, setTextes] = useState<Textes>(() => lireTextes(brouillon?.lire() ?? null, fichiers));
  // Remonte les champs de seuils non controles quand un texte change d'ailleurs (retour au livre, texte du fichier).
  const [cles, setCles] = useState<Record<string, number>>({});
  const modifies = fichiers.filter((f) => textes[f.id] !== f.livre);
  useEffect(() => {
    try {
      if (!modifies.length) brouillon?.effacer();
      else brouillon?.ecrire(JSON.stringify(Object.fromEntries(modifies.map((f) => [f.id, textes[f.id]]))));
    } catch { /* sans stockage : l'edition reste a l'ecran */ }
  }, [textes, modifies.length, brouillon]);

  const poser = (f: FichierDonnees, t: string, remonter: boolean) => {
    setTextes((x) => ({ ...x, [f.id]: t }));
    if (remonter) setCles((c) => ({ ...c, [f.id]: (c[f.id] ?? 0) + 1 }));
  };
  // La ligne que les versions de lecture des toits demandent quand les reglages OU les faits changent : une seule ligne pour les deux.
  const rt = fichiers.find((f) => f.id === 'reglagesToits'), ft = fichiers.find((f) => f.id === 'faitsToits');
  const bt = rt ? bilanDonnees(rt, textes[rt.id]) : null, bf = ft ? bilanDonnees(ft, textes[ft.id]) : null;
  const toitsChangent = !!((bt?.empreinteChange && bt.controle.valide) || (bf?.empreinteChange && bf.controle.valide));
  const ligneToits = toitsChangent
    ? `{ version: ${versions.toits + 1}, reglages: '${bt?.controle.empreinte ?? bt?.empreinteLivree}', faits: '${bf?.controle.empreinte ?? bf?.empreinteLivree}' },`
    : null;
  const rf = fichiers.find((f) => f.id === 'reglagesFacades');
  const bff = rf ? bilanDonnees(rf, textes[rf.id]) : null;
  const ligneFacades = bff?.empreinteChange && bff.controle.valide ? `{ version: ${versions.facades + 1}, reglages: '${bff.controle.empreinte}' },` : null;

  return (
    <div className="reglDonnees">
      <p className="consNote">
        Les trois fichiers que le moteur lit : une valeur ne change pas le fichier d’un octet de plus que sa ligne. Un fichier que le moteur refuserait ne se télécharge pas.
        Une empreinte qui change demande une ligne de version, sinon les toits déjà lus ne seraient pas relus.
      </p>
      {(ligneToits || ligneFacades) && <div className="reglControles" role="status" aria-label="Lignes de version à ajouter">
        {ligneToits && <p className="consNote">À ajouter à <code>LECTURES_TOITS</code> (<code>src/app/toitsLidar.ts</code>) : <code>{ligneToits}</code></p>}
        {ligneFacades && <p className="consNote">À ajouter à <code>LECTURES_FACADES</code> (<code>src/regles/facades/reglages.ts</code>) : <code>{ligneFacades}</code></p>}
      </div>}
      <div className="reglListe">
        {fichiers.map((f) => <Fichier key={f.id} f={f} texte={textes[f.id]} cle={cles[f.id] ?? 0} telecharger={telecharger}
          surTexte={(t, remonter) => poser(f, t, remonter)} />)}
      </div>
    </div>
  );
}

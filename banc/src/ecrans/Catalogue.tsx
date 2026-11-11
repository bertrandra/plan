// Etape 5 : le catalogue des photos, pour retrouver une image et en modifier le marquage. Filtres par etat, source, bloc, classe
// presente, drapeau « verifiee » ; un clic ouvre l'editeur (etape 4), qui passe d'une photo a l'autre dans l'ordre du catalogue.

import { useMemo, useState } from 'react';
import type { Banc } from '../App.js';
import { api } from '../api.js';
import type { MetaImage } from '../types.js';

const PAR_PAGE = 60;
const MARQUABLES = new Set(['validee', 'brouillon', 'corrigee']);

export function EcranCatalogue({ banc }: { banc: Banc }) {
  const [statut, setStatut] = useState('marquables');
  const [source, setSource] = useState('');
  const [bloc, setBloc] = useState('*');
  const [classe, setClasse] = useState('');
  const [verif, setVerif] = useState('');
  const [texte, setTexte] = useState('');
  const [page, setPage] = useState(0);
  const liste = useMemo(() => banc.images.filter((m: MetaImage) =>
    (statut === 'marquables' ? MARQUABLES.has(m.statut) : statut === '' || m.statut === statut)
    && (!source || m.source === source)
    && (bloc === '*' || (m.bloc ?? '') === bloc)
    && (!classe || (m.classes ?? []).includes(classe))
    && (!verif || (verif === 'oui' ? m.verifiee : verif === 'echantillon' ? m.echantillon && !m.verifiee : !m.verifiee))
    && (!texte || [m.nom, m.adresse, m.id, m.lot, m.note].some((x) => x?.toLowerCase().includes(texte.toLowerCase())))), [banc.images, statut, source, bloc, classe, verif, texte]);
  const pages = Math.max(1, Math.ceil(liste.length / PAR_PAGE));
  const vue = liste.slice(page * PAR_PAGE, (page + 1) * PAR_PAGE);
  const couleur = (id: string) => banc.classes.find((c) => c.id === id)?.couleur ?? '#999';
  const nomClasse = (id: string) => banc.classes.find((c) => c.id === id)?.nom ?? id;
  return (
    <section className="panneau">
      <h2>4-5 · Catalogue et marquage</h2>
      <div className="filtres">
        <select value={statut} onChange={(e) => { setStatut(e.target.value); setPage(0); }} aria-label="État">
          <option value="marquables">À marquer ou marquées</option><option value="">Toutes</option>
          <option value="validee">Validées, sans marquage</option><option value="brouillon">Brouillon à relire</option><option value="corrigee">Corrigées</option>
          <option value="importee">Importées</option><option value="redressee">Redressées</option><option value="rejetee">Rejetées</option>
        </select>
        <select value={source} onChange={(e) => { setSource(e.target.value); setPage(0); }} aria-label="Source"><option value="">Toutes sources</option><option value="iphone">iPhone</option><option value="panoramax">Panoramax</option><option value="fichier">Fichier</option></select>
        <select value={bloc} onChange={(e) => { setBloc(e.target.value); setPage(0); }} aria-label="Bloc"><option value="*">Tous blocs</option><option value="">Sans bloc</option><option value="train">train</option><option value="val">val</option><option value="test">test</option><option value="reserve">réserve</option></select>
        <select value={classe} onChange={(e) => { setClasse(e.target.value); setPage(0); }} aria-label="Classe"><option value="">Toutes classes</option>{banc.classes.map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}</select>
        <select value={verif} onChange={(e) => { setVerif(e.target.value); setPage(0); }} aria-label="Vérification"><option value="">Vérifiées ou non</option><option value="oui">Vérifiées</option><option value="non">Non vérifiées</option><option value="echantillon">Échantillon à vérifier</option></select>
        <input type="search" placeholder="Nom, adresse, lot…" value={texte} onChange={(e) => { setTexte(e.target.value); setPage(0); }} />
        <span className="etat">{liste.length} photo(s)</span>
      </div>
      <ul className="mosaique">
        {vue.map((m) => (
          <li key={m.id} className={'carte statut-' + m.statut}>
            <button type="button" className="vignette" onClick={() => banc.ouvrir(m.id, liste.map((x) => x.id))} disabled={!m.redressee}>
              <img src={api.fichier(m.id, 'vignette', m.redressement?.le ?? '')} alt={m.nom ?? m.id} loading="lazy" />
            </button>
            <span>{m.nom ?? m.id}</span>
            <span className="puces">
              <em className={'puce statut'}>{m.statut}</em>
              {m.verifiee && <em className="puce ok">vérifiée</em>}
              {m.echantillon && !m.verifiee && <em className="puce attention">échantillon</em>}
              {m.bloc && <em className="puce">{m.bloc}</em>}
              {(m.classes ?? []).map((c) => <em key={c} className="puce" style={{ borderColor: couleur(c) }}>{nomClasse(c)}</em>)}
            </span>
          </li>
        ))}
      </ul>
      {pages > 1 && <div className="rang"><button type="button" disabled={!page} onClick={() => setPage(page - 1)}>← Précédentes</button><span>{page + 1} / {pages}</span><button type="button" disabled={page >= pages - 1} onClick={() => setPage(page + 1)}>Suivantes →</button></div>}
    </section>
  );
}

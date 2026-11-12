// Etapes 4-5 : le catalogue des photos, pour retrouver une image et en modifier le marquage. Filtres par etat, source, bloc, classe
// presente, drapeau « verifiee » ; un clic ouvre l'editeur (etape 4), qui passe d'une photo a l'autre dans l'ordre du catalogue.
// « Relire les brouillons » enchaine directement les photos qui attendent.

import { useEffect, useRef } from 'react';
import type { Banc } from '../../App.js';
import { api } from '../../api.js';
import { etatDeLaPhoto } from '../../catalogue.js';
import type { MetaImage } from '../../types.js';
import { Icone } from '../../ui/Icones.js';
import { Page, Segments, Vide } from '../../ui/Page.js';
import { useCatalogue } from './useCatalogue.js';

const ETATS = [
  { valeur: 'marquables', libelle: 'À marquer ou marquées' }, { valeur: 'validee', libelle: 'À marquer' }, { valeur: 'brouillon', libelle: 'À relire' },
  { valeur: 'corrigee', libelle: 'Corrigées' }, { valeur: '', libelle: 'Toutes' },
] as const;

export function EcranCatalogue({ banc }: { banc: Banc }) {
  const c = useCatalogue(banc);
  const recherche = useRef<HTMLInputElement>(null);
  // « / » cherche, comme ailleurs sur le web.
  useEffect(() => {
    const t = (e: KeyboardEvent) => { if (e.key === '/' && !(e.target as HTMLElement).closest('input, select, textarea')) { e.preventDefault(); recherche.current?.focus(); } };
    window.addEventListener('keydown', t);
    return () => window.removeEventListener('keydown', t);
  }, []);
  const etatConnu = ETATS.some((e) => e.valeur === c.filtre.statut);
  const couleur = (id: string) => banc.classes.find((k) => k.id === id)?.couleur ?? '#999';
  const nomClasse = (id: string) => banc.classes.find((k) => k.id === id)?.nom ?? id;
  return (
    <Page icone="marquage" numero="4-5" titre="Marquage" large
      aide={<p>Toutes les photos à marquer ou déjà marquées. Un clic ouvre l’éditeur, qui passe d’une photo à l’autre dans l’ordre de la liste. « Relire les brouillons » enchaîne les photos marquées par l’étape 3, à relire et valider (<kbd>Entrée</kbd> dans l’éditeur). <kbd>/</kbd> cherche.</p>}
      actions={<>
        {c.aMarquer.length > 0 && <button type="button" onClick={() => c.enchainer(c.aMarquer)}><Icone nom="marquage" /> Marquer les {c.aMarquer.length} sans marquage</button>}
        {c.aRelire.length > 0 && <button type="button" className="principal" onClick={() => c.enchainer(c.aRelire)}><Icone nom="suivant" /> Relire les {c.aRelire.length} brouillon(s)</button>}
      </>}>
      <div className="barre-outils filtres-catalogue">
        <label className="recherche"><Icone nom="zoom" taille={16} /><input ref={recherche} type="search" placeholder="Nom, adresse, lot…   /" value={c.filtre.texte} onChange={(e) => c.poser('texte', e.target.value)} aria-label="Chercher" /></label>
        <Segments label="État" valeur={etatConnu ? c.filtre.statut : ''} options={ETATS.map((e) => ({ ...e }))} onChange={(v) => c.poser('statut', v)} />
        <select value={c.filtre.source} onChange={(e) => c.poser('source', e.target.value)} aria-label="Source"><option value="">Toutes sources</option><option value="iphone">iPhone</option><option value="panoramax">Panoramax</option><option value="fichier">Fichier</option></select>
        <select value={c.filtre.bloc} onChange={(e) => c.poser('bloc', e.target.value)} aria-label="Bloc"><option value="*">Tous blocs</option><option value="">Sans bloc</option><option value="train">train</option><option value="val">val</option><option value="test">test</option><option value="reserve">réserve</option></select>
        <select value={c.filtre.classe} onChange={(e) => c.poser('classe', e.target.value)} aria-label="Classe"><option value="">Toutes classes</option>{banc.classes.map((k) => <option key={k.id} value={k.id}>{k.nom}</option>)}</select>
        <select value={c.filtre.verif} onChange={(e) => c.poser('verif', e.target.value)} aria-label="Vérification"><option value="">Vérifiées ou non</option><option value="oui">Vérifiées</option><option value="non">Non vérifiées</option><option value="echantillon">Échantillon à vérifier</option></select>
        {c.actifs > 0 && <button type="button" className="discret" onClick={c.effacer}><Icone nom="fermer" /> Effacer les filtres</button>}
        <span className="espace" /><span className="etat">{c.liste.length} photo(s)</span>
      </div>
      {c.vue.length ? (
        <ul className="grille-photos">
          {c.vue.map((m) => <Carte key={m.id} m={m} couleur={couleur} nomClasse={nomClasse} onOuvrir={() => banc.ouvrir(m.id, c.liste.map((x) => x.id))} />)}
        </ul>
      ) : c.actifs ? (
        <Vide icone="marquage" titre="Aucune photo ne répond à ces filtres" action={<button type="button" onClick={c.effacer}>Effacer les filtres</button>} />
      ) : (
        <Vide icone="marquage" titre="Rien à marquer pour l’instant" texte="Les photos validées dans la mosaïque arrivent ici ; le brouillon (étape 3) peut les pré-marquer."
          action={<button type="button" className="principal" onClick={() => banc.aller('validation')}>Aller à la mosaïque</button>} />
      )}
      {c.pages > 1 && <nav className="pagination" aria-label="Pages"><button type="button" disabled={!c.page} onClick={() => c.setPage(c.page - 1)}><Icone nom="precedent" /> Précédentes</button><span>{c.page + 1} / {c.pages}</span><button type="button" disabled={c.page >= c.pages - 1} onClick={() => c.setPage(c.page + 1)}>Suivantes <Icone nom="suivant" /></button></nav>}
    </Page>
  );
}

function Carte({ m, couleur, nomClasse, onOuvrir }: { m: MetaImage; couleur: (id: string) => string; nomClasse: (id: string) => string; onOuvrir: () => void }) {
  const e = etatDeLaPhoto(m);
  const classes = m.classes ?? [];
  return (
    <li className={'tuile-photo statut-' + m.statut}>
      <button type="button" className="vignette-bouton" onClick={onOuvrir} disabled={!m.redressee} aria-label={`Ouvrir ${m.nom ?? m.id}`}>
        <img src={api.fichier(m.id, 'vignette', m.redressement?.le ?? '')} alt="" loading="lazy" />
      </button>
      <span className={'etiquette-photo ' + e.ton}>{e.libelle}</span>
      {m.bloc && <span className="bloc-photo">{m.bloc === 'reserve' ? 'réserve' : m.bloc}</span>}
      <div className="legende-photo">
        <span className="nom">{m.nom ?? m.id}</span>
        <span className="pastilles-classes" title={classes.map(nomClasse).join(', ')}>
          {classes.slice(0, 8).map((k) => <i key={k} style={{ background: couleur(k) }} />)}
          <small>{classes.length ? `${classes.length} classe(s)` : m.statut === 'validee' ? 'sans marquage' : m.source}</small>
        </span>
      </div>
    </li>
  );
}

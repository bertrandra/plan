// L'ecran des controleurs de l'admin (`?admin&ecran=controleurs`, MD/spec-demos-admin.md).
//
// Un ecran a part, sur toute la page : l'arbre de ce par quoi l'ecran de Plan agit — zones et
// emplacements, registre des commandes, champs de l'inspecteur —, decouvert dans Plan en marche
// (app/controleurs.ts) et compare au registre enregistre sur le serveur. Il ne fait rien sur le plan :
// il montre, compare et enregistre.
//
// L'arbre suit le motif ARIA « tree » : une seule ligne dans l'ordre de tabulation, les fleches
// pour circuler (haut, bas ; droite ouvre ou descend ; gauche ferme ou remonte), Debut et Fin.

import { useMemo, useRef, useState } from 'react';
import { aplatir, comparer, compterFeuilles, type Comparaison, type Noeud, type RegistreControleurs, type Statut } from '../app/controleurs.js';

export interface PropsEcranControleurs {
  decouvert: Noeud;
  decouvertLe: string;
  appVersion: string;
  enregistre: RegistreControleurs | null;
  /** Rend le message d'echec, ou `null` une fois enregistre. */
  enregistrer: (registre: RegistreControleurs) => Promise<string | null>;
  /** Recharge la page : la decouverte relit Plan tel qu'il est maintenant deploye. */
  redecouvrir: () => void;
}

const GENRES: Record<Noeud['genre'], string> = {
  racine: 'racine', branche: 'branche', zone: 'zone', emplacement: 'emplacement', groupe: 'groupe',
  commande: 'commande', famille: 'objet', section: 'section', champ: 'champ'
};
const STATUTS: Record<Exclude<Statut, 'inchange'>, string> = { nouveau: 'Nouveau', retire: 'Retiré', modifie: 'Modifié' };

const date = (iso: string) => new Date(iso).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' });

interface Ligne { chemin: string; noeud: Noeud; niveau: number; parent: string | null; ouvrable: boolean }

export function EcranControleurs({ decouvert, decouvertLe, appVersion, enregistre, enregistrer, redecouvrir }: PropsEcranControleurs) {
  const [registre, setRegistre] = useState(enregistre);
  const cmp = useMemo(() => comparer(registre ? registre.arbre : null, decouvert), [registre, decouvert]);
  const tous = useMemo(() => aplatir(cmp.arbre), [cmp]);
  const [ouverts, setOuverts] = useState<Set<string>>(() => new Set(['plan', 'plan/zones', 'plan/commandes', 'plan/inspecteur']));
  const [choisi, setChoisi] = useState('plan');
  const [filtre, setFiltre] = useState('');
  const [changementsSeuls, setChangementsSeuls] = useState(false);
  const [message, setMessage] = useState<{ texte: string; erreur: boolean } | null>(null);
  const [enCours, setEnCours] = useState(false);
  const arbreRef = useRef<HTMLUListElement>(null);

  // Ce qui reste visible apres le filtre : un noeud qui correspond, et ses ancetres.
  const garde = useMemo(() => {
    const f = filtre.trim().toLowerCase();
    if (!f && !changementsSeuls) return null;
    const g = new Set<string>();
    for (const [chemin, n] of tous) {
      const st = cmp.statuts.get(chemin) ?? 'inchange';
      const texte = !f || n.cle.toLowerCase().includes(f) || n.nom.toLowerCase().includes(f);
      const change = !changementsSeuls || st !== 'inchange';
      if (texte && change) {
        const morceaux = chemin.split('/');
        for (let i = 1; i <= morceaux.length; i++) g.add(morceaux.slice(0, i).join('/'));
      }
    }
    return g;
  }, [filtre, changementsSeuls, tous, cmp]);

  // Les lignes visibles, dans l'ordre : c'est sur elles que les fleches circulent.
  const lignes = useMemo(() => {
    const l: Ligne[] = [];
    const parcourir = (n: Noeud, chemin: string, niveau: number, parent: string | null) => {
      if (garde && !garde.has(chemin)) return;
      const enfants = (n.enfants ?? []).filter((e) => !garde || garde.has(chemin + '/' + e.cle));
      l.push({ chemin, noeud: n, niveau, parent, ouvrable: enfants.length > 0 });
      if (enfants.length && (ouverts.has(chemin) || garde)) for (const e of enfants) parcourir(e, chemin + '/' + e.cle, niveau + 1, chemin);
    };
    parcourir(cmp.arbre, cmp.arbre.cle, 1, null);
    return l;
  }, [cmp, ouverts, garde]);

  const basculer = (chemin: string, ouvrir?: boolean) => setOuverts((o) => {
    const n = new Set(o);
    if (ouvrir ?? !n.has(chemin)) n.add(chemin); else n.delete(chemin);
    return n;
  });

  const aller = (chemin: string) => {
    setChoisi(chemin);
    requestAnimationFrame(() => arbreRef.current?.querySelector<HTMLElement>('[data-chemin="' + CSS.escape(chemin) + '"]')?.focus());
  };

  function clavier(e: React.KeyboardEvent): void {
    const i = lignes.findIndex((l) => l.chemin === choisi);
    const l = lignes[i];
    if (!l) return;
    const ouvert = ouverts.has(l.chemin) || !!garde;
    let fait = true;
    const suivante = lignes[i + 1], precedente = lignes[i - 1], premiere = lignes[0], derniere = lignes[lignes.length - 1];
    switch (e.key) {
      case 'ArrowDown': if (suivante) aller(suivante.chemin); break;
      case 'ArrowUp': if (precedente) aller(precedente.chemin); break;
      case 'ArrowRight':
        if (l.ouvrable && !ouvert) basculer(l.chemin, true);
        else if (l.ouvrable && suivante) aller(suivante.chemin);
        break;
      case 'ArrowLeft':
        if (l.ouvrable && ouvert && !garde) basculer(l.chemin, false);
        else if (l.parent) aller(l.parent);
        break;
      case 'Home': if (premiere) aller(premiere.chemin); break;
      case 'End': if (derniere) aller(derniere.chemin); break;
      case 'Enter': case ' ': if (l.ouvrable) basculer(l.chemin); break;
      default: fait = false;
    }
    if (fait) e.preventDefault();
  }

  async function enregistrerDecouverte(): Promise<void> {
    setEnCours(true);
    setMessage(null);
    const doc: RegistreControleurs = { format: 'plan-controleurs', version: 1, appVersion, decouvertLe, arbre: decouvert };
    const refus = await enregistrer(doc);
    setEnCours(false);
    if (refus) { setMessage({ texte: refus, erreur: true }); return; }
    setRegistre(doc);
    setMessage({ texte: compterFeuilles(decouvert) + ' contrôleurs enregistrés.', erreur: false });
  }

  const tout = () => setOuverts(new Set([...tous].filter(([, n]) => n.enfants && n.enfants.length).map(([k]) => k)));
  const noeudChoisi = tous.get(choisi) ?? null;
  const statutChoisi = registre ? cmp.statuts.get(choisi) : undefined;

  return (
    <div className="ctlEcran">
      <Entete decouvert={decouvert} decouvertLe={decouvertLe} appVersion={appVersion} registre={registre} cmp={cmp}
        enCours={enCours} enregistrer={() => { void enregistrerDecouverte(); }} redecouvrir={redecouvrir} />
      {message && <p className={message.erreur ? 'ctlMessage ctlMessage--erreur' : 'ctlMessage'} role={message.erreur ? 'alert' : 'status'}>{message.texte}</p>}

      <div className="ctlOutils">
        <input type="search" className="ctlFiltre" placeholder="Filtrer par clé ou nom" aria-label="Filtrer par clé ou nom"
          value={filtre} onChange={(e) => setFiltre(e.target.value)} />
        <label className="ctlCase">
          <input type="checkbox" checked={changementsSeuls} onChange={(e) => setChangementsSeuls(e.target.checked)} disabled={!registre} />
          Seulement les changements
        </label>
        <button type="button" className="secondary small" onClick={tout} disabled={!!garde}>Tout déplier</button>
        <button type="button" className="secondary small" onClick={() => setOuverts(new Set(['plan']))} disabled={!!garde}>Tout replier</button>
      </div>

      <div className="ctlCorps">
        <ul className="ctlArbre" role="tree" aria-label="Arbre des contrôleurs" ref={arbreRef} onKeyDown={clavier}>
          {lignes.map((l) => {
            // Sans registre, tout est nouveau : le bilan le dit une fois, pas sur chaque ligne.
            const st = registre ? cmp.statuts.get(l.chemin) ?? 'inchange' : 'inchange';
            const ouvert = l.ouvrable && (ouverts.has(l.chemin) || !!garde);
            return (
              <li key={l.chemin} role="treeitem" aria-level={l.niveau} aria-selected={l.chemin === choisi}
                {...(l.ouvrable ? { 'aria-expanded': ouvert } : {})}
                tabIndex={l.chemin === choisi ? 0 : -1} data-chemin={l.chemin}
                className={'ctlLigne ctlLigne--' + st + (l.chemin === choisi ? ' choisie' : '')}
                style={{ paddingLeft: (l.niveau - 1) * 18 + 6 }}
                onClick={() => { setChoisi(l.chemin); if (l.ouvrable) basculer(l.chemin); }}
                onFocus={() => setChoisi(l.chemin)}>
                <span className={'ctlChevron' + (ouvert ? ' ouvert' : '')} aria-hidden="true">{l.ouvrable ? '›' : ''}</span>
                <code className="ctlCle">{l.noeud.cle}</code>
                <span className="ctlNom">{l.noeud.nom}</span>
                <span className="ctlGenre">{GENRES[l.noeud.genre]}</span>
                {l.ouvrable && <span className="ctlCompte">{l.noeud.enfants?.length ?? 0}</span>}
                {st !== 'inchange' && <span className={'ctlStatut ctlStatut--' + st}>{STATUTS[st]}</span>}
              </li>
            );
          })}
          {lignes.length === 0 && <li className="ctlVide" role="none">Aucun contrôleur ne correspond.</li>}
        </ul>

        <Detail noeud={noeudChoisi} chemin={choisi} statut={statutChoisi} />
      </div>
    </div>
  );
}

function Entete({ decouvert, decouvertLe, appVersion, registre, cmp, enCours, enregistrer, redecouvrir }: {
  decouvert: Noeud; decouvertLe: string; appVersion: string; registre: RegistreControleurs | null; cmp: Comparaison;
  enCours: boolean; enregistrer: () => void; redecouvrir: () => void;
}) {
  const changements = cmp.nouveaux + cmp.retires + cmp.modifies;
  return (
    <header className="ctlEntete">
      <div>
        <h1 className="ctlTitre">Contrôleurs de l’écran</h1>
        <p className="ctlSous">
          Découverts dans Plan {appVersion} le {date(decouvertLe)} — {compterFeuilles(decouvert)} contrôleurs.{' '}
          {registre ? 'Registre enregistré le ' + date(registre.decouvertLe) + ' (Plan ' + registre.appVersion + ').' : 'Aucun registre enregistré.'}
        </p>
        <p className="ctlBilan" aria-live="polite">
          {!registre ? 'Tout est nouveau : enregistrez cette découverte pour en faire la référence.'
            : changements === 0 ? 'Aucun changement depuis l’enregistrement.'
            : [cmp.nouveaux && cmp.nouveaux + ' nouveau(x)', cmp.retires && cmp.retires + ' retiré(s)', cmp.modifies && cmp.modifies + ' modifié(s)'].filter(Boolean).join(', ') + ' depuis l’enregistrement.'}
        </p>
      </div>
      <div className="ctlActions">
        <button type="button" onClick={enregistrer} disabled={enCours || (!!registre && changements === 0)}>
          {enCours ? 'Enregistrement…' : 'Enregistrer la découverte'}
        </button>
        <button type="button" className="secondary" onClick={redecouvrir}>Relancer la découverte</button>
        <a className="ctlLien" href="?admin">Admin des démos</a>
      </div>
    </header>
  );
}

function Detail({ noeud, chemin, statut }: { noeud: Noeud | null; chemin: string; statut: Statut | undefined }) {
  return (
    <aside className="ctlDetail" aria-label="Détail du contrôleur">
      {noeud && (
        <>
          <h2 className="ctlDetailTitre">{noeud.nom}</h2>
          <table className="attrTable ctlTable">
            <tbody>
              <tr><th scope="row">Clé</th><td><code>{noeud.cle}</code></td></tr>
              <tr><th scope="row">Chemin</th><td><code className="ctlChemin">{chemin}</code></td></tr>
              <tr><th scope="row">Genre</th><td>{GENRES[noeud.genre]}</td></tr>
              {statut && statut !== 'inchange' && <tr><th scope="row">État</th><td>{STATUTS[statut]}</td></tr>}
              {noeud.enfants && <tr><th scope="row">Contrôleurs</th><td>{compterFeuilles(noeud)}</td></tr>}
              {Object.entries(noeud.details ?? {}).map(([k, v]) => <tr key={k}><th scope="row">{k}</th><td>{v}</td></tr>)}
            </tbody>
          </table>
        </>
      )}
    </aside>
  );
}

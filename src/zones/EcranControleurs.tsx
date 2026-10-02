// L'ecran des controleurs de l'admin (`?admin&ecran=controleurs`, MD/spec-demos-admin.md).
//
// Un ecran a part, sur toute la page : l'arbre de ce par quoi l'ecran de Plan agit — zones et
// emplacements, registre des commandes, champs de l'inspecteur. A l'ouverture, il montre le registre
// enregistre sur le serveur, rien de plus. La decouverte ne se fait que sur demande, au bouton :
// Plan demarre alors, cache (app/controleurs.ts), et l'ecran compare ce qu'il trouve au registre.
// Il ne fait rien sur le plan : il montre, compare et enregistre.
//
// L'arbre suit le motif ARIA « tree » : une seule ligne dans l'ordre de tabulation, les fleches
// pour circuler (haut, bas ; droite ouvre ou descend ; gauche ferme ou remonte), Debut et Fin.

import { useMemo, useRef, useState } from 'react';
import { aplatir, comparer, compterFeuilles, type Comparaison, type Noeud, type RegistreControleurs, type Statut } from '../app/controleurs.js';

/** Ce qu'une decouverte rapporte. */
export interface Decouverte { arbre: Noeud; le: string; appVersion: string }

export interface PropsEcranControleurs {
  enregistre: RegistreControleurs | null;
  /** Lance la decouverte, sur demande seulement : demarre Plan cache la premiere fois. */
  decouvrir: () => Promise<Decouverte>;
  /** Rend le message d'echec, ou `null` une fois enregistre. */
  enregistrer: (registre: RegistreControleurs) => Promise<string | null>;
}

const GENRES: Record<Noeud['genre'], string> = {
  racine: 'racine', branche: 'branche', zone: 'zone', emplacement: 'emplacement', groupe: 'groupe',
  commande: 'commande', famille: 'objet', section: 'section', champ: 'champ'
};
const STATUTS: Record<Exclude<Statut, 'inchange'>, string> = { nouveau: 'Nouveau', retire: 'Retiré', modifie: 'Modifié' };

const date = (iso: string) => new Date(iso).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' });

/** Les chemins qui restent visibles apres le filtre : un noeud qui correspond, et ses ancetres. `null` : pas de filtre. */
function visibles(tous: Map<string, Noeud>, statuts: Map<string, Statut> | undefined, filtre: string, changementsSeuls: boolean): Set<string> | null {
  const f = filtre.trim().toLowerCase();
  if (!f && !changementsSeuls) return null;
  const g = new Set<string>();
  for (const [chemin, n] of tous) {
    const texte = !f || n.cle.toLowerCase().includes(f) || n.nom.toLowerCase().includes(f);
    const change = !changementsSeuls || (statuts?.get(chemin) ?? 'inchange') !== 'inchange';
    if (!texte || !change) continue;
    const morceaux = chemin.split('/');
    for (let i = 1; i <= morceaux.length; i++) g.add(morceaux.slice(0, i).join('/'));
  }
  return g;
}

interface Ligne { chemin: string; noeud: Noeud; niveau: number; parent: string | null; ouvrable: boolean }

export function EcranControleurs({ enregistre, decouvrir, enregistrer }: PropsEcranControleurs) {
  const [registre, setRegistre] = useState(enregistre);
  const [decouverte, setDecouverte] = useState<Decouverte | null>(null);
  const [enDecouverte, setEnDecouverte] = useState(false);
  // Avant toute decouverte : le registre seul, sans etat. Apres : la decouverte comparee au registre.
  const cmp = useMemo(() => decouverte ? comparer(registre ? registre.arbre : null, decouverte.arbre)
    : registre ? comparer(registre.arbre, registre.arbre) : null, [registre, decouverte]);
  const tous = useMemo(() => cmp ? aplatir(cmp.arbre) : new Map<string, Noeud>(), [cmp]);
  // Les etats ne se montrent que lorsqu'il y a de quoi comparer : une decouverte ET un registre.
  const compare = !!decouverte && !!registre;
  const [ouverts, setOuverts] = useState<Set<string>>(() => new Set(['plan', 'plan/zones', 'plan/commandes', 'plan/inspecteur']));
  const [choisi, setChoisi] = useState('plan');
  const [filtre, setFiltre] = useState('');
  const [changementsSeuls, setChangementsSeuls] = useState(false);
  const [message, setMessage] = useState<{ texte: string; erreur: boolean } | null>(null);
  const [enCours, setEnCours] = useState(false);
  const arbreRef = useRef<HTMLUListElement>(null);

  const garde = useMemo(() => visibles(tous, cmp?.statuts, filtre, changementsSeuls), [filtre, changementsSeuls, tous, cmp]);

  // Les lignes visibles, dans l'ordre : c'est sur elles que les fleches circulent.
  const lignes = useMemo(() => {
    const l: Ligne[] = [];
    const parcourir = (n: Noeud, chemin: string, niveau: number, parent: string | null) => {
      if (garde && !garde.has(chemin)) return;
      const enfants = (n.enfants ?? []).filter((e) => !garde || garde.has(chemin + '/' + e.cle));
      l.push({ chemin, noeud: n, niveau, parent, ouvrable: enfants.length > 0 });
      if (enfants.length && (ouverts.has(chemin) || garde)) for (const e of enfants) parcourir(e, chemin + '/' + e.cle, niveau + 1, chemin);
    };
    if (cmp) parcourir(cmp.arbre, cmp.arbre.cle, 1, null);
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

  async function lancer(): Promise<void> {
    setEnDecouverte(true);
    setMessage(null);
    try {
      setDecouverte(await decouvrir());
    } catch (e) {
      setMessage({ texte: 'Découverte impossible : ' + ((e as Error).message || String(e)), erreur: true });
    } finally {
      setEnDecouverte(false);
    }
  }

  async function enregistrerDecouverte(): Promise<void> {
    if (!decouverte) return;
    setEnCours(true);
    setMessage(null);
    const doc: RegistreControleurs = { format: 'plan-controleurs', version: 1, appVersion: decouverte.appVersion, decouvertLe: decouverte.le, arbre: decouverte.arbre };
    const refus = await enregistrer(doc);
    setEnCours(false);
    if (refus) { setMessage({ texte: refus, erreur: true }); return; }
    setRegistre(doc);
    setDecouverte(null);
    setMessage({ texte: compterFeuilles(doc.arbre) + ' contrôleurs enregistrés.', erreur: false });
  }

  const tout = () => setOuverts(new Set([...tous].filter(([, n]) => n.enfants && n.enfants.length).map(([k]) => k)));
  const noeudChoisi = tous.get(choisi) ?? null;
  const statutChoisi = compare ? cmp?.statuts.get(choisi) : undefined;

  return (
    <div className="ctlEcran">
      <Entete decouverte={decouverte} registre={registre} cmp={cmp} enCours={enCours} enDecouverte={enDecouverte}
        enregistrer={() => { void enregistrerDecouverte(); }} lancer={() => { void lancer(); }} />
      {message && <p className={message.erreur ? 'ctlMessage ctlMessage--erreur' : 'ctlMessage'} role={message.erreur ? 'alert' : 'status'}>{message.texte}</p>}

      <Outils filtre={filtre} setFiltre={setFiltre} changementsSeuls={changementsSeuls} setChangementsSeuls={setChangementsSeuls}
        compare={compare} filtreActif={!!garde} deplier={tout} replier={() => setOuverts(new Set(['plan']))} />

      <div className="ctlCorps">
        <ul className="ctlArbre" role="tree" aria-label="Arbre des contrôleurs" ref={arbreRef} onKeyDown={clavier}>
          {lignes.map((l) => {
            // Sans registre, tout est nouveau : le bilan le dit une fois, pas sur chaque ligne.
            const st = compare ? cmp?.statuts.get(l.chemin) ?? 'inchange' : 'inchange';
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
          {lignes.length === 0 && <li className="ctlVide" role="none">
            {cmp ? 'Aucun contrôleur ne correspond.' : 'Aucun registre enregistré. « Lancer la découverte » lit les contrôleurs de Plan.'}
          </li>}
        </ul>

        <Detail noeud={noeudChoisi} chemin={choisi} statut={statutChoisi} />
      </div>
    </div>
  );
}

function Entete({ decouverte, registre, cmp, enCours, enDecouverte, enregistrer, lancer }: {
  decouverte: Decouverte | null; registre: RegistreControleurs | null; cmp: Comparaison | null;
  enCours: boolean; enDecouverte: boolean; enregistrer: () => void; lancer: () => void;
}) {
  const changements = cmp ? cmp.nouveaux + cmp.retires + cmp.modifies : 0;
  const bilan = !decouverte
    ? (registre ? 'Lancez la découverte pour comparer ce registre à Plan tel qu’il est déployé.' : 'Lancez la découverte pour lire les contrôleurs de Plan.')
    : !registre ? 'Tout est nouveau : enregistrez cette découverte pour en faire la référence.'
    : changements === 0 ? 'Aucun changement depuis l’enregistrement.'
    : [cmp?.nouveaux && cmp.nouveaux + ' nouveau(x)', cmp?.retires && cmp.retires + ' retiré(s)', cmp?.modifies && cmp.modifies + ' modifié(s)'].filter(Boolean).join(', ') + ' depuis l’enregistrement.';
  return (
    <header className="ctlEntete">
      <div>
        <h1 className="ctlTitre">Contrôleurs de l’écran</h1>
        <p className="ctlSous">
          {registre ? 'Registre enregistré le ' + date(registre.decouvertLe) + ' (Plan ' + registre.appVersion + ') — ' + compterFeuilles(registre.arbre) + ' contrôleurs.' : 'Aucun registre enregistré.'}
          {decouverte && ' Découverte du ' + date(decouverte.le) + ' (Plan ' + decouverte.appVersion + ') — ' + compterFeuilles(decouverte.arbre) + ' contrôleurs.'}
        </p>
        <p className="ctlBilan" aria-live="polite">{bilan}</p>
      </div>
      <div className="ctlActions">
        <button type="button" className={decouverte ? 'secondary' : undefined} onClick={lancer} disabled={enDecouverte}>
          {enDecouverte ? 'Découverte…' : decouverte ? 'Relancer la découverte' : 'Lancer la découverte'}
        </button>
        {decouverte && (
          <button type="button" onClick={enregistrer} disabled={enCours || (!!registre && changements === 0)}>
            {enCours ? 'Enregistrement…' : 'Enregistrer la découverte'}
          </button>
        )}
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

function Outils({ filtre, setFiltre, changementsSeuls, setChangementsSeuls, compare, filtreActif, deplier, replier }: {
  filtre: string; setFiltre: (v: string) => void; changementsSeuls: boolean; setChangementsSeuls: (v: boolean) => void;
  compare: boolean; filtreActif: boolean; deplier: () => void; replier: () => void;
}) {
  return (
    <div className="ctlOutils">
      <input type="search" className="ctlFiltre" placeholder="Filtrer par clé ou nom" aria-label="Filtrer par clé ou nom"
        value={filtre} onChange={(e) => setFiltre(e.target.value)} />
      <label className="ctlCase">
        <input type="checkbox" checked={changementsSeuls} onChange={(e) => setChangementsSeuls(e.target.checked)} disabled={!compare} />
        Seulement les changements
      </label>
      <button type="button" className="secondary small" onClick={deplier} disabled={filtreActif}>Tout déplier</button>
      <button type="button" className="secondary small" onClick={replier} disabled={filtreActif}>Tout replier</button>
    </div>
  );
}

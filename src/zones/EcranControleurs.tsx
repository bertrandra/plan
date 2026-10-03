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
// S'y ajoutent les outils de navigation (zones/navigationArbre.ts) : deplier jusqu'a un niveau,
// filtrer par cle, nom, genre ou changement et sauter d'un resultat a l'autre, montrer une branche
// seule, et, dans le detail, le fil d'Ariane et les enfants du noeud choisi.

import { useMemo, useRef, useState } from 'react';
import { aplatir, comparer, compterFeuilles, type Comparaison, type GenreNoeud, type Noeud, type RegistreControleurs, type Statut } from '../app/controleurs.js';
import { ancetres, profondeur, useNavigationArbre, type NavigationArbre } from './navigationArbre.js';

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
  commande: 'commande', famille: 'objet', section: 'section', champ: 'champ', option: 'valeur', controle: 'contrôle', manque: 'absente'
};
/** Les libelles des details, tels que le panneau les montre ; une cle inconnue se montre telle quelle. */
const NOMS_DETAILS: Record<string, string> = {
  groupe: 'Groupe', raccourci: 'Raccourci', description: 'Description', capacite: 'Capacité', permission: 'Permission',
  quota: 'Quota', cible: 'Porte sur', refus: 'Sans les droits', conditionnelle: 'Conditionnelle', classes: 'Classes d’écran',
  emplacements: 'Emplacements', atteinte: 'Atteinte', type: 'Type', unite: 'Unité', min: 'Minimum', max: 'Maximum',
  pas: 'Pas', decimales: 'Décimales', modifie: 'Modifie', annulable: 'Annulable', effets: 'Effets',
  conditionnel: 'Conditionnel', activable: 'Activable', explication: 'Explication', appliquerATous: 'Appliquer à tous',
  aide: 'Aide', valeurs: 'Valeurs permises', ouverture: 'À l’ouverture', sorte: 'Sorte',
  nature: 'Nature', ouvertPar: 'Ouvert par', echantillon: 'Échantillon', horsRegistre: 'Hors registre', rattaches: 'Rattachés au registre', portee: 'Portée', consequence: 'Conséquence',
  droits: 'Droits', ecrit: 'Écrit', agit: 'Agit sur', affiche: 'Affiché dans', attendu: 'Déclaré dans', origine: 'Origine', sortes: 'Sortes d’objet', nombre: 'Nombre'
};
const STATUTS: Record<Exclude<Statut, 'inchange'>, string> = { nouveau: 'Nouveau', retire: 'Retiré', modifie: 'Modifié' };

const date = (iso: string) => new Date(iso).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' });

/** Les genres qu'on peut chercher, dans l'ordre de l'arbre. */
const GENRES_FILTRE: GenreNoeud[] = ['zone', 'emplacement', 'groupe', 'commande', 'famille', 'section', 'champ', 'option', 'controle', 'manque'];

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
  const nav = useNavigationArbre(cmp ? cmp.arbre : null, tous, compare ? cmp?.statuts : undefined);
  const [message, setMessage] = useState<{ texte: string; erreur: boolean } | null>(null);
  const [enCours, setEnCours] = useState(false);
  const arbreRef = useRef<HTMLUListElement>(null);
  const filtreRef = useRef<HTMLInputElement>(null);

  /** Choisit un noeud, le rend visible (ancetres ouverts, branche montree), et y met le focus. */
  const aller = (chemin: string) => {
    if (nav.vue !== 'plan' && chemin !== nav.vue && !chemin.startsWith(nav.vue + '/')) nav.toutMontrer();
    nav.reveler(chemin);
    nav.setChoisi(chemin);
    requestAnimationFrame(() => {
      const el = arbreRef.current?.querySelector<HTMLElement>('[data-chemin="' + CSS.escape(chemin) + '"]');
      el?.focus();
      el?.scrollIntoView({ block: 'nearest' });
    });
  };

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

  const noeudChoisi = tous.get(nav.choisi) ?? null;
  const statutChoisi = compare ? cmp?.statuts.get(nav.choisi) : undefined;

  return (
    <div className="ctlEcran">
      <Entete decouverte={decouverte} registre={registre} cmp={cmp} enCours={enCours} enDecouverte={enDecouverte}
        enregistrer={() => { void enregistrerDecouverte(); }} lancer={() => { void lancer(); }} />
      {message && <p className={message.erreur ? 'ctlMessage ctlMessage--erreur' : 'ctlMessage'} role={message.erreur ? 'alert' : 'status'}>{message.texte}</p>}

      <BarreNavigation nav={nav} compare={compare} aller={aller} filtreRef={filtreRef} />

      <div className="ctlCorps">
        <Arbre nav={nav} cmp={cmp} compare={compare} aller={aller} arbreRef={arbreRef} filtreRef={filtreRef} />
        <Detail noeud={noeudChoisi} chemin={nav.choisi} statut={statutChoisi} tous={tous} nav={nav} aller={aller} />
      </div>
    </div>
  );
}

/** Les touches de l'arbre, au-dela des fleches : niveaux, branche, recherche. */
function clavier(e: React.KeyboardEvent, nav: NavigationArbre, aller: (c: string) => void, filtreRef: React.RefObject<HTMLInputElement | null>): void {
  const { lignes, choisi } = nav;
  const i = lignes.findIndex((l) => l.chemin === choisi);
  const l = lignes[i];
  if (!l) return;
  const ouvert = nav.ouverts.has(l.chemin) || !!nav.garde;
  const suivante = lignes[i + 1], precedente = lignes[i - 1], premiere = lignes[0], derniere = lignes[lignes.length - 1];
  let fait = true;
  if (/^[1-9]$/.test(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey) { nav.niveau(Number(e.key)); e.preventDefault(); return; }
  switch (e.key) {
    case 'ArrowDown': if (suivante) aller(suivante.chemin); break;
    case 'ArrowUp': if (precedente) aller(precedente.chemin); break;
    case 'ArrowRight':
      if (l.ouvrable && !ouvert) nav.basculer(l.chemin, true);
      else if (l.ouvrable && suivante) aller(suivante.chemin);
      break;
    case 'ArrowLeft':
      if (l.ouvrable && ouvert && !nav.garde) nav.basculer(l.chemin, false);
      else if (l.parent) aller(l.parent);
      break;
    case 'Home': if (premiere) aller(premiere.chemin); break;
    case 'End': if (derniere) aller(derniere.chemin); break;
    case 'Enter': case ' ': if (l.ouvrable) nav.basculer(l.chemin); break;
    case '*': nav.deplierBranche(l.chemin); break;
    case '-': nav.replierBranche(l.chemin); break;
    case '/': filtreRef.current?.focus(); break;
    default: fait = false;
  }
  if (fait) e.preventDefault();
}

function Arbre({ nav, cmp, compare, aller, arbreRef, filtreRef }: {
  nav: NavigationArbre; cmp: Comparaison | null; compare: boolean; aller: (c: string) => void;
  arbreRef: React.RefObject<HTMLUListElement | null>; filtreRef: React.RefObject<HTMLInputElement | null>;
}) {
  const trouves = useMemo(() => new Set(nav.trouves), [nav.trouves]);
  return (
    <ul className="ctlArbre" role="tree" aria-label="Arbre des contrôleurs" ref={arbreRef} onKeyDown={(e) => clavier(e, nav, aller, filtreRef)}>
      {nav.lignes.map((l) => {
        // Sans registre, tout est nouveau : le bilan le dit une fois, pas sur chaque ligne.
        const st = compare ? cmp?.statuts.get(l.chemin) ?? 'inchange' : 'inchange';
        const ouvert = l.ouvrable && (nav.ouverts.has(l.chemin) || !!nav.garde);
        const classe = 'ctlLigne ctlLigne--' + st + (l.chemin === nav.choisi ? ' choisie' : '') + (nav.garde && trouves.has(l.chemin) ? ' trouvee' : '');
        return (
          <li key={l.chemin} role="treeitem" aria-level={l.niveau} aria-selected={l.chemin === nav.choisi}
            {...(l.ouvrable ? { 'aria-expanded': ouvert } : {})}
            tabIndex={l.chemin === nav.choisi ? 0 : -1} data-chemin={l.chemin} className={classe}
            style={{ paddingLeft: (l.niveau - 1) * 18 + 6 }}
            onClick={() => { nav.setChoisi(l.chemin); if (l.ouvrable) nav.basculer(l.chemin); }}
            onFocus={() => nav.setChoisi(l.chemin)}>
            <span className={'ctlChevron' + (ouvert ? ' ouvert' : '')} aria-hidden="true">{l.ouvrable ? '›' : ''}</span>
            <span className="ctlNiveau" title={'Niveau ' + profondeur(l.chemin)}>N{profondeur(l.chemin)}</span>
            <code className="ctlCle">{l.noeud.cle}</code>
            <span className="ctlNom">{l.noeud.nom}</span>
            <span className="ctlGenre">{GENRES[l.noeud.genre]}</span>
            {l.ouvrable && <span className="ctlCompte">{l.noeud.enfants?.length ?? 0}</span>}
            {st !== 'inchange' && <span className={'ctlStatut ctlStatut--' + st}>{STATUTS[st]}</span>}
          </li>
        );
      })}
      {nav.lignes.length === 0 && <li className="ctlVide" role="none">
        {cmp ? 'Aucun contrôleur ne correspond.' : 'Aucun registre enregistré. « Lancer la découverte » lit les contrôleurs de Plan.'}
      </li>}
    </ul>
  );
}

function BarreNavigation({ nav, compare, aller, filtreRef }: {
  nav: NavigationArbre; compare: boolean; aller: (c: string) => void; filtreRef: React.RefObject<HTMLInputElement | null>;
}) {
  const [rang, setRang] = useState(-1);
  const n = nav.trouves.length;
  // Sauter au resultat suivant (ou precedent), en boucle.
  const sauter = (pas: number) => {
    if (!n) return;
    const r = ((rang + pas) % n + n) % n;
    setRang(r);
    const cible = nav.trouves[r];
    if (cible) aller(cible);
  };
  const filtrer = (f: Parameters<NavigationArbre['filtrer']>[0]) => { setRang(-1); nav.filtrer(f); };
  const niveaux = Array.from({ length: Math.max(1, nav.niveauMax - nav.niveauMin + 1) }, (_, i) => nav.niveauMin + i);
  return (
    <div className="ctlOutils">
      <div className="ctlRecherche">
        <input ref={filtreRef} type="search" className="ctlFiltre" placeholder="Filtrer par clé ou nom ( / )" aria-label="Filtrer par clé ou nom"
          value={nav.filtres.texte} onChange={(e) => filtrer({ texte: e.target.value })}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); sauter(e.shiftKey ? -1 : 1); } }} />
        <select className="ctlSelect" aria-label="Genre" value={nav.filtres.genre} onChange={(e) => filtrer({ genre: e.target.value as GenreNoeud | '' })}>
          <option value="">Tous les genres</option>
          {GENRES_FILTRE.map((g) => <option key={g} value={g}>{GENRES[g]}</option>)}
        </select>
        {nav.garde && (
          <span className="ctlResultats" aria-live="polite">
            <span className="ctlCompteur">{n ? (rang >= 0 ? rang + 1 + ' / ' : '') + n + ' trouvé' + (n > 1 ? 's' : '') : 'aucun'}</span>
            <button type="button" className="secondary small" onClick={() => sauter(-1)} disabled={!n} aria-label="Résultat précédent" title="Résultat précédent (Maj+Entrée)">‹</button>
            <button type="button" className="secondary small" onClick={() => sauter(1)} disabled={!n} aria-label="Résultat suivant" title="Résultat suivant (Entrée)">›</button>
            <button type="button" className="secondary small" onClick={() => filtrer({ texte: '', genre: '', changementsSeuls: false })}>Effacer</button>
          </span>
        )}
        <label className="ctlCase">
          <input type="checkbox" checked={nav.filtres.changementsSeuls} onChange={(e) => filtrer({ changementsSeuls: e.target.checked })} disabled={!compare} />
          Seulement les changements
        </label>
      </div>
      <div className="ctlNiveaux" role="group" aria-label="Déplier jusqu’au niveau">
        <span className="ctlEtiquette">Niveau</span>
        {niveaux.map((k) => (
          <button key={k} type="button" className="secondary small ctlNiveauBouton" onClick={() => nav.niveau(k)} disabled={!!nav.garde}
            title={'Déplier jusqu’au niveau ' + k + ' (touche ' + k + ')'}>{k}</button>
        ))}
        <button type="button" className="secondary small" onClick={() => nav.niveau(99)} disabled={!!nav.garde} title="Tout déplier">Tout</button>
        {nav.vue !== 'plan' && (
          <span className="ctlBrancheVue">
            Branche <code>{nav.vue}</code>
            <button type="button" className="secondary small" onClick={nav.toutMontrer}>Tout montrer</button>
          </span>
        )}
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
        <a className="ecranRetour" href="?admin"><span aria-hidden="true">←</span> Retour au plan</a>
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
        <a className="ctlLien" href="?palette">Palette de l’interface</a>
      </div>
    </header>
  );
}


function Detail({ noeud, chemin, statut, tous, nav, aller }: {
  noeud: Noeud | null; chemin: string; statut: Statut | undefined; tous: Map<string, Noeud>; nav: NavigationArbre; aller: (c: string) => void;
}) {
  if (!noeud) return <aside className="ctlDetail" aria-label="Détail du contrôleur" />;
  const fil = ancetres(chemin);
  return (
    <aside className="ctlDetail" aria-label="Détail du contrôleur">
      <nav aria-label="Fil d’Ariane" className="ctlFil">
        {fil.map((c, i) => (
          <span key={c}>
            {i > 0 && <span className="ctlFilSep" aria-hidden="true">›</span>}
            {c === chemin ? <code aria-current="true">{tous.get(c)?.cle}</code>
              : <button type="button" className="ctlFilLien" onClick={() => aller(c)} title={tous.get(c)?.nom}>{tous.get(c)?.cle}</button>}
          </span>
        ))}
      </nav>
      <h2 className="ctlDetailTitre">{noeud.nom}</h2>
      {noeud.enfants && noeud.enfants.length > 0 && (
        <div className="ctlBranche" role="group" aria-label="Branche">
          <button type="button" className="secondary small" onClick={() => nav.deplierBranche(chemin)} title="Déplier toute la branche (*)">Déplier</button>
          <button type="button" className="secondary small" onClick={() => nav.replierBranche(chemin)} title="Replier toute la branche (-)">Replier</button>
          <button type="button" className="secondary small" onClick={() => nav.montrerSeule(chemin)} disabled={nav.vue === chemin}>Montrer seule</button>
        </div>
      )}
      <table className="attrTable ctlTable">
        <tbody>
          <tr><th scope="row">Clé</th><td><code>{noeud.cle}</code></td></tr>
          <tr><th scope="row">Chemin</th><td><code className="ctlChemin">{chemin}</code></td></tr>
          <tr><th scope="row">Genre</th><td>{GENRES[noeud.genre]} · niveau {fil.length}</td></tr>
          {statut && statut !== 'inchange' && <tr><th scope="row">État</th><td>{STATUTS[statut]}</td></tr>}
          {noeud.enfants && compterFeuilles(noeud) > 0 && <tr><th scope="row">Contrôleurs</th><td>{compterFeuilles(noeud)}</td></tr>}
          {Object.entries(noeud.details ?? {}).map(([k, v]) => <tr key={k}><th scope="row">{NOMS_DETAILS[k] ?? k}</th><td>{v}</td></tr>)}
        </tbody>
      </table>
      {noeud.enfants && noeud.enfants.length > 0 && (
        <>
          <h3 className="ctlSousTitre">Enfants ({noeud.enfants.length})</h3>
          <ul className="ctlEnfants">
            {noeud.enfants.map((e) => (
              <li key={e.cle}>
                <button type="button" className="ctlEnfant" onClick={() => aller(chemin + '/' + e.cle)}>
                  <code>{e.cle}</code> <span>{e.nom}</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </aside>
  );
}

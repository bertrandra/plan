// Le banc d'apprentissage des facades : une page, un mot de passe, huit etapes et l'ecran d'equilibre du jeu. Les donnees vivent sur le serveur (api.php) ;
// la page les relit a chaque changement d'etape.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, ErreurApi } from './api.js';
import { CLASSES_DEFAUT } from './classes.js';
import { REGLAGES_DEFAUT, type Classe, type MetaImage, type Modele, type Reglages } from './types.js';
import { Connexion } from './ecrans/Connexion.js';
import { EcranClasses } from './ecrans/classes/Classes.js';
import { EcranImport } from './ecrans/import/Import.js';
import { EcranRedressement } from './ecrans/redressement/Redressement.js';
import { EcranValidation } from './ecrans/mosaique/Mosaique.js';
import { EcranBrouillon } from './ecrans/brouillon/Brouillon.js';
import { EcranCatalogue } from './ecrans/catalogue/Catalogue.js';
import { EcranExport } from './ecrans/export/Export.js';
import { EcranBlocs } from './ecrans/blocs/Blocs.js';
import { EcranEquilibre } from './ecrans/equilibre/Equilibre.js';
import { Editeur } from './ecrans/editeur/Editeur.js';
import { Icone, type NomIcone } from './ui/Icones.js';
import { aFaire, type AFaire } from './etapes.js';
import type { Zone } from './lot.js';
import { FileDeSuppressions } from './suppressions.js';

export type IdEcran = 'classes' | 'import' | 'redressement' | 'validation' | 'brouillon' | 'catalogue' | 'export' | 'blocs' | 'equilibre';

/** Les etapes, leur icone, et ce qui attend chacune (etapes.ts::aFaire) : une pastille sur l'onglet dit ou le travail attend. */
const ECRANS: { id: IdEcran; numero: string; nom: string; icone: NomIcone; attend?: keyof AFaire; libelleAttente?: string }[] = [
  { id: 'classes', numero: '0', nom: 'Classes', icone: 'classes' },
  { id: 'import', numero: '1', nom: 'Import', icone: 'importer' },
  { id: 'redressement', numero: '2', nom: 'Redressement', icone: 'redresser', attend: 'redressement', libelleAttente: 'à redresser' },
  { id: 'validation', numero: '2a', nom: 'Mosaïque', icone: 'mosaique', attend: 'validation', libelleAttente: 'à valider' },
  { id: 'brouillon', numero: '3', nom: 'Brouillon', icone: 'brouillon', attend: 'brouillon', libelleAttente: 'à marquer' },
  { id: 'catalogue', numero: '4-5', nom: 'Marquage', icone: 'marquage', attend: 'catalogue', libelleAttente: 'à relire' },
  { id: 'export', numero: '6', nom: 'Export', icone: 'exporter' },
  { id: 'blocs', numero: '7', nom: 'Blocs', icone: 'blocs', attend: 'blocs', libelleAttente: 'à ranger ou vérifier' },
  { id: 'equilibre', numero: '8', nom: 'Équilibre', icone: 'equilibre' },
];

/** Un geste propose dans le message (« Annuler » une suppression). */
export interface ActionMessage { libelle: string; faire: () => void }

/** Ce que chaque ecran recoit : les donnees du banc, de quoi les relire, et de quoi dire un message. */
export interface Banc {
  classes: Classe[];
  images: MetaImage[];
  modeles: Modele[];
  reglages: Reglages;
  relire: () => Promise<void>;
  remplacer: (m: MetaImage) => void;
  dire: (texte: string, genre?: 'ok' | 'erreur', action?: ActionMessage) => void;
  /** Supprime une photo sans confirmation, mais en differe : annulable quelques secondes (suppressions.ts). */
  supprimer: (m: MetaImage) => void;
  ouvrir: (id: string, liste?: string[]) => void;
  aller: (e: IdEcran) => void;
  /** Une zone a importer en lot, demandee d'un autre ecran (« Ou importer ensuite », equilibre) : l'import la prend et l'oublie. */
  zoneDemandee: Zone | null;
  demanderZone: (z: Zone | null) => void;
}

export function App() {
  const [connecte, setConnecte] = useState<boolean | null>(null);
  const [panne, setPanne] = useState<string | null>(null);
  const [ecran, setEcran] = useState<IdEcran>(() => (location.hash.slice(1) as IdEcran) || 'import');
  const [classes, setClasses] = useState<Classe[]>([]);
  // Les photos du serveur ; l'ecran montre celles dont la suppression n'est pas demandee (`images`, plus bas).
  const [brutes, setImages] = useState<MetaImage[]>([]);
  const [cachees, setCachees] = useState<ReadonlySet<string>>(new Set());
  const [modeles, setModeles] = useState<Modele[]>([]);
  const [reglages, setReglages] = useState<Reglages>(REGLAGES_DEFAUT);
  const [message, setMessage] = useState<{ texte: string; genre: 'ok' | 'erreur'; action?: ActionMessage; duree?: number; cle?: 'suppression' } | null>(null);
  const [zoneDemandee, demanderZone] = useState<Zone | null>(null);
  const [edition, setEdition] = useState<{ id: string; liste: string[] } | null>(null);

  const dire = useCallback((texte: string, genre: 'ok' | 'erreur' = 'ok', action?: ActionMessage) => setMessage(action ? { texte, genre, action } : { texte, genre }), []);
  // La file des suppressions vit ici, pas dans l'ecran : quitter le Redressement ne coupe ni le delai ni « Annuler » (le message
  // reste), et la photo reste cachee partout (compteurs, mosaique) tant que sa suppression attend.
  const file = useRef<FileDeSuppressions<MetaImage> | null>(null);
  file.current ??= new FileDeSuppressions<MetaImage>((id) => api.supprimer(id));
  const images = useMemo(() => (cachees.size ? brutes.filter((m) => !cachees.has(m.id)) : brutes), [brutes, cachees]);
  useEffect(() => {
    const f = file.current;
    if (!f) return;
    const annulerLaDerniere = () => {
      const s = f.annulables().at(-1);
      if (s && f.annuler(s.element.id) && !f.annulables().length) setMessage({ texte: 'Suppression annulée : la photo est rendue.', genre: 'ok' });
    };
    const desabonner = f.abonner((issue) => {
      setCachees(f.cachees());
      if (issue?.genre === 'supprimee') setImages((l) => l.filter((x) => x.id !== issue.element.id));
      if (issue?.genre === 'echec') { setMessage({ texte: `${issue.element.nom ?? issue.element.id} n’a pas pu être supprimée : ${issue.erreur.message}`, genre: 'erreur' }); return; }
      // Le message dit la derniere suppression annulable ; « Annuler » la rend, puis montre la precedente s'il en reste.
      const l = f.annulables(), s = l.at(-1);
      if (s) setMessage({ texte: l.length > 1 ? `Photo supprimée (${l.length - 1} autre${l.length > 2 ? 's' : ''} encore annulable${l.length > 2 ? 's' : ''}).` : 'Photo supprimée.', genre: 'ok', cle: 'suppression', duree: Math.max(500, s.fin - Date.now()), action: { libelle: 'Annuler', faire: annulerLaDerniere } });
      else if (!issue) setMessage((m) => (m?.cle === 'suppression' ? null : m));
    });
    // La page se ferme : rien ne part (une suppression jamais faite vaut mieux qu'une perte, suppressions.ts).
    const fermer = () => f.abandonner();
    addEventListener('pagehide', fermer);
    return () => { desabonner(); removeEventListener('pagehide', fermer); };
  }, []);
  const relire = useCallback(async () => {
    try {
      const [c, i, m, r] = await Promise.all([api.classes(), api.images(), api.modeles(), api.reglages()]);
      // Un banc neuf : l'arbre de depart s'enregistre tout de suite (l'export le lit sur le serveur).
      setClasses(c.classes?.length ? c.classes : (await api.ecrireClasses(CLASSES_DEFAUT)).classes);
      setImages(i);
      setModeles(m);
      setReglages({ ...REGLAGES_DEFAUT, ...r, parts: { ...REGLAGES_DEFAUT.parts, ...(r.parts ?? {}) } });
    } catch (e) {
      if (e instanceof ErreurApi && e.statut === 401) setConnecte(false);
      else dire((e as Error).message, 'erreur');
    }
  }, [dire]);

  useEffect(() => {
    api.etat().then((e) => setConnecte(e.connecte)).catch((e: Error) => setPanne(e.message));
  }, []);
  useEffect(() => { if (connecte) void relire(); }, [connecte, relire]);
  // Une adresse entiere : la page porte <base href="banc/">, et un « #etape » seul s'y resoudrait en /banc/#etape (qui, rafraichi,
  // sortait de ?banc).
  useEffect(() => { history.replaceState(null, '', location.pathname + location.search + '#' + ecran); }, [ecran]);
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(() => setMessage(null), message.duree ?? (message.genre === 'erreur' ? 9000 : 3500));
    return () => clearTimeout(t);
  }, [message]);

  if (panne) return <main className="seul"><h1>Banc d’apprentissage</h1><p className="erreur">{panne}</p></main>;
  if (connecte === null) return <main className="seul"><p>Chargement…</p></main>;
  if (!connecte) return <Connexion onConnecte={() => setConnecte(true)} />;

  const remplacer = (m: MetaImage) => setImages((l) => l.map((x) => (x.id === m.id ? m : x)));
  const supprimer = (m: MetaImage) => file.current?.demander(m);
  const banc: Banc = { classes, images, modeles, reglages, relire, remplacer, dire, supprimer, ouvrir: (id, liste) => setEdition({ id, liste: liste ?? [id] }), aller: setEcran, zoneDemandee, demanderZone };
  const attente = aFaire(images);
  const deconnecter = () => { file.current?.abandonner(); api.deconnexion().then(() => setConnecte(false)).catch((e: Error) => dire(e.message, 'erreur')); };

  return (
    <div className={edition ? 'banc en-edition' : 'banc'}>
      <header className="barre">
        <strong className="titre"><span className="logo">B</span>Banc <small>façades</small></strong>
        <nav aria-label="Étapes" className="etapes">
          {ECRANS.map((e) => {
            const n = e.attend ? attente[e.attend] : 0;
            return (
              <button key={e.id} type="button" className={e.id === ecran && !edition ? 'etape actif' : 'etape'} aria-current={e.id === ecran && !edition ? 'page' : undefined}
                title={`${e.numero} · ${e.nom}${n ? ` : ${n} ${e.libelleAttente}` : ''}`} onClick={() => { setEdition(null); setEcran(e.id); }}>
                <Icone nom={e.icone} taille={18} /><span className="nom-etape">{e.nom}</span>{n > 0 && <span className="badge">{n}</span>}
              </button>
            );
          })}
        </nav>
        {/* Sur un telephone, les huit onglets prenaient tout l'ecran : une liste deroulante a leur place (styles.css). */}
        <select className="etapes-liste" aria-label="Étape" value={edition ? '' : ecran} onChange={(e) => { setEdition(null); setEcran(e.target.value as typeof ecran); }}>
          {edition && <option value="">Marquage d’une photo</option>}
          {ECRANS.map((e) => <option key={e.id} value={e.id}>{e.numero} · {e.nom}{e.attend && attente[e.attend] ? ` (${attente[e.attend]})` : ''}</option>)}
        </select>
        <span className="compte">{attente.total} photo{attente.total > 1 ? 's' : ''}</span>
        <button type="button" className="discret icone-seule" onClick={deconnecter} title="Se déconnecter" aria-label="Se déconnecter"><Icone nom="sortir" taille={20} /></button>
      </header>
      {message && (
        <div role="status" className={'message ' + message.genre} onClick={() => setMessage(null)}>
          <span>{message.texte}</span>
          {message.action && <button type="button" className="action" onClick={(e) => { e.stopPropagation(); setMessage(null); message.action?.faire(); }}>{message.action.libelle}</button>}
        </div>
      )}
      <main className="contenu">
        {edition ? <Editeur banc={banc} id={edition.id} liste={edition.liste} onFermer={() => { setEdition(null); void relire(); }} onAller={(id) => setEdition({ ...edition, id })} />
          : ecran === 'classes' ? <EcranClasses banc={banc} onClasses={setClasses} />
          : ecran === 'import' ? <EcranImport banc={banc} />
          : ecran === 'redressement' ? <EcranRedressement banc={banc} />
          : ecran === 'validation' ? <EcranValidation banc={banc} />
          : ecran === 'brouillon' ? <EcranBrouillon banc={banc} />
          : ecran === 'catalogue' ? <EcranCatalogue banc={banc} />
          : ecran === 'export' ? <EcranExport banc={banc} />
          : ecran === 'equilibre' ? <EcranEquilibre banc={banc} />
          : <EcranBlocs banc={banc} onReglages={setReglages} />}
      </main>
    </div>
  );
}

// Le banc d'apprentissage des facades : une page, un mot de passe, huit etapes. Les donnees vivent sur le serveur (api.php) ;
// la page les relit a chaque changement d'etape.

import { useCallback, useEffect, useState } from 'react';
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
import { Editeur } from './ecrans/editeur/Editeur.js';
import { Icone, type NomIcone } from './ui/Icones.js';
import { aFaire, type AFaire } from './etapes.js';

export type IdEcran = 'classes' | 'import' | 'redressement' | 'validation' | 'brouillon' | 'catalogue' | 'export' | 'blocs';

/** Les etapes, leur icone, et ce qui attend chacune (etapes.ts::aFaire) : une pastille sur l'onglet dit ou le travail attend. */
const ECRANS: { id: IdEcran; numero: string; nom: string; icone: NomIcone; attend?: keyof AFaire; libelleAttente?: string }[] = [
  { id: 'classes', numero: '0', nom: 'Classes', icone: 'classes' },
  { id: 'import', numero: '1', nom: 'Import', icone: 'importer' },
  { id: 'redressement', numero: '2', nom: 'Redressement', icone: 'redresser', attend: 'redressement', libelleAttente: 'à redresser' },
  { id: 'validation', numero: '2a', nom: 'Mosaïque', icone: 'mosaique', attend: 'validation', libelleAttente: 'à valider' },
  { id: 'brouillon', numero: '3', nom: 'Pré-marquage', icone: 'brouillon', attend: 'brouillon', libelleAttente: 'à pré-marquer' },
  { id: 'catalogue', numero: '4-5', nom: 'Marquage', icone: 'marquage', attend: 'catalogue', libelleAttente: 'à relire' },
  { id: 'export', numero: '6', nom: 'Export', icone: 'exporter' },
  { id: 'blocs', numero: '7', nom: 'Blocs', icone: 'blocs', attend: 'blocs', libelleAttente: 'à ranger ou vérifier' },
];

/** Ce que chaque ecran recoit : les donnees du banc, de quoi les relire, et de quoi dire un message. */
export interface Banc {
  classes: Classe[];
  images: MetaImage[];
  modeles: Modele[];
  reglages: Reglages;
  relire: () => Promise<void>;
  remplacer: (m: MetaImage) => void;
  dire: (texte: string, genre?: 'ok' | 'erreur') => void;
  ouvrir: (id: string, liste?: string[]) => void;
  aller: (e: IdEcran) => void;
}

export function App() {
  const [connecte, setConnecte] = useState<boolean | null>(null);
  const [panne, setPanne] = useState<string | null>(null);
  const [ecran, setEcran] = useState<IdEcran>(() => (location.hash.slice(1) as IdEcran) || 'import');
  const [classes, setClasses] = useState<Classe[]>([]);
  const [images, setImages] = useState<MetaImage[]>([]);
  const [modeles, setModeles] = useState<Modele[]>([]);
  const [reglages, setReglages] = useState<Reglages>(REGLAGES_DEFAUT);
  const [message, setMessage] = useState<{ texte: string; genre: 'ok' | 'erreur' } | null>(null);
  const [edition, setEdition] = useState<{ id: string; liste: string[] } | null>(null);

  const dire = useCallback((texte: string, genre: 'ok' | 'erreur' = 'ok') => setMessage({ texte, genre }), []);
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
    const t = setTimeout(() => setMessage(null), message.genre === 'erreur' ? 9000 : 3500);
    return () => clearTimeout(t);
  }, [message]);

  if (panne) return <main className="seul"><h1>Banc d’apprentissage</h1><p className="erreur">{panne}</p></main>;
  if (connecte === null) return <main className="seul"><p>Chargement…</p></main>;
  if (!connecte) return <Connexion onConnecte={() => setConnecte(true)} />;

  const remplacer = (m: MetaImage) => setImages((l) => l.map((x) => (x.id === m.id ? m : x)));
  const banc: Banc = { classes, images, modeles, reglages, relire, remplacer, dire, ouvrir: (id, liste) => setEdition({ id, liste: liste ?? [id] }), aller: setEcran };
  const attente = aFaire(images);
  // Pendant le marquage d'une photo, l'onglet Marquage reste allume : on y revient d'un clic.
  const actif = (id: IdEcran) => (edition ? id === 'catalogue' : id === ecran);
  const deconnecter = () => { api.deconnexion().then(() => setConnecte(false)).catch((e: Error) => dire(e.message, 'erreur')); };

  return (
    <div className={edition ? 'banc en-edition' : 'banc'}>
      <header className="barre">
        <strong className="titre"><span className="logo">B</span>Banc <small>façades</small></strong>
        <nav aria-label="Étapes" className="etapes">
          {ECRANS.map((e) => {
            const n = e.attend ? attente[e.attend] : 0;
            return (
              <button key={e.id} type="button" className={actif(e.id) ? 'etape actif' : 'etape'} aria-current={actif(e.id) ? 'page' : undefined}
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
      {message && <div role="status" className={'message ' + message.genre} onClick={() => setMessage(null)}>{message.texte}</div>}
      <main className="contenu">
        {edition ? <Editeur banc={banc} id={edition.id} liste={edition.liste} onFermer={() => { setEdition(null); void relire(); }} onAller={(id) => setEdition({ ...edition, id })} />
          : ecran === 'classes' ? <EcranClasses banc={banc} onClasses={setClasses} />
          : ecran === 'import' ? <EcranImport banc={banc} />
          : ecran === 'redressement' ? <EcranRedressement banc={banc} />
          : ecran === 'validation' ? <EcranValidation banc={banc} />
          : ecran === 'brouillon' ? <EcranBrouillon banc={banc} />
          : ecran === 'catalogue' ? <EcranCatalogue banc={banc} />
          : ecran === 'export' ? <EcranExport banc={banc} />
          : <EcranBlocs banc={banc} onReglages={setReglages} />}
      </main>
    </div>
  );
}

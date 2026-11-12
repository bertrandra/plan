// Etape 4 : corriger le marquage d'une photo. Choisir (V), rectangle (R), polygone (P) ; tirer un objet le deplace, tirer une
// poignee le reforme ; Suppr le retire ; Ctrl+Z / Ctrl+Y ; Ctrl+S enregistre (la photo devient « corrigee »). Selection (S) : une
// boite ou un lasso prend plusieurs objets, a aligner ou mettre a la meme taille que la reference (l'objet touche ensuite).

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Banc } from '../App.js';
import { api } from '../api.js';
import { choixDeCreation } from '../classes.js';
import { lireCible } from '../brouillon.js';
import { rangerLesParents } from '../geometrie.js';
import { aligner, avecDescendants, coller, creerPolygone, creerRectangle, Historique, memeTaille, supprimer } from '../edition.js';
import type { Bloc, MetaImage, Objet } from '../types.js';
import { Scene, type ModeSelection, type Outil } from './Scene.js';
import { BarreSelection, useSelection } from './Selection.js';
import { libelleDe } from '../classes.js';
import { PanneauObjet, PanneauSelection, ListeObjets } from './PanneauObjet.js';

/**
 * Le presse-papiers des objets (Ctrl+C, Ctrl+X, Ctrl+V) : hors du composant, il survit au changement de photo (copier une fenetre,
 * la coller sur la photo suivante). `photo` : d'ou viennent les objets, pour decaler un collage sur la meme photo.
 */
let pressePapiers: { objets: Objet[]; photo: string } | null = null;

export function Editeur({ banc, id, liste, onFermer, onAller }: { banc: Banc; id: string; liste: string[]; onFermer: () => void; onAller: (id: string) => void }) {
  const meta = banc.images.find((m) => m.id === id);
  const [objets, setObjets] = useState<Objet[] | null>(null);
  const { choisi, selection, cibles, choisir: setChoisi, selectionner, basculer } = useSelection();
  const [modeSelection, setModeSelection] = useState<ModeSelection>('boite');
  const [outil, setOutil] = useState<Outil>('choisir');
  // Ce qu'on pose : « classe » ou « classe:type » (un objet deja qualifie, choixDeCreation).
  const [classe, setClasse] = useState<string>(() => choixDeCreation(banc.classes)[0]?.valeur ?? '');
  const [caches, setCaches] = useState<Set<string>>(new Set());
  const [modifie, setModifie] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  const [aColler, setAColler] = useState(() => !!pressePapiers);
  const hist = useRef(new Historique<Objet[]>());
  const rang = liste.indexOf(id);

  // Le marquage se relit quand on change de photo, et seulement alors : cocher « Vérifiee » ou changer le bloc ne le recharge pas.
  const dire = useRef(banc.dire);
  dire.current = banc.dire;
  useEffect(() => {
    setObjets(null); setChoisi(null); setModifie(false); hist.current.vider();
    api.annotation(id).then((a) => setObjets(a.objets)).catch((e: Error) => dire.current(e.message, 'erreur'));
  }, [id]);

  /** Un geste : l'etat d'avant va dans l'historique. */
  const changer = useCallback((f: (l: Objet[]) => Objet[]) => {
    setObjets((l) => { if (!l) return l; hist.current.noter(l); return f(l); });
    setModifie(true);
  }, []);
  const enregistrer = useCallback(async (): Promise<boolean> => {
    if (!objets) return false;
    setEnvoi(true);
    try {
      const ranges = rangerLesParents(objets, banc.classes);
      banc.remplacer(await api.ecrireAnnotation(id, { objets: ranges, par: 'main' }));
      setObjets(ranges); setModifie(false);
      banc.dire('Marquage enregistré.');
      return true;
    } catch (e) { banc.dire((e as Error).message, 'erreur'); return false; } finally { setEnvoi(false); }
  }, [objets, banc, id]);
  const aller = useCallback(async (k: number) => {
    const cible = liste[k];
    if (!cible) return;
    if (modifie && !(confirm('Enregistrer le marquage avant de changer de photo ?') ? await enregistrer() : confirm('Abandonner les changements ?'))) return;
    onAller(cible);
  }, [liste, modifie, enregistrer, onAller]);
  const copier = (couper: boolean) => {
    if (!objets || !cibles.size) return;
    // Chaque objet pris part avec ses details ; un detail deja pris ne part qu'une fois.
    const pris = new Set([...cibles].flatMap((c) => avecDescendants(objets, c).map((o) => o.id)));
    const groupe = objets.filter((o) => pris.has(o.id));
    pressePapiers = { objets: groupe, photo: id };
    setAColler(true);
    if (couper) { const ids = new Set(groupe.map((o) => o.id)); changer((l) => l.filter((o) => !ids.has(o.id)).map((o) => (o.parent && ids.has(o.parent) ? { ...o, parent: null } : o))); setChoisi(null); }
    banc.dire(`${groupe.length} objet(s) ${couper ? 'coupé(s)' : 'copié(s)'}.`);
  };
  const collerIci = () => {
    if (!objets || !pressePapiers || !meta?.redressee) return;
    const { largeur: Lp, hauteur: Hp } = meta.redressee;
    // Sur la meme photo, un peu decale (sinon il cacherait l'original) ; sur une autre, a la meme place.
    const r = coller(objets, pressePapiers.objets, Lp, Hp, pressePapiers.photo === id ? Math.max(10, Math.round(Lp * 0.02)) : 0);
    const colles = r.objets.slice(objets.length);
    changer(() => rangerLesParents(r.objets, banc.classes));
    // Ce qui vient d'etre colle reste pris (tout le groupe, details compris) : on le tire aussitot a sa place.
    if (colles.length > 1) selectionner(colles.map((o) => o.id), false); else setChoisi(r.premier);
    // Coller de nouveau decale encore : le presse-papiers devient ce qu'on vient de coller.
    pressePapiers = { objets: colles, photo: id };
  };
  const fermer = () => { if (!modifie || confirm('Quitter sans enregistrer ?')) onFermer(); };
  const choisirClasse = (c: string) => { setClasse(c); const k = banc.classes.find((x) => x.id === c.split(':')[0]); if (k && !['choisir', 'selection', 'vue', 'zoom'].includes(outil)) setOutil(k.forme); };
  const retirerPris = () => { const ids = [...cibles]; changer((l) => ids.reduce((acc, x) => supprimer(acc, x), l)); setChoisi(null); };

  useEffect(() => {
    const touche = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase(), mod = e.ctrlKey || e.metaKey;
      // Ctrl+S enregistre d'ou que vienne la touche (une case, une liste) ; le reste du clavier laisse les champs tranquilles.
      if (mod && k === 's') { e.preventDefault(); void enregistrer(); return; }
      if ((e.target as HTMLElement).closest('input, select, textarea')) return;
      if (mod && k === 'c' && choisi) { e.preventDefault(); copier(false); }
      else if (mod && k === 'x' && choisi) { e.preventDefault(); copier(true); }
      else if (mod && k === 'v' && pressePapiers) { e.preventDefault(); collerIci(); }
      else if (mod && (k === 'y' || (k === 'z' && e.shiftKey))) { e.preventDefault(); setObjets((l) => (l ? hist.current.refaire(l) ?? l : l)); setModifie(true); }
      else if (mod && k === 'z') { e.preventDefault(); setObjets((l) => (l ? hist.current.annuler(l) ?? l : l)); setModifie(true); }
      else if ((e.key === 'Delete' || e.key === 'Backspace') && cibles.size) { e.preventDefault(); retirerPris(); }
      else if (k === 'v') setOutil('choisir');
      else if (k === 's') setOutil('selection');
      else if (k === 'h') setOutil('vue');
      else if (k === 'z') setOutil('zoom');
      else if (k === 'r') setOutil('rectangle');
      else if (k === 'p') setOutil('polygone');
      else if (k === 't') setOutil('ligne');
      else if (k === 'o') setOutil('point');
      else if (e.key === 'PageDown' || k === 'n') void aller(rang + 1);
      else if (e.key === 'PageUp' || k === 'b') void aller(rang - 1);
      else if (/^[1-9]$/.test(e.key)) { const c = choixDeCreation(banc.classes)[Number(e.key) - 1]; if (c) choisirClasse(c.valeur); }
    };
    window.addEventListener('keydown', touche);
    return () => window.removeEventListener('keydown', touche);
  });

  const visibles = useMemo(() => (objets ?? []).filter((o) => !caches.has(o.classe)), [objets, caches]);
  if (!meta?.redressee) return <section className="panneau"><p>Cette photo n’est pas redressée.</p><button type="button" onClick={onFermer}>Retour</button></section>;
  const objet = objets?.find((o) => o.id === choisi) ?? null;
  const cible = lireCible(classe, banc.classes);
  const classeChoisie = banc.classes.find((c) => c.id === cible?.classe);
  return (
    <section className="editeur">
      <BarreEditeur banc={banc} meta={meta} rang={rang} total={liste.length} modifie={modifie} envoi={envoi} outil={outil} setOutil={setOutil}
        classe={classe} choisirClasse={choisirClasse} onAller={(k) => { void aller(k); }} onEnregistrer={() => { void enregistrer(); }} onFermer={fermer} />
      <div className="editeur-corps">
        {objets ? (
          <Scene url={api.fichier(id, 'redressee', meta.redressement?.le ?? '')} L={meta.redressee.largeur} H={meta.redressee.hauteur} objets={visibles} classes={banc.classes}
            outil={outil} classe={classeChoisie ?? null} choisi={choisi} onChoisir={setChoisi}
            selection={selection} modeSelection={modeSelection} onSelectionner={selectionner} onBasculer={basculer} onOutil={setOutil} onModeSelection={setModeSelection}
            enTete={<BarreSelection outilSelection={outil === 'selection'} mode={modeSelection} setMode={setModeSelection} nombre={selection.size}
              reference={objet ? libelleDe(objet, banc.classes) : null} onAligner={(c) => { if (choisi) changer((l) => aligner(l, selection, choisi, c)); }}
              onTaille={(t) => { if (choisi) changer((l) => memeTaille(l, selection, choisi, t)); }} />}
            onCreer={(pts, forme) => {
              if (!classeChoisie) return;
              const cree = forme === 'rectangle' ? creerRectangle(objets, classeChoisie.id, pts[0] ?? { x: 0, y: 0 }, pts[1] ?? { x: 0, y: 0 }) : creerPolygone(objets, classeChoisie.id, pts, forme);
              const n = cible?.type ? { ...cree, type: cible.type } : cree;
              changer((l) => rangerLesParents([...l, n], banc.classes));
              setChoisi(n.id);
            }}
            onModifier={(os) => { const m = new Map(os.map((o) => [o.id, o])); setObjets((l) => l?.map((x) => m.get(x.id) ?? x) ?? l); setModifie(true); }}
            onDebutGeste={() => { if (objets) hist.current.noter(objets); }} />
        ) : <p className="etat">Chargement du marquage…</p>}
        <aside className="editeur-panneau">
          {aColler && <div className="rang"><button type="button" onClick={collerIci}>Coller (Ctrl+V)</button><span className="aide">{pressePapiers?.objets.length ?? 0} objet(s){pressePapiers && pressePapiers.photo !== id ? ', d’une autre photo' : ''}</span></div>}
          {selection.size > 1 ? <PanneauSelection objets={(objets ?? []).filter((o) => selection.has(o.id))} classes={banc.classes} onChanger={(os) => { const m = new Map(os.map((o) => [o.id, o])); changer((l) => l.map((x) => m.get(x.id) ?? x)); }}
            onSupprimer={retirerPris} onCopier={() => copier(false)} onCouper={() => copier(true)} />
          : objet ? <PanneauObjet o={objet} objets={objets ?? []} classes={banc.classes} onChanger={(o) => changer((l) => l.map((x) => (x.id === o.id ? o : x)))} onSupprimer={retirerPris}
            onCopier={() => copier(false)} onCouper={() => copier(true)} />
            : <p className="aide">Touchez un objet pour le corriger ; choisissez une classe et l’outil rectangle (R) ou polygone (P) pour en créer. Chiffres 1 à 9 : la classe ; N / B : photo suivante / précédente ; Ctrl+C, Ctrl+X, Ctrl+V : copier, couper, coller un objet (avec ses détails), d’une photo à l’autre aussi.</p>}
          <ListeObjets objets={objets ?? []} classes={banc.classes} choisi={choisi} caches={caches} onChoisir={setChoisi}
            onCacher={(c) => setCaches((s) => { const t = new Set(s); if (t.has(c)) t.delete(c); else t.add(c); return t; })} />
        </aside>
      </div>
    </section>
  );
}

/** Le pictogramme et le nom de chaque outil ; sur un telephone, le pictogramme seul (styles.css). */
const OUTILS: Record<Outil, [string, string]> = { choisir: ['☝', 'Choisir (V)'], selection: ['⬚', 'Sélection (S)'], vue: ['✋', 'Vue (H)'], zoom: ['🔍', 'Zoom (Z)'], rectangle: ['▭', 'Rectangle (R)'], polygone: ['⬠', 'Polygone (P)'], ligne: ['╱', 'Ligne (T)'], point: ['⊕', 'Point (O)'] };

function BarreEditeur({ banc, meta, rang, total, modifie, envoi, outil, setOutil, classe, choisirClasse, onAller, onEnregistrer, onFermer }: {
  banc: Banc; meta: MetaImage; rang: number; total: number; modifie: boolean; envoi: boolean; outil: Outil; setOutil: (o: Outil) => void;
  classe: string; choisirClasse: (c: string) => void; onAller: (k: number) => void; onEnregistrer: () => void; onFermer: () => void;
}) {
  // La case et le bloc changent tout de suite a l'ecran ; le serveur confirme (ou l'erreur remet l'etat d'avant).
  const modifierMeta = (champs: Parameters<typeof api.modifier>[1]) => {
    banc.remplacer({ ...meta, ...champs });
    api.modifier(meta.id, champs).then(banc.remplacer).catch((e: Error) => { banc.remplacer(meta); banc.dire(e.message, 'erreur'); });
  };
  const choix = choixDeCreation(banc.classes);
  return (
    <div className="editeur-barre">
      <button type="button" onClick={onFermer}>← Catalogue</button>
      <button type="button" disabled={rang <= 0} onClick={() => onAller(rang - 1)} aria-label="Photo précédente">◀</button>
      <span>{rang + 1} / {total}</span>
      <button type="button" disabled={rang >= total - 1} onClick={() => onAller(rang + 1)} aria-label="Photo suivante">▶</button>
      <strong className="nom">{meta.nom ?? meta.id}</strong>
      <span className="outils" role="group" aria-label="Outil">
        {(['choisir', 'selection', 'rectangle', 'polygone', 'ligne', 'point'] as const).map((o) => <button key={o} type="button" className={o === outil ? 'onglet actif' : 'onglet'} aria-pressed={o === outil} aria-label={OUTILS[o][1]} title={OUTILS[o][1]} onClick={() => setOutil(o)}>{OUTILS[o][0]}<span className="libelle-outil"> {OUTILS[o][1]}</span></button>)}
      </span>
      <label className="a-poser"><span className="libelle-outil">À poser </span><select value={classe} onChange={(e) => choisirClasse(e.target.value)}>{choix.map((c, i) => <option key={c.valeur} value={c.valeur}>{i < 9 ? i + 1 + ' · ' : ''}{c.nom}</option>)}</select></label>
      <label className="case"><input type="checkbox" checked={meta.verifiee} onChange={(e) => modifierMeta({ verifiee: e.target.checked })} /> Vérifiée</label>
      <label>Bloc <select value={meta.bloc} onChange={(e) => modifierMeta({ bloc: e.target.value as Bloc })}><option value="">(tirage)</option><option value="train">train</option><option value="val">val</option><option value="test">test</option><option value="reserve">réserve</option></select></label>
      <button type="button" className="danger" onClick={() => { if (confirm('Rejeter cette photo ? Elle sort du jeu.')) modifierMeta({ statut: 'rejetee' }); }}>Rejeter</button>
      <button type="button" className="principal" disabled={envoi} onClick={onEnregistrer}>{envoi ? 'Enregistrement…' : modifie ? 'Enregistrer (Ctrl+S)' : 'Enregistrer'}</button>
    </div>
  );
}

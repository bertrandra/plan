// Etape 4 : relire et corriger le marquage d'une photo (demande du proprietaire, 12 novembre 2026 : « de la productivite, et que ce soit
// beau »). L'editeur ne fait qu'assembler : les controleurs tiennent l'etat et les gestes (useMarquage : les objets, l'historique,
// l'enregistrement ; useSelection ; usePressePapiers ; useRelecture : ce qui reste a relire ; useRaccourcis : le clavier, lu dans la meme
// table que l'aide), les vues le montrent (BarreHaut, ColonneOutils, Scene, Inspecteur, BandeauPhotos, AideRaccourcis).

import { useCallback, useMemo, useState } from 'react';
import type { Banc } from '../../App.js';
import { api } from '../../api.js';
import { choixDeCreation, libelleDe } from '../../classes.js';
import { lireCible } from '../../brouillon.js';
import { rangerLesParents } from '../../geometrie.js';
import { aligner, creerPolygone, creerRectangle, memeTaille, supprimer } from '../../edition.js';
import { decaler, qualifier } from '../../relecture.js';
import type { Objet } from '../../types.js';
import { Scene, type ModeSelection, type Outil } from './Scene.js';
import { BarreSelection, useSelection } from './Selection.js';
import { BarreHaut } from './BarreHaut.js';
import { ColonneOutils } from './ColonneOutils.js';
import { Inspecteur } from './Inspecteur.js';
import { BandeauPhotos } from './BandeauPhotos.js';
import { AideRaccourcis } from './AideRaccourcis.js';
import { Icone } from '../../ui/Icones.js';
import { useMarquage } from './useMarquage.js';
import { usePressePapiers } from './usePressePapiers.js';
import { useRelecture } from './useRelecture.js';
import { useRaccourcis, type Gestes } from './useRaccourcis.js';

const OUTILS_SANS_TRACE: readonly Outil[] = ['choisir', 'selection', 'vue', 'zoom'];

/** L'etat de l'affichage et des outils (rien du marquage) : l'outil, la forme de la selection, ce qu'on trace, les etiquettes, la loupe. */
function useAffichage(banc: Banc) {
  const [outil, setOutil] = useState<Outil>('choisir');
  const [mode, setMode] = useState<ModeSelection>('boite');
  // Ce qu'on trace : « classe » ou « classe:type » (choixDeCreation) ; et les derniers choix de la palette, en tete.
  const [aPoser, setAPoser] = useState<string>(() => choixDeCreation(banc.classes)[0]?.valeur ?? '');
  const [recents, setRecents] = useState<string[]>([]);
  const [caches, setCaches] = useState<Set<string>>(new Set());
  const [etiquettes, setEtiquettes] = useState(false);
  const [loupe, setLoupe] = useState(true);
  const [aide, setAide] = useState(false);
  const retenir = (v: string) => setRecents((l) => [v, ...l.filter((x) => x !== v)].slice(0, 5));
  const basculerCache = (c: string) => setCaches((s) => { const t = new Set(s); if (t.has(c)) t.delete(c); else t.add(c); return t; });
  return { outil, setOutil, mode, setMode, aPoser, setAPoser, recents, retenir, caches, basculerCache, etiquettes, setEtiquettes, loupe, setLoupe, aide, setAide };
}

export function Editeur({ banc, id, liste, onFermer, onAller }: { banc: Banc; id: string; liste: string[]; onFermer: () => void; onAller: (id: string) => void }) {
  const meta = banc.images.find((m) => m.id === id);
  const L = meta?.redressee?.largeur ?? 1, H = meta?.redressee?.hauteur ?? 1;
  const marquage = useMarquage(banc, id);
  const sel = useSelection();
  const vue = useAffichage(banc);
  const relecture = useRelecture({ marquage, classes: banc.classes, choisi: sel.choisi, cibles: sel.cibles, choisir: sel.choisir, H });
  const presse = usePressePapiers({ id, marquage, cibles: sel.cibles, classes: banc.classes, L, H, choisir: sel.choisir, selectionner: sel.selectionner, dire: (t) => banc.dire(t) });
  const objets = useMemo(() => marquage.objets ?? [], [marquage.objets]);
  const photos = useMemo(() => liste.map((x) => banc.images.find((m) => m.id === x)).filter((m): m is NonNullable<typeof m> => !!m), [liste, banc.images]);
  const rang = liste.indexOf(id);

  const aller = useCallback(async (k: number) => {
    const cible = liste[k];
    if (!cible || cible === id) return;
    if (marquage.modifie && !(confirm('Enregistrer le marquage avant de changer de photo ?') ? await marquage.enregistrer() : confirm('Abandonner les changements ?'))) return;
    sel.choisir(null);
    onAller(cible);
  }, [liste, id, marquage, sel, onAller]);
  /** Entree : enregistrer, marquer verifiee, passer a la photo suivante (ou revenir au catalogue apres la derniere). */
  const validerEtSuivante = async () => {
    if (!(await marquage.enregistrer({ verifiee: true, silencieux: true }))) return;
    banc.dire(rang < liste.length - 1 ? 'Photo validée : la suivante.' : 'Photo validée : c’était la dernière du lot.');
    const suivante = liste[rang + 1];
    if (suivante) { sel.choisir(null); onAller(suivante); } else onFermer();
  };
  const fermer = () => { if (!marquage.modifie || confirm('Quitter sans enregistrer ?')) onFermer(); };
  const retirerPris = () => { const ids = [...sel.cibles]; if (ids.length) { marquage.changer((l) => ids.reduce((acc, x) => supprimer(acc, x), l)); sel.choisir(null); } };
  /** Un choix de la palette (ou son chiffre) : il qualifie la selection s'il y en a une, sinon il dit ce qu'on trace. */
  const palette = (valeur: string) => {
    const cible = lireCible(valeur, banc.classes);
    vue.retenir(valeur);
    if (cible && sel.cibles.size) { marquage.changer((l) => qualifier(l, sel.cibles, cible, banc.classes)); return; }
    vue.setAPoser(valeur);
    const k = banc.classes.find((x) => x.id === cible?.classe);
    if (k && !OUTILS_SANS_TRACE.includes(vue.outil)) vue.setOutil(k.forme);
  };
  const outil = (o: Outil) => () => vue.setOutil(o);
  const decalage = (dx: number, dy: number) => ({ maj }: { maj: boolean }) => { if (sel.cibles.size) marquage.changer((l) => decaler(l, sel.cibles, dx * (maj ? 10 : 1), dy * (maj ? 10 : 1), L, H)); };
  const gestes: Gestes = {
    enregistrer: () => { void marquage.enregistrer(); }, validerSuivante: () => { void validerEtSuivante(); },
    suivantARelire: () => relecture.aller(1), precedentARelire: () => relecture.aller(-1),
    accepter: () => relecture.accepterPris(), accepterAuDessus: () => { const n = relecture.accepterAuDessus(); banc.dire(n ? `${n} objet(s) acceptés.` : 'Rien à accepter au-dessus du seuil.'); },
    supprimer: retirerPris, annuler: marquage.annuler, refaire: marquage.refaire,
    copier: () => presse.copier(false), couper: () => presse.copier(true), coller: presse.coller,
    gauche: decalage(-1, 0), droite: decalage(1, 0), haut: decalage(0, -1), bas: decalage(0, 1),
    outilChoisir: outil('choisir'), outilVue: outil('vue'), outilZoom: outil('zoom'), outilRectangle: outil('rectangle'), outilPolygone: outil('polygone'), outilLigne: outil('ligne'), outilPoint: outil('point'),
    // S choisit la selection ; S de nouveau passe de la boite au lasso.
    outilSelection: () => { if (vue.outil === 'selection') vue.setMode(vue.mode === 'boite' ? 'lasso' : 'boite'); else vue.setOutil('selection'); },
    etiquettes: () => vue.setEtiquettes((x) => !x), loupe: () => vue.setLoupe((x) => !x), aide: () => vue.setAide((x) => !x),
    photoSuivante: () => { void aller(rang + 1); }, photoPrecedente: () => { void aller(rang - 1); },
    type: ({ chiffre }) => { const c = choixDeCreation(banc.classes)[(chiffre ?? 0) - 1]; if (c) palette(c.valeur); },
  };
  useRaccourcis(gestes);

  if (!meta?.redressee) return <section className="panneau"><p>Cette photo n’est pas redressée.</p><button type="button" onClick={onFermer}>Retour</button></section>;
  const visibles = relecture.visibles.filter((o) => !vue.caches.has(o.classe));
  const cible = lireCible(vue.aPoser, banc.classes);
  const classeChoisie = banc.classes.find((c) => c.id === cible?.classe);
  const objet = objets.find((o) => o.id === sel.choisi) ?? null;
  const creer = (pts: Parameters<typeof creerPolygone>[2], forme: Parameters<typeof creerPolygone>[3] | 'rectangle') => {
    if (!classeChoisie) return;
    const cree = forme === 'rectangle' ? creerRectangle(objets, classeChoisie.id, pts[0] ?? { x: 0, y: 0 }, pts[1] ?? { x: 0, y: 0 }) : creerPolygone(objets, classeChoisie.id, pts, forme);
    const n: Objet = cible?.type ? { ...cree, type: cible.type } : cree;
    marquage.changer((l) => rangerLesParents([...l, n], banc.classes));
    sel.choisir(n.id);
  };
  return (
    <section className="editeur">
      <BarreHaut banc={banc} meta={meta} rang={rang} total={liste.length} aRelire={relecture.aRelire} modifie={marquage.modifie} envoi={marquage.envoi}
        onAller={(k) => { void aller(k); }} onEnregistrer={() => { void marquage.enregistrer(); }} onValider={() => { void validerEtSuivante(); }} onFermer={fermer} />
      <div className="editeur-corps">
        <ColonneOutils outil={vue.outil} mode={vue.mode} onOutil={vue.setOutil} onMode={vue.setMode} etiquettes={vue.etiquettes} onEtiquettes={() => vue.setEtiquettes((x) => !x)}
          loupe={vue.loupe} onLoupe={() => vue.setLoupe((x) => !x)} onAide={() => vue.setAide(true)} />
        {marquage.objets ? (
          <Scene url={api.fichier(id, 'redressee', meta.redressement?.le ?? '')} L={L} H={H} objets={visibles} classes={banc.classes}
            outil={vue.outil} classe={classeChoisie ?? null} choisi={sel.choisi} onChoisir={sel.choisir}
            selection={sel.selection} modeSelection={vue.mode} onSelectionner={sel.selectionner} onBasculer={sel.basculer} etiquettes={vue.etiquettes} loupe={vue.loupe}
            enTete={<BarreSelection outilSelection={vue.outil === 'selection'} mode={vue.mode} nombre={sel.selection.size} reference={objet ? libelleDe(objet, banc.classes) : null}
              onAligner={(c) => { if (sel.choisi) marquage.changer((l) => aligner(l, sel.selection, sel.choisi as string, c)); }}
              onTaille={(t) => { if (sel.choisi) marquage.changer((l) => memeTaille(l, sel.selection, sel.choisi as string, t)); }} />}
            onCreer={creer} onModifier={(os) => marquage.suivre(os)} onDebutGeste={marquage.debutGeste}
            surChoix={sel.cibles.size > 0 && <>
              <button type="button" className="danger" onClick={retirerPris} title="Supprimer (Suppr ou X)"><Icone nom="poubelle" /> Supprimer{sel.cibles.size > 1 ? ` (${sel.cibles.size})` : ''}</button>
              <button type="button" onClick={() => sel.choisir(null)} title="Ne plus rien choisir (Échap)" aria-label="Ne plus rien choisir"><Icone nom="fermer" /></button>
            </>} />
        ) : <p className="etat scene-attente">Chargement du marquage…</p>}
        <Inspecteur objets={objets} classes={banc.classes} choisi={sel.choisi} selection={sel.selection} relecture={relecture} aPoser={vue.aPoser} recents={vue.recents}
          caches={vue.caches} pressePapiers={presse.contenu} onChoisir={sel.choisir} onCacher={vue.basculerCache}
          onChanger={(os) => { const m = new Map(os.map((o) => [o.id, o])); marquage.changer((l) => l.map((x) => m.get(x.id) ?? x)); }}
          onSupprimer={retirerPris} onCopier={() => presse.copier(false)} onCouper={() => presse.copier(true)} onColler={presse.coller} onPalette={palette} />
      </div>
      <BandeauPhotos photos={photos} courante={id} onAller={(k) => { void aller(k); }} />
      {vue.aide && <AideRaccourcis onFermer={() => vue.setAide(false)} />}
    </section>
  );
}

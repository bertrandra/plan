// Etape 4 : relire et corriger le marquage d'une photo (demande du proprietaire, 12 novembre 2026 : « de la productivite, et que ce soit
// beau »). L'editeur ne fait qu'assembler : les controleurs tiennent l'etat et les gestes (useMarquage : les objets, l'historique,
// l'enregistrement ; useSelection ; usePressePapiers ; useRelecture : ce qui reste a relire ; useRaccourcis : le clavier, lu dans la meme
// table que l'aide), les vues le montrent (BarreHaut, ColonneOutils, Scene, Inspecteur, BandeauPhotos, AideRaccourcis).

import { useCallback, useMemo, useState } from 'react';
import type { Banc } from '../../App.js';
import { api } from '../../api.js';
import { choixDeCreation, libelleDe } from '../../classes.js';
import { brouillonSurExistant, lireCible } from '../../brouillon.js';
import { proposer } from '../brouillon/proposer.js';
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
import { useAides } from './useAides.js';
import { MenuObjet } from './MenuObjet.js';
import { useGestesObjet } from './useGestesObjet.js';

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
  // Le mode stylet : il s'allume de lui-meme au premier trait de crayon et reste retenu sur cet appareil.
  const [stylet, setStyletBrut] = useState(() => { try { return localStorage.getItem('banc-stylet') === '1'; } catch { return false; } });
  const setStylet = (v: boolean) => { setStyletBrut(v); try { localStorage.setItem('banc-stylet', v ? '1' : '0'); } catch { /* le choix vaut pour la page */ } };
  const retenir = (v: string) => setRecents((l) => [v, ...l.filter((x) => x !== v)].slice(0, 5));
  const basculerCache = (c: string) => setCaches((s) => { const t = new Set(s); if (t.has(c)) t.delete(c); else t.add(c); return t; });
  return { outil, setOutil, mode, setMode, aPoser, setAPoser, recents, retenir, caches, basculerCache, etiquettes, setEtiquettes, loupe, setLoupe, aide, setAide, stylet, setStylet };
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
  const aides = useAides({ url: api.fichier(id, 'redressee', meta?.redressement?.le ?? ''), L, classes: banc.classes, dire: (t, g) => banc.dire(t, g) });
  const { trouverSemblables, calerPris, menu, setMenu, ouvrirMenu } = useGestesObjet({ objets, sel, marquage, aides, dire: (t) => banc.dire(t) });
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
  // Relancer le brouillon sur la photo ouverte : les objets poses ou corriges a la main restent, le brouillon non relu est remplace
  // (brouillonSurExistant, comme le lot de l'etape 3). Un pas d'historique : Ctrl+Z le defait ; rien n'est enregistre sans Enregistrer.
  const [relance, setRelance] = useState(false);
  const relancer = async () => {
    if (!meta || relance) return;
    const actifs = banc.modeles.filter((m) => m.installe && m.actif !== false);
    setRelance(true);
    try {
      const nouveaux = await proposer(meta, actifs, banc.classes, true);
      // Le compte pour le message, sur l'etat present (la mise a jour, elle, se fait dans l'historique, plus tard).
      const present = marquage.objets ?? [], gardes = present.filter((o) => o.origine !== 'auto').length;
      const ajoutes = brouillonSurExistant(present, nouveaux, banc.classes).length - gardes;
      marquage.changer((l) => brouillonSurExistant(l, nouveaux, banc.classes));
      sel.choisir(null);
      banc.dire(`Pré-marquage relancé (${actifs.length} modèle(s) et la recherche des baies) : ${ajoutes} objet(s) à relire ; ${gardes} objet(s) faits à la main gardés.`);
    } catch (e) { banc.dire((e as Error).message, 'erreur'); } finally { setRelance(false); }
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
  // Un outil de trace : seulement celui de la forme de la classe qu'on trace (une fenetre, le rectangle) ; R, P, T ou O y menent.
  const formeTracee = () => banc.classes.find((c) => c.id === lireCible(vue.aPoser, banc.classes)?.classe)?.forme;
  const tracer = (o: Outil) => () => vue.setOutil(formeTracee() ?? o);
  const decalage = (dx: number, dy: number) => ({ maj }: { maj: boolean }) => { if (sel.cibles.size) marquage.changer((l) => decaler(l, sel.cibles, dx * (maj ? 10 : 1), dy * (maj ? 10 : 1), L, H)); };
  const gestes: Gestes = {
    enregistrer: () => { void marquage.enregistrer(); }, validerSuivante: () => { void validerEtSuivante(); },
    suivantARelire: () => relecture.aller(1), precedentARelire: () => relecture.aller(-1),
    accepter: () => relecture.accepterPris(), accepterAuDessus: () => { const n = relecture.accepterAuDessus(); banc.dire(n ? `${n} objet(s) acceptés.` : 'Rien à accepter au-dessus du seuil.'); },
    supprimer: retirerPris, annuler: marquage.annuler, refaire: marquage.refaire,
    copier: () => presse.copier(false), couper: () => presse.copier(true), coller: presse.coller,
    gauche: decalage(-1, 0), droite: decalage(1, 0), haut: decalage(0, -1), bas: decalage(0, 1),
    outilChoisir: outil('choisir'), outilVue: outil('vue'), outilZoom: outil('zoom'), outilRectangle: tracer('rectangle'), outilPolygone: tracer('polygone'), outilLigne: tracer('ligne'), outilPoint: tracer('point'),
    // S choisit la selection ; S de nouveau passe de la boite au lasso.
    outilSelection: () => { if (vue.outil === 'selection') vue.setMode(vue.mode === 'boite' ? 'lasso' : 'boite'); else vue.setOutil('selection'); },
    etiquettes: () => vue.setEtiquettes((x) => !x), loupe: () => vue.setLoupe((x) => !x), aide: () => vue.setAide((x) => !x),
    semblables: trouverSemblables, caler: calerPris, aimant: aides.basculerAimant,
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
    // L'aimant : un rectangle trace se cale sur le bord de la menuiserie.
    const cadre = forme === 'rectangle' && aides.aimant ? aides.calerPoints([pts[0] ?? { x: 0, y: 0 }, pts[1] ?? { x: 0, y: 0 }]) : pts;
    const cree = forme === 'rectangle' ? creerRectangle(objets, classeChoisie.id, cadre[0] ?? { x: 0, y: 0 }, cadre[1] ?? { x: 0, y: 0 }) : creerPolygone(objets, classeChoisie.id, pts, forme);
    const n: Objet = cible?.type ? { ...cree, type: cible.type } : cree;
    marquage.changer((l) => rangerLesParents([...l, n], banc.classes));
    sel.choisir(n.id);
  };
  return (
    <section className="editeur">
      <BarreHaut banc={banc} meta={meta} rang={rang} total={liste.length} aRelire={relecture.aRelire} modifie={marquage.modifie} envoi={marquage.envoi} relance={relance} onRelancer={() => { void relancer(); }}
        onAller={(k) => { void aller(k); }} onEnregistrer={() => { void marquage.enregistrer(); }} onValider={() => { void validerEtSuivante(); }} onFermer={fermer} />
      <div className="editeur-corps">
        <ColonneOutils outil={vue.outil} mode={vue.mode} onOutil={vue.setOutil} forme={classeChoisie?.forme ?? null} nomClasse={classeChoisie ? libelleDe({ classe: classeChoisie.id, ...(cible?.type ? { type: cible.type } : {}) }, banc.classes) : null} onMode={vue.setMode} etiquettes={vue.etiquettes} onEtiquettes={() => vue.setEtiquettes((x) => !x)}
          loupe={vue.loupe} onLoupe={() => vue.setLoupe((x) => !x)} aimant={aides.aimant} onAimant={aides.basculerAimant} stylet={vue.stylet} onStylet={() => vue.setStylet(!vue.stylet)} onAide={() => vue.setAide(true)} />
        {marquage.objets ? (
          <Scene url={api.fichier(id, 'redressee', meta.redressement?.le ?? '')} L={L} H={H} objets={visibles} classes={banc.classes}
            outil={vue.outil} classe={classeChoisie ?? null} choisi={sel.choisi} onChoisir={sel.choisir}
            selection={sel.selection} modeSelection={vue.mode} onSelectionner={sel.selectionner} onBasculer={sel.basculer} etiquettes={vue.etiquettes} loupe={vue.loupe}
            enTete={<BarreSelection outilSelection={vue.outil === 'selection'} mode={vue.mode} nombre={sel.selection.size} reference={objet ? libelleDe(objet, banc.classes) : null}
              onAligner={(c) => { if (sel.choisi) marquage.changer((l) => aligner(l, sel.selection, sel.choisi as string, c)); }}
              onTaille={(t) => { if (sel.choisi) marquage.changer((l) => memeTaille(l, sel.selection, sel.choisi as string, t)); }} />}
            onCreer={creer} onModifier={(os) => marquage.suivre(os)} onDebutGeste={marquage.debutGeste}
            onMenu={ouvrirMenu}
            stylet={vue.stylet} onStylet={() => { vue.setStylet(true); banc.dire('Stylet détecté : le crayon dessine, les doigts déplacent et zooment (bouton du stylet dans les outils pour revenir).'); }}
            surChoix={<>
              <span className="groupe-scene" role="group" aria-label="Historique">
                <button type="button" className="icone-seule" onClick={marquage.annuler} disabled={!marquage.peutAnnuler} title="Annuler (Ctrl+Z)" aria-label="Annuler"><Icone nom="annuler" /></button>
                <button type="button" className="icone-seule" onClick={marquage.refaire} disabled={!marquage.peutRefaire} title="Rejouer (Ctrl+Y)" aria-label="Rejouer"><Icone nom="rejouer" /></button>
              </span>
              {(sel.cibles.size > 0 || presse.contenu) && <span className="groupe-scene" role="group" aria-label="L’objet choisi">
                {objet?.forme === 'rectangle' && sel.cibles.size === 1 && <button type="button" className="icone-seule" onClick={trouverSemblables} disabled={!aides.pret} title="Trouver les semblables : celles qui lui ressemblent sur la photo (F)" aria-label="Trouver les semblables (F)"><Icone nom="semblables" /></button>}
                {objets.some((o) => sel.cibles.has(o.id) && o.forme === 'rectangle') && <button type="button" className="icone-seule" onClick={calerPris} disabled={!aides.pret} title="Coller au bord de la menuiserie (C)" aria-label="Coller au bord (C)"><Icone nom="caler" /></button>}
                {sel.cibles.size > 0 && <button type="button" className="icone-seule" onClick={() => presse.copier(false)} title={sel.cibles.size > 1 ? `Copier les ${sel.cibles.size} (Ctrl+C)` : 'Copier (Ctrl+C)'} aria-label="Copier"><Icone nom="copier" /></button>}
                {presse.contenu && <button type="button" className="icone-seule" onClick={presse.coller} title={`Coller ${presse.contenu.nombre > 1 ? `les ${presse.contenu.nombre} objets` : 'l’objet'} copié${presse.contenu.nombre > 1 ? 's' : ''}${presse.contenu.autrePhoto ? ' (d’une autre photo)' : ''} (Ctrl+V)`} aria-label="Coller"><Icone nom="coller" /></button>}
                {sel.cibles.size > 0 && <button type="button" className="danger icone-seule" onClick={retirerPris} title={sel.cibles.size > 1 ? `Supprimer les ${sel.cibles.size} (Suppr ou X)` : 'Supprimer (Suppr ou X)'} aria-label={sel.cibles.size > 1 ? `Supprimer les ${sel.cibles.size} objets` : 'Supprimer'}><Icone nom="poubelle" /></button>}
                {sel.cibles.size > 0 && <button type="button" className="icone-seule" onClick={() => sel.choisir(null)} title="Ne plus rien choisir (Échap)" aria-label="Ne plus rien choisir"><Icone nom="fermer" /></button>}
              </span>}
            </>} />
        ) : <p className="etat scene-attente">Chargement du marquage…</p>}
        <Inspecteur objets={objets} classes={banc.classes} choisi={sel.choisi} selection={sel.selection} relecture={relecture} aPoser={vue.aPoser} recents={vue.recents}
          caches={vue.caches} pressePapiers={presse.contenu} onChoisir={sel.choisir} onCacher={vue.basculerCache}
          onChanger={(os) => { const m = new Map(os.map((o) => [o.id, o])); marquage.changer((l) => l.map((x) => m.get(x.id) ?? x)); }}
          onSupprimer={retirerPris} onCopier={() => presse.copier(false)} onCouper={() => presse.copier(true)} onColler={presse.coller} onPalette={palette} />
      </div>
      <BandeauPhotos photos={photos} courante={id} onAller={(k) => { void aller(k); }} />
      {vue.aide && <AideRaccourcis onFermer={() => vue.setAide(false)} />}
      {menu && sel.cibles.size > 0 && <MenuObjet x={menu.x} y={menu.y} objets={objets.filter((o) => sel.cibles.has(o.id))} classes={banc.classes} onFermer={() => setMenu(null)}
        onChoisir={(c) => { vue.retenir(c.type ? `${c.classe}:${c.type}` : c.classe); marquage.changer((l) => qualifier(l, sel.cibles, c, banc.classes)); }}
        onCopier={() => presse.copier(false)} onSupprimer={retirerPris} />}
    </section>
  );
}

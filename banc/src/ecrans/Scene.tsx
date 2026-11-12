// La photo redressee et son marquage, en SVG : les objets a leur couleur de classe, les poignees de l'objet choisi, le trace en cours.
// Molette, boutons ou deux doigts : zoom ; glisser le fond (outil Choisir), ou espace + glisser, ou clic du milieu : deplacer la vue.
// Au doigt, un point se vise avant d'etre pose : le doigt pose montre la loupe, il glisse, et le point se pose quand il se leve.
// Outil Selection : une boite ou un lasso prend les objets entierement dedans ; Maj + clic en ajoute ou en retire un ; toucher un objet
// de la selection en fait la reference (pour aligner et donner la meme taille) ; tirer un objet de la selection deplace tout le groupe.

import { useEffect, useRef, useState, type PointerEvent as PE, type ReactNode } from 'react';
import type { Classe, Forme, Objet, P } from '../types.js';
import { boite, contour } from '../geometrie.js';
import { libelleDe } from '../classes.js';
import { Loupe } from './Loupe.js';
import { BoutonsZoom, useZoom } from './useZoom.js';
import { cadrer, vueDuCadre } from '../zoom.js';
import { ajouterSommet, deplacer, objetsDansLaZone, poignees, retirerSommet, tirerPoignee, zoneDeSelection } from '../edition.js';

/** Les outils : choisir et deplacer les objets, selectionner (boite, lasso), deplacer la vue (main), zoomer, et tracer une forme. */
export type Outil = 'choisir' | 'selection' | 'vue' | 'zoom' | Forme;
export type ModeSelection = 'boite' | 'lasso';

interface Vue { x: number; y: number; w: number; h: number }
type Geste =
  | { type: 'viser' }
  // `ecran` : ou le geste a commence a l'ecran ; `parti` : il a depasse le seuil (avant, toucher ne fait que choisir).
  // `groupe` : les objets deplaces ensemble (la selection), tels qu'au debut du geste.
  | { type: 'deplacer'; groupe: Objet[]; ecran: P; parti: boolean }
  | { type: 'poignee'; objet: Objet; k: number; ecran: P; parti: boolean }
  | { type: 'rectangle'; depart: P; courant: P }
  // L'outil Zoom : un clic rapproche (Alt ou Maj : eloigne), un cadre tire devient la vue.
  | { type: 'cadre'; depart: P; courant: P; arriere: boolean }
  // La zone d'une selection en cours ; `sur` : l'objet touche au depart (un toucher sans glisse le choisit).
  | { type: 'zone'; points: P[]; sur: string | null; ajouter: boolean }
  | { type: 'vue'; depart: { x: number; y: number }; vue: Vue };

interface Props {
  url: string; L: number; H: number; objets: Objet[]; classes: Classe[]; outil: Outil; classe: Classe | null; choisi: string | null;
  /** Les objets selectionnes (le choisi, la reference, en fait partie) et la forme de la zone de l'outil Selection. */
  selection: ReadonlySet<string>; modeSelection: ModeSelection;
  onChoisir: (id: string | null) => void;
  /** Une zone tiree : ces objets deviennent la selection (ou s'y ajoutent, Maj). */
  onSelectionner: (ids: string[], ajouter: boolean) => void;
  /** Maj + clic : l'objet entre dans la selection ou en sort. */
  onBasculer: (id: string) => void;
  onCreer: (points: P[], forme: Forme) => void;
  /** `fin` : le geste est fini ; sinon les objets suivent le doigt. L'etat d'avant le geste est note par onDebutGeste. */
  onModifier: (objets: Objet[], fin: boolean) => void;
  onDebutGeste: () => void;
  /** Les modes poses en bas de la photo (main, zoom, selection) changent l'outil de l'editeur. */
  onOutil: (o: Outil) => void;
  onModeSelection: (m: ModeSelection) => void;
  /** Ce qui se pose en haut de la photo (les actions de la selection). */
  enTete?: ReactNode;
}

/** Un point marque (la pointe d'un pignon) : un cercle et sa croix, a la couleur de sa classe. */
function PointMarque({ p, couleur, r, trait, onPointerDown }: { p: P; couleur: string; r: number; trait: number; onPointerDown: (e: PE<SVGElement>) => void }) {
  return (
    <g onPointerDown={onPointerDown} className="point-marque">
      <circle cx={p.x} cy={p.y} r={r} fill={couleur} fillOpacity={0.25} stroke={couleur} strokeWidth={trait} />
      <path d={`M${p.x - r * 1.6} ${p.y}H${p.x + r * 1.6}M${p.x} ${p.y - r * 1.6}V${p.y + r * 1.6}`} stroke={couleur} strokeWidth={trait} />
    </g>
  );
}

/** Les boutons poses sur la photo : finir le trace (au doigt, ni double clic ni Entree), retirer son dernier point, le zoom, la loupe. */
function OutilsScene({ finir, retirer, zoomer, ajuster, titreAjuster, loupe, basculerLoupe, outil, modeSelection, onOutil, onModeSelection }: {
  finir: (() => void) | null; retirer: (() => void) | null; zoomer: (k: number) => void; ajuster: () => void; titreAjuster: string; loupe: boolean; basculerLoupe: () => void;
  outil: Outil; modeSelection: ModeSelection; onOutil: (o: Outil) => void; onModeSelection: (m: ModeSelection) => void;
}) {
  const mode = (o: Outil, m?: ModeSelection) => o === outil && (!m || m === modeSelection);
  const bouton = (o: Outil, picto: string, titre: string, m?: ModeSelection) => (
    <button type="button" className={mode(o, m) ? 'onglet actif' : 'onglet'} aria-pressed={mode(o, m)} title={titre} aria-label={titre} onClick={() => { onOutil(o); if (m) onModeSelection(m); }}>{picto}</button>
  );
  return (
    <div className="outils-scene">
      {finir && <button type="button" className="principal" onClick={finir}>Finir le tracé</button>}
      {retirer && <button type="button" onClick={retirer}>Retirer le dernier point</button>}
      <span className="modes-scene" role="group" aria-label="Mode de la souris">
        {bouton('choisir', '☝', 'Choisir, déplacer, redimensionner (V)')}
        {bouton('vue', '✋', 'Déplacer la vue (H, ou Espace + glisser)')}
        {bouton('zoom', '🔍', 'Zoom (Z) : clic pour rapprocher, Alt + clic pour éloigner, tirer un cadre pour le montrer')}
        {bouton('selection', '⬚', 'Sélection en boîte (S)', 'boite')}
        {bouton('selection', '➰', 'Sélection au lasso (S)', 'lasso')}
      </span>
      <BoutonsZoom zoomer={zoomer} ajuster={ajuster} titreAjuster={titreAjuster} />
      <button type="button" className={loupe ? 'bascule-loupe active' : 'bascule-loupe'} aria-pressed={loupe} title="Loupe automatique (L)" onClick={basculerLoupe}>🔍 Loupe</button>
    </div>
  );
}

/** Le clavier de la scene : espace (deplacer la vue), Echap (annuler), L (la loupe), Entree (finir le trace). */
function useClavier({ espace, trace, minPoints, outil, onCreer, onChoisir, annuler, basculerLoupe, viderTrace }: {
  espace: { current: boolean }; trace: P[]; minPoints: number; outil: Outil; onCreer: (points: P[], forme: Forme) => void;
  onChoisir: (id: string | null) => void; annuler: () => void; basculerLoupe: () => void; viderTrace: () => void;
}) {
  useEffect(() => {
    const bas = (e: KeyboardEvent) => {
      if (e.key === ' ' && !(e.target as HTMLElement).closest('input, select, textarea')) { espace.current = true; e.preventDefault(); }
      if (e.key === 'Escape') { annuler(); onChoisir(null); }
      if (e.key.toLowerCase() === 'l' && !e.ctrlKey && !e.metaKey && !(e.target as HTMLElement).closest('input, select, textarea')) basculerLoupe();
      if (e.key === 'Enter' && trace.length >= minPoints) { onCreer(trace, outil === 'ligne' ? 'ligne' : 'polygone'); viderTrace(); }
    };
    const haut = (e: KeyboardEvent) => { if (e.key === ' ') espace.current = false; };
    window.addEventListener('keydown', bas);
    window.addEventListener('keyup', haut);
    return () => { window.removeEventListener('keydown', bas); window.removeEventListener('keyup', haut); };
  }, [trace, onCreer, onChoisir, outil]);
}

/** Le glisse (pixels d'ecran) au-dela duquel un objet ou une poignee touches se deplacent : un clic ou un toucher ne fait que choisir. */
const SEUIL_SOURIS = 4, SEUIL_DOIGT = 10;

function sansDoublons(l: readonly P[], tolerance: number): P[] {
  return l.filter((p, i) => { const q = l[i - 1]; return !q || Math.hypot(p.x - q.x, p.y - q.y) > tolerance; });
}

/**
 * L'ordre du dessin : du plus grand au plus petit (aire de la boite), pour qu'un objet ne soit jamais recouvert par un plus grand cree apres
 * lui (une facade tracee apres ses fenetres les rendait impossibles a attraper). A aire egale, l'ordre de la liste.
 */
export function parTaille(objets: readonly Objet[]): Objet[] {
  const aire = (o: Objet) => { const b = boite(o.points); return (b.x1 - b.x0) * (b.y1 - b.y0); };
  return objets.map((o, i) => ({ o, i, a: aire(o) })).sort((x, y) => y.a - x.a || x.i - y.i).map((x) => x.o);
}

/** Un point pose avec un outil de trace : le polygone grandit (ou se ferme sur son premier sommet), la ligne grandit, le point se cree. */
function poserUnPoint(p: P, { outil, trace, setTrace, onCreer, tolerance }: { outil: Outil; trace: P[]; setTrace: (t: P[]) => void; onCreer: (points: P[], forme: Forme) => void; tolerance: number }): void {
  if (outil === 'polygone') {
    // Toucher le premier sommet ferme le polygone.
    const premier = trace[0];
    if (premier && trace.length >= 3 && Math.hypot(premier.x - p.x, premier.y - p.y) < tolerance) { onCreer(trace, 'polygone'); setTrace([]); }
    else setTrace([...trace, p]);
  }
  // Une ligne : un point par clic ; Entree ou un double clic la finit (deux points au moins).
  if (outil === 'ligne') setTrace([...trace, p]);
  // Un point (la pointe d'un pignon) : un clic le pose.
  if (outil === 'point') onCreer([p], 'point');
}

/** Les objets dessines : la reference (le choisi) plus marquee, la selection soulignee en pointilles blancs. */
function Dessin({ objets, classes, choisi, selection, echelle, surObjet }: { objets: Objet[]; classes: Classe[]; choisi: string | null; selection: ReadonlySet<string>; echelle: number; surObjet: (e: PE<SVGElement>, o: Objet) => void }) {
  const couleur = (o: Objet) => classes.find((c) => c.id === o.classe)?.couleur ?? '#ff00ff';
  const nom = (o: Objet) => libelleDe(o, classes) + (classes.find((c) => c.id === o.classe)?.types?.length && !o.type ? ' ?' : '');
  const trait = 2 * echelle;
  return (
    <>
      {parTaille(objets).map((o) => {
        const pts = contour(o).map((q) => `${q.x},${q.y}`).join(' ');
        const c = couleur(o), choisiIci = o.id === choisi, pris = selection.size > 1 && selection.has(o.id);
        return (
          <g key={o.id} className={'objet origine-' + o.origine + (choisiIci ? ' choisi' : '') + (pris ? ' selectionne' : '')}>
            {pris && o.forme !== 'point' && <polygon points={contour(o).map((q) => `${q.x},${q.y}`).join(' ')} fill="none" stroke="#fff" strokeWidth={trait * (choisiIci ? 2.5 : 1.5)} strokeDasharray={`${5 * echelle} ${3 * echelle}`} pointerEvents="none" />}
            {o.forme === 'point' ? <PointMarque p={o.points[0] ?? { x: 0, y: 0 }} couleur={c} r={(choisiIci || pris ? 9 : 7) * echelle} trait={trait} onPointerDown={(e) => surObjet(e, o)} />
              : o.forme === 'ligne' ? <polyline points={pts} fill="none" stroke={c} strokeWidth={(choisiIci ? 3 : 2) * trait} onPointerDown={(e) => surObjet(e, o)} /> : <polygon points={pts} fill={c} fillOpacity={choisiIci ? 0.25 : pris ? 0.2 : 0.12} stroke={c} strokeWidth={choisiIci ? 2 * trait : trait} strokeDasharray={o.origine === 'auto' ? `${6 * echelle} ${4 * echelle}` : undefined} onPointerDown={(e) => surObjet(e, o)} />}
            <text x={contour(o)[0]?.x ?? 0} y={(contour(o)[0]?.y ?? 0) - 3 * echelle} fill={c} fontSize={12 * echelle} className="etiquette">{nom(o)}{o.score !== undefined && o.origine === 'auto' ? ' ' + Math.round(o.score * 100) + '%' : ''}</text>
          </g>
        );
      })}
    </>
  );
}

/** Les poignees de l'objet choisi (seul) : ses coins ou sommets, et le petit rond au milieu d'un cote qui ajoute un sommet. */
function Poignees({ o, rayon, surPoignee, ajouter }: { o: Objet; rayon: number; surPoignee: (e: PE<SVGElement>, o: Objet, k: number) => void; ajouter: (k: number) => void }) {
  const ps = poignees(o);
  return (
    <g className="poignees">
      {o.forme !== 'rectangle' && ps.slice(0, o.forme === 'ligne' || o.forme === 'point' ? -1 : undefined).map((a, k) => { const b = ps[(k + 1) % ps.length] as P; return <circle key={'m' + k} cx={(a.x + b.x) / 2} cy={(a.y + b.y) / 2} r={rayon * 0.6} className="milieu" onPointerDown={(e) => { e.stopPropagation(); ajouter(k); }} />; })}
      {ps.map((q, k) => <circle key={k} cx={q.x} cy={q.y} r={rayon} className="poignee" onPointerDown={(e) => surPoignee(e, o, k)} />)}
    </g>
  );
}

export function Scene({ url, L, H, objets, classes, outil, classe, choisi, selection, modeSelection, onChoisir, onSelectionner, onBasculer, onCreer, onModifier, onDebutGeste, onOutil, onModeSelection, enTete }: Props) {
  const svg = useRef<SVGSVGElement>(null);
  const [geste, setGeste] = useState<Geste | null>(null);
  // Le second doigt pose : ce que le premier avait commence (un trait, un deplacement, une visee) s'annule, on zoome.
  const { vue, setVue, zoomer, ajuster, capture } = useZoom(svg, L, H, () => setGeste(null));
  const [trace, setTrace] = useState<P[]>([]);
  const [survol, setSurvol] = useState<P | null>(null);
  // La loupe automatique : L la coupe ou la remet (gardee pour la session de l'editeur).
  const [loupe, setLoupe] = useState(true);
  // Une ligne (egout, sol) se finit a deux points ; un polygone a trois.
  const minPoints = outil === 'ligne' ? 2 : 3;
  const espace = useRef(false);
  const seuil = useRef(SEUIL_SOURIS);
  useEffect(() => { ajuster(); setTrace([]); }, [url, L, H]);
  useEffect(() => { setTrace([]); }, [outil]);
  useClavier({ espace, trace, minPoints, outil, onCreer, onChoisir, annuler: () => { setTrace([]); setGeste(null); }, basculerLoupe: () => setLoupe((x) => !x), viderTrace: () => setTrace([]) });

  // Pixels de la photo par pixel d'ecran (la vue tient entiere dans le cadre : la plus serree des deux directions).
  const r = svg.current?.getBoundingClientRect();
  const echelle = r && r.width > 0 ? Math.max(vue.w / r.width, vue.h / r.height) : vue.w / 1000;
  const point = (e: { clientX: number; clientY: number }): P => {
    const m = svg.current?.getScreenCTM();
    if (!m) return { x: 0, y: 0 };
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    return { x: Math.min(L, Math.max(0, p.x)), y: Math.min(H, Math.max(0, p.y)) };
  };
  const capter = (e: PE<Element>) => svg.current?.setPointerCapture(e.pointerId);
  const seuilDe = (e: PE<Element>) => { seuil.current = e.pointerType === 'touch' ? SEUIL_DOIGT : SEUIL_SOURIS; };

  const fond = (e: PE<SVGSVGElement>) => {
    if (outil === 'selection' && e.button === 0 && !espace.current) { setGeste({ type: 'zone', points: [point(e)], sur: null, ajouter: e.shiftKey }); capter(e); return; }
    if (outil === 'zoom' && e.button === 0) { const p = point(e); setGeste({ type: 'cadre', depart: p, courant: p, arriere: e.altKey || e.shiftKey }); capter(e); return; }
    if (e.button === 1 || espace.current || (outil === 'vue' && e.button === 0) || (outil === 'choisir' && e.button === 0)) {
      if (outil === 'choisir' && e.button === 0 && !espace.current) onChoisir(null);
      setGeste({ type: 'vue', depart: { x: e.clientX, y: e.clientY }, vue }); capter(e); return;
    }
    const p = point(e);
    if (outil === 'rectangle') { setGeste({ type: 'rectangle', depart: p, courant: p }); capter(e); return; }
    // Au doigt, rien ne survole : le point se vise d'abord (la loupe le montre), il se pose quand le doigt se leve.
    if (e.pointerType === 'touch') { setSurvol(p); setGeste({ type: 'viser' }); capter(e); return; }
    poser(p);
  };
  const poser = (p: P) => poserUnPoint(p, { outil, trace, setTrace, onCreer, tolerance: 10 * echelle });
  const surObjet = (e: PE<SVGElement>, o: Objet) => {
    // La main et le zoom ne prennent pas les objets : le geste va au fond.
    if (e.button !== 0 || espace.current || outil === 'vue' || outil === 'zoom') return;
    // Outil Selection : un objet deja pris se tire (avec tout le groupe) ; un autre commence une zone (un toucher le choisit).
    if (outil === 'selection' && !(selection.has(o.id) && !e.shiftKey)) { e.stopPropagation(); seuilDe(e); setGeste({ type: 'zone', points: [point(e)], sur: o.id, ajouter: e.shiftKey }); capter(e); return; }
    if (outil !== 'choisir' && outil !== 'selection') return; e.stopPropagation();
    if (e.shiftKey) { onBasculer(o.id); return; }
    // Un objet de la selection : il en devient la reference, et le glisser deplace tout le groupe.
    const groupe = selection.has(o.id) && selection.size > 1 ? objets.filter((x) => selection.has(x.id)) : [o];
    onChoisir(o.id);
    seuilDe(e);
    setGeste({ type: 'deplacer', groupe, ecran: { x: e.clientX, y: e.clientY }, parti: false });
    capter(e);
  };
  const surPoignee = (e: PE<SVGElement>, o: Objet, k: number) => {
    e.stopPropagation();
    if (e.altKey) { onDebutGeste(); onModifier([retirerSommet(o, k)], true); return; }
    seuilDe(e);
    setGeste({ type: 'poignee', objet: o, k, ecran: { x: e.clientX, y: e.clientY }, parti: false });
    capter(e);
  };
  const bouge = (e: PE<SVGSVGElement>) => {
    const p = point(e);
    setSurvol(p);
    if (!geste || geste.type === 'viser') return;
    if (geste.type === 'vue') {
      const c = svg.current?.getBoundingClientRect();
      const k = c && c.width > 0 ? Math.max(geste.vue.w / c.width, geste.vue.h / c.height) : 1;
      setVue({ ...geste.vue, x: geste.vue.x - (e.clientX - geste.depart.x) * k, y: geste.vue.y - (e.clientY - geste.depart.y) * k });
    } else if (geste.type === 'rectangle' || geste.type === 'cadre') setGeste({ ...geste, courant: p });
    else if (geste.type === 'zone') {
      const der = geste.points[geste.points.length - 1] as P;
      if (modeSelection === 'boite') setGeste({ ...geste, points: [geste.points[0] as P, p] });
      else if (Math.hypot(p.x - der.x, p.y - der.y) > 3 * echelle) setGeste({ ...geste, points: [...geste.points, p] });
    } else {
      // Le deplacement se mesure a l'ecran depuis le debut du geste : si la page bouge sous le doigt (le panneau de l'objet s'ouvre),
      // l'objet ne suit pas.
      const dx = e.clientX - geste.ecran.x, dy = e.clientY - geste.ecran.y;
      if (!geste.parti) {
        if (Math.hypot(dx, dy) < seuil.current) return;
        onDebutGeste();
        setGeste({ ...geste, parti: true });
      }
      if (geste.type === 'deplacer') onModifier(geste.groupe.map((o) => deplacer(o, dx * echelle, dy * echelle, L, H)), false);
      else onModifier([tirerPoignee(geste.objet, geste.k, p, L, H)], false);
    }
  };
  const leve = (e: PE<SVGSVGElement>) => {
    if (!geste) return;
    const p = point(e);
    if (geste.type === 'viser') poser(p);
    else if (geste.type === 'rectangle') {
      if (Math.abs(p.x - geste.depart.x) > 3 * echelle && Math.abs(p.y - geste.depart.y) > 3 * echelle) onCreer([geste.depart, p], 'rectangle');
    } else if (geste.type === 'zone') finirZone(geste);
    else if (geste.type === 'cadre') setVue((v) => vueDuCadre(geste.depart, p, v, 4 * echelle, geste.arriere, L));
    else if (geste.type === 'deplacer') {
      if (geste.parti) onModifier(geste.groupe.map((o) => deplacer(o, (e.clientX - geste.ecran.x) * echelle, (e.clientY - geste.ecran.y) * echelle, L, H)), true);
    } else if (geste.type === 'poignee') { if (geste.parti) onModifier([tirerPoignee(geste.objet, geste.k, p, L, H)], true); }
    setGeste(null);
  };
  // Une zone tiree prend les objets entierement dedans ; un toucher sans glisse choisit l'objet touche (ou vide la selection).
  const finirZone = (g: Extract<Geste, { type: 'zone' }>) => {
    const b = boite(g.points);
    if (b.x1 - b.x0 > 4 * echelle || b.y1 - b.y0 > 4 * echelle) onSelectionner(objetsDansLaZone(objets, zoneDeSelection(g.points, modeSelection)), g.ajouter);
    else if (g.sur && g.ajouter) onBasculer(g.sur);
    else onChoisir(g.sur);
  };
  // « Ajuster » cadre l'objet choisi, ou toute la photo sans choix.
  const objetChoisi = objets.find((o) => o.id === choisi);
  // « Ajuster » cadre la selection (le groupe entier), ou l'objet choisi, ou toute la photo.
  const pris = selection.size > 1 ? objets.filter((o) => selection.has(o.id)) : objetChoisi ? [objetChoisi] : [];
  const ajusterSurLeChoix = () => { if (pris.length) setVue(cadrer(boite(pris.flatMap((o) => o.points)), L)); else ajuster(); };
  const finir = () => { const t = sansDoublons(trace, 4 * echelle); if ((outil === 'polygone' || outil === 'ligne') && t.length >= minPoints) { onCreer(t, outil); setTrace([]); } };

  const trait = 2 * echelle, rayon = 6 * echelle;
  const enCours = geste?.type === 'rectangle' || geste?.type === 'cadre' ? geste : null;
  const zone = geste?.type === 'zone' && geste.points.length > 1 ? zoneDeSelection(geste.points, modeSelection) : null;
  // La loupe se montre quand on ajuste au point pres : un coin ou un sommet tire, un rectangle trace, un polygone en cours, ou l'outil de
  // trace en attente du premier point. Elle se pose du cote oppose au curseur.
  const ajuste = (geste?.type === 'poignee' && geste.parti) || geste?.type === 'rectangle' || geste?.type === 'viser' || (!['choisir', 'selection', 'vue', 'zoom'].includes(outil) && !geste);
  const montrerLoupe = loupe && !!survol && ajuste;
  const coteLoupe = survol && survol.x - vue.x < vue.w / 2 ? 'droite' : 'gauche';
  return (
    <div className="scene-cadre">
    {enTete && <div className="entete-scene">{enTete}</div>}
    {montrerLoupe && survol && <Loupe url={url} L={L} H={H} objets={objets} classes={classes} centre={survol} echelle={echelle} cote={coteLoupe} trace={trace} rectangle={enCours ? { a: enCours.depart, b: enCours.courant } : null} couleur={classe?.couleur ?? '#ffeb3b'} />}
    <OutilsScene finir={trace.length >= minPoints && (outil === 'polygone' || outil === 'ligne') ? finir : null} retirer={trace.length ? () => setTrace(trace.slice(0, -1)) : null}
      zoomer={zoomer} ajuster={ajusterSurLeChoix} titreAjuster={pris.length > 1 ? `Cadrer les ${pris.length} objets sélectionnés` : objetChoisi ? 'Cadrer l’objet choisi' : 'Toute la photo'} loupe={loupe} basculerLoupe={() => setLoupe((x) => !x)}
      outil={outil} modeSelection={modeSelection} onOutil={onOutil} onModeSelection={onModeSelection} />
    <svg ref={svg} className={'scene outil-' + outil} viewBox={`${vue.x} ${vue.y} ${vue.w} ${vue.h}`} preserveAspectRatio="xMidYMid meet"
      {...capture} onPointerDown={fond} onPointerMove={bouge} onPointerUp={leve} onPointerCancel={() => setGeste(null)} onPointerLeave={() => { if (!geste) setSurvol(null); }} onDoubleClick={finir}>
      <image href={url} width={L} height={H} />
      <Dessin objets={objets} classes={classes} choisi={choisi} selection={selection} echelle={echelle} surObjet={surObjet} />
      {objetChoisi && selection.size <= 1 && outil !== 'vue' && outil !== 'zoom' && <Poignees o={objetChoisi} rayon={rayon} surPoignee={surPoignee} ajouter={(k) => { onDebutGeste(); onModifier([ajouterSommet(objetChoisi, k)], true); }} />}
      {enCours && <rect x={Math.min(enCours.depart.x, enCours.courant.x)} y={Math.min(enCours.depart.y, enCours.courant.y)} width={Math.abs(enCours.courant.x - enCours.depart.x)} height={Math.abs(enCours.courant.y - enCours.depart.y)} fill="none" stroke={geste?.type === 'cadre' ? '#fff' : classe?.couleur ?? '#fff'} strokeWidth={trait} strokeDasharray={`${4 * echelle}`} />}
      {zone && <polygon points={zone.map((q) => `${q.x},${q.y}`).join(' ')} className="zone-selection" strokeWidth={trait} strokeDasharray={`${5 * echelle} ${4 * echelle}`} />}
      {trace.length > 0 && <polyline points={[...trace, ...(survol ? [survol] : [])].map((q) => `${q.x},${q.y}`).join(' ')} fill="none" stroke={classe?.couleur ?? '#fff'} strokeWidth={trait} />}
      {trace.map((q, k) => <circle key={'t' + k} cx={q.x} cy={q.y} r={rayon * (k === 0 ? 1.4 : 0.8)} className="poignee" />)}
    </svg>
    </div>
  );
}

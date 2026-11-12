// La photo redressee et son marquage, en SVG : les objets a leur couleur de classe, les poignees de l'objet choisi, le trace en cours.
// Molette, boutons ou deux doigts : zoom ; glisser le fond (outil Choisir), ou espace + glisser, ou clic du milieu : deplacer la vue.
// Au doigt, un point se vise avant d'etre pose : le doigt pose montre la loupe, il glisse, et le point se pose quand il se leve.

import { useEffect, useRef, useState, type PointerEvent as PE } from 'react';
import type { Classe, Forme, Objet, P } from '../types.js';
import { contour } from '../geometrie.js';
import { libelleDe } from '../classes.js';
import { Loupe } from './Loupe.js';
import { BoutonsZoom, useZoom } from './useZoom.js';
import { ajouterSommet, deplacer, poignees, retirerSommet, tirerPoignee } from '../edition.js';

export type Outil = 'choisir' | Forme;

interface Vue { x: number; y: number; w: number; h: number }
type Geste =
  | { type: 'viser' }
  // `ecran` : ou le geste a commence a l'ecran ; `parti` : il a depasse le seuil (avant, toucher ne fait que choisir).
  | { type: 'deplacer'; objet: Objet; ecran: P; parti: boolean }
  | { type: 'poignee'; objet: Objet; k: number; ecran: P; parti: boolean }
  | { type: 'rectangle'; depart: P; courant: P }
  | { type: 'vue'; depart: { x: number; y: number }; vue: Vue };

interface Props {
  url: string; L: number; H: number; objets: Objet[]; classes: Classe[]; outil: Outil; classe: Classe | null; choisi: string | null;
  onChoisir: (id: string | null) => void;
  onCreer: (points: P[], forme: Forme) => void;
  /** `fin` : le geste est fini ; sinon l'objet suit le doigt. L'etat d'avant le geste est note par onDebutGeste. */
  onModifier: (o: Objet, fin: boolean) => void;
  onDebutGeste: () => void;
}

/** Les points d'un trace sans ceux poses deux fois au meme endroit (les deux clics d'un double clic). */
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
function OutilsScene({ finir, retirer, zoomer, ajuster, loupe, basculerLoupe }: { finir: (() => void) | null; retirer: (() => void) | null; zoomer: (k: number) => void; ajuster: () => void; loupe: boolean; basculerLoupe: () => void }) {
  return (
    <div className="outils-scene">
      {finir && <button type="button" className="principal" onClick={finir}>Finir le tracé</button>}
      {retirer && <button type="button" onClick={retirer}>Retirer le dernier point</button>}
      <BoutonsZoom zoomer={zoomer} ajuster={ajuster} />
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

export function Scene({ url, L, H, objets, classes, outil, classe, choisi, onChoisir, onCreer, onModifier, onDebutGeste }: Props) {
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

  const fond = (e: PE<SVGSVGElement>) => {
    if (e.button === 1 || espace.current || (outil === 'choisir' && e.button === 0)) {
      if (outil === 'choisir' && e.button === 0 && !espace.current) onChoisir(null);
      setGeste({ type: 'vue', depart: { x: e.clientX, y: e.clientY }, vue }); capter(e); return;
    }
    const p = point(e);
    if (outil === 'rectangle') { setGeste({ type: 'rectangle', depart: p, courant: p }); capter(e); return; }
    // Au doigt, rien ne survole : le point se vise d'abord (la loupe le montre), il se pose quand le doigt se leve.
    if (e.pointerType === 'touch') { setSurvol(p); setGeste({ type: 'viser' }); capter(e); return; }
    poser(p);
  };
  const poser = (p: P) => {
    if (outil === 'polygone') {
      // Toucher le premier sommet ferme le polygone.
      const premier = trace[0];
      if (premier && trace.length >= 3 && Math.hypot(premier.x - p.x, premier.y - p.y) < 10 * echelle) { onCreer(trace, 'polygone'); setTrace([]); }
      else setTrace([...trace, p]);
    }
    // Une ligne : un point par clic ; Entree ou un double clic la finit (deux points au moins).
    if (outil === 'ligne') setTrace([...trace, p]);
    // Un point (la pointe d'un pignon) : un clic le pose.
    if (outil === 'point') onCreer([p], 'point');
  };
  const surObjet = (e: PE<SVGElement>, o: Objet) => {
    if (outil !== 'choisir' || e.button !== 0 || espace.current) return;
    e.stopPropagation();
    onChoisir(o.id);
    seuil.current = e.pointerType === 'touch' ? SEUIL_DOIGT : SEUIL_SOURIS;
    setGeste({ type: 'deplacer', objet: o, ecran: { x: e.clientX, y: e.clientY }, parti: false });
    capter(e);
  };
  const surPoignee = (e: PE<SVGElement>, o: Objet, k: number) => {
    e.stopPropagation();
    if (e.altKey) { onDebutGeste(); onModifier(retirerSommet(o, k), true); return; }
    seuil.current = e.pointerType === 'touch' ? SEUIL_DOIGT : SEUIL_SOURIS;
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
    } else if (geste.type === 'rectangle') setGeste({ ...geste, courant: p });
    else {
      // Le deplacement se mesure a l'ecran depuis le debut du geste : si la page bouge sous le doigt (le panneau de l'objet s'ouvre),
      // l'objet ne suit pas.
      const dx = e.clientX - geste.ecran.x, dy = e.clientY - geste.ecran.y;
      if (!geste.parti) {
        if (Math.hypot(dx, dy) < seuil.current) return;
        onDebutGeste();
        setGeste({ ...geste, parti: true });
      }
      if (geste.type === 'deplacer') onModifier(deplacer(geste.objet, dx * echelle, dy * echelle, L, H), false);
      else onModifier(tirerPoignee(geste.objet, geste.k, p, L, H), false);
    }
  };
  const leve = (e: PE<SVGSVGElement>) => {
    if (!geste) return;
    const p = point(e);
    if (geste.type === 'viser') poser(p);
    else if (geste.type === 'rectangle') {
      if (Math.abs(p.x - geste.depart.x) > 3 * echelle && Math.abs(p.y - geste.depart.y) > 3 * echelle) onCreer([geste.depart, p], 'rectangle');
    } else if (geste.type === 'deplacer') {
      if (geste.parti) onModifier(deplacer(geste.objet, (e.clientX - geste.ecran.x) * echelle, (e.clientY - geste.ecran.y) * echelle, L, H), true);
    } else if (geste.type === 'poignee') { if (geste.parti) onModifier(tirerPoignee(geste.objet, geste.k, p, L, H), true); }
    setGeste(null);
  };
  const finir = () => { const t = sansDoublons(trace, 4 * echelle); if ((outil === 'polygone' || outil === 'ligne') && t.length >= minPoints) { onCreer(t, outil); setTrace([]); } };

  const couleur = (o: Objet) => classes.find((c) => c.id === o.classe)?.couleur ?? '#ff00ff';
  const nom = (o: Objet) => libelleDe(o, classes) + (classes.find((c) => c.id === o.classe)?.types?.length && !o.type ? ' ?' : '');
  const trait = 2 * echelle, rayon = 6 * echelle;
  const enCours = geste?.type === 'rectangle' ? geste : null;
  // La loupe se montre quand on ajuste au point pres : un coin ou un sommet tire, un rectangle trace, un polygone en cours, ou l'outil de
  // trace en attente du premier point. Elle se pose du cote oppose au curseur.
  const ajuste = (geste?.type === 'poignee' && geste.parti) || geste?.type === 'rectangle' || geste?.type === 'viser' || (outil !== 'choisir' && !geste);
  const montrerLoupe = loupe && !!survol && ajuste;
  const coteLoupe = survol && survol.x - vue.x < vue.w / 2 ? 'droite' : 'gauche';
  return (
    <div className="scene-cadre">
    {montrerLoupe && survol && <Loupe url={url} L={L} H={H} objets={objets} classes={classes} centre={survol} echelle={echelle} cote={coteLoupe} trace={trace} rectangle={enCours ? { a: enCours.depart, b: enCours.courant } : null} couleur={classe?.couleur ?? '#ffeb3b'} />}
    <OutilsScene finir={trace.length >= minPoints && (outil === 'polygone' || outil === 'ligne') ? finir : null} retirer={trace.length ? () => setTrace(trace.slice(0, -1)) : null}
      zoomer={zoomer} ajuster={ajuster} loupe={loupe} basculerLoupe={() => setLoupe((x) => !x)} />
    <svg ref={svg} className={'scene outil-' + outil} viewBox={`${vue.x} ${vue.y} ${vue.w} ${vue.h}`} preserveAspectRatio="xMidYMid meet"
      {...capture} onPointerDown={fond} onPointerMove={bouge} onPointerUp={leve} onPointerCancel={() => setGeste(null)} onPointerLeave={() => { if (!geste) setSurvol(null); }} onDoubleClick={finir}>
      <image href={url} width={L} height={H} />
      {objets.map((o) => {
        const pts = contour(o).map((q) => `${q.x},${q.y}`).join(' ');
        const c = couleur(o), choisiIci = o.id === choisi;
        return (
          <g key={o.id} className={'objet origine-' + o.origine + (choisiIci ? ' choisi' : '')}>
            {o.forme === 'point' ? <PointMarque p={o.points[0] ?? { x: 0, y: 0 }} couleur={c} r={(choisiIci ? 9 : 7) * echelle} trait={trait} onPointerDown={(e) => surObjet(e, o)} />
              : o.forme === 'ligne' ? <polyline points={pts} fill="none" stroke={c} strokeWidth={(choisiIci ? 3 : 2) * trait} onPointerDown={(e) => surObjet(e, o)} /> : <polygon points={pts} fill={c} fillOpacity={choisiIci ? 0.25 : 0.12} stroke={c} strokeWidth={choisiIci ? 2 * trait : trait} strokeDasharray={o.origine === 'auto' ? `${6 * echelle} ${4 * echelle}` : undefined} onPointerDown={(e) => surObjet(e, o)} />}
            <text x={contour(o)[0]?.x ?? 0} y={(contour(o)[0]?.y ?? 0) - 3 * echelle} fill={c} fontSize={12 * echelle} className="etiquette">{nom(o)}{o.score !== undefined && o.origine === 'auto' ? ' ' + Math.round(o.score * 100) + '%' : ''}</text>
          </g>
        );
      })}
      {choisi && (() => {
        const o = objets.find((x) => x.id === choisi);
        if (!o) return null;
        const ps = poignees(o);
        return (
          <g className="poignees">
            {o.forme !== 'rectangle' && ps.slice(0, o.forme === 'ligne' || o.forme === 'point' ? -1 : undefined).map((a, k) => { const b = ps[(k + 1) % ps.length] as P; return <circle key={'m' + k} cx={(a.x + b.x) / 2} cy={(a.y + b.y) / 2} r={rayon * 0.6} className="milieu" onPointerDown={(e) => { e.stopPropagation(); onDebutGeste(); onModifier(ajouterSommet(o, k), true); }} />; })}
            {ps.map((q, k) => <circle key={k} cx={q.x} cy={q.y} r={rayon} className="poignee" onPointerDown={(e) => surPoignee(e, o, k)} />)}
          </g>
        );
      })()}
      {enCours && <rect x={Math.min(enCours.depart.x, enCours.courant.x)} y={Math.min(enCours.depart.y, enCours.courant.y)} width={Math.abs(enCours.courant.x - enCours.depart.x)} height={Math.abs(enCours.courant.y - enCours.depart.y)} fill="none" stroke={classe?.couleur ?? '#fff'} strokeWidth={trait} strokeDasharray={`${4 * echelle}`} />}
      {trace.length > 0 && <polyline points={[...trace, ...(survol ? [survol] : [])].map((q) => `${q.x},${q.y}`).join(' ')} fill="none" stroke={classe?.couleur ?? '#fff'} strokeWidth={trait} />}
      {trace.map((q, k) => <circle key={'t' + k} cx={q.x} cy={q.y} r={rayon * (k === 0 ? 1.4 : 0.8)} className="poignee" />)}
    </svg>
    </div>
  );
}

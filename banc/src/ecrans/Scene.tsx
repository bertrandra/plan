// La photo redressee et son marquage, en SVG : les objets a leur couleur de classe, les poignees de l'objet choisi, le trace en cours.
// Molette : zoom sous le curseur ; glisser le fond (outil Choisir), ou espace + glisser, ou clic du milieu : deplacer la vue.

import { useEffect, useRef, useState, type PointerEvent as PE, type WheelEvent as WE } from 'react';
import type { Classe, Forme, Objet, P } from '../types.js';
import { contour } from '../geometrie.js';
import { libelleDe } from '../classes.js';
import { ajouterSommet, deplacer, poignees, retirerSommet, tirerPoignee } from '../edition.js';

export type Outil = 'choisir' | Forme;

interface Vue { x: number; y: number; w: number; h: number }
type Geste =
  | { type: 'deplacer'; objet: Objet; depart: P }
  | { type: 'poignee'; objet: Objet; k: number }
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

export function Scene({ url, L, H, objets, classes, outil, classe, choisi, onChoisir, onCreer, onModifier, onDebutGeste }: Props) {
  const svg = useRef<SVGSVGElement>(null);
  const [vue, setVue] = useState<Vue>({ x: 0, y: 0, w: L, h: H });
  const [geste, setGeste] = useState<Geste | null>(null);
  const [trace, setTrace] = useState<P[]>([]);
  const [survol, setSurvol] = useState<P | null>(null);
  const espace = useRef(false);
  useEffect(() => { setVue({ x: 0, y: 0, w: L, h: H }); setTrace([]); }, [url, L, H]);
  useEffect(() => { setTrace([]); }, [outil]);
  useEffect(() => {
    const bas = (e: KeyboardEvent) => {
      if (e.key === ' ' && !(e.target as HTMLElement).closest('input, select, textarea')) { espace.current = true; e.preventDefault(); }
      if (e.key === 'Escape') { setTrace([]); setGeste(null); onChoisir(null); }
      if (e.key === 'Enter' && trace.length >= 3) { onCreer(trace, 'polygone'); setTrace([]); }
    };
    const haut = (e: KeyboardEvent) => { if (e.key === ' ') espace.current = false; };
    window.addEventListener('keydown', bas);
    window.addEventListener('keyup', haut);
    return () => { window.removeEventListener('keydown', bas); window.removeEventListener('keyup', haut); };
  }, [trace, onCreer, onChoisir]);

  const echelle = vue.w / (svg.current?.clientWidth || 1000);
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
    if (outil === 'polygone') {
      // Toucher le premier sommet ferme le polygone.
      const premier = trace[0];
      if (premier && trace.length >= 3 && Math.hypot(premier.x - p.x, premier.y - p.y) < 10 * echelle) { onCreer(trace, 'polygone'); setTrace([]); }
      else setTrace([...trace, p]);
    }
  };
  const surObjet = (e: PE<SVGElement>, o: Objet) => {
    if (outil !== 'choisir' || e.button !== 0 || espace.current) return;
    e.stopPropagation();
    onChoisir(o.id);
    onDebutGeste();
    setGeste({ type: 'deplacer', objet: o, depart: point(e) });
    capter(e);
  };
  const surPoignee = (e: PE<SVGElement>, o: Objet, k: number) => {
    e.stopPropagation();
    onDebutGeste();
    if (e.altKey) { onModifier(retirerSommet(o, k), true); return; }
    setGeste({ type: 'poignee', objet: o, k });
    capter(e);
  };
  const bouge = (e: PE<SVGSVGElement>) => {
    const p = point(e);
    setSurvol(p);
    if (!geste) return;
    if (geste.type === 'vue') {
      const k = geste.vue.w / (svg.current?.clientWidth || 1);
      setVue({ ...geste.vue, x: geste.vue.x - (e.clientX - geste.depart.x) * k, y: geste.vue.y - (e.clientY - geste.depart.y) * k });
    } else if (geste.type === 'rectangle') setGeste({ ...geste, courant: p });
    else if (geste.type === 'deplacer') onModifier(deplacer(geste.objet, p.x - geste.depart.x, p.y - geste.depart.y, L, H), false);
    else onModifier(tirerPoignee(geste.objet, geste.k, p, L, H), false);
  };
  const leve = (e: PE<SVGSVGElement>) => {
    if (!geste) return;
    const p = point(e);
    if (geste.type === 'rectangle') {
      if (Math.abs(p.x - geste.depart.x) > 3 * echelle && Math.abs(p.y - geste.depart.y) > 3 * echelle) onCreer([geste.depart, p], 'rectangle');
    } else if (geste.type === 'deplacer') {
      const dx = p.x - geste.depart.x, dy = p.y - geste.depart.y;
      if (Math.hypot(dx, dy) > 0.5) onModifier(deplacer(geste.objet, dx, dy, L, H), true);
    } else if (geste.type === 'poignee') onModifier(tirerPoignee(geste.objet, geste.k, p, L, H), true);
    setGeste(null);
  };
  const molette = (e: WE<SVGSVGElement>) => {
    const p = point(e), k = Math.exp(e.deltaY * 0.0015);
    const w = Math.min(L * 2, Math.max(L / 40, vue.w * k)), h = (w / vue.w) * vue.h;
    setVue({ x: p.x - ((p.x - vue.x) * w) / vue.w, y: p.y - ((p.y - vue.y) * h) / vue.h, w, h });
  };

  const couleur = (o: Objet) => classes.find((c) => c.id === o.classe)?.couleur ?? '#ff00ff';
  const nom = (o: Objet) => libelleDe(o, classes) + (classes.find((c) => c.id === o.classe)?.types?.length && !o.type ? ' ?' : '');
  const trait = 2 * echelle, rayon = 6 * echelle;
  const enCours = geste?.type === 'rectangle' ? geste : null;
  return (
    <svg ref={svg} className={'scene outil-' + outil} viewBox={`${vue.x} ${vue.y} ${vue.w} ${vue.h}`} preserveAspectRatio="xMidYMid meet"
      onPointerDown={fond} onPointerMove={bouge} onPointerUp={leve} onWheel={molette} onDoubleClick={() => { if (outil === 'polygone' && trace.length >= 3) { onCreer(trace, 'polygone'); setTrace([]); } }}>
      <image href={url} width={L} height={H} />
      {objets.map((o) => {
        const pts = contour(o).map((q) => `${q.x},${q.y}`).join(' ');
        const c = couleur(o), choisiIci = o.id === choisi;
        return (
          <g key={o.id} className={'objet origine-' + o.origine + (choisiIci ? ' choisi' : '')}>
            <polygon points={pts} fill={c} fillOpacity={choisiIci ? 0.25 : 0.12} stroke={c} strokeWidth={choisiIci ? 2 * trait : trait} strokeDasharray={o.origine === 'auto' ? `${6 * echelle} ${4 * echelle}` : undefined} onPointerDown={(e) => surObjet(e, o)} />
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
            {o.forme === 'polygone' && ps.map((a, k) => { const b = ps[(k + 1) % ps.length] as P; return <circle key={'m' + k} cx={(a.x + b.x) / 2} cy={(a.y + b.y) / 2} r={rayon * 0.6} className="milieu" onPointerDown={(e) => { e.stopPropagation(); onDebutGeste(); onModifier(ajouterSommet(o, k), true); }} />; })}
            {ps.map((q, k) => <circle key={k} cx={q.x} cy={q.y} r={rayon} className="poignee" onPointerDown={(e) => surPoignee(e, o, k)} />)}
          </g>
        );
      })()}
      {enCours && <rect x={Math.min(enCours.depart.x, enCours.courant.x)} y={Math.min(enCours.depart.y, enCours.courant.y)} width={Math.abs(enCours.courant.x - enCours.depart.x)} height={Math.abs(enCours.courant.y - enCours.depart.y)} fill="none" stroke={classe?.couleur ?? '#fff'} strokeWidth={trait} strokeDasharray={`${4 * echelle}`} />}
      {trace.length > 0 && <polyline points={[...trace, ...(survol ? [survol] : [])].map((q) => `${q.x},${q.y}`).join(' ')} fill="none" stroke={classe?.couleur ?? '#fff'} strokeWidth={trait} />}
      {trace.map((q, k) => <circle key={'t' + k} cx={q.x} cy={q.y} r={rayon * (k === 0 ? 1.4 : 0.8)} className="poignee" />)}
    </svg>
  );
}

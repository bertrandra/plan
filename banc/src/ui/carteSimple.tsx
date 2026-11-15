// Une carte simple sur le fond de l'IGN, partagee par l'ecran d'equilibre et l'import en lot : sa taille, sa vue, ses gestes (molette,
// pincement, glisser, clavier) et ses tuiles. La geometrie vient de carte.ts, comme pour la carte de l'import (qui a ses propres
// couches : cadastre, couverture, apercus). Qui s'en sert pose son dessin par-dessus, en SVG.

import { useCallback, useEffect, useRef, useState, type KeyboardEvent as ToucheReact, type PointerEvent as PointeurReact, type RefObject } from 'react';
import { glisser, pincer, tuiles, urlTuile, zoomerAutour, type P, type Taille, type VueCarte } from '../carte.js';

export interface CarteSimple {
  cadre: RefObject<HTMLDivElement | null>;
  taille: Taille;
  vue: VueCarte | null;
  setVue: (v: VueCarte | ((v: VueCarte | null) => VueCarte | null)) => void;
  zoomer: (dz: number, ancre?: P) => void;
  /** Revient a la vue de depart (`cadrer`). */
  recadrer: () => void;
  /** Ce qu'il faut poser sur le cadre : les gestes de la main et du clavier. */
  gestes: { onPointerDown: (e: PointeurReact<HTMLDivElement>) => void; onPointerMove: (e: PointeurReact<HTMLDivElement>) => void; onPointerUp: (e: PointeurReact<HTMLDivElement>) => void; onPointerCancel: (e: PointeurReact<HTMLDivElement>) => void; onKeyDown: (e: ToucheReact<HTMLDivElement>) => void };
}

/**
 * `cadrer` : la vue de depart, pour une taille donnee (toutes les photos, la France). `glisse` : faux quand un outil de dessin tient
 * le pointeur (le glisser ne deplace alors plus la carte ; la molette et les boutons zooment toujours).
 */
export function useCarteSimple(cadrer: (t: Taille) => VueCarte, glisse = true): CarteSimple {
  const cadre = useRef<HTMLDivElement | null>(null);
  const [taille, setTaille] = useState<Taille>({ l: 0, h: 0 });
  const [vue, setVue] = useState<VueCarte | null>(null);
  const tailleRef = useRef(taille); tailleRef.current = taille;

  useEffect(() => {
    const e = cadre.current;
    if (!e) return;
    const lire = () => setTaille((t) => (t.l === e.clientWidth && t.h === e.clientHeight ? t : { l: e.clientWidth, h: e.clientHeight }));
    lire();
    if (typeof ResizeObserver === 'undefined') return;
    const o = new ResizeObserver(lire);
    o.observe(e);
    return () => o.disconnect();
  }, []);
  useEffect(() => { if (taille.l && !vue) setVue(cadrer(taille)); }, [taille, vue, cadrer]);

  // La molette, hors de React : son ecouteur y est passif et ne peut pas retenir le defilement de la page.
  useEffect(() => {
    const e = cadre.current;
    if (!e) return;
    const molette = (ev: WheelEvent) => {
      ev.preventDefault();
      const r = e.getBoundingClientRect(), dz = Math.max(-0.6, Math.min(0.6, -ev.deltaY * (ev.deltaMode === 1 ? 0.06 : 0.0025)));
      setVue((v) => v && zoomerAutour(v, { x: ev.clientX - r.left, y: ev.clientY - r.top }, tailleRef.current, dz));
    };
    e.addEventListener('wheel', molette, { passive: false });
    return () => e.removeEventListener('wheel', molette);
  }, []);

  const pointeurs = useRef(new Map<number, P>());
  const depart = useRef<{ vue: VueCarte; milieu: P; ecart: number } | null>(null);
  const reperer = (v: VueCarte) => {
    const l = [...pointeurs.current.values()], a = l[0], b = l[1] ?? l[0];
    if (!a || !b) { depart.current = null; return; }
    depart.current = { vue: v, milieu: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, ecart: Math.hypot(a.x - b.x, a.y - b.y) };
  };
  const ou = (ev: PointeurReact): P => { const r = ev.currentTarget.getBoundingClientRect(); return { x: ev.clientX - r.left, y: ev.clientY - r.top }; };
  const onPointerDown = (ev: PointeurReact<HTMLDivElement>) => {
    if (!vue || !glisse || (ev.target as Element).closest('button, [role=button], input, select, label')) return;
    ev.currentTarget.setPointerCapture(ev.pointerId);
    pointeurs.current.set(ev.pointerId, ou(ev));
    reperer(vue);
  };
  const onPointerMove = (ev: PointeurReact<HTMLDivElement>) => {
    if (!pointeurs.current.has(ev.pointerId) || !depart.current) return;
    pointeurs.current.set(ev.pointerId, ou(ev));
    const l = [...pointeurs.current.values()], a = l[0], b = l[1], d = depart.current;
    if (!a) return;
    if (b) setVue(pincer(d.vue, taille, d.milieu, d.ecart, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, Math.hypot(a.x - b.x, a.y - b.y)));
    else setVue(glisser(d.vue, a.x - d.milieu.x, a.y - d.milieu.y));
  };
  const lacher = (ev: PointeurReact<HTMLDivElement>) => { pointeurs.current.delete(ev.pointerId); if (vue) reperer(vue); };
  const zoomer = useCallback((dz: number, ancre?: P) => setVue((v) => v && zoomerAutour(v, ancre ?? { x: tailleRef.current.l / 2, y: tailleRef.current.h / 2 }, tailleRef.current, dz)), []);
  const recadrer = useCallback(() => { if (tailleRef.current.l) setVue(cadrer(tailleRef.current)); }, [cadrer]);
  const onKeyDown = (ev: ToucheReact<HTMLDivElement>) => {
    if ((ev.target as Element).closest('input, select')) return;
    const pas = 80, d: Record<string, [number, number]> = { ArrowLeft: [pas, 0], ArrowRight: [-pas, 0], ArrowUp: [0, pas], ArrowDown: [0, -pas] };
    const g = d[ev.key];
    if (g) { ev.preventDefault(); setVue((v) => v && glisser(v, g[0], g[1])); }
    else if (ev.key === '+' || ev.key === '=') zoomer(1);
    else if (ev.key === '-') zoomer(-1);
    else if (ev.key === '0') recadrer();
  };
  return { cadre, taille, vue, setVue, zoomer, recadrer, gestes: { onPointerDown, onPointerMove, onPointerUp: lacher, onPointerCancel: lacher, onKeyDown } };
}

/** Le fond : les tuiles du Plan IGN qui couvrent la vue (une tuile refusee se cache, pas d'image brisee). */
export function FondIgn({ vue, taille }: { vue: VueCarte; taille: Taille }) {
  return (
    <div className="carte-tuiles" aria-hidden="true">
      {tuiles(vue, taille).map((t) => {
        const g = Math.round(t.gauche), h = Math.round(t.haut);
        return <img key={`${t.z}-${t.x}-${t.y}`} src={urlTuile('plan', t.z, t.x, t.y)} alt="" draggable={false}
          style={{ left: g, top: h, width: Math.round(t.gauche + t.cote) - g, height: Math.round(t.haut + t.cote) - h }}
          onError={(e) => { e.currentTarget.style.visibility = 'hidden'; }} />;
      })}
    </div>
  );
}

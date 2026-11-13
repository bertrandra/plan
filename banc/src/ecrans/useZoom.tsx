// Le zoom d'une photo en SVG, branche sur le DOM : la molette (ecouteur natif non passif, pour que la page ne defile pas avec), le
// pincement a deux doigts (en phase de capture, avant les gestes de l'ecran), et les boutons.

import { useCallback, useEffect, useRef, useState, type PointerEvent as PE, type RefObject } from 'react';
import { pincer, versPhoto, vueEntiere, zoomerAutour, type Cadre, type P, type Vue } from '../zoom.js';
import { Icone } from '../ui/Icones.js';

interface Pince { v0: Vue; cadre: Cadre; milieu0: P; ecart0: number }

const milieuEtEcart = (l: P[]): { milieu: P; ecart: number } => {
  const [a, b] = l as [P, P];
  return { milieu: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, ecart: Math.hypot(a.x - b.x, a.y - b.y) };
};

/**
 * `onPince` est appele quand le second doigt se pose : l'ecran annule ce que le premier a commence (un geste, un point pose).
 * Tant qu'un doigt du pincement reste pose, ses mouvements ne vont pas a l'ecran.
 */
export function useZoom(svg: RefObject<SVGSVGElement | null>, L: number, H: number, onPince?: () => void) {
  const [vue, setVue] = useState<Vue>(() => vueEntiere(L, H));
  const doigts = useRef(new Map<number, P>());
  const pince = useRef<Pince | null>(null);
  const bloque = useRef(false);
  const onPinceRef = useRef(onPince);
  onPinceRef.current = onPince;

  useEffect(() => { setVue(vueEntiere(L, H)); }, [L, H]);

  const cadre = useCallback((): Cadre | null => { const r = svg.current?.getBoundingClientRect(); return r && r.width > 0 ? r : null; }, [svg]);

  // La molette : un ecouteur natif, non passif (celui de React l'est), pour empecher la page de defiler sous la photo.
  useEffect(() => {
    const el = svg.current;
    if (!el) return;
    const molette = (e: WheelEvent) => {
      e.preventDefault();
      const c = cadre();
      if (!c) return;
      // Un cran de molette (100) rapproche d'un tiers environ.
      const k = Math.exp((e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY) * 0.004);
      setVue((v) => zoomerAutour(v, versPhoto({ x: e.clientX, y: e.clientY }, c, v), k, L));
    };
    el.addEventListener('wheel', molette, { passive: false });
    return () => el.removeEventListener('wheel', molette);
  }, [svg, cadre, L]);

  const bas = (e: PE<SVGSVGElement>) => {
    if (e.pointerType !== 'touch') return;
    doigts.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (doigts.current.size === 2) {
      const c = cadre();
      if (!c) return;
      const { milieu, ecart } = milieuEtEcart([...doigts.current.values()]);
      setVue((v) => { pince.current = { v0: v, cadre: c, milieu0: milieu, ecart0: ecart }; return v; });
      bloque.current = true;
      onPinceRef.current?.();
      svg.current?.setPointerCapture(e.pointerId);
      e.stopPropagation();
    } else if (bloque.current) e.stopPropagation();
  };
  const bouge = (e: PE<SVGSVGElement>) => {
    if (!doigts.current.has(e.pointerId)) return;
    doigts.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (!bloque.current) return;
    e.stopPropagation();
    const p = pince.current;
    if (!p || doigts.current.size < 2) return;
    const { milieu, ecart } = milieuEtEcart([...doigts.current.values()]);
    setVue(pincer(p.v0, p.cadre, p.milieu0, p.ecart0, milieu, ecart, L));
  };
  const leve = (e: PE<SVGSVGElement>) => {
    if (!doigts.current.delete(e.pointerId)) return;
    if (bloque.current) e.stopPropagation();
    if (doigts.current.size < 2) pince.current = null;
    if (doigts.current.size === 0) bloque.current = false;
  };

  const zoomer = (k: number) => setVue((v) => zoomerAutour(v, { x: v.x + v.w / 2, y: v.y + v.h / 2 }, k, L));
  return {
    vue, setVue,
    ajuster: () => setVue(vueEntiere(L, H)),
    zoomer,
    /** A poser sur le SVG : ils passent avant les gestes de l'ecran. */
    capture: { onPointerDownCapture: bas, onPointerMoveCapture: bouge, onPointerUpCapture: leve, onPointerCancelCapture: leve },
  };
}

/** Les boutons du zoom, poses sur la photo. */
export function BoutonsZoom({ zoomer, ajuster, titreAjuster }: { zoomer: (k: number) => void; ajuster: () => void; titreAjuster?: string }) {
  return (
    <div className="boutons-zoom" role="group" aria-label="Zoom">
      <button type="button" aria-label="Zoomer" title="Zoomer (molette, ou deux doigts)" onClick={() => zoomer(1 / 2)}>＋</button>
      <button type="button" aria-label="Dézoomer" title="Dézoomer" onClick={() => zoomer(2)}>－</button>
      <button type="button" className="icone-seule" title={titreAjuster ?? 'Toute la photo'} aria-label={titreAjuster ?? 'Toute la photo'} onClick={ajuster}><Icone nom="ajuster" /></button>
    </div>
  );
}

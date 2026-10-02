// Le releve de facade (zones/Releve.tsx) : reglages de l'appareil, reperes SVG et libelles partages.

import { useEffect, useState } from 'react';
import type { P2 } from '../../facade/homographie.js';
import type { TypeOuverture } from '../../model/types.js';


export const fr = (v: number, d = 2) => v.toFixed(d).replace('.', ',');

/** Reglages propres a l'appareil : l'objectif choisi et le champ de chacun. Jamais dans le projet. */
export function lireReglage(cle: string, defaut: number): number {
  try {
    const v = parseFloat(localStorage.getItem('plan.releve.' + cle) || '');
    return Number.isFinite(v) && v > 0 ? v : defaut;
  } catch {
    return defaut;
  }
}
export function ecrireReglage(cle: string, v: number): void {
  try {
    localStorage.setItem('plan.releve.' + cle, String(v));
  } catch {
    /* navigation privee : le reglage vaut pour la seance */
  }
}

/** Un point d'un SVG sous le doigt, dans le repere de son viewBox. */
export function pointSvg(svg: SVGSVGElement, e: { clientX: number; clientY: number }): P2 {
  const m = svg.getScreenCTM();
  if (!m) return { x: 0, y: 0 };
  const p = svg.createSVGPoint();
  p.x = e.clientX;
  p.y = e.clientY;
  const q = p.matrixTransform(m.inverse());
  return { x: q.x, y: q.y };
}

/** Pixels d'ecran par unite du viewBox, suivi au redimensionnement. */
export function useEchelle(ref: React.RefObject<SVGSVGElement | null>, largeurVue: number): number {
  const [echelle, setEchelle] = useState(1);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const maj = () => {
      const m = el.getScreenCTM();
      setEchelle(m ? Math.abs(m.a) : el.clientWidth / Math.max(1, largeurVue));
    };
    maj();
    const ro = new ResizeObserver(maj);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref, largeurVue]);
  return echelle || 1;
}

export const LIBELLES_OUVERTURE: Record<TypeOuverture, string> = {
  fenetre: 'Fenêtre',
  'porte-fenetre': 'Porte-fenêtre',
  porte: 'Porte',
  garage: 'Garage',
};

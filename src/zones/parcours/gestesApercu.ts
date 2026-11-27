// Les gestes de l'apercu des parcelles (import cadastral) : molette, glisser a la souris ou a un
// doigt, pincer a deux doigts. Ils lisent les pointeurs et demandent un cadre a
// geometry/cadreApercu.ts ; le composant (ImportCadastre.tsx) dessine ce cadre.
//
// Un geste qui bouge au-dela du seuil (ou qui pince) est un glisser : le clic qui le termine ne
// choisit aucune parcelle (`aGlisse`). En deca, c'est un toucher, qui choisit comme avant.

import { useEffect, useRef } from 'react';
import type { PointerEvent as PointeurReact, RefObject } from 'react';
import { deplacer, estComplet, estUnGlisser, pointDuCadre, unitesParPixel, zoomer } from '../../geometry/cadreApercu.js';
import type { Boite, Cadre } from '../../geometry/cadreApercu.js';

/** Ce que l'apercu montre a ce rendu, et la facon de changer de cadre : lu par les gestes entre deux rendus. */
export interface VueCourante { cadre: Cadre; complet: Cadre; largeurMin: number; poser: (c: Cadre) => void }

type Pt = { x: number; y: number };
interface Geste {
  pointeurs: Map<number, Pt>;
  depart: Map<number, Pt>;
  cadreDepart: Cadre | null;
  glisse: boolean;
}

const mesurer = (el: SVGSVGElement): { r: DOMRect; b: Boite } => { const r = el.getBoundingClientRect(); return { r, b: { largeur: r.width, hauteur: r.height } }; };

/** Le cadre d'un pincement : le point du dessin sous le milieu des doigts au depart reste sous leur milieu d'a present. */
function pincer(v: VueCourante, depart: Cadre, b: Boite, r: DOMRect, avant: [Pt, Pt], apres: [Pt, Pt]): Cadre | null {
  const d0 = Math.hypot(avant[0].x - avant[1].x, avant[0].y - avant[1].y), d1 = Math.hypot(apres[0].x - apres[1].x, apres[0].y - apres[1].y);
  if (!d0 || !d1) return null;
  const ancre = pointDuCadre(depart, b, (avant[0].x + avant[1].x) / 2 - r.left, (avant[0].y + avant[1].y) / 2 - r.top);
  const z = zoomer(depart, v.complet, v.largeurMin, d1 / d0, ancre);
  const sous = pointDuCadre(z, b, (apres[0].x + apres[1].x) / 2 - r.left, (apres[0].y + apres[1].y) / 2 - r.top);
  return deplacer(z, v.complet, v.largeurMin, ancre.x - sous.x, ancre.y - sous.y);
}

export function useGestesApercu(svg: RefObject<SVGSVGElement | null>, courant: RefObject<VueCourante | null>, monte: boolean) {
  const geste = useRef<Geste>({ pointeurs: new Map(), depart: new Map(), cadreDepart: null, glisse: false });
  // La molette s'ecoute en natif : React la pose en passive, et elle ferait defiler le dialogue sous le zoom.
  useEffect(() => {
    const el = svg.current;
    if (!el) return;
    const molette = (ev: WheelEvent) => {
      const v = courant.current;
      if (!v) return;
      const delta = ev.deltaMode === 1 ? ev.deltaY * 16 : ev.deltaMode === 2 ? ev.deltaY * 400 : ev.deltaY;
      const facteur = Math.exp(-delta * 0.002);
      // Tout est deja vu : reculer encore n'a rien a faire, la molette fait defiler le dialogue.
      if (facteur < 1 && estComplet(v.cadre, v.complet)) return;
      ev.preventDefault();
      const { r, b } = mesurer(el);
      v.poser(zoomer(v.cadre, v.complet, v.largeurMin, facteur, pointDuCadre(v.cadre, b, ev.clientX - r.left, ev.clientY - r.top)));
    };
    el.addEventListener('wheel', molette, { passive: false });
    return () => el.removeEventListener('wheel', molette);
  }, [svg, courant, monte]);

  const repartir = () => {
    const g = geste.current;
    g.depart = new Map(g.pointeurs);
    g.cadreDepart = courant.current?.cadre ?? null;
  };
  return {
    /** Le dernier geste a-t-il glisse ou pince ? Alors son clic ne choisit rien. */
    aGlisse: () => geste.current.glisse,
    poser(ev: PointeurReact<SVGSVGElement>) {
      if (ev.pointerType === 'mouse' && ev.button !== 0) return;
      const g = geste.current;
      if (!g.pointeurs.size) g.glisse = false;
      g.pointeurs.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
      if (g.pointeurs.size > 1) g.glisse = true;
      repartir();
    },
    bouger(ev: PointeurReact<SVGSVGElement>) {
      const g = geste.current, v = courant.current, el = svg.current;
      if (!g.pointeurs.has(ev.pointerId) || !g.cadreDepart || !v || !el) return;
      g.pointeurs.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
      const { r, b } = mesurer(el);
      const ids = [...g.pointeurs.keys()];
      const [a0, b0] = ids.map(id => g.depart.get(id));
      const [a1, b1] = ids.map(id => g.pointeurs.get(id));
      if (!a0 || !a1) return;
      if (ids.length === 1) {
        const dx = a1.x - a0.x, dy = a1.y - a0.y;
        if (!g.glisse && !estUnGlisser(dx, dy)) return;
        // Capturer seulement une fois le glisser reconnu : capture des l'appui, le clic d'un toucher irait au SVG et pas a la parcelle.
        if (!g.glisse) { g.glisse = true; try { el.setPointerCapture(ev.pointerId); } catch { /* pointeur deja relache */ } }
        const u = unitesParPixel(g.cadreDepart, b);
        v.poser(deplacer(g.cadreDepart, v.complet, v.largeurMin, -dx * u, -dy * u));
        return;
      }
      if (!b0 || !b1) return;
      const c = pincer(v, g.cadreDepart, b, r, [a0, b0], [a1, b1]);
      if (c) v.poser(c);
    },
    lever(ev: PointeurReact<SVGSVGElement>) {
      const g = geste.current;
      if (!g.pointeurs.delete(ev.pointerId)) return;
      // Un doigt reste apres un pincement : il reprend d'ici, sans saut.
      if (g.pointeurs.size) repartir();
    }
  };
}

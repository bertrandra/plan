// Le calque des couches d'une terrasse, dessine par-dessus le plan (spec §3.2, render/).
//
// Vis, cadre, solives, lambourdes, lames, lame de rive, planche plate : chaque couche a **sa
// propre** case a cocher, et non un onglet exclusif. On veut pouvoir en superposer deux — voir ou
// tombent les vis sous les solives, par exemple — et un onglet unique l'interdirait.
//
// Le calcul des couches appartient au moteur (`engine/layers.ts`) ; ici, on ne fait que le dessiner.
// Les cases a cocher, elles, sont dans l'explorateur (zones/Explorateur.tsx) depuis l'etape 3 de la
// reconstruction de l'interface : ce module publie la liste des couches et leur visibilite.

import { computeTerrasseLayers } from '../engine/layers.js';
import { ensureConstruction } from '../engine/construction.js';
import { estPlots, MASSIF_COTE_M, supportDe } from '../engine/constantes.js';
import { empriseDalle } from '../engine/structure.js';
import { enPoints } from '../model/formes.js';
import type { Appui } from '../engine/structure.js';
import type { ObjetPlan, PtBrut, PtEcran, Segment } from '../model/types.js';
import type { EtatApp } from '../core/state.js';

const svgNS = 'http://www.w3.org/2000/svg';

/** Les couches, dans l'ordre ou elles sont proposees, avec la couleur qui les identifie. */
export const TERRASSE_LAYER_DEFS: [string, string, string][] = [
  ['vis', 'Vis', '#235e6e'],
  ['cadre', 'Cadre (solive de rive)', '#4a2f18'],
  ['solives', 'Solives', '#6b4a2a'],
  ['lambourdes', 'Lambourdes', '#b45a2a'],
  ['lames', 'Lames', '#c9a15a'],
  ['lameRive', 'Lame de rive (verticale)', '#5c3a1e'],
  ['lamePlat', 'Planche plate (horizontale)', '#d8b06a'],
  ['assise', 'Assise (dalle, massifs)', '#8a8a84']
];

/** Ce qui est affiche. Tout est visible au depart : on masque pour isoler, pas l'inverse. */
export const terrasseLayerVisible: Record<string, boolean> = {
  vis: true, cadre: true, solives: true, lambourdes: true, lames: true, lameRive: true, lamePlat: true, assise: true
};

/** Les vis sont coloriees par le role qu'elles jouent, pas par la couche. */
const VIS_ROLE_COLOR: Record<string, string> = { rive: '#0f3d49', spa: '#a8452a', courant: '#235e6e' };

/**
 * Dessine les couches visibles dans le groupe donne.
 *
 * Les traits **maigrissent** — et les lames passent en pointille — des que plus d'une couche est
 * affichee : superposees a pleine epaisseur, elles forment une bouillie ou l'on ne distingue plus
 * rien. C'est le seul reglage qui depende de ce qui est coche ailleurs.
 *
 * L'ordre de dessin va du plus fin au plus epais : les lames d'abord, les vis en dernier, pour que
 * la couche la plus grosse reste lisible par-dessus les autres.
 */
export function renderTerrasseLayerView(
  groupe: SVGGElement, obj: ObjetPlan | null | undefined, etat: EtatApp, toScreen: (p: PtBrut) => PtEcran
): void {
  groupe.innerHTML = '';
  if (!obj) return;
  const layers = computeTerrasseLayers(obj, etat.objects);
  const multi = Object.values(terrasseLayerVisible).filter(Boolean).length > 1;

  function drawLines(segs: Segment[], color: string, width: number, dash?: string | null) {
    segs.forEach(seg => {
      const a = toScreen(seg.a), b = toScreen(seg.b);
      const l = document.createElementNS(svgNS, 'line');
      l.setAttribute('x1', String(a.x)); l.setAttribute('y1', String(a.y)); l.setAttribute('x2', String(b.x)); l.setAttribute('y2', String(b.y));
      l.setAttribute('stroke', color); l.setAttribute('stroke-width', String(width));
      if (dash) l.setAttribute('stroke-dasharray', dash);
      l.setAttribute('stroke-linecap', 'round');
      groupe.appendChild(l);
    });
  }
  function drawPoints(pts: Appui[], color: string) {
    pts.forEach(p => {
      const s = toScreen(p);
      const ci = document.createElementNS(svgNS, 'circle');
      const isRive = p.role === 'rive';
      ci.setAttribute('cx', String(s.x)); ci.setAttribute('cy', String(s.y)); ci.setAttribute('r', isRive ? '6' : '5');
      ci.setAttribute('fill', VIS_ROLE_COLOR[p.role] || color);
      ci.setAttribute('stroke', '#fff'); ci.setAttribute('stroke-width', '1.2');
      groupe.appendChild(ci);
    });
  }

  // L'assise d'abord, sous tout le reste : la dalle et son debord, ou un massif sous chaque appui.
  if (terrasseLayerVisible.assise) dessinerAssise(groupe, obj, layers.vis, toScreen);
  if (terrasseLayerVisible.lames) drawLines(layers.lames, '#c9a15a', multi ? 0.7 : 1.5, multi ? '2 2' : null);
  if (terrasseLayerVisible.lambourdes) drawLines(layers.lambourdes, '#b45a2a', multi ? 1.5 : 3);
  if (terrasseLayerVisible.solives) drawLines(layers.solives, '#6b4a2a', multi ? 2 : 4);
  if (terrasseLayerVisible.cadre) drawLines(layers.cadre, '#4a2f18', multi ? 3 : 5);
  if (terrasseLayerVisible.lameRive) drawLines(layers.lameRive, '#5c3a1e', multi ? 2 : 4);
  if (terrasseLayerVisible.lamePlat) drawLines(layers.lamePlat, '#d8b06a', multi ? 2 : 4);
  if (terrasseLayerVisible.vis) drawPoints(layers.vis, '#235e6e');
}

/**
 * La dalle sous la terrasse (a couler ou existante), avec son debord, en gris hachure ; ou les
 * massifs de beton sous chaque appui. Rien pour une vis, du concasse ou des dalles stabilisatrices.
 */
function dessinerAssise(groupe: SVGGElement, obj: ObjetPlan, appuis: Appui[], toScreen: (p: PtBrut) => PtEcran): void {
  const c = ensureConstruction(obj);
  if (!estPlots(c)) return;
  const t = supportDe(c.supportType);
  if (t.dalleBeton || c.supportType === 'dalle') {
    const p = document.createElementNS(svgNS, 'polygon');
    p.setAttribute('points', empriseDalle(enPoints(obj).pts).map(q => { const e = toScreen(q); return e.x + ',' + e.y; }).join(' '));
    p.setAttribute('fill', '#8a8a84'); p.setAttribute('fill-opacity', '0.18');
    p.setAttribute('stroke', '#5f5f5a'); p.setAttribute('stroke-width', '1.5'); p.setAttribute('stroke-dasharray', '6 3');
    groupe.appendChild(p);
  }
  if (t.massifs) {
    appuis.forEach(a => {
      const d = MASSIF_COTE_M / 2;
      const coins = [{ x: a.x - d, y: a.y - d }, { x: a.x + d, y: a.y - d }, { x: a.x + d, y: a.y + d }, { x: a.x - d, y: a.y + d }].map(toScreen);
      const r = document.createElementNS(svgNS, 'polygon');
      r.setAttribute('points', coins.map(e => e.x + ',' + e.y).join(' '));
      r.setAttribute('fill', '#8a8a84'); r.setAttribute('fill-opacity', '0.45'); r.setAttribute('stroke', '#5f5f5a'); r.setAttribute('stroke-width', '1');
      groupe.appendChild(r);
    });
  }
}

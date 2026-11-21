// Les ecarts au PLU sur le plan (render/).
//
// Un ecart du projet aux regles du PLU que la personne a verifiees ne se lisait que dans l'onglet PLU du tiroir. Ce calque le
// signale la ou il est : un marqueur sur l'ouvrage en ecart (un triangle a point d'exclamation et le mot « PLU » : la couleur ne
// porte rien seule), et, pour un ecart de recul, le segment mesure de l'ouvrage a la limite avec sa longueur.
//
// C'est un affichage de l'ecran : il lit les verdicts de engine/regles/plu/conformite.ts, ne calcule rien, et aucun export ne le
// dessine (les exports ont leur propre dessin et leurs encres). Le calque est inerte : un toucher le traverse jusqu'a l'objet.

import { creerSvg } from './svg.js';
import { SVG_ECART_PLU, SVG_ECART_PLU_TEXTE, SVG_LABEL_HALO, aLaVirgule } from './theme.js';
import { versEcran, type EtatScene } from '../geometry/vue.js';
import type { VerdictPlu } from '../engine/regles/plu/conformite.js';
import type { ObjetPlan, PtBrut } from '../model/types.js';

/** Ce qu'un objet en ecart montre sur le plan : ses messages (pour qui lit l'ecran sans le voir) et ses reculs mesures. */
export interface EcartSurLePlan {
  objet: ObjetPlan;
  messages: string[];
  reculs: { de: PtBrut; vers: PtBrut; mesure: number }[];
}

/**
 * Les ecarts a dessiner : les verdicts en ecart qui visent un objet du plan, ranges par objet, dans l'ordre du plan. Un verdict de
 * la parcelle entiere (emprise, espaces verts : `objet` nul) n'a pas de place sur le plan ; un objet masque ne montre rien, et une
 * terrasse isolee laisse seule la sienne.
 */
export function ecartsSurLePlan(objets: readonly ObjetPlan[], verdicts: readonly VerdictPlu[], isolement: string | null = null): EcartSurLePlan[] {
  const parObjet = new Map<string, VerdictPlu[]>();
  for (const v of verdicts) {
    if (v.etat !== 'ecart' || !v.objet) continue;
    const liste = parObjet.get(v.objet);
    if (liste) liste.push(v); else parObjet.set(v.objet, [v]);
  }
  return objets.filter((o) => parObjet.has(o.key) && !o.hidden && (isolement === null || o.key === isolement)).map((o) => {
    const vs = parObjet.get(o.key) ?? [];
    return { objet: o, messages: vs.map((v) => v.message), reculs: vs.flatMap((v) => (v.trace && v.mesure !== null ? [{ ...v.trace, mesure: v.mesure }] : [])) };
  });
}

/** Le cote du triangle du marqueur, en pixels : lisible de loin, discret de pres (il ne suit pas le zoom). */
export const TAILLE_MARQUEUR_PLU_PX = 18;

const fr = (v: number): string => aLaVirgule(v.toFixed(2));

/** Le point ou poser le marqueur : le sommet le plus haut a l'ecran (le centre d'un cercle), pour ne pas couvrir le nom de l'objet. */
function ancre(o: ObjetPlan, scene: EtatScene): { x: number; y: number } {
  if (o.type !== 'polygon' || !o.pts.length) return versEcran(scene, o.type === 'circle' ? o.center : { x: 0, y: 0 });
  return o.pts.map((p) => versEcran(scene, p)).reduce((m, p) => (p.y < m.y ? p : m));
}

/** Dessine les ecarts dans `groupe` (vide et refait). */
export function dessinerCalquePlu(groupe: SVGElement, scene: EtatScene, ecarts: readonly EcartSurLePlan[]): void {
  groupe.innerHTML = '';
  const t = TAILLE_MARQUEUR_PLU_PX;
  for (const e of ecarts) {
    const g = creerSvg('g', { class: 'ecartPlu', 'data-objet': e.objet.key, role: 'img' });
    const dit = 'Écart au PLU — ' + e.messages.join(' ');
    g.setAttribute('aria-label', dit);
    const titre = creerSvg('title'); titre.textContent = dit; g.appendChild(titre);
    // Le recul mesure : un trait en pointille de l'ouvrage a la limite, deux butees, et sa longueur au milieu.
    for (const r of e.reculs) {
      const a = versEcran(scene, r.de), b = versEcran(scene, r.vers);
      const l = Math.hypot(b.x - a.x, b.y - a.y) || 1, nx = (-(b.y - a.y) / l) * 5, ny = ((b.x - a.x) / l) * 5;
      const trait = (x1: number, y1: number, x2: number, y2: number, plus: Record<string, string | number> = {}) =>
        g.appendChild(creerSvg('line', { x1: x1.toFixed(1), y1: y1.toFixed(1), x2: x2.toFixed(1), y2: y2.toFixed(1), stroke: SVG_ECART_PLU, 'stroke-width': 2, ...plus }));
      trait(a.x, a.y, b.x, b.y, { 'stroke-dasharray': '5 3', class: 'ecartPluRecul' });
      trait(a.x - nx, a.y - ny, a.x + nx, a.y + ny);
      trait(b.x - nx, b.y - ny, b.x + nx, b.y + ny);
      const cote = creerSvg('text', {
        // Au-dessus du trait ; sous lui quand le recul est si court a l'ecran que la cote toucherait le marqueur de l'ouvrage.
        x: ((a.x + b.x) / 2).toFixed(1), y: ((a.y + b.y) / 2 + (l < 2 * TAILLE_MARQUEUR_PLU_PX ? 17 : -7)).toFixed(1), class: 'ecartPluCote', 'text-anchor': 'middle', 'font-size': 12, 'font-weight': 700,
        'font-family': 'system-ui, sans-serif', fill: SVG_ECART_PLU, 'paint-order': 'stroke', stroke: SVG_LABEL_HALO, 'stroke-width': 3
      });
      cote.textContent = fr(r.mesure) + ' m';
      g.appendChild(cote);
    }
    // Le marqueur : un triangle plein a point d'exclamation, et le mot « PLU » a cote.
    const p = ancre(e.objet, scene), x = p.x, y = p.y - 6;
    g.appendChild(creerSvg('path', {
      class: 'ecartPluMarqueur', d: 'M' + x.toFixed(1) + ',' + (y - t).toFixed(1) + ' L' + (x + t * 0.58).toFixed(1) + ',' + y.toFixed(1) + ' L' + (x - t * 0.58).toFixed(1) + ',' + y.toFixed(1) + ' Z',
      fill: SVG_ECART_PLU, stroke: SVG_LABEL_HALO, 'stroke-width': 2, 'stroke-linejoin': 'round', 'paint-order': 'stroke'
    }));
    const point = creerSvg('text', { x: x.toFixed(1), y: (y - 3).toFixed(1), 'text-anchor': 'middle', 'font-size': 12, 'font-weight': 700, 'font-family': 'system-ui, sans-serif', fill: SVG_ECART_PLU_TEXTE });
    point.textContent = '!';
    g.appendChild(point);
    const mot = creerSvg('text', {
      x: (x + t * 0.58 + 4).toFixed(1), y: (y - 3).toFixed(1), 'font-size': 11, 'font-weight': 700, 'font-family': 'system-ui, sans-serif', 'letter-spacing': '0.04em',
      fill: SVG_ECART_PLU, 'paint-order': 'stroke', stroke: SVG_LABEL_HALO, 'stroke-width': 3
    });
    mot.textContent = 'PLU';
    g.appendChild(mot);
    groupe.appendChild(g);
  }
}

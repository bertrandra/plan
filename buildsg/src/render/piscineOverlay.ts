// Calque des piscines sur le plan : les abords vus de dessus (render/).
//
// Le bassin lui-meme est dessine comme tout objet, avec la couleur de son eau ; ce calque pose
// par-dessus ce que l'on verrait d'en haut, a l'echelle : les parois, l'anneau des margelles,
// l'anneau de la plage (lames en trait fin pour une plage en bois, dallage uni), les poteaux
// d'une plage en hauteur, les profondeurs au petit et au grand bain, et les ruptures de pente
// d'une fosse. Les anneaux sont des chemins a trou (regle paire-impaire) : l'eau reste visible.

import { creerSvg } from './svg.js';
import { versEcran, type EtatScene } from '../geometry/vue.js';
import { clipLineToPolygon } from '../geometry/polygon.js';
import { calculerPiscine, centrePiscine, fr, type PiscineCalculee } from '../engine/piscine.js';
import { retirerOuvertures } from '../engine/structure.js';
import { estPiscine } from '../model/fonctions.js';
import type { ObjetPlan, PtBrut } from '../model/types.js';

export interface EtatCalquePiscines {
  objects: ObjetPlan[];
  scene: EtatScene;
  /** La terrasse isolee : tout le reste est masque (app/isolement.ts). */
  isolement?: string | null;
}

const points = (scene: EtatScene, pts: PtBrut[]): string => pts.map(p => { const s = versEcran(scene, p); return s.x + ',' + s.y; }).join(' ');
const chemin = (scene: EtatScene, pts: PtBrut[]): string => pts.map((p, i) => { const s = versEcran(scene, p); return (i ? 'L' : 'M') + s.x.toFixed(2) + ' ' + s.y.toFixed(2); }).join(' ') + 'Z';

/** Un anneau plein entre deux contours : le trou laisse voir ce qui est dessous. */
function anneau(g: SVGElement, scene: EtatScene, ext: PtBrut[], int: PtBrut[], fill: string, stroke: string, opacite: number): void {
  const p = creerSvg('path');
  p.setAttribute('d', chemin(scene, ext) + ' ' + chemin(scene, int));
  p.setAttribute('fill-rule', 'evenodd');
  p.setAttribute('fill', fill); p.setAttribute('fill-opacity', String(opacite));
  p.setAttribute('stroke', stroke); p.setAttribute('stroke-width', '1');
  g.appendChild(p);
}

function texte(g: SVGElement, scene: EtatScene, p: PtBrut, contenu: string, dy = 0): void {
  const s = versEcran(scene, p);
  const t = creerSvg('text');
  t.setAttribute('x', String(s.x)); t.setAttribute('y', String(s.y + dy));
  t.setAttribute('text-anchor', 'middle'); t.setAttribute('font-size', '11'); t.setAttribute('fill', '#0f3d49');
  t.setAttribute('paint-order', 'stroke'); t.setAttribute('stroke', '#ffffff'); t.setAttribute('stroke-width', '3'); t.setAttribute('stroke-linejoin', 'round');
  t.textContent = contenu;
  g.appendChild(t);
}

/** Les lames d'une plage en bois : des traits paralleles au cote du petit bain, dans l'anneau de la plage. */
function lamesPlage(g: SVGElement, scene: EtatScene, calc: PiscineCalculee): void {
  const { axe, plageExt, margelleExt } = calc;
  // Un trait par lame a l'echelle, jamais plus serre que quatre pixels : de loin, la plage reste
  // hachuree sans devenir une tache.
  const PAS = Math.max(0.15, 4 / scene.scale);
  const proj = plageExt.map(p => (p.x - axe.origine.x) * axe.v.x + (p.y - axe.origine.y) * axe.v.y);
  const s0 = Math.min(...proj), s1 = Math.max(...proj);
  const nb = Math.floor((s1 - s0) / PAS);
  for (let k = 1; k < nb; k++) {
    const s = s0 + k * PAS;
    const origine = { x: axe.origine.x + axe.v.x * s, y: axe.origine.y + axe.v.y * s };
    retirerOuvertures(clipLineToPolygon(origine, axe.u, plageExt), [margelleExt]).forEach(seg => {
      const a = versEcran(scene, seg.a), b = versEcran(scene, seg.b);
      const l = creerSvg('line');
      l.setAttribute('x1', String(a.x)); l.setAttribute('y1', String(a.y)); l.setAttribute('x2', String(b.x)); l.setAttribute('y2', String(b.y));
      l.setAttribute('stroke', '#7a5c2e'); l.setAttribute('stroke-opacity', '0.45'); l.setAttribute('stroke-width', '0.8');
      g.appendChild(l);
    });
  }
}

export function dessinerCalquePiscines(groupe: SVGElement, etat: EtatCalquePiscines): void {
  groupe.innerHTML = '';
  const scene = etat.scene;
  etat.objects
    .filter(o => estPiscine(o) && !o.hidden && (etat.isolement == null || o.key === etat.isolement))
    .forEach(o => {
      const calc = calculerPiscine(o);
      if (!calc) return;
      const r = calc.reglages;
      // De l'exterieur vers l'interieur : la plage, les margelles, les parois.
      if (r.plage !== 'aucune') {
        anneau(groupe, scene, calc.plageExt, calc.margelleExt, r.couleurPlage, '#6b5a44', r.plage === 'dallage' ? 0.75 : 0.55);
        if (r.plage === 'terrasse-bois') lamesPlage(groupe, scene, calc);
        calc.plageBois?.poteauxPositions.forEach(p => {
          const c = versEcran(scene, p), cote = Math.max(4, 0.12 * scene.scale);
          const rect = creerSvg('rect');
          rect.setAttribute('x', String(c.x - cote / 2)); rect.setAttribute('y', String(c.y - cote / 2));
          rect.setAttribute('width', String(cote)); rect.setAttribute('height', String(cote));
          rect.setAttribute('fill', '#4a2f18');
          groupe.appendChild(rect);
        });
      }
      if (r.margelle) anneau(groupe, scene, calc.margelleExt, calc.parois, r.couleurMargelle, '#8a8070', 0.95);
      if (calc.parois !== calc.contour) {
        const paroi = creerSvg('polygon');
        paroi.setAttribute('points', points(scene, calc.parois));
        paroi.setAttribute('fill', 'none'); paroi.setAttribute('stroke', '#5a6a70'); paroi.setAttribute('stroke-width', String(Math.max(1, 0.02 * scene.scale)));
        groupe.appendChild(paroi);
      }
      // Les profondeurs : une au centre pour un fond plat, une a chaque bout de l'axe sinon, et les
      // ruptures de pente d'une fosse en pointille.
      const centre = centrePiscine(o);
      const premier = calc.profil[0], dernier = calc.profil[calc.profil.length - 1];
      if (premier && dernier && calc.profil.length === 2 && Math.abs(premier.z - dernier.z) < 1e-9) {
        texte(groupe, scene, centre, 'prof. ' + fr(r.profondeurPetitBain) + ' m', 14);
      } else {
        const { axe } = calc;
        const t = (centre.x - axe.origine.x) * axe.u.x + (centre.y - axe.origine.y) * axe.u.y;
        const sur = (s: number): PtBrut => ({ x: axe.origine.x + axe.u.x * t + axe.v.x * s, y: axe.origine.y + axe.u.y * t + axe.v.y * s });
        texte(groupe, scene, sur(Math.min(0.7, axe.L / 4)), 'PB ' + fr(r.profondeurPetitBain) + ' m', 4);
        texte(groupe, scene, sur(axe.L - Math.min(0.7, axe.L / 4)), 'GB ' + fr(r.profondeurGrandBain) + ' m', 4);
        if (r.fond === 'fosse') calc.profil.slice(1, 3).forEach(pt => {
          const origine = { x: axe.origine.x + axe.v.x * pt.s, y: axe.origine.y + axe.v.y * pt.s };
          clipLineToPolygon(origine, axe.u, calc.contour).forEach(seg => {
            const a = versEcran(scene, seg.a), b = versEcran(scene, seg.b);
            const l = creerSvg('line');
            l.setAttribute('x1', String(a.x)); l.setAttribute('y1', String(a.y)); l.setAttribute('x2', String(b.x)); l.setAttribute('y2', String(b.y));
            l.setAttribute('stroke', '#0f3d49'); l.setAttribute('stroke-dasharray', '5 4'); l.setAttribute('stroke-width', '1');
            groupe.appendChild(l);
          });
        });
      }
    });
}

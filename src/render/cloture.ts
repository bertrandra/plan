// La cloture et ses acces, dessines sur le plan a l'ecran (MD/spec-cloture.md §5, render/).
//
// Chaque troncon est un trait double a l'interieur de la limite, dans un motif propre a son type ;
// un acces coupe le trait, recoit ses piliers, son vantail et son arc de debattement (un battant),
// ou sa course (un coulissant). Seul le plan a l'ecran le montre : les exports gardent leur forme,
// figee par leurs empreintes — la meme regle que les ouvertures relevees (render/releve.ts).

import { facadesDuContour, pointDeFacade, type Facade } from '../facade/geometrie.js';
import {
  clotureDe, reglageDuCote, tronconsDuCote, empriseAcces, vantauxDe, coteValide, epaisseurDe,
  COULEUR_CLOTURE_DEFAUT, DEFAUTS_PAR_TYPE,
} from '../model/cloture.js';
import { aDesSommets } from '../model/formes.js';
import { SVG_INK, SVG_LABEL_HALO } from './theme.js';
import type { ObjetPlan, PtBrut, PtEcran, Portail, ReglageCloture } from '../model/types.js';

const NS = 'http://www.w3.org/2000/svg';
/** Le trait de la cloture court a cette distance de la limite, vers l'interieur, en metres. */
const RETRAIT_TRAIT = 0.15;
/** Les piliers d'un acces, en metres, quand il n'en a pas de declares. */
const TABLEAU = 0.2;

/** Le motif d'un type : epaisseur et tirets, en pixels d'ecran. */
function motif(r: ReglageCloture): { epaisseur: number; tirets: string | null; arrondi: boolean } {
  switch (r.type) {
    case 'mur': return { epaisseur: 2.2, tirets: null, arrondi: false };
    case 'palissade': return { epaisseur: 1.4, tirets: null, arrondi: false };
    case 'grillage': return { epaisseur: 0.9, tirets: '6 3 1.5 3', arrondi: false };
    case 'haie': return { epaisseur: 2.6, tirets: '0.1 4', arrondi: true };
    default: return { epaisseur: 0, tirets: null, arrondi: false };
  }
}

export function dessinerCloture(groupe: SVGGElement, etat: { scene: { scale: number } }, versEcran: (p: PtBrut) => PtEcran, parcelle: ObjetPlan | null | undefined): void {
  if (!parcelle || !aDesSommets(parcelle) || parcelle.pts.length < 3) return;
  const cl = clotureDe(parcelle);
  if (!cl.active) return;
  const pts = parcelle.pts;
  const facades = facadesDuContour(pts, 0);
  const echelle = etat.scene.scale;

  const ligne = (a: PtBrut, b: PtBrut, couleur: string, epaisseur: number, tirets: string | null = null, arrondi = false) => {
    const pa = versEcran(a), pb = versEcran(b);
    const l = document.createElementNS(NS, 'line');
    l.setAttribute('x1', String(pa.x));
    l.setAttribute('y1', String(pa.y));
    l.setAttribute('x2', String(pb.x));
    l.setAttribute('y2', String(pb.y));
    l.setAttribute('stroke', couleur);
    l.setAttribute('stroke-width', String(epaisseur));
    if (tirets) l.setAttribute('stroke-dasharray', tirets);
    if (arrondi) l.setAttribute('stroke-linecap', 'round');
    l.setAttribute('data-cloture', 'trait');
    groupe.appendChild(l);
  };
  const arc = (centre: PtBrut, de: PtBrut, a: PtBrut, rayon: number) => {
    const pc = versEcran(centre), pa = versEcran(de), pb = versEcran(a);
    const croix = (pa.x - pc.x) * (pb.y - pc.y) - (pa.y - pc.y) * (pb.x - pc.x);
    const el = document.createElementNS(NS, 'path');
    el.setAttribute('d', `M${pa.x} ${pa.y} A${rayon * echelle} ${rayon * echelle} 0 0 ${croix > 0 ? 1 : 0} ${pb.x} ${pb.y}`);
    el.setAttribute('fill', 'none');
    el.setAttribute('stroke', SVG_INK);
    el.setAttribute('stroke-width', '0.7');
    el.setAttribute('stroke-dasharray', '3 2');
    el.setAttribute('data-cloture', 'arc');
    groupe.appendChild(el);
  };
  const dedans = (f: Facade, p: PtBrut, d: number): PtBrut => ({ x: p.x - f.normale.x * d, y: p.y - f.normale.y * d });

  // Les troncons, cote par cote.
  for (let i = 0; i < pts.length; i++) {
    const f = facades.find(x => x.cote === i);
    if (!f) continue;
    const r = reglageDuCote(cl, i);
    const m = motif(r);
    if (!m.epaisseur) continue;
    const couleur = r.couleur || DEFAUTS_PAR_TYPE[r.type].couleur || COULEUR_CLOTURE_DEFAUT;
    const recul = RETRAIT_TRAIT + epaisseurDe(r) / 2;
    for (const t of tronconsDuCote(cl, i, f.largeur)) {
      ligne(dedans(f, pointDeFacade(f, t.debut), recul), dedans(f, pointDeFacade(f, t.fin), recul), couleur, m.epaisseur, m.tirets, m.arrondi);
      if (r.type === 'palissade') {
        // Un tiret perpendiculaire tous les 2 m : les poteaux.
        for (let x = t.debut; x <= t.fin + 0.001; x += 2) {
          const p = pointDeFacade(f, Math.min(x, t.fin));
          ligne(dedans(f, p, recul - 0.12), dedans(f, p, recul + 0.12), couleur, 1.2);
        }
      }
    }
  }

  // Les acces.
  for (const a of cl.portails) {
    if (!coteValide(pts, a.cote)) continue;
    const f = facades.find(x => x.cote === a.cote);
    if (!f) continue;
    dessinerAcces(f, a);
  }

  function dessinerAcces(f: Facade, a: Portail): void {
    const x0 = Math.max(0, a.x), x1 = Math.min(f.largeur, a.x + a.largeur);
    if (x1 - x0 < 0.05) return;
    const recul = Math.max(0, a.retrait);
    const e = empriseAcces(a);
    const pl = a.piliers ? a.piliers.largeur : TABLEAU;
    // La coupure dans la limite elle-meme, de la couleur du fond, comme une baie coupe un mur.
    ligne(pointDeFacade(f, Math.max(0, e.debut)), pointDeFacade(f, Math.min(f.largeur, e.fin)), SVG_LABEL_HALO, 3.4);
    // Les piliers : deux carres pleins de part et d'autre du passage, en retrait s'il y en a un.
    for (const x of [x0 - pl, x1]) {
      const p = dedans(f, pointDeFacade(f, x), recul);
      const q = dedans(f, pointDeFacade(f, x + pl), recul);
      const poly = document.createElementNS(NS, 'polygon');
      const coins = [p, q, dedans(f, q, pl), dedans(f, p, pl)].map(versEcran);
      poly.setAttribute('points', coins.map(c => `${c.x},${c.y}`).join(' '));
      poly.setAttribute('fill', SVG_INK);
      poly.setAttribute('data-cloture', 'pilier');
      groupe.appendChild(poly);
    }
    if (recul > 0) {
      // Les deux retours, de l'alignement aux piliers.
      for (const x of [x0 - pl, x1 + pl]) {
        const p = pointDeFacade(f, x);
        ligne(p, dedans(f, p, recul), SVG_INK, 1.2);
      }
    }
    const gauche = dedans(f, pointDeFacade(f, x0), recul);
    const droite = dedans(f, pointDeFacade(f, x1), recul);
    if (a.ouverture === 'coulissant') {
      // Le vantail ferme sur le passage, et sa course de rangement derriere la cloture.
      ligne(gauche, droite, SVG_INK, 1.4);
      const sens = a.refoulement === 'gauche' ? -1 : 1;
      const depart = sens < 0 ? gauche : droite;
      const bout = pointDeFacade(f, (sens < 0 ? x0 : x1) + sens * (x1 - x0));
      ligne(dedans(f, depart, 0.1), dedans(f, bout, recul + 0.1), SVG_INK, 0.8, '4 2');
      return;
    }
    // Les battants, ouverts a 90 degres dans leur sens, et leurs arcs.
    const sens = a.sens === 'exterieur' ? 1 : -1;
    let debut = x0;
    vantauxDe(a).forEach((largeur, k) => {
      const gondADroite = a.ouverture === 'battant-2' && k === 1;
      const gond = dedans(f, pointDeFacade(f, gondADroite ? debut + largeur : debut), recul);
      const fermeBout = dedans(f, pointDeFacade(f, gondADroite ? debut : debut + largeur), recul);
      const bout = { x: gond.x - f.normale.x * sens * largeur, y: gond.y - f.normale.y * sens * largeur };
      ligne(gond, bout, SVG_INK, 1);
      arc(gond, bout, fermeBout, largeur);
      debut += largeur;
    });
  }
}

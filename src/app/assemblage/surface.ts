// La surface du plan : l'element qui le porte, sa racine SVG et ses calques (app/assemblage/).
//
// L'ordre des calques est l'ordre de lecture du plan, du fond vers l'avant : le fond orthophoto, la
// grille, les courbes de niveau du relief, le nom des rues, les objets (dans leur calque, qui porte le repere du dessin :
// render/objects.ts), puis les ombres des parasols (remises devant a chaque rendu), la toile des
// parasols et leurs mats — et, par-dessus, la fleche du
// nord, l'echelle, les cotes et les couches de la terrasse. Ces quatre-la ne sont poses qu'une fois
// les objets crees (`poserCalquesDuDessus`) : c'est ce qui les garde devant.

import { el } from '../../shell/dom.js';
import { svgNS } from '../../render/svg.js';
import { matriceDuRepere } from '../../render/objects.js';
import { matriceDesCalques } from '../../render/repere.js';
import type { EtatScene } from '../../geometry/vue.js';
import type { EtatApp } from '../../core/state.js';

export interface Surface {
  stage: HTMLElement;
  svg: SVGSVGElement;
  ortho: SVGGElement;
  grille: SVGGElement;
  /** Les courbes de niveau du relief (render/relief.ts) : sous les objets, juste au-dessus de la grille. */
  relief: SVGGElement;
  /** Le nom des rues (render/rues.ts) : sous les objets, au-dessus du relief. */
  rues: SVGGElement;
  /**
   * Les objets du plan, en metres sous la transformation du repere du dessin (render/objects.ts) : un zoom ne change qu'elle.
   * L'empilement en sort les parasols (devant leurs ombres) et les poignees de la selection (devant tout).
   */
  objets: SVGGElement;
  /** Ombres des parasols et carte de chaleur : devant les objets, sous la toile des parasols (assemblage/dessin.ts). */
  parasols: SVGGElement;
  /** Les abords des piscines : margelles, plage, profondeurs, juste devant les objets (render/piscineOverlay.ts). */
  piscines: SVGGElement;
  /** La charpente des pergolas vue de dessus : devant les objets et les ombres (render/pergolaOverlay.ts). */
  pergolas: SVGGElement;
  /** Les mats des parasols : remis en fin de SVG a chaque rendu, pour rester lisibles. */
  mats: SVGGElement;
  nord: SVGGElement;
  echelle: SVGGElement;
  cotes: SVGGElement;
  couches: SVGGElement;
  /** Les ouvertures relevees sur les facades (render/releve.ts) et la cloture : par-dessus les objets, en metres. */
  releves: SVGGElement;
  /** Pose la taille de la scene sur le plan, sa racine, et la publie a la feuille de style. */
  appliquerTaille(): void;
  /**
   * Pose l'ecart entre la vue et le repere du dessin (render/repere.ts) : le `viewBox` de la racine le decale, et les calques qui
   * suivent l'ecran (photo, grille, rues, nord, echelle) le compensent.
   */
  poserDecalage(dx: number, dy: number): void;
  /**
   * Pose le repere du dessin sur le calque des objets (render/objects.ts, `matriceDuRepere`) et sur les calques dessines en metres
   * (les releves et la cloture : render/repere.ts, `matriceDesCalques`).
   */
  poserRepere(scene: Pick<EtatScene, 'scale' | 'origine'>): void;
  poserCalquesDuDessus(): void;
}

const groupe = (inerte = false, id?: string): SVGGElement => {
  const g = document.createElementNS(svgNS, 'g');
  if (inerte) g.setAttribute('pointer-events', 'none');
  if (id) g.id = id;
  return g;
};

export function creerSurface(etat: EtatApp): Surface {
  const stage = el('stage');
  const svg = document.createElementNS(svgNS, 'svg');
  // Pointe de fleche pour les points de vue (point + vecteur) : marker-end + orient="auto" suit
  // nativement la tangente du trait, pas besoin de recalculer un angle a chaque deplacement.
  const defs = document.createElementNS(svgNS, 'defs');
  defs.innerHTML = '<marker id="flecheVue" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto" markerUnits="userSpaceOnUse">' +
    '<path d="M0,0 L7,3 L0,6 Z" fill="#6b1f16"/></marker>';
  const s: Surface = {
    stage, svg,
    // Le fond orthophoto est un calque de reference : il ne doit jamais masquer le trace du plan.
    ortho: groupe(true), grille: groupe(),
    // Le relief est un calque de reference comme le fond : les clics le traversent.
    relief: groupe(true, 'reliefGroup'),
    // Le nom des rues aussi : il situe, il ne se clique pas.
    rues: groupe(true, 'ruesGroup'),
    objets: groupe(false, 'objetsGroup'),
    piscines: groupe(true), parasols: groupe(true), pergolas: groupe(true), mats: groupe(true),
    nord: groupe(), echelle: groupe(), cotes: groupe(), couches: groupe(), releves: groupe(true),
    appliquerTaille() {
      stage.style.width = etat.scene.W + 'px'; stage.style.height = etat.scene.H + 'px';
      // L'explorateur et l'inspecteur, de part et d'autre du plan, ne depassent jamais sa hauteur.
      document.getElementById('zoneAtelier')?.style.setProperty('--hauteur-plan', etat.scene.H + 'px');
      svg.setAttribute('width', String(etat.scene.W)); svg.setAttribute('height', String(etat.scene.H));
      s.poserDecalage(0, 0);
    },
    poserDecalage(dx, dy) {
      const boite = -dx + ' ' + -dy + ' ' + etat.scene.W + ' ' + etat.scene.H;
      if (svg.getAttribute('viewBox') !== boite) svg.setAttribute('viewBox', boite);
      const t = dx || dy ? 'translate(' + -dx + ',' + -dy + ')' : null;
      for (const g of [s.ortho, s.grille, s.rues, s.nord, s.echelle]) {
        if (g.getAttribute('transform') === t) continue;
        if (t) g.setAttribute('transform', t); else g.removeAttribute('transform');
      }
    },
    poserRepere(scene) {
      const t = matriceDuRepere(scene), m = matriceDesCalques(scene);
      if (s.objets.getAttribute('transform') !== t) s.objets.setAttribute('transform', t);
      if (s.releves.getAttribute('transform') !== m) s.releves.setAttribute('transform', m);
    },
    poserCalquesDuDessus() { svg.append(s.nord, s.echelle, s.cotes, s.couches); }
  };
  s.appliquerTaille();
  s.poserRepere(etat.scene);
  stage.appendChild(svg);
  svg.append(defs, s.ortho, s.grille, s.relief, s.rues, s.objets, s.piscines, s.parasols, s.pergolas, s.mats, s.releves);
  return s;
}

// Calque des parasols sur le plan : ombres portees, carte d'ensoleillement, pieds de mat
// (spec §3.2, render/parasolOverlay.ts).
//
// Le calcul de l'ombre est deja sorti en phase 3 (engine/parasol.ts). Ce module n'en fait que le
// dessin, et recoit tout ce dont il a besoin : les deux groupes SVG, la racine, l'etat, le
// contexte solaire, et la position du pied de mat - qui depend de reglages du parasol que le
// rendu n'a pas a connaitre.

import { creerSvg } from './svg.js';
import { versEcran, type EtatScene } from '../geometry/vue.js';
import { calculerCartesOmbre, ombreInstantanee, type ContexteSoleil } from '../engine/parasol.js';
import type { PtBrut , ObjetPlan } from '../model/types.js';
import { enCercle } from '../model/formes.js';
import { estParasol } from '../model/fonctions.js';

/**
 * Ce que le calque des parasols lit d'un objet.
 *
 * C'etait une interface locale de quatre champs, ecrite pendant l'extraction. Elle decrivait bien
 * l'exigence mais la coupait du modele : les fonctions appelees ici prennent des objets du plan, et
 * les deux types ne se reconnaissaient plus des que `ObjetPlan` a cesse d'etre `any`. Le calque
 * recoit la liste des objets du plan, donc c'est ce qu'il annonce.
 */
type ObjetParasol = ObjetPlan;

export interface OptionsCalqueParasols {
  /** Ombres et carte d'ensoleillement. */
  groupeOmbres: SVGElement;
  /** Pieds de mat, redessines par-dessus tout le reste. */
  groupeMats: SVGElement;
  racine: SVGElement;
  etat: {
    objects: ObjetParasol[];
    scene: EtatScene;
    parasol: { ombreAffichee: boolean; carteAffichee: boolean };
    /** La terrasse isolee : tout le reste, parasols compris, est masque (app/isolement.ts). */
    isolement?: string | null;
  };
  ctxSoleil: ContexteSoleil;
  positionMat: (par: ObjetParasol) => PtBrut;
}

export function dessinerCalqueParasols(opts: OptionsCalqueParasols): void {
  const { groupeOmbres, groupeMats, racine, etat, ctxSoleil, positionMat } = opts;
  const scene = etat.scene;
  groupeOmbres.innerHTML = '';
  // Un parasol est un cercle (DEFAUTS D-14) : rien a projeter d'un polygone dit « parasol ».
  // Un parasol masque — par lui-meme, ou par une terrasse isolee — ne projette rien.
  const parasols = etat.objects.filter(o=>estParasol(o) && !o.hidden && (etat.isolement == null || o.key === etat.isolement));
  if(!parasols.length) return;

  if(etat.parasol.carteAffichee){
    calculerCartesOmbre(ctxSoleil, etat.objects).forEach(carte=>{
      const cote = carte.pas*scene.scale;
      carte.cells.forEach(c=>{
        if(c.frac <= 0) return;
        const s = versEcran(scene, {x:c.x, y:c.y});
        const rect = creerSvg('rect');
        rect.setAttribute('x', String(s.x-cote/2)); rect.setAttribute('y', String(s.y-cote/2));
        rect.setAttribute('width', String(cote)); rect.setAttribute('height', String(cote));
        rect.setAttribute('fill', '#1e3c5a');
        rect.setAttribute('fill-opacity', String((0.08 + c.frac*0.62).toFixed(3)));
        groupeOmbres.appendChild(rect);
      });
    });
  }
  if(etat.parasol.ombreAffichee){
    parasols.forEach(par=>{
      const g = ombreInstantanee(par, ctxSoleil);
      if(!g) return;
      const s = versEcran(scene, {x:g.cx, y:g.cy});
      const el = creerSvg('ellipse');
      el.setAttribute('cx', String(s.x)); el.setAttribute('cy', String(s.y));
      el.setAttribute('rx', String(g.demiGrand*scene.scale)); el.setAttribute('ry', String(g.demiPetit*scene.scale));
      // L'axe long suit (ux,uy) en coordonnees plan ; a l'ecran l'axe Y est inverse, d'ou -uy.
      const deg = Math.atan2(-g.uy, g.ux) * 180/Math.PI;
      el.setAttribute('transform', 'rotate(' + deg.toFixed(2) + ' ' + s.x + ' ' + s.y + ')');
      el.setAttribute('fill', '#2b3a2a');
      el.setAttribute('fill-opacity', '0.32');
      el.setAttribute('stroke', '#2b3a2a');
      el.setAttribute('stroke-opacity', '0.55');
      el.setAttribute('stroke-dasharray', '4 3');
      groupeOmbres.appendChild(el);
    });
  }
  // Pied du mat : au centre pour un parasol droit, en bord de toile pour un deporte. Redessine
  // par-dessus tout le reste (le groupe est remis en fin de svg juste avant).
  groupeMats.innerHTML = '';
  racine.appendChild(groupeMats);
  parasols.forEach(par=>{
    const m = positionMat(par);
    const s = versEcran(scene, m);
    const c = creerSvg('circle');
    c.setAttribute('cx', String(s.x)); c.setAttribute('cy', String(s.y)); c.setAttribute('r', String(4));
    c.setAttribute('fill', '#3f2d18');
    c.setAttribute('stroke', '#fff'); c.setAttribute('stroke-width', '1.5');
    groupeMats.appendChild(c);
    if(par.matDeporte){
      // Un trait relie le pied au centre de la toile : sans lui, sur un deporte, on ne voit pas
      // a quel parasol appartient ce pied quand plusieurs se chevauchent.
      const sc = versEcran(scene, enCercle(par).center);
      const l = creerSvg('line');
      l.setAttribute('x1', String(s.x)); l.setAttribute('y1', String(s.y));
      l.setAttribute('x2', String(sc.x)); l.setAttribute('y2', String(sc.y));
      l.setAttribute('stroke', '#3f2d18'); l.setAttribute('stroke-width', '1.5');
      l.setAttribute('stroke-dasharray', '3 2');
      groupeMats.appendChild(l);
    }
  });
}

// Le bati : ce qui se releve (toit, facades), sur un polygone (MD/spec-ouvrages.md).
//
// Ce qu'il porte en coordonnees absolues suit son contour quand il bouge d'un bloc : les corps du toit, leurs cheminees et les
// edicules d'une toiture-terrasse, les volumes, la direction du faitage, la grille du toit mesure. Les facades relevees et les
// fenetres, reperees par leur cote, suivent d'elles-memes.

import type { Ouvrage } from './ouvrage.js';
import type { ObjetPlan } from '../types.js';
import { deplacerPoint, type DeplacementRigide } from '../../geometry/deplacement.js';

function suivreContourBati(o: ObjetPlan, d: DeplacementRigide): void {
  const b = o.batiment;
  if (!b) return;
  const pts = (l: { x: number; y: number }[]) => l.map((p) => deplacerPoint(d, p));
  if (b.corpsToit) b.corpsToit = b.corpsToit.map((c) => ({
    ...c,
    pts: pts(c.pts),
    ...(c.cheminees ? { cheminees: c.cheminees.map((ch) => ({ ...ch, ...deplacerPoint(d, ch) })) } : {}),
    ...(c.terrasse?.edicules ? { terrasse: { ...c.terrasse, edicules: c.terrasse.edicules.map((e) => ({ ...e, pts: pts(e.pts) })) } } : {})
  }));
  if (b.volumesToit) b.volumesToit = b.volumesToit.map((v) => ({
    ...v, pts: pts(v.pts), toit: { ...v.toit, angleFaitage: tourneDegres(v.toit.angleFaitage, d) }
  }));
  if (b.toit) b.toit = { ...b.toit, angleFaitage: tourneDegres(b.toit.angleFaitage, d) };
  // La grille du toit mesure est alignee sur les axes du plan : elle se translate, mais ne se tourne pas sans etre relue. Tournee,
  // elle dirait les hauteurs d'un toit qui n'est plus la : elle part, les corps tournes restent.
  if (b.toitMesure) {
    if (Math.abs(Math.sin(d.angle)) < 1e-9 && Math.cos(d.angle) > 0) b.toitMesure = { ...b.toitMesure, x0: b.toitMesure.x0 + d.dx, y0: b.toitMesure.y0 + d.dy };
    else b.toitMesure = null;
  }
}

/** La direction du faitage, en degres depuis l'est et modulo 180, apres la rotation du deplacement. */
function tourneDegres(angle: number, d: DeplacementRigide): number {
  const a = (angle + d.angle * 180 / Math.PI) % 180;
  return a < 0 ? a + 180 : a;
}

export const BATIMENT: Ouvrage = { fonction: 'batiment', libelle: 'Bâtiment', famille: 'bati', formes: ['polygon'], particularites: ['releve'], elevation: 2.5, auMenu: true,
  dossierPiscine: { situation: true, masse: true }, suivreContour: suivreContourBati };

export const ANNEXE: Ouvrage = { fonction: 'annexe', libelle: 'Annexe', famille: 'bati', formes: ['polygon'], particularites: ['releve'], elevation: 2.5, auMenu: true,
  dossierPiscine: { situation: true, masse: true }, suivreContour: suivreContourBati };

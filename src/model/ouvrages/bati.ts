// Le bati : ce qui se releve (toit, facades), sur un polygone (MD/spec-ouvrages.md).
//
// Ce qu'il porte en coordonnees absolues suit son contour quand il bouge d'un bloc : les corps du toit, leurs cheminees et les
// edicules d'une toiture-terrasse, les volumes, la direction du faitage, la grille du toit mesure. Les facades relevees et les
// fenetres, reperees par leur cote, suivent d'elles-memes.
//
// Quand le contour se deforme, ce qui est range par cote suit son mur (model/referencesContour.ts) : un releve de facade en
// proportion de la longueur du mur (ouvertures, partie basse, grille : la photo est etiree sur le mur), une fenetre reglee une par
// une a sa place, bornee au mur. Les saillies (`saillie.hote`, `mur`) sont rangees sur les corps, pas sur le contour : une
// deformation ne les touche pas, la relecture du toit les repose sur les corps neufs (facade/regles/toits/elementsVus.ts).

import type { Ouvrage } from './ouvrage.js';
import type { ObjetPlan, ReleveFacade } from '../types.js';
import { deplacerPoint, type DeplacementRigide } from '../../geometry/deplacement.js';
import { borne, coteOuTombe, coteSuivi, memeCote, milieuReporte, rapportDeLongueur, type Deformation } from '../referencesContour.js';

/** Un releve pose sur un mur dont la longueur a change : ce qui est lu sur sa photo suit en proportion (`k`). */
function releveEnProportion(r: ReleveFacade, k: number): ReleveFacade {
  if (Math.abs(k - 1) < 1e-6) return r;
  return {
    ...r,
    largeur: r.largeur * k,
    ouvertures: r.ouvertures.map((ov) => ({ ...ov, x: ov.x * k, l: ov.l * k })),
    ...(r.partieBasse ? { partieBasse: { ...r.partieBasse, debut: r.partieBasse.debut * k, fin: r.partieBasse.fin * k } } : {}),
    ...(r.grille ? { grille: { ...r.grille, travees: r.grille.travees.map((t) => ({ xM: t.xM * k, largeurM: t.largeurM * k })) } } : {}),
  };
}

function suivreDeformationBati(o: ObjetPlan, d: Deformation): void {
  const b = o.batiment;
  if (!b) return;
  if (b.facades?.length) b.facades = b.facades.map((r) => {
    const vers = coteSuivi(d, r.cote);
    const suivi = vers === r.cote ? r : { ...r, cote: vers };
    return releveEnProportion(suivi, rapportDeLongueur(d, r.cote, vers));
  });
  const liste = b.fenetres3d?.liste;
  if (b.fenetres3d && liste?.length) b.fenetres3d = { ...b.fenetres3d, liste: liste.map((f) => {
    const milieu = f.x + f.l / 2;
    const vers = d.nombreChange ? coteOuTombe(d, f.cote, milieu) : coteSuivi(d, f.cote);
    const r = memeCote(d, f.cote, vers) ? null : milieuReporte(d, f.cote, vers, milieu);
    if (!r) return vers === f.cote ? f : { ...f, cote: vers };
    return { ...f, cote: vers, x: borne(r.milieu - f.l / 2, 0, r.longueur - f.l) };
  }) };
}

/** Une parcelle sous un toit a cheval est supprimee : elle sort de la liste ; a moins de deux, le toit n'est plus a cheval. */
function oublierBati(o: ObjetPlan, cle: string): boolean {
  const ac = o.batiment?.toitACheval;
  if (!o.batiment || !ac?.parcelles.includes(cle)) return false;
  const parcelles = ac.parcelles.filter((p) => p !== cle);
  o.batiment.toitACheval = parcelles.length >= 2 ? { ...ac, parcelles } : null;
  return true;
}

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

export const BATIMENT: Ouvrage = { fonction: 'batiment', libelle: 'Bâtiment', famille: 'bati', formes: ['polygon'], particularites: ['releve'], elevation: 2.5, auMenu: true, toitLuAuLidar: true,
  dossierPiscine: { situation: true, masse: true }, suivreContour: suivreContourBati, suivreDeformation: suivreDeformationBati, oublier: oublierBati };

export const ANNEXE: Ouvrage = { fonction: 'annexe', libelle: 'Annexe', famille: 'bati', formes: ['polygon'], particularites: ['releve'], elevation: 2.5, auMenu: true, toitLuAuLidar: true,
  dossierPiscine: { situation: true, masse: true }, suivreContour: suivreContourBati, suivreDeformation: suivreDeformationBati, oublier: oublierBati };

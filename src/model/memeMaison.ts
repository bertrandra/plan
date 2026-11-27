// Plusieurs batiments de la BD TOPO, une seule maison (MD/spec-toit-ign.md §13.10).
//
// Le raccord des toits (facade/toits/raccord.ts) donne a une aile et au corps qui la porte le meme faitage et les memes egouts.
// Mais la scene posait chaque batiment sur le sol lu en SON centre : sur un terrain en pente, trois batiments d'une meme maison
// etaient a trois altitudes, et des hauteurs egales au-dessus du sol donnaient des faitages et des egouts decales (Hardencourt,
// le proprietaire, 27 novembre 2026 : « j'ai l'impression que les deux toitures du L ne sont pas a la meme hauteur, la realite
// est la meme hauteur »). Et chacun gardait sa couleur de toit lue sur l'orthophoto, sa couverture et sa couleur de mur.
//
// Rien n'est enregistre : la maison se deduit, a chaque dessin, de ce que le raccord a laisse. Deux batiments de la parcelle du
// projet sont la meme maison quand un corps de l'un touche un corps de l'autre (a ACCOLE_M) et qu'ils ont le meme toit : meme
// faitage, memes egouts, au dixieme - ce que seul le raccord produit entre deux batiments lus chacun de son cote. Le plus grand
// des batiments de la maison est son chef : la maison se pose sur le sol en son centre, et s'habille comme lui la ou la personne
// n'a rien choisi a la main.

import { centroid, pointInPolygon, signedArea } from '../geometry/basic.js';
import { SEUILS_TOITS as S } from '../regles/toits/reglages.js';
import { estBatiment, surParcelleDuProjet } from './fonctions.js';
import type { CorpsToit, ObjetPlan, PtBrut } from './types.js';

type Bati = ObjetPlan & { type: 'polygon'; key: string; pts: PtBrut[] };

const estBati = (o: ObjetPlan): o is Bati => o.type === 'polygon' && !!o.key && estBatiment(o) && surParcelleDuProjet(o) && !!o.batiment?.corpsToit?.length;

function distanceAuSegment(p: PtBrut, a: PtBrut, b: PtBrut): number {
  const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy;
  const k = l2 > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2)) : 0;
  return Math.hypot(p.x - a.x - k * dx, p.y - a.y - k * dy);
}

/** Deux rectangles de corps se touchent : un sommet de l'un dans l'autre, ou a moins d'ACCOLE_M d'un de ses cotes. */
function seTouchent(a: readonly PtBrut[], b: readonly PtBrut[]): boolean {
  const pres = (p: readonly PtBrut[], q: readonly PtBrut[]): boolean => p.some((s) => pointInPolygon(s, q) || q.some((c, i) => distanceAuSegment(s, c, q[(i + 1) % q.length] as PtBrut) <= S.ACCOLE_M));
  return pres(a, b) || pres(b, a);
}

/** Le meme toit : deux pans au meme faitage et aux memes egouts des deux cotes. */
const memeToit = (a: CorpsToit, b: CorpsToit): boolean => a.faitage === b.faitage && a.egouts[0] === a.egouts[1] && b.egouts[0] === b.egouts[1] && a.egouts[0] === b.egouts[0] && a.faitage - a.egouts[0] >= S.HAUTEUR_PLAT_M;

const memeMaison = (a: Bati, b: Bati): boolean => (a.batiment?.corpsToit ?? []).some((ca) => (b.batiment?.corpsToit ?? []).some((cb) => memeToit(ca, cb) && seTouchent(ca.pts, cb.pts)));

/**
 * Le chef de la maison de chaque batiment qui en partage une avec d'autres, par cle : le plus grand batiment de la maison (lui
 * compris : il est son propre chef). Un batiment seul n'y est pas.
 */
export function chefsDesMaisons(objets: readonly ObjetPlan[]): Map<string, ObjetPlan> {
  const batis = objets.filter(estBati), groupe = batis.map((_, i) => i);
  const racine = (i: number): number => { let k = i; while (groupe[k] !== k) k = groupe[k] as number; return k; };
  for (let i = 0; i < batis.length; i++) for (let j = i + 1; j < batis.length; j++) {
    if (racine(i) !== racine(j) && memeMaison(batis[i] as Bati, batis[j] as Bati)) groupe[racine(j)] = racine(i);
  }
  const out = new Map<string, ObjetPlan>();
  const aire = (o: Bati): number => Math.abs(signedArea(o.pts));
  batis.forEach((_, i) => {
    const membres = batis.filter((__, j) => racine(j) === racine(i));
    if (membres.length < 2) return;
    const chef = membres.reduce((m, o) => (aire(o) > aire(m) ? o : m));
    out.set((batis[i] as Bati).key, chef);
  });
  return out;
}

/** Le chef de la maison de l'objet `o`, ou lui-meme. */
export function chefDeLaMaison(o: ObjetPlan, objets: readonly ObjetPlan[]): ObjetPlan {
  return (o.key ? chefsDesMaisons(objets).get(o.key) : undefined) ?? o;
}

/** Le point ou se lit le sol sous un batiment : le centre du chef de sa maison (le sien quand il est seul). */
export function pointDePose(o: ObjetPlan & { pts: PtBrut[] }, objets: readonly ObjetPlan[]): PtBrut {
  const chef = chefDeLaMaison(o, objets);
  return centroid(chef.type === 'polygon' ? chef.pts : o.pts);
}

/**
 * Le batiment tel qu'il se dessine dans sa maison : la couverture, la couleur du toit et celle des murs du chef, la ou la
 * personne n'a rien choisi a la main. Choisi a la main, et jamais touche : une couleur de toit sans origine (typesToit.ts,
 * `origineCouleur`), une couverture choisie, une source de couleur de murs choisie, une couleur ou un materiau vus sur place,
 * une texture de mur. Le meme objet quand rien ne change.
 */
export function habilleCommeSaMaison(o: ObjetPlan, chef: ObjetPlan): ObjetPlan {
  if (chef === o || o.type !== 'polygon' || chef.type !== 'polygon') return o;
  const toit = o.batiment?.toit, toitChef = chef.batiment?.toit;
  const bd = (x: ObjetPlan): Record<string, unknown> => (x.bdtopo as Record<string, unknown> | null | undefined) ?? {};
  const bdtopo: Record<string, unknown> = { ...bd(o) };
  let batiment = o.batiment;
  if (toit && toitChef) {
    const couleurChoisie = toit.couleur !== undefined && toit.origineCouleur === undefined;
    const suivi = { ...toit };
    if (!couleurChoisie && toitChef.couleur !== undefined) { suivi.couleur = toitChef.couleur; if (toitChef.origineCouleur) suivi.origineCouleur = toitChef.origineCouleur; }
    if (toit.couverture === undefined) {
      if (toitChef.couverture !== undefined) suivi.couverture = toitChef.couverture;
      bdtopo.materiauxToiture = bd(chef).materiauxToiture;
    }
    batiment = { ...batiment, toit: suivi };
  }
  const murs = o.batiment?.couleurMurs;
  const mursChoisis = !!murs?.source || !!murs?.terrain || !!murs?.materiau || !!o.textureVerticale;
  if (!mursChoisis) {
    batiment = { ...batiment, couleurMurs: chef.batiment?.couleurMurs ?? null };
    bdtopo.materiauxMurs = bd(chef).materiauxMurs;
    if (chef.textureVerticale) return { ...o, batiment, bdtopo, textureVerticale: chef.textureVerticale } as ObjetPlan;
  }
  return { ...o, batiment, bdtopo } as ObjetPlan;
}

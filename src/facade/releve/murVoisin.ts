// Les ouvertures lues sous le pignon d'un corps voisin (decision du proprietaire, 2 novembre 2026, question Q2 ; MD/spec-facade-calage-
// audit.md §5 ter) : la detection lit la facade dans la silhouette entiere, et le pignon d'un corps voisin qui prolonge la facade au-dela
// d'un de ses bouts y est (analyse.ts::cadreDeLaSilhouette). Une baie lue la, hors des cotes du mur (x < 0 ou x > largeur), n'est pas
// une baie de ce mur : elle est sur le mur du corps voisin, un autre cote du contour, dans le plan de la facade.
//
// - Ce cote a deja une facade : la baie s'y ajoute, dans son repere, `detectee`, sauf si une de ses ouvertures la recouvre de plus de
//   moitie (elle y est deja). Rien d'autre de cette facade ne change : ni ses ouvertures verifiees, corrigees ou ajoutees, ni sa texture,
//   ni ses dimensions (V4 ecrit les deux facades en un pas d'historique, app/audit/parcelle/validation.ts).
// - Ce cote n'a pas de facade, ou aucun cote du contour ne porte ce mur (un corps qui deborde le contour) : la baie reste dans la facade
//   photographiee, hors de ses cotes, et l'E9 le dit. Creer une facade sur ce mur effacerait toutes ses fenetres automatiques
//   (§3.3 : un mur qui a une facade objet n'en a plus) pour une ou deux baies vues : non (meme decision).
//
// Le meme calcul sert l'E9 et l'E11 (sur les facades du batiment que les entrees donnent) et V4 (sur celles du projet au moment de
// valider). Pur.

import { recouvrement, RECOUVREMENT_MEME_OUVERTURE } from '../../model/facadeObjet.js';
import { facadesDuContour, type Facade } from '../../geometry/cotesVusDeDehors.js';
import { SILHOUETTES_TOITS } from '../../regles/toits/silhouettes.js';
import type { OuvertureFacade, PtBrut } from '../../model/types.js';

/** Une facade deja relevee d'un autre cote du meme batiment : son cote et ses ouvertures. */
export interface FacadeVoisine { cote: number; ouvertures: readonly OuvertureFacade[] }

/** Le partage des ouvertures d'une facade entre son mur et les murs voisins. */
export interface PartageOuvertures {
  /** Ce qui reste sur la facade : ses ouvertures, et celles du voisin qu'aucune facade ne recoit (`sansFacade`). */
  surLeMur: OuvertureFacade[];
  /** Par cote voisin qui a une facade : les ouvertures a y ajouter, dans son repere (x depuis sa gauche vue de dehors). */
  ajouts: { cote: number; ouvertures: OuvertureFacade[] }[];
  /** Les ouvertures que la facade voisine a deja (recouvrement de plus de moitie) : elles ne s'ajoutent pas, et quittent ce mur. */
  dejaLa: { cote: number; ouverture: OuvertureFacade }[];
  /** Les ouvertures sous un corps voisin dont le mur n'a pas de facade (`cote`), ou qu'aucun cote du contour ne porte (null). */
  sansFacade: { cote: number | null; ouverture: OuvertureFacade }[];
}

/** Deux cotes du contour sont dans le meme plan quand ils sont paralleles a cela pres (cosinus) : le contour du cadastre n'est jamais droit. */
const PARALLELE_COS = Math.cos((5 * Math.PI) / 180);
/** Une baie depasse du cote voisin de cela au plus (une cote arrondie, un angle a quelques centimetres) ; au-dela, elle n'y tient pas. */
const DEBORD_M = 0.05;

/**
 * Le cote du contour, autre que celui de `f`, qui porte le point `p` du plan de la facade : parallele a elle, la meme face dehors, a
 * MUR_CORPS_DISTANCE_M de son plan au plus (le seuil qui dit qu'un mur de corps est dans le plan de la facade), et dont `p` est entre
 * les bouts. Avec son abscisse depuis sa gauche vue de dehors.
 */
function coteQuiPorte(f: Facade, cotes: readonly Facade[], p: PtBrut): { g: Facade; t: number } | null {
  const lf = Math.hypot(f.droite.x - f.gauche.x, f.droite.y - f.gauche.y);
  const ux = (f.droite.x - f.gauche.x) / lf, uy = (f.droite.y - f.gauche.y) / lf;
  let meilleur: { g: Facade; t: number; d: number } | null = null;
  for (const g of cotes) {
    if (g.cote === f.cote || !(g.largeur > 0)) continue;
    const vx = (g.droite.x - g.gauche.x) / g.largeur, vy = (g.droite.y - g.gauche.y) / g.largeur;
    if (ux * vx + uy * vy < PARALLELE_COS) continue;
    const d = Math.abs((g.gauche.x - f.gauche.x) * f.normale.x + (g.gauche.y - f.gauche.y) * f.normale.y);
    if (d > SILHOUETTES_TOITS.seuils.MUR_CORPS_DISTANCE_M) continue;
    const t = (p.x - g.gauche.x) * vx + (p.y - g.gauche.y) * vy;
    if (t < 0 || t > g.largeur) continue;
    if (!meilleur || d < meilleur.d) meilleur = { g, t, d };
  }
  return meilleur;
}

/**
 * Le partage des ouvertures de la facade `f` (au cote `f.cote` du contour `contour`) : celles dont le milieu tombe hors du mur vont au
 * cote voisin qui les porte s'il a une facade parmi `voisines`, sinon restent la. Celles du mur, et celles a cheval sur un de ses angles
 * (le milieu dedans), ne bougent pas.
 */
export function partagerSousLesVoisins(f: Facade, contour: readonly PtBrut[], ouvertures: readonly OuvertureFacade[], voisines: readonly FacadeVoisine[]): PartageOuvertures {
  const out: PartageOuvertures = { surLeMur: [], ajouts: [], dejaLa: [], sansFacade: [] };
  if (!(f.largeur > 0)) return { ...out, surLeMur: [...ouvertures] };
  const cotes = contour.length >= 3 ? facadesDuContour(contour, f.hauteur) : [];
  // Le long du mur, en metres depuis sa gauche (la largeur du releve peut avoir ete corrigee a la main : la direction est celle du cote).
  const lf = Math.hypot(f.droite.x - f.gauche.x, f.droite.y - f.gauche.y);
  if (!(lf > 0)) return { ...out, surLeMur: [...ouvertures] };
  const ux = (f.droite.x - f.gauche.x) / lf, uy = (f.droite.y - f.gauche.y) / lf;
  for (const o of ouvertures) {
    const milieu = o.x + o.l / 2;
    if (milieu >= 0 && milieu <= f.largeur) { out.surLeMur.push(o); continue; }
    const porte = coteQuiPorte(f, cotes, { x: f.gauche.x + milieu * ux, y: f.gauche.y + milieu * uy });
    const voisine = porte ? voisines.find((v) => v.cote === porte.g.cote) : undefined;
    const x = porte ? porte.t - o.l / 2 : 0;
    // La baie, dans le repere du cote voisin, ramenee entre ses bouts quand elle n'en depasse que de quelques centimetres.
    const tient = !!porte && x >= -DEBORD_M && x + o.l <= porte.g.largeur + DEBORD_M;
    if (!porte || !voisine || !tient) { out.surLeMur.push(o); out.sansFacade.push({ cote: porte && tient ? porte.g.cote : null, ouverture: o }); continue; }
    const la: OuvertureFacade = { ...o, x: Math.round(Math.min(Math.max(0, x), porte.g.largeur - o.l) * 1000) / 1000, source: 'detectee' };
    delete la.id;
    delete la.verifieeLe;
    const deja = out.ajouts.find((a) => a.cote === voisine.cote)?.ouvertures ?? [];
    if ([...voisine.ouvertures, ...deja].some((v) => recouvrement(v, la) > RECOUVREMENT_MEME_OUVERTURE)) { out.dejaLa.push({ cote: voisine.cote, ouverture: la }); continue; }
    const a = out.ajouts.find((x) => x.cote === voisine.cote);
    if (a) a.ouvertures.push(la); else out.ajouts.push({ cote: voisine.cote, ouvertures: [la] });
  }
  return out;
}

/** Le partage en une phrase, pour l'E9 et l'E11 ; vide quand aucune ouverture n'est sous un corps voisin. */
export function texteDuPartage(p: PartageOuvertures, nomDuCote: (cote: number) => string): string {
  const n = (k: number) => k + ' ouverture' + (k > 1 ? 's' : '');
  const dits: string[] = [];
  for (const a of p.ajouts) dits.push(`${n(a.ouvertures.length)} sur le pignon du corps voisin, posée${a.ouvertures.length > 1 ? 's' : ''} sur la façade ${nomDuCote(a.cote)} à la validation`);
  const deja = new Map<number, number>();
  for (const d of p.dejaLa) deja.set(d.cote, (deja.get(d.cote) ?? 0) + 1);
  for (const [cote, k] of deja) dits.push(`${n(k)} sur le pignon du corps voisin, déjà sur la façade ${nomDuCote(cote)}`);
  if (p.sansFacade.length) dits.push(`${n(p.sansFacade.length)} sur le pignon du corps voisin — pas de façade sur ce mur : relevez-le pour les y poser`);
  return dits.length ? dits.join(' ; ') + '.' : '';
}

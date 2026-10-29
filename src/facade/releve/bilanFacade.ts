// Le bilan d'une facade (MD/spec-facade-calage-audit.md §4 E9, lot F5) : la Facade que la validation V4 ecrira, tiree de ce que les
// etapes ont rendu. Les dimensions viennent du plan et du LiDAR (decision 1), la photo n'en dit que l'ecart ; la forme est le
// gabarit du toit calcule, et ce que la photo en lit (le mot, les pointes, les corps que la facade porte) ; la pose de la texture dit
// ou est le mur sur l'image calee ; les ouvertures sont celles du releve, chacune avec son identifiant.
//
// Pur : l'orchestrateur (enchainement.ts) l'appelle a l'E9, l'audit l'ecrit a la validation V4 (app/audit/parcelle/facadeValidee.ts).

import { pointesDuGabarit, type GabaritMur } from '../gabaritMur.js';
import { numeroterOuvertures } from '../../model/facadeObjet.js';
import type { DiagnosticForme } from '../regles/facades/diagnosticForme.js';
import { libelleSilhouette, type SilhouetteFacade } from '../../model/silhouetteFacade.js';
import type { DimensionsFacade, FormeFacade, OuvertureFacade, PointeLue, TextureCalee } from '../../model/types.js';

/** La Facade d'un mur avant la validation : la source des dimensions est dite par celui qui l'ecrit (le batiment la connait). */
export interface BilanFacade {
  dimensions: Omit<DimensionsFacade, 'source'>;
  forme: FormeFacade;
  textureCalee: TextureCalee | null;
  ouvertures: OuvertureFacade[];
}

/** Ce que les etapes ont rendu, et dont le bilan se fait. */
interface EntreesBilan {
  largeurM: number;
  hauteurM: number;
  gabarit: GabaritMur;
  /** Le mot lu sur la photo (E5) ; null ou `indetermine` quand le haut ne se lit pas. */
  silhouette: SilhouetteFacade | null;
  /** Le haut du mur lu sur la photo, en parts du mur et de l'egout (E5). */
  hautLu: readonly { u: number; v: number }[] | null;
  /** Le diagnostic de forme (E5 bis) : ses troncons disent les corps que la facade porte. */
  diagnostic: DiagnosticForme | null;
  /** Les pointes que Claude voit (le mode « IA » de la calibration). */
  pointesIa?: readonly { u: number; v: number }[] | null;
  textureCalee: TextureCalee | null;
  ouvertures: readonly OuvertureFacade[];
  /** L'ecart de la largeur vue a celle du plan, en part ; la hauteur a l'egout mesuree sur la photo, quand elle l'a ete. */
  ecartLargeur?: number | null;
  hauteurMesureeM?: number | null;
}

const r2 = (v: number) => Math.round(v * 100) / 100;
const r3 = (v: number) => Math.round(v * 1000) / 1000;

/** Une pointe du gabarit cherchee sur le haut lu, a 5 % de la largeur pres : ce que la photo montre la, si c'est au-dessus de l'egout. */
const DEMI_FENETRE_U = 0.05;

/**
 * Les pointes lues sur la photo : pour chaque pointe du gabarit, le plus haut du haut lu autour d'elle, s'il monte au-dessus de
 * l'egout (une pointe que la photo ne montre pas n'est pas lue) ; puis celles de Claude qui ne sont pas deja la.
 */
function pointesLues(g: GabaritMur, hautLu: EntreesBilan['hautLu'], ia: EntreesBilan['pointesIa']): PointeLue[] {
  const out: PointeLue[] = [];
  for (const p of hautLu?.length ? pointesDuGabarit(g) : []) {
    const pres = (hautLu ?? []).filter((q) => Math.abs(q.u - p.u) <= DEMI_FENETRE_U);
    const haut = pres.reduce<{ u: number; v: number } | null>((m, q) => (!m || q.v > m.v ? q : m), null);
    if (haut && haut.v > 1) out.push({ u: r3(haut.u), v: r3(haut.v), source: 'deterministe' });
  }
  for (const p of ia ?? []) if (!out.some((q) => Math.abs(q.u - p.u) <= DEMI_FENETRE_U)) out.push({ u: r3(p.u), v: r3(p.v), source: 'ia' });
  return out.sort((a, b) => a.u - b.u);
}

/** Le bilan de la facade : ses dimensions, sa forme, la pose de sa texture et ses ouvertures, chacune avec son identifiant. */
export function bilanDeLaFacade(e: EntreesBilan): BilanFacade {
  const haut = Math.max(1, ...e.gabarit.map((p) => p.v));
  const ecart: NonNullable<DimensionsFacade['ecartPhoto']> = {};
  if (typeof e.ecartLargeur === 'number') ecart.largeur = e.ecartLargeur;
  if (typeof e.hauteurMesureeM === 'number' && e.hauteurM > 0) ecart.egout = r2(Math.abs(e.hauteurMesureeM - e.hauteurM) / e.hauteurM);
  const dimensions: BilanFacade['dimensions'] = {
    largeurM: r2(e.largeurM), egoutM: r2(e.hauteurM),
    ...(haut > 1 + 1e-6 ? { faitageM: r2(haut * e.hauteurM) } : {}),
    ...(Object.keys(ecart).length ? { ecartPhoto: ecart } : {}),
  };
  const pointes = pointesLues(e.gabarit, e.hautLu, e.pointesIa);
  const lu = !!e.silhouette && e.silhouette !== 'indetermine';
  const corps = (e.diagnostic?.troncons ?? []).map((t) => ({ mur: { gauche: { ...t.mur.gauche }, droite: { ...t.mur.droite } }, u0: r3(t.u0), u1: r3(t.u1) }));
  const forme: FormeFacade = {
    gabarit: e.gabarit.map((p) => ({ u: r3(p.u), v: r3(p.v) })),
    ...(lu && e.silhouette ? { silhouetteLue: e.silhouette } : {}),
    ...(pointes.length ? { pointes } : {}),
    ...(corps.length ? { corps } : {}),
    source: pointes.some((p) => p.source === 'ia') ? 'ia' : lu || pointes.length || e.hautLu?.length ? 'photo' : 'plan',
  };
  return { dimensions, forme, textureCalee: e.textureCalee, ouvertures: numeroterOuvertures(e.ouvertures) };
}

/** Le bilan en une phrase : ce que la validation V4 ecrira. */
export function texteBilan(b: BilanFacade): string {
  const f = (v: number) => String(r2(v)).replace('.', ',');
  const d = b.dimensions;
  const e = d.ecartPhoto;
  const alerte = [e?.largeur !== undefined && e.largeur > ALERTE_ECART ? `la photo voit le mur ${Math.round(e.largeur * 100)} % plus ou moins large que le plan` : '',
    e?.egout !== undefined && e.egout > ALERTE_ECART ? `l’égout mesuré sur la photo s’écarte de ${Math.round(e.egout * 100)} %` : ''].filter(Boolean);
  const pointes = b.forme.pointes?.length ?? 0;
  const forme = (b.forme.silhouetteLue ? 'haut lu : ' + libelleSilhouette(b.forme.silhouetteLue) : 'haut du plan') + (pointes ? `, ${pointes} pointe${pointes > 1 ? 's' : ''} lue${pointes > 1 ? 's' : ''}` : '')
    + (b.forme.corps && b.forme.corps.length > 1 ? `, ${b.forme.corps.length} corps` : '');
  const n = b.ouvertures.length, c = b.ouvertures.filter((o) => o.details?.carreaux).length;
  return `Mur de ${f(d.largeurM)} × ${f(d.egoutM)} m` + (d.faitageM ? `, ${f(d.faitageM)} m au plus haut` : '') + ` ; ${forme} ; `
    + (b.textureCalee ? `texture calée à ${Math.round(b.textureCalee.pxParM)} px/m` : 'sans texture') + ` ; ${n} ouverture${n > 1 ? 's' : ''}` + (c ? ` (${c} avec ses carreaux)` : '') + '.'
    + (alerte.length ? ' Alerte : ' + alerte.join(', ') + ' (le plan et le LiDAR sont gardés).' : '');
}

/** Un ecart que la photo constate au-dela de cette part est une alerte, jamais une correction (§3.2). */
export const ALERTE_ECART = 0.1;


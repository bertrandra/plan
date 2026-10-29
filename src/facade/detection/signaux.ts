// Quand l'algorithme n'est pas sur de lui (MD/spec-facades-calage-detection.md §12 bis, « Quand il est appelé ») : les signaux qui
// font proposer l'aide de Claude au releve d'une facade (le run d'une facade, app/releve/runFacade.ts) — coins non trouves, facade
// mal vue, detection peu sure, ton sur ton, desaccord, details. Claude aide quand l'algorithme doute, jamais a sa place. Pur.
//
// (Ce module etait celui du renfort a trois passes votees : sa grille de reperes, son schema et son vote sont partis au lot F3 avec
// lui. L'audit appelle le run sur chaque facade mesuree, sans signal : chaque facade photographiee doit etre lue.)

import type { OuvertureFacade } from '../../model/types.js';
import { mediane } from '../../util/stats.js';

/* ------------------------------------------------------------------------------------------------
 * Quand l'appeler
 * --------------------------------------------------------------------------------------------- */

/** Les situations du tableau de F§12 bis. */
export type SituationFacade = 'coins' | 'malVue' | 'peuSure' | 'tonSurTon' | 'desaccord' | 'details';

const LIBELLES_SITUATION: Record<SituationFacade, string> = {
  coins: 'coins non trouvés sur la photo',
  malVue: 'façade en grande partie cachée',
  peuSure: 'détection peu sûre',
  tonSurTon: 'ouvertures ton sur ton',
  desaccord: 'nombre d’ouvertures en désaccord',
  details: 'volets ou baies fermées à confirmer',
};

/** Les seuils des signaux (F§12 bis, « Quand il est appelé »). */
const SEUILS_SIGNAUX = {
  /** La note du calage fin sous laquelle les coins ne sont pas trouves (calageFin.ts, SEUIL_NOTE). */
  noteCalage: 0.5,
  /** Plus de 30 % de l'elevation cachee (masque d'occlusion, ou part du mur hors de la photo). */
  cacheMax: 0.3,
  /** Moins de 70 % des ouvertures au-dessus de 0,7 de confiance. */
  partSure: 0.7,
  confianceSure: 0.7,
  /**
   * Ton sur ton : la detection ne lit pas la teinte d'une baie qu'elle n'a pas trouvee. On retient ce
   * qui en reste visible : une facade de plus de 4 m sans aucune ouverture, ou la confiance mediane des
   * ouvertures trouvees sous 0,55 (les indices A et B faibles ensemble, F§9).
   */
  murVideM: 4,
  confianceMediane: 0.55,
};

/** Ce que l'algorithme sait au moment de decider. Tout est facultatif : l'etape des coins n'a pas encore d'ouvertures. */
interface EtatAlgorithme {
  /** Le calage fin de la photo (note, et la source de chaque coin). */
  calage?: { note: number; trouve: boolean; sources: readonly string[] } | null;
  /** La part de l'elevation cachee : masque d'occlusion de la fusion (F§8), ou part du mur hors de la photo. */
  cache?: number | null;
  /** Les ouvertures proposees cochees (confiance, source, details). */
  ouvertures?: readonly Pick<OuvertureFacade, 'confiance' | 'source' | 'details'>[] | null;
  /** Les baies devinees laissees en pointille : une travee incomplete hors zone cachee (F§10). */
  devinees?: number;
  largeurM?: number;
  /** Le nombre de baies attendu par l'utilisateur (« Ce que je vois ») ou par la grille ; null s'il n'est pas connu. */
  attendues?: number | null;
}


/** Les signaux leves par l'algorithme (F§12 bis). Vide : l'algorithme suffit, le releve ne propose pas l'aide de Claude. */
export function signauxDeLaFacade(e: EtatAlgorithme): SituationFacade[] {
  const s = SEUILS_SIGNAUX;
  const out: SituationFacade[] = [];
  const c = e.calage;
  if (c && (!c.trouve || c.note < s.noteCalage || c.sources.filter((x) => x === 'predit').length > 1)) out.push('coins');
  if ((e.cache ?? 0) > s.cacheMax) out.push('malVue');
  const os = e.ouvertures;
  if (os) {
    const mesurees = os.filter((o) => o.confiance !== undefined && o.source !== 'corrigee' && o.source !== 'ajoutee');
    const sures = mesurees.filter((o) => (o.confiance ?? 0) >= s.confianceSure).length;
    if ((mesurees.length && sures < s.partSure * mesurees.length) || (e.devinees ?? 0) > 0) out.push('peuSure');
    const vide = !os.length && (e.largeurM ?? 0) > s.murVideM;
    if (vide || (mesurees.length && mediane(mesurees.map((o) => o.confiance ?? 0)) < s.confianceMediane)) out.push('tonSurTon');
    if (e.attendues !== null && e.attendues !== undefined && e.attendues !== os.length) out.push('desaccord');
    if (os.some((o) => o.details?.ferme)) out.push('details');
  }
  return out;
}

/** Les signaux en clair, pour l'ecran : « coins non trouvés sur la photo, détection peu sûre ». */
export function texteSignaux(s: readonly SituationFacade[]): string {
  return s.map((x) => LIBELLES_SITUATION[x]).join(', ');
}

// Juger les facades relevees avec la disposition automatique d'aujourd'hui (MD/spec-facades-calage-detection.md
// §15.3, lot G13 de MD/plan-vague-3-generaliser.md).
//
// Sur chaque facade relevee d'un audit de parcelle, on pose sur le meme mur (sa largeur, sa hauteur) ce que
// la disposition automatique y mettrait (`ouverturesDUnMur`), on mesure les deux avec les memes mots
// (`mesurerFacade`), et on compare : nombre de baies (± 1), part vitree (± 20 %), hauteur des niveaux. Le taux de
// conformite est la part des facades qui tiennent tous les criteres juges. La porte est posee sur la disposition
// si le releve en porte une : on compare la place des fenetres, pas la decision d'avoir une porte ici.
//
// Pur et sans reseau, comme le jugement des toits (facade/regles/conformite.ts). Rien ne change aucune valeur
// produite par Plan : c'est une mesure, qui dit ou un profil de facades (G14) serait utile.

import { ouverturesDUnMur } from '../../ouvertures.js';
import { mesurerFacade } from '../../../model/mesureFacade.js';
import { jugerCriteres, type VerdictFacade } from '../../../regles/conformite.js';
import { REGLAGES_FACADES, type ValeursFacades } from '../../../regles/facades/reglages.js';
import { departementDeIdu } from '../../../model/departements.js';
import type { FichierAuditParcelle } from '../../../model/fichierAuditParcelle.js';
import type { ReleveFacade } from '../../../model/types.js';

/** Ce qu'il faut pour juger une facade : son releve, et le nombre d'etages du batiment quand on le sait. */
export interface FacadeAJuger {
  fichier: string;
  batiment: string;
  cote: number;
  orientation: string | null;
  region: string;
  releve: Pick<ReleveFacade, 'largeur' | 'hauteur' | 'ouvertures' | 'grille' | 'partieBasse'>;
  etages?: number | null;
}

/** Une facade relevee, jugee par la disposition automatique du profil donne (le profil par defaut sinon). */
export function jugerFacade(f: FacadeAJuger, profil: ValeursFacades = REGLAGES_FACADES): VerdictFacade {
  const r = f.releve;
  const porte = r.ouvertures.some((o) => o.type === 'porte');
  const auto = ouverturesDUnMur(r.largeur, r.hauteur, { etages: f.etages ?? null, profil }, porte);
  const mesureAuto = mesurerFacade({ largeur: r.largeur, hauteur: r.hauteur, ouvertures: auto });
  const mesureReleve = mesurerFacade({ largeur: r.largeur, hauteur: r.hauteur, ouvertures: r.ouvertures, grille: r.grille ?? null, partieBasse: r.partieBasse ?? null });
  const criteres = jugerCriteres(
    { baies: mesureAuto.baies, partVitree: mesureAuto.partVitree, hauteurNiveauM: mesureAuto.hauteurNiveauM },
    { baies: mesureReleve.baies, partVitree: mesureReleve.partVitree, hauteurNiveauM: mesureReleve.hauteurNiveauM },
  );
  return { fichier: f.fichier, batiment: f.batiment, cote: f.cote, orientation: f.orientation, region: f.region, ...criteres };
}

/** Le nombre d'etages que dit la BD TOPO d'un batiment (`nombre_d_etages`), ou null. */
function etagesDe(bdtopo: Record<string, unknown> | null | undefined): number | null {
  const n = Number(bdtopo?.nombre_d_etages);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Les facades relevees d'un audit de parcelle : celles qui portent un releve avec une largeur et une hauteur. */
export function facadesDeLAuditParcelle(id: string, f: FichierAuditParcelle): FacadeAJuger[] {
  const region = departementDeIdu(f.parcelle.idu) ?? 'inconnue';
  return f.batiments.flatMap((b) => b.facades.flatMap((fa): FacadeAJuger[] => {
    const r = fa.mesure?.releve;
    if (!r || !(r.largeur > 0) || !(r.hauteur > 0)) return [];
    return [{ fichier: id, batiment: b.nom, cote: fa.cote, orientation: fa.orientation, region, releve: r, etages: etagesDe(b.cas?.entrees.bdtopo) }];
  }));
}

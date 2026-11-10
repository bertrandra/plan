// L actualisation IGN : le relief du terrain relu sur le plan actualise (MD/spec-relief.md).
// Un morceau de app/cadastre/actualisationIgn.ts, qui le reexporte : le reste du programme importe depuis lui.

import { etape, type ContexteActualisation } from './progression.js';
import { lireRelief, demandeReliefDuPlan } from '../../../geo/relief.js';
import { avecReglages, resumeRelief } from '../../../model/relief.js';
import { parcelleDuProjet } from '../../../model/fonctions.js';

/**
 * Relit le relief sur le plan actualise et le range sur la parcelle du projet. Les preferences
 * d'affichage et le plafond de points restent ceux de la personne, comme pour « Actualiser le relief ». Un echec est dit
 * dans le bilan ; la grille d'avant reste alors en place.
 */
export async function actualiserRelief(ctx: ContexteActualisation, toutesParcelles: boolean, bilan: string[], parDefaut = false, horizonM?: number): Promise<void> {
  etape('le relief du terrain…');
  // Un voisinage etendu donne son horizon au paysage : le relief va jusqu'au rayon demande.
  const demande = demandeReliefDuPlan(ctx.etat.objects, toutesParcelles, ctx.etat.terrasseSelectedKey, horizonM);
  const cible = parcelleDuProjet(ctx.etat.objects);
  if(!demande || !cible) return;
  try {
    const r = await (ctx.lireRelief ?? lireRelief)(demande);
    // Remis aux valeurs par defaut, le relief garde son plafond de points mais pas son affichage.
    const ancien = parDefaut && cible.relief ? { ...cible.relief, affichage: null } : cible.relief;
    cible.relief = avecReglages(r, ancien);
    bilan.push('relief lu : ' + resumeRelief(r));
  } catch(e){
    bilan.push('relief non lu (' + ((e as Error).message || e) + ')');
  }
}

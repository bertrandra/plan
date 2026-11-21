// Ce que l'onglet PLU du tiroir demande au plan pour le reglement de la zone (lot L4) : la lecture par Claude, la validation d'une
// regle, la conformite du projet. Le service des resultats (app/resultats.ts) le porte ; chaque ecriture est un pas d'annulation et
// marque le projet modifie, comme l'interrogation du zonage.

import { phraseReseau, detailTechnique } from '../../util/erreurReseau.js';
import type { ConformitePlu } from '../../engine/regles/plu/conformite.js';
import type { IndicationFormalite } from '../../engine/regles/plu/formalite.js';
import { conformiteDuPlan, formaliteDuPlan } from './conformiteDuPlan.js';
import { showToast } from '../../shell/dialogs.js';
import { lireReglementPlu, type ContexteLecturePlu } from './lecturePlu.js';
import type { EtatApp } from '../../core/state.js';
import type { ObjetPlan } from '../../model/types.js';
import type { Magasin } from '../magasin.js';

export interface ContexteServicePlu {
  pushHistory: (...objets: object[]) => void;
  markDirty: (...objets: object[]) => void;
  trouverParcelle: () => ObjetPlan | null | undefined;
  /** Redessine le plan et ses zones : la selection d'un objet depuis un verdict. */
  render?: () => void;
  lecturePlu?: ContexteLecturePlu;
}

export interface ServicePlu {
  lecturePluEnCours(): boolean;
  lireReglementPlu(): Promise<void>;
  basculerFaitPlu(id: string): void;
  conformitePlu(): ConformitePlu;
  /** La formalite d'urbanisme du projet d'apres les regles nationales : une indication (engine/regles/plu/formalite.ts). */
  formalite(): IndicationFormalite;
  /** Selectionne l'objet d'un verdict s'il ne l'est pas deja (une navigation : ni annulation, ni projet modifie). */
  selectionnerObjetDuVerdict(cle: string): void;
}

export function creerServicePlu(etat: EtatApp, ctx: ContexteServicePlu, magasin: Magasin): ServicePlu {
  let enCours = false;
  return {
    lecturePluEnCours: () => enCours,
    /**
     * La lecture du reglement de la zone par Claude (app/plu/lecturePlu.ts) : ses faits arrivent proposes, decoches, et rien ne les lit
     * tant que la personne ne les a pas valides. Une nouvelle lecture remplace la precedente, faits valides compris : la personne
     * l'a demandee, et Ctrl+Z la rend.
     */
    async lireReglementPlu() {
      const parcelle = ctx.trouverParcelle();
      if (!parcelle || enCours || !ctx.lecturePlu || etat.lectureSeule) return;
      enCours = true;
      magasin.notifier();
      try {
        const r = await lireReglementPlu(parcelle, ctx.lecturePlu);
        if ('erreur' in r) { showToast(r.erreur); return; }
        ctx.pushHistory(parcelle);
        parcelle.reglementPlu = r.reglement;
        ctx.markDirty(parcelle);
        const n = r.reglement.faits.length;
        showToast(n ? 'Règlement de la zone ' + r.reglement.zone + ' lu : ' + n + ' règle(s) proposée(s), à vérifier dans le texte avant de s’en servir.'
                    : 'Règlement de la zone ' + r.reglement.zone + ' lu : aucune règle relevée.');
      } catch (e) {
        showToast(phraseReseau(e, 'Le Géoportail de l’urbanisme', 'Réessayez « Lire le règlement » dans un instant.') ?? 'Lecture du règlement impossible : ' + detailTechnique(e));
      } finally {
        enCours = false;
        magasin.notifier();
      }
    },
    /** Retient une regle comparee au texte, ou la rend proposee. */
    basculerFaitPlu(id) {
      const parcelle = ctx.trouverParcelle();
      const f = parcelle?.reglementPlu?.faits.find((x) => x.id === id);
      if (!parcelle || !f || etat.lectureSeule) return;
      ctx.pushHistory(parcelle);
      if (f.statut === 'valide') { f.statut = 'propose'; delete f.valideLe; }
      else { f.statut = 'valide'; f.valideLe = new Date().toISOString().slice(0, 10); }
      ctx.markDirty(parcelle);
      magasin.notifier();
    },
    // Calculees une fois par ecriture, pour l'onglet, sa pastille et le calque du plan (conformiteDuPlan.ts).
    conformitePlu: () => conformiteDuPlan(etat.objects),
    formalite: () => formaliteDuPlan(etat.objects),
    selectionnerObjetDuVerdict(cle) {
      if (etat.selectedKey === cle || !etat.objects.some((o) => o.key === cle)) return;
      etat.selectedKey = cle;
      etat.highlight = { type: null, index: null };
      ctx.render?.();
    },
  };
}

// Ce que le tiroir des resultats (zones/resultats/) demande au plan (spec-ihm-zones §4.6, app/).
//
// Les panneaux du tiroir sont des composants React qui lisent l'etat et le moteur ; ce service est le
// seul endroit ou ils ecrivent. Chaque saisie — un prix, une longueur achetable, une cadence, une
// cote — passe par `saisir` : un instantane d'annulation, l'ecriture, le projet marque « modifie »,
// puis le chiffrage refait et le plan redessine. C'etait le defaut D-16 : ces saisies ne
// s'annulaient pas et ne marquaient pas le projet, parce que chaque panneau ecrivait dans la
// construction a sa facon.
//
// Il tient aussi trois etats d'interface qui ne s'enregistrent pas : le texte de la zone Resume,
// l'interrogation du PLU en cours, et l'ouverture du bloc d'optimisation de l'inspecteur.

import { computeBOM } from '../engine/bom.js';
import { ensureConstruction } from '../engine/construction.js';
import { computeTerrasseLayers } from '../engine/layers.js';
import { interrogerPlu } from '../geo/apiIgn.js';
import { idMesure } from '../model/cles.js';
import { mesure, type Pointage } from '../interaction/outilMesure.js';
import { showToast } from '../shell/dialogs.js';
import type { EtatApp } from '../core/state.js';
import type { Lieu } from '../model/lieu.js';
import type { Mesure, ObjetPlan } from '../model/types.js';
import type { Magasin } from './magasin.js';

/** Ce que le service doit pouvoir declencher ailleurs. */
export interface ContexteResultats {
  pushHistory: () => void;
  markDirty: () => void;
  render: () => void;
  /** La terrasse dont le tiroir montre les resultats, ou aucune. */
  terrasseCourante: () => ObjetPlan | undefined;
  /** Refait le calque de la terrasse sur le plan (render/terrasseCouches.ts). */
  renderTerrasseLayerView: (obj: ObjetPlan) => void;
  trouverParcelle: () => ObjetPlan | null | undefined;
  lieuActuel: () => Lieu;
  construireResume: () => string;
  refLabel: (ref: { objKey: string; segIndex: number } | null) => string;
  targetLabel: (t: { objKey: string; ptIndex: number }) => string;
  computeMeasureGeom: (m: Mesure) => { perp: number; along: number } | null;
  /** Montre l'onglet Resume (et, sur telephone, la feuille des resultats). */
  montrerResume: () => void;
}

export interface Resultats {
  etat: EtatApp;
  terrasse(): ObjetPlan | undefined;
  /** Une saisie de l'utilisateur dans un panneau de la terrasse : annulable, et le projet est modifie. */
  saisir(ecrire: () => void): void;
  /**
   * Refait le chiffrage de la terrasse courante. `construction.bom` est ecrit ici, et seulement ici :
   * il part dans le projet enregistre, donc il ne peut pas dependre de l'onglet ouvert.
   */
  actualiserTerrasse(obj?: ObjetPlan): void;

  // ---- Cotes -------------------------------------------------------------------------------
  refLabel: ContexteResultats['refLabel'];
  targetLabel: ContexteResultats['targetLabel'];
  geometrieCote(m: Mesure): { perp: number; along: number } | null;
  pointer(mode: Pointage['mode'], multi: boolean, purpose?: Pointage['purpose']): void;
  arreterPointage(): void;
  choisirOrigine(extremite: string): void;
  ajouterCotes(): void;
  modifierCote(id: string, ecrire: (m: Mesure) => void): void;
  supprimerCote(id: string): void;
  /** Vide les cotes et le brouillon de l'outil. */
  effacerCotes(): void;

  // ---- PLU ---------------------------------------------------------------------------------
  pluEnCours(): boolean;
  interrogerPlu(): Promise<void>;
  parcelle(): ObjetPlan | null | undefined;
  lieu(): Lieu;

  // ---- Resume ------------------------------------------------------------------------------
  /** Le texte de la zone copiable, et un compteur qui change a chaque nouvel affichage. */
  resume(): { texte: string; affichage: number };
  afficherResume(texte: string): void;
  copierResume(): void;

  // ---- Optimisation (inspecteur) -----------------------------------------------------------
  optimisationVisible(): boolean;
  basculerOptimisation(): boolean;
}

export function creerResultats(etat: EtatApp, ctx: ContexteResultats, magasin: Magasin): Resultats {
  let pluEnCours = false;
  let resume = { texte: '', affichage: 0 };
  // Le bloc d'optimisation reste ouvert une fois demande, et se reclasse a chaque changement : on
  // peut ainsi voir monter ou descendre la configuration qu'on est en train d'editer.
  let optimisation = false;

  function actualiserTerrasse(terrasse?: ObjetPlan): void {
    const obj = terrasse ?? ctx.terrasseCourante();
    if (obj) {
      const c = ensureConstruction(obj);
      c.bom = computeBOM(obj, computeTerrasseLayers(obj, etat.objects));
      ctx.renderTerrasseLayerView(obj);
    }
    magasin.notifier();
  }

  /** Une ecriture sur les cotes : annulable, projet modifie, plan redessine (il les dessine). */
  function ecrireCotes(ecrire: () => void): void {
    ctx.pushHistory();
    ecrire();
    ctx.markDirty();
    ctx.render();
  }

  function pointer(mode: Pointage['mode'], multi: boolean, purpose?: Pointage['purpose']): void {
    mesure.pointage = { mode, multi, purpose: purpose || 'measure' };
    ctx.render();
  }

  return {
    etat,
    terrasse: ctx.terrasseCourante,
    saisir(ecrire) {
      ctx.pushHistory();
      ecrire();
      ctx.markDirty();
      actualiserTerrasse();
      ctx.render();
    },
    actualiserTerrasse,

    refLabel: ctx.refLabel,
    targetLabel: ctx.targetLabel,
    geometrieCote: ctx.computeMeasureGeom,
    pointer,
    arreterPointage() { mesure.pointage = null; ctx.render(); },
    choisirOrigine(extremite) { mesure.startEnd = extremite; magasin.notifier(); },
    ajouterCotes() {
      const ref = mesure.ref;
      if (!ref || !mesure.cibles.length) return;
      ecrireCotes(() => {
        mesure.cibles.forEach(t => {
          etat.measures.push({
            id: idMesure(),
            refObjKey: ref.objKey, refSegIndex: ref.segIndex,
            startEnd: mesure.startEnd,
            targetObjKey: t.objKey, targetPtIndex: t.ptIndex,
            show: true, displayMode: 'along'
          });
        });
        mesure.cibles = [];
        mesure.pointage = null;
      });
    },
    modifierCote(id, ecrire) {
      const m = etat.measures.find(x => x.id === id);
      if (m) ecrireCotes(() => ecrire(m));
    },
    supprimerCote(id) {
      ecrireCotes(() => { etat.measures = etat.measures.filter(x => x.id !== id); });
    },
    effacerCotes() {
      ecrireCotes(() => {
        etat.measures = [];
        mesure.cibles = []; mesure.ref = null; mesure.pointage = null;
      });
    },

    pluEnCours: () => pluEnCours,
    parcelle: ctx.trouverParcelle,
    lieu: ctx.lieuActuel,
    /**
     * Interroge le Geoportail de l'urbanisme au centre de la parcelle, et range le zonage **sur la
     * parcelle** (champ `plu`) — comme la cloture et le lieu. Il se sauvegarde ainsi avec le projet
     * et suit la parcelle si le plan est exporte.
     *
     * Une seule interrogation a la fois : le service est lent, et deux appels lances coup sur coup
     * empileraient deux instantanes d'annulation pour un seul geste. Un point sans zonage n'est pas
     * une erreur — toutes les communes n'ont pas de PLU numerise — et le message le dit.
     */
    async interrogerPlu() {
      const parcelle = ctx.trouverParcelle();
      if (!parcelle || pluEnCours) return;
      const lieu = ctx.lieuActuel();
      pluEnCours = true;
      magasin.notifier();
      try {
        const plu = await interrogerPlu(lieu.longitude, lieu.latitude);
        ctx.pushHistory();
        parcelle.plu = plu;
        ctx.markDirty();
        const n = plu.zones.length;
        showToast(n ? ('PLU : zone ' + plu.zones[0]!.libelle + (n > 1 ? ' (+' + (n - 1) + ' autre(s))' : '') + '.')
                    : 'PLU : aucun zonage renvoye pour ce point.');
      } catch (e) {
        showToast('Interrogation du PLU impossible : ' + ((e as Error).message || e));
      } finally {
        pluEnCours = false;
        magasin.notifier();
      }
    },

    resume: () => resume,
    afficherResume(texte) {
      resume = { texte, affichage: resume.affichage + 1 };
      ctx.montrerResume();
      magasin.notifier();
    },
    /**
     * Copier ce que montre la zone de texte, d'un geste : au doigt, selectionner cent lignes pour
     * les copier est une epreuve (spec-ihm-mobile §7.3). Rien d'affiche : le resume est genere.
     */
    copierResume() {
      if (!resume.texte) this.afficherResume(ctx.construireResume());
      const texte = resume.texte;
      const repli = () => {
        // La zone est rendue par le panneau Resume ; la selectionner laisse le menu du systeme copier.
        const box = document.getElementById('exportBox') as HTMLTextAreaElement | null;
        box?.focus(); box?.select();
        showToast('Texte sélectionné : copiez-le avec le menu du système.');
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(texte).then(() => showToast('Copié dans le presse-papiers.'), repli);
      } else repli();
    },

    optimisationVisible: () => optimisation,
    basculerOptimisation() { optimisation = !optimisation; magasin.notifier(); return optimisation; }
  };
}

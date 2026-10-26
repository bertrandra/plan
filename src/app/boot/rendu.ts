// Le rendu du plan (app/boot/plan.ts) : le dessin orchestre par render/pipeline.ts, le rendu complet, l'apercu par transformation
// pendant un geste quand le rendu complet est trop lent pour le suivre, et le rendu de quelques objets seulement.

import { synchroniserContexteTerrasse } from '../../core/contexteTerrasse.js';
import { rendreScene, rendreObjets, type ContexteRendu } from '../../render/pipeline.js';
import { dessinerCourbesRelief } from '../../render/relief.js';
import { dessinerNomsDesRues } from '../../render/rues.js';
import { creerApercuVue } from '../../render/apercuVue.js';
import { dessinerReleves } from '../../render/releve.js';
import { dessinerCloture } from '../../render/cloture.js';
import { modeDiagnostic, couleurDiagnostic } from '../diagnostic.js';
import type { EtatApp } from '../../core/state.js';
import type { ObjetPlan } from '../../model/types.js';
import type { creerMagasin } from '../magasin.js';
import type { creerTiroir } from '../tiroir.js';
import type { creerSurface } from '../assemblage/surface.js';
import type { creerDessin } from '../assemblage/dessin.js';
import type { creerAffichage } from '../assemblage/affichage.js';
import type { creerCadrage } from '../assemblage/cadrage.js';

/** Le mode de diagnostic de l'adresse (app/diagnostic.ts), lu une fois. */
export const diagnostic = modeDiagnostic();
/** Au-dela, un rendu complet est trop lent pour suivre un geste : la vue passe par un apercu (render/apercuVue.ts). */
const RENDU_LENT_MS = 30;

/** Ce que le rendu lit du plan assemble ; le cadrage, cree apres lui, se lit au moment du rendu. */
export interface DependancesRendu {
  etat: EtatApp;
  magasin: ReturnType<typeof creerMagasin>;
  surface: ReturnType<typeof creerSurface>;
  dessin: ReturnType<typeof creerDessin>;
  affichage: ReturnType<typeof creerAffichage>;
  tiroir: ReturnType<typeof creerTiroir>;
  markDirty: () => void;
  cadrage: () => ReturnType<typeof creerCadrage>;
}

export function creerRendu(d: DependancesRendu) {
  const { etat, magasin, surface, dessin, affichage, tiroir, markDirty } = d;
  // Le dessin du plan est orchestre dans render/pipeline.ts. La terrasse courante suit la selection
  // (core/contexteTerrasse.ts), et le tiroir la suit a chaque rendu.
  function render(): void {
    const debut = performance.now();
    apercu.annuler();
    const contexteChange = synchroniserContexteTerrasse(etat);
    // Le plancher du zoom suit les parcelles affichees : un voisinage ajoute ou demasque doit
    // pouvoir tenir en entier dans la scene au geste suivant.
    d.cadrage().ajusterPlancher();
    rendreScene(etat, contexteRendu());
    tiroir.synchroniser(contexteChange);
    magasin.notifier();
    dureeDernierRendu = performance.now() - debut;
  }
  // Le zoom et le deplacement s'adaptent au plan (render/apercuVue.ts) : un rendu complet tant qu'il
  // est rapide (un petit plan), un apercu par transformation pendant le geste quand il ne l'est plus.
  const apercu = creerApercuVue({ element: surface.svg, rendre: () => render() });
  let dureeDernierRendu = 0;
  const vueChangee = (avant: typeof etat.scene) => {
    if (dureeDernierRendu < RENDU_LENT_MS) render();
    else apercu.changer(avant, etat.scene);
  };
  /** Ces objets seulement, sans le reste du plan ni les zones : la lecture des toits en tache de fond. */
  function redessinerObjets(cles: readonly string[]): void {
    // Pendant un apercu, le dessin ne suit pas encore la scene : le rendu complet qui suit les reprendra.
    if (apercu.enCours()) return;
    const objets = etat.objects.filter((o) => cles.includes(o.key));
    if (objets.length) rendreObjets(etat, contexteRendu(), objets);
  }
  function contexteRendu(): ContexteRendu {
    return {
      ...dessin, ...affichage, markDirty, render, etat, orthoGroup: () => surface.ortho,
      // ?mode=devroof ou devwall : chaque batiment peint selon l'origine de son toit ou de ses murs.
      ...(diagnostic ? { couleurDiagnostic: (o: ObjetPlan) => couleurDiagnostic(o, diagnostic) } : {}),
      // Les courbes de niveau du relief, dans leur calque au-dessus de la grille (render/relief.ts).
      // Le voisinage masque emporte le paysage (courbes au-dela de la parcelle) et le nom des rues.
      dessinerRelief: () => dessinerCourbesRelief(surface.relief, etat.objects, etat.scene, etat.voisinageVisible),
      // Le nom des rues, si la case de la section « Voisinage » est cochee (render/rues.ts).
      dessinerRues: () => { if (etat.voisinageVisible) dessinerNomsDesRues(surface.rues, etat.objects, etat.scene, affichage.objetMasque); else surface.rues.innerHTML = ''; },
      // Les ouvertures relevees puis la cloture, dans le meme groupe : le premier le vide.
      renderReleves: () => {
        dessinerReleves(surface.releves, etat, dessin.toScreen, affichage.objetMasque);
        const parcelle = affichage.trouverParcelleCloture();
        if (parcelle && !affichage.objetMasque(parcelle)) dessinerCloture(surface.releves, etat, dessin.toScreen, parcelle);
      }
    };
  }
  return { render, vueChangee, redessinerObjets };
}

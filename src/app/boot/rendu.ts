// Le rendu du plan (app/boot/plan.ts) : le dessin orchestre par render/pipeline.ts, le rendu complet, l'apercu par transformation
// pendant un geste quand le rendu complet est trop lent pour le suivre, et le rendu de quelques objets seulement.

import { synchroniserContexteTerrasse } from '../../core/contexteTerrasse.js';
import { rendreScene, rendreObjets, type ContexteRendu } from '../../render/pipeline.js';
import { dessinerCourbesRelief } from '../../render/relief.js';
import { dessinerNomsDesRues } from '../../render/rues.js';
import { creerApercuVue } from '../../render/apercuVue.js';
import { dessinerReleves } from '../../render/releve.js';
import { dessinerCloture, margeAcces } from '../../render/cloture.js';
import { cleDesCalques, cleDesCalquesEnMetres, redessinerSiChange } from '../../render/calquesGardes.js';
import { versMetres, traitsALEcran } from '../../render/repere.js';
import { clotureDe } from '../../model/cloture.js';
import { poserEnQueue } from '../../render/empilement.js';
import { lesTerrains, litLesReleves } from '../../core/lectures.js';
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

/**
 * Ce que coute l'image qui suit un rendu, en plus du rendu : le style, la mise en page et la peinture que le navigateur refait de
 * ce que le rendu a change. Mesure du debut de l'image (`requestAnimationFrame`) a un message poste depuis lui, qui passe apres la
 * peinture : l'attente de l'image n'y compte pas. `rendre` recoit la duree, plus tard ; sans navigateur, rien.
 */
function mesurerImage(rendre: (duree: number) => void): void {
  if (typeof requestAnimationFrame !== 'function' || typeof MessageChannel !== 'function') return;
  requestAnimationFrame(() => {
    const debut = performance.now(), canal = new MessageChannel();
    canal.port1.onmessage = () => { rendre(performance.now() - debut); canal.port1.close(); };
    canal.port2.postMessage(null);
  });
}

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
    // Le repere du dessin suit la vue : un deplacement n'est qu'un decalage du viewBox (render/repere.ts).
    dessin.suivreLaVue();
    rendreScene(etat, contexteRendu());
    tiroir.synchroniser(contexteChange);
    magasin.notifier();
    const duree = performance.now() - debut;
    // Un rendu d'autre chose (la fin d'un apercu, une ecriture) remet le deplacement a l'essai : il se rejauge au geste suivant.
    if (deplacement) dureeDernierDeplacement = duree;
    else {
      dureeDernierRendu = duree; dureeDernierDeplacement = 0;
      // Le zoom se jauge jusqu'a l'image : au telephone, le navigateur repeint le plan zoome en plus de temps que le rendu n'en prend
      // (MD/roadmap-architecture.md, etape 2.3), et un rendu de script court ne dit pas qu'une image le sera.
      mesurerImage((image) => { dureeDerniereImage = duree + image; });
    }
  }
  // Le zoom et le deplacement s'adaptent au plan (render/apercuVue.ts) : un rendu complet tant qu'il est rapide (un petit plan), un
  // apercu par transformation pendant le geste quand il ne l'est plus. Le deplacement de la vue ne change que le decalage du repere
  // (render/repere.ts) : ni objet ni calque pose sur le plan ne se redessine, son rendu est court et passe sous le frein. Chacun
  // est jauge sur sa propre duree : un deplacement rapide ne dit rien d'un zoom, qui replace ce qui se mesure en pixels et refait
  // les calques du dessus. Le zoom se jauge jusqu'a l'image (`mesurerImage`) : depuis l'etape 2.3 son rendu est court (les objets
  // ne font que suivre la transformation du repere), mais au telephone, sur un grand plan, le navigateur met encore plus d'une
  // image a repeindre le plan zoome ; l'apercu, lui, ne redessine rien et transforme ce qui est peint.
  const apercu = creerApercuVue({ element: surface.svg, rendre: () => render() });
  let dureeDernierRendu = 0, dureeDerniereImage = 0, dureeDernierDeplacement = 0;
  let deplacement = false;
  const vueChangee = (avant: typeof etat.scene) => {
    const s = etat.scene;
    const pur = !apercu.enCours() && s.scale === avant.scale && s.W === avant.W && s.H === avant.H;
    if (pur && dureeDernierDeplacement < RENDU_LENT_MS) {
      deplacement = true;
      try { render(); } finally { deplacement = false; }
    } else if (!pur && Math.max(dureeDernierRendu, dureeDerniereImage) < RENDU_LENT_MS) render();
    else apercu.changer(avant, s);
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
      ...dessin, ...affichage, markDirty, render, etat, orthoGroup: () => surface.ortho, repere: dessin.sceneDessin(), groupeObjets: surface.objets,
      // ?mode=devroof ou devwall : chaque batiment peint selon l'origine de son toit ou de ses murs.
      ...(diagnostic ? { couleurDiagnostic: (o: ObjetPlan) => couleurDiagnostic(o, diagnostic) } : {}),
      // Les courbes de niveau du relief, dans leur calque au-dessus de la grille (render/relief.ts).
      // Le voisinage masque emporte le paysage (courbes au-dela de la parcelle) et le nom des rues.
      // Posees sur le plan, dans le repere du dessin : refaites seulement si ce qu'elles lisent a change (render/calquesGardes.ts).
      dessinerRelief: () => redessinerSiChange(surface.relief, 'courbes de niveau', cleDesCalques(dessin.etatDessin(), lesTerrains), () =>
        dessinerCourbesRelief(surface.relief, etat.objects, dessin.sceneDessin(), etat.voisinageVisible)),
      // Le nom des rues, si la case de la section « Voisinage » est cochee (render/rues.ts).
      dessinerRues: () => { if (etat.voisinageVisible) dessinerNomsDesRues(surface.rues, etat.objects, etat.scene, affichage.objetMasque); else surface.rues.innerHTML = ''; },
      // Les ouvertures relevees puis la cloture, dans le meme groupe : le premier le vide. Dessinees en metres, sous la
      // transformation du groupe (render/repere.ts) : un zoom ne les refait pas, sauf la poignee d'un acces, dont la marge se compte
      // en pixels (`margeAcces`). Refaites seulement si ce qu'elles lisent a change (render/calquesGardes.ts).
      renderReleves: () => {
        const enDessin = dessin.etatDessin();
        const parcelle = affichage.trouverParcelleCloture();
        const cloture = parcelle && !affichage.objetMasque(parcelle) ? parcelle : null;
        const marge = cloture && clotureDe(cloture).portails.length ? margeAcces(enDessin.scene.scale) : null;
        redessinerSiChange(surface.releves, 'releves et cloture', cleDesCalquesEnMetres(enDessin, litLesReleves, marge), () => {
          const enMetres = { ...enDessin, scene: { ...enDessin.scene, scale: 1 } };
          dessinerReleves(surface.releves, enMetres, versMetres, affichage.objetMasque);
          if (cloture) dessinerCloture(surface.releves, enMetres, versMetres, cloture, enDessin.scene.scale);
          traitsALEcran(surface.releves);
        });
        // Toujours au-dessus des objets (un objet cree depuis se pose au bout) : sans le deplacer s'il y est deja.
        poserEnQueue(surface.svg, [surface.releves]);
      }
    };
  }
  return { render, vueChangee, redessinerObjets };
}

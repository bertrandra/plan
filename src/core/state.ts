// L'etat de l'application, en un seul objet explicite (spec-migration-typescript.md §6.1).
//
// Le fichier mono-page tenait tout son etat dans des variables libres de la fermeture de `boot()` :
// n'importe quelle fonction pouvait lire et ecrire n'importe quoi, sans que rien ne le dise. C'est
// la raison d'etre de cette migration, et c'est aussi ce qui rendait le code intestable hors
// navigateur.
//
// Le remplacement est un objet passe en parametre, PAS des `let` au niveau module : ceux-ci
// reproduiraient exactement le meme probleme avec une ergonomie pire, et empecheraient deux etats
// de coexister dans un test (§6.1).
//
// Cet objet grandit au fil de la migration : chaque variable libre qui rejoint `EtatApp` est une
// dependance qui cesse d'etre invisible. Ce qui n'y est pas encore vit toujours dans `boot()`.

import { creerScene, type EtatScene } from '../geometry/vue.js';
import { PileAnnulation } from './history.js';
import type { ObjetPlan, ObjetBrut, Mesure } from '../model/types.js';

/** Ce que designe un survol ou une selection fine : un cote, un sommet, ou rien. */
export interface Surbrillance {
  type: string | null;
  index: number | null;
}

/** Reglages du calque d'ombre des parasols - date et heure choisies aux curseurs. */
export interface EtatParasol {
  ombreAffichee: boolean;
  carteAffichee: boolean;
  dateStr: string;
  minutes: number;
}

export interface EtatApp {
  // Donnees persistees
  objects: ObjetPlan[];
  measures: Mesure[];

  // Selection et modes
  selectedKey: string | null;
  highlight: Surbrillance;
  panelTab: string;
  /** La terrasse courante : un contexte du plan, tenu par core/contexteTerrasse.ts. */
  terrasseSelectedKey: string | null;
  /** Les couches de la terrasse courante (vis, solives, lames…) dessinees sur le plan. */
  calquesVisibles: boolean;
  /**
   * Le plan ne peut pas etre modifie : la personne n'a pas `projects.write` sur la plateforme.
   *
   * Pose ici et non lu depuis les droits, parce que les gestes du pointeur vivent dans
   * `interaction/` et n'ont rien a savoir d'une plateforme. La racine de composition le remplit
   * une fois le contexte lu ; hors plateforme, il reste faux.
   */
  lectureSeule: boolean;

  // Transformation de la scene (deja sortie en phase 4b)
  scene: EtatScene;

  // Bascules d'affichage
  showNorth: boolean;
  grilleVisible: boolean;
  voisinageVisible: boolean;

  // Edition
  dirty: boolean;
  newObjCounter: number;
  undoStack: PileAnnulation;
  parasol: EtatParasol;
}

export interface GraineProjet {
  objects?: ObjetBrut[];
  measures?: Mesure[];
}

/**
 * Construit l'etat initial. `normaliser` est passe en parametre parce que c'est la racine de
 * composition (`app/boot.ts`) qui decide de quoi normaliser : le faire ici creerait une dependance
 * de core/ vers model/ et vers app/, que la regle de sens des dependances interdit (§3.3).
 *
 * Sa signature dit ce qu'il fait : il prend des objets dont rien n'est garanti et rend des objets
 * du plan. C'est le seul endroit du programme ou passe cette frontiere.
 */
export function creerEtat(
  seed: GraineProjet,
  normaliser: (objs: ObjetBrut[]) => ObjetPlan[]
): EtatApp {
  const objects = normaliser(seed.objects || []);
  return {
    objects,
    measures: (seed.measures || []).map((m) => ({ ...m })),

    // La terrasse est l'objet qu'on vient regarder en arrivant, quand il y en a une.
    selectedKey: objects.some((o) => o.key === 'terrasse')
      ? 'terrasse'
      : objects.length
        ? objects[0]!.key
        : null,
    highlight: { type: null, index: null },
    // Les cotes plutot qu'un onglet de terrasse : ceux-la recalculent le chiffrage et l'ecrivent
    // dans le projet des qu'ils s'ouvrent, ce que l'ancien mode Terrasse ne faisait qu'a la demande.
    panelTab: 'mesure',
    lectureSeule: false,
    terrasseSelectedKey: null,
    calquesVisibles: false,

    scene: creerScene(),

    showNorth: true,
    grilleVisible: true,
    voisinageVisible: true,

    dirty: false,
    newObjCounter: 1,
    undoStack: new PileAnnulation(),
    parasol: {
      ombreAffichee: true,
      carteAffichee: false,
      // Solstice d'ete a 15h : le cas ou l'ombre portee est la plus parlante.
      dateStr: new Date().getFullYear() + '-06-21',
      minutes: 900
    }
  };
}

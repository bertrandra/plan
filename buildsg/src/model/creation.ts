// Naissance et mort d'un objet du plan (spec §6.1).
//
// Le module est coupe en deux, et la coupure porte l'essentiel :
//
// - **les fabriques** (`nouveau*`) sont pures : elles decrivent la forme qu'un objet neuf doit
//   avoir, et rien d'autre. C'est la que vivent les choix — dimensions, couleurs, fonction, priorite
//   d'empilement, onglet a ouvrir — et c'est ce qui se teste ;
// - **`creerCreation`** pose ces objets dans le plan. Sept gestes qui doivent tous avoir lieu, dans
//   cet ordre : instantane d'annulation, ajout, DOM, poignees, ordre d'empilement, selection, rendu.
//   Les separer evite qu'un nouveau type d'objet en oublie un — c'est ainsi qu'on obtient un objet
//   invisible, ou selectionne mais sans poignees.
//
// Trois objets du plan sont en realite des primitives detournees, et c'est deliberé : un parasol et
// un point de vue reutilisent le cercle et le chemin plutot que d'avoir leur propre mecanique de
// placement, de selection et d'export. Seule leur `fonction` les distingue, et c'est elle que les
// panneaux et la Vue 3D lisent pour les traiter a part.

import { au } from '../util/tableaux.js';
import { centroid } from '../geometry/basic.js';
import { cleObjet } from './cles.js';
import type { PtBrut, ObjetPlan, ObjetBrut } from './types.js';
import { enPoints } from './formes.js';
import { estTerrasse, terrasseOuPremiere } from './fonctions.js';

/**
 * Ce que la creation lit et ecrit dans l'etat — cinq champs, pas l'etat entier.
 *
 * Nommer l'exigence plutot que d'importer `EtatApp` garde `model/` independant de `core/` : le
 * modele decrit ce qu'est un plan, il n'a pas a connaitre la pile d'annulation ni la transformation
 * de la scene. C'est aussi ce qui permet d'appeler `creerCreation` dans un test avec un objet de
 * cinq champs.
 */
export interface EtatCreation {
  objects: ObjetPlan[];
  selectedKey: string | null;
  terrasseSelectedKey: string | null;
  /** Consomme par `cleObjet` a chaque objet neuf. */
  newObjCounter: number;
}

/** La section de l'inspecteur que la creation designe : les cotes d'une forme libre, l'objet d'un rectangle. */
export type OngletAttribut = 'objet' | 'segments';

/** Une forme neuve, et l'onglet qui doit l'accompagner. */
export interface ObjetNeuf { obj: ObjetPlan; onglet: OngletAttribut }

/**
 * Objet a quatre coins, rectangle ou libre.
 *
 * `enRectangle` arme le mode rectangle des le depart : les quatre angles sont tenus a 90°, et tirer
 * un coin redimensionne au lieu de deformer. C'est de loin le cas le plus courant — terrasse, dalle,
 * abri — et il obligeait jusqu'ici a aller cocher la case a la main. La forme naît alors en 3 × 2 m
 * plutot qu'en carre, pour qu'on voie tout de suite que c'est un rectangle.
 *
 * L'onglet ouvert differe pour la meme raison : sur un rectangle on ouvre « Objet », ou se trouve la
 * case du mode — celle qu'il faudra decocher pour reprendre la main sur les angles.
 */
export function nouvelObjet(c: PtBrut, key: string, enRectangle: boolean): ObjetNeuf {
  const demiL = enRectangle ? 1.5 : 1.0;
  const demiH = 1.0;
  return {
    obj: {
      key, type: 'polygon', name: enRectangle ? 'Nouveau rectangle' : 'Nouvel objet',
      fill: '#8fb3d9', fillOpacity: 0.75, stroke: '#2a4d6e',
      pts: [
        { x: c.x - demiL, y: c.y - demiH }, { x: c.x + demiL, y: c.y - demiH },
        { x: c.x + demiL, y: c.y + demiH }, { x: c.x - demiL, y: c.y + demiH }
      ],
      vertexNames: ['Coin 1', 'Coin 2', 'Coin 3', 'Coin 4'],
      segmentNames: ['Cote 1', 'Cote 2', 'Cote 3', 'Cote 4'],
      frozenVertices: enRectangle ? [true, true, true, true] : [false, false, false, false],
      showName: true, showSegNames: false, showVertNames: false, showDims: true, showAngles: false,
      constrained: true, fonction: 'autre', matiere: '', priority: 2, locked: false
    },
    onglet: enRectangle ? 'objet' : 'segments'
  };
}

/** Chemin : deux points et une largeur, pour une allee ou une bordure. */
export function nouveauChemin(c: PtBrut, key: string): ObjetNeuf {
  return {
    obj: {
      key, type: 'path', name: 'Nouveau chemin', fill: '#c9a15a', fillOpacity: 1, stroke: '#c9a15a',
      pts: [{ x: c.x - 2, y: c.y }, { x: c.x + 2, y: c.y }],
      vertexNames: ['Point 1', 'Point 2'],
      segmentNames: ['Cote 1'],
      frozenVertices: [false, false],
      width: 1.2, curve: false,
      showName: true, showSegNames: false, showVertNames: false, showDims: true, showAngles: false,
      constrained: true, fonction: 'chemin', matiere: '', priority: 2, locked: false
    },
    onglet: 'segments'
  };
}

export function nouveauCercle(c: PtBrut, key: string): ObjetNeuf {
  return {
    obj: {
      key, type: 'circle', name: 'Nouveau cercle', fill: '#5bc8f5', fillOpacity: 0.88, stroke: '#0a3d5c',
      center: { x: c.x, y: c.y }, r: 1.0,
      showName: true, showSegNames: false, showVertNames: false, showDims: true, showAngles: false,
      constrained: true, fonction: 'equipement', matiere: '', priority: 2, locked: false
    },
    onglet: 'objet'
  };
}

/**
 * Parasol : un cercle dont le rayon est celui de la toile — donc deja glissable et editable comme
 * tout cercle. Sa `fonction` fait que le panneau y ajoute la hauteur de mat et les outils d'ombre,
 * et que la Vue 3D le modelise en mat + toile plutot qu'en bloc plein.
 *
 * Il naît lie a `terrasse` : c'est un parasol **de** terrasse, et le rattachement decide quelle
 * terrasse la recherche d'ombre mesurera. Sans lui, un jardin a plusieurs terrasses les optimiserait
 * tous sur la premiere trouvee.
 */
export function nouveauParasol(c: PtBrut, key: string, numero: number, terrasse: ObjetPlan | undefined): ObjetNeuf {
  return {
    obj: {
      key, type: 'circle', name: 'Parasol ' + numero, fill: '#7a9e6b', fillOpacity: 0.55, stroke: '#3f5c33',
      center: { x: c.x, y: c.y }, r: 1.5, // 3 m de diametre, taille courante d'un parasol de terrasse
      showName: true, showSegNames: false, showVertNames: false, showDims: true, showAngles: false,
      constrained: true, fonction: 'parasol', matiere: '', priority: 4, locked: false,
      hauteurParasol: 2.2,
      terrasseLieeKey: (terrasse && estTerrasse(terrasse)) ? terrasse.key : null
    },
    onglet: 'objet'
  };
}

/** La longueur du segment qui porte la direction d'un point de vue, en metres. */
const VISEE_M = 2;

/**
 * Point de vue : un chemin de deux points — la position et ce qu'elle vise. Sa `fonction` fait que
 * le panneau y ajoute altitude et direction, et que la Vue 3D sait lesquels lister.
 *
 * Deux chemins y menent : le bouton « + Point de vue » du plan, qui pose une visee vers l'est par
 * defaut a hauteur d'yeux, et « Enregistrer la vue » depuis la 3D, qui reprend la direction et
 * l'altitude reelles de la camera. Ils ne different **que** par ces deux valeurs, d'ou les
 * parametres : la forme, elle, ne doit exister qu'une fois — les deux versions etaient tenues en
 * phase a la main, et le commentaire de l'une demandait deja de penser a l'autre.
 */
export function nouveauPointDeVue(
  c: PtBrut, key: string, numero: number,
  direction: { x: number; y: number } = { x: 1, y: 0 },
  altitude = 1.6
): ObjetNeuf {
  return {
    obj: {
      key, type: 'path', name: 'Point de vue ' + numero, fill: '#c0392b', fillOpacity: 0.9, stroke: '#6b1f16',
      pts: [{ x: c.x, y: c.y }, { x: c.x + direction.x * VISEE_M, y: c.y + direction.y * VISEE_M }],
      vertexNames: ['Position', 'Direction'], segmentNames: ['Vise'],
      frozenVertices: [false, false], width: 0.08, curve: false,
      showName: true, showSegNames: false, showVertNames: false, showDims: false, showAngles: false,
      constrained: false, fonction: 'camera', matiere: '', priority: 3, locked: false,
      altitude
    },
    onglet: 'objet'
  };
}

/**
 * Un objet passe par la serialisation : des donnees pures, sans element SVG. Non decrit plus
 * finement ici — la forme exacte appartient a `io/serialisation.ts` et a sa liste blanche.
 */
export type ObjetSerialise = ObjetBrut & { key: string };

/** Ce que la creation doit pouvoir faire au plan et a l'interface. */
export interface ContexteCreation {
  pushHistory: () => void;
  createObjectDOM: (obj: ObjetPlan) => void;
  rebuildHandles: (obj: ObjetPlan) => void;
  reapplyStackingOrder: () => void;
  rebuildSelector: () => void;
  render: () => void;
  detruireVue: (obj: ObjetPlan) => void;
  serializeObjects: (objets: ObjetPlan[]) => ObjetSerialise[];
  /**
   * L'aller-retour perd la garantie et la reprend : la serialisation rend des donnees nues, et
   * `dupliquer` repose `key` et `name` juste avant cet appel. C'est ce qui fait du resultat un objet
   * du plan a nouveau, et pas la normalisation elle-meme.
   */
  normalizeObjects: (bruts: ObjetSerialise[]) => ObjetPlan[];
  showToast: (message: string) => void;
  showConfirm: (message: string, oui: () => void) => void;
  /** L'horloge qui date les cles d'objets (voir `model/cles.ts`). `Date.now` par defaut. */
  horloge?: () => number;
}

export function creerCreation(etat: EtatCreation, ctx: ContexteCreation) {
  /** Centre de la parcelle : un objet neuf naît la ou on regarde, pas a l'origine du repere. */
  function centreParcelle() {
    const pc = etat.objects.find(o => o.key === 'parcelle');
    // La parcelle est un polygone : elle porte toujours `pts`.
    return pc ? centroid(enPoints(pc).pts) : { x: 0, y: 0 };
  }

  function cle(prefixe: string) {
    return cleObjet(prefixe, etat, { horloge: ctx.horloge });
  }

  /** Les sept gestes de l'insertion, dans l'ordre — aucun n'est facultatif. */
  function inserer({ obj }: ObjetNeuf) {
    etat.objects.push(obj);
    ctx.createObjectDOM(obj);
    ctx.rebuildHandles(obj);
    ctx.reapplyStackingOrder();
    etat.selectedKey = obj.key;
    ctx.rebuildSelector();
    ctx.render();
  }

  return {
    ajouterObjet(enRectangle: boolean) {
      ctx.pushHistory();
      inserer(nouvelObjet(centreParcelle(), cle('obj'), enRectangle));
    },

    ajouterChemin() {
      ctx.pushHistory();
      inserer(nouveauChemin(centreParcelle(), cle('path')));
    },

    ajouterCercle() {
      ctx.pushHistory();
      inserer(nouveauCercle(centreParcelle(), cle('circle')));
    },

    ajouterParasol() {
      ctx.pushHistory();
      // Pose au centre de la terrasse plutot que de la parcelle : sinon il naît loin de l'endroit ou
      // on veut l'utiliser.
      const terr = terrasseOuPremiere(etat.objects, etat.terrasseSelectedKey)
                || etat.objects.find(o => o.key === 'parcelle');
      const c = terr ? centroid(enPoints(terr).pts) : { x: 0, y: 0 };
      const n = etat.objects.filter(o => o.fonction === 'parasol').length + 1;
      inserer(nouveauParasol(c, cle('circle'), n, terr));
    },

    ajouterPointDeVue() {
      ctx.pushHistory();
      const n = etat.objects.filter(o => o.fonction === 'camera').length + 1;
      inserer(nouveauPointDeVue(centreParcelle(), cle('path'), n));
    },

    /**
     * Duplique l'objet selectionne, decale de 5 m vers l'ouest pour qu'il ne se superpose pas a son
     * original.
     *
     * La copie passe par le meme couple serialisation / normalisation que l'enregistrement et
     * l'annulation. La raison d'origine — l'objet portait ses elements SVG, que `JSON.stringify` ne
     * sait pas traiter — a disparu en phase 4. Ce qui reste, et qui suffit a garder ce detour : la
     * copie doit etre normalisee comme un objet importe, avec ses invariants de tableaux.
     */
    dupliquer() {
      const src = etat.objects.find(o => o.key === etat.selectedKey);
      if (!src) { ctx.showToast('Selectionne d\'abord un objet a dupliquer.'); return; }
      ctx.pushHistory();
      const plain = au(ctx.serializeObjects([src]), 0);
      plain.key = cle('dup');
      plain.name = src.name + ' (copie)';
      const clone = au(ctx.normalizeObjects([plain]), 0);
      if (clone.type === 'circle') clone.center.x -= 5;
      else clone.pts.forEach(p => { p.x -= 5; });
      inserer({ obj: clone, onglet: 'objet' });
    },

    /**
     * Supprime l'objet selectionne, apres confirmation.
     *
     * Deux objets resistent : la parcelle, qui porte le repere et le lieu du plan, et tout objet
     * verrouille — le verrou existe justement pour empecher le geste distrait.
     */
    supprimer() {
      if (!etat.selectedKey) { ctx.showToast('Sélectionne d\'abord un objet à supprimer.'); return; }
      if (etat.selectedKey === 'parcelle') { ctx.showToast('La parcelle ne peut pas être supprimée.'); return; }
      const idx = etat.objects.findIndex(o => o.key === etat.selectedKey);
      if (idx === -1) return;
      const obj = au(etat.objects, idx);
      if (obj.locked) { ctx.showToast('Cet objet est verrouille. Decoche "Verrouiller objet" avant de le supprimer.'); return; }
      ctx.showConfirm('Supprimer definitivement "' + obj.name + '" ?', () => {
        ctx.pushHistory();
        // Le demontage oublie aussi l'entree de la carte des vues, que la suppression laissait
        // derriere elle.
        ctx.detruireVue(obj);
        etat.objects.splice(idx, 1);
        etat.selectedKey = null;
        ctx.rebuildSelector();
        ctx.render();
      });
    }
  };
}

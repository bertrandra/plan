// Le dessin du plan sur sa surface : les objets et leurs poignees, l'ordre d'empilement, et les
// calques de repere (app/assemblage/).
//
// Chaque fonction ici est une enveloppe : le dessin lui-meme vit dans render/. Elles fournissent a
// chaque module de render/ ce qu'il ne peut pas aller chercher seul — la racine SVG, la scene, le
// calque qui lui revient — et gardent les noms qu'utilisent l'historique, les gestes et les ecouteurs.

import { versEcran, versMonde } from '../../geometry/vue.js';
import { creerDomObjet, reconstruirePoignees } from '../../render/objects.js';
import { amenerPoigneesDevant as remonterPoignees, reappliquerEmpilement, type ContexteEmpilement } from '../../render/empilement.js';
import { vue } from '../../render/vues.js';
import { dessinerGrille } from '../../render/grille.js';
import { dessinerFlecheNord, dessinerEchelle } from '../../render/decor.js';
import { dessinerCotes } from '../../render/measures.js';
import { dessinerCalqueParasols } from '../../render/parasolOverlay.js';
import { renderTerrasseLayerView as dessinerCouches } from '../../render/terrasseCouches.js';
import { contraindreParasols, positionMat, type ContexteSoleil } from '../../engine/parasol.js';
import { mesure } from '../../interaction/outilMesure.js';
import { aDessiner } from './formes.js';
import type { Surface } from './surface.js';
import type { EtatApp } from '../../core/state.js';
import type { ObjetPlan, PtBrut, PtEcran } from '../../model/types.js';

export interface Dessin {
  toScreen(p: PtBrut): PtEcran;
  toWorld(p: PtEcran): PtBrut;
  createObjectDOM(obj: ObjetPlan): void;
  rebuildHandles(obj: ObjetPlan): void;
  amenerPoigneesDevant(obj: ObjetPlan): void;
  reapplyStackingOrder(): void;
  drawGrid(): void;
  drawNorthArrow(): void;
  drawScaleBar(): void;
  drawMeasures(): void;
  renderParasolOverlay(): void;
  renderTerrasseLayerView(obj: ObjetPlan | null | undefined): void;
}

export interface DependancesDessin {
  /** Le double-clic sur un cote de l'objet selectionne y insere un sommet. */
  insererSommetAuClic: (obj: ObjetPlan, cote: number, clic: PtBrut) => void;
  /** La date, l'heure et le lieu, pour les ombres des parasols. */
  contexteSoleil: () => ContexteSoleil;
}

export function creerDessin(etat: EtatApp, s: Surface, d: DependancesDessin): Dessin {
  const toScreen = (p: PtBrut) => versEcran(etat.scene, p);
  const toWorld = (p: PtEcran) => versMonde(etat.scene, p);
  // La vue d'un objet empile a son `el` des que `creerDomObjet` l'a pose ; avant, il n'y a rien a empiler.
  const ctxEmpilement = (): ContexteEmpilement<SVGElement | null> => ({ svg: { appendChild: (el) => { if (el) s.svg.appendChild(el); } }, vue });
  return {
    toScreen, toWorld,
    createObjectDOM: (obj) => creerDomObjet(s.svg, aDessiner(obj), etat.scene),
    rebuildHandles(obj) {
      reconstruirePoignees(aDessiner(obj), {
        racine: s.svg,
        surDoubleClicCote(o, index, ev) {
          if (o.key !== etat.selectedKey) return;
          const rect = s.stage.getBoundingClientRect();
          d.insererSommetAuClic(o, index, toWorld({ x: ev.clientX - rect.left, y: ev.clientY - rect.top }));
          ev.preventDefault();
        }
      });
    },
    amenerPoigneesDevant: (obj) => remonterPoignees(obj, ctxEmpilement()),
    reapplyStackingOrder: () => reappliquerEmpilement(etat.objects, ctxEmpilement()),
    drawGrid: () => dessinerGrille(s.grille, etat),
    drawNorthArrow: () => dessinerFlecheNord(s.nord, etat),
    drawScaleBar: () => dessinerEchelle(s.echelle, etat),
    // Les cotes posees, et le brouillon de l'outil de cotation en cours de saisie.
    drawMeasures: () => dessinerCotes(s.cotes, { scene: etat.scene, objets: etat.objects, mesures: etat.measures, brouillonRef: mesure.ref, brouillonCibles: mesure.cibles }),
    // La contrainte de position modifie les objets : elle s'execute avant le dessin, comme avant.
    renderParasolOverlay() {
      contraindreParasols(etat.objects, etat.terrasseSelectedKey);
      dessinerCalqueParasols({ groupeOmbres: s.parasols, groupeMats: s.mats, racine: s.svg, etat, ctxSoleil: d.contexteSoleil(), positionMat });
    },
    // Les couches ne se dessinent que si l'explorateur les a demandees : un appel sans objet vide le calque.
    // Une terrasse isolee les montre toujours : c'est ce que sa transparence laisse voir (app/isolement.ts).
    renderTerrasseLayerView: (obj) => dessinerCouches(s.couches, etat.calquesVisibles || (obj && obj.key === etat.isolement) ? obj : null, etat, toScreen)
  };
}

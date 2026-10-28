// Le dessin du plan sur sa surface : les objets et leurs poignees, l'ordre d'empilement, et les
// calques de repere (app/assemblage/).
//
// Chaque fonction ici est une enveloppe : le dessin lui-meme vit dans render/. Elles fournissent a
// chaque module de render/ ce qu'il ne peut pas aller chercher seul — la racine SVG, la scene, le
// calque qui lui revient — et gardent les noms qu'utilisent l'historique, les gestes et les ecouteurs.

import { estOuvrage, PARASOL } from '../../model/ouvrages/index.js';
import { versEcran, versMonde } from '../../geometry/vue.js';
import { creerDomObjet, reconstruirePoignees } from '../../render/objects.js';
import { amenerPoigneesDevant as remonterPoignees, amenerDevant, reappliquerEmpilement, poserEnQueue, type ContexteEmpilement } from '../../render/empilement.js';
import { cleDesCalques, redessinerSiChange } from '../../render/calquesGardes.js';
import { vue } from '../../render/vues.js';
import { dessinerGrille } from '../../render/grille.js';
import { dessinerFlecheNord, dessinerEchelle } from '../../render/decor.js';
import { dessinerCotes } from '../../render/measures.js';
import { dessinerCalqueParasols } from '../../render/parasolOverlay.js';
import { dessinerCalquePergolas } from '../../render/pergolaOverlay.js';
import { dessinerCalquePiscines } from '../../render/piscineOverlay.js';
import { renderTerrasseLayerView as dessinerCouches } from '../../render/terrasseCouches.js';
import { toucher } from '../../core/controleurObjets.js';
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
  // Un empilement qui ne deplace rien encore : il dit l'ordre voulu, que `poserEnQueue` pose ensuite d'un coup.
  const enQueue = (q: Element[]): ContexteEmpilement<SVGElement | null> => ({ svg: { appendChild: (el) => { if (el) q.push(el); } }, vue });
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
    // Les poignees de la selection, devant tout : sans rien deplacer si elles y sont deja (render/empilement.ts, poserEnQueue).
    amenerPoigneesDevant: (obj) => { const q: Element[] = []; remonterPoignees(obj, enQueue(q)); poserEnQueue(s.svg, q, [s.releves]); },
    reapplyStackingOrder: () => reappliquerEmpilement(etat.objects, ctxEmpilement()),
    drawGrid: () => dessinerGrille(s.grille, etat),
    // Les calques du dessus ne se refont que si ce qu'ils lisent a change (render/calquesGardes.ts).
    drawNorthArrow: () => redessinerSiChange(s.nord, 'fleche du nord', cleDesCalques(etat), () => dessinerFlecheNord(s.nord, etat)),
    drawScaleBar: () => redessinerSiChange(s.echelle, 'echelle', cleDesCalques(etat), () => dessinerEchelle(s.echelle, etat)),
    // Les cotes posees, et le brouillon de l'outil de cotation en cours de saisie.
    drawMeasures: () => redessinerSiChange(s.cotes, 'cotes', cleDesCalques(etat), () =>
      dessinerCotes(s.cotes, { scene: etat.scene, objets: etat.objects, mesures: etat.measures, brouillonRef: mesure.ref, brouillonCibles: mesure.cibles })),
    // La contrainte de position modifie les objets : elle s'execute avant le dessin, comme avant.
    renderParasolOverlay() {
      // Un parasol dont le mat suit le bord de sa terrasse bouge avec elle : le plan le redessine (core/controleurObjets.ts).
      contraindreParasols(etat.objects, etat.terrasseSelectedKey).forEach(toucher);
      const ctxSoleil = d.contexteSoleil();
      const cle = cleDesCalques(etat, ctxSoleil);
      redessinerSiChange([s.parasols, s.mats], 'ombres des parasols', cle, () =>
        dessinerCalqueParasols({ groupeOmbres: s.parasols, groupeMats: s.mats, racine: s.svg, etat, ctxSoleil, positionMat }));
      // L'ombre passe DEVANT les objets : une ombre portee se lit sur ce qu'elle couvre — la
      // terrasse, un massif, la pelouse —, pas dessous. Le calque est inerte, les clics le
      // traversent. Seuls restent au-dessus : la toile des parasols (une ombre ne couvre pas ce qui
      // la projette), leurs mats, puis les calques du dessus (nord, echelle, cotes, couches) ; les
      // poignees de la selection sont remontees ensuite par le rendu.
      // Les abords d'une piscine (margelles, plage) se posent sur les objets, sous les ombres : une
      // ombre portee se lit aussi sur une plage.
      redessinerSiChange(s.piscines, 'piscines', cle, () => dessinerCalquePiscines(s.piscines, etat));
      // La charpente des pergolas se voit d'en haut : devant les objets et les ombres, sous les
      // parasols (une toile passe au-dessus de ce qu'elle couvre).
      redessinerSiChange(s.pergolas, 'pergolas', cle, () => dessinerCalquePergolas(s.pergolas, etat));
      // L'ordre se pose d'un coup, et rien ne bouge s'il est deja le bon : les poignees de la selection, que le rendu remonte
      // ensuite, sont comptees au bout, sans quoi tout serait deplace a chaque rendu pour leur rendre la derniere place.
      const q: Element[] = [s.piscines, s.parasols, s.pergolas];
      const ctx = enQueue(q);
      etat.objects.forEach((o) => { if (estOuvrage(o, PARASOL)) amenerDevant(o, ctx); });
      q.push(s.mats, s.nord, s.echelle, s.cotes, s.couches);
      const sel = etat.selectedKey && etat.selectedKey !== 'parcelle' ? etat.objects.find((o) => o.key === etat.selectedKey) : undefined;
      if (sel) remonterPoignees(sel, ctx);
      // Le calque des releves passe apres tout cela (le rendu le remet au-dessus des objets) : il ne compte pas comme un desordre.
      poserEnQueue(s.svg, q, [s.releves]);
    },
    // Les couches ne se dessinent que si l'explorateur les a demandees : un appel sans objet vide le calque.
    // Une terrasse isolee les montre toujours : c'est ce que sa transparence laisse voir (app/isolement.ts).
    renderTerrasseLayerView: (obj) => redessinerSiChange(s.couches, 'couches de la terrasse', cleDesCalques(etat, obj?.key ?? null), () =>
      dessinerCouches(s.couches, etat.calquesVisibles || (obj && obj.key === etat.isolement) ? obj : null, etat, toScreen))
  };
}

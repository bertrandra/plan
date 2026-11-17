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
import { lesTerrains, litLesAbris, litLesParasols, litLesPiscines, litUneTerrasse, rien } from '../../core/lectures.js';
import { creerRepere } from '../../render/repere.js';
import { elementsRecreesDuPlan, oublierLesDessins } from '../../render/pipeline.js';
import { contraindreParasols, positionMat, type ContexteSoleil } from '../../engine/parasol.js';
import { mesure } from '../../interaction/outilMesure.js';
import { aDessiner } from './formes.js';
import type { Surface } from './surface.js';
import type { EtatApp } from '../../core/state.js';
import type { ObjetPlan, PtBrut, PtEcran } from '../../model/types.js';
import type { EtatScene } from '../../geometry/vue.js';

export interface Dessin {
  toScreen(p: PtBrut): PtEcran;
  toWorld(p: PtEcran): PtBrut;
  /**
   * Suit la vue au debut d'un rendu (render/repere.ts) : le repere du dessin, garde tant que l'echelle et la taille ne changent
   * pas, et le decalage de la vue pose sur la surface. Un deplacement de la vue ne change que ce decalage.
   */
  suivreLaVue(): EtatScene;
  /** La scene dans laquelle le plan se dessine (le repere), et un point du plan dans ce repere. */
  sceneDessin(): EtatScene;
  versDessin(p: PtBrut): PtEcran;
  /** L'etat du plan vu dans le repere du dessin : ce que lisent les calques poses sur le plan. */
  etatDessin(): EtatApp;
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
  // Le repere du dessin (render/repere.ts) : les objets et les calques poses sur le plan s'y dessinent.
  const repere = creerRepere();
  const sceneDessin = (): EtatScene => repere.scene(etat.scene);
  const versDessin = (p: PtBrut) => versEcran(sceneDessin(), p);
  // Une copie de surface de l'etat, la scene remplacee par le repere : les calques la lisent sans rien y ecrire.
  const etatDessin = (): EtatApp => ({ ...etat, scene: sceneDessin() });
  // La vue d'un objet empile a son `el` des que `creerDomObjet` l'a pose ; avant, il n'y a rien a empiler.
  const ctxEmpilement = (): ContexteEmpilement<SVGElement | null> => ({ svg: { appendChild: (el) => { if (el) s.objets.appendChild(el); } }, vue });
  // Un empilement qui ne deplace rien encore : il dit l'ordre voulu, que `poserEnQueue` pose ensuite d'un coup.
  const enQueue = (q: Element[]): ContexteEmpilement<SVGElement | null> => ({ svg: { appendChild: (el) => { if (el) q.push(el); } }, vue });
  // Les elements d'un objet, et ses poignees seules. Un element qui change de parent, dans le calque des objets ou hors de lui, n'a
  // plus la transformation de sa place (render/objects.ts, `accorder`) : son objet se replace au rendu (`oublierLesDessins`), meme
  // si rien de lui n'a change. Sans cela, des poignees recreees dans le calque pendant un rendu, puis sorties devant tout au rendu
  // suivant, gardaient la transformation inverse : decalees a l'ecran, et le garde-fou `[cle de version]` le disait.
  const poigneesDe = (o: ObjetPlan) => { const v = vue(o); return [v.radiusHandle, ...v.pointEls, ...v.edgeEls, ...v.ptLabelEls, ...v.segLabelEls]; };
  const elementsDe = (o: ObjetPlan) => { const v = vue(o); return [v.el, v.nameEl, ...poigneesDe(o)]; };
  const dansLeCalque = (els: readonly (Element | null | undefined)[]) => els.some((e) => !!e && e.parentNode === s.objets);
  return {
    toScreen, toWorld, sceneDessin, versDessin, etatDessin,
    suivreLaVue() {
      const r = repere.suivre(etat.scene);
      s.poserDecalage(r.dx, r.dy);
      s.poserRepere(r.scene);
      return r.scene;
    },
    // Les objets se posent dans leur calque, qui porte le repere du dessin (render/objects.ts).
    createObjectDOM: (obj) => { creerDomObjet(s.objets, aDessiner(obj), etat.scene); elementsRecreesDuPlan(); },
    rebuildHandles(obj) {
      elementsRecreesDuPlan();
      reconstruirePoignees(aDessiner(obj), {
        racine: s.objets,
        surDoubleClicCote(o, index, ev) {
          if (o.key !== etat.selectedKey) return;
          const rect = s.stage.getBoundingClientRect();
          d.insererSommetAuClic(o, index, toWorld({ x: ev.clientX - rect.left, y: ev.clientY - rect.top }));
          ev.preventDefault();
        }
      });
    },
    // Les poignees de la selection, devant tout : sans rien deplacer si elles y sont deja (render/empilement.ts, poserEnQueue).
    amenerPoigneesDevant: (obj) => {
      const sortent = dansLeCalque(poigneesDe(obj));
      const q: Element[] = []; remonterPoignees(obj, enQueue(q)); poserEnQueue(s.svg, q, [s.releves]);
      if (sortent) oublierLesDessins([obj]);
    },
    // Reempiler ramene dans le calque des objets ce que l'empilement en avait sorti (les parasols, les poignees de la selection) :
    // ces objets-la se replacent au rendu suivant, leurs elements n'ayant plus la transformation de leur place (render/objects.ts).
    reapplyStackingOrder: () => {
      const sortis = etat.objects.filter((o) => elementsDe(o).some((e) => e && e.parentNode !== s.objets));
      reappliquerEmpilement(etat.objects, ctxEmpilement());
      oublierLesDessins(sortis);
    },
    drawGrid: () => dessinerGrille(s.grille, etat),
    // Les calques du dessus ne se refont que si ce qu'ils lisent a change (render/calquesGardes.ts).
    // La fleche et l'echelle suivent l'ecran, pas le plan : dessinees dans la vue, a un coin, leur groupe compense le decalage.
    drawNorthArrow: () => redessinerSiChange(s.nord, 'fleche du nord', cleDesCalques(etatDessin(), rien), () => dessinerFlecheNord(s.nord, etat)),
    drawScaleBar: () => redessinerSiChange(s.echelle, 'echelle', cleDesCalques(etatDessin(), rien), () => dessinerEchelle(s.echelle, etat)),
    // Les cotes posees, et le brouillon de l'outil de cotation en cours de saisie : les objets qu'elles visent, et les terrains (le
    // relief du denivele, la parcelle).
    drawMeasures: () => {
      const visees = new Set<string>();
      for (const m of etat.measures) { visees.add(m.refObjKey); visees.add(m.targetObjKey); }
      if (mesure.ref) visees.add(mesure.ref.objKey);
      for (const c of mesure.cibles) visees.add(c.objKey);
      const lit = (o: ObjetPlan) => visees.has(o.key) || lesTerrains(o);
      redessinerSiChange(s.cotes, 'cotes', cleDesCalques(etatDessin(), lit), () =>
        dessinerCotes(s.cotes, { scene: sceneDessin(), objets: etat.objects, mesures: etat.measures, brouillonRef: mesure.ref, brouillonCibles: mesure.cibles }));
    },
    // La contrainte de position modifie les objets : elle s'execute avant le dessin, comme avant.
    renderParasolOverlay() {
      // Un parasol dont le mat suit le bord de sa terrasse bouge avec elle : le plan le redessine (core/controleurObjets.ts).
      contraindreParasols(etat.objects, etat.terrasseSelectedKey).forEach(toucher);
      const ctxSoleil = d.contexteSoleil();
      const enDessin = etatDessin();
      redessinerSiChange([s.parasols, s.mats], 'ombres des parasols', cleDesCalques(enDessin, litLesParasols, ctxSoleil), () =>
        dessinerCalqueParasols({ groupeOmbres: s.parasols, groupeMats: s.mats, racine: s.svg, etat: enDessin, ctxSoleil, positionMat }));
      // L'ombre passe DEVANT les objets : une ombre portee se lit sur ce qu'elle couvre — la
      // terrasse, un massif, la pelouse —, pas dessous. Le calque est inerte, les clics le
      // traversent. Seuls restent au-dessus : la toile des parasols (une ombre ne couvre pas ce qui
      // la projette), leurs mats, puis les calques du dessus (nord, echelle, cotes, couches) ; les
      // poignees de la selection sont remontees ensuite par le rendu.
      // Les abords d'une piscine (margelles, plage) se posent sur les objets, sous les ombres : une
      // ombre portee se lit aussi sur une plage.
      redessinerSiChange(s.piscines, 'piscines', cleDesCalques(enDessin, litLesPiscines), () => dessinerCalquePiscines(s.piscines, enDessin));
      // La charpente des pergolas se voit d'en haut : devant les objets et les ombres, sous les
      // parasols (une toile passe au-dessus de ce qu'elle couvre).
      redessinerSiChange(s.pergolas, 'pergolas', cleDesCalques(enDessin, litLesAbris), () => dessinerCalquePergolas(s.pergolas, enDessin));
      // L'ordre se pose d'un coup, et rien ne bouge s'il est deja le bon : les poignees de la selection, que le rendu remonte
      // ensuite, sont comptees au bout, sans quoi tout serait deplace a chaque rendu pour leur rendre la derniere place.
      const q: Element[] = [s.piscines, s.parasols, s.pergolas];
      const ctx = enQueue(q);
      const parasols = etat.objects.filter((o) => estOuvrage(o, PARASOL));
      parasols.forEach((o) => amenerDevant(o, ctx));
      q.push(s.mats, s.nord, s.echelle, s.cotes, s.couches);
      const sel = etat.selectedKey && etat.selectedKey !== 'parcelle' ? etat.objects.find((o) => o.key === etat.selectedKey) : undefined;
      if (sel) remonterPoignees(sel, ctx);
      // Ce que cet empilement sort du calque des objets : ces objets-la se replacent.
      const sortent = parasols.filter((o) => dansLeCalque(elementsDe(o)));
      if (sel && dansLeCalque(poigneesDe(sel))) sortent.push(sel);
      // Le calque des releves passe apres tout cela (le rendu le remet au-dessus des objets) : il ne compte pas comme un desordre.
      poserEnQueue(s.svg, q, [s.releves]);
      if (sortent.length) oublierLesDessins(sortent);
    },
    // Les couches ne se dessinent que si l'explorateur les a demandees : un appel sans objet vide le calque.
    // Une terrasse isolee les montre toujours : c'est ce que sa transparence laisse voir (app/isolement.ts).
    renderTerrasseLayerView: (obj) => redessinerSiChange(s.couches, 'couches de la terrasse', cleDesCalques(etatDessin(), litUneTerrasse, obj?.key ?? null), () =>
      dessinerCouches(s.couches, etat.calquesVisibles || (obj && obj.key === etat.isolement) ? obj : null, etatDessin(), versDessin))
  };
}

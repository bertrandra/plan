// La taille du plan et ce qu'il montre (app/assemblage/) : mesurer la place qu'il a, suivre la
// fenetre, cadrer un objet dans la partie que les panneaux ne recouvrent pas.

import { appliquerClasse } from '../classe.js';
import { cadrerSur, empriseDe, plancherPourEmprise } from '../../interaction/navigation.js';
import { empriseDuCalque } from '../../model/calque.js';
import { aDesSommets, enPoints } from '../../model/formes.js';
import type { Surface } from './surface.js';
import type { EtatApp } from '../../core/state.js';
import type { ObjetPlan, PtBrut, PtEcran } from '../../model/types.js';
import type { Feuille, Magasin } from '../magasin.js';

export interface Cadrage {
  /** Suit la fenetre en gardant le centre du monde au centre. */
  redimensionner(): void;
  /** Sur tablette, replie l'explorateur et l'inspecteur — sauf celui qu'on utilisait. */
  replierPourTablette(feuilleAvant?: Feuille | null): void;
  /** Le cadrage d'ouverture sur la parcelle. */
  centrerSurParcelle(): void;
  /** Cadre un objet, sinon la parcelle, sinon tout le plan. */
  cadrer(obj: ObjetPlan | null): void;
  /**
   * Le cadrage d'ouverture d'un plan venu du cadastre : toutes les parcelles affichees (la parcelle
   * et son voisinage visible), avec la meme respiration qu'une parcelle seule.
   */
  cadrerTerrains(): void;
  /** Recalcule le plancher du zoom d'apres les parcelles affichees : appele a chaque rendu. */
  ajusterPlancher(): void;
}

export interface DependancesCadrage {
  render: () => void;
  toWorld: (p: PtEcran) => PtBrut;
  basculerExplorateur: () => void;
  basculerInspecteur: () => void;
  /** Un objet masque a l'affichage (le sien, le voisinage, l'isolement) : il ne compte pas. */
  objetMasque: (o: ObjetPlan) => boolean;
}

const LARGEUR_PALETTE = 72;
const LARGEUR_EXPLORATEUR = 248;
const LARGEUR_INSPECTEUR = 348;
/** Replie, chacun ne garde que sa poignee : 22 px et l'espace de la rangee. */
const LARGEUR_REPLIEE = 30;

/**
 * La taille de la scene, d'apres la place que la classe d'ecran laisse au plan. Mesuree avant que la
 * surface n'existe : c'est elle qui lui donne sa taille.
 */
export function mesurerScene(etat: EtatApp, magasin: Magasin): void {
  const lire = () => magasin.store.getState();
  // Telephone et tablette (spec-ihm-mobile §9.2) : le plan occupe le cadre que la feuille de style
  // reserve entre les barres (#zoneCadre) ; on le mesure plutot que de refaire ce calcul ici.
  const cadre = lire().classe === 'large' ? null : document.getElementById('zoneCadre');
  if (cadre) {
    const r = cadre.getBoundingClientRect();
    etat.scene.W = Math.max(240, Math.round(r.width));
    etat.scene.H = Math.max(240, Math.round(r.height));
    return;
  }
  // Des 1 024 px, la palette, l'explorateur et l'inspecteur prennent leur largeur au plan ; replies,
  // l'explorateur et l'inspecteur la rendent.
  const explorateur = lire().explorateurOuvert ? LARGEUR_EXPLORATEUR : LARGEUR_REPLIEE;
  const inspecteur = lire().inspecteurOuvert ? LARGEUR_INSPECTEUR : LARGEUR_REPLIEE;
  const marge = 40 + (window.innerWidth >= 1024 ? LARGEUR_PALETTE + explorateur + inspecteur : 0);
  etat.scene.W = Math.max(320, Math.min(window.innerWidth - marge, 1600));
  etat.scene.H = Math.max(420, Math.min(Math.round(window.innerHeight * 0.62), 780));
}

export function creerCadrage(etat: EtatApp, magasin: Magasin, s: Surface, d: DependancesCadrage): Cadrage {
  const lire = () => magasin.store.getState();
  let derniereLargeur = window.innerWidth;

  // Tourner un telephone avec un brouillon en cours ne doit pas le perdre (point 39 de la fumee).
  function replierPourTablette(feuilleAvant: Feuille | null = null): void {
    if (lire().classe !== 'moyen') return;
    const focus = document.activeElement;
    const garde = (id: string) => !!focus && !!document.getElementById(id)?.contains(focus);
    if (lire().explorateurOuvert && feuilleAvant !== 'objets' && !garde('zoneExplorateur')) d.basculerExplorateur();
    if (lire().inspecteurOuvert && feuilleAvant !== 'proprietes' && !garde('zoneInspecteur')) d.basculerInspecteur();
  }

  /** Les largeurs que les panneaux flottants de la tablette prennent sur les bords du plan. */
  function masquesLateraux(): { gauche: number; droite: number } {
    if (lire().classe !== 'moyen') return { gauche: 0, droite: 0 };
    const r0 = s.stage.getBoundingClientRect();
    let gauche = 0, droite = 0;
    for (const id of ['zonePalette', 'zoneExplorateur']) {
      const r = document.getElementById(id)?.getBoundingClientRect();
      if (r && r.width && r.right > r0.left && r.right < r0.left + r0.width / 2) gauche = Math.max(gauche, r.right - r0.left);
    }
    const insp = document.getElementById('zoneInspecteur')?.getBoundingClientRect();
    if (insp && insp.width > 60 && insp.left > r0.left + r0.width / 2) droite = r0.right - insp.left;
    // Jamais plus que la moitie du plan : un cadrage dans une fente ne montrerait rien.
    const total = gauche + droite, max = r0.width / 2;
    return total > max ? { gauche: gauche * max / total, droite: droite * max / total } : { gauche, droite };
  }

  /** Le bas du plan que la feuille de selection (telephone) ou le tiroir (tablette) recouvre. */
  function masqueBas(): number {
    const classe = lire().classe;
    if (classe === 'large') return 0;
    const sel = document.querySelector(classe === 'compact' ? '.feuilleSelection' : '#zoneResultats');
    if (!sel) return 0;
    const r = sel.getBoundingClientRect(), r0 = s.stage.getBoundingClientRect();
    if (!r.height || r.top >= r0.bottom) return 0;
    return Math.max(0, Math.min(etat.scene.H - 120, r0.bottom - r.top));
  }

  /** L'emprise des parcelles affichees : la parcelle du projet et les voisines visibles. */
  /**
   * Le calque du plan (model/calque.ts) : les parcelles affichees plus 10 m, la meme emprise que le
   * sol 3D et l'orthophoto. C'est lui que l'ouverture cadre et que le zoom arriere doit contenir.
   */
  const empriseTerrains = () => {
    const c = empriseDuCalque(etat.objects, d.objetMasque);
    return c ? { minX: c.xMin, maxX: c.xMax, minY: c.yMin, maxY: c.yMax } : null;
  };
  const ajusterPlancher = () => { etat.scene.zoomMin = plancherPourEmprise(etat.scene, empriseTerrains()); };

  /** Cadre une emprise dans ce que les panneaux laissent voir du plan. */
  function cadrerEmprise(emprise: NonNullable<ReturnType<typeof empriseDe>>): void {
    // On cadre dans ce que la feuille de selection, le rail et l'inspecteur flottant laissent voir :
    // sinon l'objet choisi finit sous le panneau qui le decrit (2.1.1).
    ajusterPlancher();
    const bas = masqueBas();
    const { gauche, droite } = masquesLateraux();
    const cadree = cadrerSur({ ...etat.scene, W: etat.scene.W - gauche - droite, H: etat.scene.H - bas }, emprise);
    etat.scene = { ...cadree, W: etat.scene.W, H: etat.scene.H, origine: { x: cadree.origine.x + gauche, y: cadree.origine.y } };
    d.render();
  }

  return {
    replierPourTablette,
    ajusterPlancher,
    cadrerTerrains() {
      const emprise = empriseTerrains();
      if (emprise) cadrerEmprise(emprise);
    },
    redimensionner() {
      // Le clavier virtuel qui s'ouvre sous un champ redimensionne la fenetre en hauteur seulement :
      // redessiner le plan a ce moment-la ferait perdre le focus du champ (spec-ihm-mobile §9.3).
      const focus = document.activeElement;
      const saisie = !!focus && /^(INPUT|TEXTAREA|SELECT)$/.test(focus.tagName);
      const feuilleAvant = lire().feuille;
      const classeChangee = appliquerClasse(magasin);
      if (saisie && !classeChangee && lire().classe !== 'large' && window.innerWidth === derniereLargeur) return;
      derniereLargeur = window.innerWidth;
      if (classeChangee) replierPourTablette(feuilleAvant);
      // Le centre du monde est releve AVANT le changement de taille et remis au centre apres.
      const centreAvant = d.toWorld({ x: etat.scene.W / 2, y: etat.scene.H / 2 });
      mesurerScene(etat, magasin);
      s.appliquerTaille();
      etat.scene.origine = { x: etat.scene.W / 2 - centreAvant.x * etat.scene.scale, y: etat.scene.H / 2 + centreAvant.y * etat.scene.scale };
      d.render();
    },
    // Sans parcelle — « partir d'une adresse » ouvre l'atelier vide, le temps que l'import cadastre
    // en cree une —, le cadrage par defaut de l'etat fait l'affaire.
    centrerSurParcelle() {
      const parcelle = etat.objects.find(o => o.key === 'parcelle');
      if (!parcelle || !aDesSommets(parcelle) || !parcelle.pts.length) return;
      const xs = enPoints(parcelle).pts.map(p => p.x), ys = enPoints(parcelle).pts.map(p => p.y);
      const midX = (Math.min(...xs) + Math.max(...xs)) / 2, midY = (Math.min(...ys) + Math.max(...ys)) / 2;
      const spanX = Math.max(...xs) - Math.min(...xs), spanY = Math.max(...ys) - Math.min(...ys);
      etat.scene.scale = Math.max(6, Math.min(220, Math.min((etat.scene.W - 60) / spanX, (etat.scene.H - 60) / spanY)));
      etat.scene.origine = { x: etat.scene.W / 2 - midX * etat.scene.scale, y: etat.scene.H / 2 + midY * etat.scene.scale };
    },
    cadrer(obj) {
      const parcelle = etat.objects.find(o => o.key === 'parcelle');
      const emprise = empriseDe(obj ? [obj] : (parcelle ? [parcelle] : etat.objects));
      if (emprise) cadrerEmprise(emprise);
    }
  };
}

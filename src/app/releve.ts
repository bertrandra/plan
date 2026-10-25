// Le releve de facade vu du reste du programme (spec-releve-facade §4 et §10, app/).
//
// Le dialogue (zones/Releve.tsx) fait tout le travail de prise de vue et d'analyse sans toucher au
// plan. Ce service lui dit sur quel batiment il travaille, et c'est lui seul qui ecrit le resultat
// dans le projet : un instantane d'historique d'abord (Ctrl+Z defait un releve comme n'importe quel
// geste), puis le releve, le toit, la hauteur d'egout mesuree, et les rendus qui doivent suivre.
//
// Le batiment par defaut est le contour du cadastre extrude a la hauteur du cadastre, avec le toit
// qu'on lui connait. Une facade relevee **ne change pas sa hauteur** : la photo est ramenee a la
// hauteur du batiment (zones/Releve.tsx), et la hauteur mesuree n'est que dite. Le toit lu sur la
// facade - le triangle d'un pignon, ou le pan vu depuis l'egout - remplace le toit du batiment si
// la case est cochee.

import { vue3d } from '../three/etat3d.js';
import { positionGpsCourante } from '../three/positionGps3d.js';
import { obstacle, type Obstacle } from '../geometry/ligneDeVue.js';
import { aDesSommets } from '../model/formes.js';
import { terrasseCourante } from '../core/contexteTerrasse.js';
import { showToast } from '../shell/dialogs.js';
import { facadesDuContour } from '../facade/geometrie.js';
import { estBatiment, parcelleDuProjet } from '../model/fonctions.js';
import type { EtatApp } from '../core/state.js';
import type { AideClaudeReleve } from './renfortReleve.js';
import type { ObjetPlan, ObjetPolygone, PtBrut, ReleveFacade, Toit } from '../model/types.js';

export interface ContexteReleve {
  etat: EtatApp;
  pushHistory: () => void;
  render: () => void;
  buildThreeScene: (obj: ObjetPlan | null) => void;
  elevationOf: (obj: ObjetPlan) => number;
  /** L'aide de Claude du releve (lot L18) ; absente hors navigateur ou dans les tests. */
  aide?: AideClaudeReleve | null;
}

/** Ce qui est ouvert : le batiment, et le mur deja choisi s'il l'est. */
export interface ReleveOuvert {
  objKey: string;
  cote: number | null;
}

export interface ServiceReleve {
  courant(): ReleveOuvert | null;
  abonner(cb: () => void): () => void;
  ouvrir(objKey: string, cote: number | null): void;
  fermer(): void;
  /** Le batiment du releve ouvert, tel qu'il est maintenant dans le plan. */
  batiment(): ObjetPolygone | null;
  hauteurMur(): number;
  /** L'origine geographique du plan (le calage du cadastre), s'il est geolocalise : les photos de rue se cherchent autour. */
  origine(): { lat: number; lon: number } | null;
  /**
   * La position de l'appareil dans le plan, quand elle est suivie (« Ma position (3D) », ou le mode
   * audit) : le mur propose est alors celui devant lequel on se tient (facade/calage/priseDeVue.ts).
   */
  position(): PtBrut | null;
  /** Les contours des batiments du plan : ce qui peut cacher un mur a la position. */
  obstacles(): Obstacle[];
  /**
   * Ecrit le releve dans le projet. `hauteurMesuree` est la hauteur d'egout lue sur la photo : elle
   * est dite, pas appliquee — le batiment garde sa hauteur ; `toit`, s'il est donne, remplace celui
   * du batiment.
   */
  valider(releve: ReleveFacade, toit: Toit | null, hauteurMesuree: number): void;
  /**
   * L'aide de Claude (MD/spec-facades-calage-detection.md §12 bis, lot L18) : null quand le serveur
   * de l'analyse n'est pas la ; le releve ne la propose de toute facon que sur signal.
   */
  aide(): AideClaudeReleve | null;
}

export function creerServiceReleve(ctx: ContexteReleve): ServiceReleve {
  let courant: ReleveOuvert | null = null;
  const abonnes = new Set<() => void>();
  const annoncer = () => abonnes.forEach((cb) => cb());

  const batiment = (): ObjetPolygone | null => {
    const ouvert = courant;
    if (!ouvert) return null;
    const o = ctx.etat.objects.find((x) => x.key === ouvert.objKey);
    return o && o.type === 'polygon' ? o : null;
  };

  return {
    courant: () => courant,
    abonner(cb) {
      abonnes.add(cb);
      return () => abonnes.delete(cb);
    },
    ouvrir(objKey, cote) {
      courant = { objKey, cote };
      annoncer();
    },
    fermer() {
      courant = null;
      annoncer();
    },
    batiment,
    hauteurMur() {
      const o = batiment();
      return o ? ctx.elevationOf(o) : 0;
    },
    origine() {
      const cad = parcelleDuProjet(ctx.etat.objects)?.cadastre;
      return typeof cad?.origineLat === 'number' && typeof cad.origineLon === 'number' ? { lat: cad.origineLat, lon: cad.origineLon } : null;
    },
    position: () => positionGpsCourante()?.p ?? null,
    aide: () => ctx.aide ?? null,
    obstacles: () => ctx.etat.objects.filter(estBatiment).filter(aDesSommets).map((o) => obstacle(o.pts)),
    valider(releve, toit, hauteurMesuree) {
      const o = batiment();
      if (!o) return;
      ctx.pushHistory();
      // Releve a la main : il n'est plus celui que l'audit a pose tout seul (une nouvelle photo ne le remplacera plus).
      const faite = { ...releve };
      delete faite.depuisAudit;
      o.facades = [...(o.facades || []).filter((r) => r.cote !== releve.cote), faite].sort((a, b) => a.cote - b.cote);
      if (toit) o.toit = toit;
      // La hauteur du batiment n'est pas touchee : la photo a ete ramenee a elle. La mesure est dite,
      // pour que l'ecart avec le cadastre se voie.
      const hBat = ctx.elevationOf(o);
      ctx.render();
      if (vue3d.scene) ctx.buildThreeScene(terrasseCourante(ctx.etat) || null);
      const f = facadesDuContour(o.pts, hBat).find((x) => x.cote === releve.cote);
      const n = releve.ouvertures.length;
      const fr = (v: number) => (Math.round(v * 100) / 100).toFixed(2).replace('.', ',');
      const ecart = hauteurMesuree > 0 && Math.abs(hauteurMesuree - hBat) > 0.05 ? ` (mesurée ${fr(hauteurMesuree)} m sur la photo, le bâtiment garde ${fr(hBat)} m)` : '';
      showToast(`Façade ${f ? f.orientation.toLowerCase() : ''} relevée : ${n} ouverture${n > 1 ? 's' : ''}${toit ? ', toit remplacé' : ''}${ecart}.`);
      courant = null;
      annoncer();
    },
  };
}

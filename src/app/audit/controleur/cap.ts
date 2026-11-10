// Le controleur de l audit : la prise de vue d une photo, le suivi du cap, la facade reconnue devant vous.
// Un morceau de app/audit/controleur.ts, qui le reexporte : le reste du programme importe depuis lui.

import { estOuvrage, BATIMENT } from '../../../model/ouvrages/index.js';
import { autoriserBoussole, suivreBoussole, lisserCap, ecartCap, type Attitude } from '../../../shell/boussole.js';
import { obstacle } from '../../../geometry/ligneDeVue.js';
import { facadesDuContour } from '../../../geometry/cotesVusDeDehors.js';
import { facadeDevant, texteFacadeDevant, DISTANCE_DEVANT_MAX_M, type FacadeDevant } from '../../../facade/calage/priseDeVue.js';
import { elevationOf } from '../../../engine/hauteurs.js';
import { aDesSommets } from '../../../model/formes.js';
import { type PrisePhoto } from '../../../model/audit.js';
import { poserFacadeDevant } from '../../../three/facadeDevant3d.js';
import { cameraAudit, capDuDeplacement } from '../camera.js';
import type { ProjecteurLocal } from '../../../geo/projection.js';
import type { ObjetPlan, PtBrut } from '../../../model/types.js';
import { PAS_ORIENTATION_DEG, PAS_RECONNAISSANCE_DEG, type ContexteAudit } from './contexte.js';

/** La prise de vue d'une photo : la position (repere du plan et degres), sa precision, le cap et l'attitude. */
export function prisePhotoDe(position: PtBrut | null, precision: number | null, proj: ProjecteurLocal | null,
  suivi: Pick<ReturnType<typeof suiviDuCap>, 'azimut' | 'attitude'>): PrisePhoto | null {
  if (!position) return null;
  const d = proj?.versDegres(position.x, position.y) ?? null;
  const r = (v: number, n: number) => Math.round(v * n) / n;
  return {
    t: new Date().toISOString(), x: r(position.x, 10), y: r(position.y, 10),
    lat: d ? r(d.lat, 1e7) : null, lon: d ? r(d.lon, 1e7) : null, precisionM: precision,
    ...suivi.azimut(), ...suivi.attitude(),
  };
}

/**
 * Le cap et la camera : la boussole (lissee), le sens de la marche a defaut, et « Me suivre » qui
 * tourne la vue sur ce cap tant que le doigt ne l'a pas tournee autrement.
 */
export function suiviDuCap(ctx: ContexteAudit, boussoleArrivee: () => void, capChange: (cap: number) => void) {
  const camera = cameraAudit();
  let suivre = true;
  let capBoussole: number | null = null, capMarche: number | null = null, capApplique: number | null = null;
  let pointDeCap: PtBrut | null = null;
  let arreterBoussole: (() => void) | null = null;
  /** La derniere attitude lue : au retour de l'appareil photo, c'est celle de la prise (a peu pres). */
  let attitude: Attitude | null = null;
  /** La premiere scene ou une position est connue est cadree ; les suivantes sont recentrees. */
  let cadre = false;
  const cap = () => capBoussole ?? capMarche;
  /** Tourne la vue vers le cap s'il est suivi et qu'il a assez change. */
  function orienter(): void {
    const c = cap();
    if (!suivre || c === null || !cadre) return;
    if (capApplique !== null && Math.abs(ecartCap(capApplique, c)) < PAS_ORIENTATION_DEG) return;
    capApplique = c;
    camera.orienter(c);
  }
  /** La camera suit la position : cadree la premiere fois, recentree ensuite. */
  function suivreCamera(p: PtBrut): void {
    if (!cadre) { cadre = camera.cadrer(p, cap()); capApplique = cap(); return; }
    camera.recentrer(p);
  }
  function ecouter(): void {
    if (arreterBoussole) return;
    arreterBoussole = (ctx.boussole?.suivre ?? suivreBoussole)((c) => {
      const premier = capBoussole === null;
      capBoussole = lisserCap(capBoussole, c);
      if (premier) boussoleArrivee();
      orienter();
      capChange(capBoussole);
    }, (a) => { attitude = a; });
  }
  ecouter();
  return {
    suivre: () => suivre,
    capBoussole: () => capBoussole,
    camera: suivreCamera,
    position(p: PtBrut): void {
      // Le sens de la marche, a defaut de boussole : d'un point au suivant, quand le pas est assez long.
      if (!pointDeCap) pointDeCap = p;
      const c = capDuDeplacement(pointDeCap, p);
      if (c !== null) { capMarche = c; pointDeCap = p; }
      suivreCamera(p);
      orienter();
    },
    reprendre(p: PtBrut | null): void {
      suivre = true;
      // Safari ne donne la boussole qu'apres un geste : ce bouton en est un.
      void (ctx.boussole?.autoriser ?? autoriserBoussole)().then((ok) => { if (ok) ecouter(); });
      if (p) { cadre = camera.cadrer(p, cap()); capApplique = cap(); }
    },
    lacher(): boolean { const avant = suivre; suivre = false; return avant; },
    azimut(): Pick<PrisePhoto, 'azimutDeg' | 'sourceAzimut'> {
      if (capBoussole !== null) return { azimutDeg: Math.round(capBoussole) % 360, sourceAzimut: 'boussole' };
      if (capMarche !== null) return { azimutDeg: Math.round(capMarche) % 360, sourceAzimut: 'deplacement' };
      return { azimutDeg: null, sourceAzimut: null };
    },
    attitude(): Pick<PrisePhoto, 'inclinaisonDeg' | 'roulisDeg'> {
      return { inclinaisonDeg: attitude?.inclinaisonDeg ?? null, roulisDeg: attitude?.roulisDeg ?? null };
    },
    arreter(): void { arreterBoussole?.(); arreterBoussole = null; },
  };
}

/**
 * La facade devant vous (§6.1) : parmi les batiments charges autour de la position, celle dont vous
 * voyez le cote exterieur, et que la boussole designe. Le sens de la marche ne dit pas ou pointe le
 * telephone : sans boussole, c'est la plus proche. Surlignee dans la Vue 3D, nommee dans la barre
 * (`changement`, appele seulement quand le texte change).
 */
export function facadeReconnue(objets: () => readonly ObjetPlan[], position: () => PtBrut | null, capBoussole: () => number | null, changement: () => void) {
  let devant: FacadeDevant | null = null;
  /** Le cap de la derniere recherche : la boussole tremble, on ne cherche pas a chaque lecture. */
  let capReconnu: number | null = null;
  const texte = (v: FacadeDevant | null) => (v ? texteFacadeDevant(v) : null);
  function reconnaitre(): void {
    const cap = capBoussole(), p = position();
    capReconnu = cap;
    const v = p ? facadeDevantDans(objets(), p, cap) : null;
    const memeMur = (v?.cle ?? null) === (devant?.cle ?? null) && v?.facade.cote === devant?.facade.cote;
    const avant = texte(devant);
    devant = v;
    if (!memeMur) poserFacadeDevant(v ? v.facade : null);
    if (texte(v) !== avant) changement();
  }
  return {
    reconnaitre,
    courante: () => devant,
    texte: () => texte(devant),
    capChange(c: number): void {
      if (capReconnu !== null && Math.abs(ecartCap(capReconnu, c)) < PAS_RECONNAISSANCE_DEG) return;
      reconnaitre();
    },
    oublier(): void { devant = null; poserFacadeDevant(null); },
  };
}

/** La ligne d'etat entre deux lectures : ce qui est charge, et la precision du GPS. */
export function resume(objets: readonly ObjetPlan[], precision: number | null): string {
  const batis = objets.filter((o) => estOuvrage(o, BATIMENT)).length;
  return batis + ' bâtiment' + (batis > 1 ? 's' : '') + ' chargé' + (batis > 1 ? 's' : '') + (precision !== null ? ' · GPS ± ' + Math.round(precision) + ' m' : '');
}

export const estBatiment = (o: ObjetPlan | undefined): o is ObjetPlan => !!o && estOuvrage(o, BATIMENT) && aDesSommets(o);

/** Au-dela, un batiment ne peut ni etre devant vous, ni cacher un mur qui l'est : il n'est pas lu. */
const RAYON_RECONNAISSANCE_M = DISTANCE_DEVANT_MAX_M + 30;

/**
 * La facade devant `pos`, parmi les batiments du plan proches de lui (§6.1). `seulement` : parmi les
 * facades de ce batiment-la (la photo d'un cas), les autres ne comptant que pour cacher la vue.
 */
export function facadeDevantDans(objets: readonly ObjetPlan[], pos: PtBrut, cap: number | null, seulement?: string): FacadeDevant | null {
  const r = RAYON_RECONNAISSANCE_M;
  // Par l'emprise, pas par les sommets : un long batiment passe pres de vous sans qu'un angle y soit.
  const proches = objets.filter((o): o is ObjetPlan & { pts: PtBrut[] } => estBatiment(o) && aDesSommets(o))
    .map((o) => ({ o, emprise: obstacle(o.pts) }))
    .filter(({ emprise: e }) => e.x1 > pos.x - r && e.x0 < pos.x + r && e.y1 > pos.y - r && e.y0 < pos.y + r);
  const batiments = proches.filter(({ o }) => seulement === undefined || o.key === seulement).map(({ o }) => ({ cle: o.key, facades: facadesDuContour(o.pts, elevationOf(o)) }));
  return facadeDevant(pos, cap, batiments, proches.map(({ emprise }) => emprise));
}

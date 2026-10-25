// Le controleur du mode audit (MD/spec-audit.md) : il branche la promenade sur le GPS (ou une adresse
// de depart), la Vue 3D et le doigt.
//
// - Depart : la parcelle sous le premier point precis, puis tout ce qui est a 70 m ; a chaque pas de
//   plus de 10 m, une nouvelle lecture autour de la position (app/audit/chargement.ts).
// - Vue 3D : votre position (three/positionGps3d.ts), une camera « drone » (app/audit/camera.ts)
//   dont le centre de rotation et de zoom est votre position. « Me suivre » recadre dans l'axe de
//   votre cap (la boussole, sinon le sens de la marche) et le suit ; tourner la vue au doigt le lache.
// - Doigt : un tapotement sur un batiment le marque en rouge (ou retire la marque) ; un appui long
//   ouvre sa fiche. Au depart d'une adresse, un tapotement au sol y deplace votre position.
// - Fin : la liste des cas, puis un seul fichier partage par le telephone.
//
// Rien n'est enregistre sur la plateforme : main.ts ne pose aucun depot de projets, et la lecture des
// toits en tache de fond n'est pas lancee (app/boot.ts). La promenade, elle, est gardee au fil de
// l'eau dans le telephone (io/brouillonAudit.ts) : a la reouverture, « Reprendre l'audit du … » ou
// « Le jeter » ; une fois le fichier partage, le brouillon s'efface si vous le confirmez.

import { suivrePositionGps, type PositionGps, type SansPosition } from '../../shell/geolocalisation.js';
import { partagerFichier } from '../../shell/partage.js';
import { dialogues, type DialogueChoix } from '../../shell/dialogues.js';
import { stockageNavigateur, type StockageBrouillon } from '../../io/brouillonAudit.js';
import { autoriserBoussole, suivreBoussole, lisserCap, ecartCap, type Attitude } from '../../shell/boussole.js';
import { geocoderBAN, geocoderInverseBAN } from '../../geo/apiIgn.js';
import { lireGrilleSous } from '../../geo/mnh.js';
import { centroid } from '../../geometry/basic.js';
import { obstacle } from '../../geometry/ligneDeVue.js';
import { facadesDuContour } from '../../facade/geometrie.js';
import { facadeDevant, texteFacadeDevant, DISTANCE_DEVANT_MAX_M, type FacadeDevant } from '../../facade/calage/priseDeVue.js';
import { elevationOf } from '../../engine/hauteurs.js';
import { aDesSommets } from '../../model/formes.js';
import { nomFichierPromenade, type PrisePhoto } from '../../model/audit.js';
import { APP_VERSION, BUILD_SHA } from '../../model/version.js';
import { vue3d, hotes3d } from '../../three/etat3d.js';
import { poserPositionGps } from '../../three/positionGps3d.js';
import { poserFacadeDevant } from '../../three/facadeDevant3d.js';
import { objetSousLePointeur } from '../../three/scene.js';
import { COULEURS_DIAGNOSTIC } from '../diagnostic.js';
import { VERSION_LECTURE_TOITS } from '../toitsLidar.js';
import { EMPREINTE_REGLAGES_TOITS } from '../../regles/toits/reglages.js';
import { VERSION_LECTURE_MURS } from '../mursFond.js';
import { parcours } from '../parcours.js';
import { planDeDepart, chargerAutour, fautRecharger, type DependancesChargement } from './chargement.js';
import { creerPromenade, type Promenade } from './promenade.js';
import { creerReprise, type RepriseAudit } from './reprise.js';
import { cameraAudit, capDuDeplacement } from './camera.js';
import { entreesDe, sortiesDe, identiteDe } from './cas.js';
import { creerCouleursPhotos, type CouleursPhotos } from './couleurFacade.js';
import { limitesDesParcelles } from '../../render/couleurMurPhoto.js';
import type { DemandeAudit } from './demande.js';
import type { ProjecteurLocal } from '../../geo/projection.js';
import type { EtatApp } from '../../core/state.js';
import type { ObjetBrut, ObjetPlan, PtBrut } from '../../model/types.js';

/** Au-dela de cette precision annoncee, le GPS ne designe pas la parcelle sous les pieds : on attend. */
export const PRECISION_DEPART_MAX_M = 30;
/** Le cap suivi ne fait tourner la vue que s'il a change d'au moins cela : la boussole tremble. */
const PAS_ORIENTATION_DEG = 3;
/** Un appui plus long que cela ouvre la fiche du batiment. */
const APPUI_LONG_MS = 600;
/** Un doigt qui bouge de plus que cela glisse : ce n'est plus un tapotement. */
const GLISSER_PX = 8;
/** La facade devant vous ne se recherche que si la boussole a tourne d'au moins cela : elle tremble. */
const PAS_RECONNAISSANCE_DEG = 2;

export interface ContexteAudit {
  etat: EtatApp;
  /** Remplace les objets du plan (atelier.restoreState). */
  remplacerObjets: (objets: ObjetBrut[]) => void;
  /** Rebatit la Vue 3D (nouveaux batiments) ; repeint un objet (une marque). */
  reconstruire3d: () => void;
  repeindre3d: (cles: string[]) => void;
  ouvrir3d: () => void;
  notifier: () => void;
  signaler: (message: string) => void;
  suivre?: typeof suivrePositionGps;
  geocoder?: typeof geocoderBAN;
  chargement?: DependancesChargement;
  lireGrille?: typeof lireGrilleSous;
  adresse?: typeof geocoderInverseBAN;
  partager?: typeof partagerFichier;
  boussole?: { suivre: typeof suivreBoussole; autoriser: typeof autoriserBoussole };
  /** Ou se range le brouillon de la promenade ; par defaut IndexedDB, `null` pour ne rien garder. */
  stockageBrouillon?: StockageBrouillon | null;
  /** Le delai entre un changement et son ecriture dans le brouillon. */
  delaiBrouillonMs?: number;
  /** Une question a deux issues (Z8) ; par defaut shell/dialogues.ts. */
  questionner?: (d: DialogueChoix) => void;
}

export interface ControleurAudit {
  promenade: Promenade;
  /** La couleur de la facade lue sur les photos des cas (MD/spec-audit.md §6.2). */
  couleurs: CouleursPhotos;
  /** La couleur d'affichage d'un batiment marque (rouge), pour la Vue 3D. */
  couleur: (o: ObjetPlan) => string | null;
  /** « Me suivre » : recadre dans l'axe du cap, et le suit. */
  reprendreSuivi: () => void;
  /** Le doigt tourne la vue : le cap n'est plus suivi (le centre reste votre position). */
  lacherSuivi: () => void;
  /** Ou vous etes et vers ou pointe le telephone, pour la photo d'un cas. */
  prisePhoto: () => PrisePhoto | null;
  /** La facade devant laquelle vous etes (MD/spec-audit.md §6.1), surlignee dans la Vue 3D ; null sinon. */
  facadeDevant: () => FacadeDevant | null;
  ouvrirListe: () => void;
  partager: () => Promise<void>;
  /** Une position, dans le repere du plan (le GPS, ou le doigt au depart d'une adresse). */
  nouvellePosition: (p: PtBrut, precisionM: number | null) => void;
  /** Un tapotement ou un appui long sur l'ecran, en coordonnees normalisees -1..1. */
  tapoter: (ndc: { x: number; y: number }) => void;
  appuiLong: (ndc: { x: number; y: number }) => void;
  /** Une Vue 3D vient d'etre batie : la camera reprend le suivi sur elle. */
  sceneBatie: () => void;
  /** Ecrit le brouillon tout de suite : l'ecran se verrouille, l'onglet passe en arriere-plan. */
  ecrireBrouillon: () => Promise<boolean>;
  arreter: () => void;
}

const MESSAGES_GPS: Record<SansPosition['raison'], string> = {
  refusee: 'Position refusée : autorisez la localisation pour ce site dans les réglages du navigateur.',
  indisponible: 'Position momentanément indisponible.',
  delai: 'La position tarde à venir.',
};

export function creerControleurAudit(ctx: ContexteAudit, demande: DemandeAudit): ControleurAudit {
  const { etat } = ctx;
  let proj: ProjecteurLocal | null = null;
  let position: PtBrut | null = null;
  let precision: number | null = null;
  let derniereLecture: PtBrut | null = null;
  let lecture = false;
  let enAttente: PtBrut | null = null;
  let arreterGps: (() => void) | null = null;
  let depart = false;

  const objet = (cle: string) => etat.objects.find((o) => o.key === cle);
  const promenade = promenadeDuPlan(ctx, () => proj);
  // Le brouillon local : tant que la question de la reprise attend sa reponse, le depart attend aussi.
  const reprise = repriseDuControleur(ctx, promenade, (s) => dire(s), (lon, lat) => partir(lon, lat, null));
  let gpsEnAttente: PositionGps | null = null;

  let statut = demande.depart ? 'Recherche de l’adresse de départ…' : 'En attente d’un GPS précis…';
  const publier = () => {
    etat.audit = { statut, cas: promenade.liste().length, suivre: suivi.suivre(), facade: reconnue.texte() };
    ctx.notifier();
  };
  const resumer = () => resume(etat.objects, precision) + (suivi.capBoussole() !== null ? ' · boussole' : '');
  const dire = (s: string) => { statut = s; publier(); };
  promenade.abonner(publier);

  const reconnue = facadeReconnue(() => etat.objects, () => position, () => suivi.capBoussole(), () => publier());
  const suivi = suiviDuCap(ctx, () => dire(resumer()), reconnue.capChange);

  function recharger(p: PtBrut): void {
    if (!proj) return;
    if (lecture) { enAttente = p; return; }
    lecture = true;
    derniereLecture = p;
    dire('Lecture autour de vous…');
    void chargerAutour(etat.objects, p, proj, ctx.chargement).then((ajouts) => {
      if (!ajouts.length) return;
      ctx.remplacerObjets([...(etat.objects as ObjetBrut[]), ...ajouts]);
      ctx.reconstruire3d();
      promenade.relireManquants((cle) => estBatiment(objet(cle)));
      reconnue.reconnaitre();
    }).finally(() => {
      lecture = false;
      dire(resumer());
      const q = enAttente;
      enAttente = null;
      if (q && fautRecharger(derniereLecture, q)) recharger(q);
    });
  }

  function nouvellePosition(p: PtBrut, precisionM: number | null): void {
    position = p;
    precision = precisionM;
    poserPositionGps(p, precisionM ?? 3);
    suivi.position(p);
    reconnue.reconnaitre();
    if (fautRecharger(derniereLecture, p)) recharger(p);
    else if (!lecture) dire(resumer());
  }

  async function partir(lon: number, lat: number, precisionM: number | null): Promise<void> {
    if (proj || depart) return;
    depart = true;
    dire('Parcelle de départ…');
    const d = await planDeDepart(lon, lat, ctx.chargement).catch(() => null);
    if (!d) { depart = false; dire('Aucune parcelle trouvée ici.'); return; }
    proj = d.proj;
    reprise.poserDepart(lon, lat);
    ctx.remplacerObjets(d.objets as ObjetBrut[]);
    ctx.ouvrir3d();
    const p = proj.versMetres(lon, lat);
    nouvellePosition(p, precisionM);
  }

  function surGps(g: PositionGps): void {
    if (!reprise.repondu()) { gpsEnAttente = g; return; }
    if (proj) { nouvellePosition(proj.versMetres(g.lon, g.lat), g.precisionM); return; }
    if (depart) return;
    if (g.precisionM > PRECISION_DEPART_MAX_M) { dire('En attente d’un GPS précis (± ' + Math.round(g.precisionM) + ' m)…'); return; }
    void partir(g.lon, g.lat, g.precisionM);
  }

  if (demande.depart) {
    const adresse = demande.depart;
    // Un audit repris est reparti de sa propre parcelle : l'adresse ne sert plus.
    reprise.apresReponse(() => { if (!proj && !depart) partirDeLAdresse(ctx, adresse, dire, (lon, lat) => partir(lon, lat, null)); });
  } else {
    reprise.apresReponse(() => { const g = gpsEnAttente; gpsEnAttente = null; if (g) surGps(g); });
    arreterGps = (ctx.suivre ?? suivrePositionGps)(surGps, (e) => {
      ctx.signaler(MESSAGES_GPS[e.raison]);
      if (e.raison === 'refusee') dire('Position refusée.');
    });
  }
  void reprise.proposer();
  publier();
  // La Vue 3D s'ouvre d'emblee : la bibliotheque se charge pendant qu'on cherche le depart.
  ctx.ouvrir3d();

  const prisePhoto = (): PrisePhoto | null => prisePhotoDe(position, precision, proj, suivi);

  const couleurs = couleursDuPlan(etat, promenade);
  const retirer = (cle: string) => { promenade.retirer(cle); ctx.repeindre3d([cle]); };
  /** La fiche d'un batiment ; ouverte depuis la liste de fin, elle y ramene. */
  function ouvrirFiche(cle: string, retour?: () => void): void {
    parcours.ouvrir({ type: 'auditCas', promenade, cle, retirer: () => retirer(cle), prise: prisePhoto, couleurs, ...(retour ? { retour } : {}) });
  }
  function ouvrirListe(): void {
    parcours.ouvrir({ type: 'auditFin', promenade, modifier: (cle) => ouvrirFiche(cle, ouvrirListe), retirer, partager });
  }

  const partager = () => partagerPromenade(ctx, promenade, reprise.apresPartage);

  return {
    promenade,
    couleurs,
    couleur: (o) => (promenade.estMarque(o.key) ? COULEURS_DIAGNOSTIC.rouge : null),
    reprendreSuivi() { suivi.reprendre(position); publier(); },
    lacherSuivi() { if (suivi.lacher()) publier(); },
    prisePhoto,
    facadeDevant: reconnue.courante,
    ouvrirListe,
    partager,
    nouvellePosition,
    tapoter(ndc) {
      const { cle, point } = objetSousLePointeur(ndc);
      const o = cle ? objet(cle) : undefined;
      if (cle && estBatiment(o)) {
        if (promenade.estMarque(cle)) promenade.retirer(cle);
        else promenade.marquer(cle, position ?? point ?? { x: 0, y: 0 }, precision);
        ctx.repeindre3d([cle]);
        return;
      }
      // Au depart d'une adresse, le doigt deplace la position : c'est la promenade sans sortir.
      if (demande.depart && point && proj) nouvellePosition(point, null);
    },
    appuiLong(ndc) {
      const { cle, point } = objetSousLePointeur(ndc);
      const o = cle ? objet(cle) : undefined;
      if (!cle || !estBatiment(o)) return;
      if (!promenade.estMarque(cle)) { promenade.marquer(cle, position ?? point ?? { x: 0, y: 0 }, precision); ctx.repeindre3d([cle]); }
      ouvrirFiche(cle);
    },
    sceneBatie() { if (position) suivi.camera(position); },
    ecrireBrouillon: () => reprise.ecrire(),
    arreter() { arreterGps?.(); arreterGps = null; suivi.arreter(); reconnue.oublier(); void reprise.ecrire(); },
  };
}

/** La prise de vue d'une photo : la position (repere du plan et degres), sa precision, le cap et l'attitude. */
function prisePhotoDe(position: PtBrut | null, precision: number | null, proj: ProjecteurLocal | null,
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
function suiviDuCap(ctx: ContexteAudit, boussoleArrivee: () => void, capChange: (cap: number) => void) {
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
function facadeReconnue(objets: () => readonly ObjetPlan[], position: () => PtBrut | null, capBoussole: () => number | null, changement: () => void) {
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
function resume(objets: readonly ObjetPlan[], precision: number | null): string {
  const batis = objets.filter((o) => o.fonction === 'batiment').length;
  return batis + ' bâtiment' + (batis > 1 ? 's' : '') + ' chargé' + (batis > 1 ? 's' : '') + (precision !== null ? ' · GPS ± ' + Math.round(precision) + ' m' : '');
}

const estBatiment = (o: ObjetPlan | undefined): o is ObjetPlan => !!o && o.fonction === 'batiment' && aDesSommets(o);

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

/** La couleur des facades sur les photos des cas, branchee sur le plan : murs, facade devant la prise, clotures. */
function couleursDuPlan(etat: EtatApp, promenade: Promenade): CouleursPhotos {
  const objet = (cle: string) => etat.objects.find((o) => o.key === cle);
  return creerCouleursPhotos({
    promenade,
    facades: (cle) => { const o = objet(cle); return estBatiment(o) && aDesSommets(o) ? facadesDuContour(o.pts, elevationOf(o)) : []; },
    devant: (cle, p, cap) => facadeDevantDans(etat.objects, p, cap, cle)?.facade ?? null,
    limites: () => limitesDesParcelles(etat.objects),
  });
}

/** La promenade, branchee sur le plan : ce qu'elle fige d'un batiment, sa grille LiDAR, son adresse. */
function promenadeDuPlan(ctx: ContexteAudit, projecteur: () => ProjecteurLocal | null): Promenade {
  const { etat } = ctx;
  const objet = (cle: string) => etat.objects.find((o) => o.key === cle);
  return creerPromenade({
    figer: (cle) => {
      const o = objet(cle);
      if (!estBatiment(o)) return null;
      return { identite: { ...identiteDe(o, etat.objects), adresse: null }, entrees: entreesDe(o, etat.objects, null), sorties: sortiesDe(o) };
    },
    lireGrille: async (cle) => {
      const o = objet(cle), proj = projecteur();
      return proj && estBatiment(o) && aDesSommets(o) ? (ctx.lireGrille ?? lireGrilleSous)(o.pts, proj) : null;
    },
    adresse: async (cle) => {
      const o = objet(cle), proj = projecteur();
      if (!proj || !estBatiment(o) || !aDesSommets(o)) return null;
      const c = centroid(o.pts), d = proj.versDegres(c.x, c.y);
      return (await (ctx.adresse ?? geocoderInverseBAN)(d.lon, d.lat))?.label ?? null;
    },
  });
}

/** Le brouillon local de la promenade (app/audit/reprise.ts), branche sur le plan et les dialogues. */
function repriseDuControleur(ctx: ContexteAudit, promenade: Promenade, dire: (s: string) => void, partir: (lon: number, lat: number) => Promise<void>): RepriseAudit {
  const present = (cle: string) => estBatiment(ctx.etat.objects.find((o) => o.key === cle));
  return creerReprise({
    promenade, stockage: ctx.stockageBrouillon === undefined ? stockageNavigateur() : ctx.stockageBrouillon, delaiMs: ctx.delaiBrouillonMs,
    questionner: ctx.questionner ?? ((d) => dialogues.ouvrir(d)), signaler: ctx.signaler, dire,
    commune: () => communeDu(ctx.etat.objects), present, repeindre: ctx.repeindre3d, partir,
  });
}

/** Le depart d'une adresse (`?depart=`) : geocodee, puis la parcelle sous elle. */
function partirDeLAdresse(ctx: ContexteAudit, adresse: string, dire: (s: string) => void, partir: (lon: number, lat: number) => Promise<void>): void {
  void (ctx.geocoder ?? geocoderBAN)(adresse, false).then((r) => {
    const a = r[0];
    if (!a) { dire('Adresse de départ introuvable.'); return; }
    void partir(a.lon, a.lat);
  }).catch(() => dire('Adresse de départ introuvable.'));
}

/** La commune de la parcelle de depart, quand elle est connue. */
function communeDu(objets: readonly ObjetPlan[]): string | null {
  const cad = objets.find((o) => o.key === 'parcelle')?.cadastre as { commune?: string } | undefined;
  return cad?.commune ?? null;
}

/**
 * Le fichier de la promenade, partage par le telephone (ou telecharge), une fois les lectures finies.
 * `parti` est appele quand le fichier est parti, pas quand la personne a ferme la feuille de partage.
 */
async function partagerPromenade(ctx: ContexteAudit, promenade: Promenade, parti: (nom: string) => void): Promise<void> {
  await promenade.enCours();
  const { etat } = ctx;
  const parcelle = etat.objects.find((o) => o.key === 'parcelle');
  const cad = parcelle?.cadastre as { origineLat?: number; origineLon?: number; commune?: string } | undefined;
  const fichier = promenade.fichier({
    commune: cad?.commune ?? null,
    origine: { lat: cad?.origineLat ?? 0, lon: cad?.origineLon ?? 0 },
    emprise: empriseDesObjets(etat.objects),
    code: { version: APP_VERSION, commit: BUILD_SHA },
    regles: { lectureToits: VERSION_LECTURE_TOITS, lectureMurs: VERSION_LECTURE_MURS, reglagesToits: EMPREINTE_REGLAGES_TOITS },
  });
  const nom = nomFichierPromenade(promenade.debut, cad?.commune ?? null);
  const issue = await (ctx.partager ?? partagerFichier)(nom, JSON.stringify(fichier), 'Audit des toits — ' + (cad?.commune ?? 'promenade'));
  if (issue === 'partage') ctx.signaler('Fichier de la promenade partagé : ' + nom + '.');
  else if (issue === 'telecharge') ctx.signaler('Fichier de la promenade téléchargé : ' + nom + '.');
  if (issue !== 'annule') parti(nom);
}

/** L'emprise des objets charges : ce que la promenade a couvert. */
function empriseDesObjets(objets: readonly ObjetPlan[]): { xMin: number; xMax: number; yMin: number; yMax: number } | null {
  let xMin = Infinity, xMax = -Infinity, yMin = Infinity, yMax = -Infinity;
  for (const o of objets) if (aDesSommets(o)) for (const p of o.pts) { xMin = Math.min(xMin, p.x); xMax = Math.max(xMax, p.x); yMin = Math.min(yMin, p.y); yMax = Math.max(yMax, p.y); }
  return Number.isFinite(xMin) ? { xMin: Math.round(xMin), xMax: Math.round(xMax), yMin: Math.round(yMin), yMax: Math.round(yMax) } : null;
}

/**
 * Le doigt sur la Vue 3D : un tapotement (bref, sans glisser) ou un appui long. Un glisser passe la
 * camera en navigation libre. Pose une fois sur l'hote de la scene, qui survit aux reconstructions.
 */
export function brancherDoigtAudit(c: Pick<ControleurAudit, 'tapoter' | 'appuiLong' | 'lacherSuivi'>, hote: HTMLElement, horloge: Pick<Window, 'setTimeout' | 'clearTimeout'> = window): () => void {
  let debut: { x: number; y: number; t: number } | null = null;
  let glisse = false, long = false;
  let minuteur: number | null = null;
  /** Les doigts poses : a deux, c'est un pincement (zoom), ni tapotement ni rotation. */
  const doigts = new Set<number>();
  const ndc = (x: number, y: number) => {
    const toile = vue3d.scene?.renderer.domElement ?? hote;
    const r = toile.getBoundingClientRect();
    return { x: ((x - r.left) / r.width) * 2 - 1, y: -((y - r.top) / r.height) * 2 + 1 };
  };
  const annuler = () => { if (minuteur !== null) horloge.clearTimeout(minuteur); minuteur = null; };
  const surCanevas = (e: Event) => (e.target as HTMLElement | null)?.tagName === 'CANVAS';
  const bas = (e: PointerEvent) => {
    if (!surCanevas(e)) return;
    doigts.add(e.pointerId);
    annuler();
    if (doigts.size > 1) { debut = null; return; }
    debut = { x: e.clientX, y: e.clientY, t: Date.now() };
    glisse = false; long = false;
    const x = e.clientX, y = e.clientY;
    minuteur = horloge.setTimeout(() => { minuteur = null; if (!glisse) { long = true; c.appuiLong(ndc(x, y)); } }, APPUI_LONG_MS) as unknown as number;
  };
  const bouge = (e: PointerEvent) => {
    if (!debut || glisse || doigts.size > 1) return;
    if (Math.hypot(e.clientX - debut.x, e.clientY - debut.y) > GLISSER_PX) {
      glisse = true;
      annuler();
      // Un doigt qui glisse tourne la vue : le cap n'est plus suivi, « Me suivre » le reprend.
      c.lacherSuivi();
    }
  };
  const haut = (e: PointerEvent) => {
    doigts.delete(e.pointerId);
    annuler();
    // Le minuteur peut arriver en retard sur un fil occupe (une scene lourde a dessiner) : la duree
    // de l'appui decide aussi.
    if (debut && !glisse && !long) {
      if (Date.now() - debut.t >= APPUI_LONG_MS) c.appuiLong(ndc(debut.x, debut.y));
      else c.tapoter(ndc(e.clientX, e.clientY));
    }
    debut = null;
  };
  const perdu = (e: PointerEvent) => { doigts.delete(e.pointerId); annuler(); debut = null; };
  hote.addEventListener('pointerdown', bas);
  hote.addEventListener('pointermove', bouge);
  hote.addEventListener('pointerup', haut);
  hote.addEventListener('pointercancel', perdu);
  return () => {
    hote.removeEventListener('pointerdown', bas); hote.removeEventListener('pointermove', bouge);
    hote.removeEventListener('pointerup', haut); hote.removeEventListener('pointercancel', perdu);
  };
}

/** L'hote de la Vue 3D, ou null s'il n'est pas encore monte. */
export const hoteVue3d = (): HTMLElement | null => hotes3d.vue3d;

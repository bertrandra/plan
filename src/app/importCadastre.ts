// L'import cadastral depuis une adresse, en trois etapes (spec §6.4, app/).
//
// Etape 1 : une adresse, geocodee par la BAN. Etape 2 : la parcelle, choisie parmi les candidates
// classees par distance. Etape 3 : les voisines a importer, ce qu'on prend de la BD TOPO, et la
// creation du projet.
//
// Ce module tient l'etat du parcours et ses gestes ; zones/parcours/ImportCadastre.tsx le dessine et
// s'abonne a ses changements. Il ne parle pas au reseau lui-meme (geo/apiIgn.ts) et ne connait pas
// l'etat de l'application : ce dont il a besoin lui arrive par `ctx`.
//
// L'etat s'appelle `etatImport` et surtout PAS `etat`, le nom de l'etat de l'application : la
// confusion entre les deux est exactement le genre de bug qu'aucun test ne rattrape.

import { showToast } from '../shell/dialogs.js';
import { lirePositionGps, geolocalisationDisponible, SansPosition, type PositionGps } from '../shell/geolocalisation.js';
import { centroid, shoelace, pointInPolygon } from '../geometry/basic.js';
import { fusionnerAnneaux, chainerSegments } from '../geometry/rings.js';
import { distancePointContour } from '../geometry/proximite.js';
import { projecteurLocal } from '../geo/projection.js';
import { hauteurBatiment, arbresEstimes, libelleParcelle, ESPACEMENT_ARBRES_M, MAX_ARBRES_ESTIMES } from '../geo/bdtopo.js';
import { objetsDepuisCadastre } from '../geo/cadastreObjets.js';
import { serializeObjects } from '../io/serialisation.js';
import { couleursToitsDepuisOrtho } from '../render/couleurToitOrtho.js';
import { toitsDepuisLidar } from './toitsLidar.js';
import { FUSION_TOL_M } from '../geo/constantesCadastre.js';
import { lireRelief, demandeReliefDuPlan } from '../geo/relief.js';
import { parcelleDuProjet } from '../model/fonctions.js';
import { CAPACITES } from '../plateforme/capacites.js';
import { droitsCourants } from './acces.js';
import {
  geocoderBAN, geocoderInverseBAN, interrogerCadastre, construireCandidats, classerCandidats, trierVoisines,
  anneauVersPts, empriseGeoJSON, empriseAutourAnneau, bboxDegDesAnneaux,
  interrogerWfs, construireElementsIgn, rattacherElementsAuxParcelles, interrogerPlu, lireVoisinageRayon, filtrerVoisinageRayon, rayonEtenduValide,
  rayonDeLecture, RAYON_ETENDU_DEFAUT_M,
  RAYONS_RECHERCHE_M, COUCHE_BATIMENT, COUCHE_VEGETATION, COUCHE_HAIE
} from '../geo/apiIgn.js';
import type { Candidate, ElementIgn, FeatureGeoJSON, VoisinageRayon } from '../geo/apiIgn.js';
import type { ProjecteurLocal } from '../geo/projection.js';
import type { AdresseRecherchee, ImportCadastral } from '../geo/cadastreObjets.js';
import type { ObjetPlan, PtBrut, ZonagePlu } from '../model/types.js';
import type { ProjetValide } from '../io/validation.js';

/** Ce que l'import demande au reste du programme : enregistrer, ou charger le plan en local. */
export interface ContexteImportCadastre {
  apiSave: (payload: unknown) => Promise<{ id: string }>;
  appliquerProjetImporte: (valide: ProjetValide, remplacer: boolean) => void;
  withProjectParam: (id: string) => string;
  apiDisponible: boolean;
  cleDernierProjet: string;
  /**
   * Le projet a remplir, quand il y en a un : un projet neuf de la plateforme, ouvert avec un
   * document vide (`{}`). L'import y ecrit au lieu d'en creer un second. Absent : un projet est cree.
   */
  projetCible?: () => { id: string; name: string } | null;
  /** La lecture du relief a l'IGN ; remplacable dans les tests, qui ne touchent pas le reseau. */
  lireRelief?: typeof lireRelief;
  /** Les toits ajustes sur le LiDAR HD (app/toitsLidar.ts) ; remplacable de meme. */
  toitsLidar?: typeof toitsDepuisLidar;
  /** La position de l'appareil (shell/geolocalisation.ts) ; remplacable de meme. */
  lirePosition?: () => Promise<PositionGps>;
  /** L'adresse la plus proche d'un point (BAN) ; remplacable de meme. */
  geocoderInverse?: typeof geocoderInverseBAN;
}

export type CaseIgn = 'importerBatiments' | 'importerHaies' | 'importerVegetation' | 'importerArbres' | 'importerRelief' | 'reliefToutesParcelles';

/** L'etat du parcours. `principale` et `proj` restent nuls tant que l'etape 1 n'a pas abouti. */
export interface EtatImportCadastre {
  etape: 1 | 2 | 3;
  suggestions: AdresseRecherchee[];
  geo: AdresseRecherchee | null;
  occupe: boolean;
  message: string;
  erreur: string;
  candidats: Candidate[];
  principale: Candidate | null;
  adjacentes: Candidate[];
  autres: Candidate[];
  selection: Set<string>;
  simplifier: boolean;
  rayon: number | null;
  proj: ProjecteurLocal | null;
  tropDense: boolean;
  survol: string | null;
  voisinageCharge: Set<string>;
  batiments: ElementIgn[];
  haies: ElementIgn[];
  vegetation: ElementIgn[];
  plu: ZonagePlu | null;
  ignCharge: Set<string>;
  ignErreur: string;
  importerBatiments: boolean;
  importerHaies: boolean;
  importerVegetation: boolean;
  importerArbres: boolean;
  /** Le relief du terrain (MD/spec-relief.md), lu a l'IGN a la creation du plan. */
  importerRelief: boolean;
  /** La grille du relief couvre toutes les parcelles importees, pas seulement celle du projet. */
  reliefToutesParcelles: boolean;
  /** Parcelles cochees « propriete » : elles seront FUSIONNEES avec la principale en un seul terrain. */
  propriete: Set<string>;
  /** Le voisinage etendu demande : tout ce qui est dans `rayonEtendu` autour de la parcelle principale. */
  voisinageEtendu: boolean;
  /** Le rayon du curseur, de 10 a 1 000 m. */
  rayonEtendu: number;
  /**
   * Ce que l'IGN a rendu pour le palier de lecture qui couvre le curseur (200, 500 ou 1 000 m),
   * autour de la parcelle principale ; le rayon du curseur le filtre localement. `null` tant que
   * rien n'est lu ; relu au palier superieur si le curseur le depasse.
   */
  etenduMax: VoisinageRayon | null;
  /** L'option d'affichage : le voisinage etendu montre dans l'apercu et visible a l'ouverture du plan. */
  afficherEtendu: boolean;
  /**
   * L'import direct : sans les etapes 2 et 3. Une fois la parcelle trouvee, l'etape 1 montre un
   * resume (parcelle, comptes du voisinage) et cree le plan d'un clic, avec les reglages par defaut.
   */
  importDirect: boolean;
  /** Import direct : la parcelle est trouvee, le resume est pret. */
  resumePret: boolean;
  /** Une frappe a eu lieu dans le champ d'adresse : la position lue a l'ouverture ne l'ecrase plus. */
  saisie: boolean;
  /** Ou en est la lecture de la position de l'appareil (« Utiliser ma position »). */
  position: EtatPosition;
}

/**
 * La position de l'appareil a l'etape 1. `trouvee` : la parcelle sous elle est cherchee ;
 * `approximative` : trop imprecise pour choisir une parcelle a coup sur, l'adresse la plus proche
 * est proposee dans le champ, a verifier ; `refusee`, `indisponible` : on le dit, seulement si
 * on l'a demandee d'un geste (a l'ouverture, un refus reste silencieux).
 */
export interface EtatPosition {
  etat: 'aucune' | 'demande' | 'trouvee' | 'approximative' | 'refusee' | 'indisponible';
  /** L'adresse la plus proche, a mettre dans le champ ; vide sans geocodage inverse. */
  adresse: string;
  precisionM: number | null;
}

/** Un lot de l'apercu : une parcelle (ou la propriete fusionnee) et son role. */
export interface LotApercu {
  idu: string;
  pts: PtBrut[];
  role: 'principale' | 'retenue' | 'libre';
  libelle: string;
  /** Faux pour la propriete fusionnee : elle n'est pas une parcelle, rien a y selectionner. */
  cliquable: boolean;
  candidate?: Candidate;
}

/** Ce que l'apercu dessine, en metres autour du point d'adresse (l'origine). */
export interface Apercu {
  lots: LotApercu[];
  limitesInternes: PtBrut[][];
  couches: { elements: ElementIgn[]; actif: boolean; remplissage: string; contour: string; opacite: number }[];
  /** Le voisinage etendu, quand il est lu et que l'option d'affichage est cochee : le disque, ses parcelles et son bati. */
  etendu: { centre: PtBrut; rayonM: number; parcelles: PtBrut[][]; batiments: PtBrut[][] } | null;
}

export interface ImportCadastre {
  etat(): Readonly<EtatImportCadastre>;
  abonner(f: () => void): () => void;
  version(): number;
  fermer(): void;

  // Etape 1
  saisirAdresse(texte: string): void;
  /**
   * La parcelle sous la position de l'appareil. `auto` : a l'ouverture du dialogue — sans effet si
   * l'on a deja tape ou choisi une adresse, et silencieux sur un refus.
   */
  utiliserMaPosition(auto?: boolean): Promise<void>;
  /** Le navigateur sait-il donner une position ? Le bouton ne s'affiche que s'il le sait. */
  positionDisponible(): boolean;
  rechercher(texte: string): Promise<void>;
  choisirAdresse(sug: AdresseRecherchee): Promise<void>;
  // Etapes 2 et 3
  choisirPrincipale(c: Candidate): Promise<void>;
  basculerVoisine(c: Candidate): void;
  basculerPropriete(c: Candidate): void;
  cocherMitoyennes(): void;
  toutDecocher(): void;
  survoler(idu: string | null): void;
  basculerSimplifier(actif: boolean): void;
  basculerCaseIgn(cle: CaseIgn, actif: boolean): void;
  /** Le voisinage etendu : le demander lit le disque au palier du curseur, en plusieurs requetes. */
  basculerVoisinageEtendu(actif: boolean): Promise<void>;
  /** Le rayon du curseur : le compte se filtre localement ; passer un palier relit le disque, plus grand. */
  reglerRayonEtendu(rayonM: number): void;
  basculerAfficherEtendu(actif: boolean): void;
  /** L'import direct, sans les etapes 2 et 3 : un choix memorise par le navigateur. */
  basculerImportDirect(actif: boolean): void;
  allerA(etape: 1 | 2 | 3): void;
  creerProjet(nom: string): Promise<void>;

  // Lectures pour l'ecran
  /** Le voisinage etendu au rayon du curseur, ou `null` s'il n'est pas demande ou pas encore lu. */
  voisinageEtenduRetenu(): VoisinageRayon | null;
  estPropriete(idu: string): boolean;
  parcellesPropriete(): Candidate[];
  voisinesRetenues(): Candidate[];
  elementsRetenus(liste: ElementIgn[]): ElementIgn[];
  apercu(): Apercu;
  ligneSurface(c: Candidate): string;
  /** Le resume de la propriete, et s'il annonce un echec de fusion. */
  resumePropriete(): { texte: string; alerte: boolean };
  /** Les hauteurs des batiments de la propriete, du plus haut au plus bas. */
  hauteursPropriete(): number[];
  nombreArbresEstimes(): number;
  nomParDefaut(): string;
  /** La capacite `plan.relief` : sans elle, les cases du relief disparaissent et rien n'est lu. */
  reliefPermis(): boolean;
  /** Le projet que l'import remplit, ou `null` s'il en cree un. */
  projetCible(): { id: string; name: string } | null;
}

/** La cle du navigateur qui garde le choix de l'import direct : il suit l'utilisateur d'un import a l'autre. */
const CLE_IMPORT_DIRECT = 'plan.import.direct';
function importDirectMemorise(): boolean {
  try { return localStorage.getItem(CLE_IMPORT_DIRECT) === '1'; } catch { return false; }
}

const RE_COORDS = /^\s*(-?\d+[.,]\d+)\s*[,; ]\s*(-?\d+[.,]\d+)\s*$/;

/** Ce que les gestes partagent : l'etat, et de quoi en signaler les changements. */
interface Noyau {
  e: EtatImportCadastre;
  signaler: () => void;
  occuper: (actif: boolean, texte?: string) => void;
  /** Posees des que l'etape 1 a abouti. */
  principale: () => Candidate;
  proj: () => ProjecteurLocal;
}

type Lectures = Pick<ImportCadastre, 'voisinageEtenduRetenu' | 'estPropriete' | 'parcellesPropriete' | 'voisinesRetenues' | 'elementsRetenus' | 'apercu'
  | 'ligneSurface' | 'resumePropriete' | 'hauteursPropriete' | 'nombreArbresEstimes' | 'nomParDefaut'>;

interface Chargements {
  chargerVoisinage(c: Candidate): Promise<void>;
  appliquerPrincipale(c: Candidate): void;
  chargerIgnAvecMessage(c: Candidate): Promise<void>;
  /** Le disque autour de la principale, au palier du curseur, s'il est demande et pas encore lu a ce palier. */
  chargerEtendu(): Promise<void>;
}

/** Ce que l'ecran lit du parcours : la propriete, les voisines retenues, l'apercu, les compteurs. */
function lectures(n: Noyau): Lectures {
  const { e, principale } = n;
  // La principale en fait toujours partie, en premier : c'est elle qui porte l'adresse.
  function parcellesPropriete(): Candidate[] {
    const autres = e.adjacentes.concat(e.autres).filter(c => e.propriete.has(c.idu));
    return [principale()].concat(autres);
  }
  function estPropriete(idu: string): boolean { return !!e.principale && (idu === e.principale.idu || e.propriete.has(idu)); }
  function voisinesRetenues(): Candidate[] { return e.adjacentes.concat(e.autres).filter(c => e.selection.has(c.idu) || e.propriete.has(c.idu)); }
  // Le compte annonce ce qui sera AJOUTE : ni la propriete, ni les voisines cochees, ni le bati qui
  // arrive deja avec elles. C'est la meme exclusion que celle de la creation (geo/cadastreObjets.ts).
  function voisinageEtenduRetenu(): VoisinageRayon | null {
    if (!e.voisinageEtendu || !e.etenduMax || !e.principale) return null;
    const idus = new Set([e.principale.idu, ...voisinesRetenues().map(c => c.idu)]);
    const ids = new Set(e.importerBatiments ? elementsRetenus(e.batiments).flatMap(b => (b.id ? [b.id] : [])) : []);
    return filtrerVoisinageRayon(e.etenduMax, centroid(e.principale.pts), e.rayonEtendu, { idus, ids });
  }

  // Compte les elements BD TOPO qui tomberaient effectivement dans le plan : ceux qui recouvrent la
  // parcelle principale ou une voisine COCHEE. Les compteurs suivent donc la selection.
  function elementsRetenus(liste: ElementIgn[]): ElementIgn[] {
    const retenues = new Set([principale().idu].concat(voisinesRetenues().map(v => v.idu)));
    return liste.filter(el => [...el.parcelles].some(idu => retenues.has(idu)));
  }

  function apercu(): Apercu {
    // L'apercu montre la propriete telle qu'elle sera importee : fusionnee d'un seul tenant, avec ses
    // limites internes en pointille. Sinon on verrait des parcelles separees, et le resultat serait
    // une surprise apres coup.
    const parcellesProp = parcellesPropriete();
    const fusion = parcellesProp.length > 1 ? fusionnerAnneaux(parcellesProp.map(p => p.pts), FUSION_TOL_M) : null;
    const lots: LotApercu[] = [];
    if (fusion) lots.push({ idu: '__propriete__', pts: fusion.contour, role: 'principale', libelle: parcellesProp.map(libelleParcelle).join(' + '), cliquable: false });
    else parcellesProp.forEach(p => lots.push({ idu: p.idu, pts: p.pts, role: 'principale', libelle: libelleParcelle(p), cliquable: true, candidate: p }));
    e.adjacentes.concat(e.autres).forEach(c => {
      if (estPropriete(c.idu)) return;
      lots.push({ idu: c.idu, pts: c.pts, role: e.selection.has(c.idu) ? 'retenue' : 'libre', libelle: libelleParcelle(c), cliquable: true, candidate: c });
    });
    // Couches BD TOPO par-dessus le parcellaire : non cliquables (leur import se regle par les cases
    // de l'etape 3), mais sans elles l'apercu ne montrerait pas ce qui va arriver dans le plan.
    return {
      lots,
      limitesInternes: fusion ? chainerSegments(fusion.limites, FUSION_TOL_M) : [],
      couches: [
        { elements: e.vegetation, actif: e.importerVegetation, remplissage: '#A9BE8E', contour: '#4A6B32', opacite: 0.55 },
        { elements: e.haies, actif: e.importerHaies, remplissage: '#7FA86B', contour: '#3F5C33', opacite: 0.8 },
        { elements: e.batiments, actif: e.importerBatiments, remplissage: '#D9B694', contour: '#7A4A2A', opacite: 0.9 }
      ],
      etendu: (() => {
        const v = voisinageEtenduRetenu();
        return v && e.afficherEtendu ? {
          centre: centroid(principale().pts), rayonM: v.rayonM,
          parcelles: v.parcelles.map(c => c.pts),
          batiments: e.importerBatiments ? v.batiments.map(b => b.pts) : []
        } : null;
      })()
    };
  }

  return {
    voisinageEtenduRetenu, estPropriete, parcellesPropriete, voisinesRetenues, elementsRetenus, apercu,
    ligneSurface(c) {
      const calc = Math.round(c.aire);
      if (c.contenance === null || c.contenance === undefined) return calc + ' m² (calcul)';
      // Au-dela de 3 %, on montre les deux : la contenance cadastrale est arrondie et calculee
      // autrement, l'ecart est normal — mais le cacher ferait douter de la geometrie importee.
      const ecart = Math.abs(calc - c.contenance) / c.contenance;
      return ecart > 0.03 ? (c.contenance + ' m² (cadastre) / ' + calc + ' m² (calcul)') : (c.contenance + ' m²');
    },
    // Surface fusionnee reelle, pas la somme des contenances. Une fusion impossible doit se voir AVANT
    // la creation du projet, pas apres.
    resumePropriete() {
      const parcelles = parcellesPropriete();
      if (parcelles.length <= 1) {
        return { texte: 'Propriété : ' + libelleParcelle(principale()) + ' seule. Coche « propriété » sur une mitoyenne pour fusionner plusieurs parcelles en un seul terrain.', alerte: false };
      }
      const fusion = fusionnerAnneaux(parcelles.map(p => p.pts), FUSION_TOL_M);
      if (!fusion) {
        return { texte: 'Fusion impossible : ' + parcelles.map(libelleParcelle).join(' + ') + ' ne forment pas un ensemble d\'un seul tenant. Elles seront importées séparément.', alerte: true };
      }
      return { texte: 'Propriété fusionnée : ' + parcelles.map(libelleParcelle).join(' + ') + ' — ' + Math.round(shoelace(fusion.contour)) + ' m² au total, ' +
        chainerSegments(fusion.limites, FUSION_TOL_M).length + ' limite(s) interne(s) conservée(s) en pointillé.', alerte: false };
    },
    hauteursPropriete() {
      const iduPropriete = new Set(parcellesPropriete().map(p => p.idu));
      return elementsRetenus(e.batiments)
        .filter(b => [...b.parcelles].some(idu => iduPropriete.has(idu)))
        // Une feature sans `properties` arrive avec `props` absent : hauteur par defaut, comme a l'import.
        .map(b => hauteurBatiment(b.props || {})).sort((a, b) => b - a);
    },
    nombreArbresEstimes() {
      return Math.min(MAX_ARBRES_ESTIMES, elementsRetenus(e.vegetation).reduce((s, v) => s + arbresEstimes(v.pts, ESPACEMENT_ARBRES_M, MAX_ARBRES_ESTIMES).length, 0));
    },
    nomParDefaut() { return (libelleParcelle(principale()) + ' — ' + (e.geo ? e.geo.label : '')).slice(0, 60); }
  };
}

/** Les chargements aupres de l'IGN : le voisinage d'une parcelle, et la BD TOPO avec le PLU. */
function chargements(n: Noyau): Chargements {
  const { e, occuper, proj } = n;
  // Deuxieme requete, centree sur la parcelle retenue : c'est elle qui donne la liste COMPLETE des
  // mitoyennes. Faite une seule fois par parcelle.
  async function chargerVoisinage(c: Candidate): Promise<void> {
    if (e.voisinageCharge.has(c.idu)) return;
    const emprise = empriseAutourAnneau(c.anneauDeg, proj(), 20);
    const features = await interrogerCadastre(emprise, e.geo ? e.geo.citycode : '');
    const connus = new Set(e.candidats.map(x => x.idu));
    const nouveaux = construireCandidats(features, proj(), { x: 0, y: 0 }, e.simplifier).filter(x => !connus.has(x.idu));
    if (nouveaux.length) e.candidats = classerCandidats(e.candidats.concat(nouveaux));
    e.voisinageCharge.add(c.idu);
  }
  function appliquerPrincipale(c: Candidate): void {
    // Le voisinage etendu est centre sur la principale : en changer le rend caduc. Le choix reste
    // (demande, rayon) ; la lecture sera refaite autour de la nouvelle principale.
    if (e.principale && e.principale.idu !== c.idu) e.etenduMax = null;
    e.principale = c;
    const tri = trierVoisines(c, e.candidats);
    e.adjacentes = tri.adjacentes;
    e.autres = tri.autres;
    e.tropDense = tri.tropDense;
    e.selection = new Set([...e.selection].filter(idu => idu !== c.idu));
    // La nouvelle principale ne peut plus figurer dans la liste des parcelles a lui fusionner.
    e.propriete.delete(c.idu);
    rattacherElementsAuxParcelles(e.batiments, e.candidats);
    rattacherElementsAuxParcelles(e.haies, e.candidats);
    rattacherElementsAuxParcelles(e.vegetation, e.candidats);
  }
  // BD TOPO + PLU sur l'emprise de la parcelle et de ses mitoyennes. Ces couches sont un complement :
  // leur indisponibilite ne doit pas empecher d'importer la parcelle.
  async function chargerDonneesIgn(c: Candidate): Promise<void> {
    if (e.ignCharge.has(c.idu)) return;
    const anneaux = [c.anneauDeg].concat(e.adjacentes.map(v => v.anneauDeg));
    const bbox = bboxDegDesAnneaux(anneaux, proj(), 10);
    const centre = centroid(c.pts);
    const centreDeg = proj().versDegres(centre.x, centre.y);
    const [bat, veg, haie, plu] = await Promise.all([
      interrogerWfs(COUCHE_BATIMENT, bbox, 80),
      interrogerWfs(COUCHE_VEGETATION, bbox, 40).catch((): FeatureGeoJSON[] => []),
      interrogerWfs(COUCHE_HAIE, bbox, 40).catch((): FeatureGeoJSON[] => []),
      interrogerPlu(centreDeg.lon, centreDeg.lat).catch((): null => null)
    ]);
    e.batiments = construireElementsIgn(bat, proj(), e.simplifier, 'batiment');
    e.vegetation = construireElementsIgn(veg, proj(), e.simplifier, 'vegetation');
    e.haies = construireElementsIgn(haie, proj(), e.simplifier, 'haie');
    e.plu = plu;
    rattacherElementsAuxParcelles(e.batiments, e.candidats);
    rattacherElementsAuxParcelles(e.haies, e.candidats);
    rattacherElementsAuxParcelles(e.vegetation, e.candidats);
    e.ignCharge.add(c.idu);
  }
  async function chargerIgnAvecMessage(c: Candidate): Promise<void> {
    occuper(true, 'Bâtiments, végétation et PLU…');
    try {
      await chargerDonneesIgn(c);
      e.ignErreur = '';
    } catch (err) {
      e.batiments = []; e.haies = []; e.vegetation = [];
      e.ignErreur = 'Donnees BD TOPO indisponibles : ' + ((err as Error).message || err);
    }
    occuper(false);
    if (e.ignErreur) e.erreur = e.ignErreur;
  }

  // Une lecture a la fois : la boucle relit tant que le curseur (ou la principale) a change pendant
  // la lecture, et un appel pendant une lecture s'en remet a elle.
  let lectureEnCours = false;
  async function chargerEtendu(): Promise<void> {
    if (lectureEnCours) return;
    lectureEnCours = true;
    try {
      for (;;) {
        if (!e.voisinageEtendu || !e.principale) return;
        const rayon = rayonDeLecture(e.rayonEtendu);
        if (e.etenduMax && e.etenduMax.rayonM >= rayon) return;
        const pour = e.principale.idu;
        occuper(true, 'Parcelles et bâtiments à moins de ' + rayon + ' m…');
        try {
          const lu = await lireVoisinageRayon(centroid(e.principale.pts), proj(), rayon, e.simplifier, new Set([pour]));
          // La principale a pu changer pendant la lecture : ce disque n'est plus le sien, on relit.
          if (e.principale && e.principale.idu === pour) e.etenduMax = lu;
        } catch (err) {
          e.erreur = 'Voisinage étendu non chargé : ' + ((err as Error).message || err);
          return;
        } finally {
          occuper(false);
        }
      }
    } finally {
      lectureEnCours = false;
    }
  }

  return { chargerVoisinage, appliquerPrincipale, chargerIgnAvecMessage, chargerEtendu };
}

/** Etape 1 : l'adresse, geocodee, puis la parcelle la plus proche et son voisinage. */
/** Au-dela de cette precision, la position ne designe pas une parcelle a coup sur : l'adresse est proposee, pas choisie. */
export const PRECISION_POSITION_MAX_M = 50;

function gestesAdresse(n: Noyau, ch: Chargements, ctx: ContexteImportCadastre): Pick<ImportCadastre, 'saisirAdresse' | 'rechercher' | 'choisirAdresse' | 'utiliserMaPosition' | 'positionDisponible'> {
  const { e, signaler, occuper } = n;
  const { chargerVoisinage, appliquerPrincipale, chargerIgnAvecMessage, chargerEtendu } = ch;
  let minuteur: ReturnType<typeof setTimeout> | null = null, requeteEnCours = 0;

  async function choisirAdresse(sug: AdresseRecherchee): Promise<void> {
    e.geo = sug;
    e.resumePret = false;
    occuper(true, 'Recherche de la parcelle…');
    try {
      const pr = projecteurLocal(sug.lat, sug.lon);
      const ptRef = { x: 0, y: 0 };   // le point d'adresse est l'origine de cette projection
      let features: FeatureGeoJSON[] = [], rayon: number | null = null;
      for (const r of RAYONS_RECHERCHE_M) {
        features = await interrogerCadastre(empriseGeoJSON(sug.lon, sug.lat, pr, r), sug.citycode);
        if (features.length) { rayon = r; break; }
      }
      occuper(false);
      if (!features.length) {
        e.erreur = 'Aucune parcelle cadastrale trouvee dans un rayon de ' + RAYONS_RECHERCHE_M[RAYONS_RECHERCHE_M.length - 1] + ' m.';
        signaler(); return;
      }
      const cands = classerCandidats(construireCandidats(features, pr, ptRef, e.simplifier));
      const premiere = cands[0];
      if (!premiere) { e.erreur = 'Geometrie inexploitable renvoyee par le service cadastre.'; signaler(); return; }
      // Le filtre geom pourrait etre ignore sans que rien ne le signale : une « plus proche » parcelle
      // a 200 m de l'adresse trahirait ce cas mieux que n'importe quel code HTTP.
      if (premiere.distance > 120) {
        e.erreur = 'Reponse incoherente du service cadastre (parcelle la plus proche a ' + Math.round(premiere.distance) + ' m de l\'adresse).';
        signaler(); return;
      }
      e.proj = pr;
      e.rayon = rayon;
      e.candidats = cands;
      e.selection = new Set();
      e.voisinageCharge = new Set();
      occuper(true, 'Recherche des parcelles voisines…');
      try {
        await chargerVoisinage(premiere);
      } catch (err) {
        // Le voisinage est un complement : son echec ne doit pas emporter la parcelle trouvee.
        e.erreur = 'Parcelles voisines non chargees : ' + ((err as Error).message || err);
      }
      occuper(false);
      appliquerPrincipale(premiere);
      await chargerIgnAvecMessage(premiere);
      // Import direct : on reste a l'etape 1, avec un resume et le compte du voisinage avant de creer.
      if (e.importDirect) {
        await chargerEtendu();
        e.resumePret = true;
      } else e.etape = 2;
      signaler();
    } catch (err) {
      occuper(false);
      e.erreur = (err as Error).message || String(err);
      signaler();
    }
  }

  async function rechercher(texte: string): Promise<void> {
    if (!texte || texte.length < 3) { e.erreur = 'Saisis une adresse (au moins 3 caracteres).'; signaler(); return; }
    const m = texte.match(RE_COORDS);
    if (m) {
      const lat = parseFloat((m[1] ?? '').replace(',', '.')), lon = parseFloat((m[2] ?? '').replace(',', '.'));
      void choisirAdresse({ label: 'Point ' + lat.toFixed(6) + ', ' + lon.toFixed(6), score: 1, genre: 'coordonnees', citycode: '', ville: '', lon, lat });
      return;
    }
    occuper(true, 'Geocodage en cours…');
    try {
      const res = await geocoderBAN(texte, false);
      occuper(false);
      const meilleure = res[0];
      if (!meilleure) { e.erreur = 'Aucune adresse trouvee. Essaie sans le numero, ou avec le code postal.'; signaler(); return; }
      e.suggestions = res;
      void choisirAdresse(meilleure);
    } catch (err) {
      occuper(false);
      e.erreur = 'Geocodage impossible : ' + ((err as Error).message || err);
      signaler();
    }
  }

  // A l'ouverture, une adresse tapee ou choisie entre-temps a la priorite sur la position.
  const devancee = () => e.saisie || !!e.geo || e.etape !== 1;

  async function utiliserMaPosition(auto = false): Promise<void> {
    if (auto && devancee()) return;
    e.position = { etat: 'demande', adresse: '', precisionM: null };
    signaler();
    let pos: PositionGps;
    try {
      pos = await (ctx.lirePosition ?? (() => lirePositionGps()))();
    } catch (err) {
      const raison = err instanceof SansPosition ? err.raison : 'indisponible';
      e.position = { etat: auto ? 'aucune' : raison === 'refusee' ? 'refusee' : 'indisponible', adresse: '', precisionM: null };
      signaler(); return;
    }
    if (auto && devancee()) { e.position = { etat: 'aucune', adresse: '', precisionM: null }; signaler(); return; }
    const adresse = await (ctx.geocoderInverse ?? geocoderInverseBAN)(pos.lon, pos.lat).catch(() => null);
    const precisionM = Math.round(pos.precisionM);
    const label = adresse?.label || 'Position ' + pos.lat.toFixed(6) + ', ' + pos.lon.toFixed(6);
    if (auto && devancee()) { e.position = { etat: 'aucune', adresse: '', precisionM: null }; signaler(); return; }
    // Trop imprecise pour designer une parcelle (un ordinateur situe par son reseau) : on propose
    // l'adresse, on ne la choisit pas. D'un geste, on la prend telle quelle.
    if (auto && precisionM > PRECISION_POSITION_MAX_M) {
      e.position = { etat: 'approximative', adresse: adresse?.label ?? '', precisionM };
      signaler(); return;
    }
    e.position = { etat: 'trouvee', adresse: label, precisionM };
    // La parcelle se cherche sous le point de l'appareil, pas sous le point d'adresse : sur le
    // terrain, c'est la parcelle ou l'on se tient. La commune de l'adresse filtre le cadastre.
    await choisirAdresse({ label, score: 1, genre: 'position', citycode: adresse?.citycode ?? '', ville: adresse?.ville ?? '', lon: pos.lon, lat: pos.lat });
  }

  return {
    utiliserMaPosition,
    positionDisponible: () => !!ctx.lirePosition || geolocalisationDisponible(),
    // On ne relance le geocodage qu'apres 250 ms de calme, et seule la reponse de la derniere frappe
    // compte : une reponse plus ancienne qui arriverait apres ecraserait la bonne.
    saisirAdresse(texte) {
      e.saisie = true;
      if (minuteur) clearTimeout(minuteur);
      const t = texte.trim();
      if (t.length < 3) { e.suggestions = []; signaler(); return; }
      minuteur = setTimeout(async () => {
        const monTour = ++requeteEnCours;
        try {
          const res = await geocoderBAN(t, true);
          if (monTour !== requeteEnCours) return;
          e.suggestions = res; e.erreur = '';
        } catch (err) {
          if (monTour !== requeteEnCours) return;
          e.suggestions = []; e.erreur = 'Geocodage impossible : ' + ((err as Error).message || err);
        }
        signaler();
      }, 250);
    },
    rechercher,
    choisirAdresse
  };
}

type GestesSelection = Pick<ImportCadastre, 'choisirPrincipale' | 'basculerVoisine' | 'basculerPropriete' | 'cocherMitoyennes'
  | 'toutDecocher' | 'survoler' | 'basculerSimplifier' | 'basculerCaseIgn' | 'basculerVoisinageEtendu' | 'reglerRayonEtendu' | 'basculerAfficherEtendu'
  | 'basculerImportDirect' | 'allerA'>;

/** Etapes 2 et 3 : la parcelle principale, les voisines, la propriete, les couches a importer. */
function gestesSelection(n: Noyau, ch: Chargements): GestesSelection {
  const { e, signaler, occuper, principale, proj } = n;
  const { chargerVoisinage, appliquerPrincipale, chargerIgnAvecMessage, chargerEtendu } = ch;
  async function choisirPrincipale(c: Candidate): Promise<void> {
    if (c.idu === principale().idu) return;
    occuper(true, 'Recherche des parcelles voisines…');
    try {
      await chargerVoisinage(c);
    } catch (err) {
      e.erreur = 'Parcelles voisines non chargees : ' + ((err as Error).message || err);
    }
    occuper(false);
    appliquerPrincipale(c);
    await chargerIgnAvecMessage(c);
    await chargerEtendu();
    signaler();
  }

  return {
    choisirPrincipale,
    basculerVoisine(c) {
      if (e.propriete.has(c.idu)) return;   // une parcelle de la propriete est importee d'office
      if (e.selection.has(c.idu)) e.selection.delete(c.idu); else e.selection.add(c.idu);
      signaler();
    },
    basculerPropriete(c) {
      if (e.propriete.has(c.idu)) e.propriete.delete(c.idu);
      else {
        e.propriete.add(c.idu);
        e.selection.delete(c.idu);   // elle n'est plus une voisine : elle EST la parcelle
      }
      signaler();
    },
    cocherMitoyennes() { e.adjacentes.forEach(c => e.selection.add(c.idu)); signaler(); },
    toutDecocher() { e.selection.clear(); signaler(); },
    survoler(idu) { if (e.survol !== idu) { e.survol = idu; signaler(); } },
    basculerSimplifier(actif) {
      e.simplifier = actif;
      // Retour a la geometrie source : re-projeter depuis les anneaux WGS84 conserves, plutot que de
      // re-simplifier un contour deja simplifie (ce qui ne reviendrait jamais en arriere).
      e.candidats.forEach(c => {
        c.pts = anneauVersPts(c.anneauDeg, proj(), e.simplifier);
        c.aire = shoelace(c.pts);
        c.dedans = pointInPolygon({ x: 0, y: 0 }, c.pts);
        c.distance = distancePointContour({ x: 0, y: 0 }, c.pts);
      });
      appliquerPrincipale(e.candidats.find(c => c.idu === principale().idu) || principale());
      signaler();
    },
    basculerCaseIgn(cle, actif) { e[cle] = actif; signaler(); },
    async basculerVoisinageEtendu(actif) {
      e.voisinageEtendu = actif;
      signaler();
      if (actif) { await chargerEtendu(); signaler(); }
    },
    reglerRayonEtendu(rayonM) {
      e.rayonEtendu = rayonEtenduValide(rayonM);
      signaler();
      // Le curseur a passe le palier lu : le disque est relu, plus grand ; le compte suit a l'arrivee.
      if (e.voisinageEtendu && e.principale && (!e.etenduMax || e.etenduMax.rayonM < rayonDeLecture(e.rayonEtendu))) void chargerEtendu().then(signaler);
    },
    basculerImportDirect(actif) {
      e.importDirect = actif;
      try { localStorage.setItem(CLE_IMPORT_DIRECT, actif ? '1' : '0'); } catch { /* stockage indisponible : le choix vaut pour cette fois */ }
      signaler();
    },
    basculerAfficherEtendu(actif) { e.afficherEtendu = actif; signaler(); },
    allerA(etape) {
      e.etape = etape;
      // Revenir a l'adresse, c'est repartir de zero : le resume de l'import direct ne vaut plus.
      if (etape === 1) { e.suggestions = []; e.resumePret = false; }
      signaler();
    },
  };
}

/**
 * Le relief du plan neuf, si la case est cochee et la capacite presente : lu sur la parcelle du
 * projet (ou toutes les parcelles), range sur elle. Un echec ne bloque pas la creation : le plan
 * arrive sans relief, « Lire le relief » reste a portee. Rend la phrase d'echec, ou `''`.
 */
async function reliefImporte(objets: ObjetPlan[], e: EtatImportCadastre, occuper: Noyau['occuper'], lire: typeof lireRelief): Promise<string> {
  if (!e.importerRelief || !droitsCourants().aCapacite(CAPACITES.relief.code)) return '';
  const demande = demandeReliefDuPlan(objets, e.reliefToutesParcelles);
  const parcelle = parcelleDuProjet(objets);
  if (!demande || !parcelle) return '';
  occuper(true, 'Relief du terrain (IGN)…');
  try {
    parcelle.relief = await lire(demande);
    return '';
  } catch (err) {
    return 'Relief non lu : ' + ((err as Error).message || err) + ' « Lire le relief » le réessaie.';
  }
}

/** La fin du parcours : le plan construit, enregistre comme nouveau projet (ou charge en local). */
function gesteCreation(n: Noyau, l: Lectures, ctx: ContexteImportCadastre, fermer: () => void): Pick<ImportCadastre, 'creerProjet'> {
  const { e, signaler, occuper, principale, proj } = n;
  const { parcellesPropriete, voisinesRetenues, voisinageEtenduRetenu } = l;
  return {
    async creerProjet(nomSaisi) {
      const nom = nomSaisi.trim() || ('Parcelle ' + libelleParcelle(principale()));
      let objets;
      try {
        // A l'etape 3, seul endroit d'ou ce geste est joignable, l'etape 1 a abouti : `principale` et
        // `proj` sont poses.
        // `voisinageEtendu` de l'etat est la demande (un booleen) ; l'import attend le voisinage lui-meme.
        const { rayon, voisinageEtendu, ...reste } = e;
        const etendu = voisinageEtendu ? voisinageEtenduRetenu() : null;
        const importe: ImportCadastral = {
          ...reste, principale: principale(), proj: proj(), parcellesPropriete, voisinesRetenues, ...(rayon !== null ? { rayon } : {}),
          voisinageEtendu: etendu ? { parcelles: etendu.parcelles, batiments: etendu.batiments, visible: e.afficherEtendu } : null
        };
        objets = objetsDepuisCadastre(importe);
      } catch (err) {
        e.erreur = 'Construction du plan impossible : ' + ((err as Error).message || err);
        signaler(); return;
      }
      // La couverture de chaque toit, lue sur l'orthophoto (MD/spec-toit-ign.md §6.1). Sans
      // reponse du WMTS, les toits gardent la tuile rouge par defaut : rien n'est bloque.
      occuper(true, 'Couleur des toits sur l’orthophoto…');
      await couleursToitsDepuisOrtho(objets, proj()).catch(() => null);
      // La forme des toits, mesuree sur le MNH LiDAR HD (MD/spec-toit-ign.md §10) : les plus
      // proches d'abord, dans un delai borne ; sans dalle LiDAR, les toits BD TOPO restent.
      occuper(true, 'Forme des toits sur le LiDAR HD…');
      await (ctx.toitsLidar ?? toitsDepuisLidar)(objets, proj()).catch(() => null);
      const relief = await reliefImporte(objets, e, occuper, ctx.lireRelief ?? lireRelief);
      occuper(false);
      if (!ctx.apiDisponible) {
        // Mode local : pas de serveur ou ecrire. On charge quand meme le plan (meme chemin que l'import
        // JSON), en le disant clairement plutot que de faire semblant d'enregistrer.
        fermer();
        ctx.appliquerProjetImporte({ meta: {}, objets, mesures: [], ignores: 0 }, true);
        showToast('Mode local : le plan cadastral est charge mais ne sera pas enregistre. Utilise Export JSON pour le conserver.' + (relief ? ' ' + relief : ''));
        return;
      }
      const cible = ctx.projetCible?.() ?? null;
      occuper(true, cible ? 'Enregistrement du projet…' : 'Creation du projet…');
      try {
        // Enregistre sous sa forme ecrite (io/serialisation.ts) : relief compacte, voisinage allege —
        // en memoire, un voisinage de 200 m et son relief depassaient ce que la plateforme accepte.
        const cree = await ctx.apiSave({ ...(cible ? { id: cible.id } : {}), name: nom, objects: serializeObjects(objets), measures: [] });
        localStorage.setItem(ctx.cleDernierProjet, cree.id);
        location.href = ctx.withProjectParam(cree.id);
      } catch (err) {
        occuper(false);
        e.erreur = (cible ? 'Impossible d enregistrer le projet : ' : 'Impossible de creer le projet : ') + ((err as Error).message || err);
        signaler();
      }
    }
  };
}

export function creerImportCadastre(ctx: ContexteImportCadastre, fermer: () => void): ImportCadastre {
  const e: EtatImportCadastre = {
    etape: 1,
    suggestions: [], geo: null, occupe: false, message: '', erreur: '',
    candidats: [], principale: null, adjacentes: [], autres: [],
    selection: new Set(), simplifier: true, rayon: null, proj: null,
    tropDense: false, survol: null, voisinageCharge: new Set(),
    batiments: [], haies: [], vegetation: [], plu: null, ignCharge: new Set(), ignErreur: '',
    // Haies, vegetation et arbres estimes chargent le plan d'objets approximatifs : ils se demandent.
    importerBatiments: true, importerHaies: false, importerVegetation: false, importerArbres: false,
    importerRelief: true, reliefToutesParcelles: true,
    propriete: new Set(),
    voisinageEtendu: false, rayonEtendu: RAYON_ETENDU_DEFAUT_M, etenduMax: null, afficherEtendu: true,
    importDirect: importDirectMemorise(), resumePret: false,
    saisie: false, position: { etat: 'aucune', adresse: '', precisionM: null }
  };
  let version = 0;
  const abonnes = new Set<() => void>();
  const signaler = () => { version++; abonnes.forEach(f => f()); };
  const occuper = (actif: boolean, texte = ''): void => {
    e.occupe = actif;
    e.message = actif ? texte : '';
    if (actif) e.erreur = '';
    signaler();
  };
  // Les gestes de l'etape 2 ne s'ouvrent qu'une parcelle choisie et projetee : les lire avant est une erreur.
  const exiger = <T,>(v: T | null | undefined, quoi: string): T => {
    if (v === null || v === undefined) throw new Error(quoi + ' : pas encore choisie.');
    return v;
  };
  const n: Noyau = { e, signaler, occuper, principale: () => exiger(e.principale, 'Parcelle principale'), proj: () => exiger(e.proj, 'Projection locale') };
  const l = lectures(n);
  const ch = chargements(n);
  return {
    etat: () => e,
    abonner(f) { abonnes.add(f); return () => { abonnes.delete(f); }; },
    version: () => version,
    fermer,
    ...gestesAdresse(n, ch, ctx),
    ...gestesSelection(n, ch),
    ...gesteCreation(n, l, ctx, fermer),
    ...l,
    // Un projet a remplir garde le nom qu'on lui a donne chez la plateforme.
    nomParDefaut: () => ctx.projetCible?.()?.name || l.nomParDefaut(),
    projetCible: () => ctx.projetCible?.() ?? null,
    reliefPermis: () => droitsCourants().aCapacite(CAPACITES.relief.code)
  };
}

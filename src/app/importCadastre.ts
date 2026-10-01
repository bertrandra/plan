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
import { centroid, shoelace, pointInPolygon } from '../geometry/basic.js';
import { fusionnerAnneaux, chainerSegments } from '../geometry/rings.js';
import { distancePointContour } from '../geometry/proximite.js';
import { projecteurLocal } from '../geo/projection.js';
import { hauteurBatiment, arbresEstimes, libelleParcelle, ESPACEMENT_ARBRES_M, MAX_ARBRES_ESTIMES } from '../geo/bdtopo.js';
import { objetsDepuisCadastre } from '../geo/cadastreObjets.js';
import { couleursToitsDepuisOrtho } from '../render/couleurToitOrtho.js';
import { FUSION_TOL_M } from '../geo/constantesCadastre.js';
import {
  geocoderBAN, interrogerCadastre, construireCandidats, classerCandidats, trierVoisines,
  anneauVersPts, empriseGeoJSON, empriseAutourAnneau, bboxDegDesAnneaux,
  interrogerWfs, construireElementsIgn, rattacherElementsAuxParcelles, interrogerPlu,
  RAYONS_RECHERCHE_M, COUCHE_BATIMENT, COUCHE_VEGETATION, COUCHE_HAIE
} from '../geo/apiIgn.js';
import type { Candidate, ElementIgn, FeatureGeoJSON } from '../geo/apiIgn.js';
import type { ProjecteurLocal } from '../geo/projection.js';
import type { AdresseRecherchee, ImportCadastral } from '../geo/cadastreObjets.js';
import type { PtBrut, ZonagePlu } from '../model/types.js';
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
}

export type CaseIgn = 'importerBatiments' | 'importerHaies' | 'importerVegetation' | 'importerArbres';

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
  /** Parcelles cochees « propriete » : elles seront FUSIONNEES avec la principale en un seul terrain. */
  propriete: Set<string>;
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
}

export interface ImportCadastre {
  etat(): Readonly<EtatImportCadastre>;
  abonner(f: () => void): () => void;
  version(): number;
  fermer(): void;

  // Etape 1
  saisirAdresse(texte: string): void;
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
  allerA(etape: 1 | 2 | 3): void;
  creerProjet(nom: string): Promise<void>;

  // Lectures pour l'ecran
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
  /** Le projet que l'import remplit, ou `null` s'il en cree un. */
  projetCible(): { id: string; name: string } | null;
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

type Lectures = Pick<ImportCadastre, 'estPropriete' | 'parcellesPropriete' | 'voisinesRetenues' | 'elementsRetenus' | 'apercu'
  | 'ligneSurface' | 'resumePropriete' | 'hauteursPropriete' | 'nombreArbresEstimes' | 'nomParDefaut'>;

interface Chargements {
  chargerVoisinage(c: Candidate): Promise<void>;
  appliquerPrincipale(c: Candidate): void;
  chargerIgnAvecMessage(c: Candidate): Promise<void>;
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
      ]
    };
  }

  return {
    estPropriete, parcellesPropriete, voisinesRetenues, elementsRetenus, apercu,
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

  return { chargerVoisinage, appliquerPrincipale, chargerIgnAvecMessage };
}

/** Etape 1 : l'adresse, geocodee, puis la parcelle la plus proche et son voisinage. */
function gestesAdresse(n: Noyau, ch: Chargements): Pick<ImportCadastre, 'saisirAdresse' | 'rechercher' | 'choisirAdresse'> {
  const { e, signaler, occuper } = n;
  const { chargerVoisinage, appliquerPrincipale, chargerIgnAvecMessage } = ch;
  let minuteur: ReturnType<typeof setTimeout> | null = null, requeteEnCours = 0;

  async function choisirAdresse(sug: AdresseRecherchee): Promise<void> {
    e.geo = sug;
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
      e.etape = 2;
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

  return {
    // On ne relance le geocodage qu'apres 250 ms de calme, et seule la reponse de la derniere frappe
    // compte : une reponse plus ancienne qui arriverait apres ecraserait la bonne.
    saisirAdresse(texte) {
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
  | 'toutDecocher' | 'survoler' | 'basculerSimplifier' | 'basculerCaseIgn' | 'allerA'>;

/** Etapes 2 et 3 : la parcelle principale, les voisines, la propriete, les couches a importer. */
function gestesSelection(n: Noyau, ch: Chargements): GestesSelection {
  const { e, signaler, occuper, principale, proj } = n;
  const { chargerVoisinage, appliquerPrincipale, chargerIgnAvecMessage } = ch;
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
    allerA(etape) {
      e.etape = etape;
      if (etape === 1) e.suggestions = [];
      signaler();
    },
  };
}

/** La fin du parcours : le plan construit, enregistre comme nouveau projet (ou charge en local). */
function gesteCreation(n: Noyau, l: Lectures, ctx: ContexteImportCadastre, fermer: () => void): Pick<ImportCadastre, 'creerProjet'> {
  const { e, signaler, occuper, principale, proj } = n;
  const { parcellesPropriete, voisinesRetenues } = l;
  return {
    async creerProjet(nomSaisi) {
      const nom = nomSaisi.trim() || ('Parcelle ' + libelleParcelle(principale()));
      let objets;
      try {
        // A l'etape 3, seul endroit d'ou ce geste est joignable, l'etape 1 a abouti : `principale` et
        // `proj` sont poses.
        const { rayon, ...reste } = e;
        const importe: ImportCadastral = { ...reste, principale: principale(), proj: proj(), parcellesPropriete, voisinesRetenues, ...(rayon !== null ? { rayon } : {}) };
        objets = objetsDepuisCadastre(importe);
      } catch (err) {
        e.erreur = 'Construction du plan impossible : ' + ((err as Error).message || err);
        signaler(); return;
      }
      // La couverture de chaque toit, lue sur l'orthophoto (MD/spec-toit-ign.md §6.1). Sans
      // reponse du WMTS, les toits gardent la tuile rouge par defaut : rien n'est bloque.
      occuper(true, 'Couleur des toits sur l’orthophoto…');
      await couleursToitsDepuisOrtho(objets, proj()).catch(() => null);
      occuper(false);
      if (!ctx.apiDisponible) {
        // Mode local : pas de serveur ou ecrire. On charge quand meme le plan (meme chemin que l'import
        // JSON), en le disant clairement plutot que de faire semblant d'enregistrer.
        fermer();
        ctx.appliquerProjetImporte({ meta: {}, objets, mesures: [], ignores: 0 }, true);
        showToast('Mode local : le plan cadastral est charge mais ne sera pas enregistre. Utilise Export JSON pour le conserver.');
        return;
      }
      const cible = ctx.projetCible?.() ?? null;
      occuper(true, cible ? 'Enregistrement du projet…' : 'Creation du projet…');
      try {
        const cree = await ctx.apiSave({ ...(cible ? { id: cible.id } : {}), name: nom, objects: objets, measures: [] });
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
    importerBatiments: true, importerHaies: true, importerVegetation: true, importerArbres: false,
    propriete: new Set()
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
    ...gestesAdresse(n, ch),
    ...gestesSelection(n, ch),
    ...gesteCreation(n, l, ctx, fermer),
    ...l,
    // Un projet a remplir garde le nom qu'on lui a donne chez la plateforme.
    nomParDefaut: () => ctx.projetCible?.()?.name || l.nomParDefaut(),
    projetCible: () => ctx.projetCible?.() ?? null
  };
}

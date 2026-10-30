// Les regles de la lecture du jardin (lot L3 de la lecture IA elargie) : ce que le moteur decide des observations de Claude
// (src/regles/jardin/observations.ts). Claude propose, ces regles decident, la personne confirme :
//
// 1. Ce qui est assez sur pour etre propose (`jardin.ia.certitudeMin`), et ce qui est chez le voisin (`jardin.ia.horsParcelleM`).
// 2. Ou c'est, en metres : chaque point de l'image passe dans le repere du plan par le cadrage de l'image (son geo-referencement).
// 3. Ce qui est deja dans le plan (`jardin.ia.doublonM`) : rien n'est propose deux fois, un objet confirme ne revient pas.
// 4. Ce que c'est dans le plan : un arbre de la bibliotheque (son genre rapproche de l'essence la plus proche, sa classe de taille), une
//    plate-bande ou un potager (une `plantation`, model/jardin.ts), un equipement du jardin (sa `nature`), une terrasse, une piscine ou un chemin DEJA LA (`existant` :
//    ils situent le projet, rien ne les chiffre), une haie interieure ; une cloture, une haie de limite, un muret ou un portail a moins
//    de `jardin.ia.limiteM` d'un cote de la parcelle s'ecrit sur la cloture de ce cote (MD/spec-cloture.md), pas comme un objet.
//
// Pur et synchrone : la bibliotheque d'essences et les seuils sont des entrees. Rien n'est ecrit ici ; app/regles/jardin.ts en fait
// des propositions (regles/decisions.ts), que l'avant/apres de l'audit montre decochees.

import { centroid, pointInPolygon, shoelace } from '../../geometry/basic.js';
import { ribbonChemin } from '../../geometry/ruban.js';
import { tailleDe, TAILLES, type EspeceArbre, type TailleArbre } from '../../model/especesArbre.js';
import { estOuvrage, ARBRE, CHEMIN, DALLE, EQUIPEMENT, MASSIF, PISCINE, TERRASSE } from '../../model/ouvrages/index.js';
import { nouveauMassif, nouvelEquipement } from '../../model/jardin.js';
import type { ObjetPlan, PtBrut, TypePlantation } from '../../model/types.js';
import type { PositionPortail, TypeCloture } from '../../model/clotureVue.js';
import { PART_CERTITUDE, versPlan, type CadrageJardin, type GenreArbre, type ObservationJardin, type ObservationsJardin } from '../../regles/jardin/observations.js';
import type { ReglagesJardin } from '../../regles/jardin/reglages.js';

/** Ce que le moteur decide d'une observation : un objet a ajouter, ou un cote de la cloture a regler. */
export type EffetJardin =
  | { type: 'objet'; objet: ObjetPlan }
  | { type: 'cloture'; cote: number; typeCloture: TypeCloture; hauteurM?: number }
  | { type: 'portail'; cote: number; position: PositionPortail };

export interface DecisionJardin {
  /** Stable d'une lecture a l'autre : la sorte et la place arrondie au decimetre. */
  id: string;
  genre: ObservationJardin['genre'];
  /** « Arbre (Chêne pédonculé, moyen) », « Plate-bande de fleurs », « Clôture côté 2 (haie) ». */
  objet: string;
  apres: string;
  effet: EffetJardin;
  /** La certitude de Claude, en part. */
  confiance: number;
  indices: ObservationJardin['indices'];
  /** Ce que la regle a du supposer (une essence approchee, une hauteur par defaut) ; null si rien. */
  suppose: string | null;
}

/** Une observation ecartee, et pourquoi : l'ecran peut la dire, rien ne s'ecrit. */
export interface EcartJardin { genre: ObservationJardin['genre']; raison: string }

export interface EntreesJardin {
  observations: ObservationsJardin;
  cadrage: CadrageJardin;
  /** Le contour de la parcelle du projet, en metres. */
  parcelle: readonly PtBrut[];
  objets: readonly ObjetPlan[];
  especes: readonly EspeceArbre[];
  reglages: ReglagesJardin;
}

// ---- Les arbres : du genre que Claude nomme a l'essence de la bibliotheque -------------------------------------------------------

/**
 * Les mots qu'un genre cherche dans l'identifiant d'une essence (decoupe en tirets, sans accents) : la bibliotheque de l'administrateur
 * change sans PR, son vocabulaire ne peut pas entrer dans le schema, la regle fait le pont. Un genre absent de la bibliotheque prend un
 * proche (un prunier, le pecher ou le cerisier).
 */
const MOTS_DU_GENRE: Readonly<Record<GenreArbre, readonly string[]>> = {
  chene: ['chene'], pin: ['pin'], peuplier: ['peuplier'], hetre: ['hetre'], charme: ['charme', 'charmille'], bouleau: ['bouleau'], erable: ['erable'],
  frene: ['frene'], platane: ['platane'], tilleul: ['tilleul'], marronnier: ['marronnier'], noyer: ['noyer'], robinier: ['robinier'], saule: ['saule'],
  cerisier: ['cerisier'], pommier: ['pommier'], poirier: ['poirier', 'pommier'], prunier: ['prunier', 'pecher', 'cerisier'], olivier: ['olivier'],
  magnolia: ['magnolia'], lilas: ['lilas'], laurier: ['laurier'], houx: ['houx'], buis: ['buis'], thuya: ['thuya'], if: ['if'], cypres: ['cypres'],
  cedre: ['cedre'], epicea: ['epicea', 'sapin'], sapin: ['sapin', 'epicea'], sequoia: ['sequoia'], eucalyptus: ['eucalyptus'], palmier: ['palmier'],
  'autre-feuillu': [], 'autre-conifere': ['pin', 'epicea', 'sapin', 'cedre', 'cypres', 'thuya', 'if', 'sequoia'], indetermine: [],
};

/** Les genres qui gardent leurs feuilles : faute d'essence du genre, on cherche alors parmi les persistantes. */
const PERSISTANTS: ReadonlySet<GenreArbre> = new Set<GenreArbre>(['pin', 'olivier', 'laurier', 'houx', 'buis', 'thuya', 'if', 'cypres', 'cedre', 'epicea', 'sapin', 'sequoia', 'eucalyptus', 'palmier', 'autre-conifere']);

const RANG_TAILLE = (t: TailleArbre): number => TAILLES.findIndex((x) => x.id === t);
/** La hauteur que dit une classe de taille quand l'essence n'est pas de cette classe : son milieu. */
const HAUTEUR_DE_LA_CLASSE: Readonly<Record<TailleArbre, number>> = { petit: 4.5, moyen: 9, grand: 16, 'tres-grand': 24 };

/**
 * L'essence de la bibliotheque la plus proche d'un arbre vu : celles du genre (ses mots dans l'identifiant), sinon celles qui gardent
 * ou perdent leurs feuilles comme lui, sinon toutes ; parmi elles, celle dont la classe de taille est la plus proche de celle vue. Null
 * avec une bibliotheque vide. `exacte` : l'essence est du genre vu.
 */
export function especeDuGenre(a: NonNullable<ObservationJardin['arbre']>, especes: readonly EspeceArbre[]): { espece: EspeceArbre; exacte: boolean } | null {
  if (!especes.length) return null;
  const mots = MOTS_DU_GENRE[a.genre];
  const duGenre = especes.filter((e) => e.id.split('-').some((m) => mots.includes(m)));
  const persistant = a.persistant ?? (a.genre !== 'indetermine' && a.genre !== 'autre-feuillu' ? PERSISTANTS.has(a.genre) : null);
  const memeFeuillage = persistant === null ? [] : especes.filter((e) => e.caduc === !persistant);
  const candidates = duGenre.length ? duGenre : memeFeuillage.length ? memeFeuillage : [...especes];
  const vise = a.taille ? RANG_TAILLE(a.taille) : null;
  const ecart = (e: EspeceArbre) => (vise === null ? 0 : Math.abs(RANG_TAILLE(tailleDe(e).id) - vise));
  const espece = [...candidates].sort((x, y) => ecart(x) - ecart(y))[0] as EspeceArbre;
  // L'exacte respecte l'ordre de la bibliotheque a ecart egal : le tri est stable.
  return { espece, exacte: duGenre.includes(espece) };
}

// ---- La geometrie --------------------------------------------------------------------------------------------------------------

const arrondi = (v: number) => Math.round(v * 100) / 100;
const pt = (p: { x: number; y: number }): PtBrut => ({ x: arrondi(p.x), y: arrondi(p.y) });

function distanceAuSegment(p: PtBrut, a: PtBrut, b: PtBrut): { d: number; t: number } {
  const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy;
  const t = l2 > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2)) : 0;
  return { d: Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy)), t };
}

/** La distance d'un point au contour d'un polygone ferme. */
function distanceAuContour(p: PtBrut, poly: readonly PtBrut[]): number {
  let d = Infinity;
  for (let i = 0; i < poly.length; i++) d = Math.min(d, distanceAuSegment(p, poly[i] as PtBrut, poly[(i + 1) % poly.length] as PtBrut).d);
  return d;
}

/** Le cote de la parcelle le plus proche d'une ligne (tous ses points), et l'abscisse de son milieu sur ce cote (0 au debut, 1 a la fin). */
function coteLePlusProche(ligne: readonly PtBrut[], parcelle: readonly PtBrut[]): { cote: number; d: number; t: number } | null {
  let meilleur: { cote: number; d: number; t: number } | null = null;
  const milieu = centroid(ligne);
  for (let i = 0; i < parcelle.length; i++) {
    const a = parcelle[i] as PtBrut, b = parcelle[(i + 1) % parcelle.length] as PtBrut;
    // L'ecart d'une ligne a un cote : le plus loin de ses points (une cloture qui part en biais n'est pas sur la limite).
    const d = Math.max(...ligne.map((p) => distanceAuSegment(p, a, b).d));
    if (!meilleur || d < meilleur.d) meilleur = { cote: i, d, t: distanceAuSegment(milieu, a, b).t };
  }
  return meilleur;
}

/** Le centre d'un objet du plan, pour les doublons. */
function centreDe(o: ObjetPlan): PtBrut {
  return o.type === 'circle' ? o.center : centroid(o.pts);
}

/** Une cle stable : la sorte, et la place arrondie au decimetre (une seconde lecture du meme objet garde sa cle et sa case). */
function cleDe(genre: string, pts: readonly PtBrut[]): string {
  const c = centroid(pts as PtBrut[]);
  return 'jardin-' + genre + '-' + Math.round(c.x * 10).toString(36) + '-' + Math.round(c.y * 10).toString(36);
}

// ---- Les regles ----------------------------------------------------------------------------------------------------------------

const CONTENUS: Readonly<Record<string, TypePlantation>> = { fleurs: 'fleurs', arbustes: 'arbustes', vivaces: 'vivaces', mixte: 'mixte' };
const TYPES_CLOTURE: Readonly<Record<string, TypeCloture>> = { grillage: 'grillage', palissade: 'palissade', mur: 'mur' };
const POINT_SEUL: ReadonlySet<string> = new Set(['arbre', 'portail', 'regard', 'eclairage', 'robinet']);
const LIGNE: ReadonlySet<string> = new Set(['haie', 'cloture', 'muret', 'bordure', 'chemin']);

/** Le meme objet est-il deja dans le plan ? Un objet de meme sorte dont le centre est a moins de `d` metres, ou qui contient ce centre. */
function dejaLa(objets: readonly ObjetPlan[], meme: (o: ObjetPlan) => boolean, c: PtBrut, d: number): boolean {
  return objets.some((o) => meme(o) && (Math.hypot(centreDe(o).x - c.x, centreDe(o).y - c.y) < d || (o.type === 'polygon' && pointInPolygon(c, o.pts))));
}

/** La sorte d'objet du plan a laquelle un genre vu se compare pour les doublons. */
function memeSorte(genre: ObservationJardin['genre']): (o: ObjetPlan) => boolean {
  switch (genre) {
    case 'arbre': return (o) => estOuvrage(o, ARBRE);
    case 'chemin': case 'bordure': return (o) => estOuvrage(o, CHEMIN);
    case 'terrasse': return (o) => estOuvrage(o, DALLE) || estOuvrage(o, TERRASSE);
    case 'piscine': return (o) => estOuvrage(o, PISCINE);
    case 'potager': case 'plate-bande': case 'haie': return (o) => estOuvrage(o, MASSIF);
    case 'regard': case 'eclairage': case 'robinet': return (o) => estOuvrage(o, EQUIPEMENT) && o.nature === genre;
    default: return () => false;
  }
}

const LIBELLES_GENRE: Readonly<Record<string, string>> = {
  arbre: 'Arbre', haie: 'Haie', cloture: 'Clôture', portail: 'Portail', muret: 'Muret', bordure: 'Bordure', chemin: 'Chemin', terrasse: 'Terrasse existante',
  piscine: 'Piscine existante', potager: 'Potager', 'plate-bande': 'Plate-bande', regard: 'Regard', eclairage: 'Éclairage', robinet: 'Robinet',
};

const m = (v: number) => (Math.round(v * 10) / 10).toString().replace('.', ',') + ' m';

/**
 * Les decisions du moteur sur une lecture du jardin : ce qu'il propose (dans l'ordre de la reponse) et ce qu'il ecarte, avec la raison.
 * Deux observations qui decrivent le meme objet n'en font qu'une (la premiere).
 */
export function decisionsDuJardin(e: EntreesJardin): { decisions: DecisionJardin[]; ecartees: EcartJardin[] } {
  const r = e.reglages;
  const decisions: DecisionJardin[] = [], ecartees: EcartJardin[] = [];
  const proposes: ObjetPlan[] = [];
  const cotesPris = new Set<string>();
  const ecarter = (o: ObservationJardin, raison: string) => { ecartees.push({ genre: o.genre, raison }); };
  for (const o of e.observations.objets) {
    const confiance = PART_CERTITUDE[o.certitude];
    if (confiance < r['jardin.ia.certitudeMin']) { ecarter(o, 'certitude trop faible'); continue; }
    const pts = o.points.map((p) => pt(versPlan(e.cadrage, p)));
    const largeur = o.etendue * e.cadrage.coteM;
    // La forme qu'exige le genre : un point, une ligne, un contour.
    if (POINT_SEUL.has(o.genre)) pts.splice(1);
    else if (LIGNE.has(o.genre) ? pts.length < 2 : pts.length < 3) { ecarter(o, 'pas assez de points pour sa forme'); continue; }
    const c = pts.length >= 3 ? centroid(pts) : { x: pts.reduce((s, p) => s + p.x, 0) / pts.length, y: pts.reduce((s, p) => s + p.y, 0) / pts.length };
    if (e.parcelle.length >= 3 && !pointInPolygon(c, e.parcelle as PtBrut[]) && distanceAuContour(c, e.parcelle) > r['jardin.ia.horsParcelleM']) { ecarter(o, 'hors de la parcelle'); continue; }
    const base = { genre: o.genre, confiance, indices: o.indices };

    // Sur la limite : la cloture de ce cote, pas un objet.
    if (o.genre === 'cloture' || o.genre === 'muret' || o.genre === 'haie' || o.genre === 'portail') {
      const proche = e.parcelle.length >= 3 ? coteLePlusProche(pts, e.parcelle) : null;
      if (proche && proche.d <= r['jardin.ia.limiteM']) {
        const cle = o.genre + ':' + proche.cote;
        const k = o.genre === 'portail' ? 'portail:' + proche.cote : 'cloture:' + proche.cote;
        if (cotesPris.has(k)) { ecarter(o, 'déjà dit pour ce côté'); continue; }
        cotesPris.add(k);
        if (o.genre === 'portail') {
          const position: PositionPortail = proche.t < 1 / 3 ? 'gauche' : proche.t > 2 / 3 ? 'droite' : 'centre';
          decisions.push({ ...base, id: 'jardin:portail:' + proche.cote, objet: 'Portail côté ' + (proche.cote + 1), apres: 'Un portail sur ce côté, vu sur la photo aérienne', effet: { type: 'portail', cote: proche.cote, position }, suppose: 'la nature (portail ou portillon) se règle ensuite dans l’inspecteur' });
          continue;
        }
        const typeCloture: TypeCloture = o.genre === 'haie' ? 'haie' : o.genre === 'muret' ? 'mur' : TYPES_CLOTURE[o.nature ?? ''] ?? 'grillage';
        const hauteurM = o.genre === 'muret' ? r['jardin.ia.hauteurMuretM'] : undefined;
        decisions.push({ ...base, id: 'jardin:' + cle, objet: 'Clôture côté ' + (proche.cote + 1), apres: (o.genre === 'muret' ? 'Muret de ' + m(hauteurM ?? 0) : o.genre === 'haie' ? 'Haie' : 'Clôture (' + typeCloture + ')') + ' sur ce côté, vu sur la photo aérienne',
          effet: { type: 'cloture', cote: proche.cote, typeCloture, ...(hauteurM !== undefined ? { hauteurM } : {}) },
          suppose: o.genre === 'cloture' && !TYPES_CLOTURE[o.nature ?? ''] ? 'nature non vue : grillage' : hauteurM === undefined ? 'la hauteur reste celle de la clôture' : 'hauteur d’un muret courant' });
        continue;
      }
      if (o.genre !== 'haie') { ecarter(o, 'pas sur une limite de la parcelle : Plan ne pose pas encore de clôture intérieure'); continue; }
    }

    if (dejaLa([...e.objets, ...proposes], memeSorte(o.genre), c, r['jardin.ia.doublonM'])) { ecarter(o, 'déjà dans le plan'); continue; }
    const key = cleDe(o.genre, pts);
    let objet: ObjetPlan | null = null, apres = '', suppose: string | null = null, nom = LIBELLES_GENRE[o.genre] ?? o.genre;

    switch (o.genre) {
      case 'arbre': {
        const a = o.arbre ?? { genre: 'indetermine' as GenreArbre, taille: null, persistant: null };
        const choix = especeDuGenre(a, e.especes);
        const espece = choix?.espece ?? null;
        const taille = a.taille ?? (espece ? tailleDe(espece).id : 'moyen');
        const hauteur = espece && tailleDe(espece).id === taille ? espece.hauteurM : HAUTEUR_DE_LA_CLASSE[taille];
        const diametre = largeur > 0.3 ? largeur : espece ? espece.diametreM * (hauteur / espece.hauteurM) : hauteur * 0.6;
        objet = {
          key, type: 'circle', name: espece?.nom ?? 'Arbre', fill: '#4a7c3a', fillOpacity: 0.85, stroke: '#2f5a26', center: pts[0] as PtBrut, r: arrondi(diametre / 2),
          showName: false, showSegNames: false, showVertNames: false, showDims: false, showAngles: false, constrained: false, fonction: 'arbre', matiere: '', priority: 3, locked: false,
          elevation: arrondi(hauteur), arbre: { diametre: arrondi(diametre), ...(espece ? { espece: espece.id } : {}) },
        } as ObjetPlan;
        nom = 'Arbre (' + (espece?.nom ?? 'sans essence') + ', ' + (TAILLES.find((t) => t.id === taille)?.libelle.split(' ')[0]?.toLowerCase() ?? taille) + ')';
        apres = 'Arbre de ' + m(hauteur) + ', houppier de ' + m(diametre);
        suppose = !espece ? 'bibliothèque d’essences vide : arbre simplifié' : choix?.exacte ? null : 'genre « ' + a.genre + ' » absent de la bibliothèque : essence la plus proche';
        break;
      }
      case 'haie': {
        const l = largeur > 0.2 ? largeur : r['jardin.ia.largeurHaieM'];
        const contour = ribbonChemin(pts, l);
        if (!contour) { ecarter(o, 'ligne trop courte'); continue; }
        // Une haie interieure : un massif a plantation `haie` (MD/spec-lecture-ia-elargie.md §3.3), un volume vert sans plantes semees.
        objet = nouveauMassif(key, contour.map(pt), { type: 'haie', source: 'ia' }, 'Haie', r['jardin.ia.hauteurHaieM']);
        apres = 'Haie de ' + m(l) + ' de large, ' + m(r['jardin.ia.hauteurHaieM']) + ' de haut';
        suppose = 'hauteur d’une haie courante';
        break;
      }
      case 'chemin': case 'bordure': {
        const l = o.genre === 'bordure' ? 0.15 : largeur > 0.2 ? largeur : r['jardin.ia.largeurCheminM'];
        objet = { key, type: 'path', name: o.genre === 'bordure' ? 'Bordure' : 'Chemin existant', fill: '#c9b896', fillOpacity: 1, stroke: '#8a7a5a', pts, vertexNames: pts.map((_, i) => 'Point ' + (i + 1)), segmentNames: pts.map((_, i) => 'Cote ' + (i + 1)), frozenVertices: pts.map(() => false),
          width: arrondi(l), curve: false, showName: false, showSegNames: false, showVertNames: false, showDims: false, showAngles: false, constrained: false, fonction: 'chemin', matiere: o.nature ?? '', priority: 2, locked: false, existant: true } as ObjetPlan;
        apres = (o.genre === 'bordure' ? 'Bordure' : 'Chemin') + ' existant de ' + m(l) + ' de large' + (o.nature ? ', ' + o.nature : '');
        suppose = largeur > 0.2 || o.genre === 'bordure' ? null : 'largeur non vue : celle d’un chemin courant';
        break;
      }
      case 'terrasse': case 'piscine': {
        if (shoelace(pts) < r['jardin.ia.surfaceMinM2']) { ecarter(o, 'trop petit'); continue; }
        const piscine = o.genre === 'piscine';
        objet = { key, type: 'polygon', name: LIBELLES_GENRE[o.genre], fill: piscine ? '#5bc8f5' : '#b08a62', fillOpacity: 1, stroke: piscine ? '#0a3d5c' : '#6b4f2e', pts, vertexNames: pts.map((_, i) => 'Point ' + (i + 1)), segmentNames: pts.map((_, i) => 'Cote ' + (i + 1)), frozenVertices: pts.map(() => false),
          showName: false, showSegNames: false, showVertNames: false, showDims: false, showAngles: false, constrained: false, fonction: piscine ? 'piscine' : 'dalle', matiere: o.nature ?? '', priority: piscine ? 3 : 1, locked: false, existant: true } as ObjetPlan;
        apres = LIBELLES_GENRE[o.genre] + ' de ' + (Math.round(shoelace(pts) * 10) / 10).toString().replace('.', ',') + ' m², ni chiffrée ni déclarée';
        break;
      }
      case 'potager': case 'plate-bande': {
        if (shoelace(pts) < r['jardin.ia.surfaceMinM2']) { ecarter(o, 'trop petit'); continue; }
        const contenu: TypePlantation = o.genre === 'potager' ? 'potager' : CONTENUS[o.nature ?? ''] ?? 'mixte';
        objet = nouveauMassif(key, pts, { type: contenu, forme: 'plate-bande', source: 'ia' });
        apres = (o.genre === 'potager' ? 'Potager' : 'Plate-bande (' + contenu + ')') + ' de ' + (Math.round(shoelace(pts) * 10) / 10).toString().replace('.', ',') + ' m², plantes en 3D';
        suppose = o.genre === 'plate-bande' && !CONTENUS[o.nature ?? ''] ? 'plantes non vues : mixte' : null;
        break;
      }
      case 'regard': case 'eclairage': case 'robinet': {
        objet = nouvelEquipement(key, pts[0] as PtBrut, o.genre);
        apres = o.genre === 'regard' ? 'Regard de 60 × 60 cm, au ras du sol' : o.genre === 'eclairage' ? 'Borne d’éclairage' : 'Point d’eau';
        break;
      }
      default: ecarter(o, 'sorte inconnue'); continue;
    }
    proposes.push(objet);
    decisions.push({ ...base, id: 'jardin:' + key, objet: nom, apres, effet: { type: 'objet', objet }, suppose });
  }
  return { decisions, ecartees };
}

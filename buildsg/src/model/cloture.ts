// La cloture de la parcelle, cote par cote, et ses acces (MD/spec-cloture.md §2).
//
// Seul endroit qui connait les valeurs par defaut. Tout ce qui lit une cloture passe par
// `clotureDe` : elle rend toujours une structure complete, construite au besoin des quatre anciens
// champs de la parcelle (`clotureActive`, `clotureHauteur`, `clotureCouleur`, `clotureTexture`),
// qui restent ecrits et tenus a jour pour les lecteurs qui ne connaissent qu'eux.
//
// Rien ici ne connait le contour autrement que par la longueur de ses cotes : la geometrie d'un
// cote (son repere gauche-droite vu de dehors) vit dans `facade/geometrie.ts`, au-dessus.

import { dist } from '../geometry/basic.js';
import { sommetDe } from '../geometry/anneau.js';
import { au } from '../util/tableaux.js';
import type {
  Cloture, CoteCloture, ReglageCloture, TypeCloture, ParementMur, EssenceHaie, Portail,
  FormePortail, OuverturePortail, RemplissagePortail, MateriauPortail, ObjetPlan, PtBrut,
} from './types.js';

export const COULEUR_CLOTURE_DEFAUT = '#6b4a2a';
export const HAUTEUR_CLOTURE_DEFAUT = 1.8;

/** Couleur et hauteur propres a chaque type, quand on y passe sans en avoir choisi. */
export const DEFAUTS_PAR_TYPE: Record<TypeCloture, Pick<ReglageCloture, 'hauteur' | 'couleur' | 'epaisseur'>> = {
  aucune: { hauteur: 0, couleur: COULEUR_CLOTURE_DEFAUT },
  palissade: { hauteur: 1.8, couleur: COULEUR_CLOTURE_DEFAUT },
  grillage: { hauteur: 1.5, couleur: '#6f7378' },
  haie: { hauteur: 1.8, couleur: '#4f7a3a', epaisseur: 0.6 },
  mur: { hauteur: 1.8, couleur: '#d9d2c3', epaisseur: 0.2 },
};

export const LIBELLES_TYPE_CLOTURE: Record<TypeCloture, string> = {
  aucune: 'Aucune', palissade: 'Palissade bois', grillage: 'Grillage', haie: 'Haie', mur: 'Mur',
};
export const LIBELLES_PAREMENT: Record<ParementMur, string> = {
  enduit: 'Enduit', pierre: 'Pierre', brique: 'Brique', parpaing: 'Parpaing brut', bardage: 'Bardage',
};
export const LIBELLES_ESSENCE: Record<EssenceHaie, string> = {
  laurier: 'Laurier', thuya: 'Thuya', charme: 'Charme', photinia: 'Photinia', troene: 'Troène', champetre: 'Champêtre mélangée',
};
export const LIBELLES_FORME_PORTAIL: Record<FormePortail, string> = {
  droit: 'Droit', 'chapeau-de-gendarme': 'Chapeau de gendarme', 'chapeau-inverse': 'Chapeau de gendarme inversé', bombe: 'Bombé', concave: 'Concave',
};
export const LIBELLES_OUVERTURE_PORTAIL: Record<OuverturePortail, string> = {
  'battant-1': 'Un battant', 'battant-2': 'Deux battants', coulissant: 'Coulissant',
};
export const LIBELLES_REMPLISSAGE: Record<RemplissagePortail, string> = {
  plein: 'Plein', ajoure: 'Ajouré', semi: 'Semi-ajouré',
};
export const LIBELLES_MATERIAU_PORTAIL: Record<MateriauPortail, string> = {
  aluminium: 'Aluminium', pvc: 'PVC', bois: 'Bois', fer: 'Fer forgé',
};

/** La couleur qu'un materiau de portail donne quand on y passe. */
export const COULEUR_PAR_MATERIAU: Record<MateriauPortail, string> = {
  aluminium: '#2f3237', pvc: '#f2f0ea', bois: '#8a5a2b', fer: '#1f1f1f',
};

const EPAISSEUR_PALISSADE = 0.05;
const EPAISSEUR_GRILLAGE = 0.02;

/** L'epaisseur qu'un troncon occupe, en metres : celle du reglage pour une haie ou un mur. */
export function epaisseurDe(r: ReglageCloture): number {
  switch (r.type) {
    case 'haie': return r.epaisseur ?? 0.6;
    case 'mur': return r.epaisseur ?? 0.2;
    case 'grillage': return EPAISSEUR_GRILLAGE;
    case 'palissade': return EPAISSEUR_PALISSADE;
    default: return 0;
  }
}

/** Hauteur totale d'un troncon : la cloture et son soubassement. */
export function hauteurTotale(r: ReglageCloture): number {
  if (r.type === 'aucune') return 0;
  return Math.max(0, r.hauteur) + (r.soubassement ? Math.max(0, r.soubassement.hauteur) : 0);
}

/** Le reglage par defaut tel qu'il se deduit des anciens champs d'une parcelle. */
function defautDesAnciensChamps(p: ObjetPlan): ReglageCloture {
  return {
    type: 'palissade',
    hauteur: Math.max(0.1, p.clotureHauteur || HAUTEUR_CLOTURE_DEFAUT),
    couleur: p.clotureCouleur || COULEUR_CLOTURE_DEFAUT,
    texture: p.clotureTexture || null,
  };
}

/**
 * La cloture de la parcelle, complete. Sans `cloture`, elle se construit des anciens champs ; avec
 * `creer`, elle est posee sur la parcelle pour etre ecrite - a n'appeler qu'avant une ecriture, pour
 * qu'un projet seulement consulte garde sa forme d'avant.
 */
export function clotureDe(p: ObjetPlan, creer = false): Cloture {
  if (p.cloture) {
    p.cloture.cotes = p.cloture.cotes || [];
    p.cloture.portails = p.cloture.portails || [];
    return p.cloture;
  }
  const cl: Cloture = { active: !!p.clotureActive, defaut: defautDesAnciensChamps(p), cotes: [], portails: [] };
  if (creer) p.cloture = cl;
  return cl;
}

/** Les anciens champs suivent `active` et le defaut : un lecteur ancien y retrouve sa cloture. */
export function synchroniserAnciensChamps(p: ObjetPlan): void {
  const cl = p.cloture;
  if (!cl) return;
  p.clotureActive = cl.active;
  p.clotureHauteur = cl.defaut.hauteur;
  p.clotureCouleur = cl.defaut.couleur || COULEUR_CLOTURE_DEFAUT;
  p.clotureTexture = cl.defaut.texture || null;
}

/** Le reglage d'un cote : le sien s'il est regle a part, sinon le defaut. */
export function reglageDuCote(cl: Cloture, cote: number): ReglageCloture {
  return cl.cotes.find(c => c.cote === cote) || cl.defaut;
}

/** L'entree propre d'un cote, s'il en a une. */
export function coteRegle(cl: Cloture, cote: number): CoteCloture | undefined {
  return cl.cotes.find(c => c.cote === cote);
}

/** Donne au cote son reglage propre, copie du defaut, et le rend. */
export function reglerCote(cl: Cloture, cote: number): CoteCloture {
  const existant = coteRegle(cl, cote);
  if (existant) return existant;
  const c: CoteCloture = { ...JSON.parse(JSON.stringify(cl.defaut)), cote };
  cl.cotes.push(c);
  cl.cotes.sort((a, b) => a.cote - b.cote);
  return c;
}

/** Le cote revient au defaut. */
export function retirerCote(cl: Cloture, cote: number): void {
  cl.cotes = cl.cotes.filter(c => c.cote !== cote);
}

/**
 * Change le type d'un reglage. La hauteur, la couleur et l'epaisseur suivent le nouveau type quand
 * elles etaient celles de l'ancien : on ne garde pas le vert d'une haie sur un mur par inadvertance,
 * mais on respecte une couleur choisie.
 */
export function changerType(r: ReglageCloture, type: TypeCloture): void {
  const avant = DEFAUTS_PAR_TYPE[r.type];
  const apres = DEFAUTS_PAR_TYPE[type];
  if (r.hauteur === avant.hauteur || !(r.hauteur > 0)) r.hauteur = apres.hauteur || r.hauteur;
  if (!r.couleur || r.couleur === avant.couleur) r.couleur = apres.couleur || COULEUR_CLOTURE_DEFAUT;
  if (r.epaisseur === undefined || r.epaisseur === avant.epaisseur) {
    if (apres.epaisseur !== undefined) r.epaisseur = apres.epaisseur; else delete r.epaisseur;
  }
  r.type = type;
  if (type === 'mur') r.soubassement = null;
}

/** Longueur d'un cote du contour, en metres. */
export function longueurDuCote(pts: readonly PtBrut[], cote: number): number {
  if (pts.length < 2) return 0;
  return dist(au(pts, cote), sommetDe(pts, cote + 1));
}

/** Les cotes qu'un contour a vraiment : une entree qui pointe plus loin est ignoree, pas effacee. */
export function coteValide(pts: readonly PtBrut[], cote: number): boolean {
  return Number.isInteger(cote) && cote >= 0 && cote < pts.length;
}

/** Un portail neuf, ou un portillon, au milieu du cote. */
export function nouveauPortail(nature: Portail['nature'], cote: number, longueurCote: number): Portail {
  const largeur = nature === 'portail' ? 3.5 : 1;
  return {
    nature,
    cote,
    x: Math.max(0, (longueurCote - largeur) / 2),
    largeur,
    hauteur: 1.6,
    ouverture: nature === 'portail' ? 'battant-2' : 'battant-1',
    sens: 'interieur',
    refoulement: 'droite',
    petitVantail: 'aucun',
    forme: 'droit',
    fleche: 0.3,
    remplissage: 'plein',
    materiau: 'aluminium',
    couleur: COULEUR_PAR_MATERIAU.aluminium,
    texture: null,
    piliers: { largeur: 0.3, hauteur: 1.8, parement: 'enduit', chapeau: true },
    retrait: 0,
    motorise: nature === 'portail',
  };
}

/**
 * Le cote ou poser un acces quand on n'en a pas choisi : celui qui est sur rue, sinon le plus long.
 */
export function coteDAcces(cl: Cloture, pts: readonly PtBrut[]): number {
  const rue = cl.cotes.find(c => c.limite === 'rue' && coteValide(pts, c.cote));
  if (rue) return rue.cote;
  let meilleur = 0, max = -1;
  for (let i = 0; i < pts.length; i++) {
    const l = longueurDuCote(pts, i);
    if (l > max) { max = l; meilleur = i; }
  }
  return meilleur;
}

/** Les acces d'un cote, valides sur ce contour, de gauche a droite. */
export function accesDuCote(cl: Cloture, cote: number): Portail[] {
  return cl.portails.filter(a => a.cote === cote).sort((a, b) => a.x - b.x);
}

/** Un troncon de cloture entre deux acces, en abscisses le long du cote (metres depuis la gauche). */
export interface Troncon { debut: number; fin: number }

/** La largeur que l'acces occupe dans la cloture : le passage et ses deux piliers. */
export function empriseAcces(a: Portail): { debut: number; fin: number } {
  const pilier = a.piliers ? a.piliers.largeur : 0;
  return { debut: a.x - pilier, fin: a.x + a.largeur + pilier };
}

/**
 * Les troncons de cloture d'un cote : ce qui reste entre les acces. Un acces hors du cote est tronque
 * a lui ; deux acces qui se chevauchent n'en font qu'une coupure.
 */
export function tronconsDuCote(cl: Cloture, cote: number, longueur: number): Troncon[] {
  const coupures = accesDuCote(cl, cote)
    .map(empriseAcces)
    .map(e => ({ debut: Math.max(0, e.debut), fin: Math.min(longueur, e.fin) }))
    .filter(e => e.fin > e.debut);
  const troncons: Troncon[] = [];
  let curseur = 0;
  for (const c of coupures) {
    if (c.debut > curseur + 0.005) troncons.push({ debut: curseur, fin: c.debut });
    curseur = Math.max(curseur, c.fin);
  }
  if (longueur > curseur + 0.005) troncons.push({ debut: curseur, fin: longueur });
  return troncons;
}

/** La largeur de chaque vantail, de gauche a droite. */
export function vantauxDe(a: Portail): number[] {
  if (a.ouverture !== 'battant-2') return [a.largeur];
  const tiers = a.largeur / 3;
  if (a.petitVantail === 'gauche') return [tiers, a.largeur - tiers];
  if (a.petitVantail === 'droite') return [a.largeur - tiers, tiers];
  return [a.largeur / 2, a.largeur / 2];
}

/**
 * Le profil d'un vantail dans le plan de la cloture, en metres depuis son coin bas gauche : un
 * rectangle dont le haut suit la forme. La courbe est echantillonnee sur `pas` points, du bas vers le
 * haut en passant par la droite, pour que la 3D et le plan la triangulent sans se poser de question.
 * `position` dit ou le vantail est dans l'acces (0 a gauche, 1 a droite), pour qu'une forme en
 * chapeau de gendarme se partage entre deux battants comme sur un seul.
 */
export function profilDuVantail(a: Portail, largeur: number, debut: number, pas = 12): PtBrut[] {
  const L = a.largeur || 1;
  const haut = (x: number): number => {
    const t = Math.min(1, Math.max(0, (debut + x) / L));
    const f = Math.max(0, a.fleche);
    switch (a.forme) {
      case 'chapeau-de-gendarme': return a.hauteur + f * Math.sin(Math.PI * t);
      case 'chapeau-inverse': return a.hauteur + f - f * Math.sin(Math.PI * t);
      case 'bombe': return a.hauteur + f * Math.sin(Math.PI * t) * 0.5 + f * 0.5 * (1 - Math.abs(2 * t - 1));
      case 'concave': return a.hauteur + f * Math.abs(2 * t - 1);
      default: return a.hauteur;
    }
  };
  const pts: PtBrut[] = [{ x: 0, y: 0 }, { x: largeur, y: 0 }];
  if (a.forme === 'droit') {
    pts.push({ x: largeur, y: a.hauteur }, { x: 0, y: a.hauteur });
    return pts;
  }
  for (let i = 0; i <= pas; i++) {
    const x = largeur - (largeur * i) / pas;
    pts.push({ x, y: haut(x) });
  }
  return pts;
}

/** Ce qui ne va pas dans un acces, en phrases pour l'inspecteur ; vide quand tout va. */
export function alertesAcces(cl: Cloture, a: Portail, longueur: number): string[] {
  const alertes: string[] = [];
  const nom = a.nature === 'portail' ? 'Le portail' : 'Le portillon';
  const e = empriseAcces(a);
  if (e.debut < -0.005 || e.fin > longueur + 0.005) alertes.push(`${nom} dépasse le côté (${longueur.toFixed(2).replace('.', ',')} m) : il est tronqué sur le plan et en 3D.`);
  if (a.ouverture === 'coulissant') {
    const place = a.refoulement === 'gauche' ? e.debut : longueur - e.fin;
    const autres = accesDuCote(cl, a.cote).filter(o => o !== a);
    const gene = autres.some(o => (a.refoulement === 'gauche' ? empriseAcces(o).fin > e.debut - a.largeur && empriseAcces(o).debut < e.debut : empriseAcces(o).debut < e.fin + a.largeur && empriseAcces(o).fin > e.fin));
    if (place < a.largeur - 0.005 || gene) alertes.push(`${nom} coulissant n'a pas la place de se ranger ${a.refoulement === 'gauche' ? 'à gauche' : 'à droite'} : il lui faut ${a.largeur.toFixed(2).replace('.', ',')} m de clôture libre.`);
  }
  const limite = coteRegle(cl, a.cote)?.limite;
  if (a.ouverture !== 'coulissant' && a.sens === 'exterieur' && limite === 'rue') alertes.push(`${nom} s'ouvre vers la rue : c'est en général interdit par le règlement de voirie.`);
  return alertes;
}

/** Les cotes qui depassent la hauteur maximale de leur limite, en phrases. */
export function alertesHauteur(cl: Cloture, nbCotes: number): string[] {
  const alertes: string[] = [];
  for (let i = 0; i < nbCotes; i++) {
    const c = coteRegle(cl, i);
    const r = c || cl.defaut;
    const limite = c?.limite;
    const max = limite === 'rue' ? cl.hauteurMaxRue : limite === 'separative' ? cl.hauteurMaxSeparative : undefined;
    if (max === undefined || !(max > 0)) continue;
    const h = hauteurTotale(r);
    if (h > max + 0.005) alertes.push(`Le côté ${i + 1} (${h.toFixed(2).replace('.', ',')} m) dépasse la hauteur maximale ${limite === 'rue' ? 'sur rue' : 'en limite séparative'} (${max.toFixed(2).replace('.', ',')} m).`);
  }
  return alertes;
}

/**
 * Colle un portillon contre le portail le plus proche du meme cote, a sa gauche ou a sa droite, les
 * piliers se touchant. `false` s'il n'y a pas de portail sur ce cote.
 */
export function accolerPortillon(cl: Cloture, portillon: Portail, de: 'gauche' | 'droite'): boolean {
  const portails = accesDuCote(cl, portillon.cote).filter(a => a.nature === 'portail');
  if (!portails.length) return false;
  const centre = portillon.x + portillon.largeur / 2;
  const proche = portails.reduce((m, a) => (Math.abs(a.x + a.largeur / 2 - centre) < Math.abs(m.x + m.largeur / 2 - centre) ? a : m));
  const e = empriseAcces(proche);
  const pilier = portillon.piliers ? portillon.piliers.largeur : 0;
  portillon.x = de === 'gauche' ? e.debut - pilier - portillon.largeur : e.fin + pilier;
  return true;
}

/**
 * Pose un acces sur un cote, centre sur un point du plan : `gauche` et `droite` sont les bouts du
 * cote vus de dehors, `p` le point clique. L'acces reste dans le cote, piliers compris.
 */
export function poserAcces(a: Portail, cote: { cote: number; gauche: PtBrut; droite: PtBrut; largeur: number }, p: PtBrut): void {
  const L = cote.largeur || 1;
  const ux = (cote.droite.x - cote.gauche.x) / L, uy = (cote.droite.y - cote.gauche.y) / L;
  const centre = (p.x - cote.gauche.x) * ux + (p.y - cote.gauche.y) * uy;
  const pilier = a.piliers ? a.piliers.largeur : 0;
  const min = pilier, max = Math.max(min, L - a.largeur - pilier);
  a.cote = cote.cote;
  a.x = Math.round(Math.min(max, Math.max(min, centre - a.largeur / 2)) * 100) / 100;
}

/** Le cote du contour le plus proche d'un point, et la distance qui l'en separe, en metres. */
export function coteLePlusProche(pts: readonly PtBrut[], p: PtBrut): { cote: number; distance: number } {
  let meilleur = { cote: -1, distance: Infinity };
  for (let i = 0; i < pts.length; i++) {
    const a = au(pts, i), b = sommetDe(pts, i + 1);
    const dx = b.x - a.x, dy = b.y - a.y;
    const l2 = dx * dx + dy * dy;
    const t = l2 > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2)) : 0;
    const d = Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t));
    if (d < meilleur.distance) meilleur = { cote: i, distance: d };
  }
  return meilleur;
}

/** Un resume d'un reglage pour la ligne d'un cote : « Mur 1,80 m · enduit ». */
export function resumeReglage(r: ReglageCloture): string {
  if (r.type === 'aucune') return 'Aucune';
  const m = (v: number) => v.toFixed(2).replace('.', ',') + ' m';
  const detail = r.type === 'mur' ? LIBELLES_PAREMENT[r.parement || 'enduit'].toLowerCase()
    : r.type === 'haie' ? LIBELLES_ESSENCE[r.essence || 'laurier'].toLowerCase()
    : r.type === 'grillage' ? (r.grillage || 'rigide')
    : (r.lames || 'verticales');
  const sous = r.soubassement ? ` · muret ${m(r.soubassement.hauteur)}` : '';
  return `${LIBELLES_TYPE_CLOTURE[r.type]} ${m(r.hauteur)} · ${detail}${sous}`;
}

/** « Portail 3,50 m · à 4,20 m ». */
export function resumeAcces(a: Portail): string {
  const m = (v: number) => v.toFixed(2).replace('.', ',') + ' m';
  return `${a.nature === 'portail' ? 'Portail' : 'Portillon'} ${m(a.largeur)} · ${LIBELLES_OUVERTURE_PORTAIL[a.ouverture].toLowerCase()} · à ${m(a.x)}`;
}

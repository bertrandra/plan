// La liste de controle de l'audit de la parcelle (MD/spec-audit.md §12.1) : ce qu'il y a a capturer
// sur la parcelle du projet, et ce qui reste.
//
// Pur : elle se recalcule a chaque geste depuis les objets du plan et la capture en cours. Les
// batiments de la parcelle sont ceux que l'import y a poses (`surParcellePrincipale`) ou dont le
// centre y tombe (un batiment dessine a la main).
//
// Les maisons des parcelles voisines n'en font plus partie (demande de l'utilisateur du 15 octobre,
// apres l'essai d'AE 101 : 7 batiments et 33 facades, dont 19 chez les voisins). Elles restent dans
// la scene, comme obstacles a la vue et comme voisinage, mais ni la liste, ni la reconnaissance, ni
// l'analyse de Claude ne les regardent.
//
// Une facade collee a un autre batiment, ou posee sur la limite d'une parcelle voisine, est
// « mitoyenne » : rien a photographier. Un bout de mur de moins de MUR_COURT_M (un decroche) n'est
// pas une facade : il est sur la photo du mur qu'il decroche.

import { centroid, pointInPolygon } from '../../../geometry/basic.js';
import { distancePointContour } from '../../../geometry/proximite.js';
import { facadesDuContour, pointDeFacade, type Facade } from '../../../facade/geometrie.js';
import { hauteursMursCorps } from '../../../facade/toits/toitCorps.js';
import { distancePointSegment } from '../../../geometry/segments.js';
import { sommetDe } from '../../../geometry/anneau.js';
import { au } from '../../../util/tableaux.js';
import { elevationOf } from '../../../engine/hauteurs.js';
import { aDesSommets } from '../../../model/formes.js';
import { estBatiment, parcelleDuProjet, surParcelleDuProjet } from '../../../model/fonctions.js';
import { partieVue, resumePartie, etatCheminees, type PartieVue } from '../../../model/ceQueJeVois.js';
import { batimentVide, type BatimentCapture, type CaptureParcelle } from '../../../model/auditParcelle.js';
import type { ObjetPlan, PtBrut } from '../../../model/types.js';

/** Deux murs a moins de cela l'un de l'autre sont colles : un mur mitoyen. */
const COLLE_M = 0.3;
/** Un mur a moins de cela de la limite y est pose. */
const SUR_LA_LIMITE_M = 0.6;
/** Ou l'on regarde ce qu'il y a devant un mur : un pas devant son milieu. */
const DEVANT_M = 1.5;
/** On cherche jusque-la ce qu'il y a devant le mur : au-dela de son propre jardin, on ne le photographie plus. */
const PORTEE_VUE_M = 25;
/** Un mur est colle quand au moins cette part de sa longueur touche un autre batiment. */
const PART_COLLEE = 0.5;
/** Plus court, un mur est un decroche : il se photographie avec le mur voisin, pas seul. */
export const MUR_COURT_M = 1.5;
/** Un mur de corps a moins de cela du milieu de la facade est ce mur-la (comme facade/ouvertures.ts). */
const MUR_PROCHE_M = 0.8;
/** Un toit plat : moins de cela entre le faitage et l'egout le plus haut (spec-regles-toits §2.7). */
const MONTEE_PLATE_M = 0.3;

export type StatutFacade = 'aPhotographier' | 'photographiee' | 'inaccessible' | 'mitoyenne';
/** Ce qu'il y a devant le mur : la parcelle du projet, la rue (aucune parcelle), un autre voisin. */
export type Situation = 'mitoyenne' | 'parcelle' | 'rue' | 'voisin';

/** Un morceau du haut d'un mur : de `de` a `a` metres depuis sa gauche (vue de dehors), a `h` metres. */
export interface MorceauMur { de: number; a: number; h: number }

export interface LigneFacade {
  cote: number;
  facade: Facade;
  /**
   * La hauteur du mur jusque sous le toit, corps compris (l'etage d'AE 101 montait au-dessus du
   * prisme, et le voile de la Vue 3D s'arretait au rez-de-chaussee) : pour le surlignage et le plan
   * de prise. La geometrie de `facade` ne change pas : c'est elle que l'analyse mesure.
   */
  hauteurMur: number;
  /** Le haut du mur par morceaux, de gauche a droite (`de` et `a` en metres le long du mur) : une aile basse, puis l'etage. */
  profilMur: MorceauMur[];
  statut: StatutFacade;
  photos: number;
  /** « Façade sud · 9,2 m » */
  libelle: string;
}

/**
 * Le nom d'un mur pour Claude : son orientation, avec le numero de son cote dans le polygone
 * (« est (côté 3) », comme « Côté 3 » de l'inspecteur) quand le batiment a plusieurs murs de meme
 * orientation. Le vote regroupe les reponses par etiquette : deux murs sous un meme nom n'auraient
 * qu'une voix, et leurs ouvertures se confondraient (rejeu d'AE 101 : trois murs « est »).
 */
export function etiquetteFacade(b: LigneBatiment, f: LigneFacade): string {
  const o = f.facade.orientation.toLowerCase();
  return b.facades.filter((x) => x.facade.orientation.toLowerCase() === o).length > 1 ? o + ' (côté ' + (f.cote + 1) + ')' : o;
}

export interface LignePartie {
  partie: PartieVue;
  vu: boolean;
  /** « À voir », « Vu », « Aucune », « Vues » : le statut de la ligne (§12.1). */
  statut: string;
  resume: string;
}

export interface LigneBatiment {
  cle: string;
  nom: string;
  mitoyen: boolean;
  facades: LigneFacade[];
  parties: LignePartie[];
  photosToit: number;
}

/**
 * Une ligne de « Ce qui manque ». La cle est l'identite de ce qui manque (batiment et cote pour une
 * facade), pas son texte : deux facades de meme orientation donnent le meme texte, et React exige
 * une cle unique par ligne.
 */
export interface Manque {
  cle: string;
  texte: string;
}

export interface ListeDeControle {
  batiments: LigneBatiment[];
  cloture: { faite: boolean; resume: string };
  portail: { faite: boolean; resume: string };
  facadesPhotographiees: number;
  facadesAPrendre: number;
  /** « 7 façades sur 9, toit vu, clôture à faire » */
  compteur: string;
  /** Ce qui manque, sans bloquer (§12.3) : « façade nord de Maison : pas de photo ». */
  manques: Manque[];
  /** « Lancer l'analyse » est propose des qu'une facade est photographiee (§12.3). */
  peutLancer: boolean;
}

type Batiment = ObjetPlan & { pts: PtBrut[] };

/** Un batiment de la parcelle : pose par l'import, ou dont le centre tombe dans la parcelle. */
function surLaParcelle(o: Batiment, parcelle: ObjetPlan | undefined): boolean {
  if (surParcelleDuProjet(o)) return true;
  return !!parcelle && aDesSommets(parcelle) && !o.voisinage && pointInPolygon(centroid(o.pts), parcelle.pts);
}

/**
 * Les batiments de l'audit : ceux de la parcelle du projet, et eux seuls. `mitoyen` vaut toujours
 * faux : le champ reste, le fichier de l'audit (§15) le porte depuis ses premieres versions.
 */
export function batimentsAudites(objets: readonly ObjetPlan[]): { o: Batiment; mitoyen: boolean }[] {
  const parcelle = parcelleDuProjet(objets as ObjetPlan[]);
  const batis = objets.filter((o): o is Batiment => estBatiment(o) && aDesSommets(o));
  return batis.filter((o) => surLaParcelle(o, parcelle)).map((o) => ({ o, mitoyen: false }));
}

/** Ce qui est devant un mur, et s'il est colle a un autre batiment ou pose sur une limite voisine. */
export function situationFacade(f: Facade, cle: string, objets: readonly ObjetPlan[]): Situation {
  const autres = objets.filter((o): o is Batiment => o.key !== cle && estBatiment(o) && aDesSommets(o));
  const n = 10;
  let colles = 0;
  for (let k = 0; k <= n; k++) {
    const p = pointDeFacade(f, (f.largeur * k) / n);
    if (autres.some((b) => distancePointContour(p, b.pts) < COLLE_M)) colles++;
  }
  if (colles / (n + 1) >= PART_COLLEE) return 'mitoyenne';
  const milieu = pointDeFacade(f, f.largeur / 2);
  const parcelle = parcelleDuProjet(objets as ObjetPlan[]);
  const terrains = objets.filter((o): o is ObjetPlan & { pts: PtBrut[] } => (o === parcelle || o.fonction === 'terrain') && aDesSommets(o));
  const sous = (p: PtBrut) => terrains.find((t) => pointInPolygon(p, t.pts));
  const batiment = objets.find((o) => o.key === cle);
  const chezLui = batiment && aDesSommets(batiment) ? sous(centroid(batiment.pts)) : undefined;
  // On s'eloigne du mur, droit devant : le jardin du batiment lui-meme ne dit rien, c'est ce qu'on
  // trouve au-dela qui compte (la parcelle du projet, la rue, un autre voisin).
  for (let d = DEVANT_M; d <= PORTEE_VUE_M; d += 1) {
    const t = sous({ x: milieu.x + f.normale.x * d, y: milieu.y + f.normale.y * d });
    if (t && t === parcelle) return 'parcelle';
    if (!t) return 'rue';
    if (t === chezLui) continue;
    // Pose sur la limite de la parcelle du projet et tourne vers la voisine : un mur mitoyen.
    if (d === DEVANT_M && parcelle && aDesSommets(parcelle) && distancePointContour(milieu, parcelle.pts) < SUR_LA_LIMITE_M) return 'mitoyenne';
    return 'voisin';
  }
  return 'voisin';
}

/** Un mur de corps fait face a la facade quand l'angle entre eux a un cosinus au moins de cela (25 degres). */
const PARALLELE_MIN = 0.9;
/** Un point de la facade un peu au-dela du bout d'un mur de corps compte encore pour lui (arrondis du contour). */
const BOUT_M = 0.1;
/** Un morceau plus court n'est pas un mur a part. */
const MORCEAU_MIN_M = 0.75;
/** Le haut du mur est lu tous les tant de metres le long de la facade. */
const PAS_PROFIL_M = 0.25;

/**
 * La hauteur du mur sous le toit au point `p` de la facade : celle du mur de corps qui passe la
 * (l'egout de son pan, ou le bas d'un pignon : le triangle n'est pas compte), la plus haute s'il y en
 * a plusieurs ; sinon le prisme.
 */
function hauteurAuPoint(o: ObjetPlan, f: Facade, p: PtBrut, prisme: number): number {
  let h = prisme;
  const ux = (f.droite.x - f.gauche.x) / (f.largeur || 1), uy = (f.droite.y - f.gauche.y) / (f.largeur || 1);
  for (const c of o.corpsToit ?? []) {
    const murs = hauteursMursCorps(c);
    c.pts.forEach((a, i) => {
      const b = sommetDe(c.pts, i + 1), l = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      // Seul compte un mur du corps parallele a la facade : pres d'un coin, le mur voisin passe aussi a moins de 0,8 m.
      if (Math.abs(((b.x - a.x) * ux + (b.y - a.y) * uy) / l) < PARALLELE_MIN) return;
      // Le point doit tomber le long du mur du corps (pas au-dela de son bout), et pres de lui.
      const le = ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / l;
      if (le < -BOUT_M || le > l + BOUT_M) return;
      if (distancePointSegment(p, a, b) < MUR_PROCHE_M) h = Math.max(h, murs[i] ?? h);
    });
  }
  return h;
}

/** Le haut du mur par morceaux, lu le long de la facade (un peu en retrait des coins). */
export function profilMurSousToit(o: ObjetPlan, f: Facade): MorceauMur[] {
  const n = Math.max(1, Math.ceil(f.largeur / PAS_PROFIL_M));
  const out: MorceauMur[] = [];
  for (let k = 0; k < n; k++) {
    const de = (f.largeur * k) / n, a = (f.largeur * (k + 1)) / n;
    const h = hauteurAuPoint(o, f, pointDeFacade(f, (de + a) / 2), f.hauteur);
    const dernier = out[out.length - 1];
    if (dernier && Math.abs(dernier.h - h) < 0.05) dernier.a = a;
    else out.push({ de, a, h });
  }
  // Un bout de moins de MORCEAU_MIN_M est l'angle d'un corps voisin (AE 101 : 24 cm a 5,9 m au coin
  // de la facade sud) : il prend la hauteur du morceau le plus long a cote de lui.
  const court = () => out.findIndex((m) => m.a - m.de < MORCEAU_MIN_M);
  for (let i = court(); out.length > 1 && i >= 0; i = court()) {
    const m = au(out, i);
    const g = i > 0 ? au(out, i - 1) : null, d = i < out.length - 1 ? au(out, i + 1) : null;
    if (g && (!d || g.a - g.de >= d.a - d.de)) g.a = m.a; else if (d) d.de = m.de;
    out.splice(i, 1);
  }
  // Deux voisins devenus de meme hauteur ne font plus qu'un.
  const net: MorceauMur[] = [];
  for (const m of out) {
    const dernier = net[net.length - 1];
    if (dernier && Math.abs(dernier.h - m.h) < 0.05) dernier.a = m.a; else net.push({ ...m });
  }
  return net;
}

/** Sans corps de toit lu, le haut du pignon ou du pan est a cette part de plus que le mur sous le toit. */
const PART_TOIT_SANS_CORPS = 1.35;

/**
 * Le haut du pignon ou du pan de cette facade, au-dessus du sol : le faitage le plus haut des corps
 * de toit dont un mur longe la facade (deux sommets a moins de MUR_PROCHE_M d'elle) ; sans corps, le
 * mur sous le toit majore. C'est ce que le rendu pour Claude doit faire tenir en entier dans l'image.
 */
export function hauteurHautDeFacade(o: ObjetPlan, f: Facade, hauteurMur: number): number {
  const longe = (c: { pts: PtBrut[] }) => c.pts.filter((q) => distancePointSegment(q, f.gauche, f.droite) < MUR_PROCHE_M).length >= 2;
  const faitages = (o.corpsToit ?? []).filter(longe).map((c) => c.faitage);
  return Math.max(hauteurMur + 0.5, ...faitages, faitages.length ? 0 : hauteurMur * PART_TOIT_SANS_CORPS);
}

/** La hauteur du mur sous le toit : le plus haut de ses morceaux (etage compris). */
export function hauteurMurSousToit(o: ObjetPlan, f: Facade): number {
  return Math.max(f.hauteur, ...profilMurSousToit(o, f).map((m) => m.h));
}

/** Le statut d'une facade : mitoyenne, puis photographiee (une photo l'emporte sur tout), puis inaccessible. */
export function statutFacade(situation: Situation, mitoyen: boolean, photos: number, inaccessible: boolean | undefined): StatutFacade {
  if (situation === 'mitoyenne') return 'mitoyenne';
  if (photos > 0) return 'photographiee';
  const suppose = mitoyen && situation === 'voisin';
  return (inaccessible ?? suppose) ? 'inaccessible' : 'aPhotographier';
}

const metres = (v: number) => (Math.round(v * 10) / 10).toFixed(1).replace('.', ',') + ' m';

/** Le batiment a-t-il une toiture-terrasse : un toit plat, un corps plat, ou une forme vue plate. */
export function aUnToitPlat(o: ObjetPlan, b: BatimentCapture): boolean {
  if (o.toit?.forme === 'plat' || b.vu.forme === 'plat' || b.vu.terrasse) return true;
  return (o.corpsToit ?? []).some((c) => !!c.terrasse || c.faitage - Math.max(c.egouts[0], c.egouts[1]) < MONTEE_PLATE_M);
}

const STATUTS_PARTIE: Record<PartieVue, [string, string]> = {
  toit: ['À voir', 'Vu'],
  cheminees: ['À voir', 'Vues'],
  terrasse: ['À voir', 'Vue'],
  materiaux: ['À voir', 'Vus'],
};

function lignePartie(b: BatimentCapture, partie: PartieVue): LignePartie {
  const vu = partieVue(b.vu, partie);
  const statut = partie === 'cheminees' && etatCheminees(b.vu) === 'aucune' ? 'Aucune' : STATUTS_PARTIE[partie][vu ? 1 : 0];
  return { partie, vu, statut, resume: resumePartie(b.vu, partie) };
}

/** Les noms repetes (« Résidentiel (2 niv.) ») se numerotent : chaque ligne se reconnait. */
function nommer(liste: { o: Batiment }[]): Map<string, string> {
  const compte = new Map<string, number>();
  for (const { o } of liste) compte.set(o.name || 'Bâtiment', (compte.get(o.name || 'Bâtiment') ?? 0) + 1);
  const rang = new Map<string, number>();
  const out = new Map<string, string>();
  for (const { o } of liste) {
    const nom = o.name || 'Bâtiment';
    if ((compte.get(nom) ?? 0) < 2) { out.set(o.key, nom); continue; }
    const r = (rang.get(nom) ?? 0) + 1;
    rang.set(nom, r);
    out.set(o.key, nom + ' ' + r);
  }
  return out;
}

/** Les lignes d'un batiment : ses facades, puis toit, cheminees, terrasse s'il en a une, materiaux. */
export function ligneBatiment(o: Batiment, mitoyen: boolean, nom: string, objets: readonly ObjetPlan[], capture: CaptureParcelle): LigneBatiment {
  const b = capture.batiments[o.key] ?? batimentVide();
  const facades = facadesDuContour(o.pts, elevationOf(o)).flatMap((f): LigneFacade[] => {
    const fc = b.facades[String(f.cote)];
    const photos = fc?.photos.length ?? 0;
    // Un decroche ne se photographie pas seul ; il reste dans la liste s'il a deja des photos (ancien brouillon).
    if (f.largeur < MUR_COURT_M && !photos) return [];
    const profilMur = profilMurSousToit(o, f);
    return [{ cote: f.cote, facade: f, hauteurMur: Math.max(f.hauteur, ...profilMur.map((m) => m.h)), profilMur, photos, statut: statutFacade(situationFacade(f, o.key, objets), mitoyen, photos, fc?.inaccessible), libelle: 'Façade ' + f.orientation.toLowerCase() + ' · ' + metres(f.largeur) }];
  });
  const parties: PartieVue[] = ['toit', 'cheminees', ...(aUnToitPlat(o, b) ? ['terrasse' as const] : []), 'materiaux'];
  return { cle: o.key, nom, mitoyen, facades, parties: parties.map((p) => lignePartie(b, p)), photosToit: b.photos.length };
}

const pluriel = (n: number, mot: string) => n + ' ' + mot + (n > 1 ? 's' : '');

const NOMS_PARTIES: Record<PartieVue, [string, string]> = {
  toit: ['toit', 'non vu'],
  cheminees: ['cheminées', 'non vues'],
  terrasse: ['toit-terrasse', 'non vu'],
  materiaux: ['matériaux', 'non vus'],
};

/** Ce qui manque (§12.3) : les facades sans photo, puis les parties non vues, puis la parcelle. */
function manquesDe(batiments: readonly LigneBatiment[], cloture: boolean, portail: boolean): Manque[] {
  const out: Manque[] = [];
  for (const b of batiments) {
    for (const f of b.facades) {
      if (f.statut === 'aPhotographier') out.push({ cle: 'facade:' + b.cle + ':' + f.cote, texte: 'façade ' + f.facade.orientation.toLowerCase() + ' de ' + b.nom + ' : pas de photo' });
    }
    for (const p of b.parties) if (!p.vu) out.push({ cle: 'partie:' + b.cle + ':' + p.partie, texte: NOMS_PARTIES[p.partie][0] + ' de ' + b.nom + ' : ' + NOMS_PARTIES[p.partie][1] });
  }
  if (!cloture) out.push({ cle: 'cloture', texte: 'clôture côté rue : non notée' });
  if (!portail) out.push({ cle: 'portail', texte: 'portail : non noté' });
  return out;
}

/** « 7 façades sur 9, toit vu, clôture à faire » : ce qui reste, en une ligne. */
function compteurDe(batiments: readonly LigneBatiment[], photographiees: number, aPrendre: number, cloture: boolean, portail: boolean): string {
  const morceaux = [photographiees + ' façade' + (photographiees > 1 ? 's' : '') + ' sur ' + aPrendre];
  const toits = batiments.map((b) => b.parties.find((p) => p.partie === 'toit')?.vu ?? false);
  if (toits.length === 1) morceaux.push(toits[0] ? 'toit vu' : 'toit à voir');
  else if (toits.length > 1) morceaux.push(pluriel(toits.filter(Boolean).length, 'toit') + ' vu' + (toits.filter(Boolean).length > 1 ? 's' : '') + ' sur ' + toits.length);
  morceaux.push(cloture ? 'clôture notée' : 'clôture à faire');
  morceaux.push(portail ? 'portail noté' : 'portail à faire');
  return morceaux.join(', ');
}

/** La liste de controle complete, recalculee depuis le plan et la capture. */
export function listeDeControle(objets: readonly ObjetPlan[], capture: CaptureParcelle): ListeDeControle {
  const audites = batimentsAudites(objets);
  const noms = nommer(audites);
  const batiments = audites.map(({ o, mitoyen }) => ligneBatiment(o, mitoyen, noms.get(o.key) ?? o.key, objets, capture));
  const propres = batiments;
  const toutes = propres.flatMap((b) => b.facades);
  const photographiees = toutes.filter((f) => f.statut === 'photographiee').length;
  const aPrendre = toutes.filter((f) => f.statut === 'photographiee' || f.statut === 'aPhotographier').length;
  const { cloture: c, portail: p } = capture;
  const clotureFaite = c.type !== undefined || c.photos.length > 0;
  const portailFait = p.nature !== undefined || p.photos.length > 0;
  return {
    batiments,
    cloture: { faite: clotureFaite, resume: resumeCloture(capture) },
    portail: { faite: portailFait, resume: resumePortail(capture) },
    facadesPhotographiees: photographiees,
    facadesAPrendre: aPrendre,
    compteur: compteurDe(propres, photographiees, aPrendre, clotureFaite, portailFait),
    manques: manquesDe(propres, clotureFaite, portailFait),
    peutLancer: batiments.some((b) => b.facades.some((f) => f.statut === 'photographiee')),
  };
}

const LIBELLES_CLOTURE: Record<string, string> = { mur: 'Mur', grillage: 'Grillage', palissade: 'Palissade', haie: 'Haie' };
const LIBELLES_PORTAIL: Record<string, string> = { portail: 'Portail', portillon: 'Portillon', aucun: 'Aucun portail' };
const POSITIONS: Record<string, string> = { gauche: 'à gauche', centre: 'au milieu', droite: 'à droite' };

/** « Mur · 1,8 m · soubassement · 1 photo » */
export function resumeCloture(capture: CaptureParcelle): string {
  const c = capture.cloture;
  const m: string[] = [];
  if (c.type) m.push(LIBELLES_CLOTURE[c.type] ?? c.type);
  if (c.hauteurM !== undefined) m.push(metres(c.hauteurM));
  if (c.soubassement !== undefined) m.push(c.soubassement ? 'soubassement' : 'sans soubassement');
  if (c.photos.length) m.push(pluriel(c.photos.length, 'photo'));
  return m.join(' · ');
}

/** « Portail · à gauche · 3,5 m · 1 photo » */
export function resumePortail(capture: CaptureParcelle): string {
  const p = capture.portail;
  const m: string[] = [];
  if (p.nature) m.push(LIBELLES_PORTAIL[p.nature] ?? p.nature);
  if (p.position) m.push(POSITIONS[p.position] ?? p.position);
  if (p.largeurM !== undefined) m.push(metres(p.largeurM));
  if (p.photos.length) m.push(pluriel(p.photos.length, 'photo'));
  return m.join(' · ');
}

/** Le texte du statut d'une facade, tel que la liste l'ecrit (§12.1). */
export function texteStatutFacade(l: LigneFacade): string {
  if (l.statut === 'mitoyenne') return 'Mitoyenne, rien à photographier';
  if (l.statut === 'photographiee') return 'Photographiée (' + pluriel(l.photos, 'photo') + ')';
  if (l.statut === 'inaccessible') return 'Inaccessible';
  return 'À photographier';
}

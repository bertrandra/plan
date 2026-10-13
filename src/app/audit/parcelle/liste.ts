// La liste de controle de l'audit de la parcelle (MD/spec-audit.md §12.1) : ce qu'il y a a capturer
// sur la parcelle du projet et ses mitoyens, et ce qui reste.
//
// Pur : elle se recalcule a chaque geste depuis les objets du plan et la capture en cours. Les
// batiments de la parcelle sont ceux que l'import y a poses (`surParcellePrincipale`) ou dont le
// centre y tombe (un batiment dessine a la main) ; les mitoyens, ceux des parcelles qui la touchent
// (model/mitoyennete.ts).
//
// Une facade collee a un autre batiment, ou posee sur la limite d'une parcelle voisine, est
// « mitoyenne » : rien a photographier. Celle d'un mitoyen qui donne chez un autre voisin est
// supposee inaccessible ; une touche la rend a la liste.

import { centroid, pointInPolygon } from '../../../geometry/basic.js';
import { distancePointContour } from '../../../geometry/proximite.js';
import { facadesDuContour, pointDeFacade, type Facade } from '../../../facade/geometrie.js';
import { elevationOf } from '../../../engine/hauteurs.js';
import { aDesSommets } from '../../../model/formes.js';
import { estBatiment, parcelleDuProjet, surParcelleDuProjet } from '../../../model/fonctions.js';
import { batimentsMitoyens, parcellesMitoyennes } from '../../../model/mitoyennete.js';
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
/** Un toit plat : moins de cela entre le faitage et l'egout le plus haut (spec-regles-toits §2.7). */
const MONTEE_PLATE_M = 0.3;

export type StatutFacade = 'aPhotographier' | 'photographiee' | 'inaccessible' | 'mitoyenne';
/** Ce qu'il y a devant le mur : la parcelle du projet, la rue (aucune parcelle), un autre voisin. */
export type Situation = 'mitoyenne' | 'parcelle' | 'rue' | 'voisin';

export interface LigneFacade {
  cote: number;
  facade: Facade;
  statut: StatutFacade;
  photos: number;
  /** « Façade sud · 9,2 m » */
  libelle: string;
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

export interface ListeDeControle {
  batiments: LigneBatiment[];
  cloture: { faite: boolean; resume: string };
  portail: { faite: boolean; resume: string };
  facadesPhotographiees: number;
  facadesAPrendre: number;
  /** « 7 façades sur 9, toit vu, clôture à faire » */
  compteur: string;
  /** Ce qui manque, sans bloquer (§12.3) : « façade nord de Maison : pas de photo ». */
  manques: string[];
  /** « Lancer l'analyse » est propose des qu'une facade est photographiee (§12.3). */
  peutLancer: boolean;
}

type Batiment = ObjetPlan & { pts: PtBrut[] };

/** Un batiment de la parcelle : pose par l'import, ou dont le centre tombe dans la parcelle. */
function surLaParcelle(o: Batiment, parcelle: ObjetPlan | undefined): boolean {
  if (surParcelleDuProjet(o)) return true;
  return !!parcelle && aDesSommets(parcelle) && !o.voisinage && pointInPolygon(centroid(o.pts), parcelle.pts);
}

/** Les batiments de l'audit : ceux de la parcelle d'abord, puis les mitoyens. */
export function batimentsAudites(objets: readonly ObjetPlan[]): { o: Batiment; mitoyen: boolean }[] {
  const parcelle = parcelleDuProjet(objets as ObjetPlan[]);
  const batis = objets.filter((o): o is Batiment => estBatiment(o) && aDesSommets(o));
  const propres = batis.filter((o) => surLaParcelle(o, parcelle));
  const mitoyens = [...batimentsMitoyens(objets, parcellesMitoyennes(objets))].filter((o): o is Batiment => estBatiment(o) && aDesSommets(o));
  return [...propres.map((o) => ({ o, mitoyen: false })), ...mitoyens.filter((o) => !propres.includes(o)).map((o) => ({ o, mitoyen: true }))];
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
  const facades = facadesDuContour(o.pts, elevationOf(o)).map((f): LigneFacade => {
    const fc = b.facades[String(f.cote)];
    const photos = fc?.photos.length ?? 0;
    return { cote: f.cote, facade: f, photos, statut: statutFacade(situationFacade(f, o.key, objets), mitoyen, photos, fc?.inaccessible), libelle: 'Façade ' + f.orientation.toLowerCase() + ' · ' + metres(f.largeur) };
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
function manquesDe(batiments: readonly LigneBatiment[], cloture: boolean, portail: boolean): string[] {
  const out: string[] = [];
  for (const b of batiments) {
    for (const f of b.facades) if (f.statut === 'aPhotographier') out.push('façade ' + f.facade.orientation.toLowerCase() + ' de ' + b.nom + ' : pas de photo');
    for (const p of b.parties) if (!p.vu) out.push(NOMS_PARTIES[p.partie][0] + ' de ' + b.nom + ' : ' + NOMS_PARTIES[p.partie][1]);
  }
  if (!cloture) out.push('clôture côté rue : non notée');
  if (!portail) out.push('portail : non noté');
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
  const toutes = batiments.flatMap((b) => b.facades);
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
    compteur: compteurDe(batiments, photographiees, aPrendre, clotureFaite, portailFait),
    manques: manquesDe(batiments, clotureFaite, portailFait),
    peutLancer: photographiees > 0,
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

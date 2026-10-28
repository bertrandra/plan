// Les propositions de l'audit de la parcelle, sans Claude (MD/spec-audit.md §13.1, §14) : ce que les
// mesures du telephone et vos observations proposent de changer dans le projet.
//
// Pur : une liste se recalcule depuis le plan, la capture et les mesures des facades. Chaque
// proposition dit son avant (ce que le projet a aujourd'hui), son apres, son origine et, quand elle
// remplacerait une valeur choisie a la main, laquelle : elle arrive alors decochee (§14.3).
//
// Ce qui se propose :
// - par facade photographiee : le releve (ouvertures, texture) mesure sur la photo ;
// - par batiment : la hauteur a l'egout mesuree (coins trouves seulement), la couleur des murs lue sur
//   les photos, la toiture-terrasse vue, posee dans les corps du toit (MD/spec-regles-toits.md §2.7) ;
//   les cheminees, le materiau des murs et la couverture sont arbitres entre les sources
//   (app/audit/parcelle/arbitrages.ts) ;
// - pour la parcelle : la cloture cote rue et le portail.
// La forme du toit vue (forme, faitage, bouts, lucarnes) n'est pas proposee : la changer demande les
// regles des toits et Claude (lots L17 a L19) ; elle reste une observation de l'audit.

import { nomFacade } from '../../../geometry/cotesVusDeDehors.js';
import { couleurMursRetenue } from '../../../model/couleurMur.js';
import {
  resumePartie, terrasseVue, toitVu,
  type CeQueJeVois,
} from '../../../model/ceQueJeVois.js';
import { accesDuCote, clotureDe, coteRegle, reglageDuCote, resumeReglage } from '../../../model/cloture.js';
import { coteDuNouvelAcces } from '../../../geo/coteRue.js';
import { parcelleDuProjet } from '../../../model/fonctions.js';
import { cocheeParDefaut, type Proposition } from '../../../regles/decisions.js';
import { resumeCloture, resumePortail, type LigneBatiment, type ListeDeControle } from './liste.js';
import type { CaptureParcelle, RenfortFacadeCapture } from '../../../model/auditParcelle.js';
import type { ObjetPlan, PtBrut } from '../../../model/types.js';
import { cleMesure, type MesureFacade } from './mesures.js';
import { corpsAvecCeQuIlsPortaient, corpsDeLaTerrasse, corpsDesCheminees, lucarnesSurLeCorps, reporterElements, souchesSurLeCorps, terrasseVueSurLeCorps } from '../../../facade/regles/toits/elementsVus.js';

export { corpsAvecCeQuIlsPortaient, corpsDeLaTerrasse, corpsDesCheminees, lucarnesSurLeCorps, reporterElements, souchesSurLeCorps, terrasseVueSurLeCorps };

/** Un ecart de hauteur en deca ne vaut pas une proposition : c'est la precision de la mesure. */
export const ECART_HAUTEUR_MIN_M = 0.1;
const fr = (v: number, n = 2) => v.toFixed(n).replace('.', ',');
const pluriel = (n: number, mot: string) => n + ' ' + mot + (n > 1 ? 's' : '');
export const dateFr = (iso: string) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('fr-FR'); };
const majuscule = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Ce qu'il faut pour proposer : le plan, la liste de controle, la capture et les mesures des facades. */
export interface EntreesPropositions {
  objets: readonly ObjetPlan[];
  liste: ListeDeControle;
  capture: CaptureParcelle;
  /** Par `cle#cote`. */
  mesures: ReadonlyMap<string, MesureFacade>;
  /** Le renfort de Claude sur les facades (par `cle#cote`) ; absent sans analyse. */
  renfort?: Record<string, RenfortFacadeCapture> | null | undefined;
}

export { cleMesure };

/* ------------------------------------------------------------------------------------------------
 * Les propositions, par sujet
 * --------------------------------------------------------------------------------------------- */

type Batiment = ObjetPlan;
type SansDefaut = Omit<Proposition, 'source' | 'indices' | 'confiance' | 'remplaceChoix' | 'reserve'> & Partial<Proposition>;

/** Une proposition des mesures, avec ses champs par defaut. */
const mesure = (p: SansDefaut): Proposition => ({ source: 'mesure', indices: [], confiance: null, remplaceChoix: null, reserve: null, ...p });

/** La couleur des murs : la lecture qui a le plus de points, parmi les photos des facades. */
function propositionCouleur(o: Batiment, b: LigneBatiment, e: EntreesPropositions): Proposition | null {
  let lue: { couleur: string; pixels: number; cote: number; rang: number } | null = null;
  for (const f of b.facades) {
    const c = e.mesures.get(cleMesure(b.cle, f.cote))?.couleur;
    if (c && (!lue || c.pixels > lue.pixels)) lue = { ...c, cote: f.cote };
  }
  if (!lue) return null;
  const retenue = couleurMursRetenue(o);
  if (retenue?.couleur.toLowerCase() === lue.couleur.toLowerCase()) return null;
  const source = o.batiment?.couleurMurs?.source;
  const avant = retenue ? retenue.couleur + (retenue.source === 'photo' ? (o.batiment?.couleurMurs?.terrain ? ' (vos photos)' : ' (photo de rue)') : ' (matériau)') : 'couleur du plan';
  const mur = b.facades.find((f) => f.cote === lue?.cote);
  const orientation = mur ? nomFacade(mur.facade.orientation, mur.cote) : '';
  return mesure({
    id: b.cle + ':couleurMurs', cible: { type: 'batiment', cle: b.cle }, objet: 'Murs de ' + b.nom,
    avant, apres: lue.couleur + ', lue sur vos photos',
    indices: [{ texte: 'Lue sur la façade ' + orientation + ' (' + pluriel(lue.pixels, 'point') + ')', photo: { cle: b.cle, cote: lue.cote, rang: lue.rang } }],
    remplaceChoix: source === 'materiau' ? 'couleur du matériau' : source === 'plan' ? 'couleur du plan' : null,
    effet: { type: 'couleurMurs', couleur: lue.couleur },
  });
}

/** La toiture-terrasse vue, sur le plus grand corps plat. */
function propositionTerrasse(o: Batiment, b: LigneBatiment, vu: CeQueJeVois): Proposition | null {
  const corps = o.batiment?.corpsToit ?? [];
  if (!vu.terrasse || !terrasseVue(vu)) return null;
  const i = corpsDeLaTerrasse(corps);
  const c = corps[i];
  if (!c) return null;
  const t = c.terrasse;
  return mesure({
    id: b.cle + ':terrasse', cible: { type: 'batiment', cle: b.cle }, objet: 'Toiture-terrasse de ' + b.nom,
    avant: t ? 'terrasse ' + (t.accessible ? 'accessible' : t.accessible === false ? 'inaccessible' : 'déjà décrite') : 'toit plat, sans détail',
    apres: majuscule(resumePartie(vu, 'terrasse').toLowerCase()) + ', vue sur place',
    effet: { type: 'terrasse', corps: i, terrasse: terrasseVueSurLeCorps(c, vu.terrasse) },
  });
}

/* ------------------------------------------------------------------------------------------------
 * La parcelle : cloture cote rue et portail
 * --------------------------------------------------------------------------------------------- */

/**
 * Le cote sur rue : celui du portail s'il y en a un, sinon celui ou un portail neuf se poserait
 * (geo/coteRue.ts, la regle de tous les chemins de creation : dit sur rue, devine, le plus long).
 */
function coteSurRue(p: ObjetPlan & { pts: PtBrut[] }, objets: readonly ObjetPlan[]): number {
  return clotureDe(p).portails[0]?.cote ?? coteDuNouvelAcces(p, objets);
}

function propositionsParcelle(e: EntreesPropositions): Proposition[] {
  const p = parcelleDuProjet(e.objets as ObjetPlan[]);
  if (!p || !('pts' in p) || !p.pts || p.pts.length < 3) return [];
  const parcelle = p as ObjetPlan & { pts: PtBrut[] };
  const out: Proposition[] = [];
  const cote = coteSurRue(parcelle, e.objets);
  const cl = clotureDe(parcelle);
  const { cloture: c, portail: po } = e.capture;
  if (c.type) {
    const avant = cl.active ? resumeReglage(reglageDuCote(cl, cote)) : 'aucune clôture';
    out.push(mesure({
      id: 'parcelle:cloture', cible: { type: 'parcelle' }, objet: 'Clôture côté rue',
      avant, apres: resumeCloture({ ...e.capture, cloture: { ...c, photos: [] } }) + ', vue sur place',
      // Un cote regle a part dans l'inspecteur est un choix fait a la main.
      remplaceChoix: coteRegle(cl, cote) ? avant : null,
      effet: { type: 'cloture', cote, typeCloture: c.type, ...(c.hauteurM !== undefined ? { hauteurM: c.hauteurM } : {}), ...(c.soubassement !== undefined ? { soubassement: c.soubassement } : {}) },
    }));
  }
  if (po.nature) {
    const acces = accesDuCote(cl, cote);
    const avant = acces.length ? acces.map((a) => (a.nature === 'portail' ? 'portail ' : 'portillon ') + fr(a.largeur) + ' m').join(', ') : 'aucun accès';
    // Un acces dont la largeur n'est pas celle de l'import (3,50 m, 1 m) a ete regle a la main.
    const regle = acces.some((a) => Math.abs(a.largeur - (a.nature === 'portail' ? 3.5 : 1)) > 0.01);
    out.push(mesure({
      id: 'parcelle:portail', cible: { type: 'parcelle' }, objet: 'Portail',
      avant, apres: resumePortail({ ...e.capture, portail: { ...po, photos: [] } }) + ', vu sur place',
      remplaceChoix: regle ? avant : null,
      effet: { type: 'portail', cote, nature: po.nature, ...(po.position ? { position: po.position } : {}), ...(po.largeurM !== undefined ? { largeurM: po.largeurM } : {}) },
    }));
  }
  return out;
}

/** Toutes les propositions, batiment par batiment (facades, hauteur, murs, toit), puis la parcelle. */
export function propositionsDeLAudit(e: EntreesPropositions): Proposition[] {
  const parCle = new Map(e.objets.map((o) => [o.key, o]));
  const out: Proposition[] = [];
  for (const b of e.liste.batiments) {
    const o = parCle.get(b.cle);
    if (!o) continue;
    const vu = e.capture.batiments[b.cle]?.vu ?? {};
    // La hauteur a l'egout et la toiture sont decidees par l'arbitrage des sources (arbitrages.ts).
    for (const p of [propositionCouleur(o, b, e)]) if (p) out.push(p);
    for (const p of [propositionTerrasse(o, b, vu)]) if (p) out.push(p);
  }
  out.push(...propositionsParcelle(e));
  return out;
}

/** Les cases a leur arrivee : cochees, sauf ce qui remplace un choix ou manque de confiance. */
export function cochesParDefaut(propositions: readonly Proposition[]): Set<string> {
  return new Set(propositions.filter(cocheeParDefaut).map((p) => p.id));
}

/* ------------------------------------------------------------------------------------------------
 * « Vérifié sur place »
 * --------------------------------------------------------------------------------------------- */

export interface EtatVerification {
  cle: string;
  nom: string;
  /** Vrai : la validation le marquera « vérifié sur place ». */
  verifie: boolean;
  /** Ce qui manque sinon : « façade nord : pas de photo », « toit non vu », « 1 proposition décochée ». */
  raison: string | null;
}

/**
 * Un batiment est verifie sur place quand ses facades ont toutes ete photographiees (ou sont
 * mitoyennes, ou inaccessibles), que son toit a ete vu, et que toutes ses propositions sont cochees
 * (§14.5) : c'est le 100 % du §1. Les autres ne le sont pas, et la liste dit pourquoi.
 */
/**
 * Une proposition de Claude decochee alors qu'une autre, cochee, ecrit le meme attribut du meme
 * objet (la couverture vue sur place contre celle que Claude propose) : la personne a tranche, et
 * ce refus ne retient pas le batiment hors du « verifie sur place ». Une proposition de Claude sans
 * concurrente cochee, elle, reste a voir.
 */
function tranchee(p: Proposition, propositions: readonly Proposition[], cochees: ReadonlySet<string>): boolean {
  if (p.source !== 'claude') return false;
  const attribut = (x: Proposition) => JSON.stringify(x.cible) + ':' + x.effet.type;
  const cle = attribut(p);
  return propositions.some((q) => q.id !== p.id && cochees.has(q.id) && attribut(q) === cle);
}

export function verifications(liste: ListeDeControle, capture: CaptureParcelle, propositions: readonly Proposition[], cochees: ReadonlySet<string>): EtatVerification[] {
  return liste.batiments.map((b) => {
    const sansPhoto = b.facades.filter((f) => f.statut === 'aPhotographier');
    const photographiee = b.facades.some((f) => f.statut === 'photographiee');
    const vu = capture.batiments[b.cle]?.vu ?? {};
    const decochees = propositions.filter((p) => p.cible.type !== 'parcelle' && p.cible.cle === b.cle && !cochees.has(p.id) && !tranchee(p, propositions, cochees)).length;
    let raison: string | null = null;
    if (!photographiee) raison = 'aucune façade photographiée';
    else if (sansPhoto.length) raison = sansPhoto.map((f) => 'façade ' + nomFacade(f.facade.orientation, f.cote)).join(', ') + ' : pas de photo';
    else if (!toitVu(vu)) raison = 'toit non vu';
    else if (decochees) raison = pluriel(decochees, 'proposition') + ' décochée' + (decochees > 1 ? 's' : '');
    return { cle: b.cle, nom: b.nom, verifie: raison === null, raison };
  });
}

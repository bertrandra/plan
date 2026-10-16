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
//   les photos, le materiau des murs et de la couverture vus, les cheminees et la toiture-terrasse
//   vues, posees dans les corps du toit (MD/spec-regles-toits.md §2.6, §2.7) ;
// - pour la parcelle : la cloture cote rue et le portail.
// La forme du toit vue (forme, faitage, bouts, lucarnes) n'est pas proposee : la changer demande les
// regles des toits et Claude (lots L17 a L19) ; elle reste une observation de l'audit.

import { couleurMursRetenue, textureDesMurs, materiauMurs, type MateriauTexture } from '../../../model/couleurMur.js';
import {
  COUVERTURES_VUES, MATERIAUX_MURS_VUS, libelleDe, resumePartie, terrasseVue, toitVu,
  type CeQueJeVois, type SoucheVue,
} from '../../../model/ceQueJeVois.js';
import { accesDuCote, clotureDe, coteRegle, reglageDuCote, resumeReglage } from '../../../model/cloture.js';
import { coteDuNouvelAcces } from '../../../geo/coteRue.js';
import { parcelleDuProjet } from '../../../model/fonctions.js';
import { cocheeParDefaut, hauteurDe, type Proposition } from '../../../regles/decisions.js';
import { resumeCloture, resumePortail, type LigneBatiment, type ListeDeControle } from './liste.js';
import { propositionToitDesPhotos } from '../../regles/sujets/formeToit.js';
import type { CaptureParcelle } from '../../../model/auditParcelle.js';
import type { Cheminee, CorpsToit, CouvertureChoisie, EdiculeTerrasse, ObjetPlan, PtBrut, TerrasseToit } from '../../../model/types.js';
import { cleMesure, type MesureFacade } from './mesures.js';

/** Un ecart de hauteur en deca ne vaut pas une proposition : c'est la precision de la mesure. */
export const ECART_HAUTEUR_MIN_M = 0.1;
/** Un corps plat : moins de cela entre le faitage et l'egout le plus haut (spec-regles-toits §2.7). */
const MONTEE_PLATE_M = 0.3;
/** Le debouche d'une souche depasse le faitage de tant (DTU 24.1, spec-regles-toits §2.6). */
const DEPASSEMENT_SOUCHE_M = 0.4;
/** Les sections vues le plus souvent : une souche maconnee a un conduit, un tubage inox. */
const SOUCHE = { largeurM: 0.6, profondeurM: 0.5 };
const TUBAGE = { largeurM: 0.2, profondeurM: 0.2 };
/** Une souche adossee est plus large, et sort du mur de sa profondeur. */
const SOUCHE_ADOSSEE = { largeurM: 0.8, profondeurM: 0.5 };
/** Un edicule de terrasse : une cage d'escalier de 2,4 m de cote, 2,5 m au-dessus de la terrasse. */
const EDICULE = { coteM: 2.4, hauteurM: 2.5 };

const fr = (v: number, n = 2) => v.toFixed(n).replace('.', ',');
const pluriel = (n: number, mot: string) => n + ' ' + mot + (n > 1 ? 's' : '');
const dateFr = (iso: string) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('fr-FR'); };
const majuscule = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Ce qu'il faut pour proposer : le plan, la liste de controle, la capture et les mesures des facades. */
export interface EntreesPropositions {
  objets: readonly ObjetPlan[];
  liste: ListeDeControle;
  capture: CaptureParcelle;
  /** Par `cle#cote`. */
  mesures: ReadonlyMap<string, MesureFacade>;
}

export { cleMesure };

/* ------------------------------------------------------------------------------------------------
 * Les corps : ou poser les cheminees et la terrasse
 * --------------------------------------------------------------------------------------------- */

/** Le repere d'un corps : `pts[0] -> pts[1]` le long du faitage (s), `pts[0] -> pts[3]` en travers (t). */
function repereCorps(c: CorpsToit): { L: number; W: number; point: (s: number, t: number) => PtBrut } | null {
  const [p0, p1, , p3] = c.pts;
  if (!p0 || !p1 || !p3) return null;
  const L = Math.hypot(p1.x - p0.x, p1.y - p0.y), W = Math.hypot(p3.x - p0.x, p3.y - p0.y);
  if (!(L > 0) || !(W > 0)) return null;
  const u = { x: (p1.x - p0.x) / L, y: (p1.y - p0.y) / L }, v = { x: (p3.x - p0.x) / W, y: (p3.y - p0.y) / W };
  const r = (x: number) => Math.round(x * 100) / 100;
  return { L, W, point: (s, t) => ({ x: r(p0.x + u.x * s + v.x * t), y: r(p0.y + u.y * s + v.y * t) }) };
}

const estPlat = (c: CorpsToit) => c.faitage - Math.max(c.egouts[0], c.egouts[1]) < MONTEE_PLATE_M;
const aire = (c: CorpsToit) => { const r = repereCorps(c); return r ? r.L * r.W : 0; };

/** Le plus grand corps parmi ceux qui conviennent : celui que l'on voit depuis la rue. */
function plusGrand(corps: readonly CorpsToit[], filtre: (c: CorpsToit) => boolean): number {
  let meilleur = -1, max = 0;
  corps.forEach((c, i) => { const a = aire(c); if (filtre(c) && a > max) { max = a; meilleur = i; } });
  return meilleur;
}

/**
 * Les souches vues, posees sur un corps (spec-regles-toits §2.6) : reparties le long du faitage,
 * sur le faitage, a mi-pan, dans le mur de bout ou adossees a l'exterieur de ce mur. On ne sait
 * d'elles que leur position : leur place exacte et leur section sont celles que l'on voit le plus.
 */
export function souchesSurLeCorps(c: CorpsToit, souches: readonly SoucheVue[]): Cheminee[] {
  const r = repereCorps(c);
  if (!r) return [];
  const n = souches.length;
  const sommetM = Math.round((c.faitage + DEPASSEMENT_SOUCHE_M) * 100) / 100;
  // Un appentis a son faitage sur un mur : le milieu du pan est a mi-largeur.
  const tPan = c.posFaitage > 0.5 && c.posFaitage < r.W - 0.5 ? c.posFaitage / 2 : r.W / 2;
  const tFaitage = c.posFaitage > 0.5 && c.posFaitage < r.W - 0.5 ? c.posFaitage : r.W / 2;
  return souches.map((sv, i) => {
    const position = sv.position ?? 'faitage';
    const section = position === 'facade' ? SOUCHE_ADOSSEE : sv.materiau === 'metal' ? TUBAGE : SOUCHE;
    // Les souches de bout alternent d'un bout a l'autre ; les autres se repartissent le long du faitage.
    const auBout0 = i % 2 === 0;
    let s = ((i + 1) / (n + 1)) * r.L, t = position === 'pan' ? tPan : tFaitage;
    if (position === 'pignon') s = auBout0 ? section.profondeurM / 2 : r.L - section.profondeurM / 2;
    if (position === 'facade') { s = auBout0 ? -section.profondeurM / 2 : r.L + section.profondeurM / 2; t = tFaitage; }
    const p = r.point(s, t);
    return {
      x: p.x, y: p.y, ...section, sommetM, position,
      ...(sv.materiau ? { materiau: sv.materiau } : {}),
      ...(sv.couronnement ? { couronnement: sv.couronnement } : {}),
      ...(sv.couronnement === 'mitrons' ? { conduits: 1 } : {}),
      source: 'observation' as const,
    };
  });
}

/** Les edicules vus, poses au milieu de la terrasse, le long de sa longueur, s'ils y tiennent. */
function ediculesSurLeCorps(c: CorpsToit, nombre: number): EdiculeTerrasse[] {
  const r = repereCorps(c);
  if (!r || nombre <= 0 || r.W < EDICULE.coteM + 0.6 || r.L < nombre * (EDICULE.coteM + 0.6)) return [];
  const sommetM = Math.round((Math.max(c.egouts[0], c.egouts[1]) + EDICULE.hauteurM) * 100) / 100;
  const d = EDICULE.coteM / 2;
  return Array.from({ length: nombre }, (_, i) => {
    const s = ((i + 1) / (nombre + 1)) * r.L, t = r.W / 2;
    return { pts: [r.point(s - d, t - d), r.point(s + d, t - d), r.point(s + d, t + d), r.point(s - d, t + d)], sommetM };
  });
}

/** La terrasse vue, dans le vocabulaire du corps (`TerrasseToit`). */
export function terrasseVueSurLeCorps(c: CorpsToit, vu: NonNullable<CeQueJeVois['terrasse']>): TerrasseToit {
  const edicules = ediculesSurLeCorps(c, vu.edicules ?? 0);
  return {
    ...(vu.accessible !== undefined ? { accessible: vu.accessible } : {}),
    ...(vu.revetement ? { revetement: vu.revetement } : {}),
    ...(vu.acrotereM !== undefined ? { acrotereM: vu.acrotereM } : {}),
    ...(vu.gardeCorps !== undefined ? { gardeCorps: vu.gardeCorps } : {}),
    ...(edicules.length ? { edicules } : {}),
    source: 'observation',
  };
}

/* ------------------------------------------------------------------------------------------------
 * Les propositions, par sujet
 * --------------------------------------------------------------------------------------------- */

type Batiment = ObjetPlan;
type SansDefaut = Omit<Proposition, 'source' | 'indices' | 'confiance' | 'remplaceChoix' | 'reserve'> & Partial<Proposition>;

/** Une proposition des mesures, avec ses champs par defaut. */
const mesure = (p: SansDefaut): Proposition => ({ source: 'mesure', indices: [], confiance: null, remplaceChoix: null, reserve: null, ...p });

function propositionsDesFacades(o: Batiment, b: LigneBatiment, e: EntreesPropositions): Proposition[] {
  const out: Proposition[] = [];
  for (const f of b.facades) {
    const m = e.mesures.get(cleMesure(b.cle, f.cote));
    if (!m?.releve) continue;
    const objet = 'Façade ' + f.facade.orientation.toLowerCase() + ' de ' + b.nom;
    const existant = (o.facades ?? []).find((r) => r.cote === f.cote);
    // Le releve que l'audit a pose lui-meme d'apres cette photo (validation.ts) est deja ecrit : rien a proposer. Un releve
    // pose ainsi d'apres une photo plus ancienne n'est pas un choix de la personne : la nouvelle mesure le remplace.
    if (existant?.depuisAudit && existant.releveLe === m.releve.releveLe) continue;
    const deja = existant?.depuisAudit ? undefined : existant;
    const avantTexte = existant ? (existant.depuisAudit ? 'relevé automatique du ' : 'relevé du ') + dateFr(existant.releveLe) + ' (' + pluriel(existant.ouvertures.length, 'ouverture') + ')' : 'aucun relevé';
    const n = m.releve.ouvertures.length;
    out.push(mesure({
      id: cleMesure(b.cle, f.cote) + ':releve', cible: { type: 'facade', cle: b.cle, cote: f.cote }, objet,
      avant: avantTexte, apres: pluriel(n, 'ouverture') + ' relevée' + (n > 1 ? 's' : '') + ', texture de la photo',
      indices: m.rangReleve !== null ? [{ texte: 'Photo ' + (m.rangReleve + 1) + ' de la façade', photo: { cle: b.cle, cote: f.cote, rang: m.rangReleve } }] : [],
      confiance: m.confiance,
      remplaceChoix: deja ? avantTexte : null,
      reserve: m.coinsTrouves ? null : 'Les coins du mur n’ont pas été trouvés sur la photo : ils sont prédits par la prise de vue, à vérifier.',
      effet: { type: 'releve', releve: m.releve },
    }));
  }
  return out;
}

/** La forme du toit que disent les silhouettes des facades sur les photos : une ligne decochee, relue par le moteur des toits. */
function propositionToit(o: Batiment, b: LigneBatiment, e: EntreesPropositions): Proposition | null {
  return propositionToitDesPhotos(o, b, (f) => {
    const m = e.mesures.get(cleMesure(b.cle, f.cote));
    return { silhouette: m?.silhouette ?? 'indetermine', rang: m?.rangReleve ?? null };
  });
}

/** La hauteur a l'egout mesuree : la mediane des facades dont les coins ont ete trouves. */
function propositionHauteur(o: Batiment, b: LigneBatiment, e: EntreesPropositions): Proposition | null {
  const mesures = b.facades.map((f) => e.mesures.get(cleMesure(b.cle, f.cote))).filter((m): m is MesureFacade => !!m && m.coinsTrouves && m.hauteurM !== null);
  if (!mesures.length) return null;
  const h = [...mesures.map((m) => m.hauteurM as number)].sort((a, c) => a - c);
  const mediane = h.length % 2 ? (h[(h.length - 1) / 2] as number) : ((h[h.length / 2 - 1] as number) + (h[h.length / 2] as number)) / 2;
  const actuelle = hauteurDe(o);
  if (Math.abs(mediane - actuelle) < ECART_HAUTEUR_MIN_M) return null;
  // Sans attributs IGN, la hauteur a ete saisie a la main : elle n'est pas remplacee en silence.
  const saisie = !o.bdtopo && typeof o.elevation === 'number';
  return mesure({
    id: b.cle + ':hauteur', cible: { type: 'batiment', cle: b.cle }, objet: 'Hauteur à l’égout de ' + b.nom,
    avant: fr(actuelle) + ' m', apres: fr(mediane) + ' m, mesurés sur ' + pluriel(mesures.length, 'façade'),
    indices: mesures.map((m) => ({ texte: 'Mesurée sur la façade ' + (b.facades.find((f) => f.cote === m.cote)?.facade.orientation.toLowerCase() ?? ''), ...(m.rangReleve !== null ? { photo: { cle: b.cle, cote: m.cote, rang: m.rangReleve } } : {}) })),
    confiance: Math.min(...mesures.map((m) => m.confiance ?? 1)),
    remplaceChoix: saisie ? 'hauteur saisie, ' + fr(actuelle) + ' m' : null,
    effet: { type: 'hauteur', hauteurM: Math.round(mediane * 100) / 100 },
  });
}

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
  const source = o.couleurMurs?.source;
  const avant = retenue ? retenue.couleur + (retenue.source === 'photo' ? (o.couleurMurs?.terrain ? ' (vos photos)' : ' (photo de rue)') : ' (matériau)') : 'couleur du plan';
  const orientation = b.facades.find((f) => f.cote === lue?.cote)?.facade.orientation.toLowerCase() ?? '';
  return mesure({
    id: b.cle + ':couleurMurs', cible: { type: 'batiment', cle: b.cle }, objet: 'Murs de ' + b.nom,
    avant, apres: lue.couleur + ', lue sur vos photos',
    indices: [{ texte: 'Lue sur la façade ' + orientation + ' (' + pluriel(lue.pixels, 'point') + ')', photo: { cle: b.cle, cote: lue.cote, rang: lue.rang } }],
    remplaceChoix: source === 'materiau' ? 'couleur du matériau' : source === 'plan' ? 'couleur du plan' : null,
    effet: { type: 'couleurMurs', couleur: lue.couleur },
  });
}

const LIBELLE_TEXTURE: Record<MateriauTexture, string> = Object.fromEntries(MATERIAUX_MURS_VUS.map((m) => [m.code, m.libelle])) as Record<MateriauTexture, string>;

/** Le materiau des murs et celui de la couverture vus (§8.1). */
function propositionsMateriaux(o: Batiment, b: LigneBatiment, vu: CeQueJeVois): Proposition[] {
  const out: Proposition[] = [];
  if (vu.murs) {
    const actuel = textureDesMurs(o);
    if (actuel !== vu.murs) {
      const bdtopo = materiauMurs((o.bdtopo as { materiauxMurs?: unknown } | null | undefined)?.materiauxMurs);
      const choisi = o.couleurMurs?.materiau;
      out.push(mesure({
        id: b.cle + ':materiauMurs', cible: { type: 'batiment', cle: b.cle }, objet: 'Matériau des murs de ' + b.nom,
        avant: actuel ? LIBELLE_TEXTURE[actuel] + (choisi ? ' (vu sur place)' : bdtopo ? ' (fichiers fonciers)' : '') : o.couleurMurs?.source === 'plan' ? 'couleur du plan, sans texture' : 'non renseigné',
        apres: LIBELLE_TEXTURE[vu.murs] + ', vu sur place',
        remplaceChoix: choisi ? LIBELLE_TEXTURE[choisi] : o.couleurMurs?.source === 'plan' ? 'couleur du plan, sans texture' : null,
        effet: { type: 'materiauMurs', materiau: vu.murs },
      }));
    }
  }
  if (vu.couverture && vu.couverture !== 'terrasse' && o.toit) {
    const choisie = o.toit.couverture;
    if (choisie !== vu.couverture) {
      out.push(mesure({
        id: b.cle + ':couverture', cible: { type: 'batiment', cle: b.cle }, objet: 'Couverture de ' + b.nom,
        avant: choisie ? libelleDe(COUVERTURES_VUES, choisie) : 'déduite par Plan',
        apres: libelleDe(COUVERTURES_VUES, vu.couverture) + ', vue sur place',
        remplaceChoix: choisie ? libelleDe(COUVERTURES_VUES, choisie).toLowerCase() : null,
        effet: { type: 'couverture', couverture: vu.couverture as CouvertureChoisie },
      }));
    }
  }
  return out;
}

/** Le corps qui porte les souches : le plus grand en pente, a defaut le plus grand ; -1 sans corps. */
export function corpsDesCheminees(corps: readonly CorpsToit[]): number {
  const i = plusGrand(corps, (c) => !estPlat(c));
  return i >= 0 ? i : plusGrand(corps, () => true);
}

/** Le corps qui porte la toiture-terrasse : le plus grand corps plat ; -1 s'il n'y en a pas. */
export const corpsDeLaTerrasse = (corps: readonly CorpsToit[]): number => plusGrand(corps, estPlat);

/** Les cheminees vues, posees sur le plus grand corps en pente (a defaut, le plus grand). */
function propositionCheminees(o: Batiment, b: LigneBatiment, vu: CeQueJeVois): Proposition | null {
  const corps = o.corpsToit ?? [];
  if (!vu.cheminees || !corps.length) return null;
  const existantes = corps.flatMap((c) => c.cheminees ?? []);
  if (!vu.cheminees.nombre && !existantes.some((c) => c.source === 'observation')) return null;
  const i = corpsDesCheminees(corps);
  const c = corps[i];
  if (!c) return null;
  const cheminees = souchesSurLeCorps(c, vu.cheminees.souches);
  return mesure({
    id: b.cle + ':cheminees', cible: { type: 'batiment', cle: b.cle }, objet: 'Cheminées de ' + b.nom,
    avant: existantes.length ? pluriel(existantes.length, 'cheminée') : 'aucune cheminée',
    apres: majuscule(resumePartie(vu, 'cheminees').toLowerCase()) + ', vues sur place',
    effet: { type: 'cheminees', corps: i, cheminees },
  });
}

/** La toiture-terrasse vue, sur le plus grand corps plat. */
function propositionTerrasse(o: Batiment, b: LigneBatiment, vu: CeQueJeVois): Proposition | null {
  const corps = o.corpsToit ?? [];
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
    out.push(...propositionsDesFacades(o, b, e));
    for (const p of [propositionHauteur(o, b, e), propositionCouleur(o, b, e)]) if (p) out.push(p);
    out.push(...propositionsMateriaux(o, b, vu));
    for (const p of [propositionToit(o, b, e), propositionCheminees(o, b, vu), propositionTerrasse(o, b, vu)]) if (p) out.push(p);
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
    else if (sansPhoto.length) raison = sansPhoto.map((f) => 'façade ' + f.facade.orientation.toLowerCase()).join(', ') + ' : pas de photo';
    else if (!toitVu(vu)) raison = 'toit non vu';
    else if (decochees) raison = pluriel(decochees, 'proposition') + ' décochée' + (decochees > 1 ? 's' : '');
    return { cle: b.cle, nom: b.nom, verifie: raison === null, raison };
  });
}

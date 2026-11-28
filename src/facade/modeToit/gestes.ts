// Les decisions de l'edition du toit : sur quoi agit un geste (sa portee), ce qu'une forme, une piece, un pas du faitage ou du sens
// font au batiment, pourquoi un geste n'a pas de sens, ce qui va disparaitre. Une seule regle par decision, quelle que soit la vue qui
// la demande (l'atelier du toit en 2D ou en 3D) : c'est le controleur (controleurToit.ts) qui les appelle, et lui seul.
//
// Chaque geste ecrit dans un BROUILLON du batiment (`brouillonDe`), jamais dans le batiment lui-meme : le controleur compare, ecrit et
// fige ensuite, en une seule porte. Pur : pas de DOM, pas de scene, pas d'historique.

import { enPoints } from '../../model/formes.js';
import { estFormeToit, formeDuCorpsNommee } from '../../model/formeToit.js';
import { decomposerEnRectangles, rectanglesDuContour } from '../../model/volumesToit.js';
import { champsBatiment } from '../../model/champsFonction.js';
import { EXEMPLES_TOITS, LARGEUR_M, LONGUEUR_M, corpsDeLExemple, type ExempleToit } from './exemplesToits.js';
import { piece } from './pieces.js';
import { angleDuPlusLongCote, LIBELLES_FORME_TOIT } from '../toits/toit.js';
import { boiteOrientee, point, repere, type Repere } from '../toits/toitCorps.js';
import { formeDuCorps } from '../regles/toits/faits.js';
import { faitageDeLucarne, largeurDeLucarne, PROFONDEUR_LUCARNE_M, SOUCHE, sommetDeSouche } from '../regles/toits/elementsDesMurs.js';
import { corpsNeuf, rangPrincipal, rangsDeCorps, type GenreCorps } from './corpsNeufs.js';
import { coupeParDefaut, gaucheEnDebut } from './decroche.js';
import { traveeNeuve } from './travees.js';
import { DEFAUTS_SAILLIE, accorderLesRetraits, bornesDeSaillie, corpsDeSaillie, murDuCorps, murLibre } from './saillies.js';
import { appliquerAuBatiment, appliquerChoix, listerElements, type CibleElement } from './elements.js';
import { glisser } from './poignees.js';
import { sensDuCorps, sensDuToit, sensReglable, type Sens } from './sens.js';
import { CHAMPS_DU_TOIT } from './sessionToit.js';
import type { BoutToit, Cheminee, CorpsToit, ElementDeToit, FormeSaillie, FormeToit, GenreSaillie, Lucarne, ObjetPlan, PignonToit, ProfilPan, PtBrut, Toit, TypeLucarne } from '../../model/types.js';

const dixieme = (v: number) => Math.round(v * 10) / 10;
const metres = (v: number): string => v.toFixed(1).replace('.', ',') + ' m';

/** La facade que la personne regarde (la Vue 3D la dit ; le plan n'en regarde aucune) : le corps (null : le contour seul) et son mur. */
export interface FacadeChoisie { rang: number | null; mur: number }

/** Ce que la personne a choisi : un element, le batiment entier (un choix explicite), et la facade qu'elle regarde. */
export interface Choix { selection: CibleElement | null; batimentEntier: boolean; facade: FacadeChoisie | null }

// ---------------------------------------------------------------------------------------------------------------------------------------
// Le brouillon

/**
 * Une copie du batiment ou un geste peut ecrire : l'objet est copie en surface, et les champs du toit (CHAMPS_DU_TOIT, la liste unique
 * de sessionToit.ts) en profondeur. Le batiment du projet n'est jamais touche par un geste : le controleur y reporte le brouillon.
 */
export function brouillonDe(o: ObjetPlan): ObjetPlan {
  if (!o.batiment) return { ...o };
  const b = { ...o.batiment } as Record<string, unknown>;
  for (const k of CHAMPS_DU_TOIT) if (b[k] !== undefined) b[k] = JSON.parse(JSON.stringify(b[k]));
  return { ...o, batiment: b as NonNullable<ObjetPlan['batiment']> };
}

const corpsDe = (o: ObjetPlan): CorpsToit[] => o.batiment?.corpsToit ?? [];

// ---------------------------------------------------------------------------------------------------------------------------------------
// La portee : sur quoi agit un geste (revue du 28 novembre 2026, constat 7 : cinq facons de le dire, il n'en reste qu'une)

/** Ce sur quoi agit un geste : un corps (son rang), tout le toit, ou le toit simple d'un batiment qui n'a pas encore de corps. */
export interface Portee {
  /** Le corps vise, ou null : tout le toit (`entier`) ou le toit simple. */
  rang: number | null;
  entier: boolean;
  /** La portee, dite a la personne : « Corps principal », « Corps 2 (la façade regardée) », « Tout le toit », « Le toit ». */
  mots: string;
}

/** Le corps qui porte un element : un element de facade (une saillie) renvoie a son corps porteur, tout autre element a son corps. */
export function corpsPorteur(corps: readonly CorpsToit[], rang: number): number | null {
  const c = corps[rang];
  if (!c) return null;
  return c.saillie ? (corps[c.saillie.hote] ? c.saillie.hote : null) : rang;
}

const nomDuCorps = (corps: readonly CorpsToit[], rang: number): string =>
  listerElements(corps).find((e) => e.cible.type === 'corps' && e.cible.rang === rang)?.libelle ?? 'Corps';

/**
 * La portee d'un geste, la seule regle (decisions du 21 octobre et du 28 novembre 2026) : le batiment entier quand la personne l'a
 * choisi ; sinon le corps de l'element choisi ; sinon le corps de la facade regardee ; sinon le corps principal. Sans corps, le toit
 * simple du batiment.
 */
export function porteeDuGeste(corps: readonly CorpsToit[], choix: Choix): Portee {
  if (!rangsDeCorps(corps).length) return { rang: null, entier: false, mots: 'Le toit' };
  if (choix.batimentEntier) return { rang: null, entier: true, mots: 'Tout le toit' };
  if (choix.selection) {
    const r = corpsPorteur(corps, choix.selection.rang);
    if (r !== null) return { rang: r, entier: false, mots: nomDuCorps(corps, r) };
  }
  const f = choix.facade && choix.facade.rang !== null ? corpsPorteur(corps, choix.facade.rang) : null;
  if (f !== null) return { rang: f, entier: false, mots: nomDuCorps(corps, f) + ' (la façade regardée)' };
  const p = rangPrincipal(corps);
  return { rang: p, entier: false, mots: nomDuCorps(corps, p) };
}

// ---------------------------------------------------------------------------------------------------------------------------------------
// Le batiment et son toit simple

const aire = (c: CorpsToit): number => { const r = repere(c.pts); return r.L * r.W; };

/** Le corps qui porte ce que l'on pose : le plus grand, sans compter ce qui est pose sur une facade. */
export const corpsPrincipal = (o: ObjetPlan): CorpsToit | null => {
  const l = corpsDe(o).filter((c) => !c.saillie);
  return l.length ? l.reduce((a, b) => (aire(b) > aire(a) ? b : a)) : null;
};

const contourDe = (o: ObjetPlan): PtBrut[] | null => { const pts = enPoints(o).pts as PtBrut[] | undefined; return pts && pts.length >= 3 ? pts : null; };

/** Un rectangle, la longueur selon le grand cote : celui sur lequel se pose une forme. */
function enLongueur(rect: readonly PtBrut[]): PtBrut[] {
  const r = repere(rect);
  return r.L < r.W ? [rect[1] as PtBrut, rect[2] as PtBrut, rect[3] as PtBrut, rect[0] as PtBrut] : [...rect];
}

/** Le contour est-il a peu pres son rectangle englobant ? Sinon un corps unique ne le decrit pas (une maison en L, en U). */
function contourRectangulaire(pts: readonly PtBrut[]): boolean {
  const rect = boiteOrientee(pts);
  const s = (l: readonly PtBrut[]) => Math.abs(l.reduce((t, q, i) => { const r = l[(i + 1) % l.length] as PtBrut; return t + q.x * r.y - r.x * q.y; }, 0)) / 2;
  return s(pts) >= 0.9 * s(rect);
}

/**
 * Les rectangles sur lesquels le toit se decoupe en corps : le rectangle du contour quand il le decrit, sinon ses rectangles maximaux
 * (ceux de la lecture du LiDAR : une maison en L en a deux, qui se chevauchent dans l'angle). Vide sans contour.
 */
export function rectanglesDuBatiment(o: ObjetPlan): PtBrut[][] {
  const pts = contourDe(o);
  if (!pts) return [];
  if (contourRectangulaire(pts)) return [enLongueur(boiteOrientee(pts))];
  return (rectanglesDuContour(pts) ?? decomposerEnRectangles(pts) ?? [boiteOrientee(pts)]).map(enLongueur);
}

/** La hauteur d'un toit simple au-dessus de l'egout : jamais sous cela (en dessous, c'est un toit plat), ni au-dela de 20 m. */
export const HAUTEUR_TOIT_MIN_M = 0.4, HAUTEUR_TOIT_MAX_M = 20;
/** Le pas des boutons − et + de la hauteur du faitage, en metres. */
export const PAS_FAITAGE_M = 0.1;

/** Le toit simple du batiment, cree par defaut (deux pans de 2,5 m, faitage le long du plus grand cote) s'il n'en a pas. */
export function toitOuDefaut(o: ObjetPlan): Toit {
  const b = champsBatiment(o);
  return (b.toit ??= { forme: 'deux-pans', hauteur: 2.5, angleFaitage: angleDuPlusLongCote(enPoints(o).pts as PtBrut[]), source: 'saisie' });
}

/** Le toit simple, saisi : aucune lecture ne le reprend (model/protections.ts). */
function saisir(t: Toit): void { t.source = 'saisie'; delete t.estime; }

const egoutDe = (o: ObjetPlan): number => o.elevation ?? 3;

// ---------------------------------------------------------------------------------------------------------------------------------------
// Les formes

/** Une forme du catalogue a poser : son exemple, et le bout du faitage qui garde seul sa croupe (les trois pans). */
function formeAPoser(id: string): { e: ExempleToit; seuleCroupe: 0 | 1 | null } | null {
  const nom = id.replace(/^forme:/, '');
  const variante = /^croupes-(debut|fin)$/.exec(nom);
  const e = EXEMPLES_TOITS.find((x) => x.id === (variante ? 'croupes' : nom));
  return e ? { e, seuleCroupe: variante ? (variante[1] === 'debut' ? 0 : 1) : null } : null;
}

/** Le corps d'un quatre-pans devenu trois pans : la croupe du bout `garde` reste, l'autre bout redevient un pignon. */
function trancherUneCroupe(c: CorpsToit, garde: 0 | 1 | null): CorpsToit {
  if (garde === null || !c.croupes) return c;
  const h = c.croupes[garde];
  return { ...c, croupes: garde === 0 ? [h, 0] : [0, h] };
}

/**
 * Le corps de reference d'un exemple du catalogue, remis a l'echelle d'un rectangle : son emprise, son egout et la montee de son toit.
 * Les distances le long du faitage suivent la longueur, celles en travers la largeur, les hauteurs la montee. Plusieurs corps (un toit en
 * M, un shed) se repartissent sur le rectangle comme dans l'exemple.
 */
export function corpsDepuisExemple(e: ExempleToit, rect: readonly PtBrut[], egout: number, montee: number): CorpsToit[] {
  const r: Repere = repere(rect);
  const modeles = corpsDeLExemple(e);
  const L0 = Math.max(LONGUEUR_M, ...e.corps.map((c) => c.l ?? LONGUEUR_M));
  const W0 = Math.max(LARGEUR_M, ...e.corps.map((c) => (c.t0 ?? 0) + (c.w ?? LARGEUR_M)));
  const kL = r.L / L0, kW = r.W / W0;
  return modeles.map((m, i) => {
    const item = e.corps[i] as NonNullable<ExempleToit['corps'][number]>;
    const t0 = item.t0 ?? 0, w = item.w ?? LARGEUR_M, l = item.l ?? LONGUEUR_M;
    const bas = Math.min(...m.egouts);
    const kH = montee / Math.max(0.5, Math.abs(m.faitage - bas) || 4);
    const haut = (z: number) => dixieme(egout + (z - bas) * kH);
    const pts = [[0, t0], [l, t0], [l, t0 + w], [0, t0 + w]].map(([s, t]) => point(r, (s as number) * kL, (t as number) * kW));
    const profil = m.profil?.map((p): ProfilPan => (p.type === 'brise' ? { ...p, largeurBrisisM: dixieme(p.largeurBrisisM * kW), hauteurBrisM: haut(p.hauteurBrisM) }
      : p.type === 'coyau' ? { ...p, largeurM: dixieme(p.largeurM * kW) } : p.type === 'courbe' ? { ...p, flecheM: dixieme(p.flecheM * kW) } : p)) as CorpsToit['profil'];
    const bouts = m.bouts?.map((b): BoutToit => (b.type === 'croupe' ? { ...b, profondeurM: dixieme(b.profondeurM * kL) }
      : b.type === 'demi-croupe' ? { ...b, profondeurM: dixieme(b.profondeurM * kL), hauteurPignonM: dixieme(b.hauteurPignonM * kH) }
        : b.type === 'brisis' ? { ...b, largeurM: dixieme(b.largeurM * kL) } : b)) as CorpsToit['bouts'];
    const luc = m.lucarnes?.map((x): Lucarne => ({ ...x, debutM: dixieme(x.debutM * kL), finM: dixieme(x.finM * kL), faitageM: haut(x.faitageM), profondeurM: dixieme(x.profondeurM * kW) }));
    return {
      ...m, pts,
      posFaitage: dixieme(m.posFaitage * kW),
      faitage: haut(m.faitage),
      egouts: [haut(m.egouts[0]), haut(m.egouts[1])],
      ...(m.croupes ? { croupes: [dixieme(m.croupes[0] * kL), dixieme(m.croupes[1] * kL)] as [number, number] } : {}),
      ...(profil ? { profil } : {}), ...(bouts ? { bouts } : {}), ...(luc ? { lucarnes: luc } : {})
    };
  });
}

/**
 * Changer la forme d'un corps garde ce qui est pose dessus quand cela tient encore : ses pignons (un pignon de facade sur un toit plat
 * aussi : AE 101), ses souches, et ses lucarnes, fenetres de toit et panneaux sur un toit en pente. Rien ne se garde sur un appentis, qui
 * n'a pas de long pan a pignon, ni quand le faitage tourne. Decision du proprietaire, 4 novembre 2026 : modifier, pas remplacer.
 */
function gardeCeQuiEstPose(avant: CorpsToit, apres: CorpsToit): CorpsToit {
  const neuf: CorpsToit = { ...apres };
  if (avant.cheminees?.length) neuf.cheminees = avant.cheminees;
  const r0 = repere(avant.pts), r1 = repere(apres.pts), cos = r0.u.x * r1.u.x + r0.u.y * r1.u.y;
  const forme = formeDuCorps(apres);
  if (Math.abs(cos) < 0.999 || forme === 'appentis') return neuf;
  const k = r1.L / r0.L, rel = (s: number) => (cos > 0 ? s * k : r1.L - s * k);
  neuf.pignons = avant.pignons.map((g) => {
    const a = rel(g.debut), b = rel(g.fin), pan = (cos > 0 ? g.pan : g.pan === 0 ? 1 : 0) as 0 | 1;
    return { ...g, pan, debut: dixieme(Math.min(a, b)), fin: dixieme(Math.max(a, b)), faitage: Math.max(g.faitage, apres.egouts[pan] + 0.5) };
  });
  const memeSens = cos > 0.999 && Math.abs(r0.L - r1.L) < 0.05 && Math.abs(r0.W - r1.W) < 0.05;
  if (forme !== 'plat' && memeSens) {
    if (avant.lucarnes?.length) neuf.lucarnes = avant.lucarnes.map((l) => ({ ...l, faitageM: Math.min(l.faitageM, dixieme(apres.faitage - 0.1)) }));
    if (avant.elementsToit?.length) neuf.elementsToit = avant.elementsToit;
  }
  return neuf;
}

/** La forme d'un corps ou d'un toit simple, en identifiant de piece (`forme:deux-pans`). */
const pieceDeLaForme = (f: string): string => 'forme:' + (f === 'quatre-pans' ? 'croupes' : f);

/**
 * La forme en place sur la portee : celle du corps vise, ou du toit simple ; null sur le batiment entier a plusieurs corps (une forme
 * les remplacerait tous). L'atelier la marque.
 */
export function formeEnPlace(o: ObjetPlan, portee: Portee): string | null {
  const corps = corpsDe(o);
  if (portee.rang !== null) { const c = corps[portee.rang]; return c ? pieceDeLaForme(formeDuCorpsNommee(c)) : null; }
  if (portee.entier) { const l = rangsDeCorps(corps); return l.length === 1 ? pieceDeLaForme(formeDuCorpsNommee(corps[l[0] as number] as CorpsToit)) : null; }
  const t = o.batiment?.toit;
  return t ? pieceDeLaForme(t.forme) : null;
}

/** Le bouton qui decoupe le toit simple en corps de sa forme : son verbe (« Découper ce toit en quatre pans »), ou null s'il a des corps. */
export function decoupe(o: ObjetPlan): { piece: string; libelle: string } | null {
  if (corpsDe(o).some((c) => !c.saillie) || !contourDe(o)) return null;
  const t = o.batiment?.toit, id = pieceDeLaForme(t?.forme ?? 'deux-pans');
  const n = rectanglesDuBatiment(o).length;
  const nom = (piece(id)?.libelle ?? 'Deux pans').toLowerCase().replace(/^toit /, '');
  return { piece: id, libelle: 'Découper ce toit' + (n > 1 ? ' en ' + n + ' corps' : '') + ' : ' + nom };
}

/** Decoupe le toit simple en corps de la forme `id`, un par rectangle du batiment, a l'egout et a la hauteur du toit simple. */
function decouperEnCorps(o: ObjetPlan, id: string): boolean {
  const forme = formeAPoser(id), rects = rectanglesDuBatiment(o);
  if (!forme || !rects.length) return false;
  const egout = egoutDe(o), montee = Math.max(1, o.batiment?.toit?.hauteur ?? 2.5);
  champsBatiment(o).corpsToit = rects.flatMap((rect) => corpsDepuisExemple(forme.e, rect, egout, montee).map((c, i) => (i === 0 ? trancherUneCroupe(c, forme.seuleCroupe) : c)));
  champsBatiment(o).modeToit = 'corps';
  const t = toitOuDefaut(o);
  if (estFormeToit(forme.e.id)) t.forme = forme.e.id;
  delete t.pente;
  saisir(t);
  return true;
}

/**
 * Ce qui disparait quand une forme remplace tout le toit (« Bâtiment entier ») : les corps en plus du premier et tout ce qui est pose,
 * dit en mots avant le geste (revue du 28 novembre 2026, constat 2). Vide : rien ne disparait.
 */
export function ceQuiDisparait(corps: readonly CorpsToit[]): string[] {
  const n = (k: number, un: string, plusieurs: string) => (k ? [k + ' ' + (k > 1 ? plusieurs : un)] : []);
  const somme = (f: (c: CorpsToit) => number) => corps.reduce((t, c) => t + f(c), 0);
  const parGenre = new Map<string, number>();
  for (const c of corps) if (c.saillie) parGenre.set(c.saillie.genre, (parGenre.get(c.saillie.genre) ?? 0) + 1);
  const NOMS: Record<string, [string, string]> = { 'bow-window': ['bow-window', 'bow-windows'], galerie: ['galerie', 'galeries'], appentis: ['appentis', 'appentis'], auvent: ['auvent', 'auvents'] };
  return [
    ...n(Math.max(0, rangsDeCorps(corps).length - 1), 'corps de plus', 'corps de plus'),
    ...[...parGenre].flatMap(([g, k]) => n(k, NOMS[g]?.[0] ?? g, NOMS[g]?.[1] ?? g)),
    ...n(somme((c) => c.pignons.length), 'pignon', 'pignons'),
    ...n(somme((c) => c.lucarnes?.length ?? 0), 'lucarne', 'lucarnes'),
    ...n(somme((c) => c.cheminees?.length ?? 0), 'cheminée', 'cheminées'),
    ...n(somme((c) => c.elementsToit?.length ?? 0), 'élément de toit', 'éléments de toit'),
    ...n(somme((c) => c.travees?.length ?? 0), 'travée', 'travées')
  ];
}

/**
 * Pose la forme `id` sur la portee : le corps vise seul change, a son emprise et a ses hauteurs, en gardant ce qui y est pose (option A
 * de la revue du 28 novembre 2026) ; tout le toit, seulement quand la personne a choisi « Bâtiment entier » ; sans corps, le toit simple
 * se decoupe en corps de cette forme. Vrai si le brouillon a change.
 */
export function poserForme(o: ObjetPlan, id: string, portee: Portee): boolean {
  const forme = formeAPoser(id);
  if (!forme) return false;
  const corps = corpsDe(o);
  // Un toit d'un seul tenant : la forme choisie le decoupe en corps de cette forme, la forme en place comprise (c'est le geste qui sort de
  // l'impasse d'une maison en L dont le toit n'est pas en corps, audit UX du 28 novembre 2026). Une seule regle, l'atelier ouvert sur le
  // plan ou dans la Vue 3D (revue du 28 novembre, constat 8).
  if (!rangsDeCorps(corps).length) return decouperEnCorps(o, id);
  if (portee.entier) {
    // Tout le toit, sur les rectangles du batiment : ce qui y etait est remplace (l'atelier l'a dit avant, `ceQuiDisparait`).
    const rects = rectanglesDuBatiment(o), c0 = corpsPrincipal(o);
    if (!rects.length || !c0) return false;
    const egout = Math.min(...c0.egouts), montee = Math.max(1, c0.faitage - egout);
    champsBatiment(o).corpsToit = rects.flatMap((rect) => corpsDepuisExemple(forme.e, rect, egout, montee).map((c, i) => (i === 0 ? trancherUneCroupe(c, forme.seuleCroupe) : c)));
    champsBatiment(o).modeToit = 'corps';
    const t = toitOuDefaut(o);
    if (estFormeToit(forme.e.id)) t.forme = forme.e.id;
    delete t.pente;
    saisir(t);
    return true;
  }
  const rang = portee.rang, choisi = rang === null ? undefined : corps[rang];
  if (rang === null || !choisi) return false;
  // Le corps garde son rang (les saillies qui le designent le suivent) ; les corps de plus que la forme demande s'ajoutent a la fin.
  const egout = Math.min(...choisi.egouts), montee = Math.max(1, choisi.faitage - egout);
  const [tel, ...autres] = corpsDepuisExemple(forme.e, enLongueur(choisi.pts), egout, montee);
  if (!tel) return false;
  const premier = gardeCeQuiEstPose(choisi, trancherUneCroupe(tel, forme.seuleCroupe));
  champsBatiment(o).corpsToit = [...corps.slice(0, rang), premier, ...corps.slice(rang + 1), ...autres];
  champsBatiment(o).modeToit = 'corps';
  saisir(toitOuDefaut(o));
  return true;
}

// ---------------------------------------------------------------------------------------------------------------------------------------
// La hauteur du faitage et son sens

/** Ce que l'ecran lit de la hauteur du faitage : sa valeur, si chaque bouton a un effet, et pourquoi elle ne se regle pas. */
export interface FaitageSimple { hauteur: number; monte: boolean; descend: boolean; raison: string | null }

const RAISON_PLAT = 'Un toit plat n’a pas de faîtage : choisissez d’abord une forme en pente.';

/** Le faitage du corps `rang` d'un pas : la poignee « Hauteur du faitage » tiree d'autant, avec ses bornes (poignees.ts::glisser). */
export function faitageParPas(corps: readonly CorpsToit[], rang: number, sens: 1 | -1): CorpsToit[] {
  return glisser(corps, { type: 'facade', rang, i: 0, mur: 0 }, 'haut', { vert: sens * PAS_FAITAGE_M }).corps;
}

/** La hauteur du toit simple un pas plus haut ou plus bas, dans ses bornes. */
export function hauteurParPas(t: Pick<Toit, 'hauteur'>, sens: 1 | -1): number {
  return Math.round(Math.min(HAUTEUR_TOIT_MAX_M, Math.max(HAUTEUR_TOIT_MIN_M, t.hauteur + sens * PAS_FAITAGE_M)) * 100) / 100;
}

/** Monte (+1) ou descend (−1) le faitage d'un pas sur la portee ; tout le toit : chaque corps d'autant. Vrai si le brouillon a change. */
export function faitageDUnPas(o: ObjetPlan, portee: Portee, sens: 1 | -1): boolean {
  const corps = corpsDe(o);
  if (!rangsDeCorps(corps).length) {
    const t = o.batiment?.toit;
    if (!t || t.forme === 'plat') return false;
    const h = hauteurParPas(t, sens);
    if (h === t.hauteur) return false;
    t.hauteur = h;
    saisir(t);
    return true;
  }
  const rangs = portee.entier ? rangsDeCorps(corps).filter((r) => formeDuCorpsNommee(corps[r] as CorpsToit) !== 'plat') : portee.rang === null ? [] : [portee.rang];
  const neufs = rangs.reduce((l, r) => faitageParPas(l, r, sens), corps);
  if (JSON.stringify(neufs) === JSON.stringify(corps)) return false;
  champsBatiment(o).corpsToit = neufs;
  return true;
}

/** Ce que l'ecran lit de la hauteur du faitage sur la portee (le plus haut, sur tout le toit). */
export function faitageDeLaPortee(o: ObjetPlan, portee: Portee): FaitageSimple | null {
  const corps = corpsDe(o);
  if (!rangsDeCorps(corps).length) {
    const t = o.batiment?.toit, egout = egoutDe(o);
    if (!t) return null;
    if (t.forme === 'plat') return { hauteur: egout, monte: false, descend: false, raison: RAISON_PLAT };
    return { hauteur: egout + t.hauteur, monte: hauteurParPas(t, 1) > t.hauteur, descend: hauteurParPas(t, -1) < t.hauteur, raison: null };
  }
  const rangs = portee.entier ? rangsDeCorps(corps) : portee.rang === null ? [] : [portee.rang];
  if (!rangs.length) return null;
  const haut = Math.max(...rangs.map((r) => (corps[r] as CorpsToit).faitage));
  if (rangs.every((r) => formeDuCorpsNommee(corps[r] as CorpsToit) === 'plat')) return { hauteur: haut, monte: false, descend: false, raison: RAISON_PLAT };
  const change = (s: 1 | -1) => { const b = brouillonDe(o); return faitageDUnPas(b, portee, s); };
  return { hauteur: haut, monte: change(1), descend: change(-1), raison: null };
}

/** Ce que l'ecran lit du sens du faitage : le sens en place, et pourquoi il ne tourne pas (null : il tourne). */
export interface SensSimple { valeur: Sens; raison: string | null }

/** Les formes simples dont le faitage suit le contour ou n'existe pas : rien a tourner. */
const SANS_DIRECTION = new Set<FormeToit>(['plat', 'croupes', 'pavillon']);
const RAISON_SANS_FAITAGE = 'Ce toit n’a pas de faîtage à tourner.';

/** Le sens du faitage sur la portee : un corps, tout le toit, ou le toit simple (sa direction comparee au plus long cote). */
export function sensDeLaPortee(o: ObjetPlan, portee: Portee): SensSimple | null {
  const corps = corpsDe(o);
  if (!rangsDeCorps(corps).length) {
    const t = o.batiment?.toit, pts = contourDe(o);
    if (!t || !pts) return null;
    const ecart = Math.abs(((((t.angleFaitage - angleDuPlusLongCote(pts)) % 180) + 270) % 180) - 90);
    return { valeur: ecart <= 45 ? 'long' : 'court', raison: SANS_DIRECTION.has(t.forme) ? RAISON_SANS_FAITAGE : null };
  }
  if (portee.entier) { const e = sensDuToit(corps); return e ? { valeur: e.valeur, raison: e.raison } : null; }
  const c = portee.rang === null ? undefined : corps[portee.rang];
  if (!c || portee.rang === null) return null;
  if (sensReglable(corps, portee.rang)) return { valeur: sensDuCorps(c), raison: null };
  const sansFaitage = c.speciale || formeDuCorpsNommee(c) === 'plat';
  return { valeur: sensDuCorps(c), raison: sansFaitage ? RAISON_SANS_FAITAGE : 'Ce qui est posé sur ce toit (pignon, lucarne, fenêtre de toit, panneau) n’aurait plus sa place : retirez-le d’abord.' };
}

/** « Tourner » : le faitage passe dans l'autre sens sur la portee. Vrai si le brouillon a change. */
export function tournerLeSens(o: ObjetPlan, portee: Portee): boolean {
  const e = sensDeLaPortee(o, portee);
  if (!e || e.raison) return false;
  const corps = corpsDe(o), autre: Sens = e.valeur === 'long' ? 'court' : 'long';
  if (!rangsDeCorps(corps).length) {
    const t = o.batiment?.toit;
    if (!t) return false;
    t.angleFaitage = (((t.angleFaitage + 90) % 180) + 180) % 180;
    saisir(t);
    return true;
  }
  const neufs = portee.entier ? appliquerAuBatiment(corps, 'sens', autre) : appliquerChoix(corps, { type: 'corps', rang: portee.rang as number, i: 0 }, 'sens', autre);
  if (JSON.stringify(neufs) === JSON.stringify(corps)) return false;
  champsBatiment(o).corpsToit = neufs;
  return true;
}

/** Le sens du faitage, dit a la personne. */
export const MOTS_SENS: Record<Sens, string> = { long: 'Dans la longueur', court: 'En travers' };

// ---------------------------------------------------------------------------------------------------------------------------------------
// Les pieces posees (ce qui s'ajoute)

/** Le corps de la facade regardee ; null sans facade ou sans corps a ce rang. */
const corpsDeLaFacade = (o: ObjetPlan, f: FacadeChoisie | null): CorpsToit | null => (f && f.rang !== null ? corpsDe(o)[f.rang] ?? null : null);

const RAISON_PAS_DE_PIGNON = 'Pas de pignon sur cette façade.';
/** Les formes dont le toit ne dresse pas de pignon sur son long pan : plat, papillon et pavillon n'ont pas de faitage qui y mene. */
const FORMES_SANS_PIGNON = new Set(['plat', 'papillon', 'pavillon']);
/** Ce qui manque pour poser une piece sur un toit qui n'est pas encore en corps : le geste qui leve l'impasse est `decoupe`. */
export const RAISON_SANS_CORPS = 'Le toit n’est pas encore découpé en corps : découpez-le d’abord (« Découper ce toit »).';

/** Pourquoi la piece `id` n'a pas de sens ici ; null quand elle en a. Une forme en a toujours (elle modifie, `poserForme`). */
export function raisonDePiece(o: ObjetPlan, id: string, choix: Choix): string | null {
  const p = piece(id);
  if (!p) return 'Geste inconnu.';
  if (!contourDe(o)) return 'Ce bâtiment n’a pas de contour.';
  if (p.famille === 'toit') return null;
  const corps = corpsDe(o);
  // Ajouter ne touche rien d'existant : un toit simple ne devient pas des corps en silence pour qu'une piece s'y pose.
  if (!rangsDeCorps(corps).length) return RAISON_SANS_CORPS;
  const portee = porteeDuGeste(corps, choix), c = portee.rang === null ? corpsPrincipal(o) : corps[portee.rang] ?? null;
  if (id === 'facade:travee' || id === 'facade:decroche') {
    const f = choix.facade;
    if (!f || f.rang === null) return 'Regardez d’abord la façade où poser ' + (id === 'facade:travee' ? 'la travée' : 'le décroché') + ' : touchez son mur dans la Vue 3D.';
    if (corps[f.rang]?.saillie) return (id === 'facade:travee' ? 'Une travée' : 'Un décroché') + ' se pose sur le mur d’un corps, pas sur un élément de façade.';
    if (portee.rang !== null && portee.rang !== f.rang) return 'La façade regardée n’est pas celle du corps choisi.';
    return null;
  }
  if (p.famille === 'corps') return c && !corpsNeuf(c, id.split(':')[1] as GenreCorps, corps) ? 'Pas de place contre ce corps.' : null;
  if (id === 'sur:pignon') {
    if (c && formeDuCorps(c) === 'appentis') return 'Un appentis n’a pas de pignon sur son long pan.';
    const f = choix.facade;
    if (f && f.rang !== null && corpsDeLaFacade(o, f) === c && f.mur % 2 === 1) return RAISON_PAS_DE_PIGNON;
    return c && !c.speciale && FORMES_SANS_PIGNON.has(formeDuCorps(c)) ? RAISON_PAS_DE_PIGNON : null;
  }
  return null;
}

/** Une lucarne neuve sur le pan 0 : la largeur de son type et sa hauteur, celles de l'audit (elementsDesMurs.ts, source unique). */
function lucarneSur(c: CorpsToit, type: TypeLucarne): Lucarne {
  const r = repere(c.pts);
  const deja = (c.lucarnes ?? []).filter((l) => l.pan === 0).length;
  const centre = (r.L * (deja + 1)) / (deja + 2), demi = largeurDeLucarne(type) / 2;
  return { type, pan: 0, debutM: dixieme(centre - demi), finM: dixieme(centre + demi), faitageM: Math.min(dixieme(c.faitage - 0.2), faitageDeLucarne(c, 0)), profondeurM: PROFONDEUR_LUCARNE_M, source: 'observation' };
}

/** Une souche neuve sur le faitage, de la section et du debouche de l'audit (elementsDesMurs.ts) ; la suivante se range a cote. */
function chemineeSur(c: CorpsToit): Cheminee {
  const r = repere(c.pts);
  const n = c.cheminees?.length ?? 0;
  const p = point(r, r.L * Math.max(0.1, 0.7 - 0.25 * n), c.posFaitage);
  return { x: dixieme(p.x), y: dixieme(p.y), ...SOUCHE, sommetM: sommetDeSouche(c), position: 'faitage', source: 'observation' };
}

/** Une fenetre de toit ou un panneau solaire, au milieu du pan 0 ; le suivant se range a cote du precedent. */
function elementSur(c: CorpsToit, type: 'fenetre-toit' | 'solaire'): ElementDeToit {
  const r = repere(c.pts);
  const deja = (c.elementsToit ?? []).filter((e) => e.pan === 0).length;
  return { type, pan: 0, sM: dixieme((r.L * (deja + 1)) / (deja + 2)), dM: dixieme(Math.max(c.posFaitage, 0.5) / 2) };
}

function pignonSur(c: CorpsToit, pan: 0 | 1 = 0): PignonToit {
  const r = repere(c.pts);
  const largeur = Math.min(3.2, r.L / 2);
  const sur = c.pignons.some((p) => p.pan === pan && p.debut < largeur * 0.9);
  const debut = sur ? r.L - largeur : 0;
  return { pan, debut: dixieme(debut), fin: dixieme(debut + largeur), faitage: c.faitage, profondeur: dixieme(Math.max(c.posFaitage, r.W - c.posFaitage)) };
}

/**
 * Pose la piece `id` (un corps, ce qui va sur le toit, ce qui va contre un mur, une travee) sur la portee, sans toucher a ce qui existe :
 * une piece s'ajoute a la fin d'une liste. Une piece de mur va sur le mur de la facade regardee quand elle est au corps vise, sinon sur
 * son mur libre. Vrai si le brouillon a change. Le decroche ne se pose pas ici : il attend le point touche (`poserDecroche`).
 */
export function poserPiece(o: ObjetPlan, id: string, choix: Choix): boolean {
  if (raisonDePiece(o, id, choix) || id === 'facade:decroche') return false;
  const p = piece(id);
  if (!p || p.famille === 'toit') return false;
  const corps = corpsDe(o), portee = porteeDuGeste(corps, choix);
  const rang = portee.rang ?? rangPrincipal(corps), hote = corps[rang];
  const f = choix.facade, surLaFacade = !!f && f.rang === rang;
  if (!hote) return false;
  const nom = id.split(':')[1] ?? '';
  const avecCorps = (l: CorpsToit[]) => { champsBatiment(o).corpsToit = l; };
  const remplace = (k: CorpsToit) => avecCorps(corps.map((x, i) => (i === rang ? k : x)));
  if (id === 'facade:travee') {
    const m = (f as FacadeChoisie).mur;
    const coupe = m % 2 === 0 ? coupeParDefaut(hote, m, 'droite') : repere(hote.pts).W / 2;
    remplace({ ...hote, travees: [...(hote.travees ?? []), traveeNeuve(hote, m, coupe, gaucheEnDebut(hote, m))] });
  } else if (p.famille === 'corps') {
    const neuf = corpsNeuf(hote, nom as GenreCorps, corps);
    if (!neuf) return false;
    avecCorps([...corps, neuf]);
  } else if (p.famille === 'sur') {
    if (nom === 'cheminee') remplace({ ...hote, cheminees: [...(hote.cheminees ?? []), chemineeSur(hote)] });
    else if (nom === 'fenetre-toit' || nom === 'solaire') remplace({ ...hote, elementsToit: [...(hote.elementsToit ?? []), elementSur(hote, nom)] });
    else if (nom === 'pignon') remplace({ ...hote, pignons: [...hote.pignons, pignonSur(hote, surLaFacade && f?.mur === 2 ? 1 : 0)] });
    else remplace({ ...hote, lucarnes: [...(hote.lucarnes ?? []), lucarneSur(hote, nom as TypeLucarne)] });
  } else {
    const genre: GenreSaillie = nom.startsWith('bow-') ? 'bow-window' : nom === 'galerie' ? 'galerie' : nom === 'auvent' ? 'auvent' : 'appentis';
    const forme: FormeSaillie = nom === 'bow-arc' ? 'arc' : nom === 'bow-conge' ? 'conge' : nom === 'bow-rectangle' ? 'rectangle' : genre === 'bow-window' ? 'pans' : 'rectangle';
    const d = DEFAUTS_SAILLIE[genre];
    const mur = surLaFacade && f ? f.mur : murLibre(corps, rang);
    const { L } = murDuCorps(hote, mur);
    const b = bornesDeSaillie(hote, { genre, mur, niveau: d.niveau });
    const largeurM = Math.min(d.largeurM, b.largeur.max);
    // Un bow-window arrondi saille davantage : son demi-cercle a besoin de profondeur pour se lire.
    const profondeurM = forme === 'arc' ? Math.min(largeurM / 2, 1.2) : d.profondeurM;
    avecCorps(accorderLesRetraits([...corps, corpsDeSaillie(hote, { genre, hote: rang, mur, centreM: L / 2, largeurM, profondeurM, forme, niveau: d.niveau, toit: d.toit })]));
  }
  champsBatiment(o).modeToit = 'corps';
  saisir(toitOuDefaut(o));
  return true;
}

// ---------------------------------------------------------------------------------------------------------------------------------------
// Les Regles

/**
 * Les champs que la lecture automatique (LiDAR, BD TOPO) recalcule : « Règles » rallumees, ils sont retires et seront relus. Tous sont
 * dans CHAMPS_DU_TOIT : la session les photographie, Abandonner les rend (revue du 28 novembre 2026, constat 1).
 */
export const CHAMPS_RELUS = ['corpsToit', 'volumesToit', 'toitMesure', 'modeToit', 'toitLidarLu'] as const;

/** Rallume la lecture automatique : le batiment redevient lisible, ce que la personne avait regle sera remplace a la prochaine lecture. */
export function reprendreLectureAuto(o: ObjetPlan): void {
  const b = champsBatiment(o) as unknown as Record<string, unknown>;
  delete b.toitFige;
  for (const k of CHAMPS_RELUS) delete b[k];
  if (o.batiment?.toit?.source === 'saisie') o.batiment.toit.source = 'bdtopo';
}

// ---------------------------------------------------------------------------------------------------------------------------------------
// Le resume

/** La forme d'un toit dans la phrase d'etat : « Toit à deux pans ». Une forme rare garde son nom du catalogue. */
function nomDeLaForme(f: FormeToit): string {
  if (f === 'plat') return 'Toit plat';
  if (f === 'appentis') return 'Toit à un pan';
  if (f === 'deux-pans') return 'Toit à deux pans';
  if (f === 'croupes' || f === 'quatre-pans') return 'Toit à quatre pans';
  return LIBELLES_FORME_TOIT[f];
}

/**
 * L'etat du toit en une ligne : « Toit à deux pans · faîtage à 6,8 m » ; plusieurs corps, leur nombre et le faitage le plus haut ; sans
 * corps, le toit simple. Null : rien a dire. L'inspecteur du plan et la carte de la maison touchee le lisent.
 */
export function resumeDuToit(o: ObjetPlan): string | null {
  const corps = corpsDe(o).filter((c) => !c.saillie);
  if (corps.length > 1) return 'Toit en ' + corps.length + ' corps · faîtage à ' + metres(Math.max(...corps.map((c) => c.faitage)));
  const [c] = corps;
  if (c) { const f = formeDuCorpsNommee(c); return nomDeLaForme(f) + (f === 'plat' ? ' · à ' : ' · faîtage à ') + metres(c.faitage); }
  const t = o.batiment?.toit;
  if (!t) return null;
  const egout = egoutDe(o);
  return t.forme === 'plat' ? 'Toit plat · à ' + metres(egout) : nomDeLaForme(t.forme) + ' · faîtage à ' + metres(egout + (t.hauteur ?? 2.5));
}

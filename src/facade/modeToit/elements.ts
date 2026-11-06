// Les elements d'un toit que le mode Toit sait choisir, regler, dupliquer et retirer (MD/spec-mode-toit-3d.md, etape 3).
//
// Un « element » est une chose posee sur le toit ou sur une facade, rangee dans un corps : un bow-window, une galerie ou un appentis
// (un corps qui porte sa `saillie`), un pignon, une lucarne, une cheminee, une fenetre de toit, un panneau solaire. Une `CibleElement` le
// nomme (son type, le rang du corps, son rang dans la liste du corps) ; toutes les operations rendent une NOUVELLE liste de corps, sans
// toucher a l'ancienne, pour que la session empile un instantane propre.
//
// Pur : pas de DOM, pas de scene.

import { point, repere } from '../toits/toitCorps.js';
import { bornerSaillie, murDuCorps, NOM_SAILLIE, replacerSaillie, retirerSaillie, saillieDe } from './saillies.js';
import { rangPrincipal, rangsDeCorps, supprimerCorps } from './corpsNeufs.js';
import { formeDuCorps } from '../regles/toits/faits.js';
import { nomOrientation } from '../../geometry/cotesVusDeDehors.js';
import type { Cheminee, CorpsToit, ElementDeToit, Lucarne, NatureTravee, PignonToit, PtBrut, SaillieFacade, TraveeMur, TypeLucarne } from '../../model/types.js';
import { RECULS_TRAVEE_M } from './travees.js';
import { appliquerBout, groupesBoutsDuCorps, groupesPointe, valeurBout } from './bouts.js';
import { facadesDuBatiment, orientationDe } from './facadesDesCorps.js';

export type TypeElement = 'corps' | 'saillie' | 'pignon' | 'lucarne' | 'cheminee' | 'fenetre-toit' | 'solaire' | 'travee';

export interface CibleElement { type: TypeElement; rang: number; i: number }

export interface ElementListe { cible: CibleElement; libelle: string }

const LIBELLES_LUCARNE: Record<string, string> = {
  jacobine: 'Jacobine', capucine: 'Capucine', 'chien-assis': 'Chien-assis', rampante: 'Lucarne rampante', meuniere: 'Lucarne meunière',
  'oeil-de-boeuf': 'Œil-de-bœuf', outeau: 'Outeau', lanterneau: 'Lanterneau', inconnue: 'Lucarne'
};

const centi = (v: number) => Math.round(v * 100) / 100;

/** Les natures d'une travee, dites a l'inspecteur. */
const LIBELLES_NATURE: Record<NatureTravee, string> = { mur: 'Mur plein', poteaux: 'Ouvert, sur poteaux', 'garde-corps': 'Poteaux et garde-corps', ouvert: 'Ouvert, sans rien' };

/** Le nom d'une travee dans les pastilles et l'inspecteur. */
const LIBELLES_TRAVEE: Record<NatureTravee, string> = { mur: 'Travée de mur', poteaux: 'Travée sur poteaux', 'garde-corps': 'Garde-corps', ouvert: 'Travée ouverte' };
const borne = (v: number, a: number, b: number) => Math.min(Math.max(v, a), b);

/** Tous les elements du batiment, dans l'ordre ou on les presente : ce qui est pose sur une facade, puis ce qui est sur le toit. */
export function listerElements(corps: readonly CorpsToit[]): ElementListe[] {
  const l: ElementListe[] = [];
  // Les corps eux-memes, meme un seul (il se modifie comme les autres : forme, pente, debord, ouvert) : le principal d'abord, puis les
  // autres dans l'ordre ou on les a poses.
  if (rangsDeCorps(corps).length >= 1) rangsDeCorps(corps).forEach((rang, n) => l.push({ cible: { type: 'corps', rang, i: 0 }, libelle: rang === rangPrincipal(corps) ? 'Corps principal' : 'Corps ' + (n + 1) }));
  corps.forEach((c, rang) => { if (c.saillie) l.push({ cible: { type: 'saillie', rang, i: 0 }, libelle: NOM_SAILLIE[c.saillie.genre] }); });
  corps.forEach((c, rang) => c.pignons.forEach((_, i) => l.push({ cible: { type: 'pignon', rang, i }, libelle: 'Pignon' })));
  corps.forEach((c, rang) => (c.lucarnes ?? []).forEach((x, i) => l.push({ cible: { type: 'lucarne', rang, i }, libelle: LIBELLES_LUCARNE[x.type] ?? 'Lucarne' })));
  corps.forEach((c, rang) => (c.cheminees ?? []).forEach((_, i) => l.push({ cible: { type: 'cheminee', rang, i }, libelle: 'Cheminée' })));
  corps.forEach((c, rang) => (c.elementsToit ?? []).forEach((x, i) => l.push({ cible: { type: x.type, rang, i }, libelle: x.type === 'solaire' ? 'Solaire' : 'Fenêtre de toit' })));
  corps.forEach((c, rang) => (c.travees ?? []).forEach((x, i) => l.push({ cible: { type: 'travee', rang, i }, libelle: (x.reculM ?? 0) > 0 ? 'Mur reculé' : LIBELLES_TRAVEE[x.nature] })));
  return l;
}

/**
 * Les pastilles, chacune nommee sans ambiguite (audit de la navigation, 6 novembre 2026) : un element dit son mur (« Pignon sud ») ou, pose
 * sur le toit, le mur au pied de son pan ; sur un batiment a plusieurs corps, le corps qui le porte (« · corps 2 ») ; deux noms encore
 * egaux se numerotent. Les corps gardent leur nom.
 */
export function libellesDesElements(corps: readonly CorpsToit[]): ElementListe[] {
  const liste = listerElements(corps), murs = facadesDuBatiment(corps, []);
  const nomsCorps = new Map(liste.filter((e) => e.cible.type === 'corps').map((e) => [e.cible.rang, e.libelle]));
  const noms = liste.map((e) => {
    if (e.cible.type === 'corps') return e.libelle;
    const c = corps[e.cible.rang], pan = c ? panDe(c, e.cible) : null;
    const m = facadeDeLElement(corps, e.cible) ?? (pan === null ? null : { rang: e.cible.rang, mur: pan === 1 ? 2 : 0 });
    const f = m ? murs.find((x) => x.rang === m.rang && x.mur === m.mur) : undefined;
    const porteur = m?.rang ?? (c?.saillie ? c.saillie.hote : e.cible.rang);
    const nomCorps = nomsCorps.size > 1 ? nomsCorps.get(porteur) : undefined;
    return e.libelle + (f ? ' ' + orientationDe(f).toLowerCase() : '') + (nomCorps ? ' · ' + nomCorps.charAt(0).toLowerCase() + nomCorps.slice(1) : '');
  });
  const total = new Map<string, number>(), vu = new Map<string, number>();
  for (const n of noms) total.set(n, (total.get(n) ?? 0) + 1);
  return liste.map((e, k) => {
    const n = noms[k] as string;
    if ((total.get(n) ?? 0) < 2) return { ...e, libelle: n };
    const rang = (vu.get(n) ?? 0) + 1;
    vu.set(n, rang);
    return { ...e, libelle: n + ' ' + rang };
  });
}

/** Ce que regle un groupe de choix, dit au-dessus de ses boutons : son titre, sinon celui de son nom. */
export function titreDuGroupe(g: GroupeChoix): string {
  return g.titre ?? TITRES_GROUPES[g.groupe] ?? g.groupe;
}

const TITRES_GROUPES: Record<string, string> = {
  forme: 'Forme', niveau: 'Hauteur', toit: 'Toit propre', ouvert: 'Ouvert ou fermé', pente: 'Pente', sens: 'Sens du faîtage',
  debord: 'Débord à l’égout', nature: 'Travée', recul: 'Recul sous le toit', hauteur: 'Hauteur du pignon', saillie: 'Avancée du pignon',
  lucarne: 'Type de lucarne', pan: 'Pan', retrait: 'Retrait des poteaux'
};

export const memeCible = (a: CibleElement | null, b: CibleElement | null): boolean => !!a && !!b && a.type === b.type && a.rang === b.rang && a.i === b.i;

/** L'element que nomme la cible dans cette liste de corps, ou null s'il n'existe plus (une annulation l'a retire). */
export function lireElement(corps: readonly CorpsToit[], t: CibleElement): CorpsToit | SaillieFacade | PignonToit | Lucarne | Cheminee | ElementDeToit | TraveeMur | null {
  const c = corps[t.rang];
  if (!c) return null;
  switch (t.type) {
    case 'corps': return c.saillie ? null : c;
    case 'saillie': return c.saillie ?? null;
    case 'pignon': return c.pignons[t.i] ?? null;
    case 'lucarne': return c.lucarnes?.[t.i] ?? null;
    case 'cheminee': return c.cheminees?.[t.i] ?? null;
    case 'travee': return c.travees?.[t.i] ?? null;
    default: { const e = c.elementsToit?.[t.i]; return e && e.type === t.type ? e : null; }
  }
}

export const libelleElement = (corps: readonly CorpsToit[], t: CibleElement): string => listerElements(corps).find((e) => memeCible(e.cible, t))?.libelle ?? '';

/** Le corps `rang` remplace par `c` ; les autres sont gardes tels quels. */
const avec = (corps: readonly CorpsToit[], rang: number, c: CorpsToit): CorpsToit[] => corps.map((k, i) => (i === rang ? c : k));
const sans = <T>(l: readonly T[] | undefined, i: number): T[] => (l ?? []).filter((_, j) => j !== i);
const remplace = <T>(l: readonly T[] | undefined, i: number, v: T): T[] => (l ?? []).map((x, j) => (j === i ? v : x));

/** Retire l'element. Une saillie retire son corps entier (les rangs suivants descendent d'un). */
export function supprimerElement(corps: readonly CorpsToit[], t: CibleElement): CorpsToit[] {
  const c = corps[t.rang];
  if (!c) return corps.slice();
  if (t.type === 'corps') return supprimerCorps(corps, t.rang);
  if (t.type === 'saillie') return retirerSaillie(corps, t.rang);
  const neuf: CorpsToit = { ...c };
  if (t.type === 'pignon') neuf.pignons = sans(c.pignons, t.i);
  else if (t.type === 'lucarne') { neuf.lucarnes = sans(c.lucarnes, t.i); if (!neuf.lucarnes.length) delete neuf.lucarnes; }
  else if (t.type === 'cheminee') { neuf.cheminees = sans(c.cheminees, t.i); if (!neuf.cheminees.length) delete neuf.cheminees; }
  else if (t.type === 'travee') { neuf.travees = sans(c.travees, t.i); if (!neuf.travees.length) delete neuf.travees; }
  else { neuf.elementsToit = sans(c.elementsToit, t.i); if (!neuf.elementsToit.length) delete neuf.elementsToit; }
  return avec(corps, t.rang, neuf);
}

/** La premiere place libre le long d'un mur ou d'un faitage pour un element de `largeur`, a partir de `depart` : tente a droite puis a gauche. Null : pas de place. */
function placeLibre(longueur: number, largeur: number, depart: number, occupes: readonly [number, number][]): number | null {
  const libre = (centre: number) => centre - largeur / 2 >= 0.1 && centre + largeur / 2 <= longueur - 0.1 && occupes.every(([a, b]) => centre + largeur / 2 <= a - 0.05 || centre - largeur / 2 >= b + 0.05);
  for (let k = 1; k <= 40; k++) for (const sens of [1, -1]) { const c = depart + sens * k * 0.15; if (libre(c)) return centi(c); }
  return null;
}

/** Duplique l'element a cote de lui. Null : pas de place (une facade pleine). Rend les nouveaux corps et la cible de la copie. */
export function dupliquerElement(corps: readonly CorpsToit[], t: CibleElement): { corps: CorpsToit[]; cible: CibleElement } | null {
  const c = corps[t.rang];
  // Une travee ne se double pas : deux travees sur le meme troncon se contrediraient. On en pose une autre, ou on tire ses bords.
  if (!c || t.type === 'travee') return null;
  const r = repere(c.pts);
  if (t.type === 'saillie' && c.saillie) {
    const s = c.saillie, hote = corps[s.hote];
    if (!hote) return null;
    const pris: [number, number][] = corps.filter((k) => k.saillie && k.saillie.hote === s.hote && k.saillie.mur === s.mur).map((k) => [(k.saillie as SaillieFacade).centreM - (k.saillie as SaillieFacade).largeurM / 2, (k.saillie as SaillieFacade).centreM + (k.saillie as SaillieFacade).largeurM / 2]);
    const centre = placeLibre(murDuCorps(hote, s.mur).L, s.largeurM, s.centreM, pris);
    if (centre === null) return null;
    const copie = replacerSaillie([...corps, { ...c }], corps.length, { centreM: centre });
    return { corps: copie, cible: { type: 'saillie', rang: corps.length, i: 0 } };
  }
  if (t.type === 'pignon') {
    const p = c.pignons[t.i];
    if (!p) return null;
    const pris: [number, number][] = c.pignons.filter((x) => x.pan === p.pan).map((x) => [x.debut, x.fin]);
    const centre = placeLibre(r.L, p.fin - p.debut, (p.debut + p.fin) / 2, pris);
    if (centre === null) return null;
    const demi = (p.fin - p.debut) / 2;
    return { corps: avec(corps, t.rang, { ...c, pignons: [...c.pignons, { ...p, debut: centi(centre - demi), fin: centi(centre + demi) }] }), cible: { type: 'pignon', rang: t.rang, i: c.pignons.length } };
  }
  if (t.type === 'lucarne') {
    const l = c.lucarnes?.[t.i];
    if (!l) return null;
    const pris: [number, number][] = (c.lucarnes ?? []).filter((x) => x.pan === l.pan).map((x) => [x.debutM, x.finM]);
    const centre = placeLibre(r.L, l.finM - l.debutM, (l.debutM + l.finM) / 2, pris);
    if (centre === null) return null;
    const demi = (l.finM - l.debutM) / 2;
    return { corps: avec(corps, t.rang, { ...c, lucarnes: [...(c.lucarnes ?? []), { ...l, debutM: centi(centre - demi), finM: centi(centre + demi) }] }), cible: { type: 'lucarne', rang: t.rang, i: (c.lucarnes ?? []).length } };
  }
  if (t.type === 'cheminee') {
    const h = c.cheminees?.[t.i];
    if (!h) return null;
    // Une souche de plus, a un metre et demi le long du faitage (de l'autre cote si on sort du corps).
    const dx = r.u.x * 1.5, dy = r.u.y * 1.5;
    const sortie = (q: PtBrut) => (q.x - r.p0.x) * r.u.x + (q.y - r.p0.y) * r.u.y;
    const sens = sortie({ x: h.x + dx, y: h.y + dy }) <= r.L - 0.3 ? 1 : -1;
    return { corps: avec(corps, t.rang, { ...c, cheminees: [...(c.cheminees ?? []), { ...h, x: centi(h.x + sens * dx), y: centi(h.y + sens * dy) }] }), cible: { type: 'cheminee', rang: t.rang, i: (c.cheminees ?? []).length } };
  }
  const e = c.elementsToit?.[t.i];
  if (!e) return null;
  const dim = e.type === 'solaire' ? 2.55 : 0.8, w = dim * (e.echelle ?? 1);
  const pris: [number, number][] = (c.elementsToit ?? []).filter((x) => x.pan === e.pan).map((x) => { const wx = (x.type === 'solaire' ? 2.55 : 0.8) * (x.echelle ?? 1); return [x.sM - wx / 2, x.sM + wx / 2]; });
  const centre = placeLibre(r.L, w, e.sM, pris);
  if (centre === null) return null;
  return { corps: avec(corps, t.rang, { ...c, elementsToit: [...(c.elementsToit ?? []), { ...e, sM: centre }] }), cible: { type: e.type, rang: t.rang, i: (c.elementsToit ?? []).length } };
}

/** Agrandit (+1) ou reduit (-1) l'element d'un cran. Les bornes sont celles de la maquette : un pignon de 1,4 a 8 m, un bow-window de 1,2 a 6 m, un element de 0,5 a 2,2. */
export function redimensionnerElement(corps: readonly CorpsToit[], t: CibleElement, sens: 1 | -1): CorpsToit[] {
  const c = corps[t.rang];
  // Une travee se regle par ses poignees (ses deux bords), pas par un cran.
  if (!c || t.type === 'travee') return corps.slice();
  const r = repere(c.pts);
  if (t.type === 'saillie' && c.saillie) {
    const h = corps[c.saillie.hote];
    const largeur = borne(c.saillie.largeurM + sens * 0.3, 1.2, 6);
    return h ? replacerSaillie(corps, t.rang, bornerSaillie(h, { ...c.saillie, largeurM: largeur })) : corps.slice();
  }
  if (t.type === 'pignon') {
    const p = c.pignons[t.i];
    if (!p) return corps.slice();
    const milieu = (p.debut + p.fin) / 2, demi = borne((p.fin - p.debut) / 2 + (sens * 0.3) / 2, 0.7, 4);
    const debut = borne(milieu - demi, 0, r.L - 2 * demi), fin = debut + 2 * demi;
    return avec(corps, t.rang, { ...c, pignons: remplace(c.pignons, t.i, { ...p, debut: centi(debut), fin: centi(fin) }) });
  }
  if (t.type === 'lucarne') {
    const l = c.lucarnes?.[t.i];
    if (!l) return corps.slice();
    const milieu = (l.debutM + l.finM) / 2, demi = borne((l.finM - l.debutM) / 2 + sens * 0.15, 0.3, 2);
    return avec(corps, t.rang, { ...c, lucarnes: remplace(c.lucarnes, t.i, { ...l, debutM: centi(milieu - demi), finM: centi(milieu + demi) }) });
  }
  if (t.type === 'cheminee') {
    const h = c.cheminees?.[t.i];
    if (!h) return corps.slice();
    return avec(corps, t.rang, { ...c, cheminees: remplace(c.cheminees, t.i, { ...h, largeurM: centi(borne(h.largeurM + sens * 0.1, 0.4, 1.5)), profondeurM: centi(borne(h.profondeurM + sens * 0.1, 0.4, 1.5)) }) });
  }
  const e = c.elementsToit?.[t.i];
  if (!e) return corps.slice();
  return avec(corps, t.rang, { ...c, elementsToit: remplace(c.elementsToit, t.i, { ...e, echelle: centi(borne((e.echelle ?? 1) + sens * 0.15, 0.5, 2.2)) }) });
}

/** Un choix a image qui se regle sur l'element : le groupe (« forme », « niveau »…) et ses valeurs. */
export interface GroupeChoix { groupe: string; valeurs: { valeur: string; libelle: string }[]; /** Ce que le groupe regle, dit a l'ecran (absent : le nom du groupe). */ titre?: string }

/** Les avancees que l'inspecteur propose a un pignon, en metres (la poignee regle tout entre 0 et le maximum). */
const SAILLIES_PIGNON = [0, 0.5, 1, 1.5];

/**
 * Les lucarnes du catalogue, dans l'ordre de l'onglet « Sur le toit » (three/catalogueToits.ts) : changer le type d'une lucarne posee
 * offre les memes pieces que la poser. Le lanterneau va sur un toit plat, les autres sur un pan.
 */
export const TYPES_LUCARNE_EN_PENTE: readonly TypeLucarne[] = ['jacobine', 'capucine', 'chien-assis', 'rampante', 'meuniere', 'oeil-de-boeuf', 'outeau'];

/** Un corps du toit, pas un element de facade, dont le toit n'a qu'un pan : ce que « ouvert / ferme » regle (comme l'inspecteur, ui/champs/facade.ts). */
export const estCorpsAppentis = (c: CorpsToit | undefined): c is CorpsToit => !!c && !c.saillie && formeDuCorps(c) === 'appentis';

/** Un pan plus etroit que cela n'en est pas un : un element ne s'y pose pas (le pan nul d'un appentis). */
const PAN_MIN_M = 1;

/** Les deux pans du corps ont-ils de quoi porter un element ? Pas un appentis, pas un toit plat. */
function deuxPans(c: CorpsToit): boolean {
  const W = repere(c.pts).W;
  return formeDuCorps(c) !== 'plat' && c.posFaitage >= PAN_MIN_M && W - c.posFaitage >= PAN_MIN_M;
}

/** Le nom du pan d'un corps par l'orientation de sa pente (« Pan sud ») : sa normale sort du corps, vers -v pour le pan 0, +v pour le pan 1. */
function nomDuPan(c: CorpsToit, pan: 0 | 1): string {
  const r = repere(c.pts), n = pan === 0 ? { x: -r.v.x, y: -r.v.y } : r.v;
  // Le plan a l'est vers +x et le nord vers +y : l'azimut se compte depuis le nord, dans le sens des aiguilles d'une montre.
  return 'Pan ' + nomOrientation((Math.atan2(n.x, n.y) * 180) / Math.PI).toLowerCase();
}

/** Les pentes que l'inspecteur propose a un corps, en degres (la poignee du faitage regle tout le reste). */
const PENTES_DEG = [15, 25, 35, 45, 55];
/** Les debords a l'egout proposes, en metres : 0,35 m est celui du dessin quand rien n'est dit. */
const DEBORDS_M = [0, 0.2, 0.35, 0.6];
const DEBORD_DESSIN_M = 0.35;

/** Le pan qui regle la pente : le seul d'un appentis, sinon celui de l'egout le plus bas. Sa largeur a plat, en metres. */
function largeurDuPanBas(c: CorpsToit): number {
  const W = repere(c.pts).W;
  if (formeDuCorps(c) === 'appentis') return W;
  return c.egouts[0] <= c.egouts[1] ? c.posFaitage : W - c.posFaitage;
}

/** Une pente droite se regle : pas un toit plat, pas un toit de revolution, pas un profil brise ou courbe (sa pente n'est pas une). */
const penteReglable = (c: CorpsToit): boolean => !c.speciale && !c.profil && formeDuCorps(c) !== 'plat' && largeurDuPanBas(c) > 0.3;

/** La pente du pan bas, en degres. */
const penteDe = (c: CorpsToit): number => (Math.atan2(c.faitage - Math.min(...c.egouts), largeurDuPanBas(c)) * 180) / Math.PI;

/**
 * Le sens du faitage se change sur un corps a deux pans ou a croupes, faitage au milieu, sans rien de pose qui se compte le long du faitage
 * (pignon, lucarne, fenetre de toit, element de facade) : tourne, tout cela serait a une place qui n'a plus de sens.
 */
function sensReglable(corps: readonly CorpsToit[], rang: number): boolean {
  const c = corps[rang];
  if (!c || c.saillie || c.speciale || c.profil || c.bouts || c.pignons.length || c.lucarnes?.length || c.elementsToit?.length) return false;
  if (corps.some((k) => k.saillie?.hote === rang)) return false;
  const f = formeDuCorps(c), W = repere(c.pts).W;
  return (f === 'deux-pans' || f === 'croupes') && Math.abs(c.posFaitage - W / 2) <= 0.05;
}

/** La pente `deg` sur le pan bas : le faitage monte ou descend, les egouts restent ; ce qui monte au faitage le suit. */
function avecPente(c: CorpsToit, deg: number): CorpsToit {
  const bas = Math.min(...c.egouts);
  const faitage = centi(Math.max(bas + Math.tan((deg * Math.PI) / 180) * largeurDuPanBas(c), Math.max(...c.egouts) + 0.3));
  const neuf: CorpsToit = { ...c, faitage, pignons: c.pignons.map((g) => (g.faitage >= c.faitage - 0.05 ? { ...g, faitage } : { ...g, faitage: Math.min(g.faitage, faitage) })) };
  if (c.lucarnes) neuf.lucarnes = c.lucarnes.map((l) => ({ ...l, faitageM: Math.min(l.faitageM, centi(faitage - 0.1)) }));
  return neuf;
}

/** Le faitage passe sur l'autre cote du rectangle : les sommets tournent d'un cran, le faitage reste au milieu, les hauteurs restent. */
function avecSens(c: CorpsToit, sens: string): CorpsToit {
  const r = repere(c.pts);
  if ((sens === 'long') === (r.L >= r.W)) return c;
  const neuf: CorpsToit = { ...c, pts: [c.pts[1], c.pts[2], c.pts[3], c.pts[0]] as PtBrut[], posFaitage: centi(r.L / 2) };
  // Une croupe ne depasse pas la moitie du nouveau faitage.
  if (c.croupes) neuf.croupes = [Math.min(c.croupes[0], r.W / 2), Math.min(c.croupes[1], r.W / 2)];
  return neuf;
}

/** Le retrait d'un appentis : du mur ferme depuis le bord de l'egout, ou des poteaux d'un appentis ouvert. */
function groupeRetrait(ouvert: boolean | undefined): GroupeChoix {
  const quoi = ouvert ? 'Poteaux' : 'Mur';
  return { groupe: 'retrait', valeurs: [{ valeur: '0', libelle: ouvert ? 'Poteaux au bord de l’égout' : 'Mur droit' }, { valeur: '0.5', libelle: quoi + ' reculé de 0,5 m' }, { valeur: '1', libelle: quoi + ' reculé de 1 m' }] };
}

/**
 * Les groupes de choix de l'element, dans l'ordre de la maquette : bow-window (forme, niveau, toit), galerie/appentis (ouvert, retrait),
 * pignon (hauteur), et ce que la pose a choisi et qui se change ensuite (decision du proprietaire, 4 novembre 2026 : « je veux pouvoir
 * modifier un batiment avec les memes fonctions ») : un corps en appentis ouvert ou ferme, le type d'une lucarne, le pan qui porte une
 * lucarne, une fenetre de toit ou un panneau.
 */
export function groupesDe(corps: readonly CorpsToit[], t: CibleElement): GroupeChoix[] {
  const c = corps[t.rang];
  if (t.type === 'saillie' && c?.saillie) {
    if (c.saillie.genre === 'bow-window') return [
      { groupe: 'forme', valeurs: [{ valeur: 'pans', libelle: 'Pans coupés' }, { valeur: 'rectangle', libelle: 'Rectangle' }, { valeur: 'arc', libelle: 'Arc de cercle' }, { valeur: 'conge', libelle: 'Rectangle arrondi' }] },
      { groupe: 'niveau', valeurs: [{ valeur: 'rdc', libelle: 'Sous le premier étage' }, { valeur: 'toit', libelle: 'Monte jusqu’au toit' }] },
      { groupe: 'toit', valeurs: [{ valeur: 'pan', libelle: 'Toit à un pan' }, { valeur: 'plat', libelle: 'Toit plat' }, { valeur: 'pavillon', libelle: 'Toit en pointe' }, { valeur: 'aucun', libelle: 'Sans toit propre (sous un auvent)' }] }
    ];
    return [
      { groupe: 'ouvert', valeurs: [{ valeur: 'poteaux', libelle: 'Sur poteaux' }, { valeur: 'mur', libelle: 'Fermée' }] },
      groupeRetrait(false)
    ];
  }
  if (t.type === 'corps' && c && !c.saillie) {
    const l: GroupeChoix[] = [];
    // Un corps a un pan (une aile, un garage, un appentis lu sur le LiDAR) s'ouvre sur poteaux : un preau, un abri, un carport accole.
    if (estCorpsAppentis(c)) {
      l.push({ groupe: 'ouvert', valeurs: [{ valeur: 'poteaux', libelle: 'Ouvert : sur poteaux, sans mur' }, { valeur: 'mur', libelle: 'Fermé : des murs jusqu’au sol' }] });
      if (c.ouvert !== undefined) l.push(groupeRetrait(c.ouvert));
    }
    if (penteReglable(c)) l.push({ groupe: 'pente', valeurs: PENTES_DEG.map((v) => ({ valeur: String(v), libelle: 'Pente de ' + v + '°' })) });
    if (sensReglable(corps, t.rang)) l.push({ groupe: 'sens', valeurs: [{ valeur: 'long', libelle: 'Faîtage dans la longueur' }, { valeur: 'court', libelle: 'Faîtage dans la largeur' }] });
    if (!c.speciale) l.push({ groupe: 'debord', valeurs: DEBORDS_M.map((v) => ({ valeur: String(v), libelle: v === 0 ? 'Sans débord' : 'Débord de ' + String(v).replace('.', ',') + ' m' })) });
    // Chaque bout du faitage (pignon, croupe, cul de geai) et la queue de vache de chaque pan (bouts.ts, schema 15).
    l.push(...groupesBoutsDuCorps(c));
    return l;
  }
  if (t.type === 'travee') {
    const k = c?.travees?.[t.i];
    if (!k) return [];
    const l: GroupeChoix[] = [{ groupe: 'nature', valeurs: (['mur', 'poteaux', 'garde-corps', 'ouvert'] as const).map((v) => ({ valeur: v, libelle: LIBELLES_NATURE[v] })) }];
    // Seul un mur plein recule sous le toit.
    if (k.nature === 'mur') l.push({ groupe: 'recul', valeurs: RECULS_TRAVEE_M.map((v) => ({ valeur: String(v), libelle: v === 0 ? 'Au nu du mur' : 'Reculé de ' + String(v).replace('.', ',') + ' m sous le toit' })) });
    return l;
  }
  if (t.type === 'pignon') return [
    { groupe: 'hauteur', valeurs: [{ valeur: 'faitage', libelle: 'Monte au faîtage' }, { valeur: 'bas', libelle: 'Plus bas que le faîtage' }] },
    { groupe: 'saillie', valeurs: [{ valeur: '0', libelle: 'Au nu du mur' }, { valeur: '0.5', libelle: 'Avance de 0,5 m' }, { valeur: '1', libelle: 'Avance de 1 m' }, { valeur: '1.5', libelle: 'Avance de 1,5 m' }] },
    // Sa pointe : en triangle, ou coupee en cul de geai (schema 15).
    ...(c && c.pignons[t.i] ? groupesPointe(c, c.pignons[t.i] as PignonToit) : [])
  ];
  const l: GroupeChoix[] = [];
  if (t.type === 'lucarne' && c && formeDuCorps(c) !== 'plat') l.push({ groupe: 'lucarne', valeurs: TYPES_LUCARNE_EN_PENTE.map((v) => ({ valeur: v, libelle: LIBELLES_LUCARNE[v] ?? v })) });
  if ((t.type === 'lucarne' || t.type === 'fenetre-toit' || t.type === 'solaire') && c && deuxPans(c)) {
    l.push({ groupe: 'pan', valeurs: ([0, 1] as const).map((p) => ({ valeur: String(p), libelle: nomDuPan(c, p) })) });
  }
  return l;
}

/** Le pan qui porte l'element pose sur le toit, ou null. */
function panDe(c: CorpsToit, t: CibleElement): 0 | 1 | null {
  if (t.type === 'lucarne') return c.lucarnes?.[t.i]?.pan ?? null;
  if (t.type === 'fenetre-toit' || t.type === 'solaire') { const e = c.elementsToit?.[t.i]; return e && e.type === t.type ? e.pan : null; }
  return null;
}

/** La valeur la plus proche de `r` parmi les retraits proposes : celle qui est enfoncee. */
const retraitProche = (r: number): string => [0, 0.5, 1].reduce((m, v) => (Math.abs(v - r) < Math.abs(m - r) ? v : m), 0).toString();

/** La valeur courante d'un groupe : celle qui est enfoncee dans l'inspecteur. */
export function valeurDuGroupe(corps: readonly CorpsToit[], t: CibleElement, groupe: string): string | null {
  const c = corps[t.rang];
  if (!c) return null;
  const bout = (t.type === 'corps' || t.type === 'pignon') && !c.saillie ? valeurBout(c, groupe, t.type === 'pignon' ? c.pignons[t.i] ?? null : null) : undefined;
  if (bout !== undefined) return bout;
  if (t.type === 'saillie' && c.saillie) {
    const s = c.saillie;
    if (groupe === 'forme') return s.forme;
    if (groupe === 'niveau') return s.niveau;
    if (groupe === 'toit') return s.toit;
    if (groupe === 'ouvert') return c.ouvert === false ? 'mur' : 'poteaux';
    if (groupe === 'retrait') return retraitProche(c.retraitM ?? 0);
  }
  if (t.type === 'corps' && estCorpsAppentis(c)) {
    // Sans indication (le dessin du toit seul, un corps lu sur le LiDAR) : aucun choix n'est enfonce, rien n'est suppose.
    if (groupe === 'ouvert') return c.ouvert === true ? 'poteaux' : c.ouvert === false ? 'mur' : null;
    if (groupe === 'retrait') return c.ouvert === undefined ? null : retraitProche(c.retraitM ?? 0);
  }
  if (t.type === 'corps' && !c.saillie) {
    // La pente lue n'est enfoncee que si elle tombe sur un choix (a 2 degres pres) : rien n'est arrondi en silence.
    if (groupe === 'pente') { const p = penteDe(c), v = PENTES_DEG.find((x) => Math.abs(x - p) <= 2); return v === undefined ? null : String(v); }
    if (groupe === 'sens') { const r = repere(c.pts); return r.L >= r.W ? 'long' : 'court'; }
    if (groupe === 'debord') { const d = c.bords?.debordEgoutM ?? DEBORD_DESSIN_M, v = DEBORDS_M.find((x) => Math.abs(x - d) <= 0.02); return v === undefined ? null : String(v); }
  }
  if (t.type === 'pignon' && groupe === 'hauteur') {
    const p = c.pignons[t.i];
    return p ? (p.faitage >= c.faitage - 0.05 ? 'faitage' : 'bas') : null;
  }
  if (t.type === 'pignon' && groupe === 'saillie') {
    const p = c.pignons[t.i], r = p?.saillieM ?? 0;
    return p ? SAILLIES_PIGNON.reduce((m, v) => (Math.abs(v - r) < Math.abs(m - r) ? v : m), 0).toString() : null;
  }
  if (t.type === 'lucarne' && groupe === 'lucarne') return c.lucarnes?.[t.i]?.type ?? null;
  if (t.type === 'travee') {
    const k = c.travees?.[t.i];
    if (!k) return null;
    if (groupe === 'nature') return k.nature;
    if (groupe === 'recul') { const r = k.reculM ?? 0, v = RECULS_TRAVEE_M.find((x) => Math.abs(x - r) <= 0.02); return v === undefined ? null : String(v); }
  }
  if (groupe === 'pan') { const p = panDe(c, t); return p === null ? null : String(p); }
  return null;
}

/**
 * Passe l'element sur l'autre pan du corps, a la meme place le long du faitage : ce qui se compte depuis l'egout est borne a la largeur
 * du nouveau pan, une lucarne reste sous le faitage et au-dessus de son egout.
 */
function changerDePan(corps: readonly CorpsToit[], t: CibleElement, pan: 0 | 1): CorpsToit[] {
  const c = corps[t.rang] as CorpsToit, W = repere(c.pts).W;
  const largeur = pan === 0 ? c.posFaitage : W - c.posFaitage;
  if (t.type === 'lucarne') {
    const l = c.lucarnes?.[t.i];
    if (!l || l.pan === pan) return corps.slice();
    const faitageM = centi(borne(l.faitageM, Math.min(c.egouts[pan] + 0.6, c.faitage - 0.1), c.faitage - 0.1));
    return avec(corps, t.rang, { ...c, lucarnes: remplace(c.lucarnes, t.i, { ...l, pan, faitageM, profondeurM: centi(Math.min(l.profondeurM, Math.max(largeur - 0.2, 0.3))) }) });
  }
  const e = c.elementsToit?.[t.i];
  if (!e || e.type !== t.type || e.pan === pan) return corps.slice();
  return avec(corps, t.rang, { ...c, elementsToit: remplace(c.elementsToit, t.i, { ...e, pan, dM: centi(borne(e.dM, 0.3, Math.max(largeur - 0.3, 0.3))) }) });
}

/** Ecrit le choix d'un groupe sur l'element. Rend la liste inchangee (copie) si la valeur n'a pas de sens. */
export function appliquerChoix(corps: readonly CorpsToit[], t: CibleElement, groupe: string, valeur: string): CorpsToit[] {
  const c = corps[t.rang];
  if (!c) return corps.slice();
  if ((t.type === 'corps' || t.type === 'pignon') && !c.saillie && /^(bout|coupe|debordFaitage|qdv|penteCoyau|pointe)[01]?$/.test(groupe)) {
    const neuf = appliquerBout(c, groupe, valeur, t.type === 'pignon' ? t.i : null);
    return neuf ? avec(corps, t.rang, neuf) : corps.slice();
  }
  if (t.type === 'saillie' && c.saillie) {
    if (groupe === 'forme' && ['pans', 'rectangle', 'arc', 'conge'].includes(valeur)) return replacerSaillie(corps, t.rang, { forme: valeur as SaillieFacade['forme'] });
    if (groupe === 'niveau' && (valeur === 'rdc' || valeur === 'toit')) return replacerSaillie(corps, t.rang, { niveau: valeur, hauteurM: undefined });
    if (groupe === 'toit' && (valeur === 'pan' || valeur === 'plat' || valeur === 'pavillon' || valeur === 'aucun')) return replacerSaillie(corps, t.rang, { toit: valeur });
    if (groupe === 'ouvert') {
      // Poteaux ou mur : la galerie est ouverte, l'appentis ferme ; le genre suit pour que le nom de la ligne reste juste.
      const ouvert = valeur === 'poteaux';
      const neuf = replacerSaillie(corps, t.rang, { genre: ouvert ? 'galerie' : 'appentis' });
      return neuf.map((k, i) => (i === t.rang ? { ...k, ouvert, ...(c.retraitM !== undefined ? { retraitM: c.retraitM } : {}) } : k));
    }
    if (groupe === 'retrait' && ['0', '0.5', '1'].includes(valeur)) {
      const m = Number(valeur), neuf = { ...c };
      // Zero n'est pas « absent » pour une galerie neuve (0,5 m a la pose) : on l'ecrit.
      neuf.retraitM = m;
      return avec(corps, t.rang, neuf);
    }
  }
  if (t.type === 'corps' && estCorpsAppentis(c)) {
    // Le corps garde son rectangle, son toit et ce qui est pose dessus : seul ce qui le porte change (poteaux ou murs).
    if (groupe === 'ouvert' && (valeur === 'poteaux' || valeur === 'mur')) return avec(corps, t.rang, { ...c, ouvert: valeur === 'poteaux' });
    if (groupe === 'retrait' && c.ouvert !== undefined && ['0', '0.5', '1'].includes(valeur)) return avec(corps, t.rang, { ...c, retraitM: Number(valeur) });
  }
  if (t.type === 'corps' && !c.saillie) {
    if (groupe === 'pente' && penteReglable(c) && PENTES_DEG.includes(Number(valeur))) return avec(corps, t.rang, avecPente(c, Number(valeur)));
    if (groupe === 'sens' && (valeur === 'long' || valeur === 'court') && sensReglable(corps, t.rang)) return avec(corps, t.rang, avecSens(c, valeur));
    if (groupe === 'debord' && !c.speciale && DEBORDS_M.includes(Number(valeur))) return avec(corps, t.rang, { ...c, bords: { ...c.bords, debordEgoutM: Number(valeur) } });
    return corps.slice();
  }
  if (t.type === 'pignon' && groupe === 'saillie' && ['0', '0.5', '1', '1.5'].includes(valeur)) {
    const p = c.pignons[t.i];
    return p ? avec(corps, t.rang, { ...c, pignons: remplace(c.pignons, t.i, saillieDe(p, Number(valeur))) }) : corps.slice();
  }
  if (t.type === 'pignon' && groupe === 'hauteur') {
    const p = c.pignons[t.i];
    if (!p) return corps.slice();
    const e = Math.min(...c.egouts), bas = Math.max(e + 0.8, c.faitage - 1.1);
    const faitage = valeur === 'bas' ? centi(Math.min(bas, c.faitage)) : c.faitage;
    return avec(corps, t.rang, { ...c, pignons: remplace(c.pignons, t.i, { ...p, faitage }) });
  }
  if (t.type === 'lucarne' && groupe === 'lucarne' && (TYPES_LUCARNE_EN_PENTE as readonly string[]).includes(valeur)) {
    // Le type seul change : la lucarne garde sa place, sa largeur et sa hauteur, que les poignees reglent.
    const l = c.lucarnes?.[t.i];
    return l ? avec(corps, t.rang, { ...c, lucarnes: remplace(c.lucarnes, t.i, { ...l, type: valeur as TypeLucarne }) }) : corps.slice();
  }
  if (groupe === 'pan' && (valeur === '0' || valeur === '1') && deuxPans(c)) return changerDePan(corps, t, valeur === '0' ? 0 : 1);
  if (t.type === 'travee' && c.travees?.[t.i]) {
    const k = c.travees[t.i] as TraveeMur;
    let neuve: TraveeMur | null = null;
    if (groupe === 'nature' && (valeur === 'mur' || valeur === 'poteaux' || valeur === 'garde-corps' || valeur === 'ouvert')) {
      // Le recul ne vaut que pour un mur plein : il part avec une autre nature.
      neuve = { mur: k.mur, de: k.de, a: k.a, nature: valeur, ...(valeur === 'mur' && k.reculM ? { reculM: k.reculM } : {}) };
    }
    if (groupe === 'recul' && k.nature === 'mur' && RECULS_TRAVEE_M.includes(Number(valeur))) {
      neuve = { mur: k.mur, de: k.de, a: k.a, nature: 'mur', ...(Number(valeur) > 0 ? { reculM: Number(valeur) } : {}) };
    }
    if (neuve) return avec(corps, t.rang, { ...c, travees: remplace(c.travees, t.i, neuve) });
  }
  return corps.slice();
}

/** Distance d'un point au segment ab. */
function distanceSegment(p: PtBrut, a: PtBrut, b: PtBrut): number {
  const vx = b.x - a.x, vy = b.y - a.y, l2 = vx * vx + vy * vy || 1;
  const t = borne(((p.x - a.x) * vx + (p.y - a.y) * vy) / l2, 0, 1);
  return Math.hypot(p.x - (a.x + vx * t), p.y - (a.y + vy * t));
}

/** Distance d'un point a un polygone (zero a l'interieur). */
function distancePolygone(p: PtBrut, pts: readonly PtBrut[]): number {
  let dedans = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i] as PtBrut, b = pts[j] as PtBrut;
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) dedans = !dedans;
  }
  if (dedans) return 0;
  return Math.min(...pts.map((a, i) => distanceSegment(p, a, pts[(i + 1) % pts.length] as PtBrut)));
}

/** L'element le plus proche d'un point du plan, a moins de `tolerance` metres ; null s'il n'y en a pas (le toucher vise un mur). */
export function elementProche(corps: readonly CorpsToit[], p: PtBrut, tolerance = 0.6): CibleElement | null {
  let meilleur: CibleElement | null = null, dmin = tolerance;
  const essayer = (cible: CibleElement, d: number) => { if (d <= dmin) { dmin = d; meilleur = cible; } };
  corps.forEach((c, rang) => {
    const r = repere(c.pts);
    if (c.saillie) essayer({ type: 'saillie', rang, i: 0 }, distancePolygone(p, c.pts));
    // Sur le pan : le point au milieu du pan, a la distance de l'egout de l'element (a plat), le long du faitage.
    const sur = (pan: 0 | 1, s: number, d: number): PtBrut => point(r, s, pan === 0 ? d : r.W - d);
    c.pignons.forEach((g, i) => essayer({ type: 'pignon', rang, i }, distanceSegment(p, sur(g.pan, g.debut, 0), sur(g.pan, g.fin, 0))));
    (c.lucarnes ?? []).forEach((l, i) => essayer({ type: 'lucarne', rang, i }, distanceSegment(p, sur(l.pan, l.debutM, l.profondeurM / 2), sur(l.pan, l.finM, l.profondeurM / 2))));
    (c.cheminees ?? []).forEach((h, i) => essayer({ type: 'cheminee', rang, i }, Math.hypot(p.x - h.x, p.y - h.y)));
    (c.elementsToit ?? []).forEach((e, i) => essayer({ type: e.type, rang, i }, Math.hypot(p.x - sur(e.pan, e.sM, e.dM).x, p.y - sur(e.pan, e.sM, e.dM).y) - 0.3 * (e.echelle ?? 1)));
  });
  return meilleur;
}

/** Ce que la liste de corps a de plus qu'avant : la cible du dernier element ajoute (apres un geste de la palette), ou null. */
export function cibleAjoutee(avant: readonly CorpsToit[], apres: readonly CorpsToit[]): CibleElement | null {
  const vus = new Set(listerElements(avant).map((e) => e.cible.type + ':' + e.cible.rang + ':' + JSON.stringify(lireElement(avant, e.cible))));
  const nouveaux = listerElements(apres).filter((e) => !vus.has(e.cible.type + ':' + e.cible.rang + ':' + JSON.stringify(lireElement(apres, e.cible))));
  return nouveaux.length ? (nouveaux[nouveaux.length - 1] as ElementListe).cible : null;
}

/**
 * La facade ou se regle un element : celle du pan qui porte un pignon (murs 0 et 2 du corps), celle du mur ou est pose un bow-window, un
 * appentis, une galerie. Null pour ce qui se regle d'ailleurs (un corps, ce qui est pose sur un pan du toit).
 */
export function facadeDeLElement(corps: readonly CorpsToit[], t: CibleElement): { rang: number; mur: number } | null {
  const c = corps[t.rang];
  if (!c) return null;
  if (t.type === 'pignon') { const p = c.pignons[t.i]; return p ? { rang: t.rang, mur: p.pan === 1 ? 2 : 0 } : null; }
  if (t.type === 'saillie' && c.saillie) return { rang: c.saillie.hote, mur: c.saillie.mur };
  if (t.type === 'travee') { const k = c.travees?.[t.i]; return k ? { rang: t.rang, mur: k.mur } : null; }
  return null;
}

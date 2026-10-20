// Les elements d'un toit que le mode Toit sait choisir, regler, dupliquer et retirer (MD/spec-mode-toit-3d.md, etape 3).
//
// Un « element » est une chose posee sur le toit ou sur une facade, rangee dans un corps : un bow-window, une galerie ou un appentis
// (un corps qui porte sa `saillie`), un pignon, une lucarne, une cheminee, une fenetre de toit, un panneau solaire. Une `CibleElement` le
// nomme (son type, le rang du corps, son rang dans la liste du corps) ; toutes les operations rendent une NOUVELLE liste de corps, sans
// toucher a l'ancienne, pour que la session empile un instantane propre.
//
// Pur : pas de DOM, pas de scene.

import { point, repere } from '../../toitCorps.js';
import { bornerSaillie, murDuCorps, replacerSaillie, retirerSaillie, saillieDe } from './saillies.js';
import { rangPrincipal, rangsDeCorps, supprimerCorps } from './corpsNeufs.js';
import type { Cheminee, CorpsToit, ElementDeToit, Lucarne, PignonToit, PtBrut, SaillieFacade } from '../../../model/types.js';

export type TypeElement = 'corps' | 'saillie' | 'pignon' | 'lucarne' | 'cheminee' | 'fenetre-toit' | 'solaire';

export interface CibleElement { type: TypeElement; rang: number; i: number }

export interface ElementListe { cible: CibleElement; libelle: string }

const LIBELLES_LUCARNE: Record<string, string> = {
  jacobine: 'Jacobine', capucine: 'Capucine', 'chien-assis': 'Chien-assis', rampante: 'Lucarne rampante', meuniere: 'Lucarne meunière',
  'oeil-de-boeuf': 'Œil-de-bœuf', outeau: 'Outeau', lanterneau: 'Lanterneau', inconnue: 'Lucarne'
};
const LIBELLES_SAILLIE = { 'bow-window': 'Bow-window', galerie: 'Galerie', appentis: 'Appentis' } as const;

const centi = (v: number) => Math.round(v * 100) / 100;
const borne = (v: number, a: number, b: number) => Math.min(Math.max(v, a), b);

/** Tous les elements du batiment, dans l'ordre ou on les presente : ce qui est pose sur une facade, puis ce qui est sur le toit. */
export function listerElements(corps: readonly CorpsToit[]): ElementListe[] {
  const l: ElementListe[] = [];
  // Les corps eux-memes, quand il y en a plusieurs : le principal d'abord, puis les autres dans l'ordre ou on les a poses.
  if (rangsDeCorps(corps).length > 1) rangsDeCorps(corps).forEach((rang, n) => l.push({ cible: { type: 'corps', rang, i: 0 }, libelle: rang === rangPrincipal(corps) ? 'Corps principal' : 'Corps ' + (n + 1) }));
  corps.forEach((c, rang) => { if (c.saillie) l.push({ cible: { type: 'saillie', rang, i: 0 }, libelle: LIBELLES_SAILLIE[c.saillie.genre] }); });
  corps.forEach((c, rang) => c.pignons.forEach((_, i) => l.push({ cible: { type: 'pignon', rang, i }, libelle: 'Pignon' })));
  corps.forEach((c, rang) => (c.lucarnes ?? []).forEach((x, i) => l.push({ cible: { type: 'lucarne', rang, i }, libelle: LIBELLES_LUCARNE[x.type] ?? 'Lucarne' })));
  corps.forEach((c, rang) => (c.cheminees ?? []).forEach((_, i) => l.push({ cible: { type: 'cheminee', rang, i }, libelle: 'Cheminée' })));
  corps.forEach((c, rang) => (c.elementsToit ?? []).forEach((x, i) => l.push({ cible: { type: x.type, rang, i }, libelle: x.type === 'solaire' ? 'Solaire' : 'Fenêtre de toit' })));
  return l;
}

export const memeCible = (a: CibleElement | null, b: CibleElement | null): boolean => !!a && !!b && a.type === b.type && a.rang === b.rang && a.i === b.i;

/** L'element que nomme la cible dans cette liste de corps, ou null s'il n'existe plus (une annulation l'a retire). */
export function lireElement(corps: readonly CorpsToit[], t: CibleElement): CorpsToit | SaillieFacade | PignonToit | Lucarne | Cheminee | ElementDeToit | null {
  const c = corps[t.rang];
  if (!c) return null;
  switch (t.type) {
    case 'corps': return c.saillie ? null : c;
    case 'saillie': return c.saillie ?? null;
    case 'pignon': return c.pignons[t.i] ?? null;
    case 'lucarne': return c.lucarnes?.[t.i] ?? null;
    case 'cheminee': return c.cheminees?.[t.i] ?? null;
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
  if (!c) return null;
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
  if (!c) return corps.slice();
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
export interface GroupeChoix { groupe: string; valeurs: { valeur: string; libelle: string }[] }

/** Les avancees que l'inspecteur propose a un pignon, en metres (la poignee regle tout entre 0 et le maximum). */
const SAILLIES_PIGNON = [0, 0.5, 1, 1.5];

/** Les groupes de choix de l'element, dans l'ordre de la maquette : bow-window (forme, niveau, toit), galerie/appentis (ouvert, retrait), pignon (hauteur). */
export function groupesDe(corps: readonly CorpsToit[], t: CibleElement): GroupeChoix[] {
  const c = corps[t.rang];
  if (t.type === 'saillie' && c?.saillie) {
    if (c.saillie.genre === 'bow-window') return [
      { groupe: 'forme', valeurs: [{ valeur: 'pans', libelle: 'Pans coupés' }, { valeur: 'rectangle', libelle: 'Rectangle' }, { valeur: 'arc', libelle: 'Arc de cercle' }, { valeur: 'conge', libelle: 'Rectangle arrondi' }] },
      { groupe: 'niveau', valeurs: [{ valeur: 'rdc', libelle: 'Sous le premier étage' }, { valeur: 'toit', libelle: 'Monte jusqu’au toit' }] },
      { groupe: 'toit', valeurs: [{ valeur: 'pan', libelle: 'Toit à un pan' }, { valeur: 'plat', libelle: 'Toit plat' }, { valeur: 'pavillon', libelle: 'Toit en pointe' }] }
    ];
    return [
      { groupe: 'ouvert', valeurs: [{ valeur: 'poteaux', libelle: 'Sur poteaux' }, { valeur: 'mur', libelle: 'Fermée' }] },
      { groupe: 'retrait', valeurs: [{ valeur: '0', libelle: 'Mur droit' }, { valeur: '0.5', libelle: 'Mur reculé de 0,5 m' }, { valeur: '1', libelle: 'Mur reculé de 1 m' }] }
    ];
  }
  if (t.type === 'pignon') return [
    { groupe: 'hauteur', valeurs: [{ valeur: 'faitage', libelle: 'Monte au faîtage' }, { valeur: 'bas', libelle: 'Plus bas que le faîtage' }] },
    { groupe: 'saillie', valeurs: [{ valeur: '0', libelle: 'Au nu du mur' }, { valeur: '0.5', libelle: 'Avance de 0,5 m' }, { valeur: '1', libelle: 'Avance de 1 m' }, { valeur: '1.5', libelle: 'Avance de 1,5 m' }] }
  ];
  return [];
}

/** La valeur courante d'un groupe : celle qui est enfoncee dans l'inspecteur. */
export function valeurDuGroupe(corps: readonly CorpsToit[], t: CibleElement, groupe: string): string | null {
  const c = corps[t.rang];
  if (!c) return null;
  if (t.type === 'saillie' && c.saillie) {
    const s = c.saillie;
    if (groupe === 'forme') return s.forme;
    if (groupe === 'niveau') return s.niveau;
    if (groupe === 'toit') return s.toit;
    if (groupe === 'ouvert') return c.ouvert === false ? 'mur' : 'poteaux';
    if (groupe === 'retrait') { const r = c.retraitM ?? 0; return [0, 0.5, 1].reduce((m, v) => (Math.abs(v - r) < Math.abs(m - r) ? v : m), 0).toString(); }
  }
  if (t.type === 'pignon' && groupe === 'hauteur') {
    const p = c.pignons[t.i];
    return p ? (p.faitage >= c.faitage - 0.05 ? 'faitage' : 'bas') : null;
  }
  if (t.type === 'pignon' && groupe === 'saillie') {
    const p = c.pignons[t.i], r = p?.saillieM ?? 0;
    return p ? SAILLIES_PIGNON.reduce((m, v) => (Math.abs(v - r) < Math.abs(m - r) ? v : m), 0).toString() : null;
  }
  return null;
}

/** Ecrit le choix d'un groupe sur l'element. Rend la liste inchangee (copie) si la valeur n'a pas de sens. */
export function appliquerChoix(corps: readonly CorpsToit[], t: CibleElement, groupe: string, valeur: string): CorpsToit[] {
  const c = corps[t.rang];
  if (!c) return corps.slice();
  if (t.type === 'saillie' && c.saillie) {
    if (groupe === 'forme' && ['pans', 'rectangle', 'arc', 'conge'].includes(valeur)) return replacerSaillie(corps, t.rang, { forme: valeur as SaillieFacade['forme'] });
    if (groupe === 'niveau' && (valeur === 'rdc' || valeur === 'toit')) return replacerSaillie(corps, t.rang, { niveau: valeur, hauteurM: undefined });
    if (groupe === 'toit' && (valeur === 'pan' || valeur === 'plat' || valeur === 'pavillon')) return replacerSaillie(corps, t.rang, { toit: valeur });
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

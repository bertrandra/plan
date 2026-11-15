// L'import d'une zone en lot (demande du proprietaire, 15 novembre 2026, « niveau suivant » n° 6) : on dessine une zone (un rectangle,
// un polygone, une commune) et une cible (« 200 facades ») ; le banc la parcourt par paves, lit dans chacun les photos de Panoramax et
// les batiments de la BD TOPO, et garde la meilleure vue de chaque batiment (la note du tri, facadesVues.ts). Jamais deux fois le meme
// batiment dans un lot, ni un batiment que le banc a deja (« Avoid having 2 times the same building ») ; pas dix fois la meme rue (un
// quota par troncon). Les serveurs sont publics : une requete a la fois, une pause entre deux, des plafonds nommes, et quand un
// service limite les requetes le parcours attend, puis s'arrete en le disant ; il se reprend la ou il en etait. Sans DOM, testable seul.

import { cadreDeLaVue, type CadreDeVue } from './cadrage.js';
import type { Emprise } from './carte.js';
import { lireLesBatiments, ranger, vuesDeFacade, type Batiment } from './facadesVues.js';
import { noteAvecSaison } from './meilleuresVues.js';
import { typeDeBatiment, type TypeDeBatiment } from './murs.js';
import { GEOCODAGE_URL, lirePhotos, urlRechercheEmprise, vuesAExtraire, type PhotoRue, type Relais, type VueAExtraire } from './panoramax.js';
import type { Ll } from './parcelles.js';

/** La cible d'un lot : cent facades si rien n'est dit, cinq cents au plus (un lot se relit ensuite a la main). */
export const CIBLE_DEFAUT = 100, CIBLE_MAX = 500;
/** Le cote d'un pave, en metres : une requete de photos et une lecture de batiments chacun. */
export const COTE_PAVE_M = 300;
/** Les paves d'un lot, au plus (27 km2) : une zone plus grande n'est parcourue qu'en partie, et l'ecran le dit. */
export const PAVES_MAX = 300;
/** Les photos lues par pave, au plus (la recherche de Panoramax en rend 500 au plus). */
export const PHOTOS_PAR_PAVE = 400;
/** La pause avant chaque requete, en millisecondes : jamais de rafale sur les serveurs de Panoramax et de l'IGN. */
export const PAUSE_ENTRE_REQUETES_MS = 700;
/** Quand un service repond qu'il limite (429, 503) : on attend, on reessaie tant de fois, puis on s'arrete en le disant. */
export const ATTENTE_SI_LIMITE_MS = 30000, ESSAIS_SI_LIMITE = 2;
/** Les facades gardees d'un meme troncon (une sequence de photos dans un pave : un bout de rue), au plus. */
export const QUOTA_PAR_TRONCON = 5;
/**
 * Les facades gardees d'un meme pave, au plus : deux fois la part qui lui reviendrait si la cible se repartissait sur tous les paves
 * (trois au moins). Vu a Beaune (15 novembre 2026) : sans ce plafond, douze facades venaient toutes du premier pave du centre.
 */
export const quotaParPave = (cible: number, paves: number): number => Math.max(3, Math.ceil((2 * cible) / Math.max(1, paves)));
/** Au-dela, une zone n'est pas parcourue : c'est une region, pas un lot (une erreur de dessin sur la carte de France). */
export const SURFACE_MAX_KM2 = 300;
/** Le poids moyen d'une vue importee (son image de 1 600 x 1 200 et sa vignette), mesure sur 29 vues : 590 ko. */
export const POIDS_PAR_VUE_KO = 600;
/** Autour des paves, jusqu'ou lire les batiments : la portee du tri (40 m), et de quoi avoir le batiment en entier. */
const MARGE_BATIMENTS_M = 60;

const R = 6371008.8, rad = (d: number) => (d * Math.PI) / 180;

/** Une zone : un contour ferme (le dernier point rejoint le premier), et son nom quand c'est une commune. */
export interface Zone { anneau: Ll[]; nom?: string }

export const zoneDuRectangle = (a: Ll, b: Ll): Zone => {
  const sud = Math.min(a.lat, b.lat), nord = Math.max(a.lat, b.lat), ouest = Math.min(a.lon, b.lon), est = Math.max(a.lon, b.lon);
  return { anneau: [{ lat: sud, lon: ouest }, { lat: sud, lon: est }, { lat: nord, lon: est }, { lat: nord, lon: ouest }] };
};

/** Le carre de `coteM` metres autour d'un point (des coordonnees tapees : « ici »). */
export function zoneAutour(p: Ll, coteM = COTE_PAVE_M): Zone {
  const dLat = ((coteM / 2 / R) * 180) / Math.PI, dLon = dLat / Math.cos(rad(p.lat));
  return zoneDuRectangle({ lat: p.lat - dLat, lon: p.lon - dLon }, { lat: p.lat + dLat, lon: p.lon + dLon });
}

export function empriseDeLaZone(z: Zone): Emprise {
  let sud = Infinity, nord = -Infinity, ouest = Infinity, est = -Infinity;
  for (const p of z.anneau) { sud = Math.min(sud, p.lat); nord = Math.max(nord, p.lat); ouest = Math.min(ouest, p.lon); est = Math.max(est, p.lon); }
  return { sud, ouest, nord, est };
}

export function dansLaZone(z: Zone, p: Ll): boolean {
  let dedans = false;
  const a = z.anneau;
  for (let i = 0, j = a.length - 1; i < a.length; j = i++) {
    const pi = a[i] as Ll, pj = a[j] as Ll;
    if ((pi.lat > p.lat) !== (pj.lat > p.lat) && p.lon < ((pj.lon - pi.lon) * (p.lat - pi.lat)) / (pj.lat - pi.lat) + pi.lon) dedans = !dedans;
  }
  return dedans;
}

/** La surface d'une zone, en kilometres carres. */
export function surfaceKm2(z: Zone): number {
  const o = z.anneau[0];
  if (!o) return 0;
  const m = z.anneau.map((p) => ({ x: rad(p.lon - o.lon) * R * Math.cos(rad(o.lat)), y: rad(p.lat - o.lat) * R }));
  let s = 0;
  for (let i = 0, j = m.length - 1; i < m.length; j = i++) s += ((m[j] as { x: number }).x * (m[i] as { y: number }).y) - ((m[i] as { x: number }).x * (m[j] as { y: number }).y);
  return Math.abs(s) / 2 / 1e6;
}

/** Un contour ramene a `max` points au plus (une commune en a des milliers) : un sur n, les bouts gardes. Assez pour un parcours par paves. */
export function alleger(anneau: readonly Ll[], max = 400): Ll[] {
  if (anneau.length <= max) return [...anneau];
  const pas = Math.ceil(anneau.length / max);
  return anneau.filter((_, i) => i % pas === 0);
}

/** La commune que le geocodage de la Geoplateforme propose pour un nom : son code INSEE, de quoi demander son contour. */
export const urlCommune = (nom: string): string => GEOCODAGE_URL + '?' + new URLSearchParams({ q: nom, type: 'municipality', limit: '1' }).toString();
export function lireCommune(json: unknown): { nom: string; code: string } | null {
  const p = ((json as { features?: { properties?: Record<string, unknown> }[] })?.features ?? [])[0]?.properties;
  return p && typeof p.citycode === 'string' && typeof p.city === 'string' ? { nom: p.city, code: p.citycode } : null;
}

/** Le contour d'une commune, par le WFS de la Geoplateforme (ADMIN EXPRESS de l'IGN). */
export const urlContourDeCommune = (code: string): string => 'https://data.geopf.fr/wfs/ows?' + new URLSearchParams({ SERVICE: 'WFS', VERSION: '2.0.0', REQUEST: 'GetFeature', TYPENAMES: 'ADMINEXPRESS-COG.LATEST:commune', OUTPUTFORMAT: 'application/json', SRSNAME: 'EPSG:4326', COUNT: '1', CQL_FILTER: `code_insee='${code.replace(/[^0-9A-Za-z]/g, '')}'` }).toString();

/** La zone d'une commune : le plus grand morceau de son contour (une ile, une enclave lointaine sont laissees), allege. */
export function zoneDuContour(json: unknown, nom: string): Zone | null {
  const g = ((json as { features?: { geometry?: { type?: string; coordinates?: unknown } }[] })?.features ?? [])[0]?.geometry;
  const polygones = (g?.type === 'MultiPolygon' ? (g.coordinates as number[][][][]) : g?.type === 'Polygon' ? [g.coordinates as number[][][]] : []) ?? [];
  const anneaux = polygones.map((poly) => (poly?.[0] ?? []).filter((c) => typeof c[0] === 'number' && typeof c[1] === 'number').map((c) => ({ lon: c[0] as number, lat: c[1] as number })));
  const grand = anneaux.sort((a, b) => b.length - a.length)[0];
  return grand && grand.length >= 3 ? { anneau: alleger(grand), nom } : null;
}

/** L'ordre « eparpille » de n rangs (les bits du rang retournes) : les premiers paves visites couvrent deja toute la zone. */
export function eparpiller(n: number): number[] {
  const bits = Math.max(1, Math.ceil(Math.log2(Math.max(2, n))));
  const inverse = (k: number) => { let r = 0; for (let b = 0; b < bits; b++) r = (r << 1) | ((k >> b) & 1); return r; };
  return Array.from({ length: n }, (_, k) => k).sort((a, b) => inverse(a) - inverse(b) || a - b);
}

/**
 * Les paves qui couvrent la zone : une grille de `cote` metres sur son emprise, dont on garde les cases qui la touchent (leur milieu ou
 * un coin dedans, ou un sommet de la zone dans la case). Dans un ordre eparpille : si la cible est atteinte avant la fin, les facades
 * viennent de toute la zone, pas de son coin sud-ouest. `tronque` : il y en avait plus que `max`.
 */
export function pavesDeLaZone(z: Zone, cote = COTE_PAVE_M, max = PAVES_MAX): { paves: Emprise[]; tronque: boolean } {
  if (z.anneau.length < 3) return { paves: [], tronque: false };
  const e = empriseDeLaZone(z), dLat = ((cote / R) * 180) / Math.PI, dLon = dLat / Math.cos(rad((e.sud + e.nord) / 2));
  const nx = Math.max(1, Math.ceil((e.est - e.ouest) / dLon - 1e-9)), ny = Math.max(1, Math.ceil((e.nord - e.sud) / dLat - 1e-9));
  const tous: Emprise[] = [];
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const p: Emprise = { sud: e.sud + j * dLat, nord: Math.min(e.nord, e.sud + (j + 1) * dLat), ouest: e.ouest + i * dLon, est: Math.min(e.est, e.ouest + (i + 1) * dLon) };
    const points: Ll[] = [{ lat: (p.sud + p.nord) / 2, lon: (p.ouest + p.est) / 2 }, { lat: p.sud, lon: p.ouest }, { lat: p.sud, lon: p.est }, { lat: p.nord, lon: p.est }, { lat: p.nord, lon: p.ouest }];
    if (points.some((q) => dansLaZone(z, q)) || z.anneau.some((q) => q.lat >= p.sud && q.lat <= p.nord && q.lon >= p.ouest && q.lon <= p.est)) tous.push(p);
  }
  return { paves: eparpiller(tous.length).slice(0, max).map((k) => tous[k] as Emprise), tronque: tous.length > max };
}

/** Une facade candidate : la vue d'une photo vers un batiment, sa note, et le troncon d'ou elle vient. */
export interface Candidat { photo: PhotoRue; vue: VueAExtraire; batiment: Batiment; note: number; troncon: string; /** Le rang du pave d'ou vient la photo. */ pave: number }

/**
 * Les candidates d'un pave : pour chaque photo prise dans la zone, ses vues qui montrent une facade (le tri de l'import, les deux cotes
 * de la rue pour un 360), l'hiver prefere, chacune cadree sur son batiment. Le troncon : la sequence de la photo, dans ce pave.
 */
export function candidatsDuPave(photos: readonly PhotoRue[], batiments: readonly Batiment[], zone: Zone, pave: number, aujourdhui = new Date()): Candidat[] {
  const scene = ranger(batiments), parId = new Map(scene.batiments.map((b) => [b.id, b]));
  const out: Candidat[] = [];
  for (const p of photos) {
    if (!dansLaZone(zone, p)) continue;
    for (const v of vuesDeFacade(scene, p, vuesAExtraire(p, 'cotes'), aujourdhui)) {
      const b = v.batiment ? parId.get(v.batiment) : undefined;
      if (!b) continue;
      const note = noteAvecSaison(v.note ?? 0, p.date, true);
      const cadre: CadreDeVue | undefined = p.panoramique ? cadreDeLaVue(b, p, v, { cadrer: true, surLeMur: false, retouches: new Map() }) : undefined;
      out.push({ photo: p, vue: { ...v, note, ...(cadre ? { cadre } : {}) }, batiment: b, note, troncon: (p.collection ?? p.id) + '#' + pave, pave });
    }
  }
  return out;
}

/**
 * Ce que le lot garde : la meilleure vue de chaque batiment (un batiment, une fois : pas meme par deux cotes), aucun batiment que le
 * banc a deja, au plus QUOTA_PAR_TRONCON facades par troncon et `parPave` par pave, les mieux notees d'abord, jusqu'a la cible.
 */
export class Selection {
  private readonly par = new Map<string, Candidat>();
  /** Les batiments ecartes parce que le banc les a deja. */
  dejaLa = 0;
  constructor(readonly cible: number, private readonly dejaDansLeBanc: ReadonlySet<string>, private readonly quota = QUOTA_PAR_TRONCON, private readonly parPave = Infinity) {}

  ajouter(candidats: readonly Candidat[]): void {
    const ecartes = new Set<string>();
    for (const c of candidats) {
      const id = c.batiment.id;
      if (this.dejaDansLeBanc.has(id)) { ecartes.add(id); continue; }
      const garde = this.par.get(id);
      // A note egale, l'ordre des identifiants : le lot ne depend pas de l'ordre d'arrivee des photos.
      if (!garde || c.note > garde.note || (c.note === garde.note && c.photo.id < garde.photo.id)) this.par.set(id, c);
    }
    this.dejaLa += ecartes.size;
  }

  /** Les batiments vus (hors ceux deja dans le banc), avant le quota et la cible. */
  get batiments(): number { return this.par.size; }

  retenues(): Candidat[] {
    const parTroncon = new Map<string, number>(), parPave = new Map<number, number>(), out: Candidat[] = [];
    for (const c of [...this.par.values()].sort((a, b) => b.note - a.note || (a.batiment.id < b.batiment.id ? -1 : 1))) {
      if (out.length >= this.cible) break;
      const n = parTroncon.get(c.troncon) ?? 0, m = parPave.get(c.pave) ?? 0;
      if (n >= this.quota || m >= this.parPave) continue;
      parTroncon.set(c.troncon, n + 1); parPave.set(c.pave, m + 1);
      out.push(c);
    }
    return out;
  }

  get pleine(): boolean { return this.retenues().length >= this.cible; }
}

/** Les batiments que le banc a deja (par n'importe quel cote), d'apres le mur de ses images (murs.ts) : `cles` sont « batiment/cote ». */
export const batimentsDuBanc = (cles: Iterable<string>): Set<string> => new Set([...cles].map((k) => k.slice(0, k.lastIndexOf('/'))));

export interface Recapitulatif { facades: number; batiments: number; photos: number; troncons: number; poidsMo: number; parType: Record<TypeDeBatiment, number>; noteMoyenne: number }

/** Ce que le lot importerait, dit avant de l'importer : son compte, son poids estime, ses types de batiment. */
export function recapituler(l: readonly Candidat[]): Recapitulatif {
  const parType: Record<TypeDeBatiment, number> = { maison: 0, immeuble: 0, commerce: 0, autre: 0, inconnu: 0 };
  for (const c of l) parType[typeDeBatiment({ usage: c.batiment.usage1 ?? null, usage2: c.batiment.usage2 ?? null, logements: c.batiment.logements ?? null, etages: c.batiment.etages ?? null, hauteur: c.batiment.hauteur ?? null })]++;
  return {
    facades: l.length, batiments: new Set(l.map((c) => c.batiment.id)).size, photos: new Set(l.map((c) => c.photo.id)).size, troncons: new Set(l.map((c) => c.troncon)).size,
    poidsMo: Math.round((l.length * POIDS_PAR_VUE_KO) / 100) / 10, parType, noteMoyenne: l.length ? Math.round(l.reduce((s, c) => s + c.note, 0) / l.length) : 0,
  };
}

/** Une erreur de lecture qui porte le code HTTP : de quoi reconnaitre un service qui limite. */
export class ErreurHttp extends Error { constructor(readonly statut: number, message = 'HTTP ' + statut) { super(message); } }
/** Le service a limite les requetes, encore apres l'attente : le parcours s'arrete la, et se reprend plus tard. */
export class ErreurLimite extends Error {}
const limite = (e: unknown): boolean => e instanceof ErreurHttp && (e.statut === 429 || e.statut === 503);

export interface Sources {
  lire: (url: string) => Promise<unknown>;
  attendre: (ms: number) => Promise<void>;
  relais?: Relais;
}

export type EtatDuParcours = 'pret' | 'parcours' | 'limite' | 'arrete' | 'fini';
export interface Avance { etat: EtatDuParcours; fait: number; paves: number; photos: number; retenues: number; batiments: number; dejaLa: number; pannes: number; /** Les paves ou Panoramax a rendu autant de photos que la limite : il y en avait sans doute d'autres. */ satures: number; message: string | null }

/**
 * Le parcours d'une zone : pave apres pave, une requete a la fois, une pause avant chacune. Il s'arrete quand la cible est atteinte,
 * quand les paves sont tous lus, quand on le lui demande (`arreter`), ou quand un service limite encore apres l'attente ; `lancer` le
 * reprend ou il en etait. Un pave en panne (reseau, BD TOPO tronquee) est repris une fois a la fin, puis compte.
 */
export class Parcours {
  readonly paves: Emprise[];
  readonly tronque: boolean;
  readonly selection: Selection;
  /** L'etat de chaque pave : a faire, lu, en panne. */
  readonly etats: ('a-faire' | 'lu' | 'panne')[];
  private suivant = 0;
  private repris = false;
  private arret = false;
  private photos = 0;
  private satures = 0;
  etat: EtatDuParcours = 'pret';
  message: string | null = null;

  constructor(readonly zone: Zone, cible: number, dejaDansLeBanc: ReadonlySet<string>, private readonly sources: Sources, private readonly onAvance: (a: Avance) => void = () => {}, private readonly aujourdhui = new Date()) {
    const p = pavesDeLaZone(zone);
    this.paves = p.paves; this.tronque = p.tronque;
    const n = Math.max(1, Math.min(CIBLE_MAX, Math.round(cible)));
    this.selection = new Selection(n, dejaDansLeBanc, QUOTA_PAR_TRONCON, quotaParPave(n, this.paves.length));
    this.etats = this.paves.map(() => 'a-faire');
  }

  arreter(): void { this.arret = true; }

  avance(): Avance {
    return { etat: this.etat, fait: this.etats.filter((e) => e !== 'a-faire').length, paves: this.paves.length, photos: this.photos, retenues: this.selection.retenues().length, batiments: this.selection.batiments, dejaLa: this.selection.dejaLa, pannes: this.etats.filter((e) => e === 'panne').length, satures: this.satures, message: this.message };
  }

  private dire(etat: EtatDuParcours, message: string | null = null): void { this.etat = etat; this.message = message; this.onAvance(this.avance()); }

  /** Une lecture, apres la pause ; un service qui limite : l'attente, puis de nouveaux essais, puis ErreurLimite. */
  private async lire(url: string): Promise<unknown> {
    for (let essai = 0; ; essai++) {
      await this.sources.attendre(PAUSE_ENTRE_REQUETES_MS);
      try { return await this.sources.lire(url); } catch (e) {
        if (!limite(e)) throw e;
        if (essai >= ESSAIS_SI_LIMITE) throw new ErreurLimite('Le service limite les requêtes (' + (e as ErreurHttp).statut + ').');
        this.dire('limite', `Le service limite les requêtes : attente de ${Math.round(ATTENTE_SI_LIMITE_MS / 1000)} s avant de réessayer (${essai + 1} sur ${ESSAIS_SI_LIMITE}).`);
        await this.sources.attendre(ATTENTE_SI_LIMITE_MS);
        this.dire('parcours');
      }
    }
  }

  private async lireLePave(k: number): Promise<void> {
    const pave = this.paves[k] as Emprise;
    const photos = lirePhotos(await this.lire(urlRechercheEmprise(pave, PHOTOS_PAR_PAVE)), { lat: (pave.sud + pave.nord) / 2, lon: (pave.ouest + pave.est) / 2 }, Infinity, this.sources.relais);
    this.photos += photos.length;
    if (photos.length >= PHOTOS_PAR_PAVE) this.satures++;
    // Sans photo, pas besoin des batiments : une requete de moins a l'IGN.
    if (!photos.length) return;
    const dLat = ((MARGE_BATIMENTS_M / R) * 180) / Math.PI, autour = pave;
    const emprise: Emprise = { sud: autour.sud - dLat, nord: autour.nord + dLat, ouest: autour.ouest - dLat / Math.cos(rad(pave.sud)), est: autour.est + dLat / Math.cos(rad(pave.sud)) };
    const b = await lireLesBatiments(emprise, (u) => this.lire(u));
    // Des batiments lus a moitie donneraient des murs faux (celui de derriere) : le pave est en panne, pas trie de travers.
    if (b.tronque) throw new Error('BD TOPO tronquée');
    this.selection.ajouter(candidatsDuPave(photos, b.batiments, this.zone, k, this.aujourdhui));
  }

  async lancer(): Promise<Avance> {
    this.arret = false;
    this.dire('parcours');
    try {
      for (;;) {
        for (; this.suivant < this.paves.length; this.suivant++) {
          if (this.arret) { this.dire('arrete', 'Parcours arrêté : ce qui est trouvé est gardé, il peut reprendre.'); return this.avance(); }
          if (this.selection.pleine) break;
          const k = this.suivant;
          if (this.etats[k] === 'lu') continue;
          try { await this.lireLePave(k); this.etats[k] = 'lu'; } catch (e) { if (e instanceof ErreurLimite) throw e; this.etats[k] = 'panne'; }
          this.onAvance(this.avance());
        }
        // Les paves en panne, une seconde fois, quand la cible n'est pas atteinte.
        if (this.repris || this.selection.pleine || !this.etats.includes('panne')) break;
        this.repris = true; this.suivant = 0;
        this.etats.forEach((e, k) => { if (e === 'panne') this.etats[k] = 'a-faire'; });
      }
    } catch (e) {
      if (!(e instanceof ErreurLimite)) throw e;
      this.dire('limite', e.message + ' Le parcours s’arrête ici ; reprenez-le dans quelques minutes, il repartira de ce pavé.');
      return this.avance();
    }
    this.dire('fini');
    return this.avance();
  }
}

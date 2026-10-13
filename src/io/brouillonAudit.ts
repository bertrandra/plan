// Le brouillon local de la promenade d'audit (MD/spec-audit.md §10) : ce qui est en cours est ecrit
// au fur et a mesure dans le telephone, pour qu'un ecran verrouille ou un onglet tue par le systeme
// ne fasse pas perdre une heure de visite. A la reouverture de `?mode=audit`, le controleur propose
// « Reprendre l'audit du … » ou « Le jeter ».
//
// Meme facon de faire que io/photosLocales.ts : IndexedDB dans le navigateur, une table en memoire
// pour les tests. Deux tables :
// - `promenades` : une entree par promenade, sous `audit-<debut ISO>`, avec ses cas figes ; les
//   photos n'y sont qu'une cle (chaque note retapee reecrit l'entree, pas 2 Mo de photos) ;
// - `photos` : chaque photo une fois, sous `<id de la promenade>/<cle tiree du contenu>`, pour
//   tout effacer d'une promenade d'un coup.
//
// Tout est protege : en navigation privee IndexedDB manque, refuse, ou ne repond jamais ; un
// telephone plein refuse l'ecriture (QuotaExceededError). Le brouillon n'est alors qu'une perte
// de confort : l'audit continue, et la personne en est prevenue une fois (`surEchec`).

import { cleDePhoto } from './photosLocales.js';
import type { CasAudit, PhotoCas } from '../model/audit.js';

export type TableBrouillon = 'promenades' | 'photos';

/** Ou le brouillon se range : IndexedDB dans le navigateur, une table en memoire sinon (tests). */
export interface StockageBrouillon {
  lire(table: TableBrouillon, cle: string): Promise<unknown>;
  ecrire(table: TableBrouillon, cle: string, valeur: unknown): Promise<void>;
  effacer(table: TableBrouillon, cles: readonly string[]): Promise<void>;
  cles(table: TableBrouillon): Promise<string[]>;
}

/** Une photo du brouillon : sa prise de vue, et la cle sous laquelle son contenu est range. */
export type PhotoRangee = Omit<PhotoCas, 'base64'> & { cleBrouillon: string };
export type CasRange = Omit<CasAudit, 'constat'> & { constat: Omit<CasAudit['constat'], 'photos'> & { photos: PhotoRangee[] } };

/** La version de l'entree ecrite : une entree d'une version inconnue n'est pas proposee. */
export const VERSION_BROUILLON = 1;

export interface BrouillonAudit {
  version: typeof VERSION_BROUILLON;
  id: string;
  /** Le debut de la promenade, ISO : c'est lui que « Reprendre l'audit du … » nomme. */
  debut: string;
  /** La derniere ecriture, ISO. */
  misAJour: string;
  /**
   * Le point de depart (degres) : repartir de la meme parcelle redonne le meme repere, celui des
   * contours figes dans les cas.
   */
  depart: { lon: number; lat: number } | null;
  commune: string | null;
  cas: CasRange[];
}

/** Ce que le controleur donne a ecrire : la promenade telle qu'elle est. */
export interface EtatPromenade {
  debut: Date;
  depart: { lon: number; lat: number } | null;
  commune: string | null;
  cas: readonly CasAudit[];
}

export type RaisonEchec = 'indisponible' | 'plein';

/** L'identifiant d'une promenade dans le brouillon : son debut, qui ne change pas a la reprise. */
export const idPromenade = (debut: Date): string => 'audit-' + debut.toISOString();

/**
 * La promenade rangee : les photos sorties des cas (remplacees par leur cle) et rendues a part.
 * Pur ; les cas d'origine ne sont pas touches.
 */
export function rangerPromenade(e: EtatPromenade, maintenant: Date = new Date()): { brouillon: BrouillonAudit; photos: Map<string, string> } {
  const id = idPromenade(e.debut);
  const photos = new Map<string, string>();
  const cas = e.cas.map((c): CasRange => ({
    ...c,
    constat: {
      ...c.constat,
      photos: c.constat.photos.map(({ base64, ...reste }) => {
        const cle = id + '/' + cleDePhoto(base64);
        photos.set(cle, base64);
        return { ...reste, cleBrouillon: cle };
      }),
    },
  }));
  return {
    brouillon: { version: VERSION_BROUILLON, id, debut: e.debut.toISOString(), misAJour: maintenant.toISOString(), depart: e.depart, commune: e.commune, cas },
    photos,
  };
}

/** Une entree relue est-elle un brouillon que ce code sait reprendre. */
function estBrouillon(v: unknown): v is BrouillonAudit {
  const b = v as Partial<BrouillonAudit> | null;
  return !!b && typeof b === 'object' && b.version === VERSION_BROUILLON && typeof b.id === 'string'
    && typeof b.debut === 'string' && !Number.isNaN(Date.parse(b.debut)) && Array.isArray(b.cas);
}

/** Un refus de place, quel que soit le navigateur (nom, ou ancien code 22 / 1014 de Firefox). */
function raisonDe(e: unknown): RaisonEchec {
  const x = e as { name?: string; code?: number } | null;
  return x && (x.name === 'QuotaExceededError' || x.name === 'NS_ERROR_DOM_QUOTA_REACHED' || x.code === 22 || x.code === 1014) ? 'plein' : 'indisponible';
}

/** Une promesse qui ne repond pas a temps rend `null` : IndexedDB peut ne jamais repondre en navigation privee. */
function aTemps<T>(p: Promise<T>, delaiMs: number): Promise<T | null> {
  return new Promise((ok) => {
    const t = setTimeout(() => ok(null), delaiMs);
    p.then((v) => { clearTimeout(t); ok(v); }, () => { clearTimeout(t); ok(null); });
  });
}

/** Le stockage en memoire : copie ce qu'on lui donne, comme IndexedDB (clonage structure). */
export function stockageMemoire(): StockageBrouillon & { tables: Record<TableBrouillon, Map<string, string>> } {
  const tables: Record<TableBrouillon, Map<string, string>> = { promenades: new Map(), photos: new Map() };
  return {
    tables,
    lire: async (t, cle) => { const v = tables[t].get(cle); return v === undefined ? undefined : JSON.parse(v); },
    ecrire: async (t, cle, v) => { tables[t].set(cle, JSON.stringify(v)); },
    effacer: async (t, cles) => { for (const c of cles) tables[t].delete(c); },
    cles: async (t) => [...tables[t].keys()],
  };
}

const BASE = 'plan-audit-brouillon';

/**
 * Une transaction IndexedDB, en promesse : elle n'est acquise qu'a sa fin (`complete`). Un refus de
 * place arrive souvent sur la transaction (`abort`), pas sur la requete.
 */
function transaction<T>(db: IDBDatabase, table: TableBrouillon, mode: IDBTransactionMode, faire: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  return new Promise((ok, ko) => {
    const tx = db.transaction(table, mode);
    const r = faire(tx.objectStore(table));
    tx.oncomplete = () => ok(r ? r.result : undefined);
    tx.onerror = () => ko(tx.error ?? r?.error);
    tx.onabort = () => ko(tx.error ?? r?.error);
  });
}

/** Le stockage du navigateur ; `null` quand IndexedDB manque (ancien navigateur, environnement de test). */
export function stockageNavigateur(): StockageBrouillon | null {
  if (typeof indexedDB === 'undefined') return null;
  let base: Promise<IDBDatabase> | null = null;
  const ouvrir = (): Promise<IDBDatabase> => {
    base ??= new Promise<IDBDatabase>((ok, ko) => {
      const r = indexedDB.open(BASE, 1);
      r.onupgradeneeded = () => {
        for (const t of ['promenades', 'photos'] as const) if (!r.result.objectStoreNames.contains(t)) r.result.createObjectStore(t);
      };
      r.onsuccess = () => ok(r.result);
      r.onerror = () => ko(r.error);
      r.onblocked = () => ko(new Error('base bloquee'));
    }).catch((e: unknown) => { base = null; throw e; });
    return base;
  };
  return {
    lire: async (t, cle) => transaction(await ouvrir(), t, 'readonly', (s) => s.get(cle)),
    ecrire: async (t, cle, v) => { await transaction(await ouvrir(), t, 'readwrite', (s) => { s.put(v, cle); }); },
    effacer: async (t, cles) => { if (cles.length) await transaction(await ouvrir(), t, 'readwrite', (s) => { for (const c of cles) s.delete(c); }); },
    cles: async (t) => ((await transaction(await ouvrir(), t, 'readonly', (s) => s.getAllKeys())) ?? []).map(String),
  };
}

export interface BrouillonAuditLocal {
  /** Faux quand rien ne se range sur cet appareil : le controleur ne propose ni ne promet rien. */
  readonly disponible: boolean;
  /** Le brouillon le plus recent qui a au moins un cas, hors `sauf` ; `null` s'il n'y en a pas ou si la lecture echoue. */
  chercher(sauf?: string): Promise<BrouillonAudit | null>;
  /** Les cas d'un brouillon, avec leurs photos ; une photo qui manque est retiree et comptee. */
  rouvrir(b: BrouillonAudit): Promise<{ debut: Date; cas: CasAudit[]; photosManquantes: number }>;
  /** Ecrit la promenade (photos nouvelles, puis l'entree) ; sans cas, l'efface. Faux si l'ecriture a echoue. */
  ecrire(e: EtatPromenade): Promise<boolean>;
  /** Efface une promenade et ses photos. */
  jeter(id: string): Promise<void>;
}

export interface OptionsBrouillon {
  /** Prevenu une fois par raison : la personne doit savoir que rien n'est garde. */
  surEchec?: (raison: RaisonEchec) => void;
  /** Le delai au-dela duquel une lecture est tenue pour perdue. */
  delaiLectureMs?: number;
  maintenant?: () => Date;
}

/** Le brouillon de la promenade sur ce stockage ; `null` donne un brouillon qui ne garde rien. */
export function creerBrouillonAudit(stockage: StockageBrouillon | null, o: OptionsBrouillon = {}): BrouillonAuditLocal {
  const delai = o.delaiLectureMs ?? 3000;
  const maintenant = o.maintenant ?? (() => new Date());
  const dits = new Set<RaisonEchec>();
  const echec = (e: unknown) => {
    const r = raisonDe(e);
    if (dits.has(r)) return;
    dits.add(r);
    o.surEchec?.(r);
  };
  /** Les photos deja rangees, par promenade : une photo ne s'ecrit qu'une fois. */
  const rangees = new Map<string, Set<string>>();
  /** Une ecriture a la fois : deux ecritures croisees laisseraient une entree plus vieille que l'autre. */
  let file: Promise<unknown> = Promise.resolve();
  const enFile = <T>(f: () => Promise<T>): Promise<T> => { const p = file.then(f, f); file = p.catch(() => {}); return p; };

  /** Une promenade et toutes ses photos (leurs cles commencent par son identifiant). */
  async function effacerTout(s: StockageBrouillon, id: string): Promise<void> {
    await s.effacer('promenades', [id]);
    await s.effacer('photos', (await s.cles('photos')).filter((c) => c.startsWith(id + '/')));
    rangees.delete(id);
  }

  return {
    disponible: !!stockage,
    async chercher(sauf) {
      if (!stockage) return null;
      const lu = await aTemps((async () => {
        const cles = (await stockage.cles('promenades')).filter((c) => c !== sauf);
        const entrees = await Promise.all(cles.map((c) => stockage.lire('promenades', c).catch(() => null)));
        return entrees.filter(estBrouillon).filter((b) => b.cas.length > 0);
      })(), delai);
      if (!lu?.length) return null;
      return lu.sort((a, b) => (a.misAJour < b.misAJour ? 1 : a.misAJour > b.misAJour ? -1 : 0))[0] ?? null;
    },
    async rouvrir(b) {
      let photosManquantes = 0;
      const deja = new Set<string>();
      const cas = await Promise.all(b.cas.map(async (c): Promise<CasAudit> => {
        const photos: PhotoCas[] = [];
        for (const { cleBrouillon, ...reste } of c.constat.photos) {
          const base64 = stockage ? await aTemps(stockage.lire('photos', cleBrouillon), delai) : null;
          if (typeof base64 !== 'string' || !base64) { photosManquantes++; continue; }
          deja.add(cleBrouillon);
          photos.push({ ...reste, base64 });
        }
        return { ...c, constat: { ...c.constat, photos } };
      }));
      rangees.set(b.id, deja);
      return { debut: new Date(b.debut), cas, photosManquantes };
    },
    ecrire(e) {
      return enFile(async () => {
        if (!stockage) return false;
        const { brouillon, photos } = rangerPromenade(e, maintenant());
        try {
          if (!brouillon.cas.length) { await effacerTout(stockage, brouillon.id); return true; }
          const faites = rangees.get(brouillon.id) ?? new Set<string>();
          rangees.set(brouillon.id, faites);
          for (const [cle, base64] of photos) {
            if (faites.has(cle)) continue;
            await stockage.ecrire('photos', cle, base64);
            faites.add(cle);
          }
          await stockage.ecrire('promenades', brouillon.id, brouillon);
          // Une photo retiree d'un cas (ou un cas retire) ne garde pas sa place sur le telephone.
          const orphelines = [...faites].filter((c) => !photos.has(c));
          if (orphelines.length) { await stockage.effacer('photos', orphelines); orphelines.forEach((c) => faites.delete(c)); }
          return true;
        } catch (err) { echec(err); return false; }
      });
    },
    jeter(id) {
      return enFile(async () => {
        if (!stockage) return;
        try { await effacerTout(stockage, id); } catch (err) { echec(err); }
      });
    },
  };
}

/**
 * L'ecriture au fil de l'eau : chaque changement de la promenade la programme, un peu plus tard,
 * pour qu'une note tapee lettre a lettre ne fasse qu'une ecriture. `vider` ecrit tout de suite
 * (l'ecran se verrouille, l'onglet passe en arriere-plan).
 */
export function creerEcrivainBrouillon(brouillon: BrouillonAuditLocal, lire: () => EtatPromenade, delaiMs = 800): {
  programmer: () => void; vider: () => Promise<boolean>; annuler: () => void;
} {
  let minuteur: ReturnType<typeof setTimeout> | null = null;
  const annuler = () => { if (minuteur !== null) clearTimeout(minuteur); minuteur = null; };
  return {
    programmer() {
      if (!brouillon.disponible) return;
      annuler();
      minuteur = setTimeout(() => { minuteur = null; void brouillon.ecrire(lire()); }, delaiMs);
    },
    async vider() { annuler(); return brouillon.ecrire(lire()); },
    annuler,
  };
}

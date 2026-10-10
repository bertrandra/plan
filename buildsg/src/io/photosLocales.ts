// Les photos de releve, gardees sur l'appareil et non dans le document de la plateforme.
//
// La plateforme refuse qu'un document embarque un contenu (`422 EMBEDDED_ASSET_REJECTED` : toute
// URI `data:`, toute chaine de plus de 64 Kio — backprod DocumentPolicy) : les grosses pieces
// n'ont pas leur place dans PostgreSQL, et elle n'a pas encore de stockage de fichiers. Or un
// releve de facade garde l'elevation redressee en `data:image/jpeg;base64,…` : le premier
// enregistrement d'un batiment releve aurait ete refuse.
//
// A l'enregistrement, chaque photo sort donc du document : elle est rangee dans le navigateur
// (IndexedDB), sous une cle tiree de son contenu, et le releve ne porte plus que cette cle
// (`photoLocale`), la texture a `null`. A l'ouverture, la photo revient du navigateur quand il l'a.
// Ouvert sur un autre appareil, le releve garde ses mesures et ses ouvertures, sans la photo — et
// l'inspecteur le dit. L'export JSON, un fichier de l'utilisateur, garde la photo : seul le depot
// de la plateforme passe par ici.

import type { ObjetBrut, ReleveFacade } from '../model/types.js';

/** Ou les photos se rangent : IndexedDB dans le navigateur, une table en memoire sinon (tests, navigation privee). */
export interface MagasinPhotos {
  lire(cle: string): Promise<string | null>;
  ecrire(cle: string, photo: string): Promise<void>;
}

const BASE = 'plan-photos';
const TABLE = 'photos';

/** Le magasin en memoire : ce que garde un onglet tant qu'il vit. */
export function magasinMemoire(): MagasinPhotos {
  const t = new Map<string, string>();
  return {
    lire: async (cle) => t.get(cle) ?? null,
    ecrire: async (cle, photo) => { t.set(cle, photo); },
  };
}

/** Une requete IndexedDB, en promesse. */
function attendre<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((ok, ko) => { r.onsuccess = () => ok(r.result); r.onerror = () => ko(r.error); });
}

/** Le magasin du navigateur ; `null` quand IndexedDB manque ou refuse (navigation privee, stockage bloque). */
export function magasinNavigateur(): MagasinPhotos | null {
  if (typeof indexedDB === 'undefined') return null;
  let base: Promise<IDBDatabase> | null = null;
  const ouvrir = (): Promise<IDBDatabase> => {
    base ??= new Promise((ok, ko) => {
      const r = indexedDB.open(BASE, 1);
      r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains(TABLE)) r.result.createObjectStore(TABLE); };
      r.onsuccess = () => ok(r.result);
      r.onerror = () => ko(r.error);
    });
    return base;
  };
  return {
    async lire(cle) {
      const db = await ouvrir();
      const v = await attendre(db.transaction(TABLE, 'readonly').objectStore(TABLE).get(cle));
      return typeof v === 'string' ? v : null;
    },
    async ecrire(cle, photo) {
      const db = await ouvrir();
      await attendre(db.transaction(TABLE, 'readwrite').objectStore(TABLE).put(photo, cle));
    },
  };
}

let magasinCourant: MagasinPhotos | null = null;
/** Le magasin de cette page : le navigateur s'il le permet, la memoire sinon. */
export function magasinPhotos(): MagasinPhotos {
  magasinCourant ??= magasinNavigateur() ?? magasinMemoire();
  return magasinCourant;
}

/** Une photo embarquee : une URI `data:` (ce que la plateforme refuse par construction). */
const estEmbarquee = (v: unknown): v is string => typeof v === 'string' && /^\s*data:/i.test(v);

/** FNV-1a sur 32 bits, quatre graines : une cle de 32 caracteres hexadecimaux, stable, sans dependance. */
export function cleDePhoto(photo: string): string {
  const graines = [0x811c9dc5, 0x01000193, 0x9e3779b9, 0x85ebca6b];
  return 'p' + graines.map((g) => {
    let h = g >>> 0;
    for (let i = 0; i < photo.length; i++) { h ^= photo.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    return h.toString(16).padStart(8, '0');
  }).join('');
}

type AvecFacades = ObjetBrut & { facades?: ReleveFacade[] | null };

/**
 * Le document tel qu'il part vers la plateforme : chaque photo de releve rangee dans le magasin et
 * remplacee par sa cle. Les objets d'origine ne sont pas touches (la page garde ses photos).
 * `perdues` compte les photos que le magasin n'a pas pu garder.
 */
export async function sortirLesPhotos<T extends ObjetBrut>(objets: readonly T[], magasin: MagasinPhotos): Promise<{ objets: T[]; sorties: number; perdues: number }> {
  let sorties = 0, perdues = 0;
  const out = await Promise.all(objets.map(async (o) => {
    const facades = (o as AvecFacades).facades;
    if (!Array.isArray(facades) || !facades.some((r) => estEmbarquee(r.texture))) return o;
    const copie = await Promise.all(facades.map(async (r) => {
      if (!estEmbarquee(r.texture)) return r;
      const cle = cleDePhoto(r.texture);
      try { await magasin.ecrire(cle, r.texture); } catch { perdues++; }
      sorties++;
      return { ...r, texture: null, photoLocale: cle };
    }));
    return { ...o, facades: copie };
  }));
  return { objets: out, sorties, perdues };
}

/** Le document relu : chaque releve qui porte une cle retrouve sa photo quand le magasin l'a. */
export async function rentrerLesPhotos<T extends ObjetBrut>(objets: readonly T[], magasin: MagasinPhotos): Promise<{ objets: T[]; manquantes: number }> {
  let manquantes = 0;
  const out = await Promise.all(objets.map(async (o) => {
    const facades = (o as AvecFacades).facades;
    if (!Array.isArray(facades) || !facades.some((r) => r.photoLocale && !r.texture)) return o;
    const copie = await Promise.all(facades.map(async (r) => {
      if (!r.photoLocale || r.texture) return r;
      const photo = await magasin.lire(r.photoLocale).catch(() => null);
      if (!photo) { manquantes++; return r; }
      return { ...r, texture: photo };
    }));
    return { ...o, facades: copie };
  }));
  return { objets: out, manquantes };
}

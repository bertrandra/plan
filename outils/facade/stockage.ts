// Les photos gardees sur l'appareil (IndexedDB) : sur iPhone, Safari recharge parfois la page au
// retour de l'appareil photo, et sans cela les photos deja prises seraient perdues. Les octets sont
// ranges en ArrayBuffer plutot qu'en Blob, que Safari a longtemps mal gardes. Tout echec est
// silencieux : la page marche sans stockage.

import type { P2 } from './auto.js';

export interface Enregistrement {
  id: number;
  nom: string;
  type: string;
  octets: ArrayBuffer;
  ordre: number;
  /** Coins poses a la main, ou null (redressement automatique). */
  coins: P2[] | null;
  /** 0 : la facade la mieux vue ; 1 : l'autre. */
  facade: number;
}

const BASE = 'facade-redressee',
  TABLE = 'photos';
let ouverture: Promise<IDBDatabase | null> | null = null;

function ouvrir(): Promise<IDBDatabase | null> {
  ouverture ??= new Promise((ok) => {
    try {
      const r = indexedDB.open(BASE, 1);
      r.onupgradeneeded = () => r.result.createObjectStore(TABLE, { keyPath: 'id' });
      r.onsuccess = () => ok(r.result);
      r.onerror = () => ok(null);
      r.onblocked = () => ok(null);
    } catch {
      ok(null);
    }
  });
  return ouverture;
}

async function requete<T>(mode: IDBTransactionMode, f: (t: IDBObjectStore) => IDBRequest<T> | void): Promise<T | null> {
  const db = await ouvrir();
  if (!db) return null;
  return new Promise((ok) => {
    try {
      const tx = db.transaction(TABLE, mode);
      const r = f(tx.objectStore(TABLE));
      tx.oncomplete = () => ok(r ? r.result : null);
      tx.onerror = tx.onabort = () => ok(null);
    } catch {
      ok(null);
    }
  });
}

export async function lister(): Promise<Enregistrement[]> {
  const t = await requete<Enregistrement[]>('readonly', (s) => s.getAll() as IDBRequest<Enregistrement[]>);
  return (t ?? []).sort((a, b) => a.ordre - b.ordre);
}

export async function mettre(e: Enregistrement): Promise<boolean> {
  return (await requete('readwrite', (s) => s.put(e))) !== null;
}

export async function modifier(id: number, patch: Partial<Omit<Enregistrement, 'id' | 'octets'>>): Promise<void> {
  const db = await ouvrir();
  if (!db) return;
  await new Promise<void>((ok) => {
    try {
      const tx = db.transaction(TABLE, 'readwrite');
      const s = tx.objectStore(TABLE);
      const g = s.get(id);
      g.onsuccess = () => {
        if (g.result) s.put({ ...g.result, ...patch });
      };
      tx.oncomplete = tx.onerror = tx.onabort = () => ok();
    } catch {
      ok();
    }
  });
}

export async function retirer(id: number): Promise<void> {
  await requete('readwrite', (s) => s.delete(id));
}

export async function vider(): Promise<void> {
  await requete('readwrite', (s) => s.clear());
}

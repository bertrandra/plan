// Le Web Worker de facade.html : il recoit une operation, la joue, renvoie le resultat. Les gros
// tableaux (pixels) passent par transfert, sans copie.
import { operations, type Operations } from './operations.js';

const ctx = self as unknown as { onmessage: ((e: MessageEvent) => void) | null; postMessage(m: unknown, t?: Transferable[]): void };

ctx.onmessage = async (e: MessageEvent) => {
  const { id, op, arg } = e.data as { id: number; op: keyof Operations; arg: never };
  try {
    const r = await (operations[op] as (a: never, p: (f: number, t: string) => void) => Promise<unknown>)(arg, (fraction, texte) => ctx.postMessage({ id, fraction, texte }));
    const transfert: Transferable[] = [];
    if (r && typeof r === 'object' && 'sortie' in r) {
      const x = r as { sortie: Uint8ClampedArray; vu: Uint8Array };
      transfert.push(x.sortie.buffer as ArrayBuffer, x.vu.buffer as ArrayBuffer);
    }
    ctx.postMessage({ id, ok: r }, transfert);
  } catch (err) {
    ctx.postMessage({ id, erreur: err instanceof Error ? err.message : String(err) });
  }
};

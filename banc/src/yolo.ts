// Un modele de detection (.onnx) dans le navigateur, avec onnxruntime-web (etape 3) : les YOLO (ceux du depot facade, YOLOv10n, et ceux
// entraines avec le jeu du banc) et RF-DETR (Roboflow, Apache 2.0 : image etiree au carre, normalisee ImageNet ; sorties dets et labels).
// Le runtime vient d'un CDN, a la demande ; le modele, de l'API du banc (api.php?r=modele).

import type { Modele } from './types.js';
import { iou, type Boite } from './geometrie.js';

export const RUNTIME = [
  { js: 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.24.1/dist/ort.min.js', dossier: 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.24.1/dist/' },
  { js: 'https://unpkg.com/onnxruntime-web@1.24.1/dist/ort.min.js', dossier: 'https://unpkg.com/onnxruntime-web@1.24.1/dist/' },
];
const TAILLE = 640;

export interface Detection { classe: number; score: number; boite: Boite }

interface Tenseur { data: Float32Array; dims: number[] }
interface Session { inputNames: string[]; run(e: Record<string, unknown>): Promise<Record<string, Tenseur>> }
interface Ort {
  env: { wasm: { wasmPaths: string; numThreads: number } };
  Tensor: new (type: string, data: Float32Array, dims: number[]) => unknown;
  InferenceSession: { create(octets: Uint8Array, o: { executionProviders: string[] }): Promise<Session> };
}

let runtime: Promise<Ort> | null = null;
const sessions = new Map<string, Promise<Session>>();

function chargerScript(url: string): Promise<void> {
  return new Promise((ok, ko) => {
    const s = document.createElement('script');
    s.src = url;
    s.crossOrigin = 'anonymous';
    s.onload = () => ok();
    s.onerror = () => { s.remove(); ko(new Error('script introuvable : ' + url)); };
    document.head.appendChild(s);
  });
}

function chargerRuntime(): Promise<Ort> {
  runtime ??= (async () => {
    for (const r of RUNTIME) {
      try {
        await chargerScript(r.js);
        const ort = (window as unknown as { ort?: Ort }).ort;
        if (ort) { ort.env.wasm.wasmPaths = r.dossier; ort.env.wasm.numThreads = 1; return ort; }
      } catch { /* la source suivante */ }
    }
    throw new Error('Le moteur ONNX (onnxruntime-web) n’a pas pu être chargé : réseau ?');
  })();
  runtime.catch(() => { runtime = null; });
  return runtime;
}

async function session(url: string): Promise<{ ort: Ort; s: Session }> {
  const ort = await chargerRuntime();
  let s = sessions.get(url);
  if (!s) {
    s = (async () => {
      const r = await fetch(url, { credentials: 'same-origin' });
      if (!r.ok) throw new Error('Modèle illisible (' + r.status + ')');
      return ort.InferenceSession.create(new Uint8Array(await r.arrayBuffer()), { executionProviders: ['wasm'] });
    })();
    s.catch(() => sessions.delete(url));
    sessions.set(url, s);
  }
  return { ort, s: await s };
}

/** L'image mise au carre de 640 sans deformation (bandes grises 114), comme a l'entrainement ; et de quoi revenir aux pixels. */
export function letterbox(L: number, H: number): { k: number; px: number; py: number; nw: number; nh: number } {
  const k = Math.min(TAILLE / L, TAILLE / H), nw = Math.round(L * k), nh = Math.round(H * k);
  return { k, px: Math.floor((TAILLE - nw) / 2), py: Math.floor((TAILLE - nh) / 2), nw, nh };
}

/** La normalisation ImageNet de RF-DETR (rfdetr/detr.py : means, stds). */
const MOYENNES = [0.485, 0.456, 0.406], ECARTS = [0.229, 0.224, 0.225];

/**
 * Les sorties de RF-DETR (rfdetr 1.12, models/postprocess.py) : `dets` [1, Q, 4] (cx, cy, l, h en parts de l'image), `labels` [1, Q, C]
 * (des logits ; C = les classes, plus une case qui n'en est pas une). Chaque couple requete-classe au-dessus du seuil (sigmoide) est une
 * detection ; les 300 meilleures, en pixels de l'image `L` x `H` (l'image a ete etiree au carre, sans bandes : on la detire).
 */
export function decoderRfDetr(dets: Float32Array, logits: Float32Array, Q: number, C: number, nc: number, seuil: number, L: number, H: number): Detection[] {
  const out: (Detection & { cle: number })[] = [];
  for (let q = 0; q < Q; q++) {
    for (let c = 0; c < Math.min(C, nc); c++) {
      const score = 1 / (1 + Math.exp(-(logits[q * C + c] as number)));
      if (score < seuil) continue;
      const cx = dets[q * 4] as number, cy = dets[q * 4 + 1] as number, l = dets[q * 4 + 2] as number, h = dets[q * 4 + 3] as number;
      out.push({ classe: c, score, cle: q * C + c, boite: { x0: Math.max(0, (cx - l / 2) * L), y0: Math.max(0, (cy - h / 2) * H), x1: Math.min(L, (cx + l / 2) * L), y1: Math.min(H, (cy + h / 2) * H) } });
    }
  }
  // Meme ordre que rfdetr : score decroissant, puis l'indice requete-classe croissant. Un modele quantifie (int8) sort parfois deux fois le
  // meme objet : un doublon de meme classe recouvert a plus de 70 % part (sans effet sur un modele en pleine precision).
  return nms(out.sort((a, b) => b.score - a.score || a.cle - b.cle).slice(0, 300).map(({ cle: _c, ...d }) => { void _c; return d; }), 0.7);
}

/** RF-DETR : l'image etiree au carre R x R, en RGB normalise ImageNet (CHW). */
function entreeRfDetr(source: CanvasImageSource, R: number): Float32Array {
  const c = document.createElement('canvas');
  c.width = c.height = R;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('Canevas indisponible.');
  ctx.drawImage(source, 0, 0, R, R);
  const rgba = ctx.getImageData(0, 0, R, R).data, n = R * R, chw = new Float32Array(3 * n);
  for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) chw[k * n + i] = ((rgba[4 * i + k] as number) / 255 - (MOYENNES[k] as number)) / (ECARTS[k] as number);
  c.width = c.height = 0;
  return chw;
}

/**
 * Comment lire une sortie, d'apres sa forme. « bout-en-bout » (YOLOv10, YOLO26 exporte sans NMS) : [1, 300, 6] lignes (x1, y1, x2, y2,
 * score, classe), [1, 300, 38] en segmentation (les 32 coefficients des masques a la suite), deja sans doublons. « brut » (YOLOv8,
 * YOLO11, ou un YOLO26 exporte autrement) : [1, 4 + nc (+ 32), 8400], une colonne par candidat, a passer par la NMS. Les lignes sont
 * moins nombreuses que les candidats : la plus petite dimension dit la forme.
 */
export function modeDeSortie(dims: readonly number[]): { mode: 'bout-en-bout'; pas: number } | { mode: 'brut' } {
  const a = dims[1] ?? 0, b = dims[2] ?? 0;
  return dims.length === 3 && b >= 6 && b < a ? { mode: 'bout-en-bout', pas: b } : { mode: 'brut' };
}

/** Les sorties de bout en bout (YOLOv10, YOLO26) : une ligne par detection, x1, y1, x2, y2, score, classe en tete, dans le carre de 640. */
export function decoderV10(d: Float32Array, seuil: number, pas = 6): Detection[] {
  const out: Detection[] = [];
  for (let i = 0; i + 5 < d.length; i += pas) {
    const score = d[i + 4] as number;
    if (score >= seuil) out.push({ classe: Math.round(d[i + 5] as number), score, boite: { x0: d[i] as number, y0: d[i + 1] as number, x1: d[i + 2] as number, y1: d[i + 3] as number } });
  }
  return out;
}

/**
 * Les sorties d'un YOLOv8 / YOLO11 (detection ou segmentation) : [1, 4 + nc (+ 32 masques), N], colonne par candidat (cx, cy, l, h, puis un
 * score par classe), a passer par la NMS. Les coefficients des masques sont ignores : le brouillon pose des boites.
 */
export function decoderV8(d: Float32Array, dims: readonly number[], nc: number, seuil: number): Detection[] {
  const N = dims[2] ?? 0;
  const cand: Detection[] = [];
  for (let j = 0; j < N; j++) {
    let best = -1, score = seuil;
    for (let c = 0; c < nc; c++) { const s = d[(4 + c) * N + j] as number; if (s >= score) { score = s; best = c; } }
    if (best < 0) continue;
    const cx = d[j] as number, cy = d[N + j] as number, l = d[2 * N + j] as number, h = d[3 * N + j] as number;
    cand.push({ classe: best, score, boite: { x0: cx - l / 2, y0: cy - h / 2, x1: cx + l / 2, y1: cy + h / 2 } });
  }
  return nms(cand, 0.5);
}

/** La suppression des non-maximums, classe par classe. */
export function nms(l: readonly Detection[], seuil: number): Detection[] {
  const tries = [...l].sort((a, b) => b.score - a.score);
  const garde: Detection[] = [];
  for (const d of tries) if (!garde.some((g) => g.classe === d.classe && iou(g.boite, d.boite) > seuil)) garde.push(d);
  return garde;
}

/** Les detections d'un modele sur une image (un canevas ou une image deja chargee), en pixels de cette image. */
export async function detecter(m: Modele, source: CanvasImageSource & { width: number; height: number }, urlModele: string): Promise<Detection[]> {
  const { ort, s } = await session(urlModele);
  const L = source.width, H = source.height;
  if (m.format === 'rf-detr') {
    const R = m.resolution ?? 384;
    const sortie = await s.run({ [s.inputNames[0] as string]: new ort.Tensor('float32', entreeRfDetr(source, R), [1, 3, R, R]) });
    const dets = sortie.dets, labels = sortie.labels;
    if (!dets || !labels) throw new Error('Ce modèle ne sort pas « dets » et « labels » : est-ce bien un RF-DETR exporté par rfdetr ?');
    return decoderRfDetr(dets.data, labels.data, labels.dims[1] ?? 0, labels.dims[2] ?? 0, m.classes.length, m.seuil, L, H)
      .filter((d) => d.boite.x1 - d.boite.x0 >= 2 && d.boite.y1 - d.boite.y0 >= 2);
  }
  const lb = letterbox(L, H);
  const c = document.createElement('canvas');
  c.width = c.height = TAILLE;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('Canevas indisponible.');
  ctx.fillStyle = 'rgb(114,114,114)';
  ctx.fillRect(0, 0, TAILLE, TAILLE);
  ctx.drawImage(source, lb.px, lb.py, lb.nw, lb.nh);
  const rgba = ctx.getImageData(0, 0, TAILLE, TAILLE).data, n = TAILLE * TAILLE, chw = new Float32Array(3 * n);
  for (let i = 0; i < n; i++) { chw[i] = (rgba[4 * i] as number) / 255; chw[n + i] = (rgba[4 * i + 1] as number) / 255; chw[2 * n + i] = (rgba[4 * i + 2] as number) / 255; }
  const sortie = await s.run({ [s.inputNames[0] as string]: new ort.Tensor('float32', chw, [1, 3, TAILLE, TAILLE]) });
  const t = Object.values(sortie)[0];
  if (!t) return [];
  const forme = modeDeSortie(t.dims);
  const brutes = forme.mode === 'bout-en-bout' ? decoderV10(t.data, m.seuil, forme.pas) : decoderV8(t.data, t.dims, m.classes.length, m.seuil);
  return brutes.map((d) => ({ ...d, boite: { x0: Math.max(0, (d.boite.x0 - lb.px) / lb.k), y0: Math.max(0, (d.boite.y0 - lb.py) / lb.k), x1: Math.min(L, (d.boite.x1 - lb.px) / lb.k), y1: Math.min(H, (d.boite.y1 - lb.py) / lb.k) } }))
    .filter((d) => d.boite.x1 - d.boite.x0 >= 2 && d.boite.y1 - d.boite.y0 >= 2);
}

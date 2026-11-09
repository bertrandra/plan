#!/usr/bin/env node
// Note un detecteur de baies sur un jeu d'images annotees.
//
//   node evaluer.mjs <detecteur.ts> <dossier-du-jeu> [--images <dossier>] [--seul <texte>] [--json <fichier>] [--budget <facteur>]
//
// Le detecteur est un fichier TypeScript qui exporte
//   detecterBaies(img: { largeur, hauteur, donnees: Uint8ClampedArray RGBA }, vu: Uint8Array | null, pxParM: number | null)
//     -> { baies: { px: { x, y, l, h }, ... }[], ... }
// Chaque echantillon du jeu : <nom>.rgba (RGBA brut), <nom>.vu (facultatif : 1 = pixel vu), <nom>.json
// { nom, groupe, largeur, hauteur, pxParM, gt: [{ x, y, l, h, classe, difficile?, groupe?, lM?, hM? }], ignorer: [{ x, y, l, h }] }.
//
// Notation, par image :
//   - objets : une detection et une ouverture s'apparient si leur recouvrement (IoU) vaut au moins 0,5.
//     Les ouvertures d'un meme `groupe` (les pans d'une baie) peuvent aussi etre trouvees d'un seul
//     tenant (IoU >= 0,5 avec leur boite englobante). Une ouverture `difficile` (cachee, minuscule)
//     ne compte ni pour ni contre. Une detection dans une zone `ignorer`, ou contenue dans une
//     ouverture deja trouvee (un vantail de plus), ne compte pas comme fausse.
//   - pixels : F1 entre la surface detectee et la surface annotee.
//   - note de l'image = 0,5 x F1 objets + 0,5 x F1 pixels.
//   - facades synthetiques (cotes connues) : 0,4 x F1 objets + 0,2 x F1 pixels + 0,4 x justesse des
//     cotes (1 jusqu'a 2 cm d'erreur moyenne, 0 a 10 cm).
// Note globale = 0,55 x maison + 0,35 x cmp + 0,10 x synth (sur les groupes presents).

import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { deflateSync } from 'node:zlib';
import { tmpdir } from 'node:os';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const require = createRequire(RACINE + '/package.json');
const esbuild = require('esbuild');

const args = process.argv.slice(2);
const opt = (n) => {
  const i = args.indexOf(n);
  return i >= 0 ? args[i + 1] : null;
};
const positionnels = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--')));
const [detecteur, jeu] = positionnels;
if (!detecteur || !jeu) {
  console.error('usage : node evaluer.mjs <detecteur.ts> <dossier-du-jeu> [--images <dossier>] [--seul <texte>] [--json <fichier>]');
  process.exit(2);
}
const dossierImages = opt('--images');
const seul = opt('--seul');
const sortieJson = opt('--json');
// Le budget de temps vaut pour un detecteur ; le vote en lance trois (--budget 3).
const budget = Number(opt('--budget') ?? 1) || 1;

// Le detecteur, assemble avec ses dependances.
const paquet = resolve(tmpdir(), `detecteur-${process.pid}.mjs`);
await esbuild.build({ entryPoints: [resolve(detecteur)], bundle: true, format: 'esm', platform: 'node', outfile: paquet, logLevel: 'warning', absWorkingDir: RACINE });
const mod = await import(pathToFileURL(paquet).href);
if (typeof mod.detecterBaies !== 'function') {
  console.error('Le fichier doit exporter detecterBaies(img, vu, pxParM).');
  process.exit(2);
}

const aire = (b) => Math.max(0, b.l) * Math.max(0, b.h);
function inter(a, b) {
  const x0 = Math.max(a.x, b.x),
    y0 = Math.max(a.y, b.y),
    x1 = Math.min(a.x + a.l, b.x + b.l),
    y1 = Math.min(a.y + a.h, b.y + b.h);
  return x1 > x0 && y1 > y0 ? (x1 - x0) * (y1 - y0) : 0;
}
const iou = (a, b) => {
  const i = inter(a, b);
  return i / (aire(a) + aire(b) - i || 1);
};
const englobante = (bs) => {
  const x0 = Math.min(...bs.map((b) => b.x)),
    y0 = Math.min(...bs.map((b) => b.y)),
    x1 = Math.max(...bs.map((b) => b.x + b.l)),
    y1 = Math.max(...bs.map((b) => b.y + b.h));
  return { x: x0, y: y0, l: x1 - x0, h: y1 - y0 };
};
const f1 = (tp, fp, fn) => (tp ? (2 * tp) / (2 * tp + fp + fn) : 0);

function noter(m, dets) {
  const gt = m.gt;
  const etatD = dets.map(() => 'libre'); // libre | tp | difficile | ignore | doublon | fp
  const trouve = gt.map(() => -1);
  // 1. Appariement glouton par IoU decroissant.
  const paires = [];
  dets.forEach((d, i) => gt.forEach((g, j) => {
    const v = iou(d, g);
    if (v >= 0.5) paires.push([v, i, j]);
  }));
  paires.sort((a, b) => b[0] - a[0]);
  const ious = [];
  for (const [v, i, j] of paires) {
    if (etatD[i] !== 'libre' || trouve[j] >= 0) continue;
    trouve[j] = i;
    etatD[i] = gt[j].difficile ? 'difficile' : 'tp';
    if (!gt[j].difficile) ious.push(v);
  }
  // 2. Les pans d'une baie trouves d'un seul tenant.
  const groupes = new Map();
  gt.forEach((g, j) => g.groupe && groupes.set(g.groupe, [...(groupes.get(g.groupe) ?? []), j]));
  for (const membres of groupes.values()) {
    if (membres.length < 2) continue;
    const libres = membres.filter((j) => trouve[j] < 0);
    if (!libres.length) continue;
    const boite = englobante(membres.map((j) => gt[j]));
    dets.forEach((d, i) => {
      if (etatD[i] !== 'libre') return;
      const v = iou(d, boite);
      if (v < 0.5) return;
      etatD[i] = 'tp';
      for (const j of libres) if (trouve[j] < 0) trouve[j] = i;
      ious.push(v);
    });
  }
  // 3. Ce qui reste : ignore, doublon dans une ouverture trouvee, ou faux.
  dets.forEach((d, i) => {
    if (etatD[i] !== 'libre') return;
    const a = aire(d) || 1;
    if ((m.ignorer ?? []).some((z) => inter(d, z) / a >= 0.5)) etatD[i] = 'ignore';
    else if (gt.some((g, j) => trouve[j] >= 0 && inter(d, g) / a >= 0.8)) etatD[i] = 'doublon';
    else if (gt.some((g) => g.difficile && inter(d, g) / a >= 0.5)) etatD[i] = 'difficile';
    else etatD[i] = 'fp';
  });
  const requis = gt.map((g, j) => j).filter((j) => !gt[j].difficile);
  const tp = requis.filter((j) => trouve[j] >= 0).length;
  const fn = requis.length - tp;
  const fp = etatD.filter((e) => e === 'fp').length;
  // Pixels : sur une grille reduite.
  const pas = Math.max(1, Math.ceil(Math.max(m.largeur, m.hauteur) / 700));
  const L = Math.ceil(m.largeur / pas),
    H = Math.ceil(m.hauteur / pas);
  const peindre = (bs) => {
    const t = new Uint8Array(L * H);
    for (const b of bs) {
      const x0 = Math.max(0, Math.round(b.x / pas)),
        y0 = Math.max(0, Math.round(b.y / pas)),
        x1 = Math.min(L, Math.round((b.x + b.l) / pas)),
        y1 = Math.min(H, Math.round((b.y + b.h) / pas));
      for (let y = y0; y < y1; y++) t.fill(1, y * L + x0, y * L + Math.max(x0, x1));
    }
    return t;
  };
  const mReq = peindre(requis.map((j) => gt[j])),
    mDif = peindre([...gt.filter((g) => g.difficile), ...(m.ignorer ?? [])]),
    mDet = peindre(dets);
  let ptp = 0,
    pfp = 0,
    pfn = 0;
  for (let k = 0; k < L * H; k++) {
    if (mReq[k]) mDet[k] ? ptp++ : pfn++;
    else if (mDet[k] && !mDif[k]) pfp++;
  }
  const fObj = requis.length || fp ? f1(tp, fp, fn) : 1;
  const fPix = ptp + pfp + pfn ? f1(ptp, pfp, pfn) : 1;
  // Cotes (facades synthetiques) : erreur en cm sur la largeur et la hauteur des ouvertures trouvees.
  let cotes = null;
  if (m.pxParM && gt.some((g) => g.lM)) {
    const e = [];
    gt.forEach((g, j) => {
      if (trouve[j] < 0 || !g.lM) return;
      const d = dets[trouve[j]];
      e.push(Math.abs(d.l / m.pxParM - g.lM) * 100, Math.abs(d.h / m.pxParM - g.hM) * 100);
    });
    cotes = e.length ? { moy: e.reduce((a, b) => a + b, 0) / e.length, max: Math.max(...e) } : { moy: 99, max: 99 };
  }
  let note = 0.5 * fObj + 0.5 * fPix;
  if (cotes) note = 0.4 * fObj + 0.2 * fPix + 0.4 * Math.max(0, Math.min(1, (10 - cotes.moy) / 8));
  return { tp, fp, fn, fObj, fPix, iouMoy: ious.length ? ious.reduce((a, b) => a + b, 0) / ious.length : 0, cotes, note, etatD, trouve };
}

// Apercu : l'image reduite, les ouvertures annotees et les detections.
function png(fichier, w, h, d) {
  const crcT = new Int32Array(256).map((_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c;
  });
  const crc = (b) => {
    let c = -1;
    for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8);
    return (c ^ -1) >>> 0;
  };
  const bloc = (t, data) => {
    const l = Buffer.alloc(4);
    l.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(t), data]);
    const c = Buffer.alloc(4);
    c.writeUInt32BE(crc(td));
    return Buffer.concat([l, td, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const brut = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) Buffer.from(d.buffer, d.byteOffset + y * w * 3, w * 3).copy(brut, y * (w * 3 + 1) + 1);
  writeFileSync(fichier, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), bloc('IHDR', ihdr), bloc('IDAT', deflateSync(brut, { level: 5 })), bloc('IEND', Buffer.alloc(0))]));
}
function apercu(fichier, m, rgba, dets, r) {
  const f = Math.max(1, Math.ceil(Math.max(m.largeur, m.hauteur) / 1500));
  const W = Math.floor(m.largeur / f),
    H = Math.floor(m.hauteur / f);
  const o = new Uint8Array(W * H * 3);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const p = (y * f * m.largeur + x * f) * 4;
      o[(y * W + x) * 3] = rgba[p];
      o[(y * W + x) * 3 + 1] = rgba[p + 1];
      o[(y * W + x) * 3 + 2] = rgba[p + 2];
    }
  const cadre = (b, c, ep, pointille = false) => {
    const x0 = Math.round(b.x / f),
      y0 = Math.round(b.y / f),
      x1 = Math.round((b.x + b.l) / f),
      y1 = Math.round((b.y + b.h) / f);
    const pt = (x, y, k) => {
      if (x < 0 || y < 0 || x >= W || y >= H || (pointille && (k >> 2) % 2)) return;
      o.set(c, (y * W + x) * 3);
    };
    for (let e = 0; e < ep; e++) {
      for (let x = x0; x <= x1; x++) {
        pt(x, y0 + e, x);
        pt(x, y1 - e, x);
      }
      for (let y = y0; y <= y1; y++) {
        pt(x0 + e, y, y);
        pt(x1 - e, y, y);
      }
    }
  };
  for (const z of m.ignorer ?? []) cadre(z, [40, 120, 255], 1, true);
  m.gt.forEach((g, j) => cadre(g, g.difficile ? [255, 170, 0] : r.trouve[j] >= 0 ? [0, 220, 0] : [255, 230, 0], g.difficile ? 2 : 4));
  dets.forEach((d, i) => cadre(d, r.etatD[i] === 'fp' ? [255, 0, 255] : r.etatD[i] === 'tp' ? [255, 0, 0] : [150, 150, 150], 2));
  png(fichier, W, H, o);
}

const noms = readdirSync(jeu).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)).filter((n) => !seul || n.includes(seul)).sort();
if (dossierImages && !existsSync(dossierImages)) mkdirSync(dossierImages, { recursive: true });
const lignes = [];
console.log('image'.padEnd(22), 'groupe  taille       ouv det  TP FP FN   F1obj F1pix  IoU   note    ms');
for (const nom of noms) {
  const m = JSON.parse(readFileSync(`${jeu}/${nom}.json`, 'utf8'));
  const rgba = new Uint8ClampedArray(readFileSync(`${jeu}/${nom}.rgba`));
  const vu = existsSync(`${jeu}/${nom}.vu`) ? new Uint8Array(readFileSync(`${jeu}/${nom}.vu`)) : null;
  let dets = [],
    ms = 0,
    erreur = null;
  try {
    const t0 = performance.now();
    const res = await mod.detecterBaies({ largeur: m.largeur, hauteur: m.hauteur, donnees: rgba }, vu, m.pxParM ?? null);
    ms = performance.now() - t0;
    dets = (res?.baies ?? []).map((b) => ({ x: b.px.x, y: b.px.y, l: b.px.l, h: b.px.h })).filter((b) => [b.x, b.y, b.l, b.h].every(Number.isFinite) && b.l > 0 && b.h > 0);
  } catch (e) {
    erreur = e instanceof Error ? e.message : String(e);
  }
  const r = noter(m, dets);
  if (erreur) r.note = 0;
  const requis = m.gt.filter((g) => !g.difficile).length;
  lignes.push({ nom, groupe: m.groupe, mpx: (m.largeur * m.hauteur) / 1e6, requis, det: dets.length, tp: r.tp, fp: r.fp, fn: r.fn, fObj: r.fObj, fPix: r.fPix, iou: r.iouMoy, cotes: r.cotes, note: r.note, ms, erreur });
  console.log(
    nom.padEnd(22),
    m.groupe.padEnd(7),
    `${m.largeur}x${m.hauteur}`.padEnd(11),
    String(requis).padStart(4),
    String(dets.length).padStart(3),
    String(r.tp).padStart(3),
    String(r.fp).padStart(2),
    String(r.fn).padStart(2),
    '  ' + r.fObj.toFixed(2).padStart(5),
    r.fPix.toFixed(2).padStart(5),
    r.iouMoy.toFixed(2).padStart(5),
    r.note.toFixed(3).padStart(6),
    String(Math.round(ms)).padStart(6),
    r.cotes ? ` cotes ${r.cotes.moy.toFixed(1)} cm (max ${r.cotes.max.toFixed(1)})` : '',
    erreur ? ' ERREUR : ' + erreur : '',
  );
  if (dossierImages) apercu(`${dossierImages}/${nom}.png`, m, rgba, dets, r);
}
const POIDS = { maison: 0.55, cmp: 0.35, synth: 0.1 };
const parGroupe = {};
for (const g of Object.keys(POIDS)) {
  const l = lignes.filter((x) => x.groupe === g);
  if (!l.length) continue;
  const somme = (k) => l.reduce((a, x) => a + x[k], 0);
  parGroupe[g] = { images: l.length, note: somme('note') / l.length, rappel: somme('tp') / Math.max(1, somme('tp') + somme('fn')), precision: somme('tp') / Math.max(1, somme('tp') + somme('fp')), fPix: somme('fPix') / l.length, msMax: Math.max(...l.map((x) => x.ms)) };
}
const poids = Object.keys(parGroupe).reduce((a, g) => a + POIDS[g], 0);
const globale = Object.keys(parGroupe).reduce((a, g) => a + (POIDS[g] * parGroupe[g].note) / poids, 0);
console.log('');
for (const [g, v] of Object.entries(parGroupe))
  console.log(`${g.padEnd(7)} ${String(v.images).padStart(3)} images   note ${v.note.toFixed(3)}   rappel ${(100 * v.rappel).toFixed(0)} %   precision ${(100 * v.precision).toFixed(0)} %   F1 pixels ${v.fPix.toFixed(2)}   temps max ${Math.round(v.msMax)} ms`);
console.log(`NOTE GLOBALE ${globale.toFixed(4)}`);
const lent = lignes.filter((x) => x.ms > budget * (100 * x.mpx + 500));
if (lent.length) console.log(`TROP LENT (plus de ${budget} x (100 ms par megapixel + 500 ms)) : ` + lent.map((x) => `${x.nom} ${Math.round(x.ms)} ms`).join(', '));
if (dossierImages) console.log(`Apercus dans ${dossierImages} : vert = ouverture trouvee, jaune = manquee, orange = difficile, bleu pointille = zone ignoree ; rouge = detection juste, magenta = fausse detection, gris = doublon ou ignoree.`);
if (sortieJson) writeFileSync(sortieJson, JSON.stringify({ globale, parGroupe, lignes }, null, 1));

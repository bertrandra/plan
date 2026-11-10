// La notation d'une image du banc : partagee par evaluer.mjs (le banc reel) et rejouer.mjs (le vote
// rejoue sur des boites rangees). Les regles sont decrites en tete de evaluer.mjs.

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

/** Le poids de chaque groupe d'images dans la note globale (sur les groupes presents). */
export const POIDS = { maison: 0.55, cmp: 0.35, synth: 0.1 };

/** Note par groupe et note globale d'une liste de lignes { groupe, note, tp, fp, fn, ... }. */
export function parGroupes(lignes) {
  const par = {};
  for (const g of Object.keys(POIDS)) {
    const l = lignes.filter((x) => x.groupe === g);
    if (!l.length) continue;
    const somme = (k) => l.reduce((a, x) => a + (x[k] ?? 0), 0);
    par[g] = { images: l.length, note: somme('note') / l.length, tp: somme('tp'), fp: somme('fp'), fn: somme('fn'), rappel: somme('tp') / Math.max(1, somme('tp') + somme('fn')), precision: somme('tp') / Math.max(1, somme('tp') + somme('fp')), fPix: somme('fPix') / l.length };
  }
  const poids = Object.keys(par).reduce((a, g) => a + POIDS[g], 0);
  const globale = Object.keys(par).reduce((a, g) => a + (POIDS[g] * par[g].note) / poids, 0);
  return { par, globale };
}

export { noter, iou, inter, aire };

// Le mur lu sur l'assemblage des vues redressees (facade/releve/coinsAuto.ts::murSurLAssemblage) : l'egout, le sol et les deux bouts,
// compares a la verite sur chaque scene du banc. C'est la recherche qui suit le redressement par les reperes de l'audit et de la
// calibration (MD/spec-releve-facade.md §6.1 bis) ; le banc des facades (banc.ts) ne la joue pas.
//
//   npx tsx .claude/skills/facades/scripts/egout-sol.ts [mots] [--images dossier]
//
// Pour chaque scene a prise par camera : toutes ses vues redressees par leurs points de fuite (et, en seconde ligne, la vue principale
// par quatre reperes poses aux coins de sa premiere ouverture), assemblees, puis le mur cherche aux proportions de la verite (ce que
// donne le plan : largeur du cadastre, hauteur du LiDAR). L'ecart de chaque bord est en part de la largeur du mur ; « juste » : 2 % au
// plus. Le gabarit vrai de la scene (son haut, pignon compris, comme le LiDAR le donnerait : facade/gabaritMur.ts) est passe a la
// recherche, qui le pose entre les bords trouves ; « Silhouette » : le plus grand ecart, sur 21 colonnes, entre ce gabarit pose et le
// vrai haut du mur. `--images` ecrit l'assemblage, la verite en vert et le mur trouve en rouge.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chargerCorpus } from '../../../../tests/banc/facades/banc.ts';
import { coinsVrais, formePignon, photographier, type PriseCamera } from '../../../../tests/banc/facades/synthese.ts';
import { png } from '../../../../tests/banc/facades/png.ts';
import { appliquer, homographie, type Image, type P2 } from '../../../../src/facade/vision/homographie.ts';
import { inverser } from '../../../../src/facade/vision/redressementFuites.ts';
import { mosaiqueDesVues } from '../../../../src/facade/vision/mosaiqueFuites.ts';
import { appliquerSimilitude } from '../../../../src/facade/vision/ransac.ts';
import { murSurLAssemblage, vuesDeFace } from '../../../../src/facade/releve/coinsAuto.ts';
import { gabaritDuHaut } from '../../../../src/facade/gabaritMur.ts';

const args = process.argv.slice(2);
const iImages = args.indexOf('--images');
const dossier = iImages >= 0 ? args[iImages + 1] : null;
const mots = args.filter((a, i) => !a.startsWith('--') && (iImages < 0 || i !== iImages + 1));
if (dossier) mkdirSync(dossier, { recursive: true });

/** Trace un rectangle (bords d'un pixel) sur une copie de l'image. */
function tracer(img: Image, rects: { r: { x0: number; y0: number; x1: number; y1: number }; c: [number, number, number] }[]): Image {
  const d = new Uint8ClampedArray(img.donnees);
  const pose = (x: number, y: number, c: [number, number, number]) => {
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
      const X = Math.round(x) + a, Y = Math.round(y) + b;
      if (X < 0 || Y < 0 || X >= img.largeur || Y >= img.hauteur) continue;
      const k = (Y * img.largeur + X) * 4;
      d[k] = c[0]; d[k + 1] = c[1]; d[k + 2] = c[2]; d[k + 3] = 255;
    }
  };
  for (const { r, c } of rects) {
    for (let x = r.x0; x <= r.x1; x++) { pose(x, r.y0, c); pose(x, r.y1, c); }
    for (let y = r.y0; y <= r.y1; y++) { pose(r.x0, y, c); pose(r.x1, y, c); }
  }
  return { largeur: img.largeur, hauteur: img.hauteur, donnees: d };
}

/** Trace une ligne brisee sur une copie de l'image. */
function ligneBrisee(img: Image, pts: readonly P2[], c: [number, number, number]): Image {
  const d = new Uint8ClampedArray(img.donnees);
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i] as P2, b = pts[i + 1] as P2, n = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y));
    for (let t = 0; t <= n; t++) {
      const X = Math.round(a.x + ((b.x - a.x) * t) / Math.max(1, n)), Y = Math.round(a.y + ((b.y - a.y) * t) / Math.max(1, n));
      if (X < 0 || Y < 0 || X >= img.largeur || Y >= img.hauteur) continue;
      const k = (Y * img.largeur + X) * 4;
      d[k] = c[0]; d[k + 1] = c[1]; d[k + 2] = c[2]; d[k + 3] = 255;
    }
  }
  return { largeur: img.largeur, hauteur: img.hauteur, donnees: d };
}

const pct = (v: number) => (Math.round(v * 1000) / 10).toFixed(1).replace('.', ',');
const lignes: string[] = ['| Scène | Entrée | Égout | Sol | Gauche | Droite | Silhouette | Lu |', '|---|---|--:|--:|--:|--:|--:|---|'];
const ecarts: { egout: number[]; sol: number[]; bouts: number[]; silhouette: number[] } = { egout: [], sol: [], bouts: [], silhouette: [] };
for (const s of chargerCorpus()) {
  if (mots.length && !mots.some((m) => s.nom.includes(m))) continue;
  if (s.synthese.prise.type !== 'camera') continue;
  const prises = [s.synthese.prise, ...(s.synthese.vues ?? [])] as PriseCamera[];
  const photos = prises.map((p) => photographier(s, 100, p));
  const vrais = coinsVrais(s, prises[0] as PriseCamera);
  if (photos.some((p) => !p) || !vrais) continue;
  const images = photos.map((p) => (p as NonNullable<typeof p>).image);
  const { largeur: L, hauteur: H } = s.verite;
  const o = s.verite.ouvertures[0];
  const murVersPhoto = homographie([{ x: 0, y: H }, { x: L, y: H }, { x: L, y: 0 }, { x: 0, y: 0 }], vrais);
  const reperes = o && murVersPhoto ? [{ x: o.x, y: o.y + o.h }, { x: o.x + o.l, y: o.y + o.h }, { x: o.x + o.l, y: o.y }, { x: o.x, y: o.y }].map((q) => appliquer(murVersPhoto, q)) : null;
  for (const [entree, rep] of [['points de fuite', []], ['repères', [reperes]]] as const) {
    if (entree === 'repères' && !reperes) continue;
    const vues = vuesDeFace(images, rep as (P2[] | null)[]);
    const rangs = vues.map((v, i) => (v ? i : -1)).filter((i) => i >= 0);
    if (!rangs.includes(0)) { lignes.push(`| ${s.nom} | ${entree} | — | — | — | — | — | photo non redressée |`); continue; }
    const m = mosaiqueDesVues(rangs.map((i) => vues[i] as NonNullable<(typeof vues)[number]>));
    const place = m?.places[rangs.indexOf(0)];
    const versVue = vues[0] ? inverser((vues[0] as NonNullable<(typeof vues)[number]>).versPhoto) : null;
    if (!m || !place || !versVue || !murVersPhoto) { lignes.push(`| ${s.nom} | ${entree} | — | — | — | — | — | pas d'assemblage |`); continue; }
    const v = vrais.map((c) => appliquerSimilitude(place, appliquer(versVue, c)));
    const verite = { x0: ((v[0] as P2).x + (v[3] as P2).x) / 2, x1: ((v[1] as P2).x + (v[2] as P2).x) / 2, y0: ((v[0] as P2).y + (v[1] as P2).y) / 2, y1: ((v[2] as P2).y + (v[3] as P2).y) / 2 };
    const w = verite.x1 - verite.x0;
    // Le gabarit du mur, comme le donnerait le LiDAR : le haut vrai (l'egout, et le pignon au-dessus).
    const pg0 = s.synthese.mur.pignon ?? 0, sommet0 = s.synthese.mur.pignonSommet ?? 0.5;
    const gabarit = gabaritDuHaut(Array.from({ length: 41 }, (_, i) => i / 40).map((u) => ({ x: u, y: H + pg0 * formePignon(u, sommet0) })));
    const r = murSurLAssemblage(m, H / L, gabarit);
    const e = { egout: Math.abs(r.y0 - verite.y0) / w, sol: Math.abs(r.y1 - verite.y1) / w, g: Math.abs(r.x0 - verite.x0) / w, d: Math.abs(r.x1 - verite.x1) / w };
    ecarts.egout.push(e.egout); ecarts.sol.push(e.sol); ecarts.bouts.push(e.g, e.d);
    // La silhouette vraie : le haut du mur (l'egout, et le pignon au-dessus), porte du mur dans l'assemblage ; l'ecart est le plus
    // grand, sur 21 colonnes, entre elle et la ligne brisee lue, en part de la largeur du mur.
    const pg = s.synthese.mur.pignon ?? 0, sommet = s.synthese.mur.pignonSommet ?? 0.5;
    const vraie = Array.from({ length: 21 }, (_, i) => i / 20).map((u) => appliquerSimilitude(place, appliquer(versVue, appliquer(murVersPhoto, { x: u * L, y: H + pg * formePignon(u, sommet) }))));
    const lue = r.silhouette;
    const surLue = (x: number) => {
      if (!lue || lue.length < 2) return null;
      for (let i = 0; i + 1 < lue.length; i++) { const a = lue[i] as P2, b = lue[i + 1] as P2; if (x >= a.x - 1e-6 && x <= b.x + 1e-6) return a.y + ((b.y - a.y) * (x - a.x)) / Math.max(1e-9, b.x - a.x); }
      return null;
    };
    const ecartsSil = vraie.slice(1, -1).map((q) => { const y = surLue(q.x); return y === null ? null : Math.abs(y - q.y) / w; });
    const eSil = lue && ecartsSil.every((x) => x !== null) ? Math.max(...(ecartsSil as number[])) : null;
    if (eSil !== null) ecarts.silhouette.push(eSil);
    lignes.push(`| ${s.nom} | ${entree} | ${pct(e.egout)} % | ${pct(e.sol)} % | ${pct(e.g)} % | ${pct(e.d)} % | ${eSil === null ? '—' : pct(eSil) + ' %'} | ${[r.egout ? 'égout' : '', r.pied ? 'sol' : '', r.cotes ? 'bouts' : ''].filter(Boolean).join(', ') || 'supposé'} |`);
    if (dossier) {
      let img = tracer(m.image, [{ r: verite, c: [0, 200, 0] }, { r, c: [230, 0, 0] }]);
      img = ligneBrisee(img, vraie, [0, 200, 0]);
      if (lue) img = ligneBrisee(img, lue, [230, 0, 0]);
      writeFileSync(join(dossier, s.nom + (entree === 'repères' ? '-reperes' : '') + '.png'), png(img));
    }
  }
}
const justes = (l: number[]) => l.filter((x) => x <= 0.02).length + '/' + l.length;
const med = (l: number[]) => { const t = [...l].sort((a, b) => a - b); return t.length ? (t[Math.floor(t.length / 2)] as number) : 0; };
lignes.push(`| **Ensemble** | | ${justes(ecarts.egout)}, méd. ${pct(med(ecarts.egout))} % | ${justes(ecarts.sol)}, méd. ${pct(med(ecarts.sol))} % | ${justes(ecarts.bouts)}, méd. ${pct(med(ecarts.bouts))} % | | ${justes(ecarts.silhouette)}, méd. ${pct(med(ecarts.silhouette))} % | |`);
console.log(lignes.join('\n'));

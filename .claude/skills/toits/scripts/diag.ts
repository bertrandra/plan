// Le detail d'un batiment, etape par etape, pour comprendre un toit bizarre :
// rectangles du contour (ou contour a l'equerre et tranches en reprise), coupe de chaque rectangle
// aux marches, lecture des formes simples sur chaque morceau, puis les corps rendus.
//
//   npx tsx .claude/skills/toits/scripts/diag.ts <cle|numero BD TOPO> [--leger]
//
// Lit $TOITS_DOSSIER/q/<cle>.json (ecrit par banc.ts). --leger : sans la coupe par le modele (voisin).
import { readFileSync } from 'node:fs';
import { reconstruireCorps, contourEquerre, corpsDepuisFormes } from '../../../../src/facade/toitCorps.ts';
import { rectanglesDuContour, rectanglesEnTranches } from '../../../../src/model/volumesToit.ts';
import { decouperParHauteurs, toitMesureDepuisGrille } from '../../../../src/model/toitMesure.ts';
import type { PtBrut } from '../../../../src/model/types.ts';

const S = (process.env.TOITS_DOSSIER || '/tmp/toits').replace(/\/?$/, '/');
const arg = process.argv[2];
if (!arg) throw new Error('usage : diag.ts <cle|numero> [--leger]');
const cle = arg.startsWith('bati-') ? arg : 'bati-batiment-' + arg;
const d = JSON.parse(readFileSync(S + 'q/' + cle + '.json', 'utf8'));
const m = toitMesureDepuisGrille(d.grille, d.pts);
const pt = (r: readonly PtBrut[]) => JSON.stringify(r.map((p) => [+p.x.toFixed(2), +p.y.toFixed(2)]));
const dims = (r: readonly PtBrut[]) => `${Math.hypot(r[1]!.x - r[0]!.x, r[1]!.y - r[0]!.y).toFixed(1)} x ${Math.hypot(r[3]!.x - r[0]!.x, r[3]!.y - r[0]!.y).toFixed(1)}`;
const formes = (r: readonly PtBrut[]) => { const f = corpsDepuisFormes(d.grille, r); return f ? `faitage ${f.faitage} a ${f.posFaitage}, egouts ${f.egouts.join('/')}${f.croupes ? ', croupes' : ''}, ecart ${f.ecart}` : 'aucune forme'; };

console.log(cle, 'contour', d.pts.length, 'sommets', pt(d.pts));
if (!m) { console.log('pas de surface mesuree (trop peu de cellules baties)'); process.exit(0); }
console.log('surface mesuree : egout', m.egout, 'faite', m.faite);
const rects = rectanglesDuContour(d.pts);
if (rects) {
  console.log('-- rectangles du contour (ils peuvent se chevaucher : une aile qui penetre un corps)');
  for (const r of rects) {
    const parts = decouperParHauteurs(m, [r]);
    console.log(dims(r), pt(r), '\n   marches ->', parts.map(dims).join(' | '), '\n   formes sur le tout :', formes(r));
  }
} else {
  const eq = contourEquerre(d.pts);
  console.log('-- reprise : contour a l equerre', eq ? pt(eq) : '(aucun cote de biais)');
  const tr = rectanglesEnTranches(eq ?? d.pts);
  if (!tr) console.log('   pas de tranches : dernier recours sur la boite orientee');
  for (const r of tr ?? []) console.log('   tranche', dims(r), pt(r), '->', formes(r));
}
console.log('-- corps rendus');
const corps = reconstruireCorps(m, d.pts, { coupes: !process.argv.includes('--leger'), grille: d.grille }) ?? [];
for (const c of corps) console.log(dims(c.pts), pt(c.pts), 'faitage', c.faitage, 'a', c.posFaitage, 'egouts', c.egouts.join('/'), c.croupes ? 'croupes ' + c.croupes.join('/') : '', c.pignons.length ? c.pignons.length + ' pignon(s)' : '', 'ecart', c.ecart);

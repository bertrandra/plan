// Banc d'essai d'un village : relance la reconstruction des corps sur les grilles de village-<nom>.json
// avec le code courant, liste les batiments suspects et ecrit q/<cle>.json pour rendu.py.
//
//   npx tsx .claude/skills/toits/scripts/banc.ts <nom> [--tous]
//
// La ligne d'un batiment : distance au centre de la parcelle, cle, hauteur BD TOPO, sommets du
// contour, `reprise` (contour qui ne se decoupe pas en rectangles), `complet` (calcul entier : projet
// ou mitoyen) ou `leger` (sans coupe par le modele), les formes des corps, puis les soupcons.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { reconstruireCorps } from '../../../../src/facade/toitCorps.ts';
import { toitMesureDepuisGrille } from '../../../../src/model/toitMesure.ts';
import { corpsVraisemblables, mesureVraisemblable } from '../../../../src/app/toitsLidar.ts';
import { rectanglesDuContour } from '../../../../src/model/volumesToit.ts';

const S = (process.env.TOITS_DOSSIER || '/tmp/toits').replace(/\/?$/, '/');
const nom = process.argv[2];
if (!nom) throw new Error('usage : banc.ts <nom> [--tous]');
const tous = process.argv.includes('--tous');
const D = JSON.parse(readFileSync(S + 'village-' + nom + '.json', 'utf8'));
mkdirSync(S + 'q', { recursive: true });
const dims = (c: any) => { const [a, b, , d] = c.pts; return [Math.hypot(b.x - a.x, b.y - a.y), Math.hypot(d.x - a.x, d.y - a.y)]; };
let nCorps = 0, nSus = 0, nSans = 0, nReprise = 0;
const lignes: string[] = [];
const t0 = performance.now();
for (const b of D.batiments) {
  if (!b.grille) continue;
  const m = mesureVraisemblable(b, toitMesureDepuisGrille(b.grille, b.pts));
  // Comme l'application : calcul entier pour le projet et les mitoyens (ceux qui gardent leur mesure).
  const fort = b.principal || b.mesure;
  const corps = m ? corpsVraisemblables(b, reconstruireCorps(m, b.pts, { coupes: fort, grille: b.grille })) ?? [] : [];
  const reprise = !rectanglesDuContour(b.pts);
  if (reprise) nReprise++;
  const h = b.bdtopo?.hauteurRetenueM ?? b.bdtopo?.hauteurM ?? null;
  const pb: string[] = [];
  if (!corps.length) { pb.push(m ? 'sans corps' : 'sans mesure'); nSans++; }
  for (const c of corps) {
    const [L, W] = dims(c); const [e0, e1] = c.egouts; const F = c.faitage, p = c.posFaitage;
    const plat = F - Math.min(e0, e1) < 0.05, app = !plat && (p <= 0.01 || p >= W - 0.01);
    if (Math.min(L, W) < 3) pb.push(`etroit ${Math.min(L, W).toFixed(1)}`);
    if (app && c.pignons.length) pb.push('appentis+pignon');
    if (!plat && !app && Math.abs(e0 - e1) > 1.5) pb.push(`egouts ${e0}/${e1}`);
    if (Math.min(e0, e1) < 1.5) pb.push(`egout bas ${Math.min(e0, e1)}`);
    if (h && Math.min(e0, e1) > h + 2) pb.push(`egout ${Math.min(e0, e1)}>h${h}`);
    if (c.ecart > 0.5) pb.push(`ecart ${c.ecart}`);
  }
  if (corps.length >= 4) pb.push(`${corps.length} corps`);
  nCorps += corps.length;
  if (pb.length) nSus++;
  const formes = corps.map((c: any) => { const [, W] = dims(c); const plat = c.faitage - Math.min(...c.egouts) < 0.05; return plat ? 'plat' : c.croupes ? '4p' : (c.posFaitage <= 0.01 || c.posFaitage >= W - 0.01) ? '1p' : '2p'; });
  lignes.push(`${pb.length ? '!' : ' '} ${String(b.d).padStart(3)} ${b.key} h${h} ${b.pts.length}pts${reprise ? ' reprise' : ''} ${fort ? 'complet' : 'leger'} [${formes.join(' ')}] ${pb.join(', ')}`);
  writeFileSync(S + 'q/' + b.key + '.json', JSON.stringify({ key: b.key, pts: b.pts, grille: b.grille, corps, pb }));
}
console.log(nom, 'temps', (performance.now() - t0).toFixed(0), 'ms batiments', D.batiments.length, 'corps', nCorps, 'suspects', nSus, 'sans corps', nSans, 'contours en reprise', nReprise);
const choisies = tous ? lignes : lignes.filter((l) => l.startsWith('!')).sort((a, b) => b.length - a.length).slice(0, 40);
console.log(choisies.join('\n'));

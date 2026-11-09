// Verification de calcul.ts sur des photos synthetiques (le meme banc que
// tests/unit/facade/mosaique.test.ts) : mur de 8 x 4 m, pignon de 3 m.
//   node outils/facade/construire.mjs --verifier
import { homographie, appliquer } from '../../src/facade/homographie.js';
import { focalePx } from '../../src/facade/cadrage.js';
import { caler, preparerRendu, resolutionNative, type Morceau, type P2 } from './calcul.js';

const p = (x: number, y: number): P2 => ({ x, y });
const PX = 50;
function couleur(xm: number, ym: number): number[] {
  let c = [140, 185, 235];
  const pignon = 4 + 3 * (1 - Math.abs((2 * xm) / 8 - 1));
  if (xm >= 0 && xm <= 8 && (ym <= 4 || ym <= pignon)) c = [222, 205, 176];
  if ((xm >= 1 && xm < 2.2 && ym >= 0.9 && ym < 2.25) || (xm >= 5.6 && xm < 6.8 && ym >= 0.9 && ym < 2.25)) c = [55, 62, 70];
  if (xm >= 3.5 && xm < 4.4 && ym < 2.15 && ym >= 0) c = [120, 70, 40];
  if (ym < 0) c = [110, 160, 80];
  const g = ((Math.floor(xm * PX) * 7919 + Math.floor(ym * PX) * 104729) % 17) - 8;
  return c.map((v) => v + g);
}
function photo(cx: number, distance: number, lacet: number, W = 1200, Hp = 1600) {
  const f = focalePx(W, Hp, 67);
  const a = (lacet * Math.PI) / 180;
  const proj = (x: number, y: number) => {
    const X = x - cx, Y = y - 1.5, Z = distance;
    const xc = Math.cos(a) * X - Math.sin(a) * Z, zc = Math.sin(a) * X + Math.cos(a) * Z;
    return p(W / 2 + (f * xc) / zc, Hp / 2 - (f * Y) / zc);
  };
  const mur = [p(0, 8), p(8, 8), p(8, 0), p(0, 0)];
  const versMur = homographie(mur.map((q) => proj(q.x, q.y)), mur)!;
  const d = new Uint8ClampedArray(W * Hp * 4);
  for (let y = 0; y < Hp; y++)
    for (let x = 0; x < W; x++) {
      const m = appliquer(versMur, p(x + 0.5, y + 0.5));
      const c = couleur(m.x, m.y), o = (y * W + x) * 4;
      d[o] = c[0]!; d[o + 1] = c[1]!; d[o + 2] = c[2]!; d[o + 3] = 255;
    }
  return { image: { largeur: W, hauteur: Hp, donnees: d }, f, proj };
}

let echecs = 0;
const verifier = (nom: string, ok: boolean, detail: string) => {
  console.log((ok ? 'ok   ' : 'ECHEC') + ' ' + nom + ' : ' + detail);
  if (!ok) echecs++;
};

// Une photo, de biais.
{
  const ph = photo(4, 13, 12);
  const coins = [p(0, 4), p(8, 4), p(8, 0), p(0, 0)].map((q) => ph.proj(q.x, q.y));
  const m: Morceau = { apercu: ph.image, coins, focale: ph.f };
  const cal = caler({ morceaux: [m], largeur: 8, hauteurConnue: null })!;
  verifier('une photo, hauteur', Math.abs(cal.hauteur - 4) < 0.03, cal.hauteur.toFixed(3) + ' m pour 4');
  const px = resolutionNative(cal, [coins]);
  const marges = { haut: 3.5, cotes: 0.5, bas: 0.2 };
  const r = preparerRendu(8, cal, marges, px, [coins], [{ image: ph.image, ox: 0, oy: 0, k: 1 }]);
  r.lignes(0, r.hauteur);
  // La fenetre gauche : (1..2,2) x (0,9..2,25) ; on lit sa couleur au centre et l'enduit a cote.
  const lire = (xm: number, ym: number) => {
    const X = Math.floor((xm + marges.cotes) * px), Y = Math.floor((marges.haut + cal.hauteur - ym) * px);
    const o = (Y * r.largeur + X) * 4;
    return [r.sortie[o]!, r.sortie[o + 1]!, r.sortie[o + 2]!];
  };
  const fen = lire(1.6, 1.6), enduit = lire(3, 3), faite = lire(4, 6.8);
  verifier('une photo, rendu', fen[0]! < 80 && enduit[0]! > 200 && faite[0]! > 200, `${px.toFixed(0)} px/m, ${r.largeur}x${r.hauteur}, fenetre ${fen}, enduit ${enduit}, faite ${faite}`);
}

// Trois photos, a 5 m, de gauche a droite, legerement de biais.
{
  const prises = [photo(1.5, 5, -3), photo(4, 5, 2), photo(6.5, 5, 4)];
  const morceaux: Morceau[] = [
    { apercu: prises[0]!.image, focale: prises[0]!.f, coins: [p(0, 4), p(3, 4), p(3, 0), p(0, 0)].map((q) => prises[0]!.proj(q.x, q.y)) },
    { apercu: prises[1]!.image, focale: prises[1]!.f, coins: [p(2.4, 4), p(5.6, 4), p(5.6, 0), p(2.4, 0)].map((q) => prises[1]!.proj(q.x, q.y)) },
    { apercu: prises[2]!.image, focale: prises[2]!.f, coins: [p(5, 4), p(8, 4), p(8, 0), p(5, 0)].map((q) => prises[2]!.proj(q.x, q.y)) },
  ];
  const cal = caler({ morceaux, largeur: 8, hauteurConnue: null })!;
  verifier('trois photos, hauteur', Math.abs(cal.hauteur - 4) < 0.06, cal.hauteur.toFixed(3) + ' m pour 4');
  verifier('trois photos, places', Math.abs(cal.positions[1]! * cal.etirement - 2.4) < 0.05 && Math.abs(cal.positions[2]! * cal.etirement - 5) < 0.05, cal.positions.map((x) => (x * cal.etirement).toFixed(3)).join(' / ') + ' pour 0 / 2.4 / 5 ; jointures ' + cal.jointures.map((j) => j.toFixed(2)).join(' '));
  const px = 60;
  const marges = { haut: 1, cotes: 0, bas: 0 };
  const r = preparerRendu(8, cal, marges, px, morceaux.map((m) => m.coins), morceaux.map((m) => ({ image: m.apercu, ox: 0, oy: 0, k: 1 })));
  r.lignes(0, r.hauteur);
  let ecart = 0, n = 0;
  for (let Y = 2; Y < r.hauteur - 2; Y += 3)
    for (let X = 2; X < r.largeur - 2; X += 3) {
      const xm = (X + 0.5) / px, ym = marges.haut + cal.hauteur - (Y + 0.5) / px;
      const att = couleur(xm, ym), o = (Y * r.largeur + X) * 4;
      ecart += Math.abs(r.sortie[o]! - att[0]!); n++;
    }
  verifier('trois photos, rendu', ecart / n < 12, 'ecart moyen ' + (ecart / n).toFixed(1) + ' niveaux');
}
if (echecs) process.exit(1);

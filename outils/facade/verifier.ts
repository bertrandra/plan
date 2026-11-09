// Verification de auto.ts sur des photos synthetiques : un mur de 8 m (4 m a l'egout, pignon de
// 3 m) avec ses baies et quelques taches, photographie de biais et en contre-plongee.
//   node outils/facade/construire.mjs --verifier
import { redresserPhoto, segmentsPhoto, estimerChamp, estimerDistorsion, redresserDepuisCoins, champDepuisCoins, sansDistorsion, tracerCoutures, versRedresse, versGris, vueRedressee, signature, placer, appliquerSim, cadreFusion, preparerRendu, type Image, type P2 } from './auto.js';

const p = (x: number, y: number): P2 => ({ x, y });

/** Taches deterministes sur l'enduit : de quoi accrocher des points homologues. */
const taches: [number, number, number, number, number][] = [];
{
  let s = 4242;
  const r = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
  for (let k = 0; k < 90; k++) taches.push([r() * 7.6, r() * 3.6, 0.05 + r() * 0.25, 0.05 + r() * 0.2, 60 + r() * 120]);
}

export function couleur(X: number, Y: number): number[] {
  const pignon = 4 + 3 * (1 - Math.abs((2 * X) / 8 - 1));
  if (X < 0 || X > 8 || Y > pignon) return [140, 185, 235];
  let c = [222, 205, 176];
  if (Y > 4) c = [200, 185, 160];
  if (Y > 2.55 && Y < 2.7) c = [240, 235, 225];
  for (const [x, y, l, h, g] of taches) if (X >= x && X < x + l && Y >= y && Y < y + h) c = [g, g * 0.9, g * 0.8];
  if ((X >= 1 && X < 2.2 && Y >= 0.9 && Y < 2.25) || (X >= 5.6 && X < 6.8 && Y >= 0.9 && Y < 2.25)) c = [55, 62, 70];
  if (X >= 1 && X < 2.2 && Y >= 3 && Y < 3.6) c = [60, 66, 74];
  if (X >= 5.6 && X < 6.8 && Y >= 3 && Y < 3.6) c = [60, 66, 74];
  if (X >= 3.5 && X < 4.4 && Y < 2.15) c = [120, 70, 40];
  return c;
}

/** Appareil devant le mur (plan Z = 0, X a droite, Y en haut), lacet et tangage en degres. */
export function appareil(cx: number, distance: number, lacet: number, tangage: number, W: number, H: number, champ = 67, lambda = 0) {
  const f = Math.max(W, H) / 2 / Math.tan((champ * Math.PI) / 360);
  const a = (lacet * Math.PI) / 180,
    b = (tangage * Math.PI) / 180;
  const C = [cx, 1.5, -distance];
  const av0 = [Math.sin(a), 0, Math.cos(a)],
    dr = [Math.cos(a), 0, -Math.sin(a)];
  const av = av0.map((v, i) => Math.cos(b) * v + Math.sin(b) * [0, 1, 0][i]!);
  const ht = av0.map((v, i) => -Math.sin(b) * v + Math.cos(b) * [0, 1, 0][i]!);
  const projeter = (X: number, Y: number): P2 => {
    const D = [X - C[0]!, Y - C[1]!, -C[2]!];
    const d = (u: number[]) => D[0]! * u[0]! + D[1]! * u[1]! + D[2]! * u[2]!;
    return p(W / 2 + (f * d(dr)) / d(av), H / 2 - (f * d(ht)) / d(av));
  };
  const rayon = (u: number, v: number) => [0, 1, 2].map((i) => dr[i]! * ((u - W / 2) / f) - ht[i]! * ((v - H / 2) / f) + av[i]!);
  function photographier(): Image {
    const d = new Uint8ClampedArray(W * H * 4);
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const s = [0, 0, 0];
        for (const [ox, oy] of [
          [0.25, 0.25],
          [0.75, 0.25],
          [0.25, 0.75],
          [0.75, 0.75],
        ]) {
          const u = sansDistorsion(lambda, W, H, { x: x + ox!, y: y + oy! });
          const r = rayon(u.x, u.y);
          let c = [140, 185, 235];
          const tm = r[2]! > 0 ? distance / r[2]! : Infinity;
          const ts = r[1]! < 0 ? -1.5 / r[1]! : Infinity;
          if (ts < tm) c = [100, 150, 75];
          else if (tm < Infinity) c = couleur(C[0]! + tm * r[0]!, 1.5 + tm * r[1]!);
          for (let k = 0; k < 3; k++) s[k] = s[k]! + c[k]! / 4;
        }
        const o = (y * W + x) * 4;
        d[o] = s[0]!;
        d[o + 1] = s[1]!;
        d[o + 2] = s[2]!;
        d[o + 3] = 255;
      }
    return { largeur: W, hauteur: H, donnees: d };
  }
  return { f, projeter, photographier };
}

/** Le point d'image d'un point du mur, avec la distorsion de l'objectif (inverse numerique). */
function projeterDeforme(cam: ReturnType<typeof appareil>, lambda: number, W: number, H: number, X: number, Y: number): P2 {
  const u = cam.projeter(X, Y);
  let d = { ...u };
  for (let i = 0; i < 30; i++) {
    const e = sansDistorsion(lambda, W, H, d);
    d = { x: d.x + (u.x - e.x), y: d.y + (u.y - e.y) };
  }
  return d;
}

/** Un apercu reduit, comme la page le fabrique (moyenne par blocs). */
export function reduire(img: Image, k: number): Image {
  const L = Math.round(img.largeur * k),
    H = Math.round(img.hauteur * k);
  const d = new Uint8ClampedArray(L * H * 4);
  const b = 1 / k;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < L; x++) {
      const s = [0, 0, 0];
      let n = 0;
      for (let j = Math.floor(y * b); j < Math.min(img.hauteur, Math.floor((y + 1) * b)); j++)
        for (let i = Math.floor(x * b); i < Math.min(img.largeur, Math.floor((x + 1) * b)); i++) {
          const o = (j * img.largeur + i) * 4;
          s[0]! += img.donnees[o]!;
          s[1]! += img.donnees[o + 1]!;
          s[2]! += img.donnees[o + 2]!;
          n++;
        }
      const o = (y * L + x) * 4;
      d[o] = s[0]! / n;
      d[o + 1] = s[1]! / n;
      d[o + 2] = s[2]! / n;
      d[o + 3] = 255;
    }
  return { largeur: L, hauteur: H, donnees: d };
}

let echecs = 0;
const verifier = (nom: string, ok: boolean, detail: string) => {
  console.log((ok ? 'ok   ' : 'ECHEC') + ' ' + nom + ' : ' + detail);
  if (!ok) echecs++;
};

/** Points du mur : coins des baies. Le redressement est bon s'ils s'en deduisent par x = sX, y = -sY. */
const reperes = [p(1, 0.9), p(2.2, 0.9), p(1, 2.25), p(2.2, 2.25), p(5.6, 0.9), p(6.8, 2.25), p(3.5, 0), p(4.4, 2.15), p(1, 3.6), p(6.8, 3)];
function ecartForme(points: P2[], mur: P2[]): number {
  // Moindres carres de x = s X + tx, y = -s Y + ty ; ecart rapporte a l'etendue.
  const n = points.length;
  const mX = mur.reduce((a, q) => a + q.x, 0) / n,
    mY = mur.reduce((a, q) => a + q.y, 0) / n;
  const mx = points.reduce((a, q) => a + q.x, 0) / n,
    my = points.reduce((a, q) => a + q.y, 0) / n;
  let num = 0,
    den = 0;
  for (let i = 0; i < n; i++) {
    num += (points[i]!.x - mx) * (mur[i]!.x - mX) - (points[i]!.y - my) * (mur[i]!.y - mY);
    den += (mur[i]!.x - mX) ** 2 + (mur[i]!.y - mY) ** 2;
  }
  const s = num / den;
  let e = 0;
  for (let i = 0; i < n; i++) e = Math.max(e, Math.hypot(points[i]!.x - (mx + s * (mur[i]!.x - mX)), points[i]!.y - (my - s * (mur[i]!.y - mY))) / (s * 8));
  return e;
}

const W = 1800,
  H = 2400,
  K = 1200 / 2400;
const prises = [
  { nom: 'une photo, de biais (20°) et en contre-plongée (10°)', cx: 4, d: 12, lacet: 20, tangage: 10 },
  { nom: 'une photo, de face, téléphone d’aplomb', cx: 4, d: 13, lacet: 0, tangage: 0 },
];
for (const pr of prises) {
  const cam = appareil(pr.cx, pr.d, pr.lacet, pr.tangage, W, H);
  const photo = cam.photographier();
  const red = redresserPhoto(segmentsPhoto(versGris(reduire(photo, K)), K), K, W, H, 67);
  const champ = estimerChamp(segmentsPhoto(versGris(reduire(photo, K)), K), K, W, H);
  if (pr.lacet) verifier('  champ estimé sans EXIF', champ !== null && Math.abs(champ - 67) < 3, champ ? champ.toFixed(1) + '° pour 67°' : 'aucun');
  const pts = reperes.map((q) => versRedresse(red, cam.projeter(q.x, q.y))!);
  const e = ecartForme(pts, reperes);
  verifier(pr.nom, e < 0.004, `écart de forme ${(e * 100).toFixed(2)} % de la largeur ; ${red.verticales.length} verticales, ${red.horizontales.length} horizontales ${red.avis.join(' ; ')}`);
}

// Trois photos de pres, de gauche a droite, a des distances et des angles differents.
{
  const cams = [appareil(1.6, 5, -8, 12, W, H), appareil(4, 6, 5, 15, W, H), appareil(6.4, 4.5, 12, 10, W, H)];
  const photos = cams.map((c) => c.photographier());
  const gris = photos.map((ph) => versGris(reduire(ph, K)));
  const reds = gris.map((g) => redresserPhoto(segmentsPhoto(g, K), K, W, H, 67));
  const c = Math.min(...reds.map((r) => 900 / Math.max(r.boite.x1 - r.boite.x0, r.boite.y1 - r.boite.y0) / r.cam.f)) ;
  const vues = reds.map((r, i) => vueRedressee(r, gris[i]!, K, r.cam.f * c));
  const sigs = vues.map((v) => signature(v));
  const pl = placer(vues, sigs);
  verifier('trois photos, toutes raccordées', pl.T.every(Boolean), pl.liaisons.map((l) => `${l.i}←${l.j} (${l.accords} points)`).join(', '));
  // Coherence : un meme point du mur, vu sur deux photos, tombe au meme endroit de la reference.
  let pire = 0;
  for (const q of reperes) {
    const vus = cams
      .map((cm, i) => {
        const im = cm.projeter(q.x, q.y);
        if (im.x < 0 || im.y < 0 || im.x > W || im.y > H || !pl.T[i]) return null;
        const r = versRedresse(reds[i]!, im);
        return r ? appliquerSim(pl.T[i]!, r) : null;
      })
      .filter((x): x is P2 => !!x);
    for (const a of vus) for (const b of vus) pire = Math.max(pire, Math.hypot(a.x - b.x, a.y - b.y));
  }
  const ref = reperes.map((q) => versRedresse(reds[0]!, cams[0]!.projeter(q.x, q.y))!);
  const unite = Math.hypot(ref[1]!.x - ref[0]!.x, ref[1]!.y - ref[0]!.y) / 1.2; // unites du plan par metre
  verifier('trois photos, cohérence', pire / unite < 0.03, `pire écart ${((pire / unite) * 100).toFixed(1)} cm`);
  const cadre = cadreFusion(reds, pl.T);
  const px = Math.min(cadre.native, Math.sqrt(4e6 / ((cadre.x1 - cadre.x0) * (cadre.y1 - cadre.y0))));
  const coutures = tracerCoutures(vues, pl.T, pl.gains, cadre);
  const rendu = preparerRendu(reds, pl.T, pl.gains, photos.map((im) => ({ image: im, ox: 0, oy: 0, k: 1 })), cadre, px, coutures);
  rendu.lignes(0, rendu.hauteur);
  // Le rendu, compare au mur : on cale l'echelle sur deux reperes et on lit l'ecart moyen.
  const s = px * unite,
    ox = (ref[0]!.x - cadre.x0) * px - 1 * s,
    oy = (ref[0]!.y - cadre.y0) * px + 0.9 * s;
  let ecart = 0,
    n = 0;
  for (let Y = 0; Y < rendu.hauteur; Y += 4)
    for (let X = 0; X < rendu.largeur; X += 4) {
      const o = (Y * rendu.largeur + X) * 4;
      if (!rendu.sortie[o + 3]) continue;
      const Xm = (X + 0.5 - ox) / s,
        Ym = -(Y + 0.5 - oy) / s;
      if (Xm < 0.2 || Xm > 7.8 || Ym < 0.2 || Ym > 3.8) continue;
      ecart += Math.abs(rendu.sortie[o]! - couleur(Xm, Ym)[0]!);
      n++;
    }
  verifier('trois photos, rendu (avec coutures)', n > 1000 && ecart / n < 20, `${rendu.largeur} × ${rendu.hauteur} px, écart moyen ${(ecart / n).toFixed(1)} niveaux sur ${n} points`);
}

// Coins poses a la main : le redressement ne depend plus des lignes trouvees.
{
  const cam = appareil(4, 9, 25, 12, W, H);
  const coins = [p(1, 2.25), p(6.8, 2.25), p(6.8, 0.9), p(1, 0.9)].map((q) => cam.projeter(q.x, q.y));
  const red = redresserDepuisCoins(coins, W, H, 67)!;
  const e = ecartForme(reperes.map((q) => versRedresse(red, cam.projeter(q.x, q.y))!), reperes);
  verifier('coins posés à la main', e < 0.004, `écart de forme ${(e * 100).toFixed(2)} %`);
  const champ = champDepuisCoins(coins, W, H);
  verifier('  champ mesuré sur les coins', champ !== null && Math.abs(champ - 67) < 2, champ ? champ.toFixed(1) + '° pour 67°' : 'aucun');
}

// Grand-angle non corrige (Android) : la distorsion est estimee, puis le redressement est juste.
{
  const lambda = -0.18,
    champ = 100;
  const cam = appareil(4, 6, 15, 8, W, H, champ, lambda);
  const photo = cam.photographier();
  const segs = segmentsPhoto(versGris(reduire(photo, K)), K);
  const est = estimerDistorsion(segs, K, W, H, champ);
  verifier('grand-angle, distorsion estimée', Math.abs(est - lambda) < 0.06, `${est} pour ${lambda}`);
  const sans = redresserPhoto(segs, K, W, H, champ);
  const avec = redresserPhoto(segs, K, W, H, champ, { lambda: est });
  const forme = (r: typeof avec) => ecartForme(reperes.map((q) => versRedresse(r, projeterDeforme(cam, lambda, W, H, q.x, q.y))!), reperes);
  verifier('grand-angle, redressement corrigé', forme(avec) < forme(sans) && forme(avec) < 0.01, `écart ${(forme(avec) * 100).toFixed(2)} % (sans correction ${(forme(sans) * 100).toFixed(2)} %)`);
}

// Deux photos l'une au-dessus de l'autre (mur trop haut pour le recul) : assemblees en hauteur.
{
  const cams = [appareil(4, 4.5, 0, 0, W, H), appareil(4, 4.5, 0, 32, W, H)];
  const photos = cams.map((c) => c.photographier());
  const gris = photos.map((ph) => versGris(reduire(ph, K)));
  const reds = gris.map((g) => redresserPhoto(segmentsPhoto(g, K), K, W, H, 67));
  const c = Math.min(...reds.map((r) => 900 / Math.max(r.boite.x1 - r.boite.x0, r.boite.y1 - r.boite.y0) / r.cam.f));
  const vues = reds.map((r, i) => vueRedressee(r, gris[i]!, K, r.cam.f * c));
  const pl = placer(vues, vues.map((x) => signature(x)));
  let pire = 0;
  for (const q of reperes) {
    const vus = cams
      .map((cm, i) => {
        const im = cm.projeter(q.x, q.y);
        if (im.x < 0 || im.y < 0 || im.x > W || im.y > H || !pl.T[i]) return null;
        const r = versRedresse(reds[i]!, im);
        return r ? appliquerSim(pl.T[i]!, r) : null;
      })
      .filter((x): x is P2 => !!x);
    for (const a of vus) for (const b of vus) pire = Math.max(pire, Math.hypot(a.x - b.x, a.y - b.y));
  }
  const ref = reperes.map((q) => versRedresse(reds[0]!, cams[0]!.projeter(q.x, q.y))!);
  const unite = Math.hypot(ref[1]!.x - ref[0]!.x, ref[1]!.y - ref[0]!.y) / 1.2;
  verifier('deux photos en hauteur', pl.T.every(Boolean) && pire / unite < 0.03, `${pl.liaisons.map((l) => `${l.i}←${l.j} (${l.accords} points)`).join(', ') || 'non raccordées'} ; pire écart ${((pire / unite) * 100).toFixed(1)} cm`);
}

if (echecs) process.exitCode = 1;

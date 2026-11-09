// Les baies (fenetres, portes) sur la facade redressee de facade.html.
//
// Le detecteur du releve de Plan (src/facade/detection.ts) suppose ce que Plan lui donne : le mur
// seul, du pied a l'egout, uni. Le resultat de facade.html montre davantage - ciel, toit, vegetation,
// colombages, un porche a l'ombre - et le met en defaut. Celui-ci part de deux constats :
//
//   - le redressement garantit qu'une vitre (ou un vantail) est un rectangle aligne sur les axes ;
//   - un enduit, une pierre, un feuillage sont rugueux, a l'ombre comme au soleil (ecart type
//     rapporte a la luminosite) ; une vitre, meme claire, un vantail peint sont lisses.
//
// D'ou :
//   1. les pixels lisses, ou sombres et gris (une vitre qui reflete un arbre) ;
//   2. leurs regions de teinte homogene (une porte brune ne se mele pas a la pelouse) ;
//   3. celles qui sont des carreaux : des rectangles pleins, plus sombres que la menuiserie ou le mur
//      qui les entourent - un montant blanc, une poutre trop fine, un toit trop grand n'en sont pas ;
//   4. les carreaux voisins (petits bois, meneaux, traverse d'imposte) regroupes en une baie : deux
//      gris, meme l'un sombre et l'autre clair, ou deux teintes proches ; jamais un gris avec une
//      teinte (une poutre verte a l'ombre ressemble a un verre sombre par la valeur seulement) ;
//   5. une baie est faite de ses carreaux pour un tiers au moins, et entouree de mur ou de
//      menuiserie claire - pas de feuillage, de pelouse ni de ciel (une poubelle, un pot, un coin de
//      ciel dans un arbre sont ecartes) ;
//   6. chaque bord recale au pixel sur l'image pleine resolution, la ou le contraste est le plus fort.
//
// Les cotes sont celles du vitrage (ou du vantail), menuiserie non comprise. Le type suit la regle
// de Plan (`classer`), une fois le sol situe : le bas de la plus basse des portes.
//
// C'est une proposition : la page permet d'ajouter, recadrer, retirer une baie et d'en changer le type.

import type { Image } from './auto.js';
import { classer, type TypeOuverture } from '../../src/facade/detection.js';

export interface Baie {
  type: TypeOuverture;
  /** En metres : depuis le bord gauche de l'image, et au-dessus du sol (ou du bas de l'image). */
  x: number;
  y: number;
  l: number;
  h: number;
  /** Nombre de carreaux regroupes. */
  carreaux: number;
  /** En pixels de l'image, pour la dessiner. */
  px: { x: number; y: number; l: number; h: number };
}

export interface ResultatBaies {
  baies: Baie[];
  /** Le sol a-t-il ete situe (une porte trouvee) ? Sinon, les hauteurs partent du bas de l'image. */
  solTrouve: boolean;
  /** Le sol, en pixels de l'image (y), s'il a ete situe. */
  solPx: number | null;
  /** L'echelle etait-elle connue ? Sinon, les tailles admises sont estimees (12 m dans la largeur). */
  echelleConnue: boolean;
}

interface Tache {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  n: number;
  r: number;
  g: number;
  b: number;
}

/** Centile `q` d'un petit tableau (trie sur place). */
function centile(t: number[], q: number): number {
  t.sort((a, b) => a - b);
  return t[Math.min(t.length - 1, Math.max(0, Math.floor(q * (t.length - 1))))]!;
}

/** Dilatation (max) separable d'une grille, rayon `r` cases. */
function dilater(v: Float32Array, l: number, h: number, r: number): Float32Array {
  const t = new Float32Array(l * h),
    o = new Float32Array(l * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < l; x++) {
      let m = 0;
      for (let i = Math.max(0, x - r); i <= Math.min(l - 1, x + r); i++) m = Math.max(m, v[y * l + i]!);
      t[y * l + x] = m;
    }
  for (let y = 0; y < h; y++)
    for (let x = 0; x < l; x++) {
      let m = 0;
      for (let j = Math.max(0, y - r); j <= Math.min(h - 1, y + r); j++) m = Math.max(m, t[j * l + x]!);
      o[y * l + x] = m;
    }
  return o;
}

/** Erosion ou dilatation 3 x 3 d'un masque. */
function morpho(m: Uint8Array, l: number, h: number, dilate: boolean): Uint8Array {
  const o = new Uint8Array(l * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < l; x++) {
      let v = dilate ? 0 : 1;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx,
            yy = y + dy;
          const p = xx < 0 || yy < 0 || xx >= l || yy >= h ? 0 : m[yy * l + xx]!;
          if (dilate ? p : !p) v = dilate ? 1 : 0;
        }
      o[y * l + x] = v;
    }
  return o;
}

export function detecterBaies(img: Image, vu: Uint8Array | null, pxParM: number | null): ResultatBaies {
  const W = img.largeur,
    H = img.hauteur,
    d = img.donnees;
  const s0 = pxParM && pxParM > 0 ? pxParM : W / 12;
  // Image de travail a 2 cm (50 px/m) au plus fin.
  const wr = Math.min(50, s0);
  const k = wr / s0;
  const l = Math.max(1, Math.round(W * k)),
    h = Math.max(1, Math.round(H * k));
  const L = new Float32Array(l * h),
    R = new Float32Array(l * h),
    G = new Float32Array(l * h),
    B = new Float32Array(l * h),
    n = new Float32Array(l * h),
    SL = new Float32Array(l * h),
    SL2 = new Float32Array(l * h);
  for (let y = 0; y < H; y++) {
    const yy = Math.min(h - 1, Math.floor(y * k));
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (vu && !vu[i]) continue;
      const j = yy * l + Math.min(l - 1, Math.floor(x * k));
      R[j] = R[j]! + d[i * 4]!;
      G[j] = G[j]! + d[i * 4 + 1]!;
      B[j] = B[j]! + d[i * 4 + 2]!;
      const lu = 0.299 * d[i * 4]! + 0.587 * d[i * 4 + 1]! + 0.114 * d[i * 4 + 2]!;
      SL[j] = SL[j]! + lu;
      SL2[j] = SL2[j]! + lu * lu;
      n[j] = n[j]! + 1;
    }
  }
  const V = new Uint8Array(l * h);
  for (let j = 0; j < l * h; j++) {
    if (!n[j]) continue;
    R[j] = R[j]! / n[j]!;
    G[j] = G[j]! / n[j]!;
    B[j] = B[j]! / n[j]!;
    L[j] = 0.299 * R[j]! + 0.587 * G[j]! + 0.114 * B[j]!;
    V[j] = 1;
  }
  // La texture : ecart type de la luminance dans chaque case (2 cm), pixels d'origine compris. Un
  // enduit (crepi, pierre) est rugueux ; une vitre, un vantail peint sont lisses. Une case sans
  // detail (image peu definie) est lisse : la teinte departage alors.
  const T = new Float32Array(l * h);
  for (let j = 0; j < l * h; j++) T[j] = n[j]! > 1 ? Math.sqrt(Math.max(0, SL2[j]! / n[j]! - (SL[j]! / n[j]!) ** 2)) : 0;

  // 1. L'enveloppe claire : centile 85 par cases de 20 cm, etendu a un metre, adouci.
  const c = Math.max(2, Math.round(0.2 * wr));
  const cl = Math.ceil(l / c),
    ch = Math.ceil(h / c);
  let env: Float32Array = new Float32Array(cl * ch);
  for (let cy = 0; cy < ch; cy++)
    for (let cx = 0; cx < cl; cx++) {
      const t: number[] = [];
      for (let y = cy * c; y < Math.min(h, (cy + 1) * c); y++) for (let x = cx * c; x < Math.min(l, (cx + 1) * c); x++) if (V[y * l + x]) t.push(L[y * l + x]!);
      env[cy * cl + cx] = t.length >= (c * c) / 3 ? centile(t, 0.85) : 0;
    }
  env = dilater(env, cl, ch, 5);
  const envAt = (x: number, y: number) => {
    const gx = Math.max(0, Math.min(cl - 1.001, (x + 0.5) / c - 0.5)),
      gy = Math.max(0, Math.min(ch - 1.001, (y + 0.5) / c - 0.5));
    const x0 = Math.floor(gx),
      y0 = Math.floor(gy),
      fx = gx - x0,
      fy = gy - y0;
    const x1 = Math.min(cl - 1, x0 + 1),
      y1 = Math.min(ch - 1, y0 + 1);
    return (env[y0 * cl + x0]! * (1 - fx) + env[y0 * cl + x1]! * fx) * (1 - fy) + (env[y1 * cl + x0]! * (1 - fx) + env[y1 * cl + x1]! * fx) * fy;
  };

  // 2. Ce qui n'est pas de l'enduit : les pixels lisses (vitre, meme claire ; vantail peint ;
  // poutre ; ciel), ou sombres et gris (une vitre qui reflete un arbre). L'enduit, la pierre, le
  // feuillage sont rugueux : ils separent les regions. Ce qui est lisse partout (un mur peint) est
  // decoupe ensuite par la teinte.
  let sombre: Uint8Array = new Uint8Array(l * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < l; x++) {
      const j = y * l + x;
      if (!V[j]) continue;
      // Rugosite relative (ecart type sur luminance) : l'enduit reste rugueux a l'ombre comme au
      // soleil (0,07 a 0,1), une vitre ou une peinture lisse (moins de 0,02).
      const lisse = T[j]! < 0.035 * Math.max(20, L[j]!);
      // Sombre et gris : un verre qui reflete un arbre (le feuillage, lui, est vert).
      const mx = Math.max(R[j]!, G[j]!, B[j]!);
      const gris = (mx - Math.min(R[j]!, G[j]!, B[j]!)) / Math.max(1, mx) < 0.2;
      if (lisse || (gris && L[j]! < 0.6 * envAt(x, y))) sombre[j] = 1;
    }
  // Ouverture : efface les grains (enduit, feuillage fin).
  sombre = morpho(morpho(sombre, l, h, false), l, h, true);

  // 3. Les taches, et celles qui sont des carreaux : des rectangles pleins, ni trop fins ni trop grands.
  const vue = new Uint8Array(l * h);
  const pile: number[] = [];
  const carreaux: Tache[] = [];
  const m = (v: number) => v / wr;
  for (let s = 0; s < l * h; s++) {
    if (!sombre[s] || vue[s]) continue;
    const t: Tache = { x0: l, y0: h, x1: -1, y1: -1, n: 0, r: 0, g: 0, b: 0 };
    vue[s] = 1;
    pile.push(s);
    while (pile.length) {
      const p = pile.pop()!;
      const x = p % l,
        y = (p - x) / l;
      t.n++;
      t.r += R[p]!;
      t.g += G[p]!;
      t.b += B[p]!;
      if (x < t.x0) t.x0 = x;
      if (x > t.x1) t.x1 = x;
      if (y < t.y0) t.y0 = y;
      if (y > t.y1) t.y1 = y;
      for (const q of [x > 0 ? p - 1 : -1, x < l - 1 ? p + 1 : -1, y > 0 ? p - l : -1, y < h - 1 ? p + l : -1])
        // Une tache ne passe pas d'une teinte a une autre, ni d'un coup ni par degrade : une porte
        // brune ne se mele pas a la pelouse qui la touche, ni une porte blanche au dallage.
        if (q >= 0 && sombre[q] && !vue[q] && Math.hypot(R[q]! - R[p]!, G[q]! - G[p]!, B[q]! - B[p]!) < 25 && Math.hypot(R[q]! - t.r / t.n, G[q]! - t.g / t.n, B[q]! - t.b / t.n) < 60) {
          vue[q] = 1;
          pile.push(q);
        }
    }
    const lw = t.x1 - t.x0 + 1,
      lh = t.y1 - t.y0 + 1;
    if (m(lw) < 0.06 || m(lh) < 0.06 || m(lw) > 3.6 || m(lh) > 3.2) continue;
    if (t.n / (lw * lh) < 0.65) continue;
    if (Math.max(lw / lh, lh / lw) > 8) continue;
    t.r /= t.n;
    t.g /= t.n;
    t.b /= t.n;
    // Un carreau est plus sombre que la menuiserie ou le mur qui l'entoure : un montant blanc,
    // lisse lui aussi, n'en est pas un.
    if (0.299 * t.r + 0.587 * t.g + 0.114 * t.b > 0.88 * envAt((t.x0 + t.x1) / 2, (t.y0 + t.y1) / 2)) continue;
    carreaux.push(t);
  }

  // 4. Les carreaux d'une meme baie : proches (petits bois, meneaux, traverses : 25 cm au plus),
  // en face l'un de l'autre, et de teinte compatible - meme teinte, ou deux gris (un verre sombre,
  // un verre qui reflete le ciel) ; une poutre peinte n'est pas grise.
  const parent = carreaux.map((_, i) => i);
  const racine = (i: number): number => (parent[i] === i ? i : (parent[i] = racine(parent[i]!)));
  const ecartMax = 0.25 * wr;
  // Gris : la teinte rapportee a la luminosite (une poutre verte a l'ombre reste verte).
  const neutre = (t: Tache) => (Math.max(t.r, t.g, t.b) - Math.min(t.r, t.g, t.b)) / Math.max(1, Math.max(t.r, t.g, t.b)) < 0.15;
  for (let i = 0; i < carreaux.length; i++)
    for (let j = i + 1; j < carreaux.length; j++) {
      const a = carreaux[i]!,
        b = carreaux[j]!;
      const ovX = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0) + 1,
        ovY = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0) + 1;
      const gapX = Math.max(b.x0 - a.x1, a.x0 - b.x1) - 1,
        gapY = Math.max(b.y0 - a.y1, a.y0 - b.y1) - 1;
      const cote = gapX <= ecartMax && ovY >= 0.3 * Math.min(a.y1 - a.y0 + 1, b.y1 - b.y0 + 1);
      const dessus = gapY <= ecartMax && ovX >= 0.3 * Math.min(a.x1 - a.x0 + 1, b.x1 - b.x0 + 1);
      if (!cote && !dessus) continue;
      // Deux gris (verres, meme l'un sombre et l'autre clair) ; ou deux teintes proches (les
      // panneaux d'une porte peinte). Jamais un gris avec une teinte : une poutre verte a l'ombre
      // ressemble a un verre sombre par la valeur, pas par la teinte.
      const na = neutre(a),
        nb = neutre(b);
      if (na !== nb) continue;
      if (!na && Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b) > 50) continue;
      parent[racine(j)] = racine(i);
    }
  const groupes = new Map<number, Tache[]>();
  carreaux.forEach((t, i) => {
    const r = racine(i);
    groupes.set(r, [...(groupes.get(r) ?? []), t]);
  });

  // 5. Chaque baie, bords recales au pixel sur l'image pleine resolution.
  const lum = (x: number, y: number) => {
    const xi = Math.max(0, Math.min(W - 1, Math.round(x))),
      yi = Math.max(0, Math.min(H - 1, Math.round(y)));
    const i = (yi * W + xi) * 4;
    return 0.299 * d[i]! + 0.587 * d[i + 1]! + 0.114 * d[i + 2]!;
  };
  /** Le bord le plus net autour de `v` : `sens` +1 si le sombre est apres (x ou y croissant). */
  const recaler = (v: number, a: number, b: number, vertical: boolean, sens: number) => {
    const marge = Math.ceil(3 / k) + 1;
    const pas = Math.max(1, Math.floor((b - a) / 60));
    let meilleur = v,
      score = -Infinity;
    for (let u = Math.round(v - marge); u <= Math.round(v + marge); u++) {
      let s = 0,
        nb = 0;
      for (let w = a; w <= b; w += pas) {
        const avant = vertical ? lum(u - 1, w) + lum(u - 2, w) : lum(w, u - 1) + lum(w, u - 2);
        const apres = vertical ? lum(u, w) + lum(u + 1, w) : lum(w, u) + lum(w, u + 1);
        s += sens * (avant - apres);
        nb++;
      }
      if (nb && s / nb > score) [score, meilleur] = [s / nb, u];
    }
    return meilleur;
  };

  const murLike = (x: number, y: number) => {
    const j = y * l + x;
    if (!V[j]) return false;
    const mx = Math.max(R[j]!, G[j]!, B[j]!);
    if ((mx - Math.min(R[j]!, G[j]!, B[j]!)) / Math.max(1, mx) > 0.25) return false;
    const rugueux = T[j]! >= 0.05 * Math.max(20, L[j]!);
    // Le ciel : clair, lisse et bleute ; une menuiserie blanche est neutre.
    if (!rugueux && B[j]! - R[j]! > 12) return false;
    return rugueux || L[j]! >= 0.75 * envAt(x, y);
  };
  /** Part de mur dans la bande de 5 a 30 cm autour d'une boite (pixels de travail). */
  const entourageMur = (x0: number, y0: number, x1: number, y1: number) => {
    const a = Math.round(0.05 * wr),
      b = Math.max(a + 1, Math.round(0.3 * wr));
    let oui = 0,
      tous = 0;
    const pas = Math.max(1, Math.round(0.04 * wr));
    for (let y = y0 - b; y < y1 + b; y += pas)
      for (let x = x0 - b; x < x1 + b; x += pas) {
        if (x >= x0 - a && x < x1 + a && y >= y0 - a && y < y1 + a) continue;
        if (x < 0 || y < 0 || x >= l || y >= h) continue;
        tous++;
        if (murLike(x, y)) oui++;
      }
    return tous ? oui / tous : 0;
  };

  const brutes: { X0: number; Y0: number; X1: number; Y1: number; carreaux: number }[] = [];
  for (const ts of groupes.values()) {
    const x0 = Math.min(...ts.map((t) => t.x0)),
      x1 = Math.max(...ts.map((t) => t.x1)) + 1,
      y0 = Math.min(...ts.map((t) => t.y0)),
      y1 = Math.max(...ts.map((t) => t.y1)) + 1;
    const lw = m(x1 - x0),
      lh = m(y1 - y0);
    if (lw < 0.35 || lh < 0.4 || lw > 3.6 || lh > 3.2) continue;
    if (Math.max(lw / lh, lh / lw) > 5) continue;
    // Une baie est faite de ses carreaux pour un tiers au moins (menuiserie, meneaux, petits bois).
    if (ts.reduce((a, t) => a + t.n, 0) / ((x1 - x0) * (y1 - y0)) < 0.3) continue;
    // Une baie est entouree de mur (enduit rugueux) ou de sa menuiserie claire : pas de feuillage,
    // de pelouse ni de sol sombre. C'est ce qui ecarte une poubelle, un pot, un bout de ciel.
    if (entourageMur(x0, y0, x1, y1) < 0.55) continue;
    let X0 = x0 / k,
      X1 = x1 / k,
      Y0 = y0 / k,
      Y1 = y1 / k;
    const ia = Y0 + 0.2 * (Y1 - Y0),
      ib = Y1 - 0.2 * (Y1 - Y0),
      ja = X0 + 0.2 * (X1 - X0),
      jb = X1 - 0.2 * (X1 - X0);
    X0 = recaler(X0, ia, ib, true, 1);
    X1 = recaler(X1, ia, ib, true, -1);
    Y0 = recaler(Y0, ja, jb, false, 1);
    Y1 = recaler(Y1, ja, jb, false, -1);
    if (X1 - X0 < 2 || Y1 - Y0 < 2) continue;
    brutes.push({ X0, Y0, X1, Y1, carreaux: ts.length });
  }

  // Le sol : le bas de la plus basse des baies, si c'est une porte (1,80 m de haut au moins).
  const portes = brutes.filter((b) => (b.Y1 - b.Y0) / s0 >= 1.8);
  const solY = portes.length ? Math.max(...brutes.map((b) => b.Y1)) : null;
  const solTrouve = solY !== null && portes.some((p) => Math.abs(p.Y1 - solY) < 0.25 * s0);
  const sol = solTrouve ? solY! : H;
  const baies = brutes
    .map((b) => {
      const x = b.X0 / s0,
        y = Math.max(0, (sol - b.Y1) / s0),
        lw = (b.X1 - b.X0) / s0,
        lh = (b.Y1 - b.Y0) / s0;
      const r2 = (v: number) => Math.round(v * 100) / 100;
      return {
        type: solTrouve ? classer(y, lw, lh) : 'fenetre',
        x: r2(x),
        y: r2(y),
        l: r2(lw),
        h: r2(lh),
        carreaux: b.carreaux,
        px: { x: b.X0, y: b.Y0, l: b.X1 - b.X0, h: b.Y1 - b.Y0 },
      } as Baie;
    })
    .sort((a, b) => a.y - b.y || a.x - b.x);
  return { baies, solTrouve, solPx: solTrouve ? sol : null, echelleConnue: !!(pxParM && pxParM > 0) };
}

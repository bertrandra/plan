// Les baies (fenetres, portes) sur la facade redressee de facade.html : un des trois detecteurs
// independants que ../baies.ts fait voter. Celui-ci part de la menuiserie.
//
// Une fenetre se reconnait a sa menuiserie : des barres fines (montants, traverses, petits bois),
// droites, alignees sur les axes, bordees de deux aretes paralleles rapprochees, qui ferment des
// carreaux. Le redressement garantit l'alignement : on ne cherche donc que des aretes verticales
// et horizontales, et tout se joue sur elles, pas sur un seuil de luminosite ni sur une teinte -
// un porche a l'ombre, un rideau, un reflet deplacent une luminosite, pas une arete.
//
//   1. Image de travail a 1,5 cm par case (64 px/m) si l'echelle est connue, sinon 1024 px au
//      plus, et jamais plus de cases que le temps accorde n'en permet. Si la reduction tombe
//      entre 1/2 et 1, une image de 1200 px et plus est travaillee a 1/2 tout rond (une case de
//      2 x 2 px montre encore la texture) ; une plus petite garde sa reduction.
//   2. Aretes : difference entre colonnes voisines apres lissage le long de l'arete (une texture,
//      une oblique s'y effacent), contraste relatif (le meme a l'ombre et au soleil), maximum
//      local, chainage de ligne en ligne tant que la colonne ne derive pas. Une image saturee
//      d'aretes (plus d'une pour vingt cases vues : du bruit) ne rend aucune baie.
//   3. Barres : deux aretes voisines de signes opposes, a 16 cm au plus, sans rien entre elles.
//   4. Mailles : les rectangles fermes par des aretes dont le cote sombre est dedans - un carreau
//      entre ses petits bois, une vitre dans son cadre, une menuiserie sombre dans un mur clair.
//      Chaque arete est essayee comme un cote entier ; les trois autres peuvent etre morceles (un
//      meneau, un objet devant la vitre), pourvu qu'ils soient portes a 70 %, sans vide de 20 cm.
//   5. Cadre : les barres claires qui longent une maille l'elargissent jusqu'au hors-tout.
//   6. Reunions : deux mailles voisines de meme etendue, a 30 cm au plus, sont deux vantaux, ou
//      une imposte et ses vantaux. L'alignement suffit tant que l'ecart fait moins d'une demi-
//      maille ; au-dela, l'ecart doit etre pave de barres (un poteau entre deux montants).
//   7. Choix : la taille d'une baie, des bords nets (au regard des meilleurs de l'image), un
//      interieur distinct de ce qui l'entoure ; puis le mieux note d'abord (force des bords x
//      racine de l'aire), sans recouvrement. Les morceaux voisins d'une baie retenue lui
//      reviennent (une imposte, un vantail coupe par un poteau ou un garde-corps) : chacun une
//      seule fois, et seulement si la baie agrandie ne mord pas sur une autre baie retenue.
//   8. Portes a vantail plein : un grand rectangle debout, clair et lisse, entre deux longues
//      aretes qui se font face, ferme en haut, au niveau du sol ; seulement la ou rien d'autre
//      n'a ete trouve, et si la resolution montre la texture (l'enduit est rugueux, pas la peinture).
//   9. Chaque bord recale au pixel sur l'image pleine resolution, dans le sens de contraste
//      attendu (clair dedans la ou un cadre borde le cote, sombre dedans sinon). `carreaux` compte
//      les vitres que montants et traverses decoupent dans la baie rendue. Type selon la regle de
//      Plan (`classer`) quand la baie la plus basse est une porte : elle situe le sol.
//
// Pourquoi la maille et non la barre : un treillis de barres de meme teinte cadre au pixel les
// fenetres a petits bois, mais prend tout croisement de branches pour une croisee et ne voit pas
// une baie sans barres. Les barres servent a trouver le cadre (le hors-tout), a reconnaitre
// meneaux et traverses dans une maille, et a juger l'ecart entre deux vantaux.
//
// Limites connues : une fenetre a cadre clair et vitres claires dans un mur plus sombre (seules
// les mailles a bord sombre sont cherchees : une maille claire est trop souvent un pan de mur) ;
// une fenetre derriere un garde-corps ouvrage (coupee a la lisse) ; des volets ouverts (pris avec
// la fenetre, ou pour elle) ; une porte pleine sur une image peu definie ; deux fenetres jumelles
// separees par moins de 30 cm de mur et moins d'une demi-fenetre (reunies, meme si chacune a son
// cadre) ; un vide entre deux barreaux de balustrade, parfois pris pour un carreau.
// Le resultat depend de la phase des cases de l'image de travail : la meme facade rognee de
// quelques pixels, reduite, ou vue en miroir ne rend pas exactement les memes baies (les cases
// sont ancrees a gauche, les egalites tranchees dans le sens du balayage : sur 25 images, 2
// rendent exactement le miroir de leurs baies, et 163 boites sur 476).
// Le choix et les morceaux voisins ne laissent aucun recouvrement, mais le recalage deplace chaque
// bord a part : deux baies voisines peuvent finir par se chevaucher (10 paires a plus de 30 % de la
// plus petite, sur 1 366 baies de 75 images).
// Seul, ce detecteur ne declare le sol que si la baie la plus basse est une porte (la regle du
// vote) : une detection plus basse que la porte (un abri, un pot) lui fait rendre 'fenetre' partout.
// Les plafonds (20 000 mailles decrites, 1 500 candidats au choix, 2 000 montants de porte) ne
// sont pas atteints sur une facade ; ils bornent le temps sur une image degeneree (un damier, une
// echelle mal saisie), comme la sortie sur une image saturee d'aretes.
//
// C'est une proposition : la page permet d'ajouter, recadrer, retirer une baie et d'en changer le type.

import type { Image } from '../../vision/homographie.js';
import { au } from '../../../util/tableaux.js';
import { classer } from '../classement.js';
import type { TypeOuverture } from '../../../model/typesReleve.js';

export interface Baie {
  type: TypeOuverture;
  /** En metres : depuis le bord gauche de l'image, et au-dessus du sol (ou du bas de l'image). */
  x: number;
  y: number;
  l: number;
  h: number;
  /** Nombre de vitres : (montants + 1) x (traverses + 1), d'apres les barres qui traversent la baie ; 1 pour une porte pleine. */
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
  /** L'echelle etait-elle connue ? */
  echelleConnue: boolean;
}

/** L'image de travail : une case par pixel reduit. */
interface Travail {
  l: number;
  h: number;
  L: Float32Array;
  R: Float32Array;
  G: Float32Array;
  B: Float32Array;
  /** Rugosite relative : ecart type de la luminance des pixels d'origine de la case, sur sa moyenne. */
  T: Float32Array;
  V: Uint8Array;
}

/** Une arete droite, alignee sur un axe. Coordonnees de frontiere : `p` separe la case p - 1 de la case p. */
interface Arete {
  p: number;
  /** Etendue le long de l'arete : cases a .. b - 1. */
  a: number;
  b: number;
  /** +1 : sombre puis clair dans le sens croissant ; -1 : clair puis sombre. */
  s: number;
  /** Contraste relatif moyen. */
  f: number;
}

/** Une barre : deux aretes opposees rapprochees. Verticale : p0 .. p1 en x, a .. b en y. */
interface Barre {
  p0: number;
  p1: number;
  a: number;
  b: number;
  /** +1 : claire entre deux sombres ; -1 : sombre entre deux clairs. */
  pol: number;
}

/** Une maille : un rectangle ferme sur ses quatre cotes par des aretes dont le cote sombre est dedans. */
interface Cellule {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

interface Boite {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  n: number;
}

function reduire(img: Image, vu: Uint8Array | null, k: number): Travail {
  const W = img.largeur,
    H = img.hauteur,
    d = img.donnees;
  const l = Math.max(1, Math.round(W * k)),
    h = Math.max(1, Math.round(H * k));
  const N = l * h;
  const L = new Float32Array(N),
    R = new Float32Array(N),
    G = new Float32Array(N),
    B = new Float32Array(N),
    T = new Float32Array(N),
    V = new Uint8Array(N);
  if (k === 1) {
    for (let j = 0; j < N; j++) {
      if (vu && !vu[j]) continue;
      const r = (d[j * 4] as number),
        g = (d[j * 4 + 1] as number),
        b = (d[j * 4 + 2] as number);
      R[j] = r;
      G[j] = g;
      B[j] = b;
      L[j] = 0.299 * r + 0.587 * g + 0.114 * b;
      V[j] = 1;
    }
    return { l, h, L, R, G, B, T, V };
  }
  const n = new Float32Array(N),
    S2 = new Float32Array(N);
  const cx = new Int32Array(W);
  for (let x = 0; x < W; x++) cx[x] = Math.min(l - 1, Math.floor(x * k));
  for (let y = 0; y < H; y++) {
    const o = Math.min(h - 1, Math.floor(y * k)) * l;
    let i = y * W;
    for (let x = 0; x < W; x++, i++) {
      if (vu && !vu[i]) continue;
      const j = o + (cx[x] as number);
      const r = (d[i * 4] as number),
        g = (d[i * 4 + 1] as number),
        b = (d[i * 4 + 2] as number);
      R[j] = (R[j] as number) + r;
      G[j] = (G[j] as number) + g;
      B[j] = (B[j] as number) + b;
      const lu = 0.299 * r + 0.587 * g + 0.114 * b;
      S2[j] = (S2[j] as number) + lu * lu;
      n[j] = (n[j] as number) + 1;
    }
  }
  // Une case compte si le tiers de ses pixels est vu (au bord du masque) ; pres de l'echelle 1,
  // une case ne recoit parfois qu'un pixel : il suffit.
  const mini = Math.max(1, 0.34 / (k * k));
  for (let j = 0; j < N; j++) {
    const c = (n[j] as number);
    if (c < mini) continue;
    R[j] = (R[j] as number) / c;
    G[j] = (G[j] as number) / c;
    B[j] = (B[j] as number) / c;
    const lu = 0.299 * (R[j] as number) + 0.587 * (G[j] as number) + 0.114 * (B[j] as number);
    L[j] = lu;
    T[j] = c > 3 ? Math.sqrt(Math.max(0, (S2[j] as number) / c - lu * lu)) / Math.max(20, lu) : 0;
    V[j] = 1;
  }
  return { l, h, L, R, G, B, T, V };
}

/** Transpose une carte, par blocs (une ecriture colonne par colonne sort du cache). */
function transposer<A extends Float32Array | Uint8Array>(t: A, l: number, h: number, o: A): A {
  const B = 32;
  for (let y0 = 0; y0 < h; y0 += B)
    for (let x0 = 0; x0 < l; x0 += B) {
      const y1 = Math.min(h, y0 + B),
        x1 = Math.min(l, x0 + B);
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) o[x * h + y] = (t[y * l + x] as number);
    }
  return o;
}

/** Nombre de valeurs de contraste gardees a chaque bout d'une chaine, pour la rogner. */
const NB = 6;

/**
 * Les aretes verticales d'une carte : lissage le long de l'arete (une texture, une oblique s'y
 * effacent), difference entre colonnes voisines, maximum local, puis chainage de ligne en ligne
 * tant que la colonne ne derive pas.
 */
function aretes(L: Float32Array, V: Uint8Array, l: number, h: number, rv: number, seuil: number, lmin: number): Arete[] {
  const S = new Float32Array(l * h);
  const acc = new Float32Array(l),
    cnt = new Int32Array(l);
  for (let y = -rv; y < h; y++) {
    const e = y + rv;
    if (e < h) {
      const o = e * l;
      for (let x = 0; x < l; x++)
        if (V[o + x]) {
          acc[x] = (acc[x] as number) + (L[o + x] as number);
          cnt[x] = (cnt[x] as number) + 1;
        }
    }
    const s = y - rv - 1;
    if (s >= 0) {
      const o = s * l;
      for (let x = 0; x < l; x++)
        if (V[o + x]) {
          acc[x] = (acc[x] as number) - (L[o + x] as number);
          cnt[x] = (cnt[x] as number) - 1;
        }
    }
    if (y >= 0) {
      const o = y * l;
      for (let x = 0; x < l; x++) S[o + x] = V[o + x] && (cnt[x] as number) > rv ? (acc[x] as number) / (cnt[x] as number) : -1;
    }
  }
  // Les chaines, en tableaux paralleles : debut, derniere ligne, derniere colonne, colonnes extremes,
  // somme des colonnes, nombre de points, signe, somme des contrastes, et les NB premiers et
  // derniers contrastes.
  let cap = 4096,
    nc = 0;
  let cA = new Int32Array(cap),
    cFin = new Int32Array(cap),
    cXd = new Int32Array(cap),
    cMin = new Int32Array(cap),
    cMax = new Int32Array(cap),
    cN = new Int32Array(cap),
    cS = new Int8Array(cap),
    cSx = new Float64Array(cap),
    cSq = new Float64Array(cap),
    tete = new Float32Array(cap * NB),
    queue = new Float32Array(cap * NB);
  const grandir = () => {
    const g = <A extends Int32Array | Int8Array | Float64Array | Float32Array>(t: A, f: number): A => {
      const o = new (t.constructor as new (n: number) => A)(cap * 2 * f);
      o.set(t);
      return o;
    };
    cA = g(cA, 1);
    cFin = g(cFin, 1);
    cXd = g(cXd, 1);
    cMin = g(cMin, 1);
    cMax = g(cMax, 1);
    cN = g(cN, 1);
    cS = g(cS, 1);
    cSx = g(cSx, 1);
    cSq = g(cSq, 1);
    tete = g(tete, NB);
    queue = g(queue, NB);
    cap *= 2;
  };
  const derP = new Int32Array(l).fill(-1),
    derM = new Int32Array(l).fill(-1);
  const bas = seuil * 32 * 0.33;
  for (let y = 0; y < h; y++) {
    const o = y * l;
    // Differences entre colonnes voisines, au fil de la ligne : g (x - 1), v (x), dr (x + 1).
    let g = 0,
      v = 0,
      dr = 0;
    {
      const a = (S[o] as number),
        b = l > 1 ? (S[o + 1] as number) : -1;
      dr = a < 0 || b < 0 ? 0 : b - a;
    }
    for (let x = 0; x < l - 1; x++) {
      g = v;
      v = dr;
      if (x + 2 < l) {
        const a = (S[o + x + 1] as number),
          b = (S[o + x + 2] as number);
        dr = a < 0 || b < 0 ? 0 : b - a;
      } else dr = 0;
      const av = v < 0 ? -v : v;
      if (av < bas) continue;
      const gs = g * v > 0 ? (g < 0 ? -g : g) : 0,
        ds = dr * v > 0 ? (dr < 0 ? -dr : dr) : 0;
      if (av < gs || av <= ds) continue;
      const hi = Math.max((S[o + x - (gs > 0 ? 1 : 0)] as number), (S[o + x + 1 + (ds > 0 ? 1 : 0)] as number));
      const q = (av + gs + ds) / (hi + 32);
      if (q < seuil) continue;
      const dd = v > 0 ? derP : derM;
      let c = -1;
      for (let e = 0; e < 3 && c < 0; e++) {
        const xx = e === 0 ? x : e === 1 ? x - 1 : x + 1;
        if (xx < 0 || xx >= l) continue;
        const id = (dd[xx] as number);
        if (id < 0) continue;
        const fin = (cFin[id] as number);
        if (fin >= y || fin < y - 2) continue;
        const ec = (cXd[id] as number) - x;
        if (ec > 1 || ec < -1) continue;
        if (Math.max((cMax[id] as number), x) - Math.min((cMin[id] as number), x) > 2) continue;
        c = id;
      }
      if (c < 0) {
        if (nc === cap) grandir();
        c = nc++;
        cA[c] = y;
        cFin[c] = y - 1;
        cMin[c] = x;
        cMax[c] = x;
        cS[c] = v > 0 ? 1 : -1;
      }
      dd[x] = c;
      const a0 = (cA[c] as number);
      for (let t = (cFin[c] as number) + 1; t <= y; t++) {
        const i = t - a0,
          val = t === y ? q : 0;
        if (i < NB) tete[c * NB + i] = val;
        queue[c * NB + (i % NB)] = val;
      }
      cFin[c] = y;
      cXd[c] = x;
      if (x < (cMin[c] as number)) cMin[c] = x;
      if (x > (cMax[c] as number)) cMax[c] = x;
      cSx[c] = (cSx[c] as number) + x;
      cSq[c] = (cSq[c] as number) + q;
      cN[c] = (cN[c] as number) + 1;
    }
  }
  const res: Arete[] = [];
  for (let c = 0; c < nc; c++) {
    const lon = (cFin[c] as number) - (cA[c] as number) + 1;
    if (lon < lmin) continue;
    // Les bouts : le lissage prolonge une arete nette de rv cases, en s'affaiblissant. On coupe
    // la ou le contraste tombe sous la moitie de celui du corps.
    const moy = (cSq[c] as number) / (cN[c] as number);
    const ref = 0.5 * moy;
    let i0 = 0,
      i1 = lon - 1;
    while (i0 < NB && i0 < i1 && (tete[c * NB + i0] as number) < ref) i0++;
    while (lon - 1 - i1 < NB && i1 > i0 && (queue[c * NB + (i1 % NB)] as number) < ref) i1--;
    if (i1 - i0 + 1 < lmin) continue;
    res.push({ p: (cSx[c] as number) / (cN[c] as number) + 1, a: (cA[c] as number) + i0, b: (cA[c] as number) + i1 + 1, s: (cS[c] as number), f: moy });
  }
  return res;
}

/** Les barres : deux aretes voisines de signes opposes, sans autre arete entre elles. */
function barres(ar: Arete[], wmax: number, lmin: number): Barre[] {
  const ordre = ar.map((_, i) => i).sort((i, j) => au(ar, i).p - au(ar, j).p);
  const res: Barre[] = [];
  let libres: number[] = [],
    suite: number[] = [];
  for (let i = 0; i < ordre.length; i++) {
    const A = au(ar, (ordre[i] as number));
    libres.length = 0;
    libres.push(A.a, A.b);
    for (let j = i + 1; j < ordre.length && libres.length; j++) {
      const C = au(ar, (ordre[j] as number));
      const w = C.p - A.p;
      if (w > wmax) break;
      if (w < 0.75 || C.b <= A.a || C.a >= A.b) continue;
      suite.length = 0;
      for (let q = 0; q < libres.length; q += 2) {
        const fa = (libres[q] as number),
          fb = (libres[q + 1] as number);
        const o0 = Math.max(fa, C.a),
          o1 = Math.min(fb, C.b);
        if (o1 <= o0) {
          suite.push(fa, fb);
          continue;
        }
        if (C.s !== A.s && o1 - o0 >= Math.max(lmin, 1.5 * w)) res.push({ p0: A.p, p1: C.p, a: o0, b: o1, pol: A.s });
        if (o0 - fa >= lmin) suite.push(fa, o0);
        if (fb - o1 >= lmin) suite.push(o1, fb);
      }
      [libres, suite] = [suite, libres];
    }
  }
  return res;
}

/**
 * Les cartes de couverture : pour chaque signe, ou passe une arete verticale (a une case pres), et
 * ses sommes cumulees le long des colonnes ; de meme pour les horizontales, le long des lignes.
 * Elles disent en une soustraction quelle part d'un cote de rectangle est portee par des aretes,
 * meme morcelees.
 */
interface Couverture {
  /** Largeur d'une ligne des cartes : l + 1 frontieres. */
  l1: number;
  /** Aretes verticales de signe -1, +1 : cumul sur y, indice y * l1 + x (frontiere x). */
  v: [Uint16Array, Uint16Array];
  /** Aretes horizontales de signe -1, +1 : cumul sur x, indice y * l1 + x (frontiere y). */
  h: [Uint16Array, Uint16Array];
  /** Les memes, ponderees par le contraste de l'arete. */
  fv: [Float32Array, Float32Array];
  fh: [Float32Array, Float32Array];
}

function couverture(av: Arete[], ah: Arete[], l: number, h: number): Couverture {
  const l1 = l + 1,
    h1 = h + 1;
  const fv: [Float32Array, Float32Array] = [new Float32Array(l1 * h1), new Float32Array(l1 * h1)],
    fh: [Float32Array, Float32Array] = [new Float32Array(l1 * h1), new Float32Array(l1 * h1)];
  for (const e of av) {
    const t = fv[e.s < 0 ? 0 : 1];
    const x = Math.round(e.p);
    for (let xx = Math.max(0, x - 1); xx <= Math.min(l, x + 1); xx++)
      for (let y = e.a; y < e.b; y++) {
        const q = (y + 1) * l1 + xx;
        if ((t[q] as number) < e.f) t[q] = e.f;
      }
  }
  for (const e of ah) {
    const t = fh[e.s < 0 ? 0 : 1];
    const y = Math.round(e.p);
    for (let yy = Math.max(0, y - 1); yy <= Math.min(h, y + 1); yy++)
      for (let x = e.a; x < e.b; x++) {
        const q = yy * l1 + x + 1;
        if ((t[q] as number) < e.f) t[q] = e.f;
      }
  }
  const v: [Uint16Array, Uint16Array] = [new Uint16Array(l1 * h1), new Uint16Array(l1 * h1)],
    hh: [Uint16Array, Uint16Array] = [new Uint16Array(l1 * h1), new Uint16Array(l1 * h1)];
  for (let s = 0; s < 2; s++) {
    const f = au(fv, s),
      c = au(v, s);
    for (let y = 1; y < h1; y++)
      for (let x = 0; x < l1; x++) {
        const q = y * l1 + x;
        c[q] = (c[q - l1] as number) + ((f[q] as number) > 0 ? 1 : 0);
        f[q] = (f[q] as number) + (f[q - l1] as number);
      }
    const g = au(fh, s),
      d = au(hh, s);
    for (let y = 0; y < h1; y++)
      for (let x = 1; x < l1; x++) {
        const q = y * l1 + x;
        d[q] = (d[q - 1] as number) + ((g[q] as number) > 0 ? 1 : 0);
        g[q] = (g[q] as number) + (g[q - 1] as number);
      }
  }
  return { l1, v, h: hh, fv, fh };
}

/**
 * Les mailles : chaque arete est essayee comme un cote entier de rectangle ; on avance alors vers
 * l'interieur (le cote sombre) tant que les deux cotes voisins sont portes par des aretes, et l'on
 * ferme la ou une arete opposee couvre le quatrieme cote. Un seul cote doit donc etre d'un seul
 * tenant ; les trois autres peuvent etre morceles (un meneau, un objet devant la vitre).
 */
function mailles(av: Arete[], ah: Arete[], cv: Couverture, l: number, h: number, dmin: number, lmax: number, hmax: number, trou: number): Cellule[] {
  const { l1 } = cv;
  const res: Cellule[] = [];
  const vus = new Set<number>();
  const emettre = (x0: number, y0: number, x1: number, y1: number) => {
    const cle = (((x0 >> 1) * 2048 + (x1 >> 1)) * 2048 + (y0 >> 1)) * 2048 + (y1 >> 1);
    if (vus.has(cle)) return;
    vus.add(cle);
    res.push({ x0, y0, x1, y1 });
  };
  // Couverture d'un segment vertical (frontiere x, lignes a .. b - 1) ou horizontal (frontiere y, colonnes a .. b - 1).
  const cV = (s: number, x: number, a: number, b: number) => {
    if (x < 0 || x > l) return 0;
    const t = cv.v[s < 0 ? 0 : 1];
    return (t[b * l1 + x] as number) - (t[a * l1 + x] as number);
  };
  const cH = (s: number, y: number, a: number, b: number) => {
    if (y < 0 || y > h) return 0;
    const t = cv.h[s < 0 ? 0 : 1];
    return (t[y * l1 + b] as number) - (t[y * l1 + a] as number);
  };
  const graines = (ar: Arete[], horiz: boolean) => {
    const cote = horiz ? cV : cH,
      ferme = horiz ? cH : cV;
    const borne = horiz ? h : l,
      portee = horiz ? hmax : lmax,
      large = horiz ? lmax : hmax;
    for (const e of ar) {
      const w = e.b - e.a;
      if (w < dmin || w > large) continue;
      const sens = e.s < 0 ? 1 : -1;
      const p0 = Math.round(e.p);
      let emis = 0,
        debut = -1,
        meilleur = -1,
        score = 0;
      // Derniere avancee ou chaque cote etait porte : un cote ne saute pas un vide plus long que `trou`.
      let va = 0,
        vb = 0,
        pa = 0,
        pb = 0;
      for (let n = 1; n <= portee + 1; n++) {
        const p = p0 + sens * n;
        const dedans = p >= 0 && p <= borne;
        const lo = sens > 0 ? p0 : p,
          hi = sens > 0 ? p : p0;
        let ok = false;
        if (dedans) {
          const ca = Math.max(cote(-1, e.a - 1, lo, hi), cote(-1, e.a, lo, hi), cote(-1, e.a + 1, lo, hi)),
            cb = Math.max(cote(1, e.b - 1, lo, hi), cote(1, e.b, lo, hi), cote(1, e.b + 1, lo, hi));
          if (ca > pa) va = n;
          if (cb > pb) vb = n;
          pa = ca;
          pb = cb;
          if (n - va > trou || n - vb > trou) {
            if (debut < 0) break;
          } else if (n < dmin) continue;
          else if (n >= 2 * dmin && (ca < 0.5 * n || cb < 0.5 * n)) {
            if (debut < 0) break;
          } else if (ca >= 0.7 * n && cb >= 0.7 * n) {
            const c = ferme(-e.s, p, e.a, e.b);
            if (c >= 0.6 * w) {
              ok = true;
              if (debut < 0) [debut, meilleur, score] = [n, p, c];
              else if (c > score) [meilleur, score] = [p, c];
            }
          }
        }
        if (!ok && debut >= 0) {
          // fin d'une serie de positions qui ferment : on garde la mieux couverte
          const a = Math.min(p0, meilleur),
            b = Math.max(p0, meilleur);
          if (horiz) emettre(e.a, a, e.b, b);
          else emettre(a, e.a, b, e.b);
          debut = -1;
          if (++emis >= 3) break;
        }
        if (!dedans) break;
      }
    }
  };
  graines(ah, true);
  graines(av, false);
  return res;
}

/**
 * Tout ce que les etapes de `detecterBaies` partagent : l'image de travail, son echelle, ses
 * aretes et ses barres. Rien n'y change apres `preparer`.
 */
interface Contexte {
  img: Image;
  connue: boolean;
  /** Pixels de l'image d'origine par metre (suppose, si l'echelle est inconnue : 12 m dans la largeur). */
  s0: number;
  /** Reduction de l'image de travail. */
  k: number;
  tr: Travail;
  /** Pixels de travail par metre. */
  u: number;
  /** Tolerance sur les tailles en metres : l'echelle supposee peut etre fausse d'un facteur 1,6. */
  tol: number;
  av: Arete[];
  ah: Arete[];
  bv: Barre[];
  bh: Barre[];
  /** Largeur de barre au plus. */
  wmax: number;
  cv: Couverture;
  /** Les barres claires rangees par leur bord (fin, debut), pour trouver le cadre qui longe un cote. */
  vFin: number[][];
  vDebut: number[][];
  hFin: number[][];
  hDebut: number[][];
  /** Les barres rangees par position, pour compter celles qui traversent une boite. */
  vPos: number[][];
  hPos: number[][];
  /** La texture n'est mesurable que si une case de travail couvre plusieurs pixels de l'image. */
  texture: boolean;
  /** Ecart maximal entre deux mailles voisines pour en faire une reunion. */
  wgap: number;
}

/** Un candidat : une maille (ou une reunion de mailles), son enveloppe cadre compris, ses indices. */
interface Candidat extends Boite {
  c: Cellule;
  mv: number;
  mh: number;
  /** Nombre de cotes bordes d'un cadre, et sa largeur de chaque cote (gauche, droite, haut, bas). */
  cadre: number;
  bords: number[];
  lw: number;
  lh: number;
  /** Force moyenne des quatre cotes. */
  fmoy: number;
  /** Ecart de teinte entre l'interieur et ce qui l'entoure, sur le deuxieme cote le plus ressemblant. */
  d2: number;
  /** Luminance dedans, autour ; rugosite dedans. */
  li: number;
  la: number;
  ti: number;
  detail: boolean;
}

/** Moyennes (R, V, B, rugosite) sur un rectangle ; n = 0 s'il est hors champ. */
interface Moyenne {
  r: number;
  g: number;
  b: number;
  t: number;
  lu: number;
  n: number;
}

/** Une baie retenue, recalee sur l'image pleine resolution. */
interface BoiteRendue {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  vitres: number;
  porte: boolean;
}

// En deca de LISSE, une surface est peinte ou vitree, pas enduite.
const LISSE = 0.025;
// Au-dela de 20 000 mailles (du bruit, un grillage, une echelle mal saisie) on ne decrit que
// celles dont les bords sont les plus forts : la suite (doublons, reunions, choix) coute plus que
// leur nombre, et la page ne doit pas se figer.
const MAX_MAILLES = 20000;
// Pas de la grille qui range les boites par leur coin haut gauche.
const PAS = 16;

const aire = (b: Boite) => (b.x1 - b.x0) * (b.y1 - b.y0);
const inter = (a: Boite, b: Boite) => Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) * Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));
// Une reunion de mailles alignees vaut mieux que ses parties : deux vantaux font une fenetre.
const note = (b: Candidat) => Math.min(b.fmoy, 0.5) * Math.sqrt(aire(b)) * (b.n > 1 ? 1.15 : 1);

const ecart = (a: { r: number; g: number; b: number; lu: number }, b: { r: number; g: number; b: number; lu: number }) => Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b) / (Math.max(a.lu, b.lu) + 30);

/** Les barres claires rangees par leur bord, pour trouver le cadre qui longe un cote de maille. */
function ranger(bs: Barre[], n: number, fin: boolean): number[][] {
  const t: number[][] = [];
  for (let i = 0; i <= n + 1; i++) t.push([]);
  bs.forEach((b, i) => {
    if (b.pol > 0) au(t, Math.max(0, Math.min(n, Math.round(fin ? b.p1 : b.p0)))).push(i);
  });
  return t;
}

/** Les barres rangees par position, pour compter celles qui traversent une boite. */
function parPos(bs: Barre[], n: number): number[][] {
  const t: number[][] = [];
  for (let i = 0; i <= n + 1; i++) t.push([]);
  bs.forEach((b, i) => au(t, Math.max(0, Math.min(n, Math.round(b.p0)))).push(i));
  return t;
}

/**
 * Resolution de travail et echelle : 64 px/m (1,5 cm) si l'echelle est connue, sinon 1024 px au
 * plus, et jamais plus de cases que le temps accorde n'en permet (il croit avec la taille de l'image).
 * Entre 1/2 et 1, une case recevrait tantot un pixel, tantot deux (des aretes en dents de scie), et
 * la texture ne se mesurerait plus : une image assez grande est alors travaillee a 1/2 tout rond.
 */
function echelleDeTravail(img: Image, pxParM: number | null): { connue: boolean; s0: number; k: number } {
  const W = img.largeur,
    H = img.hauteur;
  const connue = !!(pxParM && pxParM > 0);
  const s0 = pxParM && pxParM > 0 ? pxParM : W / 12;
  const k0 = Math.min(1, connue ? 64 / s0 : 1024 / Math.max(W, H), Math.sqrt((5e5 + 0.1 * W * H) / (W * H)));
  const k = k0 > 0.5 && k0 < 1 && Math.max(W, H) >= 1200 ? 0.5 : k0;
  return { connue, s0, k };
}

/**
 * Image de travail, aretes et barres. Rend null quand l'image est saturee d'aretes (du bruit, un
 * grillage serre : plus d'une arete pour vingt cases, quand la facade la plus chargee de 223 images
 * en a une pour trente-cinq) : ce n'est pas une facade lisible. Plutot que de figer la page sur des
 * centaines de milliers de mailles, on ne rend rien. Le compte se rapporte aux cases vues : un
 * masque qui cache la moitie de l'image ne dilue pas le bruit de l'autre moitie.
 */
function preparer(img: Image, vu: Uint8Array | null, pxParM: number | null): Contexte | null {
  const { connue, s0, k } = echelleDeTravail(img, pxParM);
  const tr = reduire(img, vu, k);
  const { l, h, L, V } = tr;
  const u = s0 * k;
  const tol = connue ? 1 : 1.6;

  // Aretes : lissage sur 5 cases le long de l'arete, contraste relatif de 7 % au moins, 5 cases de long.
  const rv = 2;
  const seuil = 0.07;
  const av = aretes(L, V, l, h, rv, seuil, 5);
  const Lt = transposer(L, l, h, new Float32Array(l * h)),
    Vt = transposer(V, l, h, new Uint8Array(l * h));
  const ah = aretes(Lt, Vt, h, l, rv, seuil, 5);
  let casesVues = 0;
  for (let j = 0; j < l * h; j++) casesVues += V[j] as number;
  if (av.length + ah.length > 0.05 * casesVues) return null;

  // Barres : 16 cm de large au plus (un montant double entre deux vantaux).
  const wmax = Math.max(6, Math.min(16, 0.16 * u * tol));
  const bv = barres(av, wmax, 5),
    bh = barres(ah, wmax, 5);
  return {
    img,
    connue,
    s0,
    k,
    tr,
    u,
    tol,
    av,
    ah,
    bv,
    bh,
    wmax,
    cv: couverture(av, ah, l, h),
    vFin: ranger(bv, l, true),
    vDebut: ranger(bv, l, false),
    hFin: ranger(bh, h, true),
    hDebut: ranger(bh, h, false),
    vPos: parPos(bv, l),
    hPos: parPos(bh, h),
    texture: k <= 0.5,
    wgap: connue ? 0.3 * u : Math.min(20, 0.3 * u),
  };
}

/** Moyennes (R, V, B, rugosite) sur un rectangle de l'image de travail ; n = 0 s'il est hors champ. */
function moyenne(ctx: Contexte, x0: number, y0: number, x1: number, y1: number): Moyenne {
  const { tr } = ctx;
  const { l, h, V } = tr;
  const xa = Math.max(0, Math.round(x0)),
    xb = Math.min(l, Math.round(x1)),
    ya = Math.max(0, Math.round(y0)),
    yb = Math.min(h, Math.round(y1));
  // Une douzaine de points dans chaque sens suffit, quelle que soit la forme.
  const pasX = Math.max(1, Math.floor((xb - xa) / 12)),
    pasY = Math.max(1, Math.floor((yb - ya) / 12));
  let r = 0,
    g = 0,
    b = 0,
    t = 0,
    n = 0,
    tous = 0;
  for (let y = ya; y < yb; y += pasY)
    for (let x = xa; x < xb; x += pasX) {
      const q = y * l + x;
      tous++;
      if (!V[q]) continue;
      r += tr.R[q] as number;
      g += tr.G[q] as number;
      b += tr.B[q] as number;
      t += tr.T[q] as number;
      n++;
    }
  if (!n || n < 0.5 * tous) return { r: 0, g: 0, b: 0, t: 0, lu: 0, n: 0 };
  return { r: r / n, g: g / n, b: b / n, t: t / n, lu: (0.299 * r + 0.587 * g + 0.114 * b) / n, n };
}

/** Les mailles sombres ; une maille trop fine est une barre, pas un carreau. */
function mailleSombres(ctx: Contexte): Cellule[] {
  const { tr, u, tol, connue, wmax } = ctx;
  const dmin = Math.max(4, Math.round((0.07 * u) / tol));
  return mailles(ctx.av, ctx.ah, ctx.cv, tr.l, tr.h, dmin, Math.round(2.6 * u * tol), Math.round(3 * u * tol), Math.max(4, Math.round(connue ? 0.2 * u : wmax))).filter((c) => {
    const w = c.x1 - c.x0,
      hh = c.y1 - c.y0;
    return !(Math.min(w, hh) <= wmax && Math.max(w, hh) >= 3 * Math.min(w, hh));
  });
}

/** Le cadre le long d'un cote (0 gauche, 1 droite, 2 haut, 3 bas) : sa largeur, ou 0 s'il n'en couvre pas la moitie. */
function cadre(ctx: Contexte, c: Cellule, cote: number): number {
  const pos = cote === 0 ? c.x0 : cote === 1 ? c.x1 : cote === 2 ? c.y0 : c.y1;
  const a = cote < 2 ? c.y0 : c.x0,
    b = cote < 2 ? c.y1 : c.x1;
  const rang = cote === 0 ? ctx.vFin : cote === 1 ? ctx.vDebut : cote === 2 ? ctx.hFin : ctx.hDebut;
  const bs = cote < 2 ? ctx.bv : ctx.bh;
  const ws: [number, number][] = [];
  let poids = 0;
  for (let q = Math.max(0, Math.round(pos) - 1); q <= Math.round(pos) + 1 && q < rang.length; q++)
    for (const id of au(rang, q)) {
      const br = au(bs, id);
      const o = Math.min(b, br.b) - Math.max(a, br.a);
      if (o <= 0) continue;
      ws.push([br.p1 - br.p0, o]);
      poids += o;
    }
  if (poids < 0.5 * (b - a)) return 0;
  ws.sort((p, q) => p[0] - q[0]);
  let cumul = 0;
  for (const [w, o] of ws) {
    cumul += o;
    if (cumul >= 0.5 * poids) return w;
  }
  return 0;
}

/** Force d'un cote : le contraste des aretes qui le portent, rapporte a sa longueur (0 si rien ne le porte). */
function force(ctx: Contexte, c: Cellule, cote: number): number {
  const { cv } = ctx;
  const { l, h } = ctx.tr;
  const { l1 } = cv;
  let best = 0;
  for (let d = -1; d <= 1; d++) {
    let f = 0;
    if (cote < 2) {
      const x = Math.round(cote === 0 ? c.x0 : c.x1) + d;
      if (x < 0 || x > l) continue;
      const t = cv.fv[cote === 0 ? 0 : 1];
      f = ((t[Math.round(c.y1) * l1 + x] as number) - (t[Math.round(c.y0) * l1 + x] as number)) / (c.y1 - c.y0);
    } else {
      const y = Math.round(cote === 2 ? c.y0 : c.y1) + d;
      if (y < 0 || y > h) continue;
      const t = cv.fh[cote === 2 ? 0 : 1];
      f = ((t[y * l1 + Math.round(c.x1)] as number) - (t[y * l1 + Math.round(c.x0)] as number)) / (c.x1 - c.x0);
    }
    if (f > best) best = f;
  }
  return best;
}

/**
 * Les montants (ou les traverses) d'une boite : les barres qui la traversent sur la moitie au
 * moins, a l'ecart de ses bords ; celles qui se touchent n'en font qu'un (un montant
 * double : deux barres claires et le joint sombre entre elles).
 */
function traversantes(bs: Barre[], pos: number[][], p0: number, p1: number, a: number, b: number): number {
  let n = 0,
    fin = -9;
  for (let q = Math.max(0, Math.round(p0) + 2); q < p1 - 2 && q < pos.length; q++)
    for (const id of au(pos, q)) {
      const br = au(bs, id);
      if (br.p1 >= p1 - 1 || Math.min(br.b, b) - Math.max(br.a, a) < 0.5 * (b - a)) continue;
      if (br.p0 > fin + 0.75) n++;
      if (br.p1 > fin) fin = br.p1;
    }
  return n;
}

/**
 * Les montants (ou les traverses) d'une baie rendue, pour compter ses vitres. Un petit bois est
 * coupe par ceux qu'il croise (blanc sur blanc : pas d'arete au croisement) : les barres alignees
 * comptent ensemble, et font un montant si elles couvrent a elles toutes la moitie de la baie.
 */
function montants(bs: Barre[], pos: number[][], p0: number, p1: number, a: number, b: number): number {
  const dans: Barre[] = [];
  for (let q = Math.max(0, Math.round(p0) + 2); q < p1 - 2 && q < pos.length; q++)
    for (const id of au(pos, q)) {
      const br = au(bs, id);
      if (br.p1 < p1 - 1 && Math.min(br.b, b) > Math.max(br.a, a)) dans.push(br);
    }
  dans.sort((p, q) => p.p0 - q.p0 || p.a - q.a);
  let n = 0,
    fin = -9,
    couvert = 0;
  for (const br of dans) {
    if (br.p0 > fin + 0.75) {
      if (couvert >= 0.5 * (b - a)) n++;
      couvert = 0;
    }
    couvert += Math.min(br.b, b) - Math.max(br.a, a);
    if (br.p1 > fin) fin = br.p1;
  }
  return couvert >= 0.5 * (b - a) ? n + 1 : n;
}

/** Les indices couteux d'un candidat (teintes dedans et autour, barres traversantes), calcules a la demande. */
function detailler(ctx: Contexte, b: Candidat): void {
  if (b.detail) return;
  b.detail = true;
  const c = b.c;
  const dedans = moyenne(ctx, c.x0 + 1, c.y0 + 1, c.x1 - 1, c.y1 - 1);
  if (!dedans.n) {
    b.d2 = 0;
    return;
  }
  const m = Math.max(3, Math.round(0.12 * ctx.u));
  const dx = 0.1 * (b.x1 - b.x0),
    dy = 0.1 * (b.y1 - b.y0);
  const autour = [moyenne(ctx, b.x0 - 1 - m, b.y0 + dy, b.x0 - 1, b.y1 - dy), moyenne(ctx, b.x1 + 1, b.y0 + dy, b.x1 + 1 + m, b.y1 - dy), moyenne(ctx, b.x0 + dx, b.y0 - 1 - m, b.x1 - dx, b.y0 - 1), moyenne(ctx, b.x0 + dx, b.y1 + 1, b.x1 - dx, b.y1 + 1 + m)];
  const ds = autour.map((a) => (a.n ? ecart(dedans, a) : 9)).sort((p, q) => p - q);
  const la = autour.filter((a) => a.n).map((a) => a.lu);
  // La menuiserie a l'interieur : barres qui traversent la boite (meneaux, traverses).
  b.mv = traversantes(ctx.bv, ctx.vPos, c.x0, c.x1, c.y0, c.y1);
  b.mh = traversantes(ctx.bh, ctx.hPos, c.y0, c.y1, c.x0, c.x1);
  b.d2 = ds[1] as number;
  b.li = dedans.lu;
  b.la = la.length ? la.reduce((p, q) => p + q, 0) / la.length : 0;
  b.ti = dedans.t;
}

/** Un panneau d'enduit dans son cadre (un colombage) plutot qu'une vitre ? Il faut voir la texture. */
function estPanneauDEnduit(ctx: Contexte, b: Candidat, c: Cellule): boolean {
  // Un bord sombre epais comme une barre et un centre nettement plus clair et rugueux, sans une
  // barre dedans : un panneau d'enduit dans son cadre (un colombage), pas une vitre. Il faut voir
  // la texture : sans elle, un rideau clair dans un cadre sombre y ressemble trop.
  const ep = Math.max(2, Math.round(0.4 * ctx.wmax));
  if (!(ctx.texture && c.x1 - c.x0 >= 5 * ep && c.y1 - c.y0 >= 5 * ep)) return false;
  detailler(ctx, b);
  if (b.mv + b.mh !== 0) return false;
  const centre = moyenne(ctx, c.x0 + 2 * ep, c.y0 + 2 * ep, c.x1 - 2 * ep, c.y1 - 2 * ep);
  const bords = [moyenne(ctx, c.x0, c.y0, c.x0 + ep, c.y1), moyenne(ctx, c.x1 - ep, c.y0, c.x1, c.y1), moyenne(ctx, c.x0, c.y0, c.x1, c.y0 + ep), moyenne(ctx, c.x0, c.y1 - ep, c.x1, c.y1)].filter((m) => m.n);
  return !!(centre.n && centre.t > LISSE && bords.length === 4 && bords.filter((m) => centre.lu > 1.3 * m.lu).length >= 3);
}

/** Decrit une maille : sa force, son cadre, son enveloppe ; null si elle n'a pas la taille ni les bords d'une baie. */
function decrire(ctx: Contexte, c: Cellule, n: number): Candidat | null {
  const { u, tol } = ctx;
  // La force des quatre cotes : leur moyenne, et la deuxieme plus faible (un cote peut manquer).
  let f0 = 9,
    f1 = 9,
    somme = 0;
  for (let cote = 0; cote < 4; cote++) {
    const f = force(ctx, c, cote);
    somme += f;
    if (f < f0) [f0, f1] = [f, f0];
    else if (f < f1) f1 = f;
  }
  const fmoy = somme / 4;
  if (fmoy < 0.2 || f1 < 0.15) return null;
  const eg = cadre(ctx, c, 0),
    ed = cadre(ctx, c, 1),
    eh = cadre(ctx, c, 2),
    eb = cadre(ctx, c, 3);
  const x0 = c.x0 - eg,
    x1 = c.x1 + ed,
    y0 = c.y0 - eh,
    y1 = c.y1 + eb;
  const lw = (x1 - x0) / u,
    lh = (y1 - y0) / u;
  if (lw < 0.25 / tol || lh < 0.2 / tol || lw > 4 * tol || lh > 3.2 * tol) return null;
  const b: Candidat = { x0, y0, x1, y1, n, c, mv: 0, mh: 0, bords: [eg, ed, eh, eb], cadre: (eg > 0 ? 1 : 0) + (ed > 0 ? 1 : 0) + (eh > 0 ? 1 : 0) + (eb > 0 ? 1 : 0), lw, lh, fmoy, d2: 0, li: 0, la: 0, ti: 0, detail: false };
  return estPanneauDEnduit(ctx, b, c) ? null : b;
}

/** L'intervalle p0 .. p1 est-il pave (aux trois quarts) de barres qui longent a .. b sur la moitie au moins ? */
function pave(bs: Barre[], pos: number[][], p0: number, p1: number, a: number, b: number): boolean {
  let couvert = 0,
    fin = p0;
  for (let q = Math.max(0, Math.round(p0) - 1); q < p1 && q < pos.length; q++)
    for (const id of au(pos, q)) {
      const br = au(bs, id);
      if (Math.min(b, br.b) - Math.max(a, br.a) < 0.5 * (b - a)) continue;
      const d = Math.max(fin, br.p0),
        f = Math.min(p1, br.p1);
      if (f > d) {
        couvert += f - d;
        fin = f;
      }
    }
  return couvert >= 0.75 * (p1 - p0);
}

/** Des boites deja gardees, rangees par leur coin : une nouvelle venue en double-t-elle une ? */
function rangement(l: number) {
  const gl = Math.ceil((l + 1) / PAS) + 1;
  const grille = new Map<number, Candidat[]>();
  return {
    double(b: Candidat): boolean {
      const gx = Math.floor(Math.max(0, b.x0) / PAS),
        gy = Math.floor(Math.max(0, b.y0) / PAS);
      const rx = Math.ceil((0.18 * (b.x1 - b.x0)) / PAS),
        ry = Math.ceil((0.18 * (b.y1 - b.y0)) / PAS);
      for (let yy = gy - ry; yy <= gy + ry; yy++)
        for (let xx = gx - rx; xx <= gx + rx; xx++) {
          const cas = grille.get(yy * gl + xx);
          if (!cas) continue;
          for (const g of cas) {
            const i = inter(b, g);
            if (i > 0 && i >= 0.85 * (aire(b) + aire(g) - i)) return true;
          }
        }
      return false;
    },
    ajouter(b: Candidat): void {
      const cle = Math.floor(Math.max(0, b.y0) / PAS) * gl + Math.floor(Math.max(0, b.x0) / PAS);
      const cas = grille.get(cle);
      if (cas) cas.push(b);
      else grille.set(cle, [b]);
    },
  };
}

/** Les quasi-doublons (la meme maille a une case pres) : on garde le mieux note. */
function sansDoublons(l: number, bs: Candidat[]): Candidat[] {
  const tri = [...bs].sort((a, b) => note(b) - note(a));
  const gardes: Candidat[] = [];
  const rang = rangement(l);
  for (const b of tri) {
    if (rang.double(b)) continue;
    gardes.push(b);
    rang.ajouter(b);
  }
  return gardes;
}

/**
 * Les candidats : chaque maille, decrite. Au-dela de MAX_MAILLES on ne decrit que celles dont les
 * bords sont les plus forts. Les quasi-doublons : on garde le mieux note. Deux boites presque
 * confondues ont leurs coins a moins de 15 % de leur taille l'un de l'autre : une grille sur le
 * coin haut gauche evite de tout comparer a tout.
 */
function decrireLesMailles(ctx: Contexte, cs: Cellule[]): Candidat[] {
  let aDecrire = cs;
  if (cs.length > MAX_MAILLES) {
    const fs = cs.map((c) => force(ctx, c, 0) + force(ctx, c, 1) + force(ctx, c, 2) + force(ctx, c, 3));
    aDecrire = cs
      .map((_, i) => i)
      .sort((i, j) => (fs[j] as number) - (fs[i] as number) || i - j)
      .slice(0, MAX_MAILLES)
      .map((i) => au(cs, i));
  }
  const cands: Candidat[] = [];
  for (const c of aDecrire) {
    const b = decrire(ctx, c, 1);
    if (b) cands.push(b);
  }
  return sansDoublons(ctx.tr.l, cands);
}

/**
 * Deux mailles voisines sont-elles deux vantaux (ou une imposte et ses vantaux) ? A une barre pres
 * (ou a un poteau pres : 30 cm), de meme etendue.
 */
function sontLiees(ctx: Contexte, a: Cellule, c: Cellule): boolean {
  const { wgap } = ctx;
  const ix = Math.min(a.x1, c.x1) - Math.max(a.x0, c.x0),
    iy = Math.min(a.y1, c.y1) - Math.max(a.y0, c.y0);
  const wa = a.x1 - a.x0,
    ha = a.y1 - a.y0,
    wc = c.x1 - c.x0,
    hc = c.y1 - c.y0;
  if (ix <= 1 && -ix <= wgap) {
    const ty = Math.max(2, 0.1 * Math.min(ha, hc));
    // Deux vantaux : memes hauts et bas ; ou un seul bout aligne si l'autre vantail est
    // cache en partie (un garde-corps, un meuble devant), tant qu'ils se font face aux deux tiers.
    const bouts = (Math.abs(a.y0 - c.y0) <= ty ? 1 : 0) + (Math.abs(a.y1 - c.y1) <= ty ? 1 : 0);
    return (bouts === 2 || (bouts === 1 && iy >= 0.65 * Math.max(ha, hc))) && (-ix <= 0.5 * Math.max(wa, wc) || pave(ctx.bv, ctx.vPos, Math.min(a.x1, c.x1), Math.max(a.x0, c.x0), Math.max(a.y0, c.y0), Math.min(a.y1, c.y1)));
  }
  if (iy <= 1 && -iy <= wgap) {
    const tx = Math.max(2, 0.1 * Math.min(wa, wc));
    return Math.abs(a.x0 - c.x0) <= tx && Math.abs(a.x1 - c.x1) <= tx && (-iy <= 0.5 * Math.max(ha, hc) || pave(ctx.bh, ctx.hPos, Math.min(a.y1, c.y1), Math.max(a.y0, c.y0), Math.max(a.x0, c.x0), Math.min(a.x1, c.x1)));
  }
  return false;
}

/**
 * Les reunions : deux mailles voisines et de meme etendue sont deux vantaux, ou une imposte et ses
 * vantaux ; la reunion est candidate a son tour, et peut se reunir encore. On ne marie que les 250
 * mieux notees : le reste est du detail.
 */
function reunir(ctx: Contexte, cands0: Candidat[]): Candidat[] {
  const l = ctx.tr.l;
  let cands = cands0;
  // Tous les candidats, pour ecarter une reunion qui en double un sans tout comparer a tout.
  const connus = rangement(l);
  for (const b of cands) connus.ajouter(b);
  const base = [...cands].sort((p, q) => note(q) - note(p)).slice(0, 250);
  let vague = base;
  let bassin = base;
  for (let passe = 0; passe < 3 && vague.length; passe++) {
    const nouveaux: Candidat[] = [];
    const vusR = new Set<string>();
    for (const A of vague)
      for (const C of bassin) {
        if (A === C) continue;
        const a = A.c,
          c = C.c;
        if (!sontLiees(ctx, a, c)) continue;
        const r: Cellule = { x0: Math.min(a.x0, c.x0), y0: Math.min(a.y0, c.y0), x1: Math.max(a.x1, c.x1), y1: Math.max(a.y1, c.y1) };
        const cle = `${r.x0 >> 1},${r.y0 >> 1},${r.x1 >> 1},${r.y1 >> 1}`;
        if (vusR.has(cle)) continue;
        vusR.add(cle);
        const b = decrire(ctx, r, A.n + C.n);
        if (b) nouveaux.push(b);
      }
    vague = sansDoublons(l, nouveaux)
      .filter((b) => !connus.double(b))
      .slice(0, 100);
    for (const b of vague) connus.ajouter(b);
    cands = cands.concat(vague);
    bassin = bassin.concat(vague);
  }
  return cands;
}

/**
 * Une porte pleine entre deux montants qui se font face, ou null : un vantail clair et lisse
 * (une peinture ; l'enduit, lui, est rugueux), plus clair que ce qu'il y a de part et d'autre,
 * ferme en haut par plus sombre que lui.
 */
function porteEntre(ctx: Contexte, g: Arete, d: Arete, marge: number): Candidat | null {
  const { u, tol, tr } = ctx;
  const { l, L, V } = tr;
  const w = d.p - g.p;
  const oa = Math.max(g.a, d.a),
    ob = Math.min(g.b, d.b);
  if (ob - oa < (1.0 * u) / tol) return null;
  const bas = Math.max(g.b, d.b);
  const x0 = Math.round(g.p) + 2,
    x1 = Math.round(d.p) - 2;
  const px = Math.max(1, Math.floor((x1 - x0) / 10)),
    py = Math.max(1, Math.floor((ob - oa) / 20));
  const pts: [number, number][] = [];
  for (let y = oa; y < ob; y += py)
    for (let x = x0; x < x1; x += px) {
      const q = y * l + x;
      if (V[q]) pts.push([L[q] as number, tr.T[q] as number]);
    }
  if (pts.length < 40) return null;
  // Le vantail est ce qu'il y a de plus clair entre les montants : on juge sur les 40 % les
  // plus clairs (un hublot, un poteau devant, un buisson occupent le reste).
  pts.sort((p, q) => q[0] - p[0]);
  const clairs = pts.slice(0, Math.ceil(0.4 * pts.length));
  const lu = au(clairs, clairs.length >> 1)[0];
  const ru = clairs.map((p) => p[1]).sort((p, q) => p - q)[clairs.length >> 1] as number;
  if (ru > LISSE) return null;
  const dg = moyenne(ctx, g.p - marge, oa, g.p - 1, ob),
    dd = moyenne(ctx, d.p + 1, oa, d.p + marge, ob);
  if (!dg.n || !dd.n || lu < 1.25 * dg.lu || lu < 1.25 * dd.lu) return null;
  // Le haut : la ou les aretes commencent, puis tant que la ligne reste claire (une console,
  // une guirlande cachent souvent le haut des montants) ; au-dessus, il doit faire plus sombre.
  const ligne = (y: number): number => {
    const t: number[] = [];
    for (let x = x0; x < x1; x += px) if (V[y * l + x]) t.push(L[y * l + x] as number);
    if (t.length < 3) return -1;
    t.sort((p, q) => p - q);
    return t[t.length >> 1] as number;
  };
  let haut = Math.min(g.a, d.a);
  while (haut > 0 && Math.min(g.a, d.a) - haut < 0.3 * u && ligne(haut - 1) >= 0.8 * lu) haut--;
  let clair = 0,
    vues = 0;
  for (let y = haut - 1; y >= Math.max(0, haut - marge); y--) {
    const v = ligne(y);
    if (v < 0) continue;
    vues++;
    if (v >= 0.8 * lu) clair++;
  }
  if (vues && clair > 0.3 * vues) return null;
  const hp = bas - haut;
  if (hp < (1.7 * u) / tol || hp > 2.6 * u * tol || hp < 1.6 * w) return null;
  const f = (g.f + d.f) / 2;
  return { x0: g.p, y0: haut, x1: d.p, y1: bas, n: 1, c: { x0: g.p, y0: haut, x1: d.p, y1: bas }, mv: 0, mh: 0, cadre: 0, bords: [0, 0, 0, 0], lw: w / u, lh: (bas - haut) / u, fmoy: f, d2: 1, li: lu, la: (dg.lu + dd.lu) / 2, ti: ru, detail: true };
}

/**
 * Les portes a vantail plein : pas de carreau, pas de treillis, mais un grand rectangle debout,
 * clair et lisse, entre deux longues aretes qui se font face. Il faut voir la texture : une case
 * de travail doit couvrir plusieurs pixels.
 */
function portesPleines(ctx: Contexte): Candidat[] {
  const portes: Candidat[] = [];
  if (!ctx.texture) return portes;
  const { u, tol } = ctx;
  // Les montants : les aretes verticales d'un demi-metre au moins - et pas plus de 2 000 (les
  // plus longues), pour qu'une echelle mal saisie ou une image de bruit ne fige pas la page.
  const lmin = Math.max(8, (0.5 * u) / tol);
  let longues = ctx.av.filter((e) => e.b - e.a >= lmin);
  if (longues.length > 2000) longues = longues.sort((p, q) => q.b - q.a - (p.b - p.a) || p.p - q.p || p.a - q.a).slice(0, 2000);
  // Les montants de droite ranges par position : chaque montant de gauche ne regarde que ceux
  // qui sont a une largeur de porte de lui.
  const droites = longues.filter((e) => e.s < 0).sort((p, q) => p.p - q.p || p.a - q.a);
  const wmin = (0.6 * u) / tol,
    wmaxP = 1.3 * u * tol;
  const marge = Math.max(3, Math.round(0.12 * u));
  for (const g of longues) {
    if (g.s < 0) continue;
    let lo = 0,
      hi = droites.length;
    while (lo < hi) {
      const m = (lo + hi) >> 1;
      if (au(droites, m).p - g.p < wmin) lo = m + 1;
      else hi = m;
    }
    for (let i = lo; i < droites.length; i++) {
      const d = au(droites, i);
      if (d.p - g.p > wmaxP) break;
      const porte = porteEntre(ctx, g, d, marge);
      if (porte) portes.push(porte);
    }
  }
  return portes;
}

/**
 * Les candidats au choix. Une baie a la taille d'une baie, des bords nets, et un interieur qui n'est
 * pas ce qui l'entoure ; puis on ecarte les emboitements, et le mieux note vient d'abord.
 */
function candidatsValides(ctx: Contexte, cands: Candidat[]): Candidat[] {
  const { tol } = ctx;
  let valides = cands.filter((b) => b.lw >= 0.3 / tol && b.lh >= 0.35 / tol && b.lw * b.lh >= 0.2 && b.lh >= 0.4 * b.lw && b.lh <= 4.5 * b.lw && b.fmoy >= 0.25);
  for (const b of valides) detailler(ctx, b);
  valides = valides.filter((b) => b.d2 >= 0.15);
  // La nettete se juge dans l'image : les baies d'une facade ont a peu pres le meme contraste
  // (un mur sombre, une photo terne les affaiblissent toutes). On ecarte ce qui est nettement plus
  // flou que les dix meilleurs candidats, et ce qui est a la fois flou et rugueux dedans (un
  // feuillage, quand la resolution montre la texture).
  const tete = [...valides].sort((p, q) => note(q) - note(p)).slice(0, 10).map((b) => b.fmoy).sort((p, q) => p - q);
  const nettete = tete.length ? ((tete[(tete.length - 1) >> 1] as number) + (tete[tete.length >> 1] as number)) / 2 : 0;
  valides = valides.filter((b) => b.fmoy >= 0.7 * nettete && !(b.ti >= 0.18 && b.fmoy < 0.35));
  // Un interieur nettement plus clair que ce qui l'entoure, sans une barre dedans : un panneau de
  // mur dans son cadre sombre (un colombage), pas une vitre.
  valides = valides.filter((b) => !(b.li > 1.3 * b.la && b.mv + b.mh === 0));
  // Pas plus de 1 500 candidats au choix (les mieux notes) : une facade n'a pas tant de baies, et
  // la suite compare les candidats deux a deux (emboitements, choix, morceaux voisins).
  if (valides.length > 1500) valides = [...valides].sort((p, q) => note(q) - note(p)).slice(0, 1500);
  // Un candidat encadre sur trois cotes, emboite dans un plus grand qu'il remplit a plus de 55 %,
  // le remplace : le plus grand est le cadre du mur (un colombage, un chambranle), pas la menuiserie.
  const morts = new Set<Candidat>();
  for (const x of valides) {
    if (x.cadre < 3) continue;
    for (const y of valides) {
      if (y === x || aire(y) <= aire(x) || y.cadre >= x.cadre || inter(x, y) < 0.9 * aire(x) || aire(x) < 0.55 * aire(y)) continue;
      const marges = (x.x0 - y.x0 >= 1.5 ? 1 : 0) + (y.x1 - x.x1 >= 1.5 ? 1 : 0) + (x.y0 - y.y0 >= 1.5 ? 1 : 0) + (y.y1 - x.y1 >= 1.5 ? 1 : 0);
      if (marges >= 3) morts.add(y);
    }
  }
  return valides.filter((b) => !morts.has(b)).sort((p, q) => note(q) - note(p));
}

/** Le morceau f est-il un morceau voisin de la baie b (une imposte, une allege, un vantail) ? */
function estMorceauVoisin(ctx: Contexte, b: Candidat, f: Candidat): boolean {
  const { wgap } = ctx;
  const bw = b.x1 - b.x0,
    bh = b.y1 - b.y0,
    fw = f.x1 - f.x0,
    fh = f.y1 - f.y0;
  const ex = Math.max(b.x0 - f.x1, f.x0 - b.x1),
    ey = Math.max(b.y0 - f.y1, f.y0 - b.y1);
  if (f.x0 >= b.x0 - 0.08 * bw - 1 && f.x1 <= b.x1 + 0.08 * bw + 1 && fw >= 0.4 * bw && fh <= bh && ey <= wgap && ey >= -0.2 * fh) return true;
  return f.y0 >= b.y0 - 0.08 * bh - 1 && f.y1 <= b.y1 + 0.08 * bh + 1 && fh >= 0.4 * bh && fw <= bw && ex <= wgap && ex >= -0.2 * fw && f.bords[f.x0 > b.x0 ? 0 : 1] === 0;
}

/** Agrandit la baie b du morceau f ; r est la boite reunie. */
function annexer(ctx: Contexte, b: Candidat, f: Candidat, r: Boite): void {
  // Un cote deplace prend la maille et le cadre du morceau : le recalage et la passe suivante
  // les lisent.
  const c = { ...b.c };
  if (f.x0 < b.x0) [c.x0, b.bords[0]] = [f.c.x0, f.bords[0] as number];
  if (f.x1 > b.x1) [c.x1, b.bords[1]] = [f.c.x1, f.bords[1] as number];
  if (f.y0 < b.y0) [c.y0, b.bords[2]] = [f.c.y0, f.bords[2] as number];
  if (f.y1 > b.y1) [c.y1, b.bords[3]] = [f.c.y1, f.bords[3] as number];
  b.c = c;
  b.x0 = r.x0;
  b.y0 = r.y0;
  b.x1 = r.x1;
  b.y1 = r.y1;
  b.lw = (b.x1 - b.x0) / ctx.u;
  b.lh = (b.y1 - b.y0) / ctx.u;
  b.cadre = b.bords.filter((e) => e > 0).length;
  b.n += f.n;
}

/**
 * Les morceaux voisins d'une baie retenue lui reviennent : une imposte au-dessus (ou une allege
 * vitree au-dessous), dans sa largeur, a une traverse pres ; un vantail a cote, dans sa hauteur,
 * s'il n'a pas de montant du cote de la baie (un poteau, un garde-corps le coupe : la menuiserie
 * continue derriere). Deux fenetres voisines, chacune dans son cadre, restent deux fenetres.
 * Un morceau ne sert qu'une fois, a la baie la mieux notee (l'ordre de `choisis`). `choisis` est
 * modifie sur place.
 */
function absorberLesMorceaux(ctx: Contexte, choisis: Candidat[], valides: Candidat[]): void {
  const absorbes = new Set<Candidat>();
  for (let passe = 0; passe < 2; passe++)
    for (const b of [...choisis]) {
      if (!choisis.includes(b)) continue;
      for (const f of valides) {
        if (f === b || absorbes.has(f)) continue;
        if (!estMorceauVoisin(ctx, b, f)) continue;
        // La baie agrandie repasse la regle du choix : si elle mord sur une autre baie retenue
        // (plus de 30 % de la plus petite) sans l'englober, l'agrandissement est abandonne.
        const r: Boite = { x0: Math.min(b.x0, f.x0), y0: Math.min(b.y0, f.y0), x1: Math.max(b.x1, f.x1), y1: Math.max(b.y1, f.y1), n: 0 };
        if (choisis.some((g) => g !== b && g !== f && inter(r, g) > 0.3 * Math.min(aire(r), aire(g)) && inter(r, g) <= 0.5 * aire(g))) continue;
        absorbes.add(f);
        annexer(ctx, b, f, r);
      }
      for (const g of [...choisis]) if (g !== b && inter(b, g) > 0.5 * aire(g)) choisis.splice(choisis.indexOf(g), 1);
    }
}

/**
 * Le choix : le mieux note d'abord, sans recouvrement ; puis les morceaux voisins reviennent a la
 * baie retenue.
 */
function choisir(ctx: Contexte, cands: Candidat[]): Candidat[] {
  const valides = candidatsValides(ctx, cands);
  const choisis: Candidat[] = [];
  for (const b of valides) if (!choisis.some((g) => inter(b, g) > 0.3 * Math.min(aire(b), aire(g)))) choisis.push(b);
  absorberLesMorceaux(ctx, choisis, valides);
  return choisis;
}

/**
 * Les portes pleines viennent apres, la ou rien n'a ete trouve, et seulement au sol : leur bas
 * sous celui de la plupart des baies (un vantail de fenetre, blanc et lisse lui aussi, est plus
 * haut). `choisis` est modifie sur place.
 */
function ajouterLesPortes(choisis: Candidat[], portes: Candidat[]): void {
  const bas = choisis.map((b) => b.y1);
  for (const b of portes.sort((p, q) => note(q) - note(p))) {
    if (bas.filter((y) => y < b.y1 - 0.1 * (b.y1 - b.y0)).length < 0.6 * bas.length) continue;
    // Ce qui a ete trouve dans la porte et lui est petit (un hublot, un panneau) lui cede la place.
    const genes = choisis.filter((g) => inter(b, g) > 0.3 * Math.min(aire(b), aire(g)));
    if (genes.some((g) => inter(b, g) < 0.7 * aire(g) || aire(g) > 0.4 * aire(b))) continue;
    for (const g of genes) choisis.splice(choisis.indexOf(g), 1);
    choisis.push(b);
  }
}

/**
 * Les baies d'une facade sont du meme ordre de grandeur : ce qui est douze fois plus petit que
 * la deuxieme plus grande est un detail (un pot, une lanterne, un barreau). `choisis` est modifie
 * sur place.
 */
function ecarterLesDetails(choisis: Candidat[]): void {
  const aires = choisis.map(aire).sort((p, q) => q - p);
  if (aires.length < 3) return;
  const ref = aires[1] as number;
  for (let i = choisis.length - 1; i >= 0; i--) if (aire(au(choisis, i)) < 0.08 * ref) choisis.splice(i, 1);
}

/** Luminance d'un pixel de l'image pleine resolution (bords replies). */
function lumi(img: Image, x: number, y: number): number {
  const W = img.largeur,
    H = img.hauteur;
  const d = img.donnees;
  const q = (Math.max(0, Math.min(H - 1, y)) * W + Math.max(0, Math.min(W - 1, x))) * 4;
  return 0.299 * (d[q] as number) + 0.587 * (d[q + 1] as number) + 0.114 * (d[q + 2] as number);
}

/**
 * Recale un bord sur l'image pleine resolution, la ou le contraste moyen le long du bord est le
 * plus fort, a une case et demie de travail pres. `sens` : le contraste attendu dans le sens
 * croissant (+1 : sombre puis clair, -1 : clair puis sombre, 0 : l'un ou l'autre). Sans lui, le
 * bord exterieur d'un cadre clair (cadre / mur, faible) perd contre son bord interieur (cadre /
 * vitre, bien plus fort) et la boite revient au vitrage.
 */
function recaler(img: Image, k: number, v: number, a: number, b: number, vertical: boolean, sens: number): number {
  const marge = Math.ceil(1.5 / k);
  const a2 = Math.round(a + 0.2 * (b - a)),
    b2 = Math.round(b - 0.2 * (b - a));
  const pas = Math.max(1, Math.floor((b2 - a2) / 48));
  let meilleur = Math.round(v),
    score = 0,
    mAbs = Math.round(v),
    sAbs = -1;
  for (let p = Math.round(v) - marge; p <= Math.round(v) + marge; p++) {
    let somme = 0;
    for (let t = a2; t <= b2; t += pas) somme += vertical ? lumi(img, p, t) + lumi(img, p + 1, t) - lumi(img, p - 1, t) - lumi(img, p - 2, t) : lumi(img, t, p) + lumi(img, t, p + 1) - lumi(img, t, p - 1) - lumi(img, t, p - 2);
    // a contraste egal, le plus pres de la position trouvee
    const pres = 1e-6 * Math.abs(p - v);
    if (Math.abs(somme) - pres > sAbs) [sAbs, mAbs] = [Math.abs(somme) - pres, p];
    if (sens * somme - pres > score) [score, meilleur] = [sens * somme - pres, p];
  }
  // aucun bord du sens attendu a portee : le plus fort, quel qu'il soit
  return score > 0 ? meilleur : mAbs;
}

/** Chaque bord recale sur l'image pleine resolution, et les vitres comptees. */
function recalerLesBoites(ctx: Contexte, choisis: Candidat[], portes: Candidat[]): BoiteRendue[] {
  const { img, k } = ctx;
  const W = img.largeur,
    H = img.hauteur;
  return choisis.map((b) => {
    const X0 = b.x0 / k,
      X1 = b.x1 / k,
      Y0 = b.y0 / k,
      Y1 = b.y1 / k;
    // Clair dedans si le cote a un cadre (ou pour une porte pleine), sombre dedans sinon ; un cote
    // venu d'un morceau voisin a pris le cadre de ce morceau.
    const plein = portes.includes(b);
    const dedans = (i: number) => (plein || (b.bords[i] as number) > 0 ? 1 : -1);
    const x0 = Math.max(0, recaler(img, k, X0, Y0, Y1, true, dedans(0))),
      x1 = Math.min(W, recaler(img, k, X1, Y0, Y1, true, -dedans(1))),
      y0 = Math.max(0, recaler(img, k, Y0, X0, X1, false, dedans(2))),
      y1 = Math.min(H, recaler(img, k, Y1, X0, X1, false, -dedans(3)));
    // Les vitres : ce que montants et traverses decoupent dans la baie telle qu'elle est rendue
    // (le nombre de mailles reunies ne le dit pas : une seule maille enjambe souvent les petits bois).
    const vitres = plein ? 1 : (montants(ctx.bv, ctx.vPos, b.x0, b.x1, b.y0, b.y1) + 1) * (montants(ctx.bh, ctx.hPos, b.y0, b.y1, b.x0, b.x1) + 1);
    return { x0, y0, x1, y1, vitres, porte: plein };
  });
}

/** Le type et la position de chaque baie, a l'echelle (donnee, ou tiree d'une porte pleine) et au sol trouve. */
function rendre(ctx: Contexte, boites: BoiteRendue[]): ResultatBaies {
  const H = ctx.img.hauteur;
  const { connue, s0 } = ctx;
  // L'echelle, si elle n'est pas donnee : une porte pleine fait 2,10 m de haut, cadre compris.
  const pleines = boites.filter((b) => b.porte);
  const s = connue || !pleines.length ? s0 : Math.max(...pleines.map((b) => b.y1 - b.y0)) / 2.1;
  // Le sol : le bas de la baie la plus basse, si c'est une porte (1,80 m de haut au moins, a 25 cm
  // pres) - la regle du vote (../baies.ts). Une grande baie qui en a d'autres sous elle est a
  // l'etage : elle ne situe pas le sol, et les types restent alors 'fenetre'.
  const rendues = boites.filter((b) => b.x1 - b.x0 >= 2 && b.y1 - b.y0 >= 2);
  let plusBas = -1;
  for (const b of rendues) if (b.y1 > plusBas) plusBas = b.y1;
  const solTrouve = rendues.some((b) => (b.y1 - b.y0) / s >= 1.8 && plusBas - b.y1 < 0.25 * s);
  const sol = solTrouve ? plusBas : H;
  const r2 = (v: number) => Math.round(v * 100) / 100;
  const baies: Baie[] = rendues
    .map((b): Baie => {
      const lw = (b.x1 - b.x0) / s,
        lh = (b.y1 - b.y0) / s,
        y = Math.max(0, (sol - b.y1) / s);
      return { type: solTrouve ? classer(y, lw, lh) : 'fenetre', x: r2(b.x0 / s), y: r2(y), l: r2(lw), h: r2(lh), carreaux: b.vitres, px: { x: b.x0, y: b.y0, l: b.x1 - b.x0, h: b.y1 - b.y0 } };
    })
    .sort((p, q) => p.y - q.y || p.x - q.x);
  return { baies, solTrouve, solPx: solTrouve ? sol : null, echelleConnue: connue };
}

export function detecterBaies(img: Image, vu: Uint8Array | null, pxParM: number | null): ResultatBaies {
  const ctx = preparer(img, vu, pxParM);
  if (!ctx) return { baies: [], solTrouve: false, solPx: null, echelleConnue: echelleDeTravail(img, pxParM).connue };
  const cands = reunir(ctx, decrireLesMailles(ctx, mailleSombres(ctx)));
  const portes = portesPleines(ctx);
  const choisis = choisir(ctx, cands);
  ajouterLesPortes(choisis, portes);
  ecarterLesDetails(choisis);
  return rendre(ctx, recalerLesBoites(ctx, choisis, portes));
}

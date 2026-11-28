// La camera d'une vue 3D ne passe jamais sous le sol (retour de l'utilisateur, novembre 2026 : « en vue 3D je passe en dessous du
// sol. Aucun interet »).
//
// Un `maxPolarAngle` sous l'horizon ne suffisait pas : il ne connait que la cible, pas le sol sous la camera (un terrain en pente, un
// deplacement qui descend la cible), et il interdirait la contre-plongee — regarder vers le haut depuis le sol, la cible au-dessus
// de l'oeil (un toit vu du jardin, un point de vue a hauteur d'yeux). La regle est donc tenue apres chaque mouvement de l'orbite,
// quel que soit le geste qui l'a produit (`tenirAuDessusDuSol`), sur le sol reel sous la camera : le relief quand la scene en a un,
// sinon le plan du sol.
//
// Le calcul est pur (`auDessusDuSol`) : il se teste seul, sans three.

/**
 * L'oeil reste au moins a cette hauteur au-dessus du sol sous lui. 0,30 m : assez pour que le plan proche de la camera (5 cm) ne
 * coupe jamais le sol ni l'herbe dessinee dessus, assez peu pour garder une vue d'enfant ou de chat sur la terrasse — la hauteur
 * des yeux (1,60 m) n'est jamais touchee.
 */
export const MARGE_SOL_CAMERA_M = 0.3;

/** En dessous de cet ecart, rien ne bouge : l'orbite ne se dispute pas avec la regle pour un arrondi. */
const TOLERANCE_M = 1e-4;

/** Un point du repere local de la scene (y vers le haut). */
export interface Pt3 { x: number; y: number; z: number }

/** La hauteur du sol (y local) a la verticale d'un point (x, z) du repere local. */
export type SolSous = (x: number, z: number) => number;

/** Le sol lu, un sol illisible (hors grille, NaN) valant le plan du sol. */
function lire(sol: SolSous, x: number, z: number): number {
  const h = sol(x, z);
  return Number.isFinite(h) ? h : 0;
}

/**
 * La camera et la cible de l'orbite ramenees au-dessus du sol, ou null si elles y sont deja.
 *
 * 1. **La cible** ne s'enfonce pas : sous le sol, elle remonte sur lui, et la camera du meme pas — la vue ne change pas
 *    d'orientation (un deplacement qui descendait la cible s'arrete au sol).
 * 2. **L'oeil** reste a `marge` au-dessus du sol sous lui. Trop bas, il tourne vers le haut autour de la cible, a la meme
 *    distance et dans le meme azimut : c'est ce que ferait l'orbite arretee au ras du sol. Garder la distance evite la derive : une
 *    camera simplement remontee se rapprocherait de la cible a chaque image ou l'orbite pousse encore vers le bas. Le sol sous
 *    l'oeil change quand il se deplace (une pente) : la correction est reprise quelques fois, puis, en dernier recours (une cible
 *    trop proche pour tourner autour d'elle), l'oeil monte a la verticale.
 *
 * Une camera plus basse que sa cible reste permise tant qu'elle est au-dessus du sol : la contre-plongee n'est pas touchee.
 */
export function auDessusDuSol(camera: Pt3, cible: Pt3, sol: SolSous, marge = MARGE_SOL_CAMERA_M): { camera: Pt3; cible: Pt3 } | null {
  let cam = { x: camera.x, y: camera.y, z: camera.z };
  const cib = { x: cible.x, y: cible.y, z: cible.z };
  let change = false;
  const solCible = lire(sol, cib.x, cib.z);
  if (cib.y < solCible - TOLERANCE_M) {
    const dy = solCible - cib.y;
    cib.y = solCible;
    cam.y += dy;
    change = true;
  }
  for (let i = 0; i < 4; i++) {
    const hMin = lire(sol, cam.x, cam.z) + marge;
    if (cam.y >= hMin - TOLERANCE_M) break;
    change = true;
    const dx = cam.x - cib.x, dz = cam.z - cib.z, horiz = Math.hypot(dx, dz);
    const r = Math.hypot(dx, cam.y - cib.y, dz), dy = hMin - cib.y;
    if (horiz < 1e-9 || r <= Math.abs(dy) + 1e-9) { cam.y = hMin; break; }
    const k = Math.sqrt(r * r - dy * dy) / horiz;
    cam = { x: cib.x + dx * k, y: hMin, z: cib.z + dz * k };
  }
  const hMin = lire(sol, cam.x, cam.z) + marge;
  if (cam.y < hMin - TOLERANCE_M) { cam.y = hMin; change = true; }
  return change ? { camera: cam, cible: cib } : null;
}

/** Ce que la regle touche d'une camera et de son orbite (three.js, sans l'importer). */
interface CameraTenue { position: Pt3 & { set(x: number, y: number, z: number): unknown }; lookAt(v: Pt3 & object): void }
interface OrbiteTenue {
  target: Pt3 & { set(x: number, y: number, z: number): unknown };
  addEventListener(type: 'change', f: () => void): void;
  removeEventListener(type: 'change', f: () => void): void;
}

/**
 * Tient la camera d'une orbite au-dessus du sol : apres chaque mouvement (l'evenement `change` d'OrbitControls, que chaque geste
 * declenche par `controls.update()` — glisser, deplacer, molette, pincement, fleches, hauteur des yeux, point de vue, transitions),
 * puis tout de suite, pour la camera deja posee (un point de vue enregistre sous le sol est remonte a l'ouverture ; le fichier, lui,
 * n'est pas touche). La correction est faite avant que l'orbite ne retienne la position : la suivante part de la camera corrigee,
 * sans a-coup. Rend de quoi debrancher.
 */
export function tenirAuDessusDuSol(camera: CameraTenue, orbite: OrbiteTenue, sol: SolSous, marge = MARGE_SOL_CAMERA_M): () => void {
  const corriger = () => {
    const r = auDessusDuSol(camera.position, orbite.target, sol, marge);
    if (!r) return;
    orbite.target.set(r.cible.x, r.cible.y, r.cible.z);
    camera.position.set(r.camera.x, r.camera.y, r.camera.z);
    camera.lookAt(orbite.target);
  };
  orbite.addEventListener('change', corriger);
  corriger();
  return () => orbite.removeEventListener('change', corriger);
}

/**
 * Un sol lu dans les sommets d'un maillage deja pose (x, y, z a la suite, repere local) : la visionneuse relit un .glb, ou le relief
 * n'est plus qu'un maillage, et le rayon jete a chaque image sur des dizaines de milliers de triangles ralentirait l'orbite. Les
 * sommets sont ranges une fois dans une grille (le plus haut de chaque case, une case de la taille d'environ un sommet) ; une case
 * vide prend la plus haute de ses voisines, hors du maillage le sol est le plan `horsMaillage`.
 */
export function solDepuisSommets(sommets: ArrayLike<number>, horsMaillage = 0): SolSous {
  const n = Math.floor(sommets.length / 3);
  if (n < 3) return () => horsMaillage;
  let xMin = Infinity, xMax = -Infinity, zMin = Infinity, zMax = -Infinity;
  for (let i = 0; i < n; i++) {
    const x = sommets[i * 3] ?? 0, z = sommets[i * 3 + 2] ?? 0;
    if (x < xMin) xMin = x; if (x > xMax) xMax = x;
    if (z < zMin) zMin = z; if (z > zMax) zMax = z;
  }
  const pas = Math.max(0.25, Math.sqrt(((xMax - xMin) * (zMax - zMin)) / n) * 1.5);
  const nx = Math.max(1, Math.ceil((xMax - xMin) / pas) + 1), nz = Math.max(1, Math.ceil((zMax - zMin) / pas) + 1);
  const cases = new Float64Array(nx * nz).fill(-Infinity);
  for (let i = 0; i < n; i++) {
    const ci = Math.floor(((sommets[i * 3] ?? 0) - xMin) / pas), cj = Math.floor(((sommets[i * 3 + 2] ?? 0) - zMin) / pas);
    const k = cj * nx + ci, y = sommets[i * 3 + 1] ?? 0;
    if (y > (cases[k] ?? -Infinity)) cases[k] = y;
  }
  return (x, z) => {
    if (x < xMin || x > xMax || z < zMin || z > zMax) return horsMaillage;
    const ci = Math.floor((x - xMin) / pas), cj = Math.floor((z - zMin) / pas);
    let h = cases[cj * nx + ci] ?? -Infinity;
    for (let dj = -1; h === -Infinity && dj <= 1; dj++) {
      for (let di = -1; di <= 1; di++) {
        const i = ci + di, j = cj + dj;
        if (i >= 0 && i < nx && j >= 0 && j < nz) h = Math.max(h, cases[j * nx + i] ?? -Infinity);
      }
    }
    return h === -Infinity ? horsMaillage : h;
  };
}

import { describe, it, expect } from 'vitest';
import { auDessusDuSol, tenirAuDessusDuSol, solDepuisSommets, MARGE_SOL_CAMERA_M, dansLaVueLibre, dansLaVueLibreRamenee, geste3d, VUE_LIBRE, type Pt3, type SolSous } from '../../../src/three/solCamera.js';
import { cameraDepuisPointDeVue } from '../../../src/three/navigation.js';

// La camera de la Vue 3D ne passe jamais sous le sol (retour de l'utilisateur, novembre 2026).

const plat: SolSous = () => 0;
/** Une pente de 20 % qui monte vers les x positifs. */
const pente: SolSous = (x) => 0.2 * x;
const dist = (a: Pt3, b: Pt3) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

describe('auDessusDuSol', () => {
  it('ne touche pas une camera deja au-dessus du sol', () => {
    expect(auDessusDuSol({ x: 10, y: 8, z: 10 }, { x: 0, y: 0, z: 0 }, plat)).toBeNull();
    // La contre-plongee reste permise : l'oeil sous la cible, au-dessus du sol.
    expect(auDessusDuSol({ x: 5, y: 1.6, z: 0 }, { x: 0, y: 6, z: 0 }, plat)).toBeNull();
  });

  it('sol plat : la camera passee sous le sol par l\'orbite remonte a la marge, a la meme distance de la cible', () => {
    const cam = { x: 9.9, y: -1.4, z: 0 }, cible = { x: 0, y: 0, z: 0 };
    const r = auDessusDuSol(cam, cible, plat);
    expect(r).not.toBeNull();
    expect(r!.camera.y).toBeCloseTo(MARGE_SOL_CAMERA_M, 9);
    expect(dist(r!.camera, cible)).toBeCloseTo(dist(cam, cible), 9);
    // Meme azimut : la camera reste du meme cote de la cible.
    expect(r!.camera.z).toBeCloseTo(0, 9);
    expect(r!.camera.x).toBeGreaterThan(0);
    expect(r!.cible).toEqual(cible);
  });

  it('pousser encore l\'orbite vers le bas ne rapproche pas la camera de la cible (pas de derive)', () => {
    const cible = { x: 0, y: 0, z: 0 };
    let cam: Pt3 = { x: 10, y: 1, z: 0 };
    const r0 = dist(cam, cible);
    for (let i = 0; i < 50; i++) {
      // Un pas d'orbite vers le bas : 3 degres de plus sous la ligne actuelle.
      const phi = Math.atan2(Math.hypot(cam.x, cam.z), cam.y) + (3 * Math.PI) / 180;
      cam = { x: r0 * Math.sin(phi), y: r0 * Math.cos(phi), z: 0 };
      cam = auDessusDuSol(cam, cible, plat)?.camera ?? cam;
    }
    expect(cam.y).toBeCloseTo(MARGE_SOL_CAMERA_M, 6);
    expect(dist(cam, cible)).toBeCloseTo(r0, 6);
  });

  it('pente : l\'oeil reste a la marge au-dessus du sol sous lui, pas du sol sous la cible', () => {
    const cible = { x: 0, y: 0, z: 0 };
    const r = auDessusDuSol({ x: 10, y: 1, z: 0 }, cible, pente);
    expect(r).not.toBeNull();
    expect(r!.camera.y).toBeGreaterThanOrEqual(pente(r!.camera.x, r!.camera.z) + MARGE_SOL_CAMERA_M - 1e-6);
    // Au-dessus du sol plat, cette camera (1 m) n'aurait pas bouge.
    expect(auDessusDuSol({ x: 10, y: 1, z: 0 }, cible, plat)).toBeNull();
    // Vers le bas de la pente, la meme hauteur est permise.
    expect(auDessusDuSol({ x: -10, y: -1.5, z: 0 }, cible, pente)).toBeNull();
  });

  it('une cible sous le sol remonte sur lui, la camera du meme pas : la vue garde son orientation', () => {
    const cam = { x: 5, y: 3, z: 5 }, cible = { x: 0, y: -2, z: 0 };
    const r = auDessusDuSol(cam, cible, plat)!;
    expect(r.cible).toEqual({ x: 0, y: 0, z: 0 });
    expect(r.camera).toEqual({ x: 5, y: 5, z: 5 });
  });

  it('une cible sous une pente remonte au sol sous elle', () => {
    const r = auDessusDuSol({ x: 10, y: 6, z: 0 }, { x: 10, y: 0, z: 4 }, pente)!;
    expect(r.cible.y).toBeCloseTo(2, 9);
    expect(r.camera.y).toBeCloseTo(8, 9);
  });

  it('camera trop proche d\'une cible au sol pour tourner : elle monte a la verticale', () => {
    const r = auDessusDuSol({ x: 0.1, y: 0.05, z: 0 }, { x: 0, y: 0, z: 0 }, plat)!;
    expect(r.camera).toEqual({ x: 0.1, y: MARGE_SOL_CAMERA_M, z: 0 });
  });

  it('un sol illisible vaut le plan du sol', () => {
    const r = auDessusDuSol({ x: 3, y: -1, z: 0 }, { x: 0, y: 2, z: 0 }, () => NaN)!;
    expect(r.camera.y).toBeCloseTo(MARGE_SOL_CAMERA_M, 9);
  });

  it('un ancien point de vue enregistre sous le sol (relief) est remonte, sans toucher au point de vue', () => {
    const vp = { pts: [{ x: 110, y: 50 }, { x: 120, y: 50 }], altitude: 1.6 };
    const copie = JSON.parse(JSON.stringify(vp));
    const { position, cible } = cameraDepuisPointDeVue(vp, { x: 100, y: 50 });
    // Le terrain monte a 3 m sous le point de vue : a 1,60 m, l'oeil etait enterre.
    const butte: SolSous = () => 3;
    const r = auDessusDuSol(position, cible, butte)!;
    expect(r.camera.y).toBeGreaterThanOrEqual(3 + MARGE_SOL_CAMERA_M - 1e-9);
    expect(r.cible.y).toBeGreaterThanOrEqual(3);
    expect(vp).toEqual(copie);
  });
});

/** Une orbite et une camera de test, au plus pres de three.js (position, set, lookAt, evenement change). */
function fausseScene(cam: Pt3, cible: Pt3) {
  const vec = (p: Pt3) => ({ ...p, set(x: number, y: number, z: number) { this.x = x; this.y = y; this.z = z; return this; } });
  const parType = new Map<string, Set<() => void>>();
  const ecouteurs = { get size() { return [...parType.values()].reduce((n, e) => n + e.size, 0); } };
  let vise: Pt3 | null = null;
  const camera = { position: vec(cam), lookAt(v: Pt3) { vise = { x: v.x, y: v.y, z: v.z }; } };
  const jouer = (t: string) => { for (const f of parType.get(t) ?? []) f(); };
  const orbite = {
    target: vec(cible),
    addEventListener(t: 'change' | 'start' | 'end', f: () => void) { if (!parType.has(t)) parType.set(t, new Set()); parType.get(t)!.add(f); },
    removeEventListener(t: 'change' | 'start' | 'end', f: () => void) { parType.get(t)?.delete(f); },
    changer() { jouer('change'); },
    commencer() { jouer('start'); },
    finir() { jouer('end'); },
  };
  return { camera, orbite, vise: () => vise, ecouteurs };
}

describe('tenirAuDessusDuSol', () => {
  it('remonte tout de suite une camera posee sous le sol, puis apres chaque mouvement', () => {
    const s = fausseScene({ x: 10, y: -3, z: 0 }, { x: 0, y: 0, z: 0 });
    const debrancher = tenirAuDessusDuSol(s.camera, s.orbite, plat);
    expect(s.camera.position.y).toBeCloseTo(MARGE_SOL_CAMERA_M, 9);
    expect(s.vise()).toEqual({ x: 0, y: 0, z: 0 });
    // Un deplacement qui descend tout sous le sol.
    s.camera.position.set(4, -1, 4); s.orbite.target.set(0, -5, 0);
    s.orbite.changer();
    expect(s.orbite.target.y).toBe(0);
    expect(s.camera.position.y).toBeCloseTo(4, 9);
    debrancher();
    expect(s.ecouteurs.size).toBe(0);
  });
});

describe('solDepuisSommets', () => {
  it('lit la hauteur d\'un maillage en grille, et le plan hors de lui', () => {
    const sommets: number[] = [];
    for (let i = 0; i <= 20; i++) for (let j = 0; j <= 20; j++) sommets.push(i, 0.1 * i, j);
    const sol = solDepuisSommets(sommets);
    expect(sol(10.2, 5)).toBeGreaterThan(0.9);
    expect(sol(10.2, 5)).toBeLessThan(1.2);
    expect(sol(-5, 5)).toBe(0);
    expect(solDepuisSommets([])(1, 1)).toBe(0);
  });
});

describe('la vue libre (audit UX de la 5.45.0, constat 6)', () => {
  const incl = (c: Pt3, t: Pt3) => (Math.asin((c.y - t.y) / dist(c, t)) * 180) / Math.PI;

  it('ramene le regard a 10° sous l horizon, 2 m de la cible et l oeil a 1,50 m du sol', () => {
    const cible = { x: 0, y: 0, z: 0 };
    // Un glisser vers le bas : le regard a l'horizontale, 27,5 m devant.
    const r = dansLaVueLibreRamenee({ x: 27.5, y: 0.94, z: 0 }, cible, plat)!;
    expect(incl(r.camera, cible)).toBeCloseTo(VUE_LIBRE.inclinaisonMinDeg, 6);
    expect(dist(r.camera, cible)).toBeCloseTo(dist({ x: 27.5, y: 0.94, z: 0 }, cible), 6);
    // Quatre pincements : la camera a 0,30 m de la cible, reportee a 2 m.
    const p = dansLaVueLibreRamenee({ x: 0.25, y: 0.15, z: 0.1 }, cible, plat)!;
    expect(dist(p.camera, cible)).toBeGreaterThanOrEqual(VUE_LIBRE.distanceMinM - 1e-9);
    expect(p.camera.y).toBeGreaterThanOrEqual(VUE_LIBRE.hauteurOeilM - 1e-9);
    expect(dansLaVueLibre(p.camera, p.cible, plat)).toBe(true);
    // Deja dans la vue libre : rien ne bouge.
    expect(dansLaVueLibreRamenee({ x: 20, y: 15, z: 5 }, cible, plat)).toBeNull();
  });

  it('tient un geste parti d une vue d ensemble, pas une camera posee plus bas par un mode', () => {
    const s = fausseScene({ x: 20, y: 20, z: 0 }, { x: 0, y: 0, z: 0 });
    tenirAuDessusDuSol(s.camera, s.orbite, plat);
    // Un glisser vers le bas, parti de la vue d'ensemble.
    s.orbite.commencer();
    s.camera.position.set(28, 0.9, 0); s.orbite.changer();
    expect(incl(s.camera.position, s.orbite.target)).toBeCloseTo(10, 6);
    s.orbite.finir();
    // La hauteur des yeux pose la camera a 1,60 m, le regard a l'horizontale : rien ne la reprend.
    s.camera.position.set(6, 1.6, 0); s.orbite.target.set(0, 1.6, 0); s.orbite.changer();
    expect(s.camera.position.y).toBeCloseTo(1.6, 9);
    // Un geste qui en part garde la seule regle des 0,30 m.
    s.orbite.commencer();
    s.camera.position.set(6, 0.5, 0); s.orbite.changer();
    expect(s.camera.position.y).toBeCloseTo(0.5, 9);
    s.orbite.finir();
  });

  it('tient aussi la molette, les boutons et les quarts de tour de Plan (geste3d)', () => {
    const s = fausseScene({ x: 6, y: 6, z: 0 }, { x: 0, y: 0, z: 0 });
    tenirAuDessusDuSol(s.camera, s.orbite, plat);
    geste3d(s.camera.position, s.orbite.target, () => { s.camera.position.set(0.3, 0.3, 0); s.orbite.changer(); });
    expect(dist(s.camera.position, s.orbite.target)).toBeGreaterThanOrEqual(2 - 1e-9);
    // Hors d'un geste, un point de vue pose bas n'est pas repris (seulement au-dessus de 0,30 m).
    s.camera.position.set(1, 0.4, 0); s.orbite.changer();
    expect(s.camera.position.y).toBeCloseTo(0.4, 9);
  });
});

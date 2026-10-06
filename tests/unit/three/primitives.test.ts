import { describe, it, expect, beforeAll } from 'vitest';
import * as THREE_NS from 'three';
import { creerPrimitives, versLocalDepuis, courbePolyligne, ribbonChemin, cerclePoly, urlTexture, appliquerOpacite, poserEnCouche, COUCHES_SOL } from '../../../src/three/primitives.js';
import { reglerSoleil, libelleSoleil, SOLEIL_ELEV_PLANCHER } from '../../../src/three/lumiere.js';
import { cameraDepuisPointDeVue } from '../../../src/three/navigation.js';

// Les briques de la 3D (three/) : three.js r128 y est pose sur le global `THREE`, comme le fait le
// CDN dans la page (three/global.d.ts) ; la devDependency `three` sert aux tests seulement.

beforeAll(() => { Object.assign(globalThis, { THREE: THREE_NS }); });

const carre = [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 3 }, { x: 0, y: 3 }];

describe('reperes et traces', () => {
  it('pose le plan (Est, Nord) sur (X, -Z), centre sur le centroide', () => {
    const local = versLocalDepuis({ x: 2, y: 1 });
    expect(local({ x: 5, y: 4 })).toEqual({ x: 3, z: -3 });
  });

  it('lisse une polyligne seulement si on le demande et qu elle a trois points', () => {
    expect(courbePolyligne(carre, false)).toEqual(carre);
    expect(courbePolyligne(carre.slice(0, 2), true)).toHaveLength(2);
    const c = courbePolyligne(carre, true, 4);
    expect(c).toHaveLength(1 + 3 * 4);
    expect(c[0]).toEqual(carre[0]);
    expect(c.at(-1)).toEqual(carre.at(-1));
  });

  it('elargit un chemin en ruban de sa largeur, deux bords par point', () => {
    expect(ribbonChemin([{ x: 0, y: 0 }], 1)).toBeNull();
    expect(ribbonChemin([{ x: 0, y: 0 }, { x: 4, y: 0 }], 0)).toBeNull();
    const r = ribbonChemin([{ x: 0, y: 0 }, { x: 4, y: 0 }], 2);
    expect(r).toEqual([{ x: 0, y: 1 }, { x: 4, y: 1 }, { x: 4, y: -1 }, { x: 0, y: -1 }]);
  });

  it('approche un cercle par un polygone regulier', () => {
    const p = cerclePoly({ x: 1, y: 1 }, 2, 4);
    expect(p).toHaveLength(4);
    expect(p[0]?.x).toBeCloseTo(3); expect(p[1]?.y).toBeCloseTo(3);
  });
});

describe('materiaux', () => {
  it('lit l URL d une texture, ou rien', () => {
    expect(urlTexture({ url: 'a.jpg' })).toBe('a.jpg');
    expect(urlTexture(null)).toBeUndefined();
  });

  it('rend translucide un objet qui l est dans le plan, jamais sous 0,15', () => {
    const m = new THREE_NS.MeshLambertMaterial();
    appliquerOpacite(m, 0.05);
    expect([m.transparent, m.opacity]).toEqual([true, 0.15]);
    const plein = new THREE_NS.MeshLambertMaterial();
    appliquerOpacite(plein, 1);
    expect(plein.transparent).toBe(false);
  });

  it('range un materiau dans sa couche de sol', () => {
    const m = new THREE_NS.MeshBasicMaterial();
    poserEnCouche(m, COUCHES_SOL.chemin);
    expect([m.polygonOffset, m.polygonOffsetFactor, m.polygonOffsetUnits]).toEqual([true, -3, -12]);
  });
});

describe('creerPrimitives', () => {
  const monter = () => {
    const scene = new THREE_NS.Scene();
    const p = creerPrimitives({ scene, versLocal: versLocalDepuis({ x: 0, y: 0 }), chargerTexture: () => new THREE_NS.Texture() });
    return { scene, p };
  };

  it('extrude une emprise en prisme, pose a sa base ; rien sous trois points ou sans hauteur', () => {
    const { scene, p } = monter();
    p.addPrism(carre.slice(0, 2), 0, 1, '#888');
    p.addPrism(carre, 0, 0, '#888');
    expect(scene.children).toHaveLength(0);
    p.addPrism(carre, 0.5, 2, '#888');
    const mesh = scene.children[0] as THREE_NS.Mesh;
    mesh.geometry.computeBoundingBox();
    const b = mesh.geometry.boundingBox!.clone().applyMatrix4(mesh.matrixWorld.copy(mesh.matrix.compose(mesh.position, mesh.quaternion, mesh.scale)));
    expect(b.max.y - b.min.y).toBeCloseTo(2);
    expect(b.min.y).toBeCloseTo(0.5);
  });

  it('perce un prisme de ses trous : le dessus n\'en couvre plus la surface', () => {
    // L'aire du capuchon du haut (triangles horizontaux tournes vers le ciel), quel que soit le sens
    // dans lequel le trou est donne.
    const aireDessus = (mesh: THREE_NS.Mesh) => {
      const pos = mesh.geometry.getAttribute('position');
      let aire = 0;
      for (let i = 0; i < pos.count; i += 3) {
        const [a, b, c] = [0, 1, 2].map(k => new THREE_NS.Vector3().fromBufferAttribute(pos, i + k));
        const n = new THREE_NS.Vector3().crossVectors(b!.clone().sub(a!), c!.clone().sub(a!));
        if (n.y > 1e-9 && a!.y > 0.5) aire += n.length() / 2;
      }
      return aire;
    };
    const trou = [{ x: 1, y: 1 }, { x: 2, y: 1 }, { x: 2, y: 2 }, { x: 1, y: 2 }];
    const { scene, p } = monter();
    p.addPrism(carre, 0, 1, '#888');
    p.addPrism(carre, 0, 1, '#888', false, undefined, null, [trou]);
    p.addPrism(carre, 0, 1, '#888', false, undefined, null, [trou.slice().reverse()]);
    const [plein, perce, inverse] = scene.children as THREE_NS.Mesh[];
    expect(aireDessus(plein!)).toBeCloseTo(12);
    expect(aireDessus(perce!)).toBeCloseTo(11);
    expect(aireDessus(inverse!)).toBeCloseTo(11);
  });

  it('dessine en filaire les seules aretes de silhouette, en transparence un objet translucide', () => {
    const { scene, p } = monter();
    p.addPrism(carre, 0, 1, '#888', true);
    expect(scene.children[0]?.type).toBe('LineSegments');
    p.addPrism(carre, 0, 1, '#888', false, 0.5);
    const mat = (scene.children[1] as THREE_NS.Mesh).material as THREE_NS.Material;
    expect([mat.transparent, mat.opacity]).toEqual([true, 0.5]);
    // Avec des textures : un materiau pour le dessus, un pour les faces.
    p.addPrism(carre, 0, 1, '#888', false, undefined, { horizontale: { url: 'h.jpg' }, vertical: { url: 'v.jpg' } });
    expect(((scene.children[2] as THREE_NS.Mesh).material as THREE_NS.Material[])).toHaveLength(2);
  });

  it('pose un contour au sol, ferme en reprenant son premier point', () => {
    const { scene, p } = monter();
    p.addGroundOutline(carre, '#000', true);
    p.addGroundOutline(carre, '#000', false);
    p.addGroundOutline([{ x: 0, y: 0 }], '#000');
    const sommets = scene.children.map((c) => ((c as THREE_NS.Line).geometry.getAttribute('position')).count);
    expect(sommets).toEqual([5, 4]);
  });
});

describe('lumiere du soleil', () => {
  const lumiere = () => ({ dirLight: new THREE_NS.DirectionalLight(), dirFill: new THREE_NS.DirectionalLight(), hemiLight: new THREE_NS.HemisphereLight(), rayon: 10 });
  const rennes = { latitude: 48.11, longitude: -1.68 };

  it('eclaire en plein jour, au sud a midi solaire, et allume l appoint sur demande', () => {
    const l = lumiere();
    const s = reglerSoleil(l, { dateStr: '2026-06-21', minutes: 14 * 60, intensiteSoleil: 1, lumiereAppoint: true }, rennes)!;
    expect(s.elevRad).toBeGreaterThan(1);
    expect(l.dirLight.intensity).toBeCloseTo(0.75);
    expect(l.dirLight.position.z).toBeGreaterThan(0);
    expect([l.dirFill.visible, l.hemiLight.visible]).toEqual([true, true]);
  });

  it('eteint le soleil la nuit sans le faire passer sous l horizon', () => {
    const l = lumiere();
    const s = reglerSoleil(l, { dateStr: '2026-12-21', minutes: 2 * 60, intensiteSoleil: 1, lumiereAppoint: false }, rennes)!;
    expect(s.elevRad).toBeLessThan(0);
    expect(l.dirLight.intensity).toBe(0);
    expect(l.dirLight.position.y).toBeCloseTo(Math.sin(SOLEIL_ELEV_PLANCHER) * 10 * Math.hypot(2, 3, 1.2));
    expect(l.hemiLight.visible).toBe(false);
  });

  it('ne fait rien sur une date illisible', () => {
    expect(reglerSoleil(lumiere(), { dateStr: 'pas une date', minutes: 0, intensiteSoleil: 1, lumiereAppoint: false }, rennes)).toBeNull();
  });

  it('dit d ou vient le soleil, ou qu il est couche', () => {
    expect(libelleSoleil(Math.PI / 6, Math.PI)).toBe('↑ 30° — vient du S (180°)');
    expect(libelleSoleil(-0.1, 0)).toBe('🌙 soleil couché');
  });
});

describe('point de vue', () => {
  it('place la camera a son altitude, regardant dans la direction de ses deux points', () => {
    const c = cameraDepuisPointDeVue({ pts: [{ x: 2, y: 3 }, { x: 2, y: 5 }], altitude: 1.8 } as never, { x: 0, y: 0 });
    expect(c.position).toEqual({ x: 2, y: 1.8, z: -3 });
    expect(c.cible.x).toBeCloseTo(2); expect(c.cible.z).toBeCloseTo(-4.5);
  });
});

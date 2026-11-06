import { describe, it, expect, beforeAll } from 'vitest';
import * as THREE_NS from 'three';
import { estCache } from '../../../src/three/occultation.js';

// Une poignee derriere le toit (audit de la camera, 6 novembre 2026) : le rayon de l'oeil vers elle rencontre une surface du batiment.

beforeAll(() => { (globalThis as unknown as { THREE: unknown }).THREE = THREE_NS; });

function scene() {
  // Un cube de 4 m centre a l'origine ; la camera a +z, regardant l'origine.
  const cube = new THREE_NS.Mesh(new THREE_NS.BoxGeometry(4, 4, 4), new THREE_NS.MeshBasicMaterial());
  cube.updateMatrixWorld(true);
  const camera = new THREE_NS.PerspectiveCamera(45, 1, 0.1, 1000);
  camera.position.set(0, 0, 20);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld(true);
  return { cube, camera, rayon: new THREE_NS.Raycaster() };
}

describe('une poignee cachee par le batiment', () => {
  it('le coin de devant est vu ; celui de derriere est cache ; sans racines, rien ne cache', () => {
    const { cube, camera, rayon } = scene();
    expect(estCache(camera, [cube], { x: 2, y: 2, z: 2 }, rayon)).toBe(false);
    expect(estCache(camera, [cube], { x: 0, y: 0, z: -2 }, rayon)).toBe(true);
    expect(estCache(camera, [], { x: 0, y: 0, z: -2 }, rayon)).toBe(false);
  });

  it('un objet masque ne cache rien', () => {
    const { cube, camera, rayon } = scene();
    cube.visible = false;
    expect(estCache(camera, [cube], { x: 0, y: 0, z: -2 }, rayon)).toBe(false);
  });
});

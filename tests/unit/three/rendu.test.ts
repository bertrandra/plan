import { describe, it, expect, beforeAll } from 'vitest';
import * as THREE_NS from 'three';
import { couleursDuCiel, cadreOmbres, installerCourbeDeFilm, poserCiel, accorderCiel, poserBrume } from '../../../src/three/rendu.js';
import { HORS_EXPORT } from '../../../src/three/primitives.js';

beforeAll(() => {
  // Une copie de ShaderChunk : la courbe ne doit pas fuir dans les autres tests.
  Object.assign(globalThis, { THREE: { ...THREE_NS, ShaderChunk: { ...THREE_NS.ShaderChunk } } });
});

const deg = (d: number) => d * Math.PI / 180;

describe('rendu photographique de la Vue 3D', () => {
  it('remplace la courbe sur mesure de three.js, une fois, sans toucher aux autres', () => {
    const chunk = (THREE as unknown as { ShaderChunk: Record<string, string> }).ShaderChunk;
    const avant = chunk.tonemapping_pars_fragment;
    installerCourbeDeFilm();
    const apres = chunk.tonemapping_pars_fragment ?? '';
    expect(apres).not.toBe(avant);
    expect(apres).toContain('ACESFilmicToneMapping( lineaire )');
    expect(apres.match(/vec3 CustomToneMapping/g)).toHaveLength(1);
    expect(apres).toContain('vec3 ACESFilmicToneMapping( vec3 color )');
    installerCourbeDeFilm();
    expect(chunk.tonemapping_pars_fragment).toBe(apres);
  });

  it('le ciel passe du jour au couchant puis a la nuit, sans saut', () => {
    expect(couleursDuCiel(deg(45))).toEqual(couleursDuCiel(deg(30)));
    const jour = couleursDuCiel(deg(45)), couchant = couleursDuCiel(deg(0)), nuit = couleursDuCiel(deg(-20));
    const r = (c: number) => (c >> 16) & 0xff, b = (c: number) => c & 0xff;
    // L'horizon rougit au couchant, le zenith s'assombrit la nuit.
    expect(r(couchant.horizon)).toBeGreaterThan(b(couchant.horizon));
    expect(b(jour.horizon)).toBeGreaterThan(r(jour.horizon) - 10);
    expect(b(nuit.zenith)).toBeLessThan(b(jour.zenith) / 2);
    expect(nuit.forceLueur).toBe(0);
    // Continuite : deux hauteurs voisines donnent des couleurs voisines.
    for (let d = -10; d < 25; d += 0.5) {
      const a = couleursDuCiel(deg(d)), c = couleursDuCiel(deg(d + 0.5));
      for (const k of ['zenith', 'horizon'] as const) {
        for (const s of [16, 8, 0]) expect(Math.abs(((a[k] >> s) & 0xff) - ((c[k] >> s) & 0xff))).toBeLessThanOrEqual(20);
      }
    }
  });

  it('resserre le cadre des ombres sur la parcelle, jamais au-dela de l ancien', () => {
    expect(cadreOmbres(null, 100)).toBe(180);
    expect(cadreOmbres(20, 100)).toBe(40);
    expect(cadreOmbres(5, 100)).toBe(20);
    expect(cadreOmbres(500, 100)).toBe(180);
  });

  it('le ciel suit le soleil, reste hors export et transparent aux rayons', () => {
    const scene = new THREE_NS.Scene();
    scene.background = new THREE_NS.Color(0xffffff);
    poserBrume(scene, 30, 2000);
    const ciel = poserCiel(scene, 1000);
    expect(ciel.userData[HORS_EXPORT]).toBe(true);
    const touches: unknown[] = [];
    ciel.raycast(new THREE_NS.Raycaster(), touches as never);
    expect(touches).toHaveLength(0);
    const c = accorderCiel(scene, { elevRad: deg(2), azRad: deg(270) });
    expect(c).not.toBeNull();
    const fog = scene.fog as THREE_NS.Fog;
    expect(fog.color.getHex()).toBe(c?.horizon);
    expect((scene.background as THREE_NS.Color).getHex()).toBe(c?.horizon);
    expect(fog.near).toBeGreaterThanOrEqual(150);
    // Le soleil a l'ouest (azimut 270°) : la lueur est cote -X.
    const soleil = ((ciel.material as THREE_NS.ShaderMaterial).uniforms as { soleil: { value: THREE_NS.Vector3 } }).soleil.value;
    expect(soleil.x).toBeLessThan(-0.9);
  });
});

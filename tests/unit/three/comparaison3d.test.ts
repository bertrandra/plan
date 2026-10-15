import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE_NS from 'three';
import {
  zoneLibre, decouperEnDeux, aRedessiner, rendreEnDeux, activerDeuxVues, couperDeuxVues, cadrerDeuxVues, imageAttendue,
  sousLePointeur, COUCHE_AVANT, COUCHE_APRES, ECART_VUES_PX, DELAI_REPOS_MS, type DeuxVues
} from '../../../src/three/comparaison3d.js';
import { affichage3d, rendre3d, type SceneTroisBase } from '../../../src/three/etat3d.js';

// L'avant et l'apres d'un audit en deux vues de la Vue 3D (three/comparaison3d.ts) : une seule
// camera rendue deux fois, dans deux rectangles qui evitent l'ecran des propositions. On verifie la
// decoupe, la synchronisation (les deux vues voient exactement la meme camera, qu'on la tourne ou
// non), les couches de chaque cote et le rendu a la demande, sans WebGL.

/** Un canevas de L x H pixels CSS, pose en (0, 0) de la fenetre. */
const canevas = (L: number, H: number) => ({ clientWidth: L, clientHeight: H, getBoundingClientRect: () => ({ left: 0, top: 0, right: L, bottom: H, width: L, height: H }) });

/** Ce que voit chaque appel de `render` : la camera telle qu'elle est a cet instant, et le rectangle. */
interface Image { pos: number[]; quat: number[]; fov: number; forme: number; couches: number; viewport: number[] }

function fausseScene(L = 1000, H = 600) {
  const camera = new THREE_NS.PerspectiveCamera(50, L / H, 0.1, 1000);
  camera.position.set(10, 8, 10);
  camera.lookAt(0, 0, 0);
  const scene = new THREE_NS.Scene();
  scene.background = new THREE_NS.Color(0xdfe7ea);
  const images: Image[] = [];
  let viewport = [0, 0, L, H];
  const effacements: number[] = [];
  let couleur = new THREE_NS.Color(0x000000);
  const renderer = {
    domElement: canevas(L, H),
    setScissorTest: () => {}, setScissor: () => {},
    setViewport: (x: number, y: number, l: number, h: number) => { viewport = [x, y, l, h]; },
    getClearColor: (c: THREE_NS.Color) => c.copy(couleur), getClearAlpha: () => 1,
    setClearColor: (c: THREE_NS.Color) => { couleur = new THREE_NS.Color(c); },
    clear: () => { effacements.push(couleur.getHex()); },
    render: (_s: unknown, c: THREE_NS.PerspectiveCamera) => {
      images.push({ pos: c.position.toArray(), quat: c.quaternion.toArray(), fov: c.fov, forme: c.aspect, couches: c.layers.mask, viewport: [...viewport] });
    },
  };
  const sc = { renderer, scene, camera, controls: {}, raf: null } as unknown as SceneTroisBase;
  return { sc, camera, images, effacements, couleur: () => couleur };
}

const masque = (...couches: number[]) => couches.reduce((m, c) => m | (1 << c), 0);

beforeEach(() => { couperDeuxVues(null); cadrerDeuxVues(null, null); });

describe('la zone que l ecran des propositions laisse libre', () => {
  const ecran = { left: 0, top: 0, right: 1000, bottom: 600 };
  it('est tout le canevas sans ecran, ou s il est ailleurs', () => {
    expect(zoneLibre(ecran, null)).toEqual({ x: 0, y: 0, l: 1000, h: 600 });
    expect(zoneLibre(ecran, { left: 1100, top: 0, right: 1300, bottom: 600 })).toEqual({ x: 0, y: 0, l: 1000, h: 600 });
  });
  it('est le bandeau au-dessus d un ecran pose en bas (telephone, tablette)', () => {
    expect(zoneLibre({ left: 0, top: 56, right: 390, bottom: 844 }, { left: 16, top: 480, right: 374, bottom: 832 })).toEqual({ x: 0, y: 0, l: 390, h: 424 });
  });
  it('est le bandeau a droite d un ecran range a gauche (grand ecran)', () => {
    expect(zoneLibre({ left: 34, top: 95, right: 1406, bottom: 783 }, { left: 16, top: 108, right: 416, bottom: 888 })).toEqual({ x: 382, y: 0, l: 990, h: 688 });
  });
});

describe('la decoupe en deux vues', () => {
  it('pose les vues cote a cote dans une zone large, « Avant » a gauche', () => {
    const v = decouperEnDeux({ x: 382, y: 0, l: 990, h: 688 });
    expect(v.sens).toBe('cote');
    expect(v.avant).toEqual({ x: 382, y: 0, l: 493, h: 688 });
    expect(v.apres).toEqual({ x: 382 + 990 - 493, y: 0, l: 493, h: 688 });
    expect(v.apres.x - (v.avant.x + v.avant.l)).toBe(ECART_VUES_PX);
  });
  it('garde le cote a cote quand la zone libre est presque un 4:3 (grand ecran, panneau a droite)', () => {
    // 914 x 688 : empiler (914 x 342) ou juxtaposer (455 x 688) s'ecartent a peu pres autant du 4:3 ;
    // deux vues cote a cote se comparent d'un regard.
    const v = decouperEnDeux({ x: 0, y: 0, l: 914, h: 688 });
    expect(v.sens).toBe('cote');
    expect(v.avant.l).toBe(455);
  });
  it('les empile au telephone, ou cote a cote chaque vue serait une meurtriere', () => {
    const v = decouperEnDeux({ x: 0, y: 0, l: 390, h: 424 });
    expect(v.sens).toBe('pile');
    expect(v.avant).toEqual({ x: 0, y: 0, l: 390, h: 210 });
    expect(v.apres).toEqual({ x: 0, y: 214, l: 390, h: 210 });
  });
  it('les met cote a cote sur une tablette en hauteur, au-dessus de l ecran', () => {
    expect(decouperEnDeux({ x: 0, y: 0, l: 820, h: 520 }).sens).toBe('cote');
  });
  it('donne toujours deux vues de meme taille, jamais vides', () => {
    for (const z of [{ x: 0, y: 0, l: 3, h: 2 }, { x: 5, y: 7, l: 1001, h: 333 }, { x: 0, y: 0, l: 200, h: 900 }]) {
      const v = decouperEnDeux(z);
      expect([v.avant.l, v.avant.h]).toEqual([v.apres.l, v.apres.h]);
      expect(v.avant.l).toBeGreaterThan(0);
      expect(v.avant.h).toBeGreaterThan(0);
    }
  });
});

describe('le rendu en deux vues', () => {
  it('montre aux deux vues la meme camera, a la forme de chacune, avec les couches de son cote', () => {
    const { sc, camera, images } = fausseScene();
    const vues = rendreEnDeux(sc);
    expect(images).toHaveLength(2);
    const [avant, apres] = images as [Image, Image];
    // La synchronisation : meme position, meme orientation, meme focale.
    expect(apres.pos).toEqual(avant.pos);
    expect(apres.quat).toEqual(avant.quat);
    expect(apres.fov).toBe(avant.fov);
    expect(avant.forme).toBeCloseTo(vues.avant.l / vues.avant.h, 9);
    expect(avant.couches).toBe(masque(0, COUCHE_AVANT));
    expect(apres.couches).toBe(masque(0, COUCHE_APRES));
    // Le viewport compte depuis le bas du canevas.
    expect(avant.viewport).toEqual([vues.avant.x, 600 - vues.avant.y - vues.avant.h, vues.avant.l, vues.avant.h]);
    // La camera est rendue telle qu'elle etait : forme du canevas, couche commune seule.
    expect(camera.aspect).toBeCloseTo(1000 / 600, 9);
    expect(camera.layers.mask).toBe(masque(0));
  });

  it('suit la camera ensemble : tourner l une tourne l autre', () => {
    const { sc, camera, images } = fausseScene();
    rendreEnDeux(sc);
    // Ce que fait un glisser dans l'une des vues : OrbitControls deplace la seule camera.
    camera.position.set(-6, 3, 12);
    camera.lookAt(0, 1, 0);
    rendreEnDeux(sc);
    const [, , avant, apres] = images as [Image, Image, Image, Image];
    expect(avant.pos).toEqual([-6, 3, 12]);
    expect(apres.pos).toEqual(avant.pos);
    expect(apres.quat).toEqual(avant.quat);
    expect(avant.pos).not.toEqual((images[0] as Image).pos);
  });

  it('efface le canevas au fond de la scene, puis rend la couleur d effacement d avant', () => {
    const { sc, effacements, couleur } = fausseScene();
    rendreEnDeux(sc);
    expect(effacements).toEqual([0xdfe7ea]);
    expect(couleur().getHex()).toBe(0x000000);
  });

  it('evite l ecran des propositions, et le dit aux etiquettes', () => {
    const { sc } = fausseScene(390, 788);
    activerDeuxVues(sc);
    cadrerDeuxVues({ left: 16, top: 430, right: 374, bottom: 776 }, sc);
    const v = affichage3d.comparaison as DeuxVues;
    expect(v.sens).toBe('pile');
    expect(v.apres.y + v.apres.h).toBeLessThanOrEqual(430);
    couperDeuxVues(sc);
    expect(affichage3d.comparaison).toBeNull();
  });

  it('passe par rendre3d tant qu il est pose, et la vue unique revient ensuite', () => {
    const { sc, camera, images } = fausseScene();
    activerDeuxVues(sc);
    rendre3d(sc);
    expect(images).toHaveLength(2);
    camera.aspect = 0.5;
    couperDeuxVues(sc);
    expect(sc.enDeux).toBeUndefined();
    expect(camera.aspect).toBeCloseTo(1000 / 600, 9);
    rendre3d(sc);
    expect(images).toHaveLength(3);
    expect((images[2] as Image).couches).toBe(masque(0));
  });
});

describe('le rendu a la demande', () => {
  it('redessine quand la camera bouge, ou de temps en temps, et pas autrement', () => {
    const pose = [1, 2, 3, 0, 0, 0, 1, 50, 1, 1000, 600];
    expect(aRedessiner(null, pose, 0)).toBe(true);
    expect(aRedessiner(pose, [...pose], 16)).toBe(false);
    expect(aRedessiner(pose, [1, 2, 3.01, 0, 0, 0, 1, 50, 1, 1000, 600], 16)).toBe(true);
    expect(aRedessiner(pose, [...pose], DELAI_REPOS_MS)).toBe(true);
    expect(aRedessiner(pose, [1, 2, 3, 0, 0, 0, 1, 50, 1, 999, 600], 16)).toBe(true);
  });

  it('ne retient pas la boucle d une vue unique', () => {
    const { sc, camera } = fausseScene();
    expect(imageAttendue(sc, 0)).toBe(true);
    activerDeuxVues(sc);
    rendreEnDeux(sc, 1000);
    expect(imageAttendue(sc, 1016)).toBe(false);
    camera.position.x += 1;
    expect(imageAttendue(sc, 1032)).toBe(true);
  });
});

describe('le pointeur en deux vues', () => {
  it('vise dans la vue sous le pointeur, la camera a sa forme le temps du calcul', () => {
    const { sc, camera } = fausseScene();
    activerDeuxVues(sc);
    const v = rendreEnDeux(sc);
    // Au milieu de la vue « Après » : le centre de son cadre.
    const vu = sousLePointeur(sc, v.apres.x + v.apres.l / 2, v.apres.y + v.apres.h / 2, (ndc) => ({ ndc, forme: camera.aspect }));
    expect(vu.ndc.x).toBeCloseTo(0, 9);
    expect(vu.ndc.y).toBeCloseTo(0, 9);
    expect(vu.forme).toBeCloseTo(v.apres.l / v.apres.h, 9);
    expect(camera.aspect).toBeCloseTo(1000 / 600, 9);
    // En vue unique, le canevas entier.
    couperDeuxVues(sc);
    expect(sousLePointeur(sc, 1000, 0, (ndc) => ndc)).toEqual({ x: 1, y: 1 });
  });
});

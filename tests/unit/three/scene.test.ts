// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from 'vitest';
import * as THREE_NS from 'three';

const bannieres: string[] = [];
vi.mock('../../../src/shell/dialogs.js', () => ({ showErrBanner: (m: string) => { bannieres.push(m); }, showToast: () => {} }));

import { buildThreeScene, remplacerObjets3d, comparerObjets3d, epurerVue3d, visibilite3d, PART_CIEL_JOINTS, PART_CIEL_SOUS_PLATELAGE, DECALAGE_CHEMIN_M, type ContexteScene3d } from '../../../src/three/scene.js';
import { HORS_EXPORT, EXPORT_SEULEMENT } from '../../../src/three/primitives.js';
import { pointInPolygon } from '../../../src/geometry/basic.js';
import { polygonOffset } from '../../../src/geometry/polygon.js';
import { vue3d, hotes3d, rendre3d } from '../../../src/three/etat3d.js';
import { COUCHE_APRES, COUCHE_AVANT } from '../../../src/three/comparaison3d.js';
import { normaliserEnObjetsDuPlan } from '../../../src/app/assemblage/formes.js';
import { DEMO_OBJECTS } from '../../../src/model/demo.js';
import type { ObjetPlan, Relief } from '../../../src/model/types.js';

// La construction de la Vue 3D (three/scene.ts) sur le plan de demonstration, avec le vrai three.js
// r128. Seuls le rendu WebGL et les controles d'orbite, qu'un environnement sans carte graphique ne
// fournit pas, sont remplaces par des doublures.

let contextePerdu = false;
class FauxRendu {
  domElement = document.createElement('canvas');
  shadowMap = { enabled: false, type: 0 };
  render = vi.fn();
  // Le rendu en deux vues (three/comparaison3d.ts) decoupe le canevas : viewport, scissor, effacement.
  setScissorTest() {}
  setScissor() {}
  setViewport() {}
  getClearColor(c: THREE_NS.Color) { return c; }
  getClearAlpha() { return 1; }
  setClearColor() {}
  clear() {}
  getContext() { return { isContextLost: () => contextePerdu }; }
  setSize() {}
  setPixelRatio() {}
  dispose() {}
}
class FauxControles {
  target = new THREE_NS.Vector3();
  update() {}
}

beforeAll(() => {
  Object.assign(globalThis, { THREE: { ...THREE_NS, WebGLRenderer: FauxRendu, OrbitControls: FauxControles } });
  vi.stubGlobal('requestAnimationFrame', () => 0);
  // Les textures de toiture se dessinent sur un canevas 2D, que jsdom n'a pas : sans contexte, le
  // code s'en passe (three/couverture.ts). On le dit explicitement, plutot que de laisser jsdom crier.
  HTMLCanvasElement.prototype.getContext = (() => null) as never;
});

function contexte(plus: Partial<ContexteScene3d> = {}): ContexteScene3d {
  return {
    trouverParcelleCloture: () => null, hauteurAppuiMm: () => 400, elevationOf: (o) => (o as { elevation?: number }).elevation ?? 0,
    objetMasque: (o) => !!o.hidden, positionMat: (p) => (p as unknown as { center: { x: number; y: number } }).center,
    orthoActif: () => false, orthoTuiles: () => [], chargerTexturePolyhaven: () => new THREE_NS.Texture(),
    disposeThreeScene: () => { vue3d.scene = null; }, appliquerLumiereVue3d: vi.fn(), applyMode3D: vi.fn(), syncControlesSoleilVue3d: vi.fn(),
    ...plus
  };
}

let objets: ObjetPlan[];
const terrasse = () => objets.find((o) => o.key === 'terrasse') ?? null;
const etat = (isolement: string | null = null) => ({ objects: objets, terrasseSelectedKey: 'terrasse', isolement });
const maillages = () => { let n = 0; vue3d.scene?.scene.traverse((o) => { if ((o as THREE_NS.Mesh).isMesh || (o as THREE_NS.Line).isLine) n++; }); return n; };
const attendre = () => new Promise((ok) => setTimeout(ok, 5));

beforeEach(() => {
  objets = normaliserEnObjetsDuPlan(JSON.parse(JSON.stringify(DEMO_OBJECTS)));
  document.body.innerHTML = '<div id="hote"></div>';
  hotes3d.vue3d = document.getElementById('hote');
  vue3d.scene = null; vue3d.dernierObjKey = null; vue3d.tousLesObjets = true;
  bannieres.length = 0; contextePerdu = false;
});

describe('buildThreeScene', () => {
  it('monte la scene dans son hote, pose les lumieres et rend une premiere image', () => {
    const ctx = contexte();
    buildThreeScene(terrasse(), etat(), ctx);
    expect(vue3d.scene).not.toBeNull();
    expect(hotes3d.vue3d?.querySelector('canvas')).not.toBeNull();
    expect(ctx.applyMode3D).toHaveBeenCalledTimes(1);
    expect(ctx.appliquerLumiereVue3d).toHaveBeenCalledTimes(1);
    expect(vue3d.dernierObjKey).toBeTruthy();
  });

  it('modelise les objets du plan, puis la structure de la terrasse apres la premiere image', async () => {
    buildThreeScene(terrasse(), etat(), contexte());
    const avant = maillages();
    expect(avant).toBeGreaterThan(10);
    await attendre();
    expect(maillages()).toBeGreaterThan(avant);
  });

  it('remplace un batiment relu sans rebatir la scene, et dit quand la scene a change', () => {
    buildThreeScene(terrasse(), etat(), contexte());
    const scene = vue3d.scene;
    const b = objets.find((o) => o.fonction === 'batiment' && !o.hidden)!;
    const avant = maillages();
    // Le batiment perd son toit : sa nouvelle pose remplace l'ancienne, rien ne s'ajoute a cote.
    const enMoins = (() => { delete (b as { toit?: unknown }).toit; return b; })();
    expect(remplacerObjets3d([enMoins.key], etat())).toBe(true);
    expect(vue3d.scene).toBe(scene);
    const apres = maillages();
    expect(apres).toBeLessThanOrEqual(avant);
    // Rejouer le meme remplacement ne fait rien grossir : les anciens maillages partent bien.
    expect(remplacerObjets3d([b.key], etat())).toBe(true);
    expect(maillages()).toBe(apres);
    // Un batiment supprime du plan disparait de la scene.
    objets = objets.filter((o) => o !== b);
    expect(remplacerObjets3d([b.key], etat())).toBe(true);
    expect(maillages()).toBeLessThan(apres);
    // Une scene jetee : a l'appelant de rebatir.
    vue3d.scene = null;
    expect(remplacerObjets3d([b.key], etat())).toBe(false);
  });

  it('peint un batiment de la couleur de diagnostic, murs et toit', () => {
    const couleurs = new Set<string>();
    buildThreeScene(terrasse(), etat(), contexte({ couleurDiagnostic: (o) => (o.fonction === 'batiment' ? '#d7263d' : null) }));
    vue3d.scene?.scene.traverse((o) => { const m = (o as THREE_NS.Mesh).material as THREE_NS.MeshStandardMaterial | undefined; if (m && 'color' in m && m.color) couleurs.add('#' + m.color.getHexString()); });
    expect(couleurs.has('#d7263d')).toBe(true);
  });

  it('ne montre que la terrasse quand « tous les objets » est decoche', () => {
    buildThreeScene(terrasse(), etat(), contexte());
    const tous = maillages();
    vue3d.tousLesObjets = false;
    buildThreeScene(terrasse(), etat(), contexte());
    expect(maillages()).toBeLessThan(tous);
  });

  it('garde la camera quand on reconstruit la meme terrasse', () => {
    buildThreeScene(terrasse(), etat(), contexte());
    vue3d.scene!.camera.position.set(1, 2, 3);
    buildThreeScene(terrasse(), etat(), contexte());
    expect(vue3d.scene!.camera.position.toArray()).toEqual([1, 2, 3]);
  });

  it('s ouvre aussi sur un plan sans terrasse', () => {
    buildThreeScene(null, { objects: objets, terrasseSelectedKey: null }, contexte());
    expect(maillages()).toBeGreaterThan(0);
  });

  it('ne fait rien sans hote, et le dit quand le navigateur refuse le contexte 3D', () => {
    hotes3d.vue3d = null;
    buildThreeScene(terrasse(), etat(), contexte());
    expect(vue3d.scene).toBeNull();
    hotes3d.vue3d = document.getElementById('hote');
    contextePerdu = true;
    buildThreeScene(terrasse(), etat(), contexte());
    expect(vue3d.scene).toBeNull();
    expect(bannieres[0]).toMatch(/contexte 3D/);
  });
});

describe('l avant et l apres d un audit en deux vues', () => {
  /** Les maillages de la scene rangés sur exactement ces couches (masque de bits). */
  const surCouches = (m: number) => { let n = 0; vue3d.scene?.scene.traverse((o) => { if (((o as THREE_NS.Mesh).isMesh || (o as THREE_NS.Line).isLine) && o.layers.mask === m) n++; }); return n; };
  const AVANT = 1 << COUCHE_AVANT, APRES = 1 << COUCHE_APRES;

  it('pose les copies sur la couche « Après », le plan touche sur « Avant », puis rend la scene telle quelle', () => {
    buildThreeScene(terrasse(), etat(), contexte());
    const sc = vue3d.scene!;
    const total = maillages();
    const maison = objets.find((o) => o.key === 'maison')!;
    const copie = { ...maison, elevation: 9 } as ObjetPlan;
    const plan = JSON.stringify(objets);
    expect(comparerObjets3d({ cles: ['maison'], etat: { ...etat(), objects: objets.map((o) => (o === maison ? copie : o)) }, parcelle: null })).toBe(true);
    expect(vue3d.scene).toBe(sc);
    expect(sc.enDeux).toBeTypeOf('function');
    expect(surCouches(AVANT)).toBeGreaterThan(0);
    expect(surCouches(APRES)).toBeGreaterThan(0);
    // Le reste de la scene est commun aux deux vues ; le plan n'est pas touche.
    expect(surCouches(1)).toBe(total - surCouches(AVANT));
    expect(JSON.stringify(objets)).toBe(plan);
    // Chaque image rend les deux vues, chacune avec ses couches.
    const rendu = sc.renderer.render as unknown as ReturnType<typeof vi.fn>;
    rendu.mockClear();
    const couches: number[] = [];
    rendu.mockImplementation((_s: unknown, c: THREE_NS.Camera) => { couches.push(c.layers.mask); });
    rendre3d(sc);
    expect(couches).toEqual([1 | AVANT, 1 | APRES]);
    // Un nouvel appel remplace le precedent, rien ne s'accumule.
    const apresUn = maillages();
    comparerObjets3d({ cles: ['maison'], etat: { ...etat(), objects: objets.map((o) => (o === maison ? copie : o)) }, parcelle: null });
    expect(maillages()).toBe(apresUn);
    // La vue unique revient : copies retirees, plan sur la couche commune.
    expect(comparerObjets3d(null)).toBe(true);
    expect(sc.enDeux).toBeUndefined();
    expect(surCouches(AVANT) + surCouches(APRES)).toBe(0);
    expect(maillages()).toBe(total);
  });

  it('compare aussi la cloture de la parcelle, sur une copie', () => {
    const parcelle = objets.find((o) => o.key === 'parcelle')!;
    const ctx = contexte({ trouverParcelleCloture: () => parcelle });
    buildThreeScene(terrasse(), etat(), ctx);
    const copie = { ...parcelle, clotureHauteur: 1.2, cloture: null } as ObjetPlan;
    expect(comparerObjets3d({ cles: [], etat: etat(), parcelle: copie })).toBe(true);
    expect(surCouches(AVANT)).toBeGreaterThan(0);
    expect(surCouches(APRES)).toBeGreaterThan(0);
    comparerObjets3d(null);
    expect(surCouches(AVANT) + surCouches(APRES)).toBe(0);
  });

  it('meurt avec sa scene, et dit faux sans scene', () => {
    buildThreeScene(terrasse(), etat(), contexte());
    comparerObjets3d({ cles: ['maison'], etat: etat(), parcelle: null });
    buildThreeScene(terrasse(), etat(), contexte());
    expect(vue3d.scene?.enDeux).toBeUndefined();
    expect(surCouches(AVANT) + surCouches(APRES)).toBe(0);
    vue3d.scene = null;
    expect(comparerObjets3d({ cles: ['maison'], etat: etat(), parcelle: null })).toBe(false);
  });
});

describe('l empilement de la terrasse en 3D', () => {
  // Les lames sur la structure bois, la structure sur les appuis : le dessus des lames tombe a la
  // hauteur finie que donnent engine/hauteurs.ts, la coupe et le chiffrage. Sur plots en structure
  // simple, les lambourdes etaient dessinees sans hauteur et les lames posees sur les plots.
  const dessusDesLames = () => {
    let max = -Infinity;
    vue3d.scene?.scene.traverse((o) => {
      const m = o as THREE_NS.Mesh;
      if (m.isMesh && (m.material as THREE_NS.MeshStandardMaterial).color?.getHexString() === 'c9a15a') {
        m.updateMatrixWorld(true);
        max = Math.max(max, new THREE_NS.Box3().setFromObject(m).max.y);
      }
    });
    return max;
  };

  it('pose les lames a la hauteur finie, sur vis comme sur plots en structure simple', async () => {
    const { hauteurAppuiMm, hauteurFinieMm } = await import('../../../src/engine/hauteurs.js');
    const textures = vue3d.textures;
    for (const reglage of [{}, { typePose: 'plots', plotAvecSolives: false, avecLambourde: false, hauteurPlot: 10 }]) {
      objets = normaliserEnObjetsDuPlan(JSON.parse(JSON.stringify(DEMO_OBJECTS)));
      const t = terrasse()!;
      Object.assign(t.construction!, reglage);
      vue3d.scene = null; vue3d.dernierObjKey = null; vue3d.textures = false;
      buildThreeScene(t, etat(), contexte({ hauteurAppuiMm }));
      await attendre();
      expect(dessusDesLames()).toBeCloseTo(hauteurFinieMm(t) / 1000, 3);
    }
    vue3d.textures = textures;
  });
});

describe('le gazon de la parcelle du projet', () => {
  const gazon = () => { let m: THREE_NS.Mesh | null = null; vue3d.scene?.scene.traverse((o) => { if (o.name === 'gazon') m = o as THREE_NS.Mesh; }); return m as THREE_NS.Mesh | null; };

  it('couvre la parcelle par defaut, meme sous la photo aerienne, et pas les parcelles voisines', () => {
    buildThreeScene(terrasse(), etat(), contexte({ orthoActif: () => true, orthoTuiles: () => [] }));
    const g = gazon();
    expect(g).not.toBeNull();
    let n = 0; vue3d.scene?.scene.traverse((o) => { if (o.name === 'gazon') n++; });
    expect(n).toBe(1);
    expect((g!.material as THREE_NS.MeshStandardMaterial).vertexColors).toBe(true);
    // Il couvre la surface de la parcelle (716 m² au cadastre, 704 m² au plan recale).
    const pos = g!.geometry.getAttribute('position');
    let s = 0;
    for (let k = 0; k < pos.count; k += 3) {
      const ax = pos.getX(k + 1) - pos.getX(k), az = pos.getZ(k + 1) - pos.getZ(k), bx = pos.getX(k + 2) - pos.getX(k), bz = pos.getZ(k + 2) - pos.getZ(k);
      s += Math.abs(ax * bz - az * bx) / 2;
    }
    expect(s).toBeGreaterThan(650); expect(s).toBeLessThan(760);
  });

  it('epure la vue pour l audit, puis rend tout sans montrer ce que seul l export montre', () => {
    const parcelle = objets.find((o) => o.key === 'parcelle');
    buildThreeScene(terrasse(), etat(), contexte({ trouverParcelleCloture: () => parcelle }));
    const batiments = objets.filter((o) => o.fonction === 'batiment' && !o.hidden).map((o) => o.key);
    const garde = batiments[0]!;
    try {
      epurerVue3d((cle) => cle === garde || cle === 'parcelle');
      const v = visibilite3d();
      expect(v.visibles).toContain(garde);
      expect(v.masques.length).toBeGreaterThan(0);
      expect(v.masques).not.toContain(garde);
      expect(v.horsObjetsVisibles).toBe(0);
      // Une scene rebatie pendant l'audit s'epure de meme.
      buildThreeScene(terrasse(), etat(), contexte({ trouverParcelleCloture: () => parcelle }));
      expect(visibilite3d().masques.length).toBe(v.masques.length);
    } finally { epurerVue3d(null); }
    const rendue = visibilite3d();
    expect(rendue.masques).toEqual([]);
    expect(rendue.horsObjetsVisibles).toBeGreaterThan(0);
    // Le gazon entier de l'export reste cache : la fin de l'audit ne rend que ce qu'elle a masque.
    expect(gazon()!.visible).toBe(false);
  });

  it('a l ecran, l herbe s arrete aux objets qui occupent le sol ; le modele exporte garde le gazon entier', () => {
    buildThreeScene(terrasse(), etat(), contexte());
    // Le gazon d'avant, entier, ne part plus qu'avec l'export (empreinte golden inchangee).
    const modele = gazon()!;
    expect(modele.visible).toBe(false);
    expect(modele.userData[EXPORT_SEULEMENT]).toBe(true);
    let ecran: THREE_NS.Mesh | null = null;
    vue3d.scene?.scene.traverse((o) => { if (o.name === 'gazon-ecran') ecran = o as THREE_NS.Mesh; });
    const e = ecran as THREE_NS.Mesh | null;
    expect(e?.visible).toBe(true);
    expect(e?.userData[HORS_EXPORT]).toBe(true);
    // Aucun triangle de l'herbe a l'ecran dans la maison, la terrasse, l'abri ou la dalle (l'herbe
    // passe de quelques centimetres sous leur bord, pour qu'il la recouvre).
    const cen = vue3d.centre ?? { x: 0, y: 0 };
    const pos = e!.geometry.getAttribute('position');
    const occupes = ['maison', 'terrasse', 'abri', 'dalle'].map((k) => objets.find((o) => o.key === k)!).map((o) => polygonOffset((o as { pts: { x: number; y: number }[] }).pts, 0.05));
    let aireEcran = 0;
    for (let k = 0; k < pos.count; k += 3) {
      const c = { x: cen.x + (pos.getX(k) + pos.getX(k + 1) + pos.getX(k + 2)) / 3, y: cen.y - (pos.getZ(k) + pos.getZ(k + 1) + pos.getZ(k + 2)) / 3 };
      occupes.forEach((pts) => expect(pointInPolygon(c, pts)).toBe(false));
      const ax = pos.getX(k + 1) - pos.getX(k), az = pos.getZ(k + 1) - pos.getZ(k), bx = pos.getX(k + 2) - pos.getX(k), bz = pos.getZ(k + 2) - pos.getZ(k);
      aireEcran += Math.abs(ax * bz - az * bx) / 2;
    }
    // La maison seule fait plus de cent metres carres.
    expect(aireEcran).toBeLessThan(600);
    expect(aireEcran).toBeGreaterThan(300);
  });

  it('cede la place quand il est decoche, ou quand une texture horizontale est choisie', () => {
    const parcelle = objets.find((o) => o.key === 'parcelle')!;
    parcelle.gazon3d = false;
    buildThreeScene(terrasse(), etat(), contexte());
    expect(gazon()).toBeNull();
    delete parcelle.gazon3d;
    parcelle.textureHorizontale = { id: 'x', nom: 'x', vignette: '', url: 'https://dl.polyhaven.org/x.jpg' };
    buildThreeScene(terrasse(), etat(), contexte());
    expect(gazon()).toBeNull();
  });
});

describe('sol en relief', () => {
  // Une grille plane z = 100 + 0,1·x (NGF) sur la parcelle de demonstration et ses abords, zRef = 100 :
  // le sol monte de 10 cm par metre vers l'est. Les cellules sont a demi-metre : le plan tombe au cm.
  const PENTE = 0.1;
  const relief = (affichage?: Relief['affichage']): Relief => {
    const nx = 60, ny = 48, x0 = -37.5, y0 = 9.5;
    const z: number[] = [];
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) z.push(Math.round((100 + PENTE * (x0 + i)) * 100) / 100);
    return { source: 'lidar-hd', couche: 'test', dateLecture: '2026-10-06', origine: 'LiDAR HD', precision: 'test', systemeAltimetrique: 'NGF-IGN69', pas: 1, x0, y0, nx, ny, z, zRef: 100, affichage: affichage ?? null };
  };
  const solAttendu = (x: number) => PENTE * Math.min(Math.max(x, -37.5), 21.5);
  const avecRelief = (affichage?: Relief['affichage']) => {
    const parcelle = objets.find((o) => o.key === 'parcelle');
    if (parcelle) parcelle.relief = relief(affichage);
    return contexte({ trouverParcelleCloture: () => parcelle });
  };
  const meshes = (couleur: string) => {
    const out: THREE_NS.Mesh[] = [];
    vue3d.scene?.scene.traverse((o) => {
      const m = o as THREE_NS.Mesh;
      if (m.isMesh && !Array.isArray(m.material) && (m.material as THREE_NS.MeshStandardMaterial).color?.getHexString() === couleur) out.push(m);
    });
    return out;
  };
  // La scene entiere est mise a jour : la structure d'une terrasse sur un sol en pente vit dans un
  // groupe eleve, et aucun rendu (doublure) n'a propage sa position aux maillages.
  const boite = (m: THREE_NS.Mesh) => { vue3d.scene?.scene.updateMatrixWorld(true); return new THREE_NS.Box3().setFromObject(m); };
  // Sans textures : un seul materiau par maillage, qu'on retrouve par sa couleur.
  let textures = true;
  beforeEach(() => { textures = vue3d.textures; vue3d.textures = false; });
  afterEach(() => { vue3d.textures = textures; });

  it('remplace le plan vert par le maillage de la grille, chaque sommet a la hauteur du sol', () => {
    buildThreeScene(terrasse(), etat(), avecRelief());
    const sol = vue3d.scene?.scene.getObjectByName('sol-relief') as THREE_NS.Mesh | undefined;
    expect(sol).toBeDefined();
    expect(sol?.geometry.type).toBe('BufferGeometry');
    const cen = vue3d.centre ?? { x: 0, y: 0 };
    const pos = sol?.geometry.getAttribute('position');
    expect(pos?.count).toBe(62 * 50);
    for (let k = 0; k < (pos?.count ?? 0); k++) {
      expect(Math.abs((pos?.getY(k) ?? NaN) - solAttendu(cen.x + (pos?.getX(k) ?? 0)))).toBeLessThan(1e-3);
    }
    // La camera vise le centre du plan a la hauteur du sol.
    expect(vue3d.scene?.controls.target.y).toBeCloseTo(solAttendu(cen.x), 6);
    // Le plan vert d'origine n'est plus la.
    expect(meshes('9fb98c').filter((m) => m.geometry.type === 'PlaneGeometry')).toHaveLength(0);
  });

  it('pose un prisme du point le plus bas du sol jusqu au sol en son centre plus sa hauteur', async () => {
    const abri = objets.find((o) => o.key === 'abri');
    if (abri) Object.assign(abri, { elevation: 2.5 });
    buildThreeScene(terrasse(), etat(), avecRelief());
    // La couleur de l'abri est celle de la maquette (DEMO_OBJECTS), lue sur l'objet.
    const prismes = meshes(new THREE_NS.Color(abri?.fill ?? '#000').getHexString());
    expect(prismes).toHaveLength(1);
    const b = boite(prismes[0] as THREE_NS.Mesh);
    const pts = abri && abri.type === 'polygon' ? abri.pts : [];
    const { centroid } = await import('../../../src/geometry/basic.js');
    expect(b.min.y).toBeCloseTo(PENTE * Math.min(...pts.map((p) => p.x)), 3);
    expect(b.max.y).toBeCloseTo(PENTE * centroid(pts).x + 2.5, 3);
  });

  it('pose la terrasse courante a sa hauteur finie au-dessus du point haut du sol sous elle', async () => {
    const { hauteurAppuiMm, hauteurFinieMm, dessusTerrasseM } = await import('../../../src/engine/hauteurs.js');
    const { solDuProjet } = await import('../../../src/engine/sol.js');
    buildThreeScene(terrasse(), etat(), { ...avecRelief(), hauteurAppuiMm });
    await attendre();
    // Les chemins de la demonstration ont la couleur des lames : eux sont des rubans a plat (ShapeGeometry), qui suivent le sol.
    const dessus = Math.max(...meshes('c9a15a').filter((m) => m.geometry.type === 'ExtrudeGeometry').map((m) => boite(m).max.y));
    const t = terrasse() as ObjetPlan;
    const attendu = dessusTerrasseM(t, solDuProjet(objets));
    expect(dessus).toBeCloseTo(attendu, 3);
    // La demonstration est en aval de son point haut : le dessus n'est plus la seule hauteur finie (phase 2, spec §6).
    expect(Math.abs(attendu - hauteurFinieMm(t) / 1000)).toBeGreaterThan(0.01);
  });

  it('drape les chemins sur le sol, au-dessus de l herbe ; le modele exporte garde le ruban plat', () => {
    buildThreeScene(terrasse(), etat(), avecRelief());
    const chemins = meshes('cfc3ab');
    const drapes = chemins.filter((m) => m.userData[HORS_EXPORT]);
    const modeles = chemins.filter((m) => m.userData[EXPORT_SEULEMENT]);
    const nbChemins = objets.filter((o) => o.fonction === 'chemin').length;
    expect(drapes).toHaveLength(nbChemins);
    expect(modeles).toHaveLength(nbChemins);
    modeles.forEach((m) => expect(m.visible).toBe(false));
    const cen = vue3d.centre ?? { x: 0, y: 0 };
    drapes.forEach((m) => {
      expect(m.visible).toBe(true);
      const pos = m.geometry.getAttribute('position');
      // Chaque sommet a deux centimetres au-dessus du sol, et des mailles d'au plus un demi-metre.
      for (let k = 0; k < pos.count; k++) expect(pos.getY(k) - solAttendu(cen.x + pos.getX(k))).toBeCloseTo(DECALAGE_CHEMIN_M, 3);
      for (let k = 0; k < pos.count; k += 3) {
        const l = Math.hypot(pos.getX(k + 1) - pos.getX(k), pos.getZ(k + 1) - pos.getZ(k));
        expect(l).toBeLessThan(0.75);
      }
    });
  });

  it('garde le plan vert quand « Sol en relief » est decoche', () => {
    buildThreeScene(terrasse(), etat(), avecRelief({ sol3d: false }));
    expect(vue3d.scene?.scene.getObjectByName('sol-relief')).toBeUndefined();
    expect(meshes('9fb98c').filter((m) => m.geometry.type === 'PlaneGeometry')).toHaveLength(1);
    expect(vue3d.scene?.controls.target.y).toBe(0);
  });
});

describe('les joints du platelage sous le ciel', () => {
  it('les chants des lames et la structure sous le platelage ne recoivent presque pas le ciel, le dessus si', async () => {
    const textures = vue3d.textures;
    vue3d.textures = true;
    vue3d.scene = null; vue3d.dernierObjKey = null;
    buildThreeScene(terrasse(), etat(), contexte());
    await attendre();
    const lames: THREE_NS.Material[][] = [];
    const parCouleur = new Map<string, number[]>();
    (vue3d.scene as { scene: THREE_NS.Scene } | null)?.scene.traverse((o: THREE_NS.Object3D) => {
      const m = o as THREE_NS.Mesh;
      if (!m.isMesh) return;
      const ms = (Array.isArray(m.material) ? m.material : [m.material]) as THREE_NS.MeshStandardMaterial[];
      const c = ms[0]?.color?.getHexString() ?? '';
      if (c === 'c9a15a' && ms.length === 2) lames.push(ms);
      parCouleur.set(c, [...(parCouleur.get(c) ?? []), ...ms.map((x) => x.envMapIntensity)]);
    });
    expect(lames.length).toBeGreaterThan(50);
    lames.forEach(([dessus, chants]) => {
      expect((dessus as THREE_NS.MeshStandardMaterial).envMapIntensity).toBe(1);
      expect((chants as THREE_NS.MeshStandardMaterial).envMapIntensity).toBe(PART_CIEL_JOINTS);
    });
    // Solives, lambourdes et vis sous le platelage ; la lame de rive, dehors, garde le ciel.
    for (const c of ['6b4a2a', 'b45a2a', 'b8c2ce']) expect(new Set(parCouleur.get(c))).toEqual(new Set([PART_CIEL_SOUS_PLATELAGE]));
    expect(new Set(parCouleur.get('5c3a1e'))).toEqual(new Set([1]));
    vue3d.textures = textures;
  });
});

describe('platelage translucide', () => {
  it('garde les lames pleines par defaut ; case cochee, presque transparentes', async () => {
    const opacites = () => {
      const o = new Set<number>();
      vue3d.scene?.scene.traverse((m) => {
        const mat = (m as THREE_NS.Mesh).material as THREE_NS.MeshStandardMaterial | undefined;
        if ((m as THREE_NS.Mesh).isMesh && mat?.color?.getHexString() === 'c9a15a') o.add(mat.transparent ? mat.opacity : 1);
      });
      return [...o];
    };
    const textures = vue3d.textures;
    vue3d.textures = false;
    for (const [translucide, attendu] of [[false, [1]], [true, [0.15]]] as const) {
      vue3d.platelageTranslucide = translucide;
      vue3d.scene = null; vue3d.dernierObjKey = null;
      buildThreeScene(terrasse(), etat(), contexte());
      await attendre();
      expect(opacites()).toEqual(attendu);
    }
    vue3d.platelageTranslucide = false;
    vue3d.textures = textures;
  });
});

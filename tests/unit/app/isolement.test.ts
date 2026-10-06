import { describe, it, expect } from 'vitest';
import { creerIsolement, libelleIsoler, objetAIsoler, type CameraRetenue } from '../../../src/app/isolement.js';
import { objetsAssocies, visibleEnIsolement } from '../../../src/model/fonctions.js';
import type { EtatApp } from '../../../src/core/state.js';

// Isoler la terrasse (src/app/isolement.ts) : elle seule, cadree ; en sortir rend la vue d'avant.

function monter(vue3d = false) {
  const terrasse = { key: 't1', type: 'polygon', fonction: 'terrasse', pts: [] };
  const etat = {
    objects: [terrasse, { key: 'maison', type: 'polygon', fonction: 'batiment', pts: [] }],
    selectedKey: 't1', terrasseSelectedKey: 't1', isolement: null,
    scene: { scale: 10, origine: { x: 100, y: 200 }, W: 800, H: 600 }
  } as unknown as EtatApp;
  const journal: string[] = [];
  let camera: CameraRetenue | null = vue3d ? { pos: { x: 1, y: 2, z: 3 }, cible: { x: 0, y: 0, z: 0 } } : null;
  const iso = creerIsolement({
    etat,
    render: () => journal.push('render'),
    cadrer: (o) => { journal.push('cadrer ' + o.key); etat.scene = { ...etat.scene, scale: 99, origine: { x: 5, y: 5 } }; },
    vue3dOuverte: () => vue3d,
    reconstruire3d: (recadrer) => { journal.push('3d ' + (recadrer ? 'recadree' : 'rendue')); if (recadrer) camera = { pos: { x: 9, y: 9, z: 9 }, cible: { x: 1, y: 1, z: 1 } }; },
    lireCamera: () => camera,
    poserCamera: (c) => { camera = c; journal.push('camera posee'); },
    notifier: () => journal.push('notifier')
  });
  return { etat, iso, journal, camera: () => camera };
}

describe('isoler la terrasse', () => {
  it('isole la terrasse selectionnee et cadre la vue sur elle', () => {
    const { etat, iso, journal } = monter();
    iso.basculer();
    expect(etat.isolement).toBe('t1');
    expect(iso.actif()).toBe(true);
    expect(journal).toContain('cadrer t1');
  });

  it('rend le cadrage du plan d avant en rebasculant', () => {
    const { etat, iso } = monter();
    iso.basculer();
    expect(etat.scene.scale).toBe(99);
    iso.basculer();
    expect(etat.isolement).toBeNull();
    expect(etat.scene.scale).toBe(10);
    expect(etat.scene.origine).toEqual({ x: 100, y: 200 });
    expect(etat.scene.W).toBe(800);
  });

  it('sort de lui-meme quand la terrasse n est plus selectionnee', () => {
    const { etat, iso } = monter();
    iso.basculer();
    iso.suivreSelection();
    expect(etat.isolement).toBe('t1');
    etat.selectedKey = 'maison';
    iso.suivreSelection();
    expect(etat.isolement).toBeNull();
    expect(etat.scene.scale).toBe(10);
  });

  it('en 3D, recadre la scene, puis rend la camera d avant', () => {
    const { iso, journal, camera } = monter(true);
    iso.basculer();
    expect(journal).toContain('3d recadree');
    expect(camera()!.pos).toEqual({ x: 9, y: 9, z: 9 });
    iso.basculer();
    expect(journal).toContain('3d rendue');
    expect(camera()).toEqual({ pos: { x: 1, y: 2, z: 3 }, cible: { x: 0, y: 0, z: 0 } });
  });

  it('ne fait rien sans terrasse selectionnee', () => {
    const { etat, iso } = monter();
    etat.selectedKey = 'maison';
    iso.basculer();
    expect(etat.isolement).toBeNull();
  });
});

describe('isoler une piscine, une pergola, un carport', () => {
  const objets = () => [
    { key: 't1', type: 'polygon', fonction: 'terrasse', pts: [] },
    { key: 'p1', type: 'polygon', fonction: 'piscine', pts: [], piscine: { plage: 'terrasse', terrasseKey: 't1' } },
    { key: 'g1', type: 'polygon', fonction: 'pergola', pts: [] },
    { key: 'k1', type: 'polygon', fonction: 'carport', pts: [] },
    { key: 'maison', type: 'polygon', fonction: 'batiment', pts: [] }
  ];
  const monterSur = (selection: string) => {
    const etat = { objects: objets(), selectedKey: selection, terrasseSelectedKey: 't1', isolement: null, scene: { scale: 10, origine: { x: 0, y: 0 }, W: 800, H: 600 } } as unknown as EtatApp;
    const iso = creerIsolement({ etat, render: () => {}, cadrer: () => {}, vue3dOuverte: () => false, reconstruire3d: () => {}, lireCamera: () => null, poserCamera: () => {}, notifier: () => {} });
    return { etat, iso };
  };

  it('isole chacun, avec son libelle ; pas un batiment', () => {
    for (const [cle, libelle] of [['p1', 'Isoler la piscine'], ['g1', 'Isoler la pergola'], ['k1', 'Isoler le carport'], ['t1', 'Isoler la terrasse']] as const) {
      const { etat, iso } = monterSur(cle);
      expect(libelleIsoler(objetAIsoler(etat))).toBe(libelle);
      iso.basculer();
      expect(etat.isolement).toBe(cle);
    }
    const { etat, iso } = monterSur('maison');
    expect(objetAIsoler(etat)).toBeUndefined();
    iso.basculer();
    expect(etat.isolement).toBeNull();
  });

  it('montre la terrasse d une piscine isolee, et reste isole quand on la selectionne', () => {
    const { etat, iso } = monterSur('p1');
    iso.basculer();
    const vu = (k: string) => visibleEnIsolement(etat.objects.find(o => o.key === k)!, etat.objects, etat.isolement);
    expect(vu('p1')).toBe(true);
    expect(vu('t1')).toBe(true);
    expect(vu('maison')).toBe(false);
    expect(vu('g1')).toBe(false);
    etat.selectedKey = 't1';
    iso.suivreSelection();
    expect(etat.isolement).toBe('p1');
    etat.selectedKey = 'maison';
    iso.suivreSelection();
    expect(etat.isolement).toBeNull();
  });

  it('une terrasse isolee montre les piscines dont elle est la plage', () => {
    const { etat, iso } = monterSur('t1');
    iso.basculer();
    expect(objetsAssocies(etat.objects[0]!, etat.objects).map(o => o.key)).toEqual(['p1']);
    expect(visibleEnIsolement(etat.objects[1]!, etat.objects, 't1')).toBe(true);
    expect(visibleEnIsolement(etat.objects[2]!, etat.objects, 't1')).toBe(false);
    expect(visibleEnIsolement(etat.objects[2]!, etat.objects, null)).toBe(true);
  });
});

import { describe, it, expect } from 'vitest';
import {
  focaleVoulue, instantPromenade, minutesHeureDoree, adoucir, dureeTrajetMs, dureePromenade, pointsDuTour, tourDeLaMaison, composerPromenade, terrainDuTour, traverse,
  FOCALE_YEUX_DEG, FOCALE_VUE_DEG, TRAJET_MS, ARRET_MS, HEURE_DOREE_AVANT_COUCHER_MIN, VITESSE_MARCHE_M_S, ECART_MAISON_MIN_M, MARGE_LIMITE_M, YEUX_M, PORTEE_REGARD_M, type EtapePromenade
} from '../../../src/three/presentation.js';
import { pointInPolygon } from '../../../src/geometry/basic.js';
import { distancePointContour } from '../../../src/geometry/proximite.js';
import { normaliserEnObjetsDuPlan } from '../../../src/app/assemblage/formes.js';
import { DEMO_OBJECTS } from '../../../src/model/demo.js';
import type { PtBrut } from '../../../src/model/types.js';

describe('la camera et la presentation (R6)', () => {
  it('la focale passe de l oeil a la vue d ensemble avec la hauteur, sans saut', () => {
    expect(focaleVoulue(1.65)).toBe(FOCALE_YEUX_DEG);
    expect(focaleVoulue(40)).toBe(FOCALE_VUE_DEG);
    for (let h = 0; h < 10; h += 0.25) expect(Math.abs(focaleVoulue(h + 0.25) - focaleVoulue(h))).toBeLessThanOrEqual(1);
  });

  it('l heure doree tombe cinquante minutes avant le coucher', () => {
    const vesinet = { latitude: 48.905, longitude: 2.133 };
    const juin = minutesHeureDoree('2026-06-21', vesinet), decembre = minutesHeureDoree('2026-12-21', vesinet);
    expect(juin).toBeGreaterThan(20 * 60 + 40);
    expect(juin).toBeLessThan(21 * 60 + 30);
    expect(decembre).toBeGreaterThan(15 * 60);
    expect(decembre).toBeLessThan(16 * 60 + 30);
    expect(HEURE_DOREE_AVANT_COUCHER_MIN).toBe(50);
    expect(minutesHeureDoree('pas une date', vesinet)).toBeNull();
  });

  it('la promenade part du premier point de vue, s arrete sur chacun, finit au dernier, au pas', () => {
    const e = (x: number) => ({ position: { x, y: 1.6, z: 0 }, cible: { x: x + 1, y: 1.6, z: 0 } });
    const etapes = [e(0), e(10), e(20)];
    // Dix metres se marchent a l'allure d'un visiteur : plus de neuf secondes, pas 2,6.
    const trajet = dureeTrajetMs(10);
    expect(trajet).toBeCloseTo(10 / VITESSE_MARCHE_M_S * 1000);
    expect(dureeTrajetMs(1)).toBe(TRAJET_MS);
    expect(instantPromenade(etapes, 0)?.position.x).toBe(0);
    expect(instantPromenade(etapes, trajet / 2)?.position.x).toBeCloseTo(5);
    // A l'arret sur le deuxieme point de vue.
    expect(instantPromenade(etapes, trajet + ARRET_MS / 2)?.position.x).toBeCloseTo(10);
    expect(dureePromenade(etapes)).toBeCloseTo(2 * trajet + ARRET_MS);
    expect(instantPromenade(etapes, dureePromenade(etapes) + 1)).toBeNull();
    expect(instantPromenade([e(0)], 0)).toBeNull();
    expect(adoucir(0)).toBe(0);
    expect(adoucir(1)).toBe(1);
  });

  it('sans arret entre deux etapes, la camera y passe sans ralentir et sans s y poser', () => {
    const e = (x: number, arret?: boolean) => ({ position: { x, y: 1.6, z: 0 }, cible: { x, y: 1.6, z: -5 }, ...(arret === undefined ? {} : { arret }) });
    const etapes: EtapePromenade[] = [e(0), e(5, false), e(10)];
    // Un seul trajet de dix metres : pas d'arret au milieu.
    expect(dureePromenade(etapes)).toBeCloseTo(dureeTrajetMs(10));
    expect(instantPromenade(etapes, dureeTrajetMs(10) / 2)?.position.x).toBeCloseTo(5);
  });
});

/** Une maison de 10 x 8 m au milieu d'un terrain, en coordonnees du plan. */
const rect = (x0: number, y0: number, x1: number, y1: number): PtBrut[] => [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];

describe('le tour de la maison (promenade)', () => {
  const maison = rect(0, 0, 10, 8);

  it('fait le tour complet quand la parcelle le permet, a distance des murs et de la cloture', () => {
    const t = { maison, parcelle: rect(-10, -10, 20, 18), obstacles: [] };
    const tour = pointsDuTour(t);
    expect(tour?.boucle).toBe(true);
    const pts = tour?.points ?? [];
    // Un tour de 3 m autour d'une maison de 36 m de pourtour : une cinquantaine de metres, des points tous les deux metres.
    expect(pts.length).toBeGreaterThan(20);
    pts.forEach((p) => {
      expect(pointInPolygon(p, maison)).toBe(false);
      expect(distancePointContour(p, maison)).toBeGreaterThanOrEqual(ECART_MAISON_MIN_M - 1e-6);
    });
    // Aucun pas, ni celui qui referme la boucle, ne traverse un mur.
    pts.forEach((p, i) => expect(traverse(p, pts[(i + 1) % pts.length] as PtBrut, maison)).toBe(false));
  });

  it('se rapproche de la maison la ou la parcelle se resserre, sans sortir de la parcelle', () => {
    // Deux metres seulement entre le mur nord et la limite.
    const parcelle = rect(-10, -10, 20, 10);
    const tour = pointsDuTour({ maison, parcelle, obstacles: [] });
    expect(tour?.boucle).toBe(true);
    (tour?.points ?? []).forEach((p) => {
      expect(pointInPolygon(p, parcelle)).toBe(true);
      expect(distancePointContour(p, parcelle)).toBeGreaterThanOrEqual(MARGE_LIMITE_M - 1e-6);
    });
  });

  it('une maison collee a la limite ne se contourne pas : on longe ce qui est accessible', () => {
    // La maison touche la limite ouest : on ne passe pas derriere.
    const tour = pointsDuTour({ maison, parcelle: rect(0, -10, 25, 18), obstacles: [] });
    expect(tour?.boucle).toBe(false);
    const pts = tour?.points ?? [];
    expect(pts.length).toBeGreaterThan(8);
    pts.forEach((p) => expect(p.x).toBeGreaterThan(MARGE_LIMITE_M - 1e-6));
    for (let i = 0; i + 1 < pts.length; i++) expect(traverse(pts[i] as PtBrut, pts[i + 1] as PtBrut, maison)).toBe(false);
  });

  it('n entre pas dans un autre batiment', () => {
    const abri = rect(12, 2, 16, 6);
    const tour = pointsDuTour({ maison, parcelle: rect(-10, -10, 25, 18), obstacles: [abri] });
    (tour?.points ?? []).forEach((p) => expect(pointInPolygon(p, abri)).toBe(false));
  });

  it('garde les yeux a hauteur d homme au-dessus du sol en pente, et regarde la maison', () => {
    const sol = (p: PtBrut) => p.x * 0.1;
    const tour = tourDeLaMaison({ maison, parcelle: rect(-10, -10, 20, 18), obstacles: [] }, { x: 0, y: 0 }, sol);
    expect(tour?.boucle).toBe(true);
    (tour?.etapes ?? []).forEach((e) => {
      expect(e.position.y).toBeCloseTo(sol({ x: e.position.x, y: -e.position.z }) + YEUX_M);
      // Le regard, a hauteur des yeux, porte devant soi et tourne vers la maison (son centre : 5, -4).
      expect(e.cible.y).toBeCloseTo(e.position.y);
      const rx = e.cible.x - e.position.x, rz = e.cible.z - e.position.z;
      expect(Math.hypot(rx, rz)).toBeCloseTo(PORTEE_REGARD_M);
      expect(rx * (5 - e.position.x) + rz * (-4 - e.position.z)).toBeGreaterThan(0);
      expect(e.arret).toBe(false);
    });
    // La boucle revient a son point de depart.
    const et = tour?.etapes ?? [];
    expect(et[0]?.position).toEqual(et[et.length - 1]?.position);
  });

  it('enchaine les points de vue puis le tour, contourne la maison entre deux points de vue opposes', () => {
    const tour = tourDeLaMaison({ maison, parcelle: rect(-10, -10, 20, 18), obstacles: [] }, { x: 0, y: 0 });
    const vue = (x: number, y: number) => ({ position: { x, y: 1.6, z: -y }, cible: { x: 5, y: 1.6, z: -4 } });
    // L'une a l'ouest, l'autre a l'est : la ligne droite traverse la maison.
    const vues = [vue(-4, 4), vue(14, 4)];
    const maisonScene = maison.map((p) => ({ x: p.x, z: -p.y }));
    const etapes = composerPromenade(vues, tour, maisonScene);
    const plan = (e: EtapePromenade) => ({ x: e.position.x, y: -e.position.z });
    for (let i = 0; i + 1 < etapes.length; i++) expect(traverse(plan(etapes[i] as EtapePromenade), plan(etapes[i + 1] as EtapePromenade), maison)).toBe(false);
    expect(etapes.filter((e) => e.arret).length).toBe(3);
    expect(etapes[etapes.length - 1]?.arret).toBe(true);
    // Plus d'une minute de promenade, contre huit secondes avant pour deux points de vue.
    expect(dureePromenade(etapes)).toBeGreaterThan(60000);
    // Sans tour, les points de vue seuls.
    expect(composerPromenade(vues, null)).toHaveLength(2);
  });

  it('sur la demonstration (AE 101), fait le tour de la maison sans traverser l abri ni sortir', () => {
    const objets = normaliserEnObjetsDuPlan(JSON.parse(JSON.stringify(DEMO_OBJECTS)));
    const terrain = terrainDuTour(objets);
    expect(terrain).not.toBeNull();
    const maisonDemo = objets.find((o) => o.key === 'maison');
    expect(terrain?.maison).toBe(maisonDemo && maisonDemo.type === 'polygon' ? maisonDemo.pts : null);
    const tour = terrain ? pointsDuTour(terrain) : null;
    expect(tour).not.toBeNull();
    const pts = tour?.points ?? [];
    expect(pts.length).toBeGreaterThan(15);
    pts.forEach((p) => {
      expect(pointInPolygon(p, terrain?.parcelle ?? [])).toBe(true);
      (terrain?.obstacles ?? []).forEach((o) => expect(pointInPolygon(p, o)).toBe(false));
    });
  });
});

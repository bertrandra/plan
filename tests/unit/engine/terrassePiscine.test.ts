import { describe, it, expect } from 'vitest';
import {
  calculerPiscine, chiffrerPiscine, constructionDeLaPlage, contourTerrasseAutour, interieurBassin, noteDeCalcul, noteEnTexte, plageCalculee, terrasseDeLaPiscine
} from '../../../src/engine/piscine.js';
import { aireCommune, computeStructure, contourOuverture, couperAuContour, empriseDalle, objetsQuiPercent, surfaceDalle } from '../../../src/engine/structure.js';
import { computeTerrasseLayers } from '../../../src/engine/layers.js';
import { computeBOM } from '../../../src/engine/bom.js';
import { computeChantier } from '../../../src/engine/chantier.js';
import { computeAssise } from '../../../src/engine/prix.js';
import { constructionTerrasseNeuve, defaultConstruction, ensureConstruction } from '../../../src/engine/construction.js';
import { shoelace } from '../../../src/geometry/basic.js';
import { decaissementPoseMm, hauteurFinieMm } from '../../../src/engine/hauteurs.js';
import type { Construction, ObjetPlan, Piscine } from '../../../src/model/types.js';

// La plage en bois d'une piscine est une terrasse du plan, percee par le bassin ; une terrasse peut
// aussi etre percee d'un trou ; son assise peut etre une dalle a couler ou des massifs.

function piscine(L: number, l: number, reglages: Piscine = {}): ObjetPlan {
  return { key: 'p', name: 'Piscine 1', type: 'polygon', fonction: 'piscine', pts: [{ x: 0, y: 0 }, { x: L, y: 0 }, { x: L, y: l }, { x: 0, y: l }], piscine: { cotePetitBain: 3, ...reglages } };
}
const rect = (x0: number, y0: number, x1: number, y1: number) => [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];
const terrasse = (pts = rect(-3, -3, 11, 7), construction: Construction = constructionTerrasseNeuve()): ObjetPlan =>
  ({ key: 't', name: 'Terrasse de Piscine 1', type: 'polygon', fonction: 'terrasse', pts, construction });

describe('l\'interieur du bassin, pour la 3D', () => {
  it('recoupe les cotes aux cassures du profil, et le fond en bandes', () => {
    const calc = calculerPiscine(piscine(10, 4, { fond: 'fosse', profondeurPetitBain: 1.2, profondeurGrandBain: 2.4, partFosse: 0.4 }))!;
    const int = interieurBassin(calc.contour, calc.axe, calc.profil);
    // Deux cassures (debut et fond de la descente) sur chacun des deux longs cotes : 4 + 4 parois.
    expect(int.parois).toHaveLength(8);
    // Trois bandes : le plat, la descente, la fosse ; elles recouvrent le plan d'eau.
    expect(int.fond).toHaveLength(3);
    expect(int.fond.reduce((s, b) => s + Math.abs(shoelace(b.pts)), 0)).toBeCloseTo(calc.surface, 6);
    const prof = int.fond.flatMap(b => b.prof);
    expect(Math.min(...prof)).toBeCloseTo(1.2);
    expect(Math.max(...prof)).toBeCloseTo(2.4);
    // Un fond plat : les parois du contour, un seul pan.
    const plat = calculerPiscine(piscine(8, 4))!;
    const ip = interieurBassin(plat.contour, plat.axe, plat.profil);
    expect(ip.parois).toHaveLength(4);
    expect(ip.fond).toHaveLength(1);
  });
});

describe('la plage « terrasse du plan »', () => {
  it('ne se dessine ni ne se chiffre par la piscine', () => {
    expect(plageCalculee('terrasse')).toBe(false);
    expect(plageCalculee('dallage')).toBe(true);
    expect(plageCalculee('terrasse-bois')).toBe(true);
    const calc = calculerPiscine(piscine(8, 4, { plage: 'terrasse' }))!;
    expect(calc.plageBois).toBeNull();
    expect(calc.plageExt).toBe(calc.margelleExt);
    expect(calc.terrasseAssociee).toBeNull();
    expect(chiffrerPiscine(calc).lignes.some(l => /^Plage/.test(l.label))).toBe(false);
  });

  it('prend la terrasse liee pour emprise, et le dit dans la note', () => {
    const t = terrasse();
    const p = piscine(8, 4, { plage: 'terrasse', terrasseKey: 't' });
    expect(terrasseDeLaPiscine(p, [p, t])).toBe(t);
    expect(terrasseDeLaPiscine(p, [p])).toBeUndefined();
    expect(terrasseDeLaPiscine(p, [p, { ...t, fonction: 'autre' } as ObjetPlan])).toBeUndefined();
    const calc = calculerPiscine(p, [p, t])!;
    expect(calc.plageExt).toBe(t.type === 'polygon' ? t.pts : null);
    expect(calc.terrasseAssociee).toEqual({ key: 't', nom: 'Terrasse de Piscine 1', surface: 140 });
    expect(calc.surfacePlage).toBeCloseTo(140 - shoelace(calc.margelleExt));
    const texte = noteEnTexte(noteDeCalcul(calc));
    expect(texte).toMatch(/Terrasse « Terrasse de Piscine 1 »/);
    expect(texte).toMatch(/nomenclature de la terrasse/);
  });

  it('pose son contour autour des margelles : les coins du bassin, ou un carre autour d\'un rond', () => {
    const p = piscine(8, 4, { largeurPlage: 2 });
    const calc = calculerPiscine(p)!;
    const pts = contourTerrasseAutour(p)!;
    expect(pts).toHaveLength(4);
    // Chaque cote recule de la largeur de plage : 2 m de plus de chaque bord.
    const largeur = (q: { x: number }[]) => Math.max(...q.map(v => v.x)) - Math.min(...q.map(v => v.x));
    const hauteur = (q: { y: number }[]) => Math.max(...q.map(v => v.y)) - Math.min(...q.map(v => v.y));
    expect(largeur(pts)).toBeCloseTo(largeur(calc.margelleExt) + 4);
    expect(hauteur(pts)).toBeCloseTo(hauteur(calc.margelleExt) + 4);
    const rond: ObjetPlan = { key: 'r', name: 'R', type: 'circle', fonction: 'piscine', center: { x: 0, y: 0 }, r: 2, piscine: { largeurPlage: 1 } };
    const carre = contourTerrasseAutour(rond)!;
    expect(carre).toHaveLength(4);
    expect(carre[1]!.x - carre[0]!.x).toBeCloseTo(carre[2]!.y - carre[1]!.y);
    expect(contourTerrasseAutour({ ...rond, r: 0 } as ObjetPlan)).toBeNull();
  });
});

describe('les ouvertures d\'une terrasse', () => {
  it('borde le bassin d\'un chevetre, seulement la ou la terrasse existe', () => {
    // La terrasse ne couvre que la moitie gauche du bassin.
    const t = terrasse(rect(-3, -3, 4, 7), defaultConstruction());
    ensureConstruction(t);
    const s = computeStructure(t as never, [t, piscine(8, 4)]);
    const xs = (s.chevetres ?? []).flatMap(c => [c.a.x, c.b.x]);
    expect(xs.length).toBeGreaterThan(0);
    expect(Math.max(...xs)).toBeLessThanOrEqual(4 + 1e-6);
    expect(couperAuContour({ a: { x: -10, y: 0 }, b: { x: 10, y: 0 } }, rect(-1, -1, 1, 1))).toEqual([{ a: { x: -1, y: 0 }, b: { x: 1, y: 0 } }]);
    expect(couperAuContour({ a: { x: 5, y: 0 }, b: { x: 9, y: 0 } }, rect(-1, -1, 1, 1))).toEqual([]);
  });

  it('coupe la terrasse autour d\'un trou, polygone ou rond, et pas d\'un autre objet', () => {
    const trou: ObjetPlan = { key: 'tr', name: 'Trou 1', type: 'polygon', fonction: 'tremie', pts: rect(2, 2, 3, 3) };
    const arbre: ObjetPlan = { key: 'a', name: 'Arbre', type: 'circle', fonction: 'tremie', center: { x: 6, y: 2 }, r: 0.5 };
    const banc: ObjetPlan = { key: 'b', name: 'Banc', type: 'polygon', fonction: 'mobilier', pts: rect(0, 0, 1, 1) };
    expect(contourOuverture(trou)).toBe(trou.type === 'polygon' ? trou.pts : null);
    expect(contourOuverture(arbre)).toHaveLength(32);
    expect(contourOuverture(banc)).toBeNull();
    const t = terrasse(rect(0, 0, 8, 5));
    expect(objetsQuiPercent(rect(0, 0, 8, 5), [t, trou, arbre, banc]).map(x => x.objet.name)).toEqual(['Trou 1', 'Arbre']);
    const couches = computeTerrasseLayers(t, [t, trou, arbre, banc]);
    expect(couches.trous).toHaveLength(2);
    expect(couches.chevetres!.length).toBeGreaterThanOrEqual(4);
  });

  it('retire du metre de visserie la part percee de la terrasse', () => {
    expect(aireCommune(rect(0, 0, 4, 4), rect(2, 2, 6, 6))).toBeCloseTo(4, 3);
    expect(aireCommune(rect(0, 0, 4, 4), rect(10, 10, 12, 12))).toBe(0);
    const t = terrasse(rect(0, 0, 8, 5));
    const pleine = computeBOM(t, computeTerrasseLayers(t, [t]));
    const trou: ObjetPlan = { key: 'tr', name: 'Trou 1', type: 'polygon', fonction: 'tremie', pts: rect(2, 2, 4, 3) };
    const percee = computeBOM(t, computeTerrasseLayers(t, [t, trou]));
    const visserie = (b: typeof pleine) => b.find(l => l.poste === 'visserie')!.qte;
    expect(visserie(pleine)).toBeCloseTo(40);
    expect(visserie(percee)).toBeCloseTo(38, 2);
  });
});

describe('l\'assise d\'une terrasse sur plots', () => {
  it('une terrasse neuve est sur plots ; un projet sans construction reste en vis', () => {
    expect(constructionTerrasseNeuve().typePose).toBe('plots');
    expect(defaultConstruction().typePose).toBe('vis-fondation');
    expect(ensureConstruction({}).typePose).toBe('vis-fondation');
  });

  it('chiffre une dalle a couler : beton, treillis, coffrage, herisson', () => {
    const c: Construction = { ...constructionTerrasseNeuve(), supportType: 'dalle-beton', supportDecaissement: 15 };
    const a = computeAssise(c, 20, 40, 18);
    expect(a).toMatchObject({ betonM3: 20 * 0.12, treillisM2: 23, coffrageMl: 18, massifsU: 0, dallesU: 0 });
    expect(a.concasseM3).toBeCloseTo(3);
    const t = terrasse(rect(0, 0, 5, 4), c);
    const bom = computeBOM(t, computeTerrasseLayers(t, [t]));
    // La dalle deborde de 10 cm tout autour : 5,2 x 4,2 m sous une terrasse de 5 x 4 m.
    expect(bom.find(l => l.poste === 'betonDalle')!.qte).toBeCloseTo(5.2 * 4.2 * 0.12);
    expect(bom.find(l => l.poste === 'treillis')!.qte).toBeCloseTo(5.2 * 4.2 * 1.15);
    expect(bom.find(l => l.poste === 'coffrage')!.qte).toBeGreaterThan(17);
    expect(bom.find(l => l.poste === 'treillis')).toBeDefined();
    const chantier = computeChantier(t, computeTerrasseLayers(t, [t]));
    const poste = (cle: string) => chantier.lignes.find(l => l.cle === cle)?.qte ?? 0;
    expect(poste('coulage')).toBeCloseTo(5.2 * 4.2 * 0.12);
    // Le herisson, la dalle, et la fouille d'une hauteur de plot (10 cm) ou la dalle est coulee :
    // dessus de dalle + plot = terrain (engine/hauteurs.ts, dalleEnFouille).
    expect(poste('decaissement')).toBeCloseTo(20 * 0.15 + 5.2 * 4.2 * 0.12 + 5.2 * 4.2 * 0.10);
    expect(bom.find(l => l.poste === 'decaissementPose')!.qte).toBeCloseTo(5.2 * 4.2 * 0.10);
    expect(surfaceDalle(rect(0, 0, 5, 4), [rect(1, 1, 2, 2)])).toBeCloseTo(5.2 * 4.2 - 1, 3);
    const e = empriseDalle(rect(0, 0, 5, 4));
    expect(Math.min(...e.map(p => p.x))).toBeCloseTo(-0.1);
    expect(Math.max(...e.map(p => p.y))).toBeCloseTo(4.1);
  });

  it('chiffre un massif de beton sous chaque plot, sans decaissement general', () => {
    const c: Construction = { ...constructionTerrasseNeuve(), supportType: 'massifs' };
    const a = computeAssise(c, 20, 40);
    expect(a).toMatchObject({ massifsU: 40, concasseM3: 0, geotextileM2: 0, treillisM2: 0 });
    expect(a.betonM3).toBeCloseTo(40 * 0.027);
    const t = terrasse(rect(0, 0, 5, 4), c);
    const layers = computeTerrasseLayers(t, [t]);
    const bom = computeBOM(t, layers);
    expect(bom.find(l => l.poste === 'massifs')!.qte).toBe(layers.vis.length);
    expect(bom.some(l => l.poste === 'concasse' || l.poste === 'betonDalle')).toBe(false);
    // En vis de fondation, l'assise n'existe pas.
    expect(computeAssise({ ...defaultConstruction(), supportType: 'massifs' }, 20, 40).massifsU).toBe(0);
  });
});

describe('la plage creee au niveau des margelles', () => {
  const dessus = (p: ObjetPlan) => {
    const calc = calculerPiscine(p)!;
    return Math.round((calc.hauteurHorsSol + 0.04) * 1000);
  };
  const terrasseDe = (p: ObjetPlan) => terrasse(rect(-3, -3, 11, 7), constructionDeLaPlage(p));

  it('enterree : la terrasse descend dans un decaissement, lames au ras des margelles', () => {
    const p = piscine(8, 4);
    const t = terrasseDe(p);
    expect(t.construction!.niveauFini).toBe(4);
    expect(hauteurFinieMm(t)).toBe(dessus(p));
    expect(decaissementPoseMm(t)).toBeGreaterThan(0);
  });

  it('semi-enterree : les plots montent de l ecart, lames au ras des margelles', () => {
    const p = piscine(8, 4, { implantation: 'semi-enterree' });
    const t = terrasseDe(p);
    expect(t.construction!.hauteurPlot).toBeGreaterThan(10);
    expect(hauteurFinieMm(t)).toBe(dessus(p));
  });

  it('hors-sol : les plots plafonnent a leur domaine, l inspecteur le signale', () => {
    const p = piscine(8, 4, { implantation: 'hors-sol' });
    const t = terrasseDe(p);
    expect(t.construction!.hauteurPlot).toBe(100);
    expect(hauteurFinieMm(t)).toBeLessThan(dessus(p));
  });

  it('une ancienne plage en bois garde son essence', () => {
    expect(constructionDeLaPlage(piscine(8, 4, { essencePlage: 'ipe' } as Piscine)).essenceBois).toBe('ipe');
  });
});

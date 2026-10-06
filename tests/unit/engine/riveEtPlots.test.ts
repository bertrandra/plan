import { describe, it, expect, vi } from 'vitest';
import { computeTerrasseLayers } from '../../../src/engine/layers.js';
import { computeChantier } from '../../../src/engine/chantier.js';
import { surfaceNetteTerrasse } from '../../../src/engine/structure.js';
import { constructionTerrasseNeuve } from '../../../src/engine/construction.js';
import { PLOT_ASSISE_MIN_CM2 } from '../../../src/engine/constantes.js';
import { distancePointSegment } from '../../../src/geometry/segments.js';
import { sectionsConstruction } from '../../../src/ui/champs/construction.js';
import type { Construction, ObjetPlan, PtBrut } from '../../../src/model/types.js';
import type { ContexteChamps } from '../../../src/ui/champs/types.js';

// Une terrasse percee (bassin, trou) : surface nette partout ; la lame de rive cote par cote et
// autour des trous ; les plots de rive dont l'embase reste sous la terrasse.

const rect = (x0: number, y0: number, x1: number, y1: number): PtBrut[] => [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];
const terrasse = (c: Partial<Construction> = {}): ObjetPlan => ({ key: 't', name: 'T', type: 'polygon', fonction: 'terrasse', pts: rect(0, 0, 6, 4), segmentNames: ['Sud', 'Est', 'Nord', 'Ouest'], construction: { ...constructionTerrasseNeuve(), ...c } });
const trou: ObjetPlan = { key: 'tr', name: 'Trou 1', type: 'polygon', fonction: 'tremie', pts: rect(2, 1.5, 3, 2.5) };
const piscine: ObjetPlan = { key: 'p', name: 'Piscine 1', type: 'polygon', fonction: 'piscine', pts: rect(10, 10, 14, 12), piscine: {} };
const distanceAuBord = (p: PtBrut, poly: PtBrut[]) => Math.min(...poly.map((a, i) => distancePointSegment(p, a, poly[(i + 1) % poly.length]!)));

describe('plots dans l emprise', () => {
  it('une terrasse neuve recule son cadre : l embase des plots de rive reste sous la terrasse', () => {
    const t = terrasse();
    const r = Math.sqrt(PLOT_ASSISE_MIN_CM2 / Math.PI) / 100;
    const vis = computeTerrasseLayers(t, [t]).vis;
    expect(vis.length).toBeGreaterThan(4);
    vis.forEach(p => expect(distanceAuBord(p, rect(0, 0, 6, 4))).toBeGreaterThanOrEqual(r - 1e-6));
    // Sans le reglage (projet anterieur), le cadre reste au bord : l'embase depasse.
    const ancien = terrasse({ plotsDansEmprise: undefined });
    delete ancien.construction!.plotsDansEmprise;
    const visAncien = computeTerrasseLayers(ancien, [ancien]).vis;
    expect(Math.min(...visAncien.map(p => distanceAuBord(p, rect(0, 0, 6, 4))))).toBeLessThan(r);
  });
});

describe('lame de rive cote par cote', () => {
  it('saute les cotes choisis, en 2D, au metre et en 3D', () => {
    const t = terrasse({ avecLameRive: true, cotesSansRive: [0, 2] });
    const c = computeTerrasseLayers(t, [t]);
    expect(c.lameRive).toHaveLength(2);
    expect(c.bandes.lameRive?.actifs).toEqual([false, true, false, true]);
    const tout = terrasse({ avecLameRive: true });
    const ct = computeTerrasseLayers(tout, [tout]);
    expect(ct.lameRive).toHaveLength(4);
    expect(ct.bandes.lameRive && 'actifs' in ct.bandes.lameRive).toBe(false);
  });

  it('borde un trou si on le demande, jamais un bassin', () => {
    const t = terrasse({ avecLameRive: true, riveOuvertures: true });
    const avecTrou = computeTerrasseLayers(t, [t, trou]);
    expect(avecTrou.lameRive).toHaveLength(8);
    expect(avecTrou.bandes.rivesOuvertures).toHaveLength(1);
    const sans = computeTerrasseLayers(terrasse({ avecLameRive: true }), [t, trou]);
    expect(sans.lameRive).toHaveLength(4);
  });

  it('se coche cote par cote dans l inspecteur, nomme et mis en evidence', () => {
    const t = terrasse({ avecLameRive: true });
    const c = { obj: t, objets: [t], construction: () => t.construction!, etat: { highlight: { type: 'segment', index: 1 } }, elevationOf: () => 0, executerCommande: vi.fn() } as unknown as ContexteChamps;
    const finitions = sectionsConstruction({ visible: () => false }, c).find(s => s.id === 'finitions')!;
    const est = finitions.champs.find(ch => ch.cle === 'rive1')!;
    if (est.type !== 'case') throw new Error('case attendue');
    expect(est.libelle).toBe('Rive · Est');
    expect(est.surbrillance!(c)).toBe(true);
    expect(est.lire(c)).toBe(true);
    est.ecrire(c, false);
    expect(t.construction!.cotesSansRive).toEqual([1]);
    const resume = finitions.champs.find(ch => ch.cle === 'cotesSansRive')!;
    if (resume.type !== 'lecture') throw new Error('lecture attendue');
    expect(resume.valeur(c)).toBe('Est');
    est.ecrire(c, true);
    expect('cotesSansRive' in t.construction!).toBe(false);
    // Sans contexte (inventaire), pas de case par cote.
    expect(sectionsConstruction({ visible: () => false }).find(s => s.id === 'finitions')!.champs.some(ch => ch.cle === 'rive0')).toBe(false);
  });
});

describe('surface nette d une terrasse percee', () => {
  it('retire bassins et trous, et rien sans ouverture', () => {
    const t = terrasse();
    expect(surfaceNetteTerrasse(rect(0, 0, 6, 4), [t])).toBe(24);
    expect(surfaceNetteTerrasse(rect(0, 0, 6, 4), [t, trou])).toBeCloseTo(23, 3);
    const grande = rect(8, 8, 16, 14);
    const net = surfaceNetteTerrasse(grande, [piscine]);
    expect(net).toBeLessThan(48 - 8);
  });

  it('le chantier pose et nettoie la surface nette', () => {
    const t = terrasse();
    const q = (objets: ObjetPlan[], cle: string) => computeChantier(t, computeTerrasseLayers(t, objets)).lignes.find(l => l.cle === cle)?.qte ?? 0;
    expect(q([t], 'poseLames')).toBeCloseTo(24);
    expect(q([t, trou], 'poseLames')).toBeCloseTo(23, 2);
  });
});

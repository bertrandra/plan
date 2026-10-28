import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { propositionsArbitrees } from '../../../../../src/app/audit/parcelle/arbitrages.js';
import { avecPlacesApresForme } from '../../../../../src/app/audit/parcelle/apresForme.js';
import { cochesParDefaut } from '../../../../../src/app/audit/parcelle/propositions.js';
import { cleMesure, type MesureFacade } from '../../../../../src/app/audit/parcelle/mesures.js';
import { listeDeControle } from '../../../../../src/app/audit/parcelle/liste.js';
import { captureVide } from '../../../../../src/model/auditParcelle.js';
import { appliquerPropositions, type Proposition } from '../../../../../src/regles/decisions.js';
import { corpsDesCheminees, souchesSurLeCorps } from '../../../../../src/facade/regles/toits/elementsVus.js';
import { plusGrand } from '../../../../../src/facade/regles/toits/faits.js';
import { corpsDeSaillie } from '../../../../../src/facade/modeToit/saillies.js';
import type { CeQueJeVois } from '../../../../../src/model/ceQueJeVois.js';
import type { SilhouetteFacade } from '../../../../../src/model/silhouetteFacade.js';
import type { ChampsBatiment, Cheminee, CorpsToit, Lucarne, ObjetPlan, PtBrut } from '../../../../../src/model/types.js';

// Le toit que decide l'audit de la parcelle, face a ce que la personne a fait (MD/spec-ouvrages.md, « Les toits dans l'audit de
// la parcelle », points 2 et 3) : sur AE 101, des trapezes sur les longs pans sud et nord relisent le corps principal en croupes.

const d = JSON.parse(readFileSync('tests/fixtures/toits/vesinet-ae101.json', 'utf8')) as { contour: PtBrut[]; toitMesure: ChampsBatiment['toitMesure']; corps: CorpsToit[] };
const COTES = { sud: 6, nord: 12 } as const;
const parcelle = { key: 'parcelle', name: 'p', type: 'polygon', fonction: 'terrain', pts: [{ x: -50, y: -50 }, { x: 50, y: -50 }, { x: 50, y: 50 }, { x: -50, y: 50 }] } as unknown as ObjetPlan;
const maison = (batiment: Partial<ChampsBatiment> = {}, corps: CorpsToit[] = d.corps): ObjetPlan => ({
  key: 'maison', name: 'maison', type: 'polygon', fonction: 'batiment', pts: d.contour, elevation: 6,
  batiment: { toit: { forme: 'deux-pans', hauteur: 3, angleFaitage: 0, source: 'lidar' }, toitMesure: d.toitMesure, corpsToit: corps, ...batiment },
}) as unknown as ObjetPlan;
const trapezes = (): Map<string, MesureFacade> => new Map((['sud', 'nord'] as const).map((m) => {
  const cote = COTES[m];
  return [cleMesure('maison', cote), { cle: 'maison', cote, releve: null, rangReleve: 0, coinsTrouves: true, confiance: 0.9, hauteurM: null, couleur: null, silhouette: 'trapeze' as SilhouetteFacade }];
}));
function propositions(o: ObjetPlan, vu: CeQueJeVois = {}): Proposition[] {
  const capture = captureVide('78650000AE0101');
  if (Object.keys(vu).length) capture.batiments.maison = { facades: {}, vu, photos: [] };
  return avecPlacesApresForme(propositionsArbitrees({ objets: [parcelle, o], liste: listeDeControle([parcelle, o], capture), capture, mesures: trapezes() }, {}));
}
const forme = (ps: readonly Proposition[]) => ps.find((p) => p.effet.type === 'corpsToit');
const k = plusGrand(d.corps);
const principal = d.corps[k] as CorpsToit;

/** Le point a (s, t) du repere du corps : `s` le long du faitage, `t` en travers. */
function point(c: CorpsToit, s: number, t: number): PtBrut {
  const [p0, p1, , p3] = c.pts as [PtBrut, PtBrut, PtBrut, PtBrut];
  const L = Math.hypot(p1.x - p0.x, p1.y - p0.y), W = Math.hypot(p3.x - p0.x, p3.y - p0.y);
  return { x: p0.x + ((p1.x - p0.x) / L) * s + ((p3.x - p0.x) / W) * t, y: p0.y + ((p1.y - p0.y) / L) * s + ((p3.y - p0.y) / W) * t };
}

describe('un toit fige a la main (mode Toit, « Règles » coupees)', () => {
  it('sa forme proposee arrive decochee, comme un toit saisi : elle remplacerait le choix de la personne', () => {
    const libre = forme(propositions(maison()));
    expect(libre?.remplaceChoix).toBeNull();
    const p = forme(propositions(maison({ toitFige: true })));
    expect(p).toBeDefined();
    expect(p?.remplaceChoix).toBe('forme du toit saisie');
    expect(cochesParDefaut([p as Proposition]).size).toBe(0);
  });
});

describe('valider la forme du toit garde ce que portait le corps principal', () => {
  const L = Math.hypot(principal.pts[1]!.x - principal.pts[0]!.x, principal.pts[1]!.y - principal.pts[0]!.y);
  const centre = point(principal, L / 2, principal.posFaitage);
  const souche: Cheminee = { ...centre, largeurM: 0.6, profondeurM: 0.5, sommetM: principal.faitage + 0.4, position: 'faitage', source: 'observation' };
  const lucarne: Lucarne = { type: 'jacobine', pan: 0, debutM: L / 2 - 0.6, finM: L / 2 + 0.6, faitageM: principal.egouts[0] + 0.6 * (principal.faitage - principal.egouts[0]), profondeurM: 1.2, source: 'observation' };
  const garni = d.corps.map((c, i) => (i === k ? { ...c, cheminees: [souche], lucarnes: [lucarne] } : c));

  it('la cheminee et la lucarne passent sur le corps relu, a leur place, a la hauteur du corps neuf', () => {
    const p = forme(propositions(maison({}, garni)));
    const corps = (p?.effet as { corps: CorpsToit[] }).corps;
    const neuf = corps[plusGrand(corps)] as CorpsToit;
    expect(neuf.croupes?.every((h) => h > 0)).toBe(true);
    expect(neuf.cheminees).toHaveLength(1);
    expect(neuf.cheminees?.[0]).toMatchObject({ x: souche.x, y: souche.y, position: 'faitage' });
    expect(neuf.cheminees?.[0]?.sommetM).toBeCloseTo(neuf.faitage + 0.4, 2);
    expect(neuf.lucarnes).toHaveLength(1);
    expect(neuf.lucarnes?.[0]?.faitageM).toBeGreaterThan(Math.min(...neuf.egouts));
    expect(neuf.lucarnes?.[0]?.faitageM).toBeLessThan(neuf.faitage);
    // Ecrit dans le projet, rien ne s'est perdu ; et le toit est fige.
    const o = maison({}, garni);
    appliquerPropositions([o], [p as Proposition], [], '2026-10-28');
    expect(o.batiment?.corpsToit?.flatMap((c) => c.cheminees ?? [])).toHaveLength(1);
    expect(o.batiment?.corpsToit?.flatMap((c) => c.lucarnes ?? [])).toHaveLength(1);
    expect(o.batiment?.toitFige).toBe(true);
  });

  it('une terrasse ne se pose pas sur un corps relu en pente', () => {
    const p = forme(propositions(maison({}, d.corps.map((c, i) => (i === k ? { ...c, terrasse: { accessible: true, source: 'observation' as const } } : c)))));
    const corps = (p?.effet as { corps: CorpsToit[] }).corps;
    expect(corps[plusGrand(corps)]?.terrasse).toBeUndefined();
  });

  it('les cheminees vues, validees avec la forme, se posent sur le corps neuf et non sur l ancien', () => {
    const vu: CeQueJeVois = { cheminees: { nombre: 2, souches: [{ position: 'faitage', materiau: 'brique' }, { position: 'pignon', materiau: 'brique' }] } };
    const ps = propositions(maison(), vu);
    const ch = ps.find((p) => p.effet.type === 'cheminees');
    const p = forme(ps);
    expect(ch && p).toBeTruthy();
    const corps = (p?.effet as { corps: CorpsToit[] }).corps;
    const i = corpsDesCheminees(corps);
    const attendues = souchesSurLeCorps(corps[i] as CorpsToit, vu.cheminees!.souches!);
    const o = maison();
    appliquerPropositions([o], [ch as Proposition, p as Proposition], [], '2026-10-28');
    expect(o.batiment?.corpsToit?.[i]?.cheminees).toEqual(attendues);
    // Sans la forme, elles vont sur le corps d'aujourd'hui, comme avant.
    const seul = maison();
    appliquerPropositions([seul], [ch as Proposition], [], '2026-10-28');
    expect(seul.batiment?.corpsToit?.[corpsDesCheminees(d.corps)]?.cheminees).toEqual(souchesSurLeCorps(d.corps[corpsDesCheminees(d.corps)] as CorpsToit, vu.cheminees!.souches!));
  });
});

describe('valider la forme du toit garde les saillies, comme la relecture LiDAR', () => {
  const L = Math.hypot(principal.pts[1]!.x - principal.pts[0]!.x, principal.pts[1]!.y - principal.pts[0]!.y);
  const bow = corpsDeSaillie(principal, { genre: 'bow-window', hote: k, mur: 0, centreM: L / 2, largeurM: 2.4, profondeurM: 0.8, forme: 'rectangle', niveau: 'rdc', toit: 'pan' });
  const avecBow = [...d.corps, bow];

  it('le bow-window se repose sur le mur du corps relu, a sa place', () => {
    const p = forme(propositions(maison({}, avecBow)));
    const corps = (p?.effet as { corps: CorpsToit[] }).corps;
    const saillies = corps.filter((c) => c.saillie);
    expect(saillies).toHaveLength(1);
    const s = saillies[0]!.saillie!;
    expect(s).toMatchObject({ genre: 'bow-window', largeurM: 2.4, profondeurM: 0.8 });
    // Son hote est un corps relu (pas une saillie), et le point d'attache n'a pas bouge.
    const hote = corps[s.hote] as CorpsToit;
    expect(hote.saillie).toBeUndefined();
    const attache = (c: CorpsToit, mur: number, t: number) => { const a = c.pts[mur]!, b = c.pts[(mur + 1) % c.pts.length]!, l = Math.hypot(b.x - a.x, b.y - a.y); return { x: a.x + (b.x - a.x) / l * t, y: a.y + (b.y - a.y) / l * t }; };
    const avant = attache(principal, 0, L / 2), apres = attache(hote, s.mur, s.centreM);
    expect(Math.hypot(apres.x - avant.x, apres.y - avant.y)).toBeLessThan(0.8);
    // Ecrit dans le projet, il est la.
    const o = maison({}, avecBow);
    appliquerPropositions([o], [p as Proposition], [], '2026-10-28');
    expect(o.batiment?.corpsToit?.filter((c) => c.saillie)).toHaveLength(1);
  });
});

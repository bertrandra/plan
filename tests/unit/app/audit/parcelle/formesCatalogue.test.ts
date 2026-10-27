import { describe, it, expect } from 'vitest';
import { propositionsArbitrees } from '../../../../../src/app/audit/parcelle/arbitrages.js';
import { creerCapture } from '../../../../../src/app/audit/parcelle/capture.js';
import { listeDeControle } from '../../../../../src/app/audit/parcelle/liste.js';
import { reconstruireCorps } from '../../../../../src/facade/toits/toitCorps.js';
import { facettesCorps } from '../../../../../src/three/toitCorps3d.js';
import { appliquerPropositions } from '../../../../../src/regles/decisions.js';
import { formeDesCorps } from '../../../../../src/model/formeToit.js';
import { normalizeObjects } from '../../../../../src/model/normalisation.js';
import { brise, corps, rect, surface } from '../../../../fixtures/surfacesToits.js';
import type { CeQueJeVois } from '../../../../../src/model/ceQueJeVois.js';
import type { CorpsToit, ObjetBrut, ObjetPlan } from '../../../../../src/model/types.js';

// Les formes du catalogue, de la surface LiDAR a la proposition : le LiDAR voit un gambrel, la personne dit Mansart, et ce qui s'ecrit
// est le corps que la 3D dessine.

const L = 12, W = 8;
const gambrel = corps(L, W, { faitage: 7, profil: [brise, brise], bouts: [{ type: 'pignon' }, { type: 'pignon' }] });

function monter(vu: CeQueJeVois = {}, vrai: CorpsToit = gambrel, l = L, w = W) {
  const m = surface(vrai, l, w);
  const lus = reconstruireCorps(m, rect(l, w)) ?? [];
  const objets = normalizeObjects([
    { key: 'parcelle', name: 'parcelle', type: 'polygon', fonction: 'terrain', pts: rect(30, 30), cadastre: { idu: '78650000AE0101' } },
    { key: 'maison', name: 'maison', type: 'polygon', fonction: 'batiment', pts: rect(l, w), elevation: 3, batiment: { toit: { forme: 'deux-pans', hauteur: 4, angleFaitage: 0, source: 'lidar' }, toitMesure: m, corpsToit: lus },   },
  ] as ObjetBrut[]) as ObjetPlan[];
  const capture = creerCapture('78650000AE0101', () => new Date('2026-10-13T09:00:00Z'));
  if (Object.keys(vu).length) capture.noterVu('maison', vu);
  const c = capture.lire();
  return { objets, e: { objets, liste: listeDeControle(objets, c), capture: c, mesures: new Map() } };
}
const toit = (t: ReturnType<typeof monter>, choix = {}) => propositionsArbitrees(t.e, {}, undefined, choix).find((p) => p.id === 'maison:toit');

describe('une forme du catalogue vue par le LiDAR', () => {
  it('un gambrel : le constat LiDAR dit gambrel avec sa regle, et la proposition ecrit le corps a profil brise', () => {
    const t = monter();
    const p = toit(t);
    expect(p).toBeDefined();
    expect(p?.apres).toMatch(/^gambrel, ajustée sur la mesure LiDAR \(un bris à 1,\d+ m de l’égout/);
    const arb = p?.arbitrages?.find((a) => a.attribut === 'formeToit');
    // Le LiDAR seul ne decide pas d'une forme (3 x sa confiance reste sous SCORE_AUTO_MIN) : la ligne arrive decochee, avec sa raison.
    expect(arb).toMatchObject({ decision: 'manuelle', raison: expect.stringMatching(/Score insuffisant/) });
    expect(arb?.groupes[0]?.lignes[0]).toMatchObject({ source: 'lidar', regle: expect.stringContaining('ECART_PENTE_MIN_DEG = 12') });
    const c = (p?.effet as { corps: CorpsToit[] }).corps[0]!;
    expect(c.profil?.map((x) => x.type)).toEqual(['brise', 'brise']);
    expect(formeDesCorps([c])).toBe('gambrel');
  });

  it('se dessine : la 3D leve le corps sans erreur, avec des pans brises', () => {
    const c = ((toit(monter())?.effet as { corps: CorpsToit[] }).corps)[0]!;
    const f = facettesCorps(c, null, false);
    expect(f.pans.length).toBeGreaterThanOrEqual(4);
  });

  it('une fois ecrit, le toit ne se repropose plus : le gambrel du projet est celui que le LiDAR lit', () => {
    const t = monter();
    appliquerPropositions(t.objets, propositionsArbitrees(t.e, {}), [], '2026-10-13');
    const apres = { objets: t.objets, liste: listeDeControle(t.objets, t.e.capture), capture: t.e.capture, mesures: new Map() };
    expect(propositionsArbitrees(apres, {}).find((p) => p.id === 'maison:toit')).toBeUndefined();
  });

  it('la personne dit Mansart la ou le LiDAR voit un gambrel : le terrain l emporte, et le corps a des brisis aux bouts', () => {
    const t = monter({ forme: 'mansart' });
    const p = toit(t);
    expect(p?.apres).toMatch(/^mansart, ajustée/);
    const c = (p?.effet as { corps: CorpsToit[] }).corps[0]!;
    expect(c.bouts?.map((b) => b.type)).toEqual(['brisis', 'brisis']);
    expect(formeDesCorps([c])).toBe('mansart');
  });

  it('forcer une forme que personne n a vue : ajustee au mieux, et la ligne le dit', () => {
    const t = monter({}, corps(L, W, { faitage: 7 }));
    const p = toit(t, { 'batiment:maison|formeToit': { type: 'force', valeur: 'gambrel' } });
    if (p) expect(p.indices.some((i) => /forme demandée, ajustée au mieux/.test(i.texte))).toBe(true);
    // Un deux-pans que rien ne contredit ne devient pas un gambrel de force si l'ajustement est pire que le corps lu.
    expect(p === undefined || (p.effet as { corps: CorpsToit[] }).corps[0]?.profil !== undefined).toBe(true);
  });
});

describe('un toit de revolution et un papillon', () => {
  it('une tourelle conique de 8 m sur 8 : le LiDAR la lit, la proposition l ecrit avec sa speciale', () => {
    const t = monter({}, corps(8, 8, { faitage: 9, speciale: { type: 'conique' } }), 8, 8);
    const c = (toit(t)?.effet as { corps: CorpsToit[] } | undefined)?.corps[0];
    expect(c?.speciale).toEqual({ type: 'conique' });
  });

  it('un papillon lu comme deux appentis : un seul corps le remplace', () => {
    const t = monter({}, corps(L, W, { faitage: 3, egouts: [5.5, 5.5] }));
    const corpsLus = (t.objets[1] as ObjetPlan).batiment?.corpsToit!;
    expect(corpsLus.length).toBeGreaterThan(1);
    const c = (toit(t)?.effet as { corps: CorpsToit[] } | undefined)?.corps;
    expect(c).toHaveLength(1);
    expect(formeDesCorps(c ?? null)).toBe('papillon');
  });
});

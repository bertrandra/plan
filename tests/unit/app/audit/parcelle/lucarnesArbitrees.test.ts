import { describe, it, expect } from 'vitest';
import { propositionsArbitrees } from '../../../../../src/app/audit/parcelle/arbitrages.js';
import { votesDesBatiments } from '../../../../../src/app/audit/parcelle/propositionsClaude.js';
import { creerCapture } from '../../../../../src/app/audit/parcelle/capture.js';
import { listeDeControle } from '../../../../../src/app/audit/parcelle/liste.js';
import { appliquerPropositions, cocheeParDefaut } from '../../../../../src/regles/decisions.js';
import { normalizeObjects } from '../../../../../src/model/normalisation.js';
import { facettesLucarnes } from '../../../../../src/facade/toitFormes.js';
import { reponse } from '../../../../fixtures/audit/reponseClaude.js';
import type { CeQueJeVois } from '../../../../../src/model/ceQueJeVois.js';
import type { CorpsToit, Lucarne, ObjetBrut, ObjetPlan, PtBrut } from '../../../../../src/model/types.js';

// Les lucarnes, arbitrees : le LiDAR ne les voit pas (une cellule de 50 cm est plus large qu'une lucarne), leur nombre s'arbitre entre ce que la
// personne a note et ce que Claude voit ; elles s'ecrivent sur le plus grand corps en pente, a egale distance, et la ligne arrive decochee.

const rect = (x0: number, y0: number, x1: number, y1: number): PtBrut[] => [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];
const CORPS: CorpsToit = { pts: rect(5, 10, 15, 18), posFaitage: 4, faitage: 9, egouts: [6, 6], pignons: [], ecart: 0.1 };

function monter(vu: CeQueJeVois | null, claude: { n: number; types: string[]; pan: string } | null) {
  const objets = normalizeObjects([
    { key: 'parcelle', name: 'parcelle', type: 'polygon', fonction: 'terrain', pts: rect(0, 0, 20, 30), cadastre: { idu: '78650000AE0101' } },
    { key: 'maison', name: 'maison', type: 'polygon', fonction: 'batiment', pts: rect(5, 10, 15, 18), elevation: 6, toit: { forme: 'deux-pans', hauteur: 3, angleFaitage: 0 }, corpsToit: [CORPS] },
  ] as ObjetBrut[]) as ObjetPlan[];
  const capture = creerCapture('78650000AE0101', () => new Date('2026-10-13T09:00:00Z'));
  if (vu) capture.noterVu('maison', vu);
  const c = capture.lire();
  const votes = claude === null ? {} : votesDesBatiments({ maison: { reponses: [0, 1, 2].map(() => reponse({ lucarnes: { indices: [{ image: 1, vu: 'des lucarnes' }], nombre: claude.n, types: claude.types, pan: claude.pan } })), etiquettes: [] } });
  return { objets, e: { objets, liste: listeDeControle(objets, c), capture: c, mesures: new Map() }, votes };
}
const lucarnes = (t: ReturnType<typeof monter>, choix = {}) => propositionsArbitrees(t.e, t.votes, undefined, choix).find((p) => p.id === 'maison:lucarnes');
const ecrites = (p: ReturnType<typeof lucarnes>) => (p?.effet as { lucarnes: Lucarne[] }).lucarnes;

describe('les lucarnes arbitrees', () => {
  it('Claude seul n en decide pas : la ligne attend la personne, avec les types et le pan vus', () => {
    const p = lucarnes(monter(null, { n: 2, types: ['jacobine', 'capucine'], pan: 'rue' }));
    expect(p).toMatchObject({ source: 'arbitrage', avant: 'aucune lucarne', apres: '2 lucarnes, vues par Claude', effet: { type: 'lucarnes', corps: 0 } });
    expect(p?.arbitrages?.[0]).toMatchObject({ attribut: 'lucarnes', decision: 'manuelle' });
    expect(ecrites(p).map((l) => [l.type, l.pan])).toEqual([['jacobine', 0], ['capucine', 0]]);
    expect(ecrites(p).every((l) => l.source === 'observation' && l.finM > l.debutM)).toBe(true);
    expect(cocheeParDefaut(p!)).toBe(false);
  });

  it('la personne en a vu 3 sur les deux pans, Claude 2 : la personne l emporte, les pans alternent', () => {
    const p = lucarnes(monter({ lucarnes: { nombre: 3, pan: 'les-deux' } }, { n: 2, types: ['jacobine'], pan: 'rue' }));
    expect(p?.arbitrages?.[0]).toMatchObject({ decision: 'auto' });
    expect(p?.apres).toMatch(/^3 lucarnes.*sur place/);
    expect(ecrites(p).map((l) => l.pan).sort()).toEqual([0, 0, 1]);
    // Sans type connu, la lucarne se dessine comme une jacobine (type « inconnue »).
    expect(ecrites(p).every((l) => l.type === 'inconnue')).toBe(true);
    expect(p?.reserve).toMatch(/à ajuster/);
  });

  it('une fois ecrites, les lucarnes se dessinent sur le pan', () => {
    const t = monter({ lucarnes: { nombre: 2, pan: 'rue' } }, null);
    appliquerPropositions(t.objets, propositionsArbitrees(t.e, {}), [], '2026-10-13');
    const c = t.objets.find((o) => o.key === 'maison')?.corpsToit?.[0] as CorpsToit;
    expect(c.lucarnes).toHaveLength(2);
    expect(facettesLucarnes(c, 10, 8).pans.length).toBeGreaterThan(0);
  });

  it('un nombre force, et le retrait de celles qu une observation avait posees', () => {
    const p = lucarnes(monter(null, null), { 'batiment:maison|lucarnes': { type: 'force', valeur: 1 } });
    expect(p?.arbitrages?.[0]).toMatchObject({ decision: 'forcee' });
    expect(p?.apres).toBe('1 lucarne, forcée par vous');
    const t = monter({ lucarnes: { nombre: 1 } }, null);
    appliquerPropositions(t.objets, propositionsArbitrees(t.e, {}), [], '2026-10-13');
    const capture = creerCapture('78650000AE0101', () => new Date('2026-10-13T09:00:00Z'));
    capture.noterVu('maison', { lucarnes: { nombre: 0 } });
    const c = capture.lire();
    const retire = propositionsArbitrees({ objets: t.objets, liste: listeDeControle(t.objets, c), capture: c, mesures: new Map() }, {}).find((x) => x.id === 'maison:lucarnes');
    expect(retire).toMatchObject({ apres: expect.stringMatching(/^Aucune lucarne/), effet: { lucarnes: [] } });
  });

  it('rien quand personne ne dit rien', () => {
    expect(lucarnes(monter(null, null))).toBeUndefined();
  });
});

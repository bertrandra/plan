import { describe, it, expect } from 'vitest';
import { propositionsArbitrees } from '../../../../../src/app/audit/parcelle/arbitrages.js';
import { votesDesBatiments } from '../../../../../src/app/audit/parcelle/propositionsClaude.js';
import { creerCapture } from '../../../../../src/app/audit/parcelle/capture.js';
import { listeDeControle } from '../../../../../src/app/audit/parcelle/liste.js';
import { appliquerPropositions } from '../../../../../src/regles/decisions.js';
import { normalizeObjects } from '../../../../../src/model/normalisation.js';
import { reponse } from '../../../../fixtures/audit/reponseClaude.js';
import type { CeQueJeVois } from '../../../../../src/model/ceQueJeVois.js';
import type { CorpsToit, ObjetBrut, ObjetPlan, PtBrut } from '../../../../../src/model/types.js';

// Les cheminees, arbitrees : leur nombre entre ce que la personne a note et ce que Claude voit ; ce qui s'ecrit, ce sont les souches du constat qui l'emporte.

const rect = (x0: number, y0: number, x1: number, y1: number): PtBrut[] => [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];
const CORPS: CorpsToit = { pts: rect(5, 10, 15, 18), posFaitage: 4, faitage: 9, egouts: [6, 6], pignons: [], ecart: 0.1 };
const souche = (n: number) => Array.from({ length: n }, () => ({ position: 'pignon' as const, materiau: 'pierre' as const }));

function monter(vu: CeQueJeVois | null, claude: number | null) {
  const objets = normalizeObjects([
    { key: 'parcelle', name: 'parcelle', type: 'polygon', fonction: 'terrain', pts: rect(0, 0, 20, 30), cadastre: { idu: '78650000AE0101' } },
    { key: 'maison', name: 'maison', type: 'polygon', fonction: 'batiment', pts: rect(5, 10, 15, 18), elevation: 6, batiment: { toit: { forme: 'deux-pans', hauteur: 3, angleFaitage: 0 }, corpsToit: [CORPS] },  },
  ] as ObjetBrut[]) as ObjetPlan[];
  const capture = creerCapture('78650000AE0101', () => new Date('2026-10-13T09:00:00Z'));
  if (vu) capture.noterVu('maison', vu);
  const c = capture.lire();
  const votes = claude === null ? {} : votesDesBatiments({ maison: { reponses: [0, 1, 2].map(() => reponse({ cheminees: { indices: [{ image: 1, vu: 'des souches' }], nombre: claude, souches: souche(claude) } })), etiquettes: [] } });
  const e = { objets, liste: listeDeControle(objets, c), capture: c, mesures: new Map() };
  return { objets, e, votes };
}
const cheminees = (t: ReturnType<typeof monter>, choix = {}) => propositionsArbitrees(t.e, t.votes, undefined, choix).find((p) => p.id === 'maison:cheminees');
const ecrites = (p: ReturnType<typeof cheminees>) => (p?.effet as { cheminees: { materiau?: string; position: string }[] }).cheminees;

describe('les cheminees arbitrees', () => {
  it('la personne en a vu 2, Claude 3 : la personne l emporte, cochee, avec ses souches ; Claude se lit dessous', () => {
    const t = monter({ cheminees: { nombre: 2, souches: [{ position: 'faitage', materiau: 'brique' }, { position: 'faitage', materiau: 'brique' }] } }, 3);
    const p = cheminees(t);
    expect(p).toMatchObject({ source: 'arbitrage', avant: 'aucune cheminée', effet: { type: 'cheminees', corps: 0 } });
    expect(p?.apres).toMatch(/^2 cheminées.*vues sur place/);
    expect(ecrites(p).map((c) => c.materiau)).toEqual(['brique', 'brique']);
    const arb = p?.arbitrages?.[0];
    expect(arb).toMatchObject({ attribut: 'cheminees', decision: 'auto' });
    expect(arb?.groupes.map((g) => [g.valeur, g.retenu])).toEqual([['2 cheminées', true], ['3 cheminées', false]]);
  });

  it('la personne retient le groupe de Claude : ce sont les souches de Claude qui s ecrivent', () => {
    const t = monter({ cheminees: { nombre: 2, souches: [{ position: 'faitage' }, { position: 'faitage' }] } }, 3);
    const p = cheminees(t, { 'batiment:maison|cheminees': { type: 'groupe', index: 1 } });
    expect(p?.apres).toMatch(/^3 cheminées, vues par Claude/);
    expect(ecrites(p)).toHaveLength(3);
    expect(ecrites(p).every((c) => c.materiau === 'pierre' && c.position === 'pignon')).toBe(true);
    expect(p?.arbitrages?.[0]).toMatchObject({ decision: 'choisie' });
  });

  it('Claude seul ne decide pas : la ligne arrive decochee, avec sa raison', () => {
    const p = cheminees(monter(null, 2));
    expect(p?.apres).toBe('2 cheminées, vues par Claude');
    expect(p?.arbitrages?.[0]).toMatchObject({ decision: 'manuelle' });
    expect(p?.reserve).toMatch(/Claude seul ne décide pas/);
  });

  it('un nombre force, sans souches connues : posees au faitage', () => {
    const p = cheminees(monter(null, null), { 'batiment:maison|cheminees': { type: 'force', valeur: 2 } });
    expect(p?.arbitrages?.[0]).toMatchObject({ decision: 'forcee' });
    expect(p?.apres).toBe('2 cheminées, forcées par vous');
    expect(ecrites(p).map((c) => c.position)).toEqual(['faitage', 'faitage']);
  });

  it('rien quand le projet a deja ce nombre, ou quand personne ne dit rien', () => {
    expect(cheminees(monter(null, null))).toBeUndefined();
    const t = monter({ cheminees: { nombre: 1, souches: [{ position: 'faitage' }] } }, null);
    appliquerPropositions(t.objets, propositionsArbitrees(t.e, t.votes), [], '2026-10-13');
    const apres = { ...t, e: { ...t.e, objets: t.objets } };
    expect(cheminees(apres)).toBeUndefined();
  });

  it('une cheminee deja notee et que la personne dit absente : la ligne les retire', () => {
    const t = monter({ cheminees: { nombre: 1, souches: [{ position: 'faitage' }] } }, null);
    appliquerPropositions(t.objets, propositionsArbitrees(t.e, t.votes), [], '2026-10-13');
    const m = t.objets.find((o) => o.key === 'maison')!;
    expect(m.batiment?.corpsToit?.[0]?.cheminees).toHaveLength(1);
    const capture = creerCapture('78650000AE0101', () => new Date('2026-10-13T09:00:00Z'));
    capture.noterVu('maison', { cheminees: { nombre: 0, souches: [] } });
    const c = capture.lire();
    const p = propositionsArbitrees({ objets: t.objets, liste: listeDeControle(t.objets, c), capture: c, mesures: new Map() }, {}).find((x) => x.id === 'maison:cheminees');
    expect(p).toMatchObject({ apres: expect.stringMatching(/^Aucune cheminée/), effet: { cheminees: [] } });
  });
});

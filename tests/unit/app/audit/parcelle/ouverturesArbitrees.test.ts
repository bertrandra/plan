import { describe, it, expect } from 'vitest';
import { propositionsArbitrees } from '../../../../../src/app/audit/parcelle/arbitrages.js';
import { propositionsRenfort } from '../../../../../src/app/audit/parcelle/propositionsClaude.js';
import { cleMesure } from '../../../../../src/app/audit/parcelle/propositions.js';
import { creerCapture } from '../../../../../src/app/audit/parcelle/capture.js';
import { listeDeControle } from '../../../../../src/app/audit/parcelle/liste.js';
import { normalizeObjects } from '../../../../../src/model/normalisation.js';
import type { MesureFacade } from '../../../../../src/app/audit/parcelle/mesures.js';
import type { RenfortFacadeCapture } from '../../../../../src/model/auditParcelle.js';
import type { CorpsToit, ObjetBrut, ObjetPlan, OuvertureFacade, PtBrut, ReleveFacade } from '../../../../../src/model/types.js';

// Les ouvertures d'une facade, arbitrees : le nombre releve sur la photo contre celui du releve renforce par Claude ; ce qui s'ecrit, c'est le releve du constat retenu.

const rect = (x0: number, y0: number, x1: number, y1: number): PtBrut[] => [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];
const CORPS: CorpsToit = { pts: rect(5, 10, 15, 18), posFaitage: 4, faitage: 9, egouts: [6, 6], pignons: [], ecart: 0.1 };
const fenetres = (n: number): OuvertureFacade[] => Array.from({ length: n }, (_, k) => ({ type: 'fenetre' as const, x: 0.5 + k, y: 1, l: 0.8, h: 1.2 }));
const releve = (n: number): ReleveFacade => ({ cote: 0, largeur: 10, hauteur: 5.82, texture: 'data:image/jpeg;base64,AA', hauteurTexture: 7, distance: 8, sourceDistance: 'gps', releveLe: '2026-10-13T09:00:00Z', ouvertures: fenetres(n) });
const renfort = (n: number): RenfortFacadeCapture => ({ passes: 3, ouvertures: fenetres(n), decochees: [], bilan: { graines: n, pleines: n }, resume: n + ' graines' });

function monter(photo: number | null, claude: number | null, m: Partial<MesureFacade> = {}) {
  const objets = normalizeObjects([
    { key: 'parcelle', name: 'parcelle', type: 'polygon', fonction: 'terrain', pts: rect(0, 0, 20, 30), cadastre: { idu: '78650000AE0101' } },
    { key: 'maison', name: 'maison', type: 'polygon', fonction: 'batiment', pts: rect(5, 10, 15, 18), elevation: 6, toit: { forme: 'deux-pans', hauteur: 3, angleFaitage: 0 }, corpsToit: [CORPS] },
  ] as ObjetBrut[]) as ObjetPlan[];
  const capture = creerCapture('78650000AE0101', () => new Date('2026-10-13T09:00:00Z'));
  const c = capture.lire();
  const mesures = new Map<string, MesureFacade>(photo === null ? [] : [[cleMesure('maison', 0), { cle: 'maison', cote: 0, releve: releve(photo), rangReleve: 0, coinsTrouves: true, confiance: 0.9, hauteurM: null, couleur: null, ...m } as MesureFacade]]);
  const rf = claude === null ? null : { [cleMesure('maison', 0)]: renfort(claude) };
  return { objets, e: { objets, liste: listeDeControle(objets, c), capture: c, mesures, renfort: rf } };
}
const releveDe = (t: ReturnType<typeof monter>, choix = {}) => propositionsArbitrees(t.e, {}, undefined, choix).find((p) => p.id === 'maison#0:releve');
const nombre = (p: ReturnType<typeof releveDe>) => (p?.effet as { releve: ReleveFacade }).releve.ouvertures.length;

describe('les ouvertures des facades arbitrees', () => {
  it('la photo seule decide : le releve s ecrit, cochable d office', () => {
    const p = releveDe(monter(4, null));
    expect(p).toMatchObject({ source: 'arbitrage', avant: 'aucun relevé', apres: '4 ouvertures relevées (4 fenêtres), texture de la photo' });
    expect(p?.arbitrages?.[0]).toMatchObject({ attribut: 'ouverturesFacade', decision: 'auto' });
  });

  it('Claude compte une ouverture de plus : les sources s accordent, le releve de la photo s ecrit', () => {
    const p = releveDe(monter(4, 5));
    expect(p?.arbitrages?.[0]?.groupes).toHaveLength(1);
    expect(p?.arbitrages?.[0]).toMatchObject({ decision: 'auto' });
    expect(nombre(p)).toBe(4);
  });

  it('Claude en voit beaucoup plus : la photo l emporte de la marge requise, Claude reste lisible dessous', () => {
    const p = releveDe(monter(4, 9));
    expect(p?.arbitrages?.[0]?.groupes.map((g) => g.retenu)).toEqual([true, false]);
    expect(p?.arbitrages?.[0]).toMatchObject({ decision: 'auto' });
    expect(nombre(p)).toBe(4);
  });

  it('la personne retient le groupe de Claude : c est son releve qui s ecrit', () => {
    const p = releveDe(monter(4, 9), { 'facade:maison#0|ouverturesFacade': { type: 'groupe', index: 1 } });
    expect(p?.arbitrages?.[0]).toMatchObject({ decision: 'choisie' });
    expect(nombre(p)).toBe(9);
    expect(p?.apres).toMatch(/avec l’aide de Claude/);
  });

  it('sans releve mesure, rien a proposer', () => {
    expect(releveDe(monter(null, 3))).toBeUndefined();
  });

  it('la ligne du releve renforce de Claude reste proposee, decochee, en alternative', () => {
    const t = monter(4, 5);
    const lignes = propositionsRenfort(t.e, t.e.renfort as Record<string, RenfortFacadeCapture>);
    expect(lignes.map((p) => p.id)).toEqual(['maison#0:claude:releve']);
    expect(lignes[0]?.reserve).toMatch(/Taux d’accord/);
  });
});

import { describe, it, expect, vi } from 'vitest';
import { creerValidation, type ProjetAudit } from '../../../../../src/app/audit/parcelle/validation.js';
import { creerCapture } from '../../../../../src/app/audit/parcelle/capture.js';
import { listeDeControle } from '../../../../../src/app/audit/parcelle/liste.js';
import { normalizeObjects } from '../../../../../src/model/normalisation.js';
import { reponse } from '../../../../fixtures/audit/reponseClaude.js';
import type { EtatApp } from '../../../../../src/core/state.js';
import type { CorpsToit, ObjetBrut, ObjetPlan, PtBrut } from '../../../../../src/model/types.js';

// Decision D21 (MD/plan-vague-3-generaliser.md), maintenant tenue par l'arbitrage des sources : la valeur notee sur place et celle de
// Claude sont deux constats d'un meme attribut, et la personne qui etait devant le batiment l'emporte par son poids. Une seule ligne
// est proposee ; l'autre valeur se lit dessous, et la personne peut la retenir.

const rect = (x0: number, y0: number, x1: number, y1: number): PtBrut[] => [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];
const obj = (key: string, plus: Partial<ObjetPlan>): ObjetPlan => ({ key, name: key, type: 'polygon', ...plus } as ObjetPlan);
const CORPS: CorpsToit = { pts: rect(5, 10, 15, 18), posFaitage: 4, faitage: 9, egouts: [6, 6], pignons: [], ecart: 0.1 };

/** Un projet sans couverture choisie, notee « ardoise » sur place ; Claude, lui, voit du zinc (trois passes). */
function monter(noteSurPlace: boolean, couvertureClaude = 'zinc') {
  const objets = normalizeObjects([
    obj('parcelle', { fonction: 'terrain', pts: rect(0, 0, 20, 30), cadastre: { idu: '78650000AE0101', origineLat: 48.9, origineLon: 2.13 } }),
    obj('maison', { fonction: 'batiment', pts: rect(5, 10, 15, 18), elevation: 6, batiment: { toit: { forme: 'deux-pans', hauteur: 3, angleFaitage: 0 }, corpsToit: [CORPS] },  }),
  ] as ObjetBrut[]) as ObjetPlan[];
  const etat = { objects: objets, measures: [], selectedKey: null, dirty: false } as unknown as EtatApp;
  const capture = creerCapture('78650000AE0101', () => new Date('2026-10-13T09:00:00Z'));
  if (noteSurPlace) capture.noterVu('maison', { couverture: 'ardoise' });
  const passes = [0, 1, 2].map(() => reponse({ couverture: { indices: [{ image: 1, vu: 'des plaques gris clair' }], valeur: couvertureClaude } }));
  const projet: ProjetAudit = { pushHistory: () => {}, render: vi.fn(), refaire3d: vi.fn(), remplacer3d: () => true };
  const v = creerValidation({
    etat, capture, liste: () => listeDeControle(etat.objects, capture.lire()), projet, signaler: () => {},
    maintenant: () => new Date('2026-10-13T09:00:00Z'),
    mesures: { pixels: async () => null, chercherCoins: async () => ({ distorsion: null, coins: null }), jpeg: () => '', limites: () => [] },
    analyse: { reponses: () => ({ maison: { reponses: passes, etiquettes: [] } }), version: () => 1 },
  });
  return { etat, v };
}
const couverture = 'maison:couverture';
const decision = (t: ReturnType<typeof monter>) => t.v.propositions().find((p) => p.id === couverture)?.arbitrages?.[0];

describe('la valeur notee sur place et celle de Claude, arbitrees', () => {
  it('une seule ligne, cochee : ce que la personne a note l emporte, et les deux sources se lisent dessous', async () => {
    const t = monter(true);
    await t.v.lancer();
    const lignes = t.v.propositions().filter((p) => p.effet.type === 'couverture');
    expect(lignes.map((p) => p.id)).toEqual([couverture]);
    expect(lignes[0]).toMatchObject({ source: 'arbitrage', apres: 'Ardoise, vue sur place', effet: { couverture: 'ardoise' } });
    expect(decision(t)).toMatchObject({ attribut: 'couverture', decision: 'auto' });
    expect(decision(t)?.groupes.map((g) => [g.valeur, g.retenu])).toEqual([['Ardoise', true], ['Zinc', false]]);
    expect(t.v.cochee(couverture)).toBe(true);
  });

  it('la personne choisit Claude : la ligne dit zinc, se coche, et c est le zinc qui s ecrit', async () => {
    const t = monter(true);
    await t.v.lancer();
    t.v.decider('batiment:maison', 'couverture', { type: 'groupe', index: 1 });
    expect(decision(t)).toMatchObject({ decision: 'choisie' });
    expect(t.v.propositions().find((p) => p.id === couverture)).toMatchObject({ apres: expect.stringContaining('Zinc') });
    expect(t.v.cochee(couverture)).toBe(true);
    t.v.valider();
    expect(t.etat.objects.find((o) => o.key === 'maison')?.batiment?.toit?.couverture).toBe('zinc');
  });

  it('reprendre le choix du moteur rend l ardoise ; sans rien changer, l ardoise s ecrit', async () => {
    const t = monter(true);
    await t.v.lancer();
    t.v.decider('batiment:maison', 'couverture', { type: 'groupe', index: 1 });
    t.v.decider('batiment:maison', 'couverture', null);
    expect(decision(t)?.decision).toBe('auto');
    t.v.valider();
    expect(t.etat.objects.find((o) => o.key === 'maison')?.batiment?.toit?.couverture).toBe('ardoise');
  });

  it('sans note sur place, Claude seul ne decide pas : la ligne arrive decochee, avec sa raison', async () => {
    const t = monter(false);
    await t.v.lancer();
    const p = t.v.propositions().find((x) => x.id === couverture);
    expect(p).toBeDefined();
    expect(p?.arbitrages?.[0]).toMatchObject({ decision: 'manuelle' });
    expect(p?.reserve).toMatch(/Claude seul ne décide pas/);
    expect(t.v.cochee(couverture)).toBe(false);
    t.v.basculer(couverture);
    expect(t.v.cochee(couverture)).toBe(true);
  });
});

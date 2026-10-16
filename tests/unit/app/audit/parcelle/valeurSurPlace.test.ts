import { describe, it, expect, vi } from 'vitest';
import { creerValidation, type ProjetAudit } from '../../../../../src/app/audit/parcelle/validation.js';
import { creerCapture } from '../../../../../src/app/audit/parcelle/capture.js';
import { listeDeControle } from '../../../../../src/app/audit/parcelle/liste.js';
import { normalizeObjects } from '../../../../../src/model/normalisation.js';
import { RESERVE_NOTE_SUR_PLACE } from '../../../../../src/regles/decisions.js';
import { reponse } from '../../../../fixtures/audit/reponseClaude.js';
import type { EtatApp } from '../../../../../src/core/state.js';
import type { CorpsToit, ObjetBrut, ObjetPlan, PtBrut } from '../../../../../src/model/types.js';

// Decision D21 (MD/plan-vague-3-generaliser.md) : la valeur notee sur place et celle de Claude, toutes deux
// proposees, ne sont pas cochees ensemble. La personne qui etait devant le batiment l'emporte : cocher la
// ligne de Claude decoche la note, et la ligne de Claude arrive decochee.

const rect = (x0: number, y0: number, x1: number, y1: number): PtBrut[] => [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];
const obj = (key: string, plus: Partial<ObjetPlan>): ObjetPlan => ({ key, name: key, type: 'polygon', ...plus } as ObjetPlan);
const CORPS: CorpsToit = { pts: rect(5, 10, 15, 18), posFaitage: 4, faitage: 9, egouts: [6, 6], pignons: [], ecart: 0.1 };

/** Un projet sans couverture choisie, notee « ardoise » sur place ; Claude, lui, voit du zinc (trois passes). */
function monter(noteSurPlace: boolean, couvertureClaude = 'zinc') {
  const objets = normalizeObjects([
    obj('parcelle', { fonction: 'terrain', pts: rect(0, 0, 20, 30), cadastre: { idu: '78650000AE0101', origineLat: 48.9, origineLon: 2.13 } }),
    obj('maison', { fonction: 'batiment', pts: rect(5, 10, 15, 18), elevation: 6, toit: { forme: 'deux-pans', hauteur: 3, angleFaitage: 0 }, corpsToit: [CORPS] }),
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
const note = 'maison:couverture', claude = 'maison:claude:couverture';

describe('la valeur notee sur place et celle de Claude', () => {
  it('les deux sont proposees, celle de Claude arrive decochee avec la raison, la note est cochee', async () => {
    const t = monter(true);
    await t.v.lancer();
    const ids = t.v.propositions().map((p) => p.id);
    expect(ids).toContain(note);
    expect(ids).toContain(claude);
    // La raison d'avant (taux d'accord non mesure) reste, la nouvelle s'y ajoute.
    expect(t.v.propositions().find((p) => p.id === claude)?.reserve).toMatch(/Taux d’accord de Claude non encore mesuré.* Vous avez noté cet attribut sur place/);
    expect(t.v.cochee(note)).toBe(true);
    expect(t.v.cochee(claude)).toBe(false);
  });

  it('cocher la ligne de Claude decoche la note, et inversement : jamais les deux', async () => {
    const t = monter(true);
    await t.v.lancer();
    t.v.basculer(claude);
    expect(t.v.cochee(claude)).toBe(true);
    expect(t.v.cochee(note)).toBe(false);
    t.v.basculer(note);
    expect(t.v.cochee(note)).toBe(true);
    expect(t.v.cochee(claude)).toBe(false);
    // Decocher ne rend rien a personne.
    t.v.basculer(note);
    expect(t.v.cochee(note)).toBe(false);
    expect(t.v.cochee(claude)).toBe(false);
  });

  it('ecrit la valeur de Claude quand la personne la choisit, et celle de la note sinon', async () => {
    const choisi = monter(true);
    await choisi.v.lancer();
    choisi.v.basculer(claude);
    choisi.v.valider();
    expect(choisi.etat.objects.find((o) => o.key === 'maison')?.toit?.couverture).toBe('zinc');
    const parDefaut = monter(true);
    await parDefaut.v.lancer();
    parDefaut.v.valider();
    expect(parDefaut.etat.objects.find((o) => o.key === 'maison')?.toit?.couverture).toBe('ardoise');
  });

  it('sans note sur place, Claude garde sa raison d avant (le taux d accord) et rien ne change', async () => {
    const t = monter(false);
    await t.v.lancer();
    const p = t.v.propositions().find((x) => x.id === claude);
    expect(p).toBeDefined();
    expect(p?.reserve).not.toContain(RESERVE_NOTE_SUR_PLACE);
    expect(t.v.propositions().some((x) => x.id === note)).toBe(false);
    t.v.basculer(claude);
    expect(t.v.cochee(claude)).toBe(true);
  });
});

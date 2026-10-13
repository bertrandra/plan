import { describe, it, expect, vi } from 'vitest';
import { creerValidation, type ProjetAudit } from '../../../../../src/app/audit/parcelle/validation.js';
import { creerCapture } from '../../../../../src/app/audit/parcelle/capture.js';
import { listeDeControle } from '../../../../../src/app/audit/parcelle/liste.js';
import { creerHistorique } from '../../../../../src/core/historique.js';
import { serializeObjects, serializeMeasures } from '../../../../../src/io/serialisation.js';
import { normalizeObjects } from '../../../../../src/model/normalisation.js';
import { clotureDImport, clotureDe } from '../../../../../src/model/cloture.js';
import type { EtatApp } from '../../../../../src/core/state.js';
import type { CorpsToit, ObjetBrut, ObjetPlan, PtBrut } from '../../../../../src/model/types.js';

// La validation des propositions (MD/spec-audit.md §14) avec le vrai historique : l'apercu ne touche
// pas le projet, « Valider » ecrit tout ce qui est coche en un seul pas, Ctrl+Z le defait au bit pres.

const rect = (x0: number, y0: number, x1: number, y1: number): PtBrut[] => [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];
const obj = (key: string, plus: Partial<ObjetPlan>): ObjetPlan => ({ key, name: key, type: 'polygon', ...plus } as ObjetPlan);
const CORPS: CorpsToit = { pts: rect(5, 10, 15, 18), posFaitage: 4, faitage: 9, egouts: [6, 6], pignons: [], ecart: 0.1 };

function monter() {
  const objets = normalizeObjects([
    obj('parcelle', { fonction: 'terrain', pts: rect(0, 0, 20, 30), cadastre: { idu: '78650000AE0101', origineLat: 48.9, origineLon: 2.13 }, cloture: clotureDImport(rect(0, 0, 20, 30), 0) }),
    obj('maison', { fonction: 'batiment', pts: rect(5, 10, 15, 18), elevation: 6, toit: { forme: 'deux-pans', hauteur: 3, angleFaitage: 0 }, corpsToit: [CORPS] }),
  ] as ObjetBrut[]) as ObjetPlan[];
  const etat = { objects: objets, measures: [], selectedKey: null, dirty: false } as unknown as EtatApp;
  const historique = creerHistorique(etat as never, {
    serializeObjects: (o) => serializeObjects(o as ObjetPlan[]), serializeMeasures: (m) => serializeMeasures(m as never),
    normalizeObjects: (b) => normalizeObjects(b) as never, detruireVue: () => {}, createObjectDOM: () => {}, rebuildHandles: () => {},
    reapplyStackingOrder: () => {}, rebuildSelector: () => {}, render: () => {}, boutonAnnuler: () => null,
  });
  const capture = creerCapture('78650000AE0101', () => new Date('2026-10-13T09:00:00Z'));
  // Ce que l'on a vu : brique, ardoise, deux cheminees, un mur de 1,60 m sur rue ; aucune photo.
  capture.noterVu('maison', { forme: 'deux-pans', murs: 'brique', couverture: 'ardoise', cheminees: { nombre: 2, souches: [{ position: 'faitage' }, { position: 'pan' }] } });
  capture.noterCloture({ type: 'mur', hauteurM: 1.6 });
  const remplacer3d = vi.fn<ProjetAudit['remplacer3d']>(() => true);
  const projet: ProjetAudit = { pushHistory: () => historique.empiler(), render: vi.fn(), refaire3d: vi.fn(), remplacer3d };
  const messages: string[] = [];
  const v = creerValidation({
    etat, capture, liste: () => listeDeControle(etat.objects, capture.lire()), projet, signaler: (m) => messages.push(m),
    maintenant: () => new Date('2026-10-13T09:00:00Z'),
    mesures: { pixels: async () => null, chercherCoins: async () => ({ distorsion: null, coins: null }), jpeg: () => '', limites: () => [] },
  });
  const plan = () => JSON.stringify(serializeObjects(etat.objects));
  return { etat, historique, capture, projet, remplacer3d, v, messages, plan };
}

describe('la validation des propositions', () => {
  it('montre l apercu dans la Vue 3D sans toucher le projet', async () => {
    const t = monter();
    await t.v.lancer();
    const avant = t.plan();
    expect(t.v.propositions().map((p) => p.id)).toEqual(['maison:materiauMurs', 'maison:couverture', 'maison:cheminees', 'parcelle:cloture']);
    t.v.montrer('apres');
    const [cles, objets] = t.remplacer3d.mock.calls.at(-1) ?? [];
    expect(cles).toEqual(['maison']);
    const copie = objets?.find((o) => o.key === 'maison');
    expect(copie).not.toBe(t.etat.objects[1]);
    expect(copie?.toit?.couverture).toBe('ardoise');
    expect(copie?.corpsToit?.[0]?.cheminees).toHaveLength(2);
    // Decocher une ligne : l'apercu suit.
    t.v.basculer('maison:couverture');
    expect(t.remplacer3d.mock.calls.at(-1)?.[1]?.find((o) => o.key === 'maison')?.toit?.couverture).toBeUndefined();
    t.v.montrer('avant');
    expect(t.remplacer3d).toHaveBeenLastCalledWith(['maison']);
    expect(t.plan()).toBe(avant);
    expect(t.etat.dirty).toBe(false);
    expect(t.historique.pile.taille).toBe(0);
  });

  it('ecrit ce qui est coche en un seul pas d historique, que Ctrl+Z defait au bit pres', async () => {
    const t = monter();
    await t.v.lancer();
    const avant = t.plan();
    t.v.basculer('maison:couverture');
    const r = t.v.valider();
    expect(r).toEqual({ ecrites: 3, verifies: 0 });
    expect(t.historique.pile.taille).toBe(1);
    expect(t.etat.dirty).toBe(true);
    const maison = t.etat.objects.find((o) => o.key === 'maison');
    expect(maison?.couleurMurs?.materiau).toBe('brique');
    expect(maison?.toit?.couverture).toBeUndefined();
    expect(maison?.corpsToit?.[0]?.cheminees?.map((c) => c.position)).toEqual(['faitage', 'pan']);
    expect(clotureDe(t.etat.objects[0] as ObjetPlan).cotes[0]).toMatchObject({ type: 'mur', hauteur: 1.6 });
    expect(t.projet.render).toHaveBeenCalledOnce();
    expect(t.projet.refaire3d).toHaveBeenCalledOnce();
    expect(t.messages.at(-1)).toBe('3 changements écrits dans le projet. Ctrl+Z les défait.');
    // La decision est gardee avec la capture, pour le fichier de l'audit.
    expect(t.capture.lire().decisions).toEqual([{ t: '2026-10-13T09:00:00.000Z', acceptees: ['maison:materiauMurs', 'maison:cheminees', 'parcelle:cloture'], refusees: ['maison:couverture'], verifies: [] }]);
    // Ce qui est ecrit survit a un enregistrement.
    expect(t.plan()).toContain('"materiau":"brique"');
    t.historique.annuler();
    expect(t.plan()).toBe(avant);
    expect(t.historique.pile.taille).toBe(0);
  });

  it('marque verifie sur place un batiment dont toit et facades sont vus, et le garde a l enregistrement', async () => {
    const t = monter();
    for (const f of listeDeControle(t.etat.objects, t.capture.lire()).batiments[0]?.facades ?? []) t.capture.basculerInaccessible('maison', f.cote, false);
    await t.v.lancer();
    expect(t.v.verifications()).toEqual([{ cle: 'maison', nom: 'maison', verifie: false, raison: 'aucune façade photographiée' }]);
    t.capture.ajouterPhotoFacade('maison', 0, { type: 'image/jpeg', base64: 'AAAA' });
    await t.v.lancer();
    expect(t.v.verifications()[0]?.verifie).toBe(true);
    expect(t.v.valider()?.verifies).toBe(1);
    const relu = normalizeObjects(serializeObjects(t.etat.objects) as ObjetBrut[]).find((o) => o.key === 'maison');
    expect(relu?.verifieSurPlace).toEqual({ date: '2026-10-13' });
    t.historique.annuler();
    expect(t.etat.objects.find((o) => o.key === 'maison')?.verifieSurPlace).toBeUndefined();
  });

  it('n ecrit rien quand rien n est coche', async () => {
    const t = monter();
    await t.v.lancer();
    for (const p of t.v.propositions()) t.v.basculer(p.id);
    expect(t.v.valider()).toBeNull();
    expect(t.historique.pile.taille).toBe(0);
    expect(t.messages.at(-1)).toMatch(/^Aucune proposition cochée/);
  });
});

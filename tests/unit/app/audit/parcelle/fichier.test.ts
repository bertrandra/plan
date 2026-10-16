import { describe, it, expect, vi } from 'vitest';
import { creerSessionAuditParcelle, type ContexteAuditParcelle } from '../../../../../src/app/audit/parcelle/controleur.js';
import { preparerImport } from '../../../../../src/app/audit/parcelle/fichier.js';
import { creerEtat } from '../../../../../src/core/state.js';
import { normalizeObjects } from '../../../../../src/model/normalisation.js';
import { clotureDImport } from '../../../../../src/model/cloture.js';
import type { DialogueChoix } from '../../../../../src/shell/dialogues.js';
import type { ObjetBrut, ObjetPlan, PtBrut } from '../../../../../src/model/types.js';

// Le fichier de l'audit de parcelle de bout en bout (MD/spec-audit.md §15) : un audit valide sur un
// appareil s'ecrit, se relit, et reprend a la phase 3 dans un autre projet de la meme parcelle, ou
// ses batiments ont d'autres cles ; ses mesures tiennent lieu de calcul, ses cases suivent les
// decisions du fichier, et rien n'est ecrit avant « Valider ». Un fichier d'une autre parcelle est refuse.

const IDU = '78650000AE0101';
const rect = (x0: number, y0: number, x1: number, y1: number): PtBrut[] => [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];
const obj = (key: string, plus: Partial<ObjetPlan>): ObjetPlan => ({ key, name: key, type: 'polygon', ...plus } as ObjetPlan);
const PHOTO = { type: 'image/jpeg' as const, base64: 'AAAA' };

function projet(cleMaison: string, idu = IDU): ObjetPlan[] {
  return normalizeObjects([
    obj('parcelle', { fonction: 'terrain', pts: rect(0, 0, 20, 30), cadastre: { idu, origineLat: 48.9, origineLon: 2.13, adresse: '2 allée des Limites' }, cloture: clotureDImport(rect(0, 0, 20, 30), 0) }),
    obj(cleMaison, { name: 'Maison', fonction: 'batiment', pts: rect(5, 10, 15, 18), elevation: 6, toit: { forme: 'deux-pans', hauteur: 3, angleFaitage: 0 }, bdtopo: { cleabs: 'BATIMENT0001' } }),
  ] as ObjetBrut[]) as ObjetPlan[];
}

function session(objets: ObjetPlan[], plus: Partial<ContexteAuditParcelle> = {}) {
  const etat = creerEtat({ objects: objets } as never, (o) => o as never);
  const messages: string[] = [];
  const mesures = { pixels: vi.fn(async () => null), chercherCoins: vi.fn(async () => ({ distorsion: null, coins: null })), jpeg: () => '', limites: () => [] };
  const projetAudit = { pushHistory: vi.fn(), render: vi.fn(), refaire3d: vi.fn(), remplacer3d: vi.fn(() => true) };
  const ctx: ContexteAuditParcelle = {
    etat, idu: IDU, ouvrir3d: vi.fn(), signaler: (m) => messages.push(m),
    suivre: () => () => {}, boussole: { suivre: () => () => {}, autoriser: async () => false },
    stockage: null, delaiBrouillonMs: 0, surligner: () => {}, poserPosition: () => {}, retirerPosition: () => {},
    maintenant: () => new Date('2026-10-13T09:00:00Z'), mesures, projet: projetAudit, lireGrille: async () => null, ...plus,
  };
  return { s: creerSessionAuditParcelle(ctx), etat, messages, mesures, projetAudit };
}

/** L'audit fait sur place par l'administrateur : une photo de la facade sud, des murs en brique, un mur sur rue refuse. */
async function auditFait() {
  const a = session(projet('maison'));
  a.s.capture.ajouterPhotoFacade('maison', 0, PHOTO);
  a.s.capture.noterVu('maison', { murs: 'brique' });
  a.s.capture.noterCloture({ type: 'mur', hauteurM: 1.6 });
  a.s.capture.terminer();
  a.s.montrer('propositions');
  await a.s.validation.lancer();
  expect(a.s.validation.propositions().map((p) => p.id)).toEqual(['maison:materiauMurs', 'parcelle:cloture']);
  a.s.validation.basculer('parcelle:cloture');
  expect(a.s.validation.valider()).toEqual({ ecrites: 1, verifies: 0 });
  return a;
}

describe('le fichier de l audit de parcelle', () => {
  it('s ecrit depuis la session : cas fige, photos, mesures et decisions', async () => {
    const a = await auditFait();
    const f = await a.s.fichier();
    expect(f.parcelle).toEqual({ idu: IDU, adresse: '2 allée des Limites', origine: { lat: 48.9, lon: 2.13 } });
    const maison = f.batiments.find((b) => b.cle === 'maison');
    expect(maison?.cas?.identite).toEqual({ cleBdtopo: 'BATIMENT0001', idu: IDU, adresse: '2 allée des Limites' });
    expect(maison?.cas?.entrees.pts).toHaveLength(4);
    expect(maison?.facades.find((x) => x.cote === 0)?.photos).toEqual([PHOTO]);
    expect(maison?.facades.find((x) => x.cote === 0)?.mesure).not.toBeNull();
    // Le materiau des murs, ecrit, ne se propose plus : le fichier le garde, valide, tel qu'il etait.
    expect(f.propositions.map((p) => [p.id, p.decision])).toEqual([['maison:materiauMurs', 'validee'], ['parcelle:cloture', 'refusee']]);
  });

  it('reprend a la phase 3 dans un autre projet de la meme parcelle, sans rien ecrire avant Valider', async () => {
    const a = await auditFait();
    const texte = JSON.stringify(await a.s.fichier());
    const b = session(projet('bat-1'));
    const r = preparerImport(texte, b.etat.objects, IDU);
    if ('refus' in r) throw new Error(r.refus);
    expect(r).toMatchObject({ batimentsRetrouves: 1, batimentsAbsents: 0 });
    const pret = vi.fn();
    await b.s.importer(r.fichier, pret);
    expect(pret).toHaveBeenCalledOnce();
    expect(b.s.capture.lire().batiments['bat-1']?.facades['0']?.photos).toEqual([PHOTO]);
    expect(b.s.capture.lire().phase).toBe('analyse');
    b.s.montrer('propositions');
    await b.s.validation.lancer();
    // Les mesures du fichier tiennent lieu de calcul : rien n'est remesure.
    expect(b.mesures.chercherCoins).not.toHaveBeenCalled();
    expect(b.mesures.pixels).not.toHaveBeenCalled();
    expect(b.s.validation.mesuresFaites().has('bat-1#0')).toBe(true);
    // Les cases suivent le fichier : murs cochés, clôture refusée décochée.
    expect(b.s.validation.propositions().map((p) => [p.id, b.s.validation.cochee(p.id)])).toEqual([['bat-1:materiauMurs', true], ['parcelle:cloture', false]]);
    expect(b.projetAudit.pushHistory).not.toHaveBeenCalled();
    expect(b.etat.objects.find((o) => o.key === 'bat-1')?.couleurMurs).toBeUndefined();
    // « Valider » ecrit en un seul pas d'historique, que Ctrl+Z defera.
    expect(b.s.validation.valider()).toEqual({ ecrites: 1, verifies: 0 });
    expect(b.projetAudit.pushHistory).toHaveBeenCalledOnce();
    expect(b.etat.objects.find((o) => o.key === 'bat-1')?.couleurMurs?.materiau).toBe('brique');
  });

  it('relance l analyse des photos : les mesures et les decisions du fichier ne sont pas reprises, les photos repassent par les mesures', async () => {
    const a = await auditFait();
    const texte = JSON.stringify(await a.s.fichier());
    const b = session(projet('bat-1'));
    const r = preparerImport(texte, b.etat.objects, IDU);
    if ('refus' in r) throw new Error(r.refus);
    await b.s.importer(r.fichier, vi.fn(), undefined, true);
    expect(b.s.capture.lire().batiments['bat-1']?.facades['0']?.photos).toEqual([PHOTO]);
    expect(b.s.validation.mesuresFaites().size).toBe(0);
    b.s.montrer('propositions');
    await b.s.validation.lancer();
    // La photo repart a l'analyse : le navigateur la relit, et l'ecran le dit avec l'heure.
    expect(b.mesures.pixels).toHaveBeenCalled();
    expect(b.messages).toContain('Photos soumises à l’analyse des façades à ' + new Date('2026-10-13T09:00:00Z').toTimeString().slice(0, 5) + ' : 1 photo(s) sur 1 façade(s).');
    expect(b.messages.some((m) => /^Analyse des photos terminée à \d\d:\d\d : 1 façade\(s\) mesurée\(s\), coins trouvés sur 0\.$/.test(m))).toBe(true);
    // Les cases suivent les mesures d'aujourd'hui, pas les decisions du fichier : rien n'est ecrit avant Valider.
    expect(b.projetAudit.pushHistory).not.toHaveBeenCalled();
  });

  it('demande avant de remplacer un audit en cours sur l appareil', async () => {
    const a = await auditFait();
    const f = await a.s.fichier();
    const questions: DialogueChoix[] = [];
    const b = session(projet('maison'), { questionner: (d) => questions.push(d) });
    b.s.capture.ajouterPhotoFacade('maison', 1, PHOTO);
    const pret = vi.fn();
    await b.s.importer(f, pret);
    expect(questions[0]?.titre).toBe('Remplacer l’audit en cours ?');
    expect(pret).not.toHaveBeenCalled();
    questions[0]?.secondaire.executer();
    expect(b.s.capture.lire().batiments.maison?.facades['1']?.photos).toEqual([PHOTO]);
    questions[0]?.principal.executer();
    expect(pret).toHaveBeenCalledOnce();
    expect(b.s.capture.lire().batiments.maison?.facades['1']).toBeUndefined();
  });

  it('refuse un fichier d une autre parcelle, ou illisible, en le disant', async () => {
    const a = await auditFait();
    const texte = JSON.stringify(await a.s.fichier());
    const autre = projet('maison', '78650000AE0103');
    expect(preparerImport(texte, autre, '78650000AE0103')).toEqual({ refus: 'Ce fichier est l’audit de la parcelle 78650000AE0101 (2 allée des Limites), ce projet est sur la parcelle 78650000AE0103 : ouvrez le projet de cette parcelle.' });
    expect(preparerImport('{', autre, IDU)).toEqual({ refus: 'Ce fichier n’est pas un JSON lisible.' });
    expect(preparerImport('{"format":"plan-promenade"}', autre, IDU)).toEqual({ refus: 'Ce fichier n’est pas un fichier d’audit de parcelle.' });
  });
});

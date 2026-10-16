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
    const decisions = t.capture.lire().decisions ?? [];
    expect(decisions).toHaveLength(1);
    expect(decisions[0]).toMatchObject({ t: '2026-10-13T09:00:00.000Z', acceptees: ['maison:materiauMurs', 'maison:cheminees', 'parcelle:cloture'], refusees: ['maison:couverture'], verifies: [] });
    // Les propositions telles qu'elles etaient : une fois ecrites, elles ne se proposent plus.
    expect(decisions[0]?.propositions?.map((p) => p.id)).toEqual(['maison:materiauMurs', 'maison:couverture', 'maison:cheminees', 'parcelle:cloture']);
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

  it('montre par defaut l avant et l apres en deux vues, qui suivent les cases', async () => {
    const t = monter();
    const comparer3d = vi.fn<NonNullable<ProjetAudit['comparer3d']>>(() => true);
    const cadrer3d = vi.fn<NonNullable<ProjetAudit['cadrer3d']>>();
    Object.assign(t.projet, { comparer3d, cadrer3d });
    await t.v.lancer();
    const avant = t.plan();
    expect(t.v.apercu()).toBe('deux');
    t.v.synchroniser();
    const apres = comparer3d.mock.calls.at(-1)?.[0];
    expect(apres?.cles).toEqual(['maison']);
    // L'apres est fait de copies : la maison avec l'ardoise et ses cheminees, la parcelle avec le mur.
    const maison = apres?.objets.find((o) => o.key === 'maison');
    expect(maison).not.toBe(t.etat.objects[1]);
    expect(maison?.toit?.couverture).toBe('ardoise');
    expect(apres?.parcelle).not.toBe(t.etat.objects[0]);
    expect(clotureDe(apres?.parcelle as ObjetPlan).cotes[0]).toMatchObject({ type: 'mur', hauteur: 1.6 });
    expect(t.plan()).toBe(avant);
    // Rien n'a change : rien ne se repose.
    t.v.synchroniser();
    expect(comparer3d).toHaveBeenCalledTimes(1);
    // Decocher : l'apres suit, sans la couverture.
    t.v.basculer('maison:couverture');
    expect(comparer3d).toHaveBeenCalledTimes(2);
    expect(comparer3d.mock.calls.at(-1)?.[0]?.objets.find((o) => o.key === 'maison')?.toit?.couverture).toBeUndefined();
    // La cloture decochee : la parcelle ne se compare plus.
    t.v.basculer('parcelle:cloture');
    expect(comparer3d.mock.calls.at(-1)?.[0]?.parcelle).toBeNull();
    // L'ecran dit ou il est ; les deux vues l'evitent.
    t.v.cadrer({ left: 0, top: 400, right: 390, bottom: 840 });
    expect(cadrer3d).toHaveBeenLastCalledWith({ left: 0, top: 400, right: 390, bottom: 840 });
    // « Après » seul : les deux vues se ferment, les copies remplacent les batiments.
    t.v.montrer('apres');
    expect(comparer3d).toHaveBeenLastCalledWith(null);
    expect(t.remplacer3d.mock.calls.at(-1)?.[0]).toEqual(['maison']);
    // De nouveau les deux : le batiment repose revient au plan, puis les deux vues.
    t.v.montrer('deux');
    expect(t.remplacer3d).toHaveBeenLastCalledWith(['maison']);
    expect(comparer3d.mock.calls.at(-1)?.[0]?.cles).toEqual(['maison']);
    // L'ecran se ferme : la Vue 3D revient au plan ; le choix reste pour la prochaine fois.
    t.v.oublierApercu();
    expect(comparer3d).toHaveBeenLastCalledWith(null);
    expect(t.v.apercu()).toBe('deux');
    expect(t.plan()).toBe(avant);
    expect(t.historique.pile.taille).toBe(0);
  });

  it('repose les deux vues quand la Vue 3D arrive, et les ferme avant d ecrire', async () => {
    const t = monter();
    let scene = false;
    const comparer3d = vi.fn<NonNullable<ProjetAudit['comparer3d']>>((a) => scene || a === null);
    Object.assign(t.projet, { comparer3d });
    await t.v.lancer();
    // Pas encore de scene : la Vue 3D s'ouvre.
    t.v.synchroniser();
    expect(comparer3d).toHaveBeenCalledTimes(1);
    scene = true;
    t.v.reposer();
    expect(comparer3d).toHaveBeenCalledTimes(2);
    expect(comparer3d.mock.calls.at(-1)?.[0]?.cles).toEqual(['maison']);
    const ordre: string[] = [];
    comparer3d.mockImplementation((a) => { ordre.push(a ? 'comparer' : 'fermer'); return true; });
    const empiler = t.projet.pushHistory;
    t.projet.pushHistory = () => { ordre.push('historique'); empiler(); };
    expect(t.v.valider()?.ecrites).toBe(4);
    expect(ordre).toEqual(['fermer', 'historique']);
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

describe('la main de la personne sur les arbitrages', () => {
  // La forme du toit est vue sur place (deux-pans) : l'arbitrage existe, il n'y a rien a changer. La hauteur, elle, se force.
  const attr = (t: ReturnType<typeof monter>, id: string) => t.v.arbitrages().flatMap((b) => b.arbitrages).find((a) => a.attribut === id);
  const hauteur = (t: ReturnType<typeof monter>) => t.v.propositions().find((x) => x.id === 'maison:hauteur');

  it('liste les sources d un attribut meme quand rien n est a changer', async () => {
    const t = monter();
    await t.v.lancer();
    expect(attr(t, 'formeToit')?.decision).toBe('rien');
    expect(attr(t, 'formeToit')?.options?.map((o) => o.libelle)).toContain('Plat (terrasse)');
  });

  it('forcer une valeur cree la proposition, la coche, et n ecrit rien avant Valider', async () => {
    const t = monter();
    await t.v.lancer();
    const avant = t.plan();
    expect(hauteur(t)).toBeUndefined();
    t.v.decider('batiment:maison', 'hauteurEgout', { type: 'force', valeur: 7.4 });
    expect(attr(t, 'hauteurEgout')?.decision).toBe('forcee');
    expect(hauteur(t)).toBeDefined();
    expect(t.v.cochee('maison:hauteur')).toBe(true);
    expect(t.plan()).toBe(avant);
  });

  it('reprendre le choix du moteur retire la proposition et sa case', async () => {
    const t = monter();
    await t.v.lancer();
    t.v.decider('batiment:maison', 'hauteurEgout', { type: 'force', valeur: 7.4 });
    t.v.decider('batiment:maison', 'hauteurEgout', null);
    expect(hauteur(t)).toBeUndefined();
    expect(t.v.cochee('maison:hauteur')).toBe(false);
  });

  it('valider ecrit la valeur forcee dans le projet, et Ctrl+Z la defait', async () => {
    const t = monter();
    await t.v.lancer();
    const avant = t.plan();
    t.v.decider('batiment:maison', 'hauteurEgout', { type: 'force', valeur: 7.4 });
    t.v.valider();
    expect(t.etat.objects.find((o) => o.key === 'maison')?.elevation).toBe(7.4);
    t.historique.annuler();
    expect(t.plan()).toBe(avant);
  });
});

describe('la consultation d un audit recu (Admin › Audits)', () => {
  /** Les propositions d'une session ordinaire, avec ce qu'un audit recu en a decide. */
  async function fichier(decisions: Record<string, 'validee' | 'refusee' | null>) {
    const source = monter();
    await source.v.lancer();
    return source.v.propositions().map((p) => ({ ...p, decision: decisions[p.id] ?? null }));
  }

  it('prend les propositions et les decisions du fichier : validee cochee, refusee et en attente decochees', async () => {
    const propositions = await fichier({ 'maison:materiauMurs': 'validee', 'maison:couverture': 'refusee', 'maison:cheminees': 'validee' });
    const t = monter();
    expect(t.v.lectureSeule()).toBe(false);
    t.v.figer(propositions);
    expect(t.v.lectureSeule()).toBe(true);
    expect(t.v.propositions().map((p) => p.id)).toEqual(propositions.map((p) => p.id));
    expect(t.v.propositions().every((p) => !('decision' in p))).toBe(true);
    expect(propositions.map((p) => t.v.cochee(p.id))).toEqual([true, false, true, false]);
    expect(propositions.map((p) => t.v.decision(p.id))).toEqual(['validee', 'refusee', 'validee', null]);
    expect(t.v.mesures()).toEqual({ etat: 'pretes' });
  });

  it('sans aucune decision, garde les cases par defaut de l audit', async () => {
    const propositions = await fichier({});
    const t = monter();
    t.v.figer(propositions);
    expect(propositions.map((p) => t.v.cochee(p.id))).toEqual([true, true, true, true]);
    expect(t.v.decision('maison:couverture')).toBeNull();
  });

  it('ne laisse rien cocher ni ecrire : le projet, l historique et les messages restent intacts', async () => {
    const t = monter();
    t.v.figer(await fichier({ 'maison:materiauMurs': 'validee' }));
    const avant = t.plan();
    t.v.basculer('maison:couverture');
    expect(t.v.cochee('maison:couverture')).toBe(false);
    expect(t.v.valider()).toBeNull();
    expect(t.plan()).toBe(avant);
    expect(t.historique.pile.taille).toBe(0);
    expect(t.messages).toEqual([]);
    expect(t.projet.render).not.toHaveBeenCalled();
    expect(t.capture.lire().decisions ?? []).toEqual([]);
  });

  it('montre l apres avec ce que l audit a valide : le meme apercu que la validation', async () => {
    const t = monter();
    t.v.figer(await fichier({ 'maison:materiauMurs': 'validee', 'maison:couverture': 'refusee' }));
    t.v.montrer('apres');
    const [cles, objets] = t.remplacer3d.mock.calls.at(-1) ?? [];
    expect(cles).toEqual(['maison']);
    const copie = objets?.find((o) => o.key === 'maison');
    expect(copie?.couleurMurs?.materiau).toBe('brique');
    expect(copie?.toit?.couverture).toBeUndefined();
    expect(t.etat.objects.find((o) => o.key === 'maison')?.couleurMurs?.materiau).toBeUndefined();
    t.v.montrer('avant');
    expect(t.remplacer3d).toHaveBeenLastCalledWith(['maison']);
  });
});

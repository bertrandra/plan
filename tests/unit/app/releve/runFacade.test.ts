import { describe, it, expect } from 'vitest';
import { appelerEscaladeFacade, appelerLectureEnrichie, appelerRunFacade, avecSaLectureEnrichie, encodageUnique, libelleEscalade } from '../../../../src/app/releve/runFacade.js';

type ContexteRun = Parameters<typeof appelerRunFacade>[0];
import { EchecAnalyse, type ClientAnalyse, type DemandeAnalyse, type ResultatsImmediats } from '../../../../src/io/analyseClaude.js';
import { VERSION_CHAINE_FACADES } from '../../../../src/facade/releve/chaine.js';
import { SORTIE_FACADE, SORTIE_FACADE_ENRICHIE } from '../../../fixtures/deploy/fauxAnthropic.js';

// Le run d'une facade, cote page (lots F2 et F3) : trois passes votees (la production, `facades.ia.passes`) ou une (pour mesurer) par
// la route immediate, usage `facade` ; la reponse enregistree avec les versions, le modele, les tokens et le cout ; l'escalade, a la
// demande, UNE requete au modele de l'usage `escalade`. (L'aide du releve, qui passait par lui, est partie avec sa capture au lot F6.)
// SORTIE_FACADE est synthetique (ecrite pour les tests), pas une reponse de Claude.

const IMAGE = { largeur: 4, hauteur: 3, donnees: new Uint8ClampedArray(48) };
const TOKENS = { entree: 1200, ecritureCache: 3000, lectureCache: 0, sortie: 900 };

/** Un client qui rend, pour chaque requete, la sortie donnee (une passe echouee si `echec` contient son rang). */
function client(recues: DemandeAnalyse[], echec: number[] = []): ClientAnalyse {
  return {
    immediat: async (d: DemandeAnalyse): Promise<ResultatsImmediats> => {
      recues.push(d);
      return { modele: 'claude-haiku-5-5', prompt: 1, schema: 1, resultats: d.requetes.map((q, i) => (echec.includes(i)
        ? { id: q.id, statut: 'echoue' as const, passe: q.passe, sortie: null, erreur: { type: 'overloaded_error', message: 'Surcharge.' }, tokens: { ...TOKENS, sortie: 0 }, cout: 0.0004 }
        : { id: q.id, statut: 'reussi' as const, passe: q.passe, sortie: SORTIE_FACADE, erreur: null, tokens: TOKENS, cout: 0.0012 })) };
    },
  } as unknown as ClientAnalyse;
}

const contexte = (c: ClientAnalyse | null): ContexteRun => ({
  client: () => c, identite: () => ({ projet: 'p-1', idu: 'AE0101', adresse: null }),
  encoder: (_img, cache) => ({ base64: cache ? 'R1JJUw==' : 'SU1BR0U=', mediaType: 'image/jpeg' }), maintenant: () => new Date('2026-10-29T08:30:00Z'),
});

describe('le run d une facade', () => {
  it('envoie une requete (x1), et l enregistre avec ses versions, son modele, ses tokens et son cout', async () => {
    const recues: DemandeAnalyse[] = [];
    const r = await appelerRunFacade(contexte(client(recues)), { image: IMAGE, texte: 'Façade : sud.', passes: 1 }, 'calibration');
    if ('erreur' in r) throw new Error(r.erreur);
    const d = recues[0] as DemandeAnalyse;
    expect(d).toMatchObject({ projet: 'p-1', idu: 'AE0101', usage: 'facade', audit: 'calibration-20261029083000' });
    expect(d.requetes.map((q) => [q.id, q.passe, q.usage, q.facades])).toEqual([['facade-p1', 1, 'facade', 1]]);
    expect(d.requetes[0]?.contenu.map((b) => b.type)).toEqual(['image', 'text']);
    expect(r.run).toEqual({ le: '2026-10-29T08:30:00.000Z', modele: 'claude-haiku-5-5', prompt: 1, schema: 1, passes: 1, sorties: [SORTIE_FACADE], cout: 0.0012,
      tokens: { entree: 4200, sortie: 900 }, image: { largeur: 4, hauteur: 3 }, chaine: VERSION_CHAINE_FACADES });
    expect(r.reponse.calage.angles.gauche).toEqual({ x: 0.14, egout: 0.52, sol: 0.88, confiance: 'moyenne' });
    expect(r.reponse.ouvertures[0]?.carreaux).toEqual({ vantaux: 2, colonnes: 1, rangees: 3, petitsBois: 'fins', imposte: 'aucune', vitrage: 'clair' });
  });

  it('garde l empreinte des octets que le serveur a recus (lot L0), celle de l escalade aussi : la meme image', async () => {
    const SHA = 'a'.repeat(64);
    const avecEmpreintes = (c: ClientAnalyse): ClientAnalyse => ({ immediat: async (d: DemandeAnalyse) => {
      const lu = await c.immediat(d);
      return { ...lu, trace: '20261029-083000-claude-haiku-5-5-0a1b', resultats: lu.resultats.map((x) => ({ ...x, empreintes: [{ sha256: SHA, octets: 5, type: 'image/jpeg' }] })) };
    } } as unknown as ClientAnalyse);
    const recues: DemandeAnalyse[] = [];
    const r = await appelerRunFacade(contexte(avecEmpreintes(client(recues))), { image: IMAGE, texte: 'Façade : sud.', passes: 3 }, 'calibration');
    if ('erreur' in r) throw new Error(r.erreur);
    expect(r.run.image).toEqual({ largeur: 4, hauteur: 3, sha256: SHA, octets: 5 });
    const e = await appelerEscaladeFacade(contexte(avecEmpreintes(client(recues))), { image: IMAGE, texte: 'Façade : sud.' }, r.run, 'calibration');
    if ('erreur' in e) throw new Error(e.erreur);
    expect(e.run.escalade?.sha256).toBe(SHA);
  });

  it('envoie trois passes identiques (x3), vote celles qui reussissent, et compte le cout de toutes', async () => {
    const recues: DemandeAnalyse[] = [];
    const r = await appelerRunFacade(contexte(client(recues, [2])), { image: IMAGE, cache: new Uint8Array(12), texte: 'Façade : sud.', passes: 3 }, 'calibration');
    if ('erreur' in r) throw new Error(r.erreur);
    const d = recues[0] as DemandeAnalyse;
    expect(d.requetes.map((q) => [q.id, q.facades])).toEqual([['facade-p1', 1], ['facade-p2', 0], ['facade-p3', 0]]);
    expect(d.requetes[2]?.contenu).toEqual(d.requetes[0]?.contenu);
    // Ce que rien ne montre part en gris (l'encodeur le recoit).
    expect(d.requetes[0]?.contenu[0]).toMatchObject({ source: { data: 'R1JJUw==' } });
    expect(r.run.passes).toBe(3);
    expect(r.run.sorties).toHaveLength(2);
    expect(r.run.cout).toBe(0.0028);
    expect(r.reponse.ouvertures).toHaveLength(2);
  });

  it('dit pourquoi rien n est revenu', async () => {
    const d = { image: IMAGE, texte: 'x', passes: 1 as const };
    expect(await appelerRunFacade(contexte({ immediat: async () => { throw new EchecAnalyse('plafond', 'x'); } } as unknown as ClientAnalyse), d, 'calibration')).toEqual({ erreur: 'Le plafond de l’analyse est atteint pour aujourd’hui ou ce mois-ci.' });
    expect(await appelerRunFacade(contexte(client([], [0])), d, 'calibration')).toEqual({ erreur: 'Claude n’a rendu aucune réponse lisible (Surcharge.).' });
    expect(await appelerRunFacade(contexte(null), d, 'calibration')).toEqual({ erreur: 'L’aide de Claude n’est pas ouverte à ce compte.' });
    expect(await appelerRunFacade({ ...contexte(client([])), encoder: () => null }, d, 'calibration')).toEqual({ erreur: 'L’image n’a pas pu être préparée pour Claude.' });
  });

  it('ne garde que les passes lisibles, et un cout inconnu quand un tarif manque', async () => {
    const lu: ResultatsImmediats = { modele: 'm', prompt: 1, schema: 1, resultats: [
      { id: 'a', statut: 'reussi', passe: 1, sortie: { forme: {} }, erreur: null, cout: null },
      { id: 'b', statut: 'reussi', passe: 2, sortie: SORTIE_FACADE, erreur: null, cout: 0.001 },
    ] };
    const r = await appelerRunFacade(contexte({ immediat: async () => lu } as unknown as ClientAnalyse), { image: IMAGE, texte: 't', passes: 3 }, 'calibration');
    if ('erreur' in r) throw new Error(r.erreur);
    expect(r.run.sorties).toEqual([SORTIE_FACADE]);
    expect(r.run.cout).toBeNull();
  });
});

describe('l escalade d une facade, a la demande', () => {
  const PRIX = { modele: 'claude-sonnet-5-5', prix: { entree: 3, sortie: 15 } };

  it('envoie UNE requete, usage escalade, la requete gardant l usage facade (son prompt), et la garde avec le run', async () => {
    const recues: DemandeAnalyse[] = [];
    const r0 = await appelerRunFacade(contexte(client(recues)), { image: IMAGE, texte: 'Façade : sud.', passes: 3 }, 'calibration');
    if ('erreur' in r0) throw new Error(r0.erreur);
    const r = await appelerEscaladeFacade(contexte(client(recues)), { image: IMAGE, texte: 'Façade : sud.' }, r0.run, 'calibration');
    if ('erreur' in r) throw new Error(r.erreur);
    const d = recues[1] as DemandeAnalyse;
    expect(d).toMatchObject({ usage: 'escalade', audit: 'calibration-esc-20261029083000' });
    expect(d.requetes.map((q) => [q.id, q.passe, q.usage, q.facades])).toEqual([['escalade-p1', 1, 'facade', 0]]);
    // La meme image et le meme texte que les passes.
    expect(d.requetes[0]?.contenu).toEqual(recues[0]?.requetes[0]?.contenu);
    expect(r.run.sorties).toEqual(r0.run.sorties);
    expect(r.run.escalade).toEqual({ le: '2026-10-29T08:30:00.000Z', modele: 'claude-haiku-5-5', prompt: 1, schema: 1, sortie: SORTIE_FACADE, cout: 0.0012, tokens: { entree: 4200, sortie: 900 } });
    // Jamais deux : un run deja escalade revient tel quel, sans appel.
    expect(await appelerEscaladeFacade(contexte(client(recues)), { image: IMAGE, texte: 'x' }, r.run, 'calibration')).toEqual({ run: r.run });
    expect(recues).toHaveLength(2);
  });

  it('annonce son cout sur le bouton : une passe du run, aux prix du modele de l escalade', () => {
    const run = { passes: 3 as const, tokens: { entree: 12600, sortie: 2700 } };
    // 4 200 tokens d'entree a 3 $ et 900 de sortie a 15 $ le million : 0,0126 + 0,0135.
    expect(libelleEscalade(run, PRIX)).toBe('Escalader vers claude-sonnet-5-5 (≈ 0,0261 $)');
    expect(libelleEscalade(run, { modele: 'm', prix: null })).toBe('Escalader vers m');
    expect(libelleEscalade(null, null)).toBe('Escalader');
    expect(libelleEscalade({ ...run, escalade: { le: '', modele: 'claude-sonnet-5-5', prompt: 2, schema: 2, sortie: {}, cout: 0.02, tokens: { entree: 0, sortie: 0 } } }, PRIX)).toBe('Escaladée (claude-sonnet-5-5)');
  });

  it('dit pourquoi rien n est revenu', async () => {
    const r0 = await appelerRunFacade(contexte(client([])), { image: IMAGE, texte: 't', passes: 1 }, 'calibration');
    if ('erreur' in r0) throw new Error(r0.erreur);
    expect(await appelerEscaladeFacade(contexte(client([], [0])), { image: IMAGE, texte: 't' }, r0.run, 'audit')).toEqual({ erreur: 'L’escalade n’a rendu aucune réponse lisible (Surcharge.).' });
    expect(await appelerEscaladeFacade(contexte({ immediat: async () => { throw new EchecAnalyse('plafond', 'x'); } } as unknown as ClientAnalyse), { image: IMAGE, texte: 't' }, r0.run, 'audit')).toEqual({ erreur: 'Le plafond de l’analyse est atteint pour aujourd’hui ou ce mois-ci.' });
  });
});

/** Les deux requetes d'une facade, comme la calibration les envoie (app/administration/ecranCalibration.ts). */
async function lesDeux(ctx: ContexteRun, d: Parameters<typeof appelerRunFacade>[1]) {
  const c = encodageUnique(ctx);
  const [r, e] = await Promise.all([appelerRunFacade(c, d, 'calibration'), appelerLectureEnrichie(c, d, 'calibration')]);
  return avecSaLectureEnrichie(r, e);
}

describe('les deux requetes d une facade (lot L1)', () => {
  // La decision du proprietaire du 30 octobre 2026 : le run, et la lecture enrichie sur la meme image ; l'une ne peut rien faire perdre a l'autre.
  const deux = (recues: DemandeAnalyse[], enrichieEchoue = false): ClientAnalyse => ({
    immediat: async (d: DemandeAnalyse): Promise<ResultatsImmediats> => {
      recues.push(d);
      if (d.usage === 'facade-enrichie' && enrichieEchoue) throw new EchecAnalyse('serveur', 'x');
      const sortie = d.usage === 'facade-enrichie' ? SORTIE_FACADE_ENRICHIE : SORTIE_FACADE;
      return { modele: 'claude-haiku-5-5', prompt: d.usage === 'facade-enrichie' ? 1 : 4, schema: d.usage === 'facade-enrichie' ? 1 : 4, resultats: d.requetes.map((q) => ({ id: q.id, statut: 'reussi' as const, passe: q.passe, sortie, erreur: null, tokens: TOKENS, cout: 0.001 })) };
    },
  } as unknown as ClientAnalyse);

  it('envoie le run et la lecture enrichie sur la meme image, et les garde ensemble', async () => {
    const recues: DemandeAnalyse[] = [];
    let encodages = 0;
    const ctx = contexte(deux(recues));
    const r = await lesDeux({ ...ctx, encoder: (i, c) => { encodages++; return ctx.encoder(i, c); } }, { image: IMAGE, texte: 'Façade : sud.', passes: 3 });
    expect(encodages).toBe(1);
    if ('erreur' in r) throw new Error(r.erreur);
    expect(recues.map((d) => [d.usage, d.requetes.map((q) => [q.id, q.usage, q.facades])])).toEqual([
      ['facade', [['facade-p1', 'facade', 1], ['facade-p2', 'facade', 0], ['facade-p3', 'facade', 0]]],
      ['facade-enrichie', [['enrichie-p1', 'facade-enrichie', 0], ['enrichie-p2', 'facade-enrichie', 0], ['enrichie-p3', 'facade-enrichie', 0]]],
    ]);
    expect(recues[1]!.requetes[0]!.contenu).toEqual(recues[0]!.requetes[0]!.contenu);
    expect(r.run).toMatchObject({ prompt: 4, schema: 4, sorties: [SORTIE_FACADE, SORTIE_FACADE, SORTIE_FACADE], enrichie: { prompt: 1, schema: 1, passes: 3, cout: 0.003 } });
    expect(r.run.enrichie!.erreur).toBeUndefined();
    expect(r.reponse.ouvertures[0]?.lus?.menuiserie).toEqual({ materiau: 'bois', couleur: 'blanc' });
    expect(r.reponse.modenature?.egout).toBe('genoise');
  });

  it('un echec de la lecture enrichie laisse le run tel quel, et se garde avec lui', async () => {
    const seul = await appelerRunFacade(contexte(client([])), { image: IMAGE, texte: 'Façade : sud.', passes: 3 }, 'calibration');
    const r = await lesDeux(contexte(deux([], true)), { image: IMAGE, texte: 'Façade : sud.', passes: 3 });
    if ('erreur' in r || 'erreur' in seul) throw new Error('rien');
    expect(r.run.enrichie).toMatchObject({ sorties: [], erreur: expect.stringMatching(/n’a pas pu partir/) });
    const run = { ...r.run };
    delete run.enrichie;
    expect({ ...run, cout: null, tokens: null }).toEqual({ ...seul.run, prompt: 4, schema: 4, cout: null, tokens: null });
    expect(r.reponse.ouvertures.map((o) => { const x = { ...o }; delete x.lus; return x; })).toEqual(seul.reponse.ouvertures);
    expect(r.reponse.saillies).toEqual([]);
  });
});

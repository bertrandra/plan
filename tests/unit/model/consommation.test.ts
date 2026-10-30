import { describe, it, expect } from 'vitest';
import {
  alertes, bornesPeriode, chiffresCles, cleDePas, couleurSerie, intervalles, lireReponseConsommation, nomModele, ordonnerSeries,
  parModele, parOrganisation, parParcelle, parUsage, pasParDefaut, serieDuModele, serieTemps, totalTokens, trier, valeurA,
  type EtatOrganisation, type LigneConsommation, type Trouvailles
} from '../../../src/model/consommation.js';

// Le tableau de bord de la consommation de Claude (MD/spec-audit.md 13.3) : l'agregation des lignes
// du journal que rend `GET admin/consommation`. Le navigateur ne compte rien : il additionne.

const HAIKU = 'claude-haiku-5-5';
const SONNET = 'claude-sonnet-5-5';

function ligne(t: string, plus: Partial<LigneConsommation> = {}): LigneConsommation {
  return {
    t, organisation: 'admin', projet: 'admin', idu: '78650000AE0101', adresse: '2 allée des Limites, Le Vésinet', audit: 'audit-1',
    usage: 'analyse', modele: HAIKU, batch: true, idBatch: 'msgbatch_1', passe: 1,
    tokens: { entree: 4000, ecritureCache: 0, ecritureCache1h: 0, lectureCache: 25000, sortie: 1000 },
    images: 1, facades: 2, cout: 0.001, statut: 'reussi', trouve: null, ...plus
  };
}

/** Trois passes d'un audit a Haiku, une escalade a Sonnet, un echec, et un refus du plafond. */
const JOURNAL: LigneConsommation[] = [
  ligne('2026-10-12T08:00:00Z', { passe: 1, tokens: { entree: 4000, ecritureCache: 25000, ecritureCache1h: 0, lectureCache: 0, sortie: 1000 }, cout: 0.002 }),
  ligne('2026-10-12T08:00:00Z', { passe: 2 }),
  ligne('2026-10-12T08:00:00Z', { passe: 3 }),
  ligne('2026-10-13T09:00:00Z', { modele: SONNET, usage: 'escalade', cout: 0.02, passe: null }),
  ligne('2026-10-14T10:00:00Z', { idu: '78650000AE0102', adresse: null, audit: 'audit-2', statut: 'echoue', cout: 0, tokens: { entree: 0, ecritureCache: 0, ecritureCache1h: 0, lectureCache: 0, sortie: 0 } }),
  ligne('2026-10-14T11:00:00Z', { audit: 'audit-3', statut: 'plafond', cout: 0, batch: true })
];

describe('les modeles et leurs couleurs', () => {
  it('donne a chaque modele connu sa serie, fixe, et range les inconnus dans « autres »', () => {
    expect(couleurSerie(HAIKU)).toBe(1);
    expect(couleurSerie(SONNET)).toBe(2);
    expect(couleurSerie('claude-opus-5-5')).toBe(3);
    expect(serieDuModele('claude-fable-6')).toBe('autres');
    expect(couleurSerie('autres')).toBe(null);
    expect(nomModele(HAIKU)).toBe('Claude Haiku 5.5');
    expect(nomModele('autres')).toBe('Autres modèles');
    // La couleur suit le modele, pas son rang : Sonnet seul garde la serie 2.
    expect(ordonnerSeries([SONNET])).toEqual([SONNET]);
    expect(ordonnerSeries(['autres', SONNET, HAIKU])).toEqual([HAIKU, SONNET, 'autres']);
  });
});

describe('les periodes et les intervalles', () => {
  it('borne une periode qui finit aujourd hui, jour compris', () => {
    expect(bornesPeriode('7j', '2026-10-14')).toEqual({ du: '2026-10-08', au: '2026-10-14' });
    expect(bornesPeriode('30j', '2026-03-01')).toEqual({ du: '2026-01-31', au: '2026-03-01' });
    expect(bornesPeriode('12m', '2026-10-14')).toEqual({ du: '2025-11-01', au: '2026-10-14' });
    expect(bornesPeriode('24m', '2026-10-14')).toEqual({ du: '2024-11-01', au: '2026-10-14' });
  });

  it('decoupe en jours, en semaines ISO (du lundi) ou en mois, sans trou', () => {
    expect(cleDePas('2026-10-14', 'semaine')).toBe('2026-10-12');
    expect(cleDePas('2026-10-18', 'semaine')).toBe('2026-10-12');
    expect(cleDePas('2026-10-19', 'semaine')).toBe('2026-10-19');
    expect(cleDePas('2026-10-14', 'mois')).toBe('2026-10');
    expect(intervalles('2026-10-10', '2026-10-14', 'jour')).toEqual(['2026-10-10', '2026-10-11', '2026-10-12', '2026-10-13', '2026-10-14']);
    expect(intervalles('2026-10-01', '2026-10-14', 'semaine')).toEqual(['2026-09-28', '2026-10-05', '2026-10-12']);
    expect(intervalles('2026-08-15', '2026-10-14', 'mois')).toEqual(['2026-08', '2026-09', '2026-10']);
    expect(pasParDefaut('2026-09-15', '2026-10-14')).toBe('jour');
    expect(pasParDefaut('2026-07-17', '2026-10-14')).toBe('semaine');
    expect(pasParDefaut('2025-11-01', '2026-10-14')).toBe('mois');
  });
});

describe('les tokens et le cout dans le temps', () => {
  it('empile par modele et par jour, zero les jours sans appel, sans le refus du plafond', () => {
    const s = serieTemps(JOURNAL, '2026-10-11', '2026-10-14', 'jour', 'cout');
    expect(s.cles).toEqual(['2026-10-11', '2026-10-12', '2026-10-13', '2026-10-14']);
    expect(s.series).toEqual([HAIKU, SONNET]);
    expect(s.valeurs[HAIKU]).toEqual([0, 0.004, 0, 0]);
    expect(s.valeurs[SONNET]).toEqual([0, 0, 0.02, 0]);
    expect(s.totaux).toEqual([0, 0.004, 0.02, 0]);
    expect(valeurA(s, 'claude-opus-5-5', 1)).toBe(0);
  });

  it('compte en tokens : entree, ecriture et lecture du cache, sortie', () => {
    expect(totalTokens(JOURNAL[0]!.tokens)).toBe(30000);
    const s = serieTemps(JOURNAL, '2026-10-01', '2026-10-31', 'mois', 'tokens');
    expect(s.cles).toEqual(['2026-10']);
    expect(s.valeurs[HAIKU]).toEqual([30000 + 30000 + 30000]);
    expect(s.totaux).toEqual([120000]);
  });
});

describe('les tableaux', () => {
  it('par parcelle : audits, tokens par modele, part du cache, cout, dernier appel', () => {
    const p = parParcelle(JOURNAL);
    expect(p).toHaveLength(2);
    const ae101 = p.find((l) => l.idu === '78650000AE0101')!;
    expect(ae101).toMatchObject({ audits: 1, cout: 0.024, dernier: '2026-10-13', tokens: 120000, adresse: '2 allée des Limites, Le Vésinet' });
    // Les passes d'une maison couvrent les memes deux facades : comptees sur la premiere ; ni
    // l'escalade ni le refus du plafond ne les recomptent. 0,024 $ / 2.
    expect(ae101).toMatchObject({ facades: 2, coutParFacade: 0.012 });
    expect(ae101.tokensParModele).toEqual({ [HAIKU]: 90000, [SONNET]: 30000 });
    // 75 000 lus en cache sur 116 000 tokens d'entree.
    expect(ae101.partCache).toBeCloseTo(75000 / 116000, 10);
    expect(p.find((l) => l.idu === '78650000AE0102')).toMatchObject({ adresse: null, cout: 0, audits: 1 });
  });

  it('par usage : chaque usage connu, la part du cout et celle du Batch', () => {
    const u = parUsage(JOURNAL);
    expect(u.map((x) => x.usage)).toEqual(['analyse', 'escalade', 'renfort', 'immediat', 'candidats', 'rejeu', 'jardin', 'facade-enrichie', 'facade-toit']);
    expect(u[0]).toMatchObject({ appels: 4, cout: 0.004, partBatch: 1 });
    expect(u[1]).toMatchObject({ appels: 1, cout: 0.02 });
    expect(u[0]!.partCout + u[1]!.partCout).toBeCloseTo(1, 10);
    expect(u[2]).toMatchObject({ appels: 0, cout: 0, partCout: 0, partBatch: 0 });
  });

  it('par organisation : la periode, et le jour et le mois face aux plafonds', () => {
    const etats: EtatOrganisation[] = [{ id: 'admin', jour: 0.5, mois: 2, plafond: { jour: 1, mois: 10 } }, { id: 'org-1', jour: 0, mois: 0, plafond: { jour: 0, mois: 0 } }];
    expect(parOrganisation(JOURNAL, etats)).toEqual([
      { id: 'admin', coutPeriode: 0.024, jour: 0.5, mois: 2, plafondJour: 1, plafondMois: 10, partJour: 0.5, partMois: 0.2 },
      { id: 'org-1', coutPeriode: 0, jour: 0, mois: 0, plafondJour: 0, plafondMois: 0, partJour: 0, partMois: 0 }
    ]);
  });

  it('trie sur une colonne, les vides a la fin', () => {
    const l = [{ v: 'b' }, { v: null }, { v: 'Ä' }, { v: 'a' }];
    expect(trier(l, (x) => x.v, 'asc').map((x) => x.v)).toEqual(['a', 'Ä', 'b', null]);
    expect(trier(l, (x) => x.v, 'desc').map((x) => x.v)).toEqual(['b', 'Ä', 'a', null]);
    expect(trier([{ n: 2 }, { n: 10 }, { n: 1 }], (x) => x.n, 'desc').map((x) => x.n)).toEqual([10, 2, 1]);
  });
});

describe('les chiffres cles et les alertes', () => {
  it('cout moyen par audit, part de l escalade, part lue en cache, taux d echec', () => {
    const k = chiffresCles(JOURNAL);
    expect(k).toMatchObject({ cout: 0.024, appels: 5, audits: 2, coutMoyenParAudit: 0.012, refusPlafond: 1 });
    expect(k.partEscalade).toBeCloseTo(0.02 / 0.024, 10);
    expect(k.tauxEchec).toBeCloseTo(1 / 5, 10);
    expect(k.partCacheLu).toBeCloseTo(75000 / 116000, 10);
    expect(chiffresCles([])).toMatchObject({ cout: 0, appels: 0, coutMoyenParAudit: null, tauxEchec: 0 });
  });

  it('alerte a 80 % du plafond du jour ou du mois', () => {
    const a = alertes([{ id: 'admin', jour: 0.8, mois: 7.9, plafond: { jour: 1, mois: 10 } }, { id: 'org-1', jour: 0, mois: 9, plafond: { jour: 1, mois: 10 } }], []);
    expect(a.map((x) => x.code)).toEqual(['plafond-jour', 'plafond-mois']);
    expect(a[0]!.message).toMatch(/« admin » : 80 % du plafond du jour/);
    expect(a[1]!.message).toMatch(/« org-1 » : 90 % du plafond du mois/);
    // Un plafond nul ne divise pas par zero.
    expect(alertes([{ id: 'x', jour: 0, mois: 0, plafond: { jour: 0, mois: 0 } }], [])).toEqual([]);
  });

  it('alerte quand le cout moyen par parcelle double l estimation sur sept jours, et au-dela de 5 % d echecs', () => {
    expect(alertes([], JOURNAL).map((x) => x.code)).toEqual(['echecs']);
    const cher = [ligne('2026-10-14T08:00:00Z', { cout: 0.03 }), ligne('2026-10-14T08:00:00Z', { cout: 0.02 })];
    const a = alertes([], cher);
    expect(a.map((x) => x.code)).toEqual(['derive']);
    expect(a[0]!.message).toMatch(/0,05 \$/);
    expect(alertes([], [ligne('2026-10-14T08:00:00Z', { cout: 0.04 })])).toEqual([]);
  });
});

describe('la reponse du serveur', () => {
  it('lit la reponse, ecarte une ligne abimee, et refuse ce qui n en est pas une', () => {
    const d = lireReponseConsommation({
      format: 'plan-claude-consommation', du: '2026-10-01', au: '2026-10-14', aujourdhui: '2026-10-14',
      lignes: [JOURNAL[0], { t: 'hier' }, null, { ...JOURNAL[1], tokens: null, cout: 'cher' }],
      recents: [], organisations: [{ id: 'admin', jour: 0.1, mois: 1, plafond: { jour: 1, mois: 10 } }, { jour: 1 }],
      choix: { organisations: ['admin'], modeles: [HAIKU, 3], usages: ['analyse'], parcelles: [{ idu: '78650000AE0101', adresse: null }, {}] }
    });
    expect(d?.lignes).toHaveLength(2);
    expect(d?.lignes[1]).toMatchObject({ cout: null, tokens: { entree: 0, sortie: 0 } });
    expect(d?.organisations).toHaveLength(1);
    expect(d?.choix).toEqual({ organisations: ['admin'], modeles: [HAIKU], usages: ['analyse'], parcelles: [{ idu: '78650000AE0101', adresse: null }] });
    expect(lireReponseConsommation({ format: 'autre' })).toBe(null);
    expect(lireReponseConsommation(null)).toBe(null);
  });

  it('lit les comptes et le batch d une ligne, et null pour une ligne d avant les comptes', () => {
    const trouve = { ouvertures: 9, manquees: 1, enTrop: 0, bouts: 1, lucarnes: 2, elements: 0, ecarts: 1, coins: 0, determines: 3, vide: false };
    const d = lireReponseConsommation({
      format: 'plan-claude-consommation', du: '2026-10-01', au: '2026-10-14',
      lignes: [{ ...JOURNAL[0], trouve: { ...trouve, coins: -2, elements: 'x' } }, { ...JOURNAL[1], idBatch: undefined, trouve: undefined }, { ...JOURNAL[2], trouve: [] }],
      recents: [], organisations: [], choix: {}
    });
    expect(d?.lignes.map((l) => [l.idBatch, l.trouve])).toEqual([['msgbatch_1', { ...trouve, coins: 0, elements: 0 }], [null, null], ['msgbatch_1', null]]);
  });
});

describe('par modele', () => {
  const trouve = (t: Partial<Trouvailles>): Trouvailles => ({ ouvertures: 0, manquees: 0, enTrop: 0, bouts: 0, lucarnes: 0, elements: 0, ecarts: 0, coins: 0, determines: 0, vide: false, ...t });
  const VIDE = trouve({ vide: true });

  it('compare les modeles : requetes, batchs, images, tokens, cout et cout par facade', () => {
    const ls = [
      ...JOURNAL,
      ligne('2026-10-13T09:00:00Z', { modele: SONNET, usage: 'renfort', batch: false, idBatch: null, passe: 1, facades: 1, cout: 0.01 }),
      ligne('2026-10-13T09:00:00Z', { modele: 'claude-fable-6', cout: 0.5, idBatch: 'msgbatch_9' })
    ];
    const [h, s, autre] = parModele(ls);
    // Le refus du plafond n'est pas une requete ; l'echec en est une.
    expect(h).toMatchObject({ modele: HAIKU, requetes: 4, batchs: 1, immediats: 0, images: 4, cout: 0.004, facades: 4, coutParFacade: 0.001, echecs: 1 });
    // L'escalade (sans passe) et le renfort immediat comptent chacun leurs facades.
    expect(s).toMatchObject({ modele: SONNET, requetes: 2, batchs: 1, immediats: 1, cout: 0.03, facades: 3, coutParFacade: 0.01 });
    expect(autre?.modele).toBe('claude-fable-6');
    expect(parModele([])).toEqual([]);
  });

  it('dit ce que les reponses contiennent, et la part des vides parmi les reponses lues', () => {
    const ls = [
      ligne('2026-10-12T08:00:00Z', { modele: HAIKU, trouve: VIDE }),
      ligne('2026-10-12T08:00:00Z', { modele: HAIKU, trouve: VIDE }),
      ligne('2026-10-12T08:00:00Z', { modele: HAIKU, trouve: trouve({ ouvertures: 2, determines: 1 }) }),
      // Une reponse d'avant les comptes, et un echec : ni vides ni pleines.
      ligne('2026-10-12T08:00:00Z', { modele: HAIKU }),
      ligne('2026-10-12T08:00:00Z', { modele: HAIKU, statut: 'echoue', cout: 0 }),
      ligne('2026-10-12T08:00:00Z', { modele: SONNET, trouve: trouve({ ouvertures: 9, manquees: 1, bouts: 1, lucarnes: 2, determines: 3 }) }),
      ligne('2026-10-12T08:00:00Z', { modele: SONNET, trouve: trouve({ ouvertures: 7, coins: 4, determines: 1 }) })
    ];
    const [h, s] = parModele(ls);
    expect(h).toMatchObject({ lues: 3, vides: 2, sansComptes: 1, echecs: 1, trouve: { ouvertures: 2, determines: 1, manquees: 0 } });
    expect(h?.partVide).toBeCloseTo(2 / 3);
    expect(s).toMatchObject({ lues: 2, vides: 0, partVide: 0, sansComptes: 0, trouve: { ouvertures: 16, manquees: 1, bouts: 1, lucarnes: 2, coins: 4, determines: 4 } });
    expect(parModele([ligne('2026-10-12T08:00:00Z')])[0]?.partVide).toBe(null);
  });
});

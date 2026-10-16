import { describe, it, expect } from 'vitest';
import {
  captureDuFichier, correspondanceBatiments, decisionDe, derniereDecision, fichierAuditParcelle, FichierAuditParcelleIllisible, lireFichierAuditParcelle,
  mesuresDuFichier, nomFichierAuditParcelle, refusParcelle, renommerBatiments, type EntreesFichierAudit, type FichierAuditParcelle,
} from '../../../src/model/fichierAuditParcelle.js';
import { captureVide, partageDe, type CaptureParcelle } from '../../../src/model/auditParcelle.js';
import type { Proposition } from '../../../src/regles/decisions.js';

// Le fichier de l'audit de parcelle (MD/spec-audit.md §15), format `plan-audit-parcelle` version 1 :
// il recopie sans recalculer, se relit a l'identique, dit de chaque proposition si elle a ete validee
// ou refusee, et ne s'applique qu'a la meme parcelle.

const IDU = '78650000AE0101';
const PHOTO = { type: 'image/jpeg' as const, base64: 'AAAA', prise: { t: '2026-10-13T09:00:00.000Z', x: 10, y: 3, lat: 48.9, lon: 2.13, precisionM: 4, azimutDeg: 0, sourceAzimut: 'boussole' as const, inclinaisonDeg: 90, roulisDeg: 0 } };

function proposition(id: string, cle: string, plus: Partial<Proposition> = {}): Proposition {
  return {
    id, cible: { type: 'batiment', cle }, objet: 'Murs de Maison', avant: 'enduit', apres: 'brique', source: 'mesure',
    indices: [{ texte: 'Vu sur place', photo: { cle, cote: 0, rang: 0 } }], confiance: null, remplaceChoix: null, reserve: null,
    effet: { type: 'materiauMurs', materiau: 'brique' }, ...plus,
  };
}

function capture(): CaptureParcelle {
  const c = captureVide(IDU, new Date('2026-10-13T08:00:00Z'));
  c.batiments.maison = { facades: { '0': { photos: [PHOTO] }, '2': { photos: [], inaccessible: true } }, vu: { murs: 'brique' }, photos: [] };
  c.cloture = { type: 'mur', hauteurM: 1.6, photos: [PHOTO] };
  c.portail = { nature: 'portail', photos: [] };
  c.phase = 'analyse';
  c.finCapture = '2026-10-13T08:40:00.000Z';
  const murs = proposition('maison:materiauMurs', 'maison');
  const cloture = proposition('parcelle:cloture', 'maison', { cible: { type: 'parcelle' }, effet: { type: 'cloture', cote: 0, typeCloture: 'mur', hauteurM: 1.6 } });
  c.decisions = [{ t: '2026-10-13T08:45:00.000Z', acceptees: ['maison:materiauMurs'], refusees: ['parcelle:cloture'], verifies: ['maison'], propositions: [murs, cloture] }];
  c.partage = { accord: true, envoi: { id: 'a1', retrait: 'secret', t: '2026-10-13T08:46:00.000Z' } };
  return c;
}

function entrees(plus: Partial<EntreesFichierAudit> = {}): EntreesFichierAudit {
  return {
    parcelle: { idu: IDU, adresse: '2 allée des Limites', origine: { lat: 48.9, lon: 2.13 } },
    code: { version: '2.2.0', commit: 'abc' }, regles: { lectureToits: 7, lectureMurs: 2, reglagesToits: 'r1' },
    capture: capture(),
    batiments: [{
      cle: 'maison', nom: 'Maison', mitoyen: false,
      cas: { identite: { cleBdtopo: 'BATIMENT0001', idu: IDU, adresse: null }, entrees: { pts: [], bdtopo: null, grille: null, voisins: [] }, sorties: { mode: 'entier', elevation: 6, toit: null, corps: null, toitMesure: null, couleurMurs: null, sourceMurs: null } },
      facades: [0, 1, 2, 3].map((cote) => ({ cote, orientation: ['Sud', 'Est', 'Nord', 'Ouest'][cote] ?? '', largeurM: 10, hauteurM: 6 })),
    }],
    mesures: new Map([['maison#0', { releve: null, rangReleve: 0, coinsTrouves: false, confiance: null, hauteurM: null, couleur: { couleur: '#c9b49a', pixels: 420, rang: 0 } }]]),
    // Apres la validation, seule la couleur reste a decider : les murs et la cloture ont ete tranches.
    propositions: [proposition('maison:couleurMurs', 'maison', { effet: { type: 'couleurMurs', couleur: '#c9b49a' } })],
    ecritLe: new Date('2026-10-13T09:00:00Z'),
    ...plus,
  };
}

describe('le fichier de l audit de parcelle', () => {
  it('porte la parcelle, les versions, les facades avec leurs photos et mesures, et chaque decision', () => {
    const f = fichierAuditParcelle(entrees());
    expect(f).toMatchObject({ format: 'plan-audit-parcelle', version: 1, parcelle: { idu: IDU, adresse: '2 allée des Limites' }, code: { commit: 'abc' }, regles: { lectureToits: 7 } });
    const maison = f.batiments[0];
    expect(maison?.cas?.identite.cleBdtopo).toBe('BATIMENT0001');
    expect(maison?.vu).toEqual({ murs: 'brique' });
    expect(maison?.facades.map((x) => [x.cote, x.orientation, x.photos.length, x.inaccessible ?? null])).toEqual([[0, 'Sud', 1, null], [1, 'Est', 0, null], [2, 'Nord', 0, true], [3, 'Ouest', 0, null]]);
    expect(maison?.facades[0]?.photos[0]?.prise?.azimutDeg).toBe(0);
    expect(maison?.facades[0]?.mesure?.couleur?.couleur).toBe('#c9b49a');
    expect(f.cloture).toMatchObject({ type: 'mur', hauteurM: 1.6 });
    // Les propositions decidees sont celles du moment de la validation ; celle du moment est en attente.
    expect(f.propositions.map((p) => [p.id, p.decision])).toEqual([['maison:materiauMurs', 'validee'], ['parcelle:cloture', 'refusee'], ['maison:couleurMurs', null]]);
    // La decision ne repete pas ses propositions, et le partage (avec son secret) reste sur l'appareil.
    expect(f.decisions).toEqual([{ t: '2026-10-13T08:45:00.000Z', acceptees: ['maison:materiauMurs'], refusees: ['parcelle:cloture'], verifies: ['maison'] }]);
    expect(JSON.stringify(f)).not.toContain('secret');
  });

  it('se relit a l identique, et rend la capture, les mesures et les cases', () => {
    const f = fichierAuditParcelle(entrees());
    const relu = lireFichierAuditParcelle(JSON.parse(JSON.stringify(f)));
    expect(relu).toEqual(f);
    const c = captureDuFichier(relu);
    expect(c).toMatchObject({ idu: IDU, phase: 'analyse', id: 'parcelle-' + IDU, debut: '2026-10-13T08:00:00.000Z' });
    expect(c.batiments.maison?.facades).toEqual({ '0': { photos: [PHOTO] }, '2': { photos: [], inaccessible: true } });
    // Un audit importe n'est pas renvoye au corpus sans un geste : il est deja connu de qui l'a ecrit.
    expect(c.partage).toEqual({ accord: false, envoi: null });
    expect(c.decisions?.[0]?.propositions?.map((p) => p.id)).toEqual(['maison:materiauMurs', 'parcelle:cloture']);
    expect(mesuresDuFichier(relu)).toEqual([{ cle: 'maison', cote: 0, releve: null, rangReleve: 0, coinsTrouves: false, confiance: null, hauteurM: null, couleur: { couleur: '#c9b49a', pixels: 420, rang: 0 } }]);
    expect(derniereDecision(relu)?.acceptees).toEqual(['maison:materiauMurs']);
    // Un second fichier, ecrit depuis la capture reprise, redit les memes decisions.
    const second = fichierAuditParcelle(entrees({ capture: c }));
    expect(second.propositions.map((p) => [p.id, p.decision])).toEqual(f.propositions.map((p) => [p.id, p.decision]));
  });

  it('reprend en capture un fichier ecrit avant « Lancer l analyse » (une sauvegarde)', () => {
    const c = capture();
    c.finCapture = null;
    c.phase = 'capture';
    const relu = lireFichierAuditParcelle(JSON.parse(JSON.stringify(fichierAuditParcelle(entrees({ capture: c })))));
    expect(relu.finCapture).toBeNull();
    expect(captureDuFichier(relu)).toMatchObject({ phase: 'capture', finCapture: null });
  });

  it('refuse ce qui n est pas un audit lisible par ce code, en le disant', () => {
    const f = fichierAuditParcelle(entrees());
    const essai = (d: unknown) => { try { lireFichierAuditParcelle(d); return null; } catch (e) { expect(e).toBeInstanceOf(FichierAuditParcelleIllisible); return (e as Error).message; } };
    expect(essai({ format: 'plan-promenade' })).toBe('Ce fichier n’est pas un fichier d’audit de parcelle.');
    expect(essai({ ...f, version: 2 })).toMatch(/version plus récente de Plan/);
    expect(essai({ ...f, parcelle: { idu: '' } })).toMatch(/incomplet \(parcelle\)/);
    expect(essai({ ...f, batiments: [{ ...f.batiments[0], facades: [{ cote: 0, photos: [{ type: 'image/jpeg' }] }] }] })).toMatch(/incomplet \(façade\)/);
    expect(essai(f)).toBeNull();
  });

  it('ne s applique qu a la meme parcelle', () => {
    const f = fichierAuditParcelle(entrees());
    expect(refusParcelle(f, IDU)).toBeNull();
    expect(refusParcelle(f, '78650000AE0103')).toBe('Ce fichier est l’audit de la parcelle 78650000AE0101 (2 allée des Limites), ce projet est sur la parcelle 78650000AE0103 : ouvrez le projet de cette parcelle.');
    expect(refusParcelle(f, null)).toMatch(/^Ce projet n’a pas de parcelle cadastrale/);
  });

  it('retrouve les batiments d un autre projet par leur identifiant BD TOPO, et les renomme partout', () => {
    const f = fichierAuditParcelle(entrees());
    const renommage = correspondanceBatiments(f, [{ cle: 'bat-7', cleBdtopo: 'BATIMENT0001' }, { cle: 'garage', cleBdtopo: null }]);
    expect([...renommage]).toEqual([['maison', 'bat-7']]);
    const g: FichierAuditParcelle = renommerBatiments(f, renommage);
    expect(g.batiments[0]?.cle).toBe('bat-7');
    expect(g.propositions.map((p) => p.id)).toEqual(['bat-7:materiauMurs', 'parcelle:cloture', 'bat-7:couleurMurs']);
    expect(g.propositions[0]?.cible).toEqual({ type: 'batiment', cle: 'bat-7' });
    expect(g.propositions[0]?.indices[0]?.photo?.cle).toBe('bat-7');
    expect(g.decisions[0]).toMatchObject({ acceptees: ['bat-7:materiauMurs'], refusees: ['parcelle:cloture'], verifies: ['bat-7'] });
    expect(decisionDe('bat-7:materiauMurs', g.decisions)).toBe('validee');
    // La meme cle dans les deux projets : le fichier ne change pas.
    expect(renommerBatiments(f, correspondanceBatiments(f, [{ cle: 'maison', cleBdtopo: null }]))).toBe(f);
  });

  it('lit la case du partage : la sienne, sinon celle de l accord de l analyse, sinon cochee', () => {
    const c = captureVide(IDU);
    expect(partageDe(c)).toEqual({ accord: true, envoi: null });
    expect(partageDe({ ...c, analyse: { accord: { t: '2026-10-13T09:00:00Z', partage: false } } })).toEqual({ accord: false, envoi: null });
    expect(partageDe({ ...c, analyse: { accord: { t: '2026-10-13T09:00:00Z', partage: false } }, partage: { accord: true, envoi: null } }).accord).toBe(true);
  });

  it('nomme le fichier du jour local et de l IDU', () => {
    expect(nomFichierAuditParcelle(new Date(2026, 9, 13, 23, 30), IDU)).toBe('audit-parcelle-2026-10-13-78650000AE0101.json');
    expect(nomFichierAuditParcelle(new Date(2026, 0, 2), '48.900000,2.130000')).toBe('audit-parcelle-2026-01-02-48-900000-2-130000.json');
  });
});

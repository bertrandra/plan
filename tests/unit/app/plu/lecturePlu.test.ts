import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import * as lib from 'pdf-lib';
import { enBase64, extrairePages, lireReglementPlu, sha256, texteDemande, type ContexteLecturePlu } from '../../../../src/app/plu/lecturePlu.js';
import type { ClientAnalyse, DemandeAnalyse, ResultatsImmediats } from '../../../../src/io/analyseClaude.js';
import type { ObjetPlan } from '../../../../src/model/types.js';

// La lecture du reglement par Claude, de la parcelle aux faits proposes (app/plu/lecturePlu.ts), avec un client et un reseau simules
// et le vrai pdf-lib sur l'extrait public du depot (tests/fixtures/plu/chatou-ul-extrait.pdf). La reponse est SYNTHETIQUE.

const PDF = new Uint8Array(readFileSync('tests/fixtures/plu/chatou-ul-extrait.pdf'));
const ADRESSE = { url: 'https://data.geopf.fr/annexes/gpu/documents/DU_78146/d900/78146_reglement_20181003.pdf', page: 2, zone: 'ULp', libelong: 'ULp : Secteur urbain', document: '78146_PLU_20181003', partition: 'DU_78146' };
const parcelle = (plu: unknown) => ({ key: 'parcelle', type: 'polygon', fonction: 'terrain', pts: [], plu } as unknown as ObjetPlan);
const PLU = { zones: [{ libelle: 'ULp' }], commune: { nom: 'Chatou', insee: '78146', rnu: false }, lon: 2.16, lat: 48.89 };
const SORTIE = { zone: { libelle: 'ULp', trouvee: 'oui' }, regles: [
  { grandeur: 'emprise-max', valeur: 30, unite: 'pourcent', termes: [], condition: 'secteur ULp', article: 'UL 9.2', citation: 'Dans le secteur ULp, l’emprise au sol ne doit pas excéder 30% de la superficie totale du terrain.', page: 2, confiance: 'forte' },
  { grandeur: 'hauteur-absolue-max', valeur: 10, unite: 'm', termes: [], condition: 'secteur ULp', article: 'UL 10.2', citation: 'La hauteur des constructions est limitée à 10 mètres.', page: 3, confiance: 'forte' },
], remarques: '' };

function client(reponse: Partial<ResultatsImmediats['resultats'][number]> = {}) {
  const demandes: DemandeAnalyse[] = [];
  const c = { immediat: async (d: DemandeAnalyse) => {
    demandes.push(d);
    return { modele: 'claude-haiku-5-5', prompt: 1, schema: 1, trace: '20261029-100000-claude-haiku-5-5-ab12', resultats: [{ id: 'plu', statut: 'reussi', passe: 1, sortie: SORTIE, erreur: null, cout: 0.0042, brut: JSON.stringify(SORTIE), synthetique: true, ...reponse }] } as ResultatsImmediats;
  } } as unknown as ClientAnalyse;
  return { c, demandes };
}
const contexte = (c: ClientAnalyse | null, plus: Partial<ContexteLecturePlu> = {}): ContexteLecturePlu => ({
  client: () => c, identite: () => ({ projet: 'p1', idu: '78146000AB0001', adresse: null }), maintenant: () => new Date('2026-10-29T10:00:00Z'),
  chercher: async () => [ADRESSE], telecharger: async () => PDF, extraire: (o, p, n) => extrairePages(lib, o, p, n), ...plus,
});

describe('extrairePages', () => {
  it('coupe les pages a partir de celle de la zone, et donne deux fois le meme extrait a l’octet', async () => {
    const a = await extrairePages(lib, PDF, 2, 25), b = await extrairePages(lib, PDF, 2, 25);
    expect(a.pages).toEqual([2, 3]);
    expect(a.pagesDocument).toBe(3);
    expect(await sha256(a.pdf)).toBe(await sha256(b.pdf));
    expect((await lib.PDFDocument.load(a.pdf)).getPageCount()).toBe(2);
    expect((await extrairePages(lib, PDF, null, 1)).pages).toEqual([1, 1]);
  });

  it('encode en base64 par tranches', () => {
    const o = new Uint8Array(70000).map((_, i) => i % 251);
    expect(enBase64(o)).toBe(Buffer.from(o).toString('base64'));
  });
});

describe('lireReglementPlu', () => {
  it('envoie l’extrait en document, avec la zone et la page, et rend des faits proposes avec leur source', async () => {
    const { c, demandes } = client();
    const r = await lireReglementPlu(parcelle(PLU), contexte(c));
    if (!('reglement' in r)) throw new Error(r.erreur);
    const d = demandes[0]!;
    expect(d).toMatchObject({ usage: 'plu', projet: 'p1', idu: '78146000AB0001', audit: 'plu-78146-ULp' });
    const [doc, texte] = d.requetes[0]!.contenu;
    expect(doc).toMatchObject({ type: 'document', source: { type: 'base64', media_type: 'application/pdf' } });
    expect(texte).toMatchObject({ type: 'text' });
    expect((texte as { text: string }).text).toContain('Zone demandée : ULp (« ULp : Secteur urbain »).');
    expect((texte as { text: string }).text).toContain('de la page 2 à la page 3 du document entier (3 pages)');
    const g = r.reglement;
    expect(g.faits.map((f) => [f.grandeur, f.valeur, f.statut])).toEqual([['emprise-max', 30, 'propose'], ['hauteur-absolue-max', 10, 'propose']]);
    expect(g.source).toMatchObject({ url: ADRESSE.url, page: 2, pages: [2, 3], pagesDocument: 3, empreinteDocument: 'be804d69f68cf5e76471109af367f496a89cc11ddc84caa14d7df2a4fa3b8fec' });
    expect(g.source.empreinte).toMatch(/^[0-9a-f]{64}$/);
    expect(g.lecture).toMatchObject({ modele: 'claude-haiku-5-5', prompt: 1, schema: 1, cout: 0.0042, brut: JSON.stringify(SORTIE), synthetique: true, demandeeLe: '2026-10-29T10:00:00.000Z', trace: '20261029-100000-claude-haiku-5-5-ab12' });
  });

  it('dit ce qui manque : la zone, le client, le reglement, une reponse', async () => {
    const { c } = client();
    expect(await lireReglementPlu(parcelle(null), contexte(c))).toMatchObject({ erreur: expect.stringMatching(/Interrogez d’abord/) });
    expect(await lireReglementPlu(parcelle(PLU), contexte(null))).toMatchObject({ erreur: expect.stringMatching(/connectez-vous/) });
    expect(await lireReglementPlu(parcelle(PLU), contexte(c, { chercher: async () => [] }))).toMatchObject({ erreur: expect.stringMatching(/page territoire/) });
    const vide = client({ statut: 'echoue', sortie: null, erreur: { type: 'overloaded_error', message: 'surcharge' } });
    expect(await lireReglementPlu(parcelle(PLU), contexte(vide.c))).toMatchObject({ erreur: expect.stringMatching(/surcharge/) });
  });

  it('nomme dans le texte la page absente du GPU', () => {
    expect(texteDemande({ ...ADRESSE, page: null }, null, { pdf: new Uint8Array(), pages: [1, 25], pagesDocument: 300 })).toContain('l’extrait part du début du document');
  });
});

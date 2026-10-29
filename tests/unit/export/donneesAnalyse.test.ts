import { describe, it, expect } from 'vitest';
import { champsSimples, csvDonneesAnalyse, nomDonneesAnalyse } from '../../../src/export/donneesAnalyse.js';
import type { DonneesAnalyse, LignePropositionAnalyse, LigneRequeteAnalyse } from '../../../src/io/donneesAnalyse.js';
import { SORTIE_FACADE } from '../../fixtures/deploy/fauxAnthropic.js';

// L'export « données d'analyse » en CSV (lot L0) : une ligne par requete puis par proposition, au format du tableau de bord (un
// tableur francais), les champs simples de chaque sortie en colonnes, aucune image.

const requete = (plus: Partial<LigneRequeteAnalyse> = {}): LigneRequeteAnalyse => ({
  nature: 'requete', trace: '20261029-100000-claude-haiku-5-5-0a1b', lot: 'immediat', audit: null, organisation: 'admin', idu: '78650000AE0101', adresse: '=2 allée des Limites',
  t: '2026-10-29T10:00:00Z', finLe: '2026-10-29T10:00:05Z', idBatch: null, requete: 'b0-f2-p1', batiment: 'b0', facade: 2, passe: 1, usage: 'facade', usageRequete: 'facade',
  modele: 'claude-haiku-5-5', prompt: 2, schema: 2, essai: false, statut: 'reussi', arret: 'end_turn', erreur: null, tokens: { entree: 1000, lectureCache: 200, sortie: 300 },
  cout: 0.0012, refusFormat: null, empreintes: ['a'.repeat(64)], octets: 150000, reponse: 'b'.repeat(64), trouve: null, sortie: SORTIE_FACADE, texte: '{}', ...plus,
});
const proposition: LignePropositionAnalyse = {
  nature: 'proposition', audit: '20261029-090000-0000abcd', organisation: 'org', idu: '78650000AE0101', adresse: null, t: '2026-10-29T09:00:00Z', proposition: 'p1',
  objet: 'Façade sud de Maison', batiment: 'b1', facade: 2, effet: 'ouvertures', source: 'claude', avant: '4', apres: '6', confiance: 0.9, reserve: null, decision: 'refusee',
  moteur: null, accordClaude: 'claude-seul',
};
const donnees = (requetes: LigneRequeteAnalyse[]): DonneesAnalyse => ({ format: 'plan-donnees-analyse', version: 1, genereLe: '2026-10-29T11:00:00Z', du: '2026-10-01', au: '2026-10-29',
  filtres: { modele: null, usage: null }, requetes, propositions: [proposition] });

describe('les donnees d analyse en CSV', () => {
  it('met en colonnes les champs simples d une sortie, deux niveaux au plus, et compte ses listes', () => {
    expect(champsSimples({ confiance: 'forte', forme: { silhouette: 'plusieurs-sommets', bout: 'pignon', x: { y: 1 } }, ouvertures: [1, 2], ok: true }, 'sortie.'))
      .toEqual({ 'sortie.confiance': 'forte', 'sortie.forme.silhouette': 'plusieurs-sommets', 'sortie.forme.bout': 'pignon', 'sortie.ouvertures (nombre)': 2, 'sortie.ok': 'oui' });
    expect(champsSimples(null)).toEqual({});
  });

  it('ecrit une ligne par requete puis par proposition, toutes de la meme largeur, pour un tableur francais', () => {
    const texte = csvDonneesAnalyse(donnees([requete(), requete({ requete: 'escalade-p1', usage: 'escalade', sortie: { confiance: 'faible' } })]));
    expect(texte.startsWith('\uFEFF')).toBe(true);
    const lignes = texte.slice(1).trimEnd().split('\r\n').map((l) => l.split(';'));
    const entetes = lignes[0] ?? [];
    expect(lignes).toHaveLength(4);
    expect(lignes.every((l) => l.length === entetes.length)).toBe(true);
    const col = (nom: string) => entetes.indexOf(nom);
    expect(lignes[1]?.[col('Nature')]).toBe('requête');
    expect(lignes[1]?.[col('Coût ($)')]).toBe('0,0012');
    expect(lignes[1]?.[col('Tokens en entrée')]).toBe('1200');
    expect(lignes[1]?.[col('Images (empreintes)')]).toBe('a'.repeat(64));
    expect(lignes[1]?.[col('Images (octets)')]).toBe('150000');
    expect(lignes[1]?.[col('Adresse')]).toBe('\'=2 allée des Limites');
    expect(lignes[1]?.[col('sortie.forme.silhouette')]).toBe('plusieurs-sommets');
    expect(lignes[2]?.[col('sortie.forme.silhouette')]).toBe('');
    expect(lignes[3]?.[col('Nature')]).toBe('proposition');
    expect(lignes[3]?.[col('Décision')]).toBe('refusée');
    expect(lignes[3]?.[col('Accord de Claude')]).toBe('claude-seul');
    expect(lignes[3]?.[col('Façade')]).toBe('2');
    // Ni le texte brut ni la sortie entiere : ils restent au JSON.
    expect(texte).not.toContain('"calage"');
  });

  it('nomme ses fichiers par la periode', () => {
    expect(nomDonneesAnalyse({ du: '2026-10-01', au: '2026-10-29' }, 'csv')).toBe('donnees-analyse-2026-10-01-2026-10-29.csv');
  });
});

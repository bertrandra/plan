import { describe, it, expect } from 'vitest';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { php, phpPresent } from '../../fixtures/deploy/appelPhp.js';
import { fichierAudit } from '../../fixtures/deploy/contextePlateforme.js';

// Le lot L0 (MD/spec-lecture-ia-elargie.md 4.8) cote serveur, fonction par fonction : les empreintes des images et des reponses,
// le lieu d'une trace (le dossier de l'audit, ou sans depot), la garde de 24 mois, le contenu d'un rejeu relu octet pour octet,
// les lignes de l'export « données d'analyse » et la decision du moteur sur une proposition. Saute si PHP manque.

const IMAGE = 'QUJDRA==';
const SHA = crypto.createHash('sha256').update(Buffer.from(IMAGE, 'base64')).digest('hex');
const requete = (id: string) => ({ id, passe: 1, images: 1, facades: 1, usage: 'facade', compte: 'facade', modele: 'claude-haiku-5-5',
  contenu: [{ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: IMAGE } }, { type: 'text', text: 'Façade : sud.' }] });

describe.skipIf(!phpPresent)('analyse.php, les donnees d analyse (lot L0)', () => {
  it('prend l empreinte des octets de chaque image, et celle du texte brut d une reponse', () => {
    expect(php('empreintesRequete', requete('r1'))).toEqual([{ sha256: SHA, octets: 4, type: 'image/jpeg' }]);
    expect(php('empreinteReponse', '{"a":1}')).toBe(crypto.createHash('sha256').update('{"a":1}').digest('hex'));
    expect(php('empreinteReponse', null)).toBe(null);
  });

  it('range une trace dans le dossier de l audit, sinon sous son organisation et son mois', () => {
    const id = php<string>('idNouvelleTrace', 'claude-haiku-5-5', '2026-10-29T10:11:12Z');
    expect(id).toMatch(/^20261029-101112-claude-haiku-5-5-[0-9a-f]{4}$/);
    expect(php('lieuTrace', '/d/claude', '/d/audits/parcelle/X/a1', '20261029-000000-0000abcd', 'org', id))
      .toEqual(['/d/audits/parcelle/X/a1', '/d/audits/parcelle/X/a1/analyses/' + id, { audit: '20261029-000000-0000abcd', organisation: 'org', id }]);
    expect(php('lieuTrace', '/d/claude', null, null, 'f1e2-aa', id))
      .toEqual(['/d/claude/analyses/sans-depot/f1e2-aa/2026-10', '/d/claude/analyses/sans-depot/f1e2-aa/2026-10/' + id, { audit: null, organisation: 'f1e2-aa', id }]);
  });

  it('garde les traces sans depot 24 mois, comme le journal', () => {
    expect(php('moisPerimes', ['2024-09', '2024-10', '2024-11', '2026-10', 'images', '2023-01'], '2026-10-29')).toEqual(['2024-09', '2023-01']);
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'purge-'));
    for (const m of ['2024-09', '2024-10']) fs.mkdirSync(path.join(d, 'analyses/sans-depot/admin', m, 'images'), { recursive: true });
    php('purgerSansDepot', d, '2026-10-29');
    expect(fs.readdirSync(path.join(d, 'analyses/sans-depot/admin'))).toEqual(['2024-10']);
    fs.rmSync(d, { recursive: true, force: true });
  });

  it('rejoue le contenu d une requete gardee octet pour octet, et refuse une image manquante', () => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'rejeu-'));
    fs.mkdirSync(path.join(d, 'images'));
    fs.writeFileSync(path.join(d, 'images', SHA + '.jpg'), Buffer.from(IMAGE, 'base64'));
    const gardee = { id: 'b0-f2-p1', contenu: [{ type: 'image', media_type: 'image/jpeg', image: SHA + '.jpg', octets: 4 }, { type: 'text', text: 'Façade : sud.' }] };
    expect(php('contenuRejoue', gardee, d)).toEqual(requete('x').contenu);
    expect(() => php('contenuRejoue', { ...gardee, contenu: [{ type: 'image', media_type: 'image/jpeg', image: '0'.repeat(64) + '.jpg' }] }, d)).toThrow('L’image gardée de cette requête est introuvable.');
    fs.rmSync(d, { recursive: true, force: true });
  });

  it('fait une ligne par reponse d une trace, avec ses empreintes, son batiment et sa facade', () => {
    expect(php('batimentEtFacade', 'b0-f2-p1')).toEqual({ batiment: 'b0', facade: 2 });
    expect(php('batimentEtFacade', 'b1-p3')).toEqual({ batiment: 'b1', facade: null });
    const resume = { id: 'T1', nature: 'analyse', audit: 'A1', organisation: 'org', creeLe: '2026-10-29T10:00:00Z', idBatch: 'msgbatch_1', essai: false, versions: { facade: { prompt: 2, schema: 2 } } };
    const entrant = { requetes: [{ id: 'b0-f2-p1', usage: 'facade', contenu: [{ type: 'image', image: SHA + '.jpg', octets: 4 }, { type: 'text', text: 'x' }] }] };
    const sortant = { finLe: '2026-10-29T10:05:00Z', resultats: [{ id: 'b0-f2-p1', passe: 1, usage: 'facade', modele: 'claude-haiku-5-5', statut: 'reussi', arret: 'end_turn', erreur: null,
      tokens: { entree: 1 }, cout: 0.001, trouve: null, texte: '{"a":1}', sortie: { a: 1 } }] };
    const [l] = php<Record<string, unknown>[]>('lignesDeTrace', resume, entrant, sortant, { idu: '78650000AE0101', adresse: '2 allée des Limites' });
    expect(l).toMatchObject({ nature: 'requete', trace: 'T1', lot: 'analyse', audit: 'A1', idu: '78650000AE0101', requete: 'b0-f2-p1', batiment: 'b0', facade: 2, passe: 1,
      usage: 'facade', usageRequete: 'facade', prompt: 2, schema: 2, empreintes: [SHA], octets: 4, reponse: crypto.createHash('sha256').update('{"a":1}').digest('hex'), sortie: { a: 1 }, texte: '{"a":1}' });
    // Une trace en cours n'a pas encore de ligne ; le filtre lit le jour de l'envoi, le modele et l'usage.
    expect(php('lignesDeTrace', resume, entrant, null, null)).toEqual([]);
    const f = { du: '2026-10-29', au: '2026-10-29', modele: null, usage: null };
    expect(php<unknown[]>('filtrerDonneesAnalyse', [l], f)).toHaveLength(1);
    expect(php('filtrerDonneesAnalyse', [l], { ...f, usage: 'escalade' })).toEqual([]);
    expect(php('filtrerDonneesAnalyse', [l], { ...f, du: '2026-10-30', au: '2026-10-30' })).toEqual([]);
  });

  it('dit ce que le moteur a fait d une proposition, et si Claude s y accordait', () => {
    const arbitrage = (decision: string, claudeRetenu: boolean | null) => ({ decision, groupes: [
      { valeur: 'a', retenu: true, lignes: [{ source: 'lidar' }, ...(claudeRetenu === true ? [{ source: 'claude' }] : [])] },
      { valeur: 'b', retenu: false, lignes: claudeRetenu === false ? [{ source: 'claude' }] : [] }] });
    expect(php('moteurDeProposition', { source: 'claude' })).toEqual({ moteur: null, accordClaude: 'claude-seul' });
    expect(php('moteurDeProposition', { source: 'mesure' })).toEqual({ moteur: null, accordClaude: 'sans-claude' });
    expect(php('moteurDeProposition', { source: 'arbitrage', arbitrages: [arbitrage('auto', true)] })).toEqual({ moteur: 'auto', accordClaude: 'accord' });
    expect(php('moteurDeProposition', { source: 'arbitrage', arbitrages: [arbitrage('auto', true), arbitrage('manuelle', false)] })).toEqual({ moteur: 'auto,manuelle', accordClaude: 'desaccord' });
    expect(php('moteurDeProposition', { source: 'arbitrage', arbitrages: [arbitrage('auto', null)] })).toEqual({ moteur: 'auto', accordClaude: 'sans-claude' });
  });

  it('exporte chaque proposition d un audit avec sa decision (conclusion version 2)', () => {
    const p = { id: 'p1', objet: 'Façade sud de Maison', source: 'claude', avant: '4', apres: '6', confiance: 0.9, decision: 'validee', reserve: null,
      cible: { type: 'facade', cle: 'b1', cote: 2 }, effet: { type: 'ouvertures' }, indices: [] };
    const d = php<{ version: number; propositions: Record<string, unknown>[] }>('decisionsAudit', { ...(fichierAudit() as Record<string, unknown>), propositions: [p] });
    expect(d.version).toBe(2);
    expect(d.propositions[0]).toMatchObject({ id: 'p1', effet: 'ouvertures', cible: { cle: 'b1', cote: 2 }, moteur: null, accordClaude: 'claude-seul', decision: 'validee' });
    const [l] = php<Record<string, unknown>[]>('lignesPropositions', d, { id: 'A1', idu: 'X', recuLe: '2026-10-29T10:00:00Z' });
    expect(l).toMatchObject({ nature: 'proposition', audit: 'A1', idu: 'X', proposition: 'p1', batiment: 'b1', facade: 2, effet: 'ouvertures', source: 'claude', decision: 'validee', accordClaude: 'claude-seul' });
  });
});

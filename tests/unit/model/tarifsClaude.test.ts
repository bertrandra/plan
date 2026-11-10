import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  ajouterLigne, erreurPlafonds, ligneProposee, ligneRetirable, lirePlafonds, lireTarifs, retirerLigne, tarifDuJour, type Plafonds, type Tarifs
} from '../../../src/model/tarifsClaude.js';

// Les tarifs et les plafonds regles depuis le tableau de bord (MD/spec-audit.md 13.3) : un tarif passe
// ne se reecrit pas, une ligne datee s'ajoute ; le serveur verifie aussi, ceci evite l'aller-retour.

const TARIFS = lireTarifs(JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../../deploy/claude-tarifs.json'), 'utf8'))) as Tarifs;
const PLAFONDS: Plafonds = { format: 'plan-claude-plafonds', defaut: { jour: 1, mois: 10 }, organisations: {}, requetesParBatch: 60, estimationRequete: 0.005 };

describe('les tarifs', () => {
  it('lit la table livree et trouve le tarif du jour', () => {
    expect(TARIFS.lignes).toHaveLength(2);
    expect(tarifDuJour(TARIFS, 'claude-haiku-5-5', '2026-10-14')?.sortie).toBe(0.5);
    expect(tarifDuJour(TARIFS, 'claude-haiku-5-5', '2026-01-01')).toBe(null);
    expect(lireTarifs({ format: 'autre' })).toBe(null);
  });

  it('propose les prix en vigueur, dates d aujourd hui, palier compris', () => {
    const l = ligneProposee(TARIFS, 'claude-haiku-5-5', '2026-10-20');
    expect(l).toMatchObject({ modele: 'claude-haiku-5-5', depuis: '2026-10-20', verifieLe: '2026-10-20', entree: 0.1, sortie: 0.5, remiseBatch: 0.5 });
    expect(l.auDela?.seuil).toBe(100000);
    // La copie ne touche pas la table.
    l.auDela!.sortie = 9;
    expect(TARIFS.lignes[0]!.auDela?.sortie).toBe(2.5);
    expect(ligneProposee(TARIFS, 'claude-opus-5-5', '2026-10-20')).toMatchObject({ modele: 'claude-opus-5-5', entree: 0, remiseBatch: 0.5 });
  });

  it('ajoute une ligne datee d aujourd hui ou plus tard, jamais au passe ni en double', () => {
    const nouvelle = { ...ligneProposee(TARIFS, 'claude-haiku-5-5', '2026-10-20'), sortie: 0.4 };
    const r = ajouterLigne(TARIFS, nouvelle, '2026-10-20');
    expect('tarifs' in r && r.tarifs.lignes).toHaveLength(3);
    expect(ajouterLigne(TARIFS, { ...nouvelle, depuis: '2026-10-19' }, '2026-10-20')).toEqual({ erreur: expect.stringMatching(/passé/) });
    expect(ajouterLigne(TARIFS, { ...nouvelle, depuis: '2026-10-13' }, '2026-10-13')).toEqual({ erreur: expect.stringMatching(/déjà/) });
    expect(ajouterLigne(TARIFS, { ...nouvelle, entree: -1 }, '2026-10-20')).toEqual({ erreur: expect.stringMatching(/positif/) });
    expect(ajouterLigne(TARIFS, { ...nouvelle, entree: Number.NaN }, '2026-10-20')).toEqual({ erreur: expect.stringMatching(/positif/) });
    expect(ajouterLigne(TARIFS, { ...nouvelle, remiseBatch: 0 }, '2026-10-20')).toEqual({ erreur: expect.stringMatching(/remise/i) });
    expect(ajouterLigne(TARIFS, { ...nouvelle, modele: 'gpt-4' }, '2026-10-20')).toEqual({ erreur: expect.stringMatching(/modèle/) });
  });

  it('ne retire qu une ligne a venir', () => {
    const r = ajouterLigne(TARIFS, { ...ligneProposee(TARIFS, 'claude-haiku-5-5', '2026-10-20'), depuis: '2026-11-01' }, '2026-10-20');
    if (!('tarifs' in r)) throw new Error(r.erreur);
    const avenir = r.tarifs.lignes[2]!;
    expect(ligneRetirable(avenir, '2026-10-20')).toBe(true);
    expect(retirerLigne(r.tarifs, avenir, '2026-10-20').lignes).toHaveLength(2);
    expect(ligneRetirable(avenir, '2026-11-01')).toBe(false);
    expect(retirerLigne(r.tarifs, r.tarifs.lignes[0]!, '2026-10-20')).toBe(r.tarifs);
  });
});

describe('les plafonds', () => {
  it('lit les plafonds et verifie une saisie', () => {
    expect(lirePlafonds(PLAFONDS)).toBe(PLAFONDS);
    expect(lirePlafonds({ format: 'plan-claude-plafonds' })).toBe(null);
    expect(erreurPlafonds(PLAFONDS)).toBe(null);
    expect(erreurPlafonds({ ...PLAFONDS, organisations: { 'org-1': { jour: 0.5, mois: 5 } } })).toBe(null);
    expect(erreurPlafonds({ ...PLAFONDS, defaut: { jour: -1, mois: 10 } })).toMatch(/défaut/);
    expect(erreurPlafonds({ ...PLAFONDS, organisations: { 'a b': { jour: 1, mois: 1 } } })).toMatch(/invalide/);
    expect(erreurPlafonds({ ...PLAFONDS, organisations: { o: { jour: Number.NaN, mois: 1 } } })).toMatch(/« o »/);
    expect(erreurPlafonds({ ...PLAFONDS, requetesParBatch: 0 })).toMatch(/Requêtes/);
    expect(erreurPlafonds({ ...PLAFONDS, estimationRequete: -0.1 })).toMatch(/estimation/);
  });
});

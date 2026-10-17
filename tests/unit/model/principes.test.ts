import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { FAMILLES, PRINCIPES, chercherPrincipes, verifierPrincipes, type Principe } from '../../../src/model/principes.js';

// Les principes de Plan, a plat : chaque principe a ses trois angles, ses renvois menent quelque part, et chaque fichier cite existe.

const RACINE = join(__dirname, '..', '..', '..');

describe('les principes de Plan', () => {
  it('la liste est saine : identifiants uniques, renvois connus, trois angles partout', () => {
    expect(verifierPrincipes()).toEqual([]);
    expect(PRINCIPES.length).toBeGreaterThanOrEqual(12);
  });

  it('chaque famille a au moins un principe, et chaque principe une famille connue', () => {
    for (const f of Object.keys(FAMILLES)) expect(PRINCIPES.some((p) => p.famille === f), f).toBe(true);
    for (const p of PRINCIPES) expect(Object.keys(FAMILLES), p.id).toContain(p.famille);
  });

  it('chaque fichier ou dossier cite dans les coulisses existe dans le depot', () => {
    for (const p of PRINCIPES) for (const c of p.coulisses) expect(existsSync(join(RACINE, c.ou)), p.id + ' : ' + c.ou).toBe(true);
  });

  it('chaque ecran cite dans les actions est un ecran de l admin ou la palette', () => {
    const permis = ['?admin&ecran=regles', '?admin&ecran=chaine', '?admin&ecran=principes', '?palette'];
    for (const p of PRINCIPES) for (const a of p.actions) if (a.ecran) expect(permis, p.id + ' : ' + a.ecran).toContain(a.ecran);
  });

  it('refuse un identifiant repete, un renvoi inconnu et un principe sans les trois angles', () => {
    const base = PRINCIPES[0] as Principe;
    expect(verifierPrincipes([base, base]).join()).toMatch(/identifiant répété/);
    expect(verifierPrincipes([{ ...base, voir: ['nulle-part'] }]).join()).toMatch(/renvoi inconnu/);
    expect(verifierPrincipes([{ ...base, voir: [], processus: [], actions: [], coulisses: [] }]).length).toBe(3);
  });

  it('la recherche ne tient compte ni des accents ni de la casse, et demande tous les mots', () => {
    expect(chercherPrincipes(PRINCIPES, '').length).toBe(PRINCIPES.length);
    expect(chercherPrincipes(PRINCIPES, 'RECONCILIATION').map((p) => p.id)).toContain('reconciliation');
    expect(chercherPrincipes(PRINCIPES, 'reconciliation.json').map((p) => p.id)).toContain('reconciliation');
    expect(chercherPrincipes(PRINCIPES, 'lidar mansart').map((p) => p.id)).toContain('lecture-lidar');
    expect(chercherPrincipes(PRINCIPES, 'xyzzy')).toEqual([]);
  });
});

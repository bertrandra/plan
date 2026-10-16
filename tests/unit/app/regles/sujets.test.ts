import { describe, it, expect } from 'vitest';
import { SUJETS } from '../../../../src/app/regles/sujets/index.js';
import { ATTRIBUTS_CLAUDE } from '../../../../src/regles/conformite.js';

// Le registre des sujets de l'audit (app/regles/sujets/) : ajouter un sujet est un module et une ligne ;
// ce test refuse l'oubli de l'autre moitie (l'attribut dont le taux d'accord se mesure).

describe('le registre des sujets de l’audit', () => {
  it('chaque sujet a un attribut unique, et chaque attribut a son sujet', () => {
    const ids = SUJETS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect([...ids].sort()).toEqual(ATTRIBUTS_CLAUDE.map((a) => a.code).sort());
  });

  it('dit son nom comme l’ecran de conformite', () => {
    for (const s of SUJETS) expect(ATTRIBUTS_CLAUDE.find((a) => a.code === s.id)?.libelle, s.id).toBe(s.libelle);
  });
});

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';

const racine = resolve(__dirname, '../..');
const dorees = resolve(racine, 'tests/fixtures/golden');

// Ces tests ne verifient pas du comportement : ils verifient que le filet de securite est en place
// et intact. Les vrais tests unitaires arrivent en phase 2, avec les premieres fonctions pures.
describe('phase 1 - echafaudage', () => {
  it('expose les deux points d entree attendus par main.ts', () => {
    const legacy = readFileSync(resolve(racine, 'src/legacy.ts'), 'utf8');
    expect(legacy).toContain('export { boot, loadInitialProject };');
    expect(legacy.startsWith('// @ts-nocheck')).toBe(true);
  });

  it('conserve le fichier mono-page gele comme reference', () => {
    expect(existsSync(resolve(racine, 'legacy/plan_interactif.html'))).toBe(true);
  });

  it('garde les golden files et leurs empreintes normalisees', () => {
    const attendu: Record<string, string> = {
      'resume.txt': '318d0cf113f2c681cbe82c54a0fe00029b7153e86d4b4202fd1cbf2145a082e6',
      'plan.svg': 'f5922c20f4ca4df1e43f0d998c7fad28760189671644a2fe784b0f71e9c42a34',
      'plan.dxf': 'ec7a1e32267514a52016e60c06dd535f41d54649a07b4b2dadbb95d7c48608ec',
      'projet.json': 'bb9719159d0b1a75aa6e853c0391f6c9902fd1e4e9df7cf8f80b3654917d06a6',
      'plan.pdf': 'c956c8813f165966f6a2cf5a79f6884e9f17ec035f2909a2cfc6994a4ffd857d',
      'dossier.pdf': 'ea303be4e40a535137b9b09067fb898435fc61b9a71d329129db981e049b0dc2'
    };
    for (const [nom, sha] of Object.entries(attendu)) {
      // Meme normalisation que tests/fixtures/golden/EMPREINTES.md : chaque motif remplace par un
      // motif de meme longueur, sinon les decalages internes du PDF changeraient.
      const brut = readFileSync(resolve(dorees, nom), 'latin1');
      const norme = brut
        .replace(/\d{2}\/\d{2}\/\d{4}/g, 'JJ/MM/AAAA')
        .replace(/D:\d{14}/g, 'D:AAAAMMJJHHMMSS')
        .replace(/"(exportedAt|writtenAt)":\s*"[^"]*"/g, '"$1":"HORODATAGE"');
      const calcule = createHash('sha256').update(Buffer.from(norme, 'latin1')).digest('hex');
      expect(calcule, nom + ' a change').toBe(sha);
    }
  });
});

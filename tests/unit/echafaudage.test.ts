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

  // Recapturees le 29 aout 2026, a la version 1.1.0-alpha.1. Le seul ecart avec les empreintes de
  // la 1.0.0 est le numero de version, et cela a ete prouve avant de recapturer : le meme build,
  // estampille 1.0.0, reproduisait les anciennes empreintes au bit pres, et une comparaison ligne a
  // ligne ne montrait qu'une ligne differente par artefact (voir EMPREINTES.md, « La rupture »).
  it('garde les golden files et leurs empreintes normalisees', () => {
    const attendu: Record<string, string> = {
      'resume.txt': '77cbccfd8eb0ebf5d62ca51c5b16d7931b9d6901b0c3f5d82faed3ffa2a5866d',
      'plan.svg': '8f35ee04c4f1d8e64427b6def09d1ff894dfdc25980a1b62e0d2d213e48ba14a',
      'plan.dxf': '29814368f4a7f112bb3e93f7b4a3613bd72d7d133a3b448e919187d880857257',
      'projet.json': '87880303418ccde09fc52fbbdd688ec5511032f0effe275223304865d19828ea',
      'plan.pdf': 'c479f8216995a996a15d8d4721618365a9e46defc0f0cb1212ea5f0000913ced',
      'dossier.pdf': '3a34765c8214a23e95e7a1e649584d55de76f40a28f8d267769fa20d01f81d6e'
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

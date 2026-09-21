import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';

const racine = resolve(__dirname, '../..');
const dorees = resolve(racine, 'tests/fixtures/golden');

// Ces tests ne verifient pas du comportement : ils verifient que le filet de securite est en place
// et intact. Les vrais tests unitaires arrivent en phase 2, avec les premieres fonctions pures.
describe('phase 1 - echafaudage', () => {
  it('expose les deux points d entree attendus par main.ts', () => {
    const boot = readFileSync(resolve(racine, 'src/app/boot.ts'), 'utf8');
    expect(boot).toContain('export { boot, loadInitialProject };');
  });

  // Fin de la phase 4 (spec section 6, section 14) : la fermeture a quitte `legacy.ts`, et
  // `legacy.ts` a disparu avec elle. Le test garde les deux moities de cette affirmation, parce
  // que la premiere sans la seconde ne veut rien dire — un fichier laisse la sous `@ts-nocheck`
  // redeviendrait le fourre-tout d'ou tout doit sortir.
  it('n a plus de fichier legacy ni de @ts-nocheck dans src/', () => {
    expect(existsSync(resolve(racine, 'src/legacy.ts'))).toBe(false);
    const fichiers: string[] = [];
    (function parcourir(dossier: string){
      for (const e of readdirSync(dossier, { withFileTypes: true })) {
        const chemin = resolve(dossier, e.name);
        if (e.isDirectory()) parcourir(chemin);
        else if (e.name.endsWith('.ts')) fichiers.push(chemin);
      }
    })(resolve(racine, 'src'));
    // La directive, pas le mot : l'en-tete de boot.ts raconte d'ou il vient et cite `@ts-nocheck`
    // en prose. Seule une ligne de commentaire qui EST la directive desarme le compilateur.
    const directive = /^\s*\/\/\s*@ts-nocheck/m;
    const avecNocheck = fichiers.filter((c) => directive.test(readFileSync(c, 'utf8')));
    expect(avecNocheck).toEqual([]);
  });

  it('conserve le fichier mono-page gele comme reference', () => {
    expect(existsSync(resolve(racine, 'legacy/plan_interactif.html'))).toBe(true);
  });

  // Recapturees le 21 septembre 2026, a la version 1.1.0. Le seul ecart avec les empreintes de
  // la 1.0.0 est le numero de version, et cela a ete prouve avant chaque recapture : le meme build,
  // estampille de l'ancien numero, reproduisait les anciennes empreintes au bit pres, et une
  // comparaison ligne a ligne ne montrait qu'une ligne differente par artefact texte — celle qui
  // porte la version (voir EMPREINTES.md, « La rupture » et la recapture de rattrapage).
  it('garde les golden files et leurs empreintes normalisees', () => {
    const attendu: Record<string, string> = {
      'resume.txt': '6cc56af2abeaee48d35df9d82388eb7cf14c35d654e5f612473f9c83fdf39d8a',
      'plan.svg': '15a35907ce3e09b7c4d77c7ae695127427c0cb16a99d6240acf831e2dce44faa',
      'plan.dxf': '70a6380756786c406e49b3309835bb35c5076532b6446bbe4642c6b857d3f387',
      'projet.json': '9eebfa92dd2d2e1a1bc65984ef2b5b58b32acbf797c11a57fe59ca9d1f5a4053',
      'plan.pdf': '50d0b01abe93a400da42355122797c0b131291f18639a70550599934d3286293',
      'dossier.pdf': 'cca2d8ccde14a026f4117d96dead73c187dbfb9b0477509473a6a5dcd2de5c74'
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

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';

const racine = resolve(__dirname, '../..');
const dorees = resolve(racine, 'tests/fixtures/golden');

// Ces tests ne verifient pas du comportement : ils verifient que le filet de securite est en place
// et intact. Les vrais tests unitaires arrivent en phase 2, avec les premieres fonctions pures.
describe('phase 1 - echafaudage', () => {
  it('expose les points d entree attendus par main.ts', () => {
    // Le troisieme, `graineVitrine`, est la graine de la vitrine publique (app/vitrine.ts, 2.2.1) ;
    // le quatrieme, `graineAudit`, celle du mode audit (app/audit/).
    const boot = readFileSync(resolve(racine, 'src/app/boot.ts'), 'utf8');
    expect(boot).toContain('export { boot, loadInitialProject, graineVitrine, graineAudit };');
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

  // Recapturees le 30 octobre 2026 a la version 5.4.1 (numero seul, preuve forte
  // dans EMPREINTES.md). Avant : le meme jour a la 5.4.0, a la 5.3.0 et a la 5.2.0, le 30 octobre a la 5.1.0, le 29 octobre a la 5.0.0, le 28 octobre a la 4.0.0, le 25 octobre a la 3.0.0, le 28 septembre 2026, a la version 2.2.0 ; le numero de schema est revenu a 1 le 29,
  // parce qu'un document s'ecrit au plus petit schema qui le decrit et que le temoin n'avait pas de
  // releve. Le 30, la maison du temoin a recu son toit a croupes (MD/spec-toit-ign.md) : `projet.json`
  // gagne ce toit et le schema 3, `plan.svg` le schema 3 ; les quatre autres ne bougent pas. Le seul ecart avec les empreintes de la 1.0.0 est le numero de version — et, depuis la
  // 2.0.0, la date de build qui l'accompagne. Cela a
  // ete prouve avant chaque recapture : le meme build, estampille de l'ancien numero, reproduit les
  // anciennes empreintes au bit pres, et une comparaison ligne a ligne ne montre aucune ligne
  // differente une fois le numero neutralise (voir EMPREINTES.md, « La rupture »).
  it('garde les golden files et leurs empreintes normalisees', () => {
    const attendu: Record<string, string> = {
      'resume.txt': 'e7f4d197bd539c5444d561e1c5fdaebd7492c56900e61a11ba4a6b6d5e650001',
      'plan.svg': '28526fb11532ae656f3070a0ce209eed385026acc363aa7eb0ca932cc053e499',
      'plan.dxf': '6599adb1a5a26c4ccd727e329303aae2139a25579a906ab839fbf9f7485fdb87',
      'projet.json': 'da204eeac6c836298a61ab75d8888fb096e2c5d021d21552de9fbe5784c393b2',
      'plan.pdf': 'eca61637d2d6070c79695e73339f0e6bb5386601ee32c7a8e99d6918c65d4614',
      'dossier.pdf': 'a1e9286c181932a29c96e052512a682df6d8f4bdb238b73580f09b216955c7c4'
    };
    for (const [nom, sha] of Object.entries(attendu)) {
      // Meme normalisation que tests/fixtures/golden/EMPREINTES.md : chaque motif remplace par un
      // motif de meme longueur, sinon les decalages internes du PDF changeraient.
      const brut = readFileSync(resolve(dorees, nom), 'latin1');
      const norme = brut
        .replace(/\d{2}\/\d{2}\/\d{4}/g, 'JJ/MM/AAAA')
        .replace(/D:\d{14}/g, 'D:AAAAMMJJHHMMSS')
        .replace(/"(exportedAt|writtenAt)":\s*"[^"]*"/g, '"$1":"HORODATAGE"')
        // L'identite que la plateforme attribue au projet : un uuid neuf a chaque semis, une date
        // de modification qui bouge a chaque enregistrement. Sans cela, le temoin ne serait
        // reproductible par personne. Neutralisee DANS le bloc `meta` seulement, parce que les
        // cotes portent aussi un `id` et que celui-la doit rester verifie.
        //
        // Le `\s*` apres le deux-points a manque au premier jet, le 23 septembre 2026 : le fichier
        // est indente, il porte `"meta": {` avec une espace, et le motif ne trouvait donc rien. La
        // neutralisation etait ecrite, commentee, et morte — l'empreinte figeait un uuid. Trouve en
        // refaisant la preuve forte pour la 2.0.0, qui a bute sur cette date-la.
        .replace(/"meta":\s*\{[^}]*\}/, (bloc) => bloc
          .replace(/"id":\s*("[^"]*"|null)/, '"id":"IDENTITE"')
          .replace(/"createdAt":\s*("[^"]*"|null)/, '"createdAt":"HORODATAGE"')
          .replace(/"updatedAt":\s*("[^"]*"|null)/, '"updatedAt":"HORODATAGE"'));
      const calcule = createHash('sha256').update(Buffer.from(norme, 'latin1')).digest('hex');
      expect(calcule, nom + ' a change').toBe(sha);
    }
  });
});

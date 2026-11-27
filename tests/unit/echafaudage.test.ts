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

  // Recapturees le 26 novembre 2026 a la version 5.41.1 (numero seul, preuve forte dans EMPREINTES.md ; devis.pdf et liste-achat.pdf avec elles).
  // Avant : le 25 novembre a la 5.41.0 et a la 5.40.0, le 23 novembre a la 5.39.0, le 21 novembre a la 5.38.0 et a la 5.37.0, le 17 novembre a la 5.36.0, le 16 novembre a la 5.35.0, a la 5.34.0 et a la 5.33.0, le 15 novembre a la 5.32.0, a la 5.31.0, a la 5.30.0, a la 5.29.1, a la 5.29.0 et a la 5.28.0, le 14 novembre a la 5.27.1 et a la 5.27.0, le 12 novembre a la 5.26.0, a la 5.25.0, a la 5.24.0 et a la 5.23.0, le 9 novembre a la 5.22.1, a la 5.22.0, a la 5.21.0, a la 5.20.0 et a la 5.19.0, le 8 novembre a la 5.18.0, a la 5.17.0 et a la 5.16.0, le 7 novembre a la 5.15.0, a la 5.14.0 et a la 5.13.1, le 6 novembre a la 5.13.0, a la 5.12.0 et a la 5.11.1, le 5 novembre a la 5.11.0, a la 5.10.0, le 4 novembre a la 5.9.0, a la 5.8.0 et a la 5.7.0, le 3 novembre a la 5.6.0 et a la 5.5.0, le 30 octobre a la 5.4.1, a la 5.4.0, a la 5.3.0 et a la 5.2.0, le 30 octobre a la 5.1.0, le 29 octobre a la 5.0.0, le 28 octobre a la 4.0.0, le 25 octobre a la 3.0.0, le 28 septembre 2026, a la version 2.2.0 ; le numero de schema est revenu a 1 le 29,
  // parce qu'un document s'ecrit au plus petit schema qui le decrit et que le temoin n'avait pas de
  // releve. Le 30, la maison du temoin a recu son toit a croupes (MD/spec-toit-ign.md) : `projet.json`
  // gagne ce toit et le schema 3, `plan.svg` le schema 3 ; les quatre autres ne bougent pas. Le seul ecart avec les empreintes de la 1.0.0 est le numero de version — et, depuis la
  // 2.0.0, la date de build qui l'accompagne. Cela a
  // ete prouve avant chaque recapture : le meme build, estampille de l'ancien numero, reproduit les
  // anciennes empreintes au bit pres, et une comparaison ligne a ligne ne montre aucune ligne
  // differente une fois le numero neutralise (voir EMPREINTES.md, « La rupture »).
  it('garde les golden files et leurs empreintes normalisees', () => {
    const attendu: Record<string, string> = {
      'resume.txt': '9cf9e0923b4bb75eb49ba07d4a931c236bb3c9af986e19e03d2fc760705d5641',
      'plan.svg': 'b07dedf3c4f0d845e15e10d27867ba6f4f3823d14b1d04467bfe65dbbd3817da',
      'plan.dxf': 'cba38ba557061c578b1adab61f531dbf363f20f3a5bcc700fa7123120c56b5bb',
      'projet.json': 'da204eeac6c836298a61ab75d8888fb096e2c5d021d21552de9fbe5784c393b2',
      'plan.pdf': '8c0d86b93d21722ba3e44dd26a62687ea6a5dee4f0cd1cbf87b5cfc3121d1667',
      'dossier.pdf': '27becde19a050fd59f71f918ac31f4025e035b3bb0338a5151643bc6e3761735',
      // Le devis (16 novembre 2026), regenere par tests/unit/export/regeneration.test.ts.
      'devis.pdf': '766b27d144d7d60895a79c588e49065d6856ee065cdda4762317d970016175c7',
      // La liste d'achat (16 novembre 2026), CSV et PDF, regeneres par le meme test.
      'liste-achat.csv': '7e00c7ea42b84535f73026cc5038ba37396a39e69c3d8e4a521f8aaec06b69db',
      'liste-achat.pdf': '2a6241d8a01e0e28bee1c1133c391943466470c5a3daf295e96ff3d5aa398409'
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

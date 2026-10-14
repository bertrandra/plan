import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// Les fichiers de `deploy/` recopies dans `buildsg/deploy/` par `npm run buildsg`
// (scripts/generer-buildsg.mjs). Ils portent le contrat du serveur : la politique du .htaccess que
// app.js rejoue sans Apache, les prompts, schemas et tarifs que analyseAdmin.mjs lit. Une copie en
// retard sert sur SiteGround un autre contrat que celui d'Apache, sans que rien ne le dise : le
// `htaccess.template` de buildsg/ a ainsi perdu les routes de l'analyse par Claude (lots L17, L18).
// Seul `deploy/` est compare : `src/` suit les versions, il se recopie a chaque livraison.

const racine = path.resolve(__dirname, '../../..');
const CONSIGNE = ' differe de deploy/ : lancez `npm run buildsg` (jamais de copie a la main).';

/** La liste COPIES du script, lue dans son texte : l'importer le lancerait. */
function copiesDuScript(): string[] {
  const texte = fs.readFileSync(path.join(racine, 'scripts/generer-buildsg.mjs'), 'utf8');
  const m = /const COPIES = (\[[^\]]*\]);/.exec(texte);
  if (!m) throw new Error('COPIES introuvable dans scripts/generer-buildsg.mjs');
  return JSON.parse(m[1]!.replace(/'/g, '"')) as string[];
}

describe('buildsg/deploy suit deploy/', () => {
  const copies = copiesDuScript().filter((c) => c.startsWith('deploy/'));

  it('recopie le modele du .htaccess, les prompts, schemas et tarifs', () => {
    expect(copies).toEqual(expect.arrayContaining(['deploy/htaccess.template', 'deploy/prompt-analyse.md', 'deploy/schema-analyse.json', 'deploy/claude-tarifs.json']));
  });

  it('ne porte que des copies conformes', () => {
    const ecarts = copies.filter((c) => {
      const copie = path.join(racine, 'buildsg', c);
      return !fs.existsSync(copie) || !fs.readFileSync(copie).equals(fs.readFileSync(path.join(racine, c)));
    });
    expect(ecarts.map((c) => 'buildsg/' + c + CONSIGNE)).toEqual([]);
  });

  it('ne garde pas de fichier que le script ne recopie plus', () => {
    const presents = fs.readdirSync(path.join(racine, 'buildsg/deploy')).map((f) => 'deploy/' + f);
    expect(presents.filter((p) => !copies.includes(p))).toEqual([]);
  });
});

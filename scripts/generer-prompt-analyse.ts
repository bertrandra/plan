// Ecrit le prompt et le schema d'analyse depuis les descriptions de sujets (src/regles/sujets/), ceux du run d'une facade et ceux de
// la lecture du PLU (src/regles/plu/lecture.ts) :
//   npx tsx scripts/generer-prompt-analyse.ts            ecrit deploy/
//   npx tsx scripts/generer-prompt-analyse.ts --verifier  ne touche a rien ; sort en erreur si un fichier differe
// `deploy/` n'est plus ecrit a la main : on change une description, on lance ceci, on monte la version
// (src/regles/sujets/versions.ts) si le texte a change, et on valide les deux fichiers dans la meme PR.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { genererFichiers, genererLecturePlu, genererRunFacade } from '../src/regles/sujets/generation.js';

const racine = resolve(import.meta.dirname, '..');
const g = genererFichiers(), f = genererRunFacade(), plu = genererLecturePlu();
const cibles: [string, string][] = [['deploy/prompt-analyse.md', g.prompt], ['deploy/schema-analyse.json', g.schema], ['deploy/prompt-facade.md', f.prompt], ['deploy/schema-facade.json', f.schema],
  ['deploy/prompt-plu.md', plu.prompt], ['deploy/schema-plu.json', plu.schema]];
const verifier = process.argv.includes('--verifier');
let ecarts = 0;
for (const [chemin, texte] of cibles) {
  const f = resolve(racine, chemin);
  const actuel = existsSync(f) ? readFileSync(f, 'utf8') : null;
  if (actuel === texte) continue;
  ecarts++;
  if (verifier) console.log('differe : ' + chemin);
  else { writeFileSync(f, texte); console.log('ecrit : ' + chemin); }
}
if (verifier && ecarts) { console.log('Lancez `npm run regles:generer`.'); process.exit(1); }
if (!ecarts) console.log('deploy/ est a jour (analyse : prompt v' + g.versionPrompt + ', schema v' + g.versionSchema + ' ; facade : prompt v' + f.versionPrompt + ', schema v' + f.versionSchema + ' ; plu : prompt v' + plu.versionPrompt + ', schema v' + plu.versionSchema + ').');

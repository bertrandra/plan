// Ecrit le prompt et le schema d'analyse depuis les descriptions de sujets (src/regles/sujets/), ceux du run d'une facade et ceux de
// la lecture du PLU (src/regles/plu/lecture.ts) et ceux de la redaction d'un texte du dossier (src/regles/textes/redaction.ts) :
//   npx tsx scripts/generer-prompt-analyse.ts            ecrit deploy/
//   npx tsx scripts/generer-prompt-analyse.ts --verifier  ne touche a rien ; sort en erreur si un fichier differe
// `deploy/` n'est plus ecrit a la main : on change une description, on lance ceci, on monte la version
// (src/regles/sujets/versions.ts) si le texte a change, et on valide les deux fichiers dans la meme PR.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { genererAssistant, genererFacadeEnrichie, genererFacadeToit, genererFichiers, genererLecturePlu, genererRunFacade, genererRunJardin, genererRedactionTexte } from '../src/regles/sujets/generation.js';

const racine = resolve(import.meta.dirname, '..');
const g = genererFichiers(), f = genererRunFacade(), fe = genererFacadeEnrichie(), plu = genererLecturePlu(), j = genererRunJardin(), ft = genererFacadeToit();
const tx = genererRedactionTexte(), as = genererAssistant();
const cibles: [string, string][] = [['deploy/prompt-analyse.md', g.prompt], ['deploy/schema-analyse.json', g.schema], ['deploy/prompt-facade.md', f.prompt], ['deploy/schema-facade.json', f.schema],
  ['deploy/prompt-plu.md', plu.prompt], ['deploy/schema-plu.json', plu.schema], ['deploy/prompt-jardin.md', j.prompt], ['deploy/schema-jardin.json', j.schema],
  ['deploy/prompt-facade-enrichie.md', fe.prompt], ['deploy/schema-facade-enrichie.json', fe.schema],
  ['deploy/prompt-facade-toit.md', ft.prompt], ['deploy/schema-facade-toit.json', ft.schema],
  ['deploy/prompt-texte.md', tx.prompt], ['deploy/schema-texte.json', tx.schema],
  ['deploy/prompt-assistant.md', as.prompt], ['deploy/schema-assistant.json', as.schema]];
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
if (!ecarts) console.log('deploy/ est a jour (analyse : prompt v' + g.versionPrompt + ', schema v' + g.versionSchema + ' ; facade : prompt v' + f.versionPrompt + ', schema v' + f.versionSchema + ' ; facade enrichie : prompt v' + fe.versionPrompt + ', schema v' + fe.versionSchema + ' ; toit d’une facade : prompt v' + ft.versionPrompt + ', schema v' + ft.versionSchema + ' ; assistant : prompt v' + as.versionPrompt + ', schema v' + as.versionSchema + ' ; plu : prompt v' + plu.versionPrompt + ', schema v' + plu.versionSchema + ' ; jardin : prompt v' + j.versionPrompt + ', schema v' + j.versionSchema + ' ; texte : prompt v' + tx.versionPrompt + ', schema v' + tx.versionSchema + ').');

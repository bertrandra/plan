// L'imperatif : une regle nouvelle ne change pas AE 101 (2 allee des Limites, 78110 Le Vesinet).
// Corps reconstruits sur le releve reel (tests/fixtures/toits/vesinet-ae101.json), avec la surface
// mesuree seule puis avec la grille brute, compares octet pour octet a ceux de la fixture ; et les
// corps des autres fixtures, a comparer avant et apres une modification (rediriger vers un fichier).
//
//   npx tsx .claude/skills/toits/scripts/identite.ts > /tmp/toits/avant.txt     # avant la modification
//   npx tsx .claude/skills/toits/scripts/identite.ts | diff /tmp/toits/avant.txt -
import { readFileSync, readdirSync } from 'node:fs';
import { reconstruireCorps } from '../../../../src/facade/toitCorps.ts';

const F = new URL('../../../../tests/fixtures/toits/', import.meta.url);
let ok = true;
for (const f of readdirSync(F).filter((x) => x.endsWith('.json')).sort()) {
  const d = JSON.parse(readFileSync(new URL(f, F), 'utf8'));
  if (!d.contour || !d.toitMesure) continue;
  for (const g of [undefined, d.grille]) {
    const c = reconstruireCorps(d.toitMesure, d.contour, { grille: g });
    let etat = '';
    if (f === 'vesinet-ae101.json') {
      const meme = JSON.stringify(c) === JSON.stringify(d.corps);
      if (g && !meme) ok = false;
      etat = meme ? 'IDENTIQUE' : 'DIFFERENT';
    }
    console.log(f, g ? 'grille' : 'mesure', etat, JSON.stringify(c?.map((k) => ({ F: k.faitage, e: k.egouts, p: k.posFaitage, cr: k.croupes, pg: k.pignons.length, ec: k.ecart }))));
  }
}
console.log(ok ? 'AE 101 : corps identiques' : 'AE 101 : CORPS CHANGES - la modification est refusee');
process.exitCode = ok ? 0 : 1;

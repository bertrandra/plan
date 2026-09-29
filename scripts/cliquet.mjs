// Le cliquet de rigueur (spec-migration-typescript.md §9.2).
//
// La phase 7 monte les drapeaux du compilateur un par un, mais elle ne peut pas les monter d'un
// coup : 1 375 erreurs au premier barreau. On avance donc **dossier par dossier**, et le problème
// devient : comment empêcher un dossier déjà nettoyé de se re-salir ?
//
// `tsconfig.json` ne sait pas répondre — restreindre `include` ne restreint rien, puisque les
// fichiers importés entrent quand même dans le programme. D'où ce script : il lance `tsc` avec les
// drapeaux visés, et **échoue si une erreur vient d'un dossier déclaré propre**. Les autres sont
// comptés, pas reprochés.
//
// Passer un dossier de « en cours » à « propre » est un geste explicite : on l'ajoute à la liste
// ci-dessous, et il ne peut plus régresser.

import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';

// On lance le script `tsc` du paquet avec le Node courant, sans passer par un shell : `npx` est un
// `.cmd` sous Windows et exigeait `shell: true`, que Node 22 signale comme une faille d'échappement.
const TSC = createRequire(import.meta.url).resolve('typescript/bin/tsc');

/**
 * Les drapeaux du barreau en cours. Vide depuis le 20 septembre 2026 : l'echelle est gravie et
 * `tsconfig.json` porte la configuration cible (§9.1). Le cliquet reste le rapport par dossier, et
 * la garde contre une regression dans l'un d'eux.
 */
const DRAPEAUX = [];

/**
 * Les dossiers de `src/` qui doivent rester à zéro erreur, plus `tests/` comme un seul bloc :
 * il n'a jamais été migré dossier par dossier comme `src/`, mais il vient d'atteindre zéro lui
 * aussi (dette héritée des paliers precedents, soldée le 30 août 2026) et n'a pas de raison d'y
 * revenir sans que ce script le remarque.
 */
const PROPRES = ['core', 'util', 'shell', 'geometry', 'model', 'engine', 'render', 'io', 'interaction', 'app', 'geo', 'three', 'export', 'ui', 'facade', 'tests'];

const sortie = (() => {
  try {
    execFileSync(process.execPath, [TSC, '--noEmit', ...DRAPEAUX], { encoding: 'utf8' });
    return '';
  } catch (e) {
    return String(e.stdout || '');
  }
})();

const erreurs = sortie.split('\n').filter(l => /error TS/.test(l));
const dossierDe = (ligne) => {
  const mSrc = /^src[/\\](\w+)[/\\]/.exec(ligne);
  if (mSrc) return mSrc[1];
  // `tests/` n'est pas subdivisé comme `src/` : un seul bloc, pas un sous-dossier par sous-dossier.
  if (/^tests[/\\]/.test(ligne)) return 'tests';
  return null;
};

const regressions = erreurs.filter(l => PROPRES.includes(dossierDe(l)));
const parDossier = new Map();
for (const l of erreurs) {
  const d = dossierDe(l) || 'ailleurs';
  parDossier.set(d, (parDossier.get(d) || 0) + 1);
}

const largeur = Math.max(...[...parDossier.keys()].map(d => d.length), 8);
console.log(`Cliquet de rigueur — ${DRAPEAUX.length ? DRAPEAUX.join(' ') : 'configuration de tsconfig.json'}\n`);
console.log('  propres : ' + PROPRES.join(', ') + '\n');
for (const [d, n] of [...parDossier.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${d.padEnd(largeur)} ${String(n).padStart(5)}`);
}
console.log(`\n  total ${erreurs.length}\n`);

if (regressions.length) {
  console.error(`ÉCHEC : ${regressions.length} erreur(s) dans un dossier déclaré propre.\n`);
  for (const l of regressions.slice(0, 20)) console.error('  ' + l.trim());
  process.exit(1);
}
console.log('Aucune régression dans les dossiers propres.');

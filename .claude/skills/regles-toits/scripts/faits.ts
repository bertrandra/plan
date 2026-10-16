// Les faits des toits, comptes par forme (MD/spec-regles-toits.md §5, §10) : verifie un fichier de
// faits (celui du depot, ou celui qu'une PR propose), dit combien de faits disent la meme chose et
// signale au-dela de cinq - une regle ou un reglage se cache alors derriere. Rappelle aussi la ligne
// de LECTURES_TOITS qu'il faut ajouter quand les faits changent.
//
//   npx tsx .claude/skills/regles-toits/scripts/faits.ts                     # regles/toits/faits.json
//   npx tsx .claude/skills/regles-toits/scripts/faits.ts /tmp/faits-essai.json
//
// Code de sortie 1 : le fichier est illisible, ou une signature depasse FAITS_SEMBLABLES_MAX.
import { readFileSync } from 'node:fs';
import { lireFaitsToits, compterFaitsParForme, empreinteFaitsToits, EMPREINTE_FAITS_VIDE, FAITS_SEMBLABLES_MAX } from '../../../../src/regles/toits/faits.ts';
import { LECTURES_TOITS, VERSION_LECTURE_TOITS } from '../../../../src/app/toitsLidar.ts';
import { EMPREINTE_REGLAGES_TOITS } from '../../../../src/regles/toits/reglages.ts';

const chemin = process.argv[2] ?? 'regles/toits/faits.json';
const faits = lireFaitsToits(JSON.parse(readFileSync(chemin, 'utf8')));
const groupes = compterFaitsParForme(faits);
const empreinte = empreinteFaitsToits(faits);
const parApplication = Object.values(faits).reduce((n, f) => ({ ...n, [f.application]: (n[f.application] ?? 0) + 1 }), {} as Record<string, number>);

console.log(`${chemin} : ${Object.keys(faits).length} fait(s) (${Object.entries(parApplication).map(([a, n]) => n + ' ' + a).join(', ') || 'aucun'}), empreinte ${empreinte}`);
for (const g of groupes) console.log(`${g.signal ? '!' : ' '} ${String(g.nombre).padStart(3)}  ${g.signature}${g.signal ? `  <- plus de ${FAITS_SEMBLABLES_MAX} faits disent la meme chose : chercher le reglage ou la regle (skill regles-toits, §3)` : ''}`);

const derniere = LECTURES_TOITS.at(-1);
if (empreinte !== (derniere?.faits ?? EMPREINTE_FAITS_VIDE)) {
  console.log(`\nLes faits ont change : ajouter a LECTURES_TOITS (src/app/toitsLidar.ts)\n  { version: ${(derniere?.version ?? VERSION_LECTURE_TOITS) + 1}, reglages: '${EMPREINTE_REGLAGES_TOITS}', faits: '${empreinte}' },\npuis le dire dans le CHANGELOG (« les toits deja lus seront relus a l'ouverture »).`);
}
process.exitCode = groupes.some((g) => g.signal) ? 1 : 0;

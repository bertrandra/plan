// Le taux de conformite du corpus du depot (MD/spec-regles-toits.md §13.5, lot G3) : chaque cas de
// tests/fixtures/audit/ est rejoue avec le code courant (facade/conformite.ts) et juge sur ce que vous
// avez vu. Le tableau dit le taux, par forme, par region et par probleme, puis l'etat de chaque cas.
//
//   npx tsx .claude/skills/toits/scripts/conformite.ts            # le tableau ; code 1 si regles/conformite.json n'est plus a jour
//   npx tsx .claude/skills/toits/scripts/conformite.ts --ecrire   # le tableau, et regles/conformite.json reecrit
//
// regles/conformite.json est ce que l'ecran Admin › Conformité montre du corpus (il ne peut pas
// rejouer tests/fixtures/, qui n'est pas livre) ; tests/unit/facade/conformite.test.ts refuse un
// fichier en retard sur le code. Une PR qui change le taux le montre donc dans son diff.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { lireFichierPromenade } from '../../../../src/model/audit.ts';
import { corpusConformite, texteCorpusConformite } from '../../../../src/facade/conformite.ts';
import { pourCent, resumer, tauxPar, type AxeConformite } from '../../../../src/model/conformite.ts';

const racine = join(import.meta.dirname, '../../../..');
const dossier = join(racine, 'tests/fixtures/audit');
const sortie = join(racine, 'regles/conformite.json');
const fichiers = readdirSync(dossier).filter((f) => f.endsWith('.json')).sort()
  .map((nom) => ({ nom, fichier: lireFichierPromenade(JSON.parse(readFileSync(join(dossier, nom), 'utf8'))) }));
const corpus = corpusConformite(fichiers);
const texte = texteCorpusConformite(corpus);

const r = resumer(corpus.verdicts);
console.log(`conformite du corpus : ${pourCent(r.taux)} (${r.conformes} conforme(s) sur ${r.conformes + r.nonConformes} juge(s)) ; ${r.aRevoir} a revoir, ${r.sansObservation} sans observation, ${r.ecartes} ecarte(s), ${r.horsCalcul} hors calcul ; ${fichiers.length} fichier(s), ${r.total} cas`);
for (const axe of ['forme', 'region', 'probleme'] as AxeConformite[]) {
  console.log(`\npar ${axe} :`);
  for (const l of tauxPar(corpus.verdicts, axe)) console.log(`  ${l.libelle.padEnd(36)} ${String(l.cas).padStart(3)} cas  ${pourCent(l.taux).padStart(5)}  (${l.conformes} conf., ${l.nonConformes} non conf., ${l.aRevoir} a revoir, ${l.sansObservation} sans obs.)`);
}
console.log('\ncas :');
for (const v of corpus.verdicts) console.log(`  ${v.etat.padEnd(16)} ${v.fichier} ${v.id} ${v.cle} ${v.assertions.filter((a) => !a.tenue).map((a) => a.assertion + (a.motif ? ' (' + a.motif + ')' : '')).join(' ; ')}`);

let ancien = '';
try { ancien = readFileSync(sortie, 'utf8'); } catch { /* premier passage */ }
if (process.argv.includes('--ecrire')) {
  writeFileSync(sortie, texte);
  console.log('\nregles/conformite.json ' + (ancien === texte ? 'inchange' : 'reecrit'));
} else if (ancien !== texte) {
  console.log('\nregles/conformite.json n\'est plus a jour : relancer avec --ecrire');
  process.exitCode = 1;
}

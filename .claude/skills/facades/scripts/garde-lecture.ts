// Le garde-fou de la lecture des facades (skill facades §5 quater, MD/RELEASE.md §8.2 bis) : la mesure x1 / x3 d'un dossier du banc
// (ia-x1-x3.ts --preparer, puis scripts/verifier-api-claude.mjs --facades) confrontee a la reference 5.1.0 versionnee
// (tests/fixtures/facades/lecture-5.1.0/reference.json). Sans cle ni reseau : il ne lit que des fichiers.
//
//   npx tsx .claude/skills/facades/scripts/garde-lecture.ts --tableau                                     la reference, en Markdown
//   npx tsx .claude/skills/facades/scripts/garde-lecture.ts --comparer <dossier> [--journal <f>]          la table reference / mesure ;
//       [--a-relancer <dossier2>]    si une ligne baisse : copie les scenes en cause dans <dossier2> (pour UNE relance) et sort a 0
//       [--relance <dossier2> [--journal-relance <f>]]   la mesure ou les scenes relancees remplacent les premieres ; sort a 1
//                                    si une ligne reste sous la reference
//   npx tsx .claude/skills/facades/scripts/garde-lecture.ts --referencer <dossier> --journal <f> --ecrire <fichier> --run <id> --commit <sha> --date <iso>
//                                    ecrire une reference (un changement de reference se voit dans la PR, et se justifie)
//
// Sans --a-relancer, une ligne sous la reference fait sortir a 1. Le cout ne fait jamais echouer.
import { appendFileSync, copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { comparerLecture, FICHIER_REFERENCE_510, mesurerLecture, remplacerScenes, scenesARelancer, tableauLecture, type MesureLecture, type ReferenceLecture } from '../../../../tests/banc/facades/gardeLecture.ts';

const args = process.argv.slice(2);
const opt = (nom: string): string | null => { const i = args.indexOf(nom); return i >= 0 ? (args[i + 1] ?? null) : null; };
const lire = (f: string | null) => (f && existsSync(f) ? readFileSync(f, 'utf8') : null);
const referenceLue = () => JSON.parse(readFileSync(opt('--reference') ?? FICHIER_REFERENCE_510, 'utf8')) as ReferenceLecture;

if (args[0] === '--tableau') {
  console.log(tableauLecture(referenceLue(), null));
} else if (args[0] === '--referencer') {
  const dossier = args[1], ecrire = opt('--ecrire');
  if (!dossier || !ecrire) { console.error('usage : garde-lecture.ts --referencer <dossier> --journal <f> --ecrire <fichier> --run <id> --commit <sha> --date <iso>'); process.exit(2); }
  const m = mesurerLecture(dossier, lire(opt('--journal')));
  const ref: ReferenceLecture = {
    source: {
      run: opt('--run') ?? '?', workflow: 'Vérifier l’API Claude (verifier-api.yml), case « mesure des façades »', commit: opt('--commit') ?? '?', version: '5.1.0', date: opt('--date') ?? '?',
      note: 'Réponses brutes de Claude du run (artefact mesure-facades-x1-x3), rejouées par tests/banc/facades/gardeLecture.ts ; vérités de ia-x1-x3.ts --preparer au même commit. Le coût et les tokens sont une information : ils ne font pas échouer.',
    },
    ...m,
  };
  writeFileSync(ecrire, JSON.stringify(ref, null, 1) + '\n');
  console.log('Référence écrite : ' + ecrire);
} else if (args[0] === '--comparer') {
  const dossier = args[1];
  if (!dossier) { console.error('usage : garde-lecture.ts --comparer <dossier> [--journal <f>] [--a-relancer <dossier2> | --relance <dossier2>]'); process.exit(2); }
  const reference = referenceLue();
  const premiere = mesurerLecture(dossier, lire(opt('--journal')));
  const relance = opt('--relance');
  let mesure: MesureLecture = premiere;
  if (relance && existsSync(relance)) {
    // La relance : les scenes relancees remplacent les premieres. La premiere mesure reste dans le resume, au-dessus.
    mesure = remplacerScenes(premiere, mesurerLecture(relance, lire(opt('--journal-relance'))));
  }
  const regressions = comparerLecture(reference, mesure);
  const titre = relance ? '### Garde-fou de la lecture : après la relance' : '### Garde-fou de la lecture : référence 5.1.0 contre la mesure';
  console.log(titre + '\n\n' + tableauLecture(reference, mesure, regressions));
  const aRelancer = opt('--a-relancer');
  if (regressions.length && aRelancer && !relance) {
    // Une ligne sous la reference peut etre du bruit d'un appel : on relance UNE fois les scenes en cause (la regle ecrite).
    mkdirSync(aRelancer, { recursive: true });
    const scenes = scenesARelancer(regressions);
    // L'escalade seule en cause : le verificateur la rejoue de toute facon ; une scene suffit a le relancer.
    const aCopier = scenes.length ? scenes : readdirSync(dossier).filter((f) => f.endsWith('.verite.json')).slice(0, 1).map((f) => f.replace(/\.verite\.json$/, ''));
    for (const s of aCopier) for (const ext of ['.png', '.texte.txt', '.verite.json']) if (existsSync(join(dossier, s + ext))) copyFileSync(join(dossier, s + ext), join(aRelancer, s + ext));
    console.log('\nÀ relancer une fois : ' + aCopier.join(', ') + '.');
    if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, 'relance=true\n');
    process.exit(0);
  }
  process.exit(regressions.length ? 1 : 0);
} else {
  console.error('usage : garde-lecture.ts --tableau | --comparer <dossier> … | --referencer <dossier> …');
  process.exit(2);
}

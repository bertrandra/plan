// Le garde-fou de la lecture des facades (skill facades §5 quater, MD/RELEASE.md §8.2 bis) : la mesure x1 / x3 d'un dossier du banc
// (ia-x1-x3.ts --preparer, puis scripts/verifier-api-claude.mjs --facades) confrontee au PLANCHER de chaque ligne, le pire de trois
// mesures de main (tests/fixtures/facades/lecture-5.1.0/reference.json). Sans cle ni reseau : il ne lit que des fichiers.
//
//   npx tsx .claude/skills/facades/scripts/garde-lecture.ts --tableau                                     les planchers, en Markdown
//   npx tsx .claude/skills/facades/scripts/garde-lecture.ts --comparer <dossier> [--journal <f>]          la table plancher / mesure ;
//       [--a-relancer <dossier2>]    si une ligne est sous le plancher : copie les scenes en cause dans <dossier2> (pour UNE relance)
//                                    et sort a 0
//       [--relance <dossier2> [--journal-relance <f>]]   les scenes relancees remplacent les premieres ; sort a 1 si une ligne est
//                                    sous le plancher a la premiere mesure ET a la relance
//   npx tsx .claude/skills/facades/scripts/garde-lecture.ts --referencer <fichier> --mesure <run>,<commit>,<date>,<dossier>[,<journal>] …
//                                    ecrire la reference (les mesures et leur plancher) ; un changement se voit dans la PR, et se justifie
//
// Sans --a-relancer, une ligne sous le plancher fait sortir a 1. Le cout ne fait jamais echouer.
import { appendFileSync, copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { comparerLecture, FICHIER_REFERENCE_510, mesurerLecture, plancherDe, regressionsApresRelance, remplacerScenes, scenesARelancer, tableauLecture, type MesureLecture, type ReferenceLecture, type Regression } from '../../../../tests/banc/facades/gardeLecture.ts';

const args = process.argv.slice(2);
const opt = (nom: string): string | null => { const i = args.indexOf(nom); return i >= 0 ? (args[i + 1] ?? null) : null; };
const toutes = (nom: string): string[] => args.flatMap((a, i) => (a === nom && args[i + 1] ? [args[i + 1] as string] : []));
const lire = (f: string | null | undefined) => (f && existsSync(f) ? readFileSync(f, 'utf8') : null);
const referenceLue = () => JSON.parse(readFileSync(opt('--reference') ?? FICHIER_REFERENCE_510, 'utf8')) as ReferenceLecture;

if (args[0] === '--tableau') {
  console.log(tableauLecture(referenceLue().plancher, null));
} else if (args[0] === '--referencer') {
  const ecrire = args[1], mesures = toutes('--mesure').map((m) => m.split(','));
  if (!ecrire || !mesures.length || mesures.some((m) => m.length < 4)) { console.error('usage : garde-lecture.ts --referencer <fichier> --mesure <run>,<commit>,<date>,<dossier>[,<journal>] …'); process.exit(2); }
  const lues = mesures.map(([run, commit, date, dossier, journal]) => ({
    source: { run: run as string, commit: commit as string, date: date as string, note: 'Première mesure du run (avant toute relance), rejouée par tests/banc/facades/gardeLecture.ts sur l’artefact mesure-facades-x1-x3.' },
    mesure: mesurerLecture(dossier as string, lire(journal)),
  }));
  const ref: ReferenceLecture = {
    source: {
      workflow: 'Vérifier l’API Claude (verifier-api.yml), case « mesure des façades »', version: '5.1.0 (code de lecture de 1ea13701)',
      regle: 'Plancher de chaque ligne : le pire des mesures de main ci-dessous (décision du propriétaire, 30 octobre 2026). x3 : par scène les baies, genres, pointes et parement, au total toutes les lignes (angles et carreaux au total seulement) ; x1 : au total seulement. Une relance des scènes en cause ; régression si la ligne est sous le plancher aux deux mesures. Le coût n’est qu’une information.',
      rejeu: 'Les réponses brutes rejouées hors ligne (tests/fixtures/facades/lecture-5.1.0/*.reponses.json) sont celles du run ' + (lues[0]?.source.run ?? '?') + '.',
    },
    mesures: lues,
    plancher: plancherDe(lues.map((m) => m.mesure)),
  };
  writeFileSync(ecrire, JSON.stringify(ref, null, 1) + '\n');
  console.log('Référence écrite : ' + ecrire);
} else if (args[0] === '--comparer') {
  const dossier = args[1];
  if (!dossier) { console.error('usage : garde-lecture.ts --comparer <dossier> [--journal <f>] [--a-relancer <dossier2> | --relance <dossier2>]'); process.exit(2); }
  const { plancher } = referenceLue();
  const premiere = mesurerLecture(dossier, lire(opt('--journal')));
  const relance = opt('--relance');
  let mesure: MesureLecture = premiere, regressions = comparerLecture(plancher, premiere), nouvelles: Regression[] = [];
  if (relance && existsSync(relance)) {
    // La relance : les scenes relancees remplacent les premieres dans la table ; une regression est une ligne sous le plancher aux DEUX
    // mesures (la regle du bruit). La premiere table reste dans le resume, au-dessus.
    const second = mesurerLecture(relance, lire(opt('--journal-relance')));
    mesure = remplacerScenes(premiere, second);
    ({ restees: regressions, nouvelles } = regressionsApresRelance(plancher, premiere, second));
  }
  const titre = relance ? '### Garde-fou de la lecture : après la relance' : '### Garde-fou de la lecture : planchers contre la mesure';
  console.log(titre + '\n\n' + tableauLecture(plancher, mesure, regressions, nouvelles));
  const aRelancer = opt('--a-relancer');
  if (regressions.length && aRelancer && !relance) {
    // Une ligne sous le plancher peut etre du bruit d'un appel : on relance UNE fois les scenes en cause (la regle ecrite).
    mkdirSync(aRelancer, { recursive: true });
    const scenesDuDossier = readdirSync(dossier).filter((f) => f.endsWith('.verite.json')).map((f) => f.replace(/\.verite\.json$/, ''));
    const scenes = scenesARelancer(regressions, scenesDuDossier);
    // L'escalade seule en cause : le verificateur la rejoue de toute facon ; une scene suffit a le relancer.
    const aCopier = scenes.length ? scenes : scenesDuDossier.slice(0, 1);
    for (const s of aCopier) for (const ext of ['.png', '.texte.txt', '.verite.json']) if (existsSync(join(dossier, s + ext))) copyFileSync(join(dossier, s + ext), join(aRelancer, s + ext));
    console.log('\nÀ relancer une fois : ' + aCopier.join(', ') + '.');
    if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, 'relance=true\n');
    process.exit(0);
  }
  process.exit(regressions.length ? 1 : 0);
} else {
  console.error('usage : garde-lecture.ts --tableau | --comparer <dossier> … | --referencer <fichier> --mesure …');
  process.exit(2);
}

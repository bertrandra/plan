// Les dix demandes de reference de l'assistant (lot L6, tests/fixtures/assistant/) contre la vraie API, sans jamais voir la cle :
//
//   npx tsx scripts/assistant-reference.ts --preparer <dossier>     une requete par demande (<id>.requete.json), catalogue genere
//   ANTHROPIC_API_KEY=… node scripts/verifier-api-claude.mjs --assistant <dossier>   les envoie par le serveur PHP (<id>.reponse.json)
//   npx tsx scripts/assistant-reference.ts --evaluer <dossier>      juge chaque liste (tableau en Markdown) ; sort en erreur si une est fausse
//   npx tsx scripts/assistant-reference.ts --enregistrer <dossier> --source "<d'ou>"   ecrit tests/fixtures/assistant/reponses.json
//   npx tsx scripts/assistant-reference.ts --verification [--verifier]   la requete de la verification par defaut de l'API
//                                                                        (tests/fixtures/assistant/requete-verification.json)

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { DEMANDES, contenuDe, juger } from '../tests/fixtures/assistant/reference.js';

const racine = resolve(import.meta.dirname, '..');
const args = process.argv.slice(2);
const valeur = (nom: string) => { const i = args.indexOf(nom); return i >= 0 ? args[i + 1] : undefined; };
const lireJson = (f: string) => JSON.parse(readFileSync(f, 'utf8')) as Record<string, unknown>;
const VERIFICATION = join(racine, 'tests/fixtures/assistant/requete-verification.json');

/** La requete de la verification par defaut : la premiere demande de reference, telle que Plan l'enverrait. */
const requeteVerification = () => JSON.stringify({ format: 'plan-assistant-requete', note: 'Genere par scripts/assistant-reference.ts --verification : la premiere demande de reference sur la demonstration, telle que Plan l envoie. Ne pas ecrire a la main.', id: DEMANDES[0]!.id, contenu: contenuDe(DEMANDES[0]!) }, null, 2) + '\n';

if (args.includes('--preparer')) {
  const d = valeur('--preparer')!;
  mkdirSync(d, { recursive: true });
  for (const x of DEMANDES) writeFileSync(join(d, x.id + '.requete.json'), JSON.stringify({ id: x.id, contenu: contenuDe(x) }));
  console.log(DEMANDES.length + ' requêtes préparées dans ' + d + '.');
} else if (args.includes('--evaluer')) {
  const d = valeur('--evaluer')!;
  const lignes = ['| Demande | Juste | Liste rendue | Coût |', '|---|---|---|---|'];
  let justes = 0, cout = 0;
  for (const x of DEMANDES) {
    const f = join(d, x.id + '.reponse.json');
    if (!existsSync(f)) { lignes.push('| ' + x.id + ' | non | (pas de réponse) | — |'); continue; }
    const r = lireJson(f);
    const j = juger(x, r.sortie);
    if (j.juste) justes++;
    if (typeof r.cout === 'number') cout += r.cout;
    lignes.push('| ' + x.id + ' | ' + (j.juste ? 'oui' : '**non**') + ' | ' + j.raison.replace(/\|/g, '/') + ' | ' + (typeof r.cout === 'number' ? r.cout.toFixed(5) + ' $' : '—') + ' |');
  }
  console.log('### Assistant : les dix demandes de référence\n\n' + lignes.join('\n') + '\n\n' + justes + ' liste(s) juste(s) sur ' + DEMANDES.length + ' ; coût ' + cout.toFixed(5) + ' $ (' + (cout / DEMANDES.length).toFixed(5) + ' $ la demande).');
  process.exit(justes === DEMANDES.length ? 0 : 1);
} else if (args.includes('--enregistrer')) {
  const d = valeur('--enregistrer')!;
  const source = valeur('--source') ?? 'API Claude';
  const reponses: Record<string, unknown> = {};
  for (const x of DEMANDES) {
    const r = lireJson(join(d, x.id + '.reponse.json'));
    reponses[x.id] = { sortie: r.sortie, modele: r.modele ?? null, cout: r.cout ?? null, structuree: r.structuree ?? null };
  }
  writeFileSync(join(racine, 'tests/fixtures/assistant/reponses.json'), JSON.stringify({ format: 'plan-assistant-reponses', source, reponses }, null, 2) + '\n');
  console.log('tests/fixtures/assistant/reponses.json écrit (' + DEMANDES.length + ' réponses, ' + source + ').');
} else if (args.includes('--verification')) {
  const texte = requeteVerification();
  const actuel = existsSync(VERIFICATION) ? readFileSync(VERIFICATION, 'utf8') : null;
  if (args.includes('--verifier')) {
    if (actuel !== texte) { console.log('differe : tests/fixtures/assistant/requete-verification.json (npx tsx scripts/assistant-reference.ts --verification)'); process.exit(1); }
    console.log('tests/fixtures/assistant/requete-verification.json est à jour.');
  } else if (actuel !== texte) { writeFileSync(VERIFICATION, texte); console.log('écrit : tests/fixtures/assistant/requete-verification.json'); }
  else console.log('tests/fixtures/assistant/requete-verification.json est à jour.');
} else {
  console.log('usage : npx tsx scripts/assistant-reference.ts --preparer <dossier> | --evaluer <dossier> | --enregistrer <dossier> --source <texte> | --verification [--verifier]');
  process.exit(2);
}

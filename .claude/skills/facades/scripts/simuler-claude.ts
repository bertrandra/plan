// Ecrit les reponses SIMULEES du renfort de Claude (lot L18) pour chaque scene du corpus, dans
// tests/fixtures/facades/claude/<scene>.json : trois passes au format de deploy/schema-renfort.json,
// qui imitent les erreurs typiques de Claude de facon deterministe (tests/banc/facades/renfort.ts).
// Le banc les relit pour mesurer le recalage des graines : algorithme seul, puis avec le renfort.
//
//   npx tsx .claude/skills/facades/scripts/simuler-claude.ts            tout le corpus
//   npx tsx .claude/skills/facades/scripts/simuler-claude.ts 07 brique  les scenes dont le nom contient l'un des mots
//
// A relancer seulement quand une scene change (ou quand on en ajoute une) : les reponses sont
// enregistrees avec les ouvertures numerotees de ce jour-la, et le banc les renumerote sur la
// detection du jour. De vraies reponses de Claude, issues des audits, prendront leur place.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chargerCorpus, rejouerScene } from '../../../../tests/banc/facades/banc.ts';
import { DOSSIER_REPONSES, fichierSimule } from '../../../../tests/banc/facades/renfort.ts';

const filtres = process.argv.slice(2);
mkdirSync(DOSSIER_REPONSES, { recursive: true });
for (const s of chargerCorpus().filter((x) => !filtres.length || filtres.some((m) => x.nom.includes(m)))) {
  const f = fichierSimule(s, rejouerScene(s));
  if (!f) {
    console.log('sans chaine du releve :', s.nom);
    continue;
  }
  // Une passe par ligne : le fichier reste court, et un changement de simulation se lit au diff.
  const { reponses, ...tete } = f;
  const texte = JSON.stringify(tete, null, 1).replace(/\n}$/, ',\n "reponses": [\n' + reponses.map((r) => '  ' + JSON.stringify(r)).join(',\n') + '\n ]\n}');
  writeFileSync(join(DOSSIER_REPONSES, s.nom + '.json'), texte + '\n');
  console.log('reponses simulees ecrites :', s.nom);
}

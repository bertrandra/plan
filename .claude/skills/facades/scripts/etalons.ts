// Le catalogue des etalons de synthese (src/facade/banc/etalons.ts::ficheEtalon) : ce que couvre chaque scene du corpus
// (tests/fixtures/facades/), pour CHOISIR un etalon existant avant de fabriquer une scene, un cas ou un projet de test.
//
//   npx tsx .claude/skills/facades/scripts/etalons.ts                 # tout le catalogue, en Markdown
//   npx tsx .claude/skills/facades/scripts/etalons.ts pignon haie     # les etalons dont la fiche contient l'un des mots
//   npx tsx .claude/skills/facades/scripts/etalons.ts --json          # les fiches, en JSON
//
// Un mot se cherche dans le nom, les difficultes, les details des ouvertures, le parement, les obstacles, les ombres et les etapes
// (`calage`, `silhouette`… ou `É5`).

import { chargerCorpus } from '../../../../tests/banc/facades/banc.ts';
import { ficheEtalon, type FicheEtalon } from '../../../../src/facade/banc/etalons.ts';
import { ETAPES_FACADE } from '../../../../src/model/etapeFacade.ts';

const args = process.argv.slice(2);
const json = args.includes('--json');
const mots = args.filter((a) => !a.startsWith('--')).map((m) => m.toLowerCase());
const numero = new Map(ETAPES_FACADE.map((e) => [e.id, e.numero]));

const motsDe = (f: FicheEtalon) => [f.nom, ...f.difficultes, ...f.details, f.parement, ...f.obstacles, ...f.ombres, ...f.etapes, ...f.etapes.map((e) => numero.get(e) ?? e), ...Object.keys(f.ouvertures),
  ...(f.pignonM > 0 ? ['pignon'] : []), ...(f.partiesBasses ? ['partie basse'] : []), ...(f.photos > 1 ? ['vues'] : []), ...(f.distorsion ? ['distorsion'] : []), ...(f.focaleConnue ? [] : ['focale inconnue'])]
  .map((m) => m.toLowerCase());
const fiches = chargerCorpus().map(ficheEtalon).filter((f) => !mots.length || mots.some((m) => motsDe(f).some((x) => x.includes(m))));

if (json) {
  console.log(JSON.stringify(fiches, null, 2));
} else {
  const v = (x: number) => String(Math.round(x * 10) / 10).replace('.', ',');
  console.log('| Étalon | Prise | Photos | Mur (m) | Parement | Pignon | Parties basses | Devant | Ouvertures | Détails | Étapes éprouvées |');
  console.log('|---|---|--:|---|---|---|--:|---|---|---|---|');
  for (const f of fiches) {
    const prise = f.prise === 'coins' ? 'coins' : `caméra${f.biaisDeg ? ', biais ' + Math.round(f.biaisDeg) + '°' : ''}${f.distorsion ? ', distorsion' : ''}${f.focaleConnue ? '' : ', focale inconnue'}`;
    const pignon = f.pignonM > 0 ? v(f.pignonM) + ' m' + (Math.abs(f.pignonSommet - 0.5) > 0.01 ? ' (sommet à ' + v(f.pignonSommet) + ')' : '') : '—';
    const ouv = Object.entries(f.ouvertures).map(([t, n]) => `${n} ${t}`).join(', ') || '—';
    console.log(`| ${f.nom} | ${prise} | ${f.photos} | ${v(f.largeurM)} × ${v(f.hauteurM)} | ${f.parement}${f.soubassement ? ' + soubassement' : ''} | ${pignon} | ${f.partiesBasses} | ${[...f.obstacles, ...f.ombres.map((o) => 'ombre ' + o)].join(', ') || '—'} | ${ouv} | ${f.details.join(', ') || '—'} | ${f.etapes.map((e) => numero.get(e)).join(' ')} |`);
  }
  console.log(`\n${fiches.length} étalon${fiches.length > 1 ? 's' : ''}.`);
}

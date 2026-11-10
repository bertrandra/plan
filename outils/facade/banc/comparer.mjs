#!/usr/bin/env node
// Compare deux fichiers de resultats (rejouer.mjs --csv), image par image : ce qui monte, ce qui
// descend, par famille et par groupe. Une image seule bouge de 0,05 d'un cadrage a l'autre : on lit
// d'abord les totaux, puis les images qui bougent le plus.
//
//   node comparer.mjs <reference.csv> <nouveau.csv> [seuil]      (seuil : ecart de note a lister, 0,03 par defaut)

import { readFileSync } from 'node:fs';
import { POIDS } from './noter.mjs';

const [a, b, seuil = '0.03'] = process.argv.slice(2);
if (!a || !b) {
  console.error('usage : node comparer.mjs <reference.csv> <nouveau.csv> [seuil]');
  process.exit(2);
}
const lire = (f) => {
  const t = new Map();
  for (const l of readFileSync(f, 'utf8').trim().split('\n').slice(1)) {
    const [famille, image, groupe, note, justes, fausses, manquees] = l.split(';');
    t.set(famille + '/' + image, { famille, image, groupe, note: Number(note), justes: Number(justes), fausses: Number(fausses), manquees: Number(manquees) });
  }
  return t;
};
const A = lire(a),
  B = lire(b);
const communes = [...A.keys()].filter((k) => B.has(k));
console.log(`${communes.length} images communes ; ${A.size - communes.length} seulement dans la reference, ${B.size - communes.length} seulement dans le nouveau`);

// Par famille : la note globale (0,55 maison + 0,35 cmp + 0,10 synth sur les groupes presents) et le decompte.
const globale = (lignes) => {
  const par = {};
  for (const x of lignes) (par[x.groupe] ??= []).push(x.note);
  const poids = Object.keys(par).reduce((s, g) => s + (POIDS[g] ?? 0), 0);
  return Object.entries(par).reduce((s, [g, n]) => s + ((POIDS[g] ?? 0) * n.reduce((p, q) => p + q, 0)) / n.length / poids, 0);
};
const familles = [...new Set(communes.map((k) => A.get(k).famille))];
console.log('\nfamille        reference  nouveau    ecart   montent descendent   justes / fausses / manquees');
for (const f of familles) {
  const ks = communes.filter((k) => A.get(k).famille === f);
  const la = ks.map((k) => A.get(k)),
    lb = ks.map((k) => B.get(k));
  const ga = globale(la),
    gb = globale(lb);
  const somme = (l, c) => l.reduce((s, x) => s + x[c], 0);
  const monte = ks.filter((k) => B.get(k).note - A.get(k).note > 0.005).length,
    descend = ks.filter((k) => B.get(k).note - A.get(k).note < -0.005).length;
  console.log(`${f.padEnd(14)} ${ga.toFixed(4)}     ${gb.toFixed(4)}   ${(gb - ga >= 0 ? '+' : '') + (gb - ga).toFixed(4)}   ${String(monte).padStart(4)}    ${String(descend).padStart(4)}       ${somme(la, 'justes')} / ${somme(la, 'fausses')} / ${somme(la, 'manquees')}  ->  ${somme(lb, 'justes')} / ${somme(lb, 'fausses')} / ${somme(lb, 'manquees')}`);
}
const bougent = communes.map((k) => ({ k, d: B.get(k).note - A.get(k).note })).filter((x) => Math.abs(x.d) >= Number(seuil)).sort((x, y) => x.d - y.d);
console.log(`\n${bougent.length} images bougent de ${seuil} ou plus :`);
for (const { k, d } of bougent) {
  const x = A.get(k),
    y = B.get(k);
  console.log(`  ${k.padEnd(40)} ${x.note.toFixed(3)} (${x.justes}/${x.fausses}/${x.manquees}) -> ${y.note.toFixed(3)} (${y.justes}/${y.fausses}/${y.manquees})  ${(d >= 0 ? '+' : '') + d.toFixed(3)}`);
}

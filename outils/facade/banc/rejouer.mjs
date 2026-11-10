#!/usr/bin/env node
// Rejoue un vote (baies.ts) sur les boites rangees des trois detecteurs (ranger.mjs), et le note
// comme evaluer.mjs. Dans le paquet du vote, les trois detecteurs sont remplaces par des bouchons
// qui rendent les boites rangees : le vote ne regarde pas l'image, le rejeu rend donc exactement
// les notes du banc reel (verifie sur l'entrainement et sur un jeu tenu a l'ecart).
//
//   node rejouer.mjs <vote.ts> <P> <M> <T> <famille> ... [--boites <dossier>] [--json <fichier>] [--detail]
//
// <P> <M> <T> : les etiquettes des boites de propositions, mailles et travees. Une ligne par
// famille (--detail), puis la MESURE LARGE : les notes regroupees par groupe d'images, toutes
// familles confondues - une image seule bouge de 0,05 d'un cadrage a l'autre et la note d'un jeu
// tient a trois ou quatre vues de la maison, on ne decide donc rien sur un seul jeu.

import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { noter, parGroupes } from './noter.mjs';

const RACINE = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const esbuild = createRequire(RACINE + '/package.json')('esbuild');
const args = process.argv.slice(2);
const opt = (n) => {
  const i = args.indexOf(n);
  return i >= 0 ? args.splice(i, 2)[1] : null;
};
const drapeau = (n) => {
  const i = args.indexOf(n);
  return i >= 0 && args.splice(i, 1).length > 0;
};
const BOITES = resolve(opt('--boites') ?? RACINE + '/node_modules/.cache/facade-banc');
const json = opt('--json');
const detail = drapeau('--detail');
const [vote, P, M, T, ...familles] = args;
if (!vote || !T || !familles.length) {
  console.error('usage : node rejouer.mjs <vote.ts> <P> <M> <T> <famille> ... [--boites <dossier>] [--json <fichier>] [--detail]');
  process.exit(2);
}

const bouchons = {
  name: 'bouchons',
  setup(b) {
    b.onResolve({ filter: /baies\/(propositions|mailles|travees)\.js$/ }, (a) => ({ path: a.path.match(/(propositions|mailles|travees)/)[1], namespace: 'bouchon' }));
    // Un detecteur sans boites rangees pour l'image s'abstient, comme un detecteur qui echoue.
    b.onLoad({ filter: /.*/, namespace: 'bouchon' }, (a) => ({ contents: `export function detecterBaies() { const r = globalThis.__DETS[${JSON.stringify(a.path)}]; if (!r) throw new Error('abstention'); return r; }`, loader: 'js' }));
  },
};
const paquet = resolve(tmpdir(), `vote-${process.pid}.mjs`);
await esbuild.build({ entryPoints: [resolve(vote)], bundle: true, format: 'esm', platform: 'node', outfile: paquet, logLevel: 'warning', absWorkingDir: RACINE, plugins: [bouchons] });
const { detecterBaies } = await import(pathToFileURL(paquet).href);

const charge = (e, f) => JSON.parse(readFileSync(`${BOITES}/${e}/${f}.json`, 'utf8'));
const tout = {};
const toutes = [];
for (const f of familles) {
  const bp = charge(P, f),
    bm = charge(M, f),
    bt = charge(T, f);
  const lignes = [];
  for (const nom of Object.keys(bp)) {
    const m = bp[nom].m;
    globalThis.__DETS = { propositions: structuredClone(bp[nom].r), mailles: structuredClone(bm[nom]?.r ?? null), travees: structuredClone(bt[nom]?.r ?? null) };
    let r,
      erreur = null;
    try {
      r = detecterBaies({ largeur: m.largeur, hauteur: m.hauteur, donnees: new Uint8ClampedArray(0) }, null, m.pxParM ?? null);
    } catch (x) {
      erreur = String(x);
      r = { baies: [] };
    }
    const dets = r.baies.map((b) => b.px).filter((b) => [b.x, b.y, b.l, b.h].every(Number.isFinite) && b.l > 0 && b.h > 0);
    const n = noter(m, dets);
    lignes.push({ nom, groupe: m.groupe, note: n.note, tp: n.tp, fp: n.fp, fn: n.fn, fObj: n.fObj, fPix: n.fPix, iou: n.iouMoy, erreur, baies: r.baies, solPx: r.solPx ?? null });
  }
  const { par, globale } = parGroupes(lignes);
  tout[f] = { globale, par, lignes };
  toutes.push(...lignes);
  if (detail) console.log(`${f.padEnd(13)} ${globale.toFixed(4)}  ` + Object.entries(par).map(([g, v]) => `${g} ${v.note.toFixed(3)} R${Math.round(100 * v.rappel)} P${Math.round(100 * v.precision)}`).join(' | '));
}
const large = parGroupes(toutes);
console.log(
  `[${P} ${M} ${T}] ` +
    Object.entries(large.par)
      .map(([g, v]) => `${g} (${v.images}) ${v.note.toFixed(4)} : ${v.tp} justes, ${v.fp} fausses, ${v.fn} manquees`)
      .join(' | ') +
    ` | LARGE ${large.globale.toFixed(4)}`,
);
if (json) writeFileSync(json, JSON.stringify(tout));

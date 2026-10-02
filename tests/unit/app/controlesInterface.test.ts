import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { CONTROLES, NATURES } from '../../../src/app/controlesInterface.js';
import { ZONES_DOM } from '../../../src/app/inventaireEcran.js';
import { EXPOSITION } from '../../../src/app/exposition.js';

// Le catalogue des controles d'interface (app/controlesInterface.ts) et le code qui les affiche se
// tiennent l'un l'autre, comme le registre et la carte d'exposition (exposition.test.ts) : toute
// cle `data-controle` du code est declaree, toute declaration est portee par un controle du code.

const racine = resolve(__dirname, '../../..');
function fichiers(dossier: string): string[] {
  const abs = resolve(racine, dossier);
  return readdirSync(abs).flatMap((n) => statSync(join(abs, n)).isDirectory() ? fichiers(join(dossier, n)) : [join(dossier, n)]);
}
const sources = fichiers('src/zones').filter((f) => f.endsWith('.tsx')).map((f) => readFileSync(resolve(racine, f), 'utf8')).join('\n');

/** Les cles ecrites en toutes lettres : `data-controle="…"` et la prop `controle="…"`. */
const litterales = new Set([...sources.matchAll(/\b(?:data-controle|controle)="([^"]+)"/g)].map((m) => m[1]!));
/** Les cles composees : un prefixe et une variable, `'explorateur.etiquettesTous.' + champ`. */
const prefixes = [...sources.matchAll(/data-controle=\{'([^']+\.)' \+ [\w.]+\}/g)].map((m) => m[1]!);
/** Les cles d'une vue 3D : `vue + '.date'`, `ids.vue + '.date'`, pour la Vue 3D et la visionneuse. */
const suffixes = [...sources.matchAll(/data-controle=\{(?:ids\.)?vue \+ '(\.[A-Za-z]+)'\}/g)].map((m) => m[1]!);

function porte(cle: string): boolean {
  return litterales.has(cle) || prefixes.some((p) => cle.startsWith(p))
    || suffixes.some((s) => cle === 'vue3d' + s || cle === 'visionneuse' + s);
}

describe('catalogue des controles d interface', () => {
  it('chaque cle du code est declaree', () => {
    const inconnues = [...litterales].filter((c) => !(c in CONTROLES));
    expect(inconnues).toEqual([]);
    for (const p of prefixes) expect(Object.keys(CONTROLES).some((c) => c.startsWith(p)), p).toBe(true);
    for (const s of suffixes) for (const v of ['vue3d', 'visionneuse']) expect(v + s in CONTROLES, v + s).toBe(true);
  });

  it('chaque declaration est portee par un controle du code', () => {
    expect(Object.keys(CONTROLES).filter((c) => !porte(c))).toEqual([]);
  });

  it('chaque controle a un libelle, une zone et une nature connue', () => {
    for (const [cle, c] of Object.entries(CONTROLES)) {
      expect(c.libelle.length, cle).toBeGreaterThan(2);
      // Une zone de l'ecran telle que l'inventaire la nomme : les deux branches se recoupent.
      expect(Object.values(ZONES_DOM), cle).toContain(c.zone);
      expect(NATURES[c.nature], cle).toBeDefined();
      // Un controle de parcours dit qui ouvre son ecran.
      if (c.nature === 'parcours') expect(c.ouvertPar, cle).toBeTruthy();
    }
  });

  it('ne garde aucun controle de nature objet : ils sont devenus des commandes', () => {
    expect(Object.entries(CONTROLES).filter(([, c]) => c.nature === 'objet').map(([k]) => k)).toEqual([]);
  });

  it('classe ce qu ecrit chaque saisie de donnee du projet', () => {
    for (const [cle, c] of Object.entries(CONTROLES)) if (c.nature === 'donnee') expect(c.ecrit, cle).toBeDefined();
  });

  it('ouvre un parcours par une commande qui existe, quand il en nomme une', () => {
    for (const [cle, c] of Object.entries(CONTROLES)) {
      const id = c.ouvertPar;
      if (id && /^[a-z0-9]+\.[A-Za-z]+$/.test(id)) expect(EXPOSITION[id], cle + ' : ' + id).toBeDefined();
      // Les droits « de la commande » supposent une commande qui ouvre l'ecran.
      if (c.ecrit?.droits === 'commande') expect(id && id in EXPOSITION, cle).toBe(true);
    }
  });
});

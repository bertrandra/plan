import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';

// Une regle d'architecture qu'aucun test ne verifie n'est pas une regle, c'est un souhait. Celle-ci
// tient aujourd'hui ; ce fichier est ce qui la fera tenir demain (architecture.md §9).

const src = resolve(__dirname, '../../src');

/**
 * Les couches, de la plus pure a la plus dependante. Une couche ne peut importer que d'un niveau
 * inferieur ou egal au sien.
 *
 * - **0** `shell` et `util` : des primitives. `util` est pur ; `shell` touche au DOM mais ne connait
 *   rien du domaine — dire un message, trouver un element.
 * - **1** `geometry` : des mathematiques, rien d'autre.
 * - **2** `model` : ce qu'est un plan. Les donnees et leurs regles.
 * - **3** `engine`, `geo` : ce qu'on calcule a partir du plan, et ce qu'on va chercher dehors.
 * - **4** `core`, `io`, `render`, `export`, `three`, `interaction` : ce qui fait quelque chose du
 *   plan — l'afficher, l'enregistrer, l'exporter, le manipuler.
 * - **5** `ui` : les panneaux.
 * - **6** `app` : ce qui orchestre le tout.
 */
const NIVEAU: Record<string, number> = {
  shell: 0, util: 0,
  geometry: 1,
  model: 2,
  engine: 3, geo: 3,
  core: 4, io: 4, render: 4, export: 4, three: 4, interaction: 4,
  ui: 5,
  app: 6
};

function fichiersTs(dir: string): string[] {
  return readdirSync(dir).flatMap(nom => {
    const chemin = join(dir, nom);
    if (statSync(chemin).isDirectory()) return fichiersTs(chemin);
    return chemin.endsWith('.ts') ? [chemin] : [];
  });
}

/** Les imports d'un fichier vers une autre couche, hors imports de type (effaces au build). */
function importsInterCouches(chemin: string): string[] {
  return readFileSync(chemin, 'utf8').split('\n')
    .filter(l => !/^\s*import type /.test(l))
    .map(l => /from '\.\.\/(\w+)\//.exec(l))
    .filter((m): m is RegExpExecArray => m !== null)
    .map(m => m[1]!);
}

describe('les fleches ne pointent que vers le bas', () => {
  it('aucun module n importe d une couche plus haute que la sienne', () => {
    const violations: string[] = [];
    for (const couche of Object.keys(NIVEAU)) {
      let fichiers: string[];
      try { fichiers = fichiersTs(join(src, couche)); } catch { continue; }
      for (const f of fichiers) {
        for (const cible of importsInterCouches(f)) {
          if (NIVEAU[cible] !== undefined && NIVEAU[cible] > NIVEAU[couche]!) {
            violations.push(`${couche}/${f.split(/[\\/]/).pop()} -> ${cible}/ (niveau ${NIVEAU[couche]} vers ${NIVEAU[cible]})`);
          }
        }
      }
    }
    expect(violations, 'dependances remontantes').toEqual([]);
  });

  it('range chaque dossier de src/ dans une couche connue', () => {
    // Un dossier neuf non classe echapperait silencieusement a la regle : le test le refuse.
    const dossiers = readdirSync(src).filter(n => {
      try { return statSync(join(src, n)).isDirectory(); } catch { return false; }
    }).filter(n => n !== 'styles');
    expect(dossiers.filter(d => NIVEAU[d] === undefined), 'dossiers hors couches').toEqual([]);
  });
});

describe('ce qui doit rester pur', () => {
  it('geometry, model et util ne touchent jamais au DOM', () => {
    // C'est ce qui rend ces couches testables sans navigateur, et reutilisables ailleurs.
    const coupables: string[] = [];
    for (const couche of ['geometry', 'model', 'util']) {
      for (const f of fichiersTs(join(src, couche))) {
        const t = readFileSync(f, 'utf8');
        if (/\bdocument\.|\bwindow\.|localStorage|HTMLElement|SVGElement/.test(t)) {
          coupables.push(`${couche}/${f.split(/[\\/]/).pop()}`);
        }
      }
    }
    expect(coupables, 'couches pures qui touchent au DOM').toEqual([]);
  });

  it('aucune couche n importe legacy.ts', () => {
    // La dependance va dans l'autre sens, et doit y rester : legacy.ts se vide, il ne se remplit pas.
    const coupables: string[] = [];
    for (const couche of Object.keys(NIVEAU)) {
      let fichiers: string[];
      try { fichiers = fichiersTs(join(src, couche)); } catch { continue; }
      for (const f of fichiers) {
        if (/from '\.\.\/legacy\.js'/.test(readFileSync(f, 'utf8'))) coupables.push(f);
      }
    }
    expect(coupables).toEqual([]);
  });
});

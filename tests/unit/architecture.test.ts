import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';

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
  // plateforme/ decrit le contrat de backprod : des types engendres et deux constantes, sans une
  // seule dependance. Meme rang que model/, qui decrit le domaine — l'un dit ce que la plateforme
  // promet, l'autre ce que le plan est.
  model: 2, plateforme: 2,
  engine: 3, geo: 3,
  core: 4, io: 4, render: 4, export: 4, three: 4, interaction: 4,
  ui: 5,
  app: 6, zones: 6
};

function fichiersTs(dir: string): string[] {
  return readdirSync(dir).flatMap(nom => {
    const chemin = join(dir, nom);
    if (statSync(chemin).isDirectory()) return fichiersTs(chemin);
    return /\.tsx?$/.test(chemin) ? [chemin] : [];
  });
}

/** Une dependance d'un fichier vers un autre, resolue en chemin absolu sans extension. */
interface Dependance { cible: string; type: boolean; dynamique: boolean }

// Toutes les formes qu'un import prend dans ce depot, sur plusieurs lignes au besoin :
//   import { a } from '…'   import type { A } from '…'   import '…'
//   export { a } from '…'   export type { A } from '…'   import('…')
// L'ancienne version ne lisait que `from '../x/'` sur une seule ligne : un module de `app/ecouteurs/`
// ou de `ui/champs/` ecrit `../../x/`, et echappait a la regle sans que personne ne le voie.
const STATIQUE = /\b(import|export)(\s+type)?\s+(?:[^'";]*?\s+from\s+)?['"](\.[^'"]+)['"]/g;
const DYNAMIQUE = /\bimport\(\s*['"](\.[^'"]+)['"]\s*\)(\.(?!then\b)\w+)?/g;

function resoudre(depuis: string, specifiant: string): string {
  return resolve(dirname(depuis), specifiant).replace(/\.(js|tsx?)$/, '');
}

/** Les dependances d'un fichier vers d'autres fichiers de src/. */
function dependances(chemin: string, texte = readFileSync(chemin, 'utf8')): Dependance[] {
  const out: Dependance[] = [];
  for (const m of texte.matchAll(STATIQUE)) {
    // `import type` et `export type` sont effaces au build : ils ne creent aucune dependance reelle.
    out.push({ cible: resoudre(chemin, m[3]!), type: m[2] !== undefined, dynamique: false });
  }
  for (const m of texte.matchAll(DYNAMIQUE)) {
    // `import('../model/types.js').PtBrut` est une reference de type ecrite en syntaxe d'import.
    out.push({ cible: resoudre(chemin, m[1]!), type: m[2] !== undefined, dynamique: true });
  }
  return out.filter(d => d.cible.startsWith(src + sep));
}

/** La couche d'un chemin sous src/ : son premier dossier, ou undefined hors dossier (main.ts). */
function couche(chemin: string): string | undefined {
  const morceaux = relative(src, chemin).split(sep);
  return morceaux.length > 1 ? morceaux[0] : undefined;
}

const tous = fichiersTs(src);

describe('les fleches ne pointent que vers le bas', () => {
  it('aucun module n importe d une couche plus haute que la sienne', () => {
    const violations: string[] = [];
    for (const f of tous) {
      const de = couche(f);
      if (de === undefined || NIVEAU[de] === undefined) continue;
      for (const d of dependances(f)) {
        if (d.type) continue;
        const vers = couche(d.cible);
        if (vers !== undefined && NIVEAU[vers] !== undefined && NIVEAU[vers] > NIVEAU[de]!) {
          violations.push(`${relative(src, f)} -> ${relative(src, d.cible)} (niveau ${NIVEAU[de]} vers ${NIVEAU[vers]})`);
        }
      }
    }
    expect(violations, 'dependances remontantes').toEqual([]);
  });

  it('voit les imports sur plusieurs lignes, les re-exports, les imports dynamiques et les chemins profonds', () => {
    // Le test ci-dessus ne vaut que ce que vaut sa lecture des imports : ce cas-ci la garde honnete.
    // Des modules reels, choisis pour chaque forme — s'ils changent, choisir d'autres temoins.
    const cibles = (f: string) => dependances(join(src, f)).filter(d => !d.type).map(d => relative(src, d.cible));
    expect(cibles('app/ecouteurs/exports.ts').some(c => !c.startsWith('app')), 'chemin ../../').toBe(true);
    expect(cibles('main.ts'), 'import dynamique').toContain(join('app', 'boot'));
    // Plus aucun module n'ecrit `import('…').Type` : la forme est verifiee sur un texte temoin.
    const temoin = dependances(join(src, 'ui/temoin.ts'), "const f = (p: import('../model/types.js').PtBrut) => p;\nvoid import('../app/boot.js').then(m => m);");
    expect(temoin.map(d => d.type), 'import(…).Type est un type, import(…).then une valeur').toEqual([true, false]);
  });

  it('range chaque dossier de src/ dans une couche connue', () => {
    // Un dossier neuf non classe echapperait silencieusement a la regle : le test le refuse.
    const dossiers = readdirSync(src).filter(n => {
      try { return statSync(join(src, n)).isDirectory(); } catch { return false; }
    }).filter(n => n !== 'styles');
    expect(dossiers.filter(d => NIVEAU[d] === undefined), 'dossiers hors couches').toEqual([]);
  });
});

describe('aucun cycle d import (architecture.md §9, FF-1)', () => {
  it('le graphe des imports de valeur est acyclique', () => {
    // Un cycle marche jusqu'au jour ou l'ordre d'evaluation change et qu'une constante est lue avant
    // d'exister. Les imports de type ne comptent pas (effaces), ni les imports dynamiques : ils sont
    // resolus apres le chargement, et c'est justement l'outil qui sert a couper une boucle.
    const index = new Map(tous.map(f => [f.replace(/\.tsx?$/, ''), f]));
    const voisins = new Map(tous.map(f => [f, dependances(f)
      .filter(d => !d.type && !d.dynamique)
      .map(d => index.get(d.cible) ?? index.get(join(d.cible, 'index')))
      .filter((c): c is string => c !== undefined)]));
    const etat = new Map<string, 1 | 2>();
    const pile: string[] = [];
    const cycles: string[] = [];
    const visiter = (f: string): void => {
      etat.set(f, 1); pile.push(f);
      for (const v of voisins.get(f)!) {
        if (etat.get(v) === 1) cycles.push([...pile.slice(pile.indexOf(v)), v].map(x => relative(src, x)).join(' > '));
        else if (!etat.has(v)) visiter(v);
      }
      pile.pop(); etat.set(f, 2);
    };
    for (const f of tous) if (!etat.has(f)) visiter(f);
    expect(cycles, 'cycles').toEqual([]);
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
    const coupables = tous.filter(f => dependances(f).some(d => d.cible === join(src, 'legacy')));
    expect(coupables).toEqual([]);
  });
});

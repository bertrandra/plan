import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';

// Le cliquet des orphelins (MD/spec-facade-calage-audit.md §8 bis.1, regle 5) : pendant la migration des facades vers un seul
// enchainement, aucun morceau ne reste en attente. Dans les dossiers de la migration, tout fichier qu'aucun autre fichier de src/
// n'importe, et tout export qu'aucun autre fichier de src/ n'importe, est un orphelin. Ceux d'avant la migration sont dans une liste
// (tests/fixtures/architecture/orphelins-autorises.json) qui ne peut que raccourcir : un orphelin nouveau fait echouer, un orphelin qui
// disparait doit en sortir. Ce n'est qu'un test d'imports : un import dynamique, ou un export lu par son seul fichier, se declare a la main.

const racine = resolve(__dirname, '../../..');
const src = join(racine, 'src');

/** Les dossiers et fichiers de la migration (spec §8 bis.1) : le releve, la detection, le calage, l'audit, et les ecrans de la calibration. */
const PERIMETRE = [
  'facade/releve', 'facade/detection', 'facade/calage', 'app/releve', 'app/audit/parcelle', 'zones/releve',
  'zones/EcranCalibration.tsx', 'zones/EditeurCasCalibration.tsx', 'zones/FriseEtapesCalibration.tsx', 'zones/CalageSilhouette.tsx',
  'zones/VueFacade3d.tsx', 'zones/composants/BarreProgressionFacade.tsx',
];

function fichiersTs(chemin: string): string[] {
  if (!existsSync(chemin)) return [];
  if (statSync(chemin).isFile()) return /\.tsx?$/.test(chemin) ? [chemin] : [];
  return readdirSync(chemin).flatMap((n) => fichiersTs(join(chemin, n)));
}

const sansExtension = (p: string) => p.replace(/\.(js|tsx?)$/, '');
const tous = fichiersTs(src);
const textes = new Map(tous.map((f) => [sansExtension(f), readFileSync(f, 'utf8')]));

/** Ce que chaque fichier importe des autres : par module cible, les noms (`*` : tout le module, un espace de noms ou un import dynamique). */
function importsDe(fichier: string, texte: string): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  const ajouter = (spec: string, noms: string[]) => {
    if (!spec.startsWith('.')) return;
    const cible = sansExtension(resolve(dirname(fichier), spec));
    const s = out.get(cible) ?? new Set<string>();
    noms.forEach((n) => s.add(n));
    out.set(cible, s);
  };
  for (const m of texte.matchAll(/\b(?:import|export)\s+(?:type\s+)?([^'";]*?)\s+from\s+['"]([^'"]+)['"]/g)) {
    const clause = m[1] as string, spec = m[2] as string;
    if (/\*/.test(clause)) { ajouter(spec, ['*']); continue; }
    const accolades = /\{([^}]*)\}/.exec(clause)?.[1] ?? '';
    const noms = accolades.split(',').map((x) => x.trim().replace(/^type\s+/, '').split(/\s+as\s+/)[0] as string).filter(Boolean);
    // `import x from` : l'export par defaut.
    if (/^\s*[A-Za-z_$][\w$]*\s*(,|$)/.test(clause.replace(/\{[^}]*\}/, '').trim() || 'x,')) { if (clause.replace(/\{[^}]*\}/, '').trim()) noms.push('default'); }
    ajouter(spec, noms);
  }
  for (const m of texte.matchAll(/\bimport\(\s*['"]([^'"]+)['"]\s*\)/g)) ajouter(m[1] as string, ['*']);
  for (const m of texte.matchAll(/^\s*import\s+['"]([^'"]+)['"]/gm)) ajouter(m[1] as string, ['*']);
  return out;
}

const importes = new Map<string, Set<string>>();
for (const [f, t] of textes) for (const [cible, noms] of importsDe(f + '.ts', t)) {
  if (cible === f) continue;
  const s = importes.get(cible) ?? new Set<string>();
  noms.forEach((n) => s.add(n));
  importes.set(cible, s);
}

/** Les noms qu'un fichier exporte (declarations, listes, re-exports). */
function exportsDe(texte: string): string[] {
  const noms = new Set<string>();
  for (const m of texte.matchAll(/^export\s+(?:declare\s+)?(?:async\s+)?(?:function\*?|const|let|var|class|interface|type|enum)\s+([A-Za-z_$][\w$]*)/gm)) noms.add(m[1] as string);
  for (const m of texte.matchAll(/^export\s+(?:type\s+)?\{([^}]*)\}/gm)) for (const x of (m[1] as string).split(',')) { const n = x.trim().replace(/^type\s+/, '').split(/\s+as\s+/).pop()?.trim(); if (n) noms.add(n); }
  if (/^export\s+default\b/m.test(texte)) noms.add('default');
  return [...noms];
}

/** Les orphelins du perimetre, en chemins relatifs a src/ : `fichier` (rien ne l'importe) ou `fichier#export`. */
function orphelins(): string[] {
  const out: string[] = [];
  for (const f of PERIMETRE.flatMap((p) => fichiersTs(join(src, p)))) {
    const cle = sansExtension(f), rel = relative(src, f).split(sep).join('/');
    const recus = importes.get(cle);
    if (!recus) { out.push(rel); continue; }
    if (recus.has('*')) continue;
    for (const n of exportsDe(textes.get(cle) ?? '')) if (!recus.has(n)) out.push(rel + '#' + n);
  }
  return out.sort();
}

const AUTORISES = JSON.parse(readFileSync(join(racine, 'tests/fixtures/architecture/orphelins-autorises.json'), 'utf8')) as { pourquoi: string; orphelins: string[] };

describe('le cliquet des orphelins de la migration des facades', () => {
  const trouves = orphelins();

  it('n a aucun orphelin nouveau', () => {
    expect(trouves.filter((o) => !AUTORISES.orphelins.includes(o))).toEqual([]);
  });

  it('ne garde dans la liste que des orphelins qui le sont encore (elle ne fait que raccourcir)', () => {
    expect(AUTORISES.orphelins.filter((o) => !trouves.includes(o))).toEqual([]);
  });
});

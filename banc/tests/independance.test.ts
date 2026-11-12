// Le banc a son propre code (decision du proprietaire, 11 novembre 2026) : aucun fichier de banc/src n'importe hors de banc/src. Ce qui
// vient de Plan y est copie, fige, dans banc/src/plan/ (LISEZMOI.md de ce dossier).
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const src = path.resolve(__dirname, '../src');
const fichiers = (d: string): string[] => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? fichiers(path.join(d, e.name)) : /\.tsx?$/.test(e.name) ? [path.join(d, e.name)] : []));

describe('l’independance du banc', () => {
  it('aucun import ne sort de banc/src, et seuls react et react-dom viennent de node_modules', () => {
    const fautes: string[] = [];
    for (const f of fichiers(src)) {
      for (const m of fs.readFileSync(f, 'utf8').matchAll(/^\s*import\s[^'"]*['"]([^'"]+)['"]/gm)) {
        const cible = m[1] ?? '';
        // banc/data/ : ses donnees livrees (l'arbre de depart), a lui aussi.
        if (cible.startsWith('.')) { const r = path.resolve(path.dirname(f), cible); if (!r.startsWith(src + path.sep) && !r.startsWith(path.resolve(src, '../data') + path.sep)) fautes.push(path.relative(src, f) + ' -> ' + cible); }
        else if (!/^(react|react-dom)(\/|$)/.test(cible)) fautes.push(path.relative(src, f) + ' -> ' + cible);
      }
    }
    expect(fautes).toEqual([]);
  });
});

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

// Les conventions de CLAUDE.md qu'un test peut tenir. « Commentaires sans accents dans le code source » : un cliquet, comme
// scripts/cliquet.mjs pour le typage. Le nombre de lignes de commentaire accentuees (hors texte cite entre « », '' ou "") ne
// peut que baisser : baisser PLAFOND quand on en retire, jamais le monter.

const src = resolve(__dirname, '../../src');
const fichiers = (d: string): string[] => readdirSync(d).flatMap((n) => { const c = join(d, n); return statSync(c).isDirectory() ? fichiers(c) : /\.tsx?$/.test(c) ? [c] : []; });
const ACCENT = /[àâäéèêëîïôöùûüçœæÀÂÄÉÈÊËÎÏÔÖÙÛÜÇŒÆ]/;
/** Releve le 25 octobre 2026 (audit d'architecture, lot H). */
const PLAFOND = 223;

describe('les conventions du dépôt', () => {
  it('les commentaires accentués ne gagnent pas de terrain (cliquet)', () => {
    const lignes: string[] = [];
    for (const f of fichiers(src)) {
      readFileSync(f, 'utf8').split('\n').forEach((l, i) => {
        const m = /^\s*(\/\/|\*|\/\*\*?)\s?(.*)$/.exec(l);
        if (!m) return;
        const texte = (m[2] ?? '').replace(/«[^»]*»/g, '').replace(/'[^']*'|"[^"]*"|`[^`]*`/g, '');
        if (ACCENT.test(texte)) lignes.push(f.slice(src.length + 1) + ':' + (i + 1));
      });
    }
    expect(lignes.length, 'commentaires accentues : ' + lignes.slice(0, 5).join(', ') + '…').toBeLessThanOrEqual(PLAFOND);
  });
});

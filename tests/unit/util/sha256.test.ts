import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { sha256Texte } from '../../../src/util/sha256.js';

// L'empreinte synchrone des faits d'un texte du dossier (lot L5) : la meme que node:crypto, accents et longueurs de bloc compris.

describe('sha256Texte', () => {
  it('rend l empreinte de node:crypto', () => {
    const textes = ['', 'abc', 'é à ç — « Notice »', 'x'.repeat(55), 'x'.repeat(56), 'x'.repeat(64), 'y'.repeat(1000), JSON.stringify({ a: [1, 2, 'é'] })];
    for (const t of textes) expect(sha256Texte(t)).toBe(createHash('sha256').update(t, 'utf8').digest('hex'));
  });
});

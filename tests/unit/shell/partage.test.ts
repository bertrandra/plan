// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { partagerFichier } from '../../../src/shell/partage.js';
import { dimensionsReduites, octetsBase64 } from '../../../src/app/audit/photo.js';

// Le partage du fichier de promenade : la feuille de partage du telephone, sinon un telechargement.

describe('partager un fichier', () => {
  it('passe par la feuille de partage quand elle accepte les fichiers', async () => {
    const share = vi.fn(async () => {});
    expect(await partagerFichier('a.json', '{}', 'Audit', { canShare: () => true, share })).toBe('partage');
    const arg = (share.mock.calls[0] as unknown[])[0] as { files: File[] };
    expect(arg.files[0]!.name).toBe('a.json');
  });

  it('une feuille fermee sans choix n est pas un echec ; sans partage, le fichier est telecharge', async () => {
    const abort = Object.assign(new Error('x'), { name: 'AbortError' });
    expect(await partagerFichier('a.json', '{}', 'Audit', { canShare: () => true, share: async () => { throw abort; } })).toBe('annule');
    const clic = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    URL.createObjectURL = vi.fn(() => 'blob:x'); URL.revokeObjectURL = vi.fn();
    expect(await partagerFichier('a.json', '{}', 'Audit', {})).toBe('telecharge');
    expect(clic).toHaveBeenCalled();
  });
});

describe('la photo d un cas', () => {
  it('reduit a 1 280 px au plus, proportions gardees, et mesure le poids du base64', () => {
    expect(dimensionsReduites(4000, 3000)).toEqual({ l: 1280, h: 960 });
    expect(dimensionsReduites(800, 600)).toEqual({ l: 800, h: 600 });
    expect(octetsBase64('AAAA')).toBe(3);
    expect(octetsBase64('AAA=')).toBe(2);
  });
});

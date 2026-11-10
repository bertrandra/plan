import { describe, it, expect } from 'vitest';
import { chargerCorpus } from '../../../banc/facades/banc.js';
import { projetDeLEtalon, nomDuProjet } from '../../../../src/app/administration/projetEtalon.js';
import { rechercher } from '../../../../src/facade/releve/serie.js';
import { volumesDuBatiment } from '../../../../src/facade/profil.js';
import { serializeObjects } from '../../../../src/io/serialisation.js';
import { partiesBassesDu } from '../../../../src/model/partiesBasses.js';

// Le projet de demonstration d'un etalon : la facade mesuree par le chemin de l'audit et ecrite par sa validation V4, sur le mur sud du
// batiment de la regle ; une partie basse du releve fait son volume, comme pour un batiment de l'audit.

describe('le projet d un etalon', () => {
  it('le mur en L (25) : la facade validee sur le cote 0, sa partie basse, deux volumes', async () => {
    const s = chargerCorpus().find((x) => x.nom.startsWith('25-'))!;
    let n = 0;
    const p = await projetDeLEtalon(s, { chercherCoins: async (e) => rechercher(e), jpeg: () => 'data:image/jpeg;base64,P' + n++, maintenant: () => new Date('2026-11-04T10:00:00Z') });
    expect(p.nom).toBe(nomDuProjet(s));
    expect(p.objets.map((o) => o.key)).toEqual(['parcelle', 'maison']);
    const maison = p.objets[1]!;
    const f = maison.batiment?.facades?.[0];
    expect(f?.cote).toBe(0);
    expect(f?.dimensions?.largeurM).toBe(10);
    expect(f?.ouvertures.length).toBeGreaterThan(0);
    expect(f?.ouvertures.every((o) => o.verifieeLe === '2026-11-04T10:00:00.000Z')).toBe(true);
    expect(f && partiesBassesDu(f).map((b) => b.debut)).toEqual([6.5]);
    expect(volumesDuBatiment((maison as unknown as { pts: { x: number; y: number }[] }).pts, 5.6, maison.batiment?.facades)).toHaveLength(2);
    expect(maison.batiment?.toitFige).toBe(true);
    // Le fichier : champs a plat, comme un export ; la texture du releve y est.
    const fichier = serializeObjects(p.objets) as unknown as Record<string, unknown>[];
    expect(fichier[1]?.facades).toBeDefined();
  });
});

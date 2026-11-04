import { describe, it, expect } from 'vitest';
import { readdirSync } from 'node:fs';
import { chargerCorpus, DOSSIER_CORPUS } from '../../../banc/facades/banc.js';
import { casDeLEtalon, ficheEtalon, photosDeLEtalon, PREFIXE_ETALON } from '../../../../src/facade/banc/etalons.js';
import { photographier } from '../../../../src/facade/banc/synthese.js';
import { imageDeLEtalon, listerEtalons, ouvrirEtalon } from '../../../../src/io/etalonsFacades.js';
import { lireCasStocke } from '../../../../src/facade/corpusReel.js';
import { ETAPES_FACADE } from '../../../../src/model/etapeFacade.js';

// Les etalons de synthese (facade/banc/etalons.ts) : une seule source, les scenes du corpus du banc, que l'ecran Admin › Calibration lit
// comme le banc ; un identifiant stable (le nom de la scene, qui est celui de son fichier) ; les memes pixels que le banc.

describe('le catalogue des etalons', () => {
  const scenes = chargerCorpus();
  it('chaque scene porte le nom de son fichier, une seule fois : l identifiant stable de l etalon', () => {
    const fichiers = readdirSync(DOSSIER_CORPUS).filter((f) => f.endsWith('.json')).sort().map((f) => f.replace(/\.json$/, ''));
    expect(scenes.map((s) => s.nom)).toEqual(fichiers);
    expect(new Set(fichiers).size).toBe(fichiers.length);
  });
  it('l ecran lit les memes scenes que le banc, dans le meme ordre', async () => {
    const liste = await listerEtalons();
    expect(liste.map((e) => e.nom)).toEqual(scenes.map((s) => s.nom));
    expect(liste.every((e) => e.id === PREFIXE_ETALON + e.nom)).toBe(true);
  });
  it('chaque fiche dit ce qu elle eprouve, dans les etapes de la facade', () => {
    const ids = new Set(ETAPES_FACADE.map((e) => e.id));
    for (const s of scenes) {
      const f = ficheEtalon(s);
      expect(f.etapes.length).toBeGreaterThan(0);
      expect(f.etapes.every((e) => ids.has(e))).toBe(true);
      expect(Object.values(f.ouvertures).reduce((a, n) => a + (n ?? 0), 0)).toBe(s.verite.ouvertures.length);
    }
    const f = (nom: string) => ficheEtalon(scenes.find((s) => s.nom.startsWith(nom))!);
    expect(f('22').pignonSommet).toBe(0.4);
    expect(f('26').partiesBasses).toBe(2);
    expect(f('16').etapes).toContain('assemblage');
    expect(f('09').focaleConnue).toBe(false);
  });
});

// Octet pour octet (un toEqual sur cinq millions de valeurs prend des dizaines de secondes).
const memes = (a: Uint8ClampedArray, b: Uint8ClampedArray) => Buffer.from(a.buffer, a.byteOffset, a.byteLength).equals(Buffer.from(b.buffer, b.byteOffset, b.byteLength));

describe('un etalon ouvert', () => {
  const s = chargerCorpus().find((x) => x.nom.startsWith('22-'))!;
  it('rend les pixels du banc, et l editeur les relit tels quels par leur adresse', async () => {
    const vraie = photographier(s, 100)!;
    const [p] = photosDeLEtalon(s);
    expect(memes(p!.image.donnees, vraie.image.donnees)).toBe(true);
    const cas = await ouvrirEtalon(PREFIXE_ETALON + s.nom, () => 'data:etalon-22');
    expect(memes(imageDeLEtalon('data:etalon-22')!.donnees, vraie.image.donnees)).toBe(true);
    expect(imageDeLEtalon('data:autre')).toBeNull();
    // Le cas se relit comme un cas du serveur ; il reste un brouillon, avec la verite et ce que l'audit en aurait su.
    const relu = lireCasStocke(cas);
    expect(relu.statut).toBe('brouillon');
    expect(relu.ouvertures).toEqual(s.verite.ouvertures.map(({ type, x, y, l, h }) => ({ type, x, y, l, h })));
    expect(relu.photos[0]?.prise?.sourceFocale).toBe('exif');
    expect(relu.photos[0]?.murALaMain).toBeUndefined();
    expect(relu.facade?.orientation).toBe('Sud');
    expect(relu.gabarit?.length).toBeGreaterThan(2);
  });
  it('a autant de photos que de prises, et pas d EXIF quand la scene dit la focale inconnue', () => {
    const scenes = chargerCorpus();
    const vues = scenes.find((x) => x.nom.startsWith('16-'))!;
    expect(1 + (vues.synthese.vues?.length ?? 0)).toBe(3);
    const neuf = scenes.find((x) => x.nom.startsWith('09-'))!;
    const c = casDeLEtalon(neuf, photosDeLEtalon(neuf), ['a']);
    expect(c.photos[0]?.prise?.champDeg).toBeNull();
  });
  it('refuse un etalon inconnu', async () => {
    await expect(ouvrirEtalon('etalon-99-rien', () => 'x')).rejects.toThrow(/inconnu/);
  });
});

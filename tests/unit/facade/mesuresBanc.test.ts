import { describe, it, expect } from 'vitest';
import { chargerCorpus, rejouerScene } from '../../banc/facades/banc.js';
import { ecartsMesures, mesuresReleve, mesuresVerite, tableauMesures } from '../../banc/facades/mesuresFacades.js';
import { mesurerFacade } from '../../../src/model/mesureFacade.js';

// Les mesures d'une facade relevee (lot G11) sur le corpus du banc de facades, dont la verite est
// connue : la grille de repli du modele (releve sans grille) mesure comme la grille du releve, et la
// chaine du releve d'une scene nette mesure comme la verite, au centimetre.

const corpus = chargerCorpus();
const LONG = 30_000;

describe('mesures des facades du banc', () => {
  it('sans grille, le modele mesure comme avec la grille que le releve calcule', () => {
    for (const s of corpus) {
      const avec = mesuresVerite(s);
      const sans = mesurerFacade({ largeur: s.verite.largeur, hauteur: s.verite.hauteur, ouvertures: s.verite.ouvertures }, { pignon: (s.synthese.mur.pignon ?? 0) > 0 });
      expect(sans, s.nom).toEqual(avec);
    }
  });

  it('chaque scene a une fenetre type, un appui de 0,90 a 1,05 m depuis son plancher, et ses niveaux', () => {
    for (const s of corpus) {
      const m = mesuresVerite(s);
      expect(m.fenetre, s.nom).not.toBeNull();
      expect(m.fenetre?.appuiM, s.nom).toBeGreaterThanOrEqual(0.9);
      expect(m.fenetre?.appuiM, s.nom).toBeLessThanOrEqual(1.05);
      expect(m.baiesParNiveau.reduce((a, b) => a + b, 0), s.nom).toBe(s.verite.ouvertures.length);
      expect(m.type, s.nom).toBe(s.difficultes.includes('pignon') ? 'pignon' : null);
    }
  });

  it('la chaine du releve mesure la scene 02 comme sa verite, au centimetre', () => {
    const s = corpus.find((c) => c.nom.startsWith('02-'));
    if (!s) throw new Error('scene 02 absente');
    const lignes = [{ nom: s.nom, verite: mesuresVerite(s), releve: mesuresReleve(s, rejouerScene(s)) }];
    const e = ecartsMesures(lignes);
    expect(e.scenes).toBe(1);
    for (const l of [e.largeurCm, e.hauteurCm, e.appuiCm, e.entraxeCm]) expect(Math.max(...l)).toBeLessThanOrEqual(2);
    expect(Math.max(...e.partVitreePts)).toBeLessThanOrEqual(0.5);
    expect([e.niveauxJustes, e.porteJuste, e.garageJuste]).toEqual([1, 1, 1]);
    expect(tableauMesures(lignes)).toContain('| 02-enduit-uni-face |');
  }, LONG);
});

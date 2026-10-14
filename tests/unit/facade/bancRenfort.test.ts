import { describe, it, expect } from 'vitest';
import { chargerCorpus, rejouerScene } from '../../banc/facades/banc.js';
import { chargerReponses, rejouerRenfort, simulerReponses, tableauRenfort } from '../../banc/facades/renfort.js';
import { estReponseRenfort } from '../../../src/facade/renfort.js';

// Le banc du renfort de Claude (lot L18) : chaque scene a ses reponses simulees enregistrees, au
// format du schema ; rejouees, elles ne font entrer aucune fausse baie cochee, et la fenetre inventee
// par deux passes sur trois est rejetee faute d'arete pour la soutenir.

const corpus = chargerCorpus();
const LONG = 60_000;

describe('banc du renfort', () => {
  it('a des reponses simulees pour chaque scene, au format du schema', () => {
    for (const s of corpus) {
      const f = chargerReponses(s.nom);
      expect(f, s.nom).not.toBeNull();
      expect(f!.reponses, s.nom).toHaveLength(3);
      for (const r of f!.reponses) expect(estReponseRenfort(r), s.nom).toBe(true);
    }
  });

  it('simule de facon deterministe', () => {
    const s = corpus.find((x) => x.nom.startsWith('07-'))!;
    const ouv = [{ type: 'fenetre' as const, x: 1, y: 1, l: 1.2, h: 1.3, confiance: 0.9 }];
    const coins = [{ x: 100, y: 100 }, { x: 900, y: 100 }, { x: 900, y: 600 }, { x: 100, y: 600 }];
    expect(simulerReponses(s, ouv, coins, { largeur: 1000, hauteur: 750 })).toEqual(simulerReponses(s, ouv, coins, { largeur: 1000, hauteur: 750 }));
  });

  it('recale les graines sans faire entrer de fausse baie cochee', () => {
    const res = ['07-', '18-'].map((debut) => {
      const s = corpus.find((x) => x.nom.startsWith(debut))!;
      return rejouerRenfort(s, rejouerScene(s), chargerReponses(s.nom))!;
    });
    for (const r of res) {
      expect(r.apres.rappel ?? 0, r.nom).toBeGreaterThanOrEqual(r.avant.rappel ?? 0);
      expect(r.pleinesJustes, r.nom).toBe(r.bilan.pleines);
      expect(r.apres.corrections, r.nom).toBeLessThanOrEqual(r.avant.corrections);
    }
    // 18 : la fenetre inventee par deux passes n'est soutenue par aucune arete.
    expect(res[1]!.bilan.rejetees).toBeGreaterThanOrEqual(1);
    // La plupart des graines de coins se rattachent a un croisement a quelques centimetres.
    const recales = res.flatMap((r) => r.coinsRecalesCm.filter((c): c is number => c !== null));
    expect(recales.filter((c) => c <= 10).length).toBeGreaterThanOrEqual(4);
    expect(tableauRenfort(res)).toContain('**Ensemble** (2)');
  }, LONG);
});

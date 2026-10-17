import { describe, it, expect } from 'vitest';
import { recouvrement, voter, VOTE, type VueVotante } from '../../../src/facade/voteVues.js';
import { analyserVues, type VuePhoto } from '../../../src/facade/fusion.js';
import { chargerCorpus } from '../../banc/facades/banc.js';
import { photographier, coinsVrais, type PriseCamera, type SceneFacade } from '../../banc/facades/synthese.js';
import type { OuvertureDetectee } from '../../../src/facade/detection.js';

// Le vote entre vues (facade/voteVues.ts) : la logique pure sur des boites, puis ses effets sur les scenes a plusieurs vues du banc.

const baie = (x: number, y = 1, conf = 0.8, l = 1, h = 1.4): OuvertureDetectee => ({ type: 'fenetre', x, y, l, h, confiance: conf, source: 'detectee' });
const vue = (ouvertures: OuvertureDetectee[], voit = true): VueVotante => ({ ouvertures, partVue: () => (voit ? 1 : 0), partObstacle: () => 0 });

describe('le vote : la logique', () => {
  it('mesure le recouvrement de deux boites', () => {
    expect(recouvrement(baie(0), baie(0))).toBe(1);
    expect(recouvrement(baie(0), baie(5))).toBe(0);
    expect(recouvrement(baie(0), baie(0.5))).toBeGreaterThan(0.3);
  });
  it('ne change rien avec une seule vue', () => {
    const f = [baie(2)];
    expect(voter(f, [vue([baie(2)])]).ouvertures).toEqual(f);
  });
  it('renforce une baie retrouvee par toutes les vues qui la voient', () => {
    const r = voter([baie(2, 1, 0.8)], [vue([baie(2)]), vue([baie(2.02)])]);
    expect(r.ouvertures[0]?.confiance).toBeCloseTo(0.8 + VOTE.BONUS_UNANIME, 2);
    expect([...r.votes.values()][0]).toEqual({ observateurs: 2, accords: 2 });
  });
  it('affaiblit une baie que seule une vue sur trois retrouve (une haie)', () => {
    const r = voter([baie(2, 1, 0.8)], [vue([baie(2)]), vue([]), vue([])]);
    expect(r.ouvertures[0]?.confiance).toBeLessThan(0.8 * 0.8);
  });
  it('tient pour suspecte une baie que aucune vue seule ne retrouve', () => {
    const r = voter([baie(2, 1, 0.8)], [vue([]), vue([])]);
    expect(r.ouvertures[0]?.confiance).toBeCloseTo(0.8 * VOTE.POIDS_SANS_ACCORD, 2);
  });
  it('ne juge pas avec une seule vue qui voit (les autres sont cachees)', () => {
    const r = voter([baie(2, 1, 0.8)], [vue([baie(2)]), vue([], false)]);
    expect(r.ouvertures[0]?.confiance).toBe(0.8);
    expect(r.votes.size).toBe(0);
  });
  it('ajoute une baie que plusieurs vues voient et que la fusion a ratee', () => {
    const r = voter([baie(2)], [vue([baie(2), baie(6)]), vue([baie(2), baie(6.03)]), vue([baie(2)], true)]);
    // La baie de 6 m : vue par les trois vues, retrouvee par deux sur trois (0,67).
    expect(r.ouvertures.map((o) => Math.round(o.x))).toEqual([2, 6]);
    expect(r.ouvertures[1]?.confiance).toBeLessThanOrEqual(0.8 * VOTE.AJOUT_FACTEUR + 0.001);
  });
  it('n ajoute pas une baie que une seule vue a vue', () => {
    expect(voter([baie(2)], [vue([baie(2), baie(6)]), vue([baie(2)])]).ouvertures).toHaveLength(1);
  });
  it('est deterministe', () => {
    const a = voter([baie(2), baie(4)], [vue([baie(2)]), vue([baie(4)])]);
    const b = voter([baie(2), baie(4)], [vue([baie(2)]), vue([baie(4)])]);
    expect(a.ouvertures).toEqual(b.ouvertures);
  });
});

const corpus = chargerCorpus();
function vuesDe(s: SceneFacade): VuePhoto[] {
  const prises = [s.synthese.prise as PriseCamera, ...(s.synthese.vues ?? [])];
  return prises.map((p) => {
    const ph = photographier(s, 100, p);
    const c = coinsVrais(s, p);
    if (!ph || !c) throw new Error('vue impossible');
    const [dx, dy] = p.decalageCoins ?? [0, 0];
    return { photo: ph.image, coins: c.map((q) => ({ x: q.x + dx, y: q.y + dy })), focalePx: ph.focalePx };
  });
}

describe('le vote sur les scenes du banc', () => {
  it.each(['16-', '17-', '19-'])('scene %s : les fausses baies pesent moins que les vraies', (debut) => {
    const s = corpus.find((c) => c.nom.startsWith(debut)) as SceneFacade;
    const L = s.verite.largeur;
    const contour = [{ x: 0, y: 0 }, { x: L, y: 0 }, { x: L, y: 6 }, { x: 0, y: 6 }];
    const r = analyserVues({ vues: vuesDe(s), largeur: L, hauteur: s.verite.hauteur, contour, cote: 0, distance: null });
    expect(r).not.toBeNull();
    const vraies = s.verite.ouvertures as unknown as OuvertureDetectee[];
    const fausses = r!.ouvertures.filter((o) => !vraies.some((v) => recouvrement(v, o) >= 0.4));
    const justes = r!.ouvertures.filter((o) => vraies.some((v) => recouvrement(v, o) >= 0.4));
    const moy = (l: OuvertureDetectee[]) => l.reduce((t, o) => t + o.confiance, 0) / Math.max(1, l.length);
    console.log(debut, 'justes', justes.map((o) => o.confiance), 'fausses', fausses.map((o) => o.confiance), 'votes', [...r!.votes.values()]);
    if (fausses.length && justes.length) expect(moy(fausses)).toBeLessThan(moy(justes));
  }, 120_000);
});

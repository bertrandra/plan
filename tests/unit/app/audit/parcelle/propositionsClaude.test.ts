import { describe, it, expect } from 'vitest';
import { couvertureDuVocabulaire, ecartsEnClair, indicesDe, materiauDesFacades, propositionsDeClaude } from '../../../../../src/app/audit/parcelle/propositionsClaude.js';
import { cochesParDefaut } from '../../../../../src/app/audit/parcelle/propositions.js';
import { listeDeControle } from '../../../../../src/app/audit/parcelle/liste.js';
import { captureVide, type EtiquetteImage } from '../../../../../src/model/auditParcelle.js';
import { voter } from '../../../../../src/model/analyseClaude.js';
import { reponse } from '../../../../fixtures/audit/reponseClaude.js';
import type { CorpsToit, ObjetPlan, PtBrut } from '../../../../../src/model/types.js';

// Les propositions de Claude (MD/spec-audit.md §13.2, §14) : couverture, cheminees, terrasse et
// materiau des murs d'apres le vote de ses passes ; chacune dit son origine, ses indices et sa
// confiance, et arrive decochee tant que son taux d'accord n'est pas mesure.

const rect = (x0: number, y0: number, x1: number, y1: number): PtBrut[] => [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];
const obj = (key: string, plus: Partial<ObjetPlan>): ObjetPlan => ({ key, name: key, type: 'polygon', ...plus } as ObjetPlan);
const CORPS: CorpsToit = { pts: rect(5, 10, 15, 18), posFaitage: 4, faitage: 9, egouts: [6, 6], pignons: [], ecart: 0.1 };
const PLAT: CorpsToit = { pts: rect(15, 12, 18, 18), posFaitage: 1.5, faitage: 3, egouts: [3, 3], pignons: [], ecart: 0.1 };
const ETIQUETTES: EtiquetteImage[] = [
  { texte: 'photo de la façade sud de maison, prise à 8 m, vers 180°', photo: { cle: 'maison', cote: 0, rang: 0 } },
  { texte: 'rendu du modèle actuel de Plan, même point de vue que l’image 1' },
  { texte: 'orthophoto, vue du dessus, recadrée sur le contour de maison' },
];

function quartier(): ObjetPlan[] {
  return [
    obj('parcelle', { fonction: 'terrain', pts: rect(0, 0, 20, 30), cadastre: { idu: '78650000AE0101', origineLat: 48.9, origineLon: 2.13 } }),
    obj('maison', { fonction: 'batiment', pts: rect(5, 10, 15, 18), elevation: 6, bdtopo: { materiauxMurs: '10' }, toit: { forme: 'deux-pans', hauteur: 3, angleFaitage: 0 }, corpsToit: [CORPS, PLAT] }),
  ];
}

function propositions(reponses: unknown[], objets = quartier()) {
  const capture = captureVide('78650000AE0101');
  return propositionsDeClaude(objets, listeDeControle(objets, capture).batiments, { maison: { reponses, etiquettes: ETIQUETTES } });
}

describe('les propositions de Claude', () => {
  it('propose la couverture, les cheminees et le materiau des murs, source claude, decochees avec la raison', () => {
    const p = propositions([reponse(), reponse(), reponse()]);
    expect(p.map((x) => x.id)).toEqual(['maison:claude:couverture', 'maison:claude:cheminees', 'maison:claude:materiauMurs']);
    const parId = new Map(p.map((x) => [x.id, x]));
    expect(parId.get('maison:claude:couverture')).toMatchObject({
      source: 'claude', objet: 'Couverture de maison', avant: 'déduite par Plan', apres: 'Ardoise, vue par Claude', confiance: 1,
      indices: [{ texte: 'ardoises fines et sombres (orthophoto)' }], effet: { type: 'couverture', couverture: 'ardoise' },
    });
    expect(parId.get('maison:claude:couverture')?.reserve).toMatch(/non encore mesuré/);
    expect(parId.get('maison:claude:cheminees')).toMatchObject({ avant: 'aucune cheminée', apres: '2 cheminées, vues par Claude', effet: { type: 'cheminees', corps: 0 } });
    expect((parId.get('maison:claude:cheminees')?.effet as { cheminees: { position: string; materiau?: string }[] }).cheminees.map((c) => [c.position, c.materiau])).toEqual([['faitage', 'brique'], ['faitage', 'brique']]);
    expect(parId.get('maison:claude:materiauMurs')).toMatchObject({
      avant: 'Pierre', apres: 'Brique, vu par Claude sur 1 façade', effet: { type: 'materiauMurs', materiau: 'brique' },
      indices: [{ texte: 'briques apparentes, joints clairs (photo 1 de la façade)', photo: { cle: 'maison', cote: 0, rang: 0 } }],
    });
    // Tout arrive decoche : aucun taux d'accord n'est mesure (spec-regles-toits §14.2, point 5).
    expect(cochesParDefaut(p).size).toBe(0);
  });

  it('dit la part des passes d accord quand elles divergent, et ne propose rien sans majorite', () => {
    const p = propositions([reponse(), reponse(), reponse({ couverture: { indices: [], valeur: 'tuile-plate' } })]);
    const c = p.find((x) => x.id === 'maison:claude:couverture');
    expect(c?.confiance).toBeCloseTo(2 / 3, 6);
    expect(c?.reserve).toMatch(/pas toutes d’accord \(67 %\)/);
    const sans = propositions([reponse({ couverture: { indices: [], valeur: 'zinc' } }), reponse({ couverture: { indices: [], valeur: 'tuile-plate' } }), reponse()]);
    expect(sans.some((x) => x.id === 'maison:claude:couverture')).toBe(false);
  });

  it('ne propose pas ce que le projet a deja, et dit le choix qu elle remplacerait', () => {
    const objets = quartier();
    const m = objets[1] as ObjetPlan;
    m.toit = { forme: 'deux-pans', hauteur: 3, angleFaitage: 0, couverture: 'ardoise' };
    m.couleurMurs = { materiau: 'enduit' };
    const p = propositions([reponse()], objets);
    expect(p.some((x) => x.id === 'maison:claude:couverture')).toBe(false);
    expect(p.find((x) => x.id === 'maison:claude:materiauMurs')?.remplaceChoix).toBe('Enduit');
    m.toit = { forme: 'deux-pans', hauteur: 3, angleFaitage: 0, couverture: 'tuile' };
    expect(propositions([reponse()], objets).find((x) => x.id === 'maison:claude:couverture')?.remplaceChoix).toBe('tuiles mécaniques');
  });

  it('propose la toiture-terrasse sur le corps plat, et marque la contradiction avec le LiDAR', () => {
    const r = reponse({ terrasse: { indices: [{ image: 3, vu: 'gravillons et acrotère' }], presente: 'oui', type: 'inaccessible', acrotere: 'oui', edicules: 0 } });
    const p = propositions([r, r, r]);
    const t = p.find((x) => x.id === 'maison:claude:terrasse');
    expect(t).toMatchObject({ avant: 'toit plat, sans détail', apres: 'Toiture-terrasse inaccessible, acrotère, vue par Claude', effet: { type: 'terrasse', corps: 1, terrasse: { accessible: false, acrotereM: 0.6, source: 'observation' } } });
    // Avec une mesure LiDAR qui monte de 3 m sans corps plat, la meme reponse « plat » est contredite.
    const objets = quartier();
    const m = objets[1] as ObjetPlan;
    m.corpsToit = [CORPS];
    m.toitMesure = { pas: 1, x0: 5, y0: 18, nx: 10, ny: 8, z: new Array(80).fill(8), egout: 6, faite: 9, source: 'lidar' };
    const plat = reponse({ forme: { indices: [], valeur: 'plat' } });
    const c = propositions([plat, plat, plat], objets).find((x) => x.id === 'maison:claude:couverture');
    expect(c?.reserve).toMatch(/^Contredit la mesure LiDAR : toit plat annoncé/);
  });

  it('ignore les reponses qui n ont pas la forme du schema', () => {
    expect(propositions([{ forme: 'plat' }, null])).toEqual([]);
    expect(propositions([])).toEqual([]);
  });

  it('traduit le vocabulaire de Claude, vote le parement des facades, et met les ecarts en clair', () => {
    expect(couvertureDuVocabulaire('tuile-mecanique')).toBe('tuile');
    expect(couvertureDuVocabulaire('membrane')).toBe(null);
    const v = voter([reponse({ facades: [reponse().facades[0]!, { ...reponse().facades[0]!, facade: 'nord', materiau: 'enduit' }, { ...reponse().facades[0]!, facade: 'est', materiau: 'brique', ouvertures: { niveaux: 1, parNiveau: [2], manquees: 1, enTrop: 0 }, ecart: 'une porte de garage absente du modèle' }] })]);
    expect(materiauDesFacades(v)).toMatchObject({ valeur: 'brique', accord: 1 });
    expect(ecartsEnClair(v)).toEqual(['façade est : 1 ouverture non détectée par Plan', 'façade est : une porte de garage absente du modèle']);
    expect(indicesDe([{ image: 9, vu: 'x' }], ETIQUETTES)).toEqual([{ texte: 'x (image 9)' }]);
  });
});

import { describe, it, expect } from 'vitest';
import { FORMES_SIMPLES, PAS_FAITAGE_M, PIECES_SIMPLES, directionTournee, faitageDuToitSimple, faitageParPas, faitageSimple, hauteurParPas, rangDesReglages, resumeDuToit, sensDuToitSimple, sensSimple, tournerSimple } from '../../../../src/facade/modeToit/simple.js';
import { appliquerPiece, corpsDepuisExemple, piece } from '../../../../src/three/gestesToits.js';
import { EXEMPLES_TOITS } from '../../../../src/facade/modeToit/exemplesToits.js';
import { sensDuCorps } from '../../../../src/facade/modeToit/sens.js';
import type { CorpsToit, ObjetPlan, PtBrut } from '../../../../src/model/types.js';

// Le parcours simple du mode Toit (maquette du 27 novembre 2026, « je veux du simple ») : trois reglages pour modifier, six pieces pour
// ajouter. Rien de neuf dans le calcul : la hauteur par pas est la poignee du faitage, le sens celui de l'inspecteur.

const RECT: PtBrut[] = [{ x: 0, y: 0 }, { x: 12, y: 0 }, { x: 12, y: 7 }, { x: 0, y: 7 }];
const exemple = (id: string): CorpsToit[] => {
  const e = EXEMPLES_TOITS.find((x) => x.id === id);
  if (!e) throw new Error('exemple absent : ' + id);
  return corpsDepuisExemple(e, RECT, 5, 3);
};
const maison = (toit: Record<string, unknown> | null, corps?: CorpsToit[]): ObjetPlan => ({
  key: 'm', name: 'Maison', type: 'polygon', fonction: 'batiment', pts: RECT.map((p) => ({ ...p })), elevation: 5,
  batiment: { ...(toit ? { toit } : {}), ...(corps ? { corpsToit: corps } : {}) }
}) as unknown as ObjetPlan;

describe('le parcours simple du mode Toit', () => {
  it('ses quatre formes et ses six pieces sont des pieces du catalogue', () => {
    expect(FORMES_SIMPLES.map((f) => f.libelle)).toEqual(['Plat', 'Un pan', 'Deux pans', 'Quatre pans']);
    expect(PIECES_SIMPLES.map((p) => p.libelle)).toEqual(['Lucarne', 'Fenêtre de toit', 'Cheminée', 'Auvent', 'Appentis', 'Galerie']);
    for (const x of [...FORMES_SIMPLES, ...PIECES_SIMPLES]) expect(piece(x.piece), x.piece).toBeDefined();
    for (const p of PIECES_SIMPLES) expect(p.poser).toMatch(/^Poser (la |l’)/);
  });

  it('chaque piece se pose sur une maison a deux pans ; l auvent est une saillie « auvent », ouverte, au-dessus d une porte', () => {
    for (const p of PIECES_SIMPLES) {
      const o = maison({ forme: 'deux-pans', hauteur: 3, angleFaitage: 0, source: 'saisie' }, exemple('deux-pans'));
      expect(appliquerPiece(o, p.piece), p.piece).toBe(true);
    }
    const o = maison({ forme: 'deux-pans', hauteur: 3, angleFaitage: 0, source: 'saisie' }, exemple('deux-pans'));
    appliquerPiece(o, 'facade:auvent');
    const a = o.batiment?.corpsToit?.[1];
    expect(a?.saillie?.genre).toBe('auvent');
    expect(a?.ouvert).toBe(true);
    expect(a?.saillie?.largeurM).toBeCloseTo(1.6, 6);
  });

  it('la hauteur et le sens se reglent sur le corps choisi, sinon le corps principal ; jamais sur un element choisi', () => {
    const grand = exemple('deux-pans')[0] as CorpsToit;
    const petit: CorpsToit = { ...grand, pts: [{ x: 12, y: 0 }, { x: 15, y: 0 }, { x: 15, y: 4 }, { x: 12, y: 4 }] };
    const corps = [petit, grand];
    expect(rangDesReglages(corps, null)).toBe(1);
    expect(rangDesReglages(corps, { type: 'corps', rang: 0, i: 0 })).toBe(0);
    expect(rangDesReglages(corps, { type: 'lucarne', rang: 1, i: 0 })).toBeNull();
    expect(rangDesReglages([], null)).toBeNull();
  });

  it('un pas monte ou baisse le faitage de dix centimetres, les egouts restent ; en butee, le bouton n a plus d effet', () => {
    const corps = exemple('deux-pans'), c = corps[0] as CorpsToit;
    expect(PAS_FAITAGE_M).toBe(0.1);
    const haut = faitageParPas(corps, 0, 1)[0] as CorpsToit, bas = faitageParPas(corps, 0, -1)[0] as CorpsToit;
    expect(haut.faitage).toBeCloseTo(c.faitage + 0.1, 6);
    expect(bas.faitage).toBeCloseTo(c.faitage - 0.1, 6);
    expect(haut.egouts).toEqual(c.egouts);
    expect(faitageSimple(corps, 0)).toEqual({ hauteur: c.faitage, monte: true, descend: true, raison: null });
    // Au plus bas (40 cm au-dessus de l'egout, la borne de la poignee), « − » ne fait plus rien.
    const ras = [{ ...c, faitage: Math.max(...c.egouts) + 0.4 }];
    expect(faitageSimple(ras, 0)?.descend).toBe(false);
    expect(faitageSimple(ras, 0)?.monte).toBe(true);
  });

  it('un toit plat n a pas de faitage a regler, et le dit', () => {
    const f = faitageSimple(exemple('plat'), 0);
    expect(f?.monte).toBe(false);
    expect(f?.descend).toBe(false);
    expect(f?.raison).toMatch(/toit plat/);
    expect(faitageSimple([], null)).toBeNull();
  });

  it('« Tourner » met le faitage dans l autre sens, et un second appui le ramene', () => {
    const corps = exemple('deux-pans');
    expect(sensSimple(corps, null)).toEqual({ valeur: 'long', raison: null });
    const tourne = tournerSimple(corps, null);
    expect(sensDuCorps(tourne[0] as CorpsToit)).toBe('court');
    expect(sensSimple(tourne, null)?.valeur).toBe('court');
    expect(sensDuCorps(tournerSimple(tourne, null)[0] as CorpsToit)).toBe('long');
  });

  it('ce qui empeche de tourner se dit, et rien ne tourne : un toit plat, une lucarne posee', () => {
    const plat = exemple('plat');
    expect(sensSimple(plat, null)?.raison).toMatch(/pas de faîtage/);
    expect(tournerSimple(plat, null)).toEqual(plat);
    const o = maison({ forme: 'deux-pans', hauteur: 3, angleFaitage: 0, source: 'saisie' }, exemple('deux-pans'));
    appliquerPiece(o, 'sur:jacobine');
    const corps = o.batiment?.corpsToit ?? [];
    expect(sensSimple(corps, null)?.raison).toMatch(/retirez-le/);
    expect(tournerSimple(corps, null)).toEqual(corps);
    // Un element choisi n'a pas de sens de faitage.
    expect(sensSimple(corps, { type: 'lucarne', rang: 0, i: 0 })).toBeNull();
  });

  it('un batiment sans corps regle son toit simple : sa hauteur par pas, entre ses bornes, et sa direction d un quart de tour', () => {
    const o = maison({ forme: 'deux-pans', hauteur: 3, angleFaitage: 0, source: 'bdtopo' });
    expect(faitageDuToitSimple(o)).toEqual({ hauteur: 8, monte: true, descend: true, raison: null });
    expect(hauteurParPas({ hauteur: 3 }, 1)).toBe(3.1);
    expect(hauteurParPas({ hauteur: 3 }, -1)).toBe(2.9);
    expect(hauteurParPas({ hauteur: 0.4 }, -1)).toBe(0.4);
    expect(hauteurParPas({ hauteur: 20 }, 1)).toBe(20);
    expect(sensDuToitSimple(o)).toEqual({ valeur: 'long', raison: null });
    expect(directionTournee({ angleFaitage: 0 })).toBe(90);
    expect(directionTournee({ angleFaitage: 135 })).toBe(45);
    expect(sensDuToitSimple(maison({ forme: 'deux-pans', hauteur: 3, angleFaitage: 90, source: 'saisie' }))?.valeur).toBe('court');
    expect(faitageDuToitSimple(maison({ forme: 'plat', hauteur: 0, angleFaitage: 0, source: 'saisie' }))?.raison).toMatch(/toit plat/);
    expect(sensDuToitSimple(maison({ forme: 'croupes', hauteur: 3, angleFaitage: 0, source: 'saisie' }))?.raison).toMatch(/pas de faîtage/);
    expect(faitageDuToitSimple(maison(null))).toBeNull();
  });

  it('l etat du toit tient en une ligne sous le nom du batiment', () => {
    expect(resumeDuToit(maison({ forme: 'deux-pans', hauteur: 1.8, angleFaitage: 0, source: 'saisie' }))).toBe('Toit à deux pans · faîtage à 6,8 m');
    expect(resumeDuToit(maison({ forme: 'plat', hauteur: 0, angleFaitage: 0, source: 'saisie' }))).toBe('Toit plat · à 5,0 m');
    expect(resumeDuToit(maison(null, exemple('croupes')))).toBe('Toit à quatre pans · faîtage à 8,0 m');
    expect(resumeDuToit(maison(null, exemple('appentis')))).toBe('Toit à un pan · faîtage à 8,0 m');
    expect(resumeDuToit(maison(null, exemple('mansart')))).toMatch(/^Toit à la Mansart · faîtage à /);
    expect(resumeDuToit(maison(null, exemple('toit-en-m')))).toMatch(/^Toit en 2 corps · faîtage à /);
    expect(resumeDuToit(maison(null))).toBeNull();
  });
});

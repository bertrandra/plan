import { describe, it, expect } from 'vitest';
import { FORMES_SIMPLES, PIECES_SIMPLES, piece } from '../../../../src/facade/modeToit/pieces.js';
import { PAS_FAITAGE_M, brouillonDe, corpsDepuisExemple, faitageDeLaPortee, faitageParPas, hauteurParPas, porteeDuGeste, resumeDuToit, sensDeLaPortee, tournerLeSens, type Choix } from '../../../../src/facade/modeToit/gestes.js';
import { poser } from './poser.js';
import { EXEMPLES_TOITS } from '../../../../src/facade/modeToit/exemplesToits.js';
import { sensDuCorps } from '../../../../src/facade/modeToit/sens.js';
import type { CorpsToit, ObjetPlan, PtBrut } from '../../../../src/model/types.js';

// Le parcours simple de l'atelier du toit (maquette du 27 novembre 2026, « je veux du simple ») : trois reglages pour modifier, six
// pieces pour ajouter. La hauteur par pas est la poignee du faitage, le sens celui de l'inspecteur, sur la portee (gestes.ts).

const RIEN: Choix = { selection: null, batimentEntier: false, facade: null };
const sur = (corps: CorpsToit[], choix: Choix = RIEN) => maison(null, corps) && porteeDuGeste(corps, choix);
const faitageSimple = (corps: CorpsToit[], choix: Choix = RIEN) => faitageDeLaPortee(maison(null, corps), sur(corps, choix));
const sensSimple = (corps: CorpsToit[], choix: Choix = RIEN) => sensDeLaPortee(maison(null, corps), sur(corps, choix));
const tournerSimple = (corps: CorpsToit[], choix: Choix = RIEN): CorpsToit[] => { const b = brouillonDe(maison(null, corps)); tournerLeSens(b, sur(corps, choix)); return b.batiment?.corpsToit ?? []; };

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
      expect(poser(o, p.piece), p.piece).toBe(true);
    }
    const o = maison({ forme: 'deux-pans', hauteur: 3, angleFaitage: 0, source: 'saisie' }, exemple('deux-pans'));
    poser(o, 'facade:auvent');
    const a = o.batiment?.corpsToit?.[1];
    expect(a?.saillie?.genre).toBe('auvent');
    expect(a?.ouvert).toBe(true);
    expect(a?.saillie?.largeurM).toBeCloseTo(1.6, 6);
  });

  it('la portee : le corps choisi, celui de l element choisi, la facade regardee, sinon le corps principal ; tout le toit, explicitement', () => {
    const grand = exemple('deux-pans')[0] as CorpsToit;
    const petit: CorpsToit = { ...grand, pts: [{ x: 12, y: 0 }, { x: 15, y: 0 }, { x: 15, y: 4 }, { x: 12, y: 4 }] };
    const corps = [petit, grand];
    expect(porteeDuGeste(corps, RIEN)).toMatchObject({ rang: 1, entier: false, mots: 'Corps principal' });
    expect(porteeDuGeste(corps, { ...RIEN, selection: { type: 'corps', rang: 0, i: 0 } }).rang).toBe(0);
    expect(porteeDuGeste(corps, { ...RIEN, selection: { type: 'lucarne', rang: 0, i: 0 } }).rang).toBe(0);
    expect(porteeDuGeste(corps, { ...RIEN, facade: { rang: 0, mur: 1 } })).toMatchObject({ rang: 0, mots: 'Corps 1 (la façade regardée)' });
    expect(porteeDuGeste(corps, { ...RIEN, batimentEntier: true })).toMatchObject({ rang: null, entier: true, mots: 'Tout le toit' });
    expect(porteeDuGeste([], RIEN)).toMatchObject({ rang: null, entier: false, mots: 'Le toit' });
  });

  it('un pas monte ou baisse le faitage de dix centimetres, les egouts restent ; en butee, le bouton n a plus d effet', () => {
    const corps = exemple('deux-pans'), c = corps[0] as CorpsToit;
    expect(PAS_FAITAGE_M).toBe(0.1);
    const haut = faitageParPas(corps, 0, 1)[0] as CorpsToit, bas = faitageParPas(corps, 0, -1)[0] as CorpsToit;
    expect(haut.faitage).toBeCloseTo(c.faitage + 0.1, 6);
    expect(bas.faitage).toBeCloseTo(c.faitage - 0.1, 6);
    expect(haut.egouts).toEqual(c.egouts);
    expect(faitageSimple(corps)).toEqual({ hauteur: c.faitage, monte: true, descend: true, raison: null });
    // Au plus bas (40 cm au-dessus de l'egout, la borne de la poignee), « − » ne fait plus rien.
    const ras = [{ ...c, faitage: Math.max(...c.egouts) + 0.4 }];
    expect(faitageSimple(ras)?.descend).toBe(false);
    expect(faitageSimple(ras)?.monte).toBe(true);
  });

  it('un toit plat n a pas de faitage a regler, et le dit', () => {
    const f = faitageSimple(exemple('plat'));
    expect(f?.monte).toBe(false);
    expect(f?.descend).toBe(false);
    expect(f?.raison).toMatch(/toit plat/);

  });

  it('« Tourner » met le faitage dans l autre sens, et un second appui le ramene', () => {
    const corps = exemple('deux-pans');
    expect(sensSimple(corps)).toEqual({ valeur: 'long', raison: null });
    const tourne = tournerSimple(corps);
    expect(sensDuCorps(tourne[0] as CorpsToit)).toBe('court');
    expect(sensSimple(tourne)?.valeur).toBe('court');
    expect(sensDuCorps(tournerSimple(tourne)[0] as CorpsToit)).toBe('long');
  });

  it('ce qui empeche de tourner se dit, et rien ne tourne : un toit plat, une lucarne posee', () => {
    const plat = exemple('plat');
    expect(sensSimple(plat)?.raison).toMatch(/pas de faîtage/);
    expect(tournerSimple(plat)).toEqual(plat);
    const o = maison({ forme: 'deux-pans', hauteur: 3, angleFaitage: 0, source: 'saisie' }, exemple('deux-pans'));
    poser(o, 'sur:jacobine');
    const corps = o.batiment?.corpsToit ?? [];
    expect(sensSimple(corps)?.raison).toMatch(/retirez-le/);
    expect(tournerSimple(corps)).toEqual(corps);
    // Un element choisi : le sens est celui de son corps, qui le dit.
    expect(sensSimple(corps, { ...RIEN, selection: { type: 'lucarne', rang: 0, i: 0 } })?.raison).toMatch(/retirez-le/);
  });

  it('un batiment sans corps regle son toit simple : sa hauteur par pas, entre ses bornes, et sa direction d un quart de tour', () => {
    const o = maison({ forme: 'deux-pans', hauteur: 3, angleFaitage: 0, source: 'bdtopo' });
    const p = porteeDuGeste([], RIEN);
    expect(faitageDeLaPortee(o, p)).toEqual({ hauteur: 8, monte: true, descend: true, raison: null });
    expect(hauteurParPas({ hauteur: 3 }, 1)).toBe(3.1);
    expect(hauteurParPas({ hauteur: 3 }, -1)).toBe(2.9);
    expect(hauteurParPas({ hauteur: 0.4 }, -1)).toBe(0.4);
    expect(hauteurParPas({ hauteur: 20 }, 1)).toBe(20);
    expect(sensDeLaPortee(o, p)).toEqual({ valeur: 'long', raison: null });
    const b = brouillonDe(o);
    expect(tournerLeSens(b, p)).toBe(true);
    expect(b.batiment?.toit?.angleFaitage).toBe(90);
    expect(sensDeLaPortee(maison({ forme: 'deux-pans', hauteur: 3, angleFaitage: 90, source: 'saisie' }), p)?.valeur).toBe('court');
    expect(faitageDeLaPortee(maison({ forme: 'plat', hauteur: 0, angleFaitage: 0, source: 'saisie' }), p)?.raison).toMatch(/toit plat/);
    expect(sensDeLaPortee(maison({ forme: 'croupes', hauteur: 3, angleFaitage: 0, source: 'saisie' }), p)?.raison).toMatch(/pas de faîtage/);
    expect(faitageDeLaPortee(maison(null), p)).toBeNull();
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

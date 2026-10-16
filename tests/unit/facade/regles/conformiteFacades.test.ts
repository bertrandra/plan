import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { jugerFacade, facadesDeLAuditParcelle, type FacadeAJuger } from '../../../../src/facade/regles/facades/conformite.js';
import { ouverturesDUnMur, ouverturesAutomatiques } from '../../../../src/facade/ouvertures.js';
import { lireFichierAuditParcelle } from '../../../../src/model/fichierAuditParcelle.js';
import { REGLAGES_FACADES } from '../../../../src/regles/facades/reglages.js';
import type { OuvertureFacade, PtBrut } from '../../../../src/model/types.js';

// Juger les facades relevees avec la disposition automatique d'aujourd'hui (lot G13) : le relevé d'un mur
// qui ressemble a la disposition est conforme ; un relevé qui s'en ecarte ne l'est pas, et on dit sur quoi.

const releveDe = (os: OuvertureFacade[], largeur = 9, hauteur = 5.4): FacadeAJuger['releve'] => ({ largeur, hauteur, ouvertures: os });
const a = (releve: FacadeAJuger['releve'], plus: Partial<FacadeAJuger> = {}): FacadeAJuger => ({ fichier: 'f', batiment: 'Maison', cote: 0, orientation: 'Sud', region: '78', releve, ...plus });

describe('la disposition d un seul mur', () => {
  it('est celle que ouverturesAutomatiques pose sur chaque mur : le coeur a ete extrait sans rien changer', () => {
    const p = (x: number, y: number): PtBrut => ({ x, y });
    const maison = [p(0, 0), p(12, 0), p(12, 8), p(0, 8)];
    const tout = ouverturesAutomatiques(maison, [{ pts: maison, hauteur: 6 }], 6, { etages: 2 });
    // Le mur 0 mesure 12 m : c'est le plus long, il porte la porte.
    const sansCote = (l: typeof tout) => l.map(({ cote: _c, ...o }) => o);
    expect(ouverturesDUnMur(12, 6, { etages: 2 }, true)).toEqual(sansCote(tout.filter((o) => o.cote === 0)));
    expect(ouverturesDUnMur(8, 6, { etages: 2 }, false)).toEqual(sansCote(tout.filter((o) => o.cote === 1)));
  });

  it('ne pose rien sur un mur trop etroit ou trop bas', () => {
    expect(ouverturesDUnMur(1.2, 5)).toEqual([]);
    expect(ouverturesDUnMur(9, 0.5)).toEqual([]);
  });
});

describe('juger une facade relevee', () => {
  it('une facade relevee comme la disposition la pose est conforme sur tous ses criteres', () => {
    const verdict = jugerFacade(a(releveDe(ouverturesDUnMur(9, 5.4, {}, true))));
    expect(verdict).toMatchObject({ conforme: true, baies: { tenu: true }, partVitree: { tenu: true }, fichier: 'f', batiment: 'Maison', cote: 0, orientation: 'Sud', region: '78' });
    expect(verdict.baies.auto).toBe(verdict.baies.releve);
  });

  it('une baie en moins ne casse pas la conformite (± 1), trois en moins oui, avec le motif sur les baies', () => {
    const auto = ouverturesDUnMur(9, 5.4, {}, true);
    expect(jugerFacade(a(releveDe(auto.slice(1)))).baies.tenu).toBe(true);
    const verdict = jugerFacade(a(releveDe(auto.slice(3))));
    expect(verdict.baies).toMatchObject({ tenu: false, auto: auto.length, releve: auto.length - 3 });
    expect(verdict.conforme).toBe(false);
  });

  it('un pignon aveugle au releve n est pas conforme a une disposition qui y met des fenetres', () => {
    const verdict = jugerFacade(a(releveDe([])));
    expect(verdict).toMatchObject({ conforme: false, baies: { releve: 0, tenu: false }, partVitree: { releve: 0, tenu: false } });
  });

  it('prend le nombre d etages du batiment quand on le sait : une maison de 5,4 m a un seul etage releve', () => {
    const unSeul = ouverturesDUnMur(9, 5.4, { etages: 1 }, true);
    expect(jugerFacade(a(releveDe(unSeul), { etages: 1 })).conforme).toBe(true);
    // Sans l'etage connu, la disposition en deduit deux et pose plus de baies que le releve : ecart.
    expect(jugerFacade(a(releveDe(unSeul))).baies.auto).toBeGreaterThan(unSeul.length);
  });

  it('pose la porte de la disposition seulement si le releve en porte une : on compare la place des fenetres', () => {
    const sansPorte = ouverturesDUnMur(9, 5.4, {}, false);
    expect(sansPorte.some((o) => o.type === 'porte')).toBe(false);
    expect(jugerFacade(a(releveDe(sansPorte)))).toMatchObject({ conforme: true, baies: { auto: sansPorte.length } });
  });

  it('juge avec le profil donne : un profil aux fenetres larges change la part vitree', () => {
    const releve = releveDe(ouverturesDUnMur(9, 5.4, {}, true));
    const large = { ...REGLAGES_FACADES, FENETRE_LARGEUR_M: 1.6 };
    const defaut = jugerFacade(a(releve));
    const profil = jugerFacade(a(releve), large);
    expect(profil.partVitree.auto as number).toBeGreaterThan(defaut.partVitree.auto as number);
  });
});

describe('les facades d un audit de parcelle', () => {
  const fichier = lireFichierAuditParcelle(JSON.parse(readFileSync('tests/fixtures/audit-parcelle/audit-parcelle-exemple-synthetique.json', 'utf8')));

  it('sont les facades qui portent un releve ; une facade sans mesure n en est pas une', () => {
    const f = facadesDeLAuditParcelle('20261014-100000-abcdef01', fichier);
    expect(f.map((x) => [x.batiment, x.cote, x.orientation])).toEqual([['Maison', 0, 'Sud'], ['Maison', 1, 'Est'], ['Maison', 2, 'Nord']]);
    // La parcelle de l'exemple est un identifiant fictif : sa region est inconnue.
    expect(f.every((x) => x.fichier === '20261014-100000-abcdef01' && x.region === 'inconnue')).toBe(true);
  });

  it('se jugent toutes : chaque facade a un verdict, et la facade est aveugle quand le releve n a pas d ouverture', () => {
    const v = facadesDeLAuditParcelle('x', fichier).map((x) => jugerFacade(x));
    expect(v).toHaveLength(3);
    const est = v.find((x) => x.orientation === 'Est')!;
    expect(est.baies.releve).toBe(0);
    expect(v.every((x) => typeof x.conforme === 'boolean')).toBe(true);
  });
});

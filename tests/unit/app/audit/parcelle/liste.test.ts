import { describe, it, expect } from 'vitest';
import { DEMO_OBJECTS } from '../../../../../src/model/demo.js';
import { batimentsAudites, listeDeControle, situationFacade, statutFacade, texteStatutFacade, aUnToitPlat } from '../../../../../src/app/audit/parcelle/liste.js';
import { captureVide, batimentVide } from '../../../../../src/model/auditParcelle.js';
import { facadesDuContour } from '../../../../../src/facade/geometrie.js';
import type { ObjetPlan, PtBrut } from '../../../../../src/model/types.js';

// La liste de controle de l'audit de la parcelle (MD/spec-audit.md §12.1) : les batiments de la
// parcelle et ses mitoyens, l'etat de chaque facade, le compteur et ce qui manque.

const PHOTO = { type: 'image/jpeg' as const, base64: 'AAAA' };
const rect = (x0: number, y0: number, x1: number, y1: number): PtBrut[] => [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];
const obj = (key: string, plus: Partial<ObjetPlan>): ObjetPlan => ({ key, name: key, type: 'polygon', ...plus } as ObjetPlan);

/**
 * Une parcelle de 20 x 30 m sur la rue (au sud, y < 0), une voisine a l'est ; la maison au milieu,
 * un garage colle a la maison, et chez la voisine, une maison posee sur la limite.
 */
function quartier(): ObjetPlan[] {
  return [
    obj('parcelle', { fonction: 'terrain', pts: rect(0, 0, 20, 30), cadastre: { idu: '78650000AE0101', origineLat: 48.9, origineLon: 2.13 } }),
    obj('voisine', { fonction: 'terrain', pts: rect(20, 0, 40, 30), voisinage: true }),
    obj('maison', { fonction: 'batiment', pts: rect(5, 10, 15, 20), elevation: 6 }),
    obj('garage', { fonction: 'batiment', pts: rect(15, 12, 18, 18), elevation: 3 }),
    obj('chezVoisin', { fonction: 'batiment', pts: rect(20, 5, 30, 15), elevation: 6, voisinage: true, bdtopo: { surParcellePrincipale: false } }),
  ];
}

describe('les batiments de l audit', () => {
  it('prend ceux de la parcelle, puis les mitoyens', () => {
    const b = batimentsAudites(quartier());
    expect(b.map((x) => [x.o.key, x.mitoyen])).toEqual([['maison', false], ['garage', false], ['chezVoisin', true]]);
  });

  it('trouve la maison et l abri de la demonstration, et des mitoyens', () => {
    const b = batimentsAudites(DEMO_OBJECTS as ObjetPlan[]);
    const propres = b.filter((x) => !x.mitoyen).map((x) => x.o.key);
    expect(propres).toEqual(expect.arrayContaining(['maison', 'abri']));
    expect(b.some((x) => x.mitoyen)).toBe(true);
  });
});

describe('la situation d une facade', () => {
  const objets = quartier();
  const facades = (cle: string) => { const o = objets.find((x) => x.key === cle) as unknown as { pts: PtBrut[] }; return facadesDuContour(o.pts, 6); };

  it('marque mitoyen le mur de la maison colle au garage', () => {
    const est = facades('maison').find((f) => f.orientation === 'Est')!;
    expect(situationFacade(est, 'maison', objets)).toBe('mitoyenne');
  });

  it('voit la rue devant le mur sud du garage, la parcelle devant celui de la maison', () => {
    const sudMaison = facades('maison').find((f) => f.orientation === 'Sud')!;
    expect(situationFacade(sudMaison, 'maison', objets)).toBe('parcelle');
    const sudVoisin = facades('chezVoisin').find((f) => f.orientation === 'Sud')!;
    expect(situationFacade(sudVoisin, 'chezVoisin', objets)).toBe('rue');
  });

  it('voit la parcelle du projet devant le mur du voisin pose sur la limite', () => {
    const ouest = facades('chezVoisin').find((f) => f.orientation === 'Ouest')!;
    expect(situationFacade(ouest, 'chezVoisin', objets)).toBe('parcelle');
  });

  it('suppose inaccessible la facade d un mitoyen qui donne chez un autre voisin, et une touche la rend', () => {
    expect(statutFacade('voisin', true, 0, undefined)).toBe('inaccessible');
    expect(statutFacade('voisin', true, 0, false)).toBe('aPhotographier');
    expect(statutFacade('voisin', false, 0, undefined)).toBe('aPhotographier');
    expect(statutFacade('parcelle', false, 0, true)).toBe('inaccessible');
    // Une photo l'emporte : la facade etait accessible apres tout.
    expect(statutFacade('voisin', true, 2, true)).toBe('photographiee');
    expect(statutFacade('mitoyenne', false, 1, undefined)).toBe('mitoyenne');
  });
});

describe('la liste et son compteur', () => {
  it('compte les facades a prendre, sans les mitoyennes', () => {
    const l = listeDeControle(quartier(), captureVide('78650000AE0101'));
    const maison = l.batiments.find((b) => b.cle === 'maison')!;
    expect(maison.facades.map((f) => texteStatutFacade(f))).toContain('Mitoyenne, rien à photographier');
    expect(maison.facades.find((f) => f.statut === 'aPhotographier')!.libelle).toMatch(/^Façade \w+ · 10,0 m$/);
    expect(l.facadesPhotographiees).toBe(0);
    expect(l.compteur).toMatch(/^0 façade sur \d+, 0 toit vu sur 3, clôture à faire, portail à faire$/);
    expect(l.peutLancer).toBe(false);
  });

  it('passe une facade a « photographiée (n photos) » et propose de lancer l analyse', () => {
    const c = captureVide('78650000AE0101');
    const sud = facadesDuContour(rect(5, 10, 15, 20), 6).find((f) => f.orientation === 'Sud')!;
    c.batiments.maison = { ...batimentVide(), facades: { [String(sud.cote)]: { photos: [PHOTO, PHOTO] } }, vu: { forme: 'deux-pans' } };
    c.cloture = { type: 'mur', hauteurM: 1.8, photos: [] };
    const l = listeDeControle(quartier(), c);
    const ligne = l.batiments[0]!.facades.find((f) => f.cote === sud.cote)!;
    expect(texteStatutFacade(ligne)).toBe('Photographiée (2 photos)');
    expect(l.compteur).toMatch(/^1 façade sur \d+, 1 toit vu sur 3, clôture notée, portail à faire$/);
    expect(l.peutLancer).toBe(true);
    expect(l.cloture.resume).toBe('Mur · 1,8 m');
    expect(l.manques).toContain('portail : non noté');
    expect(l.manques.some((m) => /^façade nord de maison : pas de photo$/.test(m))).toBe(true);
    expect(l.manques).not.toContain('toit de maison : non vu');
    expect(l.manques).toContain('cheminées de maison : non vues');
  });

  it('dit « Aucune » pour des cheminees regardees et absentes', () => {
    const c = captureVide('x');
    c.batiments.maison = { ...batimentVide(), vu: { cheminees: { nombre: 0, souches: [] } } };
    const l = listeDeControle(quartier(), c);
    expect(l.batiments[0]!.parties.find((p) => p.partie === 'cheminees')!.statut).toBe('Aucune');
  });

  it('ajoute la ligne de la toiture-terrasse pour un toit plat', () => {
    const plat = obj('b', { fonction: 'batiment', pts: rect(0, 0, 5, 5), toit: { forme: 'plat', hauteur: 0, angleFaitage: 0 } });
    expect(aUnToitPlat(plat, batimentVide())).toBe(true);
    const pentu = obj('b', { fonction: 'batiment', pts: rect(0, 0, 5, 5), toit: { forme: 'deux-pans', hauteur: 3, angleFaitage: 0 } });
    expect(aUnToitPlat(pentu, batimentVide())).toBe(false);
    expect(aUnToitPlat(pentu, { ...batimentVide(), vu: { forme: 'plat' } })).toBe(true);
    const l = listeDeControle([...quartier().slice(0, 2), plat], captureVide('x'));
    expect(l.batiments[0]!.parties.map((p) => p.partie)).toEqual(['toit', 'cheminees', 'terrasse', 'materiaux']);
  });
});

import { describe, it, expect } from 'vitest';
import { DEMO_OBJECTS } from '../../../../../src/model/demo.js';
import { batimentsAudites, listeDeControle, situationFacade, statutFacade, texteStatutFacade, aUnToitPlat, MUR_COURT_M, hauteurMurSousToit, profilMurSousToit, hauteurHautDeFacade } from '../../../../../src/app/audit/parcelle/liste.js';
import { captureVide, batimentVide } from '../../../../../src/model/auditParcelle.js';
import { facadesDuContour } from '../../../../../src/geometry/cotesVusDeDehors.js';
import type { ObjetPlan, PtBrut } from '../../../../../src/model/types.js';
import { versMemoire } from '../../../../../src/model/champsFonction.js';

// La liste de controle de l'audit de la parcelle (MD/spec-audit.md §12.1) : les batiments de la
// parcelle du projet (les maisons voisines n'en font pas partie), l'etat de chaque facade, le
// compteur et ce qui manque.

const PHOTO = { type: 'image/jpeg' as const, base64: 'AAAA' };
const rect = (x0: number, y0: number, x1: number, y1: number): PtBrut[] => [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];
const obj = (key: string, plus: Partial<ObjetPlan> | Record<string, unknown>): ObjetPlan => versMemoire({ key, name: key, type: 'polygon', ...plus }) as ObjetPlan;

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
  it('ne prend que ceux de la parcelle : la maison voisine n est plus dans l audit', () => {
    const b = batimentsAudites(quartier());
    expect(b.map((x) => [x.o.key, x.mitoyen])).toEqual([['maison', false], ['garage', false]]);
  });

  it('trouve la maison et l abri de la demonstration, et aucun mitoyen', () => {
    const b = batimentsAudites(DEMO_OBJECTS as ObjetPlan[]);
    expect(b.map((x) => x.o.key)).toEqual(expect.arrayContaining(['maison', 'abri']));
    expect(b.some((x) => x.mitoyen)).toBe(false);
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
    expect(l.compteur).toMatch(/^0 façade sur \d+, 0 toit vu sur 2, clôture à faire, portail à faire$/);
    expect(l.peutLancer).toBe(false);
  });

  it('ne compte que la parcelle du projet : la maison voisine n y est pas (essai d AE 101)', () => {
    const l = listeDeControle(quartier(), captureVide('78650000AE0101'));
    expect(l.batiments.map((b) => b.cle)).toEqual(['maison', 'garage']);
    const aPrendre = l.batiments.flatMap((b) => b.facades).filter((f) => f.statut === 'aPhotographier').length;
    expect(l.facadesAPrendre).toBe(aPrendre);
    expect(l.manques.some((m) => /chezVoisin/.test(m.texte))).toBe(false);
    // Une photo rangee chez la voisine (un ancien brouillon) n'entre ni dans le compte, ni dans l'analyse.
    const c = captureVide('78650000AE0101');
    const ouest = facadesDuContour(rect(20, 5, 30, 15), 6).find((f) => f.orientation === 'Ouest')!;
    c.batiments.chezVoisin = { ...batimentVide(), facades: { [String(ouest.cote)]: { photos: [PHOTO] } } };
    const avecVoisin = listeDeControle(quartier(), c);
    expect(avecVoisin.facadesPhotographiees).toBe(0);
    expect(avecVoisin.peutLancer).toBe(false);
  });

  it('donne au mur sa hauteur sous le toit, etage compris, sans toucher a la facade mesuree', () => {
    // Un prisme a 3 m, et un corps qui monte ses egouts a 6,2 m (sud) et 5,8 m (nord) : un etage.
    const corps = { pts: rect(5, 10, 15, 20), posFaitage: 5, faitage: 9, egouts: [6.2, 5.8] as [number, number], pignons: [], ecart: 0.1 };
    const maison = obj('maison', { fonction: 'batiment', pts: rect(5, 10, 15, 20), elevation: 3, batiment: { corpsToit: [corps] } });
    const sud = facadesDuContour(rect(5, 10, 15, 20), 3).find((f) => f.orientation === 'Sud')!;
    const ouest = facadesDuContour(rect(5, 10, 15, 20), 3).find((f) => f.orientation === 'Ouest')!;
    expect(hauteurMurSousToit(maison, sud)).toBe(6.2);
    // Un mur de bout s'arrete a l'egout le plus bas : le triangle du pignon n'est pas compte.
    expect(hauteurMurSousToit(maison, ouest)).toBe(5.8);
    const l = listeDeControle([quartier()[0]!, maison], captureVide('x'));
    const ligne = l.batiments[0]!.facades.find((f) => f.cote === sud.cote)!;
    expect(ligne.hauteurMur).toBe(6.2);
    expect(ligne.facade.hauteur).toBe(3);
  });

  it('suit le haut du mur par morceaux : une aile basse, puis l etage', () => {
    const aile = { pts: rect(5, 10, 10, 20), posFaitage: 2.5, faitage: 5, egouts: [3, 3] as [number, number], pignons: [], ecart: 0.1 };
    const etage = { pts: rect(10, 10, 15, 20), posFaitage: 2.5, faitage: 9, egouts: [6, 6] as [number, number], pignons: [], ecart: 0.1 };
    const maison = obj('maison', { fonction: 'batiment', pts: rect(5, 10, 15, 20), elevation: 3, batiment: { corpsToit: [aile, etage] } });
    const sud = facadesDuContour(rect(5, 10, 15, 20), 3).find((f) => f.orientation === 'Sud')!;
    const profil = profilMurSousToit(maison, sud);
    expect(profil.map((m) => m.h)).toEqual([3, 6]);
    expect(profil[0]!.de).toBe(0);
    expect(profil[0]!.a).toBeCloseTo(5, 6);
    expect(profil[1]!.a).toBeCloseTo(10, 6);
    // L'angle d'un corps voisin qui ne touche le mur que sur 30 cm ne fait pas un morceau a part.
    const coin = { pts: rect(14.7, 4, 20, 10), posFaitage: 2.5, faitage: 12, egouts: [9, 9] as [number, number], pignons: [], ecart: 0.1 };
    const avecCoin = obj('maison', { fonction: 'batiment', pts: rect(5, 10, 15, 20), elevation: 3, batiment: { corpsToit: [aile, etage, coin] } });
    expect(profilMurSousToit(avecCoin, sud).map((m) => m.h)).toEqual([3, 6]);
  });

  it('laisse de cote les decroches de moins de 1,5 m, sauf s ils ont deja une photo', () => {
    // Un decroche de 0,5 m au milieu de la facade sud.
    const decroche: PtBrut[] = [{ x: 5, y: 10 }, { x: 10, y: 10 }, { x: 10, y: 10.5 }, { x: 15, y: 10.5 }, { x: 15, y: 20 }, { x: 5, y: 20 }];
    const objets = [quartier()[0]!, obj('maison', { fonction: 'batiment', pts: decroche, elevation: 6 })];
    const l = listeDeControle(objets, captureVide('x'));
    expect(l.batiments[0]!.facades.map((f) => f.facade.largeur).every((w) => w >= MUR_COURT_M)).toBe(true);
    expect(l.batiments[0]!.facades).toHaveLength(5);
    const c = captureVide('x');
    c.batiments.maison = { ...batimentVide(), facades: { '1': { photos: [PHOTO] } } };
    expect(listeDeControle(objets, c).batiments[0]!.facades.map((f) => f.cote)).toContain(1);
  });

  it('passe une facade a « photographiée (n photos) » et propose de lancer l analyse', () => {
    const c = captureVide('78650000AE0101');
    const sud = facadesDuContour(rect(5, 10, 15, 20), 6).find((f) => f.orientation === 'Sud')!;
    c.batiments.maison = { ...batimentVide(), facades: { [String(sud.cote)]: { photos: [PHOTO, PHOTO] } }, vu: { forme: 'deux-pans' } };
    c.cloture = { type: 'mur', hauteurM: 1.8, photos: [] };
    const l = listeDeControle(quartier(), c);
    const ligne = l.batiments[0]!.facades.find((f) => f.cote === sud.cote)!;
    expect(texteStatutFacade(ligne)).toBe('Photographiée (2 photos)');
    expect(l.compteur).toMatch(/^1 façade sur \d+, 1 toit vu sur 2, clôture notée, portail à faire$/);
    expect(l.peutLancer).toBe(true);
    expect(l.cloture.resume).toBe('Mur · 1,8 m');
    const textes = l.manques.map((m) => m.texte);
    expect(textes).toContain('portail : non noté');
    expect(textes.some((m) => /^façade nord de maison : pas de photo$/.test(m))).toBe(true);
    expect(textes).not.toContain('toit de maison : non vu');
    expect(textes).toContain('cheminées de maison : non vues');
  });

  it('dit « Aucune » pour des cheminees regardees et absentes', () => {
    const c = captureVide('x');
    c.batiments.maison = { ...batimentVide(), vu: { cheminees: { nombre: 0, souches: [] } } };
    const l = listeDeControle(quartier(), c);
    expect(l.batiments[0]!.parties.find((p) => p.partie === 'cheminees')!.statut).toBe('Aucune');
  });

  it('ajoute la ligne de la toiture-terrasse pour un toit plat', () => {
    const plat = obj('b', { fonction: 'batiment', pts: rect(0, 0, 5, 5), batiment: { toit: { forme: 'plat', hauteur: 0, angleFaitage: 0 } } });
    expect(aUnToitPlat(plat, batimentVide())).toBe(true);
    const pentu = obj('b', { fonction: 'batiment', pts: rect(0, 0, 5, 5), batiment: { toit: { forme: 'deux-pans', hauteur: 3, angleFaitage: 0 } } });
    expect(aUnToitPlat(pentu, batimentVide())).toBe(false);
    expect(aUnToitPlat(pentu, { ...batimentVide(), vu: { forme: 'plat' } })).toBe(true);
    const l = listeDeControle([...quartier().slice(0, 2), plat], captureVide('x'));
    expect(l.batiments[0]!.parties.map((p) => p.partie)).toEqual(['toit', 'cheminees', 'terrasse', 'materiaux']);
  });

  it('donne une cle unique a chaque manque, meme pour deux facades de meme orientation', () => {
    // Une maison en L : deux murs regardent l'est, et leurs lignes ont le meme texte.
    const L: PtBrut[] = [{ x: 5, y: 10 }, { x: 15, y: 10 }, { x: 15, y: 15 }, { x: 10, y: 15 }, { x: 10, y: 20 }, { x: 5, y: 20 }];
    const objets = [quartier()[0]!, obj('maison', { fonction: 'batiment', pts: L, elevation: 6 })];
    const l = listeDeControle(objets, captureVide('78650000AE0101'));
    const est = l.manques.filter((m) => m.texte === 'façade est de maison : pas de photo');
    expect(est).toHaveLength(2);
    const cles = l.manques.map((m) => m.cle);
    expect(new Set(cles).size).toBe(cles.length);
    // Stable : la meme capture redonne les memes cles, dans le meme ordre.
    expect(listeDeControle(objets, captureVide('78650000AE0101')).manques.map((m) => m.cle)).toEqual(cles);
    expect(est.map((m) => m.cle)).toEqual(['facade:maison:1', 'facade:maison:3']);
  });
});

describe('le haut du pignon ou du pan d une facade', () => {
  const o = (corpsToit?: unknown) => ({ key: 'm', name: 'm', type: 'polygon', fonction: 'batiment', pts: rect(0, 0, 10, 8), elevation: 6, ...(corpsToit ? { batiment: { corpsToit } } : {}) }) as unknown as ObjetPlan;
  const sud = facadesDuContour(rect(0, 0, 10, 8), 6).find((f) => f.orientation === 'Sud')!;
  const corps = (pts: PtBrut[], faitage: number) => ({ pts, posFaitage: 4, faitage, egouts: [6, 6], pignons: [], ecart: 0 });

  it('prend le faitage du corps dont un mur longe la facade', () => {
    expect(hauteurHautDeFacade(o([corps(rect(0, 0, 10, 8), 9.4)]), sud, 6)).toBe(9.4);
  });

  it('prend le plus haut quand plusieurs corps la longent, et ignore un corps qui ne la touche pas', () => {
    const aile = corps(rect(0, 0, 4, 8), 8);
    const loin = corps(rect(20, 20, 30, 30), 15);
    expect(hauteurHautDeFacade(o([aile, corps(rect(4, 0, 10, 8), 9.4), loin]), sud, 6)).toBe(9.4);
  });

  it('sans corps de toit, majore le mur sous le toit : le toit existe, meme non lu', () => {
    const h = hauteurHautDeFacade(o(), sud, 6);
    expect(h).toBeGreaterThan(6.5);
    expect(h).toBeCloseTo(6 * 1.35, 5);
  });

  it('ne descend jamais sous le mur : un faitage mesure plus bas que l egout n a pas de sens', () => {
    expect(hauteurHautDeFacade(o([corps(rect(0, 0, 10, 8), 5)]), sud, 6)).toBe(6.5);
  });
});

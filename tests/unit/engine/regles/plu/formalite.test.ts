import { describe, it, expect } from 'vitest';
import { formaliteDeLEmprise, formaliteDuProjet } from '../../../../../src/engine/regles/plu/formalite.js';
import { REGLAGES_PLU } from '../../../../../src/regles/plu/reglages.js';
import type { ObjetPlan } from '../../../../../src/model/types.js';

// « Quelle formalite pour ce projet ? » (engine/regles/plu/formalite.ts) : une indication d'apres les regles nationales, avec ses
// raisons ; ce que Plan ne sait pas trancher se rend « à vérifier en mairie ».

const rect = (x: number, y: number, L: number, l: number) => [{ x, y }, { x: x + L, y }, { x: x + L, y: y + l }, { x, y: y + l }];
const plu = (plus: Record<string, unknown> = {}) => ({ zones: [{ libelle: 'UL', typezone: 'U' }], prescriptions: [], informations: [], servitudes: [], spr: [], ...plus });
const parcelle = (p: unknown = plu()) => ({ key: 'parcelle', name: 'Parcelle', type: 'polygon', fonction: 'terrain', pts: rect(0, 0, 40, 40), cadastre: { idu: 'x' }, ...(p ? { plu: p } : {}) });
const terrasse = (depassementVis: number, L = 6, l = 5, plus: Record<string, unknown> = {}) => ({ key: 'terrasse', name: 'Terrasse', type: 'polygon', fonction: 'terrasse',
  pts: rect(10, 10, L, l), construction: { depassementVis }, ...plus });
// Sans debord, l'emprise d'une pergola est son contour.
const pergola = (L: number, l: number, plus: Record<string, unknown> = {}, cle = 'pergola') => ({ key: cle, name: 'Pergola', type: 'polygon', fonction: 'pergola',
  pts: rect(20, 20, L, l), pergola: { debord: 0, ...plus } });
const piscine = (L: number, l: number) => ({ key: 'piscine', name: 'Piscine', type: 'polygon', fonction: 'piscine', pts: rect(2, 2, L, l) });
const objets = (...o: unknown[]) => o as ObjetPlan[];
const protege = plu({ spr: [{ type: 'AC4', nom: 'SPR' }], servitudes: [{ type: 'AC4', nom: 'SPR' }] });

describe('formaliteDeLEmprise : les seuils nationaux, lus dans les reglages', () => {
  const hors = { adossee: false, zoneUrbaine: true, secteurProtege: false };
  it('aucune jusqu’a 5 m², declaration jusqu’a 20 m², permis au-dela', () => {
    expect([0, 4.9, 5].map((e) => formaliteDeLEmprise(e, hors))).toEqual(['aucune', 'aucune', 'aucune']);
    expect([5.01, 12, 20].map((e) => formaliteDeLEmprise(e, hors))).toEqual(['declaration', 'declaration', 'declaration']);
    expect([20.01, 35, 60].map((e) => formaliteDeLEmprise(e, hors))).toEqual(['permis', 'permis', 'permis']);
  });
  it('40 m² pour une extension accolee, en zone urbaine d’un PLU seulement', () => {
    expect(formaliteDeLEmprise(35, { ...hors, adossee: true })).toBe('declaration');
    expect(formaliteDeLEmprise(35, { ...hors, adossee: true, zoneUrbaine: false })).toBe('permis');
    expect(formaliteDeLEmprise(35, { ...hors, adossee: true, zoneUrbaine: null })).toBe('a-verifier');
    expect(formaliteDeLEmprise(41, { ...hors, adossee: true })).toBe('permis');
  });
  it('en secteur protege, declaration des le premier metre carre', () => {
    expect(formaliteDeLEmprise(2, { ...hors, secteurProtege: true })).toBe('declaration');
    expect(formaliteDeLEmprise(35, { ...hors, adossee: true, secteurProtege: true })).toBe('a-verifier');
    expect(formaliteDeLEmprise(35, { ...hors, secteurProtege: true })).toBe('permis');
  });
  it('suit les reglages, pas des constantes', () => {
    expect(formaliteDeLEmprise(8, hors, { ...REGLAGES_PLU, 'formalite.empriseSansFormaliteM2': 10 })).toBe('aucune');
  });
});

describe('formaliteDuProjet', () => {
  it('ne demande rien pour une terrasse de plain-pied', () => {
    const f = formaliteDuProjet(objets(parcelle(), terrasse(0)));
    expect(f).toMatchObject({ formalite: 'aucune', emprise: 0, secteurProtege: false, ouvrages: 1, reserves: [] });
    expect(f.raisons.map((r) => r.cle)).toEqual(['plainPied']);
    expect(f.raisons[0]!.texte).toBe('« Terrasse » : une terrasse de plain-pied (dessus à 0,60 m du sol au plus) ne crée pas d’emprise au sol, aucune formalité.');
  });

  it('compte l’emprise d’une terrasse surelevee, et dit que sa hauteur est a confirmer', () => {
    // 30 m² a 0,70 m du sol : au-dela de 20 m², permis.
    const grande = formaliteDuProjet(objets(parcelle(), terrasse(60.5)));
    expect(grande).toMatchObject({ formalite: 'permis', emprise: 30 });
    expect(grande.raisons.find((r) => r.cle === 'terrasse.terrasse')!.texte).toMatch(/terrasse surélevée \(dessus à 0,70 m du sol, plus de 0,60 m\).*30,0 m².*confirmez-la auprès de la mairie/);
    // 12 m² : declaration prealable ; la meme de plain-pied : rien.
    expect(formaliteDuProjet(objets(parcelle(), terrasse(60.5, 4, 3))).formalite).toBe('declaration');
    expect(formaliteDuProjet(objets(parcelle(), terrasse(0, 4, 3))).formalite).toBe('aucune');
    // Une terrasse qui existe deja n'est pas le projet.
    expect(formaliteDuProjet(objets(parcelle(), terrasse(60.5, 6, 5, { existant: true })))).toMatchObject({ formalite: 'aucune', ouvrages: 0, raisons: [] });
  });

  it('range l’emprise d’un abri dans sa tranche', () => {
    expect(formaliteDuProjet(objets(parcelle(), pergola(2, 2)))).toMatchObject({ formalite: 'aucune', emprise: 4 });
    const dp = formaliteDuProjet(objets(parcelle(), pergola(4, 3)));
    expect(dp).toMatchObject({ formalite: 'declaration', emprise: 12 });
    expect(dp.raisons.find((r) => r.cle === 'emprise')!.texte).toBe('Emprise au sol créée : 12,0 m² (Pergola 12,0 m²) ; de 5 à 20 m², déclaration préalable.');
    expect(formaliteDuProjet(objets(parcelle(), pergola(6, 5))).formalite).toBe('permis');
  });

  it('admet 40 m² pour un abri adosse en zone urbaine, avec la reserve des 150 m² ; doute sans zone connue', () => {
    const adossee = pergola(6, 5, { adossee: true, toit: 'appentis' });
    const u = formaliteDuProjet(objets(parcelle(), adossee));
    expect(u.formalite).toBe('declaration');
    expect(u.reserves.join(' ')).toMatch(/150 m²/);
    expect(formaliteDuProjet(objets(parcelle(plu({ zones: [{ libelle: 'N', typezone: 'N' }] })), adossee)).formalite).toBe('permis');
    const sansPlu = formaliteDuProjet(objets(parcelle(null), adossee));
    expect(sansPlu).toMatchObject({ formalite: 'a-verifier', secteurProtege: null });
    expect(sansPlu.raisons.find((r) => r.cle === 'extension')!.texte).toMatch(/zone de la parcelle n’est pas connue/);
    expect(sansPlu.reserves.join(' ')).toMatch(/PLU de la parcelle n’a pas été interrogé/);
  });

  it('durcit tout en secteur protege, et ne tranche pas pour une terrasse de plain-pied', () => {
    const petit = formaliteDuProjet(objets(parcelle(protege), pergola(2, 2)));
    expect(petit).toMatchObject({ formalite: 'declaration', secteurProtege: true });
    expect(petit.raisons.find((r) => r.cle === 'protege.emprise')!.texte).toMatch(/dès le premier mètre carré/);
    const plain = formaliteDuProjet(objets(parcelle(protege), terrasse(0)));
    expect(plain.formalite).toBe('a-verifier');
    expect(plain.raisons[0]!.texte).toMatch(/à vérifier en mairie/);
  });

  it('rend un doute quand des ouvrages ne passent un seuil que comptes ensemble', () => {
    // Deux pergolas de 12 m² : 24 m² ensemble, chacune sous 20 m².
    const f = formaliteDuProjet(objets(parcelle(), pergola(4, 3), { ...pergola(4, 3, {}, 'p2'), pts: rect(30, 30, 4, 3) }));
    expect(f).toMatchObject({ formalite: 'a-verifier', emprise: 24 });
    expect(f.raisons.map((r) => r.cle)).toEqual(['emprise', 'ensemble']);
  });

  it('reprend le regime que la piscine calcule', () => {
    expect(formaliteDuProjet(objets(parcelle(), piscine(3, 3))).formalite).toBe('aucune');
    const bassin = formaliteDuProjet(objets(parcelle(), piscine(8, 4)));
    expect(bassin.formalite).toBe('declaration');
    expect(bassin.raisons[0]).toMatchObject({ cle: 'piscine.piscine', objet: 'piscine' });
    expect(formaliteDuProjet(objets(parcelle(), piscine(15, 8))).formalite).toBe('permis');
    // Le plus exigeant l'emporte : un bassin en declaration et un abri en permis.
    expect(formaliteDuProjet(objets(parcelle(), piscine(8, 4), pergola(6, 5))).formalite).toBe('permis');
  });

  it('ne compte pas un batiment dessine, et le dit ; rien a dire sans ouvrage', () => {
    const maison = { key: 'maison', name: 'Maison', type: 'polygon', fonction: 'batiment', pts: rect(25, 2, 10, 8) };
    const f = formaliteDuProjet(objets(parcelle(), maison));
    expect(f).toMatchObject({ formalite: 'aucune', ouvrages: 0, raisons: [] });
    expect(f.reserves.join(' ')).toMatch(/« Maison » \(bâti dessiné\)/);
    expect(formaliteDuProjet(objets(parcelle()))).toMatchObject({ formalite: 'aucune', ouvrages: 0, raisons: [], reserves: [] });
  });
});

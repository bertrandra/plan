import { describe, it, expect } from 'vitest';
import { conformitePlu, hauteurTerrasseSurSolM, ouvragesDuProjet, terrassesSurelevees } from '../../../../src/engine/regles/plu/conformite.js';
import type { FaitPlu, ReglementPlu } from '../../../../src/regles/plu/faits.js';
import type { ObjetPlan } from '../../../../src/model/types.js';
import { REGLEMENT } from '../../../fixtures/plu/reglement.js';
import { REGLAGES_PLU } from '../../../../src/regles/plu/reglages.js';

// Les regles du PLU (engine/regles/plu/conformite.ts) : le projet controle contre les faits VALIDES, en avertissements.

const rect = (x: number, y: number, L: number, l: number) => [{ x, y }, { x: x + L, y }, { x: x + L, y: y + l }, { x, y: y + l }];
const parcelle = (plus: Record<string, unknown> = {}) => ({
  key: 'parcelle', name: 'Parcelle', type: 'polygon', fonction: 'terrain', pts: rect(0, 0, 20, 30), cadastre: { idu: 'x' },
  plu: { zones: [{ libelle: 'ULp' }] }, ...plus,
});
const maison = (plus: Record<string, unknown> = {}) => ({ key: 'maison', name: 'Maison', type: 'polygon', fonction: 'batiment', elevation: 6.5, pts: rect(5, 10, 10, 8),
  batiment: { toit: { forme: 'deux-pans', hauteur: 3, angleFaitage: 0, couverture: 'zinc' } }, ...plus });
const existant = { key: 'ign', name: 'Existant', type: 'polygon', fonction: 'batiment', elevation: 9, pts: rect(1, 1, 6, 6), bdtopo: { surParcellePrincipale: true } };
const annexe = { key: 'abri', name: 'Abri de jardin', type: 'polygon', fonction: 'annexe', elevation: 2.4, pts: rect(17.5, 25, 2, 3) };

const fait = (id: string, plus: Partial<FaitPlu>): FaitPlu => ({ id, grandeur: 'hauteur-egout-max', valeur: 7, termes: [], condition: '', article: 'UL 10',
  citation: 'Citation du texte, mot pour mot.', page: 48, confiance: 'forte', statut: 'valide', ...plus });
const reglement = (faits: FaitPlu[]): ReglementPlu => ({ ...REGLEMENT, faits });
const objets = (...o: unknown[]) => o as ObjetPlan[];

describe('conformitePlu', () => {
  it('ne controle rien avec des faits seulement proposes', () => {
    const c = conformitePlu(objets(parcelle(), maison()), reglement([fait('f1', { valeur: 5, statut: 'propose' })]));
    expect(c.verdicts).toEqual([]);
    expect(conformitePlu(objets(parcelle(), maison()), null).verdicts).toEqual([]);
  });

  it('ne prend pour le projet que ce qui n’est pas pose par le cadastre ou l’IGN', () => {
    expect(ouvragesDuProjet(objets(parcelle(), maison(), existant, annexe)).map((o) => o.key)).toEqual(['maison', 'abri']);
  });

  it('compare les hauteurs : egout, point le plus haut, annexes', () => {
    const c = conformitePlu(objets(parcelle(), maison(), existant, annexe), reglement([
      fait('f1', { valeur: 6 }), fait('f2', { grandeur: 'hauteur-absolue-max', valeur: 10 }), fait('f3', { grandeur: 'hauteur-annexe-max', valeur: 2.5, article: 'UL 10.4' }),
    ]));
    const de = (f: string, o: string) => c.verdicts.find((v) => v.fait === f && v.objet === o);
    expect(de('f1', 'maison')).toMatchObject({ etat: 'ecart', mesure: 6.5 });
    expect(de('f1', 'maison')!.message).toBe('Maison : hauteur à l’égout 6,5 m dépasse 6 m (UL 10).');
    expect(de('f1', 'abri')).toMatchObject({ etat: 'conforme', mesure: 2.4 });
    expect(de('f2', 'maison')).toMatchObject({ etat: 'conforme', mesure: 9.5 });
    expect(de('f3', 'abri')).toMatchObject({ etat: 'conforme' });
    expect(de('f3', 'maison')).toBeUndefined();
    expect(c.verdicts.some((v) => v.objet === 'ign')).toBe(false);
    expect(c).toMatchObject({ ecarts: 1, conformes: 4, aVerifier: 0 });
  });

  it('mesure les reculs des limites, et depuis la voie seulement quand la cloture designe la rue', () => {
    const faits = [fait('f1', { grandeur: 'recul-limites-min', valeur: 4, article: 'UL 7' }), fait('f2', { grandeur: 'recul-voie-min', valeur: 5, article: 'UL 6' })];
    const sansRue = conformitePlu(objets(parcelle(), maison(), annexe), reglement(faits));
    expect(sansRue.verdicts.find((v) => v.fait === 'f1' && v.objet === 'maison')).toMatchObject({ etat: 'conforme', mesure: 5 });
    expect(sansRue.verdicts.find((v) => v.fait === 'f1' && v.objet === 'abri')).toMatchObject({ etat: 'ecart', mesure: 0.5 });
    expect(sansRue.verdicts.find((v) => v.fait === 'f2')).toMatchObject({ etat: 'a-verifier', objet: null });
    // Le cote 0 (y = 0) sur rue : le recul depuis la voie est 10 m ; les limites separatives sont les trois autres.
    const cloture = { active: true, defaut: { type: 'grillage', hauteur: 1.5 }, cotes: [{ cote: 0, limite: 'rue' }], portails: [] };
    const avecRue = conformitePlu(objets(parcelle({ cloture }), maison()), reglement(faits));
    expect(avecRue.verdicts.find((v) => v.fait === 'f2')).toMatchObject({ etat: 'conforme', mesure: 10 });
    expect(avecRue.verdicts.find((v) => v.fait === 'f1')).toMatchObject({ etat: 'conforme', mesure: 5 });
  });

  it('calcule l’emprise du bati, existant compris, et la part laissee libre', () => {
    const c = conformitePlu(objets(parcelle(), maison(), existant), reglement([fait('f1', { grandeur: 'emprise-max', valeur: 20, article: 'UL 9' }),
      fait('f2', { grandeur: 'espaces-verts-min', valeur: 80, article: 'UL 13' })]));
    // (80 + 36) / 600 = 19,33 % ; libre 80,67 %.
    expect(c.verdicts[0]).toMatchObject({ etat: 'conforme' });
    expect(c.verdicts[0]!.mesure).toBeCloseTo(19.33, 2);
    expect(c.verdicts[1]!.mesure).toBeCloseTo(80.67, 2);
  });

  it('ne compte d’un batiment que sa part dans la parcelle (un ilot de l’IGN deborde sur les voisines)', () => {
    // 40 x 10 m, dont 10 x 10 dans la parcelle (20 x 30) : 100 / 600 = 16,67 %.
    const ilot = { key: 'ilot', type: 'polygon', fonction: 'batiment', pts: rect(10, 0, 40, 10), bdtopo: { surParcellePrincipale: true } };
    const c = conformitePlu(objets(parcelle(), ilot), reglement([fait('f1', { grandeur: 'emprise-max', valeur: 30, article: 'UL 9' })]));
    expect(c.verdicts[0]!.mesure).toBeCloseTo(16.67, 1);
  });

  it('compare la couverture et la pente, et laisse a verifier ce qui ne se mesure pas', () => {
    const c = conformitePlu(objets(parcelle(), maison()), reglement([
      fait('f1', { grandeur: 'materiaux-toit', valeur: null, termes: ['tuile-plate', 'ardoise'], article: 'UL 11.3' }),
      fait('f2', { grandeur: 'pente-toit-min', valeur: 35, article: 'UL 11.2' }),
      fait('f3', { grandeur: 'couleurs', valeur: null, article: 'UL 11.4' }),
      fait('f4', { grandeur: 'hauteur-absolue-max', valeur: null, article: 'UL 10.2', condition: 'la hauteur ne peut excéder la distance à l’alignement' }),
    ]));
    expect(c.verdicts.find((v) => v.fait === 'f1')).toMatchObject({ etat: 'ecart', objet: 'maison' });
    // Deux pans de 8 m de large, 3 m de toit : atan(3 / 4) = 36,87°.
    expect(c.verdicts.find((v) => v.fait === 'f2')).toMatchObject({ etat: 'conforme' });
    expect(c.verdicts.find((v) => v.fait === 'f3')).toMatchObject({ etat: 'a-verifier', objet: null });
    expect(c.verdicts.find((v) => v.fait === 'f4')).toMatchObject({ etat: 'a-verifier' });
  });

  it('dit une condition qu’elle ne sait pas lire, et un zonage qui a change', () => {
    const c = conformitePlu(objets(parcelle({ plu: { zones: [{ libelle: 'UA' }] } }), maison()), reglement([fait('f1', { valeur: 6, condition: 'constructions principales' })]));
    expect(c.zoneChangee).toBe(true);
    expect(c.verdicts[0]!.message).toMatch(/La règle vaut « constructions principales »/);
  });

  it('donne le segment mesure d’un recul, de l’ouvrage a la limite', () => {
    const c = conformitePlu(objets(parcelle(), maison(), annexe), reglement([fait('f1', { grandeur: 'recul-limites-min', valeur: 4, article: 'UL 7' })]));
    // L'abri (x de 17,5 a 19,5) est a 0,5 m du cote x = 20 : le segment part de son bord et finit sur la limite.
    const v = c.verdicts.find((x) => x.objet === 'abri')!;
    expect(v.trace!.de.x).toBeCloseTo(19.5, 6);
    expect(v.trace!.vers.x).toBeCloseTo(20, 6);
    expect(v.trace!.de.y).toBeCloseTo(v.trace!.vers.y, 6);
    expect(Math.hypot(v.trace!.vers.x - v.trace!.de.x, v.trace!.vers.y - v.trace!.de.y)).toBeCloseTo(v.mesure!, 6);
    // Un ouvrage qui deborde de la parcelle : recul nul, rien a dessiner.
    const dehors = conformitePlu(objets(parcelle(), { ...annexe, pts: rect(19, 25, 2, 3) }), reglement([fait('f1', { grandeur: 'recul-limites-min', valeur: 4 })]));
    expect(dehors.verdicts[0]).toMatchObject({ etat: 'ecart', mesure: 0 });
    expect(dehors.verdicts[0]!.trace).toBeUndefined();
  });
});

// Une terrasse de plain-pied ne cree pas d'emprise et aucun recul ne la vise ; surelevee (dessus au-dela de `plu.terrasseSureleveeM`),
// elle entre dans les reculs et l'emprise, et son verdict dit que la regle est a confirmer aupres de la mairie.
describe('les terrasses surelevees dans le controle du PLU', () => {
  // Sur vis de fondation, la tete depassant de `depassementVis` centimetres : 9,5 cm de structure, plus le depassement.
  const terrasse = (depassementVis: number, plus: Record<string, unknown> = {}) => ({ key: 'terrasse', name: 'Terrasse', type: 'polygon', fonction: 'terrasse',
    pts: rect(1, 20, 6, 5), construction: { depassementVis }, ...plus });
  const faits = [fait('f1', { grandeur: 'recul-limites-min', valeur: 3, article: 'UL 7' }), fait('f2', { grandeur: 'emprise-max', valeur: 15, article: 'UL 9' }),
    fait('f3', { grandeur: 'hauteur-absolue-max', valeur: 0.5, article: 'UL 10' })];

  it('mesure la hauteur du dessus au-dessus du sol, et ne retient que celles qui passent le seuil', () => {
    const basse = terrasse(0), haute = terrasse(60.5);
    expect(hauteurTerrasseSurSolM(basse as never, objets(basse))).toBeCloseTo(0.095, 6);
    expect(hauteurTerrasseSurSolM(haute as never, objets(haute))).toBeCloseTo(0.7, 6);
    expect(terrassesSurelevees(objets(parcelle(), basse))).toEqual([]);
    expect(terrassesSurelevees(objets(parcelle(), haute)).map((t) => [t.objet.key, t.duProjet])).toEqual([['terrasse', true]]);
    // Le seuil est un reglage : a 0,80 m, la meme terrasse est de plain-pied.
    expect(terrassesSurelevees(objets(parcelle(), haute), { ...REGLAGES_PLU, 'plu.terrasseSureleveeM': 0.8 })).toEqual([]);
    // Une terrasse lue sur la photo aerienne existe deja : elle n'est pas du projet.
    expect(terrassesSurelevees(objets(parcelle(), terrasse(60.5, { existant: true })))[0]).toMatchObject({ duProjet: false });
  });

  it('ne change rien pour une terrasse de plain-pied', () => {
    const sans = conformitePlu(objets(parcelle(), maison()), reglement(faits));
    const avec = conformitePlu(objets(parcelle(), maison(), terrasse(0)), reglement(faits));
    expect(avec).toEqual(sans);
  });

  it('controle le recul d’une terrasse surelevee et dit que la regle est a confirmer', () => {
    const c = conformitePlu(objets(parcelle(), maison(), terrasse(60.5)), reglement(faits));
    const v = c.verdicts.find((x) => x.fait === 'f1' && x.objet === 'terrasse')!;
    expect(v).toMatchObject({ etat: 'ecart', mesure: 1 });
    expect(v.message).toBe('Terrasse : recul des limites séparatives 1 m n’atteint pas 3 m (UL 7). Terrasse surélevée (dessus à 0,70 m du sol, plus de 0,60 m) : '
      + 'une terrasse de plain-pied n’est pas concernée, et pour celle-ci la règle est à confirmer auprès de la mairie.');
    expect(v.trace).toBeDefined();
    // Les hauteurs du reglement visent les constructions, pas le platelage.
    expect(c.verdicts.some((x) => x.fait === 'f3' && x.objet === 'terrasse')).toBe(false);
    // Loin des limites, le verdict est conforme et garde la mention.
    const loin = conformitePlu(objets(parcelle(), terrasse(60.5, { pts: rect(5, 20, 6, 5) })), reglement(faits));
    expect(loin.verdicts.find((x) => x.fait === 'f1')).toMatchObject({ etat: 'conforme', objet: 'terrasse' });
    expect(loin.verdicts.find((x) => x.fait === 'f1')!.message).toMatch(/à confirmer auprès de la mairie/);
    // Une terrasse existante surelevee n'est pas controlee pour ses reculs.
    const existante = conformitePlu(objets(parcelle(), terrasse(60.5, { existant: true })), reglement(faits));
    expect(existante.verdicts.some((x) => x.fait === 'f1' && x.objet === 'terrasse')).toBe(false);
  });

  it('compte une terrasse surelevee dans l’emprise au sol, et le dit', () => {
    // Maison 80 m² sur 600 : 13,33 % ; avec la terrasse de 30 m² : 18,33 %.
    const sans = conformitePlu(objets(parcelle(), maison(), terrasse(0)), reglement(faits)).verdicts.find((x) => x.fait === 'f2')!;
    expect(sans).toMatchObject({ etat: 'conforme' });
    expect(sans.mesure).toBeCloseTo(13.333, 2);
    expect(sans.message).not.toMatch(/surélevée/);
    const avec = conformitePlu(objets(parcelle(), maison(), terrasse(60.5)), reglement(faits)).verdicts.find((x) => x.fait === 'f2')!;
    expect(avec).toMatchObject({ etat: 'ecart', objet: null });
    expect(avec.mesure).toBeCloseTo(18.333, 2);
    expect(avec.message).toMatch(/de la terrasse surélevée « Terrasse » \(dessus à plus de 0,60 m du sol : à confirmer auprès de la mairie\)/);
  });
});

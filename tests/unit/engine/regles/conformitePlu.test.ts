import { describe, it, expect } from 'vitest';
import { conformitePlu, ouvragesDuProjet } from '../../../../src/engine/regles/plu/conformite.js';
import type { FaitPlu, ReglementPlu } from '../../../../src/regles/plu/faits.js';
import type { ObjetPlan } from '../../../../src/model/types.js';
import { REGLEMENT } from '../../../fixtures/plu/reglement.js';

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
});

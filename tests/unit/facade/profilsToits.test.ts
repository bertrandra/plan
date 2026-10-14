import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  avecProfilsDuBatiment, contexteProfils, departementDuCode, descriptionDuBatiment, formeDuContour, partMitoyenne, profilsDuBatiment, surchargesDuBatiment,
  CONTEXTE_PROFILS_VIDE, type ContexteProfils, type ObjetProfils,
} from '../../../src/facade/profilsToits.js';
import { lireProfilsToits } from '../../../src/model/profilsToits.js';
import { PROFILS_TOITS, REGLAGES_TOITS, SEUILS_TOITS } from '../../../src/model/reglagesToits.js';
import { toitMesureDepuisGrille } from '../../../src/model/toitMesure.js';
import { reconstruireCorps } from '../../../src/facade/toitCorps.js';
import { corpsVraisemblables } from '../../../src/facade/vraisemblance.js';
import type { GrilleRelief } from '../../../src/model/relief.js';
import type { CorpsToit, PtBrut, ToitMesure } from '../../../src/model/types.js';

// Les profils d'un batiment (MD/spec-regles-toits.md §6, §9.1) : ce qu'on sait de lui, et son toit lu
// sous les seuils de ses profils. Profils d'essai : tests/fixtures/toits/profils-essai.json.

const p = (x: number, y: number): PtBrut => ({ x, y });
const rect = (x0: number, y0: number, l: number, h: number) => [p(x0, y0), p(x0 + l, y0), p(x0 + l, y0 + h), p(x0, y0 + h)];
const ESSAI = lireProfilsToits(JSON.parse(readFileSync(new URL('../../fixtures/toits/profils-essai.json', import.meta.url), 'utf8')), Object.keys(REGLAGES_TOITS));
const parcelle78: ObjetProfils = { key: 'parcelle', fonction: 'terrain', pts: rect(-20, -20, 60, 60), latitude: 48.905, cadastre: { idu: '78650000AE0101', codeInsee: '78650' } };

describe('departementDuCode', () => {
  it('tire le departement d’un code INSEE ou d’un IDU', () => {
    expect(departementDuCode('78650')).toBe('78');
    expect(departementDuCode('78650000AE0101')).toBe('78');
    expect(departementDuCode('84050000AB0110')).toBe('84');
    expect(departementDuCode('2A004')).toBe('2A');
    expect(departementDuCode('97105')).toBe('971');
    expect(departementDuCode('00123')).toBeNull();
    expect(departementDuCode('786')).toBeNull();
    expect(departementDuCode(null)).toBeNull();
  });
});

describe('contexteProfils', () => {
  it('sans profil, le contexte vide : rien a batir pour la tache de fond', () => {
    expect(PROFILS_TOITS).toEqual([]);
    expect(contexteProfils([parcelle78, { key: 'a', fonction: 'batiment', pts: rect(0, 0, 10, 8) }])).toBe(CONTEXTE_PROFILS_VIDE);
  });

  it('le lieu de la parcelle du projet et les contours des batiments', () => {
    const ctx = contexteProfils([parcelle78, { key: 'a', fonction: 'batiment', pts: rect(0, 0, 10, 8) }, { key: 'arbre', fonction: 'vegetation', pts: rect(30, 30, 2, 2) }], ESSAI);
    expect(ctx.departement).toBe('78');
    expect(ctx.latitude).toBe(48.905);
    expect(ctx.voisins.map((v) => v.cle)).toEqual(['a']);
    // Sans latitude sur la parcelle : celle de l'origine du cadastre ; sans parcelle, rien.
    expect(contexteProfils([{ ...parcelle78, latitude: undefined, cadastre: { codeInsee: '62460', origineLat: 50.5 } }], ESSAI)).toMatchObject({ departement: '62', latitude: 50.5 });
    expect(contexteProfils([], ESSAI)).toMatchObject({ departement: null, latitude: null });
  });
});

describe('descriptionDuBatiment', () => {
  it('lit les materiaux, la hauteur, l’epoque, la surface et la forme', () => {
    const o: ObjetProfils = { key: 'a', fonction: 'batiment', pts: rect(0, 0, 10, 8), bdtopo: { materiauxMurs: '41', materiauxToiture: '01', hauteurRetenueM: 6.2, dateApparition: '1890-01-01Z' } };
    expect(descriptionDuBatiment(o, { departement: '62', latitude: 50.5, voisins: [] })).toEqual({
      departement: '62', latitude: 50.5, materiauMurs: 'brique', materiauToiture: 'tuile', hauteur: 6.2, surface: 80, mitoyennete: 'aucune', formeContour: 'rectangle', epoque: 1890,
    });
    // Rien de connu : des valeurs inconnues, qui ne remplissent aucune condition.
    expect(descriptionDuBatiment({ bdtopo: { materiauxMurs: '09' } }, CONTEXTE_PROFILS_VIDE)).toMatchObject({ materiauMurs: null, materiauToiture: null, hauteur: null, surface: null, mitoyennete: null, formeContour: null, epoque: null });
  });

  it('la forme du contour', () => {
    expect(formeDuContour(rect(0, 0, 10, 8))).toBe('rectangle');
    expect(formeDuContour([p(0, 0), p(12, 0), p(12, 4), p(5, 4), p(5, 10), p(0, 10)])).toBe('composee');
    expect(formeDuContour([p(0, 0), p(12, 0), p(9, 7), p(2, 7)])).toBe('trapeze');
    // Un sommet aligne ne fait pas un cote de plus.
    expect(formeDuContour([p(0, 0), p(6, 0), p(12, 0), p(9, 7), p(2, 7)])).toBe('trapeze');
    expect(formeDuContour([p(0, 0), p(12, 0), p(14, 5), p(9, 9), p(2, 7)])).toBe('biais');
  });

  it('la mitoyennete : la part du perimetre collee a un autre batiment', () => {
    const maison = { key: 'm', pts: rect(0, 0, 6, 10) };
    const gauche = { cle: 'g', pts: rect(-8, 0, 8, 10) }, droite = { cle: 'd', pts: rect(6.2, 0, 8, 10) }, loin = { cle: 'l', pts: rect(30, 0, 8, 10) };
    const voisins = [{ cle: 'm', pts: maison.pts }, gauche, droite, loin];
    // Deux murs de 10 m sur 32 m de perimetre, et les bouts des facades a moins de 50 cm des voisins :
    // une maison de rang.
    const part = partMitoyenne(maison, maison.pts, voisins);
    expect(part).toBeGreaterThan(20 / 32);
    expect(part).toBeLessThan(0.75);
    expect(descriptionDuBatiment(maison, { departement: null, latitude: null, voisins }).mitoyennete).toBe('forte');
    expect(descriptionDuBatiment(maison, { departement: null, latitude: null, voisins: [gauche, loin] }).mitoyennete).toBe('partielle');
    expect(descriptionDuBatiment(maison, { departement: null, latitude: null, voisins: [loin] }).mitoyennete).toBe('aucune');
  });
});

describe('le toit lu sous les seuils de ses profils', () => {
  const ctx: ContexteProfils = { departement: '78', latitude: 48.9, voisins: [] };
  const batiment: ObjetProfils = { key: 'a', fonction: 'batiment', pts: rect(0, 0, 10, 8), bdtopo: { hauteurRetenueM: 6 } };

  it('les seuils sont surcharges le temps du calcul, puis remis', () => {
    expect(surchargesDuBatiment(batiment, ctx, ESSAI)).toEqual({ SEUIL_MARCHE_M: 1.2, DEPASSEMENT_VEGETATION_M: 5 });
    const vu = avecProfilsDuBatiment(batiment, ctx, () => ({ marche: SEUILS_TOITS.SEUIL_MARCHE_M, vegetation: SEUILS_TOITS.DEPASSEMENT_VEGETATION_M, refonte: SEUILS_TOITS.TOLERANCE_REFONTE }), ESSAI);
    expect(vu).toEqual({ marche: 1.2, vegetation: 5, refonte: REGLAGES_TOITS.TOLERANCE_REFONTE });
    expect(SEUILS_TOITS).toEqual(REGLAGES_TOITS);
    // Hors du departement du profil, ni surcharge ni changement.
    expect(profilsDuBatiment(batiment, { ...ctx, departement: '13' }, ESSAI).applicables).toEqual([]);
    expect(avecProfilsDuBatiment(batiment, { ...ctx, departement: '13' }, () => SEUILS_TOITS.SEUIL_MARCHE_M, ESSAI)).toBe(REGLAGES_TOITS.SEUIL_MARCHE_M);
  });

  it('sans profil livre, aucune surcharge', () => {
    expect(surchargesDuBatiment(batiment, ctx)).toEqual({});
  });

  it('la surcharge change le calcul : la vegetation sur un releve reel (AE 101)', () => {
    interface Releve { contour: PtBrut[]; toitMesure: ToitMesure; corps: CorpsToit[]; grille: GrilleRelief }
    const r: Releve = JSON.parse(readFileSync(new URL('../../fixtures/toits/vesinet-ae101.json', import.meta.url), 'utf8'));
    // Une hauteur BD TOPO trop basse (1,5 m) : sans profil, le corps principal (egouts a 6,1 et 5 m)
    // passe pour un houppier (plus de 3 m au-dessus) et seuls l'annexe et l'aile restent ; le profil
    // d'essai tolere 5 m de depassement, et garde les trois corps.
    const vegetation = lireProfilsToits([{ id: 'essai-vegetation', quand: { departements: ['78'] }, surcharges: { DEPASSEMENT_VEGETATION_M: 5 }, pourquoi: 'Un profil des tests, jamais livre.', cas: ['essai/a', 'essai/b'] }], Object.keys(REGLAGES_TOITS));
    const ae101: ObjetProfils = { key: 'ae101', fonction: 'batiment', pts: r.contour, bdtopo: { hauteurRetenueM: 1.5 } };
    const corps = () => reconstruireCorps(toitMesureDepuisGrille(r.grille, r.contour)!, r.contour, { grille: r.grille });
    const lire = () => corpsVraisemblables(ae101, corps());
    expect(lire()).toHaveLength(2);
    const avec = avecProfilsDuBatiment(ae101, ctx, lire, vegetation);
    expect(avec).toHaveLength(3);
    // Le reste du calcul n'a pas bouge : les corps sont ceux d'AE 101 sans profil, au centimetre.
    expect(avec).toEqual(corps());
    expect(lire()).toHaveLength(2);
  });

  it('la surcharge atteint la reconstruction des corps : une marche plus haute fond l’annexe d’AE 101', () => {
    interface Releve { contour: PtBrut[]; grille: GrilleRelief }
    const r: Releve = JSON.parse(readFileSync(new URL('../../fixtures/toits/vesinet-ae101.json', import.meta.url), 'utf8'));
    const ae101: ObjetProfils = { key: 'ae101', fonction: 'batiment', pts: r.contour, bdtopo: { hauteurRetenueM: 6 } };
    const corps = () => reconstruireCorps(toitMesureDepuisGrille(r.grille, r.contour)!, r.contour, { grille: r.grille });
    const sans = corps();
    // Le profil d'essai des Yvelines porte SEUIL_MARCHE_M a 1,2 m : l'annexe (egouts a 3,1 et 3,2 m,
    // 1,2 m sous le pan du corps) n'est plus coupee et se fond dans le corps principal.
    const avec = avecProfilsDuBatiment(ae101, ctx, corps, ESSAI);
    expect(sans).toHaveLength(3);
    expect(avec).toHaveLength(2);
    expect(corps()).toEqual(sans);
  });
});

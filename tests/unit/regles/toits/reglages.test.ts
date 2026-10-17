import { EMPREINTE_FORMES_TOITS } from '../../../../src/regles/toits/formes.js';
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { readdirSync, statSync } from 'node:fs';
import { REGLAGES_TOITS, DESCRIPTION_REGLAGES_TOITS, EMPREINTE_REGLAGES_TOITS, PROFILS_TOITS, SEUILS_TOITS, avecSeuilsToit, empreinteReglagesToits, lireReglagesToits, CalculAsynchroneRefuse, ReglagesToitsIllisibles } from '../../../../src/regles/toits/reglages.js';
import { conflitsDeProfils, lireProfilsToits } from '../../../../src/regles/toits/profils.js';
import { LECTURES_TOITS, VERSION_LECTURE_TOITS, versionDeLecture } from '../../../../src/app/toitsLidar.js';
import { EMPREINTE_FAITS_TOITS, EMPREINTE_FAITS_VIDE } from '../../../../src/regles/toits/faits.js';
import { SEUIL_MARCHE_M, SOL_M } from '../../../../src/model/toitMesure.js';
import { TOLERANCE_REFONTE, GAIN_COUPE, PART_VIDE_RECALAGE } from '../../../../src/facade/toitCorps.js';
import { ECART_MAX_M } from '../../../../src/facade/toitLidar.js';
import { DEPASSEMENT_VEGETATION_M } from '../../../../src/app/toitsLidar.js';
import { AIRE_A_CHEVAL_MIN_M2 } from '../../../../src/model/aCheval.js';

// Les seuils des toits sortis du code dans regles/toits/reglages.json (MD/spec-regles-toits.md §6, §9.2).

/**
 * Les valeurs que le code portait en dur avant l'extraction (main, d7d3f29), recopiees une fois : la
 * version de lecture 1 doit en etre l'empreinte. C'est la preuve que la sortie n'a change aucune
 * valeur ; elle ne bloque pas un reglage futur, qui ajoute sa propre ligne a LECTURES_TOITS.
 */
const VALEURS_DU_CODE: Record<string, number> = {
  SAILLIE_M: 2, DEPASSEMENT_M: 1, SOL_M: 0.5, RETRAIT_EGOUT_M: 0.5, SOUS_EGOUT_M: 0.3, SEUIL_MARCHE_M: 0.8,
  LARGEUR_BLOC_MIN_M: 1.5, CELLULES_MIN: 20, EGOUT_MESURE_MIN_M: 1.8, EGOUT_MESURE_MAX_M: 40, PAS_PROFIL_M: 0.5,
  TOLERANCE_DEG: 15, LARGEUR_MIN_M: 1.5, AIRE_NEGLIGEABLE_M2: 2, SEUIL_DECROCHE_M: 1.2,
  ECHANTILLONS_MIN: 20, ECART_MAX_M: 0.8, ECART_MAX_APPENTIS_M: 0.4, RESIDU_ABERRANT_M: 1.5, PART_HAUTE: 0.2,
  PART_ECARTEE: 0.04, ALLONGEMENT_MIN: 2.5, AXES_CONFONDUS_DEG: 8, SAUT_DEUX_CORPS_M: 1, PART_CORPS_MIN: 0.25,
  PAS_FAITAGE_M: 0.25, PENTE_MAX_DEG: 60, ECART_ABERRANT_M: 1.2, DEPASSEMENT_GARDE_M: 0.4, HAUTEUR_PLAT_M: 0.3,
  PENTE_PLAT_DEG: 3, PAN_MIN_M: 1, TOLERANCE_APPENTIS: 1.1, TOLERANCE_APPENTIS_M: 0.05, GAIN_PAN_SUR_PLAT: 0.9,
  SURPLUS_PIGNON_M: 0.8, LARGEUR_PIGNON_MIN_M: 1.5, LARGEUR_PIGNON_MAX_M: 6, PROFONDEUR_PIGNON_MIN_M: 1.5,
  TOLERANCE_FAITAGE_M: 0.5, GAIN_COUPE: 2 / 3, ECART_COUPE_MIN_M: 0.25, DIFFERENCE_COUPE_M: 0.6, LARGEUR_CORPS_MIN_M: 2,
  MESURES_MIN: 12, HAUTEUR_BATIE_M: 2.5, PART_VIDE_RECALAGE: 0.12, DECALAGE_MAX_M: 3, PAS_DECALAGE_M: 0.25,
  BANDE_DEHORS_DEBUT_M: 0.5, BANDE_DEHORS_FIN_M: 1.5, GAIN_APPENTIS_SECOURS: 0.9, PAS_COMPLETION_M: 0.25,
  COMPLETION_MAX_M: 8, PART_COMPLETION_MIN: 0.1, EGOUT_ETENDU_MIN_M: 2, SOUS_EGOUT_ETENDU_M: 1, PART_RECOUVERTE_MAX: 0.9,
  PAS_RECOUVREMENT_M: 0.5, TOLERANCE_REFONTE: 1.15, LARGEUR_BANDE_M: 3, TOLERANCE_BANDE: 1.6, CONTINUITE_M: 0.6,
  PART_SOUS_PLUS_GRAND: 0.5, GAIN_CROUPES: 0.8, GAIN_SENS: 0.8,
  DEPASSEMENT_VEGETATION_M: 3, ECART_EGOUT_MIN_M: 0.3, EGOUT_ECRIT_MIN_M: 2, EGOUT_ECRIT_MAX_M: 40,
  AIRE_A_CHEVAL_MIN_M2: 8, PART_A_CHEVAL_MIN: 0.15, AIRE_CORPS_DE_CHAQUE_COTE_M2: 4, PAS_ECHANTILLON_A_CHEVAL_M: 0.5,
};

const racine = join(__dirname, '../../../..');
const brut = JSON.parse(readFileSync(join(racine, 'regles/toits/reglages.json'), 'utf8')) as { profils: unknown[] };

describe('regles/toits/reglages.json', () => {
  it('la version de lecture 1 est l’empreinte des valeurs que le code portait en dur', () => {
    expect(LECTURES_TOITS[0]).toEqual({ version: 1, reglages: empreinteReglagesToits(VALEURS_DU_CODE) });
  });

  it('les reglages livres ont leur ligne dans LECTURES_TOITS (sinon : ajouter une version de lecture)', () => {
    expect(LECTURES_TOITS.at(-1)?.reglages, 'une valeur de reglages.json a change : ajouter { version: n + 1, reglages: \'' + EMPREINTE_REGLAGES_TOITS + '\' } a LECTURES_TOITS (app/toitsLidar.ts), les toits deja lus seront relus').toBe(EMPREINTE_REGLAGES_TOITS);
    expect(LECTURES_TOITS.at(-1)?.faits ?? EMPREINTE_FAITS_VIDE, 'un fait de regles/toits/faits.json a change : ajouter { version: n + 1, reglages: \'' + EMPREINTE_REGLAGES_TOITS + '\', faits: \'' + EMPREINTE_FAITS_TOITS + '\' } a LECTURES_TOITS (app/toitsLidar.ts), les toits deja lus seront relus').toBe(EMPREINTE_FAITS_TOITS);
    expect(LECTURES_TOITS.at(-1)?.formes, 'un seuil de regles/toits/formes.json a change : ajouter { version: n + 1, reglages: \'' + EMPREINTE_REGLAGES_TOITS + '\', faits: \'' + EMPREINTE_FAITS_TOITS + '\', formes: \'' + EMPREINTE_FORMES_TOITS + '\' } a LECTURES_TOITS (app/toitsLidar.ts), les toits deja lus seront relus').toBe(EMPREINTE_FORMES_TOITS);
    expect(VERSION_LECTURE_TOITS).toBe(LECTURES_TOITS.at(-1)?.version);
  });

  it('les modules lisent les valeurs du fichier, au bit pres', () => {
    expect(SEUIL_MARCHE_M).toBe(REGLAGES_TOITS.SEUIL_MARCHE_M);
    expect(SOL_M).toBe(0.5);
    expect(TOLERANCE_REFONTE).toBe(1.15);
    expect(GAIN_COUPE).toBe(2 / 3);
    expect(PART_VIDE_RECALAGE).toBe(0.12);
    expect(ECART_MAX_M).toBe(0.8);
    expect(DEPASSEMENT_VEGETATION_M).toBe(3);
    expect(AIRE_A_CHEVAL_MIN_M2).toBe(8);
  });

  it('chaque seuil dit son unite, le module qui le lit et pourquoi il vaut cela', () => {
    for (const [nom, d] of Object.entries(DESCRIPTION_REGLAGES_TOITS)) {
      expect(d.unite, nom).not.toBe('');
      expect(d.ou, nom).toMatch(/^(model|facade|app|regles)\/[\w/]+\.ts/);
      expect(d.pourquoi.length, nom).toBeGreaterThan(10);
      expect(Array.isArray(d.cas), nom).toBe(true);
    }
  });

  it('le fichier livre ne declare aucun profil : le moteur est la, les profils viendront d’une contradiction entre cas', () => {
    expect(brut.profils).toEqual([]);
    expect(PROFILS_TOITS).toEqual([]);
  });

  it('les profils du fichier se lisent, et deux profils de meme precision sur le meme seuil sont refuses', () => {
    // Le test de CI sur le fichier : vocabulaire ferme, seuils connus, aucun conflit (regles/toits/profils.ts).
    const profils = lireProfilsToits(brut.profils, Object.keys(REGLAGES_TOITS));
    expect(conflitsDeProfils(profils)).toEqual([]);
  });

  it('sans profil, l’empreinte et la version de lecture sont celles d’avant le moteur des profils', () => {
    expect(EMPREINTE_REGLAGES_TOITS).toBe(empreinteReglagesToits(REGLAGES_TOITS, []));
    // La premiere lecture reste celle des seuils sortis du code ; la derniere porte l'empreinte des
    // reglages d'aujourd'hui (le moteur des profils, sans profil, ne l'a pas changee).
    expect(LECTURES_TOITS[0]).toEqual({ version: 1, reglages: '3b9b6b2c' });
    expect(LECTURES_TOITS.at(-1)?.reglages).toBe(EMPREINTE_REGLAGES_TOITS);
  });

  it('un fichier abime est refuse, plutot que de lire les toits avec un seuil manquant', () => {
    expect(() => lireReglagesToits({ format: 'autre', seuils: {} })).toThrow(ReglagesToitsIllisibles);
    expect(() => lireReglagesToits({ format: 'plan-reglages-toits', seuils: { A: { valeur: 'x' } } })).toThrow(ReglagesToitsIllisibles);
    expect(lireReglagesToits({ format: 'plan-reglages-toits', seuils: { A: { valeur: 1 } } })).toEqual({ A: 1 });
  });

  it('les modules lisent les seuils a chaque appel (SEUILS_TOITS), jamais une copie prise au chargement', () => {
    // Sinon le profil d'un batiment (avecSeuilsToit) ne changerait rien : seul le nom exporte, pour les
    // tests et la documentation, garde la valeur du fichier, et rien ne s'en sert dans le code.
    const modules = new Set(Object.values(DESCRIPTION_REGLAGES_TOITS).map((d) => d.ou.split(' ')[0]!));
    const fichiers = (dir: string): string[] => readdirSync(dir).flatMap((n) => { const c = join(dir, n); return statSync(c).isDirectory() ? fichiers(c) : /\.tsx?$/.test(c) ? [c] : []; });
    const code = (t: string) => t.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
    const tous = fichiers(join(racine, 'src')).map((f) => ({ f, t: code(readFileSync(f, 'utf8')) }));
    for (const m of modules) {
      const texte = code(readFileSync(join(racine, 'src', m), 'utf8'));
      expect(texte, m).not.toMatch(/^const [A-Z0-9_]+ = R\./m);
      for (const [, nom] of texte.matchAll(/^export const ([A-Z0-9_]+) = R\./gm)) {
        // Dans son module, le nom n'apparait qu'a sa declaration ; ailleurs, personne ne l'importe.
        expect((texte.match(new RegExp('(?<![.\\w])' + nom + '\\b', 'g')) ?? []).length, m + ' : ' + nom + ' lu dans le code ; lire S.' + nom).toBe(1);
        const base = m.split('/').at(-1)!.replace(/\.ts$/, '');
        const importe = new RegExp('import\\s*\\{[^}]*\\b' + nom + '\\b[^}]*\\}\\s*from\\s*[\'"][^\'"]*/' + base + '\\.js[\'"]');
        for (const { f, t } of tous) expect(importe.test(t), relative(racine, f) + ' importe ' + nom + ' de ' + m + ' ; lire S.' + nom).toBe(false);
      }
    }
  });

  it('le code ne porte plus en dur les seuils sortis dans le fichier', () => {
    const modules = new Set(Object.values(DESCRIPTION_REGLAGES_TOITS).map((d) => d.ou.split(' ')[0]!));
    for (const m of modules) {
      const texte = readFileSync(join(racine, 'src', m), 'utf8');
      for (const nom of Object.keys(REGLAGES_TOITS)) {
        expect(texte, m + ' : ' + nom).not.toMatch(new RegExp('\\b' + nom + ' = [0-9]'));
      }
    }
  });
});

describe('avecSeuilsToit', () => {
  it('surcharge le temps du calcul, puis remet les seuils du fichier', () => {
    expect(avecSeuilsToit({ SEUIL_MARCHE_M: 1.5 }, () => SEUILS_TOITS.SEUIL_MARCHE_M)).toBe(1.5);
    expect(SEUILS_TOITS).toEqual(REGLAGES_TOITS);
  });

  it('remet les seuils meme sur une erreur, et se compose', () => {
    expect(() => avecSeuilsToit({ SOL_M: 9 }, () => { throw new Error('casse'); })).toThrow('casse');
    expect(SEUILS_TOITS.SOL_M).toBe(REGLAGES_TOITS.SOL_M);
    const vu = avecSeuilsToit({ SOL_M: 1 }, () => [SEUILS_TOITS.SOL_M, avecSeuilsToit({ SOL_M: 2, CELLULES_MIN: 5 }, () => SEUILS_TOITS.SOL_M + SEUILS_TOITS.CELLULES_MIN), SEUILS_TOITS.SOL_M, SEUILS_TOITS.CELLULES_MIN]);
    expect(vu).toEqual([1, 7, 1, REGLAGES_TOITS.CELLULES_MIN]);
    expect(SEUILS_TOITS).toEqual(REGLAGES_TOITS);
  });

  it('refuse un calcul asynchrone : d’autres batiments liraient ses seuils pendant l’attente', () => {
    expect(() => avecSeuilsToit({ SOL_M: 1 }, async () => 1)).toThrow(CalculAsynchroneRefuse);
    expect(SEUILS_TOITS).toEqual(REGLAGES_TOITS);
    // Sans surcharge, le calcul passe tel quel.
    expect(avecSeuilsToit({}, () => 3)).toBe(3);
  });

  it('les seuils du fichier sont figes : seule la table en vigueur change', () => {
    expect(Object.isFrozen(REGLAGES_TOITS)).toBe(true);
  });
});

describe('empreinte et version de lecture', () => {
  it('l’empreinte suit les valeurs et les profils, pas l’ordre ni les raisons', () => {
    expect(empreinteReglagesToits({ A: 1, B: 0.5 })).toBe(empreinteReglagesToits({ B: 0.5, A: 1 }));
    expect(empreinteReglagesToits({ A: 1, B: 0.5 })).not.toBe(empreinteReglagesToits({ A: 1, B: 0.51 }));
    expect(empreinteReglagesToits({ A: 1 }, [])).not.toBe(empreinteReglagesToits({ A: 1 }, [{ id: 'p' }]));
  });

  it('des reglages connus donnent leur version la plus recente ; inconnus, la suivante', () => {
    const l = [{ version: 1, reglages: 'aaaa' }, { version: 2, reglages: 'aaaa' }, { version: 3, reglages: 'bbbb' }];
    expect(versionDeLecture(l, 'aaaa')).toBe(2);
    expect(versionDeLecture(l, 'bbbb')).toBe(3);
    expect(versionDeLecture(l, 'cccc')).toBe(4);
    // Depuis que la lecture applique les formes du catalogue, leurs seuils comptent : une ligne sans `formes` ne les lisait pas.
    const f = [...l, { version: 4, reglages: 'bbbb', formes: 'ffff' }];
    expect(versionDeLecture(f, 'bbbb', undefined, 'ffff')).toBe(4);
    expect(versionDeLecture(f, 'bbbb', undefined, 'gggg')).toBe(5);
    expect(versionDeLecture(f, 'bbbb')).toBe(3);
  });

  it('les faits entrent dans la version : une ligne sans faits est une lecture sans fait', () => {
    const l = [{ version: 1, reglages: 'aaaa' }, { version: 2, reglages: 'aaaa', faits: 'ffff' }];
    expect(versionDeLecture(l, 'aaaa')).toBe(1);
    expect(versionDeLecture(l, 'aaaa', EMPREINTE_FAITS_VIDE)).toBe(1);
    expect(versionDeLecture(l, 'aaaa', 'ffff')).toBe(2);
    expect(versionDeLecture(l, 'aaaa', 'eeee')).toBe(3);
  });
});

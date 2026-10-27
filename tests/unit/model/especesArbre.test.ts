import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  arbreNu, especeDe, especeParNature, especeParId, especesChargees, poserEspeces, surChangementEspeces, tailleDe, especesParTaille, idDepuisNom,
  lireDocumentArbres, lireEspece, documentArbres, diametreDe, FORMAT_ARBRES, MAX_ESPECES, DIAMETRE_DEFAUT_M, HAUTEUR_DEFAUT_M, type EspeceArbre
} from '../../../src/model/especesArbre.js';

const e = (id: string, plus: Partial<EspeceArbre> = {}): EspeceArbre => ({ id, nom: id, caduc: true, natures: [], hauteurM: 10, diametreM: 6, reglages: { seed: 1 }, ...plus });

afterEach(() => poserEspeces([]));

describe('lire une essence', () => {
  it('garde ce qui est valide et met des valeurs par defaut au reste', () => {
    const lue = lireEspece({ id: 'chene', reglages: { seed: 3, branch: { levels: 3 } } });
    expect(lue).toEqual({ id: 'chene', nom: 'chene', caduc: true, natures: [], hauteurM: HAUTEUR_DEFAUT_M, diametreM: DIAMETRE_DEFAUT_M, reglages: { seed: 3, branch: { levels: 3 } } });
  });

  it('refuse un identifiant hors [a-z0-9-] ou des reglages vides', () => {
    expect(lireEspece({ id: 'Chêne', reglages: { a: 1 } })).toBeNull();
    expect(lireEspece({ id: '-x', reglages: { a: 1 } })).toBeNull();
    expect(lireEspece({ id: 'ok', reglages: {} })).toBeNull();
    expect(lireEspece({ id: 'ok' })).toBeNull();
    expect(lireEspece(null)).toBeNull();
  });

  it('assainit les reglages : ni tableau, ni fonction, ni cle bizarre, ni profondeur sans fin', () => {
    const lue = lireEspece({ id: 'a', reglages: { ok: 1, 'mauvaise cle': 2, tab: [1, 2], texte: 'x', bool: true, imbrique: { a: { b: { c: { d: { e: 1 } } } } } } });
    expect(lue?.reglages.ok).toBe(1);
    expect(lue?.reglages).not.toHaveProperty('mauvaise cle');
    expect(lue?.reglages).not.toHaveProperty('tab');
    expect(lue?.reglages.texte).toBe('x');
    expect(lue?.reglages.bool).toBe(true);
    expect(JSON.stringify(lue?.reglages.imbrique)).not.toContain('"e"');
  });

  it('borne les dimensions et met les natures en minuscules', () => {
    const lue = lireEspece({ id: 'a', reglages: { a: 1 }, hauteurM: 999, diametreM: -2, natures: ['Conifère', ' ', 3] });
    expect(lue).toMatchObject({ hauteurM: 60, diametreM: DIAMETRE_DEFAUT_M, natures: ['conifère'] });
  });

  it('un persistant l\'est quand `caduc` est faux, et seulement alors', () => {
    expect(lireEspece({ id: 'a', reglages: { a: 1 }, caduc: false })?.caduc).toBe(false);
    expect(lireEspece({ id: 'a', reglages: { a: 1 } })?.caduc).toBe(true);
  });
});

describe('le document', () => {
  it('ignore les essences abimees et les doublons, sans casser les autres', () => {
    const d = lireDocumentArbres({ format: FORMAT_ARBRES, modifieLe: 'hier', especes: [e('a'), { id: 'X' }, e('a', { nom: 'bis' }), e('b')] });
    expect(d?.especes.map((x) => x.id)).toEqual(['a', 'b']);
    expect(d?.modifieLe).toBe('hier');
  });

  it('refuse ce qui n\'est pas une bibliotheque', () => {
    expect(lireDocumentArbres({ format: 'plan-palette' })).toBeNull();
    expect(lireDocumentArbres(null)).toBeNull();
    expect(lireDocumentArbres({ format: FORMAT_ARBRES })?.especes).toEqual([]);
  });

  it('plafonne le nombre d\'essences', () => {
    const toutes = Array.from({ length: MAX_ESPECES + 5 }, (_, i) => e('e' + i));
    expect(lireDocumentArbres({ format: FORMAT_ARBRES, especes: toutes })?.especes).toHaveLength(MAX_ESPECES);
  });

  it('se relit tel qu\'il s\'ecrit', () => {
    const doc = documentArbres([e('a'), e('b', { caduc: false })], '2026-10-16T00:00:00.000Z');
    expect(lireDocumentArbres(JSON.parse(JSON.stringify(doc)))).toEqual({ especes: doc.especes, modifieLe: doc.modifieLe });
  });
});

describe('la bibliotheque chargee', () => {
  it('se pose, se lit et previent ceux qui l\'ecoutent', () => {
    let appels = 0;
    const fin = surChangementEspeces(() => { appels++; });
    poserEspeces([e('a')]);
    expect(especesChargees().map((x) => x.id)).toEqual(['a']);
    fin();
    poserEspeces([]);
    expect(appels).toBe(1);
  });

  it('commence vide : le code n\'a aucune essence, la bibliotheque vient du serveur', async () => {
    // Un module neuf : les autres tests de ce fichier ont deja pose des essences.
    vi.resetModules();
    const neuf = await import('../../../src/model/especesArbre.js');
    expect(neuf.especesChargees()).toEqual([]);
  });

  it('donne a un objet son essence, sinon la premiere, sinon rien (bibliotheque vide : le repli)', () => {
    poserEspeces([]);
    expect(especeDe({})).toBeNull();
    poserEspeces([e('a'), e('b')]);
    expect(especeDe({ arbre: { espece: 'b' } })?.id).toBe('b');
    expect(especeDe({})?.id).toBe('a');
    expect(especeDe({ arbre: { espece: 'disparu' } })?.id).toBe('a');
    expect(especeParId('b')?.id).toBe('b');
    expect(especeParId(undefined)).toBeNull();
  });

  it('propose pour une nature BD TOPO l\'essence dont un mot y figure, sinon la premiere', () => {
    poserEspeces([e('chene'), e('sapin', { natures: ['conif'] }), e('pommier', { natures: ['verger'] })]);
    expect(especeParNature('Bois de conifères')?.id).toBe('sapin');
    expect(especeParNature('Verger')?.id).toBe('pommier');
    expect(especeParNature('Forêt fermée de feuillus')?.id).toBe('chene');
    expect(especeParNature(undefined)?.id).toBe('chene');
  });

  it('prend le diametre de l\'objet, sinon celui de l\'essence, sinon le defaut', () => {
    expect(diametreDe({ arbre: { diametre: 7 } }, e('a'))).toBe(7);
    expect(diametreDe({}, e('a'))).toBe(6);
    expect(diametreDe({}, null)).toBe(DIAMETRE_DEFAUT_M);
  });
});

describe('arbreNu', () => {
  it('un caduc est nu de novembre a mars, un persistant jamais, une date illisible laisse les feuilles', () => {
    for (const [d, nu] of [['2026-11-01', true], ['2026-12-31', true], ['2026-01-10', true], ['2026-03-31', true], ['2026-04-01', false], ['2026-10-31', false]] as const) expect(arbreNu(true, d)).toBe(nu);
    expect(arbreNu(false, '2026-01-10')).toBe(false);
    expect(arbreNu(true, 'n importe quoi')).toBe(false);
    expect(arbreNu(true, null)).toBe(false);
  });
});

describe('un identifiant tire du nom', () => {
  it('sans accents ni espaces, libre, et suffixe au besoin', () => {
    expect(idDepuisNom('Chêne rouge', new Set())).toBe('chene-rouge');
    expect(idDepuisNom('Chêne rouge', new Set(['chene-rouge']))).toBe('chene-rouge-2');
    expect(idDepuisNom('  !!  ', new Set())).toBe('arbre');
  });
});

describe('les tailles', () => {
  const h = (hauteurM: number) => ({ hauteurM, nom: 'x' });
  it('rangent une hauteur dans sa classe, bornes comprises : 6, 12 et 20 m ferment petit, moyen et grand', () => {
    expect([1.4, 6, 6.5, 12, 12.5, 20, 20.5, 35].map((v) => tailleDe(h(v)).id)).toEqual(['petit', 'petit', 'moyen', 'moyen', 'grand', 'grand', 'tres-grand', 'tres-grand']);
  });
  it('presentent les essences par classe, chacune par nom, sans classe vide', () => {
    const g = especesParTaille([{ hauteurM: 25, nom: 'Frêne' }, { hauteurM: 5, nom: 'Pommier' }, { hauteurM: 30, nom: 'Chêne' }, { hauteurM: 4, nom: 'Érable' }]);
    expect(g.map((x) => x.taille.id)).toEqual(['petit', 'tres-grand']);
    expect(g[0]?.especes.map((x) => x.nom)).toEqual(['Érable', 'Pommier']);
    expect(g[1]?.especes.map((x) => x.nom)).toEqual(['Chêne', 'Frêne']);
  });
});
